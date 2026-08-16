import { describe, expect, it, vi } from 'vitest';
import { createRandomEventRuntimeController } from '../js/core/RandomEventRuntimeController.js';

function createHarness(options) {
  var config = options || {};
  var state = config.state || { id: 'A', _activeEventId: '' };
  var revision = 1;
  var trace = [];
  var rollSequence = 0;
  var activeEvent = config.activeEvent || null;
  var runtime = config.runtime || {
    syncRuntimeState: function (target) { trace.push(['sync', target.id]); },
    resetRuntimeState: function (target) { trace.push(['reset', target.id]); target._activeEventId = ''; },
    rollEvent: function (target, chance) {
      rollSequence += 1;
      trace.push(['roll', target.id, chance, rollSequence]);
      return config.rollEvents ? (config.rollEvents[rollSequence - 1] || null) : null;
    },
    getActiveEvent: function () { trace.push(['getActive']); return activeEvent; },
  };
  var loadRuntime = config.loadRuntime || vi.fn(function () { return Promise.resolve(runtime); });
  var telemetry = [];
  var failures = [];
  var presented = [];
  var choiceHandler = vi.fn();
  var controller = createRandomEventRuntimeController({
    getState: function () { return state; },
    getSessionToken: function () { return { state: state, revision: revision }; },
    isSessionTokenCurrent: function (token) {
      return !!token && token.state === state && token.revision === revision;
    },
    loadRuntime: loadRuntime,
    hooks: {
      setTelemetryState: function (value) { telemetry.push(value); },
      reportFailure: function (error) { failures.push(error); },
      presentEvent: function (event, onChoice) { trace.push(['present', event.id]); presented.push({ event: event, onChoice: onChoice }); },
      onChoice: choiceHandler,
      emitAudio: function (cue) { trace.push(['audio', cue]); },
      emitMessage: function (message) { trace.push(['message', message.text]); },
      captureState: function (target, persistenceOptions) {
        trace.push(['capture', target.id, persistenceOptions.reason, persistenceOptions.sessionToken.revision]);
      },
      saveAutosave: function (target, persistenceOptions) {
        trace.push(['save', target.id, persistenceOptions.reason, persistenceOptions.sessionToken.revision]);
      },
      refreshActionGuide: function () { trace.push(['guide']); },
    },
  });
  return {
    controller: controller,
    runtime: runtime,
    trace: trace,
    telemetry: telemetry,
    failures: failures,
    presented: presented,
    choiceHandler: choiceHandler,
    loadRuntime: loadRuntime,
    replaceState: function (nextState) { state = nextState; revision += 1; controller.sync(nextState); },
    getState: function () { return state; },
  };
}

describe('RandomEventRuntimeController', function () {
  it('并发请求只加载一次，roll 严格串行并在持久化后刷新引导', async function () {
    var firstEvent = { id: 'first', title: '第一事件' };
    var secondEvent = { id: 'second', title: '第二事件' };
    var harness = createHarness({ rollEvents: [firstEvent, secondEvent] });

    var results = await Promise.all([
      harness.controller.scheduleRoll(harness.getState(), 0.25),
      harness.controller.scheduleRoll(harness.getState(), 0.5),
    ]);

    expect(results).toEqual([firstEvent, secondEvent]);
    expect(harness.loadRuntime).toHaveBeenCalledOnce();
    expect(harness.telemetry).toEqual(['loading', 'ready']);
    expect(harness.trace.filter(function (entry) { return entry[0] === 'roll'; })).toEqual([
      ['roll', 'A', 0.25, 1],
      ['roll', 'A', 0.5, 2],
    ]);
    expect(harness.trace.map(function (entry) { return entry[0]; })).toEqual([
      'sync',
      'sync', 'roll', 'audio', 'present', 'message', 'capture', 'save', 'guide',
      'sync', 'roll', 'audio', 'present', 'message', 'capture', 'save', 'guide',
    ]);
    expect(harness.trace.filter(function (entry) { return entry[0] === 'capture' || entry[0] === 'save'; })).toEqual([
      ['capture', 'A', 'random-event-roll', 1],
      ['save', 'A', 'random-event-roll', 1],
      ['capture', 'A', 'random-event-roll', 1],
      ['save', 'A', 'random-event-roll', 1],
    ]);
    harness.presented[0].onChoice(2);
    expect(harness.choiceHandler).toHaveBeenCalledWith(2);
    expect(harness.controller.getDiagnostics()).toMatchObject({ rollCount: 2, triggeredCount: 2 });
  });

  it('会话替换会丢弃加载中的旧 roll，不呈现也不保存旧状态', async function () {
    var resolveRuntime;
    var runtimePromise = new Promise(function (resolve) { resolveRuntime = resolve; });
    var harness = createHarness({ loadRuntime: vi.fn(function () { return runtimePromise; }) });
    var oldState = harness.getState();

    var pending = harness.controller.scheduleRoll(oldState, 1);
    await Promise.resolve();
    harness.replaceState({ id: 'B', _activeEventId: '' });
    resolveRuntime(harness.runtime);
    expect(await pending).toBe(null);

    expect(harness.trace.some(function (entry) { return entry[0] === 'roll'; })).toBe(false);
    expect(harness.trace.some(function (entry) { return entry[0] === 'present'; })).toBe(false);
    expect(harness.trace.some(function (entry) { return entry[0] === 'save'; })).toBe(false);
    expect(harness.trace).toContainEqual(['sync', 'B']);
  });

  it('恢复持久化 pending event 时只呈现并刷新，不重复告警或自动存档', async function () {
    var pendingEvent = { id: 'persisted', title: '待处理事件' };
    var harness = createHarness({
      state: { id: 'A', _activeEventId: 'persisted' },
      activeEvent: pendingEvent,
    });

    expect(await harness.controller.restorePending(harness.getState())).toBe(pendingEvent);
    expect(harness.presented[0].event).toBe(pendingEvent);
    expect(harness.trace.map(function (entry) { return entry[0]; })).toEqual([
      'sync', 'sync', 'getActive', 'present', 'guide',
    ]);
    expect(harness.trace.some(function (entry) { return entry[0] === 'audio'; })).toBe(false);
    expect(harness.trace.some(function (entry) { return entry[0] === 'save'; })).toBe(false);
  });

  it('未加载 reset 会清理持久字段，加载后 reset 委托领域 runtime', async function () {
    var state = {
      id: 'A',
      _eventCooldowns: { old: 2 },
      _eventHistory: [{ eventId: 'old' }],
      _activeEventId: 'old',
      _tripsSinceLastEvent: 1,
    };
    var harness = createHarness({ state: state });

    harness.controller.reset(state);
    expect(state).toMatchObject({
      _eventCooldowns: {},
      _eventHistory: [],
      _activeEventId: '',
      _tripsSinceLastEvent: 999,
    });
    await harness.controller.load();
    harness.controller.reset(state);
    expect(harness.trace).toContainEqual(['reset', 'A']);
  });

  it('加载失败可重试，dispose 后拒绝 roll 与恢复', async function () {
    var attempt = 0;
    var runtime;
    var harness = createHarness({
      loadRuntime: vi.fn(function () {
        attempt += 1;
        if (attempt === 1) return Promise.reject(new Error('offline'));
        return runtime;
      }),
    });
    runtime = harness.runtime;

    expect(await harness.controller.load()).toBe(null);
    expect(harness.failures).toHaveLength(1);
    expect(await harness.controller.load()).toBe(runtime);
    expect(harness.loadRuntime).toHaveBeenCalledTimes(2);
    harness.controller.dispose();
    expect(await harness.controller.scheduleRoll(harness.getState(), 1)).toBe(null);
    harness.getState()._activeEventId = 'persisted';
    expect(await harness.controller.restorePending(harness.getState())).toBe(null);
    expect(harness.controller.getDiagnostics()).toMatchObject({ state: 'disposed', disposed: true });
  });
});
