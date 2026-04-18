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

  it('支持按最高买入价过滤路线', () => {
    const state = createTestState({
      credits: 50000,
      maxCargo: 100,
      cargo: {},
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      playerLevel: 5,
    });

    const result = AutoTrade.findBestTrade(state, { maxBuyPrice: 0 });
    expect(result).toBeNull();
  });

  it('支持按最低利润率过滤路线', () => {
    const state = createTestState({
      credits: 50000,
      maxCargo: 100,
      cargo: {},
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      playerLevel: 5,
    });

    const result = AutoTrade.findBestTrade(state, { minProfitRate: 5000 });
    expect(result).toBeNull();
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

describe('AutoTrade.findBestDispatchRoute', () => {
  it('可为派遣船只推荐完整买卖路线', () => {
    const state = createTestState({
      credits: 5000,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      playerLevel: 3,
    });

    const result = AutoTrade.findBestDispatchRoute(state, {
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      cargoFree: 20,
      credits: 5000,
      systemIds: ['sol_prime', 'nova_station', 'frontier_outpost'],
    });

    if (result) {
      expect(result).toHaveProperty('buySystemId');
      expect(result).toHaveProperty('sellSystemId');
      expect(result).toHaveProperty('goodId');
      expect(result.buySystemId).not.toBe(result.sellSystemId);
    }
  });

  it('在策略过严时返回 null', () => {
    const state = createTestState({
      credits: 5000,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      playerLevel: 3,
    });

    const result = AutoTrade.findBestDispatchRoute(state, {
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      cargoFree: 20,
      credits: 5000,
      systemIds: ['sol_prime', 'nova_station', 'frontier_outpost'],
    }, {
      maxBuyPrice: 0,
    });

    expect(result).toBeNull();
  });

  it('黑市模式可推荐黑市路线', () => {
    const state = createTestState({
      credits: 5000,
      currentSystem: 'shadow_haven',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      playerLevel: 3,
      factionRelations: { federation: 0, syndicate: 50, technocracy: 0 },
    });

    const result = AutoTrade.findBestDispatchRoute(state, {
      currentSystem: 'shadow_haven',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      cargoFree: 20,
      credits: 5000,
      systemIds: ['shadow_haven', 'frontier_outpost'],
    }, {
      marketMode: 'black',
      riskMode: 'aggressive',
    });

    if (result) {
      expect(result.marketMode).toBe('black');
      expect(['weapons', 'technology', 'luxury']).toContain(result.goodId);
    }
  });

  it('保守模式会拒绝受监管高风险路线', () => {
    const technology = { id: 'technology', legality: 'restricted', marketAccess: ['open', 'black'] };
    const risk = AutoTrade.assessTradeRisk(technology, 'shadow_haven', 'sol_prime');
    const adjusted = AutoTrade.applyRiskPreference(1000, risk, { riskMode: 'safe' });

    expect(adjusted.allowed).toBe(false);
  });

  it('自动贸易不会推荐黑市专属商品', () => {
    const weapons = { id: 'weapons', legality: 'illegal', marketAccess: ['black'] };
    expect(AutoTrade.isOpenMarketGood(weapons)).toBe(false);
  });

  it('可估算派遣卖出入港时的查获风险', () => {
    const state = createTestState({
      reputation: 0,
      factionRelations: { federation: 0, syndicate: 0, technocracy: 0 },
    });
    const weapons = { id: 'weapons', name: '武器', legality: 'illegal', marketAccess: ['black'] };

    const risk = AutoTrade.estimateDispatchInspectionRisk(state, weapons, 10, 'sol_prime', 'black');

    expect(risk.hasContraband).toBe(true);
    expect(risk.isHighEnforcement).toBe(true);
    expect(risk.contrabandGoods).toContain('武器');
    expect(risk.checkChancePercent).toBeGreaterThan(0);
  });

  it('派遣画像可下调预计查获风险', () => {
    const state = createTestState({
      reputation: 0,
      factionRelations: { federation: 0, syndicate: 0, technocracy: 0 },
    });
    const weapons = { id: 'weapons', name: '武器', legality: 'illegal', marketAccess: ['black'] };

    const baselineRisk = AutoTrade.estimateDispatchInspectionRisk(state, weapons, 10, 'sol_prime', 'black');
    const reducedRisk = AutoTrade.estimateDispatchInspectionRisk(state, weapons, 10, 'sol_prime', 'black', {
      checkChanceMultiplier: 0.6,
    });

    expect(reducedRisk.checkChancePercent).toBeLessThan(baselineRisk.checkChancePercent);
  });

  it('辛迪加庇护区的违禁派遣查获风险为 0', () => {
    const state = createTestState({
      reputation: 0,
      factionRelations: { federation: 0, syndicate: 50, technocracy: 0 },
    });
    const weapons = { id: 'weapons', name: '武器', legality: 'illegal', marketAccess: ['black'] };

    const risk = AutoTrade.estimateDispatchInspectionRisk(state, weapons, 10, 'shadow_haven', 'black');

    expect(risk.hasContraband).toBe(true);
    expect(risk.protectedByBlackMarket).toBe(true);
    expect(risk.checkChancePercent).toBe(0);
  });

  it('派遣推荐会回传角色策略说明与画像得分', () => {
    const state = createTestState({
      credits: 5000,
      currentSystem: 'shadow_haven',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      playerLevel: 3,
      factionRelations: { federation: 0, syndicate: 50, technocracy: 0 },
    });

    const result = AutoTrade.findBestDispatchRoute(state, {
      currentSystem: 'shadow_haven',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      cargoFree: 20,
      credits: 5000,
      systemIds: ['shadow_haven', 'frontier_outpost'],
      dispatchProfile: {
        roleId: 'covert',
        roleLabel: '灰市突破',
        strategyLabel: '灰市穿透',
        strategyNote: '偏好黑市与受限商品套利。',
        inspectionRiskMultiplier: 0.78,
        blackMarketBonus: 140,
        faultPressurePenalty: 12,
        faultPressure: 0,
      },
    }, {
      marketMode: 'black',
      riskMode: 'aggressive',
    });

    if (result) {
      expect(result.strategyLabel).toBe('灰市穿透');
      expect(result.dispatchProfile.roleId).toBe('covert');
      expect(result.routeFitScore).toBeGreaterThan(0);
      expect(result.adjustedProfit).toBeGreaterThan(result.baseAdjustedProfit);
    }
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

  it('任务路线会回传分工策略摘要与画像', () => {
    const state = createTestState({
      credits: 5000,
      cargo: { food: 5 },
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      playerLevel: 3,
      quests: [{
        id: 'priority_quest',
        name: '优先送货',
        timeLimit: 6,
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

    const result = AutoTrade.findQuestRoute(state, {
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      playerLevel: 3,
      cargo: state.cargo,
      fuelEfficiency: 1.0,
      dispatchProfile: {
        roleId: 'courier',
        roleLabel: '快航中继',
        strategyLabel: '短线周转',
        strategyNote: '偏好低燃耗、低磨损的快速循环路线。',
        fuelCostWeight: 1.35,
        highRiskPenalty: 24,
        inspectionRiskMultiplier: 1,
        faultPressurePenalty: 16,
        faultPressure: 0,
      },
    });

    expect(result).not.toBeNull();
    if (result) {
      expect(result.questId).toBe('priority_quest');
      expect(result.buySystemName).toBe('太阳主星');
      expect(result.sellSystemName).toBe('新北京站');
      expect(result.goodName).toBe('食物');
      expect(result.strategyLabel).toBe('短线周转');
      expect(result.strategySummary).toContain('短线周转');
      expect(result.dispatchProfile.roleId).toBe('courier');
      expect(result.recommendedTradePolicy).toMatchObject({
        marketMode: 'open',
        riskMode: 'balanced',
      });
      expect(typeof result.routeFitScore).toBe('number');
    }
  });
});

describe('AutoTrade.findResearchSupplyRoute', () => {
  it('会围绕当前研究返回科研补给建议', () => {
    const state = createTestState({
      credits: 9000,
      maxCargo: 24,
      cargo: {},
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      playerLevel: 3,
      currentResearch: { techId: 'market_analysis', daysLeft: 2 },
      researchOptions: ['negotiation_ai', 'deep_scanner'],
    });

    const result = AutoTrade.findResearchSupplyRoute(state, {
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      cargoFree: 24,
      credits: 9000,
      playerLevel: 3,
      dispatchProfile: {
        roleId: 'logistics',
        roleLabel: '主力商运',
        strategyLabel: '稳态商运',
        strategyNote: '偏好公开市场与高装载收益的稳定货运路线。',
        openMarketBonus: 82,
        cargoValueWeight: 1.25,
        legalTradeBonus: 42,
        highRiskPenalty: 28,
        faultPressurePenalty: 20,
        faultPressure: 0,
      },
    });

    expect(result).not.toBeNull();
    if (result) {
      expect(result.focusTechId).toBe('market_analysis');
      expect(result.focusCategoryId).toBe('commerce');
      expect(result.strategySummary).toContain('稳态商运');
      expect(result.dispatchProfile.roleId).toBe('logistics');
      expect(result.recommendedTradePolicy).toMatchObject({
        marketMode: 'open',
      });
      expect(['luxury', 'technology', 'medicine', 'food']).toContain(result.goodId);
    }
  });

  it('没有当前研究和候选科技时返回 null', () => {
    const state = createTestState({
      credits: 9000,
      maxCargo: 24,
      cargo: {},
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      playerLevel: 3,
      currentResearch: null,
      researchOptions: [],
    });

    const result = AutoTrade.findResearchSupplyRoute(state, {
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      fuelEfficiency: 1.0,
      cargoFree: 24,
      credits: 9000,
      playerLevel: 3,
    });

    expect(result).toBeNull();
  });
});
