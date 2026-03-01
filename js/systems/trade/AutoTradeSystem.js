// js/systems/trade/AutoTradeSystem.js — 自动贸易路线计算
// 依赖：data/goods.js, data/systems.js, systems/economy/Economy.js, systems/trade/TradeSystem.js
// 导出：findBestTrade, findBestSellSystem

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
