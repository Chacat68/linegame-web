// js/data/upgrades.js — 飞船升级定义
// 依赖：无
// 导出：UPGRADES

export const UPGRADES = [
  { id: 'cargo_i',      name: '货舱扩展 I',    desc: '货舱容量 +10', cost: 500,  effect: { cargo: 10 },            requires: null           },
  { id: 'cargo_ii',     name: '货舱扩展 II',   desc: '货舱容量 +20', cost: 1500, effect: { cargo: 20 },            requires: 'cargo_i'      },
  { id: 'cargo_iii',    name: '货舱扩展 III',  desc: '货舱容量 +30', cost: 4000, effect: { cargo: 30 },            requires: 'cargo_ii'     },
  { id: 'fuel_tank_i',  name: '燃料舱升级 I',  desc: '最大燃料 +50', cost: 800,  effect: { maxFuel: 50 },          requires: null           },
  { id: 'fuel_tank_ii', name: '燃料舱升级 II', desc: '最大燃料 +50', cost: 2000, effect: { maxFuel: 50 },          requires: 'fuel_tank_i'  },
  { id: 'engine',       name: '高效引擎',      desc: '旅行耗油 ×0.7',cost: 3000, effect: { fuelEfficiency: 0.7 },  requires: null           },
];
