import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as TradeStation from '../js/systems/trade/TradeStationSystem.js';
import { GOODS } from '../js/data/goods.js';
import { createTestState } from './helpers.js';

describe('TradeStationSystem', () => {
  beforeEach(() => {
    Economy.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('可在已访问星球建设贸易站并扣除投资', () => {
    const state = createTestState({
      credits: 150000,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime', 'nova_station'],
    });

    const result = TradeStation.buildStation(state, 'sol_prime');

    expect(result.ok).toBe(true);
    expect(state.credits).toBe(50000);
    expect(state.tradeStations.sol_prime).toMatchObject({
      systemId: 'sol_prime',
      level: 1,
      strategyId: 'balanced',
      managerId: null,
    });
  });

  it('贸易站支持升级、雇佣管理员与切换经营策略', () => {
    const state = createTestState({
      credits: 600000,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
    });

    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);
    expect(TradeStation.upgradeStation(state, 'sol_prime').ok).toBe(true);
    expect(TradeStation.hireManager(state, 'sol_prime', 'local_broker').ok).toBe(true);
    expect(TradeStation.setStrategy(state, 'sol_prime', 'premium').ok).toBe(true);

    const station = TradeStation.getStation(state, 'sol_prime');
    expect(station.level).toBe(2);
    expect(station.managerId).toBe('local_broker');
    expect(station.strategyId).toBe('premium');
  });

  it('每日收益会自动结算，且受当地经济影响', () => {
    const state = createTestState({
      credits: 300000,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
      day: 12,
    });

    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);
    expect(TradeStation.hireManager(state, 'sol_prime', 'market_analyst').ok).toBe(true);
    expect(TradeStation.setStrategy(state, 'sol_prime', 'expansion').ok).toBe(true);

    let priceRatio = 1.45;
    vi.spyOn(Economy, 'getBuyPrice').mockImplementation(function (systemId, goodId) {
      const good = GOODS.find(function (entry) { return entry.id === goodId; });
      return Math.round((good ? good.basePrice : 10) * priceRatio);
    });
    vi.spyOn(Economy, 'getMarketDepth').mockReturnValue(260);
    vi.spyOn(Economy, 'getEconomyCycle').mockReturnValue({ priceMod: 1.1 });

    const richMarketIncome = TradeStation.getProjectedDailyIncome(state, 'sol_prime');

    priceRatio = 0.7;
    const weakMarketIncome = TradeStation.getProjectedDailyIncome(state, 'sol_prime');
    expect(richMarketIncome).toBeGreaterThan(weakMarketIncome);

    priceRatio = 1.45;
    const creditsBefore = state.credits;
    const result = TradeStation.advanceDay(state);

    expect(result.ok).toBe(true);
    expect(result.totalIncome).toBe(richMarketIncome);
    expect(state.credits).toBe(creditsBefore + richMarketIncome);
    expect(TradeStation.getStation(state, 'sol_prime').lastIncome).toBe(richMarketIncome);
  });
});
