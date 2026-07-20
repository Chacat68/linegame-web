import { beforeEach, describe, expect, it } from 'vitest';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../js/systems/galaxy/ExplorationSystem.js';
import {
  buildContextualMarketAction,
  getContextualMarketFocus,
  getContextualMarketPresetId,
  MARKET_FOCUS_PRESET_IDS,
} from '../js/ui/MarketFocus.js?v=20260419-marketcta2';
import { createTestState } from './helpers.js';

describe('MarketFocus contextual defaults', function () {
  let state;

  beforeEach(function () {
    state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
    });

    Faction.init(state);
    GalaxyData.init(state);
  });

  it('默认当前停靠节点优先落到买卖货物', function () {
    expect(getContextualMarketPresetId(state)).toBe(MARKET_FOCUS_PRESET_IDS.SPOT_TRADE);
    expect(getContextualMarketFocus(state)).toEqual({
      workspaceId: 'spot',
      subworkspaceId: 'trade',
      label: '买卖货物',
    });
  });

  it('研究型节点默认落到行情与路线', function () {
    state.currentSystem = 'citadel_prime';
    state.currentGalaxy = 'andromeda';
    state.viewingGalaxy = 'andromeda';

    expect(getContextualMarketPresetId(state)).toBe(MARKET_FOCUS_PRESET_IDS.SPOT_INTEL);
  });

  it('已解锁黑市的特殊节点默认落到黑市交易', function () {
    state.currentSystem = 'shadow_haven';
    state.factionRelations.syndicate = 90;

    expect(getContextualMarketPresetId(state)).toBe(MARKET_FOCUS_PRESET_IDS.SPOT_BLACK);
    expect(getContextualMarketFocus(state)).toEqual({
      workspaceId: 'spot',
      subworkspaceId: 'black',
      label: '黑市交易',
      marketMode: 'black',
    });
  });

  it('当前节点已有贸易站时默认落到本地贸易站', function () {
    state.tradeStations = {
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
    };

    expect(getContextualMarketPresetId(state)).toBe(MARKET_FOCUS_PRESET_IDS.OPERATIONS_LOCAL);
  });

  it('当前节点已有本地投资时也默认落到本地贸易站', function () {
    state.tradeInvestments = {
      sol_prime: {
        amount: 5000,
        totalDividends: 0,
        lastDividend: 0,
      },
    };

    expect(getContextualMarketPresetId(state)).toBe(MARKET_FOCUS_PRESET_IDS.OPERATIONS_LOCAL);
  });

  it('能按上下文生成探索市场 CTA payload', function () {
    const action = buildContextualMarketAction(state, 'sol_prime', {
      context: 'survey',
    });

    expect(action).toMatchObject({
      actionId: 'market',
      label: '买卖货物',
      systemId: 'sol_prime',
      systemName: '太阳主星',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'trade',
      marketFocusLabel: '买卖货物',
      marketMode: '',
      commandSurface: 'market',
      commandIntent: '买卖货物',
      commandVerb: '买卖货物',
    });
    expect(action.contextHint).toContain('买卖货物');
    expect(action.contextHint).toContain('补给和普通跑商');
  });

  it('探索报告迁入档案后市场 CTA 仍聚焦实际交易', function () {
    state.fuel = 100;
    state.credits = 2000;

    const resourcePoi = GalaxyData.getPlanetData('sol_prime').exploration.pois.find(function (poi) {
      return poi.kind === 'resource_cache';
    });
    expect(Exploration.explorePoi(state, 'sol_prime', resourcePoi.id).ok).toBe(true);

    const action = buildContextualMarketAction(state, 'sol_prime', {
      context: 'survey',
    });

    expect(action).toMatchObject({
      label: '买卖货物',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'trade',
      marketFocusLabel: '买卖货物',
    });
    expect(action.contextHint).toContain('档案');
  });

  it('黑市节点的 CTA payload 会保留 black mode', function () {
    state.currentSystem = 'shadow_haven';
    state.factionRelations.syndicate = 90;

    const action = buildContextualMarketAction(state, 'shadow_haven', {
      context: 'survey',
    });

    expect(action).toMatchObject({
      label: '查看黑市',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'black',
      marketFocusLabel: '黑市交易',
      marketMode: 'black',
      commandSurface: 'market',
      commandIntent: '黑市交易',
      commandVerb: '查看黑市',
    });
    expect(action.contextHint).toContain('黑市');
  });

  it('研究型节点的 CTA payload 会带出情报区原因提示', function () {
    state.currentSystem = 'citadel_prime';
    state.currentGalaxy = 'andromeda';
    state.viewingGalaxy = 'andromeda';

    const action = buildContextualMarketAction(state, 'citadel_prime', {
      context: 'survey',
    });

    expect(action).toMatchObject({
      label: '查看行情',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'intel',
      marketFocusLabel: '行情与路线',
      marketMode: '',
      commandSurface: 'market',
      commandIntent: '行情与路线',
      commandVerb: '查看行情',
    });
    expect(action.contextHint).toContain('科研线索');
    expect(action.contextHint).toContain('行情与地点信息');
  });
});
