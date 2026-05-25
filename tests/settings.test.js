import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TIME_CONFIG } from '../js/data/constants.js';
import * as Settings from '../js/core/SettingsManager.js';

if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: function (key) { return key in store ? store[key] : null; },
    setItem: function (key, value) { store[key] = String(value); },
    removeItem: function (key) { delete store[key]; },
    clear: function () { Object.keys(store).forEach(function (key) { delete store[key]; }); },
    get length() { return Object.keys(store).length; },
    key: function (index) { return Object.keys(store)[index] || null; },
  };
}

describe('Settings.loadSettings', function () {
  beforeEach(function () {
    globalThis.localStorage.clear();
  });

  it('默认返回 60 秒 / 天', function () {
    const settings = Settings.loadSettings();

    expect(settings.realtimeDayDurationMs).toBe(TIME_CONFIG.realtimeDayDurationMs);
    expect(settings.soundEffectsEnabled).toBe(true);
    expect(settings.soundEffectsVolume).toBe(0.35);
  });

  it('保留合法的时间流速设置', function () {
    Settings.saveSettings({
      motionLevel: 'full',
      difficulty: 'normal',
      secretRoutesVisible: true,
      realtimeDayDurationMs: 30000,
    });

    const settings = Settings.loadSettings();
    expect(settings.realtimeDayDurationMs).toBe(30000);
  });

  it('将非法的时间流速回退到默认值', function () {
    globalThis.localStorage.setItem('linegame_settings', JSON.stringify({
      motionLevel: 'full',
      difficulty: 'normal',
      secretRoutesVisible: true,
      realtimeDayDurationMs: 45000,
    }));

    const settings = Settings.loadSettings();
    expect(settings.realtimeDayDurationMs).toBe(TIME_CONFIG.realtimeDayDurationMs);
  });

  it('将非法音效音量归一到默认值并钳制范围', function () {
    globalThis.localStorage.setItem('linegame_settings', JSON.stringify({
      motionLevel: 'full',
      difficulty: 'normal',
      secretRoutesVisible: true,
      realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
      soundEffectsEnabled: false,
      soundEffectsVolume: 3,
    }));

    expect(Settings.loadSettings().soundEffectsVolume).toBe(1);

    globalThis.localStorage.setItem('linegame_settings', JSON.stringify({
      soundEffectsVolume: 'bad-value',
    }));

    const settings = Settings.loadSettings();
    expect(settings.soundEffectsEnabled).toBe(true);
    expect(settings.soundEffectsVolume).toBe(0.35);
  });
});

function createFakeElement() {
  var listeners = Object.create(null);
  return {
    dataset: {},
    value: '',
    checked: false,
    onclick: null,
    onchange: null,
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatchEvent: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || { target: this, preventDefault: function () {} });
      }, this);
    },
    classList: {
      contains: function () { return false; },
      toggle: function () {},
    },
    setAttribute: function () {},
    querySelectorAll: function () { return []; },
    listenerCount: function (type) {
      return (listeners[type] || []).length;
    },
  };
}

describe('Settings.initSettingsModal', function () {
  var originalDocument;
  var originalConfirm;

  beforeEach(function () {
    globalThis.localStorage.clear();
    originalDocument = globalThis.document;
    originalConfirm = globalThis.confirm;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.confirm = originalConfirm;
  });

  it('重复初始化后，控件会写入最新 settings 引用', function () {
    var elements = {
      'settings-btn': createFakeElement(),
      'settings-modal': createFakeElement(),
      'settings-close-btn': createFakeElement(),
      'settings-motion-level': createFakeElement(),
      'settings-secret-routes-visible': createFakeElement(),
      'settings-terminal-blur': createFakeElement(),
      'settings-sfx-enabled': createFakeElement(),
      'settings-sfx-volume': createFakeElement(),
      'settings-sfx-volume-value': createFakeElement(),
      'settings-difficulty-level': createFakeElement(),
      'settings-time-scale': createFakeElement(),
      'settings-reset-defaults-btn': createFakeElement(),
      'settings-reset-tutorial-btn': createFakeElement(),
      'settings-clear-saves-btn': createFakeElement(),
    };

    globalThis.document = {
      body: { dataset: {} },
      getElementById: function (id) { return elements[id] || null; },
      addEventListener: function () {},
    };

    var renderer = {
      setMotionLevel: function () {},
      setSecretRoutesVisible: function () {},
    };

    var firstSettings = {
      motionLevel: 'full',
      difficulty: 'normal',
      secretRoutesVisible: true,
      realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
      terminalBlur: true,
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.35,
    };
    var secondSettings = {
      motionLevel: 'full',
      difficulty: 'normal',
      secretRoutesVisible: true,
      realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
      terminalBlur: true,
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.35,
    };

    Settings.initSettingsModal({ settings: firstSettings, Renderer: renderer });
    Settings.initSettingsModal({ settings: secondSettings, Renderer: renderer });

    elements['settings-motion-level'].value = 'off';
    elements['settings-motion-level'].onchange();

    expect(firstSettings.motionLevel).toBe('full');
    expect(secondSettings.motionLevel).toBe('off');
  });

  it('音效控件会写入设置并更新音量标签', function () {
    var elements = {
      'settings-btn': createFakeElement(),
      'settings-modal': createFakeElement(),
      'settings-close-btn': createFakeElement(),
      'settings-motion-level': createFakeElement(),
      'settings-secret-routes-visible': createFakeElement(),
      'settings-terminal-blur': createFakeElement(),
      'settings-sfx-enabled': createFakeElement(),
      'settings-sfx-volume': createFakeElement(),
      'settings-sfx-volume-value': createFakeElement(),
      'settings-difficulty-level': createFakeElement(),
      'settings-time-scale': createFakeElement(),
      'settings-reset-defaults-btn': createFakeElement(),
      'settings-reset-tutorial-btn': createFakeElement(),
      'settings-clear-saves-btn': createFakeElement(),
    };

    globalThis.document = {
      body: { dataset: {} },
      getElementById: function (id) { return elements[id] || null; },
      addEventListener: function () {},
    };

    var settings = {
      motionLevel: 'full',
      difficulty: 'normal',
      secretRoutesVisible: true,
      realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
      terminalBlur: true,
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.35,
    };

    Settings.initSettingsModal({
      settings: settings,
      Renderer: {
        setMotionLevel: function () {},
        setSecretRoutesVisible: function () {},
      },
    });

    elements['settings-sfx-enabled'].checked = false;
    elements['settings-sfx-enabled'].onchange();
    expect(settings.soundEffectsEnabled).toBe(false);

    elements['settings-sfx-volume'].value = '0.6';
    elements['settings-sfx-volume'].oninput();
    expect(settings.soundEffectsVolume).toBe(0.6);
    expect(elements['settings-sfx-volume-value'].textContent).toBe('60%');
  });
});
