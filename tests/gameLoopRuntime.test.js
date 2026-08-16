import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createGameLoopRuntime } from '../js/core/GameLoopRuntime.js';

function createFakeClock() {
  var recurring = new Map();
  var snapshot = { running: false, recurringTasks: [] };
  function syncSnapshot() {
    snapshot = {
      running: snapshot.running,
      recurringTasks: Array.from(recurring.entries()).map(function (entry) {
        return { id: entry[0], intervalMs: entry[1].intervalMs };
      }),
    };
    return snapshot;
  }
  return {
    start: vi.fn(function () { snapshot.running = true; return syncSnapshot(); }),
    stop: vi.fn(function () { snapshot.running = false; recurring.clear(); return syncSnapshot(); }),
    reset: vi.fn(function () { return { reset: true }; }),
    startRecurring: vi.fn(function (id, callback, intervalMs) {
      recurring.set(id, { callback: callback, intervalMs: intervalMs });
      syncSnapshot();
      return true;
    }),
    stopRecurring: vi.fn(function (id) {
      var removed = recurring.delete(id);
      syncSnapshot();
      return removed;
    }),
    isRecurring: vi.fn(function (id) { return recurring.has(id); }),
    dispose: vi.fn(function () { snapshot.running = false; recurring.clear(); return syncSnapshot(); }),
    getSnapshot: vi.fn(function () { return snapshot; }),
    fire: function (id) {
      var task = recurring.get(id);
      return task ? task.callback() : null;
    },
  };
}

function createHarness(overrides) {
  var state = { companyLevel: 1, currentSystem: 'sol_prime', shipHull: 90 };
  var settings = { realtimeDayDurationMs: 6000 };
  var featureState = 'ready';
  var commerceRuntime = {};
  var clock = createFakeClock();
  var capturedClockOptions = null;
  var actions = {
    day: { advance: vi.fn() },
    dispatch: { tick: vi.fn() },
  };
  var guidance = { prefetchForState: vi.fn() };
  var log = vi.fn();
  var tutorial = { isActive: vi.fn(function () { return false; }) };
  var fleet = { isActiveDispatched: vi.fn(function () { return false; }) };
  var renderer = { render: vi.fn() };
  var mapUi = {
    getMapView: vi.fn(function () { return 'galaxy'; }),
    getCurrentGalaxyId: vi.fn(function () { return 'andromeda'; }),
  };
  var documentRef = { hidden: false, querySelector: vi.fn(function () { return null; }) };
  var runtime = createGameLoopRuntime(Object.assign({
    getState: function () { return state; },
    getSettings: function () { return settings; },
    getFeatureRuntime: function () {
      return {
        get: function () { return commerceRuntime; },
        getState: function () { return featureState; },
      };
    },
    getGuidanceRuntime: function () { return guidance; },
    getActionRuntime: function () { return actions; },
    systems: {
      Fleet: fleet,
      Tutorial: tutorial,
      GameTime: {},
    },
    ui: { MapUI: mapUi, Renderer: renderer },
    callbacks: {
      setDayDuration: function (value) { settings.realtimeDayDurationMs = value; },
      emitLog: log,
    },
    config: { defaultDayDurationMs: 12000 },
    environment: {
      now: function () { return 321; },
      getDocument: function () { return documentRef; },
    },
    createClock: function (options) {
      capturedClockOptions = options;
      return clock;
    },
  }, overrides || {}));
  return {
    runtime: runtime,
    clock: clock,
    actions: actions,
    guidance: guidance,
    log: log,
    tutorial: tutorial,
    fleet: fleet,
    renderer: renderer,
    mapUi: mapUi,
    documentRef: documentRef,
    getClockOptions: function () { return capturedClockOptions; },
    setState: function (nextState) { state = nextState; },
    setCommerceRuntime: function (value, status) {
      commerceRuntime = value;
      featureState = status;
    },
    getSettings: function () { return settings; },
  };
}

describe('GameLoopRuntime', function () {
  it('GameManager 只组合运行时端口，不再持有 RAF、DOM 暂停或 recurring 细节', function () {
    var gameManager = readFileSync(new URL('../js/core/GameManager.js', import.meta.url), 'utf8');
    var runtimeSource = readFileSync(new URL('../js/core/GameLoopRuntime.js', import.meta.url), 'utf8');

    expect(gameManager).toContain("from './GameLoopRuntime.js'");
    expect(gameManager).not.toContain("from './GameClockController.js'");
    expect(gameManager).not.toContain('ACTIVE_DISPATCH_CLOCK_ID');
    expect(gameManager).not.toContain("querySelector('.modal:not(.hidden)')");
    expect(gameManager).not.toContain('.startRecurring(');
    expect(runtimeSource).toContain("const ACTIVE_DISPATCH_CLOCK_ID = 'active-dispatch'");
    expect(runtimeSource).toContain("querySelector('.modal:not(.hidden)')");
    expect(runtimeSource).toContain('createGameClockController');
  });

  it('延迟创建底层时钟，并用最新 state 驱动日推进与场景帧', function () {
    var harness = createHarness();
    expect(harness.runtime.getSnapshot()).toBeNull();

    harness.runtime.start();
    var clockOptions = harness.getClockOptions();
    expect(clockOptions.getState()).toEqual(expect.objectContaining({ currentSystem: 'sol_prime' }));

    var loadedState = { companyLevel: 1, currentSystem: 'nova_station', shipHull: 70 };
    harness.setState(loadedState);
    clockOptions.renderFrame(loadedState);
    expect(harness.renderer.render).toHaveBeenCalledWith(loadedState, 'galaxy', 'andromeda');

    var context = { timestamp: 500 };
    clockOptions.onElapsedDays(2, context);
    expect(harness.actions.day.advance).toHaveBeenCalledWith(2, context);
  });

  it('高级商业功能未就绪时预取并暂停，错误后回退到 DOM/教程暂停契约', function () {
    var harness = createHarness();
    var advancedState = { companyLevel: 2 };
    harness.setCommerceRuntime(null, 'loading');

    expect(harness.runtime.isPaused(advancedState)).toBe(true);
    expect(harness.guidance.prefetchForState).toHaveBeenCalledWith(advancedState);

    harness.setCommerceRuntime(null, 'error');
    expect(harness.runtime.isPaused(advancedState)).toBe(false);
    harness.documentRef.hidden = true;
    expect(harness.runtime.isPaused(advancedState)).toBe(true);
    harness.documentRef.hidden = false;
    harness.tutorial.isActive.mockReturnValue(true);
    expect(harness.runtime.isPaused(advancedState)).toBe(true);
  });

  it('统一 active-dispatch 周期、立即日志、tick 和会话恢复', function () {
    var harness = createHarness();

    harness.runtime.startDispatch();
    expect(harness.clock.startRecurring).toHaveBeenCalledWith(
      'active-dispatch',
      expect.any(Function),
      3000
    );
    expect(harness.log).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
    harness.clock.fire('active-dispatch');
    expect(harness.actions.dispatch.tick).toHaveBeenCalledOnce();

    harness.runtime.stopDispatch();
    expect(harness.runtime.getDiagnostics().dispatchRunning).toBe(false);
    expect(harness.runtime.resumeRecurring({ fleet: [] })).toBe(false);

    harness.fleet.isActiveDispatched.mockReturnValue(true);
    expect(harness.runtime.resumeRecurring({ fleet: [{}] })).toBe(true);
    expect(harness.runtime.getDiagnostics().dispatchRunning).toBe(true);
  });

  it('流速变更更新设置、重置基线，并按新间隔唯一重启活跃周期任务', function () {
    var harness = createHarness();
    harness.runtime.startDispatch();

    var result = harness.runtime.handleDayDurationChange(8000);

    expect(harness.getSettings().realtimeDayDurationMs).toBe(8000);
    expect(harness.clock.reset).toHaveBeenCalledWith(321);
    expect(harness.clock.startRecurring).toHaveBeenLastCalledWith(
      'active-dispatch',
      expect.any(Function),
      4000
    );
    expect(result.recurringTasks).toEqual([{ id: 'active-dispatch', intervalMs: 4000 }]);
  });
});
