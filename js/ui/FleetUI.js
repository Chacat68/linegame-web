// js/ui/FleetUI.js — 船队管理 UI（含席位系统）
// 依赖：data/ships.js, data/systems.js, data/goods.js, systems/fleet/FleetSystem.js
// 导出：render

import { SHIP_TYPES, SHIP_UPGRADES, FLEET_SLOTS, SHIP_MODS, FLEET_BONUSES } from '../data/ships.js';
import { SYSTEMS, getSystemsByGalaxy } from '../data/systems.js';
import { GOODS } from '../data/goods.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Economy from '../systems/economy/Economy.js';

/**
 * 渲染船队标签页
 * @param {object}   state
 * @param {Function} onBuyShip      (shipTypeId) => void
 * @param {Function} onSwitchShip   (shipIndex)  => void
 * @param {Function} onUpgradeShip  (shipIndex, upgradeId)  => void
 * @param {Function} onAssignRoute  (shipIndex, buySystemId, sellSystemId, goodId) => void
 * @param {Function} onCancelRoute  (shipIndex) => void
 * @param {Function} onBuySlot      () => void
 * @param {Function} onSellShip     (shipIndex) => void
 * @param {Function} onInstallMod   (shipIndex, modId) => void
 * @param {Function} onUninstallMod (shipIndex, modId) => void
 */
export function render(state, onBuyShip, onSwitchShip, onUpgradeShip, onAssignRoute, onCancelRoute, onBuySlot, onSellShip, onInstallMod, onUninstallMod) {
  const container = document.getElementById('fleet-list');
  if (!container) return;

  const fleet      = Fleet.getFleet(state);
  const activeIdx  = state.activeShipIndex || 0;
  const activeShip = fleet[activeIdx] || null;
  const flashIndex = state.lastSwitchedShipIndex;
  const flashAt = state.lastShipSwitchAt || 0;
  const canFlash = Date.now() - flashAt < 1200;
  const slotCount  = Fleet.getSlotCount(state);
  const maxSlots   = Fleet.getMaxSlots();
  const routeLevel = Fleet.getDispatchRouteLevel(state);

  let html = '';

  // ========== 席位区域 ==========
  html += '<div class="fleet-section-title">🎫 船队席位（' + slotCount + '/' + maxSlots + '）</div>';
  html += '<div class="fleet-slot-bar">';
  for (var si = 0; si < maxSlots; si++) {
    var slotDef = FLEET_SLOTS[si];
    var isOwned = si < slotCount;
    var hasShip = si < fleet.length;
    var isSlotActive = si === activeIdx;
    html += '<div class="fleet-slot' + (isOwned ? ' slot-owned' : ' slot-locked') +
            (hasShip ? ' slot-filled' : '') +
            (isSlotActive ? ' slot-active' : '') + '" title="' + slotDef.name + '">';
    if (hasShip) {
      html += '<span class="slot-ship-icon">' + fleet[si].emoji + '</span>';
      if (isSlotActive) {
        html += '<span class="slot-active-label">操控</span>';
      } else if (!fleet[si].route) {
        html += '<button class="slot-switch-btn" data-slot-index="' + si + '" title="切换操控至「' + fleet[si].name + '」">切换</button>';
      } else {
        html += '<span class="slot-dispatch-label">派遣</span>';
      }
    } else if (isOwned) {
      html += '<span class="slot-empty-icon">＋</span>';
    } else {
      html += '<span class="slot-lock-icon">🔒</span>';
    }
    html += '</div>';
  }
  html += '</div>';

  // 席位信息 & 购买按钮
  html += '<div class="fleet-slot-info">';
  html += '<span class="fleet-slot-route-lvl">📡 派遣航线等级：Lv.' + routeLevel + '</span>';
  if (slotCount < maxSlots) {
    var nextSlot = FLEET_SLOTS[slotCount];
    var canAffordSlot = state.credits >= nextSlot.cost;
    html += '<div class="fleet-slot-next">';
    html += '<span>下一席位：<b>' + nextSlot.name + '</b> — ' + nextSlot.desc + '</span>';
    html += '<button class="fleet-slot-buy-btn' + (canAffordSlot ? ' slot-can-buy' : '') + '"' +
            (canAffordSlot ? '' : ' disabled') + '>' +
            (canAffordSlot ? '🎫 解锁 ' + nextSlot.cost.toLocaleString() + ' 积分' : '积分不足 (' + nextSlot.cost.toLocaleString() + ')') +
            '</button>';
    html += '</div>';
  } else {
    html += '<div class="fleet-slot-next"><span>🏆 已解锁全部席位！</span></div>';
  }
  html += '</div>';

  // ========== 舰队编队加成 ==========
  const activeBonuses = Fleet.getActiveFleetBonuses(state);
  const activeBonusIds = activeBonuses.map(function (b) { return b.id; });
  if (activeBonuses.length > 0) {
    html += '<div class="fleet-bonus-section">';
    html += '<div class="fleet-section-title">🎖️ 舰队编队加成</div>';
    html += '<div class="fleet-bonus-list">';
    activeBonuses.forEach(function (bonus) {
      html += '<div class="fleet-bonus-chip">';
      html += '<span class="fleet-bonus-emoji">' + bonus.emoji + '</span>';
      html += '<span class="fleet-bonus-name">' + bonus.name + '</span>';
      html += '<span class="fleet-bonus-desc">' + bonus.desc + '</span>';
      html += '</div>';
    });
    html += '</div>';
    html += '</div>';
  }
  // 提示未激活的编队加成
  const inactiveBonuses = FLEET_BONUSES.filter(function (b) {
    return activeBonusIds.indexOf(b.id) === -1;
  });
  if (inactiveBonuses.length > 0 && fleet.length > 1) {
    html += '<div class="fleet-bonus-hint">';
    html += '<details><summary>📋 可解锁的编队加成（' + inactiveBonuses.length + '）</summary>';
    inactiveBonuses.forEach(function (bonus) {
      var missing = bonus.requiredTypes.filter(function (t) {
        return !fleet.some(function (s) { return s.typeId === t; });
      });
      var missingNames = missing.map(function (t) {
        var st = SHIP_TYPES.find(function (s) { return s.id === t; });
        return st ? st.emoji + st.name : t;
      }).join('、');
      html += '<div class="fleet-bonus-locked">';
      html += '<span>' + bonus.emoji + ' ' + bonus.name + '：' + bonus.desc + '</span>';
      html += '<span class="fleet-bonus-missing">需要：' + missingNames + '</span>';
      html += '</div>';
    });
    html += '</details>';
    html += '</div>';
  }

  // ========== 已拥有的船只 ==========
  html += '<div class="fleet-section-title" style="margin-top:12px">⚓ 我的船队（' + fleet.length + '/' + slotCount + '）</div>';

  fleet.forEach(function (ship, idx) {
    const isActive = idx === activeIdx;
      const isSwitchFlashing = canFlash && idx === flashIndex;
    const cargoUsed = Object.values(ship.cargo).reduce(function (s, q) { return s + q; }, 0);

    html += '<div class="fleet-ship-card' + (isActive ? ' fleet-active' : '') +
        (isSwitchFlashing ? ' fleet-switch-flash' : '') +
            (ship.route ? ' fleet-dispatched' : '') + '" data-index="' + idx + '">';
    html += '<div class="fleet-ship-header">';
    html += '<span class="fleet-ship-icon">' + ship.emoji + '</span>';
    html += '<span class="fleet-ship-name">' + ship.name;
    if (isActive && !ship.route) html += ' <span class="fleet-active-badge">操控中</span>';
    if (!isActive && !ship.route) html += ' <span class="fleet-idle-badge">待命</span>';
    if (ship.route) html += ' <span class="fleet-dispatch-badge">派遣中</span>';
    html += '</span>';
    html += '</div>';

    html += '<div class="fleet-ship-stats">';
    html += '<div class="fleet-stat">📦 ' + cargoUsed + '/' + ship.maxCargo + '<span class="fleet-cap">上限' + ship.maxCargoCap + '</span></div>';
    html += '<div class="fleet-stat">⚡ ' + Math.floor(ship.fuel) + '/' + ship.maxFuel + '<span class="fleet-cap">上限' + ship.maxFuelCap + '</span></div>';
    html += '<div class="fleet-stat">🛡️ ' + Math.floor(ship.hull) + '/' + ship.maxHull + '<span class="fleet-cap">上限' + ship.maxHullCap + '</span></div>';
    html += '<div class="fleet-stat">🔧 耗油×' + ship.fuelEff.toFixed(2) + '<span class="fleet-cap">最低' + ship.minFuelEff + '</span></div>';
    html += '</div>';

    // ======== 货舱内容 ========
    html += '<div class="fleet-ship-cargo-section">';
    html += '<div class="fleet-cargo-header">📦 货舱 (' + cargoUsed + '/' + ship.maxCargo + ')</div>';
    const cargoEntries = Object.entries(ship.cargo);
    if (cargoEntries.length === 0) {
      html += '<div class="fleet-cargo-empty">— 空 —</div>';
    } else {
      html += '<div class="fleet-cargo-chips">';
      cargoEntries.forEach(function (entry) {
        const good = GOODS.find(function (g) { return g.id === entry[0]; });
        html += '<span class="fleet-cargo-chip">' + (good ? good.emoji + ' ' + good.name : entry[0]) + ' ×' + entry[1] + '</span>';
      });
      html += '</div>';
    }
    html += '</div>';

    // ======== 升级按钮 ========
    const installedUpgs = SHIP_UPGRADES.filter(function (u) { return ship.upgrades.includes(u.id); });
    const availableUpgs = SHIP_UPGRADES.filter(function (u) { return !ship.upgrades.includes(u.id); });
    html += '<div class="fleet-ship-upg-section">';
    if (availableUpgs.length > 0) {
      html += '<button class="fleet-open-upg-btn" data-ship-index="' + idx + '">' +
              '⚙️ 升级 (' + installedUpgs.length + '/' + (installedUpgs.length + availableUpgs.length) + ')' +
              '</button>';
    } else {
      html += '<span class="fleet-upg-all-done-inline">⚙️ 全部升级已安装 ✅</span>';
    }
    html += '</div>';

    // ======== 特殊技能 ========
    var skills = Fleet.getShipSkills(ship);
    if (skills.length > 0) {
      html += '<div class="fleet-ship-skills-section">';
      html += '<div class="fleet-skills-header">✨ 特殊技能</div>';
      html += '<div class="fleet-skills-list">';
      skills.forEach(function (skill) {
        html += '<div class="fleet-skill-chip">';
        html += '<span class="fleet-skill-emoji">' + skill.emoji + '</span>';
        html += '<span class="fleet-skill-name">' + skill.name + '</span>';
        html += '<span class="fleet-skill-desc">' + skill.desc + '</span>';
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    }

    // ======== 改装组件 ========
    const shipMods = ship.mods || [];
    const modSlots = ship.modSlots || 1;
    html += '<div class="fleet-ship-mod-section">';
    html += '<button class="fleet-open-mod-btn" data-ship-index="' + idx + '">' +
            '🔧 改装 (' + shipMods.length + '/' + modSlots + ')' +
            '</button>';
    if (shipMods.length > 0) {
      html += '<div class="fleet-mod-chips">';
      shipMods.forEach(function (modId) {
        var mod = SHIP_MODS.find(function (m) { return m.id === modId; });
        if (mod) {
          html += '<span class="fleet-mod-chip">' + mod.emoji + ' ' + mod.name + '</span>';
        }
      });
      html += '</div>';
    }
    html += '</div>';

    // 派遣路线状态（所有已派遣的船只，包括激活船只）
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

    // 操作按钮
    if (!ship.route) {
      html += '<div class="fleet-actions">';
      if (isActive) {
        // 激活船只：显示派遣按钮
        html += '<button class="fleet-dispatch-btn" data-index="' + idx + '">📡 自动派遣</button>';
      } else {
        // 非激活船只：切换 + 派遣 + 卖出
        html += '<button class="fleet-switch-btn fleet-switch-primary" data-index="' + idx + '">🧭 切换为当前操控</button>';
        html += '<button class="fleet-dispatch-btn" data-index="' + idx + '">📡 派遣贸易</button>';
        var shipTypeDef = SHIP_TYPES.find(function (t) { return t.id === ship.typeId; });
        if (shipTypeDef && shipTypeDef.cost > 0) {
          var minPrice = Math.floor(shipTypeDef.cost * 0.45);
          var maxPrice = Math.floor(shipTypeDef.cost * 0.80);
          html += '<button class="fleet-sell-btn" data-index="' + idx + '" title="回收价 ' + minPrice.toLocaleString() + '~' + maxPrice.toLocaleString() + ' 积分">💸 卖出</button>';
        }
      }
      html += '</div>';
      if (!isActive && activeShip) {
        html += '<div class="fleet-switch-hint">当前操控：' + activeShip.emoji + ' ' + activeShip.name + '</div>';
      }
    }

    html += '</div>';
  });

  container.innerHTML = html;

  // ========== 绑定事件 ==========

  // 席位购买
  container.querySelectorAll('.fleet-slot-buy-btn.slot-can-buy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (onBuySlot) onBuySlot();
    });
  });

  container.querySelectorAll('.fleet-switch-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      onSwitchShip(parseInt(btn.dataset.index));
    });
  });

  // 席位栏切换按钮
  container.querySelectorAll('.slot-switch-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      onSwitchShip(parseInt(btn.dataset.slotIndex));
    });
  });

  // 升级弹窗按钮
  container.querySelectorAll('.fleet-open-upg-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _openUpgradeModal(state, parseInt(btn.dataset.shipIndex), onUpgradeShip);
    });
  });

  // 改装弹窗按钮
  container.querySelectorAll('.fleet-open-mod-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _openModModal(state, parseInt(btn.dataset.shipIndex), onInstallMod, onUninstallMod);
    });
  });

  // 派遣按钮 → 打开派遣配置弹窗（所有船只，包括激活船只）
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

  // 卖出按钮
  container.querySelectorAll('.fleet-sell-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var idx = parseInt(btn.dataset.index);
      var ship = state.fleet[idx];
      if (!ship) return;
      var shipTypeDef = SHIP_TYPES.find(function (t) { return t.id === ship.typeId; });
      var minP = Math.floor((shipTypeDef ? shipTypeDef.cost : 0) * 0.45);
      var maxP = Math.floor((shipTypeDef ? shipTypeDef.cost : 0) * 0.80);
      if (confirm('确定卖出「' + ship.emoji + ' ' + ship.name + '」？\n回收价约 ' + minP.toLocaleString() + ' ~ ' + maxP.toLocaleString() + ' 积分\n⚠️ 货舱中的货物将一并清空！')) {
        if (onSellShip) onSellShip(idx);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 船只商店（独立标签页）
// ---------------------------------------------------------------------------

/**
 * 渲染船只商店标签页
 * @param {object}   state
 * @param {Function} onBuyShip (shipTypeId) => void
 */
export function renderShop(state, onBuyShip) {
  const container = document.getElementById('shop-list');
  if (!container) return;

  var hasAvailableSlot = Fleet.getAvailableSlotCount(state) > 0;
  var slotCount = Fleet.getSlotCount(state);
  var maxSlots  = Fleet.getMaxSlots();
  var fleetLen  = Fleet.getFleet(state).length;

  var html = '';

  html += '<div class="fleet-section-title">🏪 船只商店</div>';
  html += '<div class="shop-slot-hint">🎫 席位：' + fleetLen + '/' + slotCount +
          (hasAvailableSlot ? ' — 可购买新船' : ' — 席位已满，需先购买席位') + '</div>';

  SHIP_TYPES.forEach(function (st) {
    const canAfford = state.credits >= st.cost;
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

    // 改装槽位和技能预览
    html += '<div class="fleet-shop-extras">';
    html += '<span class="fleet-shop-mod-slots">🔧 改装槽：' + (st.modSlots || 1) + '</span>';
    if (st.skills && st.skills.length > 0) {
      html += '<span class="fleet-shop-skills">';
      st.skills.forEach(function (skill) {
        html += '<span class="fleet-shop-skill-chip" title="' + skill.desc + '">' + skill.emoji + ' ' + skill.name + '</span>';
      });
      html += '</span>';
    }
    html += '</div>';

    if (!hasAvailableSlot) {
      html += '<button class="fleet-buy-btn" disabled>需要先购买席位</button>';
    } else if (!canAfford) {
      html += '<button class="fleet-buy-btn" disabled>积分不足</button>';
    } else {
      html += '<button class="fleet-buy-btn fleet-can-buy" data-type="' + st.id + '">购买</button>';
    }
    html += '</div>';
  });

  container.innerHTML = html;

  // 绑定购买事件
  container.querySelectorAll('.fleet-can-buy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      onBuyShip(btn.dataset.type);
    });
  });
}

// ---------------------------------------------------------------------------
// 升级弹窗
// ---------------------------------------------------------------------------

function _openUpgradeModal(state, shipIndex, onUpgradeShip) {
  var modal = document.getElementById('upgrade-modal');
  if (!modal) return;

  var ship = state.fleet[shipIndex];

  function _renderModal() {
    document.getElementById('upgrade-modal-title').textContent =
      '⚙️ ' + ship.emoji + ' ' + ship.name + ' — 升级';

    var body = document.getElementById('upgrade-modal-body');
    var html = '';

    // 已安装升级
    var installed = SHIP_UPGRADES.filter(function (u) { return ship.upgrades.includes(u.id); });
    if (installed.length > 0) {
      html += '<div class="upg-modal-section-title">已安装</div>';
      html += '<div class="upg-modal-installed">';
      installed.forEach(function (u) {
        html += '<span class="upg-modal-chip-done">✅ ' + u.name + '</span>';
      });
      html += '</div>';
    }

    // 可购买升级
    var available = SHIP_UPGRADES.filter(function (u) { return !ship.upgrades.includes(u.id); });
    if (available.length > 0) {
      html += '<div class="upg-modal-section-title">可购买</div>';
      html += '<div class="upg-modal-list">';
      available.forEach(function (upg) {
        var prereqOk  = !upg.requires || ship.upgrades.includes(upg.requires);
        var canAfford = state.credits >= upg.cost;

        var atCap = false;
        if (upg.effect.cargo && ship.maxCargo + upg.effect.cargo > ship.maxCargoCap) atCap = true;
        if (upg.effect.maxFuel && ship.maxFuel + upg.effect.maxFuel > ship.maxFuelCap) atCap = true;
        if (upg.effect.hull && ship.maxHull + upg.effect.hull > ship.maxHullCap) atCap = true;
        if (upg.effect.fuelEff && ship.fuelEff * upg.effect.fuelEff < ship.minFuelEff) atCap = true;

        var disabled = !prereqOk || atCap;
        var cls = 'upg-modal-item';
        if (!prereqOk) cls += ' upg-modal-locked';
        else if (atCap) cls += ' upg-modal-capped';
        else if (!canAfford) cls += ' upg-modal-poor';

        html += '<div class="' + cls + '">';
        html += '<div class="upg-modal-item-info">';
        html += '<div class="upg-modal-item-name">' + upg.name + '</div>';
        html += '<div class="upg-modal-item-desc">' + (atCap ? '🚫 已达上限' : upg.desc) + '</div>';
        if (!prereqOk) {
          var reqUpg = SHIP_UPGRADES.find(function (u) { return u.id === upg.requires; });
          html += '<div class="upg-modal-item-prereq">🔒 需要先安装: ' + (reqUpg ? reqUpg.name : upg.requires) + '</div>';
        }
        html += '</div>';
        if (!disabled) {
          html += '<button class="upg-modal-buy-btn' + (canAfford ? '' : ' upg-modal-no-afford') + '"' +
                  (canAfford ? '' : ' disabled') +
                  ' data-upgrade="' + upg.id + '">' +
                  (canAfford ? '💰 ' + upg.cost.toLocaleString() : '积分不足 ' + upg.cost.toLocaleString()) +
                  '</button>';
        }
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="upg-modal-all-done">🏆 全部升级已安装！</div>';
    }

    body.innerHTML = html;

    // 绑定购买
    body.querySelectorAll('.upg-modal-buy-btn:not([disabled])').forEach(function (btn) {
      btn.addEventListener('click', function () {
        onUpgradeShip(shipIndex, btn.dataset.upgrade);
        // 购买后刷新弹窗内容
        setTimeout(function () { _renderModal(); }, 50);
      });
    });
  }

  _renderModal();

  // 关闭
  document.getElementById('upgrade-modal-close').onclick = function () {
    modal.classList.add('hidden');
  };

  modal.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// 改装弹窗
// ---------------------------------------------------------------------------

function _openModModal(state, shipIndex, onInstallMod, onUninstallMod) {
  var modal = document.getElementById('mod-modal');
  if (!modal) return;

  var ship = state.fleet[shipIndex];

  function _renderModModal() {
    document.getElementById('mod-modal-title').textContent =
      '🔧 ' + ship.emoji + ' ' + ship.name + ' — 改装（' + (ship.mods || []).length + '/' + (ship.modSlots || 1) + ' 槽位）';

    var body = document.getElementById('mod-modal-body');
    var html = '';

    // 已安装的改装组件
    var installedMods = (ship.mods || []).map(function (modId) {
      return SHIP_MODS.find(function (m) { return m.id === modId; });
    }).filter(Boolean);

    if (installedMods.length > 0) {
      html += '<div class="mod-modal-section-title">已安装</div>';
      html += '<div class="mod-modal-installed">';
      installedMods.forEach(function (mod) {
        html += '<div class="mod-modal-item mod-modal-installed-item">';
        html += '<div class="mod-modal-item-info">';
        html += '<div class="mod-modal-item-name">' + mod.emoji + ' ' + mod.name + '</div>';
        html += '<div class="mod-modal-item-desc">' + mod.desc + '</div>';
        html += '</div>';
        html += '<button class="mod-modal-uninstall-btn" data-mod="' + mod.id + '">🗑️ 拆卸</button>';
        html += '</div>';
      });
      html += '</div>';
    }

    // 可安装的改装组件
    var slotsLeft = (ship.modSlots || 1) - (ship.mods || []).length;
    var availableMods = SHIP_MODS.filter(function (m) {
      return !(ship.mods || []).includes(m.id);
    });

    if (availableMods.length > 0) {
      html += '<div class="mod-modal-section-title">可安装' + (slotsLeft <= 0 ? '（槽位已满）' : '') + '</div>';

      // 按分类分组
      var categories = { cargo: '📦 货舱', engine: '🔥 引擎', hull: '🛡️ 防护', trade: '💰 贸易' };
      Object.keys(categories).forEach(function (cat) {
        var catMods = availableMods.filter(function (m) { return m.category === cat; });
        if (catMods.length === 0) return;

        html += '<div class="mod-modal-category">' + categories[cat] + '</div>';
        html += '<div class="mod-modal-list">';
        catMods.forEach(function (mod) {
          var canAfford = state.credits >= mod.cost;
          var disabled = slotsLeft <= 0;

          var cls = 'mod-modal-item';
          if (disabled) cls += ' mod-modal-full';
          else if (!canAfford) cls += ' mod-modal-poor';

          html += '<div class="' + cls + '">';
          html += '<div class="mod-modal-item-info">';
          html += '<div class="mod-modal-item-name">' + mod.emoji + ' ' + mod.name + '</div>';
          html += '<div class="mod-modal-item-desc">' + mod.desc + '</div>';
          html += '</div>';
          if (!disabled) {
            html += '<button class="mod-modal-buy-btn' + (canAfford ? '' : ' mod-modal-no-afford') + '"' +
                    (canAfford ? '' : ' disabled') +
                    ' data-mod="' + mod.id + '">' +
                    (canAfford ? '💰 ' + mod.cost.toLocaleString() : '积分不足') +
                    '</button>';
          }
          html += '</div>';
        });
        html += '</div>';
      });
    } else {
      html += '<div class="mod-modal-all-done">🏆 全部改装组件已安装！</div>';
    }

    body.innerHTML = html;

    // 绑定安装事件
    body.querySelectorAll('.mod-modal-buy-btn:not([disabled])').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (onInstallMod) onInstallMod(shipIndex, btn.dataset.mod);
        setTimeout(function () { _renderModModal(); }, 50);
      });
    });

    // 绑定拆卸事件
    body.querySelectorAll('.mod-modal-uninstall-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (onUninstallMod) onUninstallMod(shipIndex, btn.dataset.mod);
        setTimeout(function () { _renderModModal(); }, 50);
      });
    });
  }

  _renderModModal();

  // 关闭
  document.getElementById('mod-modal-close').onclick = function () {
    modal.classList.add('hidden');
  };

  modal.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// 派遣配置弹窗
// ---------------------------------------------------------------------------

function _openDispatchModal(state, shipIndex, onAssignRoute) {
  const modal = document.getElementById('dispatch-modal');
  if (!modal) return;

  const ship = state.fleet[shipIndex];
  const isActive = shipIndex === (state.activeShipIndex || 0);
  const routeLevel = Fleet.getDispatchRouteLevel(state);

  document.getElementById('dispatch-title').textContent =
    '📡 ' + (isActive ? '自动派遣' : '派遣') + '「' + ship.emoji + ' ' + ship.name + '」';

  // 填充星系选择
  const buySelect  = document.getElementById('dispatch-buy-system');
  const sellSelect = document.getElementById('dispatch-sell-system');
  const goodSelect = document.getElementById('dispatch-good');

  buySelect.innerHTML = '';
  sellSelect.innerHTML = '';
  goodSelect.innerHTML = '';

  // 对于激活船只，显示同星系已解锁星球
  // 对于非激活船只，根据席位航线等级过滤
  var playerLevel = state.playerLevel || 1;
  var galaxyPlanets = getSystemsByGalaxy(state.currentGalaxy || 'milky_way').filter(function (sys) {
    var minLvl = sys.minLevel || 1;
    // 激活船只用玩家等级过滤，非激活船只用席位航线等级
    if (isActive) {
      return playerLevel >= minLvl;
    } else {
      return minLvl <= routeLevel;
    }
  });

  if (galaxyPlanets.length < 2) {
    buySelect.innerHTML = '<option value="">需要更多航线（购买席位解锁）</option>';
    sellSelect.innerHTML = '<option value="">需要更多航线（购买席位解锁）</option>';
  } else {
    galaxyPlanets.forEach(function (sys) {
      buySelect.innerHTML  += '<option value="' + sys.id + '">' + sys.name + ' [' + sys.typeLabel + ']</option>';
      sellSelect.innerHTML += '<option value="' + sys.id + '">' + sys.name + ' [' + sys.typeLabel + ']</option>';
    });
  }

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
    if (!buyId || !sellId || !gId) {
      document.getElementById('dispatch-estimate').textContent = '无法预估（航线不足）';
      return;
    }
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
