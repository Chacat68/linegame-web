import { describe, expect, it, vi } from 'vitest';
import { UI_REGION } from '../js/core/ActionPresentation.js';
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
      getActiveArchiveTab: vi.fn(function () { return 'tab-quest'; }),
    },
    UIManager: { init: vi.fn(), getNavigationSnapshot: vi.fn(function () { return { activeWorkspace: 'map' }; }) },
    Modal: { init: vi.fn() },
    Renderer: { initMapControls: vi.fn(), invalidateScene: vi.fn(), whenSceneReady: vi.fn(function () { return Promise.resolve({ renderer: 'test' }); }) },
    ContextInspector: { registerRenderer: vi.fn(), clearContext: vi.fn(), dispose: vi.fn() },
    DeferredFeatureStatusUI: {
      showLoading: vi.fn(),
      showError: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
      getDiagnostics: vi.fn(function () { return { activeFeatures: [] }; }),
    },
    WorkspaceDetailSurface: { init: vi.fn(), close: vi.fn(), refresh: vi.fn(), dispose: vi.fn() },
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
  return { runtime: runtime, state: state, loaded: loaded, features: features, ui: ui, callbacks: callbacks, guidance: guidance };
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
    expect(harness.runtime.getDiagnostics().workspaceRenders).toEqual(expect.objectContaining({
      lastRenderedRegions: [UI_REGION.FLEET_HANGAR, UI_REGION.FLEET_SHOP],
      renderCounts: expect.objectContaining({
        [UI_REGION.FLEET_HANGAR]: 1,
        [UI_REGION.FLEET_SHOP]: 1,
      }),
    }));

    await harness.runtime.invalidate(['hud']);
    expect(harness.ui.HUD.updateStats).toHaveBeenCalled();
    expect(harness.runtime.getDiagnostics().lastInvalidationRegions).toEqual(['hud']);
  });

  it('市场专用刷新也走统一局部错误面，并可从同一工作区重试', async function () {
    var attempts = 0;
    var MarketUI = {
      render: vi.fn(),
      showDetail: vi.fn(),
    };
    var features = {
      get: function () { return null; },
      getState: function () { return attempts > 0 ? 'error' : 'idle'; },
      load: function () {
        attempts += 1;
        return Promise.resolve(attempts === 1 ? null : MarketUI);
      },
      sync: vi.fn(),
    };
    var harness = createHarness({ features: features });

    await expect(harness.runtime.refreshMarket()).resolves.toBe(false);
    expect(harness.ui.DeferredFeatureStatusUI.showError).toHaveBeenCalledWith('market', expect.any(Function));

    var retry = harness.ui.DeferredFeatureStatusUI.showError.mock.calls[0][1];
    await expect(retry()).resolves.toBe(true);
    expect(attempts).toBe(2);
    expect(harness.ui.DeferredFeatureStatusUI.clear).toHaveBeenCalledWith('market');
    expect(MarketUI.showDetail).toHaveBeenCalled();
    expect(MarketUI.render).toHaveBeenCalled();
  });

  it('协调器尚未创建时也会重置所有已加载工作区会话', function () {
    var harness = createHarness();
    var resetMarketRuntime = vi.fn();
    var resetFleetRuntime = vi.fn();
    var resetArchiveRuntime = vi.fn();
    harness.loaded.market = { resetRuntimeState: resetMarketRuntime };
    harness.loaded.fleet = { resetRuntimeState: resetFleetRuntime };
    harness.loaded.archive = { resetRuntimeState: resetArchiveRuntime };

    harness.runtime.reset();

    expect(resetMarketRuntime).toHaveBeenCalledOnce();
    expect(resetFleetRuntime).toHaveBeenCalledOnce();
    expect(resetArchiveRuntime).toHaveBeenCalledOnce();
    expect(harness.runtime.getDiagnostics()).toEqual({ coordinator: null, lifecycle: null, market: null, settings: null });
  });

  it('统一初始化、场景就绪、入口呈现、重置与释放 UI 生命周期', async function () {
    var harness = createHarness();
    var resetMarketRuntime = vi.fn();
    var resetFleetRuntime = vi.fn();
    var resetArchiveRuntime = vi.fn();
    harness.loaded.market = {
      getDiagnostics: function () { return { activeWorkspace: 'spot' }; },
      render: vi.fn(),
      resetRuntimeState: resetMarketRuntime,
    };
    harness.loaded.fleet = {
      getDiagnostics: function () { return { activeSurface: null, surfaceMode: null }; },
      resetRuntimeState: resetFleetRuntime,
    };
    harness.loaded.archive = {
      getDiagnostics: function () {
        return { quest: { selectedAvailableQuestId: null }, exploration: { focus: null }, resetCount: 1 };
      },
      resetRuntimeState: resetArchiveRuntime,
    };
    expect(harness.runtime.initialize()).toBe(true);
    expect(harness.ui.MapUI.init).toHaveBeenCalled();
    expect(harness.ui.Modal.init).toHaveBeenCalledWith(harness.callbacks.confirmTrade);
    expect(harness.ui.WorkspaceDetailSurface.init).toHaveBeenCalled();
    var onTab = harness.ui.MapUI.initTabs.mock.calls[0][0];
    onTab('tab-research', { changed: true, previousTabId: 'tab-quest' });
    expect(harness.ui.WorkspaceDetailSurface.close).toHaveBeenCalledOnce();
    expect(harness.ui.ContextInspector.clearContext).toHaveBeenCalledWith('archive');
    await expect(harness.runtime.whenSceneReady()).resolves.toEqual({ renderer: 'test' });

    harness.runtime.presentEntry({ restoredAutosave: true });
    expect(harness.callbacks.emitLog).toHaveBeenCalledWith({ text: '📂 已自动恢复最近进度。', type: 'info' });
    expect(harness.guidance.onboardingPolicy.showWelcomeMessages).toHaveBeenCalled();

    harness.runtime.reset();
    expect(resetMarketRuntime).toHaveBeenCalledOnce();
    expect(resetFleetRuntime).toHaveBeenCalledOnce();
    expect(resetArchiveRuntime).toHaveBeenCalledOnce();
    expect(harness.runtime.getDiagnostics().marketUi).toEqual({ activeWorkspace: 'spot' });
    expect(harness.runtime.getDiagnostics().fleetUi).toEqual({ activeSurface: null, surfaceMode: null });
    expect(harness.runtime.getDiagnostics().archiveUi).toEqual(expect.objectContaining({
      activeTab: 'tab-quest',
      quest: { selectedAvailableQuestId: null },
      exploration: { focus: null },
    }));
    harness.runtime.dispose();
    expect(harness.ui.ContextInspector.dispose).toHaveBeenCalledOnce();
    expect(harness.ui.DeferredFeatureStatusUI.dispose).toHaveBeenCalledOnce();
    expect(harness.ui.WorkspaceDetailSurface.dispose).toHaveBeenCalledOnce();
    expect(harness.runtime.getDiagnostics()).toEqual({ coordinator: null, lifecycle: null, market: null, settings: null });
  });
});
