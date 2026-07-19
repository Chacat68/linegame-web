// js/systems/economy/Economy.js — 市场价格模拟
// 依赖：data/goods.js, data/systems.js
// 导出：Economy { init, advanceDay, getBuyPrice, getSellPrice, getFuelCost, getSystemMultiplier }
//
// 生产环境中，calculatePrice / euclideanDistance 的热路径运算应编译为
// WebAssembly 模块（如 Rust/C++）。此处保留与 WASM 导出面相同的函数签名。

import { GOODS }                          from '../../data/goods.js';
import { DIFFICULTY_LEVELS, ECONOMY_CONFIG } from '../../data/constants.js';
import { SHIP_TYPES, SHIP_MODS, FLEET_BONUSES } from '../../data/ships.js';
import { SYSTEMS, FUEL_COST_PER_UNIT, GALAXY_JUMP_FUEL, findSystem } from '../../data/systems.js';
import * as Faction                       from '../faction/FactionSystem.js';
import * as Crew                         from '../fleet/CrewSystem.js';
import * as Exploration                  from '../galaxy/ExplorationSystem.js';
import { getVictoryPolicyEffects } from '../victory/VictoryPolicy.js';

// ---------------------------------------------------------------------------
// 价格历史记录（30 天环形缓冲）
// ---------------------------------------------------------------------------
const _priceHistory = Object.create(null);

// ---------------------------------------------------------------------------
// 产业链修正缓存（每次 advanceDay 后更新）
// ---------------------------------------------------------------------------
const _supplyChainCache = Object.create(null);

// 每个 (星系, 商品) 对的每日价格噪声系数
const _modifiers = Object.create(null);

// 供需系统（群星参考）——每个 (星系, 商品) 对的供给/需求值
const _supply = Object.create(null);
const _demand = Object.create(null);
const _blackMarketQuotes = Object.create(null);

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

const SMUGGLING_STATS_DEFAULTS = {
  caught: 0,
  evaded: 0,
  finesPaid: 0,
  blackMarketTrades: 0,
  riskedArrivals: 0,
  protectedArrivals: 0,
  confiscatedCostBasis: 0,
  hullDamage: 0,
  blackMarketBuyCost: 0,
  blackMarketSellRevenue: 0,
  blackMarketRealizedProfit: 0,
};

function _ensureSmugglingStats(state) {
  if (!state.smugglingStats || typeof state.smugglingStats !== 'object' || Array.isArray(state.smugglingStats)) {
    state.smugglingStats = {};
  }
  Object.keys(SMUGGLING_STATS_DEFAULTS).forEach(function (key) {
    if (!Number.isFinite(Number(state.smugglingStats[key]))) {
      state.smugglingStats[key] = SMUGGLING_STATS_DEFAULTS[key];
    }
  });
  return state.smugglingStats;
}

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

function _compressPositiveMultiplier(value, exponent) {
  var safeValue = Math.max(0.05, Number(value) || 1);
  var safeExponent = Math.max(0.05, Number(exponent) || 1);
  return Math.pow(safeValue, safeExponent);
}

function _getDifficultyVolatility(state) {
  var difficultyId = state && state.difficulty ? state.difficulty : 'normal';
  var difficulty = DIFFICULTY_LEVELS[difficultyId] || DIFFICULTY_LEVELS.normal;
  return Math.max(0.25, Number(difficulty.priceVolatility) || 1);
}

function _getPriceComponents(systemId, goodId, state) {
  var sys = SYSTEMS.find(function (entry) { return entry.id === systemId; });
  if (!sys || !_modifiers[systemId]) return null;

  var systemMultiplier = _compressPositiveMultiplier(
    sys.prices[goodId],
    ECONOMY_CONFIG.pricing.systemPriceExponent
  );
  var dynamicMultiplier = _modifiers[systemId][goodId] *
    _getSupplyDemandPriceModifier(systemId, goodId) *
    CYCLE_PHASES[_cycleState.phaseIndex].priceMod *
    _getSupplyChainModifier(systemId, goodId);
  var dynamicExponent = ECONOMY_CONFIG.pricing.dynamicPriceExponent * _getDifficultyVolatility(state);

  return {
    systemMultiplier: systemMultiplier,
    dynamicMultiplier: _compressPositiveMultiplier(dynamicMultiplier, dynamicExponent),
  };
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

export function init(savedMarketState) {
  _cycleState = {
    phaseIndex: ECONOMY_CONFIG.cycle.initialPhaseIndex,
    dayInPhase: 0,
    phaseDuration: ECONOMY_CONFIG.cycle.fallbackDuration,
    totalCycles: 0,
  };
  _randomiseModifiers();
  _initCycle();
  _initPriceHistory();
  Object.keys(_blackMarketQuotes).forEach(function (key) { delete _blackMarketQuotes[key]; });
  _restoreMarketState(savedMarketState);
}

// ---------------------------------------------------------------------------
// 价格历史
// ---------------------------------------------------------------------------

function _initPriceHistory() {
  SYSTEMS.forEach(function (sys) {
    _priceHistory[sys.id] = Object.create(null);
    GOODS.forEach(function (good) {
      _priceHistory[sys.id][good.id] = [];
    });
  });
}

function _recordPrices() {
  var maxDays = ECONOMY_CONFIG.history.maxDays;
  SYSTEMS.forEach(function (sys) {
    if (!_priceHistory[sys.id]) _priceHistory[sys.id] = Object.create(null);
    GOODS.forEach(function (good) {
      if (!_priceHistory[sys.id][good.id]) _priceHistory[sys.id][good.id] = [];
      var price = getSellPrice(sys.id, good.id);
      var arr = _priceHistory[sys.id][good.id];
      arr.push(price);
      if (arr.length > maxDays) arr.shift();
    });
  });
}

export function getPriceHistory(systemId, goodId) {
  if (_priceHistory[systemId] && _priceHistory[systemId][goodId]) {
    return _priceHistory[systemId][goodId].slice();
  }
  return [];
}

function _copyMarketMatrix(source, target, validator) {
  if (!source || typeof source !== 'object') return;
  SYSTEMS.forEach(function (system) {
    var savedRow = source[system.id];
    if (!savedRow || typeof savedRow !== 'object') return;
    GOODS.forEach(function (good) {
      var value = savedRow[good.id];
      if (validator(value)) target[system.id][good.id] = value;
    });
  });
}

function _restoreMarketState(saved) {
  if (!saved || typeof saved !== 'object') return false;
  _copyMarketMatrix(saved.modifiers, _modifiers, function (value) {
    return Number.isFinite(value) && value > 0;
  });
  _copyMarketMatrix(saved.supply, _supply, function (value) {
    return Number.isFinite(value);
  });
  _copyMarketMatrix(saved.demand, _demand, function (value) {
    return Number.isFinite(value);
  });
  _copyMarketMatrix(saved.priceHistory, _priceHistory, function (value) {
    return Array.isArray(value);
  });
  if (saved.blackMarketQuotes && typeof saved.blackMarketQuotes === 'object') {
    Object.keys(saved.blackMarketQuotes).forEach(function (key) {
      var value = saved.blackMarketQuotes[key];
      if (Number.isFinite(value) && value > 0) _blackMarketQuotes[key] = value;
    });
  }
  SYSTEMS.forEach(function (system) {
    GOODS.forEach(function (good) {
      _supply[system.id][good.id] = _clampSupplyDemand(_supply[system.id][good.id]);
      _demand[system.id][good.id] = _clampSupplyDemand(_demand[system.id][good.id]);
      _priceHistory[system.id][good.id] = _priceHistory[system.id][good.id]
        .filter(function (price) { return Number.isFinite(price) && price > 0; })
        .slice(-ECONOMY_CONFIG.history.maxDays);
    });
  });
  setCycleState(saved.cycle);
  return true;
}

/** 返回可直接写入存档的市场快照。 */
export function getMarketState() {
  return JSON.parse(JSON.stringify({
    version: 1,
    cycle: getCycleState(),
    modifiers: _modifiers,
    supply: _supply,
    demand: _demand,
    priceHistory: _priceHistory,
    blackMarketQuotes: _blackMarketQuotes,
  }));
}

// ---------------------------------------------------------------------------
// 产业链传导修正
// ---------------------------------------------------------------------------

function _getSupplyChainModifier(systemId, goodId) {
  var good = GOODS.find(function (g) { return g.id === goodId; });
  if (!good || !good.upstream || good.upstream.length === 0) return 1.0;

  var sys = SYSTEMS.find(function (s) { return s.id === systemId; });
  if (!sys) return 1.0;

  var factor = ECONOMY_CONFIG.supplyChain.propagationFactor;
  var totalInfluence = 0;

  good.upstream.forEach(function (dep) {
    var upMult = sys.prices[dep.goodId] || 1.0;
    var upMod = (_modifiers[systemId] && _modifiers[systemId][dep.goodId]) || 1.0;
    // 上游实际价格倍率相对基准 (1.0) 的偏差
    var deviation = (upMult * upMod) - 1.0;
    totalInfluence += deviation * dep.weight;
  });

  return 1.0 + totalInfluence * factor;
}

// ---------------------------------------------------------------------------
// 市场深度
// ---------------------------------------------------------------------------

export function getMarketDepth(systemId) {
  var sys = findSystem(systemId);
  if (!sys) return ECONOMY_CONFIG.marketDepth.defaultDepth;
  return sys.marketDepth || ECONOMY_CONFIG.marketDepth.defaultDepth;
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

  // 记录价格历史
  _recordPrices();

  return { cycleChanged: cycleChanged, cycle: cycle };
}

export function onPlayerBuy(systemId, goodId, quantity) {
  if (!_supply[systemId]) return;
  var depth = getMarketDepth(systemId);
  var scale = 1.0 + (quantity / depth) * ECONOMY_CONFIG.marketDepth.depthScaleFactor;
  _supply[systemId][goodId] = _clampSupplyDemand((_supply[systemId][goodId] || ECONOMY_CONFIG.supplyDemand.baseline) - quantity * ECONOMY_CONFIG.supplyDemand.buySupplyImpact * scale);
  _demand[systemId][goodId] = _clampSupplyDemand((_demand[systemId][goodId] || ECONOMY_CONFIG.supplyDemand.baseline) + quantity * ECONOMY_CONFIG.supplyDemand.buyDemandImpact * scale);
}

export function onPlayerSell(systemId, goodId, quantity) {
  if (!_supply[systemId]) return;
  var depth = getMarketDepth(systemId);
  var scale = 1.0 + (quantity / depth) * ECONOMY_CONFIG.marketDepth.depthScaleFactor;
  _supply[systemId][goodId] = _clampSupplyDemand((_supply[systemId][goodId] || ECONOMY_CONFIG.supplyDemand.baseline) + quantity * ECONOMY_CONFIG.supplyDemand.sellSupplyImpact * scale);
  _demand[systemId][goodId] = _clampSupplyDemand((_demand[systemId][goodId] || ECONOMY_CONFIG.supplyDemand.baseline) - quantity * ECONOMY_CONFIG.supplyDemand.sellDemandImpact * scale);
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
  const components = _getPriceComponents(systemId, goodId, state);
  let price  = calculatePrice(
    good.basePrice,
    components.systemMultiplier * components.dynamicMultiplier,
    ECONOMY_CONFIG.pricing.buyMultiplier
  );

  if (state) {
    price = _applyBuyAdjustments(price, state, systemId);
    price = _applyStarterMarketGuard(price, good, state);
  }
  return Math.max(ECONOMY_CONFIG.pricing.minimumPrice, price);
}

export function getSellPrice(systemId, goodId, state) {
  const sys  = SYSTEMS.find(function (s) { return s.id === systemId; });
  const good = GOODS.find(function (g) { return g.id === goodId; });
  if (!sys || !good || !_modifiers[systemId]) return ECONOMY_CONFIG.pricing.minimumPrice;
  const components = _getPriceComponents(systemId, goodId, state);
  let price  = calculatePrice(
    good.basePrice,
    components.systemMultiplier * components.dynamicMultiplier,
    ECONOMY_CONFIG.pricing.sellMultiplier
  );

  if (state) {
    price = _applySellAdjustments(price, state, systemId);
    price = _applyStarterMarketGuard(price, good, state);
  }
  return Math.max(ECONOMY_CONFIG.pricing.minimumPrice, price);
}

export function getFuelCost(fromId, toId, efficiency, state) {
  const s1 = findSystem(fromId);
  const s2 = findSystem(toId);
  if (!s1 || !s2) return ECONOMY_CONFIG.travel.invalidSystemFuelCost;
  if (s1.galaxyId !== s2.galaxyId) {
    const localDist = euclideanDistance(
      ECONOMY_CONFIG.travel.crossGalaxyOriginX,
      ECONOMY_CONFIG.travel.crossGalaxyOriginY,
      s2.x,
      s2.y
    );
    return Math.max(
      ECONOMY_CONFIG.pricing.minimumPrice,
      Math.ceil((GALAXY_JUMP_FUEL + localDist * ECONOMY_CONFIG.travel.crossGalaxyDistanceScale * FUEL_COST_PER_UNIT) * efficiency)
    );
  }
  const dist = euclideanDistance(s1.x, s1.y, s2.x, s2.y);
  var baseCost = Math.max(
    ECONOMY_CONFIG.pricing.minimumPrice,
    Math.ceil(dist * ECONOMY_CONFIG.travel.intraGalaxyDistanceScale * FUEL_COST_PER_UNIT * efficiency)
  );
  const routeInfo = state ? Exploration.getTravelRouteInfo(state, fromId, toId) : null;
  if (!routeInfo || !routeInfo.active) return baseCost;
  return Math.max(
    ECONOMY_CONFIG.pricing.minimumPrice,
    Math.ceil(baseCost * routeInfo.fuelMultiplier)
  );
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
    _cycleState.phaseIndex = Number.isInteger(saved.phaseIndex)
      ? Math.max(0, Math.min(CYCLE_PHASES.length - 1, saved.phaseIndex))
      : ECONOMY_CONFIG.cycle.initialPhaseIndex;
    _cycleState.dayInPhase = Number.isFinite(saved.dayInPhase) ? Math.max(0, saved.dayInPhase) : 0;
    _cycleState.phaseDuration = Number.isFinite(saved.phaseDuration) && saved.phaseDuration > 0
      ? saved.phaseDuration
      : ECONOMY_CONFIG.cycle.fallbackDuration;
    _cycleState.totalCycles = Number.isFinite(saved.totalCycles) ? Math.max(0, saved.totalCycles) : 0;
  }
}

export function getEconomyConfig() {
  return JSON.parse(JSON.stringify(ECONOMY_CONFIG));
}

function _asPositiveRate(value) {
  var numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function _getCappedCombinedAdvantage(rawBuyAdvantage, rawSellAdvantage) {
  var negotiation = ECONOMY_CONFIG.pricing.negotiation || {};
  var linearLimit = Math.max(0, Number(negotiation.linearCombinedAdvantage) || 0.10);
  var maximum = Math.max(linearLimit, Number(negotiation.maxCombinedAdvantage) || 0.17);
  var rawCombined = Math.max(0, rawBuyAdvantage + rawSellAdvantage);
  var effectiveCombined = rawCombined;

  if (rawCombined > linearLimit && maximum > linearLimit) {
    var overflow = rawCombined - linearLimit;
    var softRange = maximum - linearLimit;
    effectiveCombined = linearLimit + softRange * (1 - Math.exp(-overflow / softRange));
  }
  effectiveCombined = Math.min(maximum, effectiveCombined);

  if (rawCombined <= 0) {
    return { buyAdvantage: 0, sellAdvantage: 0, combinedAdvantage: 0, rawCombinedAdvantage: 0 };
  }

  return {
    buyAdvantage: effectiveCombined * rawBuyAdvantage / rawCombined,
    sellAdvantage: effectiveCombined * rawSellAdvantage / rawCombined,
    combinedAdvantage: effectiveCombined,
    rawCombinedAdvantage: rawCombined,
  };
}

/**
 * 汇总玩家在指定节点的实际议价空间。
 * 所有正向价格加成共享一个软上限；负面关系和路线信条代价单独结算。
 */
export function getTradeNegotiationProfile(state, systemId) {
  if (!state) {
    return {
      buyAdvantage: 0,
      sellAdvantage: 0,
      buyPenalty: 0,
      sellPenalty: 0,
      combinedAdvantage: 0,
      rawCombinedAdvantage: 0,
    };
  }

  var fleetTradeEffects = _getFleetTradeEffects(state);
  var policyEffects = getVictoryPolicyEffects(state);
  var taxModifier = Faction.getTaxModifier(state, systemId);
  var negotiation = ECONOMY_CONFIG.pricing.negotiation || {};
  var factionSensitivity = Math.max(0, Number(negotiation.factionTaxSensitivity) || 0.25);
  var factionDelta = (1 - (Number.isFinite(taxModifier) ? taxModifier : 1)) * factionSensitivity;
  var factionAdvantage = Math.max(0, factionDelta);
  var factionPenalty = Math.max(0, -factionDelta);

  var rawBuyAdvantage = _asPositiveRate(state.techBuyDiscount) +
    _asPositiveRate(fleetTradeEffects.buyDiscount) +
    _asPositiveRate(policyEffects.buyDiscount) +
    factionAdvantage;
  var rawSellAdvantage = _asPositiveRate(state.techSellBonus) +
    _asPositiveRate(fleetTradeEffects.sellBonus) +
    _asPositiveRate(policyEffects.sellBonus) +
    factionAdvantage;
  var capped = _getCappedCombinedAdvantage(rawBuyAdvantage, rawSellAdvantage);

  return {
    buyAdvantage: capped.buyAdvantage,
    sellAdvantage: capped.sellAdvantage,
    buyPenalty: Math.min(0.5, factionPenalty + _asPositiveRate(policyEffects.buyPricePenalty)),
    sellPenalty: Math.min(0.5, factionPenalty),
    combinedAdvantage: capped.combinedAdvantage,
    rawCombinedAdvantage: capped.rawCombinedAdvantage,
    rawBuyAdvantage: rawBuyAdvantage,
    rawSellAdvantage: rawSellAdvantage,
  };
}

function _applyBuyAdjustments(basePrice, state, systemId) {
  var profile = getTradeNegotiationProfile(state, systemId);
  return Math.ceil(basePrice * (1 - profile.buyAdvantage) * (1 + profile.buyPenalty));
}

function _applySellAdjustments(basePrice, state, systemId) {
  var profile = getTradeNegotiationProfile(state, systemId);
  return Math.floor(basePrice * (1 + profile.sellAdvantage) * (1 - profile.sellPenalty));
}

function _applyStarterMarketGuard(price, good, state) {
  var guard = ECONOMY_CONFIG.pricing.starterMarketGuard;
  if (!guard || !state || !good) return price;
  var tradeCount = Math.max(0, Math.floor(state.tradeCount || 0));
  if (tradeCount > guard.maxTradeCount) return price;

  var progress = guard.maxTradeCount > 0 ? tradeCount / guard.maxTradeCount : 1;
  var exponent = guard.startExponent +
    (guard.endExponent - guard.startExponent) * Math.max(0, Math.min(1, progress));
  var priceRatio = Math.max(0.05, price / Math.max(1, good.basePrice));
  var moderated = Math.round(good.basePrice * Math.pow(priceRatio, exponent));

  return Math.max(ECONOMY_CONFIG.pricing.minimumPrice, moderated);
}

function _getFleetTradeEffects(state) {
  if (!state || !Array.isArray(state.fleet) || state.fleet.length === 0) {
    return {};
  }

  var effects = {};
  var activeShip = state.fleet[state.activeShipIndex] || state.fleet[0];
  _mergeTradeEffects(effects, _getShipSkillTradeEffects(activeShip));
  _mergeTradeEffects(effects, _getShipModTradeEffects(activeShip));
  _mergeTradeEffects(effects, Crew.getShipEffects(state, activeShip));
  _mergeTradeEffects(effects, _getFleetBonusTradeEffects(state.fleet));
  return effects;
}

function _getShipSkillTradeEffects(ship) {
  if (!ship) return {};
  var shipType = SHIP_TYPES.find(function (type) { return type.id === ship.typeId; });
  if (!shipType || !Array.isArray(shipType.skills)) return {};

  var effects = {};
  shipType.skills.forEach(function (skill) {
    if (!skill.effect) return;
    _mergeTradeEffects(effects, skill.effect);
  });
  return effects;
}

function _getShipModTradeEffects(ship) {
  if (!ship || !Array.isArray(ship.mods)) return {};

  var effects = {};
  ship.mods.forEach(function (modId) {
    var mod = SHIP_MODS.find(function (item) { return item.id === modId; });
    if (!mod || !mod.effect) return;
    _mergeTradeEffects(effects, mod.effect);
  });
  return effects;
}

function _getFleetBonusTradeEffects(fleet) {
  var typeIds = [];
  fleet.forEach(function (ship) {
    if (ship && typeIds.indexOf(ship.typeId) === -1) {
      typeIds.push(ship.typeId);
    }
  });

  var effects = {};
  FLEET_BONUSES.forEach(function (bonus) {
    var isActive = bonus.requiredTypes.every(function (reqType) {
      return typeIds.indexOf(reqType) !== -1;
    });
    if (!isActive || !bonus.effect) return;
    _mergeTradeEffects(effects, bonus.effect);
  });
  return effects;
}

function _mergeTradeEffects(target, effect) {
  if (!effect) return target;
  if (effect.buyDiscount) target.buyDiscount = (target.buyDiscount || 0) + effect.buyDiscount;
  if (effect.sellBonus) target.sellBonus = (target.sellBonus || 0) + effect.sellBonus;
  return target;
}

// ---------------------------------------------------------------------------
// 黑市价格系统
// ---------------------------------------------------------------------------

function _stableQuoteNoise(systemId, goodId, day) {
  var text = String(systemId) + '|' + String(goodId) + '|' + String(day || 1);
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

/** 同一星球、同一天的稳定黑市中间价。 */
function _getBlackMarketMidPrice(systemId, goodId, state) {
  const good = GOODS.find(function (g) { return g.id === goodId; });
  if (!good) return ECONOMY_CONFIG.pricing.minimumPrice;
  const quoteDay = Math.max(1, Math.floor((state && state.day) || 1));
  const quoteKey = quoteDay + '|' + systemId + '|' + goodId;
  if (Number.isFinite(_blackMarketQuotes[quoteKey])) return _blackMarketQuotes[quoteKey];

  // 只保留最近两天，避免长期运行时缓存无限增长；当前报价会随市场快照存档。
  Object.keys(_blackMarketQuotes).forEach(function (key) {
    var savedDay = Number(key.split('|')[0]);
    if (Number.isFinite(savedDay) && savedDay < quoteDay - 1) delete _blackMarketQuotes[key];
  });
  const bm = ECONOMY_CONFIG.blackMarket;
  const openMid = (getBuyPrice(systemId, goodId, state) + getSellPrice(systemId, goodId, state)) / 2;
  let legalityPremium = 1;
  if (good.legality === 'illegal') legalityPremium = bm.illegalValuePremium;
  else if (good.legality === 'restricted') legalityPremium = bm.restrictedValuePremium;
  const noise = 1 + (_stableQuoteNoise(systemId, goodId, quoteDay) * 2 - 1) * bm.dailyVolatility;
  const midpoint = Math.max(ECONOMY_CONFIG.pricing.minimumPrice, Math.round(openMid * legalityPremium * noise));
  _blackMarketQuotes[quoteKey] = midpoint;
  return midpoint;
}

/** 黑市买入价：报价在当天固定，并包含明确的买卖价差。 */
export function getBlackMarketBuyPrice(systemId, goodId, state) {
  if (!GOODS.some(function (good) { return good.id === goodId; })) {
    return ECONOMY_CONFIG.pricing.minimumPrice;
  }
  return Math.max(
    ECONOMY_CONFIG.pricing.minimumPrice,
    Math.ceil(_getBlackMarketMidPrice(systemId, goodId, state) * ECONOMY_CONFIG.blackMarket.buySpread)
  );
}

/**
 * 黑市卖出价 —— 走私品高溢价（高利润驱动走私）
 */
export function getBlackMarketSellPrice(systemId, goodId, state) {
  const good = GOODS.find(function (g) { return g.id === goodId; });
  if (!good) return ECONOMY_CONFIG.pricing.minimumPrice;
  const bm = ECONOMY_CONFIG.blackMarket;
  const policyEffects = getVictoryPolicyEffects(state);
  const sellSpread = bm.sellSpread * (1 + (policyEffects.blackMarketSellBonus || 0));
  return Math.max(
    ECONOMY_CONFIG.pricing.minimumPrice,
    Math.floor(_getBlackMarketMidPrice(systemId, goodId, state) * sellSpread)
  );
}

/**
 * 判断商品是否可以在黑市交易
 */
export function isBlackMarketGood(goodId) {
  const good = GOODS.find(function (g) { return g.id === goodId; });
  return !!(good && good.marketAccess && good.marketAccess.indexOf('black') !== -1);
}

/**
 * 获取可在黑市交易的商品列表
 */
export function getBlackMarketGoods() {
  return GOODS.filter(function (g) {
    return g.marketAccess && g.marketAccess.indexOf('black') !== -1;
  });
}

// ---------------------------------------------------------------------------
// 走私检查系统
// ---------------------------------------------------------------------------

/**
 * 获取星系执法等级
 */
function _getEnforcementLevel(systemId) {
  const faction = Faction.getFactionForSystem(systemId);
  if (!faction) return 'medium';
  // 联邦区域高执法，辛迪加区域低执法
  if (faction.id === 'federation') return 'high';
  if (faction.id === 'syndicate') return 'low';
  return 'medium';
}

export function getEnforcementLevel(systemId) {
  return _getEnforcementLevel(systemId);
}

/**
 * 计算走私品价值占比
 */
function _getContraband(state) {
  const items = [];
  let contrabandValue = 0;
  let totalValue = 0;
  Object.keys(state.cargo).forEach(function (goodId) {
    const qty = state.cargo[goodId];
    if (qty <= 0) return;
    const good = GOODS.find(function (g) { return g.id === goodId; });
    if (!good) return;
    const price = good.basePrice * qty;
    totalValue += price;
    if (good.legality === 'illegal') {
      contrabandValue += price;
      items.push({ goodId: goodId, name: good.name, emoji: good.emoji, qty: qty, value: price });
    }
  });
  return { items: items, contrabandValue: contrabandValue, totalValue: totalValue, ratio: totalValue > 0 ? contrabandValue / totalValue : 0 };
}

function _getContrabandFromCargo(cargo) {
  const items = [];
  let contrabandValue = 0;
  let totalValue = 0;
  Object.keys(cargo || {}).forEach(function (goodId) {
    const qty = cargo[goodId];
    if (qty <= 0) return;
    const good = GOODS.find(function (g) { return g.id === goodId; });
    if (!good) return;
    const price = good.basePrice * qty;
    totalValue += price;
    if (good.legality === 'illegal') {
      contrabandValue += price;
      items.push({ goodId: goodId, name: good.name, emoji: good.emoji, qty: qty, value: price });
    }
  });
  return { items: items, contrabandValue: contrabandValue, totalValue: totalValue, ratio: totalValue > 0 ? contrabandValue / totalValue : 0 };
}

export function estimateSmugglingCargoRisk(state, systemId, cargo) {
  const cfg = ECONOMY_CONFIG.smuggling;
  const enforcement = _getEnforcementLevel(systemId);
  const contraband = _getContrabandFromCargo(cargo || {});
  const protectedByBlackMarket = Faction.canAccessBlackMarket(state, systemId);
  const reputationMod = Math.max(0.2, 1 - (state.reputation || 0) / cfg.reputationDivisor);
  let checkChance = 0;

  if (!protectedByBlackMarket && contraband.items.length > 0) {
    checkChance = cfg.baseCheckChance * (cfg.enforcementLevels[enforcement] || 1.0) * contraband.ratio * reputationMod;
  }

  checkChance = Math.max(0, Math.min(1, checkChance));

  return {
    enforcement: enforcement,
    enforcementLabel: enforcement === 'high' ? '高执法区' : enforcement === 'medium' ? '中执法区' : '低执法区',
    hasContraband: contraband.items.length > 0,
    contrabandGoods: contraband.items.map(function (item) { return item.name; }),
    contrabandRatio: contraband.ratio,
    contrabandValue: contraband.contrabandValue,
    totalValue: contraband.totalValue,
    protectedByBlackMarket: protectedByBlackMarket,
    reputationModifier: reputationMod,
    checkChance: checkChance,
    checkChancePercent: Math.round(checkChance * 100),
  };
}

export function checkSmugglingCargo(state, systemId, cargo, options) {
  options = options || {};
  const riskEstimate = estimateSmugglingCargoRisk(state, systemId, cargo);
  const contraband = _getContrabandFromCargo(cargo || {});
  if (!riskEstimate.hasContraband) {
    return { caught: false, evaded: false, risked: false, protected: false, fine: 0, confiscated: [], confiscatedCostBasis: 0, hullDamage: 0, msgs: [] };
  }

  const cfg = ECONOMY_CONFIG.smuggling;
  const smugglingStats = _ensureSmugglingStats(state);

  if (riskEstimate.protectedByBlackMarket) {
    smugglingStats.protectedArrivals++;
    return { caught: false, evaded: false, risked: false, protected: true, fine: 0, confiscated: [], confiscatedCostBasis: 0, hullDamage: 0, msgs: [{ text: '🕶 辛迪加势力庇护，安全入港。', type: 'info' }] };
  }

  var adjustedChance = Math.max(0, Math.min(1, riskEstimate.checkChance * (options.checkChanceMultiplier || 1)));
  smugglingStats.riskedArrivals++;

  if (Math.random() >= adjustedChance) {
    return { caught: false, evaded: true, risked: true, protected: false, fine: 0, confiscated: [], confiscatedCostBasis: 0, hullDamage: 0, msgs: [{ text: '🕶 安全通过入港检查。', type: 'info' }] };
  }

  const fine = Math.round((contraband.contrabandValue * cfg.fineMultiplier + cfg.baseFine) * (options.fineMultiplier || 1));
  const msgs = [];
  const confiscated = [];
  let confiscatedCostBasis = 0;
  const cargoCost = options.cargoCost && typeof options.cargoCost === 'object' ? options.cargoCost : null;

  msgs.push({ text: '🚨 入港安检发现走私品！', type: 'danger' });

  const actualFine = Math.min(fine, state.credits);
  state.credits -= actualFine;
  msgs.push({ text: '💸 罚款 ' + actualFine + ' 积分。', type: 'error' });

  if (cfg.confiscate) {
    contraband.items.forEach(function (item) {
      confiscated.push({ goodId: item.goodId, name: item.name, qty: item.qty });
      if (cargoCost) confiscatedCostBasis += Math.max(0, Number(cargoCost[item.goodId]) || 0);
      delete cargo[item.goodId];
      if (cargoCost) delete cargoCost[item.goodId];
    });
    msgs.push({ text: '📦 违禁品被没收：' + confiscated.map(function (c) { return c.name + '×' + c.qty; }).join('、'), type: 'error' });
  }

  var hullDamage = 0;
  if (cfg.hullDamage) {
    hullDamage = Math.max(0, Math.round(cfg.hullDamage * (options.hullDamageMultiplier || 1)));
    if (typeof options.applyHullDamage === 'function') {
      options.applyHullDamage(hullDamage);
    } else {
      state.shipHull = Math.max(1, (state.shipHull || 100) - hullDamage);
    }
    if (hullDamage > 0) {
      msgs.push({ text: '💥 强制搜查造成船体损伤 -' + hullDamage, type: 'error' });
    }
  }

  smugglingStats.caught++;
  smugglingStats.finesPaid += actualFine;
  smugglingStats.confiscatedCostBasis += confiscatedCostBasis;
  smugglingStats.hullDamage += hullDamage;

  return {
    caught: true,
    evaded: false,
    risked: true,
    protected: false,
    fine: actualFine,
    confiscated: confiscated,
    confiscatedCostBasis: confiscatedCostBasis,
    hullDamage: hullDamage,
    msgs: msgs,
  };
}

/**
 * 入港时执法检查 —— 返回 { caught, fine, confiscated, msgs }
 * 仅在携带违禁品且目标星系非辛迪加友好区时触发
 */
export function checkSmuggling(state, systemId) {
  return checkSmugglingCargo(state, systemId, state.cargo, {
    cargoCost: state.cargoCost,
    applyHullDamage: function (damage) {
      state.shipHull = Math.max(1, (state.shipHull || 100) - damage);
    },
  });
}

/**
 * 走私成功时记录统计
 */
export function recordSmugglingEvaded(state) {
  _ensureSmugglingStats(state).evaded++;
}

/**
 * 黑市交易成功时记录统计
 */
export function recordBlackMarketTrade(state, details) {
  const stats = _ensureSmugglingStats(state);
  const context = details && typeof details === 'object' ? details : {};
  const meta = context.meta && typeof context.meta === 'object' ? context.meta : {};
  stats.blackMarketTrades++;
  if (context.action === 'buy') {
    stats.blackMarketBuyCost += Math.max(0, Number(meta.totalCost) || 0);
  } else if (context.action === 'sell') {
    stats.blackMarketSellRevenue += Math.max(0, Number(meta.totalEarned) || 0);
    stats.blackMarketRealizedProfit += Number(meta.profit) || 0;
  }
  return stats;
}
