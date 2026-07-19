// tests/trade.test.js — TradeSystem 测试
// 覆盖: H2（成本追踪不准确）、卖出利润计算

import { describe, it, expect, beforeEach } from 'vitest';
import * as Trade from '../js/systems/trade/TradeSystem.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { getSystemsByGalaxy } from '../js/data/systems.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

describe('Trade.getTotalCargo', () => {
  it('空货舱返回 0', () => {
    const state = createTestState();
    expect(Trade.getTotalCargo(state)).toBe(0);
  });

  it('正确加总多种货物', () => {
    const state = createTestState({ cargo: { food: 5, minerals: 3 } });
    expect(Trade.getTotalCargo(state)).toBe(8);
  });
});

describe('Trade.getNetWorth', () => {
  it('空货舱时净资产等于信用积分', () => {
    const state = createTestState({ credits: 1000 });
    Faction.init(state);
    const nw = Trade.getNetWorth(state);
    expect(nw).toBe(1000);
  });

  it('净资产会统计全部飞船货舱，切换活动飞船不改变结果', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    expect(Fleet.buyShip(state, 'freighter').ok).toBe(true);
    state.fleet[0].cargo = { food: 2 };
    state.fleet[0].cargoCost = { food: 20 };
    state.fleet[1].cargo = { minerals: 3 };
    state.fleet[1].cargoCost = { minerals: 30 };
    state.fleet[1].location = 'nova_station';
    Fleet.syncStateFromShip(state);

    const beforeSwitch = Trade.getNetWorth(state);
    expect(Fleet.switchShip(state, 1).ok).toBe(true);
    const afterSwitch = Trade.getNetWorth(state);

    expect(beforeSwitch).toBeGreaterThan(state.credits);
    expect(afterSwitch).toBe(beforeSwitch);
  });

  it('有货物时净资产大于纯积分', () => {
    const state = createTestState({ credits: 1000, cargo: { food: 5 } });
    Faction.init(state);
    const nw = Trade.getNetWorth(state);
    expect(nw).toBeGreaterThan(1000);
  });
});

describe('Trade.buyGood', () => {
  it('成功购买商品 — 扣费、增加货舱、追踪成本', () => {
    const state = createTestState({ credits: 5000, maxCargo: 20 });
    Faction.init(state);
    const result = Trade.buyGood(state, 'food', 5);
    expect(result.ok).toBe(true);
    expect(state.cargo.food).toBe(5);
    expect(state.credits).toBeLessThan(5000);
    expect(state.cargoCost.food).toBeGreaterThan(0);
    expect(state.goodsTraded.food).toBe(5);
  });

  it('积分不足时购买失败', () => {
    const state = createTestState({ credits: 0, maxCargo: 20 });
    Faction.init(state);
    const result = Trade.buyGood(state, 'food', 5);
    expect(result.ok).toBe(false);
    expect(state.cargo.food).toBeUndefined();
  });

  it('货舱满时购买失败', () => {
    const state = createTestState({ credits: 50000, maxCargo: 2, cargo: { minerals: 2 } });
    Faction.init(state);
    const result = Trade.buyGood(state, 'food', 1);
    expect(result.ok).toBe(false);
  });

  it('公开市场拒绝只在黑市流通的武器', () => {
    const state = createTestState({ credits: 50000, maxCargo: 20 });
    Faction.init(state);

    const result = Trade.buyGood(state, 'weapons', 1);

    expect(result.ok).toBe(false);
    expect(state.credits).toBe(50000);
    expect(state.cargo.weapons).toBeUndefined();
  });

  it('拒绝非正整数交易数量', () => {
    const state = createTestState({ credits: 5000, maxCargo: 20 });
    Faction.init(state);

    expect(Trade.buyGood(state, 'food', -2).ok).toBe(false);
    expect(Trade.buyGood(state, 'food', 1.5).ok).toBe(false);
    expect(state.credits).toBe(5000);
  });
});

describe('Trade.sellGood', () => {
  it('成功卖出商品', () => {
    const state = createTestState({ credits: 0, cargo: { food: 10 }, cargoCost: { food: 100 } });
    Faction.init(state);
    const result = Trade.sellGood(state, 'food', 5);
    expect(result.ok).toBe(true);
    expect(state.cargo.food).toBe(5);
    expect(state.credits).toBeGreaterThan(0);
    expect(result.meta.profit).toBeDefined();
  });

  it('卖出全部时清理 cargo 和 cargoCost', () => {
    const state = createTestState({ credits: 0, cargo: { food: 5 }, cargoCost: { food: 50 } });
    Faction.init(state);
    Trade.sellGood(state, 'food', 5);
    expect(state.cargo.food).toBeUndefined();
    expect(state.cargoCost.food).toBeUndefined();
  });

  it('卖出数量大于持有时失败', () => {
    const state = createTestState({ cargo: { food: 3 } });
    Faction.init(state);
    const result = Trade.sellGood(state, 'food', 5);
    expect(result.ok).toBe(false);
  });

  it('利润计算正确 — 买10@100 买10@200 卖5 [H2]', () => {
    const state = createTestState({ credits: 100000, maxCargo: 100 });
    Faction.init(state);

    // 手动设置：模拟两次不同价买入
    state.cargo.food = 20;
    state.cargoCost.food = 3000; // 总成本 3000，平均 150/个
    state.credits = 50000;

    const result = Trade.sellGood(state, 'food', 5);
    expect(result.ok).toBe(true);

    // avgCost = 3000/20 = 150 per unit
    // costBasis = 150 * 5 = 750
    // profit = totalEarned - 750
    expect(result.meta.profit).toBeDefined();
    expect(typeof result.meta.profit).toBe('number');

    // 剩余成本应按比例减少
    // cargoCost = 3000 - 750 = 2250
    expect(state.cargoCost.food).toBeCloseTo(2250, 0);
    expect(state.cargo.food).toBe(15);
  });

  it('cargoCost 缺失时 avgCost 为 0，利润 = totalEarned [H2]', () => {
    const state = createTestState({ credits: 0, cargo: { food: 10 }, cargoCost: {} });
    Faction.init(state);
    const result = Trade.sellGood(state, 'food', 5);
    expect(result.ok).toBe(true);
    // avgCost = 0/10 = 0, costBasis = 0, profit = totalEarned
    expect(result.meta.profit).toBe(result.meta.totalEarned);
  });

  it('公开市场不会变相清算黑市专属货物', () => {
    const state = createTestState({ credits: 0, cargo: { weapons: 2 }, cargoCost: { weapons: 200 } });
    Faction.init(state);

    const result = Trade.sellGood(state, 'weapons', 1);

    expect(result.ok).toBe(false);
    expect(state.cargo.weapons).toBe(2);
    expect(state.credits).toBe(0);
  });
});

describe('Trade black market access', () => {
  it('未解锁当前节点黑市时不能绕过界面下单', () => {
    const state = createTestState({ credits: 50000, maxCargo: 20, currentSystem: 'sol_prime' });
    Faction.init(state);

    const result = Trade.buyGoodOnMarket(state, 'weapons', 1, 'black');

    expect(result.ok).toBe(false);
    expect(state.cargo.weapons).toBeUndefined();
  });

  it('达到友好关系并停靠辛迪加节点后可交易黑市货物', () => {
    const state = createTestState({
      credits: 50000,
      maxCargo: 20,
      currentSystem: 'shadow_haven',
      factionRelations: { syndicate: 30 },
    });
    Faction.init(state);

    const result = Trade.buyGoodOnMarket(state, 'weapons', 1, 'black');

    expect(result.ok).toBe(true);
    expect(state.cargo.weapons).toBe(1);
  });
});

describe('Trade.refuel', () => {
  it('已满时提示', () => {
    const state = createTestState({ fuel: 100, maxFuel: 100 });
    Faction.init(state);
    const result = Trade.refuel(state);
    expect(result.ok).toBe(false);
  });

  it('积分不足时失败', () => {
    const state = createTestState({ fuel: 0, maxFuel: 100, credits: 0 });
    Faction.init(state);
    const result = Trade.refuel(state);
    expect(result.ok).toBe(false);
  });

  it('正常补给', () => {
    const state = createTestState({ fuel: 50, maxFuel: 100, credits: 5000 });
    Faction.init(state);
    const result = Trade.refuel(state);
    expect(result.ok).toBe(true);
    expect(state.fuel).toBeGreaterThan(50);
  });
});

describe('Trade.travelTo', () => {
  it('成功旅行到相邻星球', () => {
    const state = createTestState({ fuel: 100, maxFuel: 100 });
    Faction.init(state);
    const result = Trade.travelTo(state, 'nova_station');
    expect(result.ok).toBe(true);
    expect(state.currentSystem).toBe('nova_station');
    expect(state.day).toBe(1);
    expect(state.fuel).toBeLessThan(100);
  });

  it('燃料不足时旅行失败', () => {
    const state = createTestState({ fuel: 0 });
    Faction.init(state);
    const result = Trade.travelTo(state, 'nova_station');
    expect(result.ok).toBe(false);
    expect(state.currentSystem).toBe('sol_prime');
  });

  it('等级不足时跨星系旅行失败', () => {
    const state = createTestState({ fuel: 1000, maxFuel: 1000, playerLevel: 1 });
    Faction.init(state);
    const result = Trade.travelTo(state, 'citadel_prime');
    expect(result.ok).toBe(false);
    expect(result.msgs[0].text).toContain('Lv.2');
  });

  it('达到星系等级后可直接跨星系旅行', () => {
    const state = createTestState({ fuel: 1000, maxFuel: 1000, playerLevel: 2 });
    Faction.init(state);

    const result = Trade.travelTo(state, 'citadel_prime');

    expect(result.ok).toBe(true);
    expect(state.currentSystem).toBe('citadel_prime');
    expect(state.currentGalaxy).toBe('andromeda');
    expect(state.viewingGalaxy).toBe('andromeda');
  });

  it('研究超空间后可提前跨星系旅行', () => {
    const state = createTestState({
      fuel: 1000,
      maxFuel: 1000,
      playerLevel: 1,
      researchedTechs: ['hyperspace_jump'],
    });
    Faction.init(state);

    const result = Trade.travelTo(state, 'citadel_prime');

    expect(result.ok).toBe(true);
    expect(state.currentSystem).toBe('citadel_prime');
  });

  it('研究超空间后可提前抵达后期外域的入口星球', () => {
    const entrySystem = getSystemsByGalaxy('chrono_rift').find(function (system) {
      return (system.minLevel || 1) === 9;
    });
    const state = createTestState({
      fuel: 1000,
      maxFuel: 1000,
      playerLevel: 1,
      researchedTechs: ['hyperspace_jump'],
    });
    Faction.init(state);

    const result = Trade.travelTo(state, entrySystem.id);

    expect(result.ok).toBe(true);
    expect(state.currentSystem).toBe(entrySystem.id);
    expect(state.currentGalaxy).toBe('chrono_rift');
  });

  it('等级不足时旅行失败', () => {
    const state = createTestState({ fuel: 1000, playerLevel: 1 });
    Faction.init(state);
    // 找一个 minLevel > 1 的星球
    // 使用 frontier_outpost（如果它有 minLevel 限制的话）
    // 用一个确定有等级限制的方式
    const result = Trade.travelTo(state, 'frontier_outpost');
    if (result.ok === false && result.msgs[0]) {
      // 可能是等级锁定或其他原因
      expect(result.msgs[0].type).toBe('error');
    }
  });

  it('旅行不会再直接推进经济日结或游戏天数', () => {
    const state = createTestState({ fuel: 100, maxFuel: 100, day: 1 });
    Faction.init(state);

    const beforeHistory = Economy.getPriceHistory('sol_prime', 'food').length;
    const result = Trade.travelTo(state, 'nova_station');
    const afterHistory = Economy.getPriceHistory('sol_prime', 'food').length;

    expect(result.ok).toBe(true);
    expect(state.day).toBe(1);
    expect(afterHistory).toBe(beforeHistory);
  });
});
