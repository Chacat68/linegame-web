// js/ui/FleetUI.js — 船队管理 UI（含席位系统）
// 依赖：data/ships.js, data/systems.js, data/goods.js, systems/fleet/FleetSystem.js
// 导出：render

import { SHIP_TYPES, SHIP_UPGRADES, FLEET_SLOTS, SHIP_MODS, FLEET_BONUSES } from '../data/ships.js';
import { GALAXIES, SYSTEMS, getAccessibleGalaxies, getSystemsByGalaxy } from '../data/systems.js';
import { GOODS } from '../data/goods.js';
import { getCompanyLevelValue, getFleetSlotCompanyRequirement } from '../data/companyAccess.js';
import * as Fleet from '../systems/fleet/FleetSystem.js?v=20260526-modfocus1';
import * as Crew from '../systems/fleet/CrewSystem.js';
import * as Economy from '../systems/economy/Economy.js';
import * as AutoTrade from '../systems/trade/AutoTradeSystem.js?v=20260420-balance5';
import * as Faction from '../systems/faction/FactionSystem.js';
import { bindBlockingSurfaceDismiss, hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js?v=20260505-surface4';
import * as EventBus from '../core/EventBus.js';

let _activeInlineModalId = null;
let _currentPortalCleanup = null;
let _activeModModalContext = null;
let _activeDispatchModalContext = null;

// 全局监听重置事件（用于视图切换时自动归还节点）
EventBus.on('hangar:reset', function() {
  if (_currentPortalCleanup) {
    _currentPortalCleanup();
  }
});

/**
 * 核心 Portal 函数：将弹窗中的 .modal-box 搬移至内联容器
 * @param {string} modalId 弹窗元素的ID（如 'mod-modal'）
 * @param {Function} onCloseCallback 当点击返回或关闭时调用的额外回调
 */
function _openInlinePortal(modalId, onCloseCallback) {
  // 如果之前已经有活动的 portal，先静默归还
  if (_currentPortalCleanup) {
    _currentPortalCleanup();
  }

  const listContainer = document.getElementById('fleet-list');
  const inlineContainer = document.getElementById('fleet-inline-container');
  const modal = document.getElementById(modalId);
  if (!listContainer || !inlineContainer || !modal) return false;

  const modalBox = modal.querySelector('.modal-box');
  if (!modalBox) return false;

  _activeInlineModalId = modalId;

  // 1. 隐藏原主列表，显示内嵌容器
  listContainer.classList.add('hidden');
  inlineContainer.classList.remove('hidden');
  inlineContainer.innerHTML = '';

  // 2. 创建高颜值的 [ ← 返回机库列表 ] 的青色毛玻璃窄条
  const backBar = document.createElement('div');
  backBar.className = 'inline-portal-back-bar';
  backBar.innerHTML = `<button class="inline-portal-back-btn" type="button">← 返回机库列表 (BACK TO HANGAR)</button>`;
  
  // 3. 将返回条和搬移过来的 modalBox 插入到内联容器
  inlineContainer.appendChild(backBar);
  inlineContainer.appendChild(modalBox);

  // 4. 定义清理（还原）函数
  const cleanup = function() {
    if (_activeInlineModalId !== modalId) return; // 避免重复清理

    // 把 .modal-box 移回原 modal 容器
    modal.appendChild(modalBox);
    
    // 隐藏并清空内嵌容器，重新展现列表
    inlineContainer.classList.add('hidden');
    inlineContainer.innerHTML = '';
    listContainer.classList.remove('hidden');
    
    _activeInlineModalId = null;
    _currentPortalCleanup = null;
    if (modalId === 'mod-modal') {
      _activeModModalContext = null;
    } else if (modalId === 'dispatch-modal') {
      _activeDispatchModalContext = null;
    }

    if (onCloseCallback) {
      onCloseCallback();
    }
  };

  _currentPortalCleanup = cleanup;

  // 5. 绑定返回按钮事件
  backBar.querySelector('.inline-portal-back-btn').onclick = function(e) {
    e.preventDefault();
    cleanup();
    // 触发全局渲染以更新主列表状态
    if (globalThis.__linegameGameManager && typeof globalThis.__linegameGameManager.renderUI === 'function') {
      globalThis.__linegameGameManager.renderUI();
    }
  };

  return true;
}

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
 * @param {Function} onServiceShip  (shipIndex, tierId) => void
 * @param {Function} onRecruitCrew  (offerId) => void
 * @param {Function} onAssignCrew   (shipIndex, crewId) => void
 * @param {Function} onUnassignCrew (shipIndex, crewId) => void
 * @param {Function} onDismissCrew  (crewId) => void
 * @param {Function} onSetShipDoctrine (shipIndex, doctrineId) => void
 * @param {Function} onActivateShipProtocol (shipIndex) => void
 */
export function render(state, onBuyShip, onSwitchShip, onUpgradeShip, onAssignRoute, onCancelRoute, onBuySlot, onSellShip, onInstallMod, onUninstallMod, onServiceShip, onRecruitCrew, onAssignCrew, onUnassignCrew, onDismissCrew, onSetShipDoctrine, onActivateShipProtocol) {
  if (_activeInlineModalId !== null) {
    return;
  }
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
  const activeShipStats = activeShip ? Fleet.getEffectiveShipStats(state, activeShip) : null;
  const activeCargoUsed = activeShip
    ? Object.values(activeShip.cargo || {}).reduce(function (sum, qty) { return sum + qty; }, 0)
    : 0;
  const activeCrewCount = activeShip ? Crew.getShipCrew(state, activeShip).length : 0;
  const activeMaintenance = activeShipStats
    ? (activeShipStats.maintenance || Fleet.getShipMaintenanceSummary(state, activeShip))
    : null;
  const activeRoleProfile = activeShipStats
    ? (activeShipStats.roleProfile || Fleet.getShipRoleProfile(state, activeShip))
    : null;
  const activeMissionLabel = activeShip
    ? (activeShip.route ? '派遣航线运行中' : '停靠待命，等待调度')
    : '未配置旗舰';
  const activeFuelPct = activeShip
    ? Math.max(0, Math.min(100, Math.round((activeShip.fuel / Math.max(1, activeShip.maxFuel || 1)) * 100)))
    : 0;
  const fleetRouteCount = fleet.filter(function (ship) { return !!ship.route; }).length;
  const fleetCargoCap = fleet.reduce(function (sum, ship) {
    var stats = Fleet.getEffectiveShipStats(state, ship);
    return sum + (stats.maxCargo || ship.maxCargo || 0);
  }, 0);

  let html = '';

  html += '<section class="hangar-command-deck">';
  html += '<div class="hangar-bay-visual" aria-hidden="true">';
  html += '<span class="hangar-bay-rings"></span>';
  html += '<span class="hangar-ship-silhouette">' + (activeShip ? activeShip.emoji : '◇') + '</span>';
  html += '<span class="hangar-dock-light hangar-dock-light--a"></span>';
  html += '<span class="hangar-dock-light hangar-dock-light--b"></span>';
  html += '</div>';
  html += '<div class="hangar-command-copy">';
  html += '<div class="hangar-command-kicker">ORBITAL DRYDOCK</div>';
  html += '<h2>' + (activeShip ? _escapeHtml(activeShip.name) : '未配置旗舰') + '</h2>';
  html += '<p>' + _escapeHtml(activeMissionLabel) + ' · ' + _escapeHtml(activeRoleProfile ? activeRoleProfile.label : '综合用途') + '</p>';
  html += '<div class="hangar-command-tags">';
  html += '<span>航线 Lv.' + routeLevel + '</span>';
  html += '<span>燃料 ' + activeFuelPct + '%</span>';
  html += '<span>维护 ' + (activeMaintenance ? Math.round(activeMaintenance.value) : 0) + '%</span>';
  html += '</div>';
  html += '</div>';
  html += '<div class="hangar-command-metrics">';
  html += '<div><span>舰船</span><strong>' + fleet.length + '/' + slotCount + '</strong></div>';
  html += '<div><span>派遣</span><strong>' + fleetRouteCount + '</strong></div>';
  html += '<div><span>旗舰货舱</span><strong>' + activeCargoUsed + '/' + (activeShipStats ? activeShipStats.maxCargo : 0) + '</strong></div>';
  html += '<div><span>总舱容</span><strong>' + fleetCargoCap + '</strong></div>';
  html += '<div><span>船员</span><strong>' + activeCrewCount + '/' + (activeShip ? (activeShip.crewCapacity || 0) : 0) + '</strong></div>';
  html += '</div>';
  html += '</section>';

  // ========== 席位区域 ==========
  html += '<section class="hangar-module hangar-slot-deck">';
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
    var requiredCompanyLevel = getFleetSlotCompanyRequirement(nextSlot.id);
    var companyLevel = getCompanyLevelValue(state);
    var hasCompanyLevel = companyLevel >= requiredCompanyLevel;
    var canBuySlot = canAffordSlot && hasCompanyLevel;
    var slotButtonLabel = canBuySlot
      ? '🎫 解锁 ' + nextSlot.cost.toLocaleString() + ' 积分'
      : (!hasCompanyLevel
          ? '公司 Lv.' + requiredCompanyLevel + ' 解锁'
          : '积分不足 (' + nextSlot.cost.toLocaleString() + ')');
    html += '<div class="fleet-slot-next">';
    html += '<span>下一席位：<b>' + nextSlot.name + '</b> — ' + nextSlot.desc + ' · 需公司 Lv.' + requiredCompanyLevel + '</span>';
    html += '<button class="fleet-slot-buy-btn' + (canBuySlot ? ' slot-can-buy' : '') + '"' +
            (canBuySlot ? '' : ' disabled') + '>' +
            slotButtonLabel +
            '</button>';
    html += '</div>';
  } else {
    html += '<div class="fleet-slot-next"><span>🏆 已解锁全部席位！</span></div>';
  }
  html += '</div>';
  html += '</section>';

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
  html += '<section class="hangar-module hangar-fleet-manifest">';
  html += '<div class="fleet-section-title" style="margin-top:12px">⚓ 我的船队（' + fleet.length + '/' + slotCount + '）</div>';

  fleet.forEach(function (ship, idx) {
    const isActive = idx === activeIdx;
      const isSwitchFlashing = canFlash && idx === flashIndex;
    const cargoUsed = Object.values(ship.cargo).reduce(function (s, q) { return s + q; }, 0);
    const shipCrew = Crew.getShipCrew(state, ship);
    const shipStats = Fleet.getEffectiveShipStats(state, ship);
    const specialization = shipStats.specialization || Fleet.getShipSpecializationSummary(state, ship);
    const doctrine = specialization ? specialization.doctrine : null;
    const maintenance = shipStats.maintenance || Fleet.getShipMaintenanceSummary(state, ship);
    const roleProfile = shipStats.roleProfile || Fleet.getShipRoleProfile(state, ship);
    const faults = shipStats.faults || Fleet.getShipFaultSummaries(ship);
    const modRecommendation = Fleet.getShipModRecommendation
      ? Fleet.getShipModRecommendation(state, idx)
      : null;
    const repairJob = ship.repairJob && ship.repairJob.remainingDays > 0 ? ship.repairJob : null;

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
    const cargoEntries = Object.entries(ship.cargo);
    var skills = Fleet.getShipSkills(ship);
    var shipMods = (ship.mods || []);
    var crewEffectParts = _formatCrewEffectParts(shipStats.crewEffects || {});
    var doctrineCooldown = specialization && doctrine ? (specialization.cooldowns[doctrine.id] || 0) : 0;
    var doctrineLevel = specialization && doctrine ? (specialization.levels[doctrine.id] || 0) : 0;
    var protocolSummary = '';
    var protocolTitle = '';
    var detailSummaryParts = [];

    if (specialization && doctrine) {
      if (specialization.activeProtocol) {
        protocolSummary = specialization.activeProtocol.icon + ' ' + specialization.activeProtocol.name + ' · ' + specialization.activeProtocol.remainingCharges + '次';
        protocolTitle = specialization.activeProtocol.name + ' 剩余 ' + specialization.activeProtocol.remainingCharges + ' 次';
      } else if (doctrineCooldown > 0) {
        protocolSummary = '⏳ ' + doctrine.shortName + '冷却 ' + doctrineCooldown + '天';
        protocolTitle = doctrine.shortName + '协议冷却 ' + doctrineCooldown + ' 天';
      } else if (doctrineLevel > 0) {
        protocolSummary = doctrine.protocol.icon + ' ' + doctrine.protocol.name + ' 就绪';
        protocolTitle = doctrine.protocol.name + ' 已就绪';
      } else {
        protocolSummary = '🔒 ' + doctrine.shortName + '协议';
        protocolTitle = doctrine.shortName + '协议待解锁';
      }
    }

    if (shipCrew.length > 0) detailSummaryParts.push('船员 ' + shipCrew.length);
    if (cargoEntries.length > 0) detailSummaryParts.push('货物 ' + cargoEntries.length);
    if (skills.length + shipMods.length > 0) detailSummaryParts.push('配置 ' + (skills.length + shipMods.length));
    if (faults.length > 0) detailSummaryParts.push('故障 ' + faults.length);

    html += '<div class="fleet-ship-stats">';
    html += '<span class="fleet-stat" title="货舱 上限' + ship.maxCargoCap + '">📦' + cargoUsed + '/' + shipStats.maxCargo + '</span>';
    html += '<span class="fleet-stat" title="燃料 上限' + ship.maxFuelCap + '">⚡' + Math.floor(ship.fuel) + '/' + ship.maxFuel + '</span>';
    html += '<span class="fleet-stat" title="船体 上限' + ship.maxHullCap + '">🛡' + Math.floor(ship.hull) + '/' + ship.maxHull + '</span>';
    html += '<span class="fleet-stat" title="耗油率 最低' + ship.minFuelEff + '">🔧×' + shipStats.fuelEff.toFixed(2) + '</span>';
    html += '</div>';

    html += '<div class="fleet-summary-strip">';
    html += '<span class="fleet-role-chip" title="' + _escapeHtml(roleProfile.summary) + '">🎯 ' + _escapeHtml(roleProfile.label) + '</span>';
    html += '<span class="fleet-summary-chip" title="当前在岗船员与席位">👥 ' + shipCrew.length + '/' + (ship.crewCapacity || 0) + ' 在岗</span>';
    html += '<span class="fleet-maintenance-chip fleet-maintenance-' + maintenance.band + '" title="恢复至 100% 预计花费 ' + maintenance.serviceCost.toLocaleString() + ' 积分">🧰 ' + maintenance.label + ' ' + Math.round(maintenance.value) + '%</span>';
    if (repairJob) {
      html += '<span class="fleet-summary-chip fleet-summary-chip--repair" title="已进入维修队列，剩余 ' + repairJob.remainingDays + ' 天">🔧 维修中 ' + repairJob.remainingDays + ' 天</span>';
    }
    if (protocolSummary) {
      html += '<span class="fleet-summary-chip fleet-summary-chip--protocol" title="' + _escapeHtml(protocolTitle) + '">' + _escapeHtml(protocolSummary) + '</span>';
    }
    if (faults.length > 0) {
      html += '<span class="fleet-summary-chip fleet-summary-chip--warning" title="存在 ' + faults.length + ' 项故障">⚠️ 故障 ' + faults.length + '</span>';
    }
    if (modRecommendation) {
      html += '<span class="fleet-summary-chip fleet-summary-chip--recommend" title="' + _escapeHtml(modRecommendation.reason) + '">🧩 推荐 ' + _escapeHtml(modRecommendation.mod.name) + '</span>';
    }
    html += '</div>';

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
      html += '<div class="fleet-route-meta">';
      html += '<span class="fleet-route-status">' + (routeDisplay ? routeDisplay.statusLabel : ship.route.status) + '</span>';
      html += '<span class="fleet-route-policy">🎛 ' + _formatTradePolicySummary(ship.route.tradePolicy) + '</span>';
      html += '</div>';
      html += '<button class="fleet-cancel-btn" data-index="' + idx + '">⏹️ 召回</button>';
      html += '</div>';
    }

    if (roleProfile.summary || crewEffectParts.length > 0 || (roleProfile.tags && roleProfile.tags.length > 0) || faults.length > 0 || (specialization && doctrine) || shipCrew.length > 0 || skills.length > 0 || shipMods.length > 0 || cargoEntries.length > 0) {
      html += '<details class="fleet-detail-panel">';
      html += '<summary>展开详情' + (detailSummaryParts.length > 0 ? ' · ' + _escapeHtml(detailSummaryParts.join(' · ')) : '') + '</summary>';
      html += '<div class="fleet-detail-grid">';

      if (roleProfile.summary || crewEffectParts.length > 0 || (roleProfile.tags && roleProfile.tags.length > 0)) {
        html += '<div class="fleet-detail-section">';
        html += '<div class="fleet-detail-section-title">运营概览</div>';
        if (roleProfile.summary) {
          html += '<div class="fleet-detail-copy">' + _escapeHtml(roleProfile.summary) + '</div>';
        }
        if (crewEffectParts.length > 0) {
          html += '<div class="fleet-detail-copy">船员增益：' + _escapeHtml(crewEffectParts.join(' · ')) + ' · 维护损耗 ' + maintenance.dailyDecay.toFixed(1) + '/天</div>';
        } else {
          html += '<div class="fleet-detail-copy">维护损耗 ' + maintenance.dailyDecay.toFixed(1) + '/天</div>';
        }
        if (roleProfile.tags && roleProfile.tags.length > 0) {
          html += '<div class="fleet-role-tags">';
          roleProfile.tags.forEach(function (tag) {
            html += '<span class="fleet-role-tag">' + _escapeHtml(tag) + '</span>';
          });
          html += '</div>';
        }
        html += '</div>';
      }

      if (specialization && doctrine) {
        html += '<div class="fleet-detail-section">';
        html += '<div class="fleet-detail-section-title">协议与专精</div>';
        html += '<div class="fleet-specialization-summary">';
        html += '<span class="fleet-doctrine-chip">' + doctrine.icon + ' ' + doctrine.shortName + '</span>';
        html += '<span class="fleet-specialization-chip">💹 Lv.' + (specialization.levels.trade || 0) + '</span>';
        html += '<span class="fleet-specialization-chip">🛰️ Lv.' + (specialization.levels.navigation || 0) + '</span>';
        html += '<span class="fleet-specialization-chip">🧭 Lv.' + (specialization.levels.exploration || 0) + '</span>';
        if (specialization.activeProtocol) {
          html += '<span class="fleet-protocol-chip fleet-protocol-chip-active">' + specialization.activeProtocol.icon + ' ' + specialization.activeProtocol.name + ' · 剩余 ' + specialization.activeProtocol.remainingCharges + ' 次</span>';
        } else if (doctrineCooldown > 0) {
          html += '<span class="fleet-protocol-chip">⏳ ' + doctrine.shortName + '协议冷却 ' + doctrineCooldown + ' 天</span>';
        } else if (doctrineLevel > 0) {
          html += '<span class="fleet-protocol-chip">' + doctrine.protocol.icon + ' ' + doctrine.protocol.name + ' 就绪</span>';
        } else {
          html += '<span class="fleet-protocol-chip">🔒 ' + doctrine.shortName + '协议待解锁</span>';
        }
        html += '</div>';
        html += '</div>';
      }

      if (faults.length > 0) {
        html += '<div class="fleet-detail-section">';
        html += '<div class="fleet-detail-section-title">故障告警</div>';
        html += '<div class="fleet-fault-list">';
        faults.forEach(function (fault) {
          html += '<span class="fleet-fault-chip" title="' + _escapeHtml(fault.desc) + '">' + fault.icon + ' ' + _escapeHtml(fault.label) + '</span>';
        });
        html += '</div>';
        html += '</div>';
      }

      if (shipCrew.length > 0) {
        html += '<div class="fleet-detail-section">';
        html += '<div class="fleet-detail-section-title">当前船员</div>';
        html += '<div class="fleet-crew-chips">';
        shipCrew.forEach(function (crewMember) {
          html += '<span class="fleet-crew-chip">' + crewMember.emoji + ' ' + _escapeHtml(crewMember.name) + ' Lv.' + (crewMember.level || 1) + '</span>';
        });
        html += '</div>';
        html += '</div>';
      }

      if (skills.length > 0 || shipMods.length > 0) {
        html += '<div class="fleet-detail-section">';
        html += '<div class="fleet-detail-section-title">技能与组件</div>';
        html += '<div class="fleet-chips-row">';
        skills.forEach(function (skill) {
          html += '<span class="fleet-skill-chip" title="' + _escapeHtml(skill.desc) + '">' + skill.emoji + ' ' + _escapeHtml(skill.name) + '</span>';
        });
        shipMods.forEach(function (modId) {
          var mod = SHIP_MODS.find(function (m) { return m.id === modId; });
          if (mod) html += '<span class="fleet-mod-chip">' + mod.emoji + ' ' + _escapeHtml(mod.name) + '</span>';
        });
        html += '</div>';
        html += '</div>';
      }

      if (modRecommendation) {
        html += '<div class="fleet-detail-section">';
        html += '<div class="fleet-detail-section-title">改装建议</div>';
        html += '<div class="fleet-detail-copy">' + modRecommendation.mod.emoji + ' ' + _escapeHtml(modRecommendation.mod.name) + '：' + _escapeHtml(modRecommendation.reason) + '</div>';
        if (modRecommendation.disabledReason) {
          html += '<div class="fleet-detail-copy">当前限制：' + _escapeHtml(modRecommendation.disabledReason) + '</div>';
        }
        html += '</div>';
      }

      if (cargoEntries.length > 0) {
        html += '<div class="fleet-detail-section">';
        html += '<div class="fleet-detail-section-title">货舱内容</div>';
        html += '<div class="fleet-cargo-chips">';
        cargoEntries.forEach(function (entry) {
          const good = GOODS.find(function (g) { return g.id === entry[0]; });
          html += '<span class="fleet-cargo-chip">' + (good ? good.emoji + _escapeHtml(good.name) : _escapeHtml(entry[0])) + ' ×' + entry[1] + '</span>';
        });
        html += '</div>';
        html += '</div>';
      }

      html += '</div>';
      html += '</details>';
    }

    // ======== 操作按钮行（整合为三项） ========
    html += '<div class="fleet-card-action-row">';
    var modSlots = ship.modSlots || 1;
    var upgradeCount = (ship.upgrades || []).length;
    var needsService = maintenance.value < 99.5 || faults.length > 0 || ship.hull < ship.maxHull;
        var modButtonMeta = '升级 ' + upgradeCount + ' · 组件 ' + shipMods.length + '/' + modSlots;
        if (repairJob) modButtonMeta += ' · ' + _getRepairCountdownText(repairJob);
        else if (needsService) modButtonMeta += ' · 需维修';
        var dispatchButtonMeta = repairJob
          ? ('维修中 · 剩余 ' + repairJob.remainingDays + ' 天')
          : (ship.route ? '查看路线 · 可召回' : (isActive ? '旗舰自动派遣' : '配置贸易路线'));

    html += '<button class="fleet-open-mod-btn fleet-manage-btn fleet-manage-btn--mod" data-ship-index="' + idx + '">' +
            '<span class="fleet-manage-btn-label">🔧 改装</span>' +
          '<span class="fleet-manage-btn-meta">' + modButtonMeta + '</span>' +
            '</button>';

    html += '<button class="fleet-open-crew-btn fleet-manage-btn fleet-manage-btn--crew" data-ship-index="' + idx + '">' +
            '<span class="fleet-manage-btn-label">👥 人员</span>' +
            '<span class="fleet-manage-btn-meta">' + shipCrew.length + '/' + (ship.crewCapacity || 0) + ' 在岗' + (isActive ? ' · 当前操控' : ' · 协议配置') + '</span>' +
            '</button>';

        html += '<button class="fleet-dispatch-btn fleet-manage-btn fleet-manage-btn--dispatch" data-index="' + idx + '"' + (repairJob ? ' disabled' : '') + '>' +
            '<span class="fleet-manage-btn-label">📡 派遣</span>' +
          '<span class="fleet-manage-btn-meta">' + dispatchButtonMeta + '</span>' +
            '</button>';
    html += '</div>'; // fleet-card-action-row

    html += '</div>'; // fleet-ship-card
  });
  html += '</section>';

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

  // 改装弹窗按钮
  container.querySelectorAll('.fleet-open-mod-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _openModModal(state, parseInt(btn.dataset.shipIndex), onInstallMod, onUninstallMod, onUpgradeShip, onServiceShip, onSellShip);
    });
  });

  container.querySelectorAll('.fleet-open-crew-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _openCrewModal(state, parseInt(btn.dataset.shipIndex), onRecruitCrew, onAssignCrew, onUnassignCrew, onDismissCrew, onSwitchShip, onSetShipDoctrine, onActivateShipProtocol);
    });
  });

  // 派遣按钮 → 打开派遣配置弹窗（所有船只，包括激活船只）
  container.querySelectorAll('.fleet-dispatch-btn:not([disabled])').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openDispatchModal(state, parseInt(btn.dataset.index), onAssignRoute, onCancelRoute);
    });
  });

  // 召回按钮
  container.querySelectorAll('.fleet-cancel-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      onCancelRoute(parseInt(btn.dataset.index));
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

function _focusGuidedMod(container, focusModId) {
  if (!container || !focusModId || typeof container.querySelector !== 'function') return;

  var target = container.querySelector('[data-focus-mod="item"]')
    || container.querySelector('[data-focus-mod="recommendation"]');
  if (!target) return;

  if (target.classList && typeof target.classList.add === 'function') {
    target.classList.add('mod-modal-guidance-focus');
  }
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
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

function _getShipSellQuote(ship) {
  var shipTypeDef = SHIP_TYPES.find(function (type) { return type.id === (ship && ship.typeId); });
  var sellBase = shipTypeDef ? (shipTypeDef.sellValue || shipTypeDef.cost || 0) : 0;
  return {
    minPrice: Math.floor(sellBase * 0.45),
    maxPrice: Math.floor(sellBase * 0.80),
  };
}

var STRUCTURE_MODULES = [
  { id: 'cargo', icon: '📦', name: '货舱舱段', desc: '扩展载货能力，只展示当前可推进的下一档。', emptyLabel: '尚未扩容' },
  { id: 'fuel', icon: '⛽', name: '燃料系统', desc: '提升续航储备，保持长线运营的油量冗余。', emptyLabel: '尚未加装' },
  { id: 'engine', icon: '🚀', name: '推进核心', desc: '优化推进效率，压低航行燃耗。', emptyLabel: '尚未调校' },
  { id: 'hull', icon: '🛡️', name: '结构装甲', desc: '强化船体与装甲骨架，提升耐久余量。', emptyLabel: '尚未强化' },
];

var MOD_CATEGORY_META = {
  cargo: { icon: '📦', name: '货舱组件', desc: '围绕装载空间与压缩效率的舱段扩展。' },
  engine: { icon: '🔥', name: '动力组件', desc: '提升推进、续航与扫描链路。' },
  hull: { icon: '🛡️', name: '防护组件', desc: '强化结构稳定性与自修复能力。' },
  trade: { icon: '💰', name: '贸易组件', desc: '聚焦议价、走私和收益放大。' },
};

function _getStructureModuleId(upgrade) {
  if (!upgrade || !upgrade.id) return 'cargo';
  if (upgrade.id.indexOf('ship_fuel_') === 0) return 'fuel';
  if (upgrade.id.indexOf('ship_engine_') === 0) return 'engine';
  if (upgrade.id.indexOf('ship_hull_') === 0) return 'hull';
  return 'cargo';
}

function _formatEffectText(effect) {
  var parts = [];
  if (!effect) return '';
  if (effect.cargo) parts.push('货舱 +' + effect.cargo);
  if (effect.maxFuel) parts.push('燃料 +' + effect.maxFuel);
  if (effect.hull) parts.push('船体 +' + effect.hull);
  if (effect.fuelEff && effect.fuelEff < 1) parts.push('航耗 -' + Math.round((1 - effect.fuelEff) * 100) + '%');
  if (effect.buyDiscount) parts.push('买入 -' + Math.round(effect.buyDiscount * 100) + '%');
  if (effect.sellBonus) parts.push('卖出 +' + Math.round(effect.sellBonus * 100) + '%');
  if (effect.autoRepair) parts.push('自动修复 +' + effect.autoRepair);
  if (effect.maintenanceDecayMultiplier && effect.maintenanceDecayMultiplier < 1) {
    parts.push('磨损 -' + Math.round((1 - effect.maintenanceDecayMultiplier) * 100) + '%');
  }
  if (effect.scanFuelDiscount) parts.push('扫描燃料 -' + Math.round(effect.scanFuelDiscount * 100) + '%');
  if (effect.poiRewardMultiplier && effect.poiRewardMultiplier > 1) {
    parts.push('勘探收益 +' + Math.round((effect.poiRewardMultiplier - 1) * 100) + '%');
  }
  return parts.join(' · ');
}

function _formatStructureModuleEffect(moduleId, installedUpgrades) {
  if (!installedUpgrades || installedUpgrades.length === 0) return '';

  if (moduleId === 'engine') {
    var fuelFactor = installedUpgrades.reduce(function (factor, upgrade) {
      return factor * (upgrade.effect && upgrade.effect.fuelEff ? upgrade.effect.fuelEff : 1);
    }, 1);
    return '航耗 -' + Math.round((1 - fuelFactor) * 100) + '%';
  }

  var total = installedUpgrades.reduce(function (sum, upgrade) {
    if (moduleId === 'cargo') return sum + ((upgrade.effect && upgrade.effect.cargo) || 0);
    if (moduleId === 'fuel') return sum + ((upgrade.effect && upgrade.effect.maxFuel) || 0);
    return sum + ((upgrade.effect && upgrade.effect.hull) || 0);
  }, 0);

  if (moduleId === 'cargo') return '货舱 +' + total;
  if (moduleId === 'fuel') return '燃料 +' + total;
  return '船体 +' + total;
}

function _getStructureModuleStates(state, ship) {
  return STRUCTURE_MODULES.map(function (moduleDef) {
    var moduleUpgrades = SHIP_UPGRADES.filter(function (upgrade) {
      return _getStructureModuleId(upgrade) === moduleDef.id;
    });
    var installedUpgrades = moduleUpgrades.filter(function (upgrade) {
      return (ship.upgrades || []).includes(upgrade.id);
    });
    var nextUpgrade = moduleUpgrades.find(function (upgrade) {
      return !(ship.upgrades || []).includes(upgrade.id);
    }) || null;
    var atCap = false;

    if (nextUpgrade) {
      if (nextUpgrade.effect.cargo && ship.maxCargo + nextUpgrade.effect.cargo > ship.maxCargoCap) atCap = true;
      if (nextUpgrade.effect.maxFuel && ship.maxFuel + nextUpgrade.effect.maxFuel > ship.maxFuelCap) atCap = true;
      if (nextUpgrade.effect.hull && ship.maxHull + nextUpgrade.effect.hull > ship.maxHullCap) atCap = true;
      if (nextUpgrade.effect.fuelEff && ship.fuelEff * nextUpgrade.effect.fuelEff < ship.minFuelEff) atCap = true;
    }

    return {
      id: moduleDef.id,
      icon: moduleDef.icon,
      name: moduleDef.name,
      desc: moduleDef.desc,
      level: installedUpgrades.length,
      totalLevels: moduleUpgrades.length,
      installedLabel: installedUpgrades.length > 0
        ? installedUpgrades[installedUpgrades.length - 1].name
        : moduleDef.emptyLabel,
      currentEffectText: installedUpgrades.length > 0
        ? _formatStructureModuleEffect(moduleDef.id, installedUpgrades)
        : moduleDef.emptyLabel,
      nextUpgrade: nextUpgrade,
      nextEffectText: nextUpgrade ? _formatEffectText(nextUpgrade.effect) : '已达当前上限',
      canAfford: !!(nextUpgrade && state.credits >= nextUpgrade.cost),
      disabledReason: !nextUpgrade ? '已达当前上限' : (atCap ? '已达船体极限' : ''),
    };
  });
}

function _getComponentModuleGroups(state, ship, installedMods, availableMods, slotsLeft) {
  return Object.keys(MOD_CATEGORY_META).map(function (categoryId) {
    var meta = MOD_CATEGORY_META[categoryId];
    var installed = installedMods.filter(function (mod) { return mod.category === categoryId; });
    var readyMods = [];
    var lockedCount = 0;

    availableMods.forEach(function (mod) {
      if (mod.category !== categoryId) return;
      var prereqOk = !mod.requires || (ship.mods || []).includes(mod.requires);
      if (!prereqOk) {
        lockedCount += 1;
        return;
      }
      readyMods.push(mod);
    });

    return {
      id: categoryId,
      icon: meta.icon,
      name: meta.name,
      desc: meta.desc,
      installed: installed,
      readyMods: readyMods,
      lockedCount: lockedCount,
      slotsLeft: slotsLeft,
      credits: state.credits,
    };
  });
}

function _getRepairCountdownText(repairJob) {
  if (!repairJob || !repairJob.remainingDays) return '';
  return '维修中 · 剩余 ' + repairJob.remainingDays + ' 天';
}

function _describeSpecializationTrack(trackId, level) {
  if (trackId === 'trade') {
    return '买入 -' + level + '% · 卖出 +' + (level * 1.5).toFixed(1) + '% · 货舱 +' + (level * 4);
  }
  if (trackId === 'navigation') {
    return '燃耗 -' + (level * 5) + '% · 事件降权 -' + (level * 8) + '% · 走私风控下降';
  }
  return '扫描折扣 -' + (level * 12) + '% · 着陆折扣 -' + (level * 8) + '% · 勘探收益 +' + (level * 8) + '%';
}

function _getSpecializationMeta(trackId) {
  if (trackId === 'trade') return { icon: '💹', name: '贸易专精' };
  if (trackId === 'navigation') return { icon: '🛰️', name: '航行专精' };
  return { icon: '🧭', name: '探索专精' };
}

function _openCrewModal(state, shipIndex, onRecruitCrew, onAssignCrew, onUnassignCrew, onDismissCrew, onSwitchShip, onSetShipDoctrine, onActivateShipProtocol) {
  var modal = document.getElementById('crew-modal');
  if (!modal) return;

  _openInlinePortal('crew-modal', function() {
    hideBlockingSurface('crew-modal');
  });

  var ship = state.fleet[shipIndex];
  if (!ship) {
    if (_currentPortalCleanup) _currentPortalCleanup();
    return;
  }

  var titleEl = document.getElementById('crew-modal-title');
  var summaryEl = document.getElementById('crew-modal-summary');
  var assignedEl = document.getElementById('crew-assigned-list');
  var reserveEl = document.getElementById('crew-reserve-list');
  var marketEl = document.getElementById('crew-market-list');

  function renderCrewModal() {
    var currentShip = state.fleet[shipIndex];
    if (!currentShip) return;

    var isActive = shipIndex === (state.activeShipIndex || 0);
    var shipCrew = Crew.getShipCrew(state, currentShip);
    var reserveCrew = Crew.getReserveCrew(state);
    var marketState = Crew.getCrewMarket(state, state.currentSystem);
    var marketCrew = marketState.offers || [];
    var crewEffects = Fleet.getEffectiveShipStats(state, currentShip).crewEffects || {};
    var currentSystem = SYSTEMS.find(function (sys) { return sys.id === state.currentSystem; });
    var specialization = Fleet.getShipSpecializationSummary(state, currentShip);
    var doctrine = specialization.doctrine;
    var doctrineLevel = specialization.levels[doctrine.id] || 0;
    var doctrineCooldown = specialization.cooldowns[doctrine.id] || 0;

    titleEl.textContent = '👥 船员管理 · ' + currentShip.emoji + ' ' + currentShip.name;
    summaryEl.innerHTML =
      '<span>席位 ' + shipCrew.length + '/' + (currentShip.crewCapacity || 0) + '</span>' +
      '<span>当前港口：' + _escapeHtml(currentSystem ? currentSystem.name : state.currentSystem) + '</span>' +
      '<span>工资/天 ' + shipCrew.reduce(function (sum, crewMember) { return sum + (crewMember.wage || 0); }, 0) + '</span>' +
      '<span>货舱 +' + (crewEffects.cargo || 0) + '</span>' +
      '<span>维修 +' + (crewEffects.autoRepair || 0) + '</span>' +
      '<span>市场刷新：第 ' + marketState.refreshDay + ' 天 / 下次第 ' + marketState.nextRefreshDay + ' 天</span>' +
      '<span>人才倾向：' + _escapeHtml(marketState.themeLabel || '综合港') + '</span>' +
      '<span>当前协议：' + _escapeHtml(doctrine.shortName) + '</span>' +
      '<div class="crew-modal-command-panel">' +
        '<div class="crew-modal-command-head">' +
          '<strong>舰桥协议</strong>' +
          '<div class="crew-modal-command-actions">' +
            '<span class="crew-modal-command-state">' + (isActive ? '当前操控' : '远程管理') + '</span>' +
            (isActive ? '' : '<button class="btn-secondary crew-switch-ship-btn" type="button">设为当前操控</button>') +
          '</div>' +
        '</div>' +
        '<div class="ship-specialization-grid">' +
          ['trade', 'navigation', 'exploration'].map(function (trackId) {
            var meta = _getSpecializationMeta(trackId);
            var isDoctrine = specialization.doctrineId === trackId;
            var level = specialization.levels[trackId] || 0;
            var nextThreshold = specialization.nextThresholds[trackId];
            var xp = specialization.xp[trackId] || 0;
            var progress = Math.round((specialization.progress[trackId] || 0) * 100);
            var trackHtml = '';

            trackHtml += '<div class="ship-specialization-card' + (isDoctrine ? ' ship-specialization-card-active' : '') + '">';
            trackHtml += '<div class="ship-specialization-card-head"><strong>' + meta.icon + ' ' + meta.name + '</strong><span>Lv.' + level + '</span></div>';
            trackHtml += '<div class="ship-specialization-card-desc">' + _describeSpecializationTrack(trackId, level) + '</div>';
            if (nextThreshold != null) {
              trackHtml += '<div class="ship-specialization-progress"><div class="ship-specialization-progress-fill" style="width:' + progress + '%"></div></div>';
              trackHtml += '<div class="ship-specialization-progress-text">经验 ' + xp + ' / ' + nextThreshold + '</div>';
            } else {
              trackHtml += '<div class="ship-specialization-progress-text">已达当前版本专精上限</div>';
            }
            trackHtml += '<div class="ship-specialization-card-foot">';
            if (isDoctrine) {
              trackHtml += '<span class="ship-specialization-badge">当前协议</span>';
            } else {
              trackHtml += '<button class="ship-specialization-switch-btn" data-doctrine="' + trackId + '" type="button">设为当前协议</button>';
            }
            trackHtml += '</div>';
            trackHtml += '</div>';
            return trackHtml;
          }).join('') +
        '</div>' +
        '<div class="ship-protocol-panel">' +
          '<div class="ship-protocol-panel-head"><strong>' + doctrine.protocol.icon + ' ' + doctrine.protocol.name + '</strong><span>' + doctrine.name + '</span></div>' +
          '<div class="ship-protocol-panel-desc">' + doctrine.protocol.desc + '</div>' +
          '<div class="ship-protocol-panel-meta">当前专精 Lv.' + doctrineLevel + ' · 冷却 ' + doctrine.protocol.cooldownDays + ' 天</div>' +
          (specialization.activeProtocol
            ? '<div class="ship-protocol-status ship-protocol-status-active">运行中 · 剩余 ' + specialization.activeProtocol.remainingCharges + ' 次触发</div>'
            : (doctrineLevel <= 0
              ? '<div class="ship-protocol-status">当前协议达到 Lv.1 后解锁</div>'
              : (doctrineCooldown > 0
                ? '<div class="ship-protocol-status">冷却中 · 还需 ' + doctrineCooldown + ' 天</div>'
                : '<button class="ship-protocol-activate-btn crew-protocol-activate-btn" data-action="activate" type="button">启动协议</button>'))) +
        '</div>' +
      '</div>';

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

    modal.querySelectorAll('.ship-specialization-switch-btn').forEach(function (btn) {
      btn.onclick = function () {
        if (onSetShipDoctrine) onSetShipDoctrine(shipIndex, btn.dataset.doctrine);
        setTimeout(function () {
          renderCrewModal();
        }, 50);
      };
    });

    var protocolBtn = modal.querySelector('.crew-protocol-activate-btn');
    if (protocolBtn) {
      protocolBtn.onclick = function () {
        if (onActivateShipProtocol) onActivateShipProtocol(shipIndex);
        setTimeout(function () {
          renderCrewModal();
        }, 50);
      };
    }

    var switchBtn = modal.querySelector('.crew-switch-ship-btn');
    if (switchBtn) {
      switchBtn.onclick = function () {
        if (onSwitchShip) onSwitchShip(shipIndex);
        setTimeout(function () {
          renderCrewModal();
        }, 50);
      };
    }
  }

  renderCrewModal();
  document.getElementById('crew-modal-close').onclick = function () {
    if (_currentPortalCleanup) _currentPortalCleanup();
    if (globalThis.__linegameGameManager && typeof globalThis.__linegameGameManager.renderUI === 'function') {
      globalThis.__linegameGameManager.renderUI();
    }
  };
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

  html += '<section class="hangar-shop-hero">';
  html += '<div class="hangar-shop-kicker">SHIP ACQUISITION</div>';
  html += '<h2>船坞采购甲板</h2>';
  html += '<p>按机库席位、现金流和航线等级选择下一艘船。购买后可进入改装与人员配置流程。</p>';
  html += '<div class="shop-slot-hint">🎫 席位：' + fleetLen + '/' + slotCount +
          (hasAvailableSlot ? ' — 可购买新船' : ' — 席位已满，需先购买席位') + '</div>';
  html += '</section>';
  html += '<div class="fleet-section-title">🏪 船只商店</div>';
  html += '<div class="hangar-shop-grid">';

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
  html += '</div>';

  container.innerHTML = html;

  // 绑定购买事件
  container.querySelectorAll('.fleet-can-buy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      onBuyShip(btn.dataset.type);
    });
  });
}

export function openDispatchModal(state, shipIndex, onAssignRoute, onCancelRoute, preset) {
  _openDispatchModal(state, shipIndex, onAssignRoute, onCancelRoute, preset);
}

export function openModModal(state, shipIndex, onInstallMod, onUninstallMod, onUpgradeShip, onServiceShip, onSellShip, options) {
  _openModModal(state, shipIndex, onInstallMod, onUninstallMod, onUpgradeShip, onServiceShip, onSellShip, options);
}

export function getActiveModModalContext() {
  if (_activeInlineModalId !== 'mod-modal' || !_activeModModalContext) return null;
  return Object.assign({}, _activeModModalContext);
}

export function getActiveDispatchModalContext() {
  if (_activeInlineModalId !== 'dispatch-modal' || !_activeDispatchModalContext) return null;
  return Object.assign({}, _activeDispatchModalContext);
}

// ---------------------------------------------------------------------------
// 改装弹窗
// ---------------------------------------------------------------------------

function _openModModal(state, shipIndex, onInstallMod, onUninstallMod, onUpgradeShip, onServiceShip, onSellShip, options) {
  var modal = document.getElementById('mod-modal');
  if (!modal) return;
  var opts = options || {};
  var focusModId = opts.focusModId || '';
  _activeModModalContext = {
    shipIndex: shipIndex,
    focusModId: focusModId,
    recommendedModId: '',
  };

  _openInlinePortal('mod-modal', function() {
    hideBlockingSurface('mod-modal');
  });

  function _renderModModal() {
    var ship = state.fleet[shipIndex];
    if (!ship) {
      if (_currentPortalCleanup) _currentPortalCleanup();
      return;
    }

    var shipStats = Fleet.getEffectiveShipStats(state, ship);
    var maintenance = shipStats.maintenance || Fleet.getShipMaintenanceSummary(state, ship);
    var roleProfile = shipStats.roleProfile || Fleet.getShipRoleProfile(state, ship);
    var faults = shipStats.faults || Fleet.getShipFaultSummaries(ship);
    var modRecommendation = Fleet.getShipModRecommendation
      ? Fleet.getShipModRecommendation(state, shipIndex)
      : null;
    _activeModModalContext = {
      shipIndex: shipIndex,
      focusModId: focusModId,
      recommendedModId: modRecommendation ? modRecommendation.modId : '',
    };
    var repairQuote = Fleet.getShipRepairQuote(state, shipIndex);
    var repairJob = ship.repairJob && ship.repairJob.remainingDays > 0 ? ship.repairJob : null;
    var hullMissing = Math.max(0, (ship.maxHull || ship.hull || 0) - (ship.hull || 0));
    var isActive = shipIndex === (state.activeShipIndex || 0);
    var installedUpgrades = SHIP_UPGRADES.filter(function (upgrade) {
      return (ship.upgrades || []).includes(upgrade.id);
    });
    var structureModules = _getStructureModuleStates(state, ship);
    var installedMods = (ship.mods || []).map(function (modId) {
      return SHIP_MODS.find(function (mod) { return mod.id === modId; });
    }).filter(Boolean);
    var slotsLeft = (ship.modSlots || 1) - (ship.mods || []).length;
    var availableMods = SHIP_MODS.filter(function (mod) {
      return !(ship.mods || []).includes(mod.id);
    });
    var componentGroups = _getComponentModuleGroups(state, ship, installedMods, availableMods, slotsLeft);
    var sellQuote = _getShipSellQuote(ship);
    var sellDisabledReason = null;

    if (state.fleet.length <= 1) sellDisabledReason = '至少保留一艘船。';
    else if (ship.route) sellDisabledReason = '派遣中的飞船需先召回。';
    else if (isActive) sellDisabledReason = '当前操控中的飞船需先切换到其他船只。';

    document.getElementById('mod-modal-title').textContent =
      '🔧 ' + ship.emoji + ' ' + ship.name + ' — 模块改装 / 维修';

    var body = document.getElementById('mod-modal-body');
    var html = '';

    html += '<div class="mod-modal-overview">';
    html += '<span class="fleet-role-chip" title="' + _escapeHtml(roleProfile.summary || '') + '">🎯 ' + _escapeHtml(roleProfile.label || '综合用途') + '</span>';
    html += '<span class="fleet-maintenance-chip fleet-maintenance-' + maintenance.band + '">🧰 ' + _escapeHtml(maintenance.label) + ' ' + Math.round(maintenance.value) + '%</span>';
    html += '<span class="mod-modal-overview-stat">升级 ' + installedUpgrades.length + '</span>';
    html += '<span class="mod-modal-overview-stat">组件 ' + (ship.mods || []).length + '/' + (ship.modSlots || 1) + '</span>';
    html += '<span class="mod-modal-overview-stat">船体缺口 ' + hullMissing + '</span>';
    html += '<span class="mod-modal-overview-stat">日常养护 ' + maintenance.upkeepCost + '/天</span>';
    html += '<span class="mod-modal-overview-stat">磨损 ' + maintenance.dailyDecay.toFixed(1) + '/天</span>';
    html += '<span class="mod-modal-overview-stat' + (repairJob ? ' mod-modal-overview-stat--repair' : '') + '">' + _escapeHtml(repairJob ? _getRepairCountdownText(repairJob) : (ship.route ? '派遣中，需召回后维修' : '已停靠，可安排维修')) + '</span>';
    html += '</div>';

    if (modRecommendation) {
      var recommendationFocused = !!(focusModId && modRecommendation.modId === focusModId);
      html += '<div class="mod-modal-recommendation' + (recommendationFocused ? ' mod-modal-recommendation--focus' : '') + '"' +
              (recommendationFocused ? ' data-focus-mod="recommendation"' : '') + '>';
      html += '<div class="mod-modal-recommendation-copy">';
      html += '<div class="mod-modal-recommendation-title">🧩 推荐组件 · ' + modRecommendation.mod.emoji + ' ' + _escapeHtml(modRecommendation.mod.name) + '</div>';
      html += '<div class="mod-modal-recommendation-reason">' + _escapeHtml(modRecommendation.reason) + '</div>';
      if (modRecommendation.disabledReason) {
        html += '<div class="mod-modal-recommendation-note">当前限制：' + _escapeHtml(modRecommendation.disabledReason) + '</div>';
      }
      html += '</div>';
      html += '<button class="mod-modal-buy-btn mod-modal-recommendation-btn"' +
              (modRecommendation.canInstall ? '' : ' disabled') +
              ' data-mod="' + modRecommendation.modId + '">' +
              (modRecommendation.canInstall ? ('安装 · ' + modRecommendation.mod.cost.toLocaleString()) : '暂不可装') +
              '</button>';
      html += '</div>';
    }

    html += '<div class="mod-modal-section-title">结构模块</div>';
    html += '<div class="mod-modal-structure-grid">';
    structureModules.forEach(function (moduleState) {
      var nextUpgrade = moduleState.nextUpgrade;
      var disabled = !!moduleState.disabledReason;
      var canBuy = !!(nextUpgrade && !disabled && moduleState.canAfford);
      var cardClass = 'mod-modal-structure-card';
      if (!nextUpgrade) cardClass += ' mod-modal-structure-card--done';
      else if (disabled) cardClass += ' mod-modal-structure-card--locked';
      else if (!moduleState.canAfford) cardClass += ' mod-modal-structure-card--poor';

      html += '<div class="' + cardClass + '">';
      html += '<div class="mod-modal-structure-head">';
      html += '<div>'; 
      html += '<div class="mod-modal-structure-name">' + moduleState.icon + ' ' + _escapeHtml(moduleState.name) + '</div>';
      html += '<div class="mod-modal-structure-desc">' + _escapeHtml(moduleState.desc) + '</div>';
      html += '</div>';
      html += '<span class="mod-modal-structure-level">Lv.' + moduleState.level + '/' + moduleState.totalLevels + '</span>';
      html += '</div>';
      html += '<div class="mod-modal-structure-current">';
      html += '<span class="mod-modal-structure-current-label">当前状态</span>';
      html += '<strong>' + _escapeHtml(moduleState.currentEffectText) + '</strong>';
      html += '<span>' + _escapeHtml(moduleState.installedLabel) + '</span>';
      html += '</div>';
      if (nextUpgrade) {
        html += '<div class="mod-modal-structure-next">';
        html += '<div class="mod-modal-structure-next-label">可升级项</div>';
        html += '<div class="mod-modal-structure-next-name">' + _escapeHtml(nextUpgrade.name) + '</div>';
        html += '<div class="mod-modal-structure-next-desc">' + _escapeHtml(moduleState.nextEffectText || nextUpgrade.desc) + '</div>';
        if (disabled) {
          html += '<div class="mod-modal-structure-note">🚫 ' + _escapeHtml(moduleState.disabledReason) + '</div>';
        }
        html += '<button class="upg-modal-buy-btn mod-modal-structure-btn' + (moduleState.canAfford ? '' : ' upg-modal-no-afford') + '"' +
                (canBuy ? '' : ' disabled') +
                ' data-upgrade="' + nextUpgrade.id + '">' +
                (disabled ? '已达极限' : (moduleState.canAfford ? '升级 · ' + nextUpgrade.cost.toLocaleString() : '积分不足 · ' + nextUpgrade.cost.toLocaleString())) +
                '</button>';
        html += '</div>';
      } else {
        html += '<div class="mod-modal-structure-next mod-modal-structure-next--done">当前模块已升到上限</div>';
      }
      html += '</div>';
    });
    html += '</div>';

    html += '<div class="mod-modal-section-title">功能组件</div>';
    html += '<div class="mod-modal-module-grid">';
    componentGroups.forEach(function (group) {
      html += '<div class="mod-modal-module-card">';
      html += '<div class="mod-modal-module-head">';
      html += '<div>';
      html += '<div class="mod-modal-module-name">' + group.icon + ' ' + _escapeHtml(group.name) + '</div>';
      html += '<div class="mod-modal-module-desc">' + _escapeHtml(group.desc) + '</div>';
      html += '</div>';
      html += '<span class="mod-modal-module-meta">已装 ' + group.installed.length + '</span>';
      html += '</div>';

      if (group.installed.length > 0) {
        html += '<div class="mod-modal-subtitle">已装配</div>';
        html += '<div class="mod-modal-list">';
        group.installed.forEach(function (mod) {
          var installedFocused = !!(focusModId && mod.id === focusModId);
          html += '<div class="mod-modal-item mod-modal-installed-item' + (installedFocused ? ' mod-modal-item--focus' : '') + '"' +
                  ' data-mod-id="' + _escapeHtml(mod.id) + '"' +
                  (installedFocused ? ' data-focus-mod="item"' : '') + '>';
          html += '<div class="mod-modal-item-info">';
          html += '<div class="mod-modal-item-name">' + mod.emoji + ' ' + _escapeHtml(mod.name) + '</div>';
          html += '<div class="mod-modal-item-desc">' + _escapeHtml(mod.desc) + '</div>';
          html += '</div>';
          html += '<button class="mod-modal-uninstall-btn" data-mod="' + mod.id + '">🗑️ 拆卸</button>';
          html += '</div>';
        });
        html += '</div>';
      }

      if (group.readyMods.length > 0) {
        html += '<div class="mod-modal-subtitle">可安装' + (group.slotsLeft <= 0 ? '（槽位已满）' : '') + '</div>';
        html += '<div class="mod-modal-list">';
        group.readyMods.forEach(function (mod) {
          var canAfford = group.credits >= mod.cost;
          var disabled = group.slotsLeft <= 0 || !canAfford;
          var cls = 'mod-modal-item';
          var itemFocused = !!(focusModId && mod.id === focusModId);
          if (group.slotsLeft <= 0) cls += ' mod-modal-full';
          else if (!canAfford) cls += ' mod-modal-poor';
          if (itemFocused) cls += ' mod-modal-item--focus';

          html += '<div class="' + cls + '" data-mod-id="' + _escapeHtml(mod.id) + '"' +
                  (itemFocused ? ' data-focus-mod="item"' : '') + '>';
          html += '<div class="mod-modal-item-info">';
          html += '<div class="mod-modal-item-name">' + mod.emoji + ' ' + _escapeHtml(mod.name) + '</div>';
          html += '<div class="mod-modal-item-desc">' + _escapeHtml(mod.desc) + '</div>';
          html += '</div>';
          html += '<button class="mod-modal-buy-btn' + (canAfford ? '' : ' mod-modal-no-afford') + '"' +
                  (disabled ? ' disabled' : '') +
                  ' data-mod="' + mod.id + '">' +
                  (group.slotsLeft <= 0 ? '槽位已满' : (canAfford ? '安装 · ' + mod.cost.toLocaleString() : '积分不足')) +
                  '</button>';
          html += '</div>';
        });
        html += '</div>';
      } else if (group.installed.length === 0) {
        html += '<div class="mod-modal-module-empty">当前没有可立即安装的组件。</div>';
      }

      if (group.lockedCount > 0) {
        html += '<div class="mod-modal-module-note">后续解锁 ' + group.lockedCount + ' 项，满足前置后再显示详细内容。</div>';
      }
      html += '</div>';
    });
    html += '</div>';

    html += '<div class="mod-modal-section-title">维修船坞</div>';
    html += '<div class="ship-repair-card' + (repairJob ? ' ship-repair-card--active' : '') + '">';
    html += '<div class="ship-repair-card-head">';
    html += '<div>';
    html += '<div class="ship-repair-card-title">🔧 标准维修</div>';
    html += '<div class="ship-repair-card-desc">' + _escapeHtml(repairJob
      ? '已扣款进入维修队列，完成时恢复维护度、修复船体并清除故障。'
      : (repairQuote ? repairQuote.desc : '当前无法生成维修报价。')) + '</div>';
    html += '</div>';
    html += '<span class="ship-repair-card-badge">' + _escapeHtml(repairJob ? ('剩余 ' + repairJob.remainingDays + ' 天') : (repairQuote ? (repairQuote.cost.toLocaleString() + ' 积分') : '')) + '</span>';
    html += '</div>';

    if (repairJob) {
      var repairProgress = repairJob.totalDays > 0
        ? Math.max(0, Math.min(100, Math.round(((repairJob.totalDays - repairJob.remainingDays) / repairJob.totalDays) * 100)))
        : 0;
      html += '<div class="ship-repair-progress"><div class="ship-repair-progress-fill" style="width:' + repairProgress + '%"></div></div>';
      html += '<div class="ship-repair-meta">';
      html += '<span>总耗时 ' + repairJob.totalDays + ' 天</span>';
      html += '<span>已支付 ' + repairJob.cost.toLocaleString() + '</span>';
      html += '<span>船体缺口 ' + hullMissing + '</span>';
      html += '<span>故障 ' + faults.length + '</span>';
      html += '</div>';
      html += '<div class="ship-repair-note">维修完成前该船无法派遣，当前操控船也无法出航。</div>';
    } else if (repairQuote) {
      html += '<div class="ship-repair-meta">';
      html += '<span>耗时 ' + repairQuote.durationDays + ' 天</span>';
      html += '<span>船体缺口 ' + hullMissing + '</span>';
      html += '<span>故障 ' + faults.length + '</span>';
      html += '<span>日常养护 ' + maintenance.upkeepCost + '/天</span>';
      html += '</div>';
      html += '<div class="ship-repair-effect">' + _escapeHtml(repairQuote.effectSummary) + '</div>';
      if (repairQuote.disabledReason) {
        html += '<div class="ship-repair-note ship-repair-note--warning">' + _escapeHtml(repairQuote.disabledReason) + '</div>';
      }
      html += '<button class="btn-primary ship-repair-start-btn" type="button"' + (repairQuote.disabledReason ? ' disabled' : '') + '>开始维修</button>';
    }

    if (faults.length > 0) {
      html += '<div class="ship-repair-faults">';
      faults.forEach(function (fault) {
        html += '<span class="fleet-fault-chip" title="' + _escapeHtml(fault.desc) + '">' + fault.icon + ' ' + _escapeHtml(fault.label) + '</span>';
      });
      html += '</div>';
    }
    html += '</div>';

    if (sellQuote.maxPrice > 0) {
      html += '<div class="mod-modal-section-title">资产处置</div>';
      html += '<div class="mod-modal-disposal' + (sellDisabledReason ? ' mod-modal-disposal--disabled' : '') + '">';
      html += '<div class="mod-modal-item-info">';
      html += '<div class="mod-modal-item-name">💸 回收卖出</div>';
      html += '<div class="mod-modal-item-desc">预计回收价 ' + sellQuote.minPrice.toLocaleString() + ' ~ ' + sellQuote.maxPrice.toLocaleString() + ' 积分，货舱中的货物会一并清空。</div>';
      if (sellDisabledReason) {
        html += '<div class="mod-modal-item-prereq">⚠️ ' + _escapeHtml(sellDisabledReason) + '</div>';
      }
      html += '</div>';
      html += '<button class="fleet-sell-btn mod-modal-sell-btn" type="button"' + (sellDisabledReason ? ' disabled' : '') + '>卖出飞船</button>';
      html += '</div>';
    }

    body.innerHTML = html;
    _focusGuidedMod(body, focusModId);

    body.querySelectorAll('.upg-modal-buy-btn:not([disabled])').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (onUpgradeShip) onUpgradeShip(shipIndex, btn.dataset.upgrade);
        setTimeout(function () { _renderModModal(); }, 50);
      });
    });

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

    body.querySelectorAll('.ship-repair-start-btn:not([disabled])').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (onServiceShip) onServiceShip(shipIndex);
        setTimeout(function () { _renderModModal(); }, 50);
      });
    });

    var sellBtn = body.querySelector('.mod-modal-sell-btn:not([disabled])');
    if (sellBtn) {
      sellBtn.addEventListener('click', function () {
        var currentShip = state.fleet[shipIndex];
        if (!currentShip) return;
        if (!confirm('确定卖出「' + currentShip.emoji + ' ' + currentShip.name + '」？\n回收价约 ' + sellQuote.minPrice.toLocaleString() + ' ~ ' + sellQuote.maxPrice.toLocaleString() + ' 积分\n⚠️ 货舱中的货物将一并清空！')) {
          return;
        }
        if (onSellShip) onSellShip(shipIndex);
        setTimeout(function () {
          if (state.fleet.length <= shipIndex || state.fleet[shipIndex] !== currentShip) {
            if (_currentPortalCleanup) _currentPortalCleanup();
            if (globalThis.__linegameGameManager && typeof globalThis.__linegameGameManager.renderUI === 'function') {
              globalThis.__linegameGameManager.renderUI();
            }
            return;
          }
          _renderModModal();
        }, 50);
      });
    }
  }

  _renderModModal();

  // 关闭
  document.getElementById('mod-modal-close').onclick = function () {
    if (_currentPortalCleanup) _currentPortalCleanup();
    if (globalThis.__linegameGameManager && typeof globalThis.__linegameGameManager.renderUI === 'function') {
      globalThis.__linegameGameManager.renderUI();
    }
  };
}

// ---------------------------------------------------------------------------
// 派遣配置弹窗
// ---------------------------------------------------------------------------

function _openDispatchModal(state, shipIndex, onAssignRoute, onCancelRoute, preset) {
  const modal = document.getElementById('dispatch-modal');
  if (!modal) return;

  _openInlinePortal('dispatch-modal', function() {
    hideBlockingSurface('dispatch-modal');
  });

  const ship = state.fleet[shipIndex];
  const effectiveShipStats = Fleet.getEffectiveShipStats(state, ship);
  const dispatchPreset = preset || null;
  const presetRecommendation = dispatchPreset && dispatchPreset.recommendation ? dispatchPreset.recommendation : null;
  _activeDispatchModalContext = {
    shipIndex: shipIndex,
    buySystemId: (presetRecommendation && presetRecommendation.buySystemId) || (dispatchPreset && dispatchPreset.buySystemId) || '',
    sellSystemId: (presetRecommendation && presetRecommendation.sellSystemId) || (dispatchPreset && dispatchPreset.sellSystemId) || '',
    goodId: (presetRecommendation && presetRecommendation.goodId) || (dispatchPreset && dispatchPreset.goodId) || '',
  };
  const isActive = shipIndex === (state.activeShipIndex || 0);
  const routeLevel = Fleet.getDispatchRouteLevel(state);
  const shipLocationSystem = SYSTEMS.find(function (sys) { return sys.id === ship.location; });
  const currentLocationSystemId = isActive ? state.currentSystem : (ship.location || state.currentSystem);
  const dispatchGalaxyId = isActive
    ? (state.currentGalaxy || 'milky_way')
    : ((shipLocationSystem && shipLocationSystem.galaxyId) || state.currentGalaxy || 'milky_way');

  document.getElementById('dispatch-title').textContent =
    '📡 ' + (isActive ? '一键自动派遣' : '一键派遣') + '「' + ship.emoji + ' ' + ship.name + '」';

  // 填充星系选择
  const buySelect  = document.getElementById('dispatch-buy-system');
  const sellSelect = document.getElementById('dispatch-sell-system');
  const goodSelect = document.getElementById('dispatch-good');
  const maxBuyInput = document.getElementById('dispatch-max-buy-price');
  const minSellInput = document.getElementById('dispatch-min-sell-price');
  const minProfitInput = document.getElementById('dispatch-min-profit-rate');
  const riskModeSelect = document.getElementById('dispatch-risk-mode');
  const marketModeSelect = document.getElementById('dispatch-market-mode');
  const estimateEl = document.getElementById('dispatch-estimate');
  const confirmBtn = document.getElementById('dispatch-confirm');
  const cancelBtn = document.getElementById('dispatch-cancel');
  const primaryHintEl = document.getElementById('dispatch-primary-hint');
  const advancedPanel = document.getElementById('dispatch-advanced-panel');
  var existingPolicy = dispatchPreset && dispatchPreset.tradePolicy
    ? dispatchPreset.tradePolicy
    : (presetRecommendation && presetRecommendation.recommendedTradePolicy
        ? presetRecommendation.recommendedTradePolicy
        : (ship.route && ship.route.tradePolicy ? ship.route.tradePolicy : {}));
  var galaxyNames = Object.create(null);
  GALAXIES.forEach(function (galaxy) {
    galaxyNames[galaxy.id] = galaxy.name;
  });

  function _getGalaxyName(galaxyId) {
    return galaxyNames[galaxyId] || galaxyId;
  }

  function _hasCustomTradePolicy(policy) {
    if (!policy || typeof policy !== 'object') return false;
    return Number.isFinite(policy.maxBuyPrice)
      || Number.isFinite(policy.minSellPrice)
      || Number.isFinite(policy.minProfitRate)
      || (policy.riskMode && policy.riskMode !== 'balanced')
      || (policy.marketMode && policy.marketMode !== 'open');
  }

  function _formatRiskModeLabel(riskMode) {
    if (riskMode === 'safe') return '保守';
    if (riskMode === 'aggressive') return '激进';
    return '平衡';
  }

  function _formatRouteRiskLabel(level) {
    if (level === 'high') return '高';
    if (level === 'medium') return '中';
    return '低';
  }

  function _getCurrentShip() {
    return state.fleet[shipIndex] || ship;
  }

  function _isRecommendationSelected(recommendation) {
    return !!recommendation
      && buySelect.value === recommendation.buySystemId
      && sellSelect.value === recommendation.sellSystemId
      && goodSelect.value === recommendation.goodId;
  }

  function _updatePrimaryHint(estimate, recommendation) {
    var matchesRecommendation = estimate && _isRecommendationSelected(recommendation);
    var hasCustomPolicy = _hasCustomTradePolicy(_readTradePolicy());
    var currentShip = _getCurrentShip();
    var hasExistingRoute = !!(currentShip && currentShip.route);

    if (!confirmBtn || !primaryHintEl) return;

    confirmBtn.textContent = '一键派遣';
    confirmBtn.disabled = !estimate;

    if (!estimate) {
      primaryHintEl.className = 'dispatch-primary-hint dispatch-primary-hint--warning';
      primaryHintEl.textContent = recommendation
        ? '当前推荐路线暂不可直接使用，可展开高级策略调整后再试。'
        : (hasExistingRoute
            ? '当前路线缺少可用估算；可关闭窗口，或调整配置后重新派遣。'
            : '当前暂无可直接派遣的推荐路线，可展开高级策略调整后再试。');
      return;
    }

    if (matchesRecommendation) {
      primaryHintEl.className = 'dispatch-primary-hint dispatch-primary-hint--ready';
      primaryHintEl.textContent = hasExistingRoute
        ? '已载入当前最优路线，点击“一键派遣”可直接改派。'
        : '已载入当前最优路线，点击“一键派遣”即可开始自动贸易。';
      return;
    }

    primaryHintEl.className = 'dispatch-primary-hint';
    primaryHintEl.textContent = hasCustomPolicy
      ? '当前为手动微调后的策略，点击“一键派遣”将按当前配置执行。'
      : (hasExistingRoute
          ? '当前显示的是已生效路线；修改后点击“一键派遣”可直接改派。'
          : '当前显示的是手动路线；点击“一键派遣”将按当前配置执行。');
  }

  function _formatSystemOptionLabel(system) {
    return system.name + ' [' + system.typeLabel + ']';
  }

  function _buildGroupedSystemOptions(systems) {
    var groupedSystems = Object.create(null);
    var galaxyOrder = [];

    systems.forEach(function (system) {
      var galaxyId = system.galaxyId || 'unknown';
      if (!groupedSystems[galaxyId]) {
        groupedSystems[galaxyId] = [];
        galaxyOrder.push(galaxyId);
      }
      groupedSystems[galaxyId].push(system);
    });

    return galaxyOrder.map(function (galaxyId) {
      var groupLabel = _getGalaxyName(galaxyId);
      if (galaxyId === dispatchGalaxyId) groupLabel += ' · 当前星系';
      return '<optgroup label="' + _escapeHtml(groupLabel) + '">' + groupedSystems[galaxyId].map(function (system) {
        return '<option value="' + system.id + '">' + _escapeHtml(_formatSystemOptionLabel(system)) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }

  var playerLevel = state.playerLevel || 1;
  var dispatchAccessLevel = isActive ? playerLevel : routeLevel;
  var recommendationPlanets = [];
  var recommendationPlanetLookup = Object.create(null);
  getAccessibleGalaxies(playerLevel, state.researchedTechs || []).forEach(function (galaxy) {
    getSystemsByGalaxy(galaxy.id).forEach(function (sys) {
      var minLvl = sys.minLevel || 1;
      if (dispatchAccessLevel < minLvl || recommendationPlanetLookup[sys.id]) return;
      recommendationPlanets.push(sys);
      recommendationPlanetLookup[sys.id] = true;
    });
  });

  // 默认仍展示当前星系航线，打开弹窗时会主动搜索全部已开放星系的最优路线
  var allGalaxyPlanets = getSystemsByGalaxy(dispatchGalaxyId).filter(function (sys) {
    var minLvl = sys.minLevel || 1;
    return dispatchAccessLevel >= minLvl;
  });
  var planetLookup = Object.create(null);
  allGalaxyPlanets.forEach(function (system) {
    planetLookup[system.id] = true;
  });

  function _appendPresetSystem(systemId) {
    var system = SYSTEMS.find(function (entry) { return entry.id === systemId; });
    if (!system || planetLookup[system.id]) return;
    allGalaxyPlanets.push(system);
    planetLookup[system.id] = true;
  }

  if (dispatchPreset) {
    _appendPresetSystem(dispatchPreset.buySystemId);
    _appendPresetSystem(dispatchPreset.sellSystemId);
  }
  if (presetRecommendation) {
    _appendPresetSystem(presetRecommendation.buySystemId);
    _appendPresetSystem(presetRecommendation.sellSystemId);
  }

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
      var emptyText = marketMode === 'black' ? '当前候选中无可用黑市路线' : '需要更多航线（购买席位解锁）';
      buySelect.innerHTML = '<option value="">' + emptyText + '</option>';
      sellSelect.innerHTML = '<option value="">' + emptyText + '</option>';
    } else {
      buySelect.innerHTML = _buildGroupedSystemOptions(buyPlanets);
      sellSelect.innerHTML = _buildGroupedSystemOptions(sellPlanets);
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

    if (dispatchPreset) {
      if (dispatchPreset.buySystemId && buySelect.querySelector('option[value="' + dispatchPreset.buySystemId + '"]')) buySelect.value = dispatchPreset.buySystemId;
      if (dispatchPreset.sellSystemId && sellSelect.querySelector('option[value="' + dispatchPreset.sellSystemId + '"]')) sellSelect.value = dispatchPreset.sellSystemId;
      if (dispatchPreset.goodId && goodSelect.querySelector('option[value="' + dispatchPreset.goodId + '"]')) goodSelect.value = dispatchPreset.goodId;
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
    var dispatchProfile = effectiveShipStats.dispatchProfile || null;
    var inspectionRisk = AutoTrade.estimateDispatchInspectionRisk(state, good, maxQty, sellId, tradePolicy.marketMode, {
      checkChanceMultiplier: dispatchProfile && dispatchProfile.inspectionRiskMultiplier,
    });

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
      dispatchProfile: dispatchProfile,
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
      systemIds: recommendationPlanets.map(function (sys) { return sys.id; }),
      allowCrossGalaxy: true,
      dispatchProfile: effectiveShipStats.dispatchProfile || null,
    }, _readTradePolicy());
  }

  function _applyRecommendationSelection(recommendation) {
    if (!recommendation) return;

    if (!planetLookup[recommendation.buySystemId] || !planetLookup[recommendation.sellSystemId]) {
      _appendPresetSystem(recommendation.buySystemId);
      _appendPresetSystem(recommendation.sellSystemId);
      _buildMarketOptions();
    }

    buySelect.value = recommendation.buySystemId;
    sellSelect.value = recommendation.sellSystemId;
    goodSelect.value = recommendation.goodId;
  }

  function _renderEstimate(estimate, recommendation, warnings) {
    var riskAssessment = estimate.routeRisk;
    var riskSummary = _buildRiskSummary(estimate);
    var dispatchProfile = estimate.dispatchProfile || (recommendation && recommendation.dispatchProfile) || effectiveShipStats.dispatchProfile || {};
    var marketLabel = estimate.tradePolicy.marketMode === 'black' ? '黑市' : '公开';
    var riskModeLabel = _formatRiskModeLabel(estimate.tradePolicy.riskMode);
    var warningHtml = warnings.length > 0
      ? '<div class="dispatch-estimate-note dispatch-estimate-note--warning">策略将等待：' + _escapeHtml(warnings.join('、')) + '</div>'
      : '';
    var lossHtml = estimate.profit <= 0
      ? '<div class="dispatch-estimate-note dispatch-estimate-note--danger">亏损路线</div>'
      : '';
    var recommendationHtml = recommendation
      ? '<div class="dispatch-estimate-head">推荐：' + _escapeHtml(recommendation.buySystemName) + ' → ' + _escapeHtml(recommendation.sellSystemName) + '（' + _escapeHtml(recommendation.goodName) + '）</div>'
      : '';
    var strategyHtml = dispatchProfile.strategyLabel
      ? '<div class="dispatch-estimate-note">' + _escapeHtml((dispatchProfile.roleLabel || '标准派遣') + ' · ' + dispatchProfile.strategyLabel + '：' + (recommendation && recommendation.strategySummary ? recommendation.strategySummary.replace(/^.*：/, '') : (dispatchProfile.strategyNote || '按当前利润与风险偏好筛选路线。'))) + '</div>'
      : '';
    var surveyIntelHtml = recommendation && recommendation.surveyIntelSummary
      ? '<div class="dispatch-estimate-note">' + _escapeHtml(recommendation.surveyIntelSummary) + '</div>'
      : '';
    var pressureHtml = dispatchProfile.faultPressure > 0
      ? '<div class="dispatch-estimate-note dispatch-estimate-note--warning">船况压力 ' + _escapeHtml(String(dispatchProfile.faultPressure)) + '，系统会下调高风险与高执法路线优先级。</div>'
      : '';

    estimateEl.innerHTML =
      recommendationHtml +
      strategyHtml +
      surveyIntelHtml +
      '<div class="dispatch-estimate-main">' +
        '<span class="dispatch-estimate-highlight">' + marketLabel + '买' + estimate.maxQty + '单位</span>' +
        '<span>单次利润 ≈ ' + Math.floor(estimate.profit) + ' 积分</span>' +
        '<span>利润率 ' + Math.round(estimate.profitRate * 100) + '%</span>' +
        '<span>航程燃料 ' + estimate.fuelCost + ' 单位</span>' +
        '<span>路线风险 ' + _escapeHtml(_formatRouteRiskLabel(riskAssessment.riskLevel)) + '</span>' +
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
        pressureHtml +
      warningHtml;
  }

  function _applySuggestedRoute() {
    var recommendation = _getSuggestedRecommendation();

    if (!recommendation) {
      estimateEl.textContent = '未找到符合当前策略的最优派遣路线。可展开高级策略调整后再试。';
      _updatePrimaryHint(null, null);
      return null;
    }

    _applyRecommendationSelection(recommendation);
    _updateEstimate(recommendation);
    return recommendation;
  }

  // 预估利润
  function _updateEstimate(recommendation) {
    var estimate = _getEstimateData();
    var suggestedRecommendation = recommendation || _getSuggestedRecommendation();
    if (!estimate) {
      estimateEl.textContent = recommendation
        ? '当前推荐路线暂不可直接派遣，可调整策略后再试。'
        : '当前配置无法组成可执行的派遣路线。';
      _updatePrimaryHint(null, suggestedRecommendation);
      return;
    }
    var warnings = [];
    var riskAssessment = estimate.routeRisk;

    if (Number.isFinite(estimate.tradePolicy.maxBuyPrice) && estimate.buyPrice > estimate.tradePolicy.maxBuyPrice) warnings.push('买入价高于上限');
    if (Number.isFinite(estimate.tradePolicy.minSellPrice) && estimate.sellPrice < estimate.tradePolicy.minSellPrice) warnings.push('卖出价低于下限');
    if (Number.isFinite(estimate.tradePolicy.minProfitRate) && estimate.profitRate < estimate.tradePolicy.minProfitRate) warnings.push('利润率低于阈值');
    if (estimate.tradePolicy.riskMode === 'safe' && riskAssessment.riskLevel !== 'low') warnings.push('风险偏好将规避此路线');
    if (estimate.tradePolicy.marketMode === 'black' && !Faction.canAccessBlackMarket(state, estimate.buyId)) warnings.push('黑市买入权限不足');

    _renderEstimate(estimate, recommendation, warnings);
    _updatePrimaryHint(estimate, suggestedRecommendation);
  }

  _buildMarketOptions();
  if (advancedPanel) advancedPanel.open = _hasCustomTradePolicy(existingPolicy);
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

  var hasPresetRoute = !!(dispatchPreset && dispatchPreset.buySystemId && dispatchPreset.sellSystemId && dispatchPreset.goodId);
  var hasExistingRoute = !!ship.route;
  var initialRecommendation = presetRecommendation || null;

  if (hasPresetRoute && !initialRecommendation) {
    initialRecommendation = {
      buySystemId: dispatchPreset.buySystemId,
      sellSystemId: dispatchPreset.sellSystemId,
      goodId: dispatchPreset.goodId,
      buySystemName: (SYSTEMS.find(function (sys) { return sys.id === dispatchPreset.buySystemId; }) || {}).name || dispatchPreset.buySystemId,
      sellSystemName: (SYSTEMS.find(function (sys) { return sys.id === dispatchPreset.sellSystemId; }) || {}).name || dispatchPreset.sellSystemId,
      goodName: (GOODS.find(function (good) { return good.id === dispatchPreset.goodId; }) || {}).name || dispatchPreset.goodId,
      recommendedTradePolicy: dispatchPreset.tradePolicy || _readTradePolicy(),
    };
  }
  if (!initialRecommendation && !hasExistingRoute) {
    initialRecommendation = _applySuggestedRoute();
  }

  if (initialRecommendation) {
    _applyRecommendationSelection(initialRecommendation);
    _updateEstimate(initialRecommendation);
  } else {
    _updateEstimate(presetRecommendation);
  }

  // 确认
  confirmBtn.onclick = function () {
    onAssignRoute(shipIndex, buySelect.value, sellSelect.value, goodSelect.value, _readTradePolicy());
    if (_currentPortalCleanup) _currentPortalCleanup();
    if (globalThis.__linegameGameManager && typeof globalThis.__linegameGameManager.renderUI === 'function') {
      globalThis.__linegameGameManager.renderUI();
    }
  };

  cancelBtn.onclick = function () {
    if (_currentPortalCleanup) _currentPortalCleanup();
    if (globalThis.__linegameGameManager && typeof globalThis.__linegameGameManager.renderUI === 'function') {
      globalThis.__linegameGameManager.renderUI();
    }
  };
}
