// js/systems/trade/AutoTradeSystem.js — 自动贸易路线计算
// 依赖：data/goods.js, data/systems.js, systems/economy/Economy.js, systems/trade/TradeSystem.js
// 导出：findBestTrade, findBestSellSystem, findQuestRoute

import { GOODS }   from '../../data/goods.js';
import { SYSTEMS, getSystemsByGalaxy } from '../../data/systems.js';
import * as Economy from '../economy/Economy.js';
import { getTotalCargo } from './TradeSystem.js';

/**
 * 在当前星系寻找最优买入商品及最优目标星系。
 * 综合考虑买入价格、目标卖出价格与燃料成本。
 * @param {object} state
 * @returns {{ goodId, goodName, sellSystemId, sellSystemName, quantity, profit, buyPrice, sellPrice, fuelCost } | null}
 */
export function findBestTrade(state) {
  const cargoFree = state.maxCargo - getTotalCargo(state);
  if (cargoFree <= 0) return null;

  // 燃料单价只与当前星系有关，在循环外计算一次
  const fuelUnitPrice = Economy.getBuyPrice(state.currentSystem, 'fuel', state);

  let best = null;

  GOODS.forEach(function (good) {
    if (good.id === 'fuel') return; // 燃料不参与自动贸易

    const buyPrice = Economy.getBuyPrice(state.currentSystem, good.id, state);
    if (buyPrice <= 0) return;
    const canBuy = Math.min(Math.floor(state.credits / buyPrice), cargoFree);
    if (canBuy <= 0) return;

    SYSTEMS.forEach(function (sys) {
      if (sys.id === state.currentSystem) return;
      // 只搜索同星系内的星球
      if (sys.galaxyId !== (state.currentGalaxy || 'milky_way')) return;
      // 跳过未解锁星球
      if ((state.playerLevel || 1) < (sys.minLevel || 1)) return;

      const sellPrice    = Economy.getSellPrice(sys.id, good.id, state);
      const fuelCost     = Economy.getFuelCost(state.currentSystem, sys.id, state.fuelEfficiency);
      const fuelCredits  = fuelCost * fuelUnitPrice;
      const profit       = (sellPrice - buyPrice) * canBuy - fuelCredits;

      if (!best || profit > best.profit) {
        best = {
          goodId:         good.id,
          goodName:       good.name,
          sellSystemId:   sys.id,
          sellSystemName: sys.name,
          quantity:       canBuy,
          profit:         profit,
          buyPrice:       buyPrice,
          sellPrice:      sellPrice,
          fuelCost:       fuelCost,
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

    const fuelCost = Economy.getFuelCost(state.currentSystem, sys.id, state.fuelEfficiency);
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
