import { GOODS } from '../../data/goods.js';
import { SYSTEMS, findSystem, getAccessibleSystems } from '../../data/systems.js';
import * as Quest from '../quest/QuestSystem.js?v=20260412-questroute2';

const FIRST_TRADE_QUEST_ID = 'starter_first_trade';
const FIRST_EXPLORE_QUEST_ID = 'starter_visit_2';
const LOW_PRICE_THRESHOLD = 0.85;

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

function _shouldOfferScan(scanStatus) {
  if (!scanStatus) return false;
  if (scanStatus.canScan === false) return false;
  if (scanStatus.reason === 'already-scanned') return false;
  if (scanStatus.scanLevel && scanStatus.scanLevel > 0) return false;
  return true;
}

function _shouldOfferLanding(landingStatus) {
  if (!landingStatus) return false;
  if (landingStatus.canLand === false) return false;
  if (landingStatus.reason === 'already-landed') return false;
  return true;
}

function _shouldOfferPoi(nextPoiStatus, nextPoi) {
  if (!nextPoiStatus || !nextPoi) return false;
  return nextPoiStatus.canExplore !== false;
}

function _getPoiName(nextPoi) {
  if (!nextPoi) return '探索点';
  var icon = nextPoi.icon ? (nextPoi.icon + ' ') : '';
  return icon + (nextPoi.name || '探索点');
}

function _createSuggestion(config) {
  return Object.assign({
    id: '',
    priority: 0,
    title: '',
    reason: '',
    actionLabel: '',
    actionType: '',
    payload: {},
    surface: 'system',
  }, config || {});
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

  if (activeQuests.length === 0 && firstTradeAvailable && !_isQuestCompleted(state, FIRST_TRADE_QUEST_ID)) {
    suggestions.push(_createSuggestion({
      id: 'accept-first-trade',
      priority: 100,
      title: '接取「初次交易」',
      reason: '完成第一笔买卖，建立基础贸易节奏。',
      actionLabel: '接取任务',
      actionType: 'quest.accept',
      payload: { questId: FIRST_TRADE_QUEST_ID },
      surface: 'quest',
    }));
  }

  if (firstTradeActive && !_hasCargo(state) && lowPriceGood) {
    suggestions.push(_createSuggestion({
      id: 'buy-low-price-good',
      priority: 90,
      title: '买入「' + lowPriceGood.goodName + '」',
      reason: '当前价格偏低，适合打开确认单建仓推进交易目标。',
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
          ? '先定位更好的卖货点；当前有待处理事件，处理后再起航。'
          : '选择需求更高的星球，获得更好利润。',
        actionLabel: canDirectTravel ? '直接前往' : (destination ? '定位卖货点' : '查看星图'),
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
      reason: '贸易循环已建立，可以开始学习航行与扫描。',
      actionLabel: '接取任务',
      actionType: 'quest.accept',
      payload: { questId: FIRST_EXPLORE_QUEST_ID },
      surface: 'quest',
    }));
  }

  if (_shouldOfferScan(opts.scanStatus)) {
    suggestions.push(_createSuggestion({
      id: 'scan-current-system',
      priority: 40,
      title: '扫描当前星球',
      reason: '扫描会揭示本地资源、风险和探索机会。',
      actionLabel: '执行扫描',
      actionType: 'exploration.scan',
      payload: { systemId: state.currentSystem },
      surface: 'exploration',
    }));
  }

  if (_shouldOfferLanding(opts.landingStatus)) {
    suggestions.push(_createSuggestion({
      id: 'land-current-system',
      priority: 38,
      title: '申请首次着陆',
      reason: '着陆后才能调查已发现的探索点，并把结果沉淀为勘探报告。',
      actionLabel: opts.landingStatus.actionLabel || '申请首次着陆',
      actionType: 'exploration.land',
      payload: { systemId: state.currentSystem },
      surface: 'exploration',
    }));
  }

  if (_shouldOfferPoi(opts.nextPoiStatus, opts.nextPoi)) {
    var poiName = _getPoiName(opts.nextPoi);
    suggestions.push(_createSuggestion({
      id: 'explore-current-poi',
      priority: 36,
      title: '调查「' + poiName + '」',
      reason: '调查结论会写入勘探报告，并可能影响贸易、航线或科研收益。',
      actionLabel: opts.nextPoiStatus.actionLabel || ('调查 ' + poiName),
      actionType: 'exploration.poi',
      payload: {
        systemId: state.currentSystem,
        poiId: opts.nextPoi.poiId || opts.nextPoi.id || '',
      },
      surface: 'exploration',
    }));
  }

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
