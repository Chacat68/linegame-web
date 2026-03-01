// js/systems/economy/Economy.js — 市场价格模拟
// 依赖：data/goods.js, data/systems.js
// 导出：Economy { init, advanceDay, getBuyPrice, getSellPrice, getFuelCost, getSystemMultiplier }
//
// 生产环境中，calculatePrice / euclideanDistance 的热路径运算应编译为
// WebAssembly 模块（如 Rust/C++）。此处保留与 WASM 导出面相同的函数签名。

import { GOODS }                          from '../../data/goods.js';
import { SYSTEMS, FUEL_COST_PER_UNIT }   from '../../data/systems.js';

// 每个 (星系, 商品) 对的每日价格噪声系数
const _modifiers = Object.create(null);

// ---------------------------------------------------------------------------
// "WASM polyfill" — 签名与计划中的 WASM 导出保持一致
// ---------------------------------------------------------------------------

/**
 * calculatePrice(basePrice, systemMultiplier, dayModifier) → integer price
 * 生产版本将由编译后的 WebAssembly 模块导出。
 */
function calculatePrice(basePrice, systemMultiplier, dayModifier) {
  return Math.round(basePrice * systemMultiplier * dayModifier);
}

/**
 * euclideanDistance(x1, y1, x2, y2) → float
 * 在大型贸易图中将作为 WASM 导出以提升性能。
 */
function euclideanDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------------------
// 私有方法
// ---------------------------------------------------------------------------

function _randomiseModifiers() {
  SYSTEMS.forEach(function (sys) {
    _modifiers[sys.id] = Object.create(null);
    GOODS.forEach(function (good) {
      _modifiers[sys.id][good.id] = 0.75 + Math.random() * 0.5; // [0.75, 1.25]
    });
  });
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

export function init() {
  _randomiseModifiers();
}

export function advanceDay() {
  SYSTEMS.forEach(function (sys) {
    GOODS.forEach(function (good) {
      let m = _modifiers[sys.id][good.id] + (Math.random() - 0.5) * 0.15;
      _modifiers[sys.id][good.id] = Math.max(0.55, Math.min(1.45, m));
    });
  });

  // 随机价格峰值事件（每天 30% 概率）
  if (Math.random() < 0.30) {
    const sys  = SYSTEMS[Math.floor(Math.random() * SYSTEMS.length)];
    const good = GOODS[Math.floor(Math.random() * GOODS.length)];
    _modifiers[sys.id][good.id] = 1.8 + Math.random() * 0.6;
  }
}

export function getBuyPrice(systemId, goodId) {
  const sys  = SYSTEMS.find(function (s) { return s.id === systemId; });
  const good = GOODS.find(function (g) { return g.id === goodId; });
  const m    = _modifiers[systemId][goodId] * sys.prices[goodId];
  return calculatePrice(good.basePrice, m, 1.10); // 10% 买入加价
}

export function getSellPrice(systemId, goodId) {
  const sys  = SYSTEMS.find(function (s) { return s.id === systemId; });
  const good = GOODS.find(function (g) { return g.id === goodId; });
  const m    = _modifiers[systemId][goodId] * sys.prices[goodId];
  return calculatePrice(good.basePrice, m, 0.95); // 5% 卖出折扣
}

export function getFuelCost(fromId, toId, efficiency) {
  const s1   = SYSTEMS.find(function (s) { return s.id === fromId; });
  const s2   = SYSTEMS.find(function (s) { return s.id === toId; });
  const dist = euclideanDistance(s1.x, s1.y, s2.x, s2.y);
  return Math.max(1, Math.ceil(dist * 100 * FUEL_COST_PER_UNIT * efficiency));
}

export function getSystemMultiplier(systemId, goodId) {
  return SYSTEMS.find(function (s) { return s.id === systemId; }).prices[goodId];
}
