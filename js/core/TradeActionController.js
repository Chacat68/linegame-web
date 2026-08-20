// js/core/TradeActionController.js — 公开市场、黑市与燃料补给动作编排

import { getRefuelCompletion } from './ActionGuideCompletion.js';
import { MARKET_ECONOMY_ACTION_PRESENTATION } from './ActionPresentation.js';

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('TradeActionController requires ' + label + '.');
  return value;
}

function _emitMessages(result, emitMessage) {
  var messages = Array.isArray(result) ? result : (result && Array.isArray(result.msgs) ? result.msgs : []);
  messages.forEach(function (message) { emitMessage(message); });
}

function _ensureOperatingStats(ship) {
  if (!ship.operatingStats || typeof ship.operatingStats !== 'object') ship.operatingStats = {};
  return ship.operatingStats;
}

export function createTradeActionController(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var Trade = systems.Trade || {};
  var Economy = systems.Economy || {};
  var Fleet = systems.Fleet || {};
  var Faction = systems.Faction || {};
  var Quest = systems.Quest || {};
  var Tutorial = systems.Tutorial || {};
  var Progression = systems.Progression || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var pipeline = deps.pipeline || {};
  var execute = _requiredFunction(pipeline.execute, 'pipeline.execute');
  var returnToStarmap = typeof deps.returnToStarmap === 'function' ? deps.returnToStarmap : _noop;
  var emitAudio = typeof deps.emitAudio === 'function' ? deps.emitAudio : _noop;
  var emitMessage = typeof deps.emitMessage === 'function' ? deps.emitMessage : _noop;
  var queueQuestDialogueResult = typeof deps.queueQuestDialogueResult === 'function'
    ? deps.queueQuestDialogueResult
    : _noop;
  var showCompletion = typeof deps.showCompletion === 'function' ? deps.showCompletion : _noop;

  function _state() {
    var state = getState();
    if (!state || typeof state !== 'object') throw new Error('TradeActionController requires an active state.');
    return state;
  }

  function confirm(action, goodId, quantity, marketType, options) {
    var state = _state();
    var actionOptions = options || {};
    Fleet.syncStateFromShip(state);

    var dispatchedShip = Fleet.getActiveShip(state);
    var dispatchedRoute = dispatchedShip && dispatchedShip.route ? dispatchedShip.route : null;
    var completesDispatchCycle = action === 'sell' && dispatchedRoute &&
      dispatchedRoute.goodId === goodId && dispatchedRoute.status === 'selling';
    var recordsDispatchPurchase = action === 'buy' && dispatchedRoute &&
      dispatchedRoute.goodId === goodId && dispatchedRoute.status === 'buying';
    var effectiveMarket = marketType === 'black' ? 'black' : 'open';

    return execute({
      label: 'trade.' + action,
      dirtyRegions: MARKET_ECONOMY_ACTION_PRESENTATION.dirtyRegions,
      mutate: function () {
        return action === 'buy'
          ? Trade.buyGoodOnMarket(state, goodId, quantity, effectiveMarket)
          : Trade.sellGoodOnMarket(state, goodId, quantity, effectiveMarket);
      },
      postEffects: function (result) {
        if (effectiveMarket === 'black') {
          Economy.recordBlackMarketTrade(state, { action: action, meta: result.meta });
        }
        returnToStarmap();
        emitAudio(action === 'buy' ? 'trade.buy' : 'trade.sell');
        Fleet.commitActiveShipState(state);

        if (completesDispatchCycle && dispatchedShip) {
          var completedStats = _ensureOperatingStats(dispatchedShip);
          completedStats.revenue = Math.max(0, Number(completedStats.revenue) || 0) +
            Math.max(0, Number(result.meta && result.meta.totalEarned) || 0);
          completedStats.tradeCycles = Math.max(0, Number(completedStats.tradeCycles) || 0) + 1;
        } else if (recordsDispatchPurchase && dispatchedShip) {
          var purchaseStats = _ensureOperatingStats(dispatchedShip);
          purchaseStats.cargoCost = Math.max(0, Number(purchaseStats.cargoCost) || 0) +
            Math.max(0, Number(result.meta && result.meta.totalCost) || 0);
        }

        var activeShip = Fleet.getActiveShip(state);
        var activeRoute = activeShip ? activeShip.route : null;
        if (activeRoute && activeRoute.goodId === goodId) {
          activeRoute.lastBuyPrice = action === 'buy' && result.meta && Number.isFinite(result.meta.unitBuyPrice)
            ? result.meta.unitBuyPrice
            : null;
          activeRoute.lastPolicyMessage = null;
          if (actionOptions.nextRouteStatus) activeRoute.status = actionOptions.nextRouteStatus;
        }

        Tutorial.checkTrigger(action);
        _emitMessages(Faction.onTrade(state, state.currentSystem, goodId, action, quantity, effectiveMarket), emitMessage);
        state.tradeCount = (state.tradeCount || 0) + 1;

        var isBlack = effectiveMarket === 'black';
        var expGain = Math.max(1, Math.ceil(quantity * (isBlack ? 3 : 2)));
        var repGain = Math.max(1, Math.ceil(quantity * 0.5));
        _emitMessages(Progression.gainExperience(state, expGain), emitMessage);
        if (!isBlack) {
          var profit = result.meta && typeof result.meta.profit === 'number' ? result.meta.profit : 0;
          var companyExpGain = action === 'sell'
            ? Math.max(2, Math.ceil(quantity * 0.8) + Math.ceil(Math.max(0, profit) / 120))
            : Math.max(1, Math.ceil(quantity * 0.8));
          _emitMessages(Progression.gainCompanyExperience(state, companyExpGain), emitMessage);
          var tradeFaction = Faction.getFactionForSystem(state.currentSystem);
          var questResult = Quest.checkProgress(state, {
            action: action,
            goodId: goodId,
            quantity: quantity,
            systemId: state.currentSystem,
            factionId: tradeFaction ? tradeFaction.id : null,
            profit: action === 'sell' ? profit : 0,
          });
          _emitMessages(questResult, emitMessage);
          queueQuestDialogueResult(questResult);
        }
        state.reputation = (state.reputation || 0) + repGain;
      },
    });
  }

  function refuel(options) {
    var state = _state();
    var refuelOptions = options || {};
    Fleet.syncStateFromShip(state);
    var result = execute({
      label: 'trade.refuel',
      dirtyRegions: MARKET_ECONOMY_ACTION_PRESENTATION.dirtyRegions,
      mutate: function () { return Trade.refuel(state); },
      postEffects: function () { Fleet.commitActiveShipState(state); },
    });
    if (result && result.ok && refuelOptions.showCompletion !== false) {
      showCompletion(getRefuelCompletion());
    }
    return result;
  }

  return Object.freeze({ confirm: confirm, refuel: refuel });
}
