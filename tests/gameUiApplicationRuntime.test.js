import { describe, expect, it, vi } from 'vitest';
import { createGameUiApplicationRuntime } from '../js/core/GameUiApplicationRuntime.js';

function createHarness(overrides) {
  var state = { fleet: [], activeShipIndex: 0, currentSystem: 'sol_prime' };
  var loaded = Object.create(null);
  var featureStates = Object.create(null);
  var listeners = Object.create(null);
  var guidance = {
    actionGuide: { init: vi.fn(), dispose: vi.fn() },
    onboardingUi: { bindCompanyLauncher: vi.fn(), dispose: vi.fn(), showTutorialStart: vi.fn() },
    onboardingPolicy: { showWelcomeMessages: vi.fn() },
    getDispatchContext: vi.fn(),
    refresh: vi.fn(),
    showCompletion: vi.fn(),
  };
  var actionRuntime = {
    fleet: { onCommand: vi.fn() },
    archive: { onAcceptQuest: vi.fn() },
    commerce: {},
  };
  var features = {
    get: function (name) { return loaded[name] || null; },
    getState: function (name) { return featureStates[name] || 'idle'; },
    load: function (name) { return Promise.resolve(loaded[name] || null); },
    sync: vi.fn(),
  };
  var ui = {
    HUD: { init: vi.fn(), setQuestActions: vi.fn(), setVictoryActions: vi.fn(), updateStats: vi.fn(), updateCompanyName: vi.fn(), updateArchiveBadges: vi.fn() },
    ShipUI: { init: vi.fn(), renderShipStats: vi.fn() },
    MapUI: {
      init: vi.fn(),
      initTabs: vi.fn(),
      init3DCallbacks: vi.fn(),
      setExplorationActions: vi.fn(),
      setNavigationChangeCallback: vi.fn(),
      setRefreshMarket: vi.fn(),
      refreshPlanetDetail: vi.fn(),
      openMarket: vi.fn(),
      closeMarket: vi.fn(),
      isMarketOpen: vi.fn(function () { return false; }),
      openQuestsPanel: vi.fn(),
    },
    UIManager: { init: vi.fn(), getNavigationSnapshot: vi.fn(function () { return { activeWorkspace: 'map' }; }) },
    Modal: { init: vi.fn() },
    Renderer: { initMapControls: vi.fn(), invalidateScene: vi.fn(), whenSceneReady: vi.fn(function () { return Promise.resolve({ renderer: 'test' }); }) },
    ContextInspector: { registerRenderer: vi.fn() },
  };
  var callbacks = {
    getSettings: function () { return {}; },
    hideSettingsFallback: vi.fn(),
    emitLog: vi.fn(),
    invalidate: vi.fn(),
    setTelemetryState: vi.fn(),
    refuel: vi.fn(),
    travel: vi.fn(),
    galaxyJump: vi.fn(),
    explorePoi: vi.fn(),
    getPoiStatus: vi.fn(),
    confirmTrade: vi.fn(),
  };
  var runtime = createGameUiApplicationRuntime(Object.assign({
    getState: function () { return state; },
    getRevision: function () { return 1; },
    getSessionToken: function () { return { revision: 1 }; },
    isSessionTokenCurrent: function () { return true; },
    features: features,
    events: {
      on: function (name, handler) { listeners[name] = handler; },
      off: function (name, handler) { if (listeners[name] === handler) delete listeners[name]; },
    },
    ui: ui,
    systems: {
      Trade: { getNetWorth: function () { return 0; } },
      Dispatch: { updateActiveDispatchUI: vi.fn() },
      Tutorial: { isCompleted: function () { return true; } },
      systems: [],
    },
    services: {
      getActionRuntime: function () { return actionRuntime; },
      getGuidanceRuntime: function () { return guidance; },
      getPersistenceController: function () { return { saveSlot: vi.fn(), loadSlot: vi.fn() }; },
      getVictoryController: function () { return { choosePolicy: vi.fn() }; },
    },
    callbacks: callbacks,
  }, overrides || {}));
  return { runtime: runtime, state: state, loaded: loaded, ui: ui, callbacks: callbacks, guidance: guidance };
}

describe('GameUiApplicationRuntime', function () {
  it('延迟组装 UI controller 图，并保持最新 state provider 和兼容诊断', async function () {
    var harness = createHarness();
    expect(harness.runtime.getDiagnostics()).toEqual({ coordinator: null, lifecycle: null, market: null, settings: null });

    await harness.runtime.renderAll();
    var diagnostics = harness.runtime.getDiagnostics();
    expect(diagnostics.renderAllCount).toBe(1);
    expect(diagnostics.coordinator.renderAllCount).toBe(1);
    expect(diagnostics.market).not.toBeNull();
    expect(harness.ui.HUD.updateStats).toHaveBeenCalledWith(harness.state, 0);
  });

  it('按需加载并渲染 Fleet，同时由组合边界统一转发 dirty region', async function () {
    var harness = createHarness();
    var FleetUI = { render: vi.fn(), renderShop: vi.fn(), setLifecycleActions: vi.fn() };
    harness.loaded.fleet = FleetUI;

    await harness.runtime.ensureFleet();
    expect(FleetUI.render).toHaveBeenCalledTimes(1);
    expect(FleetUI.renderShop).toHaveBeenCalledTimes(1);

    await harness.runtime.invalidate(['hud']);
    expect(harness.ui.HUD.updateStats).toHaveBeenCalled();
    expect(harness.runtime.getDiagnostics().lastInvalidationRegions).toEqual(['hud']);
  });

  it('统一初始化、场景就绪、入口呈现、重置与释放 UI 生命周期', async function () {
    var harness = createHarness();
    expect(harness.runtime.initialize()).toBe(true);
    expect(harness.ui.MapUI.init).toHaveBeenCalled();
    expect(harness.ui.Modal.init).toHaveBeenCalledWith(harness.callbacks.confirmTrade);
    await expect(harness.runtime.whenSceneReady()).resolves.toEqual({ renderer: 'test' });

    harness.runtime.presentEntry({ restoredAutosave: true });
    expect(harness.callbacks.emitLog).toHaveBeenCalledWith({ text: '📂 已自动恢复最近进度。', type: 'info' });
    expect(harness.guidance.onboardingPolicy.showWelcomeMessages).toHaveBeenCalled();

    harness.runtime.reset();
    harness.runtime.dispose();
    expect(harness.runtime.getDiagnostics()).toEqual({ coordinator: null, lifecycle: null, market: null, settings: null });
  });
});
