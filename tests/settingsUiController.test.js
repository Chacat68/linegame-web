import { describe, expect, it, vi } from 'vitest';
import { createSettingsUiController } from '../js/core/SettingsUiController.js';

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
      return listener && listener({ preventDefault: vi.fn() });
    },
    hasListener: function (type) { return listeners.has(type); },
  };
}

function createHarness(options) {
  var config = options || {};
  var button = createButton();
  var settings = { difficulty: 'normal' };
  var token = { id: 'session-a' };
  var activeToken = token;
  var loadedModule = config.loadedModule || null;
  var module = config.module || {
    initSettingsModal: vi.fn(),
    showSettingsModal: vi.fn(),
    hideSettingsModal: vi.fn(),
  };
  var controller;
  var features = {
    get: vi.fn(function () { return loadedModule; }),
    load: vi.fn(function () {
      if (config.load) return config.load(module);
      loadedModule = module;
      controller.sync(module);
      return Promise.resolve(module);
    }),
    sync: vi.fn(function () {
      if (loadedModule) controller.sync(loadedModule);
      return loadedModule;
    }),
  };
  var callbacks = {
    onOpen: vi.fn(),
    onCommand: vi.fn(),
  };
  var featureStatus = {
    clear: vi.fn(),
    showError: vi.fn(),
    showLoading: vi.fn(),
  };
  var showStatusSurface = vi.fn();
  var hideSurface = vi.fn();
  var bindStatusSurfaceDismiss = vi.fn();
  controller = createSettingsUiController({
    features: features,
    featureStatus: featureStatus,
    getSettings: function () { return settings; },
    getSessionToken: function () { return token; },
    isSessionTokenCurrent: function (requested) { return requested === activeToken; },
    getDocument: function () {
      return { getElementById: function (id) { return id === 'settings-btn' ? button : null; } };
    },
    bindStatusSurfaceDismiss: bindStatusSurfaceDismiss,
    showStatusSurface: showStatusSurface,
    hideSurface: hideSurface,
    callbacks: callbacks,
  });
  return {
    button: button,
    bindStatusSurfaceDismiss: bindStatusSurfaceDismiss,
    callbacks: callbacks,
    controller: controller,
    featureStatus: featureStatus,
    features: features,
    hideSurface: hideSurface,
    module: module,
    showStatusSurface: showStatusSurface,
    invalidateToken: function () { activeToken = { id: 'session-b' }; },
    replaceSettings: function (next) { settings = next; },
    setLoadedModule: function (next) { loadedModule = next; },
  };
}

describe('SettingsUiController', function () {
  it('首次点击加载设置模块、移除临时 listener 并打开弹层', async function () {
    var harness = createHarness();

    expect(harness.controller.bindLauncher()).toBe(true);
    expect(harness.bindStatusSurfaceDismiss).toHaveBeenCalledWith(harness.controller.hide);
    expect(harness.button.dataset.settingsLoaderBound).toBe('true');
    await harness.button.click();

    expect(harness.features.load).toHaveBeenCalledWith('settings');
    expect(harness.featureStatus.showLoading).toHaveBeenCalledWith('settings');
    expect(harness.showStatusSurface).toHaveBeenCalledOnce();
    expect(harness.featureStatus.clear).toHaveBeenCalledWith('settings');
    expect(harness.module.initSettingsModal).toHaveBeenCalledOnce();
    expect(harness.callbacks.onOpen).toHaveBeenCalledOnce();
    expect(harness.module.showSettingsModal).toHaveBeenCalledOnce();
    expect(harness.button.hasListener('click')).toBe(false);
    expect(harness.button.dataset.settingsLoaderBound).toBeUndefined();
  });

  it('异步模块返回时 session 已变化则不得打开旧会话弹层', async function () {
    var resolveModule;
    var harness = createHarness({
      load: function () {
        return new Promise(function (resolve) { resolveModule = resolve; });
      },
    });
    harness.controller.bindLauncher();
    var pendingOpen = harness.button.click();
    await Promise.resolve();
    harness.invalidateToken();
    resolveModule(harness.module);
    await pendingOpen;

    expect(harness.callbacks.onOpen).not.toHaveBeenCalled();
    expect(harness.module.showSettingsModal).not.toHaveBeenCalled();
    expect(harness.featureStatus.clear).toHaveBeenCalledWith('settings');
    expect(harness.hideSurface).toHaveBeenCalledOnce();
  });

  it('加载失败留在统一错误态，重试后用同一真实模块打开设置', async function () {
    var attempt = 0;
    var harness = createHarness({
      load: function (module) {
        attempt += 1;
        return attempt === 1 ? Promise.reject(new Error('chunk failed')) : Promise.resolve(module);
      },
    });
    harness.controller.bindLauncher();

    await harness.button.click();
    await Promise.resolve();

    expect(harness.featureStatus.showError).toHaveBeenCalledWith(
      'settings',
      expect.any(Function),
      harness.controller.hide
    );
    expect(harness.controller.getDiagnostics()).toMatchObject({
      loadAttempts: 1,
      loadFailures: 1,
      loadState: 'error',
      pending: false,
    });

    var retry = harness.featureStatus.showError.mock.calls[0][1];
    await expect(retry()).resolves.toBe(true);

    expect(harness.features.load).toHaveBeenCalledTimes(2);
    expect(harness.module.initSettingsModal).toHaveBeenCalledOnce();
    expect(harness.module.showSettingsModal).toHaveBeenCalledOnce();
    expect(harness.controller.getDiagnostics()).toMatchObject({
      loadAttempts: 2,
      loadFailures: 1,
      loadState: 'ready',
      openCount: 1,
    });
  });

  it('并发点击复用同一打开事务，不重复加载或打开弹层', async function () {
    var resolveModule;
    var harness = createHarness({
      load: function () {
        return new Promise(function (resolve) { resolveModule = resolve; });
      },
    });
    harness.controller.bindLauncher();

    var first = harness.controller.open();
    var second = harness.controller.open();
    expect(second).toBe(first);
    expect(harness.features.load).toHaveBeenCalledTimes(0);
    await Promise.resolve();
    expect(harness.features.load).toHaveBeenCalledTimes(1);

    resolveModule(harness.module);
    await expect(first).resolves.toBe(true);
    expect(harness.module.showSettingsModal).toHaveBeenCalledOnce();
    expect(harness.showStatusSurface).toHaveBeenCalledOnce();
  });

  it('session reset 作废迟到打开事务并清理错误面，不影响后续 registry 提交', async function () {
    var resolveModule;
    var harness = createHarness({
      load: function () {
        return new Promise(function (resolve) { resolveModule = resolve; });
      },
    });
    harness.controller.bindLauncher();
    var pending = harness.controller.open();
    await Promise.resolve();

    expect(harness.controller.getDiagnostics().pending).toBe(true);
    expect(harness.controller.reset()).toMatchObject({ loadState: 'idle', pending: false });
    expect(harness.featureStatus.clear).toHaveBeenCalledWith('settings');
    expect(harness.hideSurface).toHaveBeenCalledOnce();

    resolveModule(harness.module);
    await expect(pending).resolves.toBe(false);
    expect(harness.module.showSettingsModal).not.toHaveBeenCalled();
    expect(harness.featureStatus.showError).not.toHaveBeenCalled();
  });

  it('同步时总是向模块注入最新 settings provider 与单一命令端口', function () {
    var harness = createHarness();
    var nextSettings = { difficulty: 'hard' };
    harness.replaceSettings(nextSettings);

    expect(harness.controller.sync(harness.module)).toBe(true);
    var options = harness.module.initSettingsModal.mock.calls[0][0];
    expect(options.getSettings()).toBe(nextSettings);
    expect(options.onCommand).toBe(harness.callbacks.onCommand);
    expect(options).not.toHaveProperty('getState');
    expect(options).not.toHaveProperty('Renderer');
    expect(options).not.toHaveProperty('onDifficultyChanged');
    expect(options).not.toHaveProperty('onClearSaves');
  });

  it('模块已加载时只执行 registry sync，不再绑定临时 listener', function () {
    var module = { initSettingsModal: vi.fn(), showSettingsModal: vi.fn() };
    var harness = createHarness({ loadedModule: module, module: module });

    expect(harness.controller.bindLauncher()).toBe(true);
    expect(harness.features.sync).toHaveBeenCalledWith('settings');
    expect(harness.button.addEventListener).not.toHaveBeenCalled();
    expect(module.initSettingsModal).toHaveBeenCalledOnce();
  });

  it('hide 优先使用已加载模块，未加载时也走统一 Surface 端口', function () {
    var harness = createHarness();
    expect(harness.controller.hide()).toBe(true);
    expect(harness.featureStatus.clear).toHaveBeenCalledWith('settings');
    expect(harness.hideSurface).toHaveBeenCalledOnce();

    harness.setLoadedModule(harness.module);
    expect(harness.controller.hide()).toBe(true);
    expect(harness.module.hideSettingsModal).toHaveBeenCalledOnce();
  });

  it('dispose 后拒绝迟到 registry sync 与新的打开事务', async function () {
    var harness = createHarness();
    harness.controller.dispose();

    expect(harness.controller.getDiagnostics()).toMatchObject({
      bound: false,
      disposed: true,
      loadState: 'idle',
      pending: false,
    });
    expect(harness.controller.sync(harness.module)).toBe(false);
    expect(harness.controller.bindLauncher()).toBe(false);
    await expect(harness.controller.open()).resolves.toBe(false);
    expect(harness.module.initSettingsModal).not.toHaveBeenCalled();
    expect(harness.features.load).not.toHaveBeenCalled();
  });
});
