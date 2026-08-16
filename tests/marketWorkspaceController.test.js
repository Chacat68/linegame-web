import { describe, expect, it, vi } from 'vitest';
import { createMarketWorkspaceController } from '../js/core/MarketWorkspaceController.js';

function createRoot() {
  var listeners = new Map();
  return {
    dataset: {},
    addEventListener: vi.fn(function (type, listener) { listeners.set(type, listener); }),
    removeEventListener: vi.fn(function (type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    }),
    contains: function () { return true; },
    clickMode: function (mode) {
      var button = { dataset: { mode: mode }, disabled: false };
      var listener = listeners.get('click');
      if (listener) {
        listener({
          preventDefault: vi.fn(),
          target: { closest: function () { return button; } },
        });
      }
    },
  };
}

function createHarness(options) {
  var config = options || {};
  var state = config.state || {
    cargo: { food: 4 },
    currentSystem: 'sol_prime',
    currentGalaxy: 'milky_way',
  };
  var token = { id: 'session-a' };
  var activeToken = token;
  var pendingFocus = config.pendingFocus || null;
  var root = createRoot();
  var marketUi = {
    setFocusedMarketGood: vi.fn(),
    setMarketWorkspaceFocus: vi.fn(),
    showDetail: vi.fn(),
  };
  var renderMarket = vi.fn();
  var calls = {
    emitLog: vi.fn(),
    focusNavigationTarget: vi.fn(function () { return true; }),
    invalidate: vi.fn(),
    openTradeModal: vi.fn(),
    showCompletion: vi.fn(),
  };
  var controller = createMarketWorkspaceController({
    getState: function () { return state; },
    getSessionToken: function () { return token; },
    isSessionTokenCurrent: function (requested) { return requested === activeToken; },
    getDocument: function () {
      return { getElementById: function (id) { return id === 'market-overlay' ? root : null; } };
    },
    loadMarket: config.loadMarket || function () { return Promise.resolve(marketUi); },
    renderMarket: renderMarket,
    Modal: { openTradeModal: calls.openTradeModal },
    Tutorial: { isActive: function () { return config.tutorialActive === true; } },
    systems: [
      { id: 'nova_station', name: '新星站' },
    ],
    emitLog: calls.emitLog,
    invalidate: calls.invalidate,
    showCompletion: calls.showCompletion,
    MapUI: {
      focusNavigationTarget: calls.focusNavigationTarget,
      getMarketViewSystem: function () { return 'nova_station'; },
      consumePendingMarketPanelFocus: function () {
        var result = pendingFocus;
        pendingFocus = null;
        return result;
      },
    },
  });
  return {
    calls: calls,
    controller: controller,
    marketUi: marketUi,
    renderMarket: renderMarket,
    root: root,
    invalidateSession: function () { activeToken = { id: 'session-b' }; },
    replaceState: function (next) { state = next; },
  };
}

describe('MarketWorkspaceController', function () {
  it('恢复 pending market focus、规范化模式并交给 UI coordinator 渲染', async function () {
    var harness = createHarness({
      pendingFocus: { marketMode: 'black', goodId: 'medicine', panel: 'spot' },
    });

    await expect(harness.controller.refresh()).resolves.toBe(true);

    expect(harness.controller.getMode()).toBe('black');
    expect(harness.marketUi.setFocusedMarketGood).toHaveBeenCalledWith('nova_station', 'black', 'medicine');
    expect(harness.marketUi.showDetail).toHaveBeenCalledWith('nova_station', 'black');
    expect(harness.renderMarket).toHaveBeenCalledWith(harness.marketUi, expect.any(Object));
    expect(harness.marketUi.setMarketWorkspaceFocus).toHaveBeenCalledWith({
      marketMode: 'black',
      goodId: 'medicine',
      panel: 'spot',
    });
  });

  it('市场模式使用稳定容器事件委托，不再 clone 每个按钮', async function () {
    var harness = createHarness();

    expect(harness.controller.bindModeEvents()).toBe(true);
    expect(harness.controller.bindModeEvents()).toBe(true);
    expect(harness.root.addEventListener).toHaveBeenCalledOnce();
    expect(harness.root.dataset.marketModeEventsBound).toBe('true');

    harness.root.clickMode('black');
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.controller.getMode()).toBe('black');
    expect(harness.marketUi.showDetail).toHaveBeenCalledWith('nova_station', 'black');
    expect(harness.controller.getDiagnostics().modeChangeCount).toBe(1);
  });

  it('延迟 MarketUI 在 session 替换后不得渲染旧状态', async function () {
    var resolveMarket;
    var harness = createHarness({
      loadMarket: function () { return new Promise(function (resolve) { resolveMarket = resolve; }); },
    });

    var pending = harness.controller.refresh({ mode: 'black' });
    harness.replaceState({ currentSystem: 'earth' });
    harness.invalidateSession();
    resolveMarket(harness.marketUi);

    await expect(pending).resolves.toBe(false);
    expect(harness.marketUi.showDetail).not.toHaveBeenCalled();
    expect(harness.renderMarket).not.toHaveBeenCalled();
  });

  it('reset 重置模式，dispose 释放容器 listener', async function () {
    var harness = createHarness();
    harness.controller.bindModeEvents();
    harness.root.clickMode('black');
    await Promise.resolve();
    await Promise.resolve();

    harness.controller.reset();
    expect(harness.controller.getMode()).toBe('open');
    harness.controller.dispose();

    expect(harness.root.removeEventListener).toHaveBeenCalledOnce();
    expect(harness.root.dataset.marketModeEventsBound).toBeUndefined();
    expect(harness.controller.getDiagnostics().eventsBound).toBe(false);
  });

  it('公开与黑市交易弹窗由市场工作区统一打开并保留教程数量', function () {
    var harness = createHarness({ tutorialActive: true });
    var good = { id: 'food', name: '食品' };

    expect(harness.controller.openBuy(good)).toBe(true);
    expect(harness.controller.openSell(good)).toBe(true);
    expect(harness.controller.openBlackMarketBuy(good)).toBe(true);
    expect(harness.controller.openBlackMarketSell(good)).toBe(true);

    expect(harness.calls.openTradeModal.mock.calls).toEqual([
      ['buy', good, expect.any(Object), 'open', { initialQuantity: 10 }],
      ['sell', good, expect.any(Object), 'open', { initialQuantity: 4 }],
      ['buy', good, expect.any(Object), 'black', undefined],
      ['sell', good, expect.any(Object), 'black', undefined],
    ]);
  });

  it('金融 action 适配保留领域回调，并由工作区处理远程市场航点', function () {
    var harness = createHarness();
    var commerceActions = {
      onTakeLoan: vi.fn(),
      onRepayLoan: vi.fn(),
      onInvestTradeStation: vi.fn(),
      onRedeemTradeStationInvestment: vi.fn(),
      onBatchInvestTradeStations: vi.fn(),
      onBuildTradeStation: vi.fn(),
      onUpgradeTradeStation: vi.fn(),
      onSetTradeStationStrategy: vi.fn(),
      onBatchUpgradeTradeStations: vi.fn(),
      onBatchSetTradeStationStrategy: vi.fn(),
    };

    var financeActions = harness.controller.createFinanceActions(commerceActions);
    expect(financeActions.onTakeLoan).toBe(commerceActions.onTakeLoan);
    expect(financeActions.onBatchSetTradeStationStrategy).toBe(commerceActions.onBatchSetTradeStationStrategy);
    expect(financeActions.onFocusRemoteSystem('nova_station')).toBe(true);
    expect(harness.calls.focusNavigationTarget).toHaveBeenCalledWith(
      expect.any(Object),
      'nova_station',
      { title: '前往「新星站」处理市场操作' },
    );
    expect(harness.calls.emitLog.mock.calls[0][0]).toMatchObject({ type: 'tip' });
    expect(harness.calls.emitLog.mock.calls[0][0].text).toContain('星图 · 新星站');
    expect(harness.calls.invalidate).toHaveBeenCalledOnce();
    expect(harness.calls.showCompletion).toHaveBeenCalledWith({
      message: '已找到市场航点',
      detail: '检查目标详情后确认航行',
    });
  });
});
