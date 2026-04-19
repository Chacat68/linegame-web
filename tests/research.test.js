// tests/research.test.js — 科技研究系统测试

import { describe, it, expect, beforeEach } from 'vitest';
import * as Research from '../js/systems/research/ResearchSystem.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Quest from '../js/systems/quest/QuestSystem.js';
import { getResearchDispatchBlockerState, getResearchDispatchBlockerActions } from '../js/ui/ResearchUI.js?v=20260419-marketfocus4';
import { createTestState } from './helpers.js';

describe('ResearchSystem.init', () => {
  it('初始化研究状态到 state', () => {
    const state = createTestState();
    Research.init(state);
    expect(state.researchedTechs).toEqual([]);
    expect(state.currentResearch).toBe(null);
    expect(state.researchQueue).toEqual([]);
    expect(Array.isArray(state.researchOptions)).toBe(true);
  });

  it('不覆盖已有的研究状态', () => {
    const state = createTestState({ researchedTechs: ['basic_scanners'] });
    Research.init(state);
    expect(state.researchedTechs).toEqual(['basic_scanners']);
  });
});

describe('ResearchSystem.drawOptions', () => {
  it('抽取最多 3 个选项', () => {
    const state = createTestState();
    Research.init(state);
    Research.drawOptions(state);
    expect(state.researchOptions.length).toBeLessThanOrEqual(3);
    expect(state.researchOptions.length).toBeGreaterThan(0);
  });

  it('不包含已研究的科技', () => {
    const state = createTestState();
    Research.init(state);
    // 先手动标记一些科技为已研究
    state.researchedTechs = ['basic_scanners', 'trade_algorithms'];
    Research.drawOptions(state);
    const optionIds = state.researchOptions;
    expect(optionIds).not.toContain('basic_scanners');
    expect(optionIds).not.toContain('trade_algorithms');
  });

  it('所有科技研究完后不崩溃', () => {
    const state = createTestState();
    Research.init(state);
    // 模拟大量已研究科技
    for (let i = 0; i < 50; i++) {
      state.researchedTechs.push('fake_tech_' + i);
    }
    expect(() => Research.drawOptions(state)).not.toThrow();
  });
});

describe('ResearchSystem.startResearch', () => {
  it('开始研究一个科技——扣费并设置 currentResearch', () => {
    const state = createTestState({ credits: 5000 });
    Research.init(state);
    Research.drawOptions(state);
    const option = state.researchOptions[0];
    if (!option) return; // 跳过如果无选项

    const result = Research.startResearch(state, option);
    expect(result.ok).toBe(true);
    expect(state.currentResearch).not.toBe(null);
    expect(state.credits).toBeLessThan(5000);
  });

  it('资金不足时返回失败', () => {
    const state = createTestState({ credits: 0 });
    Research.init(state);
    Research.drawOptions(state);
    const option = state.researchOptions[0];
    if (!option) return;

    const result = Research.startResearch(state, option);
    // 可能失败也可能加入队列，取决于是否已有 currentResearch
    if (state.currentResearch === null) {
      expect(result.ok).toBe(false);
    }
  });

  it('已有研究时加入队列', () => {
    const state = createTestState({ credits: 50000 });
    Research.init(state);
    Research.drawOptions(state);
    if (state.researchOptions.length < 2) return;

    Research.startResearch(state, state.researchOptions[0]);
    // 刷新选项
    Research.drawOptions(state);
    if (state.researchOptions.length === 0) return;
    const result2 = Research.startResearch(state, state.researchOptions[0]);
    expect(result2.ok).toBe(true);
    expect(state.researchQueue.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ResearchSystem.advanceResearch', () => {
  it('多次推进不崩溃', () => {
    const state = createTestState({ credits: 5000 });
    Research.init(state);
    Research.drawOptions(state);
    if (state.researchOptions[0]) {
      Research.startResearch(state, state.researchOptions[0]);
    }
    expect(() => {
      for (let i = 0; i < 100; i++) {
        Research.advanceResearch(state);
      }
    }).not.toThrow();
  });

  it('无正在研究的科技时不崩溃', () => {
    const state = createTestState();
    Research.init(state);
    const result = Research.advanceResearch(state);
    expect(result.msgs).toBeDefined();
  });
});

describe('ResearchSystem.isResearched', () => {
  it('查询已研究科技返回 true', () => {
    const state = createTestState();
    Research.init(state);
    state.researchedTechs.push('basic_scanners');
    expect(Research.isResearched(state, 'basic_scanners')).toBe(true);
  });

  it('查询未研究科技返回 false', () => {
    const state = createTestState();
    Research.init(state);
    expect(Research.isResearched(state, 'basic_scanners')).toBe(false);
  });
});

describe('ResearchSystem.cancelQueuedResearch', () => {
  it('取消队列中的科技返还费用', () => {
    const state = createTestState({ credits: 50000 });
    Research.init(state);
    Research.drawOptions(state);
    if (state.researchOptions.length < 2) return;

    Research.startResearch(state, state.researchOptions[0]);
    Research.drawOptions(state);
    if (state.researchOptions.length === 0) return;

    const queuedTechId = state.researchOptions[0];
    Research.startResearch(state, queuedTechId);
    const creditsBefore = state.credits;

    if (state.researchQueue.length > 0) {
      const result = Research.cancelQueuedResearch(state, state.researchQueue[0].techId);
      expect(result.ok).toBe(true);
      expect(state.credits).toBeGreaterThanOrEqual(creditsBefore);
    }
  });
});

describe('ResearchSystem.getResearchState', () => {
  it('返回有效的研究状态对象', () => {
    const state = createTestState();
    Research.init(state);
    const researchState = Research.getResearchState(state);
    expect(researchState).toBeDefined();
    expect(researchState).toHaveProperty('current');
    expect(researchState).toHaveProperty('queue');
  });
});

describe('ResearchUI blocker helpers', () => {
  it('舱位不足时把主动作导向现货交易区清货', () => {
    const state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      credits: 1800,
      maxCargo: 12,
      cargo: { food: 12 },
    });
    Faction.init(state);
    Quest.init(state);
    Research.init(state);
    state.researchOptions = ['market_analysis'];

    const blocker = getResearchDispatchBlockerState(state, {
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      cargoFree: 0,
      credits: 1800,
      playerLevel: 2,
    });
    const actions = getResearchDispatchBlockerActions(state, blocker);

    expect(blocker).toMatchObject({ reasonId: 'cargo', techId: 'market_analysis' });
    expect(actions[0]).toMatchObject({
      actionId: 'market',
      reasonId: 'cargo',
      label: '前往市场清货',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'trade',
      marketFocusLabel: '现货交易区',
    });
  });

  it('资金不足时给出市场周转主动作和本地任务次动作', () => {
    const state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      credits: 0,
    });
    Faction.init(state);
    Quest.init(state);
    Research.init(state);
    state.researchOptions = ['market_analysis'];

    const blocker = getResearchDispatchBlockerState(state, {
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      cargoFree: 10,
      credits: 0,
      playerLevel: 1,
    });
    const actions = getResearchDispatchBlockerActions(state, blocker);

    expect(blocker).toMatchObject({ reasonId: 'credits', techId: 'market_analysis' });
    expect(actions[0]).toMatchObject({
      actionId: 'market',
      reasonId: 'credits',
      label: '前往市场周转',
      marketWorkspaceId: 'capital',
      marketSubworkspaceId: 'local',
      marketFocusLabel: '资本调度区',
    });
    expect(actions[1]).toMatchObject({ actionId: 'quest-focus', label: '先做本地任务', targetQuestId: 'starter_first_trade' });
    expect(actions[1].hint).not.toContain('燃料');
    expect(actions[1].hint).toContain('科研周转资金');
  });

  it('可达补给点不足时给出升级导向的双动作', () => {
    const state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      credits: 1200,
    });
    Faction.init(state);
    Quest.init(state);
    Research.init(state);
    state.researchOptions = ['advanced_thrusters'];

    const blocker = getResearchDispatchBlockerState(state, {
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      cargoFree: 10,
      credits: 1200,
      playerLevel: 0,
    });
    const actions = getResearchDispatchBlockerActions(state, blocker);

    expect(blocker).toMatchObject({ reasonId: 'level', techId: 'advanced_thrusters' });
    expect(actions[0]).toMatchObject({
      actionId: 'market',
      reasonId: 'level',
      label: '去市场跑单升级',
      marketWorkspaceId: 'operations',
      marketSubworkspaceId: 'local',
      marketFocusLabel: '本地节点经营区',
    });
    expect(actions[1]).toMatchObject({ actionId: 'quest-focus', label: '先补等级', targetQuestId: 'starter_first_trade' });
  });
});
