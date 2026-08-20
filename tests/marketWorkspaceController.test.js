import { describe, expect, it, vi } from 'vitest';
import { createMarketWorkspaceController } from '../js/core/MarketWorkspaceController.js';
import { NAVIGATION_FOCUS_PRESENTATION } from '../js/core/ActionPresentation.js';
import { MARKET_COMMAND, createMarketCommand } from '../js/core/MarketCommand.js';

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
    batchInvestTradeStations: vi.fn(),
    batchSetTradeStationStrategy: vi.fn(),
    batchUpgradeTradeStations: vi.fn(),
    buildTradeStation: vi.fn(),
    emitLog: vi.fn(),
    focusNavigationTarget: vi.fn(function () { return true; }),
    investTradeStation: vi.fn(),
    invalidate: vi.fn(),
    openTradeModal: vi.fn(),
    redeemTradeStationInvestment: vi.fn(),
    refuel: vi.fn(function () { return true; }),
    repayLoan: vi.fn(),
    setTradeStationStrategy: vi.fn(),
    showCompletion: vi.fn(),
    takeLoan: vi.fn(),
    upgradeTradeStation: vi.fn(),
  };
  var commerceActions = config.commerceActions || {
    onTakeLoan: calls.takeLoan,
    onRepayLoan: calls.repayLoan,
    onInvestTradeStation: calls.investTradeStation,
    onRedeemTradeStationInvestment: calls.redeemTradeStationInvestment,
    onBatchInvestTradeStations: calls.batchInvestTradeStations,
    onBuildTradeStation: calls.buildTradeStation,
    onUpgradeTradeStation: calls.upgradeTradeStation,
    onSetTradeStationStrategy: calls.setTradeStationStrategy,
    onBatchUpgradeTradeStations: calls.batchUpgradeTradeStations,
    onBatchSetTradeStationStrategy: calls.batchSetTradeStationStrategy,
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
    getCommerceActions: function () { return commerceActions; },
    refuel: calls.refuel,
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

    expect(harness.controller.handleCommand(createMarketCommand(MARKET_COMMAND.OPEN_TRADE, {
      action: 'buy', marketMode: 'open', good: good,
    }))).toBe(true);
    expect(harness.controller.handleCommand(createMarketCommand(MARKET_COMMAND.OPEN_TRADE, {
      action: 'sell', marketMode: 'open', good: good,
    }))).toBe(true);
    expect(harness.controller.handleCommand(createMarketCommand(MARKET_COMMAND.OPEN_TRADE, {
      action: 'buy', marketMode: 'black', good: good,
    }))).toBe(true);
    expect(harness.controller.handleCommand(createMarketCommand(MARKET_COMMAND.OPEN_TRADE, {
      action: 'sell', marketMode: 'black', good: good,
    }))).toBe(true);

    expect(harness.calls.openTradeModal.mock.calls).toEqual([
      ['buy', good, expect.any(Object), 'open', { initialQuantity: 10 }],
      ['sell', good, expect.any(Object), 'open', { initialQuantity: 4 }],
      ['buy', good, expect.any(Object), 'black', undefined],
      ['sell', good, expect.any(Object), 'black', undefined],
    ]);
  });

  it('单一 command 端口解释补给、金融、商网与远程航点', function () {
    var harness = createHarness();
    expect(harness.controller.handleCommand({ type: MARKET_COMMAND.REFUEL })).toBe(true);
    harness.controller.handleCommand({ type: MARKET_COMMAND.TAKE_LOAN, loanOfferId: 'growth' });
    harness.controller.handleCommand({ type: MARKET_COMMAND.REPAY_LOAN, loanId: 'loan-1' });
    harness.controller.handleCommand({ type: MARKET_COMMAND.INVEST_STATION, systemId: 'sol_prime' });
    harness.controller.handleCommand({ type: MARKET_COMMAND.REDEEM_STATION_INVESTMENT, systemId: 'nova_station' });
    harness.controller.handleCommand({
      type: MARKET_COMMAND.BATCH_INVEST_STATIONS,
      systemIds: ['sol_prime', 'nova_station'],
      amount: 5000,
    });
    harness.controller.handleCommand({ type: MARKET_COMMAND.BUILD_STATION, systemId: 'sol_prime' });
    harness.controller.handleCommand({ type: MARKET_COMMAND.UPGRADE_STATION, systemId: 'sol_prime' });
    harness.controller.handleCommand({
      type: MARKET_COMMAND.SET_STATION_STRATEGY,
      systemId: 'sol_prime',
      strategyId: 'balanced',
    });
    harness.controller.handleCommand({
      type: MARKET_COMMAND.BATCH_UPGRADE_STATIONS,
      systemIds: ['sol_prime', 'nova_station'],
    });
    harness.controller.handleCommand({
      type: MARKET_COMMAND.BATCH_SET_STATION_STRATEGY,
      strategyId: 'growth',
      systemIds: ['sol_prime', 'nova_station'],
    });
    expect(harness.controller.handleCommand({
      type: MARKET_COMMAND.FOCUS_REMOTE_SYSTEM,
      systemId: 'nova_station',
    })).toBe(true);

    expect(harness.calls.refuel).toHaveBeenCalledOnce();
    expect(harness.calls.takeLoan).toHaveBeenCalledWith('growth');
    expect(harness.calls.repayLoan).toHaveBeenCalledWith('loan-1');
    expect(harness.calls.investTradeStation).toHaveBeenCalledWith('sol_prime');
    expect(harness.calls.redeemTradeStationInvestment).toHaveBeenCalledWith('nova_station');
    expect(harness.calls.batchInvestTradeStations).toHaveBeenCalledWith(
      ['sol_prime', 'nova_station'],
      5000,
    );
    expect(harness.calls.buildTradeStation).toHaveBeenCalledWith('sol_prime');
    expect(harness.calls.upgradeTradeStation).toHaveBeenCalledWith('sol_prime');
    expect(harness.calls.setTradeStationStrategy).toHaveBeenCalledWith('sol_prime', 'balanced');
    expect(harness.calls.batchUpgradeTradeStations).toHaveBeenCalledWith(['sol_prime', 'nova_station']);
    expect(harness.calls.batchSetTradeStationStrategy).toHaveBeenCalledWith(
      'growth',
      ['sol_prime', 'nova_station'],
    );
    expect(harness.calls.focusNavigationTarget).toHaveBeenCalledWith(
      expect.any(Object),
      'nova_station',
      { title: '前往「新星站」处理市场操作' },
    );
    expect(harness.calls.emitLog.mock.calls[0][0]).toMatchObject({ type: 'tip' });
    expect(harness.calls.emitLog.mock.calls[0][0].text).toContain('星图 · 新星站');
    expect(harness.calls.invalidate).toHaveBeenCalledWith(NAVIGATION_FOCUS_PRESENTATION.dirtyRegions);
    expect(harness.calls.showCompletion).toHaveBeenCalledWith({
      message: '已找到市场航点',
      detail: '检查目标详情后确认航行',
    });
    expect(harness.controller.getDiagnostics()).toMatchObject({
      commandCount: 12,
      rejectedCommandCount: 0,
      lastCommandType: MARKET_COMMAND.FOCUS_REMOTE_SYSTEM,
    });
  });

  it('拒绝未知或结构不完整的 command，不误触发领域动作', function () {
    var harness = createHarness();

    expect(harness.controller.handleCommand({ type: 'market.unknown' })).toBe(false);
    expect(harness.controller.handleCommand({ type: MARKET_COMMAND.TAKE_LOAN })).toBe(false);
    expect(harness.calls.openTradeModal).not.toHaveBeenCalled();
    expect(harness.calls.takeLoan).not.toHaveBeenCalled();
    expect(harness.calls.invalidate).not.toHaveBeenCalled();
    expect(harness.controller.getDiagnostics()).toMatchObject({
      commandCount: 0,
      rejectedCommandCount: 2,
      lastCommandType: null,
    });
  });
});
