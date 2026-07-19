import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Exploration from '../js/systems/galaxy/ExplorationSystem.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import * as TradeStation from '../js/systems/trade/TradeStationSystem.js';
import { GOODS } from '../js/data/goods.js';
import { SYSTEMS } from '../js/data/systems.js';
import { TRADE_STATION_LEVELS } from '../js/data/tradeStations.js';
import { createTestState } from './helpers.js';

const DEFAULT_BASE_PRICE = 10;

function createSurveyIntel(overrides) {
  return Object.assign({
    systemId: 'sol_prime',
    hasIntel: true,
    marketSignal: false,
    researchSignal: false,
    routeSignal: false,
    logisticsSignal: false,
    primarySignal: 'market',
    recentReportTitle: '测试探索报告',
  }, overrides || {});
}

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
    expect(state.credits).toBe(120000);
    expect(state.tradeStations.sol_prime).toMatchObject({
      systemId: 'sol_prime',
      level: 1,
      strategyId: 'balanced',
      managerId: null,
    });
  });

  it('首座贸易前哨接住中期资金档位，基准回本周期不超过 140 天', () => {
    const level = TRADE_STATION_LEVELS[0];
    const state = createTestState({
      credits: level.investment,
      companyLevel: 4,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
    });

    expect(level.investment).toBe(30000);
    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);
    const projectedIncome = TradeStation.getProjectedDailyIncome(state, 'sol_prime');

    expect(projectedIncome).toBeGreaterThan(0);
    expect(Math.ceil(level.investment / projectedIncome)).toBeLessThanOrEqual(140);
  });

  it('贸易霸权信条会实际提高贸易站预期日收益', () => {
    const state = createTestState({ credits: 30000, companyLevel: 4, visitedSystems: ['sol_prime'] });
    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);
    const baseline = TradeStation.getProjectedDailyIncome(state, 'sol_prime');

    state.storyDecisions.victory_policy = 'trade_baron';

    expect(TradeStation.getProjectedDailyIncome(state, 'sol_prime')).toBeGreaterThan(baseline);
  });

  it('公司贸易站容量满时拒绝继续建站', () => {
    const state = createTestState({
      credits: 500000,
      companyLevel: 4,
      currentSystem: 'mineral_belt',
      visitedSystems: ['sol_prime', 'nova_station', 'mineral_belt'],
      tradeStations: {
        sol_prime: { systemId: 'sol_prime', level: 1 },
        nova_station: { systemId: 'nova_station', level: 1 },
      },
    });

    const guard = TradeStation.canBuildStation(state, 'mineral_belt');
    const candidate = TradeStation.getBuildCandidates(state).find(function (entry) {
      return entry.system.id === 'mineral_belt';
    });
    const nextAction = TradeStation.getNextNetworkAction(state);

    expect(guard.ok).toBe(false);
    expect(guard.msg).toContain('容量已满');
    expect(candidate).toBeTruthy();
    expect(candidate.canAfford).toBe(false);
    expect(candidate.stationCapacity).toMatchObject({ used: 2, max: 2, full: true });
    expect(candidate.lockReason).toContain('容量已满');
    expect(nextAction).toMatchObject({
      type: 'companyGrowth',
      disabled: true,
      disabledLabel: '容量已满',
      stationCapacity: { used: 2, max: 2, full: true },
    });
    expect(nextAction.reason).toContain('提升公司等级');
  });

  it('贸易站支持升级与切换站点定位，管理员入口已退役', () => {
    const state = createTestState({
      credits: 600000,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
    });

    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);
    expect(TradeStation.upgradeStation(state, 'sol_prime').ok).toBe(true);
    expect(TradeStation.hireManager(state, 'sol_prime', 'local_broker')).toMatchObject({
      ok: false,
      meta: { retired: true },
    });
    expect(TradeStation.setStrategy(state, 'sol_prime', 'premium').ok).toBe(true);

    const station = TradeStation.getStation(state, 'sol_prime');
    expect(station.level).toBe(2);
    expect(station.managerId).toBe(null);
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

  it('稳健与吞吐定位会随市场强弱交换优先级', () => {
    const state = createTestState({
      credits: 300000,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
    });
    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);

    let priceRatio = 0.65;
    vi.spyOn(Economy, 'getBuyPrice').mockImplementation(function (systemId, goodId) {
      const good = GOODS.find(function (entry) { return entry.id === goodId; });
      return Math.round((good ? good.basePrice : DEFAULT_BASE_PRICE) * priceRatio);
    });
    vi.spyOn(Economy, 'getMarketDepth').mockReturnValue(220);
    vi.spyOn(Economy, 'getEconomyCycle').mockReturnValue({ priceMod: 1.0 });

    const weakBalanced = TradeStation.getProjectedDailyIncome(state, 'sol_prime');
    expect(TradeStation.setStrategy(state, 'sol_prime', 'expansion').ok).toBe(true);
    const weakExpansion = TradeStation.getProjectedDailyIncome(state, 'sol_prime');

    priceRatio = 1.5;
    const strongExpansion = TradeStation.getProjectedDailyIncome(state, 'sol_prime');
    expect(TradeStation.setStrategy(state, 'sol_prime', 'balanced').ok).toBe(true);
    const strongBalanced = TradeStation.getProjectedDailyIncome(state, 'sol_prime');

    expect(weakBalanced).toBeGreaterThan(weakExpansion);
    expect(strongExpansion).toBeGreaterThan(strongBalanced);
  });

  it('各级站点总回本与增量回本保持在长期经营区间', () => {
    const state = createTestState({
      credits: 4000000,
      companyLevel: 10,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
    });
    vi.spyOn(Economy, 'getBuyPrice').mockImplementation(function (systemId, goodId) {
      const good = GOODS.find(function (entry) { return entry.id === goodId; });
      return good ? good.basePrice : DEFAULT_BASE_PRICE;
    });
    vi.spyOn(Economy, 'getMarketDepth').mockReturnValue(220);
    vi.spyOn(Economy, 'getEconomyCycle').mockReturnValue({ priceMod: 1.0 });
    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);

    const incomes = TRADE_STATION_LEVELS.map(function (level) {
      state.tradeStations.sol_prime.level = level.level;
      state.tradeStations.sol_prime.investment = level.investment;
      return TradeStation.getProjectedDailyIncome(state, 'sol_prime');
    });

    TRADE_STATION_LEVELS.forEach(function (level, index) {
      const totalPayback = level.investment / incomes[index];
      expect(totalPayback).toBeGreaterThanOrEqual(90);
      expect(totalPayback).toBeLessThanOrEqual(175);
      if (index === 0) return;
      const incrementalCost = level.investment - TRADE_STATION_LEVELS[index - 1].investment;
      const incrementalIncome = incomes[index] - incomes[index - 1];
      const incrementalPayback = incrementalCost / incrementalIncome;
      expect(incrementalPayback).toBeGreaterThanOrEqual(90);
      expect(incrementalPayback).toBeLessThanOrEqual(220);
    });
  });

  it('同星系不同角色贸易站会形成区域组合收益', () => {
    const state = createTestState({
      credits: 250000,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime', 'nova_station'],
    });

    vi.spyOn(Economy, 'getBuyPrice').mockImplementation(function (systemId, goodId) {
      const good = GOODS.find(function (entry) { return entry.id === goodId; });
      return good ? good.basePrice : DEFAULT_BASE_PRICE;
    });
    vi.spyOn(Economy, 'getMarketDepth').mockReturnValue(220);
    vi.spyOn(Economy, 'getEconomyCycle').mockReturnValue({ priceMod: 1.0 });

    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);

    const novaCandidate = TradeStation.getBuildCandidates(state).find(function (entry) {
      return entry.system.id === 'nova_station';
    });
    expect(novaCandidate.role.id).toBe('market_hub');
    expect(novaCandidate.prospectiveRegionalSynergy.bonusMultiplier).toBeCloseTo(0.06);

    expect(TradeStation.buildStation(state, 'nova_station').ok).toBe(true);

    const ownedStations = TradeStation.getOwnedStations(state);
    const solEntry = ownedStations.find(function (entry) { return entry.station.systemId === 'sol_prime'; });
    const novaEntry = ownedStations.find(function (entry) { return entry.station.systemId === 'nova_station'; });

    expect(solEntry.role.id).toBe('supply_node');
    expect(novaEntry.role.id).toBe('market_hub');
    expect(solEntry.regionalSynergy.label).toContain('补给商网');
    expect(solEntry.regionalSynergy.bonusMultiplier).toBeCloseTo(0.06);
    expect(solEntry.networkMultiplier).toBeCloseTo(1.06);
    expect(solEntry.grossIncome).toBe(339);
    expect(solEntry.projectedIncome).toBe(307);
  });

  it('会根据探索报告推荐贸易站经营策略', () => {
    const state = createTestState({
      credits: 300000,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime', 'nova_station'],
    });

    vi.spyOn(Exploration, 'getSurveyDecisionIntel').mockImplementation(function (queryState, systemId) {
      if (systemId === 'nova_station') {
        return createSurveyIntel({
          systemId: systemId,
          researchSignal: true,
          primarySignal: 'research',
        });
      }
      return createSurveyIntel({
        systemId: systemId,
        logisticsSignal: true,
        primarySignal: 'logistics',
      });
    });

    const logisticsRecommendation = TradeStation.getStrategyRecommendation(state, 'sol_prime');
    const researchRecommendation = TradeStation.getStrategyRecommendation(state, 'nova_station');

    expect(logisticsRecommendation).toMatchObject({
      strategyId: 'expansion',
      confidence: 'high',
      intelSignal: 'logistics',
      shouldSwitch: true,
    });
    expect(logisticsRecommendation.reason).toContain('薄利多销');
    expect(researchRecommendation).toMatchObject({
      strategyId: 'premium',
      confidence: 'high',
      intelSignal: 'research',
      shouldSwitch: true,
    });

    state.tradeStations.nova_station = {
      systemId: 'nova_station',
      level: 1,
      strategyId: 'premium',
      managerId: null,
      totalIncome: 0,
      investment: 100000,
      lastIncome: 0,
      buildDay: 1,
      lastProcessedDay: 1,
    };
    expect(TradeStation.getStrategyRecommendation(state, 'nova_station').shouldSwitch).toBe(false);
  });

  it('无探索报告时保持均衡经营，当前策略匹配时不提示切换', () => {
    const state = createTestState({
      credits: 300000,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
    });

    vi.spyOn(Exploration, 'getSurveyDecisionIntel').mockReturnValue(createSurveyIntel({
      hasIntel: false,
      marketSignal: false,
      primarySignal: 'logistics',
    }));

    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);

    const recommendation = TradeStation.getStrategyRecommendation(state, 'sol_prime');
    const entry = TradeStation.getOwnedStations(state).find(function (stationEntry) {
      return stationEntry.station.systemId === 'sol_prime';
    });

    expect(recommendation).toMatchObject({
      strategyId: 'balanced',
      confidence: 'low',
      intelSignal: 'none',
      shouldSwitch: false,
    });
    expect(entry.strategyRecommendation.shouldSwitch).toBe(false);
  });

  it('候选站点会带出建站后的策略推荐', () => {
    const state = createTestState({
      credits: 300000,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
    });

    vi.spyOn(Exploration, 'getSurveyDecisionIntel').mockReturnValue(createSurveyIntel({
      systemId: 'sol_prime',
      marketSignal: true,
      primarySignal: 'market',
    }));

    const candidate = TradeStation.getBuildCandidates(state).find(function (entry) {
      return entry.system.id === 'sol_prime';
    });

    expect(candidate.strategyRecommendation).toMatchObject({
      strategyId: 'expansion',
      confidence: 'high',
      intelSignal: 'market',
      shouldSwitch: true,
    });
  });

  it('废弃补给站事件链会降低本地建站成本', () => {
    const state = createTestState({
      credits: 90000,
      companyLevel: 4,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      fuel: 100,
      maxFuel: 100,
      shipHull: 100,
      maxHull: 100,
      visitedSystems: ['sol_prime'],
    });

    GalaxyData.init(state);
    try {
      const resourcePoi = GalaxyData.getPlanetData('sol_prime').exploration.pois.find(function (poi) {
        return poi.kind === 'resource_cache';
      });
      expect(Exploration.explorePoi(state, 'sol_prime', resourcePoi.id).ok).toBe(true);

      const candidate = TradeStation.getBuildCandidates(state).find(function (entry) {
        return entry.system.id === 'sol_prime';
      });
      expect(candidate).toMatchObject({
        buildCost: 26400,
        baseBuildCost: 30000,
        buildCostDiscount: 0.12,
        canAfford: true,
      });
      expect(candidate.explorationEffect.summary).toContain('废弃补给站');

      const creditsBeforeBuild = state.credits;
      const result = TradeStation.buildStation(state, 'sol_prime');

      expect(result.ok).toBe(true);
      expect(result.meta).toMatchObject({
        buildCost: 26400,
        baseBuildCost: 30000,
        buildCostDiscount: 0.12,
      });
      expect(state.credits).toBe(creditsBeforeBuild - 26400);
      expect(TradeStation.getStation(state, 'sol_prime').investment).toBe(26400);
    } finally {
      GalaxyData.init(createTestState({
        currentSystem: 'sol_prime',
        currentGalaxy: 'milky_way',
        viewingGalaxy: 'milky_way',
      }));
    }
  });

  it('遗迹与航标事件链会强化对应贸易站收益', () => {
    const state = createTestState({
      credits: 300000,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
      tradeStations: {
        sol_prime: {
          systemId: 'sol_prime',
          level: 1,
          strategyId: 'premium',
          managerId: null,
          totalIncome: 0,
          investment: 100000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
      },
    });
    let withChainIntel = false;
    vi.spyOn(Exploration, 'getSurveyDecisionIntel').mockImplementation(function () {
      if (!withChainIntel) {
        return createSurveyIntel({ hasIntel: false });
      }
      return createSurveyIntel({
        researchSignal: true,
        routeSignal: true,
        relicSignal: true,
        beaconSignal: true,
        primarySignal: 'research',
        anomalyChains: [
          { kind: 'ancient_relic', resolved: true },
          { kind: 'lost_beacon', resolved: true },
        ],
      });
    });
    vi.spyOn(Economy, 'getBuyPrice').mockImplementation(function (systemId, goodId) {
      const good = GOODS.find(function (entry) { return entry.id === goodId; });
      return good ? good.basePrice : DEFAULT_BASE_PRICE;
    });
    vi.spyOn(Economy, 'getMarketDepth').mockReturnValue(220);
    vi.spyOn(Economy, 'getEconomyCycle').mockReturnValue({ priceMod: 1 });

    const baselineIncome = TradeStation.getProjectedDailyIncome(state, 'sol_prime');
    withChainIntel = true;
    const boostedIncome = TradeStation.getProjectedDailyIncome(state, 'sol_prime');
    const entry = TradeStation.getOwnedStations(state).find(function (stationEntry) {
      return stationEntry.station.systemId === 'sol_prime';
    });

    expect(boostedIncome).toBeGreaterThan(baselineIncome);
    expect(entry.explorationMultiplier).toBeCloseTo(1.14, 5);
    expect(entry.explorationEffect.summary).toContain('古代遗迹');
    expect(entry.explorationEffect.summary).toContain('失落航标');
  });

  it('下一笔商网动作优先推荐可触发区域协同的建站', () => {
    const state = createTestState({
      credits: 220000,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime', 'nova_station'],
    });

    expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);

    const action = TradeStation.getNextNetworkAction(state);

    expect(action).toMatchObject({
      type: 'build',
      systemId: 'nova_station',
      payload: {
        action: 'market-build-station',
        systemId: 'nova_station',
      },
    });
    expect(action.reason).toContain('补给商网');
  });

  it('下一笔商网动作会在无协同建站时推荐升级，低预算时不制造管理员任务', () => {
    const upgradeState = createTestState({
      credits: 260000,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
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
    expect(TradeStation.getNextNetworkAction(upgradeState)).toMatchObject({
      type: 'upgrade',
      systemId: 'sol_prime',
      payload: {
        action: 'market-upgrade-station',
      },
    });

    const managerState = createTestState({
      credits: 30000,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
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
    expect(TradeStation.getNextNetworkAction(managerState)).toBe(null);
  });

  it('下一笔商网动作会推荐策略切换或提示资金缺口', () => {
    vi.spyOn(Exploration, 'getSurveyDecisionIntel').mockReturnValue(createSurveyIntel({
      systemId: 'sol_prime',
      logisticsSignal: true,
      primarySignal: 'logistics',
    }));
    const strategyState = createTestState({
      credits: 0,
      companyLevel: 5,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
      tradeStations: {
        sol_prime: {
          systemId: 'sol_prime',
          level: 1,
          strategyId: 'balanced',
          managerId: 'local_broker',
          totalIncome: 0,
          investment: 100000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
      },
    });
    expect(TradeStation.getNextNetworkAction(strategyState)).toMatchObject({
      type: 'strategy',
      systemId: 'sol_prime',
      payload: {
        action: 'market-set-strategy',
        strategyId: 'expansion',
      },
    });

    vi.restoreAllMocks();
    const fundingState = createTestState({
      credits: 5000,
      companyLevel: 4,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
      tradeStations: {},
    });
    const fundingAction = TradeStation.getNextNetworkAction(fundingState);

    expect(fundingAction).toMatchObject({
      type: 'funding',
      systemId: 'sol_prime',
      disabled: true,
      fundingGap: 25000,
    });
    expect(fundingAction.reason).toContain('还差 25,000');
  });

  it('支持按收益优先批量升级贸易站', () => {
    const visitedSystems = SYSTEMS.map(function (system) { return system.id; });
    const state = createTestState({
      credits: 130000,
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

  it('批量派驻经理入口返回已退役提示且不修改站点', () => {
    const visitedSystems = SYSTEMS.map(function (system) { return system.id; });
    const state = createTestState({
      credits: 135000,
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

    const result = TradeStation.batchHireManagers(state, 'logistics_director');

    expect(result).toMatchObject({ ok: false, meta: { retired: true, executedCount: 0 } });
    stationIds.forEach(function (systemId) {
      expect(TradeStation.getStation(state, systemId).managerId).toBe(null);
    });
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

  it('公司等级不足时拒绝建站和升级，管理员入口始终退役', () => {
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
    expect(TradeStation.hireManager(state, 'sol_prime', 'local_broker')).toMatchObject({
      ok: false,
      meta: { retired: true },
    });
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

  it('探索报告会串起建站候选、区域协同、策略推荐和下一笔商网动作', () => {
    const state = createTestState({
      credits: 360000,
      companyLevel: 5,
      currentSystem: 'nova_station',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      fuel: 100,
      maxFuel: 100,
      shipHull: 100,
      maxHull: 100,
      visitedSystems: ['sol_prime', 'nova_station'],
      currentResearch: { techId: 'deep_scanner', daysLeft: 4 },
      researchOptions: [],
    });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(function () {});

    GalaxyData.init(state);
    try {
      expect(TradeStation.buildStation(state, 'sol_prime').ok).toBe(true);

      const anomalyPoi = GalaxyData.getPlanetData('nova_station').exploration.pois.find(function (poi) {
        return poi.kind === 'anomaly_site';
      });
      expect(anomalyPoi).toBeTruthy();
      expect(Exploration.explorePoi(state, 'nova_station', anomalyPoi.id).ok).toBe(true);

      const candidate = TradeStation.getBuildCandidates(state).find(function (entry) {
        return entry.system.id === 'nova_station';
      });
      expect(candidate).toBeTruthy();
      expect(candidate.canAfford).toBe(true);
      expect(candidate.role.id).toBe('market_hub');
      expect(candidate.prospectiveRegionalSynergy.label).toContain('补给商网');
      expect(candidate.strategyRecommendation).toMatchObject({
        strategyId: 'premium',
        confidence: 'high',
        intelSignal: 'research',
        shouldSwitch: true,
      });
      expect(candidate.strategyRecommendation.reason).toContain('研究样本');

      const action = TradeStation.getNextNetworkAction(state);
      expect(action).toMatchObject({
        type: 'build',
        systemId: 'nova_station',
        payload: {
          action: 'market-build-station',
          systemId: 'nova_station',
        },
      });
      expect(action.reason).toContain('补给商网');
    } finally {
      GalaxyData.init(createTestState({
        currentSystem: 'sol_prime',
        currentGalaxy: 'milky_way',
        viewingGalaxy: 'milky_way',
      }));
      consoleSpy.mockRestore();
    }
  });
});
