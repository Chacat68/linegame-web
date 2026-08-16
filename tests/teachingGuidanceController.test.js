import { describe, expect, it, vi } from 'vitest';
import { createTeachingGuidanceController } from '../js/core/TeachingGuidanceController.js';

function createHarness(options) {
  var config = options || {};
  var state = config.state || {
    cargo: { food: 3 },
    credits: 35,
    maxCargo: 5,
  };
  var token = { id: 'session-a' };
  var activeToken = token;
  var logs = [];
  var AutoTrade = config.AutoTrade || {
    findBestTrade: vi.fn(function () {
      return { goodId: 'food', buyPrice: 10, sellSystemName: '半人马港' };
    }),
    findBestSellSystem: vi.fn(function () {
      return { systemId: 'alpha-centauri', systemName: '半人马港' };
    }),
  };
  var Tutorial = {
    isActive: vi.fn(function () { return config.active !== false; }),
    getStep: vi.fn(function () { return config.step || { id: 'buy_goods' }; }),
  };
  var Trade = {
    getTotalCargo: vi.fn(function () { return config.totalCargo === undefined ? 2 : config.totalCargo; }),
  };
  var MidgameTeachingChain = config.MidgameTeachingChain || {
    TEACHING_CHAINS: {
      research: { id: 'research-supply', title: '科研补给', description: '建立科研供应线。' },
    },
    startChain: vi.fn(function () { return true; }),
    completeChainStep: vi.fn(function () { return { completed: true, message: '步骤已完成' }; }),
    checkChainCompletion: vi.fn(function () { return [{ message: '专题已完成' }]; }),
  };
  var Modal = { openTradeModal: vi.fn() };
  var MapUI = { focusNavigationTarget: vi.fn(function () { return true; }) };
  var loadRouteGuidance = config.loadRouteGuidance || vi.fn(function () { return Promise.resolve(AutoTrade); });
  var callbacks = {
    invalidate: vi.fn(),
    refreshActionGuide: vi.fn(),
    reportFailure: vi.fn(),
  };
  var controller = createTeachingGuidanceController({
    getState: function () { return state; },
    getSessionToken: function () { return token; },
    isSessionTokenCurrent: function (requested) { return requested === activeToken; },
    loadRouteGuidance: loadRouteGuidance,
    systems: {
      Tutorial: Tutorial,
      Trade: Trade,
      MidgameTeachingChain: MidgameTeachingChain,
    },
    ui: { Modal: Modal, MapUI: MapUI },
    data: { goods: [{ id: 'food', name: '食物' }] },
    emitLog: function (message) { logs.push(message); },
    invalidate: callbacks.invalidate,
    refreshActionGuide: callbacks.refreshActionGuide,
    reportFailure: callbacks.reportFailure,
  });

  return {
    AutoTrade: AutoTrade,
    callbacks: callbacks,
    controller: controller,
    loadRouteGuidance: loadRouteGuidance,
    logs: logs,
    MapUI: MapUI,
    MidgameTeachingChain: MidgameTeachingChain,
    Modal: Modal,
    Tutorial: Tutorial,
    invalidateSession: function () { activeToken = { id: 'session-b' }; },
    replaceState: function (nextState) { state = nextState; },
  };
}

describe('TeachingGuidanceController', function () {
  it('忽略未知辅助动作和非活动教程，不触发延迟路线模块', async function () {
    var unknown = createHarness();
    await expect(unknown.controller.handleTutorialHelperAction('unknown')).resolves.toBe(false);
    expect(unknown.loadRouteGuidance).not.toHaveBeenCalled();

    var inactive = createHarness({ active: false });
    await expect(inactive.controller.handleTutorialHelperAction('recommend_first_trade')).resolves.toBe(false);
    expect(inactive.loadRouteGuidance).not.toHaveBeenCalled();
  });

  it('首单辅助按资金和货舱计算数量并打开买入确认', async function () {
    var harness = createHarness();

    await expect(harness.controller.handleTutorialHelperAction('recommend_first_trade')).resolves.toBe(true);

    expect(harness.Modal.openTradeModal).toHaveBeenCalledWith(
      'buy',
      { id: 'food', name: '食物' },
      expect.objectContaining({ credits: 35, maxCargo: 5 }),
      'open',
      { initialQuantity: 3 }
    );
    expect(harness.logs).toEqual([{
      text: '🧭 首单建议：买入 食物，卖往 半人马港。确认数量后，下一步会重新核算实际净利。',
      type: 'tip',
    }]);
    expect(harness.controller.getDiagnostics().helperPresentationCount).toBe(1);
  });

  it('卖货路线辅助聚焦星图目标并只失效声明区域', async function () {
    var harness = createHarness({ step: { id: 'travel_hint' } });

    await expect(harness.controller.handleTutorialHelperAction('recommend_sell_route')).resolves.toBe(true);

    expect(harness.MapUI.focusNavigationTarget).toHaveBeenCalledWith(
      expect.objectContaining({ cargo: { food: 3 } }),
      'alpha-centauri',
      { goodId: 'food', title: '教程推荐卖货路线' }
    );
    expect(harness.callbacks.invalidate).toHaveBeenCalledOnce();
    expect(harness.logs[0]).toEqual({
      text: '🧭 已标出 半人马港：请核对卖价、燃料与预计净利，再确认出航。',
      type: 'tip',
    });
  });

  it('延迟路线结果在 session 替换后不会打开旧会话弹层', async function () {
    var resolveRouteGuidance;
    var harness = createHarness({
      loadRouteGuidance: vi.fn(function () {
        return new Promise(function (resolve) { resolveRouteGuidance = resolve; });
      }),
    });

    var pending = harness.controller.handleTutorialHelperAction('recommend_first_trade');
    await Promise.resolve();
    harness.replaceState({ cargo: {}, credits: 999, maxCargo: 99 });
    harness.invalidateSession();
    resolveRouteGuidance(harness.AutoTrade);

    await expect(pending).resolves.toBe(false);
    expect(harness.Modal.openTradeModal).not.toHaveBeenCalled();
    expect(harness.logs).toEqual([]);
    expect(harness.controller.getDiagnostics().staleDropCount).toBe(1);
  });

  it('路线模块执行失败时统一报告并恢复行动引导', async function () {
    var error = new Error('route failed');
    var harness = createHarness({
      loadRouteGuidance: vi.fn(function () { throw error; }),
    });

    await expect(harness.controller.handleTutorialHelperAction('recommend_first_trade')).resolves.toBe(false);
    expect(harness.callbacks.reportFailure).toHaveBeenCalledWith(error);
    expect(harness.callbacks.refreshActionGuide).toHaveBeenCalledOnce();
  });

  it('专题启动、步骤完成与自然完成反馈由同一策略边界发布', function () {
    var harness = createHarness();

    expect(harness.controller.startChain('research-supply')).toBe(true);
    expect(harness.callbacks.invalidate).toHaveBeenCalledOnce();
    expect(harness.controller.completeStep('research-supply', 'prefill-research-supply-dispatch')).toEqual({
      completed: true,
      message: '步骤已完成',
    });
    expect(harness.controller.checkCompletion()).toEqual([{ message: '专题已完成' }]);
    expect(harness.logs).toEqual([
      { text: '🧭 已开始专题「科研补给」：建立科研供应线。', type: 'tip' },
      { text: '步骤已完成', type: 'upgrade' },
      { text: '专题已完成', type: 'upgrade' },
    ]);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      completedStepCount: 1,
      startedChainCount: 1,
    }));

    expect(harness.controller.startChain('unknown')).toBe(false);
    expect(harness.callbacks.refreshActionGuide).toHaveBeenCalledOnce();
    expect(harness.logs.at(-1)).toEqual({
      text: '⚠️ 当前无法启动该专题，请先完成已有专题或解锁对应系统。',
      type: 'error',
    });
  });
});
