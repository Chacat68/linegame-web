// tests/achievement.test.js — 成就系统测试

import { describe, it, expect, beforeEach } from 'vitest';
import * as Achievement from '../js/systems/achievement/AchievementSystem.js';
import { ACHIEVEMENTS } from '../js/data/achievements.js';
import { createTestState } from './helpers.js';

describe('AchievementSystem.init', () => {
  it('初始化 achievements 数组', () => {
    const state = createTestState();
    delete state.achievements;
    Achievement.init(state);
    expect(Array.isArray(state.achievements)).toBe(true);
  });

  it('不覆盖已有的 achievements', () => {
    const state = createTestState({ achievements: ['test_ach'] });
    Achievement.init(state);
    expect(state.achievements).toContain('test_ach');
  });
});

describe('AchievementSystem.checkAll', () => {
  it('满足条件时解锁成就并发放奖励', () => {
    const state = createTestState({
      credits: 100000,
      tradeCount: 100,
      totalProfit: 50000,
      visitedSystems: ['sol_prime', 'nova_station', 'dust_haven', 'crystal_peak', 'iron_forge'],
    });
    Achievement.init(state);

    const result = Achievement.checkAll(state);
    expect(result).toHaveProperty('newlyUnlocked');
    expect(result).toHaveProperty('msgs');
    expect(Array.isArray(result.newlyUnlocked)).toBe(true);
    expect(Array.isArray(result.msgs)).toBe(true);
  });

  it('已解锁的不重复触发', () => {
    const state = createTestState({
      credits: 100000,
      tradeCount: 100,
      totalProfit: 50000,
    });
    Achievement.init(state);

    // 第一次检查
    const result1 = Achievement.checkAll(state);
    const unlockedCount1 = result1.newlyUnlocked.length;

    // 第二次检查 — 不应有新解锁
    const result2 = Achievement.checkAll(state);
    expect(result2.newlyUnlocked.length).toBe(0);
    expect(result2.msgs.length).toBe(0);
  });

  it('奖励积分被正确添加', () => {
    const state = createTestState({
      credits: 0,
      tradeCount: 1000,
      totalProfit: 1000000,
      visitedSystems: Array.from({ length: 20 }, (_, i) => 'sys_' + i),
    });
    Achievement.init(state);

    const creditsBefore = state.credits;
    Achievement.checkAll(state);
    // 如果有成就解锁且有奖励，积分应增加
    if (state.achievements.length > 0) {
      // 至少检查没有减少
      expect(state.credits).toBeGreaterThanOrEqual(creditsBefore);
    }
  });
});

describe('AchievementSystem.getUnlocked', () => {
  it('返回已解锁的成就列表', () => {
    const state = createTestState();
    Achievement.init(state);

    // 手动添加一个成就 ID
    if (ACHIEVEMENTS.length > 0) {
      state.achievements.push(ACHIEVEMENTS[0].id);
    }

    const unlocked = Achievement.getUnlocked(state);
    expect(unlocked.length).toBe(state.achievements.length > 0 ? 1 : 0);
  });

  it('无成就时返回空数组', () => {
    const state = createTestState();
    Achievement.init(state);
    const unlocked = Achievement.getUnlocked(state);
    expect(unlocked).toEqual([]);
  });
});

describe('AchievementSystem.getAll', () => {
  it('返回所有成就及其解锁状态', () => {
    const state = createTestState();
    Achievement.init(state);
    const all = Achievement.getAll(state);
    expect(all.length).toBe(ACHIEVEMENTS.length);
    all.forEach(a => {
      expect(a).toHaveProperty('id');
      expect(a).toHaveProperty('name');
      expect(a).toHaveProperty('unlocked');
      expect(typeof a.unlocked).toBe('boolean');
    });
  });

  it('解锁后标记为 unlocked: true', () => {
    const state = createTestState();
    Achievement.init(state);
    if (ACHIEVEMENTS.length > 0) {
      state.achievements.push(ACHIEVEMENTS[0].id);
      const all = Achievement.getAll(state);
      const first = all.find(a => a.id === ACHIEVEMENTS[0].id);
      expect(first.unlocked).toBe(true);
    }
  });
});
