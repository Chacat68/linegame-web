// js/ui/MarketUI.js — 市场商品列表渲染
// 依赖：data/goods.js, systems/economy/Economy.js
// 导出：render

import { GOODS }    from '../data/goods.js';
import * as Economy from '../systems/economy/Economy.js';

/**
 * 渲染市场表格
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
