import { describe, expect, it } from 'vitest';
import { createInitialState } from '../js/data/constants.js';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_TECHS, isMerchantViewUnlocked } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';

const start = 1_800_000_000_000;
const fresh = () => { const state = createInitialState(); Merchant.init(state, start); return state; };
const act = (state, action, input = {}) => Merchant.command(state,
  action === 'advanceCompany' ? Merchant.getCompanyProgress(state.merchant).action : action, input, start);

describe('百级公司成长与五级突破', () => {
  it('初始资金与首航收益不足以购买第一级升级，必须先经营积累', () => {
    const state = fresh();
    const cost = Merchant.getCompanyProgress(state.merchant).upgradeCost;
    expect(cost).toBeGreaterThan(state.credits);
    const initial = structuredClone(state);
    expect(act(state, 'upgradeCompany').ok).toBe(false);
    expect(state).toEqual(initial);
    act(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 });
    Merchant.advance(state, start + 18_000);
    expect(state.merchant.tasks[0].rounds).toBe(1);
    expect(state.credits).toBeLessThan(cost);
    const afterTrade = structuredClone(state);
    expect(Merchant.command(state, 'upgradeCompany', {}, state.merchant.lastTickAt).ok).toBe(false);
    expect(state).toEqual(afterTrade);
  });

  it('升级只开放基础船型的研发资格，完成研发后可采购，旧船与在途货本保持原样', () => {
    const state = fresh(); state.credits = 100_000;
    expect(act(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 }).ok).toBe(true);
    const task = structuredClone(state.merchant.tasks[0]);
    const trip = structuredClone(state.merchant.ships[0].trip);
    for (const [typeId, techId, level] of [['clipper', 'clipper_design', 9], ['hauler', 'hauler_design', 13]]) {
      const before = structuredClone(state);
      expect(act(state, 'researchTech', { techId }).ok).toBe(false);
      expect(act(state, 'buyShip', { typeId }).ok).toBe(false);
      expect(state).toEqual(before);
      while (state.merchant.companyLevel < level) expect(act(state, 'advanceCompany').ok).toBe(true);
      expect(Merchant.isShipTypeUnlocked(state.merchant, typeId)).toBe(false);
      expect(act(state, 'buyShip', { typeId }).ok).toBe(false);
      expect(act(state, 'researchTech', { techId }).ok).toBe(true);
      if (typeId === 'clipper') expect(act(state, 'researchTech', { techId: 'berth_planning' }).ok).toBe(true);
      expect(act(state, 'buyShip', { typeId }).ok).toBe(true);
    }
    expect(state.merchant.tasks[0]).toEqual(task);
    expect(state.merchant.ships[0].trip).toEqual(trip);
  });

  it('二级先开放船位与探索，六种小幅科技贯穿100级且总效果不膨胀', () => {
    const state = fresh(); state.credits = MERCHANT_COMPANY_LEVELS.reduce((sum, stage) => sum + (stage.upgradeCost ?? 0), 0)
      + MERCHANT_TECHS.reduce((sum, tech) => sum + tech.cost, 0) + 1000;
    expect(MERCHANT_TECHS).toHaveLength(65);
    expect(MERCHANT_TECHS.reduce((sum, tech) => sum + tech.cost, 0)).toBe(9_370_700);
    expect(MERCHANT_TECHS.filter(tech => tech.companyLevel === 2).map(tech => tech.id)).toEqual(['berth_planning', 'planet_survey']);
    for (let tier = 1; tier <= 20; tier++) {
      const options = MERCHANT_TECHS.filter(tech => tech.companyLevel > (tier - 1) * 5 && tech.companyLevel <= tier * 5);
      expect(options.length).toBeGreaterThanOrEqual(2);
      expect(options.length).toBeLessThanOrEqual(5);
      for (const tech of options) for (const field of ['speedBonus', 'capacityBonus', 'profitBonus']) {
        if (tech[field]) expect(tech[field]).toBeLessThanOrEqual(0.04);
      }
    }
    expect(new Set(MERCHANT_TECHS.map(tech => tech.category))).toEqual(new Set(['航速', '载量', '收益', '功能', '航运科技', '船队扩容']));
    for (const tech of MERCHANT_TECHS) {
      if (tech.companyLevel > state.merchant.companyLevel) {
        const before = structuredClone(state);
        expect(act(state, 'researchTech', { techId: tech.id }).ok).toBe(false);
        expect(state).toEqual(before);
        while (state.merchant.companyLevel < tech.companyLevel) expect(act(state, 'advanceCompany').ok).toBe(true);
      }
      expect(state.merchant.companyLevel).toBe(tech.companyLevel);
      expect(state.merchant.researchedTechIds).not.toContain(tech.id);
      if (tech.unlockShipId) expect(Merchant.isShipTypeUnlocked(state.merchant, tech.unlockShipId)).toBe(false);
      if (['ships', 'market'].includes(tech.unlockFeature)) expect(isMerchantViewUnlocked(state.merchant, tech.unlockFeature)).toBe(false);
      if (tech.id === 'planet_survey') expect(state.merchant.exploration.event).toBeNull();
      const cash = state.credits;
      expect(act(state, 'researchTech', { techId: tech.id }).ok).toBe(true);
      expect(state.credits).toBe(cash - tech.cost);
      if (tech.unlockShipId) expect(Merchant.isShipTypeUnlocked(state.merchant, tech.unlockShipId)).toBe(true);
      if (['ships', 'market'].includes(tech.unlockFeature)) expect(isMerchantViewUnlocked(state.merchant, tech.unlockFeature)).toBe(true);
      if (tech.id === 'planet_survey') expect(state.merchant.exploration.event).toMatchObject({ status: 'available', portId: 'nebula_forge' });
      const completed = structuredClone(state);
      expect(act(state, 'researchTech', { techId: tech.id }).ok).toBe(false);
      expect(state).toEqual(completed);
      expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    }
    const bonuses = Merchant.getTechBonuses(state.merchant);
    expect(bonuses.speed).toBeCloseTo(0.30);
    expect(bonuses.capacity).toBeCloseTo(0.45);
    expect(bonuses.profit).toBeCloseTo(0.30);
    expect(state.merchant.unlockedPorts).toEqual(['sol_prime', 'mineral_belt']);
    expect(state.merchant.ships).toHaveLength(1);
    expect(state.merchant.tasks).toHaveLength(0);
    expect(Merchant.getCompanyProgress(state.merchant)).toMatchObject({ level: 100, shipLimit: 45, upgradeCost: null, nextLevel: null, totalLevels: 100, tier: 20 });
  });

  it('普通费用梯度不下降，升级与突破资金不足时不越级或扣款并保留首航货本', () => {
    const state = fresh();
    let paid = 0;
    for (const stage of MERCHANT_COMPANY_LEVELS.slice(0, -1)) {
      expect(stage.ordinaryUpgradeCost).toBeGreaterThanOrEqual(MERCHANT_COMPANY_LEVELS[stage.level - 2]?.ordinaryUpgradeCost ?? 0);
      const reserve = Merchant.getOperatingReserve(state);
      state.credits = stage.upgradeCost + reserve - 1;
      expect(act(state, 'advanceCompany').ok).toBe(false);
      expect(state.credits).toBe(stage.upgradeCost + reserve - 1);
      expect(state.merchant.companyLevel).toBe(stage.level);
      state.credits = stage.upgradeCost + reserve;
      expect(act(state, 'advanceCompany').ok).toBe(true);
      expect(state.credits).toBe(reserve);
      paid += stage.upgradeCost;
    }
    expect(paid).toBe(16_738_900);
    expect(act(state, 'upgradeCompany').ok).toBe(false);
    expect(act(state, 'breakthroughCompany').ok).toBe(false);
    expect(state.merchant.companyLevel).toBe(100);
  });

  it('充足现金时每次指令也只提升一级并只收取该级费用', () => {
    const state = fresh(); state.credits = MERCHANT_COMPANY_LEVELS.reduce((sum, stage) => sum + (stage.upgradeCost ?? 0), 0) + 1000;
    for (const stage of MERCHANT_COMPANY_LEVELS.slice(0, -1)) {
      const cash = state.credits;
      expect(act(state, 'advanceCompany', { fromLevel: stage.level, targetLevel: stage.level + 1 }).ok).toBe(true);
      expect(state.merchant.companyLevel).toBe(stage.level + 1);
      expect(state.credits).toBe(cash - stage.upgradeCost);
      expect(state.merchant.researchedTechIds).toEqual([]);
      expect(state.merchant.ships).toHaveLength(1);
      expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    }
  });

  it('拒绝跳到最高级、批量升级与旧等级重复提交，不多扣现金或改动航次', () => {
    const state = fresh(); state.credits = 1_000_000;
    act(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 });
    for (const input of [{ fromLevel: 1, targetLevel: 100 }, { quantity: 99 }, { targetLevel: '2' }, { fromLevel: null }]) {
      const before = structuredClone(state);
      expect(act(state, 'upgradeCompany', input).ok).toBe(false);
      expect(state).toEqual(before);
    }
    const input = { fromLevel: 1, targetLevel: 2 };
    expect(act(state, 'upgradeCompany', input).ok).toBe(true);
    const upgraded = structuredClone(state);
    expect(act(state, 'upgradeCompany', input)).toMatchObject({ ok: false, msg: expect.stringContaining('等级已变化') });
    expect(state).toEqual(upgraded);
    expect(act(state, 'upgradeCompany', { fromLevel: 2, targetLevel: 3 }).ok).toBe(true);
    expect(state.merchant.companyLevel).toBe(3);
    expect(state.merchant.tasks).toEqual(upgraded.merchant.tasks);
    expect(state.merchant.ships).toEqual(upgraded.merchant.ships);
  });

  it.each(Array.from({ length: 19 }, (_, index) => [(index + 1) * 5, 2 + index * 0.5]))('Lv.%i 必须突破且费用为进入该级的费用 × %s，重复提交不扣款', (level, factor) => {
    const state = fresh(); state.merchant.companyLevel = level; state.credits = 3_000_000;
    expect(act(state, 'create', { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 }).ok).toBe(true);
    const company = Merchant.getCompanyProgress(state.merchant);
    const incomingCost = MERCHANT_COMPANY_LEVELS[level - 2].upgradeCost;
    expect(company).toMatchObject({ tier: level / 5, tierStartLevel: level - 4, tierEndLevel: level,
      isBreakthrough: true, breakthroughBaseCost: incomingCost, breakthroughFactor: factor, upgradeCost: incomingCost * factor });
    const before = structuredClone(state);
    expect(act(state, 'upgradeCompany', { fromLevel: level, targetLevel: level + 1 }).ok).toBe(false);
    expect(state).toEqual(before);
    const input = { fromLevel: level, targetLevel: level + 1 };
    expect(act(state, 'breakthroughCompany', input).ok).toBe(true);
    expect(state.credits).toBe(before.credits - incomingCost * factor);
    expect(state.merchant.tasks).toEqual(before.merchant.tasks);
    expect(state.merchant.ships).toEqual(before.merchant.ships);
    expect(Merchant.getCompanyProgress(state.merchant)).toMatchObject({ level: level + 1, tier: level / 5 + 1,
      tierStartLevel: level + 1, tierEndLevel: level + 5, isBreakthrough: false });
    const after = structuredClone(state);
    expect(act(state, 'breakthroughCompany', input).ok).toBe(false);
    expect(state).toEqual(after);
  });

  it('普通等级不能提前突破，首个和末个突破价格明确且不会直接跳阶', () => {
    const state = fresh(); state.credits = 3_000_000;
    const before = structuredClone(state);
    expect(act(state, 'breakthroughCompany').ok).toBe(false);
    expect(state).toEqual(before);
    expect(MERCHANT_COMPANY_LEVELS[4].upgradeCost).toBe(4200);
    expect(MERCHANT_COMPANY_LEVELS[9].upgradeCost).toBe(8250);
    expect(MERCHANT_COMPANY_LEVELS[94].upgradeCost).toBe(1_951_400);
    state.merchant.companyLevel = 5;
    const gate = structuredClone(state);
    expect(act(state, 'breakthroughCompany', { fromLevel: 5, targetLevel: 11 }).ok).toBe(false);
    expect(state).toEqual(gate);
  });
});
