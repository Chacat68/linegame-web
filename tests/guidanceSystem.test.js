import { describe, expect, it } from 'vitest';
import { createTestState } from './helpers.js';
import {
  GUIDANCE_PRIORITY_BANDS,
  GUIDANCE_TOPICS,
  getCurrentSuggestion,
  setAdvancedGuidanceProvider,
} from '../js/systems/guidance/GuidanceSystem.js';
import { getAdvancedGuidanceSuggestions } from '../js/systems/guidance/AdvancedGuidanceSystem.js';
import * as Commerce from '../js/systems/commerce/CommerceFacade.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Quest from '../js/systems/quest/QuestSystem.js';

setAdvancedGuidanceProvider(getAdvancedGuidanceSuggestions);

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
  it('中期空档会提供可由玩家主动启动的专题入口', function () {
    setAdvancedGuidanceProvider(function () { return []; });
    var state = createTestState({
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      quests: [],
      cargo: {},
      fuel: 100,
      maxFuel: 100,
      credits: 0,
      companyLevel: 1,
    });
    state.fleet = [{ operatingStats: { tradeCycles: 0 } }];

    var suggestion = getCurrentSuggestion(state, {});

    expect(suggestion).toMatchObject({
      id: 'start-midgame-chain:dispatch-ops',
      actionType: 'guidance.chain.start',
      actionLabel: '开始专题',
      payload: { chainId: 'dispatch-ops' },
    });
    setAdvancedGuidanceProvider(getAdvancedGuidanceSuggestions);
  });

  it('没有任务时优先推荐接取初次交易', function () {
    var state = createTestState({ quests: [], completedQuests: [] });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'accept-first-trade',
      priority: 100,
      priorityBand: GUIDANCE_PRIORITY_BANDS.core.id,
      guidanceTopic: {
        id: GUIDANCE_TOPICS.starterTrade.id,
        label: '贸易入门',
        stepLabel: '领取任务',
      },
      actionType: 'quest.accept',
      payload: { questId: 'starter_first_trade' },
    });
  });

  it('教程已完成一轮交易时，指引会明示首单可直接登记结算', function () {
    var state = createTestState({ quests: [], completedQuests: [], tradeCount: 2 });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'accept-first-trade',
      title: '登记首轮交易',
      actionLabel: '登记并结算',
    });
    expect(suggestion.reason).toContain('立即结算');
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
      actionLabel: '起航 · 5 燃料',
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
      actionLabel: '起航 · 5 燃料',
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

  it('新手主线会优先造访第二个航点，不被当地探索点带偏', function () {
    var state = createTestState({ quests: [], completedQuests: [] });
    var suggestion = getCurrentSuggestion(state, {
      nextPoi: { id: 'poi_1', name: '补给点' },
      nextPoiStatus: { canExplore: true, actionLabel: '调查补给点' },
    });

    expect(suggestion.id).toBe('accept-first-trade');

    var explorationOnly = getCurrentSuggestion(createTestState({
      quests: [{ id: 'starter_visit_2', objectives: [{ type: 'visit_systems', amount: 2, current: 1, visited: ['sol_prime'] }] }],
      completedQuests: ['starter_first_trade'],
    }), {
      nextPoi: { id: 'poi_1', name: '补给点' },
      nextPoiStatus: { canExplore: true, actionLabel: '调查补给点' },
    });

    expect(explorationOnly).toMatchObject({
      id: 'visit-next-system',
      actionType: 'travel.execute',
      payload: {
        questId: 'starter_visit_2',
      },
    });
    expect(explorationOnly.purpose).toContain('造访 2 个不同星球');
    expect(explorationOnly.nextStep).toContain('起航');
    expect(explorationOnly.outcome).toContain('结算「初探宇宙」');
  });

  it('新手探索航程燃料不足时会先给出与目标绑定的补给行动', function () {
    var state = createTestState({
      quests: [createFirstExploreQuest()],
      completedQuests: ['starter_first_trade'],
      cargo: {},
      currentSystem: 'sol_prime',
      fuel: 0.5,
      maxFuel: 1,
      credits: 1000,
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'refuel-for-explore-route',
      actionType: 'trade.refuel',
      guidanceTopic: {
        id: GUIDANCE_TOPICS.starterExplore.id,
        stepLabel: '为航程补给',
      },
    });
    expect(suggestion.reason).toContain('初探宇宙');
    expect(suggestion.outcome).toContain('未访问航点');
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

  it('有待处理事件时优先处理事件', function () {
    var state = createTestState({
      quests: [createFirstTradeQuest()],
      cargo: { food: 2 },
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    var suggestion = getCurrentSuggestion(state, { eventPending: true });

    expect(suggestion).toMatchObject({
      id: 'handle-pending-event',
      actionType: 'event.open',
      actionLabel: '查看事件',
    });
    expect(suggestion.reason).toContain('暂停航行');
  });

  it('待处理事件优先于低燃料和派遣建议', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 5000,
      fuel: 10,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      eventPending: true,
      dispatchRouteRecommendation: {
        buySystemId: 'sol_prime',
        sellSystemId: 'nova_station',
        goodId: 'food',
      },
    });

    expect(suggestion).toMatchObject({
      id: 'handle-pending-event',
      actionType: 'event.open',
    });
  });

  it('初次交易进行中且低燃料时先推荐补给再买货', function () {
    var state = createTestState({
      quests: [createFirstTradeQuest()],
      cargo: {},
      credits: 5000,
      fuel: 10,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, { marketOpen: false });

    expect(suggestion).toMatchObject({
      id: 'refuel-low-tank',
      actionType: 'trade.refuel',
      actionLabel: '补给至安全水位',
      payload: {
        fuelNeeded: 90,
        workspaceId: 'spot',
        subworkspaceId: 'trade',
      },
    });
  });

  it('低燃料优先于探索和派遣成长建议', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 5000,
      fuel: 12,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      dispatchRouteRecommendation: {
        buySystemId: 'sol_prime',
        sellSystemId: 'nova_station',
        goodId: 'food',
      },
    });

    expect(suggestion).toMatchObject({
      id: 'refuel-low-tank',
      actionType: 'trade.refuel',
      priorityBand: GUIDANCE_PRIORITY_BANDS.critical.id,
      guidanceTopic: {
        id: GUIDANCE_TOPICS.stability.id,
        label: '补给与维修',
        stepLabel: '燃料补给',
      },
    });
  });

  it('早期闭环结束后会推荐科研自动补给', function () {
    var researchSupplyRoute = {
      buySystemId: 'sol_prime',
      buySystemName: '太阳系-主星',
      sellSystemId: 'nova_station',
      sellSystemName: '新星站',
      goodId: 'technology',
      goodName: '科技组件',
      recommendedTradePolicy: { riskMode: 'balanced', marketMode: 'open' },
    };
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      researchSupplyRoute: researchSupplyRoute,
    });

    expect(suggestion).toMatchObject({
      id: 'prefill-research-supply-dispatch',
      actionType: 'fleet.dispatch.prefill',
      actionLabel: '带入机库',
      priorityBand: GUIDANCE_PRIORITY_BANDS.midgame.id,
      guidanceTopic: {
        id: GUIDANCE_TOPICS.researchSupply.id,
        label: '科研补给',
        stepLabel: '自动补给',
      },
      payload: {
        sourceLabel: '科研补给建议',
        recommendation: researchSupplyRoute,
      },
      surface: 'fleet',
    });
  });

  it('科研补给建议不会抢占未完成的货物卖出闭环', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: { food: 2 },
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    var suggestion = getCurrentSuggestion(state, {
      researchSupplyRoute: {
        buySystemId: 'sol_prime',
        sellSystemId: 'nova_station',
        goodId: 'technology',
      },
    });

    expect(suggestion).toMatchObject({
      id: 'find-sell-destination',
      actionType: 'travel.execute',
    });
  });

  it('任务运输路线会优先于无关的通用卖货点', function () {
    var questRouteRecommendation = {
      questId: 'deliver_relief',
      questName: '紧急援助',
      buySystemId: 'sol_prime',
      buySystemName: '太阳主星',
      sellSystemId: 'medical_hub',
      sellSystemName: '医疗中枢',
      goodId: 'medicine',
      goodName: '药品',
      recommendedTradePolicy: { riskMode: 'balanced', marketMode: 'open' },
    };
    var state = createTestState({
      quests: [{
        id: 'deliver_relief',
        name: '紧急援助',
        objectives: [{ type: 'deliver', goodId: 'medicine', targetSystem: 'medical_hub', amount: 3, current: 0 }],
      }],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: { medicine: 3 },
      currentSystem: 'sol_prime',
      fuel: 100,
    });
    var suggestion = getCurrentSuggestion(state, {
      questRouteRecommendation: questRouteRecommendation,
    });

    expect(suggestion).toMatchObject({
      id: 'prefill-quest-dispatch',
      actionType: 'fleet.dispatch.prefill',
      actionLabel: '带入机库核对',
      payload: {
        sourceLabel: '任务运输建议',
        recommendation: questRouteRecommendation,
      },
    });
    expect(suggestion.title).toContain('紧急援助');
    expect(suggestion.outcome).toContain('任务目标');
  });

  it('科研补给资金不足时推荐先打开市场周转', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      researchBlocker: {
        reasonId: 'credits',
        blockedReason: '当前资金不足，暂时无法为科研补给垫付进货成本。',
      },
    });

    expect(suggestion).toMatchObject({
      id: 'resolve-research-funding',
      actionType: 'market.open',
      payload: {
        workspaceId: 'spot',
        subworkspaceId: 'trade',
      },
    });
  });

  it('余额和库存都为零时不会误导玩家去无法周转的市场', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 0,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      researchBlocker: {
        reasonId: 'credits',
        blockedReason: '当前资金不足。',
      },
    });

    expect(suggestion).toMatchObject({
      id: 'resolve-research-funding',
      actionType: 'quest.open',
      actionLabel: '查看可接委托',
      payload: { tabId: 'tab-quest' },
    });
    expect(suggestion.reason).toContain('市场无法直接周转');
  });

  it('卖货航程燃料不足时会先补给，不会发出必然失败的起航指令', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: { food: 2 },
      credits: 1000,
      fuel: 1,
      maxFuel: 2,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'refuel-for-cargo-route',
      actionType: 'trade.refuel',
      priorityBand: GUIDANCE_PRIORITY_BANDS.critical.id,
    });
    expect(suggestion.reason).toContain('卖货航程需要');
    expect(suggestion.outcome).toContain('卖货点');
  });

  it('早期闭环结束后会推荐普通跑商路线预填', function () {
    var dispatchRouteRecommendation = {
      buySystemId: 'sol_prime',
      buySystemName: '太阳主星',
      sellSystemId: 'nova_station',
      sellSystemName: '新北京站',
      goodId: 'food',
      goodName: '食物',
      strategySummary: '稳态商运：匹配公开市场',
      surveyIntelSummary: '探索线索：买入地贸易报告',
      recommendedTradePolicy: { riskMode: 'balanced', marketMode: 'open' },
    };
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      dispatchRouteRecommendation: dispatchRouteRecommendation,
    });

    expect(suggestion).toMatchObject({
      id: 'prefill-profitable-dispatch',
      actionType: 'fleet.dispatch.prefill',
      actionLabel: '带入机库',
      payload: {
        sourceLabel: '跑商路线建议',
        recommendation: dispatchRouteRecommendation,
      },
      surface: 'fleet',
    });
    expect(suggestion.reason).toContain('太阳主星');
    expect(suggestion.reason).toContain('探索线索');
  });

  it('派遣专题激活时会优先展示跑商路线，不被科研补给遮挡', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    state.midgameChains['dispatch-ops'].active = true;
    var dispatchRouteRecommendation = {
      buySystemId: 'sol_prime',
      sellSystemId: 'nova_station',
      goodId: 'food',
      goodName: '食品',
    };

    var suggestion = getCurrentSuggestion(state, {
      researchSupplyRoute: {
        buySystemId: 'sol_prime',
        sellSystemId: 'research_hub',
        goodId: 'technology',
      },
      dispatchRouteRecommendation: dispatchRouteRecommendation,
    });

    expect(suggestion).toMatchObject({
      id: 'prefill-profitable-dispatch',
      actionType: 'fleet.dispatch.prefill',
      payload: { recommendation: dispatchRouteRecommendation },
    });
    expect(suggestion.guidanceTopic.chainLabel).toBe('派遣 → 复核 → 优化');
  });

  it('同一路线草案已在派遣弹窗打开时不会重复推荐派遣预填', function () {
    var dispatchRouteRecommendation = {
      buySystemId: 'sol_prime',
      buySystemName: '太阳主星',
      sellSystemId: 'nova_station',
      sellSystemName: '新北京站',
      goodId: 'food',
      goodName: '食物',
      strategySummary: '稳态商运：匹配公开市场',
      recommendedTradePolicy: { riskMode: 'balanced', marketMode: 'open' },
    };
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      dispatchRouteRecommendation: dispatchRouteRecommendation,
      dispatchModalContext: {
        shipIndex: 0,
        buySystemId: 'sol_prime',
        sellSystemId: 'nova_station',
        goodId: 'food',
      },
    });

    expect(suggestion).toBe(null);
  });

  it('船况明显受损时推荐进入机库维修', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      serviceStatus: {
        shipIndex: 0,
        hullRatio: 0.6,
        repairQuote: {
          cost: 280,
          faultCount: 0,
          disabledReason: '',
        },
      },
      researchBlocker: { reasonId: 'credits' },
    });

    expect(suggestion).toMatchObject({
      id: 'service-active-ship',
      actionType: 'fleet.service.open',
      actionLabel: '打开维修方案',
      payload: {
        shipIndex: 0,
        repairCost: 280,
      },
    });
  });

  it('维护度进入磨损区间时也推荐进入机库维修', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      serviceStatus: {
        shipIndex: 0,
        hullRatio: 1,
        maintenanceValue: 42,
        maintenanceBand: 'worn',
        repairQuote: {
          cost: 360,
          faultCount: 0,
          disabledReason: '',
        },
      },
      dispatchRouteRecommendation: {
        buySystemId: 'sol_prime',
        sellSystemId: 'nova_station',
        goodId: 'food',
      },
    });

    expect(suggestion).toMatchObject({
      id: 'service-active-ship',
      actionType: 'fleet.service.open',
      payload: {
        shipIndex: 0,
        repairCost: 360,
        maintenanceValue: 42,
      },
    });
    expect(suggestion.reason).toContain('维护度');
  });

  it('维修资金不足时推荐先去市场周转', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      serviceStatus: {
        shipIndex: 0,
        hullRatio: 0.5,
        repairQuote: {
          cost: 280,
          faultCount: 0,
          disabledReason: '积分不足',
        },
      },
    });

    expect(suggestion).toMatchObject({
      id: 'fund-ship-service',
      actionType: 'market.open',
      payload: {
        workspaceId: 'spot',
        subworkspaceId: 'trade',
      },
    });
  });

  it('仅维护度维修资金不足时也推荐先去市场周转', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      serviceStatus: {
        shipIndex: 0,
        hullRatio: 1,
        maintenanceValue: 39,
        maintenanceBand: 'worn',
        repairQuote: {
          cost: 420,
          faultCount: 0,
          disabledReason: '积分不足',
        },
      },
    });

    expect(suggestion).toMatchObject({
      id: 'fund-ship-service',
      actionType: 'market.open',
      payload: {
        workspaceId: 'spot',
        subworkspaceId: 'trade',
      },
    });
  });

  it('中期空档时会推荐进入机库查看可安装的功能改装', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 5000,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      modRecommendation: {
        shipIndex: 0,
        modId: 'mod_survey_array',
        mod: {
          id: 'mod_survey_array',
          name: '深空测绘阵列',
          cost: 2800,
        },
        canInstall: true,
        reason: '探索支援分工适合提升扫描折扣和探索点收益。',
      },
    });

    expect(suggestion).toMatchObject({
      id: 'install-recommended-ship-mod',
      actionType: 'fleet.mod.open',
      actionLabel: '打开机库',
      payload: {
        shipIndex: 0,
        modId: 'mod_survey_array',
        modName: '深空测绘阵列',
        modCost: 2800,
      },
      commandIntent: '模块改装',
    });
    expect(suggestion.reason).toContain('探索支援');
  });

  it('同一推荐组件已在机库改装视图打开时不会重复提示', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 5000,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      modRecommendation: {
        shipIndex: 0,
        modId: 'mod_survey_array',
        mod: {
          id: 'mod_survey_array',
          name: '深空测绘阵列',
          cost: 2800,
        },
        canInstall: true,
        reason: '探索支援分工适合提升扫描折扣和探索点收益。',
      },
      modModalContext: {
        shipIndex: 0,
        focusModId: 'mod_survey_array',
        recommendedModId: 'mod_survey_array',
      },
    });

    expect(suggestion).toBe(null);
  });

  it('刚完成改装安装后会跳过同舰船改装推荐并转向跑商建议', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 5000,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      modRecommendation: {
        shipIndex: 0,
        modId: 'mod_survey_array',
        mod: {
          id: 'mod_survey_array',
          name: '深空测绘阵列',
          cost: 2800,
        },
        canInstall: true,
        reason: '探索支援分工适合提升扫描折扣和探索点收益。',
      },
      recentModInstallContext: {
        shipIndex: 0,
        modId: 'mod_service_bay',
      },
      dispatchRouteRecommendation: {
        buySystemId: 'sol_prime',
        buySystemName: '太阳前哨',
        sellSystemId: 'alpha_centauri',
        sellSystemName: '半人马港',
        goodId: 'food',
        goodName: '食品',
        strategySummary: '常规套利路线。',
      },
    });

    expect(suggestion).toMatchObject({
      id: 'prefill-profitable-dispatch',
      actionType: 'fleet.dispatch.prefill',
      payload: {
        sourceLabel: '跑商路线建议',
        recommendation: {
          goodId: 'food',
        },
      },
    });
  });

  it('资金足够且公司等级满足时推荐建设贸易站', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 150000,
      companyLevel: 4,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime'],
      tradeStations: {},
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'build-trade-station',
      actionType: 'market.open',
      actionLabel: '打开经营页',
      guidanceTopic: {
        id: GUIDANCE_TOPICS.tradeNetwork.id,
        label: '贸易站发展',
        stepLabel: '新建贸易站',
      },
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'local',
        systemId: 'sol_prime',
      },
    });
  });

  it('商网阶段有多个可升级站点时推荐批量升级波次', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 500000,
      companyLevel: 6,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime', 'nova_station'],
      tradeStations: {
        sol_prime: {
          systemId: 'sol_prime',
          level: 1,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 100000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
        nova_station: {
          systemId: 'nova_station',
          level: 1,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 100000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
      },
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'batch-upgrade-trade-stations',
      actionType: 'market.open',
      actionLabel: '打开批量面板',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'network',
        batchScope: 'upgrade',
      },
    });
    expect(suggestion.payload.systemIds.slice().sort()).toEqual(['nova_station', 'sol_prime']);
  });

  it('商网阶段没有升级目标时推荐批量资本增配', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 30000,
      companyLevel: 6,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime', 'nova_station'],
      tradeInvestments: {},
      tradeStations: {
        sol_prime: {
          systemId: 'sol_prime',
          level: 3,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 1000000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
        nova_station: {
          systemId: 'nova_station',
          level: 3,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 1000000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
      },
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'batch-invest-trade-stations',
      actionType: 'market.open',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'network',
        batchScope: 'investment',
      },
    });
    expect(suggestion.payload.systemIds.length).toBeGreaterThanOrEqual(2);
  });

  it('有可用勘探经营情报时推荐打开探索档案', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 5000,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      surveyIntel: {
        systemId: 'sol_prime',
        hasIntel: true,
        marketSignal: true,
        researchSignal: false,
        routeSignal: false,
        logisticsSignal: false,
        primarySignal: 'market',
        recentReportSignal: 'market',
        recentReportId: 'sol_prime_report_manifest',
        recentReportTitle: '轨道种子库清单',
      },
    });

    expect(suggestion).toMatchObject({
      id: 'review-survey-archive',
      actionType: 'archive.open',
      actionLabel: '打开档案确认',
      payload: {
        tabId: 'tab-exploration',
        systemId: 'sol_prime',
        intelSignal: 'market',
        reportId: 'sol_prime_report_manifest',
      },
    });
    expect(suggestion.reason).toContain('交易机会');
  });

  it('有待跟进事件链时行动条优先生成事件链建议', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 5000,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      surveyIntel: {
        systemId: 'sol_prime',
        hasIntel: true,
        marketSignal: true,
        logisticsSignal: true,
        depotSignal: true,
        primarySignal: 'market',
        readyFollowupCount: 1,
        recentReportTitle: '废弃补给站复原',
        nextChainFollowup: {
          chainId: 'sol_prime_depot_chain',
          chainKind: 'derelict_depot',
          chainLabel: '废弃补给站',
          signal: 'logistics',
          reason: '废弃补给站已复原，打开商网总览确认建站折抵。',
          actionLabel: '规划商网',
          workspaceId: 'operations',
          subworkspaceId: 'network',
        },
      },
    });

    expect(suggestion).toMatchObject({
      id: 'review-survey-chain-followup',
      priority: 37,
      actionType: 'archive.open',
      actionLabel: '打开档案确认',
      payload: {
        tabId: 'tab-exploration',
        systemId: 'sol_prime',
        intelSignal: 'logistics',
        chainId: 'sol_prime_depot_chain',
        chainKind: 'derelict_depot',
        chainLabel: '废弃补给站',
      },
      guidanceTopic: {
        id: GUIDANCE_TOPICS.surveyIntel.id,
        stepLabel: '跟进连续任务',
      },
    });
    expect(suggestion.title).toContain('废弃补给站');
  });

  it('已确认的普通报告不会反复占用当前行动', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 5000,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      surveyIntel: {
        systemId: 'sol_prime',
        hasIntel: true,
        hasUnreviewedReport: false,
        marketSignal: true,
        primarySignal: 'market',
        recentReportTitle: '轨道种子库清单',
      },
    });

    expect(suggestion).toBe(null);
  });

  it('探索档案已经打开时不会反复推荐查看同一份报告', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 5000,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      archiveOpen: true,
      archiveTab: 'tab-exploration',
      surveyIntel: {
        systemId: 'sol_prime',
        hasIntel: true,
        marketSignal: true,
        primarySignal: 'market',
        recentReportTitle: '轨道种子库清单',
      },
    });

    expect(suggestion).toBe(null);
  });

  it('档案未打开时仍保留探索报告导航建议', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 5000,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      marketOpen: true,
      marketFocus: {
        workspaceId: 'spot',
        subworkspaceId: 'trade',
        systemId: 'sol_prime',
      },
      surveyIntel: {
        systemId: 'sol_prime',
        hasIntel: true,
        marketSignal: true,
        primarySignal: 'market',
        recentReportTitle: '轨道种子库清单',
      },
    });

    expect(suggestion).toMatchObject({
      id: 'review-survey-archive',
      actionType: 'archive.open',
      payload: {
        tabId: 'tab-exploration',
      },
    });
  });

  it('目标资本分区已经打开时跳过对应市场导航建议', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 2000,
      companyLevel: 2,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
      loans: [{
        id: 'loan_due',
        name: '星港周转贷',
        balance: 3200,
        dailyPayment: 280,
        remainingDays: 1,
        status: 'active',
      }],
    });
    var suggestion = getCurrentSuggestion(state, {
      marketOpen: true,
      marketFocus: {
        workspaceId: 'capital',
        subworkspaceId: 'local',
        systemId: 'sol_prime',
      },
    });

    expect(suggestion).toBe(null);
  });

  it('金融风险不会抢占未完成的货物卖出闭环', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: { food: 2 },
      credits: 2000,
      companyLevel: 2,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      loans: [{
        id: 'loan_due',
        name: '星港周转贷',
        balance: 3200,
        dailyPayment: 280,
        remainingDays: 1,
        status: 'active',
      }],
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'find-sell-destination',
      actionType: 'travel.execute',
      payload: { goodId: 'food' },
    });
  });

  it('贷款临近展期时推荐打开资金管理', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 2000,
      companyLevel: 2,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
      loans: [{
        id: 'loan_due',
        name: '星港周转贷',
        balance: 3200,
        dailyPayment: 280,
        remainingDays: 1,
        status: 'active',
      }],
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'review-loan-obligation',
      actionType: 'market.open',
      actionLabel: '查看贷款',
      payload: {
        workspaceId: 'capital',
        subworkspaceId: 'local',
        loanId: 'loan_due',
      },
    });
  });

  it('商网总览目标已经打开时跳过重复批量经营导航', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 500000,
      companyLevel: 6,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime', 'nova_station'],
      stockPortfolio: {
        federation_index: { shares: 1 },
      },
      tradeStations: {
        sol_prime: {
          systemId: 'sol_prime',
          level: 1,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 100000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
        nova_station: {
          systemId: 'nova_station',
          level: 1,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 100000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
      },
    });
    var suggestion = getCurrentSuggestion(state, {
      marketOpen: true,
      marketFocus: {
        workspaceId: 'operations',
        subworkspaceId: 'network',
        systemId: 'sol_prime',
      },
    });

    expect(suggestion).toBe(null);
  });

  it('批量条件不足时保留单站升级建议', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      cargo: {},
      credits: 250000,
      companyLevel: 5,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime', 'nova_station'],
      tradeStations: {
        sol_prime: {
          systemId: 'sol_prime',
          level: 1,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 100000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
        nova_station: {
          systemId: 'nova_station',
          level: 1,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 100000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
      },
    });
    var suggestion = getCurrentSuggestion(state);

    expect(suggestion).toMatchObject({
      id: 'upgrade-trade-station',
      actionType: 'market.open',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'stations',
      },
    });
  });

  it('当前航点直接推荐调查下一处 探索点 并带上目标 id', function () {
    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      currentSystem: 'sol_prime',
    });
    var suggestion = getCurrentSuggestion(state, {
      nextPoi: {
        id: 'sol_prime_poi_resource',
        icon: '🌾',
        name: '轨道种子库',
        chainKind: 'derelict_depot',
        chainLabel: '废弃补给站',
      },
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
    expect(suggestion.reason).toContain('废弃补给站');
    expect(suggestion.reason).toContain('贸易站');
  });
});
