// js/ui/FleetUI.js — 船队管理 UI（含席位系统）
// 依赖：data/ships.js, data/systems.js, data/goods.js, systems/fleet/FleetSystem.js
// 导出：render

import { SHIP_TYPES, SHIP_UPGRADES, FLEET_SLOTS, SHIP_MODS, FLEET_BONUSES } from '../data/ships.js';
import { SYSTEMS, getSystemsByGalaxy } from '../data/systems.js';
import { GOODS } from '../data/goods.js';
import * as Fleet from '../systems/fleet/FleetSystem.js?v=20260406-routefix2';
import * as Crew from '../systems/fleet/CrewSystem.js';
import * as Economy from '../systems/economy/Economy.js';
import * as AutoTrade from '../systems/trade/AutoTradeSystem.js';
import * as Faction from '../systems/faction/FactionSystem.js';

function _formatTradePolicySummary(policy) {
  if (!policy || typeof policy !== 'object') return '默认：按当前价格循环';

  var parts = [];
  if (Number.isFinite(policy.maxBuyPrice)) parts.push('买入≤' + policy.maxBuyPrice);
  if (Number.isFinite(policy.minSellPrice)) parts.push('卖出≥' + policy.minSellPrice);
  if (Number.isFinite(policy.minProfitRate)) parts.push('利润率≥' + Math.round(policy.minProfitRate * 100) + '%');
  if (policy.riskMode === 'safe') parts.push('保守');
  else if (policy.riskMode === 'aggressive') parts.push('激进');
  else parts.push('平衡');
  return parts.length > 0 ? parts.join(' · ') : '默认：按当前价格循环';
}

/**
 * 渲染船队标签页
 * @param {object}   state
 * @param {Function} onBuyShip      (shipTypeId) => void
 * @param {Function} onSwitchShip   (shipIndex)  => void
 * @param {Function} onUpgradeShip  (shipIndex, upgradeId)  => void
 * @param {Function} onAssignRoute  (shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) => void
 * @param {Function} onCancelRoute  (shipIndex) => void
 * @param {Function} onBuySlot      () => void
 * @param {Function} onSellShip     (shipIndex) => void
 * @param {Function} onInstallMod   (shipIndex, modId) => void
 * @param {Function} onUninstallMod (shipIndex, modId) => void
 * @param {Function} onRecruitCrew  (offerId) => void
 * @param {Function} onAssignCrew   (shipIndex, crewId) => void
 * @param {Function} onUnassignCrew (shipIndex, crewId) => void
 * @param {Function} onDismissCrew  (crewId) => void
 */
export function render(state, onBuyShip, onSwitchShip, onUpgradeShip, onAssignRoute, onCancelRoute, onBuySlot, onSellShip, onInstallMod, onUninstallMod, onRecruitCrew, onAssignCrew, onUnassignCrew, onDismissCrew) {
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
    const shipCrew = Crew.getShipCrew(state, ship);
    const shipStats = Fleet.getEffectiveShipStats(state, ship);

    html += '<div class="fleet-ship-card' + (isActive ? ' fleet-active' : '') +
        (isSwitchFlashing ? ' fleet-switch-flash' : '') +
            (ship.route ? ' fleet-dispatched' : '') + '" data-index="' + idx + '">';

    // ======== 头部：图标 + 名称 + 状态 ========
    html += '<div class="fleet-ship-header">';
    html += '<span class="fleet-ship-icon">' + ship.emoji + '</span>';
    html += '<span class="fleet-ship-name">' + ship.name;
    if (isActive && !ship.route) html += ' <span class="fleet-active-badge">操控中</span>';
    if (!isActive && !ship.route) html += ' <span class="fleet-idle-badge">待命</span>';
    if (ship.route) html += ' <span class="fleet-dispatch-badge">派遣中</span>';
    html += '</span>';
    html += '</div>';

    // ======== 统计（紧凑单行） ========
    html += '<div class="fleet-ship-stats">';
    html += '<span class="fleet-stat" title="货舱 上限' + ship.maxCargoCap + '">📦' + cargoUsed + '/' + shipStats.maxCargo + '</span>';
    html += '<span class="fleet-stat" title="燃料 上限' + ship.maxFuelCap + '">⚡' + Math.floor(ship.fuel) + '/' + ship.maxFuel + '</span>';
    html += '<span class="fleet-stat" title="船体 上限' + ship.maxHullCap + '">🛡' + Math.floor(ship.hull) + '/' + ship.maxHull + '</span>';
    html += '<span class="fleet-stat" title="耗油率 最低' + ship.minFuelEff + '">🔧×' + shipStats.fuelEff.toFixed(2) + '</span>';
    html += '</div>';

    html += '<div class="fleet-crew-summary">';
    html += '<span>👥 船员 ' + shipCrew.length + '/' + (ship.crewCapacity || 0) + '</span>';
    if (shipStats.crewEffects && shipStats.crewEffects.cargo) html += '<span>货舱 +' + shipStats.crewEffects.cargo + '</span>';
    if (shipStats.crewEffects && shipStats.crewEffects.autoRepair) html += '<span>维修 +' + shipStats.crewEffects.autoRepair + '/天</span>';
    if (shipStats.crewEffects && shipStats.crewEffects.buyDiscount) html += '<span>买入 -' + Math.round(shipStats.crewEffects.buyDiscount * 100) + '%</span>';
    if (shipStats.crewEffects && shipStats.crewEffects.sellBonus) html += '<span>卖出 +' + Math.round(shipStats.crewEffects.sellBonus * 100) + '%</span>';
    if (shipStats.crewEffects && shipStats.crewEffects.fuelEffMultiplier && shipStats.crewEffects.fuelEffMultiplier < 1) {
      html += '<span>航耗 -' + Math.round((1 - shipStats.crewEffects.fuelEffMultiplier) * 100) + '%</span>';
    }
    html += '</div>';

    if (shipCrew.length > 0) {
      html += '<div class="fleet-crew-chips">';
      shipCrew.forEach(function (crewMember) {
        html += '<span class="fleet-crew-chip">' + crewMember.emoji + ' ' + crewMember.name + ' Lv.' + (crewMember.level || 1) + '</span>';
      });
      html += '</div>';
    }

    // ======== 芯片行：技能 + 改装 ========
    var skills = Fleet.getShipSkills(ship);
    var shipMods = (ship.mods || []);
    if (skills.length > 0 || shipMods.length > 0) {
      html += '<div class="fleet-chips-row">';
      skills.forEach(function (skill) {
        html += '<span class="fleet-skill-chip" title="' + skill.desc + '">' + skill.emoji + ' ' + skill.name + '</span>';
      });
      shipMods.forEach(function (modId) {
        var mod = SHIP_MODS.find(function (m) { return m.id === modId; });
        if (mod) html += '<span class="fleet-mod-chip">' + mod.emoji + ' ' + mod.name + '</span>';
      });
      html += '</div>';
    }

    // ======== 货舱内容（仅有货时显示） ========
    const cargoEntries = Object.entries(ship.cargo);
    if (cargoEntries.length > 0) {
      html += '<div class="fleet-cargo-chips">';
      cargoEntries.forEach(function (entry) {
        const good = GOODS.find(function (g) { return g.id === entry[0]; });
        html += '<span class="fleet-cargo-chip">' + (good ? good.emoji + good.name : entry[0]) + ' ×' + entry[1] + '</span>';
      });
      html += '</div>';
    }

    // ======== 派遣路线状态 ========
    if (ship.route) {
      const routeDisplay = Fleet.getRouteDisplayInfo(state, ship, idx);
      const startSys = SYSTEMS.find(function (s) { return s.id === (routeDisplay ? routeDisplay.startSystemId : null); });
      const targetSys = SYSTEMS.find(function (s) { return s.id === (routeDisplay ? routeDisplay.endSystemId : null); });
      const good = GOODS.find(function (g) { return g.id === ship.route.goodId; });
      html += '<div class="fleet-route-info">';
      html += '<div class="fleet-route-text">📡 ' + (startSys ? startSys.name : '?') +
              ' <span class="fleet-route-arrow">→</span> ' + (targetSys ? targetSys.name : '?') +
              ' (' + (good ? good.emoji + good.name : '?') + ')</div>';
      html += '<div class="fleet-route-status">' + (routeDisplay ? routeDisplay.statusLabel : ship.route.status) + '</div>';
      html += '<div class="fleet-route-policy">🎛 ' + _formatTradePolicySummary(ship.route.tradePolicy) + '</div>';
      html += '<button class="fleet-cancel-btn" data-index="' + idx + '">⏹️ 召回</button>';
      html += '</div>';
    }

    // ======== 操作按钮行（水平排列） ========
    html += '<div class="fleet-card-action-row">';

    // 升级按钮
    const installedUpgs = SHIP_UPGRADES.filter(function (u) { return ship.upgrades.includes(u.id); });
    const availableUpgs = SHIP_UPGRADES.filter(function (u) { return !ship.upgrades.includes(u.id); });
    if (availableUpgs.length > 0) {
      html += '<button class="fleet-open-upg-btn" data-ship-index="' + idx + '">' +
              '⚙️' + installedUpgs.length + '/' + (installedUpgs.length + availableUpgs.length) +
              '</button>';
    }

    // 改装按钮
    var modSlots = ship.modSlots || 1;
    html += '<button class="fleet-open-mod-btn" data-ship-index="' + idx + '">' +
            '🔧' + shipMods.length + '/' + modSlots +
            '</button>';
    html += '<button class="fleet-open-crew-btn" data-ship-index="' + idx + '">👥' + shipCrew.length + '/' + (ship.crewCapacity || 0) + '</button>';

    // 派遣/切换/卖出
    if (!ship.route) {
      if (isActive) {
        html += '<button class="fleet-dispatch-btn" data-index="' + idx + '">📡 派遣</button>';
      } else {
        html += '<button class="fleet-switch-btn fleet-switch-primary" data-index="' + idx + '">🧭 切换</button>';
        html += '<button class="fleet-dispatch-btn" data-index="' + idx + '">📡 派遣</button>';
        var shipTypeDef = SHIP_TYPES.find(function (t) { return t.id === ship.typeId; });
        var sellBase = shipTypeDef ? (shipTypeDef.sellValue || shipTypeDef.cost) : 0;
        if (sellBase > 0) {
          var minPrice = Math.floor(sellBase * 0.45);
          var maxPrice = Math.floor(sellBase * 0.80);
          html += '<button class="fleet-sell-btn" data-index="' + idx + '" title="回收价 ' + minPrice.toLocaleString() + '~' + maxPrice.toLocaleString() + ' 积分">💸 卖出</button>';
        }
      }
    }
    html += '</div>'; // fleet-card-action-row

    html += '</div>'; // fleet-ship-card
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

  container.querySelectorAll('.fleet-open-crew-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _openCrewModal(state, parseInt(btn.dataset.shipIndex), onRecruitCrew, onAssignCrew, onUnassignCrew, onDismissCrew);
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

function _escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _formatCrewEffectParts(effect) {
  var parts = [];
  if (effect.fuelEffMultiplier && effect.fuelEffMultiplier < 1) parts.push('航耗 -' + Math.round((1 - effect.fuelEffMultiplier) * 100) + '%');
  if (effect.autoRepair) parts.push('维修 +' + effect.autoRepair);
  if (effect.cargo) parts.push('货舱 +' + effect.cargo);
  if (effect.buyDiscount) parts.push('买入 -' + Math.round(effect.buyDiscount * 100) + '%');
  if (effect.sellBonus) parts.push('卖出 +' + Math.round(effect.sellBonus * 100) + '%');
  return parts;
}

function _formatCrewProgress(crewMember) {
  if (!crewMember) return '';
  if ((crewMember.level || 1) >= (crewMember.maxLevel || crewMember.level || 1)) {
    return 'Lv.' + (crewMember.level || 1) + ' · 已满级';
  }
  return 'Lv.' + (crewMember.level || 1) + ' · 进度 ' + (crewMember.exp || 0) + '/' + (crewMember.expToNext || 0);
}

function _openCrewModal(state, shipIndex, onRecruitCrew, onAssignCrew, onUnassignCrew, onDismissCrew) {
  var modal = document.getElementById('crew-modal');
  if (!modal) return;

  var ship = state.fleet[shipIndex];
  if (!ship) return;

  var titleEl = document.getElementById('crew-modal-title');
  var summaryEl = document.getElementById('crew-modal-summary');
  var assignedEl = document.getElementById('crew-assigned-list');
  var reserveEl = document.getElementById('crew-reserve-list');
  var marketEl = document.getElementById('crew-market-list');

  function renderCrewModal() {
    var currentShip = state.fleet[shipIndex];
    if (!currentShip) return;

    var shipCrew = Crew.getShipCrew(state, currentShip);
    var reserveCrew = Crew.getReserveCrew(state);
    var marketState = Crew.getCrewMarket(state, state.currentSystem);
    var marketCrew = marketState.offers || [];
    var crewEffects = Fleet.getEffectiveShipStats(state, currentShip).crewEffects || {};
    var currentSystem = SYSTEMS.find(function (sys) { return sys.id === state.currentSystem; });

    titleEl.textContent = '👥 船员管理 · ' + currentShip.emoji + ' ' + currentShip.name;
    summaryEl.innerHTML =
      '<span>席位 ' + shipCrew.length + '/' + (currentShip.crewCapacity || 0) + '</span>' +
      '<span>当前港口：' + _escapeHtml(currentSystem ? currentSystem.name : state.currentSystem) + '</span>' +
      '<span>工资/天 ' + shipCrew.reduce(function (sum, crewMember) { return sum + (crewMember.wage || 0); }, 0) + '</span>' +
      '<span>货舱 +' + (crewEffects.cargo || 0) + '</span>' +
      '<span>维修 +' + (crewEffects.autoRepair || 0) + '</span>' +
      '<span>市场刷新：第 ' + marketState.refreshDay + ' 天 / 下次第 ' + marketState.nextRefreshDay + ' 天</span>' +
      '<span>人才倾向：' + _escapeHtml(marketState.themeLabel || '综合港') + '</span>';

    assignedEl.innerHTML = shipCrew.length > 0
      ? shipCrew.map(function (crewMember) {
          var effectParts = _formatCrewEffectParts(Crew.getCrewEffectProfile(crewMember));
          return '<div class="crew-card">' +
            '<div class="crew-card-main"><strong>' + crewMember.emoji + ' ' + _escapeHtml(crewMember.name) + '</strong><span>' + _escapeHtml(crewMember.roleName) + ' · ' + _escapeHtml(crewMember.branchLabel || crewMember.specialtyName || crewMember.roleName) + ' · 工资 ' + crewMember.wage + '/天</span><small>' + _escapeHtml(_formatCrewProgress(crewMember) + (effectParts.length ? ' · ' + effectParts.join(' · ') : '')) + '</small></div>' +
            '<div class="crew-card-actions"><button class="btn-secondary crew-unassign-btn" data-crew-id="' + crewMember.id + '">调回预备队</button></div>' +
          '</div>';
        }).join('')
      : '<div class="crew-empty">当前飞船暂无船员。</div>';

    reserveEl.innerHTML = reserveCrew.length > 0
      ? reserveCrew.map(function (crewMember) {
          var reserveEffectParts = _formatCrewEffectParts(Crew.getCrewEffectProfile(crewMember));
          return '<div class="crew-card">' +
            '<div class="crew-card-main"><strong>' + crewMember.emoji + ' ' + _escapeHtml(crewMember.name) + '</strong><span>' + _escapeHtml(crewMember.roleName) + ' · ' + _escapeHtml(crewMember.branchLabel || crewMember.specialtyName || crewMember.roleName) + ' · 工资 ' + crewMember.wage + '/天</span><small>' + _escapeHtml(_formatCrewProgress(crewMember) + (reserveEffectParts.length ? ' · ' + reserveEffectParts.join(' · ') : '')) + '</small></div>' +
            '<div class="crew-card-actions"><button class="btn-primary crew-assign-btn" data-crew-id="' + crewMember.id + '">分配到本船</button><button class="btn-secondary crew-dismiss-btn" data-crew-id="' + crewMember.id + '">解雇</button></div>' +
          '</div>';
        }).join('')
      : '<div class="crew-empty">预备队为空。</div>';

    marketEl.innerHTML = marketCrew.length > 0
      ? marketCrew.map(function (offer) {
          var effectParts = _formatCrewEffectParts(Crew.getCrewEffectProfile(offer));

          return '<div class="crew-card">' +
            '<div class="crew-card-main"><strong>' + offer.emoji + ' ' + _escapeHtml(offer.name) + '</strong><span>' + _escapeHtml(offer.title + ' · ' + offer.roleName + ' · ' + (offer.branchLabel || offer.specialtyName || offer.roleName)) + '</span><small>' + _escapeHtml('Lv.' + (offer.level || 1) + ' · ' + (offer.potentialLabel || '') + (effectParts.length ? ' · ' + effectParts.join(' · ') : '')) + '</small><small>' + _escapeHtml(offer.desc) + '</small></div>' +
            '<div class="crew-card-actions"><button class="btn-primary crew-recruit-btn" data-offer-id="' + offer.id + '">签约 ' + offer.hireCost + '</button></div>' +
          '</div>';
        }).join('')
      : '<div class="crew-empty">当前港口本轮人才市场已无可签约人选。</div>';

    modal.querySelectorAll('.crew-unassign-btn').forEach(function (btn) {
      btn.onclick = function () {
        onUnassignCrew(shipIndex, btn.dataset.crewId);
        renderCrewModal();
      };
    });

    modal.querySelectorAll('.crew-assign-btn').forEach(function (btn) {
      btn.onclick = function () {
        onAssignCrew(shipIndex, btn.dataset.crewId);
        renderCrewModal();
      };
    });

    modal.querySelectorAll('.crew-dismiss-btn').forEach(function (btn) {
      btn.onclick = function () {
        onDismissCrew(btn.dataset.crewId);
        renderCrewModal();
      };
    });

    modal.querySelectorAll('.crew-recruit-btn').forEach(function (btn) {
      btn.onclick = function () {
        onRecruitCrew(btn.dataset.offerId);
        renderCrewModal();
      };
    });
  }

  renderCrewModal();
  document.getElementById('crew-modal-close').onclick = function () {
    modal.classList.add('hidden');
  };
  modal.classList.remove('hidden');
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

          // 检查前置条件
          var prereqOk = true;
          var prereqName = '';
          if (mod.requires) {
            prereqOk = (ship.mods || []).includes(mod.requires);
            if (!prereqOk) {
              var reqMod = SHIP_MODS.find(function (m) { return m.id === mod.requires; });
              prereqName = reqMod ? reqMod.name : mod.requires;
              disabled = true;
            }
          }

          var cls = 'mod-modal-item';
          if (!prereqOk) cls += ' mod-modal-locked';
          else if (disabled) cls += ' mod-modal-full';
          else if (!canAfford) cls += ' mod-modal-poor';

          html += '<div class="' + cls + '">';
          html += '<div class="mod-modal-item-info">';
          html += '<div class="mod-modal-item-name">' + mod.emoji + ' ' + mod.name + '</div>';
          html += '<div class="mod-modal-item-desc">' + mod.desc + '</div>';
          if (!prereqOk) {
            html += '<div class="mod-modal-item-prereq">🔒 需要先安装：' + prereqName + '</div>';
          }
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
  const effectiveShipStats = Fleet.getEffectiveShipStats(state, ship);
  const isActive = shipIndex === (state.activeShipIndex || 0);
  const routeLevel = Fleet.getDispatchRouteLevel(state);
  const shipLocationSystem = SYSTEMS.find(function (sys) { return sys.id === ship.location; });
  const currentLocationSystemId = isActive ? state.currentSystem : (ship.location || state.currentSystem);
  const dispatchGalaxyId = isActive
    ? (state.currentGalaxy || 'milky_way')
    : ((shipLocationSystem && shipLocationSystem.galaxyId) || state.currentGalaxy || 'milky_way');

  document.getElementById('dispatch-title').textContent =
    '📡 ' + (isActive ? '自动派遣' : '派遣') + '「' + ship.emoji + ' ' + ship.name + '」';

  // 填充星系选择
  const buySelect  = document.getElementById('dispatch-buy-system');
  const sellSelect = document.getElementById('dispatch-sell-system');
  const goodSelect = document.getElementById('dispatch-good');
  const maxBuyInput = document.getElementById('dispatch-max-buy-price');
  const minSellInput = document.getElementById('dispatch-min-sell-price');
  const minProfitInput = document.getElementById('dispatch-min-profit-rate');
  const riskModeSelect = document.getElementById('dispatch-risk-mode');
  const marketModeSelect = document.getElementById('dispatch-market-mode');
  const suggestBtn = document.getElementById('dispatch-suggest');
  const suggestRiskEl = document.getElementById('dispatch-suggest-risk');
  const estimateEl = document.getElementById('dispatch-estimate');
  var existingPolicy = ship.route && ship.route.tradePolicy ? ship.route.tradePolicy : {};

  // 对于激活船只，显示同星系已解锁星球
  // 对于非激活船只，根据席位航线等级过滤
  var playerLevel = state.playerLevel || 1;
  var allGalaxyPlanets = getSystemsByGalaxy(dispatchGalaxyId).filter(function (sys) {
    var minLvl = sys.minLevel || 1;
    // 激活船只用玩家等级过滤，非激活船只用席位航线等级
    if (isActive) {
      return playerLevel >= minLvl;
    } else {
      return minLvl <= routeLevel;
    }
  });

  maxBuyInput.value = Number.isFinite(existingPolicy.maxBuyPrice) ? existingPolicy.maxBuyPrice : '';
  minSellInput.value = Number.isFinite(existingPolicy.minSellPrice) ? existingPolicy.minSellPrice : '';
  minProfitInput.value = Number.isFinite(existingPolicy.minProfitRate) ? Math.round(existingPolicy.minProfitRate * 100) : '';
  riskModeSelect.value = existingPolicy.riskMode || 'balanced';
  marketModeSelect.value = existingPolicy.marketMode || 'open';

  function _buildMarketOptions() {
    var marketMode = marketModeSelect.value || 'open';
    var buyPlanets = marketMode === 'black'
      ? allGalaxyPlanets.filter(function (sys) { return AutoTrade.canUseMarket(state, sys.id, 'black'); })
      : allGalaxyPlanets.slice();
    var sellPlanets = allGalaxyPlanets.slice();
    var previousBuy = buySelect.value;
    var previousSell = sellSelect.value;
    var previousGood = goodSelect.value;

    buySelect.innerHTML = '';
    sellSelect.innerHTML = '';
    goodSelect.innerHTML = '';

    if (buyPlanets.length === 0 || sellPlanets.length < 2) {
      var emptyText = marketMode === 'black' ? '当前星系无可用黑市路线' : '需要更多航线（购买席位解锁）';
      buySelect.innerHTML = '<option value="">' + emptyText + '</option>';
      sellSelect.innerHTML = '<option value="">' + emptyText + '</option>';
    } else {
      buyPlanets.forEach(function (sys) {
        buySelect.innerHTML += '<option value="' + sys.id + '">' + sys.name + ' [' + sys.typeLabel + ']</option>';
      });
      sellPlanets.forEach(function (sys) {
        sellSelect.innerHTML += '<option value="' + sys.id + '">' + sys.name + ' [' + sys.typeLabel + ']</option>';
      });
    }

    GOODS.forEach(function (g) {
      if (g.id === 'fuel' || !AutoTrade.isGoodAllowedInMarket(g, marketMode)) return;
      goodSelect.innerHTML += '<option value="' + g.id + '">' + g.emoji + ' ' + g.name + '</option>';
    });

    if (ship.route) {
      if (buySelect.querySelector('option[value="' + ship.route.buySystemId + '"]')) buySelect.value = ship.route.buySystemId;
      if (sellSelect.querySelector('option[value="' + ship.route.sellSystemId + '"]')) sellSelect.value = ship.route.sellSystemId;
      if (goodSelect.querySelector('option[value="' + ship.route.goodId + '"]')) goodSelect.value = ship.route.goodId;
    }

    if (!buySelect.value && previousBuy && buySelect.querySelector('option[value="' + previousBuy + '"]')) buySelect.value = previousBuy;
    if (!sellSelect.value && previousSell && sellSelect.querySelector('option[value="' + previousSell + '"]')) sellSelect.value = previousSell;
    if (!goodSelect.value && previousGood && goodSelect.querySelector('option[value="' + previousGood + '"]')) goodSelect.value = previousGood;

    if (!buySelect.value && buySelect.querySelector('option[value="' + currentLocationSystemId + '"]')) {
      buySelect.value = currentLocationSystemId;
    }
    if ((!sellSelect.value || sellSelect.value === buySelect.value) && sellSelect.options.length > 1) {
      sellSelect.selectedIndex = sellSelect.options[0].value === buySelect.value ? 1 : 0;
    }
  }

  function _readTradePolicy() {
    var maxBuyPrice = parseFloat(maxBuyInput.value);
    var minSellPrice = parseFloat(minSellInput.value);
    var minProfitRatePercent = parseFloat(minProfitInput.value);
    return {
      maxBuyPrice: Number.isFinite(maxBuyPrice) ? maxBuyPrice : null,
      minSellPrice: Number.isFinite(minSellPrice) ? minSellPrice : null,
      minProfitRate: Number.isFinite(minProfitRatePercent) ? minProfitRatePercent / 100 : null,
      riskMode: riskModeSelect.value || 'balanced',
      marketMode: marketModeSelect.value || 'open',
    };
  }

  function _getEstimateData() {
    var buyId = buySelect.value;
    var sellId = sellSelect.value;
    var gId = goodSelect.value;
    if (!buyId || !sellId || !gId) return null;

    var tradePolicy = _readTradePolicy();
    var isBlack = tradePolicy.marketMode === 'black';
    var bp = isBlack ? Economy.getBlackMarketBuyPrice(buyId, gId, state) : Economy.getBuyPrice(buyId, gId, state);
    var sp = isBlack && Faction.canAccessBlackMarket(state, sellId) && AutoTrade.isGoodAllowedInMarket(GOODS.find(function (g) { return g.id === gId; }), 'black')
      ? Economy.getBlackMarketSellPrice(sellId, gId, state)
      : Economy.getSellPrice(sellId, gId, state);
    var cargoUsed = Object.values(ship.cargo).reduce(function (s, q) { return s + q; }, 0);
    var space = effectiveShipStats.maxCargo - cargoUsed;
    var maxQty = Math.min(space, Math.floor(state.credits / bp));
    var travelToBuyFuel = currentLocationSystemId === buyId ? 0 : Economy.getFuelCost(currentLocationSystemId, buyId, effectiveShipStats.fuelEff, state);
    var travelToSellFuel = buyId === sellId ? 0 : Economy.getFuelCost(buyId, sellId, effectiveShipStats.fuelEff, state);
    var totalFuelCost = travelToBuyFuel + travelToSellFuel;
    var fuelUnitPrice = Economy.getBuyPrice(currentLocationSystemId, 'fuel', state);
    var profit = (sp - bp) * maxQty - totalFuelCost * fuelUnitPrice;
    var profitRate = bp > 0 ? ((sp - bp) / bp) : 0;
    var good = GOODS.find(function (g) { return g.id === gId; });
    var routeRisk = AutoTrade.assessTradeRisk(good, buyId, sellId, tradePolicy.marketMode);
    var inspectionRisk = AutoTrade.estimateDispatchInspectionRisk(state, good, maxQty, sellId, tradePolicy.marketMode);

    return {
      buyId: buyId,
      sellId: sellId,
      goodId: gId,
      buyPrice: bp,
      sellPrice: sp,
      maxQty: maxQty,
      fuelCost: totalFuelCost,
      profit: profit,
      profitRate: profitRate,
      tradePolicy: tradePolicy,
      routeRisk: routeRisk,
      inspectionRisk: inspectionRisk,
    };
  }

  function _formatEnforcementLabel(level) {
    if (level === 'high') return '高执法区';
    if (level === 'medium') return '中执法区';
    return '低执法区';
  }

  function _escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _buildRiskSummary(estimate) {
    var routeRisk = estimate.routeRisk || { riskLevel: 'low', buyEnforcement: 'low', sellEnforcement: 'low' };
    var inspectionRisk = estimate.inspectionRisk || {
      hasContraband: false,
      protectedByBlackMarket: false,
      checkChancePercent: 0,
      contrabandGoods: [],
    };
    var highEnforcementParts = [];

    if (routeRisk.buyEnforcement === 'high') highEnforcementParts.push('买入地');
    if (routeRisk.sellEnforcement === 'high') highEnforcementParts.push('卖出地');

    return {
      highEnforcementParts: highEnforcementParts,
      buyEnforcementLabel: _formatEnforcementLabel(routeRisk.buyEnforcement),
      sellEnforcementLabel: _formatEnforcementLabel(routeRisk.sellEnforcement),
      contrabandLabel: inspectionRisk.hasContraband ? inspectionRisk.contrabandGoods.join('、') : '无',
      riskLabel: inspectionRisk.protectedByBlackMarket ? '0%（辛迪加庇护）' : inspectionRisk.checkChancePercent + '%',
      isHighEnforcement: highEnforcementParts.length > 0,
      isHighInspectionRisk: !inspectionRisk.protectedByBlackMarket && inspectionRisk.checkChancePercent >= 10,
      hasContraband: inspectionRisk.hasContraband,
    };
  }

  function _getSuggestedRecommendation() {
    return AutoTrade.findBestDispatchRoute(state, {
      currentSystem: currentLocationSystemId,
      currentGalaxy: dispatchGalaxyId,
      fuelEfficiency: effectiveShipStats.fuelEff,
      cargoFree: effectiveShipStats.maxCargo - Object.values(ship.cargo).reduce(function (s, q) { return s + q; }, 0),
      credits: state.credits,
      playerLevel: playerLevel,
      systemIds: allGalaxyPlanets.map(function (sys) { return sys.id; }),
    }, _readTradePolicy());
  }

  function _updateSuggestRiskIndicator(recommendation) {
    var badgeClass = 'dispatch-suggest-risk dispatch-suggest-risk--none';
    var badgeLabel = '当前策略下暂无可推荐路线';
    var badgeTitle = '当前策略下暂无可推荐路线';
    var inspectionRisk;
    var isHigh;
    var isMedium;

    if (!suggestRiskEl) return;

    if (recommendation) {
      inspectionRisk = recommendation.inspectionRisk || {};
      isHigh = recommendation.riskLevel === 'high' || (inspectionRisk.checkChancePercent || 0) >= 10;
      isMedium = !isHigh && (recommendation.riskLevel === 'medium' || (inspectionRisk.checkChancePercent || 0) > 0);

      if (isHigh) {
        badgeClass = 'dispatch-suggest-risk dispatch-suggest-risk--high';
        badgeLabel = '推荐风险高';
      } else if (isMedium) {
        badgeClass = 'dispatch-suggest-risk dispatch-suggest-risk--medium';
        badgeLabel = '推荐风险中';
      } else {
        badgeClass = 'dispatch-suggest-risk dispatch-suggest-risk--low';
        badgeLabel = '推荐风险低';
      }

      badgeTitle = recommendation.buySystemName + ' → ' + recommendation.sellSystemName + ' · ' + recommendation.goodName + ' · 预计查获风险 ' + ((inspectionRisk && inspectionRisk.protectedByBlackMarket) ? '0%（辛迪加庇护）' : ((inspectionRisk && inspectionRisk.checkChancePercent) || 0) + '%');
    }

    suggestRiskEl.className = badgeClass;
    suggestRiskEl.textContent = '';
    suggestRiskEl.setAttribute('aria-label', badgeLabel + '，' + badgeTitle);
    suggestRiskEl.title = badgeTitle;
  }

  function _renderEstimate(estimate, recommendation, warnings) {
    var riskAssessment = estimate.routeRisk;
    var riskSummary = _buildRiskSummary(estimate);
    var marketLabel = estimate.tradePolicy.marketMode === 'black' ? '黑市' : '公开';
    var riskModeLabel = estimate.tradePolicy.riskMode === 'safe'
      ? '保守'
      : estimate.tradePolicy.riskMode === 'aggressive'
        ? '激进'
        : '平衡';
    var warningHtml = warnings.length > 0
      ? '<div class="dispatch-estimate-note dispatch-estimate-note--warning">策略将等待：' + _escapeHtml(warnings.join('、')) + '</div>'
      : '';
    var lossHtml = estimate.profit <= 0
      ? '<div class="dispatch-estimate-note dispatch-estimate-note--danger">亏损路线</div>'
      : '';
    var recommendationHtml = recommendation
      ? '<div class="dispatch-estimate-head">推荐：' + _escapeHtml(recommendation.buySystemName) + ' → ' + _escapeHtml(recommendation.sellSystemName) + '（' + _escapeHtml(recommendation.goodName) + '）</div>'
      : '';

    estimateEl.innerHTML =
      recommendationHtml +
      '<div class="dispatch-estimate-main">' +
        '<span class="dispatch-estimate-highlight">' + marketLabel + '买' + estimate.maxQty + '单位</span>' +
        '<span>单次利润 ≈ ' + Math.floor(estimate.profit) + ' 积分</span>' +
        '<span>利润率 ' + Math.round(estimate.profitRate * 100) + '%</span>' +
        '<span>航程燃料 ' + estimate.fuelCost + ' 单位</span>' +
        '<span>路线风险 ' + _escapeHtml(riskAssessment.riskLevel) + '</span>' +
        '<span>风险偏好 ' + riskModeLabel + '</span>' +
      '</div>' +
      '<div class="dispatch-risk-grid">' +
        '<div class="dispatch-risk-item ' + (riskSummary.isHighEnforcement ? 'dispatch-risk-item--danger' : '') + '">' +
          '<span class="dispatch-risk-label">高执法区</span>' +
          '<span class="dispatch-risk-value">' + _escapeHtml(riskSummary.highEnforcementParts.length > 0 ? riskSummary.highEnforcementParts.join('、') : '无') + '</span>' +
        '</div>' +
        '<div class="dispatch-risk-item">' +
          '<span class="dispatch-risk-label">执法分布</span>' +
          '<span class="dispatch-risk-value">买入 ' + _escapeHtml(riskSummary.buyEnforcementLabel) + ' / 卖出 ' + _escapeHtml(riskSummary.sellEnforcementLabel) + '</span>' +
        '</div>' +
        '<div class="dispatch-risk-item ' + (riskSummary.hasContraband ? 'dispatch-risk-item--warning' : '') + '">' +
          '<span class="dispatch-risk-label">违禁品</span>' +
          '<span class="dispatch-risk-value">' + _escapeHtml(riskSummary.contrabandLabel) + '</span>' +
        '</div>' +
        '<div class="dispatch-risk-item ' + (riskSummary.isHighInspectionRisk ? 'dispatch-risk-item--danger' : '') + '">' +
          '<span class="dispatch-risk-label">预计查获风险</span>' +
          '<span class="dispatch-risk-value">' + _escapeHtml(riskSummary.riskLabel) + '</span>' +
        '</div>' +
      '</div>' +
      lossHtml +
      warningHtml;
  }

  function _applySuggestedRoute() {
    var recommendation = _getSuggestedRecommendation();

    if (!recommendation) {
      estimateEl.textContent = '未找到符合当前策略的派遣路线。请放宽价格阈值、风险偏好要求，或确认已解锁黑市权限。';
      _updateSuggestRiskIndicator(null);
      return;
    }

    buySelect.value = recommendation.buySystemId;
    sellSelect.value = recommendation.sellSystemId;
    goodSelect.value = recommendation.goodId;
    _updateSuggestRiskIndicator(recommendation);
    _updateEstimate(recommendation);
  }

  // 预估利润
  function _updateEstimate(recommendation) {
    var estimate = _getEstimateData();
    var suggestedRecommendation = recommendation || _getSuggestedRecommendation();
    if (!estimate) {
      estimateEl.textContent = '无法预估（航线不足）';
      _updateSuggestRiskIndicator(suggestedRecommendation);
      return;
    }
    var warnings = [];
    var riskAssessment = estimate.routeRisk;
    var riskSummary = _buildRiskSummary(estimate);
    var recommendationPrefix = recommendation
      ? '推荐：' + recommendation.buySystemName + ' → ' + recommendation.sellSystemName + '（' + recommendation.goodName + '） · '
      : '';

    if (Number.isFinite(estimate.tradePolicy.maxBuyPrice) && estimate.buyPrice > estimate.tradePolicy.maxBuyPrice) warnings.push('买入价高于上限');
    if (Number.isFinite(estimate.tradePolicy.minSellPrice) && estimate.sellPrice < estimate.tradePolicy.minSellPrice) warnings.push('卖出价低于下限');
    if (Number.isFinite(estimate.tradePolicy.minProfitRate) && estimate.profitRate < estimate.tradePolicy.minProfitRate) warnings.push('利润率低于阈值');
    if (estimate.tradePolicy.riskMode === 'safe' && riskAssessment.riskLevel !== 'low') warnings.push('风险偏好将规避此路线');
    if (estimate.tradePolicy.marketMode === 'black' && !Faction.canAccessBlackMarket(state, estimate.buyId)) warnings.push('黑市买入权限不足');

    _updateSuggestRiskIndicator(suggestedRecommendation);
    _renderEstimate(estimate, recommendation, warnings);
  }

  _buildMarketOptions();
  buySelect.onchange  = _updateEstimate;
  sellSelect.onchange = _updateEstimate;
  goodSelect.onchange = _updateEstimate;
  maxBuyInput.oninput = _updateEstimate;
  minSellInput.oninput = _updateEstimate;
  minProfitInput.oninput = _updateEstimate;
  riskModeSelect.onchange = _updateEstimate;
  marketModeSelect.onchange = function () {
    _buildMarketOptions();
    _updateEstimate();
  };
  suggestBtn.onclick = _applySuggestedRoute;
  _updateEstimate();

  // 确认
  document.getElementById('dispatch-confirm').onclick = function () {
    onAssignRoute(shipIndex, buySelect.value, sellSelect.value, goodSelect.value, _readTradePolicy());
    modal.classList.add('hidden');
  };

  document.getElementById('dispatch-cancel').onclick = function () {
    modal.classList.add('hidden');
  };

  modal.classList.remove('hidden');
}
