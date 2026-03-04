// js/systems/trade/TradeSystem.js — 交易、航行、升级核心逻辑
// 依赖：data/goods.js, data/systems.js, data/upgrades.js, systems/economy/Economy.js
// 导出：getTotalCargo, getNetWorth, buyGood, sellGood, buyUpgrade, refuel, travelTo
//
// 所有函数接收 state 对象（引用传递，直接修改）并返回
// { ok: boolean, msgs: Array<{ text: string, type: string }> }

import { GOODS }    from '../../data/goods.js';
import { SYSTEMS, findSystem, GALAXY_JUMP_DAYS }  from '../../data/systems.js';
import { UPGRADES } from '../../data/upgrades.js';
import * as Economy from '../economy/Economy.js';

// ---------------------------------------------------------------------------
// 辅助工具
// ---------------------------------------------------------------------------

export function getTotalCargo(state) {
  return Object.values(state.cargo).reduce(function (s, q) { return s + q; }, 0);
}

export function getNetWorth(state) {
  let worth = state.credits;
  Object.entries(state.cargo).forEach(function (entry) {
    worth += Economy.getSellPrice(state.currentSystem, entry[0], state) * entry[1];
  });
  return worth;
}

// ---------------------------------------------------------------------------
// 贸易操作
// ---------------------------------------------------------------------------

export function buyGood(state, goodId, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, msgs: [{ text: '❌ 购买数量必须为正整数！', type: 'error' }] };
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

  const good = GOODS.find(function (g) { return g.id === goodId; });
  return {
    ok:   true,
    msgs: [{ text: '✅ 购买了 ' + quantity + ' 单位 ' + good.name + '，花费 ' + totalCost + ' 积分。', type: 'buy' }],
    meta: { goodId: goodId, quantity: quantity, totalCost: totalCost },
  };
}

export function sellGood(state, goodId, quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, msgs: [{ text: '❌ 出售数量必须为正整数！', type: 'error' }] };
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

  const good = GOODS.find(function (g) { return g.id === goodId; });
  return {
    ok:   true,
    msgs: [{ text: '💸 出售了 ' + quantity + ' 单位 ' + good.name + '，获得 ' + totalEarned + ' 积分。', type: 'sell' }],
    meta: { goodId: goodId, quantity: quantity, totalEarned: totalEarned, profit: profit },
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
  if (!toSys) {
    return {
      ok: false,
      msgs: [{ text: '❌ 目标星球不存在，无法前往。', type: 'error' }],
    };
  }

  // 等级锁定检查
  const playerLevel = state.playerLevel || 1;
  if (toSys && playerLevel < (toSys.minLevel || 1)) {
    return {
      ok: false,
      msgs: [{
        text: '🔒 ' + toSys.name + ' 需要等级 ' + toSys.minLevel + ' 才能前往！当前等级：' + playerLevel,
        type: 'error',
      }],
    };
  }

  const cost = Economy.getFuelCost(state.currentSystem, systemId, state.fuelEfficiency);
  if (state.fuel < cost) {
    return {
      ok:   false,
      msgs: [{
        text: '⛽ 燃料不足！前往 ' + toSys.name + ' 需要 ' + cost +
              ' 燃料，当前只有 ' + Math.floor(state.fuel) + '。',
        type: 'error',
      }],
    };
  }

  // 跨星系检查科技
  const fromSys = findSystem(state.currentSystem);
  const crossGalaxy = fromSys && toSys && fromSys.galaxyId !== toSys.galaxyId;
  if (crossGalaxy) {
    if (!state.researchedTechs || !state.researchedTechs.includes('hyperspace_jump')) {
      return { ok: false, msgs: [{ text: '🔒 需要研究「超空间跃迁引擎」才能进行跨星系旅行！', type: 'error' }] };
    }
  }

  const fromId         = state.currentSystem;
  state.fuel          -= cost;
  state.currentSystem  = systemId;
  const days = crossGalaxy ? GALAXY_JUMP_DAYS : 1;
  state.day += days;
  if (crossGalaxy && toSys) {
    state.currentGalaxy = toSys.galaxyId;
    state.viewingGalaxy = toSys.galaxyId;
  }
  for (let d = 0; d < days; d++) Economy.advanceDay();

  const msgs = [{
    text: (crossGalaxy ? '🌌 超空间跃迁！' : '🚀 ') + '已抵达 ' + toSys.name + '！消耗 ' + cost + ' 燃料。银河历第 ' + state.day + ' 天。',
    type: 'travel',
  }];

  // 深空补给站免费赠燃料
  if (systemId === 'fuel_depot') {
    const free = Math.min(15, state.maxFuel - state.fuel);
    if (free > 0) {
      state.fuel += free;
      msgs.push({ text: '⚡ 补给站赠送了 ' + free + ' 单位免费燃料！', type: 'info' });
    }
  }

  return { ok: true, msgs, meta: { fromId, toId: systemId, fuelCost: cost, day: state.day, crossGalaxy } };
}
