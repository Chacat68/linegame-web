// js/ui/FleetUI.js — 船队管理 UI
// 依赖：data/ships.js, data/systems.js, data/goods.js, systems/fleet/FleetSystem.js
// 导出：render

import { SHIP_TYPES, SHIP_UPGRADES } from '../data/ships.js';
import { SYSTEMS, getSystemsByGalaxy } from '../data/systems.js';
import { GOODS } from '../data/goods.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Economy from '../systems/economy/Economy.js';

/**
 * 渲染船队标签页
 * @param {object}   state
 * @param {Function} onBuyShip      (shipTypeId) => void
 * @param {Function} onSwitchShip   (shipIndex)  => void
 * @param {Function} onUpgradeShip  (upgradeId)  => void
 * @param {Function} onAssignRoute  (shipIndex, buySystemId, sellSystemId, goodId) => void
 * @param {Function} onCancelRoute  (shipIndex) => void
 */
export function render(state, onBuyShip, onSwitchShip, onUpgradeShip, onAssignRoute, onCancelRoute) {
  const container = document.getElementById('fleet-list');
  if (!container) return;

  const fleet     = Fleet.getFleet(state);
  const activeIdx = state.activeShipIndex || 0;

  let html = '<div class="fleet-section-title">⚓ 我的船队（' + fleet.length + '/6）</div>';

  // --- 已拥有的船只 ---
  fleet.forEach(function (ship, idx) {
    const isActive = idx === activeIdx;
    const cargoUsed = Object.values(ship.cargo).reduce(function (s, q) { return s + q; }, 0);

    html += '<div class="fleet-ship-card' + (isActive ? ' fleet-active' : '') +
            (ship.route ? ' fleet-dispatched' : '') + '" data-index="' + idx + '">';
    html += '<div class="fleet-ship-header">';
    html += '<span class="fleet-ship-icon">' + ship.emoji + '</span>';
    html += '<span class="fleet-ship-name">' + ship.name;
    if (isActive) html += ' <span class="fleet-active-badge">操控中</span>';
    if (ship.route) html += ' <span class="fleet-dispatch-badge">派遣中</span>';
    html += '</span>';
    html += '</div>';

    html += '<div class="fleet-ship-stats">';
    html += '<div class="fleet-stat">📦 ' + cargoUsed + '/' + ship.maxCargo + '<span class="fleet-cap">上限' + ship.maxCargoCap + '</span></div>';
    html += '<div class="fleet-stat">⚡ ' + Math.floor(ship.fuel) + '/' + ship.maxFuel + '<span class="fleet-cap">上限' + ship.maxFuelCap + '</span></div>';
    html += '<div class="fleet-stat">🛡️ ' + Math.floor(ship.hull) + '/' + ship.maxHull + '<span class="fleet-cap">上限' + ship.maxHullCap + '</span></div>';
    html += '<div class="fleet-stat">🔧 耗油×' + ship.fuelEff.toFixed(2) + '<span class="fleet-cap">最低' + ship.minFuelEff + '</span></div>';
    html += '</div>';

    // 派遣路线状态
    if (ship.route) {
      const busSys  = SYSTEMS.find(function (s) { return s.id === ship.route.buySystemId; });
      const sellSys = SYSTEMS.find(function (s) { return s.id === ship.route.sellSystemId; });
      const good    = GOODS.find(function (g) { return g.id === ship.route.goodId; });
      const statusMap = {
        'traveling_buy': '🚀 前往买入地',
        'buying': '📦 买入中',
        'traveling_sell': '🚀 前往卖出地',
        'selling': '💰 卖出中',
      };
      html += '<div class="fleet-route-info">';
      html += '<div class="fleet-route-text">📡 ' + (busSys ? busSys.name : '?') +
              ' <span class="fleet-route-arrow">→</span> ' + (sellSys ? sellSys.name : '?') +
              ' (' + (good ? good.emoji + good.name : '?') + ')</div>';
      html += '<div class="fleet-route-status">' + (statusMap[ship.route.status] || ship.route.status) + '</div>';
      html += '<button class="fleet-cancel-btn" data-index="' + idx + '">⏹️ 召回</button>';
      html += '</div>';
    }

    // 非激活且非派遣：显示操控切换和派遣按钮
    if (!isActive && !ship.route) {
      html += '<div class="fleet-actions">';
      html += '<button class="fleet-switch-btn" data-index="' + idx + '">🔄 切换操控</button>';
      html += '<button class="fleet-dispatch-btn" data-index="' + idx + '">📡 派遣贸易</button>';
      html += '</div>';
    }

    // 激活船只只显示标注
    if (isActive) {
      html += '<div class="fleet-actions">';
      html += '<span class="fleet-hint">当前正在手动操控</span>';
      html += '</div>';
    }

    html += '</div>';
  });

  // --- 可购买的船只 ---
  html += '<div class="fleet-section-title" style="margin-top:12px">🏪 船只商店</div>';

  SHIP_TYPES.forEach(function (st) {
    const canAfford = state.credits >= st.cost;
    const isFull    = fleet.length >= 6;
    if (st.cost === 0) return;

    html += '<div class="fleet-shop-card">';
    html += '<div class="fleet-shop-header">';
    html += '<span class="fleet-ship-icon">' + st.emoji + '</span>';
    html += '<span class="fleet-ship-name">' + st.name + '</span>';
    html += '<span class="fleet-shop-price">' + st.cost.toLocaleString() + ' 积分</span>';
    html += '</div>';
    html += '<div class="fleet-shop-desc">' + st.desc + '</div>';
    html += '<div class="fleet-shop-specs">';
    html += '📦' + st.cargo + '(→' + st.maxCargo + ') ';
    html += '⚡' + st.fuel + '(→' + st.maxFuelCap + ') ';
    html += '🛡️' + st.hull + '(→' + st.maxHullCap + ') ';
    html += '🔧×' + st.fuelEff + '(→' + st.minFuelEff + ')';
    html += '</div>';

    if (isFull) {
      html += '<button class="fleet-buy-btn" disabled>船队已满</button>';
    } else if (!canAfford) {
      html += '<button class="fleet-buy-btn" disabled>积分不足</button>';
    } else {
      html += '<button class="fleet-buy-btn fleet-can-buy" data-type="' + st.id + '">购买</button>';
    }
    html += '</div>';
  });

  // --- 当前船只升级 ---
  const activeShip = Fleet.getActiveShip(state);
  html += '<div class="fleet-section-title" style="margin-top:12px">⚙️ 「' + activeShip.name + '」升级</div>';

  SHIP_UPGRADES.forEach(function (upg) {
    const installed = activeShip.upgrades.includes(upg.id);
    const prereqOk  = !upg.requires || activeShip.upgrades.includes(upg.requires);
    const canAfford = state.credits >= upg.cost;

    let atCap = false;
    if (upg.effect.cargo && activeShip.maxCargo + upg.effect.cargo > activeShip.maxCargoCap) atCap = true;
    if (upg.effect.maxFuel && activeShip.maxFuel + upg.effect.maxFuel > activeShip.maxFuelCap) atCap = true;
    if (upg.effect.hull && activeShip.maxHull + upg.effect.hull > activeShip.maxHullCap) atCap = true;
    if (upg.effect.fuelEff && activeShip.fuelEff * upg.effect.fuelEff < activeShip.minFuelEff) atCap = true;

    let cls = 'fleet-upg-btn';
    if (installed) cls += ' fleet-upg-installed';
    else if (!prereqOk) cls += ' fleet-upg-locked';
    else if (atCap) cls += ' fleet-upg-capped';
    else if (!canAfford) cls += ' fleet-upg-poor';

    html += '<button class="' + cls + '"' +
      (installed || !prereqOk || atCap ? ' disabled' : '') +
      ' data-upgrade="' + upg.id + '">';
    html += '<span class="upg-name">' + upg.name + '</span>';
    html += '<span class="upg-desc">' + (installed ? '✅ 已安装' : atCap ? '🚫 已达上限' : upg.desc) + '</span>';
    if (!installed && !atCap) {
      html += '<span class="upg-cost">' + upg.cost.toLocaleString() + ' 积分</span>';
    }
    html += '</button>';
  });

  container.innerHTML = html;

  // --- 绑定事件 ---
  container.querySelectorAll('.fleet-switch-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      onSwitchShip(parseInt(btn.dataset.index));
    });
  });

  container.querySelectorAll('.fleet-can-buy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      onBuyShip(btn.dataset.type);
    });
  });

  container.querySelectorAll('.fleet-upg-btn:not([disabled])').forEach(function (btn) {
    btn.addEventListener('click', function () {
      onUpgradeShip(btn.dataset.upgrade);
    });
  });

  // 派遣按钮 → 打开派遣配置弹窗
  container.querySelectorAll('.fleet-dispatch-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _openDispatchModal(state, parseInt(btn.dataset.index), onAssignRoute);
    });
  });

  // 召回按钮
  container.querySelectorAll('.fleet-cancel-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      onCancelRoute(parseInt(btn.dataset.index));
    });
  });
}

// ---------------------------------------------------------------------------
// 派遣配置弹窗
// ---------------------------------------------------------------------------

function _openDispatchModal(state, shipIndex, onAssignRoute) {
  const modal = document.getElementById('dispatch-modal');
  if (!modal) return;

  const ship = state.fleet[shipIndex];

  document.getElementById('dispatch-title').textContent = '📡 派遣「' + ship.emoji + ' ' + ship.name + '」';

  // 填充星系选择
  const buySelect  = document.getElementById('dispatch-buy-system');
  const sellSelect = document.getElementById('dispatch-sell-system');
  const goodSelect = document.getElementById('dispatch-good');

  buySelect.innerHTML = '';
  sellSelect.innerHTML = '';
  goodSelect.innerHTML = '';

  // 只显示当前星系的星球
  var galaxyPlanets = getSystemsByGalaxy(state.currentGalaxy || 'milky_way');
  galaxyPlanets.forEach(function (sys) {
    buySelect.innerHTML  += '<option value="' + sys.id + '">' + sys.name + ' [' + sys.typeLabel + ']</option>';
    sellSelect.innerHTML += '<option value="' + sys.id + '">' + sys.name + ' [' + sys.typeLabel + ']</option>';
  });

  // 设置卖出默认选不同星系
  if (sellSelect.options.length > 1) sellSelect.selectedIndex = 1;

  GOODS.forEach(function (g) {
    if (g.id === 'fuel') return; // 排除燃料
    goodSelect.innerHTML += '<option value="' + g.id + '">' + g.emoji + ' ' + g.name + '</option>';
  });

  // 预估利润
  function _updateEstimate() {
    var buyId  = buySelect.value;
    var sellId = sellSelect.value;
    var gId    = goodSelect.value;
    var bp     = Economy.getBuyPrice(buyId, gId, state);
    var sp     = Economy.getSellPrice(sellId, gId, state);
    var cargoUsed = Object.values(ship.cargo).reduce(function (s, q) { return s + q; }, 0);
    var space  = ship.maxCargo - cargoUsed;
    var maxQty = Math.min(space, Math.floor(state.credits / bp));
    var profit = (sp - bp) * maxQty;
    document.getElementById('dispatch-estimate').textContent =
      '预估：买' + maxQty + '单位，单次利润 ≈ ' + Math.floor(profit) + ' 积分' +
      (profit <= 0 ? ' ⚠️ 亏损路线！' : '');
  }

  buySelect.onchange  = _updateEstimate;
  sellSelect.onchange = _updateEstimate;
  goodSelect.onchange = _updateEstimate;
  _updateEstimate();

  // 确认
  document.getElementById('dispatch-confirm').onclick = function () {
    onAssignRoute(shipIndex, buySelect.value, sellSelect.value, goodSelect.value);
    modal.classList.add('hidden');
  };

  document.getElementById('dispatch-cancel').onclick = function () {
    modal.classList.add('hidden');
  };

  modal.classList.remove('hidden');
}
