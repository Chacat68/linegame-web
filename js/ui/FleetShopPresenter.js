// js/ui/FleetShopPresenter.js — 船坞采购只读模型、HTML 与 UI intent

import { SHIP_TYPES } from '../data/ships.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';

export const FLEET_SHOP_INTENT = Object.freeze({
  BUY_SHIP: 'shop.ship.buy',
});

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getRoleLabel(shipType) {
  if (!shipType) return '综合用途';
  if (shipType.modSlots >= 3 || shipType.id === 'galleon') return '旗舰骨架';
  if (shipType.fuelEff <= 0.8 || shipType.id === 'clipper') return '高速航路';
  if (shipType.maxCargo >= 100 || shipType.id === 'freighter') return '货运主力';
  return '综合用途';
}

export function buildFleetShopModel(state) {
  if (!state || typeof state !== 'object') return null;
  var fleet = Fleet.getFleet(state);
  var slotCount = Fleet.getSlotCount(state);
  var maxSlots = Fleet.getMaxSlots();
  var routeLevel = Fleet.getDispatchRouteLevel(state);
  var hasAvailableSlot = Fleet.getAvailableSlotCount(state) > 0;
  var credits = Number(state.credits) || 0;
  var ownedTypeCounts = fleet.reduce(function (map, ship) {
    map[ship.typeId] = (map[ship.typeId] || 0) + 1;
    return map;
  }, Object.create(null));
  var fleetCargoCap = fleet.reduce(function (sum, ship) {
    var stats = Fleet.getEffectiveShipStats(state, ship);
    return sum + (stats.maxCargo || ship.maxCargo || 0);
  }, 0);
  var averageCargoCap = fleet.length ? Math.round(fleetCargoCap / fleet.length) : 0;
  var hasCargoCore = fleet.some(function (ship) { return ship.typeId === 'freighter' || ship.typeId === 'galleon'; });
  var hasFastHull = fleet.some(function (ship) { return ship.typeId === 'clipper'; });
  var hasFlagshipHull = fleet.some(function (ship) { return ship.typeId === 'galleon'; });

  var entries = SHIP_TYPES.filter(function (shipType) {
    return shipType.cost > 0;
  }).map(function (shipType) {
    var roleLabel = _getRoleLabel(shipType);
    var canAfford = credits >= shipType.cost;
    var creditGap = Math.max(0, shipType.cost - credits);
    var diversityBonus = ownedTypeCounts[shipType.id] ? -35 : 80;
    var roleFit = 0;
    if (!hasCargoCore && roleLabel === '货运主力') roleFit += 120;
    if (!hasFastHull && roleLabel === '高速航路') roleFit += 95;
    if (!hasFlagshipHull && roleLabel === '旗舰骨架' && fleet.length >= 2) roleFit += 105;
    var rangeValue = Math.round(shipType.maxFuelCap / Math.max(0.1, shipType.fuelEff));
    return Object.freeze({
      type: shipType,
      roleLabel: roleLabel,
      canAfford: canAfford,
      creditGap: creditGap,
      ownedCount: ownedTypeCounts[shipType.id] || 0,
      rangeValue: rangeValue,
      cargoLift: Math.max(0, (shipType.maxCargo || 0) - averageCargoCap),
      score: (shipType.maxCargo || 0) + Math.round(rangeValue / 8) + (shipType.modSlots || 1) * 24 + diversityBonus + roleFit,
    });
  });
  var affordableEntries = entries.filter(function (entry) { return entry.canAfford; });
  var focusEntry = hasAvailableSlot && affordableEntries.length > 0
    ? affordableEntries.slice().sort(function (left, right) {
        if (left.score !== right.score) return right.score - left.score;
        return left.type.cost - right.type.cost;
      })[0]
    : null;
  var closestEntry = entries.slice().sort(function (left, right) {
    if (left.creditGap !== right.creditGap) return left.creditGap - right.creditGap;
    return left.type.cost - right.type.cost;
  })[0] || null;

  return Object.freeze({
    credits: credits,
    fleetLen: fleet.length,
    slotCount: slotCount,
    maxSlots: maxSlots,
    routeLevel: routeLevel,
    hasAvailableSlot: hasAvailableSlot,
    entries: Object.freeze(entries),
    affordableEntries: Object.freeze(affordableEntries),
    focusEntry: focusEntry,
    closestEntry: closestEntry,
  });
}

function _renderBrief(model) {
  var slotText = model.fleetLen + '/' + model.slotCount;
  var slotMeta = model.hasAvailableSlot
    ? '空席位 ' + Math.max(0, model.slotCount - model.fleetLen) + ' · 锁定 ' + Math.max(0, model.maxSlots - model.slotCount)
    : '席位已满 · 上限 ' + model.maxSlots;
  var budgetMeta = model.closestEntry && model.closestEntry.creditGap > 0
    ? '距 ' + model.closestEntry.type.name + ' 还差 ' + model.closestEntry.creditGap.toLocaleString()
    : '预算覆盖当前候选';
  var focusTitle = model.focusEntry
    ? model.focusEntry.type.emoji + ' ' + model.focusEntry.type.name
    : (model.hasAvailableSlot ? '预算观察' : '采购暂停');
  var focusBody = model.focusEntry
    ? model.focusEntry.roleLabel + ' · 货舱上限 ' + model.focusEntry.type.maxCargo + ' · 航程能力 ' + model.focusEntry.rangeValue
    : (model.hasAvailableSlot ? (model.closestEntry ? budgetMeta : '暂无候选船型') : '当前没有空席位，新船购买按钮会保持锁定');
  var focusMeta = model.focusEntry
    ? '采购条件 · 已拥有同型 ' + model.focusEntry.ownedCount
    : (model.hasAvailableSlot ? '预算状态' : '船位状态');

  return '<section class="hangar-shop-brief" aria-label="购船决策摘要">' +
    '<div class="hangar-shop-brief-grid" role="list" aria-label="采购状态概览">' +
      '<div class="hangar-shop-brief-cell" role="listitem"><span>可用信用积分</span><strong>' + model.credits.toLocaleString() + '</strong><small>' + _escapeHtml(budgetMeta) + '</small></div>' +
      '<div class="hangar-shop-brief-cell" role="listitem"><span>可采购</span><strong>' + model.affordableEntries.length + '/' + model.entries.length + '</strong><small>按当前预算计算</small></div>' +
      '<div class="hangar-shop-brief-cell" role="listitem"><span>席位</span><strong>' + slotText + '</strong><small>' + _escapeHtml(slotMeta) + '</small></div>' +
      '<div class="hangar-shop-brief-cell" role="listitem"><span>航线等级</span><strong>Lv.' + model.routeLevel + '</strong><small>购船后沿用当前跑商等级</small></div>' +
    '</div>' +
    '<div class="hangar-shop-focus" aria-label="采购焦点">' +
      '<div><span>采购焦点</span><strong>' + _escapeHtml(focusTitle) + '</strong><small>' + _escapeHtml(focusBody) + '</small></div>' +
      '<span class="hangar-shop-focus-badge">' + _escapeHtml(focusMeta) + '</span>' +
    '</div>' +
  '</section>';
}

function _renderSignalStrip(entry, model) {
  var statusText = !model.hasAvailableSlot
    ? '席位锁定'
    : (entry.canAfford ? '可采购' : '差额 ' + entry.creditGap.toLocaleString());
  var statusClass = !model.hasAvailableSlot
    ? 'fleet-shop-status-pill--locked'
    : (entry.canAfford ? 'fleet-shop-status-pill--ready' : 'fleet-shop-status-pill--blocked');
  return '<div class="fleet-shop-signal-strip" role="list" aria-label="' + _escapeHtml(entry.type.name) + '购船信息">' +
    '<span role="listitem">用途 ' + _escapeHtml(entry.roleLabel) + '</span>' +
    '<span role="listitem">航程能力 ' + entry.rangeValue + '</span>' +
    '<span role="listitem">货舱增加 +' + entry.cargoLift + '</span>' +
    '<span class="fleet-shop-status-pill ' + statusClass + '" role="listitem">' + _escapeHtml(statusText) + '</span>' +
  '</div>';
}

function _renderEntry(entry, model) {
  var shipType = entry.type;
  var focused = model.focusEntry && model.focusEntry.type.id === shipType.id;
  var skillsHtml = (shipType.skills || []).map(function (skill) {
    return '<span class="fleet-shop-skill-chip" title="' + _escapeHtml(skill.desc) + '">' + _escapeHtml(skill.emoji + ' ' + skill.name) + '</span>';
  }).join('');
  var actionHtml = !model.hasAvailableSlot
    ? '<button class="fleet-buy-btn" disabled>需要先购买席位</button>'
    : (!entry.canAfford
        ? '<button class="fleet-buy-btn" disabled>积分不足</button>'
        : '<button class="fleet-buy-btn fleet-can-buy" data-fleet-shop-intent="' + FLEET_SHOP_INTENT.BUY_SHIP + '" data-ship-type-id="' + _escapeHtml(shipType.id) + '">购买</button>');
  return '<article class="fleet-shop-card' + (focused ? ' fleet-shop-card--focus' : '') + '">' +
    '<div class="fleet-shop-header"><span class="fleet-ship-icon">' + _escapeHtml(shipType.emoji) + '</span><span class="fleet-ship-name">' + _escapeHtml(shipType.name) + '</span><span class="fleet-shop-price">' + shipType.cost.toLocaleString() + ' 积分</span></div>' +
    '<div class="fleet-shop-desc">' + _escapeHtml(shipType.desc) + '</div>' +
    _renderSignalStrip(entry, model) +
    '<div class="fleet-shop-specs">📦' + shipType.cargo + '(→' + shipType.maxCargo + ') ⚡' + shipType.fuel + '(→' + shipType.maxFuelCap + ') 🛡️' + shipType.hull + '(→' + shipType.maxHullCap + ') 🔧×' + shipType.fuelEff + '(→' + shipType.minFuelEff + ')</div>' +
    '<div class="fleet-shop-extras"><span class="fleet-shop-mod-slots">🔧 改装槽：' + (shipType.modSlots || 1) + '</span>' + (skillsHtml ? '<span class="fleet-shop-skills">' + skillsHtml + '</span>' : '') + '</div>' +
    actionHtml +
  '</article>';
}

export function renderFleetShop(model) {
  if (!model) return '';
  return '<section class="hangar-shop-hero"><div class="hangar-shop-kicker">SHIP ACQUISITION</div><h2>船坞采购甲板</h2><p>按机库席位、现金流和航线等级选择下一艘船。购买后可进入改装与人员配置流程。</p><div class="shop-slot-hint">🎫 席位：' + model.fleetLen + '/' + model.slotCount + (model.hasAvailableSlot ? ' — 可购买新船' : ' — 席位已满，需先购买席位') + '</div></section>' +
    _renderBrief(model) +
    '<div class="fleet-section-title">🏪 船只商店</div><div class="hangar-shop-grid">' + model.entries.map(function (entry) { return _renderEntry(entry, model); }).join('') + '</div>';
}

export function readFleetShopIntent(target) {
  var element = target && typeof target.closest === 'function'
    ? target.closest('[data-fleet-shop-intent]')
    : null;
  if (!element || element.disabled || element.dataset.fleetShopIntent !== FLEET_SHOP_INTENT.BUY_SHIP) return null;
  var shipTypeId = String(element.dataset.shipTypeId || '').trim();
  if (!shipTypeId || !SHIP_TYPES.some(function (shipType) { return shipType.id === shipTypeId && shipType.cost > 0; })) return null;
  return Object.freeze({ type: FLEET_SHOP_INTENT.BUY_SHIP, shipTypeId: shipTypeId });
}
