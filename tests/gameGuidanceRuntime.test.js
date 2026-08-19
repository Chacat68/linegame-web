import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGameGuidanceRuntime } from '../js/core/GameGuidanceRuntime.js';

function createHarness() {
  var state = { id: 'state-a' };
  var token = { id: 'token-a' };
  var configurations = {};
  var featureModules = {
    archive: { id: 'archive' },
    fleet: { id: 'fleet' },
    guidanceAction: { id: 'guidance-action' },
    market: { id: 'market' },
    routeGuidance: { id: 'route-guidance' },
  };
  var features = {
    get: vi.fn(function (feature) { return featureModules[feature] || null; }),
    load: vi.fn(function (feature) { return Promise.resolve(featureModules[feature] || null); }),
  };
  var actionGuide = {
    getDiagnostics: vi.fn(function () { return { owner: 'guide' }; }),
    getDispatchContext: vi.fn(function () { return { dispatch: true }; }),
    prefetchForState: vi.fn(function () { return Promise.resolve([]); }),
    refresh: vi.fn(function () { return { id: 'suggestion' }; }),
    reset: vi.fn(),
    setRecentModInstallContext: vi.fn(),
    showCompletion: vi.fn(),
    showProcessing: vi.fn(),
  };
  var commands = {
    getDiagnostics: vi.fn(function () { return { owner: 'commands' }; }),
    openRecommendedDispatch: vi.fn(),
    openRecommendedMod: vi.fn(),
    openTradeConfirmation: vi.fn(),
    reset: vi.fn(),
    revealArchiveReportFocus: vi.fn(),
    revealMarketGoodFocus: vi.fn(),
    selectAvailableQuest: vi.fn(),
    syncArchiveView: vi.fn(),
  };
  var execution = {
    execute: vi.fn(function () { return Promise.resolve(true); }),
    getDiagnostics: vi.fn(function () { return { owner: 'execution' }; }),
  };
  var policy = {
    getDiagnostics: vi.fn(function () { return { owner: 'policy' }; }),
    showWelcomeMessages: vi.fn(),
  };
  var teaching = {
    checkCompletion: vi.fn(),
    completeStep: vi.fn(),
    getDiagnostics: vi.fn(function () { return { owner: 'teaching' }; }),
    handleTutorialHelperAction: vi.fn(),
    startChain: vi.fn(),
  };
  var onboarding = {
    getDiagnostics: vi.fn(function () { return { owner: 'onboarding' }; }),
    syncTutorialView: vi.fn(),
  };
  var reportError = vi.fn();
  var emitLog = vi.fn();
  var exploration = {
    acknowledgeChainFollowup: vi.fn(function (current) { return current.id; }),
    acknowledgeSurveyReport: vi.fn(function (current) { return current.id; }),
  };
  var factories = {
    createActionGuide: vi.fn(function (config) {
      configurations.actionGuide = config;
      return actionGuide;
    }),
    createCommandDestinations: vi.fn(function (config) {
      configurations.commands = config;
      return commands;
    }),
    createExecutionAdapter: vi.fn(function (config) {
      configurations.execution = config;
      return execution;
    }),
    createOnboardingPolicy: vi.fn(function (config) {
      configurations.policy = config;
      return policy;
    }),
    createOnboardingUi: vi.fn(function (config) {
      configurations.onboarding = config;
      return onboarding;
    }),
    createTeaching: vi.fn(function (config) {
      configurations.teaching = config;
      return teaching;
    }),
  };
  var actions = {
    acceptQuest: vi.fn(),
    explorePoi: vi.fn(),
    getFleetActions: vi.fn(function () { return { onAssignRoute: vi.fn() }; }),
    getPoiStatus: vi.fn(),
    refuel: vi.fn(),
    travel: vi.fn(),
  };
  var runtime = createGameGuidanceRuntime({
    getState: function () { return state; },
    getSessionToken: function () { return token; },
    isSessionTokenCurrent: function (candidate) { return candidate === token; },
    features: features,
    systems: {
      Economy: {},
      Exploration: exploration,
      Fleet: {},
      GalaxyData: {},
      Guidance: {},
      MidgameTeachingChain: {},
      Quest: {},
      Trade: {},
      Tutorial: {},
    },
    ui: {
      ActionGuideUI: {},
      EventUI: { forcePendingEvent: vi.fn() },
      MapUI: { focusStarmap: vi.fn() },
      Modal: {},
      UIManager: {},
    },
    actions: actions,
    selectors: { hasBlockingSurfaceOpen: vi.fn(function () { return false; }) },
    callbacks: {
      emitLog: emitLog,
      invalidate: vi.fn(),
      renderFleet: vi.fn(),
      reportError: reportError,
    },
    factories: factories,
  });

  return {
    actionGuide: actionGuide,
    actions: actions,
    commands: commands,
    configurations: configurations,
    emitLog: emitLog,
    execution: execution,
    exploration: exploration,
    features: features,
    onboarding: onboarding,
    policy: policy,
    reportError: reportError,
    runtime: runtime,
    setState: function (next) { state = next; },
    teaching: teaching,
  };
}

describe('GameGuidanceRuntime', function () {
  it('组合六个 controller，并把公开端口代理到唯一实例', async function () {
    var harness = createHarness();

    expect(harness.runtime.actionGuide).toBe(harness.actionGuide);
    expect(harness.runtime.commandDestinations).toBe(harness.commands);
    expect(harness.runtime.onboardingUi).toBe(harness.onboarding);
    expect(harness.runtime.onboardingPolicy).toBe(harness.policy);
    expect(harness.runtime.refresh()).toEqual({ id: 'suggestion' });
    await expect(harness.runtime.execute({ actionType: 'travel' })).resolves.toBe(true);
    harness.runtime.showCompletion({ message: '完成', detail: '详情' }, { duration: 1 });
    harness.runtime.reset();

    expect(harness.execution.execute).toHaveBeenCalledWith({ actionType: 'travel' });
    expect(harness.actionGuide.showCompletion).toHaveBeenCalledWith('完成', '详情', { duration: 1 });
    expect(harness.actionGuide.reset).toHaveBeenCalledOnce();
    expect(harness.commands.reset).toHaveBeenCalledOnce();
    expect(harness.runtime.getDiagnostics()).toEqual({
      actionGuide: { owner: 'guide' },
      commands: { owner: 'commands' },
      execution: { owner: 'execution' },
      onboarding: { owner: 'onboarding' },
      policy: { owner: 'policy' },
      teaching: { owner: 'teaching' },
    });
  });

  it('全部延迟入口复用同一 Feature 端口', async function () {
    var harness = createHarness();

    await harness.configurations.teaching.loadRouteGuidance();
    await harness.configurations.commands.loadArchive();
    await harness.configurations.commands.loadFleet();
    await harness.configurations.commands.loadMarket();
    await harness.configurations.execution.loadController();

    expect(harness.features.load.mock.calls.map(function (call) { return call[0]; })).toEqual([
      'routeGuidance', 'archive', 'fleet', 'market', 'guidanceAction',
    ]);
    expect(harness.configurations.commands.getLoadedArchive()).toEqual({ id: 'archive' });
  });

  it('组合端口在执行时读取最新 state，并保持 command 交叉引用', function () {
    var harness = createHarness();
    var nextState = { id: 'state-b' };
    harness.setState(nextState);

    expect(harness.configurations.execution.ports.exploration.acknowledgeSurveyChainFollowup('sol', 'chain')).toBe('state-b');
    expect(harness.configurations.execution.ports.exploration.acknowledgeSurveyReport('sol', 'report')).toBe('state-b');
    harness.configurations.actionGuide.hooks.onAction({ actionType: 'quest' });
    harness.configurations.onboarding.callbacks.onHelperAction('recommend_first_trade');
    harness.configurations.onboarding.callbacks.showWelcomeMessages();

    expect(harness.exploration.acknowledgeChainFollowup).toHaveBeenCalledWith(nextState, 'sol', 'chain');
    expect(harness.exploration.acknowledgeSurveyReport).toHaveBeenCalledWith(nextState, 'sol', 'report');
    expect(harness.execution.execute).toHaveBeenCalledWith({ actionType: 'quest' });
    expect(harness.teaching.handleTutorialHelperAction).toHaveBeenCalledWith('recommend_first_trade');
    expect(harness.policy.showWelcomeMessages).toHaveBeenCalledOnce();
  });

  it('教学与执行失败由运行时统一产生可见反馈', function () {
    var harness = createHarness();
    var teachingError = new Error('route failed');
    var executionError = new Error('action failed');

    harness.configurations.teaching.reportFailure(teachingError);
    harness.configurations.execution.ports.ui.reportFailure(executionError);

    expect(harness.reportError.mock.calls).toEqual([
      ['teaching-route', teachingError],
      ['guidance-action', executionError],
    ]);
    expect(harness.emitLog.mock.calls.map(function (call) { return call[0]; })).toEqual([
      { text: '⚠️ 教程路线辅助暂时不可用，请稍后重试。', type: 'error' },
      { text: '⚠️ 当前行动执行失败，请重试。', type: 'error' },
    ]);
  });

  it('GameApplication 只持有 GameGuidanceRuntime，不再逐个组合引导 controller', function () {
    var gameManager = readFileSync('js/core/GameApplication.js', 'utf8') + '\n' +
      readFileSync('js/core/GameRuntimeNodeFactories.js', 'utf8');
    var runtime = readFileSync('js/core/GameGuidanceRuntime.js', 'utf8');
    var migratedFactories = [
      'createActionGuideCoordinator',
      'createCommandDestinationController',
      'createGuidanceExecutionAdapter',
      'createOnboardingPolicyController',
      'createOnboardingUiController',
      'createTeachingGuidanceController',
    ];

    expect(gameManager).toContain("from './GameGuidanceRuntime.js'");
    expect(gameManager).toContain('createGameGuidanceRuntime({');
    migratedFactories.forEach(function (factory) {
      expect(gameManager).not.toContain(factory);
      expect(runtime).toContain(factory);
    });
    expect(gameManager).not.toContain('function _getActionGuideCoordinator');
    expect(gameManager).not.toContain('function _getCommandDestinationController');
    expect(gameManager).not.toContain('function _getGuidanceExecutionAdapter');
    expect(gameManager).not.toContain('function _getOnboardingUiController');
    expect(gameManager).not.toContain('function _getOnboardingPolicyController');
    expect(gameManager).not.toContain('function _getTeachingGuidanceController');
  });
});
