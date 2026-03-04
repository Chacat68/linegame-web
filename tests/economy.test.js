// tests/economy.test.js — Economy 系统测试
// 覆盖: C1（空指针崩溃）、H4（_modifiers 未初始化）、H5（sellTax 极端值）

import { describe, it, expect, beforeEach } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

describe('Economy.getBuyPrice', () => {
  it('对有效 systemId 和 goodId 返回正整数', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getBuyPrice('sol_prime', 'food', state);
    expect(price).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(price)).toBe(true);
  });

  it('对无效 systemId 返回 1（C1 已修复）', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getBuyPrice('nonexistent_system', 'food', state);
    expect(price).toBe(1);
  });

  it('对无效 goodId 返回 1（C1 已修复）', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getBuyPrice('sol_prime', 'nonexistent_good', state);
    expect(price).toBe(1);
  });

  it('不传 state 时仍返回正整数', () => {
    const price = Economy.getBuyPrice('sol_prime', 'food');
    expect(price).toBeGreaterThanOrEqual(1);
  });
});

describe('Economy.getSellPrice', () => {
  it('对有效参数返回正整数', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getSellPrice('sol_prime', 'food', state);
    expect(price).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(price)).toBe(true);
  });

  it('对无效 systemId 返回 1（C1 已修复）', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getSellPrice('nonexistent_system', 'food', state);
    expect(price).toBe(1);
  });

  it('友好派系卖出价应高于敌对派系 [H5]', () => {
    const friendly = createTestState();
    Faction.init(friendly);
    // 设置 federation 为盟友
    friendly.factionRelations.federation = 80;

    const hostile = createTestState();
    Faction.init(hostile);
    // 设置 federation 为敌对
    hostile.factionRelations.federation = -80;

    // sol_prime 属于 federation
    const priceFriendly = Economy.getSellPrice('sol_prime', 'food', friendly);
    const priceHostile = Economy.getSellPrice('sol_prime', 'food', hostile);

    expect(priceFriendly).toBeGreaterThan(priceHostile);
  });

  it('sellTax 极端值时价格仍然 >= 1 [H5]', () => {
    const state = createTestState();
    Faction.init(state);
    // 设置极端敌对
    state.factionRelations.federation = -100;
    const price = Economy.getSellPrice('sol_prime', 'food', state);
    expect(price).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(price)).toBe(true);
  });
});

describe('Economy.getFuelCost', () => {
  it('同星系旅行返回合理燃料值', () => {
    const cost = Economy.getFuelCost('sol_prime', 'nova_station', 1.0);
    expect(cost).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(cost)).toBe(true);
  });

  it('对无效 systemId 不崩溃（返回 999）', () => {
    const cost = Economy.getFuelCost('nonexistent_a', 'nonexistent_b', 1.0);
    expect(cost).toBe(999);
  });

  it('更高效率系数应消耗更少燃料', () => {
    const costNormal = Economy.getFuelCost('sol_prime', 'nova_station', 1.0);
    const costEfficient = Economy.getFuelCost('sol_prime', 'nova_station', 0.5);
    expect(costEfficient).toBeLessThanOrEqual(costNormal);
  });
});

describe('Economy.advanceDay', () => {
  it('多次调用不崩溃', () => {
    expect(() => {
      for (let i = 0; i < 100; i++) {
        Economy.advanceDay();
      }
    }).not.toThrow();
  });
});

describe('Economy.getSupplyDemand', () => {
  it('返回正 supply、demand 和有限 ratio', () => {
    const sd = Economy.getSupplyDemand('sol_prime', 'food');
    expect(sd.supply).toBeGreaterThan(0);
    expect(sd.demand).toBeGreaterThan(0);
    expect(Number.isFinite(sd.ratio)).toBe(true);
  });

  it('对不存在的 systemId 返回默认值', () => {
    const sd = Economy.getSupplyDemand('nonexistent', 'food');
    expect(sd.supply).toBe(50);
    expect(sd.demand).toBe(50);
    expect(sd.ratio).toBe(1);
  });
});

describe('Economy.onPlayerBuy / onPlayerSell', () => {
  it('买入减少供给、增加需求', () => {
    const before = Economy.getSupplyDemand('sol_prime', 'food');
    Economy.onPlayerBuy('sol_prime', 'food', 5);
    const after = Economy.getSupplyDemand('sol_prime', 'food');
    expect(after.supply).toBeLessThanOrEqual(before.supply);
    expect(after.demand).toBeGreaterThanOrEqual(before.demand);
  });

  it('卖出增加供给、减少需求', () => {
    const before = Economy.getSupplyDemand('sol_prime', 'minerals');
    Economy.onPlayerSell('sol_prime', 'minerals', 5);
    const after = Economy.getSupplyDemand('sol_prime', 'minerals');
    expect(after.supply).toBeGreaterThanOrEqual(before.supply);
    expect(after.demand).toBeLessThanOrEqual(before.demand);
  });

  it('对无效 systemId 不崩溃', () => {
    expect(() => {
      Economy.onPlayerBuy('nonexistent', 'food', 5);
      Economy.onPlayerSell('nonexistent', 'food', 5);
    }).not.toThrow();
  });
});
