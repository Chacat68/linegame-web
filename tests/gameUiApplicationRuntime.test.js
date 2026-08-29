import { describe, expect, it, vi } from 'vitest';
import { UI_REGION } from '../js/core/ActionPresentation.js';
import { createGameUiApplicationRuntime } from '../js/core/GameUiApplicationRuntime.js';
import { SETTINGS_COMMAND } from '../js/core/SettingsCommandController.js';

function createHarness(overrides) {
  var state = { fleet: [], activeShipIndex: 0, currentSystem: 'sol_prime' };
  var loaded = Object.create(null);
  var featureStates = Object.create(null);
  var listeners = Object.create(null);
  var tabCallback = null;
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
    getDiagnostics: function () { return Object.freeze({}); },
    getState: function (name) { return featureStates[name] || 'idle'; },
    load: function (name) { return Promise.resolve(loaded[name] || null); },
    sync: vi.fn(),
  };
  var ui = {
    HUD: {
      init: vi.fn(),
      setVictoryActions: vi.fn(),
      ensureGalaxyToggle: vi.fn(),
      syncVictoryProgress: vi.fn(),
      getDiagnostics: vi.fn(function () { return { entryCount: 0, selectedMessageId: null }; }),
      resetRuntimeState: vi.fn(),
    },
    ShellProjection: {
      render: vi.fn(),
      getDiagnostics: vi.fn(function () { return { renderCount: 1 }; }),
    },
    LogsUI: {
      getDiagnostics: vi.fn(function () { return { entryCount: 0, selectedMessageId: null }; }),
      resetRuntimeState: vi.fn(),
    },
    ShipUI: { init: vi.fn(), renderShipStats: vi.fn() },
    MapUI: {
      init: vi.fn(),
      init3DCallbacks: vi.fn(),
      setExplorationActions: vi.fn(),
      setNavigationActions: vi.fn(),
      setNavigationChangeCallback: vi.fn(),
      refreshPlanetDetail: vi.fn(),
      getDiagnostics: vi.fn(function () { return { selectedSystemId: null }; }),
      resetRuntimeState: vi.fn(),
    },
    MarketWorkspaceEntry: {
      close: vi.fn(),
      consumePendingFocus: vi.fn(function () { return null; }),
      dispose: vi.fn(),
      getDiagnostics: vi.fn(function () { return { open: false, viewingSystemId: null }; }),
      getViewGalaxy: vi.fn(function (nextState) { return nextState.currentGalaxy; }),
      getViewSystem: vi.fn(function (nextState) { return nextState.currentSystem; }),
      init: vi.fn(),
      isOpen: vi.fn(function () { return false; }),
      open: vi.fn(),
      openPanel: vi.fn(function () { return true; }),
      openSystemPanel: vi.fn(function () { return true; }),
      refreshLocation: vi.fn(function () { return true; }),
      reset: vi.fn(),
    },
    WorkspaceTabs: {
      dispose: vi.fn(),
      activate: vi.fn(function () { return true; }),
      getActive: vi.fn(function (group) { return group === 'info' ? 'tab-quest' : 'tab-fleet'; }),
      getDiagnostics: vi.fn(function () { return { activeArchiveTab: 'tab-quest' }; }),
      init: vi.fn(),
      openArchive: vi.fn(),
      setOnChange: vi.fn(function (callback) { tabCallback = callback; }),
    },
    UIManager: {
      dispose: vi.fn(),
      init: vi.fn(),
      getNavigationSnapshot: vi.fn(function () { return { activeWorkspace: 'map' }; }),
      resetRuntimeState: vi.fn(),
      switchView: vi.fn(),
    },
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
    bindSettingsStatusSurfaceDismiss: vi.fn(),
    showSettingsStatusSurface: vi.fn(),
    hideSettingsSurface: vi.fn(),
    onResetTutorial: vi.fn(),
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
  return {
    runtime: runtime,
    state: state,
    loaded: loaded,
    features: features,
    ui: ui,
    callbacks: callbacks,
    guidance: guidance,
    getTabCallback: function () { return tabCallback; },
  };
}

describe('GameUiApplicationRuntime', function () {
  it('延迟组装 UI controller 图，并保持最新 state provider 和兼容诊断', async function () {
    var harness = createHarness();
    expect(harness.runtime.getDiagnostics()).toEqual({
      coordinator: null,
      featureRecovery: {
        presentation: { activeFeatures: [], errorCount: 0, loadingCount: 0, retryCount: 0 },
        registry: {
          counts: { error: 0, idle: 0, loading: 0, ready: 0 },
          features: {},
          registeredCount: 0,
          totalLoadCount: 0,
          totalSyncCount: 0,
        },
        settings: null,
      },
      lifecycle: null,
      market: null,
      marketEntry: null,
      shellProjection: null,
      settings: null,
      settingsCommands: null,
      workspaceTabs: null,
    });

    await harness.runtime.renderAll();
    var diagnostics = harness.runtime.getDiagnostics();
    expect(diagnostics.renderAllCount).toBe(1);
    expect(diagnostics.coordinator.renderAllCount).toBe(1);
    expect(diagnostics.market).not.toBeNull();
    expect(harness.ui.ShellProjection.render).toHaveBeenCalledWith(harness.state, 0);
    expect(diagnostics.shellProjection).toEqual({ renderCount: 1 });
  });

  it('Coordinator 尚未构造时也提供稳定的顶层 Feature recovery 快照', function () {
    var features = {
      get: function () { return null; },
      getDiagnostics: function () {
        return {
          settings: {
            dependencies: [],
            error: new Error('temporary settings failure'),
            generation: 2,
            loadCount: 1,
            state: 'error',
            syncCount: 0,
          },
        };
      },
      load: function () { return Promise.resolve(null); },
      sync: vi.fn(),
    };
    var harness = createHarness({ features: features });
    harness.ui.DeferredFeatureStatusUI.getDiagnostics.mockReturnValue({
      activeFeatures: ['settings'],
      errorCount: 1,
      loadingCount: 1,
      retryCount: 2,
    });
    harness.runtime.syncSettings({ initSettingsModal: vi.fn() });

    var diagnostics = harness.runtime.getDiagnostics();
    expect(diagnostics.coordinator).toBe(null);
    expect(diagnostics.featureRecovery).toMatchObject({
      presentation: {
        activeFeatures: ['settings'],
        errorCount: 1,
        loadingCount: 1,
        retryCount: 2,
      },
      registry: {
        counts: { error: 1, idle: 0, loading: 0, ready: 0 },
        registeredCount: 1,
        totalLoadCount: 1,
      },
      settings: { bound: true, loadState: 'ready', syncCount: 1 },
    });
    expect(diagnostics.featureRecovery.registry.features.settings.errorMessage)
      .toBe('temporary settings failure');
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

    await harness.runtime.invalidate(['shell']);
    expect(harness.ui.ShellProjection.render).toHaveBeenCalled();
    expect(harness.runtime.getDiagnostics().lastInvalidationRegions).toEqual(['shell']);
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

  it('以正式 runtime 导航端口发布市场、Tab 与返回地图能力', function () {
    var harness = createHarness();
    var focus = { panel: 'spot', goodId: 'ore' };

    expect(harness.runtime.navigation.activateWorkspaceTab('tab-research')).toBe(true);
    expect(harness.ui.WorkspaceTabs.activate).toHaveBeenCalledWith('tab-research', undefined);
    expect(harness.runtime.navigation.getActiveArchiveTab()).toBe('tab-quest');
    expect(harness.runtime.navigation.getMarketViewSystem(harness.state)).toBe('sol_prime');
    expect(harness.runtime.navigation.isMarketOpen()).toBe(false);
    expect(harness.runtime.navigation.openMarketPanel(harness.state, focus)).toBe(true);
    expect(harness.ui.MarketWorkspaceEntry.openPanel).toHaveBeenCalledWith(harness.state, focus);
    expect(harness.runtime.navigation.openMarketSystemPanel(harness.state, 'nova_station', focus)).toBe(true);
    expect(harness.ui.MarketWorkspaceEntry.openSystemPanel).toHaveBeenCalledWith(
      harness.state,
      'nova_station',
      focus,
    );
    expect(harness.runtime.navigation.refreshMarketLocation(harness.state)).toBe(true);
    expect(harness.runtime.navigation.returnToMap()).toBeUndefined();
    expect(harness.ui.MarketWorkspaceEntry.close).toHaveBeenCalledOnce();
    expect(harness.ui.UIManager.switchView).toHaveBeenCalledWith('map');
  });

  it('以正式 runtime 设置端口发布 typed command，而不是向 UI 注入 mutation 回调', function () {
    var harness = createHarness();

    var result = harness.runtime.settingsCommands.execute({
      type: SETTINGS_COMMAND.RESET_TUTORIAL,
    });

    expect(result.ok).toBe(true);
    expect(harness.callbacks.onResetTutorial).toHaveBeenCalledOnce();
    expect(harness.runtime.getDiagnostics().settingsCommands).toEqual({
      commandCount: 1,
      lastCommandType: SETTINGS_COMMAND.RESET_TUTORIAL,
    });
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
    expect(harness.ui.MapUI.resetRuntimeState).toHaveBeenCalledOnce();
    expect(harness.ui.LogsUI.resetRuntimeState).toHaveBeenCalledOnce();
    expect(harness.ui.UIManager.resetRuntimeState).toHaveBeenCalledOnce();
    expect(harness.runtime.getDiagnostics()).toEqual({
      coordinator: null,
      featureRecovery: {
        presentation: { activeFeatures: [], errorCount: 0, loadingCount: 0, retryCount: 0 },
        registry: {
          counts: { error: 0, idle: 0, loading: 0, ready: 0 },
          features: {},
          registeredCount: 0,
          totalLoadCount: 0,
          totalSyncCount: 0,
        },
        settings: null,
      },
      lifecycle: null,
      market: null,
      marketEntry: null,
      shellProjection: null,
      settings: null,
      settingsCommands: null,
      workspaceTabs: null,
    });
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
    var onTab = harness.getTabCallback();
    onTab('tab-research', { changed: true, previousTabId: 'tab-quest' });
    expect(harness.ui.WorkspaceDetailSurface.close).toHaveBeenCalledOnce();
    expect(harness.ui.ContextInspector.clearContext).toHaveBeenCalledWith('archive');
    await expect(harness.runtime.whenSceneReady()).resolves.toEqual({ renderer: 'test' });

    harness.runtime.presentEntry({ restoredAutosave: true });
    expect(harness.callbacks.emitLog).toHaveBeenCalledWith({ text: '📂 已自动恢复最近进度。', type: 'info' });
    expect(harness.guidance.onboardingPolicy.showWelcomeMessages).toHaveBeenCalled();

    harness.runtime.reset();
    expect(harness.ui.DeferredFeatureStatusUI.clear).toHaveBeenCalledWith('settings');
    expect(resetMarketRuntime).toHaveBeenCalledOnce();
    expect(resetFleetRuntime).toHaveBeenCalledOnce();
    expect(resetArchiveRuntime).toHaveBeenCalledOnce();
    expect(harness.ui.MapUI.resetRuntimeState).toHaveBeenCalledOnce();
    expect(harness.ui.LogsUI.resetRuntimeState).toHaveBeenCalledOnce();
    expect(harness.ui.UIManager.resetRuntimeState).toHaveBeenCalledOnce();
    expect(harness.runtime.getDiagnostics().mapUi).toEqual({ selectedSystemId: null });
    expect(harness.runtime.getDiagnostics().logsUi).toEqual({ entryCount: 0, selectedMessageId: null });
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
    expect(harness.runtime.getDiagnostics()).toEqual({
      coordinator: null,
      featureRecovery: {
        presentation: {
          activeFeatures: [],
          errorCount: 0,
          loadingCount: 0,
          retryCount: 0,
        },
        registry: {
          counts: { error: 0, idle: 0, loading: 0, ready: 0 },
          features: {},
          registeredCount: 0,
          totalLoadCount: 0,
          totalSyncCount: 0,
        },
        settings: null,
      },
      lifecycle: null,
      market: null,
      marketEntry: null,
      shellProjection: null,
      settings: null,
      settingsCommands: null,
      workspaceTabs: null,
    });
  });
});
