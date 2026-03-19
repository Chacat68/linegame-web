// js/systems/commerce/CommerceFacade.js — 商业终端统一门面
// 依赖：systems/trade/*, systems/finance/*, systems/economy/Economy.js
// 导出：所有商业终端操作的统一入口函数
//
// 职责：
//   - 作为商业终端所有操作的统一入口（市场、金融、贸易站）
//   - 封装操作后的通用副作用（走私统计、派系关系更新由调用方处理）
//   - 暴露汇总查询接口（getCommerceSnapshot）
//
// 注意：本模块不持有状态，所有函数均接收 state 引用。
//       副作用（日志、UI 刷新、派系更新等）由调用方负责处理。

import * as Trade    from '../trade/TradeSystem.js';
import * as Finance  from '../finance/FinanceSystem.js';
import * as Futures  from '../finance/FuturesSystem.js';
import * as Station  from '../trade/TradeStationSystem.js';
import * as Economy  from '../economy/Economy.js';

// ---------------------------------------------------------------------------
// 市场交易
// ---------------------------------------------------------------------------

/**
 * 统一买入接口（公开市场 + 黑市）。
 * @param {object}          state
 * @param {string}          goodId
 * @param {number}          quantity
 * @param {'open'|'black'}  [marketType='open']
 * @returns {{ ok: boolean, msgs: Array, meta?: object }}
 */
export function buyGood(state, goodId, quantity, marketType) {
  const result = Trade.buyGoodOnMarket(state, goodId, quantity, marketType);
  if (result.ok && marketType === 'black') {
    Economy.recordBlackMarketTrade(state);
  }
  return result;
}

/**
 * 统一卖出接口（公开市场 + 黑市）。
 * @param {object}          state
 * @param {string}          goodId
 * @param {number}          quantity
 * @param {'open'|'black'}  [marketType='open']
 * @returns {{ ok: boolean, msgs: Array, meta?: object }}
 */
export function sellGood(state, goodId, quantity, marketType) {
  const result = Trade.sellGoodOnMarket(state, goodId, quantity, marketType);
  if (result.ok && marketType === 'black') {
    Economy.recordBlackMarketTrade(state);
  }
  return result;
}

/**
 * 补充燃料。
 */
export function refuel(state) {
  return Trade.refuel(state);
}

// ---------------------------------------------------------------------------
// 贸易站管理
// ---------------------------------------------------------------------------

export function buildTradeStation(state, systemId) {
  return Station.buildStation(state, systemId);
}

export function upgradeTradeStation(state, systemId) {
  return Station.upgradeStation(state, systemId);
}

export function hireTradeStationManager(state, systemId, managerId) {
  return Station.hireManager(state, systemId, managerId);
}

export function setTradeStationStrategy(state, systemId, strategyId) {
  return Station.setStrategy(state, systemId, strategyId);
}

// ---------------------------------------------------------------------------
// 金融操作（贷款、股票、保险、投资）
// ---------------------------------------------------------------------------

export function takeLoan(state, offerId) {
  return Finance.takeLoan(state, offerId);
}

export function repayLoan(state, loanId) {
  return Finance.repayLoan(state, loanId);
}

export function buyStock(state, stockId) {
  return Finance.buyStock(state, stockId, 1);
}

export function sellStock(state, stockId) {
  return Finance.sellStock(state, stockId, 1);
}

export function investInTradeStation(state, systemId) {
  return Finance.investInTradeStation(state, systemId);
}

export function purchaseInsurance(state, policyType) {
  return Finance.purchaseInsurance(state, policyType);
}

export function submitInsuranceClaim(state, policyType) {
  return Finance.submitClaim(state, policyType);
}

// ---------------------------------------------------------------------------
// 期货操作
// ---------------------------------------------------------------------------

export function openFuturesLong(state, goodId) {
  return Futures.openLongContract(state, goodId);
}

export function openFuturesShort(state, goodId) {
  return Futures.openShortContract(state, goodId);
}

export function closeFutures(state, contractId) {
  return Futures.closeContract(state, contractId);
}

// ---------------------------------------------------------------------------
// 汇总查询
// ---------------------------------------------------------------------------

/**
 * 获取商业终端全局快照，用于概览页展示。
 * @param {object} state
 * @returns {object} commerce snapshot
 */
export function getCommerceSnapshot(state) {
  const ownedStations  = Station.getOwnedStations(state);
  const stationSummary = Station.getSummary(state);
  const financeSnap    = Finance.getSnapshot ? Finance.getSnapshot(state) : null;
  const futuresSnap    = Futures.getFuturesSnapshot ? Futures.getFuturesSnapshot(state) : null;

  // 今日贸易站被动收入
  const stationDailyIncome = ownedStations.reduce(function (sum, s) {
    return sum + (Station.getProjectedDailyIncome(state, s.systemId) || 0);
  }, 0);

  // 贷款总额
  const totalLoans = Array.isArray(state.loans)
    ? state.loans.reduce(function (sum, loan) { return sum + (loan.balance || 0); }, 0)
    : 0;

  // 股票组合市值
  const stockValue = _calcStockPortfolioValue(state);

  // 期货未实现盈亏
  const futuresPnl = futuresSnap ? (futuresSnap.totalUnrealizedPnl || 0) : 0;

  return {
    ownedStationCount:  ownedStations.length,
    stationDailyIncome: Math.round(stationDailyIncome),
    totalLoans:         Math.round(totalLoans),
    stockPortfolioValue: Math.round(stockValue),
    futuresUnrealizedPnl: Math.round(futuresPnl),
    creditRating:       state.creditRating || 620,
    stationSummary:     stationSummary,
    activeLoans:        (state.loans || []).length,
    blackMarketTrades:  (state.smugglingStats && state.smugglingStats.blackMarketTrades) || 0,
  };
}

function _calcStockPortfolioValue(state) {
  if (!state.stockPortfolio || !state.stockMarket) return 0;
  return Object.keys(state.stockPortfolio).reduce(function (sum, stockId) {
    const holding = state.stockPortfolio[stockId];
    const shares  = (holding && typeof holding === 'object') ? (holding.shares || 0) : 0;
    const stock   = state.stockMarket[stockId];
    return sum + shares * (stock ? stock.price : 0);
  }, 0);
}
