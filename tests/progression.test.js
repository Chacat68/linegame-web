import { describe, it, expect } from 'vitest';
import { PROGRESSION_CONFIG } from '../js/data/constants.js';
import * as Progression from '../js/systems/progression/ProgressionSystem.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { createTestState } from './helpers.js';

describe('Progression level perk configuration', () => {
  it('等级 5 奖励使用配置中的买入折扣值', () => {
    const state = createTestState();
    Fleet.init(state);

    Progression.applyLevelPerk(state, 5);

    expect(state.techBuyDiscount).toBe(PROGRESSION_CONFIG.levelPerks[5].value);
  });

  it('等级 10 奖励使用配置中的复合属性加成', () => {
    const state = createTestState();
    Fleet.init(state);
    const perk = PROGRESSION_CONFIG.levelPerks[10];
    const beforeCargo = state.maxCargo;
    const beforeFuel = state.maxFuel;

    Progression.applyLevelPerk(state, 10);

    expect(state.techBuyDiscount).toBe(perk.buyDiscount);
    expect(state.techSellBonus).toBe(perk.sellBonus);
    expect(state.maxCargo).toBe(beforeCargo + perk.cargo);
    expect(state.maxFuel).toBe(beforeFuel + perk.maxFuel);
  });

  it('公司升级时会提示本级具体开放权限', () => {
    const state = createTestState({
      companyExperience: 119,
      companyLevel: 1,
    });

    const result = Progression.gainCompanyExperience(state, 1);
    const unlockMsg = result.msgs.find(function (msg) {
      return msg.text.indexOf('新公司权限开放') !== -1;
    });

    expect(state.companyLevel).toBe(2);
    expect(unlockMsg.text).toContain('Lv.2 资本工具');
    expect(unlockMsg.text).toContain('贷款与保险');
    expect(unlockMsg.text).toContain('舰队席位 II');
  });

  it('一次跨越多个公司等级时会合并列出全部新权限', () => {
    const state = createTestState({
      companyExperience: 119,
      companyLevel: 1,
    });

    const result = Progression.gainCompanyExperience(state, 531);
    const unlockMsg = result.msgs.find(function (msg) {
      return msg.text.indexOf('新公司权限开放') !== -1;
    });

    expect(state.companyLevel).toBe(4);
    expect(unlockMsg.text).toContain('Lv.2 资本工具');
    expect(unlockMsg.text).toContain('Lv.3 证券交易');
    expect(unlockMsg.text).toContain('Lv.4 贸易站建设');
  });
});
