import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../js/data/constants.js';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_TECHS, getMerchantTechPricing } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import * as Save from '../js/systems/save/SaveSystem.js';

const start = 1_800_000_000_000;
beforeEach(() => localStorage.clear());

describe('科研按满编公司成长价格与阶段系数定价', () => {
  it.each([
    ['efficient_engines', 500], ['berth_planning', 2500], ['planet_survey', 19800],
    ['fast_navigation', 128200], ['bulk_logistics', 336000], ['integrated_freight', 1305000],
    ['alliance_berths', 624500],
  ])('%s 的所属阶段报价为 %i CR', (id, cost) => {
    expect(Merchant.getTech(id).cost).toBe(cost);
  });

  it('突破关卡的科技使用普通费用，避免重复放大突破金额；满级仍保留研发基数', () => {
    expect(MERCHANT_COMPANY_LEVELS[34].upgradeCost).toBe(142000);
    expect(getMerchantTechPricing(Merchant.getTech('fast_navigation'))).toEqual({
      baseCost: 29300, factor: 5, weightPercent: 50, coreFactor: 1.75, cost: 128200,
    });
    expect(MERCHANT_COMPANY_LEVELS[99].upgradeCost).toBeNull();
    expect(getMerchantTechPricing(Merchant.getTech('alliance_berths'))).toEqual({
      baseCost: 181000, factor: 11.5, weightPercent: 30, coreFactor: 1, cost: 624500,
    });
  });

  it('同一阶段按效果大小计价，航速、载量和收益的相同增幅价格一致', () => {
    for (const key of ['speedBonus', 'capacityBonus', 'profitBonus']) {
      expect(getMerchantTechPricing({ companyLevel: 100, [key]: 0.02 }).cost).toBe(208200);
      expect(getMerchantTechPricing({ companyLevel: 100, [key]: 0.04 }).cost).toBe(416300);
    }
    expect(getMerchantTechPricing({ companyLevel: 100, shipSlotBonus: 1 }).cost).toBe(312300);
    expect(getMerchantTechPricing({ companyLevel: 100, shipSlotBonus: 2 }).cost).toBe(624500);
  });

  it('真实支付全部65项费用后总效果和船位保持不变，余额与存档闭合且不会再次收费', () => {
    const budget = MERCHANT_TECHS.reduce((sum, tech) => sum + tech.cost, 0);
    const state = createInitialState({ credits: budget + 1000 });
    Merchant.init(state, start); state.merchant.companyLevel = 100;
    for (const tech of MERCHANT_TECHS) {
      const before = state.credits;
      expect(Merchant.command(state, 'researchTech', { techId: tech.id }, start).ok).toBe(true);
      expect(state.credits).toBe(before - tech.cost);
    }
    expect(state.credits).toBe(1000);
    expect(Merchant.getTechBonuses(state.merchant)).toEqual({ speed: 0.30, capacity: 0.45, profit: 0.30 });
    expect(Merchant.getCompanyProgress(state.merchant).shipLimit).toBe(45);
    expect(Save.saveGame(0, state).ok).toBe(true);
    const loaded = Save.loadGame(0).state;
    expect(loaded).toEqual(state);
    for (const tech of MERCHANT_TECHS) expect(Merchant.command(loaded, 'researchTech', { techId: tech.id }, start).ok).toBe(false);
    expect(loaded).toEqual(state);
  });

  it('推迟到更高公司等级研究基础科技仍支付原所属等级的报价', () => {
    const state = createInitialState({ credits: 574 });
    Merchant.init(state, start); state.merchant.companyLevel = 100;
    expect(Merchant.command(state, 'researchTech', { techId: 'efficient_engines' }, start).ok).toBe(true);
    expect(state.credits).toBe(74);
  });
});
