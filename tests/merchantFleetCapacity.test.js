import { beforeEach, describe, expect, it } from 'vitest';
import { researchChain } from './helpers/merchantResearch.js';
import { createInitialState, createSaveMeta, SAVE_SCHEMA_VERSION } from '../js/data/constants.js';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_18_LEVEL_MAP, MERCHANT_TECHS } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import * as Save from '../js/systems/save/SaveSystem.js';

const start = 1_800_000_000_000;
const fullLimits = [1, 2, 3, 3, 3, 5, 7, 7, 11, 15, 15, 19, 23, 23, 29, 33, 39, 45];
const baseLimits = [1, 1, 2, 2, 2, 3, 4, 4, 7, 9, 9, 12, 15, 15, 19, 22, 26, 30];
const expansions = MERCHANT_TECHS.filter(tech => tech.shipSlotBonus);
const fresh = (level = 1, credits = MERCHANT_COMPANY_LEVELS.reduce((sum, stage) => sum + (stage.upgradeCost ?? 0), 0)
  + MERCHANT_TECHS.reduce((sum, tech) => sum + tech.cost, 0) + 10_000) => {
  const state = createInitialState({ credits }); Merchant.init(state, start);
  state.merchant.companyLevel = level; return state;
};
const act = (state, action, input = {}) => Merchant.command(state,
  action === 'upgradeCompany' ? Merchant.getCompanyProgress(state.merchant).action : action, input, start);
const rawSave = (state, version) => JSON.stringify({ meta: { ...createSaveMeta(0, state), schemaVersion: version }, data: state });
beforeEach(() => localStorage.clear());

describe('公司基础船位与扩容研发', () => {
  it('升级只增加基础船位，全部扩容研发逐项扣费后恢复各阶段的最大规模', () => {
    const state = fresh();
    expect(expansions).toHaveLength(11);
    let totalBonus = 0, previousBase = 1;
    for (const [index, stage] of MERCHANT_COMPANY_LEVELS.entries()) {
      if (stage.level > 1) expect(act(state, 'upgradeCompany').ok).toBe(true);
      expect(Merchant.getCompanyProgress(state.merchant)).toMatchObject({ baseShipLimit: stage.shipLimit, researchShipSlots: totalBonus, shipLimit: stage.shipLimit + totalBonus });
      for (const tech of expansions.filter(item => item.companyLevel === stage.level)) {
        expect([1, 2]).toContain(tech.shipSlotBonus);
        researchChain(state, tech.id, { includeTarget: false });
        const bonuses = Merchant.getTechBonuses(state.merchant);
        const cash = state.credits, ships = structuredClone(state.merchant.ships);
        expect(act(state, 'researchTech', { techId: tech.id }).ok).toBe(true);
        totalBonus += tech.shipSlotBonus;
        expect(state.credits).toBe(cash - tech.cost);
        expect(state.merchant.ships).toEqual(ships);
        expect(Merchant.getTechBonuses(state.merchant)).toEqual(bonuses);
        const completed = structuredClone(state);
        expect(act(state, 'researchTech', { techId: tech.id }).ok).toBe(false);
        expect(state).toEqual(completed);
      }
      expect(Merchant.getCompanyProgress(state.merchant)).toMatchObject({ shipLimit: stage.shipLimit + totalBonus, researchShipSlots: totalBonus, remaining: stage.shipLimit + totalBonus - 1 });
      expect(stage.shipLimit).toBeGreaterThanOrEqual(previousBase);
      previousBase = stage.shipLimit;
      const anchor = Object.values(MERCHANT_18_LEVEL_MAP).indexOf(stage.level);
      if (anchor >= 0) expect(stage.shipLimit).toBe(baseLimits[anchor]);
      if (index < 99) expect(Merchant.getCompanyProgress(state.merchant).nextShipLimit).toBe(MERCHANT_COMPANY_LEVELS[index + 1].shipLimit + totalBonus);
    }
    expect(totalBonus).toBe(15);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it('船位满时升级不提前获得研发船位，扩容后允许采购且不改动在途航次与货本', () => {
    const state = fresh();
    expect(act(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 }).ok).toBe(true);
    const ship = structuredClone(state.merchant.ships[0]), task = structuredClone(state.merchant.tasks[0]);
    expect(act(state, 'upgradeCompany').ok).toBe(true);
    expect(Merchant.getCompanyProgress(state.merchant)).toMatchObject({ level: 2, shipLimit: 1, remaining: 0 });
    const full = structuredClone(state);
    expect(act(state, 'buyShip', { typeId: 'courier' })).toMatchObject({ ok: false, msg: expect.stringContaining('研发船队扩容') });
    expect(state).toEqual(full);
    while (state.merchant.companyLevel < 9) expect(act(state, 'upgradeCompany').ok).toBe(true);
    researchChain(state, 'berth_planning');
    expect(Merchant.getCompanyProgress(state.merchant)).toMatchObject({ shipLimit: 2, remaining: 1, nextShipLimit: 2 });
    expect(state.merchant.ships).toHaveLength(1);
    expect(act(state, 'buyShip', { typeId: 'courier' }).ok).toBe(true);
    expect(state.merchant.ships).toHaveLength(2);
    expect(Merchant.getCompanyProgress(state.merchant).remaining).toBe(0);
    expect(state.merchant.ships[0]).toEqual(ship);
    expect(state.merchant.tasks[0]).toEqual(task);
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it('扩容仍检查等级、前置与首航货本，失败完整保留状态', () => {
    const state = fresh(1);
    for (const techId of ['berth_planning', 'parallel_docks']) {
      const before = structuredClone(state); expect(act(state, 'researchTech', { techId }).ok).toBe(false); expect(state).toEqual(before);
    }
    state.merchant.companyLevel = 51;
    const noPrerequisite = structuredClone(state);
    expect(act(state, 'researchTech', { techId: 'parallel_docks' }).ok).toBe(false); expect(state).toEqual(noPrerequisite);
    researchChain(state, 'berth_planning', { includeTarget: false });
    state.credits = Merchant.getTech('berth_planning').cost + 73;
    const insufficient = structuredClone(state);
    expect(act(state, 'researchTech', { techId: 'berth_planning' })).toMatchObject({ ok: false, msg: expect.stringContaining('首航货本') });
    expect(state).toEqual(insufficient);
    state.credits = Merchant.getTech('berth_planning').cost + 74;
    researchChain(state, 'berth_planning');
    expect(state.credits).toBe(74);
    expect(Merchant.getCompanyProgress(state.merchant)).toMatchObject({ baseShipLimit: 9, researchShipSlots: 1, shipLimit: 10 });
  });

  it('新存档只恢复实际研发船位，满级未研发只有 30 个船位', () => {
    const state = fresh(100);
    expect(Merchant.getCompanyProgress(state.merchant).shipLimit).toBe(30);
    expect(Save.saveGame(0, state).ok).toBe(true);
    expect(Save.loadGame(0).state).toEqual(state);
    researchChain(state, 'berth_planning');
    expect(Save.saveGame(0, state).ok).toBe(true);
    const loaded = Save.loadGame(0);
    expect(loaded.state).toEqual(state);
    expect(Merchant.getCompanyProgress(loaded.state.merchant)).toMatchObject({ baseShipLimit: 30, researchShipSlots: 1, shipLimit: 31 });
  });
});

describe('旧档船位迁移', () => {
  it.each(Object.entries(MERCHANT_18_LEVEL_MAP).map(([old, current]) => [Number(old), current]))('v32 Lv.%i 映射到 Lv.%i，保留实际已研发科技且不补发资金或扩容', (oldLevel, currentLevel) => {
    const state = fresh(currentLevel, 12345);
    const ids = MERCHANT_TECHS.filter(tech => tech.legacyCompanyLevel <= oldLevel && (!tech.snapshotRequires.length || tech.speedBonus));
    state.merchant.researchedTechIds = ids.map(tech => tech.id);
    expect(act(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 }).ok).toBe(true);
    const legacy = { ...state, merchant: { ...state.merchant, companyLevel: oldLevel } };
    const raw = rawSave(legacy, 32); localStorage.setItem('startrader_save_0', raw);
    const loaded = Save.loadGame(0); expect(loaded.ok, loaded.msg).toBe(true);
    expect(loaded.state).toEqual(state);
    expect(localStorage.getItem('startrader_save_before_v33_0')).toBe(raw);
    expect(JSON.parse(Save.exportSave(0)).meta.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(Save.loadGame(0).state).toEqual(state);
  });

  it('v32 旧档映射等级后保留超额船只，原任务继续结算并可再次保存', () => {
    const state = fresh(1, 1000);
    state.merchant.ships.push({ ...structuredClone(state.merchant.ships[0]), id: 'ship-2' });
    state.merchant.nextId = 3;
    expect(act(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1', 'ship-2'], budget: 252 }).ok).toBe(true);
    const raw = rawSave(state, 32);
    localStorage.setItem('startrader_save_0', raw);
    const loaded = Save.loadGame(0);
    expect(loaded.ok, loaded.msg).toBe(true);
    expect(loaded.state).toEqual({ ...state, merchant: { ...state.merchant, companyLevel: 4 } });
    expect(localStorage.getItem('startrader_save_before_v33_0')).toBe(raw);
    expect(loaded.state.merchant.researchedTechIds).toEqual([]);
    expect(Merchant.getCompanyProgress(loaded.state.merchant)).toMatchObject({ ownedShips: 2, shipLimit: 1, remaining: 0 });
    const before = structuredClone(loaded.state);
    expect(act(loaded.state, 'buyShip', { typeId: 'courier' }).ok).toBe(false);
    expect(loaded.state).toEqual(before);
    Merchant.advance(loaded.state, start + 2 * state.merchant.ships[0].trip.legMs);
    expect(loaded.state.credits).toBe(832);
    expect(loaded.state.merchant.tasks[0]).toMatchObject({ budget: 252, profit: 84 });
    expect(loaded.state.merchant.ships).toHaveLength(2);
    expect(Save.saveGame(0, loaded.state).ok).toBe(true);
    expect(Save.loadGame(0).state).toEqual(loaded.state);
  });

  it.each(fullLimits.map((limit, index) => [index + 1, limit]))('v31 Lv.%i 保留已完成扩容并使用当前 %i 个船位上限，备份原档且只迁移一次', (level, limit) => {
    const state = fresh(level), raw = rawSave(state, 31);
    localStorage.setItem('startrader_save_0', raw);
    const loaded = Save.loadGame(0); expect(loaded.ok, loaded.msg).toBe(true);
    expect(loaded.state.credits).toBe(state.credits);
    expect(loaded.state.merchant.companyLevel).toBe(MERCHANT_18_LEVEL_MAP[level]);
    expect(loaded.state.merchant.ships).toEqual(state.merchant.ships);
    expect(loaded.state.merchant.researchedTechIds).toEqual(expansions.filter(tech => tech.legacyCompanyLevel <= level).map(tech => tech.id));
    expect(Merchant.getCompanyProgress(loaded.state.merchant)).toMatchObject({ shipLimit: limit, baseShipLimit: baseLimits[level - 1], researchShipSlots: limit - baseLimits[level - 1] });
    expect(localStorage.getItem('startrader_save_before_v32_0')).toBe(raw);
    expect(JSON.parse(Save.exportSave(0)).meta.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(Save.loadGame(0).state).toEqual(loaded.state);
    expect(localStorage.getItem('startrader_save_before_v32_0')).toBe(raw);
  });

  it('旧档满额船队与在途快照保留，离线结算正常且超额采购被拒绝', () => {
    const state = fresh(100), template = structuredClone(state.merchant.ships[0]);
    state.merchant.ships = Array.from({ length: 48 }, (_, index) => ({ ...structuredClone(template), id: `ship-${index + 1}` }));
    state.merchant.nextId = 49;
    expect(act(state, 'researchTech', { techId: 'efficient_engines' }).ok).toBe(true);
    expect(act(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 }).ok).toBe(true);
    localStorage.setItem('startrader_save_0', rawSave({ ...state, merchant: { ...state.merchant, companyLevel: 18 } }, 31));
    const loaded = Save.loadGame(0); expect(loaded.ok, loaded.msg).toBe(true);
    expect(loaded.state.merchant.ships).toEqual(state.merchant.ships);
    expect(loaded.state.merchant.tasks).toEqual(state.merchant.tasks);
    expect(Merchant.getCompanyProgress(loaded.state.merchant)).toMatchObject({ shipLimit: 45, remaining: 0 });
    const before = structuredClone(loaded.state);
    expect(act(loaded.state, 'buyShip', { typeId: 'courier' }).ok).toBe(false); expect(loaded.state).toEqual(before);
    const returnedAt = start + 2 * state.merchant.ships[0].trip.legMs;
    Merchant.advance(state, returnedAt); Merchant.advance(loaded.state, returnedAt);
    expect(loaded.state.credits).toBe(state.credits);
    expect(loaded.state.merchant.tasks).toEqual(state.merchant.tasks);
    expect(Merchant.isValidMerchantState(loaded.state.merchant)).toBe(true);
  });
});
