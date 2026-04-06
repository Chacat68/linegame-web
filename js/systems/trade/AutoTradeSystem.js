// js/systems/trade/AutoTradeSystem.js — 自动贸易路线计算
// 依赖：data/goods.js, data/systems.js, systems/economy/Economy.js, systems/trade/TradeSystem.js
// 导出：findBestTrade, findBestSellSystem, findQuestRoute

import { GOODS }   from '../../data/goods.js';
import { SYSTEMS, getSystemsByGalaxy } from '../../data/systems.js';
import * as Economy from '../economy/Economy.js';
import * as Faction from '../faction/FactionSystem.js';
import { getTotalCargo } from './TradeSystem.js';

export function normalizeTradePolicy(policy) {
  if (policy && policy._normalized === true) return policy;

  var normalized = {
    maxBuyPrice: null,
    minSellPrice: null,
    minProfitRate: null,
    riskMode: 'balanced',
    marketMode: 'open',
  };

  if (!policy || typeof policy !== 'object') return normalized;

  if (Number.isFinite(policy.maxBuyPrice) && policy.maxBuyPrice >= 0) {
    normalized.maxBuyPrice = policy.maxBuyPrice;
  }
  if (Number.isFinite(policy.minSellPrice) && policy.minSellPrice >= 0) {
    normalized.minSellPrice = policy.minSellPrice;
  }
  if (Number.isFinite(policy.minProfitRate) && policy.minProfitRate >= 0) {
    normalized.minProfitRate = policy.minProfitRate > 1 ? policy.minProfitRate / 100 : policy.minProfitRate;
  }
  if (policy.riskMode === 'safe' || policy.riskMode === 'balanced' || policy.riskMode === 'aggressive') {
    normalized.riskMode = policy.riskMode;
  }
  if (policy.marketMode === 'black' || policy.marketMode === 'open') {
    normalized.marketMode = policy.marketMode;
  }

  Object.defineProperty(normalized, '_normalized', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return normalized;
}

export function hasTradePolicy(policy) {
  var normalized = normalizeTradePolicy(policy);
  return normalized.maxBuyPrice != null || normalized.minSellPrice != null || normalized.minProfitRate != null;
}

export function getUnitProfitRate(buyPrice, sellPrice) {
  if (!Number.isFinite(buyPrice) || buyPrice <= 0 || !Number.isFinite(sellPrice)) return 0;
  return (sellPrice - buyPrice) / buyPrice;
}

export function evaluateTradePolicy(buyPrice, sellPrice, policy) {
  var normalized = normalizeTradePolicy(policy);
  var reasons = [];
  var profitRate = getUnitProfitRate(buyPrice, sellPrice);

  if (normalized.maxBuyPrice != null && buyPrice > normalized.maxBuyPrice) {
    reasons.push('买入价高于上限');
  }
  if (normalized.minSellPrice != null && sellPrice < normalized.minSellPrice) {
    reasons.push('卖出价低于下限');
  }
  if (normalized.minProfitRate != null && profitRate < normalized.minProfitRate) {
    reasons.push('利润率低于阈值');
  }

  return {
    ok: reasons.length === 0,
    reasons: reasons,
    profitRate: profitRate,
    policy: normalized,
  };
}

export function isOpenMarketGood(good) {
  return !!(good && Array.isArray(good.marketAccess) && good.marketAccess.indexOf('open') !== -1);
}

export function isGoodAllowedInMarket(good, marketMode) {
  if (!good) return false;
  if (marketMode === 'black') return Economy.isBlackMarketGood(good.id);
  return isOpenMarketGood(good);
}

export function canUseMarket(state, systemId, marketMode) {
  if (marketMode === 'black') {
    return Faction.canAccessBlackMarket(state, systemId);
  }
  return true;
}

function _getSellPriceForMarket(state, systemId, good, marketMode) {
  if (marketMode === 'black' && canUseMarket(state, systemId, 'black') && Economy.isBlackMarketGood(good.id)) {
    return Economy.getBlackMarketSellPrice(systemId, good.id, state);
  }
  return Economy.getSellPrice(systemId, good.id, state);
}

export function assessTradeRisk(good, buySystemId, sellSystemId, marketMode) {
  var buyEnforcement = Economy.getEnforcementLevel(buySystemId);
  var sellEnforcement = Economy.getEnforcementLevel(sellSystemId);
  var riskScore = 0;
  var tags = [];

  if (!good) {
    return {
      riskScore: 99,
      riskLevel: 'high',
      tags: ['unknown_good'],
      buyEnforcement: buyEnforcement,
      sellEnforcement: sellEnforcement,
    };
  }

  if (!isOpenMarketGood(good)) {
    riskScore += 100;
    tags.push('black_market_only');
  }

  if (marketMode === 'black') {
    riskScore += 2;
    tags.push('black_market_route');
  }

  if (good.legality === 'restricted') {
    riskScore += 2;
    tags.push('restricted_good');
  } else if (good.legality === 'illegal') {
    riskScore += 5;
    tags.push('illegal_good');
  }

  if (buyEnforcement === 'high') {
    riskScore += 2;
    tags.push('high_enforcement_buy');
  } else if (buyEnforcement === 'medium') {
    riskScore += 1;
  }

  if (sellEnforcement === 'high') {
    riskScore += 2;
    tags.push('high_enforcement_sell');
  } else if (sellEnforcement === 'medium') {
    riskScore += 1;
  }

  var riskLevel = 'low';
  if (riskScore >= 5) riskLevel = 'high';
  else if (riskScore >= 2) riskLevel = 'medium';

  return {
    riskScore: riskScore,
    riskLevel: riskLevel,
    tags: tags,
    buyEnforcement: buyEnforcement,
    sellEnforcement: sellEnforcement,
  };
}

export function applyRiskPreference(profit, riskAssessment, policy) {
  var normalized = normalizeTradePolicy(policy);
  var tags = riskAssessment && riskAssessment.tags ? riskAssessment.tags : [];
  var riskScore = riskAssessment ? riskAssessment.riskScore : 0;

  if (normalized.marketMode !== 'black' && tags.indexOf('black_market_only') !== -1) {
    return { allowed: false, adjustedProfit: profit };
  }

  if (normalized.riskMode === 'safe') {
    if (tags.indexOf('restricted_good') !== -1 || tags.indexOf('illegal_good') !== -1) {
      return { allowed: false, adjustedProfit: profit };
    }
    if (tags.indexOf('black_market_route') !== -1) {
      return { allowed: false, adjustedProfit: profit };
    }
    if (tags.indexOf('high_enforcement_buy') !== -1 || tags.indexOf('high_enforcement_sell') !== -1) {
      return { allowed: false, adjustedProfit: profit };
    }
    return { allowed: true, adjustedProfit: profit - riskScore * 50 };
  }

  if (normalized.riskMode === 'aggressive') {
    var aggressiveBonus = tags.indexOf('restricted_good') !== -1 ? 100 : 0;
    return { allowed: true, adjustedProfit: profit - riskScore * 10 + aggressiveBonus };
  }

  return { allowed: true, adjustedProfit: profit - riskScore * 30 };
}

export function estimateDispatchInspectionRisk(state, good, quantity, sellSystemId, marketMode) {
  var cargo = {};
  var riskEstimate;

  if (good && Number.isFinite(quantity) && quantity > 0) {
    cargo[good.id] = quantity;
  }

  riskEstimate = Economy.estimateSmugglingCargoRisk(state, sellSystemId, cargo);

  return {
    marketMode: marketMode || 'open',
    enforcement: riskEstimate.enforcement,
    enforcementLabel: riskEstimate.enforcementLabel,
    isHighEnforcement: riskEstimate.enforcement === 'high',
    hasContraband: riskEstimate.hasContraband,
    contrabandGoods: riskEstimate.contrabandGoods,
    protectedByBlackMarket: riskEstimate.protectedByBlackMarket,
    checkChance: riskEstimate.checkChance,
    checkChancePercent: riskEstimate.checkChancePercent,
  };
}

export function findBestDispatchRoute(state, options, tradePolicy) {
  options = options || {};
  var normalizedPolicy = normalizeTradePolicy(tradePolicy);

  var currentSystem = options.currentSystem || state.currentSystem;
  var currentGalaxy = options.currentGalaxy || state.currentGalaxy || 'milky_way';
  var fuelEfficiency = Number.isFinite(options.fuelEfficiency) ? options.fuelEfficiency : state.fuelEfficiency;
  var credits = Number.isFinite(options.credits) ? options.credits : state.credits;
  var cargoFree = Number.isFinite(options.cargoFree) ? options.cargoFree : (state.maxCargo - getTotalCargo(state));
  var allowedSystemIds = Array.isArray(options.systemIds) && options.systemIds.length > 0 ? options.systemIds : null;
  var playerLevel = options.playerLevel || state.playerLevel || 1;

  if (!currentSystem || cargoFree <= 0 || credits <= 0) return null;

  var systems = allowedSystemIds
    ? allowedSystemIds.map(function (id) {
        return SYSTEMS.find(function (sys) { return sys.id === id; });
      }).filter(Boolean)
    : getSystemsByGalaxy(currentGalaxy).filter(function (sys) {
        return playerLevel >= (sys.minLevel || 1);
      });

  if (systems.length < 2) return null;

  var fuelUnitPrice = Economy.getBuyPrice(currentSystem, 'fuel', state);
  var best = null;

  GOODS.forEach(function (good) {
    if (good.id === 'fuel' || !isGoodAllowedInMarket(good, normalizedPolicy.marketMode)) return;

    systems.forEach(function (buySys) {
      if (!canUseMarket(state, buySys.id, normalizedPolicy.marketMode)) return;
      var buyPrice = Economy.getBuyPrice(buySys.id, good.id, state);
      if (normalizedPolicy.marketMode === 'black') {
        buyPrice = Economy.getBlackMarketBuyPrice(buySys.id, good.id, state);
      }
      if (buyPrice <= 0) return;

      var canBuy = Math.min(Math.floor(credits / buyPrice), cargoFree);
      if (canBuy <= 0) return;

      systems.forEach(function (sellSys) {
        if (sellSys.id === buySys.id) return;

        var sellPrice = _getSellPriceForMarket(state, sellSys.id, good, normalizedPolicy.marketMode);
        var policyCheck = evaluateTradePolicy(buyPrice, sellPrice, normalizedPolicy);
        if (!policyCheck.ok) return;
        var riskAssessment = assessTradeRisk(good, buySys.id, sellSys.id, normalizedPolicy.marketMode);

        var travelToBuyFuel = currentSystem === buySys.id ? 0 : Economy.getFuelCost(currentSystem, buySys.id, fuelEfficiency, state);
        var travelToSellFuel = buySys.id === sellSys.id ? 0 : Economy.getFuelCost(buySys.id, sellSys.id, fuelEfficiency, state);
        var totalFuelCost = travelToBuyFuel + travelToSellFuel;
        var fuelCredits = totalFuelCost * fuelUnitPrice;
        var profit = (sellPrice - buyPrice) * canBuy - fuelCredits;
        var riskAdjusted = applyRiskPreference(profit, riskAssessment, normalizedPolicy);
        var inspectionRisk = estimateDispatchInspectionRisk(state, good, canBuy, sellSys.id, normalizedPolicy.marketMode);

        if (!riskAdjusted.allowed) return;

        if (!best || riskAdjusted.adjustedProfit > best.adjustedProfit) {
          best = {
            buySystemId: buySys.id,
            buySystemName: buySys.name,
            sellSystemId: sellSys.id,
            sellSystemName: sellSys.name,
            goodId: good.id,
            goodName: good.name,
            quantity: canBuy,
            buyPrice: buyPrice,
            sellPrice: sellPrice,
            profit: profit,
            adjustedProfit: riskAdjusted.adjustedProfit,
            profitRate: policyCheck.profitRate,
            fuelCost: totalFuelCost,
            riskLevel: riskAssessment.riskLevel,
            riskTags: riskAssessment.tags,
            buyEnforcement: riskAssessment.buyEnforcement,
            sellEnforcement: riskAssessment.sellEnforcement,
            inspectionRisk: inspectionRisk,
            marketMode: normalizedPolicy.marketMode,
          };
        }
      });
    });
  });

  return best;
}

/**
 * 在当前星系寻找最优买入商品及最优目标星系。
 * 综合考虑买入价格、目标卖出价格与燃料成本。
 * @param {object} state
 * @returns {{ goodId, goodName, sellSystemId, sellSystemName, quantity, profit, buyPrice, sellPrice, fuelCost } | null}
 */
export function findBestTrade(state, tradePolicy) {
  var normalizedPolicy = normalizeTradePolicy(tradePolicy);
  const cargoFree = state.maxCargo - getTotalCargo(state);
  if (cargoFree <= 0) return null;

  // 燃料单价只与当前星系有关，在循环外计算一次
  const fuelUnitPrice = Economy.getBuyPrice(state.currentSystem, 'fuel', state);

  let best = null;

  GOODS.forEach(function (good) {
    if (good.id === 'fuel' || !isGoodAllowedInMarket(good, normalizedPolicy.marketMode)) return;

    if (!canUseMarket(state, state.currentSystem, normalizedPolicy.marketMode)) return;

    const buyPrice = normalizedPolicy.marketMode === 'black'
      ? Economy.getBlackMarketBuyPrice(state.currentSystem, good.id, state)
      : Economy.getBuyPrice(state.currentSystem, good.id, state);
    if (buyPrice <= 0) return;
    const canBuy = Math.min(Math.floor(state.credits / buyPrice), cargoFree);
    if (canBuy <= 0) return;

    SYSTEMS.forEach(function (sys) {
      if (sys.id === state.currentSystem) return;
      // 只搜索同星系内的星球
      if (sys.galaxyId !== (state.currentGalaxy || 'milky_way')) return;
      // 跳过未解锁星球
      if ((state.playerLevel || 1) < (sys.minLevel || 1)) return;
      const sellPrice    = _getSellPriceForMarket(state, sys.id, good, normalizedPolicy.marketMode);
      const fuelCost     = Economy.getFuelCost(state.currentSystem, sys.id, state.fuelEfficiency, state);
      const fuelCredits  = fuelCost * fuelUnitPrice;
      const profit       = (sellPrice - buyPrice) * canBuy - fuelCredits;
      const policyCheck  = evaluateTradePolicy(buyPrice, sellPrice, normalizedPolicy);
      const riskAssessment = assessTradeRisk(good, state.currentSystem, sys.id, normalizedPolicy.marketMode);
      const riskAdjusted = applyRiskPreference(profit, riskAssessment, normalizedPolicy);

      if (!policyCheck.ok || !riskAdjusted.allowed) return;

      if (!best || riskAdjusted.adjustedProfit > best.adjustedProfit) {
        best = {
          goodId:         good.id,
          goodName:       good.name,
          sellSystemId:   sys.id,
          sellSystemName: sys.name,
          quantity:       canBuy,
          profit:         profit,
          adjustedProfit: riskAdjusted.adjustedProfit,
          profitRate:     policyCheck.profitRate,
          buyPrice:       buyPrice,
          sellPrice:      sellPrice,
          fuelCost:       fuelCost,
          riskLevel:      riskAssessment.riskLevel,
          riskTags:       riskAssessment.tags,
          marketMode:     normalizedPolicy.marketMode,
        };
      }
    });
  });

  return best;
}

/**
 * 已有货物时，寻找最优出售星系（综合卖出收入与燃料成本）。
 * @param {object} state
 * @returns {{ systemId, systemName, profit, fuelCost } | null}
 */
export function findBestSellSystem(state) {
  const cargoEntries = Object.entries(state.cargo).filter(function (e) { return e[1] > 0; });
  if (cargoEntries.length === 0) return null;

  // 燃料单价只与当前星系有关，在循环外计算一次
  const fuelUnitPrice = Economy.getBuyPrice(state.currentSystem, 'fuel', state);
  let best = null;

  SYSTEMS.forEach(function (sys) {
    if (sys.id === state.currentSystem) return;
    // 只搜索同星系内的星球
    if (sys.galaxyId !== (state.currentGalaxy || 'milky_way')) return;
    // 跳过未解锁星球
    if ((state.playerLevel || 1) < (sys.minLevel || 1)) return;

    let totalRevenue = 0;
    cargoEntries.forEach(function (entry) {
      totalRevenue += Economy.getSellPrice(sys.id, entry[0], state) * entry[1];
    });

    const fuelCost = Economy.getFuelCost(state.currentSystem, sys.id, state.fuelEfficiency, state);
    const profit   = totalRevenue - fuelCost * fuelUnitPrice;

    if (!best || profit > best.profit) {
      best = {
        systemId:   sys.id,
        systemName: sys.name,
        profit:     profit,
        fuelCost:   fuelCost,
      };
    }
  });

  return best;
}

/**
 * 根据活跃任务寻找需要执行的贸易路线。
 * 扫描玩家已接取的任务中未完成的目标，找出需要前往特定星球
 * 买入/交付/卖出资源的目标，返回对应的贸易路线。
 * 优先处理有时间限制（更紧急）的任务。
 * @param {object} state
 * @returns {{ buySystemId, sellSystemId, goodId, status, questId, questName } | null}
 */
export function findQuestRoute(state) {
  if (!state.quests || state.quests.length === 0) return null;

  var currentGalaxy = state.currentGalaxy || 'milky_way';
  var playerLevel   = state.playerLevel || 1;
  var galaxySystems = getSystemsByGalaxy(currentGalaxy).filter(function (sys) {
    return playerLevel >= (sys.minLevel || 1);
  });

  if (galaxySystems.length < 2) return null;

  var bestRoute    = null;
  var bestPriority = -1;

  state.quests.forEach(function (quest) {
    quest.objectives.forEach(function (obj) {
      // 跳过已完成的目标
      if (obj.current >= (obj.amount || 1)) return;

      // 只处理有 targetSystem 的目标类型
      if (!obj.targetSystem) return;
      if (obj.type !== 'deliver' && obj.type !== 'sell_at' && obj.type !== 'buy_at') return;

      // 检查目标星球是否在当前星系内且已解锁
      var targetAccessible = galaxySystems.some(function (s) { return s.id === obj.targetSystem; });
      if (!targetAccessible) return;

      // 计算优先级：有时间限制的任务更紧急
      var priority = 0;
      if (quest.timeLimit > 0) {
        var daysLeft = quest.timeLimit - ((state.day || 0) - (quest.startDay || 0));
        priority = 100 - Math.max(0, daysLeft);
      }
      if (priority < bestPriority) return;

      var route = null;

      if (obj.type === 'deliver' || obj.type === 'sell_at') {
        // 需要在 targetSystem 卖出/交付 goodId
        var inCargo = (state.cargo && state.cargo[obj.goodId]) || 0;
        if (inCargo > 0) {
          // 手中已有货物，直接前往目标星球卖出
          route = {
            buySystemId:  state.currentSystem,
            sellSystemId: obj.targetSystem,
            goodId:       obj.goodId,
            status:       state.currentSystem === obj.targetSystem ? 'selling' : 'traveling_sell',
            questId:      quest.id,
            questName:    quest.name,
          };
        } else {
          // 需要先买货物：寻找最便宜的来源星球
          var cheapestId    = null;
          var cheapestPrice = Infinity;
          galaxySystems.forEach(function (sys) {
            if (sys.id === obj.targetSystem) return; // 不在目标星球买
            var price = Economy.getBuyPrice(sys.id, obj.goodId, state);
            if (price > 0 && price < cheapestPrice) {
              cheapestPrice = price;
              cheapestId    = sys.id;
            }
          });
          if (cheapestId) {
            route = {
              buySystemId:  cheapestId,
              sellSystemId: obj.targetSystem,
              goodId:       obj.goodId,
              status:       state.currentSystem === cheapestId ? 'buying' : 'traveling_buy',
              questId:      quest.id,
              questName:    quest.name,
            };
          }
        }
      } else if (obj.type === 'buy_at') {
        // 需要在 targetSystem 买入 goodId，买完后寻找最优卖出地
        var bestSellId    = null;
        var bestSellPrice = 0;
        galaxySystems.forEach(function (sys) {
          if (sys.id === obj.targetSystem) return;
          var price = Economy.getSellPrice(sys.id, obj.goodId, state);
          if (price > bestSellPrice) {
            bestSellPrice = price;
            bestSellId    = sys.id;
          }
        });
        route = {
          buySystemId:  obj.targetSystem,
          sellSystemId: bestSellId || state.currentSystem,
          goodId:       obj.goodId,
          status:       state.currentSystem === obj.targetSystem ? 'buying' : 'traveling_buy',
          questId:      quest.id,
          questName:    quest.name,
        };
      }

      if (route && priority >= bestPriority) {
        bestRoute    = route;
        bestPriority = priority;
      }
    });
  });

  return bestRoute;
}
