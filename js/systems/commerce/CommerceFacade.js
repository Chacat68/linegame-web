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
import { getCompanyAccessState } from '../../data/companyAccess.js';

function _requireCompanyAccess(state, featureId, actionLabel) {
  const access = getCompanyAccessState(state, featureId);
  if (access.unlocked) return null;
  return {
    ok: false,
    msgs: [{
      text: '🏢 ' + actionLabel + '需要公司 Lv.' + access.requiredLevel + '，当前公司 Lv.' + access.currentLevel + '。',
      type: 'error',
    }],
    meta: { requiredCompanyLevel: access.requiredLevel, currentCompanyLevel: access.currentLevel },
  };
}

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

export function batchUpgradeTradeStations(state, systemIds) {
  return Station.batchUpgradeStations(state, systemIds);
}

export function batchHireTradeStationManager(state, managerId, systemIds) {
  return Station.batchHireManagers(state, managerId, systemIds);
}

export function batchSetTradeStationStrategy(state, strategyId, systemIds) {
  return Station.batchSetStrategies(state, strategyId, systemIds);
}

// ---------------------------------------------------------------------------
// 金融操作（贷款、股票、保险、投资）
// ---------------------------------------------------------------------------

export function takeLoan(state, offerId) {
  const gate = _requireCompanyAccess(state, 'capitalLocal', '申请贷款');
  if (gate) return gate;
  return Finance.takeLoan(state, offerId);
}

export function repayLoan(state, loanId) {
  return Finance.repayLoan(state, loanId);
}

export function buyStock(state, stockId) {
  const gate = _requireCompanyAccess(state, 'stocks', '买入股票');
  if (gate) return gate;
  return Finance.buyStock(state, stockId, 1);
}

export function sellStock(state, stockId) {
  return Finance.sellStock(state, stockId, 1);
}

export function investInTradeStation(state, systemId) {
  const gate = _requireCompanyAccess(state, 'tradeInvestment', '追加站点投资');
  if (gate) return gate;
  return Finance.investInTradeStation(state, systemId);
}

export function batchInvestInTradeStations(state, systemIds) {
  const gate = _requireCompanyAccess(state, 'tradeInvestment', '批量站点投资');
  if (gate) return gate;
  return Finance.batchInvestInTradeStations(state, systemIds);
}

export function purchaseInsurance(state, policyType) {
  const gate = _requireCompanyAccess(state, 'capitalLocal', '购买保险');
  if (gate) return gate;
  return Finance.purchaseInsurance(state, policyType);
}

export function submitInsuranceClaim(state, policyType) {
  return Finance.submitClaim(state, policyType);
}

// ---------------------------------------------------------------------------
// 期货操作
// ---------------------------------------------------------------------------

export function openFuturesLong(state, goodId) {
  const gate = _requireCompanyAccess(state, 'futures', '开立期货合约');
  if (gate) return gate;
  return Futures.openLongContract(state, goodId);
}

export function openFuturesShort(state, goodId) {
  const gate = _requireCompanyAccess(state, 'futures', '开立期货合约');
  if (gate) return gate;
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
  const financeSnap    = _getFinanceSnapshot(state);
  const futuresSnap    = _getFuturesSnapshot(state);
  const stationDailyIncome = Math.round(stationSummary.projectedIncome || 0);

  return {
    ownedStationCount: ownedStations.length,
    stationDailyIncome: Math.round(stationDailyIncome),
    totalLoans: Math.round(financeSnap.outstandingLoanBalance || 0),
    stockPortfolioValue: Math.round(financeSnap.stockPortfolioValue || 0),
    tradeInvestmentValue: Math.round(financeSnap.tradeInvestmentValue || 0),
    futuresUnrealizedPnl: Math.round(futuresSnap.totalUnrealizedPnl || 0),
    futuresOpenContracts: futuresSnap.openContractCount || 0,
    creditRating: financeSnap.creditRating || state.creditRating || 620,
    stationSummary: stationSummary,
    activeLoans: financeSnap.activeLoanCount || 0,
    blackMarketTrades: (state.smugglingStats && state.smugglingStats.blackMarketTrades) || 0,
    finance: financeSnap,
    futures: futuresSnap,
  };
}

function _getFinanceSnapshot(state) {
  if (typeof Finance.getSnapshot === 'function') {
    return Finance.getSnapshot(state);
  }

  const totalLoans = Array.isArray(state.loans)
    ? state.loans.reduce(function (sum, loan) {
        return loan && loan.status === 'active' && loan.balance > 0 ? sum + (loan.balance || 0) : sum;
      }, 0)
    : 0;
  const activePolicies = state.insurancePolicies && typeof state.insurancePolicies === 'object'
    ? Object.keys(state.insurancePolicies).filter(function (key) {
        const policy = state.insurancePolicies[key];
        return policy && policy.active !== false;
      }).length
    : 0;
  const pendingClaims = Array.isArray(state.insuranceClaims)
    ? state.insuranceClaims.filter(function (claim) { return claim && claim.status === 'pending'; }).length
    : 0;

  return {
    creditRating: state.creditRating || 620,
    activeLoanCount: Array.isArray(state.loans)
      ? state.loans.filter(function (loan) { return loan && loan.status === 'active' && loan.balance > 0; }).length
      : 0,
    outstandingLoanBalance: totalLoans,
    stockPortfolioValue: _calcStockPortfolioValue(state),
    tradeInvestmentValue: _calcTradeInvestmentValue(state),
    activePolicies: activePolicies,
    pendingClaims: pendingClaims,
  };
}

function _getFuturesSnapshot(state) {
  if (typeof Futures.getFuturesSnapshot === 'function') {
    return Futures.getFuturesSnapshot(state);
  }

  const openContracts = typeof Futures.getOpenContracts === 'function' ? Futures.getOpenContracts(state) : [];
  const closedContracts = typeof Futures.getClosedContracts === 'function' ? Futures.getClosedContracts(state) : [];
  const totalUnrealizedPnl = openContracts.reduce(function (sum, contract) {
    return sum + (contract.unrealizedPnl || 0);
  }, 0);

  return {
    openContractCount: openContracts.length,
    closedContractCount: closedContracts.length,
    totalMarginLocked: openContracts.reduce(function (sum, contract) {
      return sum + (contract.margin || 0);
    }, 0),
    totalUnrealizedPnl: totalUnrealizedPnl,
    netWorthAdjustment: totalUnrealizedPnl,
    expiringSoonCount: openContracts.filter(function (contract) {
      return (contract.daysLeft || 0) <= 2;
    }).length,
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

function _calcTradeInvestmentValue(state) {
  if (!state.tradeInvestments || typeof state.tradeInvestments !== 'object') return 0;
  return Object.keys(state.tradeInvestments).reduce(function (sum, systemId) {
    const investment = state.tradeInvestments[systemId];
    return sum + ((investment && investment.amount) || 0);
  }, 0);
}
