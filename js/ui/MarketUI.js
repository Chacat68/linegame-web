// js/ui/MarketUI.js — 市场商品列表渲染
// 依赖：data/goods.js, systems/economy/Economy.js
// 导出：render

import { GOODS }    from '../data/goods.js';
import * as Economy from '../systems/economy/Economy.js';

/**
 * 渲染市场表格
 * @param {object}   state
 * @param {Function} onBuy    (good) => void
 * @param {Function} onSell   (good) => void
 * @param {Function} onRefuel () => void
 */
export function render(state, onBuy, onSell, onRefuel) {
  const tbody = document.getElementById('market-tbody');
  tbody.innerHTML = '';

  GOODS.forEach(function (good) {
    const buyPrice    = Economy.getBuyPrice(state.currentSystem, good.id);
    const sellPrice   = Economy.getSellPrice(state.currentSystem, good.id);
    const inCargo     = state.cargo[good.id] || 0;
    const mult        = Economy.getSystemMultiplier(state.currentSystem, good.id);
    const isCheap     = mult < 0.7;
    const isExpensive = mult > 1.4;

    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span class="good-icon">' + good.emoji + '</span>' + good.name + '</td>' +
      '<td class="' + (isCheap ? 'price-low' : isExpensive ? 'price-high' : '') + '">' + buyPrice + '</td>' +
      '<td class="' + (isCheap ? 'price-low' : isExpensive ? 'price-high' : '') + '">' + sellPrice + '</td>' +
      '<td>' + (inCargo > 0 ? '<span class="qty-badge">' + inCargo + '</span>' : '—') + '</td>' +
      '<td class="action-cell">' +
        '<button class="btn-action buy-btn" data-id="' + good.id + '">买入</button>' +
        (inCargo > 0 ? '<button class="btn-action sell-btn" data-id="' + good.id + '">卖出</button>' : '') +
      '</td>';

    tr.querySelector('.buy-btn').addEventListener('click', function () { onBuy(good); });
    const sellBtn = tr.querySelector('.sell-btn');
    if (sellBtn) {
      sellBtn.addEventListener('click', function () { onSell(good); });
    }
    tbody.appendChild(tr);
  });

  // 补燃料行
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
