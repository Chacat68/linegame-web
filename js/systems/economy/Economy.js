// js/systems/economy/Economy.js — 市场价格模拟
// 依赖：data/goods.js, data/systems.js
// 导出：Economy { init, advanceDay, getBuyPrice, getSellPrice, getFuelCost, getSystemMultiplier }
//
// 生产环境中，calculatePrice / euclideanDistance 的热路径运算应编译为
// WebAssembly 模块（如 Rust/C++）。此处保留与 WASM 导出面相同的函数签名。

import { GOODS }                          from '../../data/goods.js';
import { SYSTEMS, FUEL_COST_PER_UNIT, GALAXY_JUMP_FUEL, findSystem } from '../../data/systems.js';
import * as Faction                       from '../faction/FactionSystem.js';

// 每个 (星系, 商品) 对的每日价格噪声系数
const _modifiers = Object.create(null);

// 供需系统（群星参考）——每个 (星系, 商品) 对的供给/需求值
const _supply = Object.create(null);
const _demand = Object.create(null);

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
    _supply[sys.id]    = Object.create(null);
    _demand[sys.id]    = Object.create(null);
    GOODS.forEach(function (good) {
      _modifiers[sys.id][good.id] = 0.75 + Math.random() * 0.5; // [0.75, 1.25]
      // 供给与需求：产地供给高价格低，消费地需求高价格高
      const priceMult = sys.prices[good.id];
      // priceMult < 1 → 产地(供给多), priceMult > 1 → 消费地(需求多)
      _supply[sys.id][good.id] = Math.round(50 + (1.0 - priceMult) * 30 + Math.random() * 20);
      _demand[sys.id][good.id] = Math.round(50 + (priceMult - 1.0) * 30 + Math.random() * 20);
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
      // 噪声系数漂移
      let m = _modifiers[sys.id][good.id] + (Math.random() - 0.5) * 0.15;
      _modifiers[sys.id][good.id] = Math.max(0.55, Math.min(1.45, m));

      // 供需自然回复（向均衡值漂移）
      const baseSup = Math.round(50 + (1.0 - sys.prices[good.id]) * 30);
      const baseDem = Math.round(50 + (sys.prices[good.id] - 1.0) * 30);
      _supply[sys.id][good.id] += Math.round((baseSup - _supply[sys.id][good.id]) * 0.15 + (Math.random() - 0.5) * 5);
      _demand[sys.id][good.id] += Math.round((baseDem - _demand[sys.id][good.id]) * 0.15 + (Math.random() - 0.5) * 5);
      _supply[sys.id][good.id] = Math.max(5, Math.min(100, _supply[sys.id][good.id]));
      _demand[sys.id][good.id] = Math.max(5, Math.min(100, _demand[sys.id][good.id]));
    });
  });

  // 随机价格峰值事件（每天 30% 概率）
  if (Math.random() < 0.30) {
    const sys  = SYSTEMS[Math.floor(Math.random() * SYSTEMS.length)];
    const good = GOODS[Math.floor(Math.random() * GOODS.length)];
    _modifiers[sys.id][good.id] = 1.8 + Math.random() * 0.6;
    // 峰值事件同时制造供需失衡
    _demand[sys.id][good.id] = Math.min(100, _demand[sys.id][good.id] + 25);
    _supply[sys.id][good.id] = Math.max(5, _supply[sys.id][good.id] - 15);
  }
}

/**
 * 玩家买入时减少当地供给、增加需求
 */
export function onPlayerBuy(systemId, goodId, quantity) {
  if (!_supply[systemId]) return;
  _supply[systemId][goodId] = Math.max(5, (_supply[systemId][goodId] || 50) - quantity * 2);
  _demand[systemId][goodId] = Math.min(100, (_demand[systemId][goodId] || 50) + quantity);
}

/**
 * 玩家卖出时增加当地供给、减少需求
 */
export function onPlayerSell(systemId, goodId, quantity) {
  if (!_supply[systemId]) return;
  _supply[systemId][goodId] = Math.min(100, (_supply[systemId][goodId] || 50) + quantity * 2);
  _demand[systemId][goodId] = Math.max(5, (_demand[systemId][goodId] || 50) - quantity);
}

/**
 * 获取供需比（用于 UI 显示）
 * @returns {{ supply: number, demand: number, ratio: number }}
 */
export function getSupplyDemand(systemId, goodId) {
  const s = (_supply[systemId] && _supply[systemId][goodId]) || 50;
  const d = (_demand[systemId] && _demand[systemId][goodId]) || 50;
  return { supply: s, demand: d, ratio: d / Math.max(1, s) };
}

/**
 * 获取买入价（含派系税 & 科技折扣）
 * @param {string} systemId
 * @param {string} goodId
 * @param {object} [state]  传入 state 以启用派系税率 & 科技折扣
 */
export function getBuyPrice(systemId, goodId, state) {
  const sys  = SYSTEMS.find(function (s) { return s.id === systemId; });
  const good = GOODS.find(function (g) { return g.id === goodId; });
  const m    = _modifiers[systemId][goodId] * sys.prices[goodId];
  // 供需比影响价格：需求高于供给 → 涨价
  const sd   = getSupplyDemand(systemId, goodId);
  const sdMod = 0.7 + 0.6 * Math.min(2, sd.ratio); // ratio=1 → 1.3, ratio=2 → 1.9, ratio=0.5 → 1.0
  let price  = calculatePrice(good.basePrice, m * sdMod, 1.10);

  // 派系税率（敌对 +30%，友好 -10%，盟友 -20%）
  if (state) {
    const taxMod = Faction.getTaxModifier(state, systemId);
    price = Math.round(price * taxMod);
    // 科技买入折扣
    if (state.techBuyDiscount) {
      price = Math.round(price * (1 - state.techBuyDiscount));
    }
  }
  return Math.max(1, price);
}

/**
 * 获取卖出价（含派系税 & 科技加成）
 * @param {string} systemId
 * @param {string} goodId
 * @param {object} [state]  传入 state 以启用派系税率 & 科技加成
 */
export function getSellPrice(systemId, goodId, state) {
  const sys  = SYSTEMS.find(function (s) { return s.id === systemId; });
  const good = GOODS.find(function (g) { return g.id === goodId; });
  const m    = _modifiers[systemId][goodId] * sys.prices[goodId];
  // 供需比影响卖价：需求高 → 卖价也更高
  const sd   = getSupplyDemand(systemId, goodId);
  const sdMod = 0.7 + 0.6 * Math.min(2, sd.ratio);
  let price  = calculatePrice(good.basePrice, m * sdMod, 0.95); // 5% 卖出折扣

  // 派系税率（对卖价：友好提高收入，敌对降低）
  // 买入时 tax 涨价 = 对玩家不利，卖出时 tax 应该让玩家少赚
  if (state) {
    const taxMod = Faction.getTaxModifier(state, systemId);
    // 卖出时税率反向：taxMod > 1（敌对）=> 收入减少, taxMod < 1（友好）=> 收入增加
    const sellTax = 2.0 - taxMod; // 1.3 → 0.7 ; 0.8 → 1.2
    price = Math.round(price * sellTax);
    // 科技卖出加成
    if (state.techSellBonus) {
      price = Math.round(price * (1 + state.techSellBonus));
    }
  }
  return Math.max(1, price);
}

export function getFuelCost(fromId, toId, efficiency) {
  const s1 = findSystem(fromId);
  const s2 = findSystem(toId);
  if (!s1 || !s2) return 999;
  // 跨星系需要额外跃迁燃料
  if (s1.galaxyId !== s2.galaxyId) {
    const localDist = euclideanDistance(0.5, 0.5, s2.x, s2.y); // 到目标星球在其星系内的距离
    return Math.max(1, Math.ceil((GALAXY_JUMP_FUEL + localDist * 50 * FUEL_COST_PER_UNIT) * efficiency));
  }
  const dist = euclideanDistance(s1.x, s1.y, s2.x, s2.y);
  return Math.max(1, Math.ceil(dist * 100 * FUEL_COST_PER_UNIT * efficiency));
}

export function getSystemMultiplier(systemId, goodId) {
  return SYSTEMS.find(function (s) { return s.id === systemId; }).prices[goodId];
}
