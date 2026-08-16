// js/ui/GameUiCoordinator.js — 游戏 UI 刷新与按需终端协调器
//
// 该模块不持有游戏状态快照，也不直接 import 任何延迟功能。
// GameManager 通过命名依赖注入状态 provider、feature loader、UI 模块和动作回调。

import { UI_REGION, normalizeDirtyRegions } from '../core/ActionPresentation.js';

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

  var HUD = _dependency(ui, 'HUD', 'hud');
  var ShipUI = _dependency(ui, 'ShipUI', 'ship');
  var MapUI = _dependency(ui, 'MapUI', 'map');
  var UIManager = _dependency(ui, 'UIManager', 'uiManager');
  var Renderer = _dependency(ui, 'Renderer3D', 'renderer');
  var ContextAdapters = _dependency(ui, 'ContextAdapters', 'contextAdapters');
  var Trade = _dependency(systems, 'Trade', 'trade');
  var Dispatch = _dependency(systems, 'Dispatch', 'dispatch');

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

  function _loadFeature(featureName) {
    return Promise.resolve()
      .then(function () {
        if (typeof features.load === 'function') return features.load(featureName);
        return _getLoadedFeature(featureName);
      })
      .then(function (module) {
        return module || _getLoadedFeature(featureName);
      })
      .catch(function () {
        // 错误呈现属于 feature loader 的责任；协调器保持空依赖安全。
        return null;
      });
  }

  function renderMarket(MarketUI, stateOverride) {
    var module = MarketUI || _getLoadedFeature('market');
    var state = arguments.length > 1 ? stateOverride : getState();
    if (!module || !state || typeof module.render !== 'function') return false;

    var systemId = _call(MapUI, 'getMarketViewSystem', [state]);
    var galaxyId = _call(MapUI, 'getMarketViewGalaxy', [state]);
    var requestedMode = _callAction(actions, 'market', 'getMode', [state]);
    var mode = _normalizeMarketMode(requestedMode);
    var financeActions = _action(actions, 'market', 'financeActions') || {};
    var getFinanceActions = _action(actions, 'market', 'getFinanceActions');
    if (typeof getFinanceActions === 'function') {
      financeActions = getFinanceActions(state) || {};
    }

    module.render(
      state,
      _action(actions, 'market', 'onOpenBuy'),
      _action(actions, 'market', 'onOpenSell'),
      _action(actions, 'market', 'onRefuel'),
      systemId || state.currentSystem,
      mode,
      galaxyId || state.currentGalaxy,
      _action(actions, 'market', 'onBlackMarketBuy'),
      _action(actions, 'market', 'onBlackMarketSell'),
      financeActions
    );
    _call(ContextAdapters, 'connectMarket', [module]);
    _callAction(actions, 'market', 'onAfterRender', [module, state, mode]);
    return true;
  }

  function renderFleet(FleetUI, stateOverride) {
    var module = FleetUI || _getLoadedFeature('fleet');
    var state = arguments.length > 1 ? stateOverride : getState();
    if (!module || !state) return false;

    var rendered = false;
    if (typeof module.render === 'function') {
      module.render(
        state,
        _action(actions, 'fleet', 'onBuyShip'),
        _action(actions, 'fleet', 'onSwitchShip'),
        _action(actions, 'fleet', 'onUpgradeShip'),
        _action(actions, 'fleet', 'onAssignRoute'),
        _action(actions, 'fleet', 'onCancelRoute'),
        _action(actions, 'fleet', 'onBuySlot'),
        _action(actions, 'fleet', 'onSellShip'),
        _action(actions, 'fleet', 'onInstallMod'),
        _action(actions, 'fleet', 'onUninstallMod'),
        _action(actions, 'fleet', 'onServiceShip'),
        _action(actions, 'fleet', 'onRecruitCrew'),
        _action(actions, 'fleet', 'onAssignCrew'),
        _action(actions, 'fleet', 'onUnassignCrew'),
        _action(actions, 'fleet', 'onDismissCrew')
      );
      rendered = true;
    }
    if (typeof module.renderShop === 'function') {
      module.renderShop(state, _action(actions, 'fleet', 'onBuyShip'));
      rendered = true;
    }
    _call(ContextAdapters, 'connectFleet', [module]);
    return rendered;
  }

  function renderArchive(ArchiveUI, stateOverride) {
    var module = ArchiveUI || _getLoadedFeature('archive');
    var state = arguments.length > 1 ? stateOverride : getState();
    if (!module || !state) return false;

    var ResearchUI = module.ResearchUI || module.research;
    var FactionUI = module.FactionUI || module.faction;
    var QuestUI = module.QuestUI || module.quest;
    var ExplorationUI = module.ArchiveExplorationUI || module.exploration;
    var AchievementUI = module.AchievementUI || module.achievement;
    var dispatchContext = _callAction(actions, 'archive', 'getDispatchContext', [state]) || null;
    var rendered = false;

    if (ResearchUI && typeof ResearchUI.render === 'function') {
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
      rendered = true;
    }
    if (FactionUI && typeof FactionUI.render === 'function') {
      FactionUI.render(state, _action(actions, 'archive', 'onOpenFactionMarket'));
      rendered = true;
    }
    if (QuestUI && typeof QuestUI.render === 'function') {
      QuestUI.render(
        state,
        _action(actions, 'archive', 'onAcceptQuest'),
        _action(actions, 'archive', 'onAbandonQuest'),
        dispatchContext,
        _action(actions, 'archive', 'onApplyQuestDispatch'),
        _action(actions, 'archive', 'onResolveQuestBlocker')
      );
      rendered = true;
    }
    if (ExplorationUI && typeof ExplorationUI.render === 'function') {
      ExplorationUI.render(state);
      rendered = true;
    }
    if (AchievementUI && typeof AchievementUI.render === 'function') {
      AchievementUI.render(state);
      rendered = true;
    }
    _call(ContextAdapters, 'connectArchive', [module]);
    return rendered;
  }

  function renderSave(SaveUI, stateOverride) {
    var module = SaveUI || _getLoadedFeature('save');
    var state = arguments.length > 1 ? stateOverride : getState();
    if (!module || !state || typeof module.render !== 'function') return false;
    module.render(
      _action(actions, 'save', 'onSaveGame'),
      _action(actions, 'save', 'onLoadGame')
    );
    return true;
  }

  function _ensure(featureName, render) {
    return _loadFeature(featureName).then(function (module) {
      if (module) render(module);
      return module;
    });
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
    var dirtyRegions = normalizeDirtyRegions(regions, UI_REGION.ALL);
    invalidationCount += 1;
    lastInvalidationRegions = dirtyRegions;
    if (dirtyRegions.indexOf(UI_REGION.ALL) !== -1) return renderAll();

    var dirty = new Set(dirtyRegions);
    var renderedFeatures = new Set();

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
      var activeWorkspace = _activeWorkspace();
      if (activeWorkspace === 'trade') renderFeature('market');
      else if (activeWorkspace === 'fleet') renderFeature('fleet');
      else if (activeWorkspace === 'archive') renderFeature('archive');
    }
    if (dirty.has(UI_REGION.MARKET)) renderFeature('market');
    if (dirty.has(UI_REGION.FLEET)) renderFeature('fleet');
    if (dirty.has(UI_REGION.ARCHIVE)) renderFeature('archive');
    if (dirty.has(UI_REGION.SAVE)) renderFeature('save');

    if (dirty.has(UI_REGION.SCENE)) _call(Renderer, 'invalidateScene', []);
    if (dirty.has(UI_REGION.CONTEXT)) _call(MapUI, 'refreshPlanetDetail', [state]);
    if (dirty.has(UI_REGION.DISPATCH)) _call(Dispatch, 'updateActiveDispatchUI', []);
    if (dirty.has(UI_REGION.GUIDE)) {
      _callAction(actions, 'global', 'refreshActionGuide', [state]);
    }

    return Promise.resolve(state);
  }

  function getDiagnostics() {
    return Object.freeze({
      renderAllCount: renderAllCount,
      invalidationCount: invalidationCount,
      lastInvalidationRegions: lastInvalidationRegions,
    });
  }

  return {
    ensureArchive: ensureArchive,
    ensureFleet: ensureFleet,
    ensureMarket: ensureMarket,
    ensureSave: ensureSave,
    getDiagnostics: getDiagnostics,
    getLoaded: getLoaded,
    invalidate: invalidate,
    renderAll: renderAll,
    renderArchive: renderArchive,
    renderFleet: renderFleet,
    renderMarket: renderMarket,
    renderSave: renderSave,
  };
}
