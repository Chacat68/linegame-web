// js/ui/MarketUI.js — 市场界面（价格总览 + 星球详情双模式）
// 依赖：data/goods.js, data/systems.js, systems/economy/Economy.js
// 导出：renderOverview, render (detail), showOverview, showDetail

import { GOODS }    from '../data/goods.js';
import { getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';
import * as Economy from '../systems/economy/Economy.js';
import * as Faction from '../systems/faction/FactionSystem.js';

// ---------------------------------------------------------------------------
// Sparkline 辅助（Unicode block 字符 8 级走势图）
// ---------------------------------------------------------------------------
const SPARK_CHARS = '▁▂▃▄▅▆▇█';

function _sparkline(data) {
  if (!data || data.length < 2) return '';
  var min = Infinity, max = -Infinity;
  data.forEach(function (v) { if (v < min) min = v; if (v > max) max = v; });
  var range = max - min || 1;
  return data.map(function (v) {
    var idx = Math.min(7, Math.floor(((v - min) / range) * 7.99));
    return SPARK_CHARS[idx];
  }).join('');
}

function _trendArrow(data) {
  if (!data || data.length < 2) return '';
  var recent = data[data.length - 1];
  var prev = data[Math.max(0, data.length - 5)];
  if (recent > prev * 1.05) return ' ↑';
  if (recent < prev * 0.95) return ' ↓';
  return ' →';
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
 */
export function render(state, onBuy, onSell, onRefuel, viewingSystem, marketMode, onBlackBuy, onBlackSell) {
  const sysId         = viewingSystem || state.currentSystem;
  const isCurrentSys  = sysId === state.currentSystem;
  const tbody         = document.getElementById('market-tbody');
  const isBlack       = marketMode === 'black';
  tbody.innerHTML     = '';

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
    var spark = _sparkline(history);
    var trend = _trendArrow(history);
    var marketTag = _marketAccessLabel(good);
    var legalityTip = _legalityTooltip(good);

    // 产业链提示
    var chainTip = _supplyChainTooltip(good);

    const tr = document.createElement('tr');
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
        (spark ? '<span class="sparkline" title="30天价格走势">' + spark + '<span class="trend-arrow">' + trend + '</span></span>' : '<span class="sparkline-empty">—</span>') +
      '</td>';

    if (isCurrentSys) {
      var buyCallback = isBlack && onBlackBuy ? onBlackBuy : onBuy;
      var sellCallback = isBlack && onBlackSell ? onBlackSell : onSell;
      tr.querySelector('.buy-btn').addEventListener('click', function () { buyCallback(good); });
      const sellBtn = tr.querySelector('.sell-btn');
      if (sellBtn) {
        sellBtn.addEventListener('click', function () { sellCallback(good); });
      }
    }
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
}

// ---------------------------------------------------------------------------
// 视图切换辅助
// ---------------------------------------------------------------------------

/** 显示总览，隐藏详情 */
export function showOverview() {
  const ov = document.getElementById('market-overview');
  const dt = document.getElementById('market-detail');
  const title = document.getElementById('market-header-title');
  if (ov) ov.classList.remove('hidden');
  if (dt) dt.classList.add('hidden');
  if (title) title.textContent = '🏪 星际市场';
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
