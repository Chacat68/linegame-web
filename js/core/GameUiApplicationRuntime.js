// js/core/GameUiApplicationRuntime.js — UI 应用层控制器、工作区与呈现生命周期组合边界

import { createMarketWorkspaceController } from './MarketWorkspaceController.js';
import { createGameUiLifecycleController } from './GameUiLifecycleController.js';
import { buildGameUiApplicationDiagnostics } from './GameUiApplicationDiagnostics.js';
import { createGameUiNavigationPort } from './GameUiNavigationPort.js';
import { createSettingsCommandController } from './SettingsCommandController.js';
import { createSettingsUiController } from './SettingsUiController.js';
import { createGameUiCoordinator } from '../ui/GameUiCoordinator.js';
import { createGameShellProjection } from '../ui/GameShellProjection.js';
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
  var loggers = callbacks.loggers || {};
  var settingsCommands = null;
  var settingsController = null;
  var marketWorkspace = null;
  var marketWorkspaceEntry = null;
  var workspaceTabs = null;
  var coordinator = null;
  var shellProjection = null;
  var lifecycle = null;
  var contextAdapters = null;

  function _logger(name) {
    return typeof loggers[name] === 'function' ? loggers[name] : callbacks.emitLog;
  }

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

  function getSettingsCommands() {
    if (settingsCommands) return settingsCommands;
    settingsCommands = createSettingsCommandController({
      getSettings: callbacks.getSettings,
      getState: getState,
      Renderer: ui.Renderer,
      events: events,
      emitLog: _logger('settings'),
      callbacks: {
        onDifficultyChanged: callbacks.onDifficultyChanged,
        onRealtimeDayDurationChanged: callbacks.onRealtimeDayDurationChanged,
        onResetTutorial: function () {
          if (settingsController) settingsController.hide();
          if (typeof callbacks.onResetTutorial === 'function') return callbacks.onResetTutorial();
        },
        onClearSaves: callbacks.onClearSaves,
      },
    });
    return settingsCommands;
  }

  function getSettingsController() {
    if (settingsController) return settingsController;
    settingsController = createSettingsUiController({
      features: features,
      featureStatus: ui.DeferredFeatureStatusUI,
      getSettings: callbacks.getSettings,
      getSessionToken: getSessionToken,
      isSessionTokenCurrent: isSessionTokenCurrent,
      bindStatusSurfaceDismiss: callbacks.bindSettingsStatusSurfaceDismiss,
      showStatusSurface: callbacks.showSettingsStatusSurface,
      hideSurface: callbacks.hideSettingsSurface,
      callbacks: {
        onOpen: ensureSave,
        onCommand: getSettingsCommands().execute,
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
      emitLog: _logger('commerce'),
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

  function getShellProjection() {
    if (shellProjection) return shellProjection;
    if (ui.ShellProjection) {
      shellProjection = ui.ShellProjection;
      return shellProjection;
    }
    shellProjection = createGameShellProjection({
      interactions: ui.ShellInteractions,
    });
    return shellProjection;
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
        ShellProjection: getShellProjection(),
        LogsUI: ui.LogsUI,
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
        archive: {
          getDispatchContext: function (state) {
            return typeof guidance.getDispatchContext === 'function' ? guidance.getDispatchContext(state) : null;
          },
          handleCommand: actions.archive && actions.archive.handleCommand,
        },
        save: {
          handleCommand: persistence.handleCommand,
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
      emitLog: _logger('persistence'),
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

  // 领域/引导运行时只依赖冻结导航端口；端口内部仍按需读取惰性 owner。
  var navigation = createGameUiNavigationPort({
    getMarketWorkspaceEntry: getMarketWorkspaceEntry,
    getWorkspaceTabs: getWorkspaceTabs,
    uiManager: ui.UIManager,
  });

  function reset() {
    if (marketWorkspace) marketWorkspace.reset();
    if (settingsController) settingsController.reset();
    if (coordinator) coordinator.reset();
    else {
      if (marketWorkspaceEntry) marketWorkspaceEntry.reset();
      if (ui.UIManager && typeof ui.UIManager.resetRuntimeState === 'function') ui.UIManager.resetRuntimeState();
      if (ui.MapUI && typeof ui.MapUI.resetRuntimeState === 'function') ui.MapUI.resetRuntimeState();
      if (ui.LogsUI && typeof ui.LogsUI.resetRuntimeState === 'function') ui.LogsUI.resetRuntimeState();
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
    settingsCommands = null;
    settingsController = null;
    marketWorkspace = null;
    marketWorkspaceEntry = null;
    workspaceTabs = null;
    coordinator = null;
    contextAdapters = null;
    shellProjection = null;
  }

  function getDiagnostics() {
    var coordinatorDiagnostics = coordinator ? coordinator.getDiagnostics() : null;
    var settingsDiagnostics = settingsController ? settingsController.getDiagnostics() : null;
    return buildGameUiApplicationDiagnostics({
      coordinatorDiagnostics: coordinatorDiagnostics,
      contextInspectorDiagnostics: ui.ContextInspector
        && typeof ui.ContextInspector.getDiagnostics === 'function'
        ? ui.ContextInspector.getDiagnostics()
        : null,
      registryDiagnostics: typeof features.getDiagnostics === 'function'
        ? features.getDiagnostics()
        : null,
      presentationDiagnostics: ui.DeferredFeatureStatusUI
        && typeof ui.DeferredFeatureStatusUI.getDiagnostics === 'function'
        ? ui.DeferredFeatureStatusUI.getDiagnostics()
        : null,
      settingsDiagnostics: settingsDiagnostics,
      lifecycleDiagnostics: lifecycle ? lifecycle.getDiagnostics() : null,
      marketDiagnostics: marketWorkspace ? marketWorkspace.getDiagnostics() : null,
      marketEntryDiagnostics: marketWorkspaceEntry ? marketWorkspaceEntry.getDiagnostics() : null,
      navigationDiagnostics: ui.UIManager
        && typeof ui.UIManager.getNavigationSnapshot === 'function'
        ? ui.UIManager.getNavigationSnapshot()
        : null,
      shellProjectionDiagnostics: shellProjection && typeof shellProjection.getDiagnostics === 'function'
        ? shellProjection.getDiagnostics()
        : null,
      surfaceManagerDiagnostics: ui.SurfaceManager
        && typeof ui.SurfaceManager.getDiagnostics === 'function'
        ? ui.SurfaceManager.getDiagnostics()
        : null,
      workspaceDetailDiagnostics: ui.WorkspaceDetailSurface
        && typeof ui.WorkspaceDetailSurface.getSnapshot === 'function'
        ? ui.WorkspaceDetailSurface.getSnapshot()
        : null,
      workspaceSurfaceDiagnostics: ui.UIManager
        && typeof ui.UIManager.getWorkspaceSurfaceSnapshot === 'function'
        ? ui.UIManager.getWorkspaceSurfaceSnapshot()
        : null,
      workspaceTabDiagnostics: workspaceTabs ? workspaceTabs.getDiagnostics() : null,
      settingsCommandDiagnostics: settingsCommands ? settingsCommands.getDiagnostics() : null,
    });
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
    settingsCommands: Object.freeze({
      execute: function (command) { return getSettingsCommands().execute(command); },
    }),
    syncSettings: syncSettings,
    whenSceneReady: whenSceneReady,
  });
}
