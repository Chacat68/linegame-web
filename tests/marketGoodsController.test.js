import { describe, expect, it, vi } from 'vitest';
import { MARKET_COMMAND } from '../js/core/MarketCommand.js';
import { createMarketGoodsController } from '../js/ui/MarketGoodsController.js';
import { createMarketSelectionController } from '../js/ui/MarketSelectionController.js';
import { createMarketWorkspaceSession } from '../js/ui/MarketWorkspaceSession.js';

function createFakeElement() {
  return {
    dataset: {},
    disabled: false,
    innerHTML: '',
    onclick: null,
    onkeydown: null,
  };
}

function createHarness() {
  var session = createMarketWorkspaceSession();
  var list = createFakeElement();
  var toolbar = createFakeElement();
  var quickTrade = createFakeElement();
  var elements = {
    'market-goods-list': list,
    'market-goods-toolbar': toolbar,
    'market-quick-trade-dock': quickTrade,
  };
  var currentContext = null;
  var replaceContext = vi.fn(function (context) {
    currentContext = Object.freeze(Object.assign({}, context));
  });
  var selection = createMarketSelectionController({
    session: session,
    replaceContext: replaceContext,
    getContext: function () { return currentContext; },
    getCurrentContextRevision: function () { return 7; },
  });
  var publishCommand = vi.fn(function (onCommand, type, payload) {
    onCommand(Object.assign({}, payload || {}, { type: type }));
  });
  var controller = createMarketGoodsController({
    selection: selection,
    getDocument: function () {
      return {
        getElementById: function (id) { return elements[id] || null; },
      };
    },
    renderGoodsWorkspace: function (request) {
      return { html: '<div data-active="' + request.focusedGoodId + '">GOODS</div>' };
    },
    renderGoodsToolbar: function (request) {
      return 'TOOLBAR:' + request.focusedGoodId;
    },
    renderQuickTrade: function (request) {
      return 'QUICK:' + request.focusedGoodId;
    },
    publishCommand: publishCommand,
  });
  var goods = [
    { id: 'food', name: '食物' },
    { id: 'water', name: '水' },
  ];
  var onCommand = vi.fn();
  var rerenderSpot = vi.fn();

  function render(overrides) {
    return controller.render(Object.assign({
      state: {},
      systemId: 'sol_prime',
      marketMode: 'open',
      isCurrentSystem: true,
      goodsList: goods,
      snapshots: [],
      focusedGoodId: 'food',
      focusKey: 'sol_prime:open',
      systemFaction: null,
      blackMarketUnlocked: false,
      onCommand: onCommand,
      rerenderSpot: rerenderSpot,
    }, overrides || {}));
  }

  return {
    controller: controller,
    elements: elements,
    goods: goods,
    list: list,
    onCommand: onCommand,
    publishCommand: publishCommand,
    quickTrade: quickTrade,
    replaceContext: replaceContext,
    rerenderSpot: rerenderSpot,
    render: render,
    selection: selection,
    session: session,
    toolbar: toolbar,
  };
}

function goodsTarget(root, type, data) {
  return {
    dataset: Object.assign({ marketCommand: type }, data || {}),
    parentElement: root,
  };
}

describe('MarketGoodsController', function () {
  it('挂载商品工具栏、列表和快捷交易，并发布当前商品 Context', function () {
    var harness = createHarness();

    expect(harness.render()).toEqual({ activeGoodId: 'food', rendered: true });

    expect(harness.toolbar.innerHTML).toBe('TOOLBAR:food');
    expect(harness.quickTrade.innerHTML).toBe('QUICK:food');
    expect(harness.list.innerHTML).toContain('data-active="food"');
    expect(typeof harness.list.onclick).toBe('function');
    expect(typeof harness.list.onkeydown).toBe('function');
    expect(typeof harness.quickTrade.onclick).toBe('function');
    expect(harness.session.getFocusedGood('sol_prime:open')).toBe('food');
    expect(harness.replaceContext).toHaveBeenCalledWith({
      type: 'commodity',
      id: 'food',
      workspaceId: 'trade',
      source: 'market-workspace',
      revision: 7,
    });
    expect(harness.controller.getDiagnostics()).toEqual({
      renderCount: 1,
      listDelegationBindCount: 1,
      quickTradeBindCount: 1,
      commandPublishCount: 0,
      lastFocusedGoodId: 'food',
      lastCommandType: null,
      lastSystemId: 'sol_prime',
      lastMarketMode: 'open',
      lastRenderedGoodCount: 2,
    });
    expect(Object.isFrozen(harness.controller.getDiagnostics())).toBe(true);
  });

  it('用同一 typed command 端口发布买卖、补给、远程航点和快捷交易', function () {
    var harness = createHarness();
    harness.render();

    harness.list.onclick({
      target: goodsTarget(harness.list, 'buy-good', { goodId: 'food' }),
      stopPropagation: vi.fn(),
    });
    harness.list.onclick({
      target: goodsTarget(harness.list, 'sell-good', { goodId: 'water' }),
      stopPropagation: vi.fn(),
    });
    harness.list.onclick({
      target: goodsTarget(harness.list, 'refuel'),
      stopPropagation: vi.fn(),
    });
    harness.list.onclick({
      target: goodsTarget(harness.list, 'focus-remote-system', { systemId: 'nova_station' }),
      stopPropagation: vi.fn(),
    });
    var quickButton = {
      dataset: { marketQuickAction: 'sell', id: 'water' },
      parentElement: harness.quickTrade,
      disabled: false,
    };
    harness.quickTrade.onclick({
      target: { dataset: {}, parentElement: quickButton },
      stopPropagation: vi.fn(),
    });

    expect(harness.onCommand.mock.calls.map(function (call) { return call[0]; })).toEqual([
      { type: MARKET_COMMAND.OPEN_TRADE, action: 'buy', marketMode: 'open', good: harness.goods[0] },
      { type: MARKET_COMMAND.OPEN_TRADE, action: 'sell', marketMode: 'open', good: harness.goods[1] },
      { type: MARKET_COMMAND.REFUEL },
      { type: MARKET_COMMAND.FOCUS_REMOTE_SYSTEM, systemId: 'nova_station' },
      { type: MARKET_COMMAND.OPEN_TRADE, action: 'sell', marketMode: 'open', good: harness.goods[1] },
    ]);
    expect(harness.publishCommand).toHaveBeenCalledTimes(5);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      commandPublishCount: 5,
      lastCommandType: MARKET_COMMAND.OPEN_TRADE,
    }));
  });

  it('Enter 与 Space 只改变合法商品焦点，并触发交易区局部重绘', function () {
    var harness = createHarness();
    harness.render();
    var prevented = vi.fn();

    harness.list.onkeydown({
      key: 'Enter',
      target: goodsTarget(harness.list, 'focus-good', { goodId: 'water' }),
      preventDefault: prevented,
    });
    harness.list.onkeydown({
      key: 'Escape',
      target: goodsTarget(harness.list, 'focus-good', { goodId: 'food' }),
      preventDefault: prevented,
    });
    harness.list.onclick({
      target: goodsTarget(harness.list, 'focus-good', { goodId: 'missing' }),
      stopPropagation: vi.fn(),
    });

    expect(prevented).toHaveBeenCalledTimes(1);
    expect(harness.session.getFocusedGood('sol_prime:open')).toBe('water');
    expect(harness.rerenderSpot).toHaveBeenCalledTimes(1);
    expect(harness.replaceContext).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'water',
      source: 'market-good-card',
    }));
    expect(harness.onCommand).not.toHaveBeenCalled();
    expect(harness.selection.getDiagnostics()).toEqual(expect.objectContaining({
      focusChangeCount: 1,
      contextPublishCount: 2,
      lastFocusedGoodId: 'water',
    }));
  });

  it('缺少商品容器时不挂载，并可清空对象级 diagnostics', function () {
    var harness = createHarness();
    delete harness.elements['market-goods-list'];

    expect(harness.render()).toBe(false);
    expect(harness.controller.reset()).toEqual({
      renderCount: 0,
      listDelegationBindCount: 0,
      quickTradeBindCount: 0,
      commandPublishCount: 0,
      lastFocusedGoodId: null,
      lastCommandType: null,
      lastSystemId: null,
      lastMarketMode: null,
      lastRenderedGoodCount: 0,
    });
  });
});
