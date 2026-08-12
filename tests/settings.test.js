import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
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
    expect(settings).not.toHaveProperty('usageDataConsent');
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

  it('保存设置时清理旧版无效的数据同意字段', function () {
    Settings.saveSettings({
      motionLevel: 'full',
      usageDataConsent: true,
    });

    var stored = JSON.parse(globalThis.localStorage.getItem('linegame_settings'));
    expect(stored).not.toHaveProperty('usageDataConsent');
    expect(Settings.loadSettings()).not.toHaveProperty('usageDataConsent');
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

describe('settings modal fallback contract', function () {
  it('只在正式设置处理器缺失时绑定，并聚焦当前设置标签', function () {
    const source = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

    expect(source).toContain("settingsBtn.dataset.settingsBound === 'true'");
    expect(source).toContain("settingsBtn.dataset.settingsLoaderBound === 'true'");
    expect(source).toContain("focusSelector: '[data-settings-panel-target][aria-selected=\"true\"]'");
    expect(source).toContain("buildUsageDataExport(null)");
    expect(source).not.toContain('usageDataConsent');
  });

  it('正式与降级入口共用导出契约，数据面板不再展示同意开关', function () {
    const settingsSource = readFileSync(new URL('../js/core/SettingsManager.js', import.meta.url), 'utf8');
    const mainSource = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
    const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

    expect(settingsSource).toContain('buildUsageDataExport(state)');
    expect(mainSource).toContain('buildUsageDataExport(null)');
    expect(htmlSource).toContain('随存档仅保存在本设备，不会自动上传');
    expect(htmlSource).toContain('是否分享由你决定');
    expect(htmlSource).not.toContain('settings-usage-data-consent');
  });
});

function createFakeElement() {
  var listeners = Object.create(null);
  var attributes = Object.create(null);
  return {
    dataset: {},
    value: '',
    checked: false,
    onclick: null,
    onchange: null,
    textContent: '',
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
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    querySelectorAll: function () { return []; },
    focus: function () {
      this.dataset.focused = 'true';
    },
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

    var firstOpenCount = 0;
    var secondOpenCount = 0;
    Settings.initSettingsModal({
      settings: firstSettings,
      Renderer: renderer,
      onOpen: function () { firstOpenCount += 1; },
    });
    Settings.initSettingsModal({
      settings: secondSettings,
      Renderer: renderer,
      onOpen: function () { secondOpenCount += 1; },
    });

    elements['settings-motion-level'].value = 'off';
    elements['settings-motion-level'].onchange();

    expect(firstSettings.motionLevel).toBe('full');
    expect(secondSettings.motionLevel).toBe('off');

    elements['settings-btn'].dispatchEvent('click', { preventDefault: function () {} });
    expect(firstOpenCount).toBe(0);
    expect(secondOpenCount).toBe(1);
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

  it('设置摘要会在打开和变更后同步当前配置', function () {
    Settings.saveSettings({
      motionLevel: 'reduced',
      difficulty: 'hard',
      secretRoutesVisible: true,
      realtimeDayDurationMs: 30000,
      terminalBlur: true,
      soundEffectsEnabled: false,
      soundEffectsVolume: 0.2,
    });

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
      'settings-summary-motion': createFakeElement(),
      'settings-summary-difficulty': createFakeElement(),
      'settings-summary-time': createFakeElement(),
      'settings-summary-audio': createFakeElement(),
      'settings-change-status': createFakeElement(),
    };

    globalThis.document = {
      body: { dataset: {} },
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
    };

    var settings = Settings.loadSettings();
    Settings.initSettingsModal({
      settings: settings,
      Renderer: {
        setMotionLevel: function () {},
        setSecretRoutesVisible: function () {},
      },
    });

    Settings.showSettingsModal();
    expect(elements['settings-summary-motion'].textContent).toBe('降低');
    expect(elements['settings-summary-difficulty'].textContent).toBe('挑战模式');
    expect(elements['settings-summary-time'].textContent).toBe('30 秒 / 天');
    expect(elements['settings-summary-audio'].textContent).toBe('关闭 · 20%');
    expect(elements['settings-change-status'].textContent).toBe('更改会自动保存在当前设备。');

    elements['settings-motion-level'].value = 'off';
    elements['settings-motion-level'].onchange();
    expect(elements['settings-summary-motion'].textContent).toBe('关闭');
    expect(elements['settings-change-status'].textContent).toBe('动画强度已更新为关闭。');
    expect(elements['settings-change-status'].dataset.statusTone).toBe('success');

    elements['settings-sfx-enabled'].checked = true;
    elements['settings-sfx-enabled'].onchange();
    expect(elements['settings-summary-audio'].textContent).toBe('开启 · 20%');

    elements['settings-sfx-volume'].value = '0.65';
    elements['settings-sfx-volume'].oninput();
    expect(elements['settings-summary-audio'].textContent).toBe('开启 · 65%');
  });

  it('设置分页支持键盘切换', function () {
    var displayTab = createFakeElement();
    var gameTab = createFakeElement();
    var dataTab = createFakeElement();
    var displayPanel = createFakeElement();
    var gamePanel = createFakeElement();
    var dataPanel = createFakeElement();
    displayTab.dataset.settingsPanelTarget = 'display';
    gameTab.dataset.settingsPanelTarget = 'game';
    dataTab.dataset.settingsPanelTarget = 'data';
    displayPanel.dataset.settingsPanel = 'display';
    gamePanel.dataset.settingsPanel = 'game';
    dataPanel.dataset.settingsPanel = 'data';

    var modal = createFakeElement();
    modal.querySelectorAll = function (selector) {
      if (selector === '[data-settings-panel-target]') return [displayTab, gameTab, dataTab];
      if (selector === '[data-settings-panel]') return [displayPanel, gamePanel, dataPanel];
      return [];
    };

    var elements = {
      'settings-btn': createFakeElement(),
      'settings-modal': modal,
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
      'settings-tab-display': createFakeElement(),
      'settings-tab-game': createFakeElement(),
      'settings-tab-data': createFakeElement(),
      'settings-page-title': createFakeElement(),
    };

    globalThis.document = {
      body: { dataset: {} },
      getElementById: function (id) { return elements[id] || null; },
      addEventListener: function () {},
    };

    Settings.initSettingsModal({
      settings: {
        motionLevel: 'full',
        difficulty: 'normal',
        secretRoutesVisible: true,
        realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
        terminalBlur: true,
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.35,
      },
      Renderer: {
        setMotionLevel: function () {},
        setSecretRoutesVisible: function () {},
      },
    });

    expect(displayTab.getAttribute('tabindex')).toBe('0');
    expect(gameTab.getAttribute('tabindex')).toBe('-1');
    expect(dataTab.getAttribute('tabindex')).toBe('-1');
    expect(gameTab.listenerCount('keydown')).toBe(1);

    gameTab.dispatchEvent('keydown', {
      key: 'Enter',
      preventDefault: function () {},
    });

    expect(elements['settings-tab-game'].checked).toBe(true);
    expect(elements['settings-page-title'].textContent).toBe('游戏设置');
    expect(gameTab.getAttribute('aria-selected')).toBe('true');
    expect(gameTab.getAttribute('tabindex')).toBe('0');
    expect(displayTab.getAttribute('tabindex')).toBe('-1');
    expect(gamePanel.getAttribute('aria-hidden')).toBe('false');
    expect(displayPanel.getAttribute('aria-hidden')).toBe('true');

    gameTab.dispatchEvent('keydown', {
      key: 'ArrowRight',
      preventDefault: function () {},
    });

    expect(elements['settings-tab-data'].checked).toBe(true);
    expect(dataTab.dataset.focused).toBe('true');
    expect(dataTab.getAttribute('tabindex')).toBe('0');
    expect(gameTab.getAttribute('tabindex')).toBe('-1');
    expect(dataPanel.getAttribute('tabindex')).toBe('0');
    expect(gamePanel.getAttribute('tabindex')).toBe('-1');

    displayTab.dispatchEvent('click');
    expect(elements['settings-tab-display'].checked).toBe(true);
    expect(displayTab.getAttribute('aria-selected')).toBe('true');
    expect(displayTab.getAttribute('tabindex')).toBe('0');
    expect(dataTab.getAttribute('tabindex')).toBe('-1');
  });

  it('系统管理弹窗静态结构包含描述与移动端样式锚点', function () {
    const html = readFileSync('index.html', 'utf8');
    const css = readFileSync('css/interstellar-trader.css', 'utf8');

    expect(html).toContain('aria-describedby="settings-modal-desc settings-overview-strip settings-change-status"');
    expect(html).toContain('id="settings-modal-desc" class="settings-modal-desc"');
    expect(html).toContain('id="settings-overview-strip" class="settings-overview-strip" role="list" aria-label="当前设置摘要"');
    expect(html).toContain('id="settings-change-status" class="settings-change-status" role="status" aria-live="polite"');
    expect(html).toMatch(/id="settings-tab-game"[\s\S]{0,180}tabindex="-1"[\s\S]{0,80}aria-hidden="true"/);
    expect(html).toContain('id="settings-summary-audio"');
    expect(html).toContain('class="settings-nav-subtitle">视觉 / 性能</small>');
    expect(html).toContain('aria-label="音效音量"');
    expect(html).toContain('id="action-confirm-modal"');
    expect(html).toContain('role="alertdialog"');
    expect(css).toContain('.settings-main-header-copy');
    expect(css).toContain('.settings-overview-strip');
    expect(css).toContain('.settings-change-status[data-status-tone="success"]');
    expect(css).toContain('.settings-nav-subtitle');
    expect(css).toContain('.modal > .settings-modal-box {\n    height: min(680px, calc(100dvh - 32px));');
    expect(css).toContain('height: calc(100dvh - max(8px, var(--safe-top)) - max(8px, var(--safe-bottom)));');
    expect(css).toContain('max-height: calc(100dvh - max(8px, var(--safe-top)) - max(8px, var(--safe-bottom))) !important;');
    expect(css).toContain('.settings-panel-page--data .save-slot:focus-visible');
    expect(css).not.toMatch(/\.settings-panel-page--data\s*\{[^}]*display:\s*flex/);
    expect(css).toContain('.save-safety-panel');
    expect(css).toContain('.save-safety-grid');
    expect(css).toContain('.save-safety-focus');
    expect(css).toContain('.save-transfer-status[data-status-tone="success"]');
    expect(css).toContain('.action-confirm-impact');
    expect(css).toContain('.action-confirm-actions');
    expect(readFileSync('js/core/SettingsManager.js', 'utf8')).not.toContain('confirm(');
  });
});
