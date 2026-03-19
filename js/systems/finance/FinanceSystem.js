import { SYSTEMS, findSystem } from '../../data/systems.js';
import { SHIP_TYPES } from '../../data/ships.js';
import { GOODS } from '../../data/goods.js';
import * as Economy from '../economy/Economy.js';

const DEFAULT_CREDIT_RATING = 620;
const MIN_CREDIT_RATING = 300;
const MAX_CREDIT_RATING = 850;
const DEFAULT_INVESTMENT_AMOUNT = 5000;

const LOAN_TIERS = [
  { id: 'starter', name: '星港周转贷', amount: 5000, termDays: 12, dailyInterestRate: 0.012 },
  { id: 'merchant', name: '商路经营贷', amount: 15000, termDays: 20, dailyInterestRate: 0.015 },
  { id: 'capital', name: '枢纽扩张贷', amount: 40000, termDays: 30, dailyInterestRate: 0.018 },
];

const INSURANCE_PRODUCTS = {
  hull: { id: 'hull', name: '船体维修险', premiumRate: 0.08, deductibleRate: 0.15, durationDays: 20 },
  cargo: { id: 'cargo', name: '货舱货损险', premiumRate: 0.06, deductibleRate: 0.10, durationDays: 15 },
  fleet: { id: 'fleet', name: '舰船全损险', premiumRate: 0.12, deductibleRate: 0.20, durationDays: 25 },
};

const FUTURES_CONFIG = {
  contractDurations: [7, 15, 30],  // 可选的合约期限（天数）
  marginRate: 0.15,                // 保证金比例（15%）
  maintenanceMarginRate: 0.10,     // 维持保证金比例（10%）
  liquidationFee: 0.02,            // 强平手续费（2%）
  closingFee: 0.005,               // 平仓手续费（0.5%）
  maxPositionsPerGood: 3,          // 每种商品最多持仓数
};

function _isValidFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function _ensureFinanceState(state) {
  if (!_isValidFiniteNumber(state.creditRating)) {
    state.creditRating = DEFAULT_CREDIT_RATING;
  }
  if (!Array.isArray(state.loans)) state.loans = [];
  if (!state.stockPortfolio || typeof state.stockPortfolio !== 'object' || Array.isArray(state.stockPortfolio)) {
    state.stockPortfolio = {};
  }
  if (!state.stockMarket || typeof state.stockMarket !== 'object' || Array.isArray(state.stockMarket) || Object.keys(state.stockMarket).length === 0) {
    state.stockMarket = _createDefaultStockMarket();
  }
  if (!state.tradeInvestments || typeof state.tradeInvestments !== 'object' || Array.isArray(state.tradeInvestments)) {
    state.tradeInvestments = {};
  }
  if (!state.insurancePolicies || typeof state.insurancePolicies !== 'object' || Array.isArray(state.insurancePolicies)) {
    state.insurancePolicies = {};
  }
  if (!Array.isArray(state.insuranceClaims)) state.insuranceClaims = [];
  if (!Array.isArray(state.futuresContracts)) state.futuresContracts = [];
  if (!_isValidFiniteNumber(state.financeLastProcessedDay)) {
    state.financeLastProcessedDay = Math.max(1, state.day || 1);
  }
  state.creditRating = Math.max(MIN_CREDIT_RATING, Math.min(MAX_CREDIT_RATING, Math.round(state.creditRating)));
  _hydrateStockMarket(state);
  return state;
}

function _createDefaultStockMarket() {
  const market = {};
  SYSTEMS.slice(0, 6).forEach(function (system, index) {
    const basePrice = Math.max(30, Math.round(30 + (system.marketDepth || 200) / 5 + index * 8));
    market['stock_' + system.id] = {
      id: 'stock_' + system.id,
      systemId: system.id,
      name: system.name + ' 交易指数',
      price: basePrice,
      basePrice: basePrice,
      dividendYield: 0.01 + (index * 0.0025),
      volatility: 0.6 + (index * 0.08),
      lastPrice: basePrice,
    };
  });
  return market;
}

function _hydrateStockMarket(state) {
  const defaults = _createDefaultStockMarket();
  Object.keys(defaults).forEach(function (stockId) {
    if (!state.stockMarket[stockId] || typeof state.stockMarket[stockId] !== 'object') {
      state.stockMarket[stockId] = defaults[stockId];
      return;
    }
    const current = state.stockMarket[stockId];
    current.id = stockId;
    current.systemId = current.systemId || defaults[stockId].systemId;
    current.name = current.name || defaults[stockId].name;
    current.basePrice = Math.max(10, Math.round(current.basePrice || defaults[stockId].basePrice));
    current.price = Math.max(10, Math.round(current.price || current.basePrice));
    current.lastPrice = Math.max(10, Math.round(current.lastPrice || current.price));
    current.dividendYield = typeof current.dividendYield === 'number' ? current.dividendYield : defaults[stockId].dividendYield;
    current.volatility = typeof current.volatility === 'number' ? current.volatility : defaults[stockId].volatility;
  });
}

function _generateId(prefix, state, collection) {
  return prefix + '_' + (state.day || 1) + '_' + (collection.length + 1);
}

function _getCargoMarketValue(state) {
  const cargo = state && state.cargo ? state.cargo : {};
  return Object.keys(cargo).reduce(function (sum, goodId) {
    const qty = cargo[goodId] || 0;
    if (qty <= 0) return sum;
    return sum + Economy.getSellPrice(state.currentSystem, goodId, state) * qty;
  }, 0);
}

function _getShipReplacementValue(state) {
  const fleet = Array.isArray(state.fleet) ? state.fleet : [];
  const ship = fleet[state.activeShipIndex || 0] || fleet[0];
  if (!ship) return 5000;
  const shipType = SHIP_TYPES.find(function (entry) { return entry.id === ship.typeId; });
  return shipType ? (shipType.cost || shipType.sellValue || 5000) : 5000;
}

function _getHullDamageValue(state) {
  const maxHull = Math.max(1, state.maxHull || state.shipHull || 100);
  const hull = Math.max(0, state.shipHull || 0);
  const lostRatio = Math.max(0, maxHull - hull) / maxHull;
  return Math.round(_getShipReplacementValue(state) * lostRatio);
}

function _getFleetDamageValue(state) {
  const maxHull = Math.max(1, state.maxHull || state.shipHull || 100);
  const hull = Math.max(0, state.shipHull || 0);
  if (hull > maxHull * 0.7) return 0;
  return Math.round(_getShipReplacementValue(state) * (1 - (hull / maxHull)) * 0.8);
}

function _getPolicyCoverage(state, policyType) {
  if (policyType === 'cargo') return Math.max(1000, Math.round(_getCargoMarketValue(state) * 1.2));
  if (policyType === 'fleet') return Math.max(3000, Math.round(_getShipReplacementValue(state) * 0.9));
  return Math.max(1500, Math.round(_getShipReplacementValue(state) * 0.75));
}

function _getPolicyBaseline(state, policyType) {
  if (policyType === 'cargo') return { insuredCargoValue: _getCargoMarketValue(state) };
  if (policyType === 'fleet') return { insuredShipValue: _getShipReplacementValue(state), insuredHull: state.shipHull || state.maxHull || 100 };
  return { insuredHull: state.shipHull || state.maxHull || 100 };
}

function _refreshPolicyBaseline(policy, state) {
  Object.assign(policy, _getPolicyBaseline(state, policy.type));
}

function _estimateTradeInvestmentYield(systemId, state) {
  const system = findSystem(systemId);
  const cycle = typeof Economy.getEconomyCycle === 'function' ? Economy.getEconomyCycle() : { priceMod: 1 };
  const depthMod = system ? Math.min(1.25, Math.max(0.85, (system.marketDepth || 200) / 220)) : 1;
  const cycleMod = Math.min(1.15, Math.max(0.85, cycle.priceMod || 1));
  return 0.004 * depthMod * cycleMod;
}

function _updateCreditRating(state, delta) {
  _ensureFinanceState(state);
  state.creditRating = Math.max(MIN_CREDIT_RATING, Math.min(MAX_CREDIT_RATING, Math.round((state.creditRating || DEFAULT_CREDIT_RATING) + delta)));
}

function _getActiveLoans(state) {
  return state.loans.filter(function (loan) { return loan.status === 'active' && loan.balance > 0; });
}

function _getPolicyClaimableAmount(state, policyType) {
  const policy = state.insurancePolicies[policyType];
  if (!policy || policy.active === false) return 0;

  let rawLoss = 0;
  if (policyType === 'cargo') {
    rawLoss = Math.max(0, (policy.insuredCargoValue || 0) - _getCargoMarketValue(state));
  } else if (policyType === 'fleet') {
    rawLoss = _getFleetDamageValue(state);
  } else {
    rawLoss = _getHullDamageValue(state);
  }

  const remainingCover = Math.max(0, (policy.coverage || 0) - (policy.totalClaimsPaid || 0));
  return Math.max(0, Math.min(remainingCover, rawLoss));
}

function _processLoanDay(state, day, msgs) {
  _getActiveLoans(state).forEach(function (loan) {
    const interest = Math.max(1, Math.round(loan.balance * loan.dailyInterestRate));
    loan.balance += interest;
    loan.accruedInterest = (loan.accruedInterest || 0) + interest;
    loan.remainingDays = Math.max(0, (loan.remainingDays || 0) - 1);

    const scheduledPayment = Math.min(loan.balance, loan.dailyPayment || 0);
    if (scheduledPayment > 0) {
      if ((state.credits || 0) >= scheduledPayment) {
        state.credits -= scheduledPayment;
        loan.balance -= scheduledPayment;
        loan.totalPaid = (loan.totalPaid || 0) + scheduledPayment;
        msgs.push({ text: '🏦 ' + loan.name + ' 已自动扣款 ' + scheduledPayment.toLocaleString() + ' 积分。', type: 'info' });
      } else {
        loan.missedPayments = (loan.missedPayments || 0) + 1;
        loan.penaltyCount = (loan.penaltyCount || 0) + 1;
        loan.balance += Math.max(50, Math.round(scheduledPayment * 0.08));
        _updateCreditRating(state, -18);
        msgs.push({ text: '⚠️ ' + loan.name + ' 扣款失败，信用评级下降至 ' + state.creditRating + '。', type: 'error' });
      }
    }

    if (loan.balance <= 0) {
      loan.balance = 0;
      loan.status = 'paid';
      loan.closedDay = day;
      _updateCreditRating(state, 24);
      msgs.push({ text: '✅ 贷款「' + loan.name + '」已全部还清，信用评级提升至 ' + state.creditRating + '。', type: 'upgrade' });
      return;
    }

    if (loan.remainingDays === 0 && loan.balance > 0) {
      loan.remainingDays = 1;
      loan.dailyInterestRate = Number((loan.dailyInterestRate * 1.12).toFixed(4));
      _updateCreditRating(state, -10);
      msgs.push({ text: '📉 ' + loan.name + ' 已进入展期，后续利率上调。', type: 'error' });
    }
  });
}

function _processStockDay(state, day, msgs) {
  const cycle = typeof Economy.getEconomyCycle === 'function' ? Economy.getEconomyCycle() : { priceMod: 1 };
  Object.keys(state.stockMarket).forEach(function (stockId) {
    const stock = state.stockMarket[stockId];
    const seed = _hashCode(stockId + ':' + day);
    const drift = (((seed % 7) - 3) / 100) * (stock.volatility || 1);
    const cycleImpact = ((cycle.priceMod || 1) - 1) * 0.35;
    stock.lastPrice = stock.price;
    stock.price = Math.max(10, Math.round(stock.price * (1 + drift + cycleImpact)));

    const holding = state.stockPortfolio[stockId];
    if (holding && holding.shares > 0 && day % 5 === 0) {
      const dividend = Math.max(1, Math.round(holding.shares * stock.price * stock.dividendYield));
      state.credits += dividend;
      holding.totalDividends = (holding.totalDividends || 0) + dividend;
      msgs.push({ text: '📈 ' + stock.name + ' 派发股息 ' + dividend.toLocaleString() + ' 积分。', type: 'info' });
    }
  });
}

function _processTradeInvestmentDay(state, msgs) {
  Object.keys(state.tradeInvestments).forEach(function (systemId) {
    const investment = state.tradeInvestments[systemId];
    if (!investment || (investment.amount || 0) <= 0) return;
    const payout = Math.max(1, Math.round(investment.amount * _estimateTradeInvestmentYield(systemId, state)));
    investment.totalDividends = (investment.totalDividends || 0) + payout;
    investment.lastDividend = payout;
    state.credits += payout;
    const system = findSystem(systemId);
    msgs.push({ text: '🏪 ' + (system ? system.name : systemId) + ' 贸易站投资分红 +' + payout.toLocaleString() + '。', type: 'info' });
  });
}

function _processInsuranceDay(state, day, msgs) {
  Object.keys(state.insurancePolicies).forEach(function (policyType) {
    const policy = state.insurancePolicies[policyType];
    if (!policy || policy.active === false) return;
    if ((policy.expiryDay || day) < day) {
      policy.active = false;
      msgs.push({ text: '🛡️ ' + policy.name + ' 已到期，请重新投保。', type: 'info' });
    }
  });

  state.insuranceClaims.forEach(function (claim) {
    if (!claim || claim.status !== 'pending' || claim.processDay > day) return;
    const policy = state.insurancePolicies[claim.policyType];
    if (!policy || policy.active === false) {
      claim.status = 'rejected';
      claim.decisionDay = day;
      return;
    }
    claim.status = 'paid';
    claim.decisionDay = day;
    state.credits += claim.approvedAmount;
    policy.totalClaimsPaid = (policy.totalClaimsPaid || 0) + claim.approvedAmount;
    msgs.push({ text: '🧾 ' + policy.name + ' 理赔到账 ' + claim.approvedAmount.toLocaleString() + ' 积分。', type: 'upgrade' });
  });
}

function _processFuturesDay(state, day, msgs) {
  const activeContracts = state.futuresContracts.filter(function (c) { return c.status === 'active'; });

  activeContracts.forEach(function (contract) {
    // 更新当前市场价格
    const currentPrice = Economy.getBuyPrice(state.currentSystem, contract.goodId, state);
    contract.currentPrice = currentPrice;

    // 计算当前盈亏
    const priceDiff = contract.direction === 'long'
      ? (currentPrice - contract.openPrice)
      : (contract.openPrice - currentPrice);
    const unrealizedPnL = priceDiff * contract.quantity;
    contract.unrealizedPnL = unrealizedPnL;

    // 计算保证金使用率
    const marginUsed = contract.margin;
    const equity = marginUsed + unrealizedPnL;
    const maintenanceMargin = contract.openPrice * contract.quantity * FUTURES_CONFIG.maintenanceMarginRate;

    // 检查是否需要强制平仓
    if (equity < maintenanceMargin) {
      const liquidationFee = Math.round(contract.margin * FUTURES_CONFIG.liquidationFee);
      const returnAmount = Math.max(0, equity - liquidationFee);

      contract.status = 'liquidated';
      contract.closeDay = day;
      contract.closePrice = currentPrice;
      contract.realizedPnL = unrealizedPnL - liquidationFee;

      state.credits += returnAmount;

      msgs.push({
        text: '⚠️ 期货合约「' + contract.goodId + '」因保证金不足被强制平仓，亏损 ' +
              Math.abs(contract.realizedPnL).toLocaleString() + ' 积分。',
        type: 'error'
      });
      return;
    }

    // 检查是否到期需要交割
    if (day >= contract.expiryDay) {
      const closingFee = Math.round(contract.openPrice * contract.quantity * FUTURES_CONFIG.closingFee);
      const netPnL = unrealizedPnL - closingFee;

      contract.status = 'settled';
      contract.closeDay = day;
      contract.closePrice = currentPrice;
      contract.realizedPnL = netPnL;

      const returnAmount = contract.margin + netPnL;
      state.credits += returnAmount;

      if (netPnL > 0) {
        msgs.push({
          text: '📊 期货合约「' + contract.goodId + '」到期交割，盈利 ' +
                netPnL.toLocaleString() + ' 积分。',
          type: 'upgrade'
        });
      } else {
        msgs.push({
          text: '📊 期货合约「' + contract.goodId + '」到期交割，亏损 ' +
                Math.abs(netPnL).toLocaleString() + ' 积分。',
          type: 'info'
        });
      }
    }
  });
}

function _getActiveFuturesContracts(state) {
  return state.futuresContracts.filter(function (c) { return c.status === 'active'; });
}

function _countPositions(state, goodId) {
  return _getActiveFuturesContracts(state).filter(function (c) { return c.goodId === goodId; }).length;
}

// 生成稳定伪随机种子，用于按“股票代码 + 天数”推进可复现的股价波动。
function _hashCode(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function init(state) {
  _ensureFinanceState(state);
  state.financeLastProcessedDay = Math.max(1, state.day || 1);
}

export function getOverview(state) {
  _ensureFinanceState(state);
  const activeLoans = _getActiveLoans(state);
  const outstanding = activeLoans.reduce(function (sum, loan) { return sum + loan.balance; }, 0);
  const stockValue = Object.keys(state.stockPortfolio).reduce(function (sum, stockId) {
    const holding = state.stockPortfolio[stockId];
    const listing = state.stockMarket[stockId];
    return sum + ((holding && listing) ? (holding.shares * listing.price) : 0);
  }, 0);
  const investmentValue = Object.keys(state.tradeInvestments).reduce(function (sum, systemId) {
    return sum + (state.tradeInvestments[systemId].amount || 0);
  }, 0);
  const activePolicies = Object.keys(state.insurancePolicies).filter(function (key) {
    return state.insurancePolicies[key] && state.insurancePolicies[key].active !== false;
  }).length;
  const pendingClaims = state.insuranceClaims.filter(function (claim) { return claim.status === 'pending'; }).length;

  return {
    creditRating: state.creditRating,
    activeLoanCount: activeLoans.length,
    outstandingLoanBalance: outstanding,
    stockValue: stockValue,
    tradeInvestmentValue: investmentValue,
    activePolicies: activePolicies,
    pendingClaims: pendingClaims,
  };
}

export function getLoanOffers(state) {
  _ensureFinanceState(state);
  const ratingFactor = Math.max(0.85, Math.min(1.35, state.creditRating / DEFAULT_CREDIT_RATING));
  return LOAN_TIERS.map(function (tier) {
    const principal = Math.round(tier.amount * ratingFactor);
    const totalRepayment = Math.round(principal * (1 + tier.dailyInterestRate * tier.termDays));
    return {
      id: tier.id,
      name: tier.name,
      principal: principal,
      termDays: tier.termDays,
      dailyInterestRate: tier.dailyInterestRate,
      totalRepayment: totalRepayment,
      dailyPayment: Math.max(1, Math.ceil(totalRepayment / tier.termDays)),
      available: _getActiveLoans(state).length < 3,
    };
  });
}

export function takeLoan(state, offerId) {
  _ensureFinanceState(state);
  const offer = getLoanOffers(state).find(function (entry) { return entry.id === offerId; });
  if (!offer) {
    return { ok: false, msgs: [{ text: '🏦 未找到该贷款方案。', type: 'error' }] };
  }
  if (_getActiveLoans(state).length >= 3) {
    return { ok: false, msgs: [{ text: '🏦 当前未结清贷款过多，银行拒绝继续放款。', type: 'error' }] };
  }

  const loan = {
    id: _generateId('loan', state, state.loans),
    offerId: offer.id,
    name: offer.name,
    principal: offer.principal,
    balance: offer.totalRepayment,
    totalRepayment: offer.totalRepayment,
    totalPaid: 0,
    dailyInterestRate: offer.dailyInterestRate,
    dailyPayment: offer.dailyPayment,
    termDays: offer.termDays,
    remainingDays: offer.termDays,
    originatedDay: state.day || 1,
    accruedInterest: Math.max(0, offer.totalRepayment - offer.principal),
    status: 'active',
    missedPayments: 0,
    penaltyCount: 0,
  };

  state.loans.push(loan);
  state.credits += offer.principal;
  _updateCreditRating(state, -6);
  return {
    ok: true,
    msgs: [{ text: '🏦 已获批「' + offer.name + '」：到账 ' + offer.principal.toLocaleString() + ' 积分。', type: 'upgrade' }],
    meta: { loanId: loan.id, principal: offer.principal },
  };
}

export function repayLoan(state, loanId, amount) {
  _ensureFinanceState(state);
  const loan = state.loans.find(function (entry) { return entry.id === loanId && entry.status === 'active'; });
  if (!loan) {
    return { ok: false, msgs: [{ text: '🏦 未找到可还款的贷款。', type: 'error' }] };
  }

  const desiredAmount = typeof amount === 'number' && amount > 0
    ? amount
    : Math.min(loan.balance, loan.dailyPayment || loan.balance, state.credits || 0);
  const payment = Math.max(0, Math.min(loan.balance, Math.floor(desiredAmount)));
  if (payment <= 0) {
    return { ok: false, msgs: [{ text: '💰 当前没有足够积分执行还款。', type: 'error' }] };
  }
  if ((state.credits || 0) < payment) {
    return { ok: false, msgs: [{ text: '💰 信用积分不足，无法完成该笔还款。', type: 'error' }] };
  }

  state.credits -= payment;
  loan.balance -= payment;
  loan.totalPaid = (loan.totalPaid || 0) + payment;

  if (loan.balance <= 0) {
    loan.balance = 0;
    loan.status = 'paid';
    loan.closedDay = state.day || 1;
    _updateCreditRating(state, 18);
    return {
      ok: true,
      msgs: [{ text: '✅ 已结清「' + loan.name + '」，信用评级提升至 ' + state.creditRating + '。', type: 'upgrade' }],
      meta: { loanId: loan.id, payment: payment },
    };
  }

  return {
    ok: true,
    msgs: [{ text: '💳 已向「' + loan.name + '」偿还 ' + payment.toLocaleString() + ' 积分。', type: 'info' }],
    meta: { loanId: loan.id, payment: payment },
  };
}

export function getStockListings(state) {
  _ensureFinanceState(state);
  return Object.keys(state.stockMarket).map(function (stockId) {
    const listing = state.stockMarket[stockId];
    const holding = state.stockPortfolio[stockId] || { shares: 0, avgCost: 0, totalDividends: 0 };
    return Object.assign({}, listing, {
      shares: holding.shares || 0,
      avgCost: holding.avgCost || 0,
      totalDividends: holding.totalDividends || 0,
    });
  }).sort(function (a, b) {
    return (b.price || 0) - (a.price || 0);
  });
}

export function buyStock(state, stockId, shares) {
  _ensureFinanceState(state);
  const listing = state.stockMarket[stockId];
  const quantity = Math.max(1, Math.floor(shares || 1));
  if (!listing) {
    return { ok: false, msgs: [{ text: '📈 未知股票代码。', type: 'error' }] };
  }
  const totalCost = listing.price * quantity;
  if ((state.credits || 0) < totalCost) {
    return { ok: false, msgs: [{ text: '💰 积分不足，无法买入股票。', type: 'error' }] };
  }

  const holding = state.stockPortfolio[stockId] || { shares: 0, avgCost: 0, totalDividends: 0 };
  const currentCost = (holding.avgCost || 0) * (holding.shares || 0);
  holding.shares = (holding.shares || 0) + quantity;
  holding.avgCost = Math.round((currentCost + totalCost) / Math.max(1, holding.shares));
  state.stockPortfolio[stockId] = holding;
  state.credits -= totalCost;

  return {
    ok: true,
    msgs: [{ text: '📈 买入 ' + listing.name + ' ×' + quantity + '，花费 ' + totalCost.toLocaleString() + ' 积分。', type: 'buy' }],
    meta: { stockId: stockId, shares: quantity, totalCost: totalCost },
  };
}

export function sellStock(state, stockId, shares) {
  _ensureFinanceState(state);
  const listing = state.stockMarket[stockId];
  const holding = state.stockPortfolio[stockId];
  const quantity = Math.max(1, Math.floor(shares || 1));
  if (!listing || !holding || (holding.shares || 0) < quantity) {
    return { ok: false, msgs: [{ text: '📉 持仓不足，无法卖出。', type: 'error' }] };
  }

  const totalEarned = listing.price * quantity;
  state.credits += totalEarned;
  holding.shares -= quantity;
  if (holding.shares <= 0) {
    delete state.stockPortfolio[stockId];
  }

  return {
    ok: true,
    msgs: [{ text: '📉 卖出 ' + listing.name + ' ×' + quantity + '，获得 ' + totalEarned.toLocaleString() + ' 积分。', type: 'sell' }],
    meta: { stockId: stockId, shares: quantity, totalEarned: totalEarned },
  };
}

export function getTradeInvestmentOptions(state) {
  _ensureFinanceState(state);
  const visited = state.visitedSystems || [state.currentSystem];
  return visited.slice(0, 6).map(function (systemId) {
    const system = findSystem(systemId);
    if (!system) return null;
    return {
      systemId: systemId,
      name: system.name,
      expectedYieldRate: _estimateTradeInvestmentYield(systemId, state),
      investedAmount: state.tradeInvestments[systemId] ? (state.tradeInvestments[systemId].amount || 0) : 0,
      suggestedAmount: DEFAULT_INVESTMENT_AMOUNT,
    };
  }).filter(Boolean).sort(function (a, b) {
    return b.expectedYieldRate - a.expectedYieldRate;
  });
}

export function investInTradeStation(state, systemId, amount) {
  _ensureFinanceState(state);
  const system = findSystem(systemId);
  const investmentAmount = Math.max(1000, Math.floor(amount || DEFAULT_INVESTMENT_AMOUNT));
  if (!system) {
    return { ok: false, msgs: [{ text: '🏪 未找到可投资的贸易站。', type: 'error' }] };
  }
  if ((state.credits || 0) < investmentAmount) {
    return { ok: false, msgs: [{ text: '💰 积分不足，无法进行贸易站投资。', type: 'error' }] };
  }

  const investment = state.tradeInvestments[systemId] || {
    systemId: systemId,
    amount: 0,
    startedDay: state.day || 1,
    totalDividends: 0,
    lastDividend: 0,
  };
  investment.amount += investmentAmount;
  state.tradeInvestments[systemId] = investment;
  state.credits -= investmentAmount;

  return {
    ok: true,
    msgs: [{ text: '🏪 已向 ' + system.name + ' 贸易站追加投资 ' + investmentAmount.toLocaleString() + ' 积分。', type: 'upgrade' }],
    meta: { systemId: systemId, amount: investmentAmount },
  };
}

export function getInsuranceProducts(state) {
  _ensureFinanceState(state);
  return Object.keys(INSURANCE_PRODUCTS).map(function (policyType) {
    const product = INSURANCE_PRODUCTS[policyType];
    const coverage = _getPolicyCoverage(state, policyType);
    const premium = Math.max(200, Math.round(coverage * product.premiumRate));
    const activePolicy = state.insurancePolicies[policyType] || null;
    return {
      id: product.id,
      name: product.name,
      coverage: coverage,
      premium: premium,
      deductibleRate: product.deductibleRate,
      durationDays: product.durationDays,
      active: !!(activePolicy && activePolicy.active !== false && (activePolicy.expiryDay || 0) >= (state.day || 1)),
      claimableAmount: _getPolicyClaimableAmount(state, policyType),
    };
  });
}

export function purchaseInsurance(state, policyType) {
  _ensureFinanceState(state);
  const product = INSURANCE_PRODUCTS[policyType];
  if (!product) {
    return { ok: false, msgs: [{ text: '🛡️ 未知保险方案。', type: 'error' }] };
  }

  const catalogEntry = getInsuranceProducts(state).find(function (item) { return item.id === policyType; });
  if (!catalogEntry) {
    return { ok: false, msgs: [{ text: '🛡️ 当前无法购买该险种。', type: 'error' }] };
  }
  if (catalogEntry.active) {
    return { ok: false, msgs: [{ text: '🛡️ ' + catalogEntry.name + ' 已生效，无需重复投保。', type: 'info' }] };
  }
  if ((state.credits || 0) < catalogEntry.premium) {
    return { ok: false, msgs: [{ text: '💰 积分不足，无法支付保险保费。', type: 'error' }] };
  }

  state.credits -= catalogEntry.premium;
  state.insurancePolicies[policyType] = Object.assign({
    type: policyType,
    name: catalogEntry.name,
    premium: catalogEntry.premium,
    coverage: catalogEntry.coverage,
    deductibleRate: catalogEntry.deductibleRate,
    active: true,
    startedDay: state.day || 1,
    expiryDay: (state.day || 1) + catalogEntry.durationDays,
    totalClaimsPaid: 0,
  }, _getPolicyBaseline(state, policyType));

  return {
    ok: true,
    msgs: [{ text: '🛡️ 已购买 ' + catalogEntry.name + '，保费 ' + catalogEntry.premium.toLocaleString() + ' 积分。', type: 'upgrade' }],
    meta: { policyType: policyType, premium: catalogEntry.premium },
  };
}

export function submitClaim(state, policyType, requestedAmount, details) {
  _ensureFinanceState(state);
  const policy = state.insurancePolicies[policyType];
  if (!policy || policy.active === false) {
    return { ok: false, msgs: [{ text: '🧾 该险种当前未生效，无法发起理赔。', type: 'error' }] };
  }
  if (state.insuranceClaims.some(function (claim) { return claim.policyType === policyType && claim.status === 'pending'; })) {
    return { ok: false, msgs: [{ text: '🧾 该险种已有待处理理赔，请等待审核。', type: 'info' }] };
  }

  const claimable = _getPolicyClaimableAmount(state, policyType);
  const requested = Math.min(claimable, Math.max(0, Math.floor(typeof requestedAmount === 'number' ? requestedAmount : claimable)));
  if (requested <= 0) {
    return { ok: false, msgs: [{ text: '🧾 当前没有可理赔的损失。', type: 'info' }] };
  }

  const approved = Math.max(0, Math.round(requested * (1 - (policy.deductibleRate || 0))));
  const claim = {
    id: _generateId('claim', state, state.insuranceClaims),
    policyType: policyType,
    requestedAmount: requested,
    approvedAmount: approved,
    status: 'pending',
    filedDay: state.day || 1,
    processDay: (state.day || 1) + 1,
    details: details || '自动提交理赔申请',
  };
  state.insuranceClaims.push(claim);
  policy.lastClaimDay = state.day || 1;
  _refreshPolicyBaseline(policy, state);

  return {
    ok: true,
    msgs: [{ text: '🧾 已提交 ' + policy.name + ' 理赔申请，预计次日到账 ' + approved.toLocaleString() + ' 积分。', type: 'info' }],
    meta: { claimId: claim.id, approvedAmount: approved },
  };
}

export function getNetWorthAdjustment(state) {
  _ensureFinanceState(state);
  const stockValue = getOverview(state).stockValue;
  const tradeInvestmentValue = getOverview(state).tradeInvestmentValue;
  const loanLiability = getOverview(state).outstandingLoanBalance;
  const futuresMargin = _getActiveFuturesContracts(state).reduce(function (sum, c) {
    return sum + c.margin + (c.unrealizedPnL || 0);
  }, 0);
  return stockValue + tradeInvestmentValue + futuresMargin - loanLiability;
}

export function getFuturesAvailableGoods(state) {
  _ensureFinanceState(state);

  return GOODS.filter(function (good) {
    // 排除燃料，只允许可交易商品
    return good.id !== 'fuel';
  }).map(function (good) {
    const currentPrice = Economy.getBuyPrice(state.currentSystem, good.id, state);
    const activePositions = _countPositions(state, good.id);

    return {
      goodId: good.id,
      name: good.name,
      emoji: good.emoji,
      currentPrice: currentPrice,
      activePositions: activePositions,
      maxPositions: FUTURES_CONFIG.maxPositionsPerGood,
      canOpenPosition: activePositions < FUTURES_CONFIG.maxPositionsPerGood,
    };
  });
}

export function getFuturesContractOptions(state, goodId) {
  _ensureFinanceState(state);
  const currentPrice = Economy.getBuyPrice(state.currentSystem, goodId, state);

  return FUTURES_CONFIG.contractDurations.map(function (duration) {
    const margin = Math.round(currentPrice * 10 * FUTURES_CONFIG.marginRate); // 默认10单位
    const expiryDay = (state.day || 1) + duration;

    return {
      duration: duration,
      expiryDay: expiryDay,
      marginRequired: margin,
      currentPrice: currentPrice,
    };
  });
}

export function openFuturesPosition(state, goodId, direction, quantity, duration) {
  _ensureFinanceState(state);

  // 验证参数
  if (!goodId || (direction !== 'long' && direction !== 'short')) {
    return { ok: false, msgs: [{ text: '📊 无效的合约参数。', type: 'error' }] };
  }

  const qty = Math.max(1, Math.floor(quantity || 10));
  const dur = FUTURES_CONFIG.contractDurations.includes(duration) ? duration : FUTURES_CONFIG.contractDurations[0];

  // 检查持仓限制
  if (_countPositions(state, goodId) >= FUTURES_CONFIG.maxPositionsPerGood) {
    return {
      ok: false,
      msgs: [{ text: '📊 该商品期货持仓已达上限。', type: 'error' }]
    };
  }

  // 计算保证金
  const openPrice = Economy.getBuyPrice(state.currentSystem, goodId, state);
  const margin = Math.round(openPrice * qty * FUTURES_CONFIG.marginRate);

  // 检查资金
  if ((state.credits || 0) < margin) {
    return {
      ok: false,
      msgs: [{ text: '💰 积分不足，无法开立期货合约。需要保证金 ' + margin.toLocaleString() + '。', type: 'error' }]
    };
  }

  // 创建合约
  const contract = {
    id: _generateId('futures', state, state.futuresContracts),
    goodId: goodId,
    direction: direction,
    quantity: qty,
    openPrice: openPrice,
    currentPrice: openPrice,
    margin: margin,
    openDay: state.day || 1,
    expiryDay: (state.day || 1) + dur,
    duration: dur,
    status: 'active',
    unrealizedPnL: 0,
    realizedPnL: 0,
  };

  state.futuresContracts.push(contract);
  state.credits -= margin;

  const directionText = direction === 'long' ? '做多' : '做空';

  return {
    ok: true,
    msgs: [{
      text: '📊 已开立期货合约：' + directionText + ' ' + goodId + ' ×' + qty +
            '，保证金 ' + margin.toLocaleString() + '，' + dur + '天后到期。',
      type: 'info'
    }],
    meta: { contractId: contract.id, margin: margin },
  };
}

export function closeFuturesPosition(state, contractId) {
  _ensureFinanceState(state);

  const contract = state.futuresContracts.find(function (c) {
    return c.id === contractId && c.status === 'active';
  });

  if (!contract) {
    return { ok: false, msgs: [{ text: '📊 未找到有效的期货合约。', type: 'error' }] };
  }

  // 获取当前价格
  const currentPrice = Economy.getBuyPrice(state.currentSystem, contract.goodId, state);

  // 计算盈亏
  const priceDiff = contract.direction === 'long'
    ? (currentPrice - contract.openPrice)
    : (contract.openPrice - currentPrice);
  const grossPnL = priceDiff * contract.quantity;
  const closingFee = Math.round(contract.openPrice * contract.quantity * FUTURES_CONFIG.closingFee);
  const netPnL = grossPnL - closingFee;

  // 更新合约状态
  contract.status = 'closed';
  contract.closeDay = state.day || 1;
  contract.closePrice = currentPrice;
  contract.realizedPnL = netPnL;

  // 返还保证金和盈亏
  const returnAmount = contract.margin + netPnL;
  state.credits += returnAmount;

  if (netPnL > 0) {
    return {
      ok: true,
      msgs: [{
        text: '📊 已平仓期货合约「' + contract.goodId + '」，盈利 ' +
              netPnL.toLocaleString() + ' 积分（含手续费 ' + closingFee + '）。',
        type: 'upgrade'
      }],
      meta: { contractId: contract.id, pnl: netPnL },
    };
  } else {
    return {
      ok: true,
      msgs: [{
        text: '📊 已平仓期货合约「' + contract.goodId + '」，亏损 ' +
              Math.abs(netPnL).toLocaleString() + ' 积分（含手续费 ' + closingFee + '）。',
        type: 'info'
      }],
      meta: { contractId: contract.id, pnl: netPnL },
    };
  }
}

export function getFuturesPositions(state) {
  _ensureFinanceState(state);

  return state.futuresContracts.map(function (contract) {
    if (contract.status === 'active') {
      // 更新当前价格和浮动盈亏
      const currentPrice = Economy.getBuyPrice(state.currentSystem, contract.goodId, state);
      const priceDiff = contract.direction === 'long'
        ? (currentPrice - contract.openPrice)
        : (contract.openPrice - currentPrice);
      const unrealizedPnL = priceDiff * contract.quantity;

      return Object.assign({}, contract, {
        currentPrice: currentPrice,
        unrealizedPnL: unrealizedPnL,
        daysRemaining: Math.max(0, contract.expiryDay - (state.day || 1)),
      });
    }
    return contract;
  });
}

export function getFuturesOverview(state) {
  _ensureFinanceState(state);

  const activeContracts = _getActiveFuturesContracts(state);
  const totalMargin = activeContracts.reduce(function (sum, c) { return sum + c.margin; }, 0);
  const totalUnrealizedPnL = activeContracts.reduce(function (sum, c) {
    const currentPrice = Economy.getBuyPrice(state.currentSystem, c.goodId, state);
    const priceDiff = c.direction === 'long'
      ? (currentPrice - c.openPrice)
      : (c.openPrice - currentPrice);
    return sum + (priceDiff * c.quantity);
  }, 0);

  const closedContracts = state.futuresContracts.filter(function (c) {
    return c.status === 'closed' || c.status === 'settled';
  });
  const totalRealizedPnL = closedContracts.reduce(function (sum, c) {
    return sum + (c.realizedPnL || 0);
  }, 0);

  return {
    activePositions: activeContracts.length,
    totalMargin: totalMargin,
    totalUnrealizedPnL: totalUnrealizedPnL,
    totalRealizedPnL: totalRealizedPnL,
    totalPnL: totalUnrealizedPnL + totalRealizedPnL,
  };
}

export function advanceDay(state) {
  _ensureFinanceState(state);
  if ((state.day || 1) <= state.financeLastProcessedDay) {
    return { ok: true, msgs: [] };
  }

  const processingDay = state.financeLastProcessedDay + 1;
  const msgs = [];
  _processLoanDay(state, processingDay, msgs);
  _processStockDay(state, processingDay, msgs);
  _processTradeInvestmentDay(state, msgs);
  _processInsuranceDay(state, processingDay, msgs);
  _processFuturesDay(state, processingDay, msgs);
  state.financeLastProcessedDay = processingDay;

  return { ok: true, day: processingDay, msgs: msgs };
}
