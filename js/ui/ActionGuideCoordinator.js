// js/ui/ActionGuideCoordinator.js — 唯一 Command Slot 的上下文聚合与呈现协调器
//
// 该模块始终从 getState() 读取当前会话，不持有游戏状态快照，也不修改领域状态。
// 延迟功能到达后会使用最新 state 重新派生建议，避免旧 session 的异步结果污染 UI。

function _noop() {}

function _hasOwnEntries(value) {
  return !!(value && typeof value === 'object' && Object.keys(value).length > 0);
}

export function shouldLoadAdvancedCommerce(state) {
  if (!state) return false;
  if (Number(state.companyLevel || 1) >= 2) return true;
  if (_hasOwnEntries(state.tradeStations) || _hasOwnEntries(state.stockPortfolio) || _hasOwnEntries(state.tradeInvestments)) return true;
  if (Array.isArray(state.loans) && state.loans.length > 0) return true;
  if (Array.isArray(state.futuresContracts) && state.futuresContracts.length > 0) return true;
  if (_hasOwnEntries(state.insurancePolicies)) return true;
  return Array.isArray(state.insuranceClaims) && state.insuranceClaims.length > 0;
}

export function shouldLoadRouteGuidance(state) {
  if (!state) return false;
  if (Number(state.companyLevel || 1) >= 2 || Number(state.playerLevel || 1) >= 2) return true;
  if (Array.isArray(state.completedQuests) && state.completedQuests.indexOf('starter_first_trade') !== -1) return true;
  if (Array.isArray(state.researchQueue) && state.researchQueue.length > 0) return true;
  return !!(state.activeResearch || state.currentResearch);
}

function _call(target, methodName, args, fallback) {
  if (!target || typeof target[methodName] !== 'function') return fallback;
  return target[methodName].apply(target, args || []);
}

function _getNextGuidancePoi(GalaxyData, systemId) {
  var planetData = systemId ? _call(GalaxyData, 'getPlanetData', [systemId], null) : null;
  var exploration = planetData && planetData.exploration;
  if (!exploration || !Array.isArray(exploration.pois)) return null;

  return exploration.pois.filter(function (poi) {
    return poi && !poi.resolved;
  }).map(function (poi) {
    return {
      id: poi.id,
      poiId: poi.id,
      icon: poi.icon || '',
      name: poi.name || '探索点',
      chainKind: poi.chain && poi.chain.kind ? poi.chain.kind : '',
      chainLabel: poi.chain && poi.chain.label ? poi.chain.label : '',
    };
  })[0] || null;
}

export function createActionGuideCoordinator(options) {
  var config = options || {};
  var getState = typeof config.getState === 'function' ? config.getState : function () { return null; };
  var features = config.features || {};
  var ui = config.ui || {};
  var systems = config.systems || {};
  var selectors = config.selectors || {};
  var hooks = config.hooks || {};

  var ActionGuideUI = ui.ActionGuideUI || {};
  var MapUI = ui.MapUI || {};
  var UIManager = ui.UIManager || {};
  var EventUI = ui.EventUI || {};
  var Guidance = systems.Guidance || {};
  var Tutorial = systems.Tutorial || {};
  var Fleet = systems.Fleet || {};
  var GalaxyData = systems.GalaxyData || {};
  var Exploration = systems.Exploration || {};
  var MidgameTeachingChain = systems.MidgameTeachingChain || {};
  var getResearchDispatchBlockerState = typeof selectors.getResearchDispatchBlockerState === 'function'
    ? selectors.getResearchDispatchBlockerState
    : function () { return null; };
  var getPoiStatus = typeof selectors.getPoiStatus === 'function'
    ? selectors.getPoiStatus
    : function () { return null; };
  var hasBlockingSurfaceOpen = typeof selectors.hasBlockingSurfaceOpen === 'function'
    ? selectors.hasBlockingSurfaceOpen
    : function () { return false; };
  var onAction = typeof hooks.onAction === 'function' ? hooks.onAction : _noop;

  var initialized = false;
  var disposed = false;
  var requestGeneration = 0;
  var pendingFeatures = new Map();
  var recentModInstallContext = null;
  var refreshCount = 0;
  var lastSuggestion = null;
  var lastContext = null;

  function _getFeature(featureName) {
    if (typeof features.get === 'function') return features.get(featureName) || null;
    return features[featureName] || null;
  }

  function _requestFeature(featureName) {
    var loaded = _getFeature(featureName);
    if (loaded) return Promise.resolve(loaded);
    if (pendingFeatures.has(featureName)) return pendingFeatures.get(featureName);
    if (typeof features.load !== 'function') return Promise.resolve(null);

    var generation = requestGeneration;
    var request = Promise.resolve()
      .then(function () { return features.load(featureName); })
      .then(function (module) {
        if (pendingFeatures.get(featureName) === request) pendingFeatures.delete(featureName);
        if (!module || disposed || generation !== requestGeneration) return module || null;
        if (initialized) refresh();
        return module;
      })
      .catch(function () {
        if (pendingFeatures.get(featureName) === request) pendingFeatures.delete(featureName);
        return null;
      });
    pendingFeatures.set(featureName, request);
    return request;
  }

  function prefetchForState(stateOverride) {
    var state = arguments.length > 0 ? stateOverride : getState();
    if (!state) return Promise.resolve([]);
    var requests = [];
    if (shouldLoadAdvancedCommerce(state) && !_getFeature('advancedGuidance')) {
      requests.push(_requestFeature('advancedGuidance'));
    }
    if (shouldLoadRouteGuidance(state) && !_getFeature('routeGuidance')) {
      requests.push(_requestFeature('routeGuidance'));
    }
    return Promise.all(requests);
  }

  function getDispatchContext(stateOverride) {
    var state = arguments.length > 0 ? stateOverride : getState();
    if (!state) return null;
    var activeShip = _call(Fleet, 'getActiveShip', [state], null);
    var activeShipStats = _call(Fleet, 'getEffectiveShipStats', [state, activeShip], {}) || {};
    var cargo = activeShip && activeShip.cargo && typeof activeShip.cargo === 'object'
      ? activeShip.cargo
      : {};
    var cargoUsed = Object.values(cargo).reduce(function (sum, quantity) {
      var value = Number(quantity);
      return sum + (Number.isFinite(value) ? Math.max(0, value) : 0);
    }, 0);
    return {
      currentSystem: state.currentSystem,
      currentGalaxy: state.currentGalaxy || 'milky_way',
      fuelEfficiency: Number(activeShipStats.fuelEff || 0),
      cargoFree: Math.max(0, Number(activeShipStats.maxCargo || 0) - cargoUsed),
      credits: state.credits,
      playerLevel: state.playerLevel || 1,
      dispatchProfile: activeShipStats.dispatchProfile || null,
    };
  }

  function _getServiceStatus(state) {
    var activeShipIndex = Number.isInteger(state.activeShipIndex) ? state.activeShipIndex : 0;
    var activeShip = _call(Fleet, 'getActiveShip', [state], null);
    if (!activeShip) return null;
    var repairQuote = _call(Fleet, 'getShipRepairQuote', [state, activeShipIndex], null);
    var maintenance = _call(Fleet, 'getShipMaintenanceSummary', [state, activeShip], null);
    var maxHull = Number(activeShip.maxHull || activeShip.hull || 0);
    var hull = Number(activeShip.hull || maxHull || 0);
    return {
      shipIndex: activeShipIndex,
      repairQuote: repairQuote,
      hullRatio: maxHull > 0 ? Math.max(0, Math.min(1, hull / maxHull)) : 1,
      maintenance: maintenance,
      maintenanceValue: maintenance ? maintenance.value : 100,
      maintenanceBand: maintenance ? maintenance.band : 'pristine',
    };
  }

  function _getMarketFocus(state, marketOpen) {
    if (!marketOpen) return null;
    var MarketUI = _getFeature('market');
    var focus = _call(MarketUI, 'getActiveMarketWorkspaceFocus', [], {}) || {};
    return Object.assign({}, focus, {
      systemId: _call(MapUI, 'getMarketViewSystem', [state], null) || state.currentSystem || '',
    });
  }

  function _isArchiveOpen() {
    var navigation = _call(UIManager, 'getNavigationSnapshot', [], null);
    if (navigation) return navigation.activeWorkspace === 'archive';
    return _call(UIManager, 'getCurrentView', [], '') === 'quests';
  }

  function _deriveContext(state) {
    var tutorialActive = !!_call(Tutorial, 'isActive', [], false);
    var blockingModalOpen = !!hasBlockingSurfaceOpen();
    var pendingEvent = _call(EventUI, 'getPendingEvent', [], null);
    var nextPoi = state.currentSystem ? _getNextGuidancePoi(GalaxyData, state.currentSystem) : null;
    var nextPoiStatus = nextPoi ? getPoiStatus(state.currentSystem, nextPoi.poiId) : null;
    var surveyIntel = state.currentSystem
      ? _call(Exploration, 'getSurveyDecisionIntel', [state, state.currentSystem], null)
      : null;
    var researchSupplyRoute = null;
    var questRouteRecommendation = null;
    var researchBlocker = null;
    var dispatchRouteRecommendation = null;
    var serviceStatus = null;
    var modRecommendation = null;

    if (!tutorialActive && !blockingModalOpen) {
      var dispatchContext = getDispatchContext(state);
      var RouteGuidance = _getFeature('routeGuidance');
      var activeTeachingChain = _call(MidgameTeachingChain, 'getActiveChain', [state], null);
      var dispatchTeachingActive = !!(
        activeTeachingChain && activeTeachingChain.chain && activeTeachingChain.chain.id === 'dispatch-ops'
      );

      if (shouldLoadAdvancedCommerce(state) && !_getFeature('advancedGuidance')) _requestFeature('advancedGuidance');
      if (shouldLoadRouteGuidance(state) && !RouteGuidance) _requestFeature('routeGuidance');

      if (RouteGuidance) {
        questRouteRecommendation = _call(RouteGuidance, 'findQuestRoute', [state, dispatchContext], null);
        if (!questRouteRecommendation) {
          researchSupplyRoute = _call(RouteGuidance, 'findResearchSupplyRoute', [state, dispatchContext], null);
        }
      }
      if (!questRouteRecommendation && !researchSupplyRoute) {
        researchBlocker = getResearchDispatchBlockerState(state, dispatchContext);
      }
      if (!questRouteRecommendation && (!researchSupplyRoute || dispatchTeachingActive) && RouteGuidance) {
        dispatchRouteRecommendation = _call(RouteGuidance, 'findBestDispatchRoute', [state, dispatchContext], null);
      }
      serviceStatus = _getServiceStatus(state);
      modRecommendation = _call(Fleet, 'getShipModRecommendation', [state, state.activeShipIndex || 0], null);
    }

    var marketOpen = !!_call(MapUI, 'isMarketOpen', [], false);
    var FleetUI = _getFeature('fleet');
    return {
      marketOpen: marketOpen,
      marketFocus: _getMarketFocus(state, marketOpen),
      archiveOpen: _isArchiveOpen(),
      archiveTab: _call(MapUI, 'getActiveArchiveTab', [], null),
      nextPoi: nextPoi,
      nextPoiStatus: nextPoiStatus,
      researchSupplyRoute: researchSupplyRoute,
      questRouteRecommendation: questRouteRecommendation,
      researchBlocker: researchBlocker,
      dispatchRouteRecommendation: dispatchRouteRecommendation,
      serviceStatus: serviceStatus,
      modRecommendation: modRecommendation,
      modModalContext: _call(FleetUI, 'getActiveModModalContext', [], null),
      dispatchModalContext: _call(FleetUI, 'getActiveDispatchModalContext', [], null),
      recentModInstallContext: recentModInstallContext,
      surveyIntel: surveyIntel,
      tutorialActive: tutorialActive,
      blockingModalOpen: blockingModalOpen,
      eventPending: !!pendingEvent,
      pendingEvent: pendingEvent,
    };
  }

  function init() {
    disposed = false;
    initialized = true;
    _call(ActionGuideUI, 'init', [onAction]);
    return refresh();
  }

  function refresh() {
    if (disposed) return null;
    var state = getState();
    refreshCount += 1;
    if (!state) {
      lastContext = null;
      lastSuggestion = null;
      _call(ActionGuideUI, 'render', [null]);
      return null;
    }

    var consumedModContext = recentModInstallContext;
    var context = _deriveContext(state);
    var suggestion = _call(Guidance, 'getCurrentSuggestion', [state, context], null);
    _call(ActionGuideUI, 'render', [suggestion]);
    lastContext = context;
    lastSuggestion = suggestion;
    if (consumedModContext && recentModInstallContext === consumedModContext) recentModInstallContext = null;
    return suggestion;
  }

  function setRecentModInstallContext(context) {
    recentModInstallContext = context || null;
  }

  function showProcessing(suggestion, message) {
    return _call(ActionGuideUI, 'showProcessing', [suggestion, message]);
  }

  function showCompletion(message, detail, optionsOverride) {
    return _call(ActionGuideUI, 'showCompletion', [message, detail, optionsOverride]);
  }

  function reset() {
    requestGeneration += 1;
    pendingFeatures.clear();
    recentModInstallContext = null;
    lastContext = null;
    lastSuggestion = null;
    _call(ActionGuideUI, 'render', [null]);
  }

  function dispose() {
    disposed = true;
    initialized = false;
    reset();
    _call(ActionGuideUI, 'dispose', []);
  }

  function getDiagnostics() {
    return Object.freeze({
      initialized: initialized,
      disposed: disposed,
      refreshCount: refreshCount,
      pendingFeatures: Object.freeze(Array.from(pendingFeatures.keys())),
      hasRecentModInstallContext: !!recentModInstallContext,
      lastSuggestion: lastSuggestion,
      lastContext: lastContext,
    });
  }

  return Object.freeze({
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    getDispatchContext: getDispatchContext,
    init: init,
    prefetchForState: prefetchForState,
    refresh: refresh,
    reset: reset,
    setRecentModInstallContext: setRecentModInstallContext,
    showCompletion: showCompletion,
    showProcessing: showProcessing,
  });
}
