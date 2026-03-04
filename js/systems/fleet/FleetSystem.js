// js/systems/fleet/FleetSystem.js — 船队管理系统
// 依赖：data/ships.js, data/systems.js, systems/economy/Economy.js
// 导出：init, buyShip, sellShip, switchShip, upgradeShip, getActiveShip, getFleet,
//       syncStateFromShip, syncShipFromState, getShipType,
//       assignRoute, cancelRoute, tickFleetRoutes,
//       buySlot, getSlotCount, getMaxSlots, getAvailableSlotCount,
//       getDispatchRouteLevel, dispatchActiveShip, cancelActiveDispatch,
//       isActiveDispatched, tickActiveShipDispatch,
//       installMod, uninstallMod, getShipSkills, getActiveFleetBonuses

import { SHIP_TYPES, SHIP_UPGRADES, FLEET_SLOTS, SHIP_MODS, FLEET_BONUSES } from '../../data/ships.js';
import { SYSTEMS, FUEL_COST_PER_UNIT, findSystem } from '../../data/systems.js';
import { GOODS } from '../../data/goods.js';
import * as Economy from '../economy/Economy.js';

/**
 * 创建一艘船只实例
 * @param {object} shipType  SHIP_TYPES 中的定义
 * @returns {object} 船只实例
 */
function _createShip(shipType) {
  return {
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
    location:     null, // 当前所在星系 ID（非激活船只用），null 表示跟随旗舰
    route:        null, // 派遣路线 { buySystemId, sellSystemId, goodId, status:'buying'|'traveling'|'selling'|'returning' }
  };
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 初始化船队系统 — 如果 state 中没有船队数据则创建初始船只
 */
export function init(state) {
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
  const baseCost = shipType ? shipType.cost : 0;
  // 随机 45%~80% 回收价
  const ratio = 0.45 + Math.random() * 0.35;
  const sellPrice = Math.floor(baseCost * ratio);

  // 货舱中的货物一并清空（不退还）
  state.credits += sellPrice;
  state.fleet.splice(shipIndex, 1);

  // 修正 activeShipIndex
  if (state.activeShipIndex >= state.fleet.length) {
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
  state.cargo          = ship.cargo;
  state.maxCargo       = ship.maxCargo;
  state.fuel           = ship.fuel;
  state.maxFuel        = ship.maxFuel;
  state.fuelEfficiency = ship.fuelEff;
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
}

/**
 * 获取船型信息
 */
export function getShipType(typeId) {
  return SHIP_TYPES.find(function (s) { return s.id === typeId; });
}

// ---------------------------------------------------------------------------
// 派遣贸易路线
// ---------------------------------------------------------------------------

/**
 * 计算两星系之间的距离
 */
function _distance(sysA, sysB) {
  var dx = sysA.x - sysB.x;
  var dy = sysA.y - sysB.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 计算燃料消耗
 */
function _fuelCost(fromId, toId, fuelEff) {
  var s1 = findSystem(fromId);
  var s2 = findSystem(toId);
  if (!s1 || !s2) return NaN;
  return Math.max(1, Math.ceil(_distance(s1, s2) * 100 * FUEL_COST_PER_UNIT * fuelEff));
}

/**
 * 为船只分配贸易路线（派遣）
 * 支持激活船只和非激活船只
 * @param {object} state
 * @param {number} shipIndex
 * @param {string} buySystemId  买入星系
 * @param {string} sellSystemId 卖出星系
 * @param {string} goodId       贸易商品
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function assignRoute(state, shipIndex, buySystemId, sellSystemId, goodId) {
  var ship = state.fleet[shipIndex];
  if (!ship) {
    return { ok: false, msgs: [{ text: '❌ 无效的船只！', type: 'error' }] };
  }

  var busSys  = findSystem(buySystemId);
  var sellSys = findSystem(sellSystemId);
  var good    = GOODS.find(function (g) { return g.id === goodId; });

  if (!busSys || !sellSys || !good) {
    return { ok: false, msgs: [{ text: '❌ 无效的路线参数！', type: 'error' }] };
  }

  // 派遣路线必须在同一星系内
  if (busSys.galaxyId !== sellSys.galaxyId) {
    return { ok: false, msgs: [{ text: '⚠️ 派遣路线必须在同一星系内！', type: 'error' }] };
  }

  // 设置路线，船只从当前位置开始
  ship.location = ship.location || state.currentSystem;
  ship.route = {
    buySystemId:  buySystemId,
    sellSystemId: sellSystemId,
    goodId:       goodId,
    status:       'traveling_buy',  // 先前往买入地
  };

  return {
    ok: true,
    msgs: [{
      text: '📡 「' + ship.emoji + ' ' + ship.name + '」已派遣！路线：' +
            busSys.name + '(' + good.emoji + good.name + ') → ' + sellSys.name,
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
          var cost = _fuelCost(loc, route.buySystemId, ship.fuelEff);
          if (!Number.isFinite(cost)) {
            msgs.push({ text: '⚠️ 「' + ship.emoji + ship.name + '」路线异常（目标星球不存在），派遣已取消。', type: 'error' });
            ship.route = null;
            return;
          }
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
          msgs.push({ text: '🚀 「' + ship.name + '」抵达买入地。', type: 'travel' });
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
          var cost2 = _fuelCost(loc, route.sellSystemId, ship.fuelEff);
          if (!Number.isFinite(cost2)) {
            msgs.push({ text: '⚠️ 「' + ship.emoji + ship.name + '」路线异常（目标星球不存在），派遣已取消。', type: 'error' });
            ship.route = null;
            return;
          }
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
          msgs.push({ text: '🚀 「' + ship.name + '」抵达卖出地。', type: 'travel' });
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
  var buyPrice = Economy.getBuyPrice(route.buySystemId, route.goodId, state);
  var cargoUsed = Object.values(ship.cargo).reduce(function (s, q) { return s + q; }, 0);
  var space     = ship.maxCargo - cargoUsed;
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
  Economy.onPlayerBuy(route.buySystemId, route.goodId, qty);

  var good = GOODS.find(function (g) { return g.id === route.goodId; });
  msgs.push({
    text: '📦 「' + ship.name + '」在' + _sysName(route.buySystemId) + '买入 ' + qty + ' 单位' + good.name + '，花费 ' + totalCost + ' 积分。',
    type: 'buy',
  });

  route.status = 'traveling_sell';
}

/**
 * 船只自动卖出
 */
function _doShipSell(state, ship, route, msgs) {
  var qty = ship.cargo[route.goodId] || 0;
  if (qty <= 0) {
    // 没有货物，重新开始循环
    route.status = 'traveling_buy';
    return;
  }

  var sellPrice  = Economy.getSellPrice(route.sellSystemId, route.goodId, state);
  var totalEarned = qty * sellPrice;
  state.credits += totalEarned;
  delete ship.cargo[route.goodId];
  Economy.onPlayerSell(route.sellSystemId, route.goodId, qty);

  var good = GOODS.find(function (g) { return g.id === route.goodId; });
  msgs.push({
    text: '💰 「' + ship.name + '」在' + _sysName(route.sellSystemId) + '卖出 ' + qty + ' 单位' + good.name + '，获得 ' + totalEarned + ' 积分。',
    type: 'sell',
  });

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
export function dispatchActiveShip(state, buySystemId, sellSystemId, goodId) {
  return assignRoute(state, state.activeShipIndex, buySystemId, sellSystemId, goodId);
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
    msgs: [{ text: '🔧 「' + ship.name + '」拆卸了改装组件：' + mod.emoji + ' ' + mod.name, type: 'info' }],
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
  var effects = {};
  ship.mods.forEach(function (modId) {
    var mod = SHIP_MODS.find(function (m) { return m.id === modId; });
    if (mod && mod.effect) {
      if (mod.effect.buyDiscount) effects.buyDiscount = (effects.buyDiscount || 0) + mod.effect.buyDiscount;
      if (mod.effect.sellBonus) effects.sellBonus = (effects.sellBonus || 0) + mod.effect.sellBonus;
      if (mod.effect.autoRepair) effects.autoRepair = (effects.autoRepair || 0) + mod.effect.autoRepair;
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
