// js/ui/FleetHangarPresenter.js — 机库主工作区只读投影、HTML 与 UI intent

import { SHIP_TYPES, FLEET_SLOTS, SHIP_MODS, FLEET_BONUSES } from '../data/ships.js';
import { SYSTEMS } from '../data/systems.js';
import { GOODS } from '../data/goods.js';
import { getCompanyLevelValue, getFleetSlotCompanyRequirement } from '../data/companyAccess.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Crew from '../systems/fleet/CrewSystem.js';

export const FLEET_HANGAR_INTENT = Object.freeze({
  INSPECT_SHIP: 'hangar.ship.inspect',
  BUY_SLOT: 'hangar.slot.buy',
  SWITCH_SHIP: 'hangar.ship.switch',
  OPEN_MODS: 'hangar.mods.open',
  OPEN_CREW: 'hangar.crew.open',
  OPEN_DISPATCH: 'hangar.dispatch.open',
  CANCEL_ROUTE: 'hangar.route.cancel',
});

var INTENT_VALUES = Object.freeze(Object.keys(FLEET_HANGAR_INTENT).map(function (key) {
  return FLEET_HANGAR_INTENT[key];
}));

function _escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getFleetCargoUsed(cargo) {
  return Object.values(cargo || {}).reduce(function (sum, qty) { return sum + qty; }, 0);
}

function _formatCrewEffectParts(effect) {
  var profile = effect || {};
  var parts = [];
  if (profile.cargo) parts.push('货舱 +' + profile.cargo);
  if (profile.autoRepair) parts.push('自动修复 +' + profile.autoRepair);
  if (profile.buyDiscount) parts.push('买入 -' + Math.round(profile.buyDiscount * 100) + '%');
  if (profile.sellBonus) parts.push('卖出 +' + Math.round(profile.sellBonus * 100) + '%');
  if (profile.fuelEffMultiplier && profile.fuelEffMultiplier < 1) {
    parts.push('航耗 -' + Math.round((1 - profile.fuelEffMultiplier) * 100) + '%');
  }
  return parts;
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

function _buildShipSnapshots(state, fleet) {
  return (fleet || []).map(function (ship, index) {
    var stats = Fleet.getEffectiveShipStats(state, ship);
    var maintenance = stats.maintenance || Fleet.getShipMaintenanceSummary(state, ship);
    var faults = stats.faults || Fleet.getShipFaultSummaries(ship);
    var roleProfile = stats.roleProfile || Fleet.getShipRoleProfile(state, ship);
    var repairJob = ship.repairJob && ship.repairJob.remainingDays > 0 ? ship.repairJob : null;
    var hull = Number.isFinite(ship.hull) ? ship.hull : (ship.maxHull || 0);
    var maxHull = Number.isFinite(ship.maxHull) ? ship.maxHull : hull;
    var fuel = Number.isFinite(ship.fuel) ? ship.fuel : 0;
    var maxFuel = Math.max(1, Number.isFinite(ship.maxFuel) ? ship.maxFuel : 1);
    return {
      ship: ship,
      index: index,
      stats: stats,
      maintenance: maintenance,
      faults: faults,
      roleProfile: roleProfile,
      repairJob: repairJob,
      cargoUsed: getFleetCargoUsed(ship.cargo),
      hullMissing: Math.max(0, maxHull - hull),
      fuelPct: Math.max(0, Math.min(100, Math.round((fuel / maxFuel) * 100))),
      shipCrew: Crew.getShipCrew(state, ship),
      skills: Fleet.getShipSkills(ship),
      shipMods: ship.mods || [],
      modRecommendation: Fleet.getShipModRecommendation
        ? Fleet.getShipModRecommendation(state, index)
        : null,
      cargoEntries: Object.entries(ship.cargo || {}),
    };
  });
}

function _isRiskSnapshot(snapshot) {
  if (!snapshot) return false;
  return !!snapshot.repairJob
    || snapshot.faults.length > 0
    || snapshot.hullMissing > 0
    || snapshot.maintenance.value < 75;
}

function _formatRouteSummary(state, snapshot) {
  if (!snapshot || !snapshot.ship || !snapshot.ship.route) return '';
  var routeDisplay = Fleet.getRouteDisplayInfo(state, snapshot.ship, snapshot.index);
  var startSys = SYSTEMS.find(function (system) { return system.id === (routeDisplay ? routeDisplay.startSystemId : null); });
  var targetSys = SYSTEMS.find(function (system) { return system.id === (routeDisplay ? routeDisplay.endSystemId : null); });
  var good = GOODS.find(function (item) { return item.id === snapshot.ship.route.goodId; });
  var status = routeDisplay ? routeDisplay.statusLabel : snapshot.ship.route.status;
  return (startSys ? startSys.name : '?') + ' → ' + (targetSys ? targetSys.name : '?') +
    (good ? ' · ' + good.name : '') + (status ? ' · ' + status : '');
}

function _buildInactiveBonuses(fleet, activeBonusIds) {
  return FLEET_BONUSES.filter(function (bonus) {
    return activeBonusIds.indexOf(bonus.id) === -1;
  }).map(function (bonus) {
    var missingNames = bonus.requiredTypes.filter(function (typeId) {
      return !fleet.some(function (ship) { return ship.typeId === typeId; });
    }).map(function (typeId) {
      var shipType = SHIP_TYPES.find(function (item) { return item.id === typeId; });
      return shipType ? shipType.emoji + shipType.name : typeId;
    });
    return { bonus: bonus, missingNames: missingNames };
  });
}

export function buildFleetHangarModel(state, inspectedShipIndex, options) {
  if (!state || typeof state !== 'object') return null;
  var opts = options || {};
  var now = typeof opts.now === 'number' ? opts.now : Date.now();
  var fleet = Fleet.getFleet(state);
  var activeIdx = Number.isInteger(state.activeShipIndex) ? state.activeShipIndex : 0;
  var inspectedIdx = Number.isInteger(inspectedShipIndex) && fleet[inspectedShipIndex]
    ? inspectedShipIndex
    : activeIdx;
  var snapshots = _buildShipSnapshots(state, fleet);
  var activeBonuses = Fleet.getActiveFleetBonuses(state);
  var slotCount = Fleet.getSlotCount(state);
  var maxSlots = Fleet.getMaxSlots();
  var nextSlot = slotCount < maxSlots ? FLEET_SLOTS[slotCount] : null;
  var nextSlotModel = null;

  if (nextSlot) {
    var requiredCompanyLevel = getFleetSlotCompanyRequirement(nextSlot.id);
    var companyLevel = getCompanyLevelValue(state);
    var canAfford = state.credits >= nextSlot.cost;
    var hasCompanyLevel = companyLevel >= requiredCompanyLevel;
    nextSlotModel = {
      slot: nextSlot,
      requiredCompanyLevel: requiredCompanyLevel,
      canBuy: canAfford && hasCompanyLevel,
      label: canAfford && hasCompanyLevel
        ? '🎫 解锁 ' + nextSlot.cost.toLocaleString() + ' 积分'
        : (!hasCompanyLevel
            ? '公司 Lv.' + requiredCompanyLevel + ' 解锁'
            : '积分不足 (' + nextSlot.cost.toLocaleString() + ')'),
    };
  }

  return {
    state: state,
    fleet: fleet,
    activeIdx: activeIdx,
    inspectedIdx: fleet[inspectedIdx] ? inspectedIdx : null,
    inspectedSnapshot: snapshots.find(function (snapshot) { return snapshot.index === inspectedIdx; }) || null,
    snapshots: snapshots,
    slotCount: slotCount,
    maxSlots: maxSlots,
    routeLevel: Fleet.getDispatchRouteLevel(state),
    fleetRouteCount: fleet.filter(function (ship) { return !!ship.route; }).length,
    fleetCargoCap: snapshots.reduce(function (sum, snapshot) {
      return sum + (snapshot.stats.maxCargo || snapshot.ship.maxCargo || 0);
    }, 0),
    activeBonuses: activeBonuses,
    inactiveBonuses: _buildInactiveBonuses(fleet, activeBonuses.map(function (bonus) { return bonus.id; })),
    nextSlot: nextSlotModel,
    flashIndex: state.lastSwitchedShipIndex,
    canFlash: now - (state.lastShipSwitchAt || 0) < 1200,
  };
}

function _clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
}

function _renderVital(label, value, percent, note, tone) {
  var safePercent = _clampPercent(percent);
  return '<div class="hangar-vital hangar-vital--' + tone + '" role="listitem">' +
    '<div class="hangar-vital-copy"><span>' + _escapeHtml(label) + '</span><strong>' + _escapeHtml(value) + '</strong></div>' +
    '<div class="hangar-vital-track" role="progressbar" aria-label="' + _escapeHtml(label) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + safePercent + '">' +
      '<span style="width:' + safePercent + '%"></span>' +
    '</div><small>' + _escapeHtml(note) + '</small></div>';
}

function _renderOverview(model) {
  var riskSnapshots = model.snapshots.filter(_isRiskSnapshot).sort(function (left, right) {
    if (!!left.repairJob !== !!right.repairJob) return left.repairJob ? -1 : 1;
    if (left.faults.length !== right.faults.length) return right.faults.length - left.faults.length;
    if (left.hullMissing !== right.hullMissing) return right.hullMissing - left.hullMissing;
    return left.maintenance.value - right.maintenance.value;
  });
  var avgMaintenance = model.snapshots.length
    ? Math.round(model.snapshots.reduce(function (sum, snapshot) { return sum + snapshot.maintenance.value; }, 0) / model.snapshots.length)
    : 100;
  var priority = riskSnapshots[0]
    || model.snapshots.find(function (snapshot) { return !!snapshot.ship.route; })
    || model.snapshots.find(function (snapshot) { return snapshot.index === model.activeIdx; })
    || model.snapshots[0]
    || null;
  var priorityTone = riskSnapshots.length > 0 ? 'warning' : (model.fleetRouteCount > 0 ? 'route' : 'ready');
  var priorityLabel = riskSnapshots.length > 0 ? '优先维护' : (model.fleetRouteCount > 0 ? '航线运行' : '等待任务');
  var priorityTitle = priority ? priority.ship.name : '暂无舰船';
  var priorityBody = '购买舰船后，可在这里维护船况、安排人员并开始自动跑商。';
  if (priority) {
    if (_isRiskSnapshot(priority)) {
      priorityBody = '维护 ' + Math.round(priority.maintenance.value) + '% · 故障 ' + priority.faults.length + ' · 船体缺口 ' + Math.round(priority.hullMissing);
    } else if (priority.ship.route) {
      priorityBody = _formatRouteSummary(model.state, priority);
    } else {
      priorityBody = (priority.roleProfile ? priority.roleProfile.label : '综合用途') + ' · 停靠待命';
    }
  }
  return '<section class="hangar-operations-deck" aria-labelledby="hangar-operations-title">' +
    '<div class="hangar-operations-head"><div><span>舰船状态与任务</span><h2 id="hangar-operations-title">舰队管理</h2></div><p>选择一艘船，集中维护船况、安排人员并开始自动跑商。</p></div>' +
    '<div class="hangar-operations-grid" role="list" aria-label="机库运行摘要">' +
      '<div role="listitem"><span>舰船 / 位置</span><strong>' + model.fleet.length + ' / ' + model.slotCount + '</strong><small>还有 ' + Math.max(0, model.maxSlots - model.slotCount) + ' 个位置未解锁</small></div>' +
      '<div role="listitem"><span>运行航线</span><strong>' + model.fleetRouteCount + '</strong><small>跑商等级 Lv.' + model.routeLevel + '</small></div>' +
      '<div role="listitem"><span>待维护</span><strong>' + riskSnapshots.length + '</strong><small>平均船况 ' + avgMaintenance + '%</small></div>' +
      '<div role="listitem"><span>总货舱</span><strong>' + model.fleetCargoCap + '</strong><small>所有舰船合计</small></div>' +
    '</div>' +
    '<button type="button" class="hangar-priority-signal hangar-priority-signal--' + priorityTone + '" data-hangar-intent="' + FLEET_HANGAR_INTENT.INSPECT_SHIP + '" data-ship-index="' + (priority ? priority.index : '') + '"' + (priority ? '' : ' disabled') + '>' +
      '<span>' + _escapeHtml(priorityLabel) + '</span><strong>' + _escapeHtml(priorityTitle) + '</strong><small>' + _escapeHtml(priorityBody) + '</small><b aria-hidden="true">查看 →</b>' +
    '</button></section>';
}

function _renderSelector(model) {
  var buttons = model.snapshots.map(function (snapshot) {
    var isActive = snapshot.index === model.activeIdx;
    var isInspected = snapshot.index === model.inspectedIdx;
    var status = snapshot.repairJob
      ? ('维修 ' + snapshot.repairJob.remainingDays + ' 天')
      : (snapshot.ship.route ? '航线中' : (isActive ? '操控中' : '待命'));
    var meta = (snapshot.roleProfile ? snapshot.roleProfile.label : '综合用途') + ' · 维护 ' + Math.round(snapshot.maintenance.value) + '%';
    return '<button type="button" role="listitem" class="hangar-ship-select' +
      (isInspected ? ' is-selected' : '') + (isActive ? ' is-active' : '') +
      (_isRiskSnapshot(snapshot) ? ' has-risk' : '') + (snapshot.ship.route ? ' has-route' : '') +
      '" data-hangar-intent="' + FLEET_HANGAR_INTENT.INSPECT_SHIP + '" data-ship-index="' + snapshot.index + '" aria-pressed="' + (isInspected ? 'true' : 'false') + '">' +
      '<span class="hangar-ship-select-index">0' + (snapshot.index + 1) + '</span>' +
      '<span class="hangar-ship-select-icon" aria-hidden="true">' + snapshot.ship.emoji + '</span>' +
      '<span class="hangar-ship-select-copy"><strong>' + _escapeHtml(snapshot.ship.name) + '</strong><small>' + _escapeHtml(meta) + '</small></span>' +
      '<span class="hangar-ship-select-status">' + _escapeHtml(status) + '</span></button>';
  }).join('');
  return '<section class="hangar-fleet-selector" aria-labelledby="hangar-fleet-selector-title">' +
    '<div class="hangar-section-heading"><div><span>你的舰船</span><h3 id="hangar-fleet-selector-title">选择舰船</h3></div><small>查看不会改变当前操控舰</small></div>' +
    '<div class="hangar-ship-select-list" role="list" aria-label="舰船列表">' + buttons + '</div></section>';
}

function _renderSupport(model) {
  var html = '<details class="hangar-support-panel"><summary><span><b>编队与席位</b><small>扩编、切换操控舰与查看编队加成</small></span><strong>' + model.fleet.length + '/' + model.slotCount + ' 艘</strong></summary><div class="hangar-support-body">';
  html += '<section class="hangar-slot-deck"><div class="fleet-section-title">船队席位（' + model.slotCount + '/' + model.maxSlots + '）</div><div class="fleet-slot-bar">';
  for (var index = 0; index < model.maxSlots; index += 1) {
    var slotDef = FLEET_SLOTS[index];
    var isOwned = index < model.slotCount;
    var hasShip = index < model.fleet.length;
    var isActive = index === model.activeIdx;
    html += '<div class="fleet-slot' + (isOwned ? ' slot-owned' : ' slot-locked') + (hasShip ? ' slot-filled' : '') + (isActive ? ' slot-active' : '') + '" title="' + _escapeHtml(slotDef.name) + '">';
    if (hasShip) {
      html += '<span class="slot-ship-icon">' + model.fleet[index].emoji + '</span>';
      if (isActive) html += '<span class="slot-active-label">操控</span>';
      else if (!model.fleet[index].route) {
        html += '<button class="slot-switch-btn" data-hangar-intent="' + FLEET_HANGAR_INTENT.SWITCH_SHIP + '" data-ship-index="' + index + '" title="切换操控至「' + _escapeHtml(model.fleet[index].name) + '」">切换</button>';
      } else html += '<span class="slot-dispatch-label">跑商</span>';
    } else if (isOwned) html += '<span class="slot-empty-icon">＋</span>';
    else html += '<span class="slot-lock-icon">🔒</span>';
    html += '</div>';
  }
  html += '</div><div class="fleet-slot-info"><span class="fleet-slot-route-lvl">自动跑商等级：Lv.' + model.routeLevel + '</span>';
  if (model.nextSlot) {
    html += '<div class="fleet-slot-next"><span>下一席位：<b>' + _escapeHtml(model.nextSlot.slot.name) + '</b> — ' + _escapeHtml(model.nextSlot.slot.desc) + ' · 需公司 Lv.' + model.nextSlot.requiredCompanyLevel + '</span>' +
      '<button class="fleet-slot-buy-btn' + (model.nextSlot.canBuy ? ' slot-can-buy' : '') + '" data-hangar-intent="' + FLEET_HANGAR_INTENT.BUY_SLOT + '"' + (model.nextSlot.canBuy ? '' : ' disabled') + '>' + _escapeHtml(model.nextSlot.label) + '</button></div>';
  } else html += '<div class="fleet-slot-next"><span>已解锁全部席位</span></div>';
  html += '</div></section>';
  if (model.activeBonuses.length > 0) {
    html += '<div class="fleet-bonus-section"><div class="fleet-section-title">已激活编队加成</div><div class="fleet-bonus-list">';
    model.activeBonuses.forEach(function (bonus) {
      html += '<div class="fleet-bonus-chip"><span class="fleet-bonus-emoji">' + bonus.emoji + '</span><span class="fleet-bonus-name">' + _escapeHtml(bonus.name) + '</span><span class="fleet-bonus-desc">' + _escapeHtml(bonus.desc) + '</span></div>';
    });
    html += '</div></div>';
  }
  if (model.inactiveBonuses.length > 0 && model.fleet.length > 1) {
    html += '<div class="fleet-bonus-hint"><details><summary>可解锁的编队加成（' + model.inactiveBonuses.length + '）</summary>';
    model.inactiveBonuses.forEach(function (entry) {
      html += '<div class="fleet-bonus-locked"><span>' + entry.bonus.emoji + ' ' + _escapeHtml(entry.bonus.name) + '：' + _escapeHtml(entry.bonus.desc) + '</span><span class="fleet-bonus-missing">需要：' + _escapeHtml(entry.missingNames.join('、')) + '</span></div>';
    });
    html += '</details></div>';
  }
  return html + '</div></details>';
}

function _renderRoute(model, snapshot) {
  var ship = snapshot.ship;
  if (!ship.route) {
    return '<div class="fleet-route-info hangar-idle-context"><div><span>当前任务</span><strong>' + (snapshot.repairJob ? '维修队列中' : '停靠待命') + '</strong></div><p>' +
      (snapshot.repairJob ? ('剩余 ' + snapshot.repairJob.remainingDays + ' 天，维修完成前不能出发。') : '可继续改装、安排人员，或建立一条自动跑商路线。') + '</p></div>';
  }
  var routeDisplay = Fleet.getRouteDisplayInfo(model.state, ship, snapshot.index);
  var startSys = SYSTEMS.find(function (system) { return system.id === (routeDisplay ? routeDisplay.startSystemId : null); });
  var targetSys = SYSTEMS.find(function (system) { return system.id === (routeDisplay ? routeDisplay.endSystemId : null); });
  var good = GOODS.find(function (item) { return item.id === ship.route.goodId; });
  return '<div class="fleet-route-info"><div class="fleet-route-text">📡 ' + (startSys ? startSys.name : '?') + ' <span class="fleet-route-arrow">→</span> ' + (targetSys ? targetSys.name : '?') + ' (' + (good ? good.emoji + good.name : '?') + ')</div>' +
    '<div class="fleet-route-meta"><span class="fleet-route-status">' + _escapeHtml(routeDisplay ? routeDisplay.statusLabel : ship.route.status) + '</span><span class="fleet-route-policy">🎛 ' + _escapeHtml(_formatTradePolicySummary(ship.route.tradePolicy)) + '</span></div>' +
    '<button class="fleet-cancel-btn" data-hangar-intent="' + FLEET_HANGAR_INTENT.CANCEL_ROUTE + '" data-ship-index="' + snapshot.index + '">⏹️ 召回</button></div>';
}

function _renderDetails(snapshot) {
  var ship = snapshot.ship;
  var roleProfile = snapshot.roleProfile;
  var crewEffects = _formatCrewEffectParts(snapshot.stats.crewEffects || {});
  var parts = [];
  if (snapshot.shipCrew.length > 0) parts.push('船员 ' + snapshot.shipCrew.length);
  if (snapshot.cargoEntries.length > 0) parts.push('货物 ' + snapshot.cargoEntries.length);
  if (snapshot.skills.length + snapshot.shipMods.length > 0) parts.push('配置 ' + (snapshot.skills.length + snapshot.shipMods.length));
  if (snapshot.faults.length > 0) parts.push('故障 ' + snapshot.faults.length);
  if (!roleProfile.summary && crewEffects.length === 0 && !(roleProfile.tags || []).length && snapshot.faults.length === 0 && snapshot.shipCrew.length === 0 && snapshot.skills.length === 0 && snapshot.shipMods.length === 0 && snapshot.cargoEntries.length === 0) return '';
  var html = '<details class="fleet-detail-panel"><summary>配置详情' + (parts.length ? ' · ' + _escapeHtml(parts.join(' · ')) : '') + '</summary><div class="fleet-detail-grid">';
  if (roleProfile.summary || crewEffects.length || (roleProfile.tags || []).length) {
    html += '<div class="fleet-detail-section"><div class="fleet-detail-section-title">运营概览</div>';
    if (roleProfile.summary) html += '<div class="fleet-detail-copy">' + _escapeHtml(roleProfile.summary) + '</div>';
    html += '<div class="fleet-detail-copy">' + (crewEffects.length ? ('船员增益：' + _escapeHtml(crewEffects.join(' · ')) + ' · ') : '') + '维护损耗 ' + snapshot.maintenance.dailyDecay.toFixed(1) + '/天</div>';
    if ((roleProfile.tags || []).length) html += '<div class="fleet-role-tags">' + roleProfile.tags.map(function (tag) { return '<span class="fleet-role-tag">' + _escapeHtml(tag) + '</span>'; }).join('') + '</div>';
    html += '</div>';
  }
  if (snapshot.faults.length) html += '<div class="fleet-detail-section"><div class="fleet-detail-section-title">故障告警</div><div class="fleet-fault-list">' + snapshot.faults.map(function (fault) { return '<span class="fleet-fault-chip" title="' + _escapeHtml(fault.desc) + '">' + fault.icon + ' ' + _escapeHtml(fault.label) + '</span>'; }).join('') + '</div></div>';
  if (snapshot.shipCrew.length) html += '<div class="fleet-detail-section"><div class="fleet-detail-section-title">当前船员</div><div class="fleet-crew-chips">' + snapshot.shipCrew.map(function (member) { return '<span class="fleet-crew-chip">' + member.emoji + ' ' + _escapeHtml(member.name) + ' Lv.' + (member.level || 1) + '</span>'; }).join('') + '</div></div>';
  if (snapshot.skills.length || snapshot.shipMods.length) {
    html += '<div class="fleet-detail-section"><div class="fleet-detail-section-title">技能与组件</div><div class="fleet-chips-row">' + snapshot.skills.map(function (skill) { return '<span class="fleet-skill-chip" title="' + _escapeHtml(skill.desc) + '">' + skill.emoji + ' ' + _escapeHtml(skill.name) + '</span>'; }).join('');
    snapshot.shipMods.forEach(function (modId) { var mod = SHIP_MODS.find(function (item) { return item.id === modId; }); if (mod) html += '<span class="fleet-mod-chip">' + mod.emoji + ' ' + _escapeHtml(mod.name) + '</span>'; });
    html += '</div></div>';
  }
  if (snapshot.modRecommendation) {
    html += '<div class="fleet-detail-section"><div class="fleet-detail-section-title">改装方案</div><div class="fleet-detail-copy">' + snapshot.modRecommendation.mod.emoji + ' ' + _escapeHtml(snapshot.modRecommendation.mod.name) + '：' + _escapeHtml(snapshot.modRecommendation.reason) + '</div>';
    if (snapshot.modRecommendation.disabledReason) html += '<div class="fleet-detail-copy">当前限制：' + _escapeHtml(snapshot.modRecommendation.disabledReason) + '</div>';
    html += '</div>';
  }
  if (snapshot.cargoEntries.length) html += '<div class="fleet-detail-section"><div class="fleet-detail-section-title">货舱内容</div><div class="fleet-cargo-chips">' + snapshot.cargoEntries.map(function (entry) { var good = GOODS.find(function (item) { return item.id === entry[0]; }); return '<span class="fleet-cargo-chip">' + (good ? good.emoji + _escapeHtml(good.name) : _escapeHtml(entry[0])) + ' ×' + entry[1] + '</span>'; }).join('') + '</div></div>';
  return html + '</div></details>';
}

function _renderFocusedShip(model) {
  var snapshot = model.inspectedSnapshot;
  var html = '<section class="hangar-ship-workspace" aria-labelledby="hangar-workspace-title"><div class="hangar-section-heading"><div><span>当前舰船</span><h3 id="hangar-workspace-title">舰船详情</h3></div><small>下方状态与操作都对应选中的舰船</small></div>';
  if (!snapshot) return html + '</section>';
  var ship = snapshot.ship;
  var isActive = snapshot.index === model.activeIdx;
  var maintenance = snapshot.maintenance;
  var repairJob = snapshot.repairJob;
  var needsService = maintenance.value < 99.5 || snapshot.faults.length > 0 || ship.hull < ship.maxHull;
  var modMeta = '升级 ' + (ship.upgrades || []).length + ' · 组件 ' + snapshot.shipMods.length + '/' + (ship.modSlots || 1);
  if (repairJob) modMeta += ' · 维修中 · 剩余 ' + repairJob.remainingDays + ' 天';
  else if (needsService) modMeta += ' · 需维修';
  var dispatchMeta = repairJob ? ('维修中 · 剩余 ' + repairJob.remainingDays + ' 天') : (ship.route ? '查看路线 · 可召回' : (isActive ? '当前船自动跑商' : '设置跑商路线'));

  html += '<article class="fleet-ship-card hangar-focused-ship' + (isActive ? ' fleet-active' : '') + (model.canFlash && snapshot.index === model.flashIndex ? ' fleet-switch-flash' : '') + (ship.route ? ' fleet-dispatched' : '') + '" data-index="' + snapshot.index + '">';
  html += '<div class="fleet-ship-header"><span class="fleet-ship-icon">' + ship.emoji + '</span><span class="fleet-ship-name">' + _escapeHtml(ship.name) + (isActive && !ship.route ? ' <span class="fleet-active-badge">操控中</span>' : '') + (!isActive && !ship.route ? ' <span class="fleet-idle-badge">待命</span>' : '') + (ship.route ? ' <span class="fleet-dispatch-badge">跑商中</span>' : '') + '</span>';
  html += isActive
    ? '<span class="hangar-control-badge">当前操控舰</span>'
    : '<button type="button" class="fleet-switch-btn fleet-switch-primary" data-hangar-intent="' + FLEET_HANGAR_INTENT.SWITCH_SHIP + '" data-ship-index="' + snapshot.index + '"><span>设为操控舰</span><small>当前仅查看，不影响正在操控的舰船</small></button>';
  html += '</div><div class="fleet-ship-stats hangar-vitals" role="list" aria-label="' + _escapeHtml(ship.name) + ' 核心状态">' +
    _renderVital('货舱', snapshot.cargoUsed + ' / ' + snapshot.stats.maxCargo, snapshot.stats.maxCargo > 0 ? (snapshot.cargoUsed / snapshot.stats.maxCargo) * 100 : 0, '有效容量', 'cargo') +
    _renderVital('燃料', Math.floor(ship.fuel) + ' / ' + ship.maxFuel, (ship.fuel / Math.max(1, ship.maxFuel || 1)) * 100, '当前储备', ship.fuel < ship.maxFuel * 0.25 ? 'warning' : 'fuel') +
    _renderVital('船体', Math.floor(ship.hull) + ' / ' + ship.maxHull, (ship.hull / Math.max(1, ship.maxHull || 1)) * 100, snapshot.faults.length ? ('故障 ' + snapshot.faults.length) : '结构完整', snapshot.faults.length || ship.hull < ship.maxHull * 0.6 ? 'warning' : 'hull') +
    _renderVital('维护', Math.round(maintenance.value) + '%', maintenance.value, maintenance.label + ' · -' + maintenance.dailyDecay.toFixed(1) + '/天', maintenance.value < 75 ? 'warning' : 'maintenance') + '</div>';
  html += '<div class="fleet-summary-strip"><span class="fleet-role-chip" title="' + _escapeHtml(snapshot.roleProfile.summary) + '">🎯 ' + _escapeHtml(snapshot.roleProfile.label) + '</span><span class="fleet-summary-chip" title="当前在岗船员与席位">👥 ' + snapshot.shipCrew.length + '/' + (ship.crewCapacity || 0) + ' 在岗</span><span class="fleet-maintenance-chip fleet-maintenance-' + maintenance.band + '" title="恢复至 100% 预计花费 ' + maintenance.serviceCost.toLocaleString() + ' 积分">🧰 ' + maintenance.label + ' ' + Math.round(maintenance.value) + '%</span>';
  if (repairJob) html += '<span class="fleet-summary-chip fleet-summary-chip--repair" title="已进入维修队列，剩余 ' + repairJob.remainingDays + ' 天">🔧 维修中 ' + repairJob.remainingDays + ' 天</span>';
  if (snapshot.faults.length) html += '<span class="fleet-summary-chip fleet-summary-chip--warning" title="存在 ' + snapshot.faults.length + ' 项故障">⚠️ 故障 ' + snapshot.faults.length + '</span>';
  if (snapshot.modRecommendation) html += '<span class="fleet-summary-chip fleet-summary-chip--recommend" title="' + _escapeHtml(snapshot.modRecommendation.reason) + '">🧩 推荐 ' + _escapeHtml(snapshot.modRecommendation.mod.name) + '</span>';
  html += '</div>' + _renderRoute(model, snapshot) + _renderDetails(snapshot);
  html += '<div class="fleet-card-action-row">' +
    '<button class="fleet-open-mod-btn fleet-manage-btn fleet-manage-btn--mod" data-hangar-intent="' + FLEET_HANGAR_INTENT.OPEN_MODS + '" data-ship-index="' + snapshot.index + '"><span class="fleet-manage-btn-label">🔧 改装</span><span class="fleet-manage-btn-meta">' + _escapeHtml(modMeta) + '</span></button>' +
    '<button class="fleet-open-crew-btn fleet-manage-btn fleet-manage-btn--crew" data-hangar-intent="' + FLEET_HANGAR_INTENT.OPEN_CREW + '" data-ship-index="' + snapshot.index + '"><span class="fleet-manage-btn-label">👥 人员</span><span class="fleet-manage-btn-meta">' + snapshot.shipCrew.length + '/' + (ship.crewCapacity || 0) + ' 在岗' + (isActive ? ' · 当前操控' : ' · 船员分工') + '</span></button>' +
    '<button class="fleet-dispatch-btn fleet-manage-btn fleet-manage-btn--dispatch" data-hangar-intent="' + FLEET_HANGAR_INTENT.OPEN_DISPATCH + '" data-ship-index="' + snapshot.index + '"' + (repairJob ? ' disabled' : '') + '><span class="fleet-manage-btn-label">📡 自动跑商</span><span class="fleet-manage-btn-meta">' + _escapeHtml(dispatchMeta) + '</span></button></div></article></section>';
  return html;
}

export function renderFleetHangar(model) {
  if (!model) return '';
  return _renderOverview(model) + _renderSelector(model) + _renderFocusedShip(model) + _renderSupport(model);
}

function _findIntentElement(target) {
  if (!target) return null;
  if (typeof target.closest === 'function') return target.closest('[data-hangar-intent]');
  var current = target;
  while (current) {
    if (current.dataset && current.dataset.hangarIntent) return current;
    current = current.parentElement || null;
  }
  return null;
}

export function readFleetHangarIntent(target) {
  var element = _findIntentElement(target);
  if (!element || !element.dataset || element.disabled) return null;
  var type = element.dataset.hangarIntent;
  if (INTENT_VALUES.indexOf(type) === -1) return null;
  if (type === FLEET_HANGAR_INTENT.BUY_SLOT) return Object.freeze({ type: type });
  var shipIndex = Number(element.dataset.shipIndex);
  if (!Number.isInteger(shipIndex) || shipIndex < 0) return null;
  return Object.freeze({ type: type, shipIndex: shipIndex });
}
