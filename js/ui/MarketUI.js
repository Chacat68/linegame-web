// js/ui/MarketUI.js — 市场界面（价格总览 + 星球详情双模式）
// 依赖：data/goods.js, data/systems.js, systems/economy/Economy.js
// 导出：renderOverview, render (detail), showOverview, showDetail

import { GOODS }    from '../data/goods.js';
import { getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';
import * as Economy from '../systems/economy/Economy.js';

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
 */
export function render(state, onBuy, onSell, onRefuel, viewingSystem) {
  const sysId         = viewingSystem || state.currentSystem;
  const isCurrentSys  = sysId === state.currentSystem;
  const tbody         = document.getElementById('market-tbody');
  tbody.innerHTML     = '';

  // 非当前星球时显示只读提示
  if (!isCurrentSys) {
    const noteRow = document.createElement('tr');
    noteRow.innerHTML = '<td colspan="5" class="market-readonly-note">⚠️ 仅查看价格，交易请前往该星球</td>';
    tbody.appendChild(noteRow);
  }

  GOODS.forEach(function (good) {
    const buyPrice    = Economy.getBuyPrice(sysId, good.id, state);
    const sellPrice   = Economy.getSellPrice(sysId, good.id, state);
    const inCargo     = state.cargo[good.id] || 0;
    const mult        = Economy.getSystemMultiplier(sysId, good.id);
    const sd          = Economy.getSupplyDemand(sysId, good.id);
    const isCheap     = mult < 0.7;
    const isExpensive = mult > 1.4;

    // 供需指示器
    let sdIcon = '⚖️';
    if (sd.ratio > 1.4) sdIcon = '🔥';      // 高需求
    else if (sd.ratio < 0.7) sdIcon = '📦';  // 高供给

    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="good-icon">' + good.emoji + '</span>' + good.name +
        '<span class="sd-indicator" title="供:' + sd.supply + ' 需:' + sd.demand + '">' + sdIcon + '</span></td>' +
      '<td class="' + (isCheap ? 'price-low' : isExpensive ? 'price-high' : '') + '">' + buyPrice + '</td>' +
      '<td class="' + (isCheap ? 'price-low' : isExpensive ? 'price-high' : '') + '">' + sellPrice + '</td>' +
      '<td>' + (inCargo > 0 ? '<span class="qty-badge">' + inCargo + '</span>' : '—') + '</td>' +
      '<td class="action-cell">' +
        (isCurrentSys ? '<button class="btn-action buy-btn" data-id="' + good.id + '">买入</button>' : '') +
        (isCurrentSys && inCargo > 0 ? '<button class="btn-action sell-btn" data-id="' + good.id + '">卖出</button>' : '') +
      '</td>';

    if (isCurrentSys) {
      tr.querySelector('.buy-btn').addEventListener('click', function () { onBuy(good); });
      const sellBtn = tr.querySelector('.sell-btn');
      if (sellBtn) {
        sellBtn.addEventListener('click', function () { onSell(good); });
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
        '<td colspan="5">' +
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
export function showDetail(systemId) {
  const ov = document.getElementById('market-overview');
  const dt = document.getElementById('market-detail');
  const loc = document.getElementById('market-detail-location');
  const title = document.getElementById('market-header-title');
  if (ov) ov.classList.add('hidden');
  if (dt) dt.classList.remove('hidden');
  const sys = findSystem(systemId);
  if (sys && loc) {
    loc.textContent = sys.name + ' [' + sys.typeLabel + '] — ' + sys.description;
  }
  if (title) title.textContent = '🏪 ' + (sys ? sys.name : '');
}
