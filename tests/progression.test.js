import { describe, it, expect } from 'vitest';
import { PROGRESSION_CONFIG } from '../js/data/constants.js';
import * as Progression from '../js/systems/progression/ProgressionSystem.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { createTestState } from './helpers.js';

describe('Progression level perk configuration', () => {
  it('一次跨越多个玩家等级时会应用沿途全部等级奖励', () => {
    const state = createTestState({
      experience: 90,
      playerLevel: 1,
    });
    Fleet.init(state);
    const beforeCargo = state.maxCargo;

    const result = Progression.gainExperience(state, 920);

    expect(state.playerLevel).toBe(5);
    expect(state.techSellBonus).toBe(PROGRESSION_CONFIG.levelPerks[3].value);
    expect(state.maxCargo).toBe(beforeCargo + PROGRESSION_CONFIG.levelPerks[4].value);
    expect(state.techBuyDiscount).toBe(PROGRESSION_CONFIG.levelPerks[5].value);
    expect(result.msgs.filter(function (msg) {
      return msg.text.indexOf('等级奖励') !== -1;
    })).toHaveLength(3);
  });

  it('后续经验结算会修复旧版直加经验造成的等级与奖励断档', () => {
    const state = createTestState({
      experience: 310,
      playerLevel: 2,
    });
    Fleet.init(state);

    Progression.gainExperience(state, 0);

    expect(state.playerLevel).toBe(3);
    expect(state.techSellBonus).toBe(PROGRESSION_CONFIG.levelPerks[3].value);
  });

  it('等级 5 奖励使用配置中的买入折扣值', () => {
    const state = createTestState();
    Fleet.init(state);

    Progression.applyLevelPerk(state, 5);

    expect(state.techBuyDiscount).toBe(PROGRESSION_CONFIG.levelPerks[5].value);
  });

  it('等级 10 复合奖励不会重复改写当前船属性', () => {
    const state = createTestState({ playerLevel: 10 });
    Fleet.init(state);
    const perk = PROGRESSION_CONFIG.levelPerks[10];
    const beforeCargo = state.maxCargo;
    const beforeFuel = state.maxFuel;

    Progression.applyLevelPerk(state, 10);

    expect(state.techBuyDiscount).toBe(perk.buyDiscount);
    expect(state.techSellBonus).toBe(perk.sellBonus);
    expect(state.maxCargo).toBe(beforeCargo);
    expect(state.maxFuel).toBe(beforeFuel);
  });

  it('玩家等级舰船加成不改写船体，切换新船仍然生效', () => {
    const state = createTestState({ playerLevel: 10 });
    Fleet.init(state);
    const firstShip = state.fleet[0];
    const firstBaseCargo = firstShip.maxCargo;
    const firstBaseFuel = firstShip.maxFuel;
    const firstBaseEfficiency = firstShip.fuelEff;

    Fleet.syncStateFromShip(state);

    expect(firstShip.maxCargo).toBe(firstBaseCargo);
    expect(firstShip.maxFuel).toBe(firstBaseFuel);
    expect(firstShip.fuelEff).toBe(firstBaseEfficiency);
    expect(state.maxCargo).toBe(firstBaseCargo + 25);
    expect(state.maxFuel).toBe(firstBaseFuel + 20);

    const secondShip = {
      ...firstShip,
      name: '新舰测试号',
      cargo: {},
      maxCargo: 40,
      maxFuel: 140,
      fuel: 140,
      fuelEff: 0.8,
      crewIds: [],
      mods: [],
      upgrades: [],
      faults: [],
    };
    state.fleet.push(secondShip);

    expect(Fleet.switchShip(state, 1).ok).toBe(true);
    expect(state.maxCargo).toBe(65);
    expect(state.maxFuel).toBe(160);
    expect(Fleet.getEffectiveShipStats(state, secondShip).fuelEff).toBeCloseTo(0.72, 4);
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
    expect(unlockMsg.text).toContain('Lv.2 贷款与投资');
    expect(unlockMsg.text).toContain('经营贷款');
    expect(unlockMsg.text).toContain('第 2 个舰船位置');
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
    expect(unlockMsg.text).toContain('Lv.2 贷款与投资');
    expect(unlockMsg.text).toContain('Lv.3 更多舰船');
    expect(unlockMsg.text).toContain('Lv.4 贸易站建设');
  });
});
