// js/systems/finance/FuturesSystem.js — 期货市场系统
// 依赖：systems/economy/Economy.js, data/goods.js, data/systems.js
// 导出：init, getFuturesListings, openLongContract, openShortContract,
//        closeContract, advanceDay, getNetWorthAdjustment

import * as Economy from '../economy/Economy.js';
import { GOODS } from '../../data/goods.js';
import { SYSTEMS } from '../../data/systems.js';

// 每份合约代表的商品数量
const CONTRACT_UNIT = 10;
// 合约保证金比例（入场成本 = 合约价值 * 保证金比例）
const MARGIN_RATE = 0.20;
// 默认合约到期天数
export const DEFAULT_TERM_DAYS = 10;
// 可交易商品（合法市场可流通的商品）
const FUTURES_GOODS = GOODS.filter(function (g) {
  return g.marketAccess && g.marketAccess.indexOf('open') !== -1;
}).map(function (g) { return g.id; });

// 可作为参考定价星系的前 4 个星系
const REFERENCE_SYSTEMS = SYSTEMS.slice(0, 4).map(function (s) { return s.id; });

function _ensureFuturesState(state) {
  if (!Array.isArray(state.futuresContracts)) {
    state.futuresContracts = [];
  }
  if (typeof state.futuresLastProcessedDay !== 'number' || !Number.isFinite(state.futuresLastProcessedDay)) {
    state.futuresLastProcessedDay = Math.max(1, state.day || 1);
  }
}

function _getMarketPrice(systemId, goodId, state) {
  return Economy.getSellPrice(systemId, goodId, state) || 1;
}

function _generateId(state) {
  return 'fut_' + (state.day || 1) + '_' + (state.futuresContracts.length + 1) + '_' + (Math.random() * 10000 | 0);
}

/**
 * 初始化期货系统
 */
export function init(state) {
  _ensureFuturesState(state);
}

/**
 * 获取当前可交易的期货合约清单
 * 每种商品提供多空两个方向的标准合约
 */
export function getFuturesListings(state) {
  _ensureFuturesState(state);
  const systemId = state.currentSystem || REFERENCE_SYSTEMS[0];
  return FUTURES_GOODS.map(function (goodId) {
    const good = GOODS.find(function (g) { return g.id === goodId; });
    if (!good) return null;
    const price = _getMarketPrice(systemId, goodId, state);
    const contractValue = price * CONTRACT_UNIT;
    const margin = Math.max(50, Math.round(contractValue * MARGIN_RATE));
    const heldLong = (state.futuresContracts || []).filter(function (c) {
      return c.goodId === goodId && c.direction === 'long' && c.status === 'open';
    }).length;
    const heldShort = (state.futuresContracts || []).filter(function (c) {
      return c.goodId === goodId && c.direction === 'short' && c.status === 'open';
    }).length;
    return {
      goodId: goodId,
      name: good.name,
      emoji: good.emoji || '',
      currentPrice: price,
      contractUnit: CONTRACT_UNIT,
      contractValue: contractValue,
      margin: margin,
      termDays: DEFAULT_TERM_DAYS,
      systemId: systemId,
      heldLong: heldLong,
      heldShort: heldShort,
    };
  }).filter(Boolean);
}

/**
 * 开立多头合约（做多：预测价格上涨）
 * @param {object} state
 * @param {string} goodId
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function openLongContract(state, goodId) {
  return _openContract(state, goodId, 'long');
}

/**
 * 开立空头合约（做空：预测价格下跌）
 * @param {object} state
 * @param {string} goodId
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function openShortContract(state, goodId) {
  return _openContract(state, goodId, 'short');
}

function _openContract(state, goodId, direction) {
  _ensureFuturesState(state);
  const good = GOODS.find(function (g) { return g.id === goodId; });
  if (!good || FUTURES_GOODS.indexOf(goodId) === -1) {
    return { ok: false, msgs: [{ text: '📋 未找到可交易的期货合约。', type: 'error' }] };
  }
  const systemId = state.currentSystem || REFERENCE_SYSTEMS[0];
  const lockedPrice = _getMarketPrice(systemId, goodId, state);
  const contractValue = lockedPrice * CONTRACT_UNIT;
  const margin = Math.max(50, Math.round(contractValue * MARGIN_RATE));

  if ((state.credits || 0) < margin) {
    return { ok: false, msgs: [{ text: '💰 保证金不足，无法开立期货合约（需 ' + margin.toLocaleString() + ' 积分）。', type: 'error' }] };
  }

  state.credits -= margin;
  const contract = {
    id: _generateId(state),
    goodId: goodId,
    goodName: good.name,
    direction: direction,
    lockedPrice: lockedPrice,
    contractUnit: CONTRACT_UNIT,
    margin: margin,
    systemId: systemId,
    openDay: state.day || 1,
    expiryDay: (state.day || 1) + DEFAULT_TERM_DAYS,
    status: 'open',
    settlementPrice: null,
    pnl: null,
  };
  state.futuresContracts.push(contract);

  const dirLabel = direction === 'long' ? '做多' : '做空';
  return {
    ok: true,
    msgs: [{ text: '📋 已开立 ' + good.name + ' 期货' + dirLabel + '合约，锁定价格 ' + lockedPrice.toLocaleString() + '，保证金 ' + margin.toLocaleString() + ' 积分。到期日：第 ' + contract.expiryDay + ' 天。', type: 'upgrade' }],
    meta: { contractId: contract.id, margin: margin },
  };
}

/**
 * 提前平仓某份持仓合约
 * @param {object} state
 * @param {string} contractId
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function closeContract(state, contractId) {
  _ensureFuturesState(state);
  const contract = state.futuresContracts.find(function (c) { return c.id === contractId && c.status === 'open'; });
  if (!contract) {
    return { ok: false, msgs: [{ text: '📋 未找到该未平仓合约。', type: 'error' }] };
  }
  const systemId = contract.systemId || state.currentSystem || REFERENCE_SYSTEMS[0];
  const currentPrice = _getMarketPrice(systemId, contract.goodId, state);
  return _settleContract(state, contract, currentPrice, '手动平仓');
}

function _settleContract(state, contract, settlementPrice, reason) {
  contract.status = 'closed';
  contract.settlementPrice = settlementPrice;
  contract.closedDay = state.day || 1;

  const priceDiff = settlementPrice - contract.lockedPrice;
  const directionMultiplier = contract.direction === 'long' ? 1 : -1;
  const pnl = Math.round(priceDiff * contract.contractUnit * directionMultiplier);
  contract.pnl = pnl;

  // 归还保证金 + 盈亏；若亏损超过保证金则最多归零（保证金已在开仓时扣除，此处不能欠负）
  const returned = (contract.margin || 0) + pnl;
  state.credits += Math.max(0, returned);

  const dirLabel = contract.direction === 'long' ? '多头' : '空头';
  const pnlLabel = pnl >= 0 ? '+' + pnl.toLocaleString() : pnl.toLocaleString();
  const typeText = pnl >= 0 ? 'upgrade' : 'error';
  return {
    ok: true,
    msgs: [{
      text: '📋 ' + contract.goodName + ' 期货' + dirLabel + '合约' + reason + '，结算价 ' + settlementPrice.toLocaleString() +
        '，盈亏 ' + pnlLabel + ' 积分。',
      type: typeText,
    }],
    meta: { contractId: contract.id, pnl: pnl, settlementPrice: settlementPrice },
  };
}

/**
 * 获取当前持仓合约列表
 */
export function getOpenContracts(state) {
  _ensureFuturesState(state);
  const systemId = state.currentSystem || REFERENCE_SYSTEMS[0];
  return (state.futuresContracts || []).filter(function (c) { return c.status === 'open'; }).map(function (c) {
    const currentPrice = _getMarketPrice(systemId, c.goodId, state);
    const priceDiff = currentPrice - c.lockedPrice;
    const directionMultiplier = c.direction === 'long' ? 1 : -1;
    const unrealizedPnl = Math.round(priceDiff * c.contractUnit * directionMultiplier);
    const daysLeft = Math.max(0, (c.expiryDay || 0) - (state.day || 1));
    return Object.assign({}, c, {
      currentPrice: currentPrice,
      unrealizedPnl: unrealizedPnl,
      daysLeft: daysLeft,
    });
  });
}

/**
 * 获取历史成交合约（已结算/已平仓）
 */
export function getClosedContracts(state) {
  _ensureFuturesState(state);
  return (state.futuresContracts || []).filter(function (c) { return c.status === 'closed'; });
}

/**
 * 净资产调整：未实现盈亏之和
 */
export function getNetWorthAdjustment(state) {
  _ensureFuturesState(state);
  const open = getOpenContracts(state);
  return open.reduce(function (sum, c) { return sum + (c.unrealizedPnl || 0); }, 0);
}

/**
 * 每天结算到期合约
 */
export function advanceDay(state) {
  _ensureFuturesState(state);
  if ((state.day || 1) <= state.futuresLastProcessedDay) {
    return { ok: true, msgs: [] };
  }

  const processingDay = state.futuresLastProcessedDay + 1;
  const msgs = [];

  (state.futuresContracts || []).forEach(function (contract) {
    if (contract.status !== 'open') return;
    if ((contract.expiryDay || 0) > processingDay) return;
    const systemId = contract.systemId || REFERENCE_SYSTEMS[0];
    const settlementPrice = _getMarketPrice(systemId, contract.goodId, state);
    const result = _settleContract(state, contract, settlementPrice, '到期交割');
    result.msgs.forEach(function (m) { msgs.push(m); });
  });

  state.futuresLastProcessedDay = processingDay;
  return { ok: true, day: processingDay, msgs: msgs };
}
