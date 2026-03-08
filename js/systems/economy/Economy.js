// js/systems/economy/Economy.js — 市场价格模拟
// 依赖：data/goods.js, data/systems.js
// 导出：Economy { init, advanceDay, getBuyPrice, getSellPrice, getFuelCost, getSystemMultiplier }
//
// 生产环境中，calculatePrice / euclideanDistance 的热路径运算应编译为
// WebAssembly 模块（如 Rust/C++）。此处保留与 WASM 导出面相同的函数签名。

import { GOODS }                          from '../../data/goods.js';
import { ECONOMY_CONFIG }                from '../../data/constants.js';
import { SYSTEMS, FUEL_COST_PER_UNIT, GALAXY_JUMP_FUEL, findSystem } from '../../data/systems.js';
import * as Faction                       from '../faction/FactionSystem.js';

// 每个 (星系, 商品) 对的每日价格噪声系数
const _modifiers = Object.create(null);

// 供需系统（群星参考）——每个 (星系, 商品) 对的供给/需求值
const _supply = Object.create(null);
const _demand = Object.create(null);

// ---------------------------------------------------------------------------
// 经济周期系统（繁荣 → 稳定 → 衰退 → 萧条）
// ---------------------------------------------------------------------------
const CYCLE_PHASES = ECONOMY_CONFIG.cycle.phases;

let _cycleState = {
  phaseIndex: ECONOMY_CONFIG.cycle.initialPhaseIndex,
  dayInPhase: 0,
  phaseDuration: ECONOMY_CONFIG.cycle.fallbackDuration,
  totalCycles: 0,
};

// ---------------------------------------------------------------------------
// "WASM polyfill" — 签名与计划中的 WASM 导出保持一致
// ---------------------------------------------------------------------------

function calculatePrice(basePrice, systemMultiplier, dayModifier) {
  return Math.round(basePrice * systemMultiplier * dayModifier);
}

function euclideanDistance(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function _getBaseSupply(priceMultiplier, cycleSupplyBoost) {
  return Math.round(
    ECONOMY_CONFIG.supplyDemand.baseline +
    (1.0 - priceMultiplier) * ECONOMY_CONFIG.supplyDemand.priceInfluence +
    (cycleSupplyBoost || 0)
  );
}

function _getBaseDemand(priceMultiplier, cycleDemandBoost) {
  return Math.round(
    ECONOMY_CONFIG.supplyDemand.baseline +
    (priceMultiplier - 1.0) * ECONOMY_CONFIG.supplyDemand.priceInfluence +
    (cycleDemandBoost || 0)
  );
}

function _clampSupplyDemand(value) {
  return Math.max(ECONOMY_CONFIG.supplyDemand.min, Math.min(ECONOMY_CONFIG.supplyDemand.max, value));
}

function _getSupplyDemandPriceModifier(systemId, goodId) {
  const sd = getSupplyDemand(systemId, goodId);
  return ECONOMY_CONFIG.supplyDemand.priceRatioMinBase +
    ECONOMY_CONFIG.supplyDemand.priceRatioScale * Math.min(ECONOMY_CONFIG.supplyDemand.priceRatioClamp, sd.ratio);
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
      _modifiers[sys.id][good.id] = ECONOMY_CONFIG.modifier.initialMin + Math.random() * ECONOMY_CONFIG.modifier.initialRange;
      const priceMult = sys.prices[good.id];
      _supply[sys.id][good.id] = _getBaseSupply(priceMult) + Math.round(Math.random() * ECONOMY_CONFIG.supplyDemand.randomSpread);
      _demand[sys.id][good.id] = _getBaseDemand(priceMult) + Math.round(Math.random() * ECONOMY_CONFIG.supplyDemand.randomSpread);
    });
  });
}

function _initCycle() {
  const phase = CYCLE_PHASES[_cycleState.phaseIndex];
  _cycleState.dayInPhase = 0;
  _cycleState.phaseDuration = phase.duration[0] + Math.floor(Math.random() * (phase.duration[1] - phase.duration[0]));
}

function _advanceCycle() {
  _cycleState.dayInPhase++;
  if (_cycleState.dayInPhase >= _cycleState.phaseDuration) {
    _cycleState.phaseIndex = (_cycleState.phaseIndex + 1) % CYCLE_PHASES.length;
    if (_cycleState.phaseIndex === 0) _cycleState.totalCycles++;
    _initCycle();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

export function init() {
  _randomiseModifiers();
  _initCycle();
}

export function advanceDay() {
  const cycleChanged = _advanceCycle();
  const cycle = CYCLE_PHASES[_cycleState.phaseIndex];

  SYSTEMS.forEach(function (sys) {
    GOODS.forEach(function (good) {
      let m = _modifiers[sys.id][good.id] + (Math.random() - 0.5) * ECONOMY_CONFIG.modifier.dailyDrift;
      _modifiers[sys.id][good.id] = Math.max(ECONOMY_CONFIG.modifier.min, Math.min(ECONOMY_CONFIG.modifier.max, m));

      const baseSup = _getBaseSupply(sys.prices[good.id], cycle.supplyBoost);
      const baseDem = _getBaseDemand(sys.prices[good.id], cycle.demandBoost);
      _supply[sys.id][good.id] += Math.round((baseSup - _supply[sys.id][good.id]) * ECONOMY_CONFIG.supplyDemand.dailyRecoveryRate + (Math.random() - 0.5) * ECONOMY_CONFIG.supplyDemand.dailyRecoveryNoise);
      _demand[sys.id][good.id] += Math.round((baseDem - _demand[sys.id][good.id]) * ECONOMY_CONFIG.supplyDemand.dailyRecoveryRate + (Math.random() - 0.5) * ECONOMY_CONFIG.supplyDemand.dailyRecoveryNoise);
      _supply[sys.id][good.id] = _clampSupplyDemand(_supply[sys.id][good.id]);
      _demand[sys.id][good.id] = _clampSupplyDemand(_demand[sys.id][good.id]);
    });
  });

  if (Math.random() < cycle.peakChance) {
    const sys  = SYSTEMS[Math.floor(Math.random() * SYSTEMS.length)];
    const good = GOODS[Math.floor(Math.random() * GOODS.length)];
    _modifiers[sys.id][good.id] = ECONOMY_CONFIG.peaks.modifierBase + Math.random() * ECONOMY_CONFIG.peaks.modifierRange;
    _demand[sys.id][good.id] = _clampSupplyDemand(_demand[sys.id][good.id] + ECONOMY_CONFIG.peaks.demandBoost);
    _supply[sys.id][good.id] = _clampSupplyDemand(_supply[sys.id][good.id] - ECONOMY_CONFIG.peaks.supplyDrop);
  }

  return { cycleChanged: cycleChanged, cycle: cycle };
}

export function onPlayerBuy(systemId, goodId, quantity) {
  if (!_supply[systemId]) return;
  _supply[systemId][goodId] = _clampSupplyDemand((_supply[systemId][goodId] || ECONOMY_CONFIG.supplyDemand.baseline) - quantity * ECONOMY_CONFIG.supplyDemand.buySupplyImpact);
  _demand[systemId][goodId] = _clampSupplyDemand((_demand[systemId][goodId] || ECONOMY_CONFIG.supplyDemand.baseline) + quantity * ECONOMY_CONFIG.supplyDemand.buyDemandImpact);
}

export function onPlayerSell(systemId, goodId, quantity) {
  if (!_supply[systemId]) return;
  _supply[systemId][goodId] = _clampSupplyDemand((_supply[systemId][goodId] || ECONOMY_CONFIG.supplyDemand.baseline) + quantity * ECONOMY_CONFIG.supplyDemand.sellSupplyImpact);
  _demand[systemId][goodId] = _clampSupplyDemand((_demand[systemId][goodId] || ECONOMY_CONFIG.supplyDemand.baseline) - quantity * ECONOMY_CONFIG.supplyDemand.sellDemandImpact);
}

export function getSupplyDemand(systemId, goodId) {
  const s = (_supply[systemId] && _supply[systemId][goodId]) || ECONOMY_CONFIG.supplyDemand.baseline;
  const d = (_demand[systemId] && _demand[systemId][goodId]) || ECONOMY_CONFIG.supplyDemand.baseline;
  return { supply: s, demand: d, ratio: d / Math.max(1, s) };
}

export function getBuyPrice(systemId, goodId, state) {
  const sys  = SYSTEMS.find(function (s) { return s.id === systemId; });
  const good = GOODS.find(function (g) { return g.id === goodId; });
  if (!sys || !good || !_modifiers[systemId]) return ECONOMY_CONFIG.pricing.minimumPrice;
  const m    = _modifiers[systemId][goodId] * sys.prices[goodId];
  const sdMod = _getSupplyDemandPriceModifier(systemId, goodId);
  const cycleMod = CYCLE_PHASES[_cycleState.phaseIndex].priceMod;
  let price  = calculatePrice(good.basePrice, m * sdMod * cycleMod, ECONOMY_CONFIG.pricing.buyMultiplier);

  if (state) {
    const taxMod = Faction.getTaxModifier(state, systemId);
    price = Math.round(price * taxMod);
    if (state.techBuyDiscount) {
      price = Math.round(price * (1 - state.techBuyDiscount));
    }
  }
  return Math.max(ECONOMY_CONFIG.pricing.minimumPrice, price);
}

export function getSellPrice(systemId, goodId, state) {
  const sys  = SYSTEMS.find(function (s) { return s.id === systemId; });
  const good = GOODS.find(function (g) { return g.id === goodId; });
  if (!sys || !good || !_modifiers[systemId]) return ECONOMY_CONFIG.pricing.minimumPrice;
  const m    = _modifiers[systemId][goodId] * sys.prices[goodId];
  const sdMod = _getSupplyDemandPriceModifier(systemId, goodId);
  const cycleMod = CYCLE_PHASES[_cycleState.phaseIndex].priceMod;
  let price  = calculatePrice(good.basePrice, m * sdMod * cycleMod, ECONOMY_CONFIG.pricing.sellMultiplier);

  if (state) {
    const taxMod = Faction.getTaxModifier(state, systemId);
    const sellTax = 2.0 - taxMod;
    price = Math.round(price * sellTax);
    if (state.techSellBonus) {
      price = Math.round(price * (1 + state.techSellBonus));
    }
  }
  return Math.max(ECONOMY_CONFIG.pricing.minimumPrice, price);
}

export function getFuelCost(fromId, toId, efficiency) {
  const s1 = findSystem(fromId);
  const s2 = findSystem(toId);
  if (!s1 || !s2) return 999;
  if (s1.galaxyId !== s2.galaxyId) {
    const localDist = euclideanDistance(0.5, 0.5, s2.x, s2.y);
    return Math.max(ECONOMY_CONFIG.pricing.minimumPrice, Math.ceil((GALAXY_JUMP_FUEL + localDist * 50 * FUEL_COST_PER_UNIT) * efficiency));
  }
  const dist = euclideanDistance(s1.x, s1.y, s2.x, s2.y);
  return Math.max(ECONOMY_CONFIG.pricing.minimumPrice, Math.ceil(dist * 100 * FUEL_COST_PER_UNIT * efficiency));
}

export function getSystemMultiplier(systemId, goodId) {
  return SYSTEMS.find(function (s) { return s.id === systemId; }).prices[goodId];
}

export function getEconomyCycle() {
  const phase = CYCLE_PHASES[_cycleState.phaseIndex];
  return {
    phase: phase.id,
    name: phase.name,
    icon: phase.icon,
    priceMod: phase.priceMod,
    dayInPhase: _cycleState.dayInPhase,
    phaseDuration: _cycleState.phaseDuration,
    totalCycles: _cycleState.totalCycles,
    progressPercent: Math.round((_cycleState.dayInPhase / _cycleState.phaseDuration) * 100),
  };
}

export function getNextCyclePhase() {
  const nextIdx = (_cycleState.phaseIndex + 1) % CYCLE_PHASES.length;
  return CYCLE_PHASES[nextIdx];
}

export function getCycleState() {
  return Object.assign({}, _cycleState);
}

export function setCycleState(saved) {
  if (saved) {
    _cycleState.phaseIndex = saved.phaseIndex || ECONOMY_CONFIG.cycle.initialPhaseIndex;
    _cycleState.dayInPhase = saved.dayInPhase || 0;
    _cycleState.phaseDuration = saved.phaseDuration || ECONOMY_CONFIG.cycle.fallbackDuration;
    _cycleState.totalCycles = saved.totalCycles || 0;
  }
}

export function getEconomyConfig() {
  return JSON.parse(JSON.stringify(ECONOMY_CONFIG));
}
