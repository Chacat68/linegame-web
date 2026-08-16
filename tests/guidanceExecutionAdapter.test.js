import { describe, expect, it, vi } from 'vitest';
import { createGuidanceExecutionAdapter } from '../js/core/GuidanceExecutionAdapter.js';

function createHarness(options) {
  var config = options || {};
  var state = { id: 'state-a' };
  var token = { id: 'session-a' };
  var activeToken = token;
  var captured = null;
  var controllerModule = {
    handleGuidanceAction: vi.fn(function (suggestion, context) {
      captured = { suggestion: suggestion, context: context };
    }),
  };
  var calls = {
    accept: vi.fn(),
    activateTab: vi.fn(),
    emitLog: vi.fn(),
    executeTravel: vi.fn(),
    explorePoi: vi.fn(),
    forcePending: vi.fn(),
    invalidate: vi.fn(),
    openConfirmation: vi.fn(),
    openRecommendedDispatch: vi.fn(),
    refreshActionGuide: vi.fn(),
    reportFailure: vi.fn(),
    showCompletion: vi.fn(),
    showProcessing: vi.fn(),
    startChain: vi.fn(),
  };
  var adapter = createGuidanceExecutionAdapter({
    getState: function () { return state; },
    getSessionToken: function () { return token; },
    isSessionTokenCurrent: function (requested) { return requested === activeToken; },
    loadController: config.loadController || function () { return Promise.resolve(controllerModule); },
    ports: {
      ui: {
        showProcessing: calls.showProcessing,
        refreshActionGuide: calls.refreshActionGuide,
        reportFailure: calls.reportFailure,
        invalidate: calls.invalidate,
        showCompletion: calls.showCompletion,
        emitLog: calls.emitLog,
      },
      navigation: {
        prepareDirectExecution: vi.fn(),
        activateTab: calls.activateTab,
        focusStarmap: vi.fn(),
        focusNavigationTarget: vi.fn(),
        openMarketPanel: vi.fn(),
        openMarketSystemPanel: vi.fn(),
        revealMarketGoodFocus: vi.fn(),
      },
      trade: { openConfirmation: calls.openConfirmation, refuel: vi.fn() },
      quest: { accept: calls.accept, selectAvailable: vi.fn() },
      fleet: { openRecommendedDispatch: calls.openRecommendedDispatch, openRecommendedMod: vi.fn() },
      events: { forcePending: calls.forcePending },
      teaching: { startChain: calls.startChain },
      exploration: {
        revealArchiveReportFocus: vi.fn(),
        acknowledgeSurveyChainFollowup: vi.fn(),
        acknowledgeSurveyReport: vi.fn(),
        explorePoi: calls.explorePoi,
      },
      travel: { execute: calls.executeTravel },
    },
  });
  return {
    adapter: adapter,
    calls: calls,
    controllerModule: controllerModule,
    getCaptured: function () { return captured; },
    invalidateSession: function () { activeToken = { id: 'session-b' }; },
    replaceState: function (next) { state = next; },
  };
}

describe('GuidanceExecutionAdapter', function () {
  it('把分域 ports 映射为 GuidanceActionController 兼容 context', async function () {
    var harness = createHarness();
    var suggestion = { actionType: 'quest.open', title: '查看任务', actionLabel: '打开档案' };

    await expect(harness.adapter.execute(suggestion)).resolves.toBe(true);

    expect(harness.calls.showProcessing).toHaveBeenCalledWith(suggestion, expect.any(String));
    expect(harness.controllerModule.handleGuidanceAction).toHaveBeenCalledOnce();
    var captured = harness.getCaptured();
    expect(captured.suggestion).toBe(suggestion);
    expect(captured.context.getState()).toEqual({ id: 'state-a' });
    expect(captured.context.acceptQuest).toBe(harness.calls.accept);
    expect(captured.context.activateTab).toBe(harness.calls.activateTab);
    expect(captured.context.openTradeConfirmation).toBe(harness.calls.openConfirmation);
    expect(captured.context.openRecommendedDispatch).toBe(harness.calls.openRecommendedDispatch);
    expect(captured.context.startTeachingChain).toBe(harness.calls.startChain);
    expect(captured.context.explorePoi).toBe(harness.calls.explorePoi);
    expect(captured.context.travel).toBe(harness.calls.executeTravel);
  });

  it('延迟 controller 在 session 替换后不得执行旧建议', async function () {
    var resolveController;
    var harness = createHarness({
      loadController: function () {
        return new Promise(function (resolve) { resolveController = resolve; });
      },
    });

    var pending = harness.adapter.execute({ actionType: 'trade.refuel' });
    harness.replaceState({ id: 'state-b' });
    harness.invalidateSession();
    resolveController(harness.controllerModule);

    await expect(pending).resolves.toBe(false);
    expect(harness.controllerModule.handleGuidanceAction).not.toHaveBeenCalled();
    expect(harness.calls.refreshActionGuide).toHaveBeenCalledOnce();
    expect(harness.adapter.getDiagnostics().staleDropCount).toBe(1);
  });

  it('controller 不可用或加载失败时恢复 Action Guide', async function () {
    var unavailable = createHarness({ loadController: function () { return Promise.resolve(null); } });
    await expect(unavailable.adapter.execute({ actionType: 'event.open' })).resolves.toBe(false);
    expect(unavailable.calls.refreshActionGuide).toHaveBeenCalledOnce();

    var failed = createHarness({ loadController: function () { return Promise.reject(new Error('load failed')); } });
    await expect(failed.adapter.execute({ actionType: 'event.open' })).resolves.toBe(false);
    expect(failed.calls.refreshActionGuide).toHaveBeenCalledOnce();
    expect(failed.calls.reportFailure).toHaveBeenCalledWith(expect.any(Error));
  });

  it('无 actionType 的输入不会进入 processing 或触发加载', async function () {
    var loadController = vi.fn();
    var harness = createHarness({ loadController: loadController });

    await expect(harness.adapter.execute({ title: '缺少动作' })).resolves.toBe(false);
    expect(loadController).not.toHaveBeenCalled();
    expect(harness.calls.showProcessing).not.toHaveBeenCalled();
  });
});
