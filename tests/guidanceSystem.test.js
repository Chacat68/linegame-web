import { describe, expect, it } from 'vitest';
import { createTestState } from './helpers.js';
import { getCurrentSuggestion } from '../js/systems/guidance/GuidanceSystem.js';
import * as Commerce from '../js/systems/commerce/CommerceFacade.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Quest from '../js/systems/quest/QuestSystem.js';

function createFirstTradeQuest() {
  return {
    id: 'starter_first_trade',
    name: '初次交易',
    type: 'trade',
    phase: 1,
    objectives: [{ type: 'trade_count', amount: 1, current: 0 }],
    rewards: { credits: 200, exp: 15, reputation: 3 },
    timeLimit: 0,
    startDay: 1,
  };
}

function createFirstExploreQuest() {
  return {
    id: 'starter_visit_2',
    name: '初探宇宙',
    type: 'exploration',
    phase: 1,
    objectives: [{ type: 'visit_systems', amount: 2, current: 1, visited: ['sol_prime'] }],
    rewards: { credits: 250, exp: 20, reputation: 2 },
    timeLimit: 0,
    startDay: 1,
  };
}

describe('GuidanceSystem', function () {
  it('没有任务时优先推荐接取初次交易', function () {
    var state = createTestState({ quests: [], completedQuests: [] });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'accept-first-trade',
      priority: 100,
      actionType: 'quest.accept',
      payload: { questId: 'starter_first_trade' },
    });
  });

  it('初次交易从接取到成交后会完成任务并生成下一条卖货建议', function () {
    Economy.init();
    var state = createTestState({
      credits: 5000,
      maxCargo: 20,
      cargo: {},
      completedQuests: [],
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    Faction.init(state);
    Quest.init(state);

    var acceptSuggestion = getCurrentSuggestion(state);
    expect(acceptSuggestion).toMatchObject({
      id: 'accept-first-trade',
      actionType: 'quest.accept',
      payload: { questId: 'starter_first_trade' },
    });

    var acceptResult = Quest.acceptQuest(state, acceptSuggestion.payload.questId);
    expect(acceptResult.ok).toBe(true);

    var tradeSuggestion = getCurrentSuggestion(state, { marketOpen: false });
    expect(tradeSuggestion).toMatchObject({
      id: 'buy-low-price-good',
      actionType: 'trade.buy',
      payload: { goodId: 'food', questName: '初次交易' },
    });

    var buyResult = Commerce.buyGood(state, tradeSuggestion.payload.goodId, 1, 'open');
    expect(buyResult.ok).toBe(true);

    var questResult = Quest.checkProgress(state, {
      action: 'buy',
      goodId: tradeSuggestion.payload.goodId,
      quantity: 1,
      systemId: state.currentSystem,
      factionId: 'federation',
      totalEarned: 0,
    });

    expect(questResult.completedQuests.map(function (entry) { return entry.id; })).toContain('starter_first_trade');
    expect(state.completedQuests).toContain('starter_first_trade');
    expect(state.quests.some(function (quest) { return quest.id === 'starter_first_trade'; })).toBe(false);

    var nextSuggestion = getCurrentSuggestion(state, { blockingModalOpen: false });
    expect(nextSuggestion).toMatchObject({
      id: 'find-sell-destination',
      actionType: 'travel.execute',
      payload: { goodId: tradeSuggestion.payload.goodId },
    });
  });

  it('初次交易进行中且货舱为空时推荐打开低价商品买入确认', function () {
    var state = createTestState({
      quests: [createFirstTradeQuest()],
      cargo: {},
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, { marketOpen: false });

    expect(suggestion).toMatchObject({
      id: 'buy-low-price-good',
      actionType: 'trade.buy',
      actionLabel: '确认买入',
      payload: { goodId: 'food', tradeAction: 'buy' },
      surface: 'market',
    });
  });

  it('市场已打开且货舱为空时仍推荐打开买入确认', function () {
    var state = createTestState({
      quests: [createFirstTradeQuest()],
      cargo: {},
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, { marketOpen: true });

    expect(suggestion).toMatchObject({
      id: 'buy-low-price-good',
      actionType: 'trade.buy',
      actionLabel: '确认买入',
      payload: { goodId: 'food', tradeAction: 'buy' },
    });
  });

  it('货舱有低价来源货物时推荐寻找卖出目的地', function () {
    var state = createTestState({
      quests: [createFirstTradeQuest()],
      cargo: { food: 2 },
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'find-sell-destination',
      actionType: 'travel.execute',
      actionLabel: '直接前往',
      payload: { goodId: 'food' },
    });
    expect(suggestion.payload.destinationSystemId).toBeTruthy();
    expect(suggestion.payload.destinationSystemName).toBeTruthy();
  });

  it('初次交易完成后若仍有货物，会先推荐卖货而不是接下一任务', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade'],
      cargo: { food: 1 },
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'find-sell-destination',
      actionType: 'travel.execute',
      actionLabel: '直接前往',
      payload: { goodId: 'food' },
    });
  });

  it('当前节点适合卖出时会把市场焦点设为出售动作', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade'],
      cargo: { food: 1 },
      currentSystem: 'nova_station',
      currentGalaxy: 'milky_way',
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'sell-first-cargo',
      actionType: 'trade.sell',
      actionLabel: '确认卖出',
      payload: { goodId: 'food', tradeAction: 'sell' },
    });
  });

  it('完成初次交易后推荐接取初探宇宙', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade'],
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'accept-first-explore',
      actionType: 'quest.accept',
      payload: { questId: 'starter_visit_2' },
    });
  });

  it('扫描建议优先级低于新手贸易链', function () {
    var state = createTestState({ quests: [], completedQuests: [] });
    var suggestion = getCurrentSuggestion(state, {
      scanStatus: { canScan: true, scanLevel: 0 },
    });

    expect(suggestion.id).toBe('accept-first-trade');

    var scanOnly = getCurrentSuggestion(createTestState({
      quests: [{ id: 'starter_visit_2', objectives: [{ type: 'visit_systems', amount: 2, current: 1, visited: ['sol_prime'] }] }],
      completedQuests: ['starter_first_trade'],
    }), {
      scanStatus: { canScan: true, scanLevel: 0 },
    });

    expect(scanOnly).toMatchObject({
      id: 'scan-current-system',
      actionType: 'exploration.scan',
    });
  });

  it('教程或阻塞弹窗打开时不输出普通行动建议', function () {
    var state = createTestState({
      quests: [createFirstTradeQuest()],
      cargo: {},
      currentSystem: 'sol_prime',
    });

    expect(getCurrentSuggestion(state, { tutorialActive: true })).toBe(null);
    expect(getCurrentSuggestion(state, { blockingModalOpen: true })).toBe(null);
  });

  it('有待处理事件时只定位卖货点，不直接起航', function () {
    var state = createTestState({
      quests: [createFirstTradeQuest()],
      cargo: { food: 2 },
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    var suggestion = getCurrentSuggestion(state, { eventPending: true });

    expect(suggestion).toMatchObject({
      id: 'find-sell-destination',
      actionType: 'map.focus',
      actionLabel: '定位卖货点',
      payload: { goodId: 'food' },
    });
    expect(suggestion.reason).toContain('待处理事件');
  });

  it('扫描完成后推荐申请首次着陆', function () {
    var state = createTestState({
      quests: [createFirstExploreQuest()],
      completedQuests: ['starter_first_trade'],
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      scanStatus: { canScan: false, reason: 'already-scanned', scanLevel: 1 },
      landingStatus: { canLand: true, actionLabel: '申请首次着陆 · 40 积分' },
    });

    expect(suggestion).toMatchObject({
      id: 'land-current-system',
      actionType: 'exploration.land',
      actionLabel: '申请首次着陆 · 40 积分',
      payload: { systemId: 'sol_prime' },
      surface: 'exploration',
    });
  });

  it('着陆后推荐调查下一处 POI 并带上目标 id', function () {
    var state = createTestState({
      quests: [createFirstExploreQuest()],
      completedQuests: ['starter_first_trade'],
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      scanStatus: { canScan: false, reason: 'already-scanned', scanLevel: 1 },
      landingStatus: { canLand: false, reason: 'already-landed' },
      nextPoi: { id: 'sol_prime_poi_resource', icon: '🌾', name: '轨道种子库' },
      nextPoiStatus: { canExplore: true, actionLabel: '调查 🌾 轨道种子库 · 无成本' },
    });

    expect(suggestion).toMatchObject({
      id: 'explore-current-poi',
      actionType: 'exploration.poi',
      actionLabel: '调查 🌾 轨道种子库 · 无成本',
      payload: {
        systemId: 'sol_prime',
        poiId: 'sol_prime_poi_resource',
      },
      surface: 'exploration',
    });
    expect(suggestion.reason).toContain('勘探报告');
  });
});
