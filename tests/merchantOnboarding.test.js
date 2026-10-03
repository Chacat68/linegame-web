import { describe, expect, it } from 'vitest';
import { createInitialState } from '../js/data/constants.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';

const start = 1_800_000_000_000;
const plan = { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 220 };
function fresh() { const state = createInitialState(); Merchant.init(state, start); return state; }
const guide = (state, action) => Merchant.command(state, 'onboarding', { action }, state.merchant.lastTickAt);
function assets(state) {
  const copy = structuredClone(state); delete copy.merchant.onboarding; return copy;
}
function changeGuide(state, action, step) {
  const before = assets(state);
  expect(guide(state, action).ok).toBe(true);
  expect(state.merchant.onboarding).toEqual({ step, skipped: false });
  expect(assets(state)).toEqual(before);
}

describe('短剧情与非强制经营引导', () => {
  it('按真实出航、完整返港和查看报告推进，故事与提示不发资产或重复扣费', () => {
    const state = fresh();
    expect(state.merchant.onboarding).toEqual({ step: 0, skipped: false });
    for (const action of ['opened-dispatch', 'viewed-report', 'finish']) {
      const before = structuredClone(state);
      expect(guide(state, action).ok).toBe(false); expect(state).toEqual(before);
    }
    changeGuide(state, 'start', 1);
    const first = structuredClone(state);
    expect(guide(state, 'start').ok).toBe(false); expect(state).toEqual(first);
    changeGuide(state, 'opened-dispatch', 2);
    expect(Merchant.command(state, 'create', plan, start).ok).toBe(true);
    expect(state.merchant.onboarding).toEqual({ step: 3, skipped: false });
    expect(state.credits).toBe(780);
    const trip = structuredClone(state.merchant.ships[0].trip), taskId = state.merchant.tasks[0].id;
    expect(Merchant.command(state, 'stop', { taskId }, start).ok).toBe(true);
    Merchant.advance(state, start + trip.legMs);
    expect(state.credits).toBe(780);
    expect(state.merchant.ships[0].phase).toBe('return');
    for (const action of ['viewed-report', 'finish']) {
      const before = structuredClone(state);
      expect(guide(state, action).ok).toBe(false); expect(state).toEqual(before);
    }
    Merchant.advance(state, start + 2 * trip.legMs);
    expect(state.credits).toBe(1042);
    expect(state.merchant.tasks).toHaveLength(0);
    expect(state.merchant.history[0]).toMatchObject({ rounds: 1, profit: 42 });
    expect(state.merchant.onboarding.step).toBe(3);
    changeGuide(state, 'viewed-report', 4);
    changeGuide(state, 'finish', 5);
    const done = structuredClone(state);
    for (const action of ['start', 'finish', 'skip']) {
      expect(guide(state, action).ok).toBe(false); expect(state).toEqual(done);
    }
  });

  it('失败或零利润派遣不误完成配船步骤，玩家直接有效出航也能继续', () => {
    for (const opened of [false, true]) {
      const state = fresh(); changeGuide(state, 'start', 1);
      if (opened) changeGuide(state, 'opened-dispatch', 2);
      const before = structuredClone(state);
      expect(Merchant.command(state, 'create', { ...plan, budget: 0 }, start).ok).toBe(false);
      expect(state).toEqual(before);
      state.merchant.markets.sol_prime.supply.food = 0;
      expect(Merchant.command(state, 'create', plan, start).ok).toBe(true);
      expect(state.merchant.tasks).toHaveLength(0);
      expect(state.merchant.history[0]).toMatchObject({ rounds: 0, profit: 0 });
      expect(state.merchant.ships[0]).toMatchObject({ phase: 'idle', trip: null });
      expect(state.credits).toBe(1000);
      expect(state.merchant.onboarding.step).toBe(opened ? 2 : 1);
      Merchant.advance(state, start + 120000);
      expect(state.merchant.onboarding.step).toBe(opened ? 2 : 1);
      expect(Merchant.command(state, 'create', plan, state.merchant.lastTickAt).ok).toBe(true);
      expect(state.merchant.ships[0].phase).toBe('outbound');
      expect(state.merchant.onboarding.step).toBe(3);
    }
  });

  it('任一未完成步骤均可跳过，不变更资金、商队、航速或经营进度', () => {
    const state = fresh(), stages = [structuredClone(state)];
    changeGuide(state, 'start', 1); stages.push(structuredClone(state));
    changeGuide(state, 'opened-dispatch', 2); stages.push(structuredClone(state));
    expect(Merchant.command(state, 'create', plan, start).ok).toBe(true); stages.push(structuredClone(state));
    Merchant.advance(state, start + 18000); changeGuide(state, 'viewed-report', 4); stages.push(structuredClone(state));
    for (const stage of stages) {
      const before = assets(stage);
      expect(guide(stage, 'skip').ok).toBe(true);
      expect(stage.merchant.onboarding).toEqual({ step: 5, skipped: true });
      expect(assets(stage)).toEqual(before);
      const skipped = structuredClone(stage);
      for (const action of ['start', 'opened-dispatch', 'viewed-report', 'finish', 'skip']) {
        expect(guide(stage, action).ok).toBe(false); expect(stage).toEqual(skipped);
      }
      Merchant.advance(stage, stage.merchant.lastTickAt + 125000);
      expect(stage.merchant.onboarding).toEqual({ step: 5, skipped: true });
    }
  });

  it('在线和离线真实结算同样保留报告步骤，重新初始化不会重播故事', () => {
    const online = fresh(); changeGuide(online, 'start', 1); changeGuide(online, 'opened-dispatch', 2);
    expect(Merchant.command(online, 'create', plan, start).ok).toBe(true);
    const offline = structuredClone(online);
    for (let second = 1; second <= 125; second++) Merchant.advance(online, start + second * 1000);
    Merchant.init(offline, start + 125000); Merchant.advance(offline, start + 125000);
    expect(online.credits).toBe(1126); expect(offline.credits).toBe(1126);
    expect(offline.merchant.history).toEqual(online.merchant.history);
    expect(offline.merchant.ships).toEqual(online.merchant.ships);
    expect(offline.merchant.onboarding).toEqual({ step: 3, skipped: false });
    expect(online.merchant.onboarding).toEqual(offline.merchant.onboarding);
    changeGuide(offline, 'viewed-report', 4); changeGuide(offline, 'finish', 5);
    Merchant.init(offline, start + 180000); Merchant.advance(offline, start + 180000);
    expect(offline.merchant.onboarding).toEqual({ step: 5, skipped: false });
    expect(offline.credits).toBe(1126);
  });
});
