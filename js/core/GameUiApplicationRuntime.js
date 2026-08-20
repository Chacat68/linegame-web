// js/core/GameUiApplicationRuntime.js — UI 应用层控制器、工作区与呈现生命周期组合边界

import { createMarketWorkspaceController } from './MarketWorkspaceController.js';
import { createGameUiLifecycleController } from './GameUiLifecycleController.js';
import { createSettingsUiController } from './SettingsUiController.js';
import { createGameUiCoordinator } from '../ui/GameUiCoordinator.js';
import { createWorkspaceContextAdapters } from '../ui/WorkspaceContextAdapters.js';

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
        openMarket: ui.MapUI.openMarket,
        closeMarket: ui.MapUI.closeMarket,
        isMarketOpen: ui.MapUI.isMarketOpen,
        ensureFleet: ensureFleet,
        openQuests: ui.MapUI.openQuestsPanel,
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
        refreshMarket: refreshMarket,
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

  function reset() {
    if (marketWorkspace) marketWorkspace.reset();
    if (coordinator) coordinator.reset();
    else {
      var MarketUI = typeof features.get === 'function' ? features.get('market') : null;
      if (MarketUI && typeof MarketUI.resetRuntimeState === 'function') MarketUI.resetRuntimeState();
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
    if (coordinator) coordinator.dispose();
    else if (ui.DeferredFeatureStatusUI && typeof ui.DeferredFeatureStatusUI.dispose === 'function') {
      ui.DeferredFeatureStatusUI.dispose();
    }
    if (contextAdapters) contextAdapters.dispose();
    if (lifecycle) lifecycle.dispose();
    else if (settingsController) settingsController.dispose();
    if (marketWorkspace) marketWorkspace.dispose();
    if (ui.ContextInspector && typeof ui.ContextInspector.dispose === 'function') {
      ui.ContextInspector.dispose();
    }
    lifecycle = null;
    settingsController = null;
    marketWorkspace = null;
    coordinator = null;
    contextAdapters = null;
  }

  function getDiagnostics() {
    var coordinatorDiagnostics = coordinator ? coordinator.getDiagnostics() : null;
    return Object.freeze(Object.assign({}, coordinatorDiagnostics || {}, {
      coordinator: coordinatorDiagnostics,
      lifecycle: lifecycle ? lifecycle.getDiagnostics() : null,
      market: marketWorkspace ? marketWorkspace.getDiagnostics() : null,
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
    presentEntry: presentEntry,
    refreshMarket: refreshMarket,
    renderAll: renderAll,
    renderFleet: renderFleet,
    reset: reset,
    syncSettings: syncSettings,
    whenSceneReady: whenSceneReady,
  });
}
