// js/ui/GameUiCoordinator.js — 游戏 UI 刷新、失效路由与按需终端协调器
//
// 该模块不持有游戏状态快照，也不直接 import 任何延迟功能。
// Workspace Renderer 拥有区域投影，Render Session 拥有刷新诊断。

import { UI_REGION, resolveDirtyRegions } from '../core/ActionPresentation.js';
import { createGameUiRenderSession } from './GameUiRenderSession.js';
import {
  ARCHIVE_RENDER_REGIONS,
  createGameUiWorkspaceRenderer,
  FLEET_RENDER_REGIONS,
  MARKET_RENDER_REGIONS,
  WORKSPACE_RENDER_REGIONS,
} from './GameUiWorkspaceRenderer.js';

const FEATURE_NAMES = ['market', 'fleet', 'archive', 'save'];

function _dependency(container, primaryName, fallbackName) {
  if (!container || typeof container !== 'object') return null;
  return container[primaryName] || (fallbackName ? container[fallbackName] : null) || null;
}

function _call(target, methodName, args) {
  if (!target || typeof target[methodName] !== 'function') return undefined;
  return target[methodName].apply(target, args || []);
}

function _action(actions, groupName, actionName) {
  var group = actions && actions[groupName];
  if (group && Object.prototype.hasOwnProperty.call(group, actionName)) return group[actionName];
  return actions && Object.prototype.hasOwnProperty.call(actions, actionName)
    ? actions[actionName]
    : undefined;
}

function _callAction(actions, groupName, actionName, args) {
  var callback = _action(actions, groupName, actionName);
  if (typeof callback !== 'function') return undefined;
  return callback.apply(null, args || []);
}

/**
 * 创建 UI 协调器。
 *
 * actions 推荐按领域命名：
 *   { market: {...}, fleet: {...}, archive: {...}, save: {...}, global: {...} }
 * 为方便渐进迁移，同名顶层 action 也会作为兼容回退。
 */
export function createGameUiCoordinator(options) {
  var config = options || {};
  var getState = typeof config.getState === 'function'
    ? config.getState
    : function () { return null; };
  var features = config.features || {};
  var ui = config.ui || {};
  var systems = config.systems || {};
  var actions = config.actions || {};

  var ShellProjection = _dependency(ui, 'ShellProjection', 'shellProjection');
  var LogsUI = _dependency(ui, 'LogsUI', 'logs');
  var ShipUI = _dependency(ui, 'ShipUI', 'ship');
  var MapUI = _dependency(ui, 'MapUI', 'map');
  var MarketWorkspaceEntry = _dependency(ui, 'MarketWorkspaceEntry', 'marketEntry');
  var MarketWorkspacePort = MarketWorkspaceEntry || MapUI;
  var WorkspaceTabs = _dependency(ui, 'WorkspaceTabs', 'workspaceTabs');
  var WorkspaceTabPort = WorkspaceTabs || MapUI;
  var UIManager = _dependency(ui, 'UIManager', 'uiManager');
  var Renderer = _dependency(ui, 'Renderer3D', 'renderer');
  var ContextAdapters = _dependency(ui, 'ContextAdapters', 'contextAdapters');
  var FeatureStatus = _dependency(ui, 'DeferredFeatureStatusUI', 'featureStatus');
  var Trade = _dependency(systems, 'Trade', 'trade');
  var Dispatch = _dependency(systems, 'Dispatch', 'dispatch');

  function _getLoadedFeature(featureName) {
    if (!featureName) return null;
    if (typeof features.get === 'function') return features.get(featureName) || null;
    if (features.modules && features.modules[featureName]) return features.modules[featureName];
    return features[featureName] || null;
  }

  function getLoaded(featureName) {
    if (featureName) return _getLoadedFeature(featureName);
    return FEATURE_NAMES.reduce(function (loaded, name) {
      loaded[name] = _getLoadedFeature(name);
      return loaded;
    }, {});
  }

  function loadFeature(featureName, retry) {
    var loaded = _getLoadedFeature(featureName);
    if (loaded) _call(FeatureStatus, 'clear', [featureName]);
    else _call(FeatureStatus, 'showLoading', [featureName]);
    return Promise.resolve()
      .then(function () {
        if (typeof features.load === 'function') return features.load(featureName);
        return _getLoadedFeature(featureName);
      })
      .then(function (module) {
        var resolved = module || _getLoadedFeature(featureName);
        if (resolved) _call(FeatureStatus, 'clear', [featureName]);
        else _call(FeatureStatus, 'showError', [featureName, retry]);
        return resolved;
      })
      .catch(function () {
        _call(FeatureStatus, 'showError', [featureName, retry]);
        return null;
      });
  }

  var renderSession = createGameUiRenderSession({ regionNames: WORKSPACE_RENDER_REGIONS });
  var workspaceRenderer = createGameUiWorkspaceRenderer({
    actions: actions,
    contextAdapters: ContextAdapters,
    getLoadedFeature: _getLoadedFeature,
    getState: getState,
    marketWorkspace: MarketWorkspacePort,
    recordRender: renderSession.record,
  });
  var renderArchive = workspaceRenderer.renderArchive;
  var renderArchiveAchievement = workspaceRenderer.renderArchiveAchievement;
  var renderArchiveExploration = workspaceRenderer.renderArchiveExploration;
  var renderArchiveFaction = workspaceRenderer.renderArchiveFaction;
  var renderArchiveQuest = workspaceRenderer.renderArchiveQuest;
  var renderArchiveResearch = workspaceRenderer.renderArchiveResearch;
  var renderFleet = workspaceRenderer.renderFleet;
  var renderFleetHangar = workspaceRenderer.renderFleetHangar;
  var renderFleetShop = workspaceRenderer.renderFleetShop;
  var renderMarket = workspaceRenderer.renderMarket;
  var renderMarketCapital = workspaceRenderer.renderMarketCapital;
  var renderMarketChrome = workspaceRenderer.renderMarketChrome;
  var renderMarketOperations = workspaceRenderer.renderMarketOperations;
  var renderMarketSpot = workspaceRenderer.renderMarketSpot;
  var renderSave = workspaceRenderer.renderSave;

  // Logs UI is eager; delayed domain adapters continue to connect after each render.
  _call(ContextAdapters, 'connectLogs', [LogsUI]);

  function _ensure(featureName, render) {
    function attempt() {
      return loadFeature(featureName, attempt).then(function (module) {
        if (module) render(module);
        return module;
      });
    }
    return attempt();
  }

  function ensureMarket() {
    return _ensure('market', function (module) { renderMarket(module); });
  }

  function ensureFleet() {
    return _ensure('fleet', function (module) { renderFleet(module); });
  }

  function ensureArchive() {
    return _ensure('archive', function (module) { renderArchive(module); });
  }

  function ensureSave() {
    return _ensure('save', function (module) { renderSave(module); });
  }

  function renderAll() {
    var state = getState();
    if (!state) return Promise.resolve(null);
    return renderSession.trace(function () {
      renderSession.recordRenderAll();
      var netWorth = _call(Trade, 'getNetWorth', [state]);
      if (!Number.isFinite(netWorth)) netWorth = 0;
      _call(ShellProjection, 'render', [state, netWorth]);

      if (_call(MarketWorkspacePort, 'isOpen', []) || _call(MarketWorkspacePort, 'isMarketOpen', [])) {
        var MarketUI = _getLoadedFeature('market');
        if (MarketUI) renderMarket(MarketUI, state);
      }

      _call(ShipUI, 'renderShipStats', [state]);
      var ArchiveUI = _getLoadedFeature('archive');
      var FleetUI = _getLoadedFeature('fleet');
      var SaveUI = _getLoadedFeature('save');
      if (ArchiveUI) renderArchive(ArchiveUI, state);
      if (FleetUI) renderFleet(FleetUI, state);
      if (SaveUI) renderSave(SaveUI, state);

      _call(Renderer, 'invalidateScene', []);
      _call(MapUI, 'refreshPlanetDetail', [state]);
      _call(Dispatch, 'updateActiveDispatchUI', []);
      _callAction(actions, 'global', 'refreshActionGuide', [state]);
      return Promise.resolve(state);
    });
  }

  function _activeWorkspace() {
    var snapshot = _call(UIManager, 'getNavigationSnapshot', []);
    if (snapshot && typeof snapshot.activeWorkspace === 'string') return snapshot.activeWorkspace;
    if (_call(MarketWorkspacePort, 'isOpen', []) || _call(MarketWorkspacePort, 'isMarketOpen', [])) return 'trade';
    return 'map';
  }

  function invalidate(regions) {
    var state = getState();
    if (!state) return Promise.resolve(null);
    var dirtyRegions = resolveDirtyRegions(regions);
    renderSession.recordInvalidation(dirtyRegions);
    if (dirtyRegions.indexOf(UI_REGION.ALL) !== -1) return renderAll();

    return renderSession.trace(function () {
      var dirty = new Set(dirtyRegions);
      var renderedFeatures = new Set();
      var hasMarketRegions = MARKET_RENDER_REGIONS.some(function (region) { return dirty.has(region); });
      var hasFleetRegions = FLEET_RENDER_REGIONS.some(function (region) { return dirty.has(region); });
      var hasArchiveRegions = ARCHIVE_RENDER_REGIONS.some(function (region) { return dirty.has(region); });
      var activeWorkspace = dirty.has(UI_REGION.ACTIVE_WORKSPACE) || hasMarketRegions || hasFleetRegions || hasArchiveRegions
        ? _activeWorkspace()
        : null;

      function renderFeature(featureName) {
        if (renderedFeatures.has(featureName)) return false;
        renderedFeatures.add(featureName);
        var module = _getLoadedFeature(featureName);
        if (!module) return false;
        if (featureName === 'market') return renderMarket(module, state);
        if (featureName === 'fleet') return renderFleet(module, state);
        if (featureName === 'archive') return renderArchive(module, state);
        if (featureName === 'save') return renderSave(module, state);
        return false;
      }

      if (dirty.has(UI_REGION.SHELL)) {
        var netWorth = _call(Trade, 'getNetWorth', [state]);
        if (!Number.isFinite(netWorth)) netWorth = 0;
        _call(ShellProjection, 'render', [state, netWorth]);
      }
      if (dirty.has(UI_REGION.SHIP)) _call(ShipUI, 'renderShipStats', [state]);

      if (dirty.has(UI_REGION.ACTIVE_WORKSPACE)) {
        if (activeWorkspace === 'trade' && !hasMarketRegions) renderFeature('market');
        else if (activeWorkspace === 'fleet' && !hasFleetRegions) renderFeature('fleet');
        else if (activeWorkspace === 'archive' && !hasArchiveRegions) renderFeature('archive');
      }
      if (dirty.has(UI_REGION.MARKET)) renderFeature('market');
      if (dirty.has(UI_REGION.FLEET)) renderFeature('fleet');
      if (dirty.has(UI_REGION.ARCHIVE)) renderFeature('archive');
      if (dirty.has(UI_REGION.SAVE)) renderFeature('save');

      if (hasMarketRegions && activeWorkspace === 'trade' && !renderedFeatures.has('market')) {
        var MarketUI = _getLoadedFeature('market');
        if (MarketUI) {
          workspaceRenderer.renderMarketRegions(
            MarketUI,
            state,
            MARKET_RENDER_REGIONS.filter(function (region) { return dirty.has(region); })
          );
        }
      }
      if (hasFleetRegions && activeWorkspace === 'fleet' && !renderedFeatures.has('fleet')) {
        var FleetUI = _getLoadedFeature('fleet');
        if (FleetUI) {
          workspaceRenderer.renderFleetRegions(
            FleetUI,
            state,
            FLEET_RENDER_REGIONS.filter(function (region) { return dirty.has(region); })
          );
        }
      }
      if (hasArchiveRegions && activeWorkspace === 'archive' && !renderedFeatures.has('archive')) {
        var ArchiveUI = _getLoadedFeature('archive');
        if (ArchiveUI) {
          workspaceRenderer.renderArchiveRegions(
            ArchiveUI,
            state,
            ARCHIVE_RENDER_REGIONS.filter(function (region) { return dirty.has(region); })
          );
        }
      }

      if (dirty.has(UI_REGION.SCENE)) _call(Renderer, 'invalidateScene', []);
      if (dirty.has(UI_REGION.CONTEXT)) _call(MapUI, 'refreshPlanetDetail', [state]);
      if (dirty.has(UI_REGION.DISPATCH)) _call(Dispatch, 'updateActiveDispatchUI', []);
      if (dirty.has(UI_REGION.GUIDE)) _callAction(actions, 'global', 'refreshActionGuide', [state]);
      return Promise.resolve(state);
    });
  }

  function dispose() {
    _call(FeatureStatus, 'dispose', []);
  }

  function reset() {
    var MarketUI = _getLoadedFeature('market');
    var FleetUI = _getLoadedFeature('fleet');
    var ArchiveUI = _getLoadedFeature('archive');
    var SaveUI = _getLoadedFeature('save');
    _call(UIManager, 'resetRuntimeState', []);
    _call(MarketWorkspaceEntry, 'reset', []);
    _call(MapUI, 'resetRuntimeState', []);
    _call(LogsUI, 'resetRuntimeState', []);
    _call(MarketUI, 'resetRuntimeState', []);
    _call(FleetUI, 'resetRuntimeState', []);
    _call(ArchiveUI, 'resetRuntimeState', []);
    _call(SaveUI, 'resetRuntimeState', []);
    renderSession.resetWorkspaceTracking();
    return getDiagnostics();
  }

  function getDiagnostics() {
    var MarketUI = _getLoadedFeature('market');
    var FleetUI = _getLoadedFeature('fleet');
    var ArchiveUI = _getLoadedFeature('archive');
    var SaveUI = _getLoadedFeature('save');
    var marketUiDiagnostics = _call(MarketUI, 'getDiagnostics', []) || null;
    var marketEntryDiagnostics = _call(MarketWorkspaceEntry, 'getDiagnostics', []) || null;
    var fleetUiDiagnostics = _call(FleetUI, 'getDiagnostics', []) || null;
    var archiveModuleDiagnostics = _call(ArchiveUI, 'getDiagnostics', []) || null;
    var archiveUiDiagnostics = archiveModuleDiagnostics
      ? Object.freeze(Object.assign({
          activeTab: _call(WorkspaceTabPort, 'getActive', ['info'])
            || _call(WorkspaceTabPort, 'getActiveArchiveTab', [])
            || null,
        }, archiveModuleDiagnostics))
      : null;
    var mapUiDiagnostics = _call(MapUI, 'getDiagnostics', []) || null;
    var logsUiDiagnostics = _call(LogsUI, 'getDiagnostics', []) || null;
    var saveUiDiagnostics = _call(SaveUI, 'getDiagnostics', []) || null;
    var renderDiagnostics = renderSession.getSnapshot(_activeWorkspace());
    return Object.freeze({
      marketUi: marketUiDiagnostics,
      marketEntry: marketEntryDiagnostics,
      fleetUi: fleetUiDiagnostics,
      archiveUi: archiveUiDiagnostics,
      saveUi: saveUiDiagnostics,
      mapUi: mapUiDiagnostics,
      logsUi: logsUiDiagnostics,
      renderAllCount: renderDiagnostics.renderAllCount,
      invalidationCount: renderDiagnostics.invalidationCount,
      lastInvalidationRegions: renderDiagnostics.lastInvalidationRegions,
      workspaceSessions: Object.freeze({
        map: mapUiDiagnostics,
        trade: Object.freeze({ entry: marketEntryDiagnostics, content: marketUiDiagnostics }),
        fleet: fleetUiDiagnostics,
        archive: archiveUiDiagnostics,
        logs: logsUiDiagnostics,
      }),
      workspaceRenders: renderDiagnostics.workspaceRenders,
    });
  }

  return {
    dispose: dispose,
    ensureArchive: ensureArchive,
    ensureFleet: ensureFleet,
    ensureMarket: ensureMarket,
    ensureSave: ensureSave,
    getDiagnostics: getDiagnostics,
    getLoaded: getLoaded,
    invalidate: invalidate,
    loadFeature: loadFeature,
    reset: reset,
    renderAll: renderAll,
    renderArchive: renderArchive,
    renderArchiveAchievement: renderArchiveAchievement,
    renderArchiveExploration: renderArchiveExploration,
    renderArchiveFaction: renderArchiveFaction,
    renderArchiveQuest: renderArchiveQuest,
    renderArchiveResearch: renderArchiveResearch,
    renderFleet: renderFleet,
    renderFleetHangar: renderFleetHangar,
    renderFleetShop: renderFleetShop,
    renderMarket: renderMarket,
    renderMarketCapital: renderMarketCapital,
    renderMarketChrome: renderMarketChrome,
    renderMarketOperations: renderMarketOperations,
    renderMarketSpot: renderMarketSpot,
    renderSave: renderSave,
  };
}
