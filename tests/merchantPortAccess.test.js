import { restoreLegacyMerchantAccess } from '../js/systems/merchant/MerchantTechnology.js';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../js/data/constants.js';
import { SYSTEMS } from '../js/data/systems.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { getMerchantAnalytics } from '../js/systems/merchant/MerchantAnalytics.js';
import { buildMerchantRouteReports } from '../js/ui/MerchantReportProjection.js';
import { getPresentedSceneSystems } from '../js/ui/MerchantScenePresentation.js';
import { getOpenPortIds } from '../js/systems/merchant/MerchantAccess.js';

const start = 1_800_000_000_000;
const targets = [
  { portId: 'nebula_forge', to: 'sol_prime', goodId: 'technology' },
  { portId: 'aurora_depot', to: 'nebula_forge', goodId: 'alloys' },
];
function fresh(target) {
  const state = createInitialState({ credits: 20000 });
  state.merchant.companyLevel = 57;
  state.merchant.exploration.rngState = 42;
  restoreLegacyMerchantAccess(state.merchant);
  Merchant.init(state, start);
  Merchant.advance(state, start);
  if (target.portId === 'aurora_depot') {
    const first = state.merchant.exploration.event;
    expect(Merchant.command(state, 'explore', { eventId: first.id, shipId: 'ship-1' }, start).ok).toBe(true);
    Merchant.advance(state, first.arriveAt + first.legMs);
    Merchant.advance(state, state.merchant.exploration.nextEventAt);
  }
  return state;
}
const planFor = target => ({ from: target.portId, to: target.to, goodId: target.goodId, shipIds: ['ship-1'], budget: 1000 });
const touches = (route, portId) => route.from === portId || route.to === portId;

describe('探索与商路开放条件', () => {
  it.each(targets)('$portId 在信号、去程、勘察和返港阶段都不提供商路或报价', target => {
    const state = fresh(target), plan = planFor(target);
    const assertClosed = () => {
      const before = structuredClone(state);
      expect(Merchant.listRouteOpportunities(state).some(route => touches(route, target.portId))).toBe(false);
      expect(Merchant.findRouteOpportunity(state, plan.from, plan.to, plan.goodId)).toBeNull();
      expect(Merchant.getShipRouteComparison(state, plan)).toEqual([]);
      expect(Merchant.isMerchantGoodKnown(state.merchant, target.goodId)).toBe(false);
      expect(getPresentedSceneSystems(SYSTEMS, state).some(port => port.id === target.portId)).toBe(false);
      const offer = Merchant.preview(state, plan);
      expect(offer).toMatchObject({ quantity: 0, profit: 0, cost: 0, fee: 0 });
      expect(offer.rows.every(row => row.quantity === 0 && !row.legMs)).toBe(true);
      expect(offer.reason).toContain('尚未开放');
      expect(state).toEqual(before);
      expect(Merchant.command(state, 'create', plan, state.merchant.lastTickAt).ok).toBe(false);
    };
    assertClosed();
    const beganAt = state.merchant.lastTickAt, event = state.merchant.exploration.event;
    const exploration = Merchant.getExplorationPreview(state, { shipId: 'ship-1' });
    expect(Merchant.command(state, 'explore', { eventId: event.id, shipId: 'ship-1' }, beganAt).ok).toBe(true);
    for (const at of [beganAt + 1, beganAt + exploration.legMs, beganAt + exploration.durationMs - exploration.legMs, beganAt + exploration.durationMs - 1]) {
      Merchant.advance(state, at);
      assertClosed();
    }
    Merchant.advance(state, beganAt + exploration.durationMs);
    expect(Merchant.listRouteOpportunities(state).some(route => touches(route, target.portId))).toBe(true);
    expect(Merchant.isMerchantGoodKnown(state.merchant, target.goodId)).toBe(true);
    expect(Merchant.preview(state, plan).rows[0].quantity).toBeGreaterThan(0);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it.each(targets)('$portId 未开放时，报告不展示提前存在的线路数据且不删改账本', target => {
    const state = fresh(target), plan = planFor(target);
    const route = { key: `${plan.from}:${plan.to}:${plan.goodId}`, from: plan.from, to: plan.to, goodId: plan.goodId,
      trips: 0, quantity: 0, capacity: 0, profit: 0, cost: 0, fee: 0, travelMs: 0, capitalMs: 0, buckets: [] };
    state.merchant.analytics.routes.push(route);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    const before = structuredClone(state);
    expect(buildMerchantRouteReports(state.merchant).some(row => touches(row, target.portId))).toBe(false);
    expect(getMerchantAnalytics(state.merchant).routes.some(row => touches(row, target.portId))).toBe(false);
    expect(state).toEqual(before);
    const event = state.merchant.exploration.event;
    expect(Merchant.command(state, 'explore', { eventId: event.id, shipId: 'ship-1' }, state.merchant.lastTickAt).ok).toBe(true);
    Merchant.advance(state, event.arriveAt + event.legMs);
    expect(buildMerchantRouteReports(state.merchant).some(row => touches(row, target.portId))).toBe(true);
    expect(getMerchantAnalytics(state.merchant).routes.some(row => touches(row, target.portId))).toBe(true);
  });

  it.each(targets)('$portId 的提前展示标记不能覆盖未完成的探索状态', target => {
    const state = fresh(target), event = state.merchant.exploration.event;
    state.merchant.unlockedPorts.push(target.portId);
    const before = structuredClone(state);
    for (const status of ['available', 'exploring', 'returning']) {
      event.status = status;
      expect(getOpenPortIds(state.merchant)).not.toContain(target.portId);
      expect(Merchant.listRouteOpportunities(state).some(route => touches(route, target.portId))).toBe(false);
      expect(Merchant.preview(state, planFor(target)).reason).toContain('尚未开放');
      expect(Merchant.isMerchantGoodKnown(state.merchant, target.goodId)).toBe(false);
      expect(getPresentedSceneSystems(SYSTEMS, state).some(port => port.id === target.portId)).toBe(false);
    }
    event.status = before.merchant.exploration.event.status;
    expect(state).toEqual(before);
  });
});
