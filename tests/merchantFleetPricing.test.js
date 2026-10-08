import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_TECHS } from '../js/data/merchant.js';
import { measureFleet } from '../scripts/simulate-company-pricing.mjs';

describe('公司升级按阶段满编船队校准', () => {
  it.each([1, 2, 24, 57, 100])('Lv.%i 的基础与全部扩容船位均真实采购并划拨货本，供需只共享一份', level => {
    const stage = MERCHANT_COMPANY_LEVELS.find(item => item.level === level);
    const base = measureFleet({ level, expansion: false, horizonMinutes: 2 });
    const full = measureFleet({ level, horizonMinutes: 2 });
    const slots = MERCHANT_TECHS.filter(tech => tech.companyLevel <= level).reduce((sum, tech) => sum + (tech.shipSlotBonus || 0), 0);
    expect(base.ships).toBe(stage.shipLimit);
    expect(base.researchShipSlots).toBeLessThanOrEqual(slots);
    expect(full.ships).toBe(stage.shipLimit + slots);
    expect(full.allocatedShips).toBe(full.ships);
    expect(Object.values(full.fleet).reduce((sum, count) => sum + count, 0)).toBe(full.ships);
    expect(full.workingCapital).toBeGreaterThan(base.workingCapital - 1);
    expect(full.purchaseCost).toBeGreaterThanOrEqual(0);
    if (level === 1) expect(full.purchaseCost).toBe(0);
    expect(full.researchCost - base.researchCost).toBe(full.fleetExpansionCost - base.fleetExpansionCost);
    expect(full.initialInvestment).toBe(full.researchCost + full.purchaseCost + full.explorationCost + full.workingCapital);
    expect(full.ports).toBe(level >= 57 ? 4 : level >= 2 ? 3 : 2);
    expect(full.peakObservedActiveShips).toBeGreaterThanOrEqual(Math.min(2, full.ships));
    expect(full.peakObservedActiveShips).toBeLessThanOrEqual(full.ships);
    if (level === 100) expect(full.participatingShips).toBeLessThan(full.ships);
  }, 20_000);

  it('百级完整记录实际最大运力、独立投入、共享供需收益和突破价格', () => {
    const receipt = JSON.parse(readFileSync(new URL('../docs/2.1/科技树满编测算.json', import.meta.url), 'utf8'));
    expect(receipt.stages.map(stage => stage.level)).toEqual(MERCHANT_COMPANY_LEVELS.map(stage => stage.level));
    for (const stage of receipt.stages) {
      const current = MERCHANT_COMPANY_LEVELS[stage.level - 1];
      expect(stage.fullFleet.ships).toBe(current.shipLimit + current.researchShipSlots);
      expect(stage.fullFleet.allocatedShips).toBe(stage.fullFleet.ships);
      expect(stage.fullFleet.nextUpgradeCost).toBe(current.upgradeCost);
      expect(stage.isBreakthrough).toBe(current.isBreakthrough);
      expect(stage.breakthroughFactor).toBe(current.breakthroughFactor);
      expect(stage.fullFleet.researchCost).toBe(MERCHANT_TECHS.filter(tech => tech.companyLevel <= stage.level).reduce((sum, tech) => sum + tech.cost, 0));
      expect(stage.totalStageInvestment).toBe(stage.companyInvestment + stage.fullFleet.initialInvestment);
      if (current.upgradeCost === null) {
        expect(stage.fullFleet.upgradeIncomeMinutes).toBeNull();
      } else {
        expect(stage.fullFleet.upgradeIncomeMinutes).toBeCloseTo(current.upgradeCost / stage.fullFleet.profitPerMinute, 1);
      }
    }
    expect(receipt.totalUpgradeCost).toBe(16_738_900);
  });

  it('从初始资金经营的成长记录在每一级都达到完整船位，升级、研发与购船均另行支付', () => {
    const receipt = JSON.parse(readFileSync(new URL('../docs/2.1/科技树满编成长.json', import.meta.url), 'utf8'));
    expect(receipt.completed).toBe(true);
    expect(receipt.stages).toHaveLength(MERCHANT_COMPANY_LEVELS.length);
    for (const stage of receipt.stages) {
      const current = MERCHANT_COMPANY_LEVELS[stage.level - 1];
      expect(stage.ships).toBe(current.shipLimit + current.researchShipSlots);
      expect(stage.upgradeCost).toBe(current.upgradeCost);
      expect(stage.workingCapital).toBeGreaterThan(0);
      expect(stage.minutes).toBeGreaterThanOrEqual(stage.fleetReadyMinutes);
    }
    expect(receipt.spending.upgrades).toBe(MERCHANT_COMPANY_LEVELS.reduce((sum, stage) => sum + (stage.upgradeCost ?? 0), 0));
    expect(receipt.spending.research).toBe(MERCHANT_TECHS.reduce((sum, tech) => sum + tech.cost, 0));
    expect(receipt.finalCash + receipt.committedCapital).toBe(1000 + receipt.netProfit
      - Object.values(receipt.spending).reduce((sum, cost) => sum + cost, 0));
  });
});
