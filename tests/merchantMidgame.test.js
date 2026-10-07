import { researchChain } from './helpers/merchantResearch.js';
import { restoreLegacyMerchantAccess } from '../js/systems/merchant/MerchantTechnology.js';
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../js/data/constants.js';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_TECHS } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import * as Save from '../js/systems/save/SaveSystem.js';
import { getPresentedSceneSystems } from '../js/ui/MerchantScenePresentation.js';
import { SYSTEMS } from '../js/data/systems.js';

const start = 1_800_000_000_000;
function fresh(level = 57) {
  const state = createInitialState({ credits: 30000 });
  state.merchant.companyLevel = level; state.merchant.exploration.rngState = 42;
  restoreLegacyMerchantAccess(state.merchant);
  Merchant.init(state, start); return state;
}
const names = state => getPresentedSceneSystems(SYSTEMS, state).map(port => port.id);

function finishFirst(state) {
  Merchant.advance(state, start);
  Merchant.advance(state, state.merchant.exploration.nextEventAt);
  const event = state.merchant.exploration.event;
  expect(Merchant.command(state, 'explore', { eventId: event.id, shipId: 'ship-1' }, state.merchant.lastTickAt).ok).toBe(true);
  Merchant.advance(state, event.arriveAt + event.legMs);
  return event;
}

describe('中期原料港与探索记录', () => {
  it('57级且前置港开放后才调度第二信号，完成记录与随机期限在刷新后保留', () => {
    const lower = fresh(56); finishFirst(lower);
    lower.credits = MERCHANT_COMPANY_LEVELS[55].upgradeCost + Merchant.getTech('deep_survey').cost + 4000;
    expect(lower.merchant.exploration.nextEventAt).toBe(0);
    Merchant.advance(lower, lower.merchant.lastTickAt + 180000);
    expect(lower.merchant.exploration.event.portId).toBe('nebula_forge');
    expect(Merchant.command(lower, 'upgradeCompany', {}, lower.merchant.lastTickAt).ok).toBe(true);
    const at = lower.merchant.lastTickAt;
    expect(lower.merchant.exploration.nextPortId).toBeNull();
    lower.credits += MERCHANT_TECHS.reduce((sum, tech) => sum + tech.cost, 0);
    researchChain(lower, 'deep_survey', { at });
    expect(lower.merchant.exploration.nextPortId).toBe('aurora_depot');
    expect(lower.merchant.exploration.nextEventAt - at).toBeGreaterThanOrEqual(45000);
    expect(lower.merchant.exploration.nextEventAt - at).toBeLessThanOrEqual(90000);
    expect(Save.saveGame(1, lower).ok).toBe(true);
    const loaded = Save.loadGame(1).state;
    expect(loaded).toEqual(lower);
    const due = loaded.merchant.exploration.nextEventAt;
    Merchant.advance(loaded, due - 1);
    expect(loaded.merchant.exploration.event.status).toBe('completed');
    Merchant.advance(loaded, due);
    expect(loaded.merchant.exploration.event).toMatchObject({ portId: 'aurora_depot', status: 'available' });
    expect(loaded.merchant.exploration.completed).toHaveLength(1);
    expect(loaded.merchant.exploration.completed[0]).toMatchObject({ portId: 'nebula_forge', status: 'completed' });
    expect(Merchant.isValidMerchantState(loaded.merchant)).toBe(true);
    expect(names(loaded)).not.toContain('aurora_depot');
    expect(Merchant.isMerchantGoodKnown(loaded.merchant, 'alloys')).toBe(false);
  });

  it('第二探索途中存档与离线返港一致，占用船不参与贸易，新港返港后能实际经营', () => {
    const online = fresh(); finishFirst(online);
    Merchant.advance(online, online.merchant.exploration.nextEventAt);
    const event = online.merchant.exploration.event, at = online.merchant.lastTickAt;
    const input = { eventId: event.id, shipId: 'ship-1', from: 'nebula_forge' };
    const offer = Merchant.getExplorationPreview(online, input);
    expect(offer).toMatchObject({ ok: true, cost: 1800 });
    expect(offer.durationMs).toBe(2 * offer.legMs + 60000);
    const before = online.credits;
    expect(Merchant.command(online, 'explore', input, at).ok).toBe(true);
    expect(online.credits).toBe(before - 1800);
    expect(Merchant.command(online, 'create', { from: 'nebula_forge', to: 'sol_prime', goodId: 'technology', shipIds: ['ship-1'], budget: 260 }, at).ok).toBe(false);
    expect(Save.saveGame(2, online).ok).toBe(true);
    const offline = Save.loadGame(2).state;
    const finalAt = at + offer.durationMs;
    for (let now = at + 1000; now < finalAt; now += 1000) Merchant.advance(online, now);
    Merchant.advance(online, finalAt); Merchant.advance(offline, finalAt);
    // 补算跨度是本次运行的诊断值；相同事件轴的资产与经营账本应一致。
    const accounting = state => ({ ...state, merchant: { ...state.merchant, lastCatchupMs: 0 } });
    expect(accounting(offline)).toEqual(accounting(online));
    expect(names(online)).toContain('aurora_depot');
    expect(Merchant.isMerchantGoodKnown(online.merchant, 'alloys')).toBe(true);
    expect(online.merchant.ships[0].taskId).toBeNull();
    expect(online.merchant.exploration.completed).toHaveLength(1);
    expect(Merchant.isValidMerchantState(online.merchant)).toBe(true);
    const quote = Merchant.getShipRouteComparison(online, { from: 'aurora_depot', to: 'nebula_forge', goodId: 'alloys' });
    const hauler = Merchant.command(online, 'buyShip', { typeId: 'hauler' }, finalAt);
    expect(hauler.ok).toBe(true);
    const row = quote.find(item => item.typeId === 'hauler');
    expect(Merchant.command(online, 'create', { from: 'aurora_depot', to: 'nebula_forge', goodId: 'alloys', budget: row.capital, shipIds: hauler.shipIds }, finalAt).ok).toBe(true);
    Merchant.advance(online, finalAt + row.durationMs);
    expect(online.merchant.analytics.routes.find(route => route.goodId === 'alloys')).toMatchObject({ trips: 1, profit: row.profit, quantity: 28 });
    expect(Save.saveGame(3, online).ok).toBe(true);
    expect(Save.loadGame(3).state).toEqual(online);
  });
});
