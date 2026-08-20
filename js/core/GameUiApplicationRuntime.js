// js/core/GameUiApplicationRuntime.js — UI 应用层控制器、工作区与呈现生命周期组合边界

import { createMarketWorkspaceController } from './MarketWorkspaceController.js';
import { createGameUiLifecycleController } from './GameUiLifecycleController.js';
import { createSettingsUiController } from './SettingsUiController.js';
import { createGameUiCoordinator } from '../ui/GameUiCoordinator.js';
import { createWorkspaceContextAdapters } from '../ui/WorkspaceContextAdapters.js';
import { createMarketWorkspaceEntryController } from '../ui/MarketWorkspaceEntryController.js';
import { createWorkspaceTabController } from '../ui/WorkspaceTabController.js';

export function createGameUiApplicationRuntime(options) {
  var opts = options || {};
  var getState = opts.getState || function () { return null; };
  var getRevision = opts.getRevision || function () { return 0; };
  var getSessionToken = opts.getSessionToken || function () { return null; };
  var isSessionTokenCurrent = opts.isSessionTokenCurrent || function () { return true; };
  var features = opts.features || {};
  var events = opts.events || {};
  var ui = opts.ui || {};
  var systems = opts.systems || {};
  var services = opts.services || {};
  var callbacks = opts.callbacks || {};
  var settingsController = null;
  var marketWorkspace = null;
  var marketWorkspaceEntry = null;
  var workspaceTabs = null;
  var coordinator = null;
  var lifecycle = null;
  var contextAdapters = null;

  function _actionRuntime() {
    return typeof services.getActionRuntime === 'function' ? services.getActionRuntime() : {};
  }

  function _guidanceRuntime() {
    return typeof services.getGuidanceRuntime === 'function' ? services.getGuidanceRuntime() : {};
  }

  function _persistenceController() {
    return typeof services.getPersistenceController === 'function' ? services.getPersistenceController() : {};
  }

  function _victoryController() {
    return typeof services.getVictoryController === 'function' ? services.getVictoryController() : {};
  }

  function getSettingsController() {
    if (settingsController) return settingsController;
    settingsController = createSettingsUiController({
      features: features,
      getSettings: callbacks.getSettings,
      getState: getState,
      getSessionToken: getSessionToken,
      isSessionTokenCurrent: isSessionTokenCurrent,
      Renderer: ui.Renderer,
      hideFallback: callbacks.hideSettingsFallback,
      callbacks: {
        onOpen: ensureSave,
        onDifficultyChanged: callbacks.onDifficultyChanged,
        onRealtimeDayDurationChanged: callbacks.onRealtimeDayDurationChanged,
        onResetTutorial: function () {
          settingsController.hide();
          if (typeof callbacks.onResetTutorial === 'function') callbacks.onResetTutorial();
        },
        onClearSaves: callbacks.onClearSaves,
      },
    });
    return settingsController;
  }

  function getMarketWorkspace() {
    if (marketWorkspace) return marketWorkspace;
    marketWorkspace = createMarketWorkspaceController({
      getState: getState,
      getSessionToken: getSessionToken,
      isSessionTokenCurrent: isSessionTokenCurrent,
      loadMarket: function () {
        return getCoordinator().loadFeature('market', function () {
          return getMarketWorkspace().refresh({ consumePendingFocus: false });
        });
      },
      renderMarket: function (MarketUI, state) { return getCoordinator().renderMarket(MarketUI, state); },
      MapUI: ui.MapUI,
      MarketWorkspaceEntry: getMarketWorkspaceEntry(),
      Modal: ui.Modal,
      Tutorial: systems.Tutorial,
      systems: systems.systems,
      emitLog: callbacks.emitLog,
      invalidate: callbacks.invalidate,
      showCompletion: function (completion) {
        var guidance = _guidanceRuntime();
        return typeof guidance.showCompletion === 'function' ? guidance.showCompletion(completion) : false;
      },
      getCommerceActions: function () { return _actionRuntime().commerce; },
      refuel: callbacks.refuel,
    });
    return marketWorkspace;
  }

  function getMarketWorkspaceEntry() {
    if (marketWorkspaceEntry) return marketWorkspaceEntry;
    if (ui.MarketWorkspaceEntry) {
      marketWorkspaceEntry = ui.MarketWorkspaceEntry;
      return marketWorkspaceEntry;
    }
    marketWorkspaceEntry = createMarketWorkspaceEntryController({
      getState: getState,
      navigate: function (workspace) {
        return ui.UIManager && typeof ui.UIManager.switchView === 'function'
          ? ui.UIManager.switchView(workspace)
          : false;
      },
      refresh: function () { return getMarketWorkspace().refresh(); },
    });
    return marketWorkspaceEntry;
  }

  function getWorkspaceTabs() {
    if (workspaceTabs) return workspaceTabs;
    if (ui.WorkspaceTabs) {
      workspaceTabs = ui.WorkspaceTabs;
      return workspaceTabs;
    }
    workspaceTabs = createWorkspaceTabController({
      getState: getState,
      navigate: function (workspace) {
        return ui.UIManager && typeof ui.UIManager.switchView === 'function'
          ? ui.UIManager.switchView(workspace)
          : false;
      },
    });
    return workspaceTabs;
  }

  function getCoordinator() {
    if (coordinator) return coordinator;
    var actions = _actionRuntime();
    var guidance = _guidanceRuntime();
    var persistence = _persistenceController();
    var market = getMarketWorkspace();
    if (!contextAdapters) {
      contextAdapters = createWorkspaceContextAdapters({
        inspector: ui.ContextInspector,
        detailSurface: ui.WorkspaceDetailSurface,
        getRevision: getRevision,
      });
    }
    coordinator = createGameUiCoordinator({
      getState: getState,
      features: features,
      ui: {
        HUD: ui.HUD,
        ShipUI: ui.ShipUI,
        MapUI: ui.MapUI,
        MarketWorkspaceEntry: getMarketWorkspaceEntry(),
        WorkspaceTabs: getWorkspaceTabs(),
        UIManager: ui.UIManager,
        Renderer3D: ui.Renderer,
        ContextAdapters: contextAdapters,
        DeferredFeatureStatusUI: ui.DeferredFeatureStatusUI,
      },
      systems: {
        Trade: systems.Trade,
        Dispatch: systems.Dispatch,
      },
      actions: {
        market: {
          getMode: market.getMode,
          onCommand: market.handleCommand,
          onAfterRender: market.syncAfterRender,
        },
        fleet: actions.fleet,
        archive: Object.assign({
          getDispatchContext: function (state) {
            return typeof guidance.getDispatchContext === 'function' ? guidance.getDispatchContext(state) : null;
          },
        }, actions.archive),
        save: {
          onSaveGame: persistence.saveSlot,
          onLoadGame: persistence.loadSlot,
        },
        global: {
          refreshActionGuide: function () {
            return typeof guidance.refresh === 'function' ? guidance.refresh() : false;
          },
        },
      },
    });
    return coordinator;
  }

  function getLifecycle() {
    if (lifecycle) return lifecycle;
    var guidance = _guidanceRuntime();
    var actions = _actionRuntime();
    lifecycle = createGameUiLifecycleController({
      getState: getState,
      getRevision: getRevision,
      features: features,
      events: events,
      ui: {
        HUD: ui.HUD,
        MapUI: ui.MapUI,
        UIManager: ui.UIManager,
        Modal: ui.Modal,
        Renderer: ui.Renderer,
        WorkspaceDetailSurface: ui.WorkspaceDetailSurface,
        MarketWorkspaceEntry: getMarketWorkspaceEntry(),
        WorkspaceTabs: getWorkspaceTabs(),
      },
      systems: { Tutorial: systems.Tutorial },
      controllers: {
        actionGuide: guidance.actionGuide,
        onboardingUi: guidance.onboardingUi,
        onboardingPolicy: guidance.onboardingPolicy,
        settingsUi: getSettingsController(),
      },
      ports: {
        acceptQuest: actions.archive && actions.archive.onAcceptQuest,
        chooseVictoryPolicy: function (pathId) {
          var victory = _victoryController();
          return typeof victory.choosePolicy === 'function' ? victory.choosePolicy(pathId) : false;
        },
        travel: callbacks.travel,
        galaxyJump: callbacks.galaxyJump,
        openMarket: getMarketWorkspaceEntry().open,
        closeMarket: getMarketWorkspaceEntry().close,
        isMarketOpen: getMarketWorkspaceEntry().isOpen,
        ensureFleet: ensureFleet,
        ensureArchive: ensureArchive,
        onArchiveTabChanged: function () {
          if (ui.WorkspaceDetailSurface && typeof ui.WorkspaceDetailSurface.close === 'function') {
            ui.WorkspaceDetailSurface.close();
          }
          if (ui.ContextInspector && typeof ui.ContextInspector.clearContext === 'function') {
            ui.ContextInspector.clearContext('archive');
          }
        },
        explorePoi: callbacks.explorePoi,
        getPoiStatus: callbacks.getPoiStatus,
        refreshActionGuide: guidance.refresh,
        confirmTrade: callbacks.confirmTrade,
      },
      setTelemetryState: callbacks.setTelemetryState,
      emitLog: callbacks.emitLog,
    });
    return lifecycle;
  }

  function ensureMarket() { return getCoordinator().ensureMarket(); }
  function ensureFleet() { return getCoordinator().ensureFleet(); }
  function ensureArchive() { return getCoordinator().ensureArchive(); }
  function ensureSave() { return getCoordinator().ensureSave(); }
  function renderFleet(module) { return getCoordinator().renderFleet(module); }
  function renderAll() { return getCoordinator().renderAll(); }
  function invalidate(regions) { return getCoordinator().invalidate(regions); }
  function refreshMarket() { return getMarketWorkspace().refresh(); }
  function syncSettings(module) { return getSettingsController().sync(module); }
  function hideSettings() { return getSettingsController().hide(); }

  // 正式工作区导航端口。领域/引导运行时只依赖此对象，不再借用 MapUI
  // 访问商业入口或通用 Tab 状态。
  var navigation = Object.freeze({
    activateWorkspaceTab: function (tabId, options) {
      return getWorkspaceTabs().activate(tabId, options);
    },
    closeMarket: function () { return getMarketWorkspaceEntry().close(); },
    getActiveArchiveTab: function () { return getWorkspaceTabs().getActive('info'); },
    getMarketViewSystem: function (state) { return getMarketWorkspaceEntry().getViewSystem(state); },
    isMarketOpen: function () { return getMarketWorkspaceEntry().isOpen(); },
    openMarketPanel: function (state, focus) {
      return getMarketWorkspaceEntry().openPanel(state, focus);
    },
    openMarketSystemPanel: function (state, systemId, focus) {
      return getMarketWorkspaceEntry().openSystemPanel(state, systemId, focus);
    },
    refreshMarketLocation: function (state) {
      return getMarketWorkspaceEntry().refreshLocation(state);
    },
    returnToMap: function () {
      getMarketWorkspaceEntry().close();
      return ui.UIManager && typeof ui.UIManager.switchView === 'function'
        ? ui.UIManager.switchView('map')
        : false;
    },
  });

  function reset() {
    if (marketWorkspace) marketWorkspace.reset();
    if (coordinator) coordinator.reset();
    else {
      if (marketWorkspaceEntry) marketWorkspaceEntry.reset();
      if (ui.UIManager && typeof ui.UIManager.resetRuntimeState === 'function') ui.UIManager.resetRuntimeState();
      if (ui.MapUI && typeof ui.MapUI.resetRuntimeState === 'function') ui.MapUI.resetRuntimeState();
      if (ui.HUD && typeof ui.HUD.resetRuntimeState === 'function') ui.HUD.resetRuntimeState();
      var MarketUI = typeof features.get === 'function' ? features.get('market') : null;
      var FleetUI = typeof features.get === 'function' ? features.get('fleet') : null;
      var ArchiveUI = typeof features.get === 'function' ? features.get('archive') : null;
      if (MarketUI && typeof MarketUI.resetRuntimeState === 'function') MarketUI.resetRuntimeState();
      if (FleetUI && typeof FleetUI.resetRuntimeState === 'function') FleetUI.resetRuntimeState();
      if (ArchiveUI && typeof ArchiveUI.resetRuntimeState === 'function') ArchiveUI.resetRuntimeState();
    }
  }

  function initialize() {
    return getLifecycle().initialize();
  }

  function presentEntry(options) {
    return getLifecycle().presentEntry(options);
  }

  function whenSceneReady() {
    return getLifecycle().whenSceneReady();
  }

  function dispose() {
    var lifecycleOwnedUi = !!lifecycle;
    if (coordinator) coordinator.dispose();
    else if (ui.DeferredFeatureStatusUI && typeof ui.DeferredFeatureStatusUI.dispose === 'function') {
      ui.DeferredFeatureStatusUI.dispose();
    }
    if (contextAdapters) contextAdapters.dispose();
    if (lifecycle) lifecycle.dispose();
    else if (settingsController) settingsController.dispose();
    if (marketWorkspace) marketWorkspace.dispose();
    if (!lifecycleOwnedUi && marketWorkspaceEntry) marketWorkspaceEntry.dispose();
    if (!lifecycleOwnedUi && workspaceTabs) workspaceTabs.dispose();
    if (ui.ContextInspector && typeof ui.ContextInspector.dispose === 'function') {
      ui.ContextInspector.dispose();
    }
    lifecycle = null;
    settingsController = null;
    marketWorkspace = null;
    marketWorkspaceEntry = null;
    workspaceTabs = null;
    coordinator = null;
    contextAdapters = null;
  }

  function getDiagnostics() {
    var coordinatorDiagnostics = coordinator ? coordinator.getDiagnostics() : null;
    return Object.freeze(Object.assign({}, coordinatorDiagnostics || {}, {
      coordinator: coordinatorDiagnostics,
      lifecycle: lifecycle ? lifecycle.getDiagnostics() : null,
      market: marketWorkspace ? marketWorkspace.getDiagnostics() : null,
      marketEntry: marketWorkspaceEntry ? marketWorkspaceEntry.getDiagnostics() : null,
      workspaceTabs: workspaceTabs ? workspaceTabs.getDiagnostics() : null,
      settings: settingsController ? settingsController.getDiagnostics() : null,
    }));
  }

  return Object.freeze({
    dispose: dispose,
    ensureArchive: ensureArchive,
    ensureFleet: ensureFleet,
    ensureMarket: ensureMarket,
    ensureSave: ensureSave,
    getCoordinator: getCoordinator,
    getDiagnostics: getDiagnostics,
    hideSettings: hideSettings,
    initialize: initialize,
    invalidate: invalidate,
    navigation: navigation,
    presentEntry: presentEntry,
    refreshMarket: refreshMarket,
    renderAll: renderAll,
    renderFleet: renderFleet,
    reset: reset,
    syncSettings: syncSettings,
    whenSceneReady: whenSceneReady,
  });
}
