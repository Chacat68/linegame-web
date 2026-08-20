// js/ui/GameUiCoordinator.js — 游戏 UI 刷新与按需终端协调器
//
// 该模块不持有游戏状态快照，也不直接 import 任何延迟功能。
// GameManager 通过命名依赖注入状态 provider、feature loader、UI 模块和动作回调。

import { UI_REGION, resolveDirtyRegions } from '../core/ActionPresentation.js';

const FEATURE_NAMES = ['market', 'fleet', 'archive', 'save'];
const MARKET_REGION_NAMES = Object.freeze([
  UI_REGION.MARKET_CHROME,
  UI_REGION.MARKET_SPOT,
  UI_REGION.MARKET_CAPITAL,
  UI_REGION.MARKET_OPERATIONS,
]);
const FLEET_REGION_NAMES = Object.freeze([
  UI_REGION.FLEET_HANGAR,
  UI_REGION.FLEET_SHOP,
]);
const ARCHIVE_REGION_NAMES = Object.freeze([
  UI_REGION.ARCHIVE_QUEST,
  UI_REGION.ARCHIVE_EXPLORATION,
  UI_REGION.ARCHIVE_RESEARCH,
  UI_REGION.ARCHIVE_FACTION,
  UI_REGION.ARCHIVE_ACHIEVEMENT,
]);
const WORKSPACE_RENDER_REGION_NAMES = Object.freeze([].concat(
  MARKET_REGION_NAMES,
  FLEET_REGION_NAMES,
  ARCHIVE_REGION_NAMES,
  [UI_REGION.SAVE]
));

function _createWorkspaceRenderCounts() {
  return WORKSPACE_RENDER_REGION_NAMES.reduce(function (counts, region) {
    counts[region] = 0;
    return counts;
  }, {});
}

function _trackedWorkspaceRegions(regions) {
  var requested = new Set(regions || []);
  return WORKSPACE_RENDER_REGION_NAMES.filter(function (region) { return requested.has(region); });
}

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
  if (group && Object.prototype.hasOwnProperty.call(group, actionName)) {
    return group[actionName];
  }
  return actions && Object.prototype.hasOwnProperty.call(actions, actionName)
    ? actions[actionName]
    : undefined;
}

function _callAction(actions, groupName, actionName, args) {
  var callback = _action(actions, groupName, actionName);
  if (typeof callback !== 'function') return undefined;
  return callback.apply(null, args || []);
}

function _normalizeMarketMode(value) {
  return value === 'black' ? 'black' : 'open';
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
  var renderAllCount = 0;
  var invalidationCount = 0;
  var lastInvalidationRegions = Object.freeze([]);
  var workspaceRenderCounts = _createWorkspaceRenderCounts();
  var lastRenderedWorkspaceRegions = Object.freeze([]);
  var activeWorkspaceRenderTrace = null;

  var HUD = _dependency(ui, 'HUD', 'hud');
  var ShipUI = _dependency(ui, 'ShipUI', 'ship');
  var MapUI = _dependency(ui, 'MapUI', 'map');
  var UIManager = _dependency(ui, 'UIManager', 'uiManager');
  var Renderer = _dependency(ui, 'Renderer3D', 'renderer');
  var ContextAdapters = _dependency(ui, 'ContextAdapters', 'contextAdapters');
  var FeatureStatus = _dependency(ui, 'DeferredFeatureStatusUI', 'featureStatus');
  var Trade = _dependency(systems, 'Trade', 'trade');
  var Dispatch = _dependency(systems, 'Dispatch', 'dispatch');

  function _recordWorkspaceRender(regions) {
    var tracked = _trackedWorkspaceRegions(regions);
    if (tracked.length === 0) return;
    tracked.forEach(function (region) {
      workspaceRenderCounts[region] += 1;
      if (activeWorkspaceRenderTrace && activeWorkspaceRenderTrace.indexOf(region) === -1) {
        activeWorkspaceRenderTrace.push(region);
      }
    });
    if (!activeWorkspaceRenderTrace) {
      lastRenderedWorkspaceRegions = Object.freeze(tracked);
    }
  }

  function _traceWorkspaceRenders(callback) {
    if (activeWorkspaceRenderTrace) return callback();
    activeWorkspaceRenderTrace = [];
    try {
      return callback();
    } finally {
      lastRenderedWorkspaceRegions = Object.freeze(
        _trackedWorkspaceRegions(activeWorkspaceRenderTrace)
      );
      activeWorkspaceRenderTrace = null;
    }
  }

  // HUD is eager and owns the in-memory message history; register its read-only
  // logs adapter once while delayed domain presenters continue to connect on load.
  _call(ContextAdapters, 'connectLogs', [HUD]);

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

  function _createMarketRenderRequest(state) {
    var systemId = _call(MapUI, 'getMarketViewSystem', [state]);
    var galaxyId = _call(MapUI, 'getMarketViewGalaxy', [state]);
    var requestedMode = _callAction(actions, 'market', 'getMode', [state]);
    var mode = _normalizeMarketMode(requestedMode);
    return {
      state: state,
      systemId: systemId || state.currentSystem,
      marketMode: mode,
      galaxyId: galaxyId || state.currentGalaxy,
      onCommand: _action(actions, 'market', 'onCommand'),
    };
  }

  function _afterMarketRender(module, state, mode) {
    _call(ContextAdapters, 'connectMarket', [module]);
    _callAction(actions, 'market', 'onAfterRender', [module, state, mode]);
  }

  function renderMarket(MarketUI, stateOverride) {
    var module = MarketUI || _getLoadedFeature('market');
    var state = arguments.length > 1 ? stateOverride : getState();
    if (!module || !state || typeof module.render !== 'function') return false;
    var request = _createMarketRenderRequest(state);
    module.render(request);
    _afterMarketRender(module, state, request.marketMode);
    _recordWorkspaceRender(MARKET_REGION_NAMES);
    return true;
  }

  function _renderMarketRegions(module, state, regions) {
    if (!module || !state) return false;
    var requested = Array.from(new Set(regions || [])).filter(function (region) {
      return MARKET_REGION_NAMES.indexOf(region) !== -1;
    });
    if (requested.length === 0) return false;
    var request = _createMarketRenderRequest(state);
    var rendered = false;
    var completedRegions = [];

    if (typeof module.renderRegions === 'function') {
      rendered = module.renderRegions(request, requested) !== false;
      if (rendered) completedRegions = requested.slice();
    } else {
      var methodByRegion = {};
      methodByRegion[UI_REGION.MARKET_CHROME] = 'renderChrome';
      methodByRegion[UI_REGION.MARKET_SPOT] = 'renderSpot';
      methodByRegion[UI_REGION.MARKET_CAPITAL] = 'renderCapital';
      methodByRegion[UI_REGION.MARKET_OPERATIONS] = 'renderOperations';
      requested.forEach(function (region) {
        var methodName = methodByRegion[region];
        if (typeof module[methodName] !== 'function') return;
        module[methodName](request);
        completedRegions.push(region);
        rendered = true;
      });
      if (!rendered && typeof module.render === 'function') {
        module.render(request);
        completedRegions = MARKET_REGION_NAMES.slice();
        rendered = true;
      }
    }

    if (rendered) {
      _afterMarketRender(module, state, request.marketMode);
      _recordWorkspaceRender(completedRegions);
    }
    return rendered;
  }

  function renderMarketChrome(MarketUI, stateOverride) {
    var module = MarketUI || _getLoadedFeature('market');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderMarketRegions(module, state, [UI_REGION.MARKET_CHROME]);
  }

  function renderMarketSpot(MarketUI, stateOverride) {
    var module = MarketUI || _getLoadedFeature('market');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderMarketRegions(module, state, [UI_REGION.MARKET_SPOT]);
  }

  function renderMarketCapital(MarketUI, stateOverride) {
    var module = MarketUI || _getLoadedFeature('market');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderMarketRegions(module, state, [UI_REGION.MARKET_CAPITAL]);
  }

  function renderMarketOperations(MarketUI, stateOverride) {
    var module = MarketUI || _getLoadedFeature('market');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderMarketRegions(module, state, [UI_REGION.MARKET_OPERATIONS]);
  }

  function _renderFleetRegions(module, state, regions) {
    if (!module || !state) return false;
    if (typeof module.setLifecycleActions === 'function') {
      module.setLifecycleActions({
        requestRender: function () { return renderFleetHangar(module); },
      });
    }

    var rendered = false;
    var completedRegions = [];
    var onCommand = _action(actions, 'fleet', 'handleCommand');
    var requested = new Set(regions || []);
    if (requested.has(UI_REGION.FLEET_HANGAR) && typeof module.render === 'function') {
      module.render({ state: state, onCommand: onCommand });
      completedRegions.push(UI_REGION.FLEET_HANGAR);
      rendered = true;
    }
    if (requested.has(UI_REGION.FLEET_SHOP) && typeof module.renderShop === 'function') {
      module.renderShop({ state: state, onCommand: onCommand });
      completedRegions.push(UI_REGION.FLEET_SHOP);
      rendered = true;
    }
    _call(ContextAdapters, 'connectFleet', [module]);
    _recordWorkspaceRender(completedRegions);
    return rendered;
  }

  function renderFleetHangar(FleetUI, stateOverride) {
    var module = FleetUI || _getLoadedFeature('fleet');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderFleetRegions(module, state, [UI_REGION.FLEET_HANGAR]);
  }

  function renderFleetShop(FleetUI, stateOverride) {
    var module = FleetUI || _getLoadedFeature('fleet');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderFleetRegions(module, state, [UI_REGION.FLEET_SHOP]);
  }

  function renderFleet(FleetUI, stateOverride) {
    var module = FleetUI || _getLoadedFeature('fleet');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderFleetRegions(module, state, FLEET_REGION_NAMES);
  }

  function _renderArchiveRegions(module, state, regions) {
    if (!module || !state) return false;

    var ResearchUI = module.ResearchUI || module.research;
    var FactionUI = module.FactionUI || module.faction;
    var QuestUI = module.QuestUI || module.quest;
    var ExplorationUI = module.ArchiveExplorationUI || module.exploration;
    var AchievementUI = module.AchievementUI || module.achievement;
    var requested = new Set(regions || []);
    var needsDispatchContext = requested.has(UI_REGION.ARCHIVE_RESEARCH)
      || requested.has(UI_REGION.ARCHIVE_QUEST);
    var dispatchContext = needsDispatchContext
      ? (_callAction(actions, 'archive', 'getDispatchContext', [state]) || null)
      : null;
    var rendered = false;
    var completedRegions = [];

    if (requested.has(UI_REGION.ARCHIVE_RESEARCH) && ResearchUI && typeof ResearchUI.render === 'function') {
      ResearchUI.render(
        state,
        _action(actions, 'archive', 'onStartResearch'),
        _action(actions, 'archive', 'onCancelQueuedResearch'),
        _action(actions, 'archive', 'onMoveQueuedResearchUp'),
        _action(actions, 'archive', 'onMoveQueuedResearchDown'),
        _action(actions, 'archive', 'onClearResearchQueue'),
        dispatchContext,
        _action(actions, 'archive', 'onApplyResearchDispatch'),
        _action(actions, 'archive', 'onResolveResearchBlocker')
      );
      completedRegions.push(UI_REGION.ARCHIVE_RESEARCH);
      rendered = true;
    }
    if (requested.has(UI_REGION.ARCHIVE_FACTION) && FactionUI && typeof FactionUI.render === 'function') {
      FactionUI.render(state, _action(actions, 'archive', 'onOpenFactionMarket'));
      completedRegions.push(UI_REGION.ARCHIVE_FACTION);
      rendered = true;
    }
    if (requested.has(UI_REGION.ARCHIVE_QUEST) && QuestUI && typeof QuestUI.render === 'function') {
      QuestUI.render(
        state,
        _action(actions, 'archive', 'onAcceptQuest'),
        _action(actions, 'archive', 'onAbandonQuest'),
        dispatchContext,
        _action(actions, 'archive', 'onApplyQuestDispatch'),
        _action(actions, 'archive', 'onResolveQuestBlocker')
      );
      completedRegions.push(UI_REGION.ARCHIVE_QUEST);
      rendered = true;
    }
    if (requested.has(UI_REGION.ARCHIVE_EXPLORATION) && ExplorationUI && typeof ExplorationUI.render === 'function') {
      ExplorationUI.render(state);
      completedRegions.push(UI_REGION.ARCHIVE_EXPLORATION);
      rendered = true;
    }
    if (requested.has(UI_REGION.ARCHIVE_ACHIEVEMENT) && AchievementUI && typeof AchievementUI.render === 'function') {
      AchievementUI.render(state);
      completedRegions.push(UI_REGION.ARCHIVE_ACHIEVEMENT);
      rendered = true;
    }
    _call(ContextAdapters, 'connectArchive', [module]);
    _recordWorkspaceRender(completedRegions);
    return rendered;
  }

  function renderArchiveQuest(ArchiveUI, stateOverride) {
    var module = ArchiveUI || _getLoadedFeature('archive');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderArchiveRegions(module, state, [UI_REGION.ARCHIVE_QUEST]);
  }

  function renderArchiveExploration(ArchiveUI, stateOverride) {
    var module = ArchiveUI || _getLoadedFeature('archive');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderArchiveRegions(module, state, [UI_REGION.ARCHIVE_EXPLORATION]);
  }

  function renderArchiveResearch(ArchiveUI, stateOverride) {
    var module = ArchiveUI || _getLoadedFeature('archive');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderArchiveRegions(module, state, [UI_REGION.ARCHIVE_RESEARCH]);
  }

  function renderArchiveFaction(ArchiveUI, stateOverride) {
    var module = ArchiveUI || _getLoadedFeature('archive');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderArchiveRegions(module, state, [UI_REGION.ARCHIVE_FACTION]);
  }

  function renderArchiveAchievement(ArchiveUI, stateOverride) {
    var module = ArchiveUI || _getLoadedFeature('archive');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderArchiveRegions(module, state, [UI_REGION.ARCHIVE_ACHIEVEMENT]);
  }

  function renderArchive(ArchiveUI, stateOverride) {
    var module = ArchiveUI || _getLoadedFeature('archive');
    var state = arguments.length > 1 ? stateOverride : getState();
    return _renderArchiveRegions(module, state, ARCHIVE_REGION_NAMES);
  }

  function renderSave(SaveUI, stateOverride) {
    var module = SaveUI || _getLoadedFeature('save');
    var state = arguments.length > 1 ? stateOverride : getState();
    if (!module || !state || typeof module.render !== 'function') return false;
    module.render(
      _action(actions, 'save', 'onSaveGame'),
      _action(actions, 'save', 'onLoadGame')
    );
    _recordWorkspaceRender([UI_REGION.SAVE]);
    return true;
  }

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
    return _traceWorkspaceRenders(function () {
      renderAllCount += 1;

      var netWorth = _call(Trade, 'getNetWorth', [state]);
      if (!Number.isFinite(netWorth)) netWorth = 0;
      _call(HUD, 'updateStats', [state, netWorth]);
      _call(HUD, 'updateCompanyName', [state]);
      _call(HUD, 'updateArchiveBadges', [state]);

      if (_call(MapUI, 'isMarketOpen', [])) {
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
    if (_call(MapUI, 'isMarketOpen', [])) return 'trade';
    return 'map';
  }

  function invalidate(regions) {
    var state = getState();
    if (!state) return Promise.resolve(null);
    var dirtyRegions = resolveDirtyRegions(regions);
    invalidationCount += 1;
    lastInvalidationRegions = dirtyRegions;
    if (dirtyRegions.indexOf(UI_REGION.ALL) !== -1) return renderAll();

    return _traceWorkspaceRenders(function () {
      var dirty = new Set(dirtyRegions);
      var renderedFeatures = new Set();
      var hasMarketRegions = MARKET_REGION_NAMES.some(function (region) { return dirty.has(region); });
      var hasFleetRegions = FLEET_REGION_NAMES.some(function (region) { return dirty.has(region); });
      var hasArchiveRegions = ARCHIVE_REGION_NAMES.some(function (region) { return dirty.has(region); });
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

      if (dirty.has(UI_REGION.HUD)) {
        var netWorth = _call(Trade, 'getNetWorth', [state]);
        if (!Number.isFinite(netWorth)) netWorth = 0;
        _call(HUD, 'updateStats', [state, netWorth]);
        _call(HUD, 'updateCompanyName', [state]);
        _call(HUD, 'updateArchiveBadges', [state]);
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
          var marketRegions = MARKET_REGION_NAMES.filter(function (region) { return dirty.has(region); });
          _renderMarketRegions(MarketUI, state, marketRegions);
        }
      }

      if (hasFleetRegions && activeWorkspace === 'fleet' && !renderedFeatures.has('fleet')) {
        var FleetUI = _getLoadedFeature('fleet');
        if (FleetUI) {
          var fleetRegions = FLEET_REGION_NAMES.filter(function (region) { return dirty.has(region); });
          _renderFleetRegions(FleetUI, state, fleetRegions);
        }
      }

      if (hasArchiveRegions && activeWorkspace === 'archive' && !renderedFeatures.has('archive')) {
        var ArchiveUI = _getLoadedFeature('archive');
        if (ArchiveUI) {
          var archiveRegions = ARCHIVE_REGION_NAMES.filter(function (region) { return dirty.has(region); });
          _renderArchiveRegions(ArchiveUI, state, archiveRegions);
        }
      }

      if (dirty.has(UI_REGION.SCENE)) _call(Renderer, 'invalidateScene', []);
      if (dirty.has(UI_REGION.CONTEXT)) _call(MapUI, 'refreshPlanetDetail', [state]);
      if (dirty.has(UI_REGION.DISPATCH)) _call(Dispatch, 'updateActiveDispatchUI', []);
      if (dirty.has(UI_REGION.GUIDE)) {
        _callAction(actions, 'global', 'refreshActionGuide', [state]);
      }

      return Promise.resolve(state);
    });
  }

  function dispose() {
    _call(FeatureStatus, 'dispose', []);
  }

  function reset() {
    var MarketUI = _getLoadedFeature('market');
    var FleetUI = _getLoadedFeature('fleet');
    _call(MarketUI, 'resetRuntimeState', []);
    _call(FleetUI, 'resetRuntimeState', []);
    lastInvalidationRegions = Object.freeze([]);
    workspaceRenderCounts = _createWorkspaceRenderCounts();
    lastRenderedWorkspaceRegions = Object.freeze([]);
    return getDiagnostics();
  }

  function getDiagnostics() {
    var MarketUI = _getLoadedFeature('market');
    var FleetUI = _getLoadedFeature('fleet');
    var marketUiDiagnostics = _call(MarketUI, 'getDiagnostics', []) || null;
    var fleetUiDiagnostics = _call(FleetUI, 'getDiagnostics', []) || null;
    return Object.freeze({
      featureStatus: _call(FeatureStatus, 'getDiagnostics', []) || null,
      marketUi: marketUiDiagnostics,
      fleetUi: fleetUiDiagnostics,
      renderAllCount: renderAllCount,
      invalidationCount: invalidationCount,
      lastInvalidationRegions: lastInvalidationRegions,
      workspaceSessions: Object.freeze({
        map: null,
        trade: marketUiDiagnostics,
        fleet: fleetUiDiagnostics,
        archive: null,
        logs: null,
      }),
      workspaceRenders: Object.freeze({
        activeWorkspace: _activeWorkspace(),
        renderCounts: Object.freeze(Object.assign({}, workspaceRenderCounts)),
        lastRenderedRegions: lastRenderedWorkspaceRegions,
      }),
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
