// js/systems/trade/TradeSystem.js — 交易、航行、升级核心逻辑
// 依赖：data/goods.js, data/systems.js, data/upgrades.js, systems/economy/Economy.js
// 导出：getTotalCargo, getNetWorth, buyGood, sellGood,
//       buyGoodOnMarket, sellGoodOnMarket, buyUpgrade, refuel, travelTo
//
// 所有函数接收 state 对象（引用传递，直接修改）并返回
// { ok: boolean, msgs: Array<{ text: string, type: string }> }
//
// buyGoodOnMarket / sellGoodOnMarket 是统一入口：
//   marketType = 'open'  → 使用公开市场价格
//   marketType = 'black' → 使用黑市价格（含违禁品溢价）

import { GOODS }    from '../../data/goods.js';
import { SYSTEMS, findSystem, getSystemAccessState }  from '../../data/systems.js';
import { UPGRADES } from '../../data/upgrades.js';
import * as Economy from '../economy/Economy.js';
import * as Exploration from '../galaxy/ExplorationSystem.js';
import * as Faction from '../faction/FactionSystem.js';
import * as BalanceMetrics from '../metrics/BalanceMetricsSystem.js';

// ---------------------------------------------------------------------------
// 辅助工具
// ---------------------------------------------------------------------------

export function getTotalCargo(state) {
  return Object.values(state.cargo).reduce(function (s, q) { return s + q; }, 0);
}

export function getNetWorth(state) {
  let worth = state.credits;
  const fleet = Array.isArray(state.fleet) ? state.fleet : [];
  if (fleet.length > 0) {
    fleet.forEach(function (ship) {
      const systemId = ship.location || state.currentSystem;
      Object.entries(ship.cargo || {}).forEach(function (entry) {
        worth += Economy.getSellPrice(systemId, entry[0], state) * entry[1];
      });
    });
  } else {
    Object.entries(state.cargo || {}).forEach(function (entry) {
      worth += Economy.getSellPrice(state.currentSystem, entry[0], state) * entry[1];
    });
  }
  worth += _getDeferredFinanceNetWorthAdjustment(state);
  return worth;
}

function _getDeferredFinanceNetWorthAdjustment(state) {
  var stockMarket = state && state.stockMarket && typeof state.stockMarket === 'object' ? state.stockMarket : {};
  var stockPortfolio = state && state.stockPortfolio && typeof state.stockPortfolio === 'object' ? state.stockPortfolio : {};
  var stockValue = Object.keys(stockPortfolio).reduce(function (sum, stockId) {
    var holding = stockPortfolio[stockId] || {};
    var quote = stockMarket[stockId] || {};
    return sum + Math.max(0, Number(holding.shares || 0)) * Math.max(0, Number(quote.price || 0));
  }, 0);
  var investmentValue = Object.values(state && state.tradeInvestments && typeof state.tradeInvestments === 'object'
    ? state.tradeInvestments
    : {}).reduce(function (sum, investment) {
    return sum + Math.max(0, Number(investment && investment.amount || 0));
  }, 0);
  var loanLiability = (state && Array.isArray(state.loans) ? state.loans : []).reduce(function (sum, loan) {
    return sum + (loan && loan.status === 'active' ? Math.max(0, Number(loan.balance || 0)) : 0);
  }, 0);
  var futuresAdjustment = (state && Array.isArray(state.futuresContracts) ? state.futuresContracts : []).reduce(function (sum, contract) {
    return sum + (contract && contract.status === 'open' ? Number(contract.unrealizedPnl || 0) : 0);
  }, 0);
  return stockValue + investmentValue - loanLiability + futuresAdjustment;
}

// ---------------------------------------------------------------------------
// 贸易操作
// ---------------------------------------------------------------------------

export function buyGood(state, goodId, quantity) {
  const good = GOODS.find(function (entry) { return entry.id === goodId; });
  if (!good) {
    return { ok: false, msgs: [{ text: '📦 未找到该商品。', type: 'error' }] };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, msgs: [{ text: '📦 交易数量必须是正整数。', type: 'error' }] };
  }
  if (!good.marketAccess || good.marketAccess.indexOf('open') === -1) {
    return { ok: false, msgs: [{ text: '🔒 ' + good.name + ' 不在公开市场流通。', type: 'error' }] };
  }
  const price     = Economy.getBuyPrice(state.currentSystem, goodId, state);
  const totalCost = price * quantity;

  if (totalCost > state.credits) {
    return { ok: false, msgs: [{ text: '💰 信用积分不足！', type: 'error' }] };
  }
  if (getTotalCargo(state) + quantity > state.maxCargo) {
    return { ok: false, msgs: [{ text: '📦 货舱空间不足！', type: 'error' }] };
  }

  state.credits        -= totalCost;
  state.cargo[goodId]   = (state.cargo[goodId] || 0) + quantity;

  // 成本追踪（加权平均）
  if (!state.cargoCost) state.cargoCost = {};
  state.cargoCost[goodId] = (state.cargoCost[goodId] || 0) + totalCost;

  // 统计商品交易量
  if (!state.goodsTraded) state.goodsTraded = {};
  state.goodsTraded[goodId] = (state.goodsTraded[goodId] || 0) + quantity;

  // 更新供需
  Economy.onPlayerBuy(state.currentSystem, goodId, quantity);

  BalanceMetrics.recordTrade(state, 'buy', goodId, 'open', {
    totalCost: totalCost,
    unitBuyPrice: price,
  });

  return {
    ok:   true,
    msgs: [{ text: '✅ 购买了 ' + quantity + ' 单位 ' + good.name + '，花费 ' + totalCost + ' 积分。', type: 'buy' }],
    meta: { goodId: goodId, quantity: quantity, totalCost: totalCost, unitBuyPrice: price },
  };
}

export function sellGood(state, goodId, quantity) {
  const good = GOODS.find(function (entry) { return entry.id === goodId; });
  if (!good) {
    return { ok: false, msgs: [{ text: '📦 未找到该商品。', type: 'error' }] };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, msgs: [{ text: '📦 交易数量必须是正整数。', type: 'error' }] };
  }
  if (!good.marketAccess || good.marketAccess.indexOf('open') === -1) {
    return { ok: false, msgs: [{ text: '🔒 ' + good.name + ' 不在公开市场流通。', type: 'error' }] };
  }
  const available = state.cargo[goodId] || 0;
  if (quantity > available) {
    return { ok: false, msgs: [{ text: '📦 货物数量不足！', type: 'error' }] };
  }

  const price        = Economy.getSellPrice(state.currentSystem, goodId, state);
  const totalEarned  = price * quantity;

  // 计算利润（基于成本追踪）
  if (!state.cargoCost) state.cargoCost = {};
  const totalCostForGood = state.cargoCost[goodId] || 0;
  const currentQty       = state.cargo[goodId] || 0;
  const avgCost          = currentQty > 0 ? totalCostForGood / currentQty : 0;
  const costBasis        = avgCost * quantity;
  const profit           = totalEarned - costBasis;

  state.credits     += totalEarned;
  state.cargo[goodId] -= quantity;

  // 更新成本追踪
  if (state.cargo[goodId] <= 0) {
    delete state.cargo[goodId];
    delete state.cargoCost[goodId];
  } else {
    state.cargoCost[goodId] = totalCostForGood - costBasis;
  }

  // 累计总利润
  state.totalProfit = (state.totalProfit || 0) + profit;

  // 统计商品交易量
  if (!state.goodsTraded) state.goodsTraded = {};
  state.goodsTraded[goodId] = (state.goodsTraded[goodId] || 0) + quantity;

  // 统计单笔最大利润
  if (profit > (state.maxSingleProfit || 0)) {
    state.maxSingleProfit = profit;
  }

  // 更新供需
  Economy.onPlayerSell(state.currentSystem, goodId, quantity);

  BalanceMetrics.recordTrade(state, 'sell', goodId, 'open', {
    totalEarned: totalEarned,
    costBasis: costBasis,
    profit: profit,
    unitSellPrice: price,
  });

  return {
    ok:   true,
    msgs: [
      { text: '💸 出售了 ' + quantity + ' 单位 ' + good.name + '，获得 ' + totalEarned + ' 积分。', type: 'sell' },
      {
        text: '📊 本次结算：收入 ' + totalEarned + ' - 成本 ' + Math.round(costBasis) + ' = 净利润 ' + Math.round(profit) + ' 积分。',
        type: profit >= 0 ? 'upgrade' : 'error',
      },
    ],
    meta: {
      goodId: goodId,
      quantity: quantity,
      totalEarned: totalEarned,
      costBasis: costBasis,
      averageCost: avgCost,
      unitSellPrice: price,
      profit: profit,
    },
  };
}

// ---------------------------------------------------------------------------
// 统一市场交易入口（公开市场 + 黑市）
// ---------------------------------------------------------------------------

/**
 * 在指定市场类型买入商品。
 * @param {object} state
 * @param {string} goodId
 * @param {number} quantity
 * @param {'open'|'black'} [marketType='open']
 * @returns {{ ok: boolean, msgs: Array, meta?: object }}
 */
export function buyGoodOnMarket(state, goodId, quantity, marketType) {
  if (marketType !== 'black') {
    return buyGood(state, goodId, quantity);
  }

  if (!Faction.canAccessBlackMarket(state, state.currentSystem)) {
    return { ok: false, msgs: [{ text: '🔒 当前地点尚未开放黑市。', type: 'error' }] };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, msgs: [{ text: '📦 交易数量必须是正整数。', type: 'error' }] };
  }

  const good = GOODS.find(function (entry) { return entry.id === goodId; });
  if (!good || !good.marketAccess || good.marketAccess.indexOf('black') === -1) {
    return { ok: false, msgs: [{ text: '🔒 该商品不在黑市流通。', type: 'error' }] };
  }

  // 黑市买入：使用黑市价格，更新黑市统计
  const price     = Economy.getBlackMarketBuyPrice(state.currentSystem, goodId, state);
  const totalCost = price * quantity;

  if (totalCost > state.credits) {
    return { ok: false, msgs: [{ text: '💰 信用积分不足！', type: 'error' }] };
  }
  if (getTotalCargo(state) + quantity > state.maxCargo) {
    return { ok: false, msgs: [{ text: '📦 货舱空间不足！', type: 'error' }] };
  }

  state.credits           -= totalCost;
  state.cargo[goodId]      = (state.cargo[goodId] || 0) + quantity;
  if (!state.cargoCost)    state.cargoCost = {};
  state.cargoCost[goodId]  = (state.cargoCost[goodId] || 0) + totalCost;
  if (!state.goodsTraded)  state.goodsTraded = {};
  state.goodsTraded[goodId] = (state.goodsTraded[goodId] || 0) + quantity;

  // 黑市交易不应污染公开市场的供需曲线。

  BalanceMetrics.recordTrade(state, 'buy', goodId, 'black', {
    totalCost: totalCost,
    unitBuyPrice: price,
  });

  return {
    ok:   true,
    msgs: [{ text: '🕶 黑市购入 ' + quantity + ' 单位 ' + (good ? good.name : goodId) + '，花费 ' + totalCost + ' 积分。', type: 'buy' }],
    meta: { goodId: goodId, quantity: quantity, totalCost: totalCost, unitBuyPrice: price, marketType: 'black' },
  };
}

/**
 * 在指定市场类型卖出商品。
 * @param {object} state
 * @param {string} goodId
 * @param {number} quantity
 * @param {'open'|'black'} [marketType='open']
 * @returns {{ ok: boolean, msgs: Array, meta?: object }}
 */
export function sellGoodOnMarket(state, goodId, quantity, marketType) {
  if (marketType !== 'black') {
    return sellGood(state, goodId, quantity);
  }

  if (!Faction.canAccessBlackMarket(state, state.currentSystem)) {
    return { ok: false, msgs: [{ text: '🔒 当前地点尚未开放黑市。', type: 'error' }] };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, msgs: [{ text: '📦 交易数量必须是正整数。', type: 'error' }] };
  }

  const good = GOODS.find(function (entry) { return entry.id === goodId; });
  if (!good || !good.marketAccess || good.marketAccess.indexOf('black') === -1) {
    return { ok: false, msgs: [{ text: '🔒 该商品不在黑市流通。', type: 'error' }] };
  }

  // 黑市卖出：使用黑市价格，更新走私统计
  const available = state.cargo[goodId] || 0;
  if (quantity > available) {
    return { ok: false, msgs: [{ text: '📦 货物数量不足！', type: 'error' }] };
  }

  const price      = Economy.getBlackMarketSellPrice(state.currentSystem, goodId, state);
  const totalEarned = price * quantity;

  if (!state.cargoCost) state.cargoCost = {};
  const totalCostForGood = state.cargoCost[goodId] || 0;
  const currentQty       = state.cargo[goodId] || 0;
  const avgCost          = currentQty > 0 ? totalCostForGood / currentQty : 0;
  const costBasis        = avgCost * quantity;
  const profit           = totalEarned - costBasis;

  state.credits += totalEarned;
  state.cargo[goodId] -= quantity;
  if (state.cargo[goodId] <= 0) {
    delete state.cargo[goodId];
    delete state.cargoCost[goodId];
  } else {
    state.cargoCost[goodId] = totalCostForGood - costBasis;
  }
  state.totalProfit = (state.totalProfit || 0) + profit;
  if (!state.goodsTraded) state.goodsTraded = {};
  state.goodsTraded[goodId] = (state.goodsTraded[goodId] || 0) + quantity;
  if (profit > (state.maxSingleProfit || 0)) state.maxSingleProfit = profit;

  // 黑市交易不应污染公开市场的供需曲线。

  BalanceMetrics.recordTrade(state, 'sell', goodId, 'black', {
    totalEarned: totalEarned,
    costBasis: costBasis,
    profit: profit,
    unitSellPrice: price,
  });

  return {
    ok:   true,
    msgs: [
      { text: '🕶 黑市出售 ' + quantity + ' 单位 ' + good.name + '，获得 ' + totalEarned + ' 积分。', type: 'sell' },
      {
        text: '📊 黑市结算：收入 ' + totalEarned + ' - 成本 ' + Math.round(costBasis) + ' = 净利润 ' + Math.round(profit) + ' 积分。',
        type: profit >= 0 ? 'upgrade' : 'error',
      },
    ],
    meta: {
      goodId: goodId,
      quantity: quantity,
      totalEarned: totalEarned,
      costBasis: costBasis,
      averageCost: avgCost,
      unitSellPrice: price,
      profit: profit,
      marketType: 'black',
    },
  };
}

export function buyUpgrade(state, upgradeId) {
  const upg = UPGRADES.find(function (u) { return u.id === upgradeId; });
  if (!upg) return { ok: false, msgs: [] };

  if (state.purchasedUpgrades.includes(upgradeId)) {
    return { ok: false, msgs: [{ text: '⚙️ 该升级已安装！', type: 'error' }] };
  }
  if (upg.requires && !state.purchasedUpgrades.includes(upg.requires)) {
    const req = UPGRADES.find(function (u) { return u.id === upg.requires; });
    return { ok: false, msgs: [{ text: '⚙️ 需要先安装「' + req.name + '」！', type: 'error' }] };
  }
  if (state.credits < upg.cost) {
    return { ok: false, msgs: [{ text: '💰 信用积分不足！', type: 'error' }] };
  }

  state.credits -= upg.cost;
  state.purchasedUpgrades.push(upgradeId);

  if (upg.effect.cargo)          state.maxCargo += upg.effect.cargo;
  if (upg.effect.maxFuel) {
    state.maxFuel += upg.effect.maxFuel;
    state.fuel     = Math.min(state.fuel + upg.effect.maxFuel, state.maxFuel);
  }
  if (upg.effect.fuelEfficiency) state.fuelEfficiency *= upg.effect.fuelEfficiency;

  return {
    ok:   true,
    msgs: [{ text: '⚙️ 升级安装成功：' + upg.name + '！', type: 'upgrade' }],
  };
}

export function refuel(state) {
  const needed = state.maxFuel - state.fuel;
  if (needed <= 0) {
    return { ok: false, msgs: [{ text: '⚡ 燃料已满！', type: 'info' }] };
  }

  const pricePerUnit = Economy.getBuyPrice(state.currentSystem, 'fuel', state);
  const canAfford    = Math.floor(state.credits / pricePerUnit);
  const toBuy        = Math.min(Math.ceil(needed), canAfford);

  if (toBuy <= 0) {
    return { ok: false, msgs: [{ text: '💰 没有足够积分购买燃料！', type: 'error' }] };
  }

  const cost       = toBuy * pricePerUnit;
  state.fuel      += toBuy;
  state.credits   -= cost;

  return {
    ok:   true,
    msgs: [{ text: '⚡ 补充了 ' + toBuy + ' 单位燃料，花费 ' + cost + ' 积分。', type: 'info' }],
  };
}

export function travelTo(state, systemId) {
  const toSys = findSystem(systemId);

  // 统一检查星系、星球等级与超空间入口层权限。
  const playerLevel = state.playerLevel || 1;
  const systemAccess = toSys
    ? getSystemAccessState(toSys.id, playerLevel, state.researchedTechs)
    : null;
  if (systemAccess && !systemAccess.unlocked) {
    const galaxyAccess = systemAccess.galaxyAccess;
    let message;
    if (!galaxyAccess.unlocked) {
      const galaxyName = galaxyAccess.galaxy ? galaxyAccess.galaxy.name : '目标星系';
      message = '🔒 ' + galaxyName + ' 需 Lv.' + galaxyAccess.requiredLevel + ' 才能跃迁前往！当前等级：' + playerLevel + '。';
      if (galaxyAccess.techRequired) {
        message += ' 研究「超空间跃迁引擎」也可提前解锁入口层。';
      }
    } else {
      message = '🔒 ' + toSys.name + ' 需要等级 ' + systemAccess.requiredLevel + ' 才能前往！当前等级：' + playerLevel + '。';
      if (galaxyAccess.unlockedBy === 'tech') {
        message += ' 超空间跃迁仅提前开放该星系入口层。';
      }
    }
    return {
      ok: false,
      msgs: [{ text: message, type: 'error' }],
    };
  }

  const routeInfo = Exploration.getTravelRouteInfo(state, state.currentSystem, systemId);
  const cost = Economy.getFuelCost(state.currentSystem, systemId, state.fuelEfficiency, state);
  if (state.fuel < cost) {
    const dest = findSystem(systemId);
    return {
      ok:   false,
      msgs: [{
        text: '⛽ 燃料不足！前往 ' + dest.name + ' 需要 ' + cost +
              ' 燃料，当前只有 ' + Math.floor(state.fuel) + '。',
        type: 'error',
      }],
    };
  }

  const fromSys = findSystem(state.currentSystem);
  const crossGalaxy = fromSys && toSys && fromSys.galaxyId !== toSys.galaxyId;

  const fromId         = state.currentSystem;
  state.fuel          -= cost;
  state.currentSystem  = systemId;
  const msgs = [];
  if (crossGalaxy && toSys) {
    state.currentGalaxy = toSys.galaxyId;
    state.viewingGalaxy = toSys.galaxyId;
  }

  const sys  = findSystem(systemId);
  if (routeInfo.active) {
    msgs.push({
      text: '🛰️ 已启用秘密航线「' + routeInfo.label + '」，本次航行燃料节省约 ' + Math.round((1 - routeInfo.fuelMultiplier) * 100) + '%。',
      type: 'tip',
    });
  }
  msgs.push({
    text: (crossGalaxy ? '🌌 超空间跃迁！' : '🚀 ') + '已抵达 ' + sys.name + '！消耗 ' + cost + ' 燃料。银河历第 ' + state.day + ' 天。',
    type: 'travel',
  });

  // 深空补给站免费赠燃料
  if (systemId === 'fuel_depot') {
    const free = Math.min(15, state.maxFuel - state.fuel);
    if (free > 0) {
      state.fuel += free;
      msgs.push({ text: '⚡ 补给站赠送了 ' + free + ' 单位免费燃料！', type: 'info' });
    }
  }

  BalanceMetrics.recordActivity(state, 'travel');

  return { ok: true, msgs, meta: { fromId, toId: systemId, fuelCost: cost, day: state.day, crossGalaxy, secretRoute: routeInfo.active ? routeInfo.routeId : null } };
}
