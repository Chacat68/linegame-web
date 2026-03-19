// js/ui/MarketUI.js — 商业终端（价格总览 + 节点工作台双模式）
// 依赖：data/goods.js, data/systems.js, systems/economy/Economy.js
// 导出：renderOverview, render (detail), showOverview, showDetail

import { GOODS }    from '../data/goods.js';
import {
  TRADE_STATION_MANAGERS,
  TRADE_STATION_STRATEGIES,
} from '../data/tradeStations.js';
import { getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';
import * as Economy from '../systems/economy/Economy.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as Finance from '../systems/finance/FinanceSystem.js';
import * as Futures from '../systems/finance/FuturesSystem.js';
import * as TradeStation from '../systems/trade/TradeStationSystem.js';

const _focusedMarketGood = Object.create(null);
const _marketChartRange = Object.create(null);
const MARKET_RANGE_OPTIONS = [7, 14, 30];
const MARKET_WORKSPACE_TABS = [
  { id: 'spot', label: '📦 现货', hint: '商品交易与补给' },
  { id: 'capital', label: '🏦 资本', hint: '贷款、保险、股票、期货' },
  { id: 'operations', label: '🏪 经营', hint: '建站、升级与经营策略' },
];

let _activeMarketWorkspaceTab = 'spot';

function _applyMarketWorkspaceTabState() {
  var tabs = document.getElementById('market-workspace-tabs');
  var paneMap = {
    spot: document.getElementById('market-spot-pane'),
    capital: document.getElementById('market-capital-pane'),
    operations: document.getElementById('market-operations-pane'),
  };

  if (tabs) {
    tabs.querySelectorAll('[data-market-workspace-tab]').forEach(function (button) {
      button.classList.toggle('active', button.dataset.marketWorkspaceTab === _activeMarketWorkspaceTab);
    });
  }

  Object.keys(paneMap).forEach(function (key) {
    if (!paneMap[key]) return;
    paneMap[key].classList.toggle('hidden', key !== _activeMarketWorkspaceTab);
  });
}

function _renderMarketWorkspaceTabs() {
  var tabs = document.getElementById('market-workspace-tabs');
  if (!tabs) return;

  tabs.innerHTML = MARKET_WORKSPACE_TABS.map(function (entry) {
    return '<button class="market-workspace-tab' + (entry.id === _activeMarketWorkspaceTab ? ' active' : '') + '" data-market-workspace-tab="' + entry.id + '">' +
      '<span class="market-workspace-tab-label">' + entry.label + '</span>' +
      '<span class="market-workspace-tab-hint">' + entry.hint + '</span>' +
    '</button>';
  }).join('');

  tabs.querySelectorAll('[data-market-workspace-tab]').forEach(function (button) {
    button.addEventListener('click', function () {
      _activeMarketWorkspaceTab = button.dataset.marketWorkspaceTab || 'spot';
      _applyMarketWorkspaceTabState();
    });
  });

  _applyMarketWorkspaceTabState();
}

// ---------------------------------------------------------------------------
// 股市风格图表辅助（迷你 K 线 + 均线）
// ---------------------------------------------------------------------------

function _normalizeChartHistory(data, fallbackPrice, range) {
  var limit = Math.max(2, Math.floor(range || 12));
  var series = Array.isArray(data) ? data.slice(-limit) : [];
  var safeFallback = Math.max(1, Math.round(fallbackPrice || 1));
  if (series.length === 0) series = [safeFallback, safeFallback];
  if (series.length === 1) series.unshift(series[0]);
  while (series.length < Math.min(8, limit)) {
    series.unshift(series[0]);
  }
  return series.map(function (value) {
    return Math.max(1, Math.round(value || safeFallback));
  });
}

function _buildPseudoCandles(history) {
  return history.map(function (close, index) {
    var open = index === 0 ? history[0] : history[index - 1];
    var spread = Math.max(1, Math.round(Math.abs(close - open) * 0.35) + 1);
    return {
      open: open,
      close: close,
      high: Math.max(open, close) + spread,
      low: Math.max(1, Math.min(open, close) - spread),
      volume: Math.max(1, Math.abs(close - open) + spread),
    };
  });
}

function _movingAverage(values, period) {
  return values.map(function (_, index) {
    var start = Math.max(0, index - period + 1);
    var slice = values.slice(start, index + 1);
    var sum = slice.reduce(function (acc, value) { return acc + value; }, 0);
    return sum / slice.length;
  });
}

function _formatChartDelta(history) {
  if (!history || history.length < 2) return { text: '0.0%', className: 'market-chart-flat' };
  var start = history[0] || 1;
  var end = history[history.length - 1] || start;
  var delta = ((end - start) / Math.max(1, start)) * 100;
  var sign = delta > 0 ? '+' : '';
  var className = delta > 0.5 ? 'market-chart-up' : (delta < -0.5 ? 'market-chart-down' : 'market-chart-flat');
  return {
    text: sign + delta.toFixed(1) + '%',
    className: className,
  };
}

function _renderMarketChart(history, currentPrice, goodLabel, options) {
  var normalized = _normalizeChartHistory(history, currentPrice);
  var candles = _buildPseudoCandles(normalized);
  var movingAvg = _movingAverage(normalized, 4);
  var minPrice = Math.min.apply(null, candles.map(function (item) { return item.low; }).concat(movingAvg));
  var maxPrice = Math.max.apply(null, candles.map(function (item) { return item.high; }).concat(movingAvg));
  var priceRange = Math.max(1, maxPrice - minPrice);
  var maxVolume = Math.max.apply(null, candles.map(function (item) { return item.volume; }));
  options = options || {};
  var width = options.width || 132;
  var height = options.height || 58;
  var topPad = options.topPad || 5;
  var chartBottom = options.chartBottom || 40;
  var volumeBase = options.volumeBase || 53;
  var outerClass = options.className || 'market-mini-chart';
  var slot = (width - 10) / candles.length;
  var bodyWidth = Math.max(4, Math.min(8, slot - 3));

  function scaleY(value) {
    return topPad + ((maxPrice - value) / priceRange) * (chartBottom - topPad);
  }

  function scaleVolume(value) {
    return Math.max(2, (value / Math.max(1, maxVolume)) * 8);
  }

  var volumeBars = candles.map(function (item, index) {
    var x = 5 + index * slot + Math.max(1, (slot - bodyWidth) / 2);
    var barHeight = scaleVolume(item.volume);
    return '<rect x="' + x.toFixed(1) + '" y="' + (volumeBase - barHeight).toFixed(1) + '" width="' + bodyWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" class="market-chart-volume" />';
  }).join('');

  var candleShapes = candles.map(function (item, index) {
    var centerX = 5 + index * slot + (slot / 2);
    var wickTop = scaleY(item.high);
    var wickBottom = scaleY(item.low);
    var openY = scaleY(item.open);
    var closeY = scaleY(item.close);
    var bodyY = Math.min(openY, closeY);
    var bodyHeight = Math.max(2, Math.abs(closeY - openY));
    var bodyX = centerX - (bodyWidth / 2);
    var cls = item.close >= item.open ? 'market-chart-candle up' : 'market-chart-candle down';
    return '<line x1="' + centerX.toFixed(1) + '" y1="' + wickTop.toFixed(1) + '" x2="' + centerX.toFixed(1) + '" y2="' + wickBottom.toFixed(1) + '" class="market-chart-wick ' + (item.close >= item.open ? 'up' : 'down') + '" />' +
      '<rect x="' + bodyX.toFixed(1) + '" y="' + bodyY.toFixed(1) + '" width="' + bodyWidth.toFixed(1) + '" height="' + bodyHeight.toFixed(1) + '" rx="1" class="' + cls + '" />';
  }).join('');

  var maPath = movingAvg.map(function (value, index) {
    var x = 5 + index * slot + (slot / 2);
    var y = scaleY(value);
    return (index === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  return '<svg class="' + outerClass + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + goodLabel + ' 市场K线图">' +
    '<rect x="0.5" y="0.5" width="' + (width - 1) + '" height="' + (height - 1) + '" rx="8" class="market-chart-frame" />' +
    '<line x1="4" y1="40.5" x2="128" y2="40.5" class="market-chart-axis" />' +
    '<line x1="4" y1="53.5" x2="128" y2="53.5" class="market-chart-axis market-chart-axis-volume" />' +
    '<path d="' + maPath + '" class="market-chart-ma" />' +
    volumeBars +
    candleShapes +
  '</svg>';
}

function _renderMiniMarketChart(history, currentPrice, goodLabel) {
  return _renderMarketChart(history, currentPrice, goodLabel, {
    width: 132,
    height: 58,
    topPad: 5,
    chartBottom: 40,
    volumeBase: 53,
    className: 'market-mini-chart',
  });
}

function _buildMarketSnapshots(state, sysId, goodsList, isBlack, range) {
  return goodsList.map(function (good) {
    var buyPrice = isBlack
      ? Economy.getBlackMarketBuyPrice(sysId, good.id, state)
      : Economy.getBuyPrice(sysId, good.id, state);
    var sellPrice = isBlack
      ? Economy.getBlackMarketSellPrice(sysId, good.id, state)
      : Economy.getSellPrice(sysId, good.id, state);
    var history = _normalizeChartHistory(Economy.getPriceHistory(sysId, good.id), sellPrice, range);
    var delta = _formatChartDelta(history);
    var swing = history.reduce(function (acc, value, index) {
      if (index === 0) return 0;
      return acc + Math.abs(value - history[index - 1]);
    }, 0);
    return {
      good: good,
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      history: history,
      delta: delta,
      swing: swing,
      spread: Math.max(0, buyPrice - sellPrice),
      supplyDemand: Economy.getSupplyDemand(sysId, good.id),
    };
  });
}

function _renderMarketDashboard(state, sysId, marketMode, snapshots) {
  var container = document.getElementById('market-terminal-dashboard');
  if (!container) return;
  if (!snapshots || snapshots.length === 0) {
    container.innerHTML = '';
    return;
  }

  var focusKey = sysId + ':' + marketMode;
  var selectedRange = _marketChartRange[focusKey] || 14;
  var focusedGoodId = _focusedMarketGood[focusKey];
  if (!focusedGoodId || !snapshots.some(function (entry) { return entry.good.id === focusedGoodId; })) {
    focusedGoodId = snapshots[0].good.id;
    _focusedMarketGood[focusKey] = focusedGoodId;
  }

  var focused = snapshots.find(function (entry) { return entry.good.id === focusedGoodId; }) || snapshots[0];
  var gainers = snapshots.slice().sort(function (a, b) {
    return parseFloat(b.delta.text) - parseFloat(a.delta.text);
  }).slice(0, 3);
  var losers = snapshots.slice().sort(function (a, b) {
    return parseFloat(a.delta.text) - parseFloat(b.delta.text);
  }).slice(0, 3);
  var hotList = snapshots.slice().sort(function (a, b) {
    return b.swing - a.swing;
  }).slice(0, 3);
  var pressureLabel = focused.supplyDemand.ratio > 1.3 ? '追涨区' : (focused.supplyDemand.ratio < 0.8 ? '承压区' : '盘整区');

  function renderList(title, items, className) {
    return '<div class="market-terminal-side-card">' +
      '<div class="market-terminal-side-title">' + title + '</div>' +
      items.map(function (entry) {
        return '<button class="market-terminal-rank-row" data-focus-good="' + entry.good.id + '">' +
          '<span class="market-terminal-rank-name">' + entry.good.emoji + ' ' + entry.good.name + '</span>' +
          '<span class="market-terminal-rank-value ' + className + '">' + entry.delta.text + '</span>' +
        '</button>';
      }).join('') +
    '</div>';
  }

  container.innerHTML = '<section class="market-terminal-hero">' +
    '<div class="market-terminal-main">' +
      '<div class="market-terminal-head">' +
        '<div>' +
          '<div class="market-terminal-title">' + focused.good.emoji + ' ' + focused.good.name + '</div>' +
          '<div class="market-terminal-subtitle">' + (marketMode === 'black' ? '黑市盘口' : '公开市场盘口') + ' · ' + pressureLabel + ' · 点选下方商品可切换图表</div>' +
        '</div>' +
        '<div class="market-terminal-price-wrap">' +
          '<div class="market-terminal-price">' + focused.sellPrice.toLocaleString() + '</div>' +
          '<div class="market-terminal-price-delta ' + focused.delta.className + '">' + focused.delta.text + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="market-terminal-toolbar">' +
        '<div class="market-terminal-range-group">' + MARKET_RANGE_OPTIONS.map(function (days) {
          return '<button class="market-terminal-range-btn' + (days === selectedRange ? ' active' : '') + '" data-range="' + days + '">' + days + '天</button>';
        }).join('') + '</div>' +
        '<div class="market-terminal-toolbar-note">统计窗口：近 ' + selectedRange + ' 天</div>' +
      '</div>' +
      '<div class="market-terminal-chart-wrap">' +
        _renderMarketChart(focused.history, focused.sellPrice, focused.good.name, {
          width: 340,
          height: 164,
          topPad: 12,
          chartBottom: 122,
          volumeBase: 154,
          className: 'market-hero-chart',
        }) +
      '</div>' +
      '<div class="market-terminal-metrics">' +
        '<div class="market-terminal-metric"><span>买卖价差</span><strong>' + focused.spread.toLocaleString() + '</strong></div>' +
        '<div class="market-terminal-metric"><span>需求/供给</span><strong>' + focused.supplyDemand.ratio.toFixed(2) + 'x</strong></div>' +
        '<div class="market-terminal-metric"><span>波动热度</span><strong>' + focused.swing.toLocaleString() + '</strong></div>' +
      '</div>' +
    '</div>' +
    '<div class="market-terminal-side">' +
      renderList('📈 涨幅榜', gainers, 'market-chart-up') +
      renderList('📉 跌幅榜', losers, 'market-chart-down') +
      renderList('⚡ 热门波动', hotList, 'market-chart-flat') +
    '</div>' +
  '</section>';

  container.querySelectorAll('[data-focus-good]').forEach(function (button) {
    button.addEventListener('click', function () {
      _focusedMarketGood[focusKey] = button.dataset.focusGood;
      _renderMarketDashboard(state, sysId, marketMode, snapshots);
      var activeRow = document.querySelector('[data-market-good="' + button.dataset.focusGood + '"]');
      if (activeRow && typeof activeRow.scrollIntoView === 'function') {
        activeRow.scrollIntoView({ block: 'nearest' });
      }
    });
  });

  container.querySelectorAll('[data-range]').forEach(function (button) {
    button.addEventListener('click', function () {
      _marketChartRange[focusKey] = Math.max(7, Math.min(30, Math.floor(Number(button.dataset.range) || 14)));
      var updatedSnapshots = _buildMarketSnapshots(
        state,
        sysId,
        marketMode === 'black' ? Economy.getBlackMarketGoods() : GOODS,
        marketMode === 'black',
        _marketChartRange[focusKey]
      );
      _renderMarketDashboard(state, sysId, marketMode, updatedSnapshots);
    });
  });
}

function _getStockPriceDelta(listing) {
  var lastPrice = listing.lastPrice || listing.price || 0;
  return (listing.price || 0) - lastPrice;
}

function _sortStockListings(listings, systemId) {
  return listings.slice().sort(function (a, b) {
    var aPriority = a.systemId === systemId ? 0 : 1;
    var bPriority = b.systemId === systemId ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (b.price || 0) - (a.price || 0);
  });
}

// ---------------------------------------------------------------------------
// 产业链提示
// ---------------------------------------------------------------------------
function _supplyChainTooltip(good) {
  if (!good.upstream || good.upstream.length === 0) return '';
  var deps = good.upstream.map(function (dep) {
    var upGood = GOODS.find(function (g) { return g.id === dep.goodId; });
    return (upGood ? upGood.emoji + upGood.name : dep.goodId) + '(' + Math.round(dep.weight * 100) + '%)';
  }).join(', ');
  return '🔗 依赖: ' + deps;
}

function _marketAccessLabel(good) {
  if (!good.marketAccess || good.marketAccess.indexOf('black') === -1) return '';
  if (good.legality === 'illegal') return '☠ 黑市货';
  return '🕶 灰市货';
}

function _legalityTooltip(good) {
  if (good.legality === 'illegal') return '仅可在黑市安全流通';
  if (good.legality === 'restricted') return '受监管商品，在黑市需求更高';
  return '';
}

function _renderFinancePanels(state, viewingSystem, isCurrentSys, financeActions) {
  var capitalContainer = document.getElementById('market-capital-panels');
  var operationsContainer = document.getElementById('market-operations-panels');
  if (!capitalContainer || !operationsContainer) return;

  financeActions = financeActions || {};

  var financeOverview = Finance.getOverview(state);
  var loanOffers = Finance.getLoanOffers(state).slice(0, 3);
  var activeLoans = (state.loans || []).filter(function (loan) {
    return loan.status === 'active' && loan.balance > 0;
  });
  var insuranceProducts = Finance.getInsuranceProducts(state).slice(0, 3);
  var pendingClaims = (state.insuranceClaims || []).filter(function (claim) {
    return claim.status === 'pending';
  }).slice(0, 3);
  var stockListings = _sortStockListings(Finance.getStockListings(state), viewingSystem).slice(0, 5);
  var futuresListings = Futures.getFuturesListings(state);
  var openContracts = Futures.getOpenContracts(state);
  var recentClosedContracts = Futures.getClosedContracts(state).slice(-4).reverse();
  var tradeInvestments = Finance.getTradeInvestmentOptions(state);
  var localInvestment = tradeInvestments.find(function (entry) {
    return entry.systemId === viewingSystem;
  }) || null;
  var tradeSummary = TradeStation.getSummary(state);
  var ownedStations = TradeStation.getOwnedStations(state);
  var localStation = ownedStations.find(function (entry) {
    return entry.station.systemId === viewingSystem;
  }) || null;
  var buildCandidate = TradeStation.getBuildCandidates(state).find(function (entry) {
    return entry.system.id === viewingSystem;
  }) || null;

  var summarySection = '<section class="market-finance-section market-finance-summary-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">🏛 商业中枢</div>' +
        '<div class="market-finance-subtitle">现货交易、资本调度与节点经营统一收口在同一终端，避免市场页和贸易站页重复承担本地操作。</div>' +
      '</div>' +
      '<span class="market-finance-chip">信用评级 ' + financeOverview.creditRating + '</span>' +
    '</div>' +
    '<div class="market-finance-summary-grid">' +
      '<div class="market-finance-summary-metric"><span>贷款余额</span><strong>' + Math.floor(financeOverview.outstandingLoanBalance).toLocaleString() + '</strong></div>' +
      '<div class="market-finance-summary-metric"><span>股票市值</span><strong>' + Math.floor(financeOverview.stockValue).toLocaleString() + '</strong></div>' +
      '<div class="market-finance-summary-metric"><span>站点投资</span><strong>' + Math.floor(financeOverview.tradeInvestmentValue).toLocaleString() + '</strong></div>' +
      '<div class="market-finance-summary-metric"><span>商网日收益</span><strong>+' + Math.floor(tradeSummary.projectedIncome).toLocaleString() + '</strong></div>' +
    '</div>' +
  '</section>';

  var capitalHtml = summarySection;
  capitalHtml += '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">🏦 本地资本调度</div>' +
        '<div class="market-finance-subtitle">贷款、保险和本地站点追加投资与停靠节点绑定。远程查看时只保留情报，不开放交易。</div>' +
      '</div>' +
    '</div>';

  if (!isCurrentSys) {
    capitalHtml += '<div class="market-finance-locked">📡 当前是远程查看模式。抵达该节点后，可在这里申请贷款、办理保险并追加本地站点投资。</div>';
  } else {
    capitalHtml += '<div class="market-finance-layout">' +
      '<div class="market-finance-column">' +
        '<div class="market-finance-subsection">🏦 贷款席位</div>' +
        (activeLoans.length > 0
          ? '<div class="market-finance-action-list">' + activeLoans.map(function (loan) {
              return '<div class="market-finance-action-row">' +
                '<div class="market-finance-action-main">' +
                  '<div class="market-finance-action-title">' + loan.name + '</div>' +
                  '<div class="market-finance-action-meta">余额 ' + Math.floor(loan.balance).toLocaleString() + ' · 日扣款 ' + Math.floor(loan.dailyPayment).toLocaleString() + ' · 剩余 ' + loan.remainingDays + ' 天</div>' +
                '</div>' +
                '<div class="market-finance-inline-actions">' +
                  '<button class="btn-action market-finance-btn" data-action="market-repay-loan" data-loan-id="' + loan.id + '">还款</button>' +
                '</div>' +
              '</div>';
            }).join('') + '</div>'
          : '<div class="market-finance-empty">暂无未结清贷款。</div>') +
        (loanOffers.length > 0
          ? '<div class="trade-station-choice-row">' + loanOffers.map(function (offer) {
              return '<button class="trade-station-choice-btn' + (offer.available ? '' : ' disabled') + '" data-action="market-take-loan" data-loan-offer-id="' + offer.id + '"' + (offer.available ? '' : ' disabled') + '>' +
                offer.name + '<span>+' + offer.principal.toLocaleString() + ' / ' + offer.termDays + '天</span></button>';
            }).join('') + '</div>'
          : '') +
      '</div>' +
      '<div class="market-finance-column">' +
        '<div class="market-finance-subsection">🛡 风险保障</div>' +
        (insuranceProducts.length > 0
          ? '<div class="market-finance-action-list">' + insuranceProducts.map(function (product) {
              return '<div class="market-finance-action-row">' +
                '<div class="market-finance-action-main">' +
                  '<div class="market-finance-action-title">' + product.name + '</div>' +
                  '<div class="market-finance-action-meta">保费 ' + Math.floor(product.premium).toLocaleString() + ' · 保额 ' + Math.floor(product.coverage).toLocaleString() + ' · 可赔 ' + Math.floor(product.claimableAmount).toLocaleString() + '</div>' +
                '</div>' +
                '<div class="market-finance-inline-actions">' +
                  '<button class="btn-action market-finance-btn' + (product.active ? ' disabled' : '') + '" data-action="market-purchase-insurance" data-policy-type="' + product.id + '"' + (product.active ? ' disabled' : '') + '>投保</button>' +
                  '<button class="btn-action market-finance-btn' + (product.claimableAmount > 0 ? '' : ' disabled') + '" data-action="market-submit-claim" data-policy-type="' + product.id + '"' + (product.claimableAmount > 0 ? '' : ' disabled') + '>理赔</button>' +
                '</div>' +
              '</div>';
            }).join('') + '</div>'
          : '<div class="market-finance-empty">当前暂无可用保险产品。</div>') +
        (pendingClaims.length > 0
          ? '<div class="market-finance-history">' + pendingClaims.map(function (claim) {
              return '<div class="market-finance-history-row"><span>' + claim.policyType + '</span><span>预计到账 ' + Math.floor(claim.approvedAmount).toLocaleString() + '</span></div>';
            }).join('') + '</div>'
          : '') +
      '</div>' +
    '</div>';
  }

  capitalHtml += '</section>';

  var operationsHtml = summarySection;
  operationsHtml += '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">🏪 节点经营</div>' +
        '<div class="market-finance-subtitle">围绕当前查看节点决定是否建站、升级、雇佣管理员与切换经营策略。</div>' +
      '</div>' +
      '<span class="market-finance-chip">商网 ' + tradeSummary.count + ' 站</span>' +
    '</div>';

  if (localStation) {
    operationsHtml += '<div class="market-finance-card is-featured">' +
      '<div class="market-finance-card-head">' +
        '<span class="market-finance-card-title">' + localStation.system.name + ' 贸易站</span>' +
        '<span class="market-finance-chip">Lv.' + localStation.station.level + ' · ' + localStation.levelConfig.name + '</span>' +
      '</div>' +
      '<div class="market-finance-card-meta">预计日收益 +' + Math.floor(localStation.projectedIncome).toLocaleString() + ' · 累计 ' + Math.floor(localStation.station.totalIncome || 0).toLocaleString() + ' · 经济系数 ×' + localStation.economicFactor.toFixed(2) + '</div>' +
      '<div class="market-finance-card-meta">管理员：' + (localStation.manager ? localStation.manager.name : '未配置') + ' · 策略：' + localStation.strategy.name + '</div>' +
      (localInvestment
        ? '<div class="market-finance-card-meta">本地追加投资：已投 ' + Math.floor(localInvestment.investedAmount || 0).toLocaleString() + ' · 建议追加 ' + localInvestment.suggestedAmount.toLocaleString() + ' · 预估日分红 ' + (localInvestment.expectedYieldRate * 100).toFixed(2) + '%</div>'
        : '') +
      (isCurrentSys
        ? '<div class="market-finance-actions">' +
            '<button class="btn-action market-finance-btn' + (localStation.nextLevel ? '' : ' disabled') + '" data-action="market-upgrade-station" data-system-id="' + localStation.station.systemId + '"' + (localStation.nextLevel ? '' : ' disabled') + '>' + (localStation.nextLevel ? ('升级 +' + localStation.nextUpgradeCost.toLocaleString()) : '已满级') + '</button>' +
            (localInvestment ? '<button class="btn-action market-finance-btn" data-action="market-invest-trade-station" data-system-id="' + localInvestment.systemId + '">追加投资</button>' : '') +
          '</div>' +
          '<div class="market-finance-station-stack">' +
            '<div class="market-finance-subsection">👤 管理员</div>' +
            '<div class="trade-station-choice-row">' + TRADE_STATION_MANAGERS.map(function (manager) {
              return '<button class="trade-station-choice-btn' + (localStation.station.managerId === manager.id ? ' active' : '') + '" data-action="market-hire-manager" data-system-id="' + localStation.station.systemId + '" data-manager-id="' + manager.id + '">' +
                manager.name + '<span>' + manager.hireCost.toLocaleString() + '</span></button>';
            }).join('') + '</div>' +
            '<div class="market-finance-subsection">📈 经营策略</div>' +
            '<div class="trade-station-choice-row">' + TRADE_STATION_STRATEGIES.map(function (strategy) {
              return '<button class="trade-station-choice-btn' + (localStation.station.strategyId === strategy.id ? ' active' : '') + '" data-action="market-set-strategy" data-system-id="' + localStation.station.systemId + '" data-strategy-id="' + strategy.id + '">' +
                strategy.name + '<span>' + Math.round(strategy.incomeMultiplier * 100) + '%</span></button>';
            }).join('') + '</div>' +
          '</div>'
        : '<div class="market-finance-locked">📡 远程查看模式：可审阅该站点收益与配置，抵达后才能升级、雇佣和切换策略。</div>') +
    '</div>';
  } else if (buildCandidate) {
    operationsHtml += '<div class="market-finance-card">' +
      '<div class="market-finance-card-head">' +
        '<span class="market-finance-card-title">在 ' + buildCandidate.system.name + ' 建立商业节点</span>' +
        '<span class="market-finance-chip">' + buildCandidate.system.typeLabel + '</span>' +
      '</div>' +
      '<div class="market-finance-card-meta">市场深度 ' + (buildCandidate.system.marketDepth || 200) + ' · ' + buildCandidate.system.description + '</div>' +
      '<div class="market-finance-card-meta">建站后可持续吃到本地行情与经济周期红利。</div>' +
      (localInvestment
        ? '<div class="market-finance-card-meta">同步可做站点投资：已投 ' + Math.floor(localInvestment.investedAmount || 0).toLocaleString() + ' · 建议追加 ' + localInvestment.suggestedAmount.toLocaleString() + '</div>'
        : '') +
      (isCurrentSys
        ? '<div class="market-finance-actions">' +
            '<button class="btn-action market-finance-btn' + (buildCandidate.canAfford ? '' : ' disabled') + '" data-action="market-build-station" data-system-id="' + buildCandidate.system.id + '"' + (buildCandidate.canAfford ? '' : ' disabled') + '>投资 ' + buildCandidate.buildCost.toLocaleString() + '</button>' +
            (localInvestment ? '<button class="btn-action market-finance-btn" data-action="market-invest-trade-station" data-system-id="' + localInvestment.systemId + '">先做财务投资</button>' : '') +
          '</div>'
        : '<div class="market-finance-locked">📡 这是可建站候选节点。抵达后可直接在此发起投资。</div>') +
    '</div>';
  } else {
    operationsHtml += '<div class="market-finance-empty">该节点暂不提供贸易站建设资格，或尚未完成前置探索。</div>';
  }

  if (ownedStations.length > 0) {
    operationsHtml += '<div class="market-finance-subsection">📡 商网快照</div>' +
      '<div class="market-finance-action-list">' + ownedStations.slice(0, 4).map(function (entry) {
        return '<div class="market-finance-network-row">' +
          '<div class="market-finance-network-main">' +
            '<div class="market-finance-action-title">' + entry.system.name + ' · Lv.' + entry.station.level + '</div>' +
            '<div class="market-finance-action-meta">日收益 +' + Math.floor(entry.projectedIncome).toLocaleString() + ' · 管理员 ' + (entry.manager ? entry.manager.name : '未配置') + ' · 策略 ' + entry.strategy.name + '</div>' +
          '</div>' +
          '<div class="market-finance-network-note">累计 ' + Math.floor(entry.station.totalIncome || 0).toLocaleString() + '</div>' +
        '</div>';
      }).join('') + '</div>';
  }

  operationsHtml += '</section>';

  operationsHtml += '<section class="market-finance-section">' +
    '<div class="trade-station-summary-card">' +
      '<div class="trade-station-summary-head">' +
        '<span class="trade-station-summary-title">📡 商业网络总览</span>' +
        '<span class="trade-station-summary-sub">信用评级 ' + financeOverview.creditRating + ' · 商网总览现由经营页统一承载</span>' +
      '</div>' +
      '<div class="trade-station-summary-grid">' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">站点数量</span><span class="trade-station-metric-value">' + tradeSummary.count + '</span></div>' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">预计日收益</span><span class="trade-station-metric-value">+' + Math.floor(tradeSummary.projectedIncome).toLocaleString() + '</span></div>' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">累计收益</span><span class="trade-station-metric-value">' + Math.floor(tradeSummary.totalIncome).toLocaleString() + '</span></div>' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">股票市值</span><span class="trade-station-metric-value">' + Math.floor(financeOverview.stockValue).toLocaleString() + '</span></div>' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">站点投资</span><span class="trade-station-metric-value">' + Math.floor(financeOverview.tradeInvestmentValue).toLocaleString() + '</span></div>' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">贷款余额</span><span class="trade-station-metric-value">' + Math.floor(financeOverview.outstandingLoanBalance).toLocaleString() + '</span></div>' +
      '</div>' +
      '<div class="trade-station-summary-tip">这里统一处理远程看盘、建站候选筛选与所有已建节点的经营编排，是当前唯一的商网管理入口。</div>' +
    '</div>' +
  '</section>';

  operationsHtml += '<section class="market-finance-section">' +
    '<div class="trade-station-section-title">🏗 建站候选</div>';

  if (buildCandidate || TradeStation.getBuildCandidates(state).length > 0) {
    TradeStation.getBuildCandidates(state).forEach(function (candidate) {
      operationsHtml += '<div class="trade-station-build-card">' +
        '<div class="trade-station-card-head">' +
          '<span class="trade-station-card-name">' + candidate.system.name + '</span>' +
          '<span class="trade-station-card-badge">' + candidate.system.typeLabel + '</span>' +
        '</div>' +
        '<div class="trade-station-card-meta">市场深度 ' + (candidate.system.marketDepth || 200) + ' · ' + (candidate.isCurrent ? '当前停靠中，可立即投资' : '已访问，可先纳入建站计划') + '</div>' +
        '<div class="trade-station-card-desc">' + candidate.system.description + '</div>' +
        '<button class="btn-action trade-station-build-btn' + (candidate.canAfford ? '' : ' disabled') + '" data-action="market-build-station" data-system-id="' + candidate.system.id + '"' + (candidate.canAfford ? '' : ' disabled') + '>投资 ' + candidate.buildCost.toLocaleString() + ' 积分</button>' +
      '</div>';
    });
  } else {
    operationsHtml += '<div class="trade-station-empty">先探索更多星球，才能解锁新的建站候选。</div>';
  }

  operationsHtml += '</section>';

  operationsHtml += '<section class="market-finance-section">' +
    '<div class="trade-station-section-title">📡 已建贸易站</div>';

  if (ownedStations.length === 0) {
    operationsHtml += '<div class="trade-station-empty">还没有贸易站。先在当前停靠节点完成第一笔长期投资。</div>';
  } else {
    ownedStations.forEach(function (entry) {
      var station = entry.station;
      operationsHtml += '<div class="trade-station-card">' +
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
        '<div class="trade-station-card-meta">管理员：' + (entry.manager ? (entry.manager.name + '（日薪 ' + entry.manager.dailySalary + '）') : '未雇佣') + ' · 策略：' + entry.strategy.name + '</div>' +
        '<div class="trade-station-actions">' +
          '<button class="btn-action trade-station-upgrade-btn' + (entry.nextLevel ? '' : ' disabled') + '" data-action="market-upgrade-station" data-system-id="' + station.systemId + '"' + (entry.nextLevel ? '' : ' disabled') + '>' +
            (entry.nextLevel ? ('升级至 Lv.' + entry.nextLevel.level + '（+' + entry.nextUpgradeCost.toLocaleString() + '）') : '已达满级') +
          '</button>' +
        '</div>' +
        '<div class="trade-station-subsection">👤 管理员</div>' +
        '<div class="trade-station-choice-row">' +
          TRADE_STATION_MANAGERS.map(function (manager) {
            var activeClass = station.managerId === manager.id ? ' active' : '';
            return '<button class="trade-station-choice-btn' + activeClass + '" data-action="market-hire-manager" data-system-id="' + station.systemId + '" data-manager-id="' + manager.id + '">' +
              manager.name + '<span>' + manager.hireCost.toLocaleString() + '</span></button>';
          }).join('') +
        '</div>' +
        '<div class="trade-station-subsection">📈 经营策略</div>' +
        '<div class="trade-station-choice-row">' +
          TRADE_STATION_STRATEGIES.map(function (strategy) {
            var activeClass = station.strategyId === strategy.id ? ' active' : '';
            return '<button class="trade-station-choice-btn' + activeClass + '" data-action="market-set-strategy" data-system-id="' + station.systemId + '" data-strategy-id="' + strategy.id + '">' +
              strategy.name + '<span>' + Math.round(strategy.incomeMultiplier * 100) + '%</span></button>';
          }).join('') +
        '</div>' +
      '</div>';
    });
  }

  operationsHtml += '</section>';

  capitalHtml += '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">📈 股票市场</div>' +
        '<div class="market-finance-subtitle">本地指数优先展示，可直接从市场页建仓或减仓。</div>' +
      '</div>' +
    '</div>';

  if (stockListings.length === 0) {
    capitalHtml += '<div class="market-finance-empty">暂无可交易股票。</div>';
  } else {
    capitalHtml += '<div class="market-finance-card-grid">' + stockListings.map(function (listing) {
      var delta = _getStockPriceDelta(listing);
      var deltaClass = delta >= 0 ? 'market-finance-value-up' : 'market-finance-value-down';
      var deltaText = (delta >= 0 ? '+' : '') + delta.toLocaleString();
      return '<article class="market-finance-card' + (listing.systemId === viewingSystem ? ' is-featured' : '') + '">' +
        '<div class="market-finance-card-head">' +
          '<span class="market-finance-card-title">' + listing.name + '</span>' +
          '<span class="market-finance-chip">' + listing.price.toLocaleString() + '</span>' +
        '</div>' +
        '<div class="market-finance-card-meta">持仓 ' + (listing.shares || 0) + ' 股 · 均价 ' + Math.floor(listing.avgCost || 0).toLocaleString() + '</div>' +
        '<div class="market-finance-card-meta">日波动 <span class="' + deltaClass + '">' + deltaText + '</span></div>' +
        '<div class="market-finance-actions">' +
          '<button class="btn-action market-finance-btn" data-action="market-buy-stock" data-stock-id="' + listing.id + '">买入 1 股</button>' +
          '<button class="btn-action market-finance-btn' + ((listing.shares || 0) > 0 ? '' : ' disabled') + '" data-action="market-sell-stock" data-stock-id="' + listing.id + '"' + ((listing.shares || 0) > 0 ? '' : ' disabled') + '>卖出 1 股</button>' +
        '</div>' +
      '</article>';
    }).join('') + '</div>';
  }
  capitalHtml += '</section>';

  capitalHtml += '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">📋 期货市场</div>' +
        '<div class="market-finance-subtitle">以当前现货价锁定合约。做多押涨，做空押跌，保证金为合约价值的 20%。</div>' +
      '</div>' +
      '<span class="market-finance-chip">' + Futures.DEFAULT_TERM_DAYS + ' 天标准合约</span>' +
    '</div>';

  if (futuresListings.length === 0) {
    capitalHtml += '<div class="market-finance-empty">暂无可交易期货标的。</div>';
  } else {
    capitalHtml += '<div class="market-finance-card-grid">' + futuresListings.map(function (listing) {
      return '<article class="market-finance-card">' +
        '<div class="market-finance-card-head">' +
          '<span class="market-finance-card-title">' + (listing.emoji ? listing.emoji + ' ' : '') + listing.name + '</span>' +
          '<span class="market-finance-chip">现价 ' + listing.currentPrice.toLocaleString() + '</span>' +
        '</div>' +
        '<div class="market-finance-card-meta">合约规模 ' + listing.contractUnit + ' 单位 · 保证金 ' + listing.margin.toLocaleString() + '</div>' +
        '<div class="market-finance-card-meta">持多 ' + listing.heldLong + ' 份 · 持空 ' + listing.heldShort + ' 份</div>' +
        '<div class="market-finance-actions">' +
          '<button class="btn-action market-finance-btn market-finance-btn-long" data-action="market-futures-long" data-good-id="' + listing.goodId + '">做多</button>' +
          '<button class="btn-action market-finance-btn market-finance-btn-short" data-action="market-futures-short" data-good-id="' + listing.goodId + '">做空</button>' +
        '</div>' +
      '</article>';
    }).join('') + '</div>';
  }

  if (openContracts.length > 0) {
    capitalHtml += '<div class="market-finance-subsection">📂 当前持仓</div>' +
      '<div class="market-finance-contract-list">' + openContracts.map(function (contract) {
        var pnlClass = (contract.unrealizedPnl || 0) >= 0 ? 'market-finance-value-up' : 'market-finance-value-down';
        var pnlText = ((contract.unrealizedPnl || 0) >= 0 ? '+' : '') + (contract.unrealizedPnl || 0).toLocaleString();
        return '<div class="market-finance-contract-row">' +
          '<div>' +
            '<div class="market-finance-contract-title">' + contract.goodName + ' · ' + (contract.direction === 'long' ? '多头' : '空头') + '</div>' +
            '<div class="market-finance-contract-meta">锁定价 ' + contract.lockedPrice.toLocaleString() + ' · 当前价 ' + contract.currentPrice.toLocaleString() + ' · 剩余 ' + contract.daysLeft + ' 天</div>' +
          '</div>' +
          '<div class="market-finance-contract-side">' +
            '<span class="' + pnlClass + '">' + pnlText + '</span>' +
            '<button class="btn-action market-finance-btn" data-action="market-futures-close" data-contract-id="' + contract.id + '">平仓</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
  }

  if (recentClosedContracts.length > 0) {
    capitalHtml += '<div class="market-finance-subsection">📜 近期成交</div>' +
      '<div class="market-finance-history">' + recentClosedContracts.map(function (contract) {
        var pnl = contract.pnl || 0;
        return '<div class="market-finance-history-row">' +
          '<span>' + contract.goodName + ' · ' + (contract.direction === 'long' ? '多头' : '空头') + '</span>' +
          '<span>' + (pnl >= 0 ? '+' : '') + pnl.toLocaleString() + '</span>' +
        '</div>';
      }).join('') + '</div>';
  }

  capitalHtml += '</section>';
  capitalContainer.innerHTML = capitalHtml;
  operationsContainer.innerHTML = operationsHtml;

  [capitalContainer, operationsContainer].forEach(function (container) {
    if (!container) return;

    container.querySelectorAll('[data-action="market-buy-stock"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onBuyStock) financeActions.onBuyStock(button.dataset.stockId);
      });
    });

    container.querySelectorAll('[data-action="market-take-loan"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onTakeLoan) financeActions.onTakeLoan(button.dataset.loanOfferId);
      });
    });

    container.querySelectorAll('[data-action="market-repay-loan"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onRepayLoan) financeActions.onRepayLoan(button.dataset.loanId);
      });
    });

    container.querySelectorAll('[data-action="market-sell-stock"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onSellStock) financeActions.onSellStock(button.dataset.stockId);
      });
    });

    container.querySelectorAll('[data-action="market-invest-trade-station"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onInvestTradeStation) financeActions.onInvestTradeStation(button.dataset.systemId);
      });
    });

    container.querySelectorAll('[data-action="market-purchase-insurance"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onPurchaseInsurance) financeActions.onPurchaseInsurance(button.dataset.policyType);
      });
    });

    container.querySelectorAll('[data-action="market-submit-claim"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onSubmitInsuranceClaim) financeActions.onSubmitInsuranceClaim(button.dataset.policyType);
      });
    });

    container.querySelectorAll('[data-action="market-build-station"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onBuildTradeStation) financeActions.onBuildTradeStation(button.dataset.systemId);
      });
    });

    container.querySelectorAll('[data-action="market-upgrade-station"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onUpgradeTradeStation) financeActions.onUpgradeTradeStation(button.dataset.systemId);
      });
    });

    container.querySelectorAll('[data-action="market-hire-manager"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onHireTradeStationManager) financeActions.onHireTradeStationManager(button.dataset.systemId, button.dataset.managerId);
      });
    });

    container.querySelectorAll('[data-action="market-set-strategy"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onSetTradeStationStrategy) financeActions.onSetTradeStationStrategy(button.dataset.systemId, button.dataset.strategyId);
      });
    });

    container.querySelectorAll('[data-action="market-futures-long"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onFuturesLong) financeActions.onFuturesLong(button.dataset.goodId);
      });
    });

    container.querySelectorAll('[data-action="market-futures-short"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onFuturesShort) financeActions.onFuturesShort(button.dataset.goodId);
      });
    });

    container.querySelectorAll('[data-action="market-futures-close"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onFuturesClose) financeActions.onFuturesClose(button.dataset.contractId);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// 价格总览表（默认视图）
// ---------------------------------------------------------------------------

/**
 * 渲染价格纵览矩阵：行=星球，列=商品
 * @param {object}   state
 * @param {string}   galaxyId       当前查看的星系
 * @param {Function} onPlanetClick  (systemId) => void
 */
export function renderOverview(state, galaxyId, onPlanetClick) {
  const thead = document.getElementById('market-overview-thead');
  const tbody = document.getElementById('market-overview-tbody');
  if (!thead || !tbody) return;

  const showSell = document.getElementById('market-show-sell');
  const isSell = showSell && showSell.checked;

  // 表头：星球 + 各商品
  thead.innerHTML = '';
  const headRow = document.createElement('tr');
  headRow.innerHTML = '<th class="mkt-ov-planet-th">星球</th>' +
    GOODS.map(function (g) {
      return '<th class="mkt-ov-good-th" title="' + g.name + '">' + g.emoji + '</th>';
    }).join('');
  thead.appendChild(headRow);

  // 获取该星系所有星球（按等级和名字排序）
  const playerLevel = state.playerLevel || 1;
  const allSystems = getSystemsByGalaxy(galaxyId);
  const accessible = allSystems.filter(function (s) {
    return isSystemAccessible(s.id, playerLevel);
  });
  // 玩家已访问的星球排前面，当前星球最优先
  const visited = state.visitedSystems || [];
  accessible.sort(function (a, b) {
    const aIsCur = a.id === state.currentSystem ? -2 : 0;
    const bIsCur = b.id === state.currentSystem ? -2 : 0;
    const aVisited = visited.indexOf(a.id) !== -1 ? -1 : 0;
    const bVisited = visited.indexOf(b.id) !== -1 ? -1 : 0;
    const diff = (aIsCur + aVisited) - (bIsCur + bVisited);
    if (diff !== 0) return diff;
    return (a.minLevel || 1) - (b.minLevel || 1);
  });

  tbody.innerHTML = '';
  accessible.forEach(function (sys) {
    const isCurrent = sys.id === state.currentSystem;
    const isVisited = visited.indexOf(sys.id) !== -1;
    const tr = document.createElement('tr');
    tr.className = 'mkt-ov-row' +
      (isCurrent ? ' mkt-ov-current' : '') +
      (isVisited ? ' mkt-ov-visited' : ' mkt-ov-unvisited');
    tr.dataset.sysId = sys.id;

    // 星球名列
    let planetCell = '<td class="mkt-ov-planet">' +
      '<span class="mkt-ov-dot" style="background:' + sys.color + '"></span>' +
      (isCurrent ? '📍 ' : '') +
      '<span class="mkt-ov-name">' + sys.name + '</span>' +
      '<span class="mkt-ov-type">' + sys.typeLabel + '</span>' +
      '</td>';

    // 各商品价格列
    let priceCells = '';
    GOODS.forEach(function (good) {
      const price = isSell
        ? Economy.getSellPrice(sys.id, good.id, state)
        : Economy.getBuyPrice(sys.id, good.id, state);
      const mult = Economy.getSystemMultiplier(sys.id, good.id);
      const isCheap = mult < 0.7;
      const isExpensive = mult > 1.4;
      const cls = isCheap ? 'price-low' : isExpensive ? 'price-high' : '';
      priceCells += '<td class="mkt-ov-price ' + cls + '">' + price + '</td>';
    });

    tr.innerHTML = planetCell + priceCells;

    // 点击行打开详情
    tr.addEventListener('click', function () {
      onPlanetClick(sys.id);
    });
    tr.style.cursor = 'pointer';

    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// 星球详情（交易视图）
// ---------------------------------------------------------------------------

/**
 * 渲染单个星球的商品详情表格（含买入/卖出按钮）
 * @param {object}   state
 * @param {Function} onBuy          (good) => void
 * @param {Function} onSell         (good) => void
 * @param {Function} onRefuel       () => void
 * @param {string}   [viewingSystem] 查看的星球 ID（默认为当前星球）
 * @param {string}   [marketMode]   'open' | 'black'（默认 'open'）
 * @param {Function} [onBlackBuy]   黑市买入回调 (good) => void
 * @param {Function} [onBlackSell]  黑市卖出回调 (good) => void
 * @param {object}   [financeActions] 股票/期货市场动作回调
 */
export function render(state, onBuy, onSell, onRefuel, viewingSystem, marketMode, onBlackBuy, onBlackSell, financeActions) {
  const sysId         = viewingSystem || state.currentSystem;
  const isCurrentSys  = sysId === state.currentSystem;
  const tbody         = document.getElementById('market-tbody');
  const isBlack       = marketMode === 'black';
  const dashboard     = document.getElementById('market-terminal-dashboard');
  _renderMarketWorkspaceTabs();
  tbody.innerHTML     = '';
  if (dashboard) dashboard.innerHTML = '';

  // 非当前星球时显示只读提示
  if (!isCurrentSys) {
    const noteRow = document.createElement('tr');
    noteRow.innerHTML = '<td colspan="6" class="market-readonly-note">⚠️ 仅查看价格，交易请前往该星球</td>';
    tbody.appendChild(noteRow);
  }

  // 黑市模式横幅
  var blackMarketUnlocked = Faction.canAccessBlackMarket(state, sysId);
  var systemFaction = Faction.getFactionForSystem(sysId);

  // 市场模式切换栏（仅在有黑市权限的星系显示）
  if (systemFaction && systemFaction.marketAccess && systemFaction.marketAccess.blackMarket) {
    var modeRow = document.createElement('tr');
    modeRow.className = 'market-mode-row';
    modeRow.innerHTML = '<td colspan="6" class="market-mode-bar">' +
      '<button class="market-mode-btn' + (!isBlack ? ' active' : '') + '" data-mode="open">🏪 公开市场</button>' +
      (blackMarketUnlocked
        ? '<button class="market-mode-btn' + (isBlack ? ' active' : '') + '" data-mode="black">🕶 黑市</button>'
        : '<button class="market-mode-btn disabled" disabled title="需与辛迪加达到友好关系">🔒 黑市</button>') +
      '</td>';
    tbody.appendChild(modeRow);
  }

  // 市场深度 / 黑市横幅
  var depth = Economy.getMarketDepth(sysId);
  var depthLabel = depth >= 350 ? '深度市场' : depth >= 200 ? '中等市场' : '浅层市场';
  var depthRow = document.createElement('tr');
  depthRow.className = 'market-depth-row';

  if (isBlack) {
    depthRow.innerHTML = '<td colspan="6" class="market-depth-info black-market-banner">' +
      '🕶 黑市交易 —— 高风险高回报，违禁品不受监管' +
      '<span class="bm-warning">⚠ 携带违禁品前往联邦区域将触发执法检查</span>' +
      '</td>';
  } else {
    depthRow.innerHTML = '<td colspan="6" class="market-depth-info">' +
      '📊 市场深度：<strong>' + depth + '</strong>（' + depthLabel + '）——' +
      (depth >= 350 ? '大宗交易对价格影响较小' : depth >= 200 ? '交易影响适中' : '大宗交易将显著影响价格') +
      (systemFaction && systemFaction.marketAccess && systemFaction.marketAccess.blackMarket
        ? (blackMarketUnlocked
          ? ' · 🕶 黑市资格已解锁'
          : ' · 🔒 黑市需与辛迪加达到友好关系')
        : '') +
      '</td>';
  }
  tbody.appendChild(depthRow);

  // 根据市场模式筛选商品
  var goodsList = isBlack ? Economy.getBlackMarketGoods() : GOODS;
  var focusKey = sysId + ':' + (marketMode || 'open');
  if (!_marketChartRange[focusKey]) _marketChartRange[focusKey] = 14;
  var snapshots = _buildMarketSnapshots(state, sysId, goodsList, isBlack, _marketChartRange[focusKey]);
  _renderMarketDashboard(state, sysId, marketMode || 'open', snapshots);
  var activeGoodId = _focusedMarketGood[focusKey] || (snapshots[0] && snapshots[0].good.id);

  goodsList.forEach(function (good) {
    var buyPrice, sellPrice;
    if (isBlack) {
      buyPrice  = Economy.getBlackMarketBuyPrice(sysId, good.id, state);
      sellPrice = Economy.getBlackMarketSellPrice(sysId, good.id, state);
    } else {
      buyPrice  = Economy.getBuyPrice(sysId, good.id, state);
      sellPrice = Economy.getSellPrice(sysId, good.id, state);
    }
    const inCargo     = state.cargo[good.id] || 0;
    const mult        = Economy.getSystemMultiplier(sysId, good.id);
    const sd          = Economy.getSupplyDemand(sysId, good.id);
    const isCheap     = mult < 0.7;
    const isExpensive = mult > 1.4;

    // 供需指示器
    let sdIcon = '⚖️';
    if (sd.ratio > 1.4) sdIcon = '🔥';      // 高需求
    else if (sd.ratio < 0.7) sdIcon = '📦';  // 高供给

    // Sparkline 走势图
    var history = Economy.getPriceHistory(sysId, good.id);
    var chartHistory = _normalizeChartHistory(history, sellPrice, 8);
    var chartDelta = _formatChartDelta(chartHistory);
    var miniChart = _renderMiniMarketChart(chartHistory, sellPrice, good.id);
    var marketTag = _marketAccessLabel(good);
    var legalityTip = _legalityTooltip(good);

    // 产业链提示
    var chainTip = _supplyChainTooltip(good);

    const tr = document.createElement('tr');
    tr.dataset.marketGood = good.id;
    tr.className = activeGoodId === good.id ? 'market-row-active' : '';
    tr.innerHTML =
      '<td><span class="good-icon">' + good.emoji + '</span>' + good.name +
        '<span class="sd-indicator" title="供:' + sd.supply + ' 需:' + sd.demand + '">' + sdIcon + '</span>' +
        (chainTip ? '<span class="chain-indicator" title="' + chainTip + '">🔗</span>' : '') +
        (marketTag ? '<span class="chain-indicator" title="' + legalityTip + '">' + marketTag + '</span>' : '') +
        '</td>' +
      '<td class="' + (isCheap ? 'price-low' : isExpensive ? 'price-high' : '') + '">' + buyPrice + '</td>' +
      '<td class="' + (isCheap ? 'price-low' : isExpensive ? 'price-high' : '') + '">' + sellPrice + '</td>' +
      '<td>' + (inCargo > 0 ? '<span class="qty-badge">' + inCargo + '</span>' : '—') + '</td>' +
      '<td class="action-cell">' +
        (isCurrentSys ? '<button class="btn-action buy-btn' + (isBlack ? ' bm-btn' : '') + '" data-id="' + good.id + '">' + (isBlack ? '🕶买' : '买入') + '</button>' : '') +
        (isCurrentSys && inCargo > 0 ? '<button class="btn-action sell-btn' + (isBlack ? ' bm-btn' : '') + '" data-id="' + good.id + '">' + (isBlack ? '🕶卖' : '卖出') + '</button>' : '') +
      '</td>' +
      '<td class="sparkline-cell">' +
        '<div class="market-chart-shell" title="近 ' + chartHistory.length + ' 日价格走势（K线 + 均线）">' +
          miniChart +
          '<span class="market-chart-delta ' + chartDelta.className + '">' + chartDelta.text + '</span>' +
        '</div>' +
      '</td>';

    if (isCurrentSys) {
      var buyCallback = isBlack && onBlackBuy ? onBlackBuy : onBuy;
      var sellCallback = isBlack && onBlackSell ? onBlackSell : onSell;
      tr.querySelector('.buy-btn').addEventListener('click', function (event) { event.stopPropagation(); buyCallback(good); });
      const sellBtn = tr.querySelector('.sell-btn');
      if (sellBtn) {
        sellBtn.addEventListener('click', function (event) { event.stopPropagation(); sellCallback(good); });
      }
    }
    tr.addEventListener('click', function () {
      _focusedMarketGood[focusKey] = good.id;
      render(state, onBuy, onSell, onRefuel, viewingSystem, marketMode, onBlackBuy, onBlackSell, financeActions);
    });
    tbody.appendChild(tr);
  });

  // 补燃料行（仅当前星球）
  if (isCurrentSys) {
    const fuelNeeded = Math.ceil(state.maxFuel - state.fuel);
    if (fuelNeeded > 0) {
      const tr = document.createElement('tr');
      tr.className = 'refuel-row';
      tr.innerHTML =
        '<td colspan="6">' +
          '<button id="refuel-btn" class="btn-refuel">⚡ 补充燃料（' + fuelNeeded + ' 单位）</button>' +
        '</td>';
      tr.querySelector('#refuel-btn').addEventListener('click', onRefuel);
      tbody.appendChild(tr);
    }
  }

  _renderFinancePanels(state, sysId, isCurrentSys, financeActions);
  _applyMarketWorkspaceTabState();
}

// ---------------------------------------------------------------------------
// 视图切换辅助
// ---------------------------------------------------------------------------

/** 显示总览，隐藏详情 */
export function showOverview() {
  const ov = document.getElementById('market-overview');
  const dt = document.getElementById('market-detail');
  const title = document.getElementById('market-header-title');
  const capital = document.getElementById('market-capital-panels');
  const operations = document.getElementById('market-operations-panels');
  if (ov) ov.classList.remove('hidden');
  if (dt) dt.classList.add('hidden');
  _activeMarketWorkspaceTab = 'spot';
  if (capital) capital.innerHTML = '';
  if (operations) operations.innerHTML = '';
  if (title) title.textContent = '◈ 蓝脉商业终端';
}

/** 显示详情，隐藏总览 */
export function showDetail(systemId, marketMode) {
  const ov = document.getElementById('market-overview');
  const dt = document.getElementById('market-detail');
  const loc = document.getElementById('market-detail-location');
  const title = document.getElementById('market-header-title');
  if (ov) ov.classList.add('hidden');
  if (dt) dt.classList.remove('hidden');
  const sys = findSystem(systemId);
  const isBlack = marketMode === 'black';
  if (sys && loc) {
    loc.textContent = sys.name + ' [' + sys.typeLabel + '] — ' + sys.description;
  }
  if (title) title.textContent = (isBlack ? '🕶 ' : '🏪 ') + (sys ? sys.name : '');
}
