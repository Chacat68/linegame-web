import { describe, expect, it } from 'vitest';
import { researchChain } from './helpers/merchantResearch.js';
import { createInitialState } from '../js/data/constants.js';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_TECHS, MERCHANT_EXPLORATION_RULES } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { buildMerchantEarlyProgress, getMerchantBudgetRecommendation } from '../js/ui/MerchantEarlyProgress.js';

const techCost = id => MERCHANT_TECHS.find(tech => tech.id === id).cost;
const firstExplorationInvestment = ['hauler_design', 'fleet_command', 'trade_quotes', 'market_network', 'planet_survey'].reduce((sum, id) => sum + techCost(id), MERCHANT_EXPLORATION_RULES.cost);
const start = 1_800_000_000_000;
const food = { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 };
const fresh = () => { const state = createInitialState(); Merchant.init(state, start); return state; };
const firstTrip = state => {
  expect(Merchant.command(state, 'create', food, start).ok).toBe(true);
  Merchant.advance(state, start + 2 * Merchant.legDuration('courier', food.from, food.to));
};

describe('前期经营节奏', () => {
  it('首航建议使用真实船、报价和满载货本，查看建议不改变经营账本', () => {
    const state = fresh();
    const before = structuredClone(state);
    const next = buildMerchantEarlyProgress(state);
    expect(next.stage).toBe('first-route');
    const { opportunity, ...route } = next.route;
    const quote = Merchant.preview(state, { ...route, shipIds: [opportunity.shipId], budget: opportunity.budget });
    expect(opportunity).toMatchObject({ shipId: 'ship-1', budget: 126, purchaseCost: 0, profit: quote.profit });
    expect(state).toEqual(before);
  });

  it('首次返港前先展示回款时间，跳过引导不提前推荐扩张', () => {
    const state = fresh();
    Merchant.command(state, 'onboarding', { action: 'skip' }, start);
    Merchant.command(state, 'create', food, start);
    const returnAt = start + 2 * Merchant.legDuration('courier', food.from, food.to);
    expect(buildMerchantEarlyProgress(state)).toMatchObject({ stage: 'first-return', returnAt, route: null });
    Merchant.advance(state, returnAt - 1);
    expect(buildMerchantEarlyProgress(state).stage).toBe('first-return');
    Merchant.advance(state, returnAt);
    const next = buildMerchantEarlyProgress(state);
    expect(next).toMatchObject({ stage: 'growth', route: null, target: MERCHANT_COMPANY_LEVELS[0].upgradeCost, readyToUpgrade: false });
    const before = structuredClone(state);
    expect(Merchant.command(state, 'buyShip', { typeId: 'courier' }, state.merchant.lastTickAt).ok).toBe(false);
    expect(state).toEqual(before);
    expect(state.credits).toBe(916);
    expect(state.merchant.onboarding).toEqual({ step: 5, skipped: true });
  });

  it('两条真实商路后逐级积累，每级保护投入，最后同时备齐升级与探索费用', () => {
    const state = fresh(); firstTrip(state);
    state.credits = MERCHANT_COMPANY_LEVELS.slice(0, 8).reduce((sum, stage) => sum + stage.upgradeCost, techCost('berth_planning') + techCost('clipper_design') + 500);
    while (state.merchant.companyLevel < 9) expect(Merchant.command(state, Merchant.getCompanyProgress(state.merchant).action, {}, state.merchant.lastTickAt).ok).toBe(true);
    expect(buildMerchantEarlyProgress(state)).toMatchObject({ stage: 'fleet-research', techId: 'clipper_design', research: true });
    researchChain(state, 'berth_planning');
    const next = buildMerchantEarlyProgress(state);
    const bought = Merchant.command(state, 'buyShip', { typeId: next.route.opportunity.typeId }, state.merchant.lastTickAt);
    Merchant.command(state, 'create', { ...next.route, shipIds: bought.shipIds, budget: next.route.opportunity.budget }, state.merchant.lastTickAt);
    const costs = MERCHANT_COMPANY_LEVELS.slice(8, 23).map(stage => stage.upgradeCost);
    expect(buildMerchantEarlyProgress(state)).toMatchObject({ stage: 'growth', target: costs[0], explorationTarget: costs.slice(0).reduce((sum, cost) => sum + cost, firstExplorationInvestment), readyToUpgrade: false });
    for (const cost of costs.slice(0, -1)) {
      state.credits = cost - 1;
      expect(buildMerchantEarlyProgress(state)).toMatchObject({ target: cost, readyToUpgrade: false });
      state.credits = cost;
      expect(buildMerchantEarlyProgress(state).readyToUpgrade).toBe(true);
      expect(Merchant.command(state, Merchant.getCompanyProgress(state.merchant).action, {}, state.merchant.lastTickAt).ok).toBe(true);
      expect(state.credits).toBe(0);
      expect(state.merchant.exploration.event).toBeNull();
    }
    const target = costs.at(-1) + firstExplorationInvestment;
    state.credits = target - 1;
    expect(buildMerchantEarlyProgress(state)).toMatchObject({ stage: 'exploration', target, readyToUpgrade: false });
    state.credits = target;
    expect(buildMerchantEarlyProgress(state)).toMatchObject({ readyToUpgrade: true, cash: target });
    expect(buildMerchantEarlyProgress(state).text).toContain('结束一项任务');
    Merchant.command(state, Merchant.getCompanyProgress(state.merchant).action, {}, state.merchant.lastTickAt);
    expect(state.credits).toBe(firstExplorationInvestment);
    expect(buildMerchantEarlyProgress(state).stage).toBe('research');
    researchChain(state, 'planet_survey');
    expect(state.merchant.exploration.event.status).toBe('available');
    expect(buildMerchantEarlyProgress(state)).toBeNull();
  });

  it('读档与离线结算推导相同阶段，主动结束时提示返港，完成后可重新经营', () => {
    const online = fresh(); Merchant.command(online, 'create', food, start);
    const offline = structuredClone(online);
    for (let second = 1; second <= 60; second++) Merchant.advance(online, start + second * 1000);
    Merchant.advance(offline, start + 60_000);
    expect(buildMerchantEarlyProgress(offline)).toEqual(buildMerchantEarlyProgress(online));
    const taskId = online.merchant.tasks[0].id;
    Merchant.command(online, 'stop', { taskId }, online.merchant.lastTickAt);
    expect(buildMerchantEarlyProgress(online)).toMatchObject({ stage: 'returning', taskId });
    Merchant.advance(online, start + 90_000);
    expect(buildMerchantEarlyProgress(online)).toMatchObject({ stage: 'first-route', title: '让商路重新跑起来' });
    for (let level = 2; level <= 5; level++) {
      const state = fresh(); state.merchant.companyLevel = level;
      expect(buildMerchantEarlyProgress(state).stage).toBe('first-route');
    }
    for (const progressed of [state => { state.merchant.researchedTechIds.push('planet_survey'); }, state => { state.merchant.unlockedPorts.push('nebula_forge'); }, state => { state.merchant.researchedTechIds.push('planet_survey'); }]) {
      const state = fresh(); progressed(state); expect(buildMerchantEarlyProgress(state)).toBeNull();
    }
  });

  it('缺少供需或购船资金时不推荐无效商路，也不跳过首航', () => {
    const state = fresh();
    state.credits = 2160;
    expect(buildMerchantEarlyProgress(state).stage).toBe('first-route');
    firstTrip(state);
    state.merchant.companyLevel = 9;
    state.credits = techCost('berth_planning') + techCost('clipper_design') + 1000;
    researchChain(state, 'berth_planning');
    state.credits = 300;
    expect(buildMerchantEarlyProgress(state).stage).toBe('wait');
    state.credits = 1000;
    state.merchant.markets.mineral_belt.supply.minerals = 0;
    expect(buildMerchantEarlyProgress(state).stage).toBe('wait');
  });

  it('第二条商路先备齐添船和满载货本，部分装载资金不会提前触发扩张建议', () => {
    const state = fresh(); firstTrip(state);
    state.merchant.companyLevel = 9;
    state.credits = techCost('berth_planning') + techCost('clipper_design') + 1000;
    researchChain(state, 'berth_planning');
    state.credits = 450;
    const before = structuredClone(state);
    expect(buildMerchantEarlyProgress(state)).toMatchObject({ stage: 'wait', title: '备齐第二条商路的投入', route: null, target: 498 });
    expect(state).toEqual(before);
    state.credits = 498;
    expect(buildMerchantEarlyProgress(state)).toMatchObject({ stage: 'second-route', route: { opportunity: { purchaseCost: 336, budget: 162 } } });
  });
});

describe('满载货本建议', () => {
  it('混合船队按真实采购价和各船往返费用相加，不覆盖输入或花费资金', () => {
    const state = fresh();
    state.merchant.companyLevel = 9;
    state.credits = techCost('berth_planning') + techCost('clipper_design') + 1000;
    researchChain(state, 'berth_planning');
    const bought = Merchant.command(state, 'buyShip', { typeId: 'clipper' }, start);
    const plan = { ...food, shipIds: ['ship-1', ...bought.shipIds], budget: 42 };
    const before = structuredClone(state);
    expect(getMerchantBudgetRecommendation(state, plan)).toEqual({ budget: 304, affordable: true, durationMs: 21430 });
    expect(plan.budget).toBe(42);
    expect(state).toEqual(before);
    state.credits = 303;
    expect(getMerchantBudgetRecommendation(state, plan).affordable).toBe(false);
  });

  it('调整已有任务计入原货本，其他任务占用船、未知船与无效线路不提供建议', () => {
    const state = fresh(); Merchant.command(state, 'create', food, start);
    const task = state.merchant.tasks[0];
    state.credits = 0;
    expect(getMerchantBudgetRecommendation(state, { ...food, taskId: task.id })).toMatchObject({ budget: 126, affordable: true });
    for (const plan of [food, { ...food, shipIds: [] }, { ...food, shipIds: ['missing'] }, { ...food, shipIds: ['ship-1', 'ship-1'] }, { ...food, to: 'nebula_forge' }, { ...food, goodId: 'technology' }]) {
      expect(getMerchantBudgetRecommendation(state, plan)).toBeNull();
    }
  });
});
