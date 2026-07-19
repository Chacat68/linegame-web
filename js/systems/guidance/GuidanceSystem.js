import { GOODS } from '../../data/goods.js';
import { SYSTEMS, findSystem, getAccessibleSystems } from '../../data/systems.js';
import * as Quest from '../quest/QuestSystem.js';

const FIRST_TRADE_QUEST_ID = 'starter_first_trade';
const FIRST_EXPLORE_QUEST_ID = 'starter_visit_2';
const LOW_PRICE_THRESHOLD = 0.85;
const LOW_FUEL_RATIO = 0.25;
let _advancedGuidanceProvider = null;

export function setAdvancedGuidanceProvider(provider) {
  _advancedGuidanceProvider = typeof provider === 'function' ? provider : null;
}

export const GUIDANCE_PRIORITY_BANDS = {
  critical: { id: 'critical', label: '先处理问题', minPriority: 90 },
  core: { id: 'core', label: '当前主线', minPriority: 50 },
  recovery: { id: 'recovery', label: '整备恢复', minPriority: 34 },
  midgame: { id: 'midgame', label: '进阶经营', minPriority: 19 },
  ambient: { id: 'ambient', label: '可选机会', minPriority: 0 },
};

export const GUIDANCE_TOPICS = {
  starterTrade: { id: 'starter-trade', label: '贸易入门', stageLabel: '入门' },
  starterExplore: { id: 'starter-explore', label: '探索入门', stageLabel: '入门' },
  stability: { id: 'stability', label: '补给与维修', stageLabel: '先处理' },
  researchSupply: { id: 'research-supply', label: '科研补给', stageLabel: '进阶' },
  dispatchOps: { id: 'dispatch-ops', label: '自动跑商', stageLabel: '进阶' },
  surveyIntel: { id: 'survey-intel', label: '探索线索', stageLabel: '进阶' },
  tradeNetwork: { id: 'trade-network', label: '贸易站发展', stageLabel: '进阶' },
  capitalRisk: { id: 'capital-risk', label: '贷款管理', stageLabel: '进阶' },
  companyGrowth: { id: 'company-growth', label: '公司成长', stageLabel: '长期目标' },
};
const BLOCKING_SUGGESTION_IDS = new Set([
  'handle-pending-event',
  'refuel-low-tank',
]);
const CORE_LOOP_SUGGESTION_IDS = new Set([
  'accept-first-trade',
  'buy-low-price-good',
  'open-market-for-first-trade',
  'sell-first-cargo',
  'find-sell-destination',
  'accept-first-explore',
]);
const RECOVERY_SUGGESTION_IDS = new Set([
  'service-active-ship',
  'fund-ship-service',
  'resolve-research-funding',
]);

function _hasCargo(state) {
  return _getCargoEntries(state).length > 0;
}

function _getCargoEntries(state) {
  if (!state || !state.cargo) return [];
  return Object.keys(state.cargo).filter(function (goodId) {
    return Number(state.cargo[goodId] || 0) > 0;
  }).map(function (goodId) {
    return {
      goodId: goodId,
      quantity: Number(state.cargo[goodId] || 0),
    };
  });
}

function _findQuestById(quests, questId) {
  return (quests || []).find(function (quest) {
    return quest && quest.id === questId;
  }) || null;
}

function _isQuestCompleted(state, questId) {
  return !!(state && Array.isArray(state.completedQuests) && state.completedQuests.includes(questId));
}

function _getAvailableQuest(state, questId) {
  return _findQuestById(Quest.getAvailableQuests(state), questId);
}

function _getActiveQuest(state, questId) {
  return _findQuestById(Quest.getActiveQuests(state), questId);
}

function _getGoodName(goodId) {
  var good = GOODS.find(function (item) { return item.id === goodId; });
  return good ? good.name : goodId;
}

function _getCurrentSystem(state) {
  return findSystem(state && state.currentSystem);
}

function _getLowPriceGood(state) {
  var system = _getCurrentSystem(state);
  if (!system || !system.prices) return null;

  return GOODS.filter(function (good) {
    if (good.id === 'fuel') return false;
    var multiplier = Number(system.prices[good.id] || 1);
    return multiplier > 0 && multiplier <= LOW_PRICE_THRESHOLD;
  }).sort(function (left, right) {
    return (system.prices[left.id] || 1) - (system.prices[right.id] || 1);
  }).map(function (good) {
    return {
      goodId: good.id,
      goodName: good.name,
      priceSignal: system.prices[good.id],
    };
  })[0] || null;
}

function _getPrimaryCargoEntry(state) {
  return _getCargoEntries(state).sort(function (left, right) {
    return right.quantity - left.quantity;
  })[0] || null;
}

function _isCurrentSystemGoodForSelling(state, goodId) {
  var system = _getCurrentSystem(state);
  if (!system || !system.prices || !goodId) return false;
  return Number(system.prices[goodId] || 1) >= 1;
}

function _findBestSellDestination(state, goodId) {
  if (!state || !goodId) return null;
  var systems = getAccessibleSystems(
    state.currentGalaxy || 'milky_way',
    state.playerLevel || 1,
    state.researchedTechs || []
  );
  if (!systems || systems.length === 0) systems = SYSTEMS;

  return systems.filter(function (system) {
    return system && system.id !== state.currentSystem && system.prices && system.prices[goodId];
  }).sort(function (left, right) {
    return (right.prices[goodId] || 1) - (left.prices[goodId] || 1);
  })[0] || null;
}

function _shouldOfferPoi(nextPoiStatus, nextPoi) {
  if (!nextPoiStatus || !nextPoi) return false;
  return nextPoiStatus.canExplore !== false;
}

function _shouldOfferRefuel(state) {
  if (!state) return false;
  var maxFuel = Number(state.maxFuel || 0);
  var fuel = Number(state.fuel || 0);
  if (!Number.isFinite(maxFuel) || maxFuel <= 0) return false;
  if (!Number.isFinite(fuel) || fuel < 0) fuel = 0;
  if (fuel >= maxFuel) return false;
  if (Number(state.credits || 0) <= 0) return false;
  return fuel / maxFuel <= LOW_FUEL_RATIO;
}

function _getFuelNeeded(state) {
  return Math.max(0, Math.ceil(Number(state.maxFuel || 0) - Number(state.fuel || 0)));
}

function _getPoiName(nextPoi) {
  if (!nextPoi) return '探索点';
  var icon = nextPoi.icon ? (nextPoi.icon + ' ') : '';
  return icon + (nextPoi.name || '探索点');
}

function _getPoiChainReason(nextPoi) {
  if (!nextPoi || !nextPoi.chainKind) {
    return '调查结论会写入探索报告，并可能影响交易、航线或研究。';
  }
  if (nextPoi.chainKind === 'ancient_relic') {
    return '古代遗迹样本可推进科研，并帮助安排后续科研补给与自动跑商。';
  }
  if (nextPoi.chainKind === 'lost_beacon') {
    return '失落航标可能重启隐藏航线，降低后续旅行和自动跑商的燃料压力。';
  }
  if (nextPoi.chainKind === 'derelict_depot') {
    return '废弃补给站可恢复补给信息，帮助判断贸易站经营方式和自动跑商维护需求。';
  }
  return '调查结论会写入探索报告，并可能影响交易、航线或研究。';
}

function _shouldOfferResearchSupply(researchSupplyRoute) {
  return !!(
    researchSupplyRoute &&
    researchSupplyRoute.buySystemId &&
    researchSupplyRoute.sellSystemId &&
    researchSupplyRoute.goodId
  );
}

function _shouldOfferResearchFunding(researchBlocker) {
  return !!(researchBlocker && researchBlocker.reasonId === 'credits');
}

function _shouldOfferDispatchRoute(dispatchRouteRecommendation) {
  return !!(
    dispatchRouteRecommendation &&
    dispatchRouteRecommendation.buySystemId &&
    dispatchRouteRecommendation.sellSystemId &&
    dispatchRouteRecommendation.goodId
  );
}

function _getDispatchRouteReason(dispatchRouteRecommendation) {
  if (!dispatchRouteRecommendation) return '当前已有可执行商运路线，可先带入机库确认跑商设置。';
  var routeText = (dispatchRouteRecommendation.buySystemName || dispatchRouteRecommendation.buySystemId || '买入地') +
    ' → ' +
    (dispatchRouteRecommendation.sellSystemName || dispatchRouteRecommendation.sellSystemId || '卖出地');
  var parts = [
    routeText + ' 的 ' + (dispatchRouteRecommendation.goodName || dispatchRouteRecommendation.goodId || '商品') + '路线可执行。',
  ];
  if (dispatchRouteRecommendation.strategySummary) parts.push(dispatchRouteRecommendation.strategySummary);
  if (dispatchRouteRecommendation.surveyIntelSummary) parts.push(dispatchRouteRecommendation.surveyIntelSummary);
  return parts.slice(0, 3).join(' ');
}

function _isRouteRecommendationOpen(recommendation, dispatchModalContext) {
  if (!_shouldOfferDispatchRoute(recommendation) || !dispatchModalContext) return false;
  return dispatchModalContext.buySystemId === recommendation.buySystemId
    && dispatchModalContext.sellSystemId === recommendation.sellSystemId
    && dispatchModalContext.goodId === recommendation.goodId;
}

function _shouldOfferRepair(serviceStatus) {
  if (!serviceStatus || !serviceStatus.repairQuote) return false;
  var quote = serviceStatus.repairQuote;
  if (quote.disabledReason) return false;
  var hullRatio = Number.isFinite(serviceStatus.hullRatio) ? serviceStatus.hullRatio : 1;
  return (quote.faultCount || 0) > 0 || hullRatio <= 0.75 || _hasMaintenancePressure(serviceStatus);
}

function _shouldOfferRepairFunding(serviceStatus) {
  return !!(
    serviceStatus &&
    serviceStatus.repairQuote &&
    serviceStatus.repairQuote.disabledReason === '积分不足'
  );
}

function _getServiceMaintenanceValue(serviceStatus) {
  if (!serviceStatus) return 100;
  if (Number.isFinite(serviceStatus.maintenanceValue)) return Math.max(0, Math.min(100, serviceStatus.maintenanceValue));
  if (serviceStatus.maintenance && Number.isFinite(serviceStatus.maintenance.value)) {
    return Math.max(0, Math.min(100, serviceStatus.maintenance.value));
  }
  return 100;
}

function _hasMaintenancePressure(serviceStatus) {
  var value = _getServiceMaintenanceValue(serviceStatus);
  var band = serviceStatus && serviceStatus.maintenanceBand
    ? serviceStatus.maintenanceBand
    : (serviceStatus && serviceStatus.maintenance ? serviceStatus.maintenance.band : '');
  return value <= 50 || band === 'worn' || band === 'critical';
}

function _getRepairSuggestionReason(serviceStatus) {
  var quote = serviceStatus && serviceStatus.repairQuote ? serviceStatus.repairQuote : {};
  var hullRatio = Number.isFinite(serviceStatus && serviceStatus.hullRatio) ? serviceStatus.hullRatio : 1;
  if (_hasMaintenancePressure(serviceStatus) && (quote.faultCount || 0) <= 0 && hullRatio > 0.75) {
    return '当前飞船维护度已降至 ' + Math.round(_getServiceMaintenanceValue(serviceStatus)) + '%，先入坞维修可避免燃耗、事件和自动跑商稳定性继续恶化。';
  }
  return '当前船况已影响自动跑商和航行稳定性，先进入机库确认维修方案。';
}

function _shouldOfferModRecommendation(modRecommendation) {
  return !!(
    modRecommendation &&
    modRecommendation.canInstall &&
    modRecommendation.modId &&
    modRecommendation.mod
  );
}

function _isModRecommendationOpen(modRecommendation, modModalContext) {
  if (!_shouldOfferModRecommendation(modRecommendation) || !modModalContext) return false;
  if (modModalContext.shipIndex !== modRecommendation.shipIndex) return false;
  return modModalContext.recommendedModId === modRecommendation.modId
    || modModalContext.focusModId === modRecommendation.modId;
}

function _wasModRecentlyInstalled(modRecommendation, recentModInstallContext) {
  if (!_shouldOfferModRecommendation(modRecommendation) || !recentModInstallContext) return false;
  return recentModInstallContext.shipIndex === modRecommendation.shipIndex;
}

function _shouldOfferSurveyIntel(surveyIntel) {
  return !!(
    surveyIntel &&
    surveyIntel.hasIntel &&
    (surveyIntel.marketSignal || surveyIntel.researchSignal || surveyIntel.routeSignal || surveyIntel.logisticsSignal)
  );
}

function _shouldOfferSurveyChainFollowup(surveyIntel) {
  return !!(
    surveyIntel &&
    surveyIntel.hasIntel &&
    surveyIntel.nextChainFollowup &&
    surveyIntel.nextChainFollowup.chainId &&
    (surveyIntel.readyFollowupCount || 0) > 0
  );
}

function _getSurveyIntelReason(surveyIntel) {
  if (!surveyIntel) return '探索报告已经归档，先查看它对交易和跑商的影响。';
  if (surveyIntel.nextChainFollowup && surveyIntel.nextChainFollowup.reason) return surveyIntel.nextChainFollowup.reason;
  if (surveyIntel.beaconSignal) return '失落航标已写入隐藏航线图，可用于后续航线和自动跑商。';
  if (surveyIntel.relicSignal) return '古代遗迹样本已经归档，可用于判断后续研究补给方向。';
  if (surveyIntel.depotSignal) return '废弃补给站已经复原，可用于后续自动跑商和商网经营。';
  if (surveyIntel.marketSignal) return '探索报告发现了交易机会，先查看行情再决定买卖或建站。';
  if (surveyIntel.routeSignal) return '探索报告包含隐藏航线，可用于后续航行和跑商。';
  if (surveyIntel.researchSignal) return '探索报告包含研究样本，可帮助选择后续研究。';
  if (surveyIntel.logisticsSignal) return '探索报告指出补给点，可用于后续跑商和贸易站经营。';
  return '探索报告已经归档，先查看它对交易和跑商的影响。';
}

function _getPriorityBand(suggestion) {
  var id = suggestion && suggestion.id ? suggestion.id : '';
  if (BLOCKING_SUGGESTION_IDS.has(id)) return GUIDANCE_PRIORITY_BANDS.critical;
  if (CORE_LOOP_SUGGESTION_IDS.has(id)) return GUIDANCE_PRIORITY_BANDS.core;
  if (RECOVERY_SUGGESTION_IDS.has(id)) return GUIDANCE_PRIORITY_BANDS.recovery;

  var value = Number(suggestion && suggestion.priority || 0);
  if (value >= GUIDANCE_PRIORITY_BANDS.critical.minPriority) return GUIDANCE_PRIORITY_BANDS.critical;
  if (value >= GUIDANCE_PRIORITY_BANDS.core.minPriority) return GUIDANCE_PRIORITY_BANDS.core;
  if (value >= GUIDANCE_PRIORITY_BANDS.recovery.minPriority) return GUIDANCE_PRIORITY_BANDS.recovery;
  if (value >= GUIDANCE_PRIORITY_BANDS.midgame.minPriority) return GUIDANCE_PRIORITY_BANDS.midgame;
  return GUIDANCE_PRIORITY_BANDS.ambient;
}

function _getTopic(topicKey, stepLabel) {
  var topic = GUIDANCE_TOPICS[topicKey] || null;
  if (!topic) return null;
  return Object.assign({}, topic, {
    stepLabel: stepLabel || '',
  });
}

function _inferGuidanceTopic(suggestion) {
  var id = suggestion && suggestion.id ? suggestion.id : '';
  var actionType = suggestion && suggestion.actionType ? suggestion.actionType : '';

  if (id === 'accept-first-trade') return _getTopic('starterTrade', '领取任务');
  if (id === 'buy-low-price-good' || id === 'open-market-for-first-trade') return _getTopic('starterTrade', '买入货物');
  if (id === 'sell-first-cargo' || id === 'find-sell-destination') return _getTopic('starterTrade', '完成结算');
  if (id === 'accept-first-explore') return _getTopic('starterExplore', '接入探索');
  if (id === 'explore-current-poi') return _getTopic('starterExplore', '调查探索点');

  if (id === 'handle-pending-event') return _getTopic('stability', '处理事件');
  if (id === 'refuel-low-tank') return _getTopic('stability', '燃料补给');
  if (id === 'service-active-ship') return _getTopic('stability', '维修整备');
  if (id === 'fund-ship-service') return _getTopic('stability', '资金周转');

  if (id === 'prefill-research-supply-dispatch') return _getTopic('researchSupply', '自动补给');
  if (id === 'resolve-research-funding') return _getTopic('researchSupply', '筹措垫资');

  if (id === 'prefill-profitable-dispatch') return _getTopic('dispatchOps', '预填商运');
  if (id === 'install-recommended-ship-mod') return _getTopic('dispatchOps', '强化舰船');

  if (id === 'review-survey-chain-followup') return _getTopic('surveyIntel', '跟进连续任务');
  if (id === 'review-survey-market-intel') return _getTopic('surveyIntel', '查看线索');

  if (id === 'build-trade-station') return _getTopic('tradeNetwork', '新建贸易站');
  if (id === 'upgrade-trade-station') return _getTopic('tradeNetwork', '升级贸易站');
  if (id === 'batch-upgrade-trade-stations') return _getTopic('tradeNetwork', '批量升级');
  if (id === 'batch-invest-trade-stations') return _getTopic('tradeNetwork', '追加投资');
  if (id === 'batch-hire-trade-station-manager') return _getTopic('tradeNetwork', '批量派驻');
  if (id === 'batch-set-trade-station-strategy') return _getTopic('tradeNetwork', '同步经营方式');

  if (id === 'review-loan-obligation') return _getTopic('capitalRisk', '贷款复核');

  return null;
}

function _decorateSuggestion(suggestion) {
  var next = Object.assign({}, suggestion || {});
  var band = _getPriorityBand(next);
  next.priorityBand = next.priorityBand || band.id;
  next.priorityBandLabel = next.priorityBandLabel || band.label;
  if (!next.guidanceTopic) {
    next.guidanceTopic = _inferGuidanceTopic(next);
  }
  return next;
}

function _createSuggestion(config) {
  return _decorateSuggestion(Object.assign({
    id: '',
    priority: 0,
    title: '',
    reason: '',
    actionLabel: '',
    actionType: '',
    payload: {},
    surface: 'system',
    target: null,
  }, config || {}));
}

function _normalizeTargetValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _inferSuggestionTarget(suggestion) {
  if (!suggestion || suggestion.target === false) return null;
  if (suggestion.target && suggestion.target.surface) return suggestion.target;

  if (suggestion.actionType === 'market.open' || suggestion.actionType === 'market.focus') {
    var payload = suggestion.payload || {};
    var workspaceId = _normalizeTargetValue(payload.workspaceId) || 'spot';
    var subworkspaceId = _normalizeTargetValue(payload.subworkspaceId) || 'trade';
    var target = {
      surface: 'market',
      workspaceId: workspaceId,
      subworkspaceId: subworkspaceId,
    };
    if (workspaceId === 'spot' && subworkspaceId === 'intel' && payload.systemId) {
      target.systemId = _normalizeTargetValue(payload.systemId);
    }
    return target;
  }

  return null;
}

function _getActiveMarketTarget(state, options) {
  var opts = options || {};
  if (!opts.marketOpen) return null;

  var marketFocus = opts.marketFocus || opts.activeMarketFocus || null;
  var workspaceId = marketFocus ? _normalizeTargetValue(marketFocus.workspaceId) : '';
  var subworkspaceId = marketFocus ? _normalizeTargetValue(marketFocus.subworkspaceId) : '';
  var systemId = marketFocus ? _normalizeTargetValue(marketFocus.systemId) : '';
  var hasSpecificFocus = !!(workspaceId || subworkspaceId || systemId);

  return {
    surface: 'market',
    workspaceId: workspaceId,
    subworkspaceId: subworkspaceId,
    systemId: systemId || _normalizeTargetValue(opts.marketSystemId) || _normalizeTargetValue(state && state.currentSystem),
    hasSpecificFocus: hasSpecificFocus,
  };
}

function _targetFieldMatches(targetValue, activeValue) {
  if (!targetValue) return true;
  if (!activeValue) return false;
  return targetValue === activeValue;
}

function _isMarketTargetSatisfied(target, state, options) {
  var activeTarget = _getActiveMarketTarget(state, options);
  if (!activeTarget) return false;

  // Older callers may only know that the market is open. Treat that as a
  // broad satisfied market target, while precise callers can match tabs.
  if (!activeTarget.hasSpecificFocus) return true;

  return _targetFieldMatches(target.workspaceId, activeTarget.workspaceId) &&
    _targetFieldMatches(target.subworkspaceId, activeTarget.subworkspaceId) &&
    _targetFieldMatches(target.systemId, activeTarget.systemId);
}

function _isSuggestionTargetSatisfied(suggestion, state, options) {
  var target = _inferSuggestionTarget(suggestion);
  if (!target || !target.surface) return false;
  if (target.surface === 'market') return _isMarketTargetSatisfied(target, state, options);
  return false;
}

function _filterSatisfiedTargets(suggestions, state, options) {
  return (suggestions || []).filter(function (suggestion) {
    return !_isSuggestionTargetSatisfied(suggestion, state, options);
  });
}

export function getCurrentSuggestion(state, options) {
  if (!state) return null;

  var opts = options || {};
  if (opts.tutorialActive || opts.blockingModalOpen) return null;

  var activeQuests = Quest.getActiveQuests(state);
  var firstTradeActive = _getActiveQuest(state, FIRST_TRADE_QUEST_ID);
  var firstTradeAvailable = _getAvailableQuest(state, FIRST_TRADE_QUEST_ID);
  var firstExploreAvailable = _getAvailableQuest(state, FIRST_EXPLORE_QUEST_ID);
  var lowPriceGood = _getLowPriceGood(state);
  var suggestions = [];

  if (opts.eventPending) {
    suggestions.push(_createSuggestion({
      id: 'handle-pending-event',
      priority: 110,
      title: '处理待处理事件',
      reason: '这个事件会暂停航行和其他操作，先处理完再继续当前路线。',
      actionLabel: '查看事件',
      actionType: 'event.open',
      payload: {},
      surface: 'system',
    }));
  }

  if (activeQuests.length === 0 && firstTradeAvailable && !_isQuestCompleted(state, FIRST_TRADE_QUEST_ID)) {
    var hasCompletedTutorialTrade = (state.tradeCount || 0) > 0;
    suggestions.push(_createSuggestion({
      id: 'accept-first-trade',
      priority: 100,
      title: hasCompletedTutorialTrade ? '登记首轮交易' : '接取「初次交易」',
      reason: hasCompletedTutorialTrade
        ? '刚完成的市场交易已满足委托，登记后会立即结算首单奖励。'
        : '完成第一笔买卖，建立基础贸易节奏。',
      actionLabel: hasCompletedTutorialTrade ? '登记并结算' : '接取任务',
      actionType: 'quest.accept',
      payload: { questId: FIRST_TRADE_QUEST_ID },
      surface: 'quest',
    }));
  }

  if (_shouldOfferRefuel(state)) {
    var fuelNeeded = _getFuelNeeded(state);
    suggestions.push(_createSuggestion({
      id: 'refuel-low-tank',
      priority: 95,
      title: '补足当前燃料',
      reason: '燃料已低于安全线，先补给可以避免下一段航行无法出发。',
      actionLabel: '补充燃料',
      actionType: 'trade.refuel',
      payload: {
        fuelNeeded: fuelNeeded,
        workspaceId: 'spot',
        subworkspaceId: 'trade',
      },
      surface: 'market',
    }));
  }

  if (_shouldOfferRepair(opts.serviceStatus)) {
    suggestions.push(_createSuggestion({
      id: 'service-active-ship',
      priority: 58,
      title: '安排激活飞船维修',
      reason: _getRepairSuggestionReason(opts.serviceStatus),
      actionLabel: '打开机库',
      actionType: 'fleet.service.open',
      payload: {
        shipIndex: opts.serviceStatus.shipIndex || 0,
        repairCost: opts.serviceStatus.repairQuote.cost || 0,
        maintenanceValue: _getServiceMaintenanceValue(opts.serviceStatus),
      },
      surface: 'fleet',
    }));
  } else if (_shouldOfferRepairFunding(opts.serviceStatus)) {
    suggestions.push(_createSuggestion({
      id: 'fund-ship-service',
      priority: 35,
      title: '筹措维修资金',
      reason: '激活飞船需要维修但积分不足，先做一笔周转再回机库。',
      actionLabel: '打开市场',
      actionType: 'market.open',
      payload: {
        workspaceId: 'spot',
        subworkspaceId: 'trade',
      },
      surface: 'market',
      commandIntent: '买卖货物',
    }));
  }

  if (firstTradeActive && !_hasCargo(state) && lowPriceGood) {
    suggestions.push(_createSuggestion({
      id: 'buy-low-price-good',
      priority: 90,
      title: '买入「' + lowPriceGood.goodName + '」',
      reason: '当前价格偏低，适合打开确认单买入并推进交易目标。',
      actionLabel: '确认买入',
      actionType: 'trade.buy',
      payload: {
        goodId: lowPriceGood.goodId,
        marketType: 'open',
        tradeAction: 'buy',
        questName: firstTradeActive.name || '初次交易',
      },
      surface: 'market',
    }));
  }

  if (firstTradeActive && !_hasCargo(state) && !lowPriceGood && !opts.marketOpen) {
    suggestions.push(_createSuggestion({
      id: 'open-market-for-first-trade',
      priority: 88,
      title: '打开当前市场',
      reason: '当前暂无明确低价货，先查看市场再选择买入目标。',
      actionLabel: '打开市场',
      actionType: 'market.open',
      payload: { workspaceId: 'spot', subworkspaceId: 'trade' },
      surface: 'market',
    }));
  }

  var cargoEntry = _getPrimaryCargoEntry(state);
  if (cargoEntry) {
    var goodName = _getGoodName(cargoEntry.goodId);
    if (_isCurrentSystemGoodForSelling(state, cargoEntry.goodId)) {
      suggestions.push(_createSuggestion({
        id: 'sell-first-cargo',
        priority: 70,
        title: '卖出「' + goodName + '」',
        reason: '打开确认单卖出已有货物，完成第一笔交易。',
        actionLabel: '确认卖出',
        actionType: 'trade.sell',
        payload: {
          goodId: cargoEntry.goodId,
          marketType: 'open',
          tradeAction: 'sell',
          questName: firstTradeActive ? (firstTradeActive.name || '初次交易') : '',
        },
        surface: 'market',
      }));
    } else {
      var destination = _findBestSellDestination(state, cargoEntry.goodId);
      var canDirectTravel = !!destination && !opts.eventPending;
      suggestions.push(_createSuggestion({
        id: 'find-sell-destination',
        priority: 60,
        title: destination ? ('前往「' + destination.name + '」卖货') : '寻找卖出目的地',
        reason: opts.eventPending
          ? '先找一个更好的卖货点；当前有待处理事件，处理后再起航。'
          : '选择需求更高的星球，获得更好利润。',
        actionLabel: canDirectTravel ? '直接前往' : (destination ? '查找卖货点' : '查看星图'),
        actionType: canDirectTravel ? 'travel.execute' : 'map.focus',
        payload: {
          goodId: cargoEntry.goodId,
          destinationSystemId: destination ? destination.id : '',
          destinationSystemName: destination ? destination.name : '',
        },
        surface: 'navigation',
      }));
    }
  }

  if (activeQuests.length === 0 && _isQuestCompleted(state, FIRST_TRADE_QUEST_ID) && firstExploreAvailable) {
    suggestions.push(_createSuggestion({
      id: 'accept-first-explore',
      priority: 50,
      title: '接取「初探宇宙」',
      reason: '贸易循环已建立，可以开始学习航行与地表探索。',
      actionLabel: '接取任务',
      actionType: 'quest.accept',
      payload: { questId: FIRST_EXPLORE_QUEST_ID },
      surface: 'quest',
    }));
  }

  if (_shouldOfferResearchSupply(opts.researchSupplyRoute) && !_isRouteRecommendationOpen(opts.researchSupplyRoute, opts.dispatchModalContext)) {
    suggestions.push(_createSuggestion({
      id: 'prefill-research-supply-dispatch',
      priority: 24,
      title: '规划科研自动补给',
      reason: '当前研究已有可执行补给路线，可交给当前飞船自动完成。',
      actionLabel: '带入机库',
      actionType: 'fleet.dispatch.prefill',
      payload: {
        sourceLabel: '科研补给建议',
        recommendation: opts.researchSupplyRoute,
      },
      surface: 'fleet',
    }));
  } else if (_shouldOfferResearchFunding(opts.researchBlocker)) {
    suggestions.push(_createSuggestion({
      id: 'resolve-research-funding',
      priority: 34,
      title: '补足科研补给资金',
      reason: '当前研究方向缺少进货垫资，先打开市场做一笔周转。',
      actionLabel: '打开市场',
      actionType: 'market.open',
      payload: {
        workspaceId: 'spot',
        subworkspaceId: 'trade',
      },
      surface: 'market',
      commandIntent: '买卖货物',
    }));
  }

  if (!_shouldOfferResearchSupply(opts.researchSupplyRoute) && _shouldOfferDispatchRoute(opts.dispatchRouteRecommendation) && !_isRouteRecommendationOpen(opts.dispatchRouteRecommendation, opts.dispatchModalContext)) {
    suggestions.push(_createSuggestion({
      id: 'prefill-profitable-dispatch',
      priority: 23,
      title: '规划「' + (opts.dispatchRouteRecommendation.goodName || opts.dispatchRouteRecommendation.goodId || '商品') + '」自动跑商',
      reason: _getDispatchRouteReason(opts.dispatchRouteRecommendation),
      actionLabel: '带入机库',
      actionType: 'fleet.dispatch.prefill',
      payload: {
        sourceLabel: '跑商路线建议',
        recommendation: opts.dispatchRouteRecommendation,
      },
      surface: 'fleet',
    }));
  }

  if (_shouldOfferSurveyChainFollowup(opts.surveyIntel)) {
    var chainFollowup = opts.surveyIntel.nextChainFollowup || {};
    suggestions.push(_createSuggestion({
      id: 'review-survey-chain-followup',
      priority: 37,
      title: '跟进「' + (chainFollowup.chainLabel || '探索链') + '」',
      reason: chainFollowup.reason || _getSurveyIntelReason(opts.surveyIntel),
      actionLabel: chainFollowup.actionLabel || '查看情报',
      actionType: 'market.open',
      payload: {
        workspaceId: chainFollowup.workspaceId || 'spot',
        subworkspaceId: chainFollowup.subworkspaceId || 'intel',
        systemId: opts.surveyIntel.systemId || state.currentSystem,
        intelSignal: chainFollowup.signal || opts.surveyIntel.primarySignal || '',
        chainId: chainFollowup.chainId || '',
        chainKind: chainFollowup.chainKind || '',
        chainLabel: chainFollowup.chainLabel || '',
      },
      surface: 'market',
      commandIntent: chainFollowup.chainKind === 'derelict_depot' ? '连续任务经营' : '连续任务线索',
    }));
  } else if (_shouldOfferSurveyIntel(opts.surveyIntel)) {
    suggestions.push(_createSuggestion({
      id: 'review-survey-market-intel',
      priority: 32,
      title: '查看「' + (opts.surveyIntel.recentReportTitle || '探索报告') + '」',
      reason: _getSurveyIntelReason(opts.surveyIntel),
      actionLabel: '查看行情',
      actionType: 'market.open',
      payload: {
        workspaceId: 'spot',
        subworkspaceId: 'intel',
        systemId: opts.surveyIntel.systemId || state.currentSystem,
        intelSignal: opts.surveyIntel.primarySignal || '',
      },
      surface: 'market',
      commandIntent: '行情与路线',
    }));
  }

  var advancedSuggestions = Array.isArray(opts.advancedSuggestions)
    ? opts.advancedSuggestions
    : (_advancedGuidanceProvider ? _advancedGuidanceProvider(state) : []);
  advancedSuggestions.forEach(function (suggestion) {
    if (suggestion) suggestions.push(_createSuggestion(suggestion));
  });

  if (opts.directiveSuggestion) {
    suggestions.push(_createSuggestion(opts.directiveSuggestion));
  }

  if (
    _shouldOfferModRecommendation(opts.modRecommendation) &&
    !_isModRecommendationOpen(opts.modRecommendation, opts.modModalContext) &&
    !_wasModRecentlyInstalled(opts.modRecommendation, opts.recentModInstallContext)
  ) {
    suggestions.push(_createSuggestion({
      id: 'install-recommended-ship-mod',
      priority: 19,
      title: '安装「' + opts.modRecommendation.mod.name + '」',
      reason: opts.modRecommendation.reason,
      actionLabel: '打开机库',
      actionType: 'fleet.mod.open',
      payload: {
        shipIndex: opts.modRecommendation.shipIndex || 0,
        modId: opts.modRecommendation.modId,
        modName: opts.modRecommendation.mod.name,
        modCost: opts.modRecommendation.mod.cost || 0,
      },
      surface: 'fleet',
      commandIntent: '模块改装',
    }));
  }

  if (_shouldOfferPoi(opts.nextPoiStatus, opts.nextPoi)) {
    var poiName = _getPoiName(opts.nextPoi);
    suggestions.push(_createSuggestion({
      id: 'explore-current-poi',
      priority: 36,
      title: '调查「' + poiName + '」',
      reason: _getPoiChainReason(opts.nextPoi),
      actionLabel: opts.nextPoiStatus.actionLabel || ('调查 ' + poiName),
      actionType: 'exploration.poi',
      payload: {
        systemId: state.currentSystem,
        poiId: opts.nextPoi.poiId || opts.nextPoi.id || '',
      },
      surface: 'exploration',
    }));
  }

  suggestions = _filterSatisfiedTargets(suggestions, state, opts);
  if (suggestions.length === 0) return null;
  suggestions.sort(function (left, right) {
    return right.priority - left.priority;
  });
  return suggestions[0];
}

export const GUIDE_QUEST_IDS = {
  firstTrade: FIRST_TRADE_QUEST_ID,
  firstExplore: FIRST_EXPLORE_QUEST_ID,
};
