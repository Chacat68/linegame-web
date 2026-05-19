import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as TradeStation from '../js/systems/trade/TradeStationSystem.js';
import { GOODS } from '../js/data/goods.js';
import { SYSTEMS } from '../js/data/systems.js';
import { createTestState } from './helpers.js';

const DEFAULT_BASE_PRICE = 10;

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
      companyLevel: 4,
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
      companyLevel: 5,
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
      companyLevel: 5,
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
      return Math.round((good ? good.basePrice : DEFAULT_BASE_PRICE) * priceRatio);
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

  it('支持按收益优先批量升级贸易站', () => {
    const visitedSystems = SYSTEMS.map(function (system) { return system.id; });
    const state = createTestState({
      credits: 560000,
      companyLevel: 6,
      currentSystem: 'sol_prime',
      visitedSystems: visitedSystems,
    });

    const stationIds = TradeStation.getBuildCandidates(state).slice(0, 2).map(function (entry) {
      return entry.system.id;
    });

    stationIds.forEach(function (systemId) {
      expect(TradeStation.buildStation(state, systemId).ok).toBe(true);
    });

    vi.spyOn(Economy, 'getBuyPrice').mockImplementation(function (systemId) {
      return systemId === stationIds[0] ? 220 : 80;
    });
    vi.spyOn(Economy, 'getMarketDepth').mockReturnValue(260);
    vi.spyOn(Economy, 'getEconomyCycle').mockReturnValue({ priceMod: 1.0 });

    const priorityOrder = TradeStation.getOwnedStations(state).map(function (entry) {
      return entry.station.systemId;
    });
    const result = TradeStation.batchUpgradeStations(state);

    expect(result.ok).toBe(true);
    expect(result.meta.executedCount).toBe(1);
    expect(TradeStation.getStation(state, priorityOrder[0]).level).toBe(2);
    expect(TradeStation.getStation(state, priorityOrder[1]).level).toBe(1);
  });

  it('支持批量派驻经理，并在预算不足时部分执行', () => {
    const visitedSystems = SYSTEMS.map(function (system) { return system.id; });
    const state = createTestState({
      credits: 350000,
      companyLevel: 6,
      currentSystem: 'sol_prime',
      visitedSystems: visitedSystems,
    });

    const stationIds = TradeStation.getBuildCandidates(state).slice(0, 3).map(function (entry) {
      return entry.system.id;
    });

    stationIds.forEach(function (systemId) {
      expect(TradeStation.buildStation(state, systemId).ok).toBe(true);
    });

    vi.spyOn(Economy, 'getBuyPrice').mockImplementation(function (systemId) {
      return systemId === stationIds[0] ? 240 : 90;
    });
    vi.spyOn(Economy, 'getMarketDepth').mockReturnValue(260);
    vi.spyOn(Economy, 'getEconomyCycle').mockReturnValue({ priceMod: 1.0 });

    const priorityOrder = TradeStation.getOwnedStations(state).map(function (entry) {
      return entry.station.systemId;
    });
    const result = TradeStation.batchHireManagers(state, 'logistics_director');

    expect(result.ok).toBe(true);
    expect(result.meta.executedCount).toBe(1);
    expect(TradeStation.getStation(state, priorityOrder[0]).managerId).toBe('logistics_director');
    expect(TradeStation.getStation(state, priorityOrder[1]).managerId).toBe(null);
  });

  it('支持全网批量切换经营策略', () => {
    const visitedSystems = SYSTEMS.map(function (system) { return system.id; });
    const state = createTestState({
      credits: 300000,
      companyLevel: 6,
      currentSystem: 'sol_prime',
      visitedSystems: visitedSystems,
    });

    const stationIds = TradeStation.getBuildCandidates(state).slice(0, 2).map(function (entry) {
      return entry.system.id;
    });

    stationIds.forEach(function (systemId) {
      expect(TradeStation.buildStation(state, systemId).ok).toBe(true);
    });

    const result = TradeStation.batchSetStrategies(state, 'premium');

    expect(result.ok).toBe(true);
    stationIds.forEach(function (systemId) {
      expect(TradeStation.getStation(state, systemId).strategyId).toBe('premium');
    });
  });

  it('公司等级不足时拒绝建站和贸易站管理动作', () => {
    const state = createTestState({
      credits: 600000,
      companyLevel: 3,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
    });

    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(false);

    state.companyLevel = 4;
    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);
    expect(TradeStation.upgradeStation(state, 'sol_prime').ok).toBe(false);
    expect(TradeStation.hireManager(state, 'sol_prime', 'local_broker').ok).toBe(false);

    state.companyLevel = 5;
    expect(TradeStation.upgradeStation(state, 'sol_prime').ok).toBe(true);
    expect(TradeStation.hireManager(state, 'sol_prime', 'local_broker').ok).toBe(true);
  });

  it('全网批量指令需要公司 Lv.6', () => {
    const state = createTestState({
      credits: 300000,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
    });

    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);

    const result = TradeStation.batchSetStrategies(state, 'premium');

    expect(result.ok).toBe(false);
    expect(result.msgs[0].text).toContain('公司 Lv.6');
  });
});
