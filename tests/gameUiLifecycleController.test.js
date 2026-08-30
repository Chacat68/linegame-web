import { describe, expect, it, vi } from 'vitest';
import { createGameUiLifecycleController } from '../js/core/GameUiLifecycleController.js';

function createEventBus() {
  var listeners = new Map();
  return {
    on: vi.fn(function (event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    }),
    off: vi.fn(function (event, listener) {
      if (listeners.has(event)) listeners.get(event).delete(listener);
    }),
    emit: function (event, payload) {
      Array.from(listeners.get(event) || []).forEach(function (listener) { listener(payload); });
    },
    listenerCount: function (event) { return (listeners.get(event) || new Set()).size; },
  };
}

function createHarness(options) {
  var config = options || {};
  var state = { id: 'state-a' };
  var revision = 4;
  var tabCallback = null;
  var navigationHandlers = null;
  var telemetry = [];
  var logs = [];
  var events = createEventBus();
  var HUD = { dispose: vi.fn(), init: vi.fn(), setVictoryActions: vi.fn() };
  var MapUI = {
    dispose: vi.fn(),
    init: vi.fn(),
    init3DCallbacks: vi.fn(),
    setExplorationActions: vi.fn(),
    setNavigationActions: vi.fn(),
    setNavigationChangeCallback: vi.fn(),
  };
  var MarketWorkspaceEntry = {
    close: vi.fn(),
    dispose: vi.fn(),
    init: vi.fn(),
    openSystemPanel: vi.fn(),
  };
  var WorkspaceTabs = {
    dispose: vi.fn(),
    getDiagnostics: vi.fn(function () { return { activeArchiveTab: 'tab-quest' }; }),
    init: vi.fn(),
    openArchive: vi.fn(),
    setOnChange: vi.fn(function (callback) { tabCallback = callback; }),
  };
  var UIManager = {
    dispose: vi.fn(),
    init: vi.fn(function (provider, handlers) { navigationHandlers = handlers; }),
    switchView: vi.fn(),
  };
  var WorkspaceDetailSurface = { init: vi.fn(), refresh: vi.fn(), dispose: vi.fn() };
  var ActionConfirmUI = { dispose: vi.fn() };
  var Modal = { dispose: vi.fn(), init: vi.fn() };
  var Renderer = config.Renderer || {
    whenSceneReady: vi.fn(function () { return Promise.resolve({ renderer: 'three' }); }),
    getActiveRendererName: vi.fn(function () { return 'fallback'; }),
  };
  var Tutorial = {
    checkTabClick: vi.fn(),
    isCompleted: vi.fn(function () { return config.tutorialCompleted === true; }),
  };
  var controllers = {
    actionGuide: { init: vi.fn(), dispose: vi.fn() },
    onboardingUi: {
      bindCompanyLauncher: vi.fn(),
      dispose: vi.fn(),
      showTutorialStart: vi.fn(),
    },
    onboardingPolicy: {
      handleTutorialComplete: vi.fn(),
      showWelcomeMessages: vi.fn(),
    },
    settingsUi: { bindLauncher: vi.fn(), dispose: vi.fn() },
  };
  var features = {
    getState: vi.fn(function (feature) { return feature + '-ready'; }),
    sync: vi.fn(),
  };
  var ports = {
    chooseVictoryPolicy: vi.fn(),
    closeMarket: vi.fn(),
    confirmTrade: vi.fn(),
    ensureArchive: vi.fn(),
    ensureFleet: vi.fn(),
    explorePoi: vi.fn(),
    galaxyJump: vi.fn(),
    getPoiStatus: vi.fn(),
    isMarketOpen: vi.fn(function () { return true; }),
    onArchiveTabChanged: vi.fn(),
    openMarket: vi.fn(),
    openQuests: vi.fn(),
    refreshActionGuide: vi.fn(),
    refreshMarket: vi.fn(),
    travel: vi.fn(),
  };
  var controller = createGameUiLifecycleController({
    getState: function () { return state; },
    getRevision: function () { return revision; },
    features: features,
    events: events,
    ui: {
      ActionConfirmUI: ActionConfirmUI,
      HUD: HUD,
      MapUI: MapUI,
      UIManager: UIManager,
      Modal: Modal,
      Renderer: Renderer,
      WorkspaceDetailSurface: WorkspaceDetailSurface,
      MarketWorkspaceEntry: MarketWorkspaceEntry,
      WorkspaceTabs: WorkspaceTabs,
    },
    systems: { Tutorial: Tutorial },
    controllers: controllers,
    ports: ports,
    setTelemetryState: function (surface, value) { telemetry.push([surface, value]); },
    emitLog: function (message) { logs.push(message); },
  });

  return {
    ActionConfirmUI: ActionConfirmUI,
    controller: controller,
    controllers: controllers,
    events: events,
    features: features,
    getNavigationHandlers: function () { return navigationHandlers; },
    getTabCallback: function () { return tabCallback; },
    HUD: HUD,
    logs: logs,
    MapUI: MapUI,
    MarketWorkspaceEntry: MarketWorkspaceEntry,
    Modal: Modal,
    ports: ports,
    Renderer: Renderer,
    telemetry: telemetry,
    Tutorial: Tutorial,
    UIManager: UIManager,
    WorkspaceDetailSurface: WorkspaceDetailSurface,
    WorkspaceTabs: WorkspaceTabs,
    replaceState: function (next) { state = next; },
    setRevision: function (next) { revision = next; },
  };
}

describe('GameUiLifecycleController', function () {
  it('初始化 eager UI 壳并向所有长期模块注入 latest-state provider', function () {
    var harness = createHarness();

    expect(harness.controller.initialize()).toBe(true);

    var hudOptions = harness.HUD.init.mock.calls[0][0];
    var mapProvider = harness.MapUI.init.mock.calls[0][0];
    var managerProvider = harness.UIManager.init.mock.calls[0][0];
    harness.replaceState({ id: 'state-b' });
    harness.setRevision(5);
    expect(hudOptions.stateSource()).toEqual({ id: 'state-b' });
    expect(hudOptions.revisionSource()).toBe(5);
    expect(mapProvider()).toEqual({ id: 'state-b' });
    expect(managerProvider()).toEqual({ id: 'state-b' });
    expect(harness.WorkspaceDetailSurface.init).toHaveBeenCalledWith({
      navigation: harness.UIManager,
      stateSource: expect.any(Function),
      revisionSource: expect.any(Function),
    });
    expect(harness.UIManager.init.mock.invocationCallOrder[0]).toBeLessThan(
      harness.WorkspaceDetailSurface.init.mock.invocationCallOrder[0]
    );
    expect(harness.MapUI.setNavigationActions).toHaveBeenCalledWith({
      navigate: harness.UIManager.switchView,
      closeMarket: harness.MarketWorkspaceEntry.close,
      openMarketSystemPanel: harness.MarketWorkspaceEntry.openSystemPanel,
    });
    expect(harness.WorkspaceDetailSurface.init.mock.invocationCallOrder[0]).toBeLessThan(
      harness.MapUI.init.mock.invocationCallOrder[0]
    );
    var detailOptions = harness.WorkspaceDetailSurface.init.mock.calls[0][0];
    expect(detailOptions.stateSource()).toEqual({ id: 'state-b' });
    expect(detailOptions.revisionSource()).toBe(5);
    expect(harness.HUD.setVictoryActions).toHaveBeenCalledWith({
      onChoosePolicy: harness.ports.chooseVictoryPolicy,
    });
    expect(harness.MapUI.init3DCallbacks).toHaveBeenCalledWith(
      expect.any(Function),
      harness.ports.travel,
      harness.ports.galaxyJump
    );
    expect(harness.Modal.init).toHaveBeenCalledWith(harness.ports.confirmTrade);
    expect(harness.features.sync).toHaveBeenCalledWith('tutorial');
    expect(harness.telemetry).toEqual([
      ['guidanceAction', 'guidanceAction-ready'],
      ['onboarding', 'onboarding-ready'],
    ]);
    expect(harness.controllers.actionGuide.init).toHaveBeenCalledOnce();
    expect(harness.controllers.onboardingUi.bindCompanyLauncher).toHaveBeenCalledOnce();
    expect(harness.controllers.settingsUi.bindLauncher).toHaveBeenCalledOnce();
  });

  it('工作区导航与旧标签入口只负责请求对应 Feature', function () {
    var harness = createHarness();
    harness.controller.initialize();

    var handlers = harness.getNavigationHandlers();
    var state = { id: 'navigation-state' };
    handlers.onOpenMarket(state);
    handlers.onCloseMarket({ restoreFocus: false });
    expect(handlers.onGetMarketOpen()).toBe(true);
    handlers.onOpenHangar();
    handlers.onOpenQuests(state);

    expect(harness.ports.openMarket).toHaveBeenCalledWith(state);
    expect(harness.ports.closeMarket).toHaveBeenCalledWith({ restoreFocus: false });
    expect(harness.ports.ensureFleet).toHaveBeenCalledOnce();
    expect(harness.WorkspaceTabs.openArchive).toHaveBeenCalledWith(state);
    expect(harness.ports.ensureArchive).toHaveBeenCalledOnce();

    var onTab = harness.getTabCallback();
    onTab('tab-fleet');
    onTab('tab-research', { changed: true, previousTabId: 'tab-quest' });
    onTab('tab-research', { changed: false, previousTabId: 'tab-research' });
    onTab('tab-market');
    expect(harness.ports.ensureFleet).toHaveBeenCalledTimes(2);
    expect(harness.ports.ensureArchive).toHaveBeenCalledTimes(3);
    expect(harness.ports.onArchiveTabChanged).toHaveBeenCalledOnce();
    expect(harness.ports.onArchiveTabChanged).toHaveBeenCalledWith('tab-research', 'tab-quest');
    expect(harness.Tutorial.checkTabClick.mock.calls.map(function (call) { return call[0]; })).toEqual([
      'tab-fleet', 'tab-research', 'tab-research', 'tab-market',
    ]);
  });

  it('重复初始化只保留一个教程完成 listener，dispose 后不再响应', function () {
    var harness = createHarness();

    harness.controller.initialize();
    harness.controller.initialize();
    expect(harness.events.listenerCount('tutorial:complete')).toBe(1);
    expect(harness.events.listenerCount('logs:history:changed')).toBe(1);
    harness.events.emit('logs:history:changed', { count: 3 });
    expect(harness.WorkspaceDetailSurface.refresh).toHaveBeenCalledOnce();
    harness.events.emit('tutorial:complete');
    expect(harness.controllers.onboardingPolicy.handleTutorialComplete).toHaveBeenCalledOnce();

    expect(harness.controller.dispose()).toBe(true);
    expect(harness.controller.dispose()).toBe(false);
    expect(harness.events.listenerCount('tutorial:complete')).toBe(0);
    expect(harness.events.listenerCount('logs:history:changed')).toBe(0);
    harness.events.emit('tutorial:complete');
    expect(harness.controllers.onboardingPolicy.handleTutorialComplete).toHaveBeenCalledOnce();
    expect(harness.controllers.onboardingUi.dispose).toHaveBeenCalledOnce();
    expect(harness.ActionConfirmUI.dispose).toHaveBeenCalledOnce();
    expect(harness.Modal.dispose).toHaveBeenCalledOnce();
    expect(harness.MapUI.setNavigationActions).toHaveBeenLastCalledWith(null);
    expect(harness.controllers.settingsUi.dispose).toHaveBeenCalledOnce();
    expect(harness.controllers.actionGuide.dispose).toHaveBeenCalledOnce();
    expect(harness.HUD.dispose).toHaveBeenCalledOnce();
    expect(harness.MapUI.setNavigationChangeCallback).toHaveBeenLastCalledWith(null);
    expect(harness.MapUI.setExplorationActions).toHaveBeenLastCalledWith(null);
    expect(harness.MapUI.dispose).toHaveBeenCalledOnce();
    expect(harness.WorkspaceDetailSurface.dispose).toHaveBeenCalledOnce();
    expect(harness.UIManager.dispose).toHaveBeenCalledOnce();
    expect(harness.controller.getDiagnostics()).toEqual({
      disposed: true,
      entryPresentationCount: 0,
      initializeCount: 2,
      initialized: false,
      logsHistoryChangedListenerBound: false,
      tutorialCompleteListenerBound: false,
      workspaceTabs: { activeArchiveTab: 'tab-quest' },
    });
  });

  it('进入恢复会话时发布恢复反馈并按教程状态选择唯一 onboarding 呈现', function () {
    var incomplete = createHarness();
    incomplete.controller.presentEntry({ restoredAutosave: true });
    expect(incomplete.logs).toEqual([{ text: '📂 已自动恢复最近进度。', type: 'info' }]);
    expect(incomplete.controllers.onboardingUi.showTutorialStart).toHaveBeenCalledOnce();
    expect(incomplete.controllers.onboardingPolicy.showWelcomeMessages).not.toHaveBeenCalled();

    var completed = createHarness({ tutorialCompleted: true });
    completed.controller.presentEntry();
    expect(completed.controllers.onboardingUi.showTutorialStart).not.toHaveBeenCalled();
    expect(completed.controllers.onboardingPolicy.showWelcomeMessages).toHaveBeenCalledOnce();
    expect(completed.controller.getDiagnostics().entryPresentationCount).toBe(1);
  });

  it('场景就绪 Promise 由 UI 生命周期边界转发并提供回退诊断', async function () {
    var ready = createHarness();
    await expect(ready.controller.whenSceneReady()).resolves.toEqual({ renderer: 'three' });
    expect(ready.Renderer.whenSceneReady).toHaveBeenCalledOnce();

    var fallback = createHarness({
      Renderer: { getActiveRendererName: vi.fn(function () { return '2d'; }) },
    });
    await expect(fallback.controller.whenSceneReady()).resolves.toEqual({ renderer: '2d' });
  });

  it('尚未初始化时 dispose 不会反向绑定 MapUI 或 Modal', function () {
    var harness = createHarness();

    harness.controller.dispose();

    expect(harness.MapUI.dispose).toHaveBeenCalledOnce();
    expect(harness.WorkspaceDetailSurface.dispose).toHaveBeenCalledOnce();
    expect(harness.UIManager.dispose).toHaveBeenCalledOnce();
    expect(harness.WorkspaceTabs.init).not.toHaveBeenCalled();
    expect(harness.MapUI.setExplorationActions).not.toHaveBeenCalled();
    expect(harness.Modal.init).not.toHaveBeenCalled();
    expect(harness.Modal.dispose).toHaveBeenCalledOnce();
    expect(harness.ActionConfirmUI.dispose).toHaveBeenCalledOnce();
    expect(harness.events.listenerCount('tutorial:complete')).toBe(0);
    expect(harness.events.listenerCount('logs:history:changed')).toBe(0);
  });
});
