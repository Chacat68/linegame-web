// js/ui/ShipUI.js — 货舱、飞船升级、飞船状态栏渲染
// 依赖：data/goods.js, data/upgrades.js, systems/economy/Economy.js, systems/trade/TradeSystem.js
// 导出：renderCargo, renderUpgrades, renderShipStats

import { GOODS }         from '../data/goods.js';
import { UPGRADES }      from '../data/upgrades.js';
import * as Economy      from '../systems/economy/Economy.js';
import { getTotalCargo } from '../systems/trade/TradeSystem.js';

/**
 * 渲染货舱标签页内容
 */
export function renderCargo(state) {
  const list  = document.getElementById('cargo-list');
  const items = Object.entries(state.cargo);

  if (items.length === 0) {
    list.innerHTML = '<p class="empty-note">货舱为空</p>';
    return;
  }

  list.innerHTML = items.map(function (entry) {
    const goodId    = entry[0];
    const qty       = entry[1];
    const good      = GOODS.find(function (g) { return g.id === goodId; });
    const sellPrice = Economy.getSellPrice(state.currentSystem, goodId);
    return '<div class="cargo-row">' +
      '<span>' + good.emoji + ' ' + good.name + '</span>' +
      '<span class="cargo-meta">' + qty + ' 单位 · 当前售价 ' + sellPrice + '</span>' +
    '</div>';
  }).join('');
}

/**
 * 渲染飞船升级标签页内容
 * @param {object}   state
 * @param {Function} onBuyUpgrade (upgradeId: string) => void
 */
export function renderUpgrades(state, onBuyUpgrade) {
  const container = document.getElementById('upgrade-list');
  container.innerHTML = '';

  UPGRADES.forEach(function (upg) {
    const purchased = state.purchasedUpgrades.includes(upg.id);
    const prereqOk  = !upg.requires || state.purchasedUpgrades.includes(upg.requires);
    const canAfford = state.credits >= upg.cost;

    const btn = document.createElement('button');
    btn.className = 'upg-btn' +
      (purchased              ? ' purchased'    : '') +
      (!prereqOk              ? ' locked'       : '') +
      (!canAfford && !purchased ? ' unaffordable' : '');

    btn.innerHTML =
      '<span class="upg-name">' + upg.name + '</span>' +
      '<span class="upg-desc">' + (purchased ? '✅ 已安装' : upg.desc) + '</span>' +
      (purchased ? '' : '<span class="upg-cost">' + upg.cost.toLocaleString() + ' 积分</span>');

    btn.disabled = purchased || !prereqOk;
    if (!purchased && prereqOk) {
      btn.addEventListener('click', function () { onBuyUpgrade(upg.id); });
    }
    container.appendChild(btn);
  });
}

/**
 * 渲染飞船迷你状态栏（货舱 & 燃料 & 船体进度条）
 */
export function renderShipStats(state) {
  const totalCargo = getTotalCargo(state);
  document.getElementById('cargo-text').textContent = totalCargo + ' / ' + state.maxCargo;
  document.getElementById('cargo-fill').style.width = (totalCargo / state.maxCargo * 100) + '%';
  document.getElementById('fuel-text').textContent  = Math.floor(state.fuel) + ' / ' + state.maxFuel;
  document.getElementById('fuel-fill').style.width  = (state.fuel / state.maxFuel * 100) + '%';

  // 船体完整度
  const hull = state.shipHull != null ? state.shipHull : 100;
  const maxHull = state.maxHull || 100;
  const hullEl = document.getElementById('hull-text');
  const hullFill = document.getElementById('hull-fill');
  if (hullEl) {
    hullEl.textContent = Math.floor(hull) + ' / ' + maxHull;
  }
  if (hullFill) {
    const pct = (hull / maxHull * 100);
    hullFill.style.width = pct + '%';
    // 船体低于 50% 变红
    if (pct < 30) {
      hullFill.style.background = 'linear-gradient(90deg, #ef5350, #c62828)';
    } else if (pct < 60) {
      hullFill.style.background = 'linear-gradient(90deg, #ff9800, #e65100)';
    } else {
      hullFill.style.background = 'linear-gradient(90deg, #66bb6a, #2e7d32)';
    }
  }
}
