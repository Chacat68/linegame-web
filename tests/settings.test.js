import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { TIME_CONFIG } from '../js/data/constants.js';
import * as Settings from '../js/core/SettingsManager.js';
import { SETTINGS_COMMAND } from '../js/core/SettingsCommandController.js';

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

describe('settings launcher ownership contract', function () {
  it('入口不再保留业务 fallback，加载失败由统一 Feature 状态呈现与重试', function () {
    const mainSource = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
    const controllerSource = readFileSync(new URL('../js/core/SettingsUiController.js', import.meta.url), 'utf8');
    const statusSource = readFileSync(new URL('../js/ui/DeferredFeatureStatusUI.js', import.meta.url), 'utf8');
    const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

    expect(mainSource).not.toContain('bindSettingsModalFallback');
    expect(mainSource).not.toContain('_readSavedSettings');
    expect(mainSource).not.toContain('_activateSettingsPanelFallback');
    expect(mainSource).not.toContain('exportUsageDataFile');
    expect(controllerSource).toContain("featureStatus.showLoading('settings')");
    expect(controllerSource).toContain("featureStatus.showError('settings', open, hide)");
    expect(statusSource).toContain("hostSelector: '.settings-feature-status-host'");
    expect(htmlSource).toContain('class="settings-feature-status-host"');
  });

  it('正式设置命令独占导出契约，数据面板不再展示同意开关', function () {
    const settingsSource = readFileSync(new URL('../js/core/SettingsManager.js', import.meta.url), 'utf8');
    const modalControllerSource = readFileSync(new URL('../js/ui/SettingsModalController.js', import.meta.url), 'utf8');
    const mainSource = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
    const exportEffectSource = readFileSync(new URL('../js/core/UsageDataExportEffect.js', import.meta.url), 'utf8');
    const htmlSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

    expect(modalControllerSource).toContain('SETTINGS_COMMAND.EXPORT_USAGE_DATA');
    expect(settingsSource).not.toContain('buildUsageDataExport');
    expect(settingsSource).not.toContain('new Blob');
    expect(settingsSource).not.toContain('document.');
    expect(mainSource).not.toContain('exportUsageDataFile');
    expect(mainSource).not.toContain('new Blob');
    expect(exportEffectSource).toContain('buildUsageDataExport');
    expect(exportEffectSource).toContain("createElement('a')");
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

function createSettingsCommandStub(settings) {
  return vi.fn(function (command) {
    var message = '';
    switch (command.type) {
      case SETTINGS_COMMAND.SET_MOTION_LEVEL:
        settings.motionLevel = command.value;
        message = '动画强度已更新为' + (command.value === 'off' ? '关闭' : (command.value === 'reduced' ? '降低' : '完整')) + '。';
        break;
      case SETTINGS_COMMAND.SET_SECRET_ROUTES_VISIBLE:
        settings.secretRoutesVisible = !!command.value;
        break;
      case SETTINGS_COMMAND.SET_TERMINAL_BLUR:
        settings.terminalBlur = !!command.value;
        break;
      case SETTINGS_COMMAND.SET_SOUND_EFFECTS_ENABLED:
        settings.soundEffectsEnabled = !!command.value;
        message = '音效反馈已' + (command.value ? '开启' : '关闭') + '。';
        break;
      case SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME:
        settings.soundEffectsVolume = Number(command.value);
        if (command.preview !== true) message = '音效音量已更新为' + Math.round(settings.soundEffectsVolume * 100) + '%。';
        break;
      case SETTINGS_COMMAND.SET_DIFFICULTY:
        settings.difficulty = command.value;
        break;
      case SETTINGS_COMMAND.SET_REALTIME_DAY_DURATION:
        settings.realtimeDayDurationMs = Number(command.value);
        break;
      default:
        break;
    }
    return {
      ok: true,
      type: command.type,
      message: message,
      tone: command.preview === true ? 'neutral' : 'success',
      settings: Object.assign({}, settings),
    };
  });
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
    Settings.dispose();
    globalThis.document = originalDocument;
    globalThis.confirm = originalConfirm;
  });

  it('重复初始化后，控件只向最新 command port 发布且不接管外部 launcher', function () {
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
    var firstCommand = createSettingsCommandStub(firstSettings);
    var secondCommand = createSettingsCommandStub(secondSettings);
    Settings.initSettingsModal({
      getSettings: function () { return firstSettings; },
      onCommand: firstCommand,
      onOpen: function () { firstOpenCount += 1; },
    });
    Settings.initSettingsModal({
      getSettings: function () { return secondSettings; },
      onCommand: secondCommand,
      onOpen: function () { secondOpenCount += 1; },
    });

    elements['settings-motion-level'].value = 'off';
    elements['settings-motion-level'].onchange();

    expect(firstSettings.motionLevel).toBe('full');
    expect(secondSettings.motionLevel).toBe('off');
    expect(firstCommand).not.toHaveBeenCalled();
    expect(secondCommand).toHaveBeenCalledWith({
      type: SETTINGS_COMMAND.SET_MOTION_LEVEL,
      value: 'off',
    });

    elements['settings-btn'].dispatchEvent('click', { preventDefault: function () {} });
    expect(firstOpenCount).toBe(0);
    expect(secondOpenCount).toBe(0);
    expect(elements['settings-btn'].listenerCount('click')).toBe(0);
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
    var onCommand = createSettingsCommandStub(settings);

    Settings.initSettingsModal({
      getSettings: function () { return settings; },
      onCommand: onCommand,
    });

    elements['settings-sfx-enabled'].checked = false;
    elements['settings-sfx-enabled'].onchange();
    expect(settings.soundEffectsEnabled).toBe(false);

    elements['settings-sfx-volume'].value = '0.6';
    elements['settings-sfx-volume'].oninput();
    expect(settings.soundEffectsVolume).toBe(0.6);
    expect(elements['settings-sfx-volume-value'].textContent).toBe('60%');
    expect(onCommand).toHaveBeenLastCalledWith({
      type: SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME,
      value: '0.6',
      preview: true,
    });
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
    var onCommand = createSettingsCommandStub(settings);
    Settings.initSettingsModal({
      getSettings: function () { return settings; },
      onCommand: onCommand,
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
      getSettings: function () { return {
        motionLevel: 'full',
        difficulty: 'normal',
        secretRoutesVisible: true,
        realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
        terminalBlur: true,
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.35,
      }; },
      onCommand: vi.fn(),
    });

    expect(displayTab.getAttribute('tabindex')).toBe('0');
    expect(gameTab.getAttribute('tabindex')).toBe('-1');
    expect(dataTab.getAttribute('tabindex')).toBe('-1');
    expect(gameTab.listenerCount('keydown')).toBe(0);
    expect(typeof gameTab.onkeydown).toBe('function');

    gameTab.onkeydown({
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

    gameTab.onkeydown({
      key: 'ArrowRight',
      preventDefault: function () {},
    });

    expect(elements['settings-tab-data'].checked).toBe(true);
    expect(dataTab.dataset.focused).toBe('true');
    expect(dataTab.getAttribute('tabindex')).toBe('0');
    expect(gameTab.getAttribute('tabindex')).toBe('-1');
    expect(dataPanel.getAttribute('tabindex')).toBe('0');
    expect(gamePanel.getAttribute('tabindex')).toBe('-1');

    displayTab.onclick();
    expect(elements['settings-tab-display'].checked).toBe(true);
    expect(displayTab.getAttribute('aria-selected')).toBe('true');
    expect(displayTab.getAttribute('tabindex')).toBe('0');
    expect(dataTab.getAttribute('tabindex')).toBe('-1');
  });

  it('系统管理弹窗静态结构包含描述与移动端样式锚点', function () {
    const html = readFileSync('index.html', 'utf8');
    const css = readFileSync('css/interstellar-trader.css', 'utf8');
    const settingsCss = readFileSync('css/settings-workspace.css', 'utf8');
    const saveCss = readFileSync('css/save-workspace.css', 'utf8');

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
    expect(settingsCss).toContain('.settings-main-header-copy');
    expect(settingsCss).toContain('.settings-overview-strip');
    expect(settingsCss).toContain('.settings-change-status[data-status-tone="success"]');
    expect(settingsCss).toContain('.settings-nav-subtitle');
    expect(settingsCss).toContain('.modal > .settings-modal-box {\n    height: min(680px, calc(100dvh - 32px));');
    expect(settingsCss).toContain('height: calc(100dvh - max(8px, var(--safe-top)) - max(8px, var(--safe-bottom)));');
    expect(settingsCss).toContain('max-height: calc(100dvh - max(8px, var(--safe-top)) - max(8px, var(--safe-bottom))) !important;');
    expect(saveCss).toContain('.settings-panel-page--data .save-slot:focus-visible');
    expect(saveCss).not.toMatch(/\.settings-panel-page--data\s*\{[^}]*display:\s*flex/);
    expect(saveCss).toContain('.save-safety-panel');
    expect(saveCss).toContain('.save-safety-grid');
    expect(saveCss).toContain('.save-safety-focus');
    expect(saveCss).toContain('.save-transfer-status[data-status-tone="success"]');
    expect(saveCss).toContain('.settings-panel-page--data .save-slot-actions .btn-action,\n' +
      '  .settings-panel-page--data .save-export-row .btn-action,\n' +
      '  .settings-panel-page--data .save-import-slot-select,\n' +
      '  .settings-panel-page--data .save-export-slot-select {\n' +
      '    min-height: var(--ui-control-lg, 44px);');
    expect(saveCss).toContain('.settings-panel-page--data .save-transfer-status {\n    font-size: 13px;');
    expect(css).toContain('.action-confirm-impact');
    expect(css).toContain('.action-confirm-actions');
    expect(readFileSync('js/core/SettingsManager.js', 'utf8')).not.toContain('confirm(');
  });
});
