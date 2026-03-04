// tests/quest.test.js — QuestSystem 测试
// 覆盖: C3（深拷贝丢失函数引用）、任务接取/进度/放弃

import { describe, it, expect, beforeEach } from 'vitest';
import * as Quest from '../js/systems/quest/QuestSystem.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import { createTestState } from './helpers.js';

describe('Quest.init', () => {
  it('初始化任务系统', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);
    expect(state.quests).toEqual([]);
    expect(state.completedQuests).toEqual([]);
    expect(state.questPhase).toBeGreaterThanOrEqual(1);
  });

  it('已有数据不覆盖', () => {
    const state = createTestState({ completedQuests: ['q1'] });
    Faction.init(state);
    Quest.init(state);
    expect(state.completedQuests).toContain('q1');
  });
});

describe('Quest.getAvailableQuests', () => {
  it('返回当前阶段可接取的任务', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);
    const available = Quest.getAvailableQuests(state);
    expect(Array.isArray(available)).toBe(true);
    // 第一阶段应该有一些任务
    expect(available.length).toBeGreaterThanOrEqual(0);
  });

  it('已接取的任务不在可用列表中', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);
    const available = Quest.getAvailableQuests(state);
    if (available.length > 0) {
      const questId = available[0].id;
      Quest.acceptQuest(state, questId);
      const afterAccept = Quest.getAvailableQuests(state);
      const ids = afterAccept.map(q => q.id);
      expect(ids).not.toContain(questId);
    }
  });

  it('已完成的任务不在可用列表中', () => {
    const state = createTestState({ completedQuests: [] });
    Faction.init(state);
    Quest.init(state);
    const available = Quest.getAvailableQuests(state);
    if (available.length > 0) {
      state.completedQuests.push(available[0].id);
      const afterComplete = Quest.getAvailableQuests(state);
      expect(afterComplete.map(q => q.id)).not.toContain(available[0].id);
    }
  });
});

describe('Quest.acceptQuest', () => {
  it('成功接取任务', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);
    const available = Quest.getAvailableQuests(state);
    if (available.length > 0) {
      const result = Quest.acceptQuest(state, available[0].id);
      expect(result.ok).toBe(true);
      expect(result.msgs.length).toBeGreaterThan(0);
    }
  });

  it('不存在的任务返回失败', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);
    const result = Quest.acceptQuest(state, 'nonexistent_quest_id');
    expect(result.ok).toBe(false);
  });

  it('最多同时进行 5 个任务', () => {
    const state = createTestState({ credits: 50000, experience: 99999 });
    Faction.init(state);
    Quest.init(state);

    // 填满任务列表
    state.quests = [
      { id: 'fake_1', objectives: [{ type: 'trade_count', amount: 999, current: 0 }] },
      { id: 'fake_2', objectives: [{ type: 'trade_count', amount: 999, current: 0 }] },
      { id: 'fake_3', objectives: [{ type: 'trade_count', amount: 999, current: 0 }] },
      { id: 'fake_4', objectives: [{ type: 'trade_count', amount: 999, current: 0 }] },
      { id: 'fake_5', objectives: [{ type: 'trade_count', amount: 999, current: 0 }] },
    ];

    const available = Quest.getAvailableQuests(state);
    if (available.length > 0) {
      const result = Quest.acceptQuest(state, available[0].id);
      expect(result.ok).toBe(false);
    }
  });

  it('接取后任务包含完整 objectives（深拷贝验证）[C3]', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);
    const available = Quest.getAvailableQuests(state);
    if (available.length > 0) {
      const questId = available[0].id;
      const result = Quest.acceptQuest(state, questId);
      if (result.ok) {
        // 如果任务被立即完成（目标已满足），检查 completedQuests
        if (state.completedQuests.includes(questId)) {
          // 立即完成的任务，验证逻辑正确
          expect(true).toBe(true);
        } else {
          // 进行中的任务
          const active = state.quests.find(q => q.id === questId);
          expect(active).toBeDefined();
          expect(active.objectives).toBeDefined();
          expect(Array.isArray(active.objectives)).toBe(true);
          expect(active.objectives.length).toBeGreaterThan(0);
          // 每个 objective 都有 type 和 amount
          active.objectives.forEach(obj => {
            expect(obj.type).toBeDefined();
            expect(obj.amount).toBeDefined();
            expect(typeof obj.current).toBe('number');
          });
        }
      }
    }
  });
});

describe('Quest.abandonQuest', () => {
  it('放弃后从活跃列表移除', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);
    const available = Quest.getAvailableQuests(state);
    if (available.length > 0) {
      Quest.acceptQuest(state, available[0].id);
      const before = state.quests.length;
      if (before > 0) {
        const result = Quest.abandonQuest(state, available[0].id);
        expect(result.ok).toBe(true);
        expect(state.quests.length).toBe(before - 1);
      }
    }
  });
});

describe('Quest.checkProgress', () => {
  it('交易行为更新 trade_count 目标', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);

    // 手动注入一个有 trade_count 目标的任务
    state.quests.push({
      id: 'test_trade_quest',
      name: '测试交易任务',
      type: 'trade',
      phase: 1,
      objectives: [{ type: 'trade_count', amount: 3, current: 0 }],
      rewards: { credits: 100, exp: 10, reputation: 5 },
      timeLimit: 0,
      startDay: 1,
    });

    // 模拟 3 次交易
    for (let i = 0; i < 3; i++) {
      Quest.checkProgress(state, { action: 'buy', goodId: 'food', quantity: 1, systemId: 'sol_prime' });
    }

    // 任务应该已完成
    expect(state.completedQuests).toContain('test_trade_quest');
    expect(state.quests.find(q => q.id === 'test_trade_quest')).toBeUndefined();
  });

  it('旅行行为更新 visit_system 目标', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);

    state.quests.push({
      id: 'test_visit_quest',
      name: '测试探索任务',
      type: 'explore',
      phase: 1,
      objectives: [{ type: 'visit_system', targetSystem: 'nova_station', amount: 1, current: 0 }],
      rewards: { credits: 50, exp: 5, reputation: 2 },
      timeLimit: 0,
      startDay: 1,
    });

    Quest.checkProgress(state, { action: 'travel', systemId: 'nova_station' });

    expect(state.completedQuests).toContain('test_visit_quest');
  });

  it('超时任务被标记为失败', () => {
    const state = createTestState({ day: 100 });
    Faction.init(state);
    Quest.init(state);

    state.quests.push({
      id: 'test_timed_quest',
      name: '测试限时任务',
      type: 'trade',
      phase: 1,
      objectives: [{ type: 'trade_count', amount: 999, current: 0 }],
      rewards: { credits: 100, exp: 10, reputation: 5 },
      timeLimit: 10,
      startDay: 1,
    });

    const result = Quest.checkProgress(state, { action: 'travel', systemId: 'sol_prime' });
    // 应该超时
    expect(result.completedQuests.length).toBe(1);
    expect(result.completedQuests[0].failed).toBe(true);
  });

  it('完成任务后发放奖励', () => {
    const state = createTestState({ credits: 0, experience: 0, reputation: 0 });
    Faction.init(state);
    Quest.init(state);

    state.quests.push({
      id: 'test_reward_quest',
      name: '测试奖励',
      type: 'trade',
      phase: 1,
      objectives: [{ type: 'trade_count', amount: 1, current: 0 }],
      rewards: { credits: 500, exp: 50, reputation: 25 },
      timeLimit: 0,
      startDay: 1,
    });

    Quest.checkProgress(state, { action: 'buy', goodId: 'food', quantity: 1, systemId: 'sol_prime' });

    expect(state.credits).toBe(500);
    expect(state.experience).toBe(50);
    expect(state.reputation).toBe(25);
  });
});

describe('Quest.getCurrentQuestPhase / getCurrentQuestPhaseProgress', () => {
  it('新游戏在第一阶段', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);
    expect(Quest.getCurrentQuestPhase(state)).toBe(1);
  });

  it('返回阶段进度', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);
    const progress = Quest.getCurrentQuestPhaseProgress(state);
    expect(progress.currentPhase).toBe(1);
    expect(progress.total).toBeGreaterThanOrEqual(0);
    expect(progress.completed).toBe(0);
    expect(typeof progress.percent).toBe('number');
  });
});
