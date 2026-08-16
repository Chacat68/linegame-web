import { describe, expect, it, vi } from 'vitest';
import { createOnboardingUiController } from '../js/core/OnboardingUiController.js';

function createButton() {
  var listeners = new Map();
  return {
    dataset: {},
    addEventListener: vi.fn(function (type, listener) { listeners.set(type, listener); }),
    removeEventListener: vi.fn(function (type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    }),
    click: function () {
      var listener = listeners.get('click');
      if (listener) listener({ preventDefault: vi.fn() });
    },
  };
}

function createHarness(options) {
  var config = options || {};
  var state = config.state || { companyName: '旧公司' };
  var token = { id: 'session-a' };
  var activeToken = token;
  var button = createButton();
  var tutorialCallbacks = null;
  var onboardingCallbacks = null;
  var renameCallbacks = null;
  var tutorialView = {
    init: vi.fn(function (onAdvance, onSkip, onHelperAction) {
      tutorialCallbacks = { onAdvance: onAdvance, onSkip: onSkip, onHelperAction: onHelperAction };
    }),
  };
  var onboardingView = {
    showTutorialStart: vi.fn(function (callbacks) { onboardingCallbacks = callbacks; return true; }),
    showCompanyRename: vi.fn(function (callbacks) { renameCallbacks = callbacks; return true; }),
  };
  var features = {
    load: vi.fn(function (feature) {
      if (config.load) return config.load(feature, { onboarding: onboardingView, tutorial: tutorialView });
      return Promise.resolve(feature === 'tutorial' ? tutorialView : onboardingView);
    }),
  };
  var Tutorial = {
    advance: vi.fn(),
    skip: vi.fn(),
    start: vi.fn(),
  };
  var callbacks = {
    emitMessage: vi.fn(),
    invalidate: vi.fn(),
    onHelperAction: vi.fn(),
    refreshActionGuide: vi.fn(),
    renameCompany: vi.fn(function (currentState, name) { currentState.companyName = name; }),
    showWelcomeMessages: vi.fn(),
  };
  var controller = createOnboardingUiController({
    features: features,
    Tutorial: Tutorial,
    getState: function () { return state; },
    getSessionToken: function () { return token; },
    isSessionTokenCurrent: function (requested) { return requested === activeToken; },
    getDocument: function () {
      return { getElementById: function (id) { return id === 'company-name-display' ? button : null; } };
    },
    callbacks: callbacks,
  });
  return {
    button: button,
    callbacks: callbacks,
    controller: controller,
    features: features,
    onboardingView: onboardingView,
    tutorialView: tutorialView,
    Tutorial: Tutorial,
    getOnboardingCallbacks: function () { return onboardingCallbacks; },
    getRenameCallbacks: function () { return renameCallbacks; },
    getTutorialCallbacks: function () { return tutorialCallbacks; },
    invalidateSession: function () { activeToken = { id: 'session-b' }; },
    replaceState: function (next) { state = next; },
  };
}

describe('OnboardingUiController', function () {
  it('同步 TutorialUI 时注入推进、跳过、辅助动作与增量刷新端口', function () {
    var harness = createHarness();

    expect(harness.controller.syncTutorialView(harness.tutorialView)).toBe(true);
    var bound = harness.getTutorialCallbacks();
    bound.onAdvance();
    bound.onSkip();
    bound.onHelperAction('recommend_first_trade');

    expect(harness.Tutorial.advance).toHaveBeenCalledOnce();
    expect(harness.Tutorial.skip).toHaveBeenCalledOnce();
    expect(harness.callbacks.invalidate).toHaveBeenCalledTimes(2);
    expect(harness.callbacks.onHelperAction).toHaveBeenCalledWith('recommend_first_trade');
  });

  it('首次进入选择开始后先加载并同步教程视图，再启动当前 session 教程', async function () {
    var harness = createHarness();

    await expect(harness.controller.showTutorialStart()).resolves.toBe(true);
    await expect(harness.getOnboardingCallbacks().onStart()).resolves.toBe(true);

    expect(harness.features.load.mock.calls.map(function (call) { return call[0]; })).toEqual([
      'onboarding',
      'tutorial',
    ]);
    expect(harness.tutorialView.init).toHaveBeenCalledOnce();
    expect(harness.Tutorial.start).toHaveBeenCalledOnce();
    expect(harness.controller.getDiagnostics().tutorialStartCount).toBe(1);
  });

  it('首次进入选择跳过时显示欢迎信息并只失效声明区域', async function () {
    var harness = createHarness();
    await harness.controller.showTutorialStart();

    expect(harness.getOnboardingCallbacks().onSkip()).toBe(true);
    expect(harness.Tutorial.skip).toHaveBeenCalledOnce();
    expect(harness.callbacks.showWelcomeMessages).toHaveBeenCalledOnce();
    expect(harness.callbacks.invalidate).toHaveBeenCalledOnce();
  });

  it('延迟 OnboardingUI 在 session 替换后不得呈现或写回旧状态', async function () {
    var resolveView;
    var harness = createHarness({
      load: function () { return new Promise(function (resolve) { resolveView = resolve; }); },
    });

    var pending = harness.controller.showTutorialStart();
    harness.replaceState({ companyName: '新会话' });
    harness.invalidateSession();
    resolveView(harness.onboardingView);

    await expect(pending).resolves.toBe(false);
    expect(harness.onboardingView.showTutorialStart).not.toHaveBeenCalled();
  });

  it('公司入口由 controller 幂等绑定，确认后写入当前会话并发布反馈', async function () {
    var harness = createHarness();

    expect(harness.controller.bindCompanyLauncher()).toBe(true);
    expect(harness.controller.bindCompanyLauncher()).toBe(true);
    expect(harness.button.addEventListener).toHaveBeenCalledOnce();
    harness.button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.onboardingView.showCompanyRename).toHaveBeenCalledOnce();
    expect(harness.getRenameCallbacks().onConfirm('新公司')).toBe(true);
    expect(harness.callbacks.renameCompany).toHaveBeenCalledWith(expect.any(Object), '新公司');
    expect(harness.callbacks.invalidate).toHaveBeenCalledOnce();
    expect(harness.callbacks.emitMessage).toHaveBeenCalledWith({
      text: '🏢 公司已正式更名为「新公司」！愿财富与你同行！',
      type: 'upgrade',
    });
  });

  it('公司改名弹层打开后若 session 变化，确认不得污染新状态', async function () {
    var oldState = { companyName: '旧公司' };
    var newState = { companyName: '新会话公司' };
    var harness = createHarness({ state: oldState });
    await harness.controller.showCompanyRename();
    harness.replaceState(newState);
    harness.invalidateSession();

    expect(harness.getRenameCallbacks().onConfirm('不应写入')).toBe(false);
    expect(oldState.companyName).toBe('旧公司');
    expect(newState.companyName).toBe('新会话公司');
    expect(harness.callbacks.renameCompany).not.toHaveBeenCalled();
  });
});
