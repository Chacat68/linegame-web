// js/ui/TradeStationUI.js — 贸易站 / 金融中心标签页渲染
// 依赖：systems/trade/TradeStationSystem.js, systems/finance/FinanceSystem.js
// 导出：render

import {
  TRADE_STATION_MANAGERS,
  TRADE_STATION_STRATEGIES,
} from '../data/tradeStations.js';
import * as Finance from '../systems/finance/FinanceSystem.js';
import * as TradeStation from '../systems/trade/TradeStationSystem.js';

function _getStockPriceDelta(listing) {
  const lastPrice = listing.lastPrice || listing.price || 0;
  return (listing.price || 0) - lastPrice;
}

export function render(state, onBuild, onUpgrade, onHireManager, onSetStrategy, financeActions) {
  const container = document.getElementById('trade-station-list');
  if (!container) return;
  financeActions = financeActions || {};

  const financeOverview = Finance.getOverview(state);
  const loanOffers = Finance.getLoanOffers(state);
  const stockListings = Finance.getStockListings(state).slice(0, 4);
  const tradeInvestments = Finance.getTradeInvestmentOptions(state).slice(0, 4);
  const insuranceProducts = Finance.getInsuranceProducts(state);
  const futuresSnapshot = Finance.getFuturesSnapshot(state);
  const futuresQuotes = futuresSnapshot.quotes;
  const futuresPositions = futuresSnapshot.positions;
  const activeLoans = (state.loans || []).filter(function (loan) { return loan.status === 'active' && loan.balance > 0; });
  const pendingClaims = (state.insuranceClaims || []).filter(function (claim) { return claim.status === 'pending'; });

  const summary = TradeStation.getSummary(state);
  const ownedStations = TradeStation.getOwnedStations(state);
  const buildCandidates = TradeStation.getBuildCandidates(state);

  let html = '';

  html += '<div class="trade-station-summary-card">' +
    '<div class="trade-station-summary-head">' +
      '<span class="trade-station-summary-title">🏦 金融中心</span>' +
      '<span class="trade-station-summary-sub">信用评级 ' + financeOverview.creditRating + '</span>' +
    '</div>' +
    '<div class="trade-station-summary-grid">' +
      '<div class="trade-station-metric"><span class="trade-station-metric-label">贷款余额</span><span class="trade-station-metric-value">' + Math.floor(financeOverview.outstandingLoanBalance).toLocaleString() + '</span></div>' +
      '<div class="trade-station-metric"><span class="trade-station-metric-label">股票市值</span><span class="trade-station-metric-value">' + Math.floor(financeOverview.stockValue).toLocaleString() + '</span></div>' +
      '<div class="trade-station-metric"><span class="trade-station-metric-label">站点投资</span><span class="trade-station-metric-value">' + Math.floor(financeOverview.tradeInvestmentValue).toLocaleString() + '</span></div>' +
      '<div class="trade-station-metric"><span class="trade-station-metric-label">保险/理赔</span><span class="trade-station-metric-value">' + financeOverview.activePolicies + '/' + financeOverview.pendingClaims + '</span></div>' +
    '</div>' +
    '<div class="trade-station-summary-tip">贷款会按天计息并自动扣款；股票与贸易站投资会随天数推进分红；保险理赔将在次日审核发放。</div>' +
    '</div>';

  html += '<div class="trade-station-section-title">🏦 银行贷款</div>';
  if (loanOffers.length === 0) {
    html += '<div class="trade-station-empty">当前暂无可申请的贷款方案。</div>';
  } else {
    html += '<div class="trade-station-choice-row">' + loanOffers.map(function (offer) {
      return '<button class="trade-station-choice-btn' + (offer.available ? '' : ' disabled') + '"' +
        ' data-action="take-loan" data-loan-offer-id="' + offer.id + '"' + (offer.available ? '' : ' disabled') + '>' +
        offer.name + '<span>+' + offer.principal.toLocaleString() + ' / ' + offer.termDays + '天</span></button>';
    }).join('') + '</div>';
  }

  if (activeLoans.length === 0) {
    html += '<div class="trade-station-empty">暂无未结清贷款。</div>';
  } else {
    activeLoans.forEach(function (loan) {
      html += '<div class="trade-station-card">' +
        '<div class="trade-station-card-head">' +
          '<span class="trade-station-card-name">' + loan.name + '</span>' +
          '<span class="trade-station-card-badge">剩余 ' + loan.remainingDays + ' 天</span>' +
        '</div>' +
        '<div class="trade-station-card-meta">余额 ' + Math.floor(loan.balance).toLocaleString() + ' · 日扣款 ' + Math.floor(loan.dailyPayment).toLocaleString() + ' · 利率 ' + (loan.dailyInterestRate * 100).toFixed(2) + '%</div>' +
        '<div class="trade-station-actions">' +
          '<button class="btn-action" data-action="repay-loan" data-loan-id="' + loan.id + '">手动还款</button>' +
        '</div>' +
      '</div>';
    });
  }

  html += '<div class="trade-station-section-title">📈 股票市场</div>';
  html += stockListings.map(function (listing) {
    const delta = _getStockPriceDelta(listing);
    const deltaText = (delta >= 0 ? '+' : '') + delta.toLocaleString();
    return '<div class="trade-station-card">' +
      '<div class="trade-station-card-head">' +
        '<span class="trade-station-card-name">' + listing.name + '</span>' +
        '<span class="trade-station-card-badge">股价 ' + listing.price.toLocaleString() + '</span>' +
      '</div>' +
      '<div class="trade-station-card-meta">持仓 ' + listing.shares + ' 股 · 均价 ' + Math.floor(listing.avgCost || 0).toLocaleString() + ' · 日波动 ' + deltaText + '</div>' +
      '<div class="trade-station-actions">' +
        '<button class="btn-action" data-action="buy-stock" data-stock-id="' + listing.id + '">买入 1 股</button>' +
        '<button class="btn-action' + (listing.shares > 0 ? '' : ' disabled') + '" data-action="sell-stock" data-stock-id="' + listing.id + '"' + (listing.shares > 0 ? '' : ' disabled') + '>卖出 1 股</button>' +
      '</div>' +
    '</div>';
  }).join('');

  const futuresContractSize = futuresQuotes.length > 0 ? futuresQuotes[0].contractSize : 10;
  html += '<div class="trade-station-section-title">📊 期货市场</div>';
  html += '<div class="trade-station-card">' +
    '<div class="trade-station-card-head">' +
      '<span class="trade-station-card-name">保证金占用</span>' +
      '<span class="trade-station-card-badge">' + Math.floor(futuresSnapshot.marginLocked || 0).toLocaleString() + '</span>' +
    '</div>' +
    '<div class="trade-station-card-meta">未结算盈亏 ' + Math.floor(futuresSnapshot.unrealizedPnl || 0).toLocaleString() +
      ' · 合约规模 ×' + futuresContractSize + '</div>' +
  '</div>';
  html += '<div class="trade-station-subsection">行情报价</div>';
  if (futuresQuotes.length === 0) {
    html += '<div class="trade-station-empty">今天暂无可交易的合约，明日再来看看新的行情。</div>';
  } else {
    html += futuresQuotes.map(function (quote) {
      return '<div class="trade-station-card">' +
        '<div class="trade-station-card-head">' +
          '<span class="trade-station-card-name">' + (quote.emoji || '') + ' ' + quote.name + '</span>' +
          '<span class="trade-station-card-badge">锁定价 ' + quote.lockPrice.toLocaleString() + '</span>' +
        '</div>' +
        '<div class="trade-station-card-meta">第 ' + quote.settlementDay + ' 天交割 · 保证金 ' + quote.margin.toLocaleString() + ' · 合约 ×' + quote.contractSize + '</div>' +
        '<div class="trade-station-card-meta">当前 ' + Math.floor(quote.basisPrice).toLocaleString() + ' · 趋势 ' + quote.trendLabel + ' · 波动 ' + quote.volatility + '×</div>' +
        '<div class="trade-station-actions">' +
          '<button class="btn-action" data-action="open-futures" data-direction="long" data-contract-id="' + quote.id + '">做多</button>' +
          '<button class="btn-action" data-action="open-futures" data-direction="short" data-contract-id="' + quote.id + '">做空</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  html += '<div class="trade-station-subsection">我的持仓</div>';
  if (futuresPositions.length === 0) {
    html += '<div class="trade-station-empty">暂无期货持仓，提前锁价可对冲风险或博取差价。</div>';
  } else {
    html += futuresPositions.map(function (pos) {
      const dirLabel = pos.direction === 'short' ? '空头' : '多头';
      return '<div class="trade-station-card">' +
        '<div class="trade-station-card-head">' +
          '<span class="trade-station-card-name">' + (pos.emoji || '') + ' ' + pos.name + '</span>' +
          '<span class="trade-station-card-badge">' + dirLabel + ' · 锁定 ' + pos.lockPrice.toLocaleString() + '</span>' +
        '</div>' +
        '<div class="trade-station-card-meta">现价 ' + Math.floor(pos.currentPrice).toLocaleString() + ' · 未结盈亏 ' + Math.floor(pos.unrealizedPnl).toLocaleString() +
          ' · 结算日 第 ' + pos.settlementDay + ' 天（' + pos.daysToSettlement + ' 天后）</div>' +
        '<div class="trade-station-card-meta">保证金 ' + Math.floor(pos.margin).toLocaleString() + ' · 合约规模 ×' + pos.contractSize + '</div>' +
        '<div class="trade-station-actions">' +
          '<button class="btn-action" data-action="close-futures" data-position-id="' + pos.id + '">提前平仓</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  html += '<div class="trade-station-section-title">🏪 贸易站投资</div>';
  if (tradeInvestments.length === 0) {
    html += '<div class="trade-station-empty">先探索星球，才能解锁新的站点投资标的。</div>';
  } else {
    html += tradeInvestments.map(function (entry) {
      return '<div class="trade-station-card">' +
        '<div class="trade-station-card-head">' +
          '<span class="trade-station-card-name">' + entry.name + '</span>' +
          '<span class="trade-station-card-badge">预估日分红 ' + (entry.expectedYieldRate * 100).toFixed(2) + '%</span>' +
        '</div>' +
        '<div class="trade-station-card-meta">当前已投 ' + Math.floor(entry.investedAmount || 0).toLocaleString() + ' · 建议追加 ' + entry.suggestedAmount.toLocaleString() + '</div>' +
        '<div class="trade-station-actions">' +
          '<button class="btn-action" data-action="invest-trade-station" data-system-id="' + entry.systemId + '">追加投资</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  html += '<div class="trade-station-section-title">🛡️ 保险与理赔</div>';
  html += insuranceProducts.map(function (product) {
    return '<div class="trade-station-card">' +
      '<div class="trade-station-card-head">' +
        '<span class="trade-station-card-name">' + product.name + '</span>' +
        '<span class="trade-station-card-badge">保额 ' + Math.floor(product.coverage).toLocaleString() + '</span>' +
      '</div>' +
      '<div class="trade-station-card-meta">保费 ' + Math.floor(product.premium).toLocaleString() + ' · 免赔 ' + Math.round(product.deductibleRate * 100) + '% · 可赔 ' + Math.floor(product.claimableAmount).toLocaleString() + '</div>' +
      '<div class="trade-station-actions">' +
        '<button class="btn-action' + (product.active ? ' disabled' : '') + '" data-action="purchase-insurance" data-policy-type="' + product.id + '"' + (product.active ? ' disabled' : '') + '>投保</button>' +
        '<button class="btn-action' + (product.claimableAmount > 0 ? '' : ' disabled') + '" data-action="submit-claim" data-policy-type="' + product.id + '"' + (product.claimableAmount > 0 ? '' : ' disabled') + '>申请理赔</button>' +
      '</div>' +
    '</div>';
  }).join('');

  if (pendingClaims.length > 0) {
    html += '<div class="trade-station-subsection">🧾 待处理理赔</div>';
    html += pendingClaims.map(function (claim) {
      return '<div class="trade-station-card-meta">' + claim.policyType + ' · 预计到账 ' + Math.floor(claim.approvedAmount).toLocaleString() + ' · 处理日 第 ' + claim.processDay + ' 天</div>';
    }).join('');
  }

  html += '<div class="trade-station-summary-card">' +
    '<div class="trade-station-summary-head">' +
      '<span class="trade-station-summary-title">🏪 商业版图</span>' +
      '<span class="trade-station-summary-sub">已建 ' + summary.count + ' 座贸易站</span>' +
    '</div>' +
    '<div class="trade-station-summary-grid">' +
      '<div class="trade-station-metric"><span class="trade-station-metric-label">预计日收益</span><span class="trade-station-metric-value">+' + Math.floor(summary.projectedIncome).toLocaleString() + '</span></div>' +
      '<div class="trade-station-metric"><span class="trade-station-metric-label">累计收益</span><span class="trade-station-metric-value">' + Math.floor(summary.totalIncome).toLocaleString() + '</span></div>' +
      '<div class="trade-station-metric"><span class="trade-station-metric-label">管理员</span><span class="trade-station-metric-value">' + summary.managedCount + '/' + summary.count + '</span></div>' +
    '</div>' +
    '<div class="trade-station-summary-tip">每日收益会随当地市场深度、重点商品行情与经济周期自动波动。</div>' +
    '</div>';

  html += '<div class="trade-station-section-title">🏗 建站候选</div>';
  if (buildCandidates.length === 0) {
    html += '<div class="trade-station-empty">先探索更多星球，才能解锁新的建站候选。</div>';
  } else {
    buildCandidates.forEach(function (candidate) {
      html += '<div class="trade-station-build-card">' +
        '<div class="trade-station-card-head">' +
          '<span class="trade-station-card-name">' + candidate.system.name + '</span>' +
          '<span class="trade-station-card-badge">' + candidate.system.typeLabel + '</span>' +
        '</div>' +
        '<div class="trade-station-card-meta">市场深度 ' + (candidate.system.marketDepth || 200) + ' · ' +
          (candidate.isCurrent ? '当前停靠中，可立即投资' : '已访问，可远程规划投资') +
        '</div>' +
        '<div class="trade-station-card-desc">' + candidate.system.description + '</div>' +
        '<button class="btn-action trade-station-build-btn' + (candidate.canAfford ? '' : ' disabled') + '"' +
          ' data-action="build" data-system-id="' + candidate.system.id + '"' +
          (candidate.canAfford ? '' : ' disabled') + '>投资 ' + candidate.buildCost.toLocaleString() + ' 积分</button>' +
      '</div>';
    });
  }

  html += '<div class="trade-station-section-title">📡 已建贸易站</div>';
  if (ownedStations.length === 0) {
    html += '<div class="trade-station-empty">还没有贸易站。先完成第一笔长期投资，建立你的商业节点网络。</div>';
  } else {
    ownedStations.forEach(function (entry) {
      const station = entry.station;
      html += '<div class="trade-station-card">' +
        '<div class="trade-station-card-head">' +
          '<span class="trade-station-card-name">' + entry.system.name + ' 贸易站</span>' +
          '<span class="trade-station-card-badge">Lv.' + station.level + ' · ' + entry.levelConfig.name + '</span>' +
        '</div>' +
        '<div class="trade-station-income-row">' +
          '<span>预计日收益 <b>+' + Math.floor(entry.projectedIncome).toLocaleString() + '</b></span>' +
          '<span>上一日 +' + Math.floor(station.lastIncome || 0).toLocaleString() + '</span>' +
          '<span>累计 ' + Math.floor(station.totalIncome || 0).toLocaleString() + '</span>' +
        '</div>' +
        '<div class="trade-station-card-meta">经济系数 ×' + entry.economicFactor.toFixed(2) + ' · 累计投资 ' + Math.floor(station.investment || 0).toLocaleString() + ' · 建于第 ' + (station.buildDay || 1) + ' 天</div>' +
        '<div class="trade-station-card-meta">管理员：' + (entry.manager ? (entry.manager.name + '（日薪 ' + entry.manager.dailySalary + '）') : '未雇佣') +
          ' · 策略：' + entry.strategy.name + '</div>' +
        '<div class="trade-station-actions">' +
          '<button class="btn-action trade-station-upgrade-btn' + (entry.nextLevel ? '' : ' disabled') + '"' +
            ' data-action="upgrade" data-system-id="' + station.systemId + '"' +
            (entry.nextLevel ? '' : ' disabled') + '>' +
            (entry.nextLevel ? ('升级至 Lv.' + entry.nextLevel.level + '（+' + entry.nextUpgradeCost.toLocaleString() + '）') : '已达满级') +
          '</button>' +
        '</div>' +
        '<div class="trade-station-subsection">👤 管理员</div>' +
        '<div class="trade-station-choice-row">' +
          TRADE_STATION_MANAGERS.map(function (manager) {
            const activeClass = station.managerId === manager.id ? ' active' : '';
            return '<button class="trade-station-choice-btn' + activeClass + '"' +
              ' data-action="hire-manager" data-system-id="' + station.systemId + '" data-manager-id="' + manager.id + '">' +
              manager.name + '<span>' + manager.hireCost.toLocaleString() + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="trade-station-subsection">📈 经营策略</div>' +
        '<div class="trade-station-choice-row">' +
          TRADE_STATION_STRATEGIES.map(function (strategy) {
            const activeClass = station.strategyId === strategy.id ? ' active' : '';
            return '<button class="trade-station-choice-btn' + activeClass + '"' +
              ' data-action="set-strategy" data-system-id="' + station.systemId + '" data-strategy-id="' + strategy.id + '">' +
              strategy.name + '<span>' + Math.round(strategy.incomeMultiplier * 100) + '%</span></button>';
          }).join('') +
        '</div>' +
      '</div>';
    });
  }

  container.innerHTML = html;

  container.querySelectorAll('[data-action="build"]').forEach(function (button) {
    button.addEventListener('click', function () {
      onBuild(button.dataset.systemId);
    });
  });

  container.querySelectorAll('[data-action="upgrade"]').forEach(function (button) {
    button.addEventListener('click', function () {
      onUpgrade(button.dataset.systemId);
    });
  });

  container.querySelectorAll('[data-action="hire-manager"]').forEach(function (button) {
    button.addEventListener('click', function () {
      onHireManager(button.dataset.systemId, button.dataset.managerId);
    });
  });

  container.querySelectorAll('[data-action="set-strategy"]').forEach(function (button) {
    button.addEventListener('click', function () {
      onSetStrategy(button.dataset.systemId, button.dataset.strategyId);
    });
  });

  container.querySelectorAll('[data-action="take-loan"]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (financeActions.onTakeLoan) financeActions.onTakeLoan(button.dataset.loanOfferId);
    });
  });

  container.querySelectorAll('[data-action="repay-loan"]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (financeActions.onRepayLoan) financeActions.onRepayLoan(button.dataset.loanId);
    });
  });

  container.querySelectorAll('[data-action="buy-stock"]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (financeActions.onBuyStock) financeActions.onBuyStock(button.dataset.stockId);
    });
  });

  container.querySelectorAll('[data-action="sell-stock"]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (financeActions.onSellStock) financeActions.onSellStock(button.dataset.stockId);
    });
  });

  container.querySelectorAll('[data-action="invest-trade-station"]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (financeActions.onInvestTradeStation) financeActions.onInvestTradeStation(button.dataset.systemId);
    });
  });

  container.querySelectorAll('[data-action="purchase-insurance"]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (financeActions.onPurchaseInsurance) financeActions.onPurchaseInsurance(button.dataset.policyType);
    });
  });

  container.querySelectorAll('[data-action="submit-claim"]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (financeActions.onSubmitInsuranceClaim) financeActions.onSubmitInsuranceClaim(button.dataset.policyType);
    });
  });

  container.querySelectorAll('[data-action="open-futures"]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (financeActions.onOpenFutures) financeActions.onOpenFutures(button.dataset.contractId, button.dataset.direction);
    });
  });

  container.querySelectorAll('[data-action="close-futures"]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (financeActions.onCloseFutures) financeActions.onCloseFutures(button.dataset.positionId);
    });
  });
}
