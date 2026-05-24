import { describe, expect, it } from 'vitest';
import {
  getMarketActionDestination,
  handleCommerceAction,
  isCommerceAction,
} from '../js/core/CommerceActionController.js';

function createContext(extra) {
  var calls = [];
  var state = { currentSystem: 'sol_prime' };
  var context = Object.assign({
    getState: function () { return state; },
    openMarketPanel: function (nextState, options) {
      calls.push(['openMarketPanel', nextState, options]);
    },
    emitLog: function (message) { calls.push(['emitLog', message]); },
    updateUI: function () { calls.push(['updateUI']); },
    revealMarketGoodFocus: function (goodId, options) {
      calls.push(['revealMarketGoodFocus', goodId, options]);
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
    expect(context.calls[1][1].text).toContain('经营页 · 商网总览区');
    expect(context.calls[2]).toEqual(['updateUI']);
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

    expect(context.calls[3]).toEqual([
      'revealMarketGoodFocus',
      'ore',
      { tradeAction: 'sell' },
    ]);
  });

  it('可复用市场目的地文案映射', function () {
    expect(getMarketActionDestination({ workspaceId: 'capital' }, '')).toBe('商业终端 · 资本调度区');
    expect(getMarketActionDestination({ workspaceId: 'capital', subworkspaceId: 'stocks' }, '')).toBe('商业终端 · 股票交易区');
    expect(getMarketActionDestination({ workspaceId: 'capital', subworkspaceId: 'futures' }, '')).toBe('商业终端 · 期货合约区');
    expect(getMarketActionDestination({ subworkspaceId: 'black' }, '')).toBe('当前市场 · 黑市分区');
  });
});
