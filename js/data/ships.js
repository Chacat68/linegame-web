// js/data/ships.js — 船只类型定义
// 依赖：无
// 导出：SHIP_TYPES, SHIP_UPGRADES, FLEET_SLOTS

/**
 * 每种船只定义：
 *   id           唯一标识
 *   name         显示名称
 *   emoji        图标
 *   cost         购买价格
 *   cargo        初始货舱容量
 *   maxCargo     货舱升级上限
 *   fuel         初始燃料
 *   maxFuelCap   燃料升级上限
 *   hull         初始船体
 *   maxHullCap   船体升级上限
 *   fuelEff      初始燃料效率（越低越省油）
 *   minFuelEff   燃料效率下限（最好值）
 *   desc         描述
 */
export const SHIP_TYPES = [
  {
    id: 'shuttle',      name: '穿梭机',     emoji: '🚀',
    cost: 0,
    cargo: 20,   maxCargo: 50,
    fuel: 100,   maxFuelCap: 200,
    hull: 100,   maxHullCap: 150,
    fuelEff: 1.0, minFuelEff: 0.6,
    desc: '轻型穿梭机，贸易入门之选',
  },
  {
    id: 'freighter',    name: '货运飞船',   emoji: '🚢',
    cost: 3000,
    cargo: 40,   maxCargo: 100,
    fuel: 120,   maxFuelCap: 300,
    hull: 150,   maxHullCap: 250,
    fuelEff: 1.2, minFuelEff: 0.5,
    desc: '大型货舱，长途贸易利器',
  },
  {
    id: 'clipper',      name: '快速帆船',   emoji: '⛵',
    cost: 5000,
    cargo: 25,   maxCargo: 60,
    fuel: 150,   maxFuelCap: 350,
    hull: 80,    maxHullCap: 120,
    fuelEff: 0.7, minFuelEff: 0.3,
    desc: '速度极快、省油，但货舱较小',
  },
  {
    id: 'galleon',      name: '银河巨舰',   emoji: '🏴',
    cost: 12000,
    cargo: 80,   maxCargo: 200,
    fuel: 200,   maxFuelCap: 500,
    hull: 250,   maxHullCap: 400,
    fuelEff: 1.5, minFuelEff: 0.6,
    desc: '帝国级巨型货舰，终极贸易船只',
  },
];

/**
 * 船队席位定义
 * 玩家必须先购买席位才能购买新船只
 * 每个席位解锁更高级的贸易航线（routeLevel 对应星球 minLevel）
 */
export const FLEET_SLOTS = [
  { id: 1, cost: 0,     name: '初始席位',  desc: '基础席位，包含初始穿梭机',    routeLevel: 1 },
  { id: 2, cost: 2000,  name: '席位 II',   desc: '解锁 Lv.2 贸易航线',        routeLevel: 2 },
  { id: 3, cost: 5000,  name: '席位 III',  desc: '解锁 Lv.3 贸易航线',        routeLevel: 3 },
  { id: 4, cost: 12000, name: '席位 IV',   desc: '解锁 Lv.4 贸易航线',        routeLevel: 4 },
  { id: 5, cost: 25000, name: '席位 V',    desc: '解锁 Lv.5 贸易航线',        routeLevel: 5 },
  { id: 6, cost: 50000, name: '席位 VI',   desc: '解锁 Lv.6+ 贸易航线',       routeLevel: 99 },
];

/**
 * 船只升级定义
 * 每个升级只能购买一次，对当前激活船只生效
 */
export const SHIP_UPGRADES = [
  { id: 'ship_cargo_i',   name: '货舱扩展 I',   desc: '货舱 +15', cost: 600,   effect: { cargo: 15 },          requires: null },
  { id: 'ship_cargo_ii',  name: '货舱扩展 II',  desc: '货舱 +25', cost: 1800,  effect: { cargo: 25 },          requires: 'ship_cargo_i' },
  { id: 'ship_cargo_iii', name: '货舱扩展 III', desc: '货舱 +40', cost: 5000,  effect: { cargo: 40 },          requires: 'ship_cargo_ii' },
  { id: 'ship_fuel_i',    name: '燃料舱升级 I',  desc: '燃料 +50', cost: 800,   effect: { maxFuel: 50 },        requires: null },
  { id: 'ship_fuel_ii',   name: '燃料舱升级 II', desc: '燃料 +80', cost: 2500,  effect: { maxFuel: 80 },        requires: 'ship_fuel_i' },
  { id: 'ship_engine_i',  name: '高效引擎 I',    desc: '耗油 ×0.8', cost: 2000, effect: { fuelEff: 0.8 },       requires: null },
  { id: 'ship_engine_ii', name: '高效引擎 II',   desc: '耗油 ×0.8', cost: 5000, effect: { fuelEff: 0.8 },       requires: 'ship_engine_i' },
  { id: 'ship_hull_i',    name: '装甲强化 I',    desc: '船体 +50', cost: 1200,  effect: { hull: 50 },           requires: null },
  { id: 'ship_hull_ii',   name: '装甲强化 II',   desc: '船体 +80', cost: 3500,  effect: { hull: 80 },           requires: 'ship_hull_i' },
];
