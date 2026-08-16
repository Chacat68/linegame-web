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
  var state = { day: 1 };
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
    onDifficultyChanged: vi.fn(),
    onRealtimeDayDurationChanged: vi.fn(),
    onResetTutorial: vi.fn(),
    onClearSaves: vi.fn(),
  };
  var fallback = vi.fn();
  controller = createSettingsUiController({
    features: features,
    getSettings: function () { return settings; },
    getState: function () { return state; },
    getSessionToken: function () { return token; },
    isSessionTokenCurrent: function (requested) { return requested === activeToken; },
    getDocument: function () {
      return { getElementById: function (id) { return id === 'settings-btn' ? button : null; } };
    },
    Renderer: { id: 'renderer' },
    hideFallback: fallback,
    callbacks: callbacks,
  });
  return {
    button: button,
    callbacks: callbacks,
    controller: controller,
    fallback: fallback,
    features: features,
    module: module,
    invalidateToken: function () { activeToken = { id: 'session-b' }; },
    replaceSettings: function (next) { settings = next; },
    replaceState: function (next) { state = next; },
    setLoadedModule: function (next) { loadedModule = next; },
  };
}

describe('SettingsUiController', function () {
  it('首次点击加载设置模块、移除临时 listener 并打开弹层', async function () {
    var harness = createHarness();

    expect(harness.controller.bindLauncher()).toBe(true);
    expect(harness.button.dataset.settingsLoaderBound).toBe('true');
    harness.button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.features.load).toHaveBeenCalledWith('settings');
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
    harness.button.click();
    harness.invalidateToken();
    resolveModule(harness.module);
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.callbacks.onOpen).not.toHaveBeenCalled();
    expect(harness.module.showSettingsModal).not.toHaveBeenCalled();
  });

  it('同步时总是向模块注入最新 settings、state provider 与动作端口', function () {
    var harness = createHarness();
    var nextSettings = { difficulty: 'hard' };
    var nextState = { day: 99 };
    harness.replaceSettings(nextSettings);
    harness.replaceState(nextState);

    expect(harness.controller.sync(harness.module)).toBe(true);
    var options = harness.module.initSettingsModal.mock.calls[0][0];
    expect(options.settings).toBe(nextSettings);
    expect(options.getState()).toBe(nextState);
    expect(options.onDifficultyChanged).toBe(harness.callbacks.onDifficultyChanged);
    expect(options.onClearSaves).toBe(harness.callbacks.onClearSaves);
  });

  it('模块已加载时只执行 registry sync，不再绑定临时 listener', function () {
    var module = { initSettingsModal: vi.fn(), showSettingsModal: vi.fn() };
    var harness = createHarness({ loadedModule: module, module: module });

    expect(harness.controller.bindLauncher()).toBe(true);
    expect(harness.features.sync).toHaveBeenCalledWith('settings');
    expect(harness.button.addEventListener).not.toHaveBeenCalled();
    expect(module.initSettingsModal).toHaveBeenCalledOnce();
  });

  it('hide 优先使用已加载模块，未加载时回退到 SurfaceManager', function () {
    var harness = createHarness();
    expect(harness.controller.hide()).toBe(false);
    expect(harness.fallback).toHaveBeenCalledWith('settings-modal');

    harness.setLoadedModule(harness.module);
    expect(harness.controller.hide()).toBe(true);
    expect(harness.module.hideSettingsModal).toHaveBeenCalledOnce();
  });
});
