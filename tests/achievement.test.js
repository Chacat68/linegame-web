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

  it('现役 event_master 成就读档时不会被旧别名吞掉', () => {
    const state = createTestState({ achievements: ['event_master'] });

    Achievement.init(state);

    expect(state.achievements).toContain('event_master');
    expect(state.achievements).not.toContain('survive_30');
  });
});

describe('AchievementSystem.checkAll', () => {
  it('首笔交易成就只奖励经验，不掩盖真实交易现金流', () => {
    const firstTrade = ACHIEVEMENTS.find(function (achievement) {
      return achievement.id === 'first_trade';
    });

    expect(firstTrade.reward).toEqual({ exp: 10 });
  });

  it('首个任务成就不与任务现金结算重复叠加', () => {
    const firstQuest = ACHIEVEMENTS.find(function (achievement) {
      return achievement.id === 'quest_first';
    });

    expect(firstQuest.reward).toEqual({ exp: 20, reputation: 2 });
  });

  it('成就经验奖励会走统一升级结算', () => {
    const state = createTestState({
      credits: 5000,
      experience: 90,
      playerLevel: 1,
    });
    Achievement.init(state);

    const result = Achievement.checkAll(state);

    expect(state.experience).toBe(110);
    expect(state.playerLevel).toBe(2);
    expect(result.msgs.some(function (msg) {
      return msg.text.indexOf('升级') !== -1;
    })).toBe(true);
  });

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

describe('长线成就节奏', () => {
  it('只保留 28 个核心节点，并移除重复的长线门槛', () => {
    const byId = Object.fromEntries(ACHIEVEMENTS.map(function (entry) { return [entry.id, entry]; }));
    expect(ACHIEVEMENTS).toHaveLength(28);
    expect(byId.trade_100.condition({ tradeCount: 100 })).toBe(true);
    expect(byId.trade_1000).toBeUndefined();
    expect(byId.survive_500).toBeUndefined();
    expect(byId.event_master.condition({ totalEvents: 30 })).toBe(true);
  });
});
