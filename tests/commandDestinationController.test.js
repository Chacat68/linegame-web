import { describe, expect, it, vi } from 'vitest';
import { createCommandDestinationController } from '../js/core/CommandDestinationController.js';

function createHarness(options) {
  var config = options || {};
  var state = config.state || {
    activeShipIndex: 0,
    cargo: { ore: 2 },
    credits: 500,
    currentSystem: 'sol_prime',
    fleet: [{ id: 'ship-1', name: '拓荒者', emoji: '🚀' }],
    maxCargo: 10,
  };
  var token = { id: 'session-a' };
  var activeToken = token;
  var loadedArchive = config.loadedArchive || null;
  var archiveUi = config.archiveUi || {
    QuestUI: { setSelectedAvailableQuest: vi.fn() },
    ArchiveExplorationUI: {
      render: vi.fn(),
      revealFocus: vi.fn(),
      setFocus: vi.fn(),
    },
  };
  var fleetUi = config.fleetUi || {
    openDispatchModal: vi.fn(),
    openModModal: vi.fn(),
  };
  var marketUi = config.marketUi || { revealMarketGoodFocus: vi.fn(function () { return true; }) };
  var fleetActions = {
    handleCommand: vi.fn(),
    onAssignRoute: vi.fn(),
    onCancelRoute: vi.fn(),
    onInstallMod: vi.fn(),
    onSellShip: vi.fn(),
    onServiceShip: vi.fn(),
    onUninstallMod: vi.fn(),
    onUpgradeShip: vi.fn(),
  };
  var calls = {
    activateTab: vi.fn(),
    emitLog: vi.fn(),
    invalidate: vi.fn(),
    openTradeModal: vi.fn(),
    refreshActionGuide: vi.fn(),
    renderFleet: vi.fn(),
    showCompletion: vi.fn(),
    syncStateFromShip: vi.fn(),
  };
  var controller = createCommandDestinationController({
    getState: function () { return state; },
    getSessionToken: function () { return token; },
    isSessionTokenCurrent: function (requested) { return requested === activeToken; },
    getLoadedArchive: function () { return loadedArchive; },
    loadArchive: config.loadArchive || function () { return Promise.resolve(archiveUi); },
    loadFleet: config.loadFleet || function () { return Promise.resolve(fleetUi); },
    loadMarket: config.loadMarket || function () { return Promise.resolve(marketUi); },
    getFleetActions: function () { return fleetActions; },
    renderFleet: calls.renderFleet,
    systems: {
      Economy: {
        getBuyPrice: config.getBuyPrice || function () { return 50; },
        getBlackMarketBuyPrice: config.getBlackMarketBuyPrice || function () { return 100; },
      },
      Fleet: {
        getActiveShip: function (currentState) {
          return currentState.fleet && currentState.fleet[currentState.activeShipIndex || 0];
        },
        syncStateFromShip: calls.syncStateFromShip,
      },
    },
    ui: {
      MapUI: { activateTab: calls.activateTab },
      Modal: { openTradeModal: calls.openTradeModal },
    },
    data: {
      goods: [
        { id: 'food', name: '食品' },
        { id: 'ore', name: '矿石' },
      ],
    },
    emitLog: calls.emitLog,
    invalidate: calls.invalidate,
    refreshActionGuide: calls.refreshActionGuide,
    showCompletion: calls.showCompletion,
  });

  return {
    archiveUi: archiveUi,
    calls: calls,
    controller: controller,
    fleetActions: fleetActions,
    fleetUi: fleetUi,
    marketUi: marketUi,
    replaceState: function (nextState) { state = nextState; },
    setLoadedArchive: function (nextArchive) { loadedArchive = nextArchive; },
    invalidateSession: function () {
      token = { id: 'session-b' };
      activeToken = token;
    },
  };
}

describe('CommandDestinationController', function () {
  it('按资金与货舱计算引导买入数量并打开唯一交易确认', function () {
    var harness = createHarness();

    expect(harness.controller.openTradeConfirmation('buy', {
      goodId: 'food',
      questName: '第一桶金',
    })).toBe(true);

    expect(harness.calls.syncStateFromShip).toHaveBeenCalledOnce();
    expect(harness.calls.openTradeModal).toHaveBeenCalledWith(
      'buy',
      { id: 'food', name: '食品' },
      expect.any(Object),
      'open',
      { initialQuantity: 8 },
    );
    expect(harness.calls.emitLog.mock.calls[0][0].text).toContain('第一桶金');
    expect(harness.calls.refreshActionGuide).toHaveBeenCalledOnce();
  });

  it('卖出使用实际货舱数量，非法或不可成交目标只恢复 Guide', function () {
    var harness = createHarness();

    expect(harness.controller.openTradeConfirmation('sell', { goodId: 'ore' })).toBe(true);
    expect(harness.calls.openTradeModal.mock.calls[0][4]).toEqual({ initialQuantity: 2 });

    expect(harness.controller.openTradeConfirmation('buy', { goodId: 'missing' })).toBe(false);
    expect(harness.controller.openTradeConfirmation('sell', { goodId: 'food' })).toBe(false);
    expect(harness.calls.openTradeModal).toHaveBeenCalledOnce();
    expect(harness.calls.emitLog).toHaveBeenCalledTimes(3);
    expect(harness.calls.refreshActionGuide).toHaveBeenCalledTimes(3);
  });

  it('任务选择由 controller 缓存，并在档案 Feature 就绪后只消费一次', async function () {
    var resolveArchive;
    var harness = createHarness({
      loadArchive: function () {
        return new Promise(function (resolve) { resolveArchive = resolve; });
      },
    });

    var pending = harness.controller.selectAvailableQuest('starter_trade');
    expect(harness.controller.getDiagnostics().hasPendingQuestSelection).toBe(true);
    await Promise.resolve();
    resolveArchive(harness.archiveUi);

    await expect(pending).resolves.toBe(true);
    expect(harness.archiveUi.QuestUI.setSelectedAvailableQuest).toHaveBeenCalledWith('starter_trade');
    expect(harness.controller.getDiagnostics().hasPendingQuestSelection).toBe(false);
    expect(harness.controller.syncArchiveView(harness.archiveUi)).toBe(false);
  });

  it('档案已加载时同步选择，reset 会清除未消费选择并隔离旧请求', async function () {
    var resolveArchive;
    var harness = createHarness({
      loadArchive: function () {
        return new Promise(function (resolve) { resolveArchive = resolve; });
      },
    });
    var pending = harness.controller.selectAvailableQuest('old-quest');
    harness.controller.reset();
    harness.invalidateSession();
    await Promise.resolve();
    resolveArchive(harness.archiveUi);

    await expect(pending).resolves.toBe(false);
    expect(harness.archiveUi.QuestUI.setSelectedAvailableQuest).not.toHaveBeenCalled();
    expect(harness.controller.getDiagnostics()).toMatchObject({
      hasPendingQuestSelection: false,
      staleDropCount: 1,
    });

    harness.setLoadedArchive(harness.archiveUi);
    await expect(harness.controller.selectAvailableQuest('current-quest')).resolves.toBe(true);
    expect(harness.archiveUi.QuestUI.setSelectedAvailableQuest).toHaveBeenCalledWith('current-quest');
  });

  it('市场与探索档案焦点在异步完成时重新校验当前 session', async function () {
    var resolveMarket;
    var harness = createHarness({
      loadMarket: function () { return new Promise(function (resolve) { resolveMarket = resolve; }); },
    });

    var marketPending = harness.controller.revealMarketGoodFocus('food', { tradeAction: 'buy' });
    harness.replaceState({ id: 'state-b', fleet: [] });
    harness.invalidateSession();
    await Promise.resolve();
    resolveMarket(harness.marketUi);
    await expect(marketPending).resolves.toBe(false);
    expect(harness.marketUi.revealMarketGoodFocus).not.toHaveBeenCalled();

    var fresh = createHarness();
    await expect(fresh.controller.revealArchiveReportFocus('sol_prime', 'depot-chain')).resolves.toBe(true);
    expect(fresh.archiveUi.ArchiveExplorationUI.setFocus).toHaveBeenCalledWith('sol_prime', 'depot-chain');
    expect(fresh.archiveUi.ArchiveExplorationUI.render).toHaveBeenCalledWith(expect.any(Object));
    expect(fresh.archiveUi.ArchiveExplorationUI.revealFocus).toHaveBeenCalledWith('sol_prime', 'depot-chain');
  });

  it('推荐派遣只在当前 session 打开草稿并呈现完成反馈', async function () {
    var harness = createHarness();
    var recommendation = {
      buySystemId: 'sol_prime',
      buySystemName: '太阳系主站',
      sellSystemId: 'nova_station',
      sellSystemName: '新星站',
      goodId: 'food',
      goodName: '食品',
    };

    await expect(harness.controller.openRecommendedDispatch(recommendation, '科研补给方案', '🛰️'))
      .resolves.toBe(true);

    expect(harness.calls.activateTab).toHaveBeenCalledWith('tab-fleet');
    expect(harness.calls.renderFleet).toHaveBeenCalledWith(harness.fleetUi);
    expect(harness.fleetUi.openDispatchModal).toHaveBeenCalledWith({
      state: expect.any(Object),
      shipIndex: 0,
      onCommand: harness.fleetActions.handleCommand,
      preset: expect.objectContaining({
        buySystemId: 'sol_prime',
        sellSystemId: 'nova_station',
        goodId: 'food',
        tradePolicy: expect.objectContaining({ marketMode: 'open', riskMode: 'balanced' }),
      }),
    });
    expect(harness.calls.showCompletion).toHaveBeenCalledWith({
      message: '已载入跑商路线',
      detail: '确认“开始跑商”后执行路线',
    });
  });

  it('推荐改装在渲染当前舰队后打开目标组件，迟到 FleetUI 不得写旧状态', async function () {
    var harness = createHarness();
    await expect(harness.controller.openRecommendedMod({ shipIndex: 0, modId: 'cargo-pod', focusService: true }))
      .resolves.toBe(true);

    expect(harness.calls.invalidate).not.toHaveBeenCalled();
    expect(harness.calls.renderFleet).toHaveBeenCalledWith(harness.fleetUi);
    expect(harness.fleetUi.openModModal).toHaveBeenCalledWith({
      state: expect.any(Object),
      shipIndex: 0,
      onCommand: harness.fleetActions.handleCommand,
      options: { focusModId: 'cargo-pod', focusService: true },
    });

    var resolveFleet;
    var stale = createHarness({
      loadFleet: function () { return new Promise(function (resolve) { resolveFleet = resolve; }); },
    });
    var pending = stale.controller.openRecommendedMod({ shipIndex: 0 });
    stale.replaceState({ activeShipIndex: 0, fleet: [{ id: 'ship-2' }] });
    stale.invalidateSession();
    await Promise.resolve();
    resolveFleet(stale.fleetUi);
    await expect(pending).resolves.toBe(false);
    expect(stale.fleetUi.openModModal).not.toHaveBeenCalled();
  });
});
