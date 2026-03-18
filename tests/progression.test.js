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
});