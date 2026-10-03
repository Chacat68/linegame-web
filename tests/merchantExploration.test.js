import { describe, expect, it } from 'vitest';
import { createInitialState } from '../js/data/constants.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';

const start = 1_800_000_000_000;
const trade = (shipIds = ['ship-1']) => ({
  from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds, budget: 220,
});

function fresh({ level = 2, credits = 1000 } = {}) {
  const state = createInitialState({ credits });
  state.merchant.companyLevel = level;
  state.merchant.exploration.rngState = 0x12345678;
  Merchant.init(state, start);
  Merchant.advance(state, start);
  return state;
}

function signal(options) {
  const state = fresh(options);
  Merchant.advance(state, state.merchant.exploration.nextEventAt);
  return state;
}

function dispatch(state, shipId = 'ship-1', from = 'sol_prime') {
  const eventId = state.merchant.exploration.event.id;
  return Merchant.command(state, 'explore', { eventId, shipId, from }, state.merchant.lastTickAt);
}

describe('真实时间新港探索', () => {
  it('二级后延迟出现唯一信号，既有随机期限不因重复推进而重抽', () => {
    const state = fresh({ level: 1, credits: 3000 });
    Merchant.advance(state, start + 120000);
    expect(state.merchant.exploration).toMatchObject({ nextEventAt: 0, event: null });
    const now = state.merchant.lastTickAt;
    expect(Merchant.command(state, 'upgradeCompany', {}, now).ok).toBe(true);
    Merchant.advance(state, now);
    const { nextEventAt, rngState } = state.merchant.exploration;
    expect(nextEventAt - now).toBeGreaterThanOrEqual(30000);
    expect(nextEventAt - now).toBeLessThanOrEqual(90000);
    const sequence = state.merchant.nextId;
    Merchant.advance(state, nextEventAt - 1);
    expect(state.merchant.exploration).toEqual({ rngState, nextEventAt, event: null });
    Merchant.advance(state, nextEventAt);
    const event = structuredClone(state.merchant.exploration.event);
    expect(event).toMatchObject({ status: 'available', portId: 'nebula_forge', appearedAt: nextEventAt, shipId: null });
    expect(state.merchant.nextId).toBe(sequence + 1);
    expect(state.merchant.unlockedPorts).not.toContain('nebula_forge');
    Merchant.advance(state, nextEventAt + 180000);
    expect(state.merchant.exploration).toEqual({ rngState, nextEventAt: 0, event });
    expect(state.merchant.nextId).toBe(sequence + 1);
    const before = structuredClone(state);
    expect(Merchant.command(state, 'unlockPort', {}, state.merchant.lastTickAt).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('探索只扣自由现金，费用与首航储备边界、错误信号和出发港均原子拒绝', () => {
    const state = signal();
    const eventId = state.merchant.exploration.event.id;
    const now = state.merchant.lastTickAt;
    const input = { eventId, shipId: 'ship-1', from: 'sol_prime' };
    for (const change of [
      () => { state.merchant.companyLevel = 1; },
      () => { state.credits = 359; },
      () => { state.credits = 433; },
    ]) {
      state.merchant.companyLevel = 2; state.credits = 1000; change();
      const before = structuredClone(state);
      expect(Merchant.getExplorationPreview(state, input).ok).toBe(false);
      expect(Merchant.command(state, 'explore', input, now).ok).toBe(false);
      expect(state).toEqual(before);
    }
    state.merchant.companyLevel = 2; state.credits = 434;
    for (const invalid of [{ ...input, eventId: 'event-999' }, { ...input, shipId: 'missing' }, { ...input, from: 'nebula_forge' }]) {
      const before = structuredClone(state);
      expect(Merchant.command(state, 'explore', invalid, now).ok).toBe(false);
      expect(state).toEqual(before);
    }
    const offer = Merchant.getExplorationPreview(state, input);
    expect(offer).toMatchObject({ ok: true, cost: 360 });
    expect(offer.durationMs).toBe(2 * offer.legMs + 30000);
    const ships = state.merchant.ships.length;
    expect(Merchant.command(state, 'explore', input, now).ok).toBe(true);
    expect(state.credits).toBe(74);
    expect(state.merchant.ships).toHaveLength(ships);
    const underway = structuredClone(state);
    expect(Merchant.command(state, 'explore', input, now).ok).toBe(false);
    expect(state).toEqual(underway);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it('去程与勘察不提前开港，完整返港仅解锁港口而不赠资金或飞船', () => {
    for (const from of ['sol_prime', 'mineral_belt']) {
      const state = signal();
      const beganAt = state.merchant.lastTickAt;
      const markets = structuredClone(state.merchant.markets);
      const offer = Merchant.getExplorationPreview(state, { shipId: 'ship-1', from });
      expect(offer.legMs).toBe(Merchant.legDuration('courier', from, 'nebula_forge'));
      expect(dispatch(state, 'ship-1', from).ok).toBe(true);
      const event = state.merchant.exploration.event;
      const returningAt = beganAt + offer.legMs + 30000;
      const completedAt = beganAt + offer.durationMs;
      expect(state.credits).toBe(640);
      expect(state.merchant.ships[0]).toMatchObject({ taskId: event.id, phase: 'exploring', trip: null, arriveAt: returningAt });
      expect(state.merchant.markets).toEqual(markets);
      Merchant.advance(state, returningAt - 1);
      expect(event.status).toBe('exploring');
      expect(state.merchant.unlockedPorts).not.toContain('nebula_forge');
      Merchant.advance(state, returningAt);
      expect(event).toMatchObject({ status: 'returning', arriveAt: completedAt, completedAt: 0 });
      expect(state.merchant.ships[0]).toMatchObject({ phase: 'explore_return', departAt: returningAt, arriveAt: completedAt, trip: null });
      expect(state.merchant.unlockedPorts).not.toContain('nebula_forge');
      expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
      Merchant.advance(state, completedAt - 1);
      expect(state.merchant.unlockedPorts).not.toContain('nebula_forge');
      Merchant.advance(state, completedAt);
      expect(event).toMatchObject({ status: 'completed', completedAt });
      expect(state.merchant.unlockedPorts).toEqual(['sol_prime', 'mineral_belt', 'nebula_forge']);
      expect(state.merchant.ships).toHaveLength(1);
      expect(state.merchant.ships[0]).toMatchObject({ taskId: null, phase: 'idle', trip: null });
      expect(state.credits).toBe(640);
      expect(Merchant.getMerchantSummary(state)).toMatchObject({ totalProfit: 0, activeShips: 0, budget: 0, committed: 0 });
      expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
      const before = structuredClone(state);
      expect(dispatch(state, 'ship-1', from).ok).toBe(false);
      expect(state).toEqual(before);
      Merchant.advance(state, completedAt + 180000);
      expect(state.credits).toBe(640);
      expect(state.merchant.exploration.event).toEqual(before.merchant.exploration.event);
      expect(state.merchant.unlockedPorts.filter(id => id === 'nebula_forge')).toHaveLength(1);
    }
  });

  it('经营与待调整预留船不能参加探索，探索船也不能再次分配给经营', () => {
    const state = signal({ credits: 3000 });
    const now = state.merchant.lastTickAt;
    const bought = Merchant.command(state, 'buyShip', { typeId: 'courier' }, now);
    expect(bought.ok).toBe(true);
    const reserveShipId = bought.shipIds[0];
    const { taskId } = Merchant.command(state, 'create', trade(), now);
    expect(Merchant.command(state, 'update', { ...trade(['ship-1', reserveShipId]), taskId }, now).ok).toBe(true);
    for (const shipId of ['ship-1', reserveShipId]) {
      const before = structuredClone(state);
      expect(Merchant.getExplorationPreview(state, { shipId }).ok).toBe(false);
      expect(dispatch(state, shipId).ok).toBe(false);
      expect(state).toEqual(before);
    }
    expect(Merchant.command(state, 'stop', { taskId }, now).ok).toBe(true);
    const cash = state.credits, committed = structuredClone(state.merchant.tasks);
    expect(dispatch(state, reserveShipId).ok).toBe(true);
    expect(state.credits).toBe(cash - 360);
    expect(state.merchant.tasks).toEqual(committed);
    const before = structuredClone(state);
    expect(Merchant.command(state, 'create', trade([reserveShipId]), now).ok).toBe(false);
    expect(state).toEqual(before);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);

    const live = signal({ credits: 3000 });
    const liveAt = live.merchant.lastTickAt;
    const purchased = Merchant.command(live, 'buyShip', { typeId: 'courier' }, liveAt);
    expect(purchased.ok).toBe(true);
    const exploreShipId = purchased.shipIds[0];
    expect(dispatch(live, exploreShipId).ok).toBe(true);
    const created = Merchant.command(live, 'create', trade(), liveAt);
    expect(created.ok).toBe(true);
    const isolated = structuredClone(live);
    expect(Merchant.command(live, 'update', { ...trade(['ship-1', exploreShipId]), taskId: created.taskId }, liveAt).ok).toBe(false);
    expect(live).toEqual(isolated);
    expect(Merchant.isValidMerchantState(live.merchant)).toBe(true);
  });

  it('逐秒在线与一次离线出现和完成同一事件，重复补算不重复开港', () => {
    const online = fresh(), offline = structuredClone(online);
    const signalAt = online.merchant.exploration.nextEventAt;
    for (let at = start + 1000; at < signalAt; at += 1000) Merchant.advance(online, at);
    Merchant.advance(online, signalAt);
    Merchant.advance(offline, signalAt);
    expect(offline.merchant.exploration).toEqual(online.merchant.exploration);
    expect(dispatch(online).ok).toBe(true);
    expect(dispatch(offline).ok).toBe(true);
    // 出航后预览不可接受新派遣，以已经锁定的航程计算最终返港时刻。
    const finalAt = online.merchant.exploration.event.arriveAt + online.merchant.exploration.event.legMs;
    for (let at = signalAt + 1000; at < finalAt; at += 1000) Merchant.advance(online, at);
    Merchant.advance(online, finalAt);
    Merchant.advance(offline, finalAt);
    expect(offline.merchant.exploration).toEqual(online.merchant.exploration);
    expect(offline.merchant.ships).toEqual(online.merchant.ships);
    expect(offline.merchant.unlockedPorts).toEqual(online.merchant.unlockedPorts);
    expect(offline.merchant.markets).toEqual(online.merchant.markets);
    expect(offline.credits).toBe(640);
    expect(online.credits).toBe(640);
    expect(Merchant.isValidMerchantState(offline.merchant)).toBe(true);
    const finished = structuredClone(offline);
    Merchant.advance(offline, finalAt);
    expect(offline.credits).toBe(finished.credits);
    expect(offline.merchant.exploration).toEqual(finished.merchant.exploration);
    expect(offline.merchant.ships).toEqual(finished.merchant.ships);
  });
});
