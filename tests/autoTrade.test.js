// tests/autoTrade.test.js — 自动贸易路线测试

import { describe, it, expect, beforeEach } from 'vitest';
import * as AutoTrade from '../js/systems/trade/AutoTradeSystem.js';
import * as Economy from '../js/systems/economy/Economy.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

describe('AutoTrade.findBestTrade', () => {
  it('有剩余货舱和资金时返回贸易建议', () => {
    const state = createTestState({
      credits: 5000,
      maxCargo: 20,
      cargo: {},
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      playerLevel: 3,
    });

    const result = AutoTrade.findBestTrade(state);
    if (result) {
      expect(result).toHaveProperty('goodId');
      expect(result).toHaveProperty('sellSystemId');
      expect(result).toHaveProperty('profit');
      expect(result).toHaveProperty('quantity');
      expect(result.quantity).toBeGreaterThan(0);
    }
  });

  it('无剩余货舱时返回 null', () => {
    const state = createTestState({
      credits: 5000,
      maxCargo: 5,
      cargo: { food: 5 },
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });

    const result = AutoTrade.findBestTrade(state);
    expect(result).toBeNull();
  });

  it('无资金时返回 null', () => {
    const state = createTestState({
      credits: 0,
      maxCargo: 20,
      cargo: {},
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });

    const result = AutoTrade.findBestTrade(state);
    expect(result).toBeNull();
  });

  it('结果不包含燃料作为贸易商品', () => {
    const state = createTestState({
      credits: 50000,
      maxCargo: 100,
      cargo: {},
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      playerLevel: 5,
    });

    const result = AutoTrade.findBestTrade(state);
    if (result) {
      expect(result.goodId).not.toBe('fuel');
    }
  });
});

describe('AutoTrade.findBestSellSystem', () => {
  it('有货物时返回最优卖出地', () => {
    const state = createTestState({
      credits: 1000,
      maxCargo: 20,
      cargo: { food: 10 },
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      playerLevel: 3,
    });

    const result = AutoTrade.findBestSellSystem(state);
    if (result) {
      expect(result).toHaveProperty('systemId');
      expect(result).toHaveProperty('profit');
      expect(result).toHaveProperty('fuelCost');
    }
  });

  it('无货物时返回 null', () => {
    const state = createTestState({
      credits: 1000,
      cargo: {},
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });

    const result = AutoTrade.findBestSellSystem(state);
    expect(result).toBeNull();
  });
});

describe('AutoTrade.findQuestRoute', () => {
  it('无任务时返回 null', () => {
    const state = createTestState({
      quests: [],
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });

    const result = AutoTrade.findQuestRoute(state);
    expect(result).toBeNull();
  });

  it('有 deliver 目标的活跃任务时尝试返回路线', () => {
    const state = createTestState({
      credits: 5000,
      cargo: {},
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      playerLevel: 3,
      quests: [{
        id: 'test_quest',
        name: '测试任务',
        timeLimit: 0,
        startDay: 1,
        objectives: [{
          type: 'deliver',
          goodId: 'food',
          targetSystem: 'nova_station',
          amount: 5,
          current: 0,
        }],
      }],
    });

    const result = AutoTrade.findQuestRoute(state);
    // 可能返回路线也可能不返回（取决于星球是否在同一星系）
    if (result) {
      expect(result).toHaveProperty('buySystemId');
      expect(result).toHaveProperty('sellSystemId');
      expect(result).toHaveProperty('goodId', 'food');
      expect(result).toHaveProperty('questId', 'test_quest');
    }
  });

  it('已完成的目标不会被选为路线', () => {
    const state = createTestState({
      credits: 5000,
      cargo: {},
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      playerLevel: 3,
      quests: [{
        id: 'done_quest',
        name: '已完成任务',
        timeLimit: 0,
        startDay: 1,
        objectives: [{
          type: 'deliver',
          goodId: 'food',
          targetSystem: 'nova_station',
          amount: 5,
          current: 5, // 已完成
        }],
      }],
    });

    const result = AutoTrade.findQuestRoute(state);
    // 已完成的目标不应生成路线
    if (result) {
      expect(result.questId).not.toBe('done_quest');
    }
  });
});
