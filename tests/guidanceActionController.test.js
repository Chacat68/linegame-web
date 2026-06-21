import { describe, expect, it } from 'vitest';
import {
  getMarketActionDestination,
  getProcessingMessage,
  handleGuidanceAction,
} from '../js/core/GuidanceActionController.js';

function createCallContext(extra) {
  var calls = [];
  var state = { currentSystem: 'sol_prime' };
  var context = Object.assign({
    getState: function () { return state; },
    prepareDirectExecution: function () { calls.push(['prepareDirectExecution']); },
    refuel: function () { calls.push(['refuel']); },
    openTradeConfirmation: function (action, payload) {
      calls.push(['openTradeConfirmation', action, payload]);
    },
    openMarketPanel: function (nextState, options) {
      calls.push(['openMarketPanel', nextState, options]);
    },
    emitLog: function (message) { calls.push(['emitLog', message]); },
    updateUI: function () { calls.push(['updateUI']); },
    revealMarketGoodFocus: function (goodId, options) {
      calls.push(['revealMarketGoodFocus', goodId, options]);
    },
    refreshActionGuide: function () { calls.push(['refreshActionGuide']); },
    showCompletion: function (message, detail) {
      calls.push(['showCompletion', message, detail]);
    },
  }, extra || {});
  context.calls = calls;
  context.state = state;
  return context;
}

describe('GuidanceActionController', function () {
  it('为常见行动返回稳定的处理提示', function () {
    expect(getProcessingMessage({
      actionType: 'trade.buy',
      payload: { questName: '补给合约' },
    })).toBe('已打开交易确认，完成后将推进「补给合约」');
    expect(getProcessingMessage({ actionType: 'fleet.service.open' })).toBe('已切到机库，检查维修方案');
    expect(getProcessingMessage({ actionType: 'fleet.mod.open' })).toBe('已切到机库，查看推荐改装');
    expect(getProcessingMessage({ actionType: 'exploration.scan' })).toBe('已执行探索指令，正在刷新现场建议');
    expect(getProcessingMessage({ actionType: 'company.directive.claimAll' })).toBe('已结算公司指令奖励，正在刷新下一步');
  });

  it('把补给行动分发给直接执行回调', function () {
    var context = createCallContext();

    handleGuidanceAction({ actionType: 'trade.refuel' }, context);

    expect(context.calls).toEqual([
      ['prepareDirectExecution'],
      ['refuel'],
    ]);
  });

  it('打开经营页时会聚焦指定工作区并写入反馈', function () {
    var context = createCallContext();

    handleGuidanceAction({
      actionType: 'market.open',
      title: '升级商网站点',
      actionLabel: '查看商网',
      commandIntent: '商网总览',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'network',
      },
    }, context);

    expect(context.calls[0]).toEqual([
      'openMarketPanel',
      context.state,
      {
        workspaceId: 'operations',
        subworkspaceId: 'network',
        goodId: '',
        tradeAction: '',
      },
    ]);
    expect(context.calls[1][0]).toBe('emitLog');
    expect(context.calls[1][1].text).toContain('经营页 · 商网总览区');
    expect(context.calls[2]).toEqual(['updateUI']);
    expect(context.calls[3]).toEqual(['showCompletion', '已打开市场导航', '下一条行动建议已刷新']);
  });

  it('市场聚焦带商品时会同步高亮商品', function () {
    var context = createCallContext();

    handleGuidanceAction({
      actionType: 'market.focus',
      title: '卖出矿石',
      payload: {
        goodId: 'ore',
        tradeAction: 'sell',
      },
    }, context);

    expect(context.calls[3]).toEqual([
      'revealMarketGoodFocus',
      'ore',
      { tradeAction: 'sell' },
    ]);
    expect(context.calls[4]).toEqual(['showCompletion', '已打开市场导航', '下一条行动建议已刷新']);
  });

  it('地图聚焦完成后会展示完成态', function () {
    var context = createCallContext({
      focusNavigationTarget: function (state, systemId, options) {
        context.calls.push(['focusNavigationTarget', state, systemId, options]);
        return true;
      },
      focusStarmap: function () { context.calls.push(['focusStarmap']); },
    });

    handleGuidanceAction({
      actionType: 'map.focus',
      title: '前往半人马港卖货',
      actionLabel: '查看航点',
      payload: {
        destinationSystemId: 'alpha_centauri',
        destinationSystemName: '半人马港',
        goodId: 'food',
      },
    }, context);

    expect(context.calls[0][0]).toBe('focusNavigationTarget');
    expect(context.calls[2]).toEqual(['updateUI']);
    expect(context.calls[3]).toEqual(['showCompletion', '已定位航点', '检查目标详情后确认航行']);
  });

  it('探索行动会委托到探索控制器并保留直接执行准备', function () {
    var context = createCallContext({
      scanSystem: function (systemId, options) {
        context.calls.push(['scanSystem', systemId, options]);
      },
    });

    handleGuidanceAction({
      actionType: 'exploration.scan',
      payload: { systemId: 'alpha_centauri' },
    }, context);

    expect(context.calls).toEqual([
      ['prepareDirectExecution'],
      ['scanSystem', 'alpha_centauri', { suppressReveal: true }],
    ]);
  });

  it('公司指令奖励行动会委托给公司指令领奖回调并显示完成态', function () {
    var context = createCallContext({
      claimCompanyDirectiveRewards: function () {
        context.calls.push(['claimCompanyDirectiveRewards']);
        return { ok: true, claimedCount: 2 };
      },
    });

    handleGuidanceAction({
      actionType: 'company.directive.claimAll',
      actionLabel: '全部领取',
      surface: 'company',
    }, context);

    expect(context.calls[0]).toEqual(['claimCompanyDirectiveRewards']);
    expect(context.calls[1]).toEqual([
      'showCompletion',
      '公司指令奖励已领取',
      '已结算 2 项奖励，下一条行动建议已刷新',
    ]);
  });

  it('公司指令奖励完成态会展示收益和下一轮目标', function () {
    var context = createCallContext({
      claimCompanyDirectiveRewards: function () {
        context.calls.push(['claimCompanyDirectiveRewards']);
        return {
          ok: true,
          claimedCount: 1,
          rewardLabel: '650 cr · 公司经验 +80 · 声望 +3',
          nextDirective: { title: '商网扩张', percent: 25 },
        };
      },
    });

    handleGuidanceAction({
      actionType: 'company.directive.claimAll',
      actionLabel: '领取奖励',
      surface: 'company',
    }, context);

    expect(context.calls[1]).toEqual([
      'showCompletion',
      '公司指令奖励已领取',
      '已结算 1 项奖励：650 cr · 公司经验 +80 · 声望 +3；下一轮目标：商网扩张 25%',
    ]);
  });

  it('推荐改装行动会切到机库、打开推荐组件并写入模块反馈', function () {
    var context = createCallContext({
      activateTab: function (tabId) { context.calls.push(['activateTab', tabId]); },
      openRecommendedMod: function (payload) { context.calls.push(['openRecommendedMod', payload]); },
    });

    handleGuidanceAction({
      actionType: 'fleet.mod.open',
      actionLabel: '打开机库',
      payload: {
        shipIndex: 1,
        modId: 'mod_survey_array',
        modName: '深空测绘阵列',
        modCost: 2800,
      },
    }, context);

    expect(context.calls[0]).toEqual(['activateTab', 'tab-fleet']);
    expect(context.calls[1]).toEqual([
      'openRecommendedMod',
      {
        shipIndex: 1,
        modId: 'mod_survey_array',
        modName: '深空测绘阵列',
        modCost: 2800,
      },
    ]);
    expect(context.calls[2][0]).toBe('emitLog');
    expect(context.calls[2][1].text).toContain('模块改装');
    expect(context.calls[2][1].text).toContain('深空测绘阵列');
  });

  it('可复用市场目的地文案映射', function () {
    expect(getMarketActionDestination({ workspaceId: 'capital' }, '')).toBe('商业终端 · 资本调度区');
    expect(getMarketActionDestination({ workspaceId: 'capital', subworkspaceId: 'stocks' }, '')).toBe('商业终端 · 股票交易区');
    expect(getMarketActionDestination({ workspaceId: 'capital', subworkspaceId: 'futures' }, '')).toBe('商业终端 · 期货合约区');
    expect(getMarketActionDestination({ subworkspaceId: 'black' }, '')).toBe('当前市场 · 黑市分区');
  });
});
