import { describe, expect, it } from 'vitest';
import { getMarketExperienceRoute } from '../js/ui/MarketUI.js';
import { createTestState } from './helpers.js';

describe('Market experience route', function () {
  it('新玩家只开放现货和行情，复杂功能保持锁定', function () {
    const state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      day: 1,
      playerLevel: 1,
      credits: 1000,
      visitedSystems: ['sol_prime'],
      tradeStations: {},
    });

    const route = getMarketExperienceRoute(state, 'sol_prime');

    expect(route.workspace.spot.unlocked).toBe(true);
    expect(route.subworkspace.spot.trade.unlocked).toBe(true);
    expect(route.subworkspace.spot.intel.unlocked).toBe(true);
    expect(route.workspace.capital.unlocked).toBe(false);
    expect(route.workspace.operations.unlocked).toBe(false);
    expect(route.subworkspace.capital.local.unlockLabel).toContain('公司 Lv.2');
    expect(route.stages.find(function (stage) { return stage.id === 'capital'; }).unlocked).toBe(false);
    expect(route.stages.find(function (stage) { return stage.id === 'network'; }).unlocked).toBe(false);
  });

  it('随着公司等级和贸易站推进逐步开放资本与商网', function () {
    const state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      day: 5,
      playerLevel: 3,
      companyLevel: 4,
      credits: 5000,
      visitedSystems: ['sol_prime', 'nova_station', 'aegis_prime'],
      tradeStations: {
        sol_prime: {
          systemId: 'sol_prime',
          level: 1,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 100000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
      },
    });

    const route = getMarketExperienceRoute(state, 'sol_prime');

    expect(route.workspace.capital.unlocked).toBe(true);
    expect(route.subworkspace.capital.local.unlocked).toBe(true);
    expect(Object.keys(route.subworkspace.capital)).toEqual(['local']);
    expect(route.workspace.operations.unlocked).toBe(true);
    expect(route.subworkspace.operations.network.unlocked).toBe(false);
    expect(route.subworkspace.operations.stations.unlocked).toBe(true);
    expect(route.stages.map(function (stage) { return stage.id; })).toEqual(['trade', 'intel', 'capital', 'network']);
  });

  it('公司 Lv.6 开放商网总览，资本页仍保持单入口', function () {
    const state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      day: 8,
      playerLevel: 4,
      companyLevel: 6,
      credits: 12000,
      visitedSystems: ['sol_prime', 'nova_station', 'aegis_prime'],
      tradeStations: {
        sol_prime: {
          systemId: 'sol_prime',
          level: 2,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 300000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
      },
    });

    const route = getMarketExperienceRoute(state, 'sol_prime');

    expect(Object.keys(route.subworkspace.capital)).toEqual(['local']);
    expect(route.subworkspace.operations.network.unlocked).toBe(true);
  });
});
