// js/core/DispatchController.js — 激活船只自动派遣控制器
// 依赖：systems/fleet/FleetSystem.js,
//       systems/trade/TradePolicy.js, systems/economy/Economy.js
// 导出：runActiveDispatchTick
//
// 本模块只计算一次派遣 tick。周期调度归 GameClockController 所有，
// tick 返回动作描述，由 ActionCoordinator / 迁移期 GameManager 执行。

import * as Fleet     from '../systems/fleet/FleetSystem.js';
import { canUseMarket, evaluateTradePolicy } from '../systems/trade/TradePolicy.js';
import * as Economy   from '../systems/economy/Economy.js';

let _questRouteResolver = null;

export function setQuestRouteResolver(resolver) {
  _questRouteResolver = typeof resolver === 'function' ? resolver : null;
}

function _queuePolicyMessage(route, msgs, text) {
  if (!route || !text || route.lastPolicyMessage === text) return;
  route.lastPolicyMessage = text;
  msgs.push({ text: text, type: 'info' });
}

function _clearPolicyMessage(route) {
  if (!route) return;
  route.lastPolicyMessage = null;
}

/**
 * 单次派遣 tick 处理逻辑
 *
 * 返回一个动作描述，由 GameManager 执行具体操作。
 *
 * @param {object} state  游戏状态
 * @param {object} options
 * @param {Function} options.isModalVisible  (modalId) => boolean 检查弹窗是否可见
 * @param {Function} [options.hasBlockingSurfaceOpen]  () => boolean 检查是否存在任意阻塞层
 * @returns {{ action: string, payload?: *, msgs: Array }}
 *   action 可为：
 *     - 'noop'        : 无需操作（弹窗打开中或非派遣状态）
 *     - 'stopped'     : 已自动停止
 *     - 'travel'      : 需要旅行到 payload.systemId
 *     - 'buy_need_refuel': 买入前需先补足下一段航程燃料
 *     - 'buy'         : 需要买入 payload { goodId, quantity }
 *     - 'sell'        : 需要卖出 payload { goodId, quantity }
 *     - 'fuel_failed' : 燃料不足已召回
 */
export function runActiveDispatchTick(state, options) {
  const msgs = [];
  const isModalVisible = options.isModalVisible;
  const hasBlockingSurfaceOpen = options.hasBlockingSurfaceOpen;

  // 有弹窗时暂停
  if (isModalVisible('gameover-modal')) {
    return { action: 'stopped', msgs };
  }
  if ((typeof hasBlockingSurfaceOpen === 'function' && hasBlockingSurfaceOpen()) || isModalVisible('event-modal') || isModalVisible('dispatch-modal')) {
    return { action: 'noop', msgs };
  }

  // 检查激活船只是否仍在派遣中
  if (!Fleet.isActiveDispatched(state)) {
    return { action: 'stopped', msgs };
  }

  // 每个 tick 开始时检查任务路线
  var activeShip = Fleet.getActiveShip(state);
  if (activeShip && activeShip.route && _questRouteResolver) {
    var activeShipStats = Fleet.getEffectiveShipStats(state, activeShip);
    var qr = _questRouteResolver(state, {
      currentSystem: state.currentSystem,
      currentGalaxy: state.currentGalaxy || 'milky_way',
      playerLevel: state.playerLevel || 1,
      cargo: state.cargo || {},
      fuelEfficiency: activeShipStats.fuelEff,
      dispatchProfile: activeShipStats.dispatchProfile || null,
    });
    if (qr) {
      var curRoute = activeShip.route;
      if (curRoute.questId !== qr.questId ||
          curRoute.buySystemId !== qr.buySystemId ||
          curRoute.sellSystemId !== qr.sellSystemId ||
          curRoute.goodId !== qr.goodId ||
          curRoute.strategySummary !== qr.strategySummary) {
        var routeRevision = Fleet.bumpRouteRevision(activeShip);
        curRoute.buySystemId  = qr.buySystemId;
        curRoute.sellSystemId = qr.sellSystemId;
        curRoute.goodId       = qr.goodId;
        curRoute.status       = qr.status;
        curRoute.questId      = qr.questId;
        curRoute.strategyLabel = qr.strategyLabel || null;
        curRoute.strategySummary = qr.strategySummary || null;
        curRoute.routeFitScore = qr.routeFitScore || 0;
        curRoute.revision     = routeRevision;
        msgs.push({
          text: '📋 任务路线：前往完成「' + qr.questName + '」' + (qr.strategySummary ? ' · ' + qr.strategySummary : ''),
          type: 'info',
        });
      }
    } else if (activeShip.route.questId) {
      delete activeShip.route.questId;
      delete activeShip.route.strategyLabel;
      delete activeShip.route.strategySummary;
      delete activeShip.route.routeFitScore;
    }
  }

  var result = Fleet.tickActiveShipDispatch(state);
  msgs.push(...result.msgs);

  // 需要旅行
  if (result.needTravel) {
    var fuelCost = Economy.getFuelCost(state.currentSystem, result.needTravel, state.fuelEfficiency, state);
    if (state.fuel < fuelCost) {
      return {
        action: 'travel_need_refuel',
        payload: { systemId: result.needTravel, fuelCost },
        msgs,
      };
    }
    return { action: 'travel', payload: { systemId: result.needTravel }, msgs };
  }

  // 需要买入
  if (result.needBuy) {
    var route = result.needBuy;
    var marketType = route.marketMode || 'open';
    var buyPrice = marketType === 'black'
      ? Economy.getBlackMarketBuyPrice(route.buySystemId, route.goodId, state)
      : Economy.getBuyPrice(route.buySystemId, route.goodId, state);
    var canBlackSell = marketType === 'black' && canUseMarket(state, route.sellSystemId, 'black') && Economy.isBlackMarketGood(route.goodId);
    var sellPrice = canBlackSell
      ? Economy.getBlackMarketSellPrice(route.sellSystemId, route.goodId, state)
      : Economy.getSellPrice(route.sellSystemId, route.goodId, state);
    var buyPolicyCheck = evaluateTradePolicy(buyPrice, sellPrice, route.tradePolicy);
    var cargoUsed = Object.values(state.cargo).reduce(function (s, q) { return s + q; }, 0);
    var space = state.maxCargo - cargoUsed;
    var canAfford = Math.floor(state.credits / buyPrice);
    var qty = Math.min(space, canAfford);
    var nextTravelFuelCost = Economy.getFuelCost(route.buySystemId, route.sellSystemId, state.fuelEfficiency, state);

    if (!buyPolicyCheck.ok) {
      _queuePolicyMessage(route, msgs, '⏸️ 自动跑商正在等待合适买价：' + buyPolicyCheck.reasons.join('、') + '。');
      return { action: 'noop', msgs };
    }

    if (qty > 0) {
      if (state.fuel < nextTravelFuelCost) {
        return {
          action: 'buy_need_refuel',
          payload: {
            goodId: route.goodId,
            quantity: qty,
            marketType: marketType,
            fuelCost: nextTravelFuelCost,
          },
          msgs,
        };
      }
      _clearPolicyMessage(route);
      // 先执行买入
      return { action: 'buy', payload: { goodId: route.goodId, quantity: qty, marketType: marketType }, msgs };
    }
    var ship = Fleet.getActiveShip(state);
    var sellableCargo = Math.max(0, Number(state.cargo[route.goodId]) || 0);
    if (ship && ship.route && sellableCargo > 0) {
      ship.route.status = 'traveling_sell';
    } else {
      _queuePolicyMessage(route, msgs, '⏸️ 自动跑商正在等待可用资金或货舱空间。');
      if (ship && ship.route) ship.route.status = 'buying';
    }
    return { action: 'noop', msgs };
  }

  // 需要卖出
  if (result.needSell) {
    var routeS = result.needSell;
    var sellQty = state.cargo[routeS.goodId] || 0;
    var marketTypeS = routeS.marketMode || 'open';
    var canBlackSellS = marketTypeS === 'black' && canUseMarket(state, routeS.sellSystemId, 'black') && Economy.isBlackMarketGood(routeS.goodId);
    var buyReference = routeS.lastBuyPrice != null ? routeS.lastBuyPrice : (marketTypeS === 'black'
      ? Economy.getBlackMarketBuyPrice(routeS.buySystemId, routeS.goodId, state)
      : Economy.getBuyPrice(routeS.buySystemId, routeS.goodId, state));
    var sellPrice = canBlackSellS
      ? Economy.getBlackMarketSellPrice(routeS.sellSystemId, routeS.goodId, state)
      : Economy.getSellPrice(routeS.sellSystemId, routeS.goodId, state);
    var sellPolicyCheck = evaluateTradePolicy(buyReference, sellPrice, routeS.tradePolicy);

    if (!sellPolicyCheck.ok && sellQty > 0) {
      _queuePolicyMessage(routeS, msgs, '⏸️ 自动跑商正在等待合适卖价：' + sellPolicyCheck.reasons.join('、') + '。');
      return { action: 'noop', msgs };
    }

    if (sellQty > 0) {
      _clearPolicyMessage(routeS);
      return { action: 'sell', payload: { goodId: routeS.goodId, quantity: sellQty, marketType: canBlackSellS ? 'black' : 'open' }, msgs };
    }
    var shipS = Fleet.getActiveShip(state);
    if (shipS && shipS.route) shipS.route.status = 'traveling_buy';
    return { action: 'noop', msgs };
  }

  return { action: 'noop', msgs };
}
