// js/ui/MarketSpotPresenter.js — 现货交易、行情摘要与黑市的无状态视图投影
// 只生成 HTML / 更新指定容器，不绑定事件，也不持有工作区状态。

import { GOODS } from '../data/goods.js';
import { findSystem as findSystemDefault } from '../data/systems.js';
import * as Economy from '../systems/economy/Economy.js';
import * as Faction from '../systems/faction/FactionSystem.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeHtmlAttr(value) {
  return _escapeHtml(value).replace(/`/g, '&#96;');
}

function _getDomId(prefix, value) {
  var safeId = String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
  return prefix + '-' + safeId;
}

function _pickSnapshot(snapshots, comparator) {
  if (!snapshots || snapshots.length === 0) return null;
  return snapshots.slice().sort(comparator)[0] || null;
}

function _getFocusedSnapshot(snapshots, focusedGoodId) {
  if (!snapshots || snapshots.length === 0) return null;
  return snapshots.find(function (entry) {
    return entry.good.id === focusedGoodId;
  }) || snapshots[0] || null;
}

export function getMarketHeatMeta(multiplier) {
  if (multiplier < 0.65) {
    return { className: 'mkt-ov-price-freeze', label: '很便宜', note: '明显低于平常，适合买入' };
  }
  if (multiplier < 0.85) {
    return { className: 'mkt-ov-price-cool', label: '偏便宜', note: '价格偏低，可考虑买入' };
  }
  if (multiplier <= 1.15) {
    return { className: 'mkt-ov-price-neutral', label: '正常价', note: '价格接近平常' };
  }
  if (multiplier <= 1.45) {
    return { className: 'mkt-ov-price-warm', label: '偏贵', note: '价格偏高，适合卖出' };
  }
  return { className: 'mkt-ov-price-hot', label: '很贵', note: '明显高于平常，适合卖出' };
}

export function formatMarketHeatDelta(multiplier) {
  var deltaPct = Math.round((multiplier - 1) * 100);
  if (deltaPct > 0) return { text: '▲' + deltaPct + '%', className: 'up' };
  if (deltaPct < 0) return { text: '▼' + Math.abs(deltaPct) + '%', className: 'down' };
  return { text: '•0%', className: 'flat' };
}

export function describeTradeOpportunity(systemId, snapshot, heldQuantity, economy) {
  var economyPort = economy || Economy;
  if (!snapshot) {
    return { label: '均衡看盘', note: '当前没有足够数据形成交易信号。', className: 'balance' };
  }

  var multiplier = economyPort.getSystemMultiplier(systemId, snapshot.good.id);
  var demandRatio = snapshot.supplyDemand && snapshot.supplyDemand.ratio
    ? snapshot.supplyDemand.ratio
    : 1;
  var spread = snapshot.spread || 0;
  var safeHeldQuantity = heldQuantity || 0;

  if (multiplier <= 0.82 && demandRatio >= 0.95) {
    return { label: '价格偏低', note: '当前价格较低，适合分批买入，并保留一部分现金。', className: 'accumulate' };
  }
  if (multiplier >= 1.18 && safeHeldQuantity > 0) {
    return { label: '适合卖出', note: '已有库存且价格偏高，可优先卖出锁定利润。', className: 'distribute' };
  }
  if (demandRatio >= 1.35) {
    return { label: '需求较高', note: '需求高于供给，价格可能变化较快，建议多看一眼走势。', className: 'surge' };
  }
  if (spread >= Math.max(12, Math.round((snapshot.sellPrice || 0) * 0.12))) {
    return { label: '买卖价差较大', note: '先比较其他星球的价格，再决定是否交易。', className: 'watch' };
  }
  return { label: '暂时观望', note: '价格和供需比较平稳，可以等更清楚的机会。', className: 'balance' };
}

export function formatSupplyChainTooltip(good) {
  if (!good || !good.upstream || good.upstream.length === 0) return '';
  var deps = good.upstream.map(function (dep) {
    var upstreamGood = GOODS.find(function (entry) { return entry.id === dep.goodId; });
    return (upstreamGood ? upstreamGood.emoji + upstreamGood.name : dep.goodId) + '(' + Math.round(dep.weight * 100) + '%)';
  }).join(', ');
  return '🔗 依赖: ' + deps;
}

export function formatLegalityTooltip(good) {
  if (good && good.legality === 'illegal') return '仅可在黑市安全流通';
  if (good && good.legality === 'restricted') return '受监管商品，在黑市需求更高';
  return '';
}

export function renderMarketIntelTools(options) {
  var priceMode = options && options.priceMode === 'sell' ? 'sell' : 'buy';
  return '<section class="market-trend-column market-trend-column--intel" aria-label="可选价格工具">' +
    '<div class="market-column-heading">' +
      '<div><span class="market-column-kicker">可选工具</span><h4>详细价格数据</h4></div>' +
      '<span class="market-column-state">需要时再展开，不影响直接买卖</span>' +
    '</div>' +
    '<div class="market-intel-drawers" role="region" aria-label="详细行情工具">' +
      '<details class="market-collapse market-collapse-chart">' +
        '<summary>价格走势 <span class="market-collapse-hint">查看最近 7 / 14 / 30 天</span></summary>' +
        '<div class="market-collapse-body">' +
          '<div id="market-kline-panel" class="market-kline-panel" role="region" aria-label="价格走势">' +
            '<div class="market-kline-header"><div class="market-kline-title" id="market-kline-title"></div><div class="market-kline-range-bar" id="market-kline-range-bar"></div></div>' +
            '<div class="market-kline-ohlc" id="market-kline-ohlc"></div>' +
            '<div class="market-kline-body" id="market-kline-body"></div>' +
            '<div class="market-kline-footer"><div class="market-kline-metrics" id="market-kline-metrics"></div></div>' +
          '</div>' +
        '</div>' +
      '</details>' +
      '<details class="market-collapse market-collapse-chart">' +
        '<summary>各地价格表 <span class="market-collapse-hint">比较哪里买、哪里卖</span></summary>' +
        '<div class="market-collapse-body">' +
          '<div class="market-heatmap-toolbar">' +
            '<div class="market-heatmap-legend" aria-label="价格高低图例">' +
              '<span class="market-heatmap-legend-item freeze">很便宜</span><span class="market-heatmap-legend-item cool">偏便宜</span><span class="market-heatmap-legend-item neutral">正常价</span><span class="market-heatmap-legend-item warm">偏贵</span><span class="market-heatmap-legend-item hot">很贵</span>' +
            '</div>' +
            '<div class="market-price-view" aria-label="查看买价或卖价">' +
              '<span id="market-price-view-label" class="market-price-view-label">显示</span>' +
              '<div class="market-price-mode" role="radiogroup" aria-labelledby="market-price-view-label">' +
                '<button id="market-overview-price-buy" class="market-price-mode-btn' + (priceMode === 'buy' ? ' is-active' : '') + '" type="button" role="radio" aria-checked="' + (priceMode === 'buy' ? 'true' : 'false') + '" aria-controls="market-trade-overview-table" tabindex="' + (priceMode === 'buy' ? '0' : '-1') + '" data-market-overview-price-mode="buy">买入价</button>' +
                '<button id="market-overview-price-sell" class="market-price-mode-btn' + (priceMode === 'sell' ? ' is-active' : '') + '" type="button" role="radio" aria-checked="' + (priceMode === 'sell' ? 'true' : 'false') + '" aria-controls="market-trade-overview-table" tabindex="' + (priceMode === 'sell' ? '0' : '-1') + '" data-market-overview-price-mode="sell">卖出价</button>' +
              '</div>' +
              '<span id="market-overview-price-status" class="market-price-view-status" role="status" aria-live="polite">表格显示各地的' + (priceMode === 'sell' ? '卖出价' : '买入价') + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="market-trade-overview-scroll"><table id="market-trade-overview-table" aria-describedby="market-overview-price-status"><thead id="market-trade-overview-thead"></thead><tbody id="market-trade-overview-tbody"></tbody></table></div>' +
        '</div>' +
      '</details>' +
      '<details class="market-collapse market-collapse-chart"><summary>最近涨跌 <span class="market-collapse-hint">哪些货物变化较大</span></summary><div class="market-collapse-body"><div id="market-terminal-dashboard" class="market-terminal-dashboard"></div></div></details>' +
    '</div>' +
  '</section>';
}

export function renderSpotTradeSection() {
  return '<div id="market-quick-trade-dock" class="market-quick-trade-dock" role="region" aria-label="当前货物与快速交易"></div>' +
    '<div class="market-spot-trade-layout market-spot-trade-layout--simple" role="region" aria-label="买卖货物">' +
      '<section class="market-goods-shell market-goods-column" aria-label="商品交易列表"><div id="market-goods-toolbar" class="market-goods-toolbar"></div><div id="market-goods-list" class="market-goods-list" role="list"></div></section>' +
    '</div>';
}

export function renderQuickTradeDock(request) {
  var snapshots = request.snapshots || [];
  if (snapshots.length === 0) return '';
  var state = request.state || {};
  var focused = _getFocusedSnapshot(snapshots, request.focusedGoodId);
  if (!focused) return '';

  var cargo = state.cargo || {};
  var inCargo = cargo[focused.good.id] || 0;
  var cargoUsed = Object.values(cargo).reduce(function (sum, quantity) { return sum + quantity; }, 0);
  var cargoMax = state.maxCargo || 100;
  var cargoSpace = Math.max(0, cargoMax - cargoUsed);
  var maxAffordable = focused.buyPrice > 0 ? Math.floor((state.credits || 0) / focused.buyPrice) : 0;
  var maxBuy = Math.max(0, Math.min(cargoSpace, maxAffordable));
  var signal = describeTradeOpportunity(request.systemId, focused, inCargo, request.economy);
  var modeLabel = request.marketMode === 'black' ? '黑市价格' : '公开市场';

  return '<section class="market-quick-trade-card" data-market-quick-good="' + _escapeHtmlAttr(focused.good.id) + '">' +
    '<div class="market-quick-trade-main"><span class="market-quick-trade-icon">' + focused.good.emoji + '</span><div class="market-quick-trade-copy"><div class="market-quick-trade-kicker">当前交易 · ' + _escapeHtml(modeLabel) + '</div><div class="market-quick-trade-title">' + _escapeHtml(focused.good.name) + ' · ' + _escapeHtml(signal.label) + '</div><div class="market-quick-trade-note">' + _escapeHtml(signal.note) + '</div></div></div>' +
    '<div class="market-quick-trade-prices" aria-label="当前货物、资金与货舱状态">' +
      '<span><em>买入</em><strong>' + focused.buyPrice.toLocaleString() + '</strong></span><span><em>卖出</em><strong>' + focused.sellPrice.toLocaleString() + '</strong></span><span><em>货舱</em><strong>' + inCargo + '/' + cargoMax + '</strong></span><span><em>可用资金</em><strong>' + Math.floor(state.credits || 0).toLocaleString() + '</strong></span><span><em>最多买</em><strong>' + maxBuy + '</strong></span>' +
    '</div>' +
    '<div class="market-quick-trade-actions">' +
      (request.isCurrentSystem
        ? '<button class="market-quick-trade-btn market-quick-trade-btn--sell' + (inCargo > 0 ? '' : ' disabled') + '" type="button" data-market-quick-action="sell" data-id="' + _escapeHtmlAttr(focused.good.id) + '"' + (inCargo > 0 ? '' : ' disabled title="货舱中没有该货物"') + '>' + (inCargo > 0 ? '出售库存' : '无库存') + '</button><button class="market-quick-trade-btn market-quick-trade-btn--buy" type="button" data-market-quick-action="buy" data-id="' + _escapeHtmlAttr(focused.good.id) + '">买入货物</button>'
        : '<button class="market-quick-trade-btn disabled" type="button" disabled title="抵达该地点后才可交易">远程只读</button>') +
    '</div>' +
  '</section>';
}

export function renderSpotGoodsToolbar(request) {
  var snapshots = request.snapshots || [];
  if (snapshots.length === 0) return '';
  var state = request.state || {};
  var cargo = state.cargo || {};
  var focused = _getFocusedSnapshot(snapshots, request.focusedGoodId);
  var focusSignal = describeTradeOpportunity(request.systemId, focused, cargo[focused.good.id] || 0, request.economy);
  var cargoKinds = snapshots.filter(function (entry) { return (cargo[entry.good.id] || 0) > 0; }).length;
  var hotGoods = snapshots.filter(function (entry) { return entry.supplyDemand && entry.supplyDemand.ratio >= 1.2; }).length;
  function renderPill(label, value) {
    return '<span class="market-goods-toolbar-pill">' + label + '<strong>' + value + '</strong></span>';
  }
  return '<div class="market-goods-toolbar-copy"><div class="market-goods-toolbar-title">可交易货物</div><div class="market-goods-toolbar-note">当前查看：' + focused.good.emoji + ' ' + focused.good.name + ' · ' + focusSignal.label + '。点击其他货物即可查看价格并买卖。</div></div>' +
    '<div class="market-goods-toolbar-pills">' + renderPill('商品', String(snapshots.length)) + renderPill('库存种类', String(cargoKinds)) + renderPill('紧俏商品', String(hotGoods)) + renderPill('渠道', request.marketMode === 'black' ? '黑市' : '公开') + '</div>';
}

export function renderAnalysisPanel(request) {
  var container = request.container;
  if (!container) return;
  var snapshots = request.snapshots || [];
  if (snapshots.length === 0) {
    container.innerHTML = '';
    return;
  }

  var state = request.state || {};
  var cargo = state.cargo || {};
  var economy = request.economy || Economy;
  var faction = request.faction || Faction;
  var findSystem = request.findSystem || findSystemDefault;
  var system = findSystem(request.systemId);
  var totalVolume = snapshots.reduce(function (sum, entry) { return sum + entry.buyPrice; }, 0);
  var avgSpread = snapshots.reduce(function (sum, entry) { return sum + entry.spread; }, 0) / snapshots.length;
  var marketDepth = economy.getMarketDepth(request.systemId);
  var negotiationProfile = economy.getTradeNegotiationProfile(state, request.systemId);
  var densityLabel = marketDepth >= 350 ? '高' : marketDepth >= 200 ? '中' : '低';
  var systemFaction = faction.getFactionForSystem(request.systemId);
  var focused = _getFocusedSnapshot(snapshots, request.focusedGoodId);
  var focusSignal = focused
    ? describeTradeOpportunity(request.systemId, focused, cargo[focused.good.id] || 0, economy)
    : describeTradeOpportunity(request.systemId, null, 0, economy);
  var movers = snapshots.slice().sort(function (a, b) {
    return Math.abs(parseFloat(b.delta.text)) - Math.abs(parseFloat(a.delta.text));
  }).slice(0, 4);
  var watchList = snapshots.slice().sort(function (a, b) {
    var aScore = ((a.supplyDemand && a.supplyDemand.ratio) || 1) * 100 + (a.spread || 0) + (a.swing || 0);
    var bScore = ((b.supplyDemand && b.supplyDemand.ratio) || 1) * 100 + (b.spread || 0) + (b.swing || 0);
    return bScore - aScore;
  }).slice(0, 4);
  var cargoItems = snapshots.filter(function (entry) { return (cargo[entry.good.id] || 0) > 0; });
  var cargoUsed = Object.values(cargo).reduce(function (sum, quantity) { return sum + quantity; }, 0);
  var cargoMax = state.maxCargo || 100;

  container.innerHTML =
    '<div class="market-analysis-card market-analysis-main">' +
      '<div class="market-analysis-header"><div><div class="market-analysis-title">📡 行情摘要</div><div class="market-analysis-subtitle">' + (system ? system.name : '当前地点') + ' · ' + (request.marketMode === 'black' ? '黑市' : '公开市场') + '</div></div><span class="market-analysis-chip">市场规模 ' + densityLabel + '</span></div>' +
      '<div class="market-analysis-metrics">' +
        '<div class="market-analysis-metric"><span class="market-analysis-metric-label">市场参考值</span><span class="market-analysis-metric-value">' + (totalVolume >= 1000000 ? (totalVolume / 1000000).toFixed(1) + '<small>M</small>' : totalVolume >= 1000 ? (totalVolume / 1000).toFixed(1) + '<small>K</small>' : totalVolume.toLocaleString()) + ' <small>CR</small></span></div>' +
        '<div class="market-analysis-metric"><span class="market-analysis-metric-label">市场规模</span><span class="market-analysis-metric-value">' + densityLabel + '</span></div>' +
        '<div class="market-analysis-metric"><span class="market-analysis-metric-label">平均买卖差</span><span class="market-analysis-metric-value">' + Math.round(avgSpread).toLocaleString() + ' <small>CR</small></span></div>' +
        '<div class="market-analysis-metric"><span class="market-analysis-metric-label">货舱占用</span><span class="market-analysis-metric-value">' + cargoUsed + '<small>/' + cargoMax + '</small></span></div>' +
      '</div><hr class="market-analysis-divider" /><div class="market-analysis-section-title">行情研判</div>' +
      '<div class="market-analysis-signal-card ' + focusSignal.className + '"><div class="market-analysis-signal-head"><span class="market-analysis-signal-title">' + (focused ? (focused.good.emoji + ' ' + focused.good.name) : '暂无聚焦货物') + '</span><span class="market-analysis-signal-label">' + focusSignal.label + '</span></div><div class="market-analysis-signal-note">' +
        (focused ? (focusSignal.note + ' 买入 ' + focused.buyPrice.toLocaleString() + ' / 卖出 ' + focused.sellPrice.toLocaleString() + ' / 供需 ' + focused.supplyDemand.ratio.toFixed(2) + 'x。') : focusSignal.note) +
      '</div></div>' +
    '</div>' +
    '<div class="market-analysis-card"><div class="market-analysis-title">🎯 优先观察</div><div class="market-analysis-mover-list">' +
      watchList.map(function (entry) {
        var entrySignal = describeTradeOpportunity(request.systemId, entry, cargo[entry.good.id] || 0, economy);
        return '<div class="market-analysis-mover"><div class="market-analysis-mover-copy"><span class="market-analysis-mover-name">' + entry.good.emoji + ' ' + entry.good.name + '</span><span class="market-analysis-mover-note">' + entrySignal.label + ' · 供需 ' + entry.supplyDemand.ratio.toFixed(2) + 'x · 差价 ' + entry.spread.toLocaleString() + '</span></div><span class="market-analysis-mover-delta ' + entry.delta.className.replace('market-chart-', '') + '">' + entry.delta.text + '</span></div>';
      }).join('') +
      '</div><hr class="market-analysis-divider" /><div class="market-analysis-section-title">近期波动</div><div class="market-analysis-mover-list">' +
      movers.map(function (entry) {
        var deltaValue = parseFloat(entry.delta.text);
        var deltaClass = deltaValue > 0.5 ? 'up' : (deltaValue < -0.5 ? 'down' : 'flat');
        return '<div class="market-analysis-mover"><span class="market-analysis-mover-name">' + entry.good.emoji + ' ' + entry.good.name + '</span><span class="market-analysis-mover-delta ' + deltaClass + '">' + entry.delta.text + '</span></div>';
      }).join('') +
      '</div></div>' +
    '<div class="market-analysis-card"><div class="market-analysis-title">📦 航运状态</div><div class="market-analysis-cargo-bar"><div class="market-analysis-cargo-bar-track"><div class="market-analysis-cargo-bar-fill" style="width:' + Math.min(100, Math.round(cargoUsed / cargoMax * 100)) + '%"></div></div><span class="market-analysis-cargo-bar-text">' + cargoUsed + '/' + cargoMax + '</span></div>' +
      (cargoItems.length > 0
        ? '<div class="market-analysis-cargo-list">' + cargoItems.map(function (entry) { return '<div class="market-analysis-cargo-row"><span>' + entry.good.emoji + ' ' + entry.good.name + '</span><span class="market-analysis-cargo-qty">×' + (cargo[entry.good.id] || 0) + '</span></div>'; }).join('') + '</div>'
        : '<div class="market-analysis-empty">货舱为空</div>') +
      '<div class="market-analysis-fact-list"><div class="market-analysis-fact-row"><span>当前势力</span><strong>' + (systemFaction ? systemFaction.name : '中立地带') + '</strong></div><div class="market-analysis-fact-row"><span>运行模式</span><strong>' + (request.marketMode === 'black' ? '🕶 黑市' : '🏪 公开') + '</strong></div><div class="market-analysis-fact-row"><span>地点类型</span><strong>' + (system ? system.typeLabel : '未知') + '</strong></div><div class="market-analysis-fact-row"><span>可交易规模</span><strong>' + marketDepth + '</strong></div><div class="market-analysis-fact-row"><span>势力价格优惠</span><strong>买价 -' + Math.round(negotiationProfile.buyAdvantage * 100) + '% / 卖价 +' + Math.round(negotiationProfile.sellAdvantage * 100) + '%</strong></div></div>' +
    '</div>';
}

function _renderSpotSignalMetric(label, value, note, toneClass) {
  return '<div class="market-spot-signal-item' + (toneClass ? ' ' + toneClass : '') + '" role="listitem"><span class="market-spot-signal-label">' + _escapeHtml(label) + '</span><strong class="market-spot-signal-value">' + _escapeHtml(value) + '</strong><span class="market-spot-signal-note">' + _escapeHtml(note) + '</span></div>';
}

function _renderSpotFocus(title, note, tone) {
  return '<div class="market-spot-focus" aria-label="现货市场信号" data-tone="' + _escapeHtmlAttr(tone || 'idle') + '"><span class="market-spot-focus-kicker">行情信号</span><strong class="market-spot-focus-title">' + _escapeHtml(title) + '</strong><span class="market-spot-focus-note">' + _escapeHtml(note) + '</span></div>';
}

function _renderSpotIntelSignalPanel(watchList, marketMode, blackMarketUnlocked) {
  var focusTitle = '看看行情再决定';
  var focusNote = watchList.length > 0 ? ('当前有 ' + watchList.length + ' 个货物值得关注，先比较需求、价格变化和买卖价差。') : '当前行情数据不足，先用地点速览判断是否值得停留。';
  var focusTone = watchList.length > 0 ? 'watch' : 'idle';
  if (blackMarketUnlocked) {
    focusTitle = marketMode === 'black' ? '黑市信息已显示' : '可以切换特殊市场';
    focusNote = '当前地点可以进入黑市，可在黑市页看清风险后再切换报价。';
    focusTone = 'ready';
  }
  return '<div class="market-spot-signal-panel market-intel-signal-panel" aria-label="行情概览"><div class="market-spot-signal-head"><div><div class="market-spot-signal-title">行情摘要</div><div class="market-spot-signal-subtitle">集中显示关注商品和特殊市场状态，方便判断下一笔交易。</div></div><span class="market-finance-chip">行情观察</span></div><div class="market-spot-signal-grid" role="list" aria-label="行情信息">' +
    _renderSpotSignalMetric('关注货物', String(watchList.length), watchList.length > 0 ? '按需求、价格变化和买卖价差排序' : '等待更多价格变化', watchList.length > 0 ? 'tone-warm' : '') +
    _renderSpotSignalMetric('特殊开放条件', blackMarketUnlocked ? '黑市开放' : '公开视图', marketMode === 'black' ? '当前查看黑市报价' : '当前查看公开报价', blackMarketUnlocked ? 'tone-cool' : '') +
    '</div>' + _renderSpotFocus(focusTitle, focusNote, focusTone) + '</div>';
}

export function renderSpotIntelSection(request) {
  var state = request.state || {};
  var snapshots = request.snapshots || [];
  var economy = request.economy || Economy;
  var findSystem = request.findSystem || findSystemDefault;
  var system = findSystem(request.systemId);
  var bestDemand = _pickSnapshot(snapshots, function (a, b) { return b.supplyDemand.ratio - a.supplyDemand.ratio; });
  var biggestSwing = _pickSnapshot(snapshots, function (a, b) { return b.swing - a.swing; });
  var lowestBuy = _pickSnapshot(snapshots, function (a, b) { return a.buyPrice - b.buyPrice; });
  var widestSpread = _pickSnapshot(snapshots, function (a, b) { return b.spread - a.spread; });
  var watchList = snapshots.slice().sort(function (a, b) { return (b.supplyDemand.ratio + b.swing / 100) - (a.supplyDemand.ratio + a.swing / 100); }).slice(0, 4);
  var marketDepth = economy.getMarketDepth(request.systemId);
  var negotiationProfile = economy.getTradeNegotiationProfile(state, request.systemId);
  var nodeTitleId = _getDomId('market-intel-node-title', request.systemId);
  var nodeMetaId = _getDomId('market-intel-node-meta', request.systemId);
  var accessTitleId = _getDomId('market-intel-access-title', request.systemId);
  var accessMetaId = _getDomId('market-intel-access-meta', request.systemId);

  return renderMarketIntelTools({ priceMode: request.priceMode }) + '<section class="market-finance-section">' +
    '<div class="market-finance-section-head"><div><div class="market-finance-title">🧭 行情参考</div><div class="market-finance-subtitle">汇总这里的价格变化和开放条件，帮你决定下一笔交易。</div></div><span class="market-finance-chip">' + (request.marketMode === 'black' ? '黑市视图' : '公开视图') + '</span></div>' +
    '<div class="market-finance-summary-grid market-spot-intel-grid">' +
      '<div class="market-finance-summary-metric"><span>最低买入</span><strong>' + (lowestBuy ? (lowestBuy.good.emoji + ' ' + lowestBuy.buyPrice.toLocaleString()) : '—') + '</strong></div>' +
      '<div class="market-finance-summary-metric"><span>最高需求</span><strong>' + (bestDemand ? (bestDemand.good.emoji + ' ' + bestDemand.supplyDemand.ratio.toFixed(2) + 'x') : '—') + '</strong></div>' +
      '<div class="market-finance-summary-metric"><span>最大价格变化</span><strong>' + (biggestSwing ? (biggestSwing.good.emoji + ' ' + biggestSwing.swing.toLocaleString()) : '—') + '</strong></div>' +
      '<div class="market-finance-summary-metric"><span>买卖价差</span><strong>' + (widestSpread ? (widestSpread.good.emoji + ' ' + widestSpread.spread.toLocaleString()) : '—') + '</strong></div>' +
      '<div class="market-finance-summary-metric"><span>势力价格优惠</span><strong>买价 -' + Math.round(negotiationProfile.buyAdvantage * 100) + '% · 卖价 +' + Math.round(negotiationProfile.sellAdvantage * 100) + '%</strong></div>' +
    '</div>' + _renderSpotIntelSignalPanel(watchList, request.marketMode, request.blackMarketUnlocked) + '</section>' +
    '<details class="market-intel-secondary-details"><summary><span>地点条件与完整关注清单</span><small>TOP ' + watchList.length + '</small></summary><div class="market-intel-secondary-body"><div class="market-intel-decision-grid" role="group" aria-label="地点和关注商品">' +
      '<section class="market-finance-section market-intel-node-section"><div class="market-finance-section-head"><div><div class="market-finance-title">📡 地点速览</div><div class="market-finance-subtitle">当地市场大小、所属势力和黑市开放条件。</div></div></div><div class="market-finance-action-list market-intel-node-list" role="list" aria-label="地点行情和开放条件">' +
        '<article class="market-finance-action-row market-intel-node-row" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(nodeTitleId) + '" aria-describedby="' + _escapeHtmlAttr(nodeMetaId) + '"><div class="market-finance-action-main"><div id="' + _escapeHtmlAttr(nodeTitleId) + '" class="market-finance-action-title">' + _escapeHtml(system ? system.name : '当前地点') + '</div><div id="' + _escapeHtmlAttr(nodeMetaId) + '" class="market-finance-action-meta market-intel-node-meta"><span class="market-intel-node-facts"><span>市场大小 <strong>' + marketDepth + '</strong></span><span>' + _escapeHtml(system ? system.typeLabel : '未知类型') + '</span></span><span class="market-intel-node-description">' + _escapeHtml(system ? system.description : '暂无地点说明') + '</span></div></div><div class="market-finance-network-note">' + _escapeHtml(request.systemFaction ? request.systemFaction.name : '中立地带') + '</div></article>' +
        '<article class="market-finance-action-row market-intel-node-row" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(accessTitleId) + '" aria-describedby="' + _escapeHtmlAttr(accessMetaId) + '"><div class="market-finance-action-main"><div id="' + _escapeHtmlAttr(accessTitleId) + '" class="market-finance-action-title">特殊市场开放条件</div><div id="' + _escapeHtmlAttr(accessMetaId) + '" class="market-finance-action-meta market-intel-node-meta"><span class="market-intel-node-facts"><span>公开市场 <strong>开放</strong></span><span>黑市</span></span><span class="market-intel-node-description">' + (request.systemFaction && request.systemFaction.marketAccess && request.systemFaction.marketAccess.blackMarket ? '该势力辖区存在黑市通路。' : '当前地点无黑市入口，仅开放公开市场。') + '</span></div></div><div class="market-finance-network-note">' + (request.blackMarketUnlocked ? '已解锁' : '未解锁') + '</div></article>' +
      '</div></section>' +
      '<section class="market-finance-section market-watch-section"><div class="market-finance-section-head"><div><div class="market-finance-title">🎯 关注优先级</div><div class="market-finance-subtitle">按需求、价格变化和买卖价差排序。</div></div><span class="market-finance-chip">TOP ' + watchList.length + '</span></div>' +
        (watchList.length > 0
          ? '<div class="market-finance-action-list market-watch-list" role="list" aria-label="值得关注的货物">' + watchList.map(function (entry) {
              var watchTitleId = _getDomId('market-watch-title', entry.good.id);
              var watchMetaId = _getDomId('market-watch-meta', entry.good.id);
              return '<article class="market-finance-action-row market-watch-row" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(watchTitleId) + '" aria-describedby="' + _escapeHtmlAttr(watchMetaId) + '"><div class="market-finance-action-main"><div id="' + _escapeHtmlAttr(watchTitleId) + '" class="market-finance-action-title">' + entry.good.emoji + ' ' + entry.good.name + '</div><div id="' + _escapeHtmlAttr(watchMetaId) + '" class="market-finance-action-meta market-watch-metrics"><span>买 <strong>' + entry.buyPrice.toLocaleString() + '</strong></span><span>卖 <strong>' + entry.sellPrice.toLocaleString() + '</strong></span><span>需求 <strong>' + entry.supplyDemand.ratio.toFixed(2) + 'x</strong></span></div></div><div class="market-finance-network-note market-watch-swing"><span>变化</span><strong>' + entry.swing.toLocaleString() + '</strong></div></article>';
            }).join('') + '</div>'
          : '<div class="market-finance-empty">当前没有足够的行情数据生成观察名单。</div>') +
      '</section>' +
    '</div></div></details>';
}

function _renderBlackMarketRiskPanel(request, hasBlackMarket, blackGoods, economy) {
  var state = request.state || {};
  var risk = economy.estimateSmugglingCargoRisk(state, request.systemId, state.cargo || {});
  var smugglingStats = state.smugglingStats && typeof state.smugglingStats === 'object' ? state.smugglingStats : {};
  var riskedArrivals = Math.max(0, Number(smugglingStats.riskedArrivals || 0));
  var caughtArrivals = Math.max(0, Number(smugglingStats.caught || 0));
  var safeArrivals = Math.max(0, Number(smugglingStats.evaded || 0));
  var realizedProfit = Number(smugglingStats.blackMarketRealizedProfit || 0);
  var enforcementLoss = Math.max(0, Number(smugglingStats.finesPaid || 0)) + Math.max(0, Number(smugglingStats.confiscatedCostBasis || 0));
  var actualBlackMarketResult = realizedProfit - enforcementLoss;
  var illegalGoodsCount = blackGoods.filter(function (good) { return good.legality === 'illegal'; }).length;
  var accessValue = hasBlackMarket ? (request.blackMarketUnlocked ? '可切换' : '待解锁') : '无入口';
  var accessNote = hasBlackMarket ? (request.blackMarketUnlocked ? ('货目录 ' + blackGoods.length + ' 项 · 违禁 ' + illegalGoodsCount + ' 项') : '需要提升辛迪加关系后开放') : '当前势力辖区不提供黑市通路';
  var focusTitle = '无本地入口';
  var focusNote = '该地点没有黑市，买卖特殊货物需要前往辛迪加辖区。';
  var focusTone = 'idle';
  if (hasBlackMarket && !request.blackMarketUnlocked) {
    focusTitle = '黑市资格未达标'; focusNote = '可以先查看风险与货目录，但当前无法切换到黑市报价。'; focusTone = 'watch';
  } else if (request.blackMarketUnlocked && risk.hasContraband && risk.protectedByBlackMarket) {
    focusTitle = '黑市保护已覆盖'; focusNote = '当前货舱含违禁品，但该地点已开放黑市，入港被检查的概率为 ' + risk.checkChancePercent + '%。'; focusTone = 'ready';
  } else if (risk.hasContraband) {
    focusTitle = '走私检查暴露'; focusNote = '当前货舱含 ' + risk.contrabandGoods.join('、') + '，预计检查概率 ' + risk.checkChancePercent + '%。'; focusTone = 'risk';
  } else if (request.blackMarketUnlocked && request.marketMode === 'black') {
    focusTitle = '灰市报价在线'; focusNote = '当前交易页已切换到黑市报价，适合先核对违禁品和受监管商品。'; focusTone = 'ready';
  } else if (request.blackMarketUnlocked) {
    focusTitle = '可切换观察'; focusNote = '黑市资格已开放，切换前先确认货舱、路线和执法等级。'; focusTone = 'watch';
  }
  return '<div class="market-spot-signal-panel market-black-risk-panel" aria-label="黑市风险局部状态"><div class="market-spot-signal-head"><div><div class="market-spot-signal-title">黑市风险状态</div><div class="market-spot-signal-subtitle">先看开放条件、执法、违禁货值和检查概率，再决定是否切换特殊市场。</div></div><span class="market-finance-chip">' + (risk.protectedByBlackMarket ? '保护覆盖' : risk.enforcementLabel) + '</span></div>' +
    '<div class="market-spot-signal-grid" role="list" aria-label="黑市风险指标">' +
      _renderSpotSignalMetric('开放条件状态', accessValue, accessNote, request.blackMarketUnlocked ? 'tone-cool' : (hasBlackMarket ? 'tone-warm' : '')) +
      _renderSpotSignalMetric('执法等级', risk.enforcementLabel, '声望修正 ×' + risk.reputationModifier.toFixed(2), risk.enforcement === 'high' ? 'tone-hot' : (risk.enforcement === 'medium' ? 'tone-warm' : 'tone-cool')) +
      _renderSpotSignalMetric('违禁货值', Math.floor(risk.contrabandValue || 0).toLocaleString(), risk.hasContraband ? risk.contrabandGoods.join('、') : '货舱暂无违禁品', risk.hasContraband ? 'tone-hot' : '') +
      _renderSpotSignalMetric('检查概率', risk.checkChancePercent + '%', risk.protectedByBlackMarket ? '黑市资格降低入港检查压力' : '由执法等级、货值占比和声望决定', risk.checkChancePercent > 0 ? 'tone-hot' : 'tone-cool') +
    '</div><div class="market-spot-signal-grid" role="list" aria-label="黑市实际经营结果">' +
      _renderSpotSignalMetric('已结算利润', Math.round(realizedProfit).toLocaleString(), '只统计已经卖出的黑市货物', realizedProfit >= 0 ? 'tone-cool' : 'tone-hot') +
      _renderSpotSignalMetric('执法损失', Math.round(enforcementLoss).toLocaleString(), '罚款与被没收货物的实际成本', enforcementLoss > 0 ? 'tone-hot' : '') +
      _renderSpotSignalMetric('实际净结果', Math.round(actualBlackMarketResult).toLocaleString(), '已结算利润减去罚款和没收成本', actualBlackMarketResult >= 0 ? 'tone-cool' : 'tone-hot') +
      _renderSpotSignalMetric('入港结果', safeArrivals + ' 安全 / ' + caughtArrivals + ' 被查', riskedArrivals > 0 ? ('共 ' + riskedArrivals + ' 次有风险入港') : '尚无有风险入港记录', caughtArrivals > 0 ? 'tone-warm' : '') +
    '</div>' + _renderSpotFocus(focusTitle, focusNote, focusTone) + '</div>';
}

export function renderBlackMarketSection(request) {
  var economy = request.economy || Economy;
  var hasBlackMarket = !!(request.systemFaction && request.systemFaction.marketAccess && request.systemFaction.marketAccess.blackMarket);
  var blackGoods = economy.getBlackMarketGoods();
  var blackStatusTitleId = _getDomId('market-black-status-title', request.systemId);
  var blackStatusMetaId = _getDomId('market-black-status-meta', request.systemId);
  var blackStatusRiskId = _getDomId('market-black-status-risk', request.systemId);
  return '<section class="market-finance-section"><div class="market-finance-section-head"><div><div class="market-finance-title">🕶 特殊市场接入</div><div class="market-finance-subtitle">把公开市场和黑市切换单独收进这一页，避免交易表里混入额外控制按钮。</div></div><span class="market-finance-chip">当前 ' + (request.marketMode === 'black' ? '黑市' : '公开') + '</span></div>' +
    _renderBlackMarketRiskPanel(request, hasBlackMarket, blackGoods, economy) +
    (hasBlackMarket
      ? '<div class="market-black-switcher"><div class="market-mode-bar market-mode-bar-panel" role="group" aria-label="市场模式切换"><button class="market-mode-btn' + (request.marketMode !== 'black' ? ' active' : '') + '" data-mode="open" aria-pressed="' + (request.marketMode !== 'black' ? 'true' : 'false') + '" aria-label="切换到公开市场">🏪 公开市场</button>' +
        (request.blackMarketUnlocked ? '<button class="market-mode-btn' + (request.marketMode === 'black' ? ' active' : '') + '" data-mode="black" aria-pressed="' + (request.marketMode === 'black' ? 'true' : 'false') + '" aria-label="切换到黑市">🕶 黑市</button>' : '<button class="market-mode-btn disabled" disabled aria-disabled="true" title="需与辛迪加达到友好关系">🔒 黑市</button>') +
        '</div><article class="market-finance-card market-black-status-card' + (request.marketMode === 'black' ? ' is-featured' : '') + '" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(blackStatusTitleId) + '" aria-describedby="' + _escapeHtmlAttr(blackStatusMetaId + ' ' + blackStatusRiskId) + '"><div class="market-finance-card-head"><span id="' + _escapeHtmlAttr(blackStatusTitleId) + '" class="market-finance-card-title">' + (request.marketMode === 'black' ? '黑市已接管前台视图' : '当前仍停留在公开市场') + '</span><span class="market-finance-chip">' + (request.blackMarketUnlocked ? '可切换' : '权限不足') + '</span></div><div id="' + _escapeHtmlAttr(blackStatusMetaId) + '" class="market-finance-card-meta">' + (request.blackMarketUnlocked ? '切换到黑市后，交易页会改用受监管货物和违禁品报价。' : '该地点存在黑市，但当前资格不足，只能提前查看风险说明。') + '</div><div id="' + _escapeHtmlAttr(blackStatusRiskId) + '" class="market-finance-card-meta">⚠ 携带违禁品进入联邦区域会触发执法检查，黑市收益高，但路线风险和名望代价更大。</div></article></div>'
      : '<div class="market-finance-locked">📡 当前地点不提供黑市入口。若要买卖特殊货物，需要前往允许黑市交易的势力辖区。</div>') +
    '</section><section class="market-finance-section"><div class="market-finance-section-head"><div><div class="market-finance-title">☠ 灰市货目录</div><div class="market-finance-subtitle">这里列出可能出现在黑市的商品，用于提前规划货舱和路线。</div></div></div>' +
    (blackGoods.length > 0
      ? '<div class="market-finance-card-grid market-black-goods-grid" role="list" aria-label="灰市货目录">' + blackGoods.map(function (good) {
          var goodTitleId = _getDomId('market-black-good-title', good.id);
          var goodLegalId = _getDomId('market-black-good-legal', good.id);
          var goodChainId = _getDomId('market-black-good-chain', good.id);
          return '<article class="market-finance-card market-black-good-card" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(goodTitleId) + '" aria-describedby="' + _escapeHtmlAttr(goodLegalId + ' ' + goodChainId) + '"><div class="market-finance-card-head"><span id="' + _escapeHtmlAttr(goodTitleId) + '" class="market-finance-card-title">' + good.emoji + ' ' + good.name + '</span><span class="market-finance-chip">' + (good.legality === 'illegal' ? '违禁' : '灰市') + '</span></div><div id="' + _escapeHtmlAttr(goodLegalId) + '" class="market-finance-card-meta">' + formatLegalityTooltip(good) + '</div><div id="' + _escapeHtmlAttr(goodChainId) + '" class="market-finance-card-meta">' + (formatSupplyChainTooltip(good) || '无额外产业链提示') + '</div></article>';
        }).join('') + '</div>'
      : '<div class="market-finance-empty">当前没有定义黑市商品。</div>') +
    '</section>';
}
