import { describe, expect, it } from 'vitest';
import { getPendingTechChain } from '../js/systems/merchant/MerchantTechnology.js';
import { createInitialState, createSaveMeta } from '../js/data/constants.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { getMerchantAnalytics } from '../js/systems/merchant/MerchantAnalytics.js';
import * as Save from '../js/systems/save/SaveSystem.js';

const start = 1_800_000_000_000;
const food = (shipIds = ['ship-1'], budget = 126) => ({ from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds, budget });
const fresh = (credits = 10000) => { const state = createInitialState({ credits }); Merchant.init(state, start); return state; };
describe('独立统计和投资比较', () => {
  it('扩大供需后初始双向商路连续满载十五分钟，在线与离线的完整账本一致', () => {
    for (const route of [food(['ship-1'], 220), { from: 'mineral_belt', to: 'sol_prime', goodId: 'minerals', shipIds: ['ship-1'], budget: 220 }]) {
      const online = fresh(1000);
      const { taskId } = Merchant.command(online, 'create', { ...route }, start);
      const offline = structuredClone(online), sequence = online.merchant.nextId;
      for (let seconds = 1; seconds <= 900; seconds++) {
        Merchant.advance(online, start + seconds * 1000);
        expect(['outbound', 'return']).toContain(online.merchant.ships[0].phase);
        expect(online.merchant.ships[0].trip.quantity).toBe(12);
      }
      expect(Merchant.advance(offline, start + 900000).caughtUp).toBe(true);
      const accounting = state => ({ ...state, merchant: { ...state.merchant, lastCatchupMs: 0 } });
      expect(accounting(offline)).toEqual(accounting(online));
      expect(offline.merchant.tasks).toHaveLength(1);
      expect(offline.merchant.tasks[0]).toMatchObject({ id: taskId, stopping: false, budget: 220 });
      expect(offline.merchant.tasks[0].rounds).toBe(52);
      expect(getMerchantAnalytics(offline.merchant, 15).idleFraction).toBe(0);
      expect(offline.credits + 220).toBe(1000 + offline.merchant.tasks[0].profit);
      expect(offline.merchant.history).toHaveLength(0);
      expect(offline.merchant.nextId).toBe(sequence);
      expect(Merchant.isValidMerchantState(offline.merchant)).toBe(true);
    }
  });

  it('逐秒在线与一次离线的船时、货本占用及结算统计完全相同，重复推进不重复积分', () => {
    const online = fresh();
    Merchant.command(online, 'create', food(), start);
    const offline = structuredClone(online);
    for (let second = 1; second <= 125; second++) Merchant.advance(online, start + second * 1000);
    Merchant.advance(offline, start + 125_000);
    expect(offline.merchant.analytics).toEqual(online.merchant.analytics);
    const result = getMerchantAnalytics(offline.merchant, 5);
    expect(result.routes[0]).toMatchObject({ trips: 7, profit: 294, quantity: 84, capacity: 84, averageProfit: 42, loadFraction: 1 });
    expect(result.routes[0].averageTravelMs).toBe(17144);
    expect(result.idleFraction).toBe(0);
    const before = structuredClone(offline);
    Merchant.advance(offline, offline.merchant.lastTickAt);
    expect(offline).toEqual(before);
    expect(Merchant.isValidMerchantState(offline.merchant)).toBe(true);
  });

  it('分钟桶过期后累计仍保留，相同窗口覆盖无交易时间，事件预算不重复累计', () => {
    const state = fresh();
    Merchant.command(state, 'create', food(), start);
    Merchant.advance(state, start + 59000);
    Merchant.command(state, 'stop', { taskId: state.merchant.tasks[0].id }, state.merchant.lastTickAt);
    Merchant.advance(state, start + 90 * 60_000);
    expect(state.merchant.analytics.routes[0].profit).toBe(168);
    expect(state.merchant.analytics.routes[0].buckets).toHaveLength(0);
    expect(getMerchantAnalytics(state.merchant, 15).routes[0]).toMatchObject({ trips: 0, profit: 0, cumulativeProfit: 168 });
    const target = start + 7 * 24 * 60 * 60_000;
    while (!Merchant.advance(state, target).caughtUp) expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    expect(state.merchant.analytics.fleet.length).toBeLessThanOrEqual(61);
    expect(getMerchantAnalytics(state.merchant, 60).idleFraction).toBe(1);
  });

  it('科技比較只读同一市场，包含前置研发、逐艘船价和满载货本', () => {
    const state = fresh();
    state.merchant.companyLevel = 5;
    const before = structuredClone(state);
    const comparisons = Merchant.getShipRouteComparison(state, food());
    expect(comparisons.find(row => row.typeId === 'courier')).toMatchObject({ quantity: 12, profit: 42, capital: 126, purchaseCost: 336, researchCost: 0 });
    expect(comparisons.find(row => row.typeId === 'relay').researchCost).toBe(getPendingTechChain(state.merchant, 'integrated_freight').reduce((sum, tech) => sum + tech.cost, 0));
    expect(state).toEqual(before);
    state.merchant.researchedTechIds.push('fast_navigation');
    expect(Merchant.getShipRouteComparison(state, food()).find(row => row.typeId === 'relay').researchCost).toBe(getPendingTechChain(state.merchant, 'integrated_freight').reduce((sum, tech) => sum + tech.cost, 0));
    state.merchant.unlockedPorts.push('nebula_forge', 'aurora_depot');
    const ore = Merchant.getShipRouteComparison(state, { from: 'aurora_depot', to: 'nebula_forge', goodId: 'alloys' });
    expect(ore.find(row => row.typeId === 'bulk')).toMatchObject({ quantity: 36, profit: 103, fee: 77, capital: 509 });
    expect(ore.find(row => row.typeId === 'courier')).toMatchObject({ quantity: 12, profit: 4 });
  });
});

describe('v26 接续与新字段验证', () => {
  it('真实旧结构保留锁定航次和原始字节，新增统计从接续账本时间开始', () => {
    const state = fresh();
    Merchant.command(state, 'create', food(), start);
    delete state.merchant.plans; delete state.merchant.analytics;
    delete state.merchant.exploration.completed; delete state.merchant.exploration.nextPortId;
    delete state.merchant.markets.aurora_depot; delete state.merchant.markets.nebula_forge.demand.alloys;
    const raw = JSON.stringify({ meta: { ...createSaveMeta(0, state), schemaVersion: 26, gameVersion: '2.0.0' }, data: state });
    localStorage.setItem('startrader_save_0', raw);
    const loaded = Save.loadGame(0);
    expect(loaded.ok).toBe(true);
    expect(localStorage.getItem('startrader_save_before_v27_0')).toBe(raw);
    expect(loaded.state.credits).toBe(state.credits);
    expect(loaded.state.merchant.ships).toEqual(state.merchant.ships);
    expect(loaded.state.merchant.tasks).toEqual(state.merchant.tasks);
    expect(loaded.state.merchant.analytics).toEqual({ since: start, routes: [], fleet: [] });
    Merchant.advance(loaded.state, start + 60_000);
    expect(loaded.state.merchant.analytics.routes[0].profit).toBe(126);
    expect(Save.saveGame(0, loaded.state).ok).toBe(true);
    expect(Save.loadGame(0).state).toEqual(loaded.state);
  });

  it('旧方案字段、损坏统计和多目标探索字段的导入不覆盖当前槽位', () => {
    const state = fresh();
    expect(Save.saveGame(1, state).ok).toBe(true);
    const raw = Save.exportSave(1);
    for (const damage of [
      m => { m.plans = []; }, m => { m.analytics.since += 1; },
      m => { m.analytics.fleet = [{ at: start, ownedMs: 100, busyMs: 101 }]; },
      m => { delete m.exploration.completed; }, m => { m.exploration.nextPortId = 'aurora_depot'; },
    ]) {
      const damaged = structuredClone(state); damage(damaged.merchant);
      expect(Save.importSave(1, JSON.stringify({ meta: createSaveMeta(1, damaged), data: damaged })).ok).toBe(false);
      expect(Save.exportSave(1)).toBe(raw);
    }
  });
});


describe('直接派遣与账本保留', () => {
  it('补算结束前拒绝新派遣，旧方案操作均不可用且不改动资产', () => {
    const state = fresh();
    const before = structuredClone(state);
    for (const action of ['savePlan', 'deletePlan', 'dispatchPlans']) {
      expect(Merchant.command(state, action, food(), start).ok).toBe(false);
      expect(state).toEqual(before);
    }
    const far = start + 7 * 24 * 60 * 60_000;
    const result = Merchant.command(state, 'create', food(), far);
    expect(result.ok).toBe(false);
    expect(state.merchant.tasks).toHaveLength(0);
    while (!Merchant.advance(state, far).caughtUp) expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    expect(Merchant.command(state, 'create', food(), far).ok).toBe(true);
    expect(state.merchant.ships[0].trip.departedAt).toBe(far);
  });

  it('结束任务保留最近航次和累计统计，历史裁剪与读档不丢失账本', () => {
    const state = fresh();
    for (let index = 0; index < 30; index++) {
      const at = start + index * 60_000;
      Merchant.advance(state, at);
      expect(Merchant.command(state, 'create', food(), at).ok).toBe(true);
      Merchant.advance(state, at + 30_000);
      expect(Merchant.command(state, 'stop', { taskId: state.merchant.tasks[0].id }, state.merchant.lastTickAt).ok).toBe(true);
      Merchant.advance(state, at + 40_000);
    }
    expect(state.merchant.history).toHaveLength(24);
    expect(state.merchant.history.every(task => task.stopping && Number.isFinite(task.closedAt))).toBe(true);
    expect(state.merchant.analytics.routes[0].trips).toBeGreaterThan(state.merchant.history.reduce((sum, task) => sum + task.rounds, 0));
    expect(state.merchant).not.toHaveProperty('plans');
    expect(Save.saveGame(1, state).ok).toBe(true);
    expect(Save.loadGame(1).state).toEqual(state);
  });
});
