// js/systems/fleet/FleetSystem.js — 船队管理系统
// 依赖：data/ships.js, data/systems.js, systems/economy/Economy.js
// 导出：init, buyShip, sellShip, switchShip, upgradeShip, getActiveShip, getFleet,
//       syncStateFromShip, syncShipFromState, getShipType,
//       getRouteDisplayInfo, assignRoute, cancelRoute, tickFleetRoutes,
//       buySlot, getSlotCount, getMaxSlots, getAvailableSlotCount,
//       getDispatchRouteLevel, dispatchActiveShip, cancelActiveDispatch,
//       isActiveDispatched, tickActiveShipDispatch,
//       installMod, uninstallMod, getShipSkills, getActiveFleetBonuses

import { SHIP_TYPES, SHIP_UPGRADES, FLEET_SLOTS, SHIP_MODS, FLEET_BONUSES } from '../../data/ships.js';
import { findSystem } from '../../data/systems.js';
import { GOODS } from '../../data/goods.js';
import * as Economy from '../economy/Economy.js';
import * as AutoTrade from '../trade/AutoTradeSystem.js?v=20260420-balance5';
import * as Crew from './CrewSystem.js';
import * as RouteModel from '../route/RouteSystem.js';
import {
  SHIP_DOCTRINES,
  createDoctrineProtocol,
  ensureShipSpecializationState,
  getDoctrine,
  getMasteryLevel,
  getMasteryTrack,
  getShipSpecializationProfile as buildShipSpecializationProfile,
} from './ShipSpecialization.js';

const SHIP_CONDITION_FAULTS = [
  {
    id: 'engine_vibration',
    icon: '⚙️',
    label: '引擎振荡',
    desc: '推进回路不稳，燃耗上升，持续航行会进一步放大磨损。',
    effects: {
      fuelEffMultiplier: 1.08,
      travelWearMultiplier: 1.14,
    },
  },
  {
    id: 'sensor_blindspot',
    icon: '📡',
    label: '传感盲区',
    desc: '扫描和预警读数漂移，事件压力上升，勘探折扣利用率下降。',
    effects: {
      eventChanceMultiplier: 1.1,
      scanFuelDiscountMultiplier: 0.5,
    },
  },
  {
    id: 'cargo_lock',
    icon: '📦',
    label: '货舱卡滞',
    desc: '装卸机构卡滞，有效货舱下降，卖货议价效率受损。',
    effects: {
      cargoPenalty: 6,
      sellBonus: -0.015,
    },
  },
];

const REPAIR_JOB_MIN_DAYS = 1;
const REPAIR_JOB_MAX_DAYS = 4;

/**
 * 创建一艘船只实例
 * @param {object} shipType  SHIP_TYPES 中的定义
 * @returns {object} 船只实例
 */
function _createShip(shipType) {
  var ship = {
    typeId:       shipType.id,
    name:         shipType.name,
    emoji:        shipType.emoji,
    cargo:        {},
    maxCargo:     shipType.cargo,
    maxCargoCap:  shipType.maxCargo,
    fuel:         shipType.fuel,
    maxFuel:      shipType.fuel,
    maxFuelCap:   shipType.maxFuelCap,
    hull:         shipType.hull,
    maxHull:      shipType.hull,
    maxHullCap:   shipType.maxHullCap,
    fuelEff:      shipType.fuelEff,
    minFuelEff:   shipType.minFuelEff,
    upgrades:     [],  // 已购买的升级 ID
    mods:         [],  // 已安装的改装组件 ID
    modSlots:     shipType.modSlots || 1, // 改装槽位数
    crewIds:      [],
    crewCapacity: Crew.getDefaultCrewCapacity(shipType),
    maintenance:  100,
    lastServiceDay: 0,
    repairJob:    null,
    location:     null, // 当前所在星系 ID（非激活船只用），null 表示跟随旗舰
    route:        null, // 派遣路线 { buySystemId, sellSystemId, goodId, status:'buying'|'traveling'|'selling'|'returning' }
  };
  ensureShipSpecializationState(ship, shipType);
  _ensureShipOperationalState(ship);
  return ship;
}

function _roundOpsValue(value) {
  return Math.round(value * 10) / 10;
}

function _clampMaintenance(value) {
  return Math.max(0, Math.min(100, _roundOpsValue(Number.isFinite(value) ? value : 100)));
}

function _ensureShipOperationalState(ship) {
  if (!ship || typeof ship !== 'object') return;
  ship.maintenance = _clampMaintenance(ship.maintenance);
  if (!Number.isFinite(ship.lastServiceDay)) ship.lastServiceDay = 0;
  if (!Array.isArray(ship.faults)) ship.faults = [];
  ship.faults = ship.faults.filter(function (faultId) {
    return !!_getShipConditionFault(faultId);
  });
  if (!ship.repairJob || typeof ship.repairJob !== 'object') {
    ship.repairJob = null;
  } else {
    var remainingDays = Math.max(0, Math.ceil(ship.repairJob.remainingDays || 0));
    var totalDays = Math.max(REPAIR_JOB_MIN_DAYS, Math.ceil(ship.repairJob.totalDays || remainingDays || REPAIR_JOB_MIN_DAYS));
    ship.repairJob = remainingDays > 0
      ? {
          remainingDays: remainingDays,
          totalDays: totalDays,
          cost: Math.max(0, Math.round(ship.repairJob.cost || 0)),
          startedDay: Number.isFinite(ship.repairJob.startedDay) ? ship.repairJob.startedDay : 0,
        }
      : null;
  }
}

function _getShipServiceConfig(ship) {
  var shipType = getShipType(ship && ship.typeId);
  return {
    upkeep: shipType && Number.isFinite(shipType.upkeep) ? shipType.upkeep : 0,
    serviceRate: shipType && Number.isFinite(shipType.serviceRate) ? shipType.serviceRate : 6,
    maintenanceDecay: shipType && Number.isFinite(shipType.maintenanceDecay) ? shipType.maintenanceDecay : 1,
  };
}

function _getShipCargoUsed(ship) {
  return Object.values((ship && ship.cargo) || {}).reduce(function (sum, quantity) {
    return sum + quantity;
  }, 0);
}

function _getShipModUpkeep(ship) {
  if (!ship || !Array.isArray(ship.mods)) return 0;
  return ship.mods.reduce(function (sum, modId) {
    var mod = SHIP_MODS.find(function (item) { return item.id === modId; });
    return sum + (mod && Number.isFinite(mod.upkeep) ? mod.upkeep : 0);
  }, 0);
}

function _getShipConditionFault(faultId) {
  return SHIP_CONDITION_FAULTS.find(function (fault) { return fault.id === faultId; }) || null;
}

function _scalePenaltyAboveOne(multiplier, reductionFactor) {
  if (!Number.isFinite(multiplier)) return 1;
  return 1 + Math.max(0, multiplier - 1) * (Number.isFinite(reductionFactor) ? reductionFactor : 1);
}

function _scalePenaltyBelowOne(multiplier, reductionFactor) {
  if (!Number.isFinite(multiplier)) return 1;
  return 1 - Math.max(0, 1 - multiplier) * (Number.isFinite(reductionFactor) ? reductionFactor : 1);
}

function _getShipOperationalRoleEffects(state, ship) {
  var roleProfile = getShipRoleProfile(state, ship);
  var effects = {
    roleId: roleProfile.id,
    roleLabel: roleProfile.label,
    travelWearMultiplier: 1,
    maintenanceDecayMultiplier: 1,
    faultTriggerMultiplier: 1,
    engineFuelPenaltyMultiplier: 1,
    engineWearPenaltyMultiplier: 1,
    sensorEventPenaltyMultiplier: 1,
    sensorDiscountPenaltyMultiplier: 1,
    cargoPenaltyMultiplier: 1,
    cargoSellPenaltyMultiplier: 1,
    serviceCostMultiplier: 1,
    serviceMaintenanceBonus: { quick: 0, overhaul: 0, emergency: 0 },
    serviceHullBonus: { quick: 0, overhaul: 0, emergency: 0 },
    dispatchStrategyLabel: '标准派遣',
    dispatchStrategyNote: '按当前利润与风险偏好筛选路线。',
    preferredRiskMode: 'balanced',
    preferredMarketMode: 'open',
    inspectionRiskMultiplier: 1,
    openMarketBonus: 0,
    blackMarketBonus: 0,
    lowRiskBonus: 0,
    highRiskPenalty: 0,
    fuelCostWeight: 1,
    cargoValueWeight: 1,
    legalTradeBonus: 0,
    techRouteBonus: 0,
    faultPressurePenalty: 18,
  };

  if (roleProfile.id === 'courier') {
    effects.travelWearMultiplier = 0.9;
    effects.engineFuelPenaltyMultiplier = 0.7;
    effects.engineWearPenaltyMultiplier = 0.65;
    effects.dispatchStrategyLabel = '短线周转';
    effects.dispatchStrategyNote = '偏好低燃耗、低磨损的快速循环路线。';
    effects.preferredRiskMode = 'balanced';
    effects.fuelCostWeight = 1.35;
    effects.highRiskPenalty = 24;
    effects.faultPressurePenalty = 16;
  } else if (roleProfile.id === 'survey') {
    effects.sensorEventPenaltyMultiplier = 0.72;
    effects.sensorDiscountPenaltyMultiplier = 0.45;
    effects.dispatchStrategyLabel = '谨慎测绘';
    effects.dispatchStrategyNote = '偏好低执法、低故障压力的稳定航线。';
    effects.preferredRiskMode = 'safe';
    effects.lowRiskBonus = 96;
    effects.highRiskPenalty = 48;
    effects.techRouteBonus = 42;
    effects.faultPressurePenalty = 24;
  } else if (roleProfile.id === 'covert') {
    effects.dispatchStrategyLabel = '灰市穿透';
    effects.dispatchStrategyNote = '偏好黑市与受限商品套利，能承受更高查缉压力。';
    effects.preferredRiskMode = 'aggressive';
    effects.preferredMarketMode = 'black';
    effects.inspectionRiskMultiplier = 0.78;
    effects.blackMarketBonus = 140;
    effects.highRiskPenalty = 10;
    effects.faultPressurePenalty = 12;
  } else if (roleProfile.id === 'support') {
    effects.maintenanceDecayMultiplier = 0.9;
    effects.faultTriggerMultiplier = 0.65;
    effects.serviceCostMultiplier = 0.92;
    effects.serviceMaintenanceBonus.quick = 6;
    effects.serviceMaintenanceBonus.emergency = 8;
    effects.serviceHullBonus.overhaul = 3;
    effects.serviceHullBonus.emergency = 1;
    effects.dispatchStrategyLabel = '后勤保底';
    effects.dispatchStrategyNote = '在船况承压时优先规避高风险路线，维持持续运转。';
    effects.preferredRiskMode = 'safe';
    effects.lowRiskBonus = 110;
    effects.highRiskPenalty = 72;
    effects.fuelCostWeight = 1.12;
    effects.openMarketBonus = 48;
    effects.faultPressurePenalty = 34;
  } else {
    effects.cargoPenaltyMultiplier = 0.5;
    effects.cargoSellPenaltyMultiplier = 0.5;
    effects.dispatchStrategyLabel = '稳态商运';
    effects.dispatchStrategyNote = '偏好公开市场与高装载收益的稳定货运路线。';
    effects.preferredRiskMode = 'balanced';
    effects.openMarketBonus = 82;
    effects.cargoValueWeight = 1.25;
    effects.legalTradeBonus = 42;
    effects.highRiskPenalty = 28;
    effects.faultPressurePenalty = 20;
  }

  return effects;
}

function _getShipFaultEffects(state, ship) {
  _ensureShipOperationalState(ship);
  var roleEffects = _getShipOperationalRoleEffects(state, ship);

  return ship.faults.reduce(function (effects, faultId) {
    var fault = _getShipConditionFault(faultId);
    if (!fault || !fault.effects) return effects;

    if (fault.id === 'engine_vibration') {
      if (fault.effects.fuelEffMultiplier) {
        effects.fuelEffMultiplier *= _scalePenaltyAboveOne(fault.effects.fuelEffMultiplier, roleEffects.engineFuelPenaltyMultiplier);
      }
      if (fault.effects.travelWearMultiplier) {
        effects.travelWearMultiplier *= _scalePenaltyAboveOne(fault.effects.travelWearMultiplier, roleEffects.engineWearPenaltyMultiplier);
      }
      return effects;
    }

    if (fault.id === 'sensor_blindspot') {
      if (fault.effects.eventChanceMultiplier) {
        effects.eventChanceMultiplier *= _scalePenaltyAboveOne(fault.effects.eventChanceMultiplier, roleEffects.sensorEventPenaltyMultiplier);
      }
      if (fault.effects.scanFuelDiscountMultiplier) {
        effects.scanFuelDiscountMultiplier *= _scalePenaltyBelowOne(fault.effects.scanFuelDiscountMultiplier, roleEffects.sensorDiscountPenaltyMultiplier);
      }
      return effects;
    }

    if (fault.id === 'cargo_lock') {
      if (fault.effects.cargoPenalty) {
        effects.cargoPenalty += Math.round(fault.effects.cargoPenalty * (roleEffects.cargoPenaltyMultiplier || 1));
      }
      if (fault.effects.sellBonus) {
        effects.sellBonus += fault.effects.sellBonus * (roleEffects.cargoSellPenaltyMultiplier || 1);
      }
      return effects;
    }

    if (fault.effects.fuelEffMultiplier) effects.fuelEffMultiplier *= fault.effects.fuelEffMultiplier;
    if (fault.effects.eventChanceMultiplier) effects.eventChanceMultiplier *= fault.effects.eventChanceMultiplier;
    if (fault.effects.scanFuelDiscountMultiplier) effects.scanFuelDiscountMultiplier *= fault.effects.scanFuelDiscountMultiplier;
    if (fault.effects.travelWearMultiplier) effects.travelWearMultiplier *= fault.effects.travelWearMultiplier;
    if (fault.effects.cargoPenalty) effects.cargoPenalty += fault.effects.cargoPenalty;
    if (fault.effects.buyDiscount) effects.buyDiscount += fault.effects.buyDiscount;
    if (fault.effects.sellBonus) effects.sellBonus += fault.effects.sellBonus;
    return effects;
  }, {
    fuelEffMultiplier: 1,
    eventChanceMultiplier: 1,
    scanFuelDiscountMultiplier: 1,
    travelWearMultiplier: 1,
    cargoPenalty: 0,
    buyDiscount: 0,
    sellBonus: 0,
  });
}

function _triggerConditionFault(ship, preferredIds, msgs) {
  _ensureShipOperationalState(ship);
  if (ship.faults.length >= 2) return null;

  var candidates = SHIP_CONDITION_FAULTS.filter(function (fault) {
    return ship.faults.indexOf(fault.id) === -1;
  });
  if (candidates.length === 0) return null;

  if (Array.isArray(preferredIds) && preferredIds.length > 0) {
    var preferred = candidates.filter(function (fault) {
      return preferredIds.indexOf(fault.id) !== -1;
    });
    if (preferred.length > 0) candidates = preferred;
  }

  var fault = candidates[Math.floor(Math.random() * candidates.length)] || null;
  if (!fault) return null;

  ship.faults.push(fault.id);
  if (Array.isArray(msgs)) {
    msgs.push({
      text: fault.icon + ' 「' + ship.name + '」出现故障：' + fault.label + '。' + fault.desc,
      type: 'error',
    });
  }
  return fault;
}

function _maybeTriggerConditionFault(state, ship, context, msgs) {
  _ensureShipOperationalState(ship);
  if (ship.faults.length >= 2) return null;
  var roleEffects = _getShipOperationalRoleEffects(state, ship);

  var chance = 0;
  if (context && context.unpaidUpkeep) chance += 0.16 + Math.min(0.16, context.unpaidUpkeep / 240);
  if (context && context.maintenanceBand === 'critical') chance += 0.12;
  else if (context && context.maintenanceBand === 'worn') chance += 0.04;
  if (context && context.travelWear >= 5) chance += 0.08;

  chance *= roleEffects.faultTriggerMultiplier || 1;

  if (chance <= 0 || Math.random() >= Math.min(0.6, chance)) return null;

  var preferredIds = context && context.travelWear >= 5
    ? ['engine_vibration', 'sensor_blindspot']
    : ['cargo_lock', 'engine_vibration', 'sensor_blindspot'];
  return _triggerConditionFault(ship, preferredIds, msgs);
}

function _clearShipFaults(ship, clearMode) {
  _ensureShipOperationalState(ship);
  if (!ship.faults.length || !clearMode) return [];

  if (clearMode === 'all') {
    var allFaults = ship.faults.slice();
    ship.faults = [];
    return allFaults;
  }

  var cleared = ship.faults.slice(0, Math.max(0, clearMode));
  ship.faults = ship.faults.slice(cleared.length);
  return cleared;
}

function _pushMaintenanceTransitionMsg(ship, beforeProfile, afterProfile, msgs) {
  if (!ship || !beforeProfile || !afterProfile || !Array.isArray(msgs)) return;
  if (beforeProfile.band === afterProfile.band) return;

  if (afterProfile.band === 'worn') {
    msgs.push({
      text: '🧰 「' + ship.name + '」维护度降至 ' + Math.round(afterProfile.value) + '%，进入磨损状态。',
      type: 'info',
    });
    return;
  }

  if (afterProfile.band === 'critical') {
    msgs.push({
      text: '🚨 「' + ship.name + '」维护度仅剩 ' + Math.round(afterProfile.value) + '%，请尽快检修。',
      type: 'error',
    });
  }
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 初始化船队系统 — 如果 state 中没有船队数据则创建初始船只
 */
export function init(state) {
  Crew.ensureState(state);
  if (!state.fleet || state.fleet.length === 0) {
    const starter = _createShip(SHIP_TYPES[0]); // 穿梭机
    state.fleet = [starter];
    state.activeShipIndex = 0;
  }
  // 兼容旧存档：补充席位数据
  if (!state.fleetSlots || state.fleetSlots < 1) {
    state.fleetSlots = Math.max(1, state.fleet.length);
  }
  // 兼容旧存档：补充改装数据
  state.fleet.forEach(function (ship) {
    if (!ship.mods) ship.mods = [];
    if (!ship.modSlots) {
      var st = SHIP_TYPES.find(function (t) { return t.id === ship.typeId; });
      ship.modSlots = st ? (st.modSlots || 1) : 1;
    }
    _ensureShipOperationalState(ship);
    ensureShipSpecializationState(ship, SHIP_TYPES.find(function (type) { return type.id === ship.typeId; }));
    Crew.ensureShip(ship, SHIP_TYPES.find(function (type) { return type.id === ship.typeId; }));
  });
  // 确保当前 state 与激活船只同步
  syncStateFromShip(state);
}

/**
 * 获取当前激活船只
 */
export function getActiveShip(state) {
  return state.fleet[state.activeShipIndex] || state.fleet[0];
}

/**
 * 获取完整船队
 */
export function getFleet(state) {
  return state.fleet;
}

// ---------------------------------------------------------------------------
// 席位系统
// ---------------------------------------------------------------------------

/**
 * 获取已购买席位数
 */
export function getSlotCount(state) {
  return state.fleetSlots || 1;
}

/**
 * 获取最大席位数
 */
export function getMaxSlots() {
  return FLEET_SLOTS.length;
}

/**
 * 获取可用席位数（已购买 - 已使用）
 */
export function getAvailableSlotCount(state) {
  return getSlotCount(state) - state.fleet.length;
}

/**
 * 获取当前派遣航线解锁等级（基于已购买的最高席位）
 */
export function getDispatchRouteLevel(state) {
  var slotCount = getSlotCount(state);
  var slot = FLEET_SLOTS[slotCount - 1];
  return slot ? slot.routeLevel : 1;
}

/**
 * 购买新席位
 * @param {object} state
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function buySlot(state) {
  var current = getSlotCount(state);
  if (current >= FLEET_SLOTS.length) {
    return { ok: false, msgs: [{ text: '🚫 席位已达上限！', type: 'error' }] };
  }
  var nextSlot = FLEET_SLOTS[current]; // 下一个席位（0-indexed, current = 已拥有数）
  if (state.credits < nextSlot.cost) {
    return { ok: false, msgs: [{ text: '💰 积分不足！需要 ' + nextSlot.cost.toLocaleString() + ' 积分。', type: 'error' }] };
  }
  state.credits -= nextSlot.cost;
  state.fleetSlots = current + 1;

  return {
    ok: true,
    msgs: [{
      text: '🌟 解锁「' + nextSlot.name + '」！船队席位：' + state.fleetSlots + '/' + FLEET_SLOTS.length +
            '，派遣航线等级提升至 Lv.' + nextSlot.routeLevel + ' ！',
      type: 'upgrade',
    }],
  };
}

/**
 * 购买新船只（需要有可用席位）
 * @param {object} state
 * @param {string} shipTypeId  SHIP_TYPES 中的 id
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function buyShip(state, shipTypeId) {
  const shipType = SHIP_TYPES.find(function (s) { return s.id === shipTypeId; });
  if (!shipType) {
    return { ok: false, msgs: [{ text: '❌ 未知船型！', type: 'error' }] };
  }
  if (state.credits < shipType.cost) {
    return { ok: false, msgs: [{ text: '💰 积分不足！需要 ' + shipType.cost + ' 积分。', type: 'error' }] };
  }
  // 检查是否有可用席位
  if (getAvailableSlotCount(state) <= 0) {
    return { ok: false, msgs: [{ text: '🚫 没有可用席位！请先购买新席位。', type: 'error' }] };
  }

  state.credits -= shipType.cost;
  const newShip = _createShip(shipType);
  state.fleet.push(newShip);

  return {
    ok: true,
    msgs: [{
      text: '🎉 购入新船「' + shipType.emoji + ' ' + shipType.name + '」！船队规模：' + state.fleet.length + '/' + getSlotCount(state) + ' 艘。',
      type: 'upgrade',
    }],
  };
}

/**
 * 卖出船只 — 获得原价 45%~80% 的随机回收积分
 * @param {object} state
 * @param {number} shipIndex  要卖出的船只索引
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function sellShip(state, shipIndex) {
  if (shipIndex < 0 || shipIndex >= state.fleet.length) {
    return { ok: false, msgs: [{ text: '❌ 无效的船只索引！', type: 'error' }] };
  }
  // 不能卖出最后一艘船
  if (state.fleet.length <= 1) {
    return { ok: false, msgs: [{ text: '🚫 不能卖出最后一艘船！', type: 'error' }] };
  }
  const ship = state.fleet[shipIndex];
  // 不能卖出正在派遣中的船只
  if (ship.route) {
    return { ok: false, msgs: [{ text: '🚫 不能卖出正在派遣中的船只！请先召回。', type: 'error' }] };
  }
  // 不能卖出当前操控中的船只
  if (shipIndex === state.activeShipIndex) {
    return { ok: false, msgs: [{ text: '🚫 不能卖出正在操控的船只！请先切换到其他船只。', type: 'error' }] };
  }

  const shipType = SHIP_TYPES.find(function (s) { return s.id === ship.typeId; });
  const baseCost = shipType ? (shipType.sellValue || shipType.cost) : 0;
  // 随机 45%~80% 回收价
  const ratio = 0.45 + Math.random() * 0.35;
  const sellPrice = Math.floor(baseCost * ratio);

  // 货舱中的货物一并清空（不退还）
  state.credits += sellPrice;
  state.fleet.splice(shipIndex, 1);

  // 修正 activeShipIndex：被卖出的船索引 < 当前激活索引时，激活索引需要减 1
  if (shipIndex < state.activeShipIndex) {
    state.activeShipIndex -= 1;
  } else if (state.activeShipIndex >= state.fleet.length) {
    state.activeShipIndex = state.fleet.length - 1;
  }
  // 重新同步激活船只
  syncStateFromShip(state);

  return {
    ok: true,
    msgs: [{
      text: '💸 卖出「' + ship.emoji + ' ' + ship.name + '」获得 ' + sellPrice.toLocaleString() + ' 积分（' + Math.round(ratio * 100) + '% 回收价）！',
      type: 'trade',
    }],
  };
}

/**
 * 切换激活船只 — 将当前船只状态存回，再加载新船只
 * @param {object} state
 * @param {number} shipIndex
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function switchShip(state, shipIndex) {
  if (shipIndex < 0 || shipIndex >= state.fleet.length) {
    return { ok: false, msgs: [{ text: '❌ 无效的船只索引！', type: 'error' }] };
  }
  if (shipIndex === state.activeShipIndex) {
    return { ok: false, msgs: [{ text: '⚓ 已经在操控这艘船了！', type: 'info' }] };
  }

  // 保存当前船只状态
  syncShipFromState(state);

  // 切换
  state.activeShipIndex = shipIndex;
  const ship = getActiveShip(state);

  // 加载新船只状态
  syncStateFromShip(state);

  return {
    ok: true,
    msgs: [{
      text: '🔄 已切换到「' + ship.emoji + ' ' + ship.name + '」！',
      type: 'info',
    }],
  };
}

/**
 * 为指定船只购买升级
 * @param {object} state
 * @param {string} upgradeId
 * @param {number} [shipIndex] 船只索引，默认为激活船只
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function upgradeShip(state, upgradeId, shipIndex) {
  const upg = SHIP_UPGRADES.find(function (u) { return u.id === upgradeId; });
  if (!upg) return { ok: false, msgs: [] };

  const ship = shipIndex != null ? state.fleet[shipIndex] : getActiveShip(state);
  if (!ship) return { ok: false, msgs: [{ text: '❌ 无效的船只！', type: 'error' }] };

  if (ship.upgrades.includes(upgradeId)) {
    return { ok: false, msgs: [{ text: '⚙️ 该升级已安装！', type: 'error' }] };
  }
  if (upg.requires && !ship.upgrades.includes(upg.requires)) {
    const req = SHIP_UPGRADES.find(function (u) { return u.id === upg.requires; });
    return { ok: false, msgs: [{ text: '⚙️ 需要先安装「' + req.name + '」！', type: 'error' }] };
  }
  if (state.credits < upg.cost) {
    return { ok: false, msgs: [{ text: '💰 积分不足！', type: 'error' }] };
  }

  // 检查是否到达上限
  if (upg.effect.cargo) {
    if (ship.maxCargo + upg.effect.cargo > ship.maxCargoCap) {
      return { ok: false, msgs: [{ text: '📦 货舱已达该船型上限（' + ship.maxCargoCap + '）！', type: 'error' }] };
    }
  }
  if (upg.effect.maxFuel) {
    if (ship.maxFuel + upg.effect.maxFuel > ship.maxFuelCap) {
      return { ok: false, msgs: [{ text: '⚡ 燃料舱已达该船型上限（' + ship.maxFuelCap + '）！', type: 'error' }] };
    }
  }
  if (upg.effect.hull) {
    if (ship.maxHull + upg.effect.hull > ship.maxHullCap) {
      return { ok: false, msgs: [{ text: '🛡️ 船体已达该船型上限（' + ship.maxHullCap + '）！', type: 'error' }] };
    }
  }
  if (upg.effect.fuelEff) {
    if (ship.fuelEff * upg.effect.fuelEff < ship.minFuelEff) {
      return { ok: false, msgs: [{ text: '🔧 引擎效率已达该船型上限！', type: 'error' }] };
    }
  }

  // 扣费并应用升级
  state.credits -= upg.cost;
  ship.upgrades.push(upgradeId);

  if (upg.effect.cargo) {
    ship.maxCargo = Math.min(ship.maxCargoCap, ship.maxCargo + upg.effect.cargo);
  }
  if (upg.effect.maxFuel) {
    ship.maxFuel = Math.min(ship.maxFuelCap, ship.maxFuel + upg.effect.maxFuel);
    ship.fuel    = Math.min(ship.fuel + upg.effect.maxFuel, ship.maxFuel);
  }
  if (upg.effect.hull) {
    ship.maxHull = Math.min(ship.maxHullCap, ship.maxHull + upg.effect.hull);
    ship.hull    = Math.min(ship.hull + upg.effect.hull, ship.maxHull);
  }
  if (upg.effect.fuelEff) {
    ship.fuelEff = Math.max(ship.minFuelEff, ship.fuelEff * upg.effect.fuelEff);
  }

  // 如果升级的是激活船只，同步到 state
  const actualIndex = shipIndex != null ? shipIndex : state.activeShipIndex;
  if (actualIndex === state.activeShipIndex) {
    syncStateFromShip(state);
  }

  return {
    ok: true,
    msgs: [{ text: '⚙️ 「' + ship.name + '」升级成功：' + upg.name + '！', type: 'upgrade' }],
  };
}

/**
 * 将激活船只的属性同步到 state（用于其他系统读取）
 */
export function syncStateFromShip(state) {
  const ship = getActiveShip(state);
  if (!ship) return;
  var effective = getEffectiveShipStats(state, ship);
  state.cargo          = ship.cargo;
  state.maxCargo       = effective.maxCargo;
  state.fuel           = ship.fuel;
  state.maxFuel        = ship.maxFuel;
  state.fuelEfficiency = effective.fuelEff;
  state.shipHull       = ship.hull;
  state.maxHull        = ship.maxHull;
}

/**
 * 将 state 中可被其他系统改变的属性写回激活船只
 * （如旅行消耗燃料、贸易改变货舱等）
 */
export function syncShipFromState(state) {
  const ship = getActiveShip(state);
  if (!ship) return;
  ship.cargo   = state.cargo;
  ship.fuel    = state.fuel;
  ship.hull    = state.shipHull != null ? state.shipHull : ship.hull;
  ship.location = state.currentSystem || ship.location;
}

/**
 * 将根 state 的可变属性写回当前操控船只，并立即刷新派生属性。
 * 用于交易/航行/探索后既更新船只实体，又保持 HUD、市场和自动派遣读取到最新有效值。
 */
export function commitActiveShipState(state) {
  syncShipFromState(state);
  syncStateFromShip(state);
}

export function getShipMaintenanceSummary(state, ship) {
  if (!ship) {
    return {
      value: 100,
      band: 'pristine',
      label: '整备',
      faultCount: 0,
      upkeepCost: 0,
      serviceCost: 0,
      dailyDecay: 0,
      fuelEffMultiplier: 1,
      eventChanceMultiplier: 1,
      autoRepairMultiplier: 1,
      smugglingCheckMultiplier: 1,
    };
  }

  _ensureShipOperationalState(ship);

  var modEffects = getShipModEffects(ship);
  var roleEffects = _getShipOperationalRoleEffects(state, ship);
  var serviceConfig = _getShipServiceConfig(ship);
  var value = _clampMaintenance(ship.maintenance);
  var band = 'pristine';
  var label = '整备';
  var fuelEffMultiplier = 1;
  var eventChanceMultiplier = 1;
  var autoRepairMultiplier = 1;
  var smugglingCheckMultiplier = 1;

  if (value < 25) {
    band = 'critical';
    label = '危险';
    fuelEffMultiplier = 1.22;
    eventChanceMultiplier = 1.28;
    autoRepairMultiplier = 0.45;
    smugglingCheckMultiplier = 1.12;
  } else if (value < 50) {
    band = 'worn';
    label = '磨损';
    fuelEffMultiplier = 1.12;
    eventChanceMultiplier = 1.16;
    autoRepairMultiplier = 0.7;
    smugglingCheckMultiplier = 1.08;
  } else if (value < 75) {
    band = 'steady';
    label = '稳定';
    fuelEffMultiplier = 1.04;
    eventChanceMultiplier = 1.05;
    autoRepairMultiplier = 0.9;
    smugglingCheckMultiplier = 1.03;
  }

  var upkeepBase = serviceConfig.upkeep + _getShipModUpkeep(ship);
  var upkeepCost = Math.max(0, Math.round(
    upkeepBase * (ship.route ? 1.15 : 1) * (1 + Math.max(0, 80 - value) / 260)
  ));
  var dailyDecay = _roundOpsValue(
    (0.2 + (ship.route ? 0.85 : 0.12) + ((ship.hull || ship.maxHull || 0) < (ship.maxHull || ship.hull || 0) ? 0.2 : 0))
    * serviceConfig.maintenanceDecay
    * (modEffects.maintenanceDecayMultiplier || 1)
    * (roleEffects.maintenanceDecayMultiplier || 1)
  );
  var serviceCost = Math.max(0, Math.round((100 - value) * serviceConfig.serviceRate));

  return {
    value: value,
    band: band,
    label: label,
    faultCount: ship.faults.length,
    upkeepCost: upkeepCost,
    serviceCost: serviceCost,
    dailyDecay: dailyDecay,
    fuelEffMultiplier: fuelEffMultiplier,
    eventChanceMultiplier: eventChanceMultiplier,
    autoRepairMultiplier: autoRepairMultiplier,
    smugglingCheckMultiplier: smugglingCheckMultiplier,
  };
}

export function getShipRoleProfile(state, ship) {
  if (!ship) {
    return {
      id: 'logistics',
      label: '主力商运',
      summary: '承担常规货运与套利。',
      tags: [],
    };
  }

  var scores = {
    logistics: 0,
    courier: 0,
    survey: 0,
    covert: 0,
    support: 0,
  };
  var tags = [];

  if (ship.typeId === 'freighter') {
    scores.logistics += 3;
    scores.support += 1.2;
  } else if (ship.typeId === 'clipper') {
    scores.courier += 2.5;
    scores.covert += 2;
    scores.survey += 1.5;
  } else if (ship.typeId === 'galleon') {
    scores.logistics += 3.5;
    scores.support += 2;
  } else {
    scores.courier += 1.5;
    scores.survey += 1;
    scores.covert += 1;
  }

  var specialization = getShipSpecializationSummary(state, ship);
  if (specialization && specialization.doctrine) {
    tags.push(specialization.doctrine.shortName);
    if (specialization.doctrine.id === 'trade') scores.logistics += 2;
    else if (specialization.doctrine.id === 'navigation') scores.courier += 2;
    else scores.survey += 2;
  }

  (ship.mods || []).forEach(function (modId) {
    if (modId === 'mod_service_bay') {
      scores.support += 3;
      tags.push('维护');
    } else if (modId === 'mod_survey_array') {
      scores.survey += 3;
      tags.push('测绘');
    } else if (modId === 'mod_smuggler_hold') {
      scores.covert += 3;
      tags.push('灰市');
    } else if (modId.indexOf('cargo') !== -1 || modId === 'mod_market_link') {
      scores.logistics += 1.2;
    } else if (modId.indexOf('fuel') !== -1 || modId.indexOf('drive') !== -1) {
      scores.courier += 1;
    }
  });

  Crew.getShipCrew(state, ship).forEach(function (crewMember) {
    if (crewMember.specialtyId === 'gray_channel') {
      scores.covert += 1.8;
      tags.push('黑市');
    } else if (crewMember.specialtyId === 'route_savant' || crewMember.specialtyId === 'void_runner') {
      scores.courier += 1.6;
      tags.push('快航');
    } else if (crewMember.specialtyId === 'container_architect' || crewMember.specialtyId === 'cold_chain_keeper') {
      scores.logistics += 1.5;
    } else if (crewMember.specialtyId === 'damage_control' || crewMember.specialtyId === 'salvage_rigger') {
      scores.support += 1.5;
      tags.push('维保');
    } else if (crewMember.specialtyId === 'salvage_logistician') {
      scores.survey += 1.2;
    }
  });

  var roleDefs = {
    logistics: { label: '主力商运', summary: '承担常规货运、套利与仓位效率。' },
    courier: { label: '快航中继', summary: '适合快线补给、短循环调度与响应。' },
    survey: { label: '勘探支援', summary: '偏向扫描折扣、探索收益与情报获取。' },
    covert: { label: '灰市突破', summary: '适合违禁品运输与黑市风险压制。' },
    support: { label: '后勤维护', summary: '擅长维保、修复与为舰队托底。' },
  };

  var bestRoleId = 'logistics';
  Object.keys(scores).forEach(function (roleId) {
    if (scores[roleId] > scores[bestRoleId]) bestRoleId = roleId;
  });

  return {
    id: bestRoleId,
    label: roleDefs[bestRoleId].label,
    summary: roleDefs[bestRoleId].summary,
    tags: Array.from(new Set(tags)).slice(0, 3),
  };
}

export function getShipDispatchProfile(state, ship) {
  var maintenance = getShipMaintenanceSummary(state, ship);
  var roleEffects = _getShipOperationalRoleEffects(state, ship);
  var activeFaultCount = ship && Array.isArray(ship.faults) ? ship.faults.length : 0;
  var faultPressure = activeFaultCount;

  if (maintenance.band === 'critical') faultPressure += 2;
  else if (maintenance.band === 'worn') faultPressure += 1;

  return {
    roleId: roleEffects.roleId,
    roleLabel: roleEffects.roleLabel,
    strategyLabel: roleEffects.dispatchStrategyLabel,
    strategyNote: roleEffects.dispatchStrategyNote,
    preferredRiskMode: roleEffects.preferredRiskMode,
    preferredMarketMode: roleEffects.preferredMarketMode,
    inspectionRiskMultiplier: roleEffects.inspectionRiskMultiplier,
    openMarketBonus: roleEffects.openMarketBonus,
    blackMarketBonus: roleEffects.blackMarketBonus,
    lowRiskBonus: roleEffects.lowRiskBonus,
    highRiskPenalty: roleEffects.highRiskPenalty,
    fuelCostWeight: roleEffects.fuelCostWeight,
    cargoValueWeight: roleEffects.cargoValueWeight,
    legalTradeBonus: roleEffects.legalTradeBonus,
    techRouteBonus: roleEffects.techRouteBonus,
    faultPressurePenalty: roleEffects.faultPressurePenalty,
    faultCount: activeFaultCount,
    faultPressure: faultPressure,
    maintenanceValue: maintenance.value,
    maintenanceBand: maintenance.band,
  };
}

export function getShipFaultSummaries(ship) {
  if (!ship) return [];
  _ensureShipOperationalState(ship);

  return ship.faults.map(function (faultId) {
    var fault = _getShipConditionFault(faultId);
    return fault ? Object.assign({}, fault) : null;
  }).filter(Boolean);
}

function _buildShipRepairDuration(profile, hullMissing, faultCount, roleEffects) {
  var rawDays = Math.ceil(
    Math.max(0, (100 - (profile && profile.value || 100)) / 45)
    + Math.max(0, hullMissing || 0) / 90
    + Math.max(0, faultCount || 0) * 0.75
  );
  var repairEfficiency = 0;
  if (roleEffects && roleEffects.serviceMaintenanceBonus) {
    repairEfficiency += Math.max(
      roleEffects.serviceMaintenanceBonus.quick || 0,
      roleEffects.serviceMaintenanceBonus.emergency || 0
    ) / 16;
  }
  if (roleEffects && roleEffects.serviceHullBonus) {
    repairEfficiency += Math.max(
      roleEffects.serviceHullBonus.overhaul || 0,
      roleEffects.serviceHullBonus.emergency || 0
    ) / 6;
  }
  return Math.max(
    REPAIR_JOB_MIN_DAYS,
    Math.min(REPAIR_JOB_MAX_DAYS, (rawDays || REPAIR_JOB_MIN_DAYS) - Math.floor(repairEfficiency))
  );
}

function _completeShipRepair(state, ship) {
  var clearedFaultIds = _clearShipFaults(ship, 'all');
  var clearedFaultLabels = clearedFaultIds.map(function (faultId) {
    var fault = _getShipConditionFault(faultId);
    return fault ? fault.label : faultId;
  });

  ship.maintenance = 100;
  ship.lastServiceDay = state.day || 1;
  ship.hull = ship.maxHull || ship.hull || 0;
  ship.repairJob = null;

  var detailParts = ['维护度恢复至 100%', '船体已完全修复'];
  if (clearedFaultLabels.length > 0) {
    detailParts.push('排除故障：' + clearedFaultLabels.join('、'));
  }

  return {
    text: '✅ 「' + ship.name + '」维修完成：' + detailParts.join('，') + '。',
    type: 'upgrade',
  };
}

export function getShipRepairQuote(state, shipIndex) {
  var ship = shipIndex != null ? state.fleet[shipIndex] : getActiveShip(state);
  if (!ship) return null;

  _ensureShipOperationalState(ship);

  var profile = getShipMaintenanceSummary(state, ship);
  var roleEffects = _getShipOperationalRoleEffects(state, ship);
  var faultSummaries = getShipFaultSummaries(ship);
  var hullMissing = Math.max(0, (ship.maxHull || ship.hull || 0) - (ship.hull || 0));
  var repairNeeded = profile.value < 99.5 || faultSummaries.length > 0 || hullMissing > 0;
  var durationDays = _buildShipRepairDuration(profile, hullMissing, faultSummaries.length, roleEffects);
  var cost = Math.max(80, Math.round(
    (profile.serviceCost + hullMissing * 2.5 + faultSummaries.length * 35)
    * (roleEffects.serviceCostMultiplier || 1)
  ));
  var disabledReason = '';

  if (ship.repairJob) disabledReason = '维修已在进行中';
  else if (ship.route) disabledReason = '派遣中无法入坞维修';
  else if (!repairNeeded) disabledReason = '当前无需维修';
  else if ((state.credits || 0) < cost) disabledReason = '积分不足';

  return {
    id: 'repair',
    name: '标准维修',
    icon: '🔧',
    desc: '扣款后进入维修队列，完成时恢复维护度、修复船体并清除故障。',
    cost: cost,
    durationDays: durationDays,
    targetMaintenance: 100,
    targetHull: ship.maxHull || ship.hull || 0,
    hullMissing: hullMissing,
    faultCount: faultSummaries.length,
    disabledReason: disabledReason,
    effectSummary: '完成后恢复维护度至 100%，修复 ' + hullMissing + ' 点船体缺口，并清除 ' + faultSummaries.length + ' 项故障。',
  };
}

export function getShipServiceOptions(state, shipIndex) {
  var quote = getShipRepairQuote(state, shipIndex);
  return quote ? [quote] : [];
}

export function serviceShip(state, shipIndex, tierId) {
  var ship = shipIndex != null ? state.fleet[shipIndex] : getActiveShip(state);
  if (!ship) {
    return { ok: false, msgs: [{ text: '❌ 无效的船只！', type: 'error' }] };
  }

  _ensureShipOperationalState(ship);
  var repairQuote = getShipRepairQuote(state, shipIndex);
  if (!repairQuote) {
    return { ok: false, msgs: [{ text: '❌ 无法生成维修方案！', type: 'error' }] };
  }
  if (repairQuote.disabledReason) {
    return { ok: false, msgs: [{ text: '🚫 ' + repairQuote.disabledReason + '。', type: 'error' }] };
  }

  state.credits -= repairQuote.cost;
  ship.repairJob = {
    remainingDays: repairQuote.durationDays,
    totalDays: repairQuote.durationDays,
    cost: repairQuote.cost,
    startedDay: state.day || 1,
  };

  return {
    ok: true,
    msgs: [{
      text: '🔧 「' + ship.name + '」已开始维修：花费 ' + repairQuote.cost.toLocaleString() + ' 积分，预计 ' + repairQuote.durationDays + ' 天后完成。',
      type: 'upgrade',
    }],
  };
}

export function applyTravelWear(state, shipIndex, travelMeta) {
  var ship = shipIndex != null ? state.fleet[shipIndex] : getActiveShip(state);
  if (!ship) return { ok: false, msgs: [] };

  _ensureShipOperationalState(ship);

  var beforeProfile = getShipMaintenanceSummary(state, ship);
  var modEffects = getShipModEffects(ship);
  var roleEffects = _getShipOperationalRoleEffects(state, ship);
  var serviceConfig = _getShipServiceConfig(ship);
  var faultEffects = _getShipFaultEffects(state, ship);
  var cargoLoadRatio = _getShipCargoUsed(ship) / Math.max(1, ship.maxCargo || 1);
  var fuelCost = Number.isFinite(travelMeta && travelMeta.fuelCost) ? travelMeta.fuelCost : 0;
  var baseWear = travelMeta && travelMeta.crossGalaxy ? 6 : (travelMeta && travelMeta.secretRoute ? 2.5 : 3.5);
  var wear = _roundOpsValue(
    (baseWear + Math.min(4, fuelCost * 0.08) + cargoLoadRatio * 2)
    * serviceConfig.maintenanceDecay
    * (modEffects.maintenanceDecayMultiplier || 1)
    * (roleEffects.travelWearMultiplier || 1)
    * (faultEffects.travelWearMultiplier || 1)
  );

  if (wear <= 0) return { ok: true, msgs: [], meta: { wear: 0, maintenance: ship.maintenance } };

  ship.maintenance = _clampMaintenance(ship.maintenance - wear);
  var afterProfile = getShipMaintenanceSummary(state, ship);
  var msgs = [];
  _pushMaintenanceTransitionMsg(ship, beforeProfile, afterProfile, msgs);
  _maybeTriggerConditionFault(state, ship, {
    travelWear: wear,
    maintenanceBand: afterProfile.band,
  }, msgs);

  return {
    ok: true,
    msgs: msgs,
    meta: {
      wear: wear,
      maintenance: ship.maintenance,
    },
  };
}

export function advanceFleetDay(state) {
  var msgs = [];
  var totalUpkeep = 0;
  var unpaidShips = [];

  (state.fleet || []).forEach(function (ship) {
    _ensureShipOperationalState(ship);

    var beforeProfile = getShipMaintenanceSummary(state, ship);
    var upkeep = beforeProfile.upkeepCost || 0;
    var paid = Math.min(Math.max(0, state.credits || 0), upkeep);
    var unpaid = Math.max(0, upkeep - paid);

    if (paid > 0) {
      state.credits -= paid;
      totalUpkeep += paid;
    }

    if (ship.repairJob) {
      ship.repairJob.remainingDays = Math.max(0, ship.repairJob.remainingDays - 1);
      if (ship.repairJob.remainingDays <= 0) {
        msgs.push(_completeShipRepair(state, ship));
      }
      return;
    }

    var decay = beforeProfile.dailyDecay || 0;
    if (unpaid > 0) {
      unpaidShips.push(ship.name);
      decay += Math.min(12, unpaid / Math.max(4, _getShipServiceConfig(ship).serviceRate));
    }

    ship.maintenance = _clampMaintenance(ship.maintenance - decay);

    var repairAmount = 0;
    if ((ship.hull || 0) < (ship.maxHull || ship.hull || 0)) {
      repairAmount = Math.min(
        (ship.maxHull || ship.hull || 0) - (ship.hull || 0),
        getEffectiveShipStats(state, ship).autoRepair || 0
      );
      if (repairAmount > 0) {
        ship.hull = Math.min(ship.maxHull, ship.hull + repairAmount);
      }
    }

    var afterProfile = getShipMaintenanceSummary(state, ship);
    _pushMaintenanceTransitionMsg(ship, beforeProfile, afterProfile, msgs);
    _maybeTriggerConditionFault(state, ship, {
      unpaidUpkeep: unpaid,
      maintenanceBand: afterProfile.band,
    }, msgs);
  });

  if (totalUpkeep > 0) {
    msgs.unshift({ text: '🧰 舰队日常养护支出 ' + totalUpkeep.toLocaleString() + ' 积分。', type: 'info' });
  }
  if (unpaidShips.length > 0) {
    msgs.push({ text: '💸 养护资金不足：' + unpaidShips.join('、') + ' 维护损耗加剧。', type: 'error' });
  }

  syncStateFromShip(state);
  return { msgs: msgs };
}

/**
 * 获取船型信息
 */
export function getShipType(typeId) {
  return SHIP_TYPES.find(function (s) { return s.id === typeId; });
}

export function getShipSpecializationSummary(state, ship) {
  if (!ship) return null;
  ensureShipSpecializationState(ship, getShipType(ship.typeId));
  return buildShipSpecializationProfile(ship, state ? state.day : 1);
}

export function setShipDoctrine(state, shipIndex, doctrineId) {
  var ship = shipIndex != null ? state.fleet[shipIndex] : getActiveShip(state);
  if (!ship) {
    return { ok: false, msgs: [{ text: '❌ 无效的船只！', type: 'error' }] };
  }
  if (!SHIP_DOCTRINES[doctrineId]) {
    return { ok: false, msgs: [{ text: '❌ 未知专精协议！', type: 'error' }] };
  }

  var specialization = ensureShipSpecializationState(ship, getShipType(ship.typeId));
  if (specialization.activeProtocol && (specialization.activeProtocol.remainingCharges || 0) > 0) {
    return { ok: false, msgs: [{ text: '⚠️ 当前战术协议仍在运行，请先消耗完协议效果。', type: 'error' }] };
  }
  if (specialization.doctrine === doctrineId) {
    return { ok: false, msgs: [{ text: 'ℹ️ 这艘船已经启用该专精协议。', type: 'info' }] };
  }

  specialization.doctrine = doctrineId;
  var doctrine = getDoctrine(doctrineId);
  return {
    ok: true,
    msgs: [{ text: '🧠 「' + ship.name + '」已切换至「' + doctrine.name + '」。', type: 'upgrade' }],
  };
}

export function activateShipProtocol(state, shipIndex) {
  var ship = shipIndex != null ? state.fleet[shipIndex] : getActiveShip(state);
  if (!ship) {
    return { ok: false, msgs: [{ text: '❌ 无效的船只！', type: 'error' }] };
  }

  var specialization = ensureShipSpecializationState(ship, getShipType(ship.typeId));
  var doctrineId = specialization.doctrine;
  var doctrine = getDoctrine(doctrineId);
  var level = getMasteryLevel((specialization.xp && specialization.xp[doctrineId]) || 0);
  var currentDay = state.day || 1;
  var readyDay = specialization.protocolCooldowns[doctrineId] || 0;

  if (level <= 0) {
    return { ok: false, msgs: [{ text: '🔒 当前专精达到 Lv.1 后才能启动战术协议。', type: 'error' }] };
  }
  if (specialization.activeProtocol && (specialization.activeProtocol.remainingCharges || 0) > 0) {
    return { ok: false, msgs: [{ text: '⚙️ 已有战术协议运行中，请先完成当前协议。', type: 'error' }] };
  }
  if (currentDay < readyDay) {
    return { ok: false, msgs: [{ text: '⏳ 协议冷却中，还需 ' + (readyDay - currentDay) + ' 天。', type: 'error' }] };
  }

  specialization.activeProtocol = createDoctrineProtocol(doctrineId, level, currentDay);
  specialization.protocolCooldowns[doctrineId] = currentDay + (doctrine.protocol.cooldownDays || 4);

  return {
    ok: true,
    msgs: [{
      text: doctrine.protocol.icon + ' 「' + ship.name + '」启动「' + doctrine.protocol.name + '」：' + doctrine.protocol.desc,
      type: 'upgrade',
    }],
  };
}

export function consumeShipProtocol(state, shipIndex, triggerId) {
  var ship = shipIndex != null ? state.fleet[shipIndex] : getActiveShip(state);
  if (!ship) return { ok: false, msgs: [] };

  var specialization = ensureShipSpecializationState(ship, getShipType(ship.typeId));
  var activeProtocol = specialization.activeProtocol;
  if (!activeProtocol || (activeProtocol.remainingCharges || 0) <= 0) {
    return { ok: false, msgs: [] };
  }

  var doctrine = getDoctrine(activeProtocol.doctrineId);
  if (!doctrine.protocol || doctrine.protocol.trigger !== triggerId) {
    return { ok: false, msgs: [] };
  }

  activeProtocol.remainingCharges = Math.max(0, (activeProtocol.remainingCharges || 0) - 1);
  if (activeProtocol.remainingCharges > 0) {
    return { ok: true, consumed: true, msgs: [] };
  }

  specialization.activeProtocol = null;
  return {
    ok: true,
    consumed: true,
    msgs: [{ text: '✨ 「' + ship.name + '」的「' + doctrine.protocol.name + '」已结束并进入冷却。', type: 'info' }],
  };
}

export function recordShipActivity(state, activityId, payload, shipIndex) {
  var ship = shipIndex != null ? state.fleet[shipIndex] : getActiveShip(state);
  if (!ship) return { ok: false, msgs: [] };

  var specialization = ensureShipSpecializationState(ship, getShipType(ship.typeId));
  var awards = _getActivityAwards(activityId, payload || {});
  var msgs = [];

  awards.forEach(function (award) {
    if (!award || !award.trackId || !Number.isFinite(award.xp) || award.xp <= 0) return;
    var beforeLevel = getMasteryLevel((specialization.xp[award.trackId] || 0));
    specialization.xp[award.trackId] = (specialization.xp[award.trackId] || 0) + award.xp;
    var afterLevel = getMasteryLevel(specialization.xp[award.trackId] || 0);
    if (afterLevel > beforeLevel) {
      var track = getMasteryTrack(award.trackId);
      msgs.push({
        text: track.icon + ' 「' + ship.name + '」' + track.name + '提升至 Lv.' + afterLevel + '！',
        type: 'upgrade',
      });
    }
  });

  return { ok: true, msgs: msgs, awards: awards };
}

function _getActivityAwards(activityId, payload) {
  if (activityId === 'trade_buy') {
    return [{ trackId: 'trade', xp: Math.max(3, Math.ceil((payload.quantity || 1) / 2)) }];
  }
  if (activityId === 'trade_sell') {
    return [{
      trackId: 'trade',
      xp: Math.max(4, Math.ceil((payload.quantity || 1) / 2) + Math.ceil(Math.max(0, payload.profit || 0) / 240)),
    }];
  }
  if (activityId === 'travel') {
    return [{
      trackId: 'navigation',
      xp: payload.crossGalaxy ? 14 : (payload.secretRoute ? 10 : 6),
    }];
  }
  if (activityId === 'scan') {
    return [{ trackId: 'exploration', xp: 12 }];
  }
  if (activityId === 'land') {
    return [{ trackId: 'exploration', xp: 8 }];
  }
  if (activityId === 'poi') {
    return [{ trackId: 'exploration', xp: 14 }];
  }
  if (activityId === 'smuggling_evaded') {
    return [{ trackId: 'navigation', xp: 6 }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// 派遣贸易路线
// ---------------------------------------------------------------------------

/**
 * 计算燃料消耗
 */
function _fuelCost(state, fromId, toId, fuelEff) {
  return Economy.getFuelCost(fromId, toId, fuelEff, state);
}

function _isCrossGalaxyTravel(fromId, toId) {
  var fromSystem = findSystem(fromId);
  var toSystem = findSystem(toId);
  return !!fromSystem && !!toSystem && fromSystem.galaxyId !== toSystem.galaxyId;
}

export function getEffectiveShipStats(state, ship) {
  if (!ship) {
    return {
      maxCargo: 0,
      fuelEff: 1,
      autoRepair: 0,
      buyDiscount: 0,
      sellBonus: 0,
      eventChanceMultiplier: 1,
      smugglingCheckMultiplier: 1,
      smugglingFineMultiplier: 1,
      smugglingHullMultiplier: 1,
      scanFuelDiscount: 0,
      landingFeeDiscount: 0,
      poiRewardMultiplier: 1,
      forceDeepScan: false,
      specialization: null,
      maintenance: getShipMaintenanceSummary(state, null),
      roleProfile: getShipRoleProfile(state, null),
      dispatchProfile: getShipDispatchProfile(state, null),
      upkeepCost: 0,
      crewEffects: {},
    };
  }

  var crewEffects = Crew.getShipEffects(state, ship);
  var modEffects = getShipModEffects(ship);
  var faultEffects = _getShipFaultEffects(state, ship);
  var specialization = getShipSpecializationSummary(state, ship);
  var specEffects = specialization ? specialization.effects : {};
  var maintenance = getShipMaintenanceSummary(state, ship);
  var roleProfile = getShipRoleProfile(state, ship);
  var faultSummaries = getShipFaultSummaries(ship);
  var dispatchProfile = getShipDispatchProfile(state, ship);

  return {
    maxCargo: Math.max(1, Math.round(ship.maxCargo + (crewEffects.cargo || 0) + (specEffects.cargoBonus || 0) - (faultEffects.cargoPenalty || 0))),
    fuelEff: Math.max(
      ship.minFuelEff || 0.1,
      Math.round(ship.fuelEff * (crewEffects.fuelEffMultiplier || 1) * (specEffects.fuelEffMultiplier || 1) * (maintenance.fuelEffMultiplier || 1) * (faultEffects.fuelEffMultiplier || 1) * 10000) / 10000
    ),
    autoRepair: Math.round(((crewEffects.autoRepair || 0) + (modEffects.autoRepair || 0)) * (maintenance.autoRepairMultiplier || 1) * 10) / 10,
    buyDiscount: (crewEffects.buyDiscount || 0) + (modEffects.buyDiscount || 0) + (specEffects.buyDiscount || 0) + (faultEffects.buyDiscount || 0),
    sellBonus: (crewEffects.sellBonus || 0) + (modEffects.sellBonus || 0) + (specEffects.sellBonus || 0) + (faultEffects.sellBonus || 0),
    eventChanceMultiplier: (specEffects.eventChanceMultiplier || 1) * (maintenance.eventChanceMultiplier || 1) * (faultEffects.eventChanceMultiplier || 1),
    smugglingCheckMultiplier: (specEffects.smugglingCheckMultiplier || 1) * (modEffects.smugglingCheckMultiplier || 1) * (maintenance.smugglingCheckMultiplier || 1),
    smugglingFineMultiplier: (specEffects.smugglingFineMultiplier || 1) * (modEffects.smugglingFineMultiplier || 1),
    smugglingHullMultiplier: specEffects.smugglingHullMultiplier || 1,
    scanFuelDiscount: Math.min(0.95, ((specEffects.scanFuelDiscount || 0) + (modEffects.scanFuelDiscount || 0)) * (faultEffects.scanFuelDiscountMultiplier || 1)),
    landingFeeDiscount: specEffects.landingFeeDiscount || 0,
    poiRewardMultiplier: (specEffects.poiRewardMultiplier || 1) * (modEffects.poiRewardMultiplier || 1),
    forceDeepScan: !!specEffects.forceDeepScan,
    specialization: specialization,
    maintenance: maintenance,
    faults: faultSummaries,
    roleProfile: roleProfile,
    dispatchProfile: dispatchProfile,
    upkeepCost: maintenance.upkeepCost || 0,
    crewEffects: crewEffects,
  };
}

function _formatTradePolicySummary(policy) {
  var normalized = AutoTrade.normalizeTradePolicy(policy);
  var parts = [];
  parts.push(normalized.marketMode === 'black' ? '黑市' : '公开');
  if (normalized.maxBuyPrice != null) parts.push('买入≤' + normalized.maxBuyPrice);
  if (normalized.minSellPrice != null) parts.push('卖出≥' + normalized.minSellPrice);
  if (normalized.minProfitRate != null) parts.push('利润率≥' + Math.round(normalized.minProfitRate * 100) + '%');
  if (normalized.riskMode === 'safe') parts.push('保守');
  else if (normalized.riskMode === 'aggressive') parts.push('激进');
  else parts.push('平衡');
  return parts.join(' · ');
}

function _queuePolicyMessage(route, msgs, text) {
  if (!route || !text || route.lastPolicyMessage === text) return;
  route.lastPolicyMessage = text;
  msgs.push({ text: text, type: 'info' });
}

function _clearPolicyMessage(route) {
  if (!route) return;
  route.lastPolicyMessage = null;
}

export function bumpRouteRevision(ship) {
  if (!ship) return 0;
  ship.routeRevision = (ship.routeRevision || 0) + 1;
  return ship.routeRevision;
}

function _getRouteSellPrice(state, route) {
  if (route.marketMode === 'black' && AutoTrade.canUseMarket(state, route.sellSystemId, 'black') && Economy.isBlackMarketGood(route.goodId)) {
    return Economy.getBlackMarketSellPrice(route.sellSystemId, route.goodId, state);
  }
  return Economy.getSellPrice(route.sellSystemId, route.goodId, state);
}

function _handleShipSmugglingCheck(state, ship, route, msgs) {
  if (!route || route.marketMode !== 'black') return false;

  var shipStats = getEffectiveShipStats(state, ship);

  var result = Economy.checkSmugglingCargo(state, ship.location, ship.cargo, {
    applyHullDamage: function (damage) {
      ship.hull = Math.max(1, (ship.hull || ship.maxHull || 100) - damage);
    },
    checkChanceMultiplier: shipStats.smugglingCheckMultiplier || 1,
    fineMultiplier: shipStats.smugglingFineMultiplier || 1,
    hullDamageMultiplier: shipStats.smugglingHullMultiplier || 1,
  });

  result.msgs.forEach(function (msg) {
    msgs.push({ text: '🚨 「' + ship.name + '」' + msg.text.replace(/^🚨\s*/, ''), type: msg.type });
  });

  if (result.caught) {
    ship.route = null;
    msgs.push({ text: '⏹️ 「' + ship.name + '」黑市派遣因走私被查获而中止。', type: 'error' });
    return true;
  }

  return false;
}

export function getRouteDisplayInfo(state, ship, shipIndex) {
  var descriptor = RouteModel.getShipRouteDescriptor(state, ship, shipIndex);
  if (!descriptor) return null;

  return {
    startSystemId: descriptor.startSystemId,
    endSystemId: descriptor.endSystemId,
    statusLabel: descriptor.statusLabel,
    sameSystemRoute: descriptor.sameSystemRoute,
  };
}

/**
 * 为船只分配贸易路线（派遣）
 * 支持激活船只和非激活船只
 * @param {object} state
 * @param {number} shipIndex
 * @param {string} buySystemId  买入星系
 * @param {string} sellSystemId 卖出星系
 * @param {string} goodId       贸易商品
 * @param {object} [tradePolicy]  自动贸易策略 { marketMode, maxBuyPrice, minSellPrice, minProfitRate, riskMode }
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function assignRoute(state, shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) {
  var ship = state.fleet[shipIndex];
  if (!ship) {
    return { ok: false, msgs: [{ text: '❌ 无效的船只！', type: 'error' }] };
  }
  _ensureShipOperationalState(ship);
  if (ship.repairJob) {
    return { ok: false, msgs: [{ text: '🔧 该船正在维修中，完成前无法派遣。', type: 'error' }] };
  }

  var busSys  = findSystem(buySystemId);
  var sellSys = findSystem(sellSystemId);
  var good    = GOODS.find(function (g) { return g.id === goodId; });

  if (!busSys || !sellSys || !good) {
    return { ok: false, msgs: [{ text: '❌ 无效的路线参数！', type: 'error' }] };
  }
  var normalizedPolicy = AutoTrade.normalizeTradePolicy(tradePolicy);
  if (!AutoTrade.isGoodAllowedInMarket(good, normalizedPolicy.marketMode)) {
    return { ok: false, msgs: [{ text: normalizedPolicy.marketMode === 'black' ? '⚠️ 该商品无法在黑市派遣中交易。' : '⚠️ 派遣贸易当前仅支持公开市场商品。', type: 'error' }] };
  }
  if (!AutoTrade.canUseMarket(state, buySystemId, normalizedPolicy.marketMode)) {
    return { ok: false, msgs: [{ text: normalizedPolicy.marketMode === 'black' ? '🔒 黑市派遣的买入地必须具备黑市访问资格。' : '⚠️ 当前路线无法访问所选市场。', type: 'error' }] };
  }

  // 设置路线，船只从当前位置开始
  ship.location = ship.location || state.currentSystem;
  var routeRevision = bumpRouteRevision(ship);
  ship.route = {
    buySystemId:  buySystemId,
    sellSystemId: sellSystemId,
    goodId:       goodId,
    status:       'traveling_buy',  // 先前往买入地
    tradePolicy:  normalizedPolicy,
    marketMode:   normalizedPolicy.marketMode,
    lastBuyPrice: null,
    lastPolicyMessage: null,
    revision:     routeRevision,
  };

  var policySummary = _formatTradePolicySummary(normalizedPolicy);

  return {
    ok: true,
    msgs: [{
      text: '📡 「' + ship.emoji + ' ' + ship.name + '」已派遣！路线：' +
            busSys.name + '(' + good.emoji + good.name + ') → ' + sellSys.name +
            (policySummary ? ' · 策略：' + policySummary : ''),
      type: 'info',
    }],
  };
}

/**
 * 取消船只派遣
 */
export function cancelRoute(state, shipIndex) {
  var ship = state.fleet[shipIndex];
  if (!ship) {
    return { ok: false, msgs: [{ text: '❌ 无效的船只！', type: 'error' }] };
  }
  if (!ship.route) {
    return { ok: false, msgs: [{ text: '⚠️ 该船只未在派遣中！', type: 'info' }] };
  }
  bumpRouteRevision(ship);
  ship.route = null;
  return {
    ok: true,
    msgs: [{ text: '⏹️ 「' + ship.emoji + ' ' + ship.name + '」已召回。', type: 'info' }],
  };
}

/**
 * 每日结算 — 所有派遣中的船只（不含激活船只）执行一步贸易
 * 在 GameManager._handleTravel 中每天调用
 * @param {object} state
 * @returns {{ msgs: Array }}  所有船只行为的日志
 */
export function tickFleetRoutes(state) {
  var msgs = [];

  state.fleet.forEach(function (ship, idx) {
    if (idx === state.activeShipIndex) return; // 激活船只由玩家直接控制或由自动派遣定时器处理
    if (!ship.route) return;

    var route = ship.route;
    var loc   = ship.location || state.currentSystem;

    switch (route.status) {
      // ---- 前往买入星系 ----
      case 'traveling_buy': {
        if (loc === route.buySystemId) {
          route.status = 'buying';
          // 立即执行买入
          _doShipBuy(state, ship, route, msgs);
        } else {
          var cost = _fuelCost(state, loc, route.buySystemId, getEffectiveShipStats(state, ship).fuelEff);
          var crossGalaxyBuyTravel = _isCrossGalaxyTravel(loc, route.buySystemId);
          if (ship.fuel < cost) {
            // 尝试用积分补燃料
            _autoRefuelShip(state, ship, cost, msgs);
            if (ship.fuel < cost) {
              msgs.push({ text: '⚠️ 「' + ship.emoji + ship.name + '」燃料不足，派遣已暂停。', type: 'error' });
              ship.route = null;
              return;
            }
          }
          ship.fuel    -= cost;
          ship.location = route.buySystemId;
          applyTravelWear(state, idx, { fuelCost: cost, crossGalaxy: crossGalaxyBuyTravel, secretRoute: false }).msgs.forEach(function (m) { msgs.push(m); });
          msgs.push({ text: '🚀 「' + ship.name + '」抵达买入地。', type: 'travel' });
          if (_handleShipSmugglingCheck(state, ship, route, msgs)) return;
          recordShipActivity(state, 'travel', { secretRoute: false, crossGalaxy: crossGalaxyBuyTravel }, idx).msgs.forEach(function (m) { msgs.push(m); });
          consumeShipProtocol(state, idx, 'travel').msgs.forEach(function (m) { msgs.push(m); });
          _doShipBuy(state, ship, route, msgs);
        }
        break;
      }

      // ---- 买入 ----
      case 'buying': {
        _doShipBuy(state, ship, route, msgs);
        break;
      }

      // ---- 前往卖出星系 ----
      case 'traveling_sell': {
        if (loc === route.sellSystemId) {
          route.status = 'selling';
          _doShipSell(state, ship, route, msgs);
        } else {
          var cost2 = _fuelCost(state, loc, route.sellSystemId, getEffectiveShipStats(state, ship).fuelEff);
          var crossGalaxySellTravel = _isCrossGalaxyTravel(loc, route.sellSystemId);
          if (ship.fuel < cost2) {
            _autoRefuelShip(state, ship, cost2, msgs);
            if (ship.fuel < cost2) {
              msgs.push({ text: '⚠️ 「' + ship.emoji + ship.name + '」燃料不足，派遣已暂停。', type: 'error' });
              ship.route = null;
              return;
            }
          }
          ship.fuel    -= cost2;
          ship.location = route.sellSystemId;
          applyTravelWear(state, idx, { fuelCost: cost2, crossGalaxy: crossGalaxySellTravel, secretRoute: false }).msgs.forEach(function (m) { msgs.push(m); });
          msgs.push({ text: '🚀 「' + ship.name + '」抵达卖出地。', type: 'travel' });
          if (_handleShipSmugglingCheck(state, ship, route, msgs)) return;
          recordShipActivity(state, 'travel', { secretRoute: false, crossGalaxy: crossGalaxySellTravel }, idx).msgs.forEach(function (m) { msgs.push(m); });
          consumeShipProtocol(state, idx, 'travel').msgs.forEach(function (m) { msgs.push(m); });
          _doShipSell(state, ship, route, msgs);
        }
        break;
      }

      // ---- 卖出 ----
      case 'selling': {
        _doShipSell(state, ship, route, msgs);
        break;
      }
    }
  });

  return { msgs: msgs };
}

/**
 * 船只自动买入
 */
function _doShipBuy(state, ship, route, msgs) {
  var effective = getEffectiveShipStats(state, ship);
  var isBlack = route.marketMode === 'black';
  var buyPrice = isBlack
    ? Economy.getBlackMarketBuyPrice(route.buySystemId, route.goodId, state)
    : Economy.getBuyPrice(route.buySystemId, route.goodId, state);
  var sellPrice = _getRouteSellPrice(state, route);
  var policyCheck = AutoTrade.evaluateTradePolicy(buyPrice, sellPrice, route.tradePolicy);

  if (!policyCheck.ok) {
    _queuePolicyMessage(
      route,
      msgs,
      '⏸️ 「' + ship.name + '」在' + _sysName(route.buySystemId) + '等待买点：' + policyCheck.reasons.join('、') + '。'
    );
    route.status = 'buying';
    return;
  }

  var cargoUsed = Object.values(ship.cargo).reduce(function (s, q) { return s + q; }, 0);
  var space     = effective.maxCargo - cargoUsed;
  var canAfford = Math.floor(state.credits / buyPrice);
  var qty       = Math.min(space, canAfford);

  if (qty <= 0) {
    msgs.push({ text: '💰 「' + ship.name + '」买入失败（积分或货舱不足）。', type: 'error' });
    route.status = 'traveling_sell'; // 跳过买入，尝试卖出剩余货物
    return;
  }

  var totalCost = qty * buyPrice;
  state.credits -= totalCost;
  ship.cargo[route.goodId] = (ship.cargo[route.goodId] || 0) + qty;
  route.lastBuyPrice = buyPrice;
  _clearPolicyMessage(route);
  if (isBlack) {
    Economy.recordBlackMarketTrade(state);
  }
  Economy.onPlayerBuy(route.buySystemId, route.goodId, qty);

  var good = GOODS.find(function (g) { return g.id === route.goodId; });
  msgs.push({
    text: (isBlack ? '🕶 ' : '📦 ') + '「' + ship.name + '」在' + _sysName(route.buySystemId) + (isBlack ? '黑市' : '') + '买入 ' + qty + ' 单位' + good.name + '，花费 ' + totalCost + ' 积分。',
    type: 'buy',
  });

  recordShipActivity(state, 'trade_buy', { quantity: qty }, state.fleet.indexOf(ship)).msgs.forEach(function (m) { msgs.push(m); });
  consumeShipProtocol(state, state.fleet.indexOf(ship), 'trade').msgs.forEach(function (m) { msgs.push(m); });

  route.status = 'traveling_sell';
}

/**
 * 船只自动卖出
 */
function _doShipSell(state, ship, route, msgs) {
  var isBlack = route.marketMode === 'black';
  var qty = ship.cargo[route.goodId] || 0;
  if (qty <= 0) {
    // 没有货物，重新开始循环
    _clearPolicyMessage(route);
    route.status = 'traveling_buy';
    return;
  }

  var sellPrice  = _getRouteSellPrice(state, route);
  var buyReference = route.lastBuyPrice != null ? route.lastBuyPrice : (isBlack
    ? Economy.getBlackMarketBuyPrice(route.buySystemId, route.goodId, state)
    : Economy.getBuyPrice(route.buySystemId, route.goodId, state));
  var policyCheck = AutoTrade.evaluateTradePolicy(buyReference, sellPrice, route.tradePolicy);

  if (!policyCheck.ok) {
    _queuePolicyMessage(
      route,
      msgs,
      '⏸️ 「' + ship.name + '」在' + _sysName(route.sellSystemId) + '等待卖点：' + policyCheck.reasons.join('、') + '。'
    );
    route.status = 'selling';
    return;
  }

  var totalEarned = qty * sellPrice;
  state.credits += totalEarned;
  delete ship.cargo[route.goodId];
  route.lastBuyPrice = null;
  _clearPolicyMessage(route);
  if (isBlack) {
    Economy.recordBlackMarketTrade(state);
  }
  Economy.onPlayerSell(route.sellSystemId, route.goodId, qty);

  var good = GOODS.find(function (g) { return g.id === route.goodId; });
  msgs.push({
    text: (isBlack ? '🕶 ' : '💰 ') + '「' + ship.name + '」在' + _sysName(route.sellSystemId) + (isBlack ? '黑市' : '') + '卖出 ' + qty + ' 单位' + good.name + '，获得 ' + totalEarned + ' 积分。',
    type: 'sell',
  });

  recordShipActivity(state, 'trade_sell', { quantity: qty, profit: totalEarned - (buyReference * qty) }, state.fleet.indexOf(ship)).msgs.forEach(function (m) { msgs.push(m); });
  consumeShipProtocol(state, state.fleet.indexOf(ship), 'trade').msgs.forEach(function (m) { msgs.push(m); });

  // 循环：重新前往买入地
  route.status = 'traveling_buy';
}

/**
 * 自动给派遣船只补燃料
 */
function _autoRefuelShip(state, ship, needed, msgs) {
  var deficit = needed - ship.fuel;
  if (deficit <= 0) return;
  var fuelPrice = Economy.getBuyPrice(ship.location || 'imperial_capital', 'fuel', state);
  var canBuy    = Math.floor(state.credits / fuelPrice);
  var toBuy     = Math.min(Math.ceil(deficit), canBuy, ship.maxFuel - ship.fuel);
  if (toBuy <= 0) return;

  var cost = toBuy * fuelPrice;
  state.credits -= cost;
  ship.fuel     += toBuy;
  msgs.push({ text: '⚡ 「' + ship.name + '」补充了 ' + toBuy + ' 燃料（' + cost + ' 积分）。', type: 'info' });
}

/**
 * 获取星系名称
 */
function _sysName(sysId) {
  var sys = findSystem(sysId);
  return sys ? sys.name : sysId;
}

// ---------------------------------------------------------------------------
// 激活船只派遣（自动贸易）
// ---------------------------------------------------------------------------

/**
 * 检查激活船只是否已派遣
 */
export function isActiveDispatched(state) {
  var ship = getActiveShip(state);
  return ship && ship.route != null;
}

/**
 * 为激活船只设置派遣路线
 */
export function dispatchActiveShip(state, buySystemId, sellSystemId, goodId, tradePolicy) {
  return assignRoute(state, state.activeShipIndex, buySystemId, sellSystemId, goodId, tradePolicy);
}

/**
 * 取消激活船只的派遣
 */
export function cancelActiveDispatch(state) {
  return cancelRoute(state, state.activeShipIndex);
}

/**
 * 激活船只派遣 tick（由定时器调用）
 * 处理激活船只的自动贸易流程
 * @returns {{ msgs: Array, needTravel: string|null }}  needTravel 表示需要前往的星系
 */
export function tickActiveShipDispatch(state) {
  var msgs = [];
  var ship = getActiveShip(state);
  if (!ship || !ship.route) return { msgs: msgs, needTravel: null, needBuy: null, needSell: null };

  ship.location = state.currentSystem || ship.location;
  var route = ship.route;

  switch (route.status) {
    case 'traveling_buy': {
      if (state.currentSystem === route.buySystemId) {
        route.status = 'buying';
        return { msgs: msgs, needTravel: null, needBuy: route, needSell: null };
      }
      return { msgs: msgs, needTravel: route.buySystemId, needBuy: null, needSell: null };
    }
    case 'buying': {
      return { msgs: msgs, needTravel: null, needBuy: route, needSell: null };
    }
    case 'traveling_sell': {
      if (state.currentSystem === route.sellSystemId) {
        route.status = 'selling';
        return { msgs: msgs, needTravel: null, needBuy: null, needSell: route };
      }
      return { msgs: msgs, needTravel: route.sellSystemId, needBuy: null, needSell: null };
    }
    case 'selling': {
      return { msgs: msgs, needTravel: null, needBuy: null, needSell: route };
    }
  }
  return { msgs: msgs, needTravel: null, needBuy: null, needSell: null };
}

// ---------------------------------------------------------------------------
// 飞船改装系统
// ---------------------------------------------------------------------------

/**
 * 为指定船只安装改装组件
 * @param {object} state
 * @param {string} modId   SHIP_MODS 中的 id
 * @param {number} [shipIndex] 船只索引，默认为激活船只
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function installMod(state, modId, shipIndex) {
  var mod = SHIP_MODS.find(function (m) { return m.id === modId; });
  if (!mod) return { ok: false, msgs: [{ text: '❌ 未知改装组件！', type: 'error' }] };

  if (shipIndex != null && (shipIndex < 0 || shipIndex >= state.fleet.length)) {
    return { ok: false, msgs: [{ text: '❌ 无效的船只索引！', type: 'error' }] };
  }
  var ship = shipIndex != null ? state.fleet[shipIndex] : getActiveShip(state);
  if (!ship) return { ok: false, msgs: [{ text: '❌ 无效的船只！', type: 'error' }] };

  if (!ship.mods) ship.mods = [];

  // 检查是否已安装
  if (ship.mods.includes(modId)) {
    return { ok: false, msgs: [{ text: '🔧 该组件已安装！', type: 'error' }] };
  }

  // 检查前置条件
  if (mod.requires) {
    if (!ship.mods.includes(mod.requires)) {
      var reqMod = SHIP_MODS.find(function (m) { return m.id === mod.requires; });
      var reqName = reqMod ? reqMod.name : mod.requires;
      return { ok: false, msgs: [{ text: '❌ 需要先安装「' + reqName + '」！', type: 'error' }] };
    }
  }

  // 检查改装槽位
  if (ship.mods.length >= (ship.modSlots || 1)) {
    return { ok: false, msgs: [{ text: '🚫 改装槽位已满！请先拆卸已有组件。', type: 'error' }] };
  }

  // 检查积分
  if (state.credits < mod.cost) {
    return { ok: false, msgs: [{ text: '💰 积分不足！需要 ' + mod.cost.toLocaleString() + ' 积分。', type: 'error' }] };
  }

  // 扣费并安装
  state.credits -= mod.cost;
  ship.mods.push(modId);

  // 应用效果
  _applyModEffect(ship, mod.effect, 1);

  // 如果是激活船只，同步到 state
  var actualIndex = shipIndex != null ? shipIndex : state.activeShipIndex;
  if (actualIndex === state.activeShipIndex) {
    syncStateFromShip(state);
  }

  return {
    ok: true,
    msgs: [{ text: '🔧 「' + ship.name + '」安装改装组件：' + mod.emoji + ' ' + mod.name + '！', type: 'upgrade' }],
  };
}

/**
 * 拆卸指定船只的改装组件
 * @param {object} state
 * @param {string} modId
 * @param {number} [shipIndex]
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function uninstallMod(state, modId, shipIndex) {
  var mod = SHIP_MODS.find(function (m) { return m.id === modId; });
  if (!mod) return { ok: false, msgs: [{ text: '❌ 未知改装组件！', type: 'error' }] };

  if (shipIndex != null && (shipIndex < 0 || shipIndex >= state.fleet.length)) {
    return { ok: false, msgs: [{ text: '❌ 无效的船只索引！', type: 'error' }] };
  }
  var ship = shipIndex != null ? state.fleet[shipIndex] : getActiveShip(state);
  if (!ship) return { ok: false, msgs: [{ text: '❌ 无效的船只！', type: 'error' }] };

  if (!ship.mods || !ship.mods.includes(modId)) {
    return { ok: false, msgs: [{ text: '⚠️ 未安装该组件！', type: 'error' }] };
  }

  // 联动卸载：如果有其他改装依赖当前改装，一并拆卸
  var dependents = SHIP_MODS.filter(function (m) {
    return m.requires === modId && ship.mods.includes(m.id);
  });
  var cascadeMsgs = [];
  dependents.forEach(function (dep) {
    ship.mods = ship.mods.filter(function (id) { return id !== dep.id; });
    _applyModEffect(ship, dep.effect, -1);
    cascadeMsgs.push({ text: '🔧 联动拆卸了依赖组件：' + dep.emoji + ' ' + dep.name, type: 'info' });
  });

  // 移除组件
  ship.mods = ship.mods.filter(function (id) { return id !== modId; });

  // 反向应用效果
  _applyModEffect(ship, mod.effect, -1);

  // 如果是激活船只，同步到 state
  var actualIndex = shipIndex != null ? shipIndex : state.activeShipIndex;
  if (actualIndex === state.activeShipIndex) {
    syncStateFromShip(state);
  }

  return {
    ok: true,
    msgs: cascadeMsgs.concat([{ text: '🔧 「' + ship.name + '」拆卸了改装组件：' + mod.emoji + ' ' + mod.name, type: 'info' }]),
  };
}

/**
 * 应用/移除改装效果
 * @param {object} ship
 * @param {object} effect
 * @param {number} direction  1=安装, -1=拆卸
 */
function _applyModEffect(ship, effect, direction) {
  if (effect.cargo) {
    ship.maxCargo = Math.max(1, ship.maxCargo + effect.cargo * direction);
  }
  if (effect.maxFuel) {
    ship.maxFuel = Math.max(1, ship.maxFuel + effect.maxFuel * direction);
    if (ship.fuel > ship.maxFuel) ship.fuel = ship.maxFuel;
  }
  if (effect.hull) {
    ship.maxHull = Math.max(1, ship.maxHull + effect.hull * direction);
    if (ship.hull > ship.maxHull) ship.hull = ship.maxHull;
  }
  if (effect.fuelEff) {
    if (direction === 1) {
      ship.fuelEff = Math.round(ship.fuelEff * effect.fuelEff * 10000) / 10000;
    } else {
      ship.fuelEff = Math.round((ship.fuelEff / effect.fuelEff) * 10000) / 10000;
    }
  }
}

// ---------------------------------------------------------------------------
// 飞船特殊技能
// ---------------------------------------------------------------------------

/**
 * 获取指定船只的特殊技能列表
 * @param {object} ship  船只实例
 * @returns {Array} 技能列表
 */
export function getShipSkills(ship) {
  if (!ship) return [];
  var shipType = SHIP_TYPES.find(function (t) { return t.id === ship.typeId; });
  return shipType && shipType.skills ? shipType.skills : [];
}

/**
 * 获取指定船只的综合技能效果
 * @param {object} ship
 * @returns {object} 合并后的效果
 */
export function getShipSkillEffects(ship) {
  var skills = getShipSkills(ship);
  var effects = {};
  skills.forEach(function (s) {
    if (s.effect) {
      Object.keys(s.effect).forEach(function (k) {
        effects[k] = (effects[k] || 0) + s.effect[k];
      });
    }
  });
  return effects;
}

/**
 * 获取指定船只的改装组件综合效果
 * @param {object} ship
 * @returns {object} 合并后的效果（仅buyDiscount/sellBonus/autoRepair等非stat属性）
 */
export function getShipModEffects(ship) {
  if (!ship || !ship.mods) return {};
  var effects = {
    maintenanceDecayMultiplier: 1,
    smugglingCheckMultiplier: 1,
    smugglingFineMultiplier: 1,
    poiRewardMultiplier: 1,
    scanFuelDiscount: 0,
  };
  ship.mods.forEach(function (modId) {
    var mod = SHIP_MODS.find(function (m) { return m.id === modId; });
    if (mod && mod.effect) {
      if (mod.effect.buyDiscount) effects.buyDiscount = (effects.buyDiscount || 0) + mod.effect.buyDiscount;
      if (mod.effect.sellBonus) effects.sellBonus = (effects.sellBonus || 0) + mod.effect.sellBonus;
      if (mod.effect.autoRepair) effects.autoRepair = (effects.autoRepair || 0) + mod.effect.autoRepair;
      if (mod.effect.maintenanceDecayMultiplier) effects.maintenanceDecayMultiplier = (effects.maintenanceDecayMultiplier || 1) * mod.effect.maintenanceDecayMultiplier;
      if (mod.effect.smugglingCheckMultiplier) effects.smugglingCheckMultiplier = (effects.smugglingCheckMultiplier || 1) * mod.effect.smugglingCheckMultiplier;
      if (mod.effect.smugglingFineMultiplier) effects.smugglingFineMultiplier = (effects.smugglingFineMultiplier || 1) * mod.effect.smugglingFineMultiplier;
      if (mod.effect.scanFuelDiscount) effects.scanFuelDiscount = (effects.scanFuelDiscount || 0) + mod.effect.scanFuelDiscount;
      if (mod.effect.poiRewardMultiplier) effects.poiRewardMultiplier = (effects.poiRewardMultiplier || 1) * mod.effect.poiRewardMultiplier;
    }
  });
  return effects;
}

// ---------------------------------------------------------------------------
// 舰队编队加成
// ---------------------------------------------------------------------------

/**
 * 获取当前舰队激活的编队加成列表
 * @param {object} state
 * @returns {Array} 激活的 FLEET_BONUSES 子集
 */
export function getActiveFleetBonuses(state) {
  var fleet = state.fleet || [];
  var typeIds = [];
  fleet.forEach(function (ship) {
    if (typeIds.indexOf(ship.typeId) === -1) {
      typeIds.push(ship.typeId);
    }
  });

  return FLEET_BONUSES.filter(function (bonus) {
    return bonus.requiredTypes.every(function (reqType) {
      return typeIds.indexOf(reqType) !== -1;
    });
  });
}

/**
 * 获取舰队加成的综合效果
 * @param {object} state
 * @returns {object} 合并后的效果
 */
export function getFleetBonusEffects(state) {
  var bonuses = getActiveFleetBonuses(state);
  var effects = {};
  bonuses.forEach(function (b) {
    if (b.effect) {
      Object.keys(b.effect).forEach(function (k) {
        effects[k] = (effects[k] || 0) + b.effect[k];
      });
    }
  });
  return effects;
}
