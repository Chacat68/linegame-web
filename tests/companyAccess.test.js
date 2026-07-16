import { describe, expect, it } from 'vitest';
import {
  getCompanyAccessState,
  getCompanyUnlockRoadmap,
  getCompanyUnlocksAtLevel,
  getFleetSlotCompanyRequirement,
  getMaxFleetSlots,
  getMaxTradeStations,
  getMaxTradeStationLevel,
  getCompanyPrivilegeSummary,
  getTradeStationCapacityState,
  getTradeStationLevelRequirement,
} from '../js/data/companyAccess.js';
import { createTestState } from './helpers.js';

describe('company access rules', function () {
  it('按公司等级判断贷款与站点投资准入', function () {
    const state = createTestState({ companyLevel: 1 });

    expect(getCompanyAccessState(state, 'capitalLocal')).toMatchObject({ unlocked: false, requiredLevel: 2 });

    state.companyLevel = 3;
    expect(getCompanyAccessState(state, 'capitalLocal').unlocked).toBe(true);
    expect(getCompanyAccessState(state, 'tradeInvestment')).toMatchObject({ unlocked: true, requiredLevel: 2 });
  });

  it('定义船队席位和贸易站等级的公司等级要求', function () {
    expect(getFleetSlotCompanyRequirement(2)).toBe(2);
    expect(getFleetSlotCompanyRequirement(6)).toBe(9);
    expect(getTradeStationLevelRequirement(1)).toBe(4);
    expect(getTradeStationLevelRequirement(5)).toBe(9);

    expect(getMaxTradeStationLevel(createTestState({ companyLevel: 3 }))).toBe(0);
    expect(getMaxTradeStationLevel(createTestState({ companyLevel: 4 }))).toBe(1);
    expect(getMaxTradeStationLevel(createTestState({ companyLevel: 6 }))).toBe(3);
    expect(getMaxTradeStationLevel(createTestState({ companyLevel: 9 }))).toBe(5);
  });

  it('按公司等级计算舰队席位与贸易站容量上限', function () {
    expect(getMaxFleetSlots(createTestState({ companyLevel: 1 }))).toBe(1);
    expect(getMaxFleetSlots(createTestState({ companyLevel: 5 }))).toBe(4);
    expect(getMaxFleetSlots(createTestState({ companyLevel: 9 }))).toBe(6);

    expect(getMaxTradeStations(createTestState({ companyLevel: 3 }))).toBe(0);
    expect(getMaxTradeStations(createTestState({ companyLevel: 4 }))).toBe(2);
    expect(getMaxTradeStations(createTestState({ companyLevel: 6 }))).toBe(8);

    const capacity = getTradeStationCapacityState(createTestState({
      companyLevel: 4,
      tradeStations: {
        sol_prime: { systemId: 'sol_prime' },
        nova_station: { systemId: 'nova_station' },
      },
    }));

    expect(capacity).toMatchObject({
      used: 2,
      max: 2,
      available: 0,
      full: true,
      unlocked: true,
      label: '2/2 站',
    });
  });

  it('汇总当前公司特权和下一档权限', function () {
    const summary = getCompanyPrivilegeSummary(createTestState({
      companyLevel: 5,
      companyExperience: 1100,
      fleetSlots: 3,
      tradeStations: {
        sol_prime: { systemId: 'sol_prime' },
        nova_station: { systemId: 'nova_station' },
      },
    }));

    expect(summary).toMatchObject({
      level: 5,
      title: '星际企业',
      expToNext: 600,
      nextLevel: { level: 6, title: '跨域集团' },
      nextMilestone: { level: 6, title: '商网指挥' },
    });
    expect(summary.caps.tradeStations).toMatchObject({
      used: 2,
      max: 4,
      available: 2,
      full: false,
      label: '2/4 站',
    });
    expect(summary.caps.tradeStationLevel).toMatchObject({ max: 2, label: 'Lv.2' });
    expect(summary.caps.fleetSlots).toEqual({ used: 3, max: 4 });
    expect(summary.unlockedFeatures.map(function (entry) { return entry.id; })).toContain('tradeStationStrategy');
  });

  it('提供公司等级解锁路线给 UI 展示', function () {
    expect(getCompanyUnlocksAtLevel(2)).toMatchObject({
      level: 2,
      title: '资本工具',
    });
    expect(getCompanyUnlocksAtLevel(2).items).toContain('经营贷款');

    const roadmap = getCompanyUnlockRoadmap(createTestState({ companyLevel: 4 }), 2);
    expect(roadmap).toHaveLength(2);
    expect(roadmap[0]).toMatchObject({
      level: 4,
      current: true,
      unlocked: true,
      title: '贸易站建设',
    });
    expect(roadmap[1]).toMatchObject({
      level: 5,
      unlocked: false,
      title: '专业化运营',
    });
    expect(roadmap[1].items).toContain('站点定位');
  });
});
