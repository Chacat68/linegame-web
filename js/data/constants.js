// js/data/constants.js — 游戏全局常量与初始状态
// 依赖：无
// 导出：INITIAL_STATE, VICTORY_NET_WORTH

export const VICTORY_NET_WORTH = 50000;

export const INITIAL_STATE = {
  credits:           1000,
  day:               1,
  currentSystem:     'sol_prime',
  cargo:             {},   // { goodId: quantity }
  maxCargo:          20,
  fuel:              100,
  maxFuel:           100,
  fuelEfficiency:    1.0,
  purchasedUpgrades: [],
  hoveredSystem:     null,
};
