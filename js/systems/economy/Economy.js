// js/systems/economy/Economy.js — 市场价格模拟
// 依赖：data/goods.js, data/systems.js
// 导出：Economy { init, advanceDay, getBuyPrice, getSellPrice, getFuelCost, getSystemMultiplier }
//
// 生产环境中，calculatePrice / euclideanDistance 的热路径运算应编译为
// WebAssembly 模块（如 Rust/C++）。此处保留与 WASM 导出面相同的函数签名。

import { GOODS }                          from '../../data/goods.js';
import { ECONOMY_CONFIG }                from '../../data/constants.js';
import { SHIP_TYPES, SHIP_MODS, FLEET_BONUSES } from '../../data/ships.js';
import { SYSTEMS, FUEL_COST_PER_UNIT, GALAXY_JUMP_FUEL, findSystem } from '../../data/systems.js';
import * as Faction                       from '../faction/FactionSystem.js';
import * as Crew                         from '../fleet/CrewSystem.js';
import * as Exploration                  from '../galaxy/ExplorationSystem.js';

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
  _initPriceHistory();
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
  const m    = _modifiers[systemId][goodId] * sys.prices[goodId];
  const sdMod = _getSupplyDemandPriceModifier(systemId, goodId);
  const cycleMod = CYCLE_PHASES[_cycleState.phaseIndex].priceMod;
  const chainMod = _getSupplyChainModifier(systemId, goodId);
  let price  = calculatePrice(good.basePrice, m * sdMod * cycleMod * chainMod, ECONOMY_CONFIG.pricing.buyMultiplier);

  if (state) {
    price = _applyBuyAdjustments(price, state, systemId);
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
  const chainMod = _getSupplyChainModifier(systemId, goodId);
  let price  = calculatePrice(good.basePrice, m * sdMod * cycleMod * chainMod, ECONOMY_CONFIG.pricing.sellMultiplier);

  if (state) {
    price = _applySellAdjustments(price, state, systemId);
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
    _cycleState.phaseIndex = saved.phaseIndex || ECONOMY_CONFIG.cycle.initialPhaseIndex;
    _cycleState.dayInPhase = saved.dayInPhase || 0;
    _cycleState.phaseDuration = saved.phaseDuration || ECONOMY_CONFIG.cycle.fallbackDuration;
    _cycleState.totalCycles = saved.totalCycles || 0;
  }
}

export function getEconomyConfig() {
  return JSON.parse(JSON.stringify(ECONOMY_CONFIG));
}

function _applyBuyAdjustments(basePrice, state, systemId) {
  var price = basePrice;
  var fleetTradeEffects = _getFleetTradeEffects(state);
  ECONOMY_CONFIG.pricing.buyAdjustmentOrder.forEach(function (step) {
    if (step === 'factionTax') {
      price = Math.round(price * Faction.getTaxModifier(state, systemId));
      return;
    }
    if (step === 'techBuyDiscount' && state.techBuyDiscount) {
      price = Math.round(price * (1 - state.techBuyDiscount));
      return;
    }
    if (step === 'fleetTradeBonus' && fleetTradeEffects.buyDiscount) {
      price = Math.round(price * (1 - fleetTradeEffects.buyDiscount));
    }
  });
  return price;
}

function _applySellAdjustments(basePrice, state, systemId) {
  var price = basePrice;
  var fleetTradeEffects = _getFleetTradeEffects(state);
  ECONOMY_CONFIG.pricing.sellAdjustmentOrder.forEach(function (step) {
    if (step === 'factionTax') {
      var taxMod = Faction.getTaxModifier(state, systemId);
      var sellTax = ECONOMY_CONFIG.pricing.sellTaxBase - taxMod;
      price = Math.round(price * sellTax);
      return;
    }
    if (step === 'techSellBonus' && state.techSellBonus) {
      price = Math.round(price * (1 + state.techSellBonus));
      return;
    }
    if (step === 'fleetTradeBonus' && fleetTradeEffects.sellBonus) {
      price = Math.round(price * (1 + fleetTradeEffects.sellBonus));
    }
  });
  return price;
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

/**
 * 黑市买入价 —— 高于公开市场，波动更大
 * 违禁品只能在此购买；受监管商品附加限制区溢价
 */
export function getBlackMarketBuyPrice(systemId, goodId, state) {
  const good = GOODS.find(function (g) { return g.id === goodId; });
  if (!good) return ECONOMY_CONFIG.pricing.minimumPrice;

  // 黑市基础价使用公开价 × 黑市溢价
  const bm = ECONOMY_CONFIG.blackMarket;
  const openPrice = getBuyPrice(systemId, goodId, state);

  // 额外波动
  const volatilityNoise = 1 + (Math.random() - 0.5) * (bm.volatility - 1);
  const premiumMultiplier = Math.max(bm.pricePremium, bm.pricePremium * volatilityNoise);
  const price = Math.round(openPrice * premiumMultiplier);

  return Math.max(ECONOMY_CONFIG.pricing.minimumPrice, price);
}

/**
 * 黑市卖出价 —— 走私品高溢价（高利润驱动走私）
 */
export function getBlackMarketSellPrice(systemId, goodId, state) {
  const good = GOODS.find(function (g) { return g.id === goodId; });
  if (!good) return ECONOMY_CONFIG.pricing.minimumPrice;

  const bm = ECONOMY_CONFIG.blackMarket;
  const openPrice = getSellPrice(systemId, goodId, state);
  let premiumMultiplier = bm.sellPremium;

  // 违禁品额外加成
  if (good.legality === 'illegal') {
    premiumMultiplier *= bm.illegalSellBonus;
  } else if (good.legality === 'restricted') {
    premiumMultiplier *= bm.restrictedSellBonus;
  }

  // 额外波动
  const volatilityNoise = 1 + (Math.random() - 0.5) * (bm.volatility - 1);
  const effectiveMultiplier = Math.max(premiumMultiplier, premiumMultiplier * volatilityNoise);
  const price = Math.round(openPrice * effectiveMultiplier);

  return Math.max(ECONOMY_CONFIG.pricing.minimumPrice, price);
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
    return { caught: false, fine: 0, confiscated: [], msgs: [] };
  }

  const cfg = ECONOMY_CONFIG.smuggling;

  if (riskEstimate.protectedByBlackMarket) {
    return { caught: false, fine: 0, confiscated: [], msgs: [{ text: '🕶 辛迪加势力庇护，安全入港。', type: 'info' }] };
  }

  if (Math.random() >= riskEstimate.checkChance) {
    return { caught: false, fine: 0, confiscated: [], msgs: [{ text: '🕶 安全通过入港检查。', type: 'info' }] };
  }

  const fine = Math.round(contraband.contrabandValue * cfg.fineMultiplier + cfg.baseFine);
  const msgs = [];
  const confiscated = [];
  const cargoCost = options.cargoCost && typeof options.cargoCost === 'object' ? options.cargoCost : null;

  msgs.push({ text: '🚨 入港安检发现走私品！', type: 'danger' });

  const actualFine = Math.min(fine, state.credits);
  state.credits -= actualFine;
  msgs.push({ text: '💸 罚款 ' + actualFine + ' 积分。', type: 'error' });

  if (cfg.confiscate) {
    contraband.items.forEach(function (item) {
      confiscated.push({ goodId: item.goodId, name: item.name, qty: item.qty });
      delete cargo[item.goodId];
      if (cargoCost) delete cargoCost[item.goodId];
    });
    msgs.push({ text: '📦 违禁品被没收：' + confiscated.map(function (c) { return c.name + '×' + c.qty; }).join('、'), type: 'error' });
  }

  if (cfg.hullDamage) {
    if (typeof options.applyHullDamage === 'function') {
      options.applyHullDamage(cfg.hullDamage);
    } else {
      state.shipHull = Math.max(1, (state.shipHull || 100) - cfg.hullDamage);
    }
    msgs.push({ text: '💥 强制搜查造成船体损伤 -' + cfg.hullDamage, type: 'error' });
  }

  if (!state.smugglingStats) state.smugglingStats = { caught: 0, evaded: 0, finesPaid: 0, blackMarketTrades: 0 };
  state.smugglingStats.caught++;
  state.smugglingStats.finesPaid += actualFine;

  return { caught: true, fine: actualFine, confiscated: confiscated, msgs: msgs };
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
  if (!state.smugglingStats) state.smugglingStats = { caught: 0, evaded: 0, finesPaid: 0, blackMarketTrades: 0 };
  state.smugglingStats.evaded++;
}

/**
 * 黑市交易成功时记录统计
 */
export function recordBlackMarketTrade(state) {
  if (!state.smugglingStats) state.smugglingStats = { caught: 0, evaded: 0, finesPaid: 0, blackMarketTrades: 0 };
  state.smugglingStats.blackMarketTrades++;
}
