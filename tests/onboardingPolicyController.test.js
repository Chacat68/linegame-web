import { describe, expect, it, vi } from 'vitest';
import { createOnboardingPolicyController } from '../js/core/OnboardingPolicyController.js';

function createHarness(options) {
  var config = options || {};
  var state = { id: 'current-state' };
  var logs = [];
  var Quest = {
    getStarterRecommendations: vi.fn(function () { return config.recommendations || []; }),
    getActiveQuests: vi.fn(function () { return config.activeQuests || []; }),
  };
  var callbacks = {
    refreshActionGuide: vi.fn(),
  };
  var controller = createOnboardingPolicyController({
    Quest: Quest,
    getState: function () { return state; },
    emitLog: function (message) { logs.push(message); },
    refreshActionGuide: callbacks.refreshActionGuide,
  });
  return {
    callbacks: callbacks,
    controller: controller,
    logs: logs,
    Quest: Quest,
    replaceState: function (nextState) { state = nextState; },
  };
}

describe('OnboardingPolicyController', function () {
  it('欢迎信息按稳定顺序发布且不触发视图刷新', function () {
    var harness = createHarness();

    harness.controller.showWelcomeMessages();

    expect(harness.logs).toHaveLength(4);
    expect(harness.logs[0]).toEqual({
      text: '🚀 欢迎来到银河历 3045 年！您的星际贸易之旅由此开始……',
      type: 'info',
    });
    expect(harness.logs[3]).toEqual({
      text: '📋 新功能：【档案】入口可接取任务、查看探索报告、研究科技、查看派系与成就，右上角【设置】可管理存档！',
      type: 'tip',
    });
    expect(harness.controller.getDiagnostics().welcomeCount).toBe(1);
  });

  it('已有活动任务时先陈述当前任务，再补充后续任务候选', function () {
    var harness = createHarness({
      activeQuests: [{ id: 'active', name: '首轮交易' }],
      recommendations: [{ id: 'next', name: '第二航线' }],
    });

    expect(harness.controller.recommendStarterQuests()).toEqual([{ id: 'next', name: '第二航线' }]);

    expect(harness.Quest.getStarterRecommendations).toHaveBeenCalledWith({ id: 'current-state' }, 3);
    expect(harness.logs).toEqual([
      { text: '📋 当前正在推进「首轮交易」，底部当前行动会继续给出可直接执行的下一步。', type: 'info' },
      { text: '🧭 跑完手头这单后，还可以继续接 「第二航线」。', type: 'tip' },
    ]);
  });

  it('无活动任务时区分可接任务与尚未解锁的空态', function () {
    var available = createHarness({
      recommendations: [{ id: 'starter', name: '正式委托' }],
    });
    expect(available.controller.recommendStarterQuests()).toHaveLength(1);
    expect(available.logs).toEqual([
      { text: '📋 可接取任务：「正式委托」。', type: 'tip' },
      { text: '🧭 底部当前行动会直接接取并推进适合作为教程后第一阶段目标的任务。', type: 'info' },
    ]);

    var empty = createHarness();
    expect(empty.controller.recommendStarterQuests()).toEqual([]);
    expect(empty.logs).toEqual([{
      text: '📋 教程结束后可前往任务页查看当前章节任务，继续推进你的贸易生涯。',
      type: 'tip',
    }]);
  });

  it('教程完成策略发布完成反馈、重算推荐并刷新唯一行动引导', function () {
    var harness = createHarness({ recommendations: [{ id: 'starter', name: '正式委托' }] });

    expect(harness.controller.handleTutorialComplete()).toHaveLength(1);

    expect(harness.logs[0]).toEqual({
      text: '🧭 操作教程完成。底部当前行动会继续引导你登记首轮交易并进入正式委托。',
      type: 'tip',
    });
    expect(harness.callbacks.refreshActionGuide).toHaveBeenCalledOnce();
    expect(harness.controller.getDiagnostics()).toEqual({
      recommendationCount: 1,
      tutorialCompletionCount: 1,
      welcomeCount: 0,
    });
  });
});
