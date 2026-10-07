import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState, createSaveMeta, SAVE_SCHEMA_VERSION } from '../js/data/constants.js';
import { MERCHANT_INTELLIGENCE } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { getPlanetIntelligence } from '../js/systems/merchant/MerchantIntelligence.js';
import * as Save from '../js/systems/save/SaveSystem.js';

const at = 1_800_000_000_000;
const firstId = 'forge_coordinates', secondId = 'aurora_coordinates';
const price = id => MERCHANT_INTELLIGENCE.find(item => item.id === id).cost;
function fresh(level = 20, credits = 12000) {
  const state = createInitialState({ credits });
  state.merchant.companyLevel = level;
  state.merchant.researchedTechIds = ['market_network'];
  state.merchant.exploration.rngState = 42;
  Merchant.init(state, at);
  return state;
}
const buy = (state, intelId = firstId) => Merchant.command(state, 'buyIntel', { intelId }, state.merchant.lastTickAt);
beforeEach(() => localStorage.clear());

describe('市场情报购买与探索', () => {
  it('预览不改资料，一次购买保存线索且不占船、不开放商路，重复购买不重复扣款', () => {
    const state = fresh(), before = structuredClone(state);
    expect(Merchant.getIntelligenceOffer(state, firstId)).toMatchObject({ ok: true, known: false, cost: price(firstId) });
    expect(state).toEqual(before);
    expect(buy(state)).toMatchObject({ ok: true, intelId: firstId });
    expect(state.credits).toBe(before.credits - price(firstId));
    expect(state.merchant.purchasedIntelIds).toEqual([firstId]);
    expect(getPlanetIntelligence(state.merchant, 'nebula_forge')?.id).toBe(firstId);
    expect(state.merchant.ships).toEqual(before.merchant.ships);
    expect(state.merchant.markets).toEqual(before.merchant.markets);
    expect(state.merchant.exploration.event).toBeNull();
    expect(Merchant.isPortOpen(state.merchant, 'nebula_forge')).toBe(false);
    const bought = structuredClone(state);
    expect(buy(state).ok).toBe(false);
    expect(state).toEqual(bought);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it.each([
    ['未知情报', state => {}, 'unknown'],
    ['市场尚未研发', state => { state.merchant.researchedTechIds = []; }, firstId],
    ['情报等级不足', state => { state.merchant.companyLevel = 49; }, secondId],
    ['现金不足', state => { state.credits = price(firstId) - 1; }, firstId],
    ['首航货本不足', state => { state.credits = price(firstId) + Merchant.getOperatingReserve(state) - 1; }, firstId],
    ['已开放的星球', state => { state.merchant.unlockedPorts.push('nebula_forge'); }, firstId],
  ])('%s 时不扣款、不产生坐标、不修改占船', (_name, configure, id) => {
    const state = fresh(); configure(state);
    const before = structuredClone(state);
    expect(Merchant.getIntelligenceOffer(state, id)?.ok || false).toBe(false);
    expect(buy(state, id).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('提前购买的情报在获得勘察资格后产生信号，全程仍等完整返港才开放商路', () => {
    const state = fresh(23); state.credits += Merchant.getTech('planet_survey').cost; expect(buy(state).ok).toBe(true);
    expect(Merchant.command(state, 'upgradeCompany', {}, at).ok).toBe(true);
    expect(state.merchant.exploration.event).toBeNull();
    expect(Merchant.command(state, 'researchTech', { techId: 'planet_survey' }, at).ok).toBe(true);
    const event = state.merchant.exploration.event;
    expect(event).toMatchObject({ status: 'available', portId: 'nebula_forge', appearedAt: at });
    const preview = Merchant.getExplorationPreview(state, { shipId: 'ship-1' });
    expect(Merchant.command(state, 'explore', { eventId: event.id, shipId: 'ship-1' }, at).ok).toBe(true);
    for (const time of [at, at + preview.legMs, at + preview.durationMs - preview.legMs, at + preview.durationMs - 1]) {
      Merchant.advance(state, time);
      expect(Merchant.getOpenPortIds(state.merchant)).not.toContain('nebula_forge');
      expect(Merchant.listRouteOpportunities(state).some(route => route.from === 'nebula_forge' || route.to === 'nebula_forge')).toBe(false);
    }
    Merchant.advance(state, at + preview.durationMs);
    expect(Merchant.isPortOpen(state.merchant, 'nebula_forge')).toBe(true);
    expect(state.merchant.ships[0].phase).toBe('idle');
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it('购买已出现信号的情报保留原事件、时钟与船只状态', () => {
    const state = fresh(24);
    state.merchant.researchedTechIds.push('planet_survey');
    Merchant.advance(state, at);
    const exploration = structuredClone(state.merchant.exploration), nextId = state.merchant.nextId;
    expect(buy(state).ok).toBe(true);
    expect(state.merchant.exploration).toEqual(exploration);
    expect(state.merchant.nextId).toBe(nextId);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it('购买远域坐标立即取代随机等待，仍只产生一项待探索事件', () => {
    const state = fresh(57);
    state.merchant.researchedTechIds.push('planet_survey', 'deep_survey');
    state.merchant.unlockedPorts.push('nebula_forge');
    Merchant.advance(state, at);
    expect(state.merchant.exploration.nextEventAt).toBeGreaterThan(at);
    expect(buy(state, secondId).ok).toBe(true);
    expect(state.merchant.exploration).toMatchObject({ nextEventAt: 0, nextPortId: null, event: { portId: 'aurora_depot', status: 'available', appearedAt: at } });
    expect(Merchant.isPortOpen(state.merchant, 'aurora_depot')).toBe(false);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it('购买下一星球坐标不替换在途探索，先返港再发布下一信号', () => {
    const state = fresh(57);
    state.merchant.researchedTechIds.push('planet_survey', 'deep_survey');
    Merchant.advance(state, at);
    const event = state.merchant.exploration.event;
    expect(Merchant.command(state, 'explore', { eventId: event.id, shipId: 'ship-1' }, at).ok).toBe(true);
    const before = structuredClone(state.merchant.exploration), ship = structuredClone(state.merchant.ships[0]);
    expect(buy(state, secondId).ok).toBe(true);
    expect(state.merchant.exploration).toEqual(before);
    expect(state.merchant.ships[0]).toEqual(ship);
    Merchant.advance(state, event.arriveAt + event.legMs);
    expect(state.merchant.exploration.completed).toHaveLength(1);
    expect(state.merchant.exploration.event).toMatchObject({ portId: 'aurora_depot', status: 'available' });
    expect(Merchant.isPortOpen(state.merchant, 'aurora_depot')).toBe(false);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it('勘察已获取的情报不再出售，返港后继续开放免费商路入口', () => {
    const state = fresh(24);
    state.merchant.researchedTechIds.push('planet_survey'); Merchant.advance(state, at);
    const event = state.merchant.exploration.event;
    Merchant.command(state, 'explore', { eventId: event.id, shipId: 'ship-1' }, at);
    Merchant.advance(state, event.arriveAt);
    expect(Merchant.getIntelligenceOffer(state, firstId)).toMatchObject({ known: true, purchased: false, opened: false, ok: false });
    const before = structuredClone(state);
    expect(buy(state).ok).toBe(false); expect(state).toEqual(before);
    Merchant.advance(state, event.arriveAt);
    expect(Merchant.getIntelligenceOffer(state, firstId)).toMatchObject({ known: true, opened: true, ok: false });
  });
});

describe('情报存档与迁移', () => {
  it('购买结果、自由现金及等待勘察资格在保存读取后不丢失', () => {
    const state = fresh(50); expect(buy(state, secondId).ok).toBe(true);
    expect(Save.saveGame(1, state).ok).toBe(true);
    const loaded = Save.loadGame(1);
    expect(loaded.ok).toBe(true); expect(loaded.state).toEqual(state);
    const before = structuredClone(loaded.state);
    expect(buy(loaded.state, secondId).ok).toBe(false); expect(loaded.state).toEqual(before);
  });

  it('v29 只补空的购买记录，保留在途贸易、资金、公司和科技，并备份原文', () => {
    const state = fresh(23);
    Merchant.command(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 220 }, at);
    const old = structuredClone(state); old.merchant.companyLevel = 5; delete old.merchant.purchasedIntelIds;
    const original = JSON.stringify({ meta: { ...createSaveMeta(0, state), schemaVersion: 29 }, data: old });
    localStorage.setItem('startrader_save_0', original);
    state.merchant.researchedTechIds.push('berth_planning');
    const loaded = Save.loadGame(0);
    expect(loaded.ok).toBe(true); expect(loaded.state).toEqual(state);
    expect(localStorage.getItem('startrader_save_before_v30_0')).toBe(original);
    expect(JSON.parse(Save.exportSave(0)).meta.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(Save.loadGame(0).state).toEqual(state);
  });

  it.each([undefined, null, {}, ['missing'], [firstId, firstId]])('损坏的购买记录 %j 不覆盖现有存档', ids => {
    const state = fresh(); Save.saveGame(1, state); const saved = Save.exportSave(1);
    const broken = structuredClone(state); broken.merchant.purchasedIntelIds = ids;
    const raw = JSON.stringify({ meta: createSaveMeta(1, broken), data: broken });
    expect(Merchant.isValidMerchantState(broken.merchant)).toBe(false);
    expect(Save.importSave(1, raw).ok).toBe(false); expect(Save.exportSave(1)).toBe(saved);
  });
});
