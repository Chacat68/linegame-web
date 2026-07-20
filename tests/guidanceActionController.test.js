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
    expect(getProcessingMessage({ actionType: 'fleet.service.open' })).toBe('已切到机库，正在定位即时保养');
    expect(getProcessingMessage({ actionType: 'quest.open' })).toBe('已打开任务档案，请选择可完成委托');
    expect(getProcessingMessage({ actionType: 'market.open' })).toBe('已打开市场导航，正在定位对应操作');
    expect(getProcessingMessage({ actionType: 'fleet.mod.open' })).toBe('已切到机库，查看推荐改装');
    expect(getProcessingMessage({ actionType: 'archive.open' })).toBe('已切到探索档案，正在确认报告用途');
    expect(getProcessingMessage({ actionType: 'exploration.poi' })).toBe('已执行探索指令，正在刷新现场建议');
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
    expect(context.calls[1][1].text).toContain('贸易站 · 总览');
    expect(context.calls[2]).toEqual(['updateUI']);
    expect(context.calls[3]).toEqual(['showCompletion', '已打开市场导航', '下一条行动建议已刷新']);
  });

  it('资金恢复行动会打开任务档案并说明返回条件', function () {
    var context = createCallContext({
      activateTab: function (tabId) { context.calls.push(['activateTab', tabId]); },
    });

    handleGuidanceAction({
      actionType: 'quest.open',
      title: '先完成委托筹措科研垫资',
      actionLabel: '查看可接委托',
      commandIntent: '可接委托',
      payload: { tabId: 'tab-quest' },
    }, context);

    expect(context.calls[0]).toEqual(['activateTab', 'tab-quest']);
    expect(context.calls[1]).toEqual(['updateUI']);
    expect(context.calls[2][0]).toBe('emitLog');
    expect(context.calls[2][1].text).toContain('档案 · 任务');
    expect(context.calls[3]).toEqual(['showCompletion', '已打开任务档案', '选择可完成委托后继续']);
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

  it('探索报告行动会打开档案、确认后续并定位对应记录', function () {
    var context = createCallContext({
      activateTab: function (tabId) { context.calls.push(['activateTab', tabId]); },
      acknowledgeSurveyChainFollowup: function (systemId, chainId) {
        context.calls.push(['acknowledgeSurveyChainFollowup', systemId, chainId]);
      },
      acknowledgeSurveyReport: function (systemId, reportId) {
        context.calls.push(['acknowledgeSurveyReport', systemId, reportId]);
      },
      revealArchiveReportFocus: function (systemId, chainId) {
        context.calls.push(['revealArchiveReportFocus', systemId, chainId]);
      },
    });

    handleGuidanceAction({
      actionType: 'archive.open',
      title: '跟进「废弃补给站」',
      actionLabel: '打开档案确认',
      payload: {
        tabId: 'tab-exploration',
        systemId: 'sol_prime',
        chainId: 'sol_prime_depot_chain',
        reportId: 'sol_prime_report_manifest',
      },
    }, context);

    expect(context.calls[0]).toEqual(['acknowledgeSurveyChainFollowup', 'sol_prime', 'sol_prime_depot_chain']);
    expect(context.calls[1]).toEqual(['acknowledgeSurveyReport', 'sol_prime', 'sol_prime_report_manifest']);
    expect(context.calls[2]).toEqual(['activateTab', 'tab-exploration']);
    expect(context.calls[3]).toEqual(['updateUI']);
    expect(context.calls[4]).toEqual(['revealArchiveReportFocus', 'sol_prime', 'sol_prime_depot_chain']);
    expect(context.calls[5][0]).toBe('emitLog');
    expect(context.calls[5][1].text).toContain('档案 · 探索报告');
    expect(context.calls[6]).toEqual(['showCompletion', '报告用途已确认', '关闭档案后将继续给出下一条行动']);
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
    expect(context.calls[3]).toEqual(['showCompletion', '已找到航点', '检查目标详情后确认航行']);
  });

  it('探索行动会委托到探索控制器并保留直接执行准备', function () {
    var context = createCallContext({
      explorePoi: function (systemId, poiId) {
        context.calls.push(['explorePoi', systemId, poiId]);
      },
    });

    handleGuidanceAction({
      actionType: 'exploration.poi',
      payload: { systemId: 'alpha_centauri', poiId: 'poi_1' },
    }, context);

    expect(context.calls).toEqual([
      ['prepareDirectExecution'],
      ['explorePoi', 'alpha_centauri', 'poi_1'],
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

  it('维修行动会直接打开并定位即时保养方案', function () {
    var context = createCallContext({
      activateTab: function (tabId) { context.calls.push(['activateTab', tabId]); },
      openRecommendedMod: function (payload) { context.calls.push(['openRecommendedMod', payload]); },
    });

    handleGuidanceAction({
      actionType: 'fleet.service.open',
      actionLabel: '打开维修方案',
      payload: { shipIndex: 0, repairCost: 360 },
    }, context);

    expect(context.calls[0]).toEqual(['activateTab', 'tab-fleet']);
    expect(context.calls[1]).toEqual(['openRecommendedMod', {
      shipIndex: 0,
      repairCost: 360,
      focusService: true,
    }]);
    expect(context.calls[2][0]).toBe('emitLog');
    expect(context.calls[2][1].text).toContain('维修船坞');
  });

  it('可复用市场目的地文案映射', function () {
    expect(getMarketActionDestination({ workspaceId: 'capital' }, '')).toBe('商业终端 · 资金管理');
    expect(getMarketActionDestination({ workspaceId: 'capital', subworkspaceId: 'stocks' }, '')).toBe('商业终端 · 资金管理');
    expect(getMarketActionDestination({ workspaceId: 'capital', subworkspaceId: 'futures' }, '')).toBe('商业终端 · 资金管理');
    expect(getMarketActionDestination({ subworkspaceId: 'black' }, '')).toBe('当前市场 · 黑市交易');
  });
});
