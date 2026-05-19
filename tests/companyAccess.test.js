import { describe, expect, it } from 'vitest';
import {
  getCompanyAccessState,
  getCompanyUnlockRoadmap,
  getCompanyUnlocksAtLevel,
  getFleetSlotCompanyRequirement,
  getMaxTradeStationLevel,
  getTradeStationLevelRequirement,
} from '../js/data/companyAccess.js';
import { createTestState } from './helpers.js';

describe('company access rules', function () {
  it('按公司等级判断资本、股票和期货准入', function () {
    const state = createTestState({ companyLevel: 1 });

    expect(getCompanyAccessState(state, 'capitalLocal')).toMatchObject({ unlocked: false, requiredLevel: 2 });

    state.companyLevel = 3;
    expect(getCompanyAccessState(state, 'capitalLocal').unlocked).toBe(true);
    expect(getCompanyAccessState(state, 'stocks').unlocked).toBe(true);
    expect(getCompanyAccessState(state, 'futures').unlocked).toBe(false);

    state.companyLevel = 5;
    expect(getCompanyAccessState(state, 'futures').unlocked).toBe(true);
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

  it('提供公司等级解锁路线给 UI 展示', function () {
    expect(getCompanyUnlocksAtLevel(2)).toMatchObject({
      level: 2,
      title: '资本工具',
    });
    expect(getCompanyUnlocksAtLevel(2).items).toContain('贷款与保险');

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
  });
});
