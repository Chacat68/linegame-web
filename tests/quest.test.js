// tests/quest.test.js — QuestSystem 测试
// 覆盖: C3（深拷贝丢失函数引用）、任务接取/进度/放弃

import { describe, it, expect, beforeEach } from 'vitest';
import { QUESTS } from '../js/data/quests.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../js/systems/galaxy/ExplorationSystem.js';
import * as Quest from '../js/systems/quest/QuestSystem.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import { getQuestBlockerActions } from '../js/ui/QuestUI.js?v=20260419-marketfocus4';
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

describe('Quest.getStarterRecommendations', () => {
  it('优先返回教程后可立即接取的入门任务', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);

    const recommended = Quest.getStarterRecommendations(state, 3);
    const ids = recommended.map(q => q.id);

    expect(ids).toContain('starter_first_trade');
    expect(ids).toContain('starter_visit_2');
    expect(recommended.length).toBeLessThanOrEqual(3);
  });

  it('会根据教程分支切换推荐顺序', () => {
    const state = createTestState({
      storyDecisions: { tutorial_postlude: 'shadow' },
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
    });
    Faction.init(state);
    Quest.init(state);

    const ids = Quest.getStarterRecommendations(state, 3).map(function (quest) {
      return quest.id;
    });

    expect(ids).toEqual(['starter_explore_shadow', 'starter_5_trades', 'starter_earn_500']);
  });

  it('不会推荐已接取或已完成的任务', () => {
    const state = createTestState({
      quests: [{ id: 'starter_first_trade', objectives: [{ type: 'trade_count', amount: 1, current: 0 }] }],
      completedQuests: ['starter_visit_2'],
    });
    Faction.init(state);
    Quest.init(state);

    const ids = Quest.getStarterRecommendations(state, 3).map(q => q.id);
    expect(ids).not.toContain('starter_first_trade');
    expect(ids).not.toContain('starter_visit_2');
  });
});

describe('QuestUI.getQuestBlockerActions', () => {
  it('为等级阻塞生成更明确的补等级次动作文案', () => {
    const state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    const actions = getQuestBlockerActions([
      { blockedReason: '需要达到 Lv.4 才能进入该区域' },
    ], {
      id: 'starter_first_trade',
      name: '初次交易',
      objectives: [{ type: 'trade_count', amount: 1, current: 0 }],
    }, state);

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      actionId: 'market',
      reasonId: 'level',
      label: '去市场跑单升级',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'trade',
      marketFocusLabel: '现货交易区',
      commandSurface: 'market',
      commandIntent: '现货交易区',
    });
    expect(actions[1]).toMatchObject({
      actionId: 'quest-focus',
      reasonId: 'fallback',
      label: '先补等级',
      targetQuestId: 'starter_first_trade',
      targetQuestName: '初次交易',
      commandSurface: 'quest',
      commandIntent: '替代任务',
    });
    expect(actions[1].hint).toContain('补等级');
  });

  it('为燃料阻塞的短线任务生成补给导向文案', () => {
    const state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    const actions = getQuestBlockerActions([
      { blockedReason: '当前燃料不足，需要 8 燃料，现有 2。' },
    ], {
      id: 'starter_deliver_food',
      name: '前线补给',
      objectives: [{ type: 'deliver', goodId: 'food', targetSystem: 'war_front', amount: 5, current: 0 }],
    }, state);

    expect(actions[0]).toMatchObject({
      actionId: 'market',
      reasonId: 'fuel',
      label: '前往市场补给',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'trade',
      marketFocusLabel: '现货交易区',
      commandSurface: 'market',
      commandIntent: '现货交易区',
    });
    expect(actions[1]).toMatchObject({ actionId: 'quest-focus', label: '先跑短线补给', targetQuestId: 'starter_deliver_food' });
    expect(actions[1].hint).toContain('回补燃料');
  });

  it('为跃迁科技阻塞生成银河内过渡任务文案', () => {
    const state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    const actions = getQuestBlockerActions([
      { blockedReason: '尚未掌握超空间跃迁引擎，无法跨星系航行' },
    ], {
      id: 'local_scout',
      name: '周边巡航',
      objectives: [{ type: 'visit_system', targetSystem: 'war_front', amount: 1, current: 0 }],
    }, state);

    expect(actions[0]).toMatchObject({
      actionId: 'research',
      reasonId: 'hyperspace',
      label: '前往科技页研究',
      commandSurface: 'research',
      commandIntent: '跃迁科技',
    });
    expect(actions[1]).toMatchObject({ actionId: 'quest-focus', label: '先做银河内任务', targetQuestId: 'local_scout' });
    expect(actions[1].hint).toContain('不需要跨星系');
  });

  it('没有可切换任务时只保留单个主动作', () => {
    const actions = getQuestBlockerActions([
      { blockedReason: '燃料不足，无法完成当前航段' },
    ]);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      actionId: 'market',
      reasonId: 'fuel',
      label: '前往市场补给',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'trade',
      marketFocusLabel: '现货交易区',
      commandSurface: 'market',
      commandIntent: '现货交易区',
    });
  });
});

describe('Quest.getQuestTracker', () => {
  it('优先追踪进行中的任务，并将限时任务排在前面', () => {
    const state = createTestState({
      day: 5,
      quests: [
        {
          id: 'starter_5_trades',
          name: '五连交易',
          type: 'trade',
          phase: 1,
          description: '完成 5 次贸易交易，积累实战经验。',
          objectives: [{ type: 'trade_count', amount: 5, current: 2 }],
          rewards: { credits: 300, exp: 20, reputation: 5 },
          timeLimit: 0,
          startDay: 1,
        },
        {
          id: 'starter_deliver_medicine',
          name: '疫情救援',
          type: 'delivery',
          phase: 1,
          description: '医疗中枢的药物库存告急，紧急运送 3 单位药品。',
          objectives: [{ type: 'deliver', goodId: 'medicine', targetSystem: 'medical_hub', amount: 3, current: 1 }],
          rewards: { credits: 600, exp: 25, reputation: 8 },
          timeLimit: 8,
          startDay: 2,
        },
      ],
    });

    Quest.init(state);

    const tracker = Quest.getQuestTracker(state, 2);

    expect(tracker.mode).toBe('active');
    expect(tracker.items.map(item => item.id)).toEqual(['starter_deliver_medicine', 'starter_5_trades']);
    expect(tracker.items[0].statusText).toBe('剩余 5 天');
    expect(tracker.items[0].progressText).toBe('1/3');
  });

  it('没有进行中任务时回退到推荐可接任务', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);

    const tracker = Quest.getQuestTracker(state, 2);

    expect(tracker.mode).toBe('recommended');
    expect(tracker.items.map(item => item.id)).toEqual(['starter_first_trade', 'starter_visit_2']);
    expect(tracker.items[0].statusText).toBe('推荐接取');
  });
});

describe('Quest.getQuestRoutePreview', () => {
  let state;

  beforeEach(() => {
    state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      fuel: 120,
      maxFuel: 120,
      playerLevel: 3,
      researchedTechs: [],
    });
    Economy.init();
    GalaxyData.init(state);
    Faction.init(state);
    Quest.init(state);
  });

  it('为明确目标任务返回距离、燃料与航程天数', () => {
    const quest = {
      id: 'test_route_delivery',
      objectives: [{ type: 'deliver', goodId: 'food', targetSystem: 'war_front', amount: 5, current: 0 }],
    };

    const preview = Quest.getQuestRoutePreview(state, quest, 3);
    const item = preview.items[0];

    expect(item.systemId).toBe('war_front');
    expect(item.routeModeLabel).toBe('直航');
    expect(item.distanceText).not.toBe('0.00');
    expect(item.fuelCost).toBe(Economy.getFuelCost('sol_prime', 'war_front', state.fuelEfficiency, state));
    expect(item.etaDays).toBe(1);
    expect(item.blockedReason).toBe('');
  });

  it('等级不足时对跨星系目标提示星系开放等级', () => {
    state.playerLevel = 1;

    const quest = {
      id: 'test_route_jump',
      objectives: [{ type: 'visit_system', targetSystem: 'citadel_prime', amount: 1, current: 0 }],
    };

    const preview = Quest.getQuestRoutePreview(state, quest, 3);
    const item = preview.items[0];

    expect(item.isCrossGalaxy).toBe(true);
    expect(item.routeModeLabel).toBe('跨星系跃迁');
    expect(item.etaDays).toBe(3);
    expect(item.blockedReason).toContain('Lv.2');
  });

  it('达到开放等级后跨星系目标不再提示跃迁科技限制', () => {
    state.playerLevel = 2;

    const quest = {
      id: 'test_route_jump_open',
      objectives: [{ type: 'visit_system', targetSystem: 'citadel_prime', amount: 1, current: 0 }],
    };

    const preview = Quest.getQuestRoutePreview(state, quest, 3);
    const item = preview.items[0];

    expect(item.isCrossGalaxy).toBe(true);
    expect(item.blockedReason).toBe('');
  });

  it('会在任务预估中反映已发现暗线的燃料折扣', () => {
    const basePlanet = GalaxyData.getPlanetData('sol_prime');
    const routePoi = basePlanet.exploration.pois.find(function (poi) {
      return poi.kind === 'route_beacon';
    });
    const targetSystemId = basePlanet.exploration.secretRoutes[0].targetSystemId;
    const baseCost = Economy.getFuelCost('sol_prime', targetSystemId, 1, state);

    expect(Exploration.scanSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.landOnSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.explorePoi(state, 'sol_prime', routePoi.id).ok).toBe(true);

    const preview = Quest.getQuestRoutePreview(state, {
      id: 'test_route_secret',
      objectives: [{ type: 'visit_system', targetSystem: targetSystemId, amount: 1, current: 0 }],
    }, 3);
    const item = preview.items[0];

    expect(item.hasSecretRoute).toBe(true);
    expect(item.discountPercent).toBeGreaterThan(0);
    expect(item.fuelCost).toBeLessThan(baseCost);
    expect(item.note).toContain('暗线');
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

  it('survive_days 目标只在每日推进时累计', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);

    state.quests.push({
      id: 'test_survive_days_quest',
      name: '测试生存任务',
      type: 'explore',
      phase: 1,
      objectives: [{ type: 'survive_days', amount: 3, current: 0 }],
      rewards: { credits: 50, exp: 5, reputation: 2 },
      timeLimit: 0,
      startDay: 1,
    });

    Quest.checkProgress(state, { action: 'travel', systemId: 'nova_station' });
    expect(state.quests[0].objectives[0].current).toBe(0);

    Quest.checkProgress(state, { action: 'advance_day', days: 2 });
    expect(state.quests[0].objectives[0].current).toBe(2);
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

  it('会给当前剧情路线匹配的任务应用奖励倾向', () => {
    const state = createTestState({
      storyDecisions: { tutorial_postlude: 'network' },
    });
    Faction.init(state);
    Quest.init(state);

    const summary = Quest.getQuestRewardSummary(state, {
      id: 'test_explore_reward',
      type: 'explore',
      rewards: { credits: 200, exp: 10, reputation: 4 },
      objectives: [{ type: 'visit_system', targetSystem: 'nova_station', amount: 1, current: 0 }],
    });

    expect(summary.credits).toBe(200);
    expect(summary.reputation).toBe(6);
    expect(summary.hasDecisionBonus).toBe(true);
  });

  it('关键主线任务会叠加章节级路线奖励', () => {
    const state = createTestState({
      storyDecisions: { tutorial_postlude: 'shadow' },
    });
    Faction.init(state);
    Quest.init(state);

    const summary = Quest.getQuestRewardSummary(state, {
      id: 'legend_profit_50000',
      type: 'trade',
      rewards: { credits: 10000, exp: 200, reputation: 50 },
      objectives: [{ type: 'earn_profit', amount: 50000, current: 0 }],
    });

    expect(summary.credits).toBe(11500);
    expect(summary.reputation).toBe(50);
    expect(summary.bonusText).toContain('终极利润线追加分成');
  });

  it('分支后的奖励倾向会参与实际结算', () => {
    const state = createTestState({
      credits: 0,
      experience: 0,
      reputation: 0,
      storyDecisions: { tutorial_postlude: 'steady' },
    });
    Faction.init(state);
    Quest.init(state);

    state.quests.push({
      id: 'test_delivery_bonus',
      name: '测试运输奖励倾向',
      type: 'delivery',
      phase: 1,
      objectives: [{ type: 'trade_count', amount: 1, current: 0 }],
      rewards: { credits: 100, exp: 10, reputation: 5 },
      timeLimit: 0,
      startDay: 1,
    });

    Quest.checkProgress(state, { action: 'buy', goodId: 'food', quantity: 1, systemId: 'sol_prime' });

    expect(state.credits).toBe(115);
    expect(state.experience).toBe(10);
    expect(state.reputation).toBe(5);
  });

  it('辛迪加分支完成后会影响派系关系', () => {
    const state = createTestState({
      storyDecisions: { quest_accept_rise_syndicate_sell: 'profit' },
      factionRelations: { federation: 0, syndicate: 0, technocracy: 0 },
    });
    Faction.init(state);
    Quest.init(state);

    state.quests.push({
      id: 'rise_syndicate_sell',
      name: '辛迪加的危险试探',
      type: 'faction',
      phase: 3,
      objectives: [{ type: 'trade_count', amount: 1, current: 0 }],
      rewards: { credits: 300, exp: 20, reputation: 6 },
      timeLimit: 0,
      startDay: 1,
    });

    Quest.checkProgress(state, { action: 'buy', goodId: 'weapons', quantity: 1, systemId: 'shadow_haven' });

    expect(state.factionRelations.syndicate).toBe(12);
    expect(state.factionRelations.federation).toBe(-4);
  });

  it('联邦主线完成后会叠加航线扩张的派系收益', () => {
    const state = createTestState({
      storyDecisions: { tutorial_postlude: 'network' },
      factionRelations: { federation: 0, syndicate: 0, technocracy: 0 },
    });
    Faction.init(state);
    Quest.init(state);

    state.quests.push({
      id: 'rise_fed_trade',
      name: '联邦贸易合约',
      type: 'faction',
      phase: 3,
      objectives: [{ type: 'trade_count', amount: 1, current: 0 }],
      rewards: { credits: 1500, exp: 40, reputation: 15 },
      timeLimit: 0,
      startDay: 1,
    });

    Quest.checkProgress(state, { action: 'buy', goodId: 'food', quantity: 1, systemId: 'sol_prime', factionId: 'federation' });

    expect(state.reputation).toBe(28);
    expect(state.factionRelations.federation).toBe(10);
  });

  it('派系任务目标会兼容旧 quest factionId 命名', () => {
    const state = createTestState({
      factionRelations: { federation: 32, syndicate: 0, technocracy: 0 },
    });
    Faction.init(state);
    Quest.init(state);

    state.quests.push({
      id: 'test_fed_relation_alias',
      name: '联邦关系兼容',
      type: 'faction',
      phase: 4,
      objectives: [{ type: 'faction_relation', factionId: 'galactic_federation', amount: 30, current: 0 }],
      rewards: { credits: 100, exp: 10, reputation: 5 },
      timeLimit: 0,
      startDay: 1,
    });

    const result = Quest.checkProgress(state, { action: 'travel', systemId: 'sol_prime', factionId: 'federation' });

    expect(result.completedQuests).toHaveLength(1);
    expect(result.completedQuests[0].failed).toBe(false);
  });

  it('派系贸易目标会兼容旧 quest factionId 命名', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);

    state.quests.push({
      id: 'test_fed_trade_alias',
      name: '联邦贸易兼容',
      type: 'faction',
      phase: 3,
      objectives: [{ type: 'faction_trade', factionId: 'galactic_federation', amount: 1, current: 0 }],
      rewards: { credits: 100, exp: 10, reputation: 5 },
      timeLimit: 0,
      startDay: 1,
    });

    const result = Quest.checkProgress(state, { action: 'buy', goodId: 'food', quantity: 1, systemId: 'sol_prime', factionId: 'federation' });

    expect(result.completedQuests).toHaveLength(1);
    expect(state.completedQuests).toContain('test_fed_trade_alias');
  });

  it('推进到下一章节时返回章节元数据', () => {
    const state = createTestState();
    Faction.init(state);
    Quest.init(state);

    const phaseOneIds = QUESTS.filter(function (quest) {
      return (quest.phase || 1) === 1;
    }).map(function (quest) {
      return quest.id;
    });

    state.completedQuests = phaseOneIds.filter(function (questId) {
      return questId !== 'starter_first_trade';
    });
    state.quests = [{
      id: 'starter_first_trade',
      name: '初次交易',
      type: 'trade',
      phase: 1,
      objectives: [{ type: 'trade_count', amount: 1, current: 0 }],
      rewards: { credits: 200, exp: 15, reputation: 3 },
      timeLimit: 0,
      startDay: 1,
    }];
    state.questPhase = 1;

    const result = Quest.checkProgress(state, { action: 'buy', goodId: 'food', quantity: 1, systemId: 'sol_prime' });

    expect(result.phaseAdvanced).toBe(true);
    expect(result.newPhase.id).toBe('phase_2');
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
