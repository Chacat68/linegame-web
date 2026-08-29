import { describe, expect, it, vi } from 'vitest';
import { createMarketSelectionController } from '../js/ui/MarketSelectionController.js';
import { createMarketWorkspaceSession } from '../js/ui/MarketWorkspaceSession.js';

function createHarness() {
  var session = createMarketWorkspaceSession();
  var context = null;
  var replaceContext = vi.fn(function (nextContext) {
    context = Object.freeze(Object.assign({}, nextContext));
    return context;
  });
  var controller = createMarketSelectionController({
    session: session,
    replaceContext: replaceContext,
    getContext: function () { return context; },
    getCurrentContextRevision: function () { return 9; },
  });
  var goods = [
    { id: 'food', name: '食物' },
    { id: 'water', name: '水' },
  ];
  return {
    controller: controller,
    goods: goods,
    replaceContext: replaceContext,
    session: session,
  };
}

describe('MarketSelectionController', function () {
  it('把失效焦点回退到首个商品，并同步会话与商品 Context', function () {
    var harness = createHarness();

    expect(harness.controller.sync({
      focusKey: 'sol_prime:open',
      focusedGoodId: 'missing',
      goodsList: harness.goods,
      source: 'market-workspace',
    })).toBe('food');

    expect(harness.session.getFocusedGood('sol_prime:open')).toBe('food');
    expect(harness.replaceContext).toHaveBeenCalledWith({
      type: 'commodity',
      id: 'food',
      workspaceId: 'trade',
      source: 'market-workspace',
      revision: 9,
    });
    expect(harness.controller.getDiagnostics()).toEqual({
      syncCount: 1,
      focusRequestCount: 0,
      focusChangeCount: 0,
      contextPublishCount: 1,
      fallbackCount: 1,
      rerenderRequestCount: 0,
      lastFocusedGoodId: 'food',
      lastFocusKey: 'sol_prime:open',
      lastSource: 'market-workspace',
    });
  });

  it('列表与行情榜共用焦点端口，并避免局部重绘覆盖真实交互来源', function () {
    var harness = createHarness();
    var rerenderSpot = vi.fn();
    harness.controller.sync({
      focusKey: 'sol_prime:open',
      focusedGoodId: 'food',
      goodsList: harness.goods,
    });

    expect(harness.controller.focus({
      focusKey: 'sol_prime:open',
      goodId: 'water',
      goodsList: harness.goods,
      source: 'market-chart-rank',
      rerenderSpot: rerenderSpot,
    })).toBe(true);
    expect(harness.controller.sync({
      focusKey: 'sol_prime:open',
      focusedGoodId: 'water',
      goodsList: harness.goods,
    })).toBe('water');

    expect(rerenderSpot).toHaveBeenCalledTimes(1);
    expect(harness.replaceContext).toHaveBeenCalledTimes(2);
    expect(harness.replaceContext).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'water',
      source: 'market-chart-rank',
    }));
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      syncCount: 2,
      focusRequestCount: 1,
      focusChangeCount: 1,
      contextPublishCount: 2,
      rerenderRequestCount: 1,
      lastFocusedGoodId: 'water',
      lastSource: 'market-chart-rank',
    }));
  });

  it('切换查看地点时即使商品相同也重发 Context，并支持 diagnostics reset', function () {
    var harness = createHarness();
    harness.controller.sync({
      focusKey: 'sol_prime:open',
      focusedGoodId: 'food',
      goodsList: harness.goods,
    });
    harness.controller.sync({
      focusKey: 'nova_station:open',
      focusedGoodId: 'food',
      goodsList: harness.goods,
    });

    expect(harness.replaceContext).toHaveBeenCalledTimes(2);
    expect(harness.controller.focus({
      focusKey: 'nova_station:open',
      goodId: 'missing',
      goodsList: harness.goods,
    })).toBe(false);
    expect(harness.controller.reset()).toEqual({
      syncCount: 0,
      focusRequestCount: 0,
      focusChangeCount: 0,
      contextPublishCount: 0,
      fallbackCount: 0,
      rerenderRequestCount: 0,
      lastFocusedGoodId: null,
      lastFocusKey: null,
      lastSource: null,
    });
    expect(harness.session.getFocusedGood('nova_station:open')).toBe('food');
  });
});
