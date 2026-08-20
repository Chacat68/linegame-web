import { describe, expect, it } from 'vitest';
import {
  getMarketActionDestination,
  handleCommerceAction,
  isCommerceAction,
} from '../js/core/CommerceActionController.js';
import {
  MARKET_OPERATIONS_FOCUS_PRESENTATION,
  MARKET_SPOT_FOCUS_PRESENTATION,
} from '../js/core/ActionPresentation.js';

function createContext(extra) {
  var calls = [];
  var state = { currentSystem: 'sol_prime' };
  var context = Object.assign({
    getState: function () { return state; },
    openMarketPanel: function (nextState, options) {
      calls.push(['openMarketPanel', nextState, options]);
    },
    emitLog: function (message) { calls.push(['emitLog', message]); },
    updateUI: function (presentation) { calls.push(['updateUI', presentation]); },
    revealMarketGoodFocus: function (goodId, options) {
      calls.push(['revealMarketGoodFocus', goodId, options]);
    },
    showCompletion: function (message, detail) {
      calls.push(['showCompletion', message, detail]);
    },
  }, extra || {});
  context.calls = calls;
  context.state = state;
  return context;
}

describe('CommerceActionController', function () {
  it('识别市场类商业行动', function () {
    expect(isCommerceAction('market.open')).toBe(true);
    expect(isCommerceAction('market.focus')).toBe(true);
    expect(isCommerceAction('trade.buy')).toBe(false);
  });

  it('打开经营页时会聚焦指定工作区并写入反馈', function () {
    var context = createContext();

    var handled = handleCommerceAction({
      actionType: 'market.open',
      title: '升级商网站点',
      actionLabel: '查看商网',
      commandIntent: '商网总览',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'network',
      },
    }, context);

    expect(handled).toBe(true);
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
    expect(context.calls[2]).toEqual(['updateUI', MARKET_OPERATIONS_FOCUS_PRESENTATION]);
    expect(context.calls[3]).toEqual(['showCompletion', '已打开市场导航', '下一条行动建议已刷新']);
  });

  it('市场聚焦带商品时会同步高亮商品', function () {
    var context = createContext();

    handleCommerceAction({
      actionType: 'market.focus',
      title: '卖出矿石',
      payload: {
        goodId: 'ore',
        tradeAction: 'sell',
      },
    }, context);

    expect(context.calls[2]).toEqual(['updateUI', MARKET_SPOT_FOCUS_PRESENTATION]);
    expect(context.calls[3]).toEqual([
      'revealMarketGoodFocus',
      'ore',
      { tradeAction: 'sell' },
    ]);
    expect(context.calls[4]).toEqual(['showCompletion', '已打开市场导航', '下一条行动建议已刷新']);
  });

  it('事件链市场行动会定位系统并确认后续已跟进', function () {
    var context = createContext({
      openMarketSystemPanel: function (nextState, systemId, options) {
        context.calls.push(['openMarketSystemPanel', nextState, systemId, options]);
      },
      acknowledgeSurveyChainFollowup: function (systemId, chainId) {
        context.calls.push(['acknowledgeSurveyChainFollowup', systemId, chainId]);
      },
      revealSurveyChainFocus: function (chainId) {
        context.calls.push(['revealSurveyChainFocus', chainId]);
      },
    });

    handleCommerceAction({
      actionType: 'market.open',
      title: '跟进「废弃补给站」',
      actionLabel: '规划商网',
      commandIntent: '连续任务经营',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'network',
        systemId: 'sol_prime',
        chainId: 'sol_prime_depot_chain',
      },
    }, context);

    expect(context.calls[0]).toEqual([
      'acknowledgeSurveyChainFollowup',
      'sol_prime',
      'sol_prime_depot_chain',
    ]);
    expect(context.calls[1]).toEqual([
      'openMarketSystemPanel',
      context.state,
      'sol_prime',
      {
        workspaceId: 'operations',
        subworkspaceId: 'network',
        goodId: '',
        tradeAction: '',
        systemId: 'sol_prime',
      },
    ]);
    expect(context.calls[2][0]).toBe('emitLog');
    expect(context.calls[2][1].text).toContain('贸易站 · 总览');
    expect(context.calls[2][1].text).toContain('跟进「废弃补给站」');
    expect(context.calls[3]).toEqual(['updateUI', MARKET_OPERATIONS_FOCUS_PRESENTATION]);
    expect(context.calls[4]).toEqual(['revealSurveyChainFocus', 'sol_prime_depot_chain']);
    expect(context.calls[5]).toEqual(['showCompletion', '已打开市场导航', '下一条行动建议已刷新']);
  });

  it('可复用市场目的地文案映射', function () {
    expect(getMarketActionDestination({ workspaceId: 'capital' }, '')).toBe('商业终端 · 资金管理');
    expect(getMarketActionDestination({ workspaceId: 'capital', subworkspaceId: 'stocks' }, '')).toBe('商业终端 · 资金管理');
    expect(getMarketActionDestination({ workspaceId: 'capital', subworkspaceId: 'futures' }, '')).toBe('商业终端 · 资金管理');
    expect(getMarketActionDestination({ subworkspaceId: 'black' }, '')).toBe('当前市场 · 黑市交易');
  });
});
