import { describe, expect, it, vi } from 'vitest';
import { SETTINGS_COMMAND } from '../js/core/SettingsCommandController.js';
import { createSettingsModalController } from '../js/ui/SettingsModalController.js';

function createElement() {
  var attributes = Object.create(null);
  return {
    checked: false,
    dataset: {},
    onclick: null,
    onchange: null,
    oninput: null,
    onkeydown: null,
    textContent: '',
    value: '',
    focus: vi.fn(),
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    querySelectorAll: function () { return []; },
  };
}

function createHarness() {
  var settings = {
    motionLevel: 'reduced', difficulty: 'hard', secretRoutesVisible: true,
    realtimeDayDurationMs: 30000, terminalBlur: true,
    soundEffectsEnabled: false, soundEffectsVolume: 0.2,
  };
  var displayTab = createElement();
  var gameTab = createElement();
  var dataTab = createElement();
  displayTab.dataset.settingsPanelTarget = 'display';
  gameTab.dataset.settingsPanelTarget = 'game';
  dataTab.dataset.settingsPanelTarget = 'data';
  displayTab.setAttribute('aria-selected', 'true');
  gameTab.setAttribute('aria-selected', 'false');
  dataTab.setAttribute('aria-selected', 'false');
  var displayPanel = createElement();
  var gamePanel = createElement();
  var dataPanel = createElement();
  displayPanel.dataset.settingsPanel = 'display';
  gamePanel.dataset.settingsPanel = 'game';
  dataPanel.dataset.settingsPanel = 'data';
  var modal = createElement();
  modal.querySelectorAll = function (selector) {
    if (selector === '[data-settings-panel-target]') return [displayTab, gameTab, dataTab];
    if (selector === '[data-settings-panel]') return [displayPanel, gamePanel, dataPanel];
    return [];
  };
  var elements = {
    'settings-modal': modal,
    'settings-close-btn': createElement(),
    'settings-motion-level': createElement(),
    'settings-secret-routes-visible': createElement(),
    'settings-terminal-blur': createElement(),
    'settings-sfx-enabled': createElement(),
    'settings-sfx-volume': createElement(),
    'settings-sfx-volume-value': createElement(),
    'settings-difficulty-level': createElement(),
    'settings-time-scale': createElement(),
    'settings-reset-defaults-btn': createElement(),
    'settings-reset-tutorial-btn': createElement(),
    'settings-clear-saves-btn': createElement(),
    'settings-export-usage-data-btn': createElement(),
    'settings-summary-motion': createElement(),
    'settings-summary-difficulty': createElement(),
    'settings-summary-time': createElement(),
    'settings-summary-audio': createElement(),
    'settings-change-status': createElement(),
    'settings-tab-display': createElement(),
    'settings-tab-game': createElement(),
    'settings-tab-data': createElement(),
    'settings-page-title': createElement(),
  };
  var releaseDismiss = vi.fn();
  var bindDismiss = vi.fn(function () { return releaseDismiss; });
  var showSurface = vi.fn();
  var hideSurface = vi.fn();
  var openConfirm = vi.fn();
  var cancelConfirm = vi.fn();
  var commands = [];
  var controller = createSettingsModalController({
    getDocument: function () { return { getElementById: function (id) { return elements[id] || null; } }; },
    bindDismiss: bindDismiss,
    showSurface: showSurface,
    hideSurface: hideSurface,
    openConfirm: openConfirm,
    cancelConfirm: cancelConfirm,
  });
  var onCommand = vi.fn(function (command) {
    commands.push(command);
    if (command.type === SETTINGS_COMMAND.SET_MOTION_LEVEL) settings.motionLevel = command.value;
    if (command.type === SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME) settings.soundEffectsVolume = Number(command.value);
    return { ok: true, type: command.type, settings: Object.assign({}, settings), message: command.preview ? '' : '设置已更新。', tone: 'success' };
  });
  controller.bind({ getSettings: function () { return settings; }, onCommand: onCommand });
  return {
    bindDismiss: bindDismiss, cancelConfirm: cancelConfirm, commands: commands,
    controller: controller, dataPanel: dataPanel, dataTab: dataTab,
    displayPanel: displayPanel, displayTab: displayTab, elements: elements,
    gamePanel: gamePanel, gameTab: gameTab, hideSurface: hideSurface,
    modal: modal, onCommand: onCommand, openConfirm: openConfirm,
    releaseDismiss: releaseDismiss,
    settings: settings, showSurface: showSurface,
  };
}

describe('SettingsModalController', function () {
  it('打开时投影控件、摘要、局部状态与统一 Surface', function () {
    var harness = createHarness();
    expect(harness.controller.show()).toBe(true);
    expect(harness.elements['settings-motion-level'].value).toBe('reduced');
    expect(harness.elements['settings-difficulty-level'].value).toBe('hard');
    expect(harness.elements['settings-sfx-enabled'].checked).toBe(false);
    expect(harness.elements['settings-sfx-volume-value'].textContent).toBe('20%');
    expect(harness.elements['settings-summary-audio'].textContent).toBe('关闭 · 20%');
    expect(harness.elements['settings-change-status'].textContent).toBe('更改会自动保存在当前设备。');
    expect(harness.bindDismiss).toHaveBeenCalledWith('settings-modal');
    expect(harness.controller.getDiagnostics().dismissBound).toBe(true);
    expect(harness.showSurface).toHaveBeenCalledWith('settings-modal', {
      focusSelector: '[data-settings-panel-target][aria-selected="true"]',
    });
  });

  it('控件只发布 typed command，预览同步摘要但不伪造提交文案', function () {
    var harness = createHarness();
    harness.elements['settings-motion-level'].value = 'off';
    harness.elements['settings-motion-level'].onchange();
    harness.elements['settings-sfx-volume'].value = '0.65';
    harness.elements['settings-sfx-volume'].oninput();
    expect(harness.commands).toEqual([
      { type: SETTINGS_COMMAND.SET_MOTION_LEVEL, value: 'off' },
      { type: SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME, value: '0.65', preview: true },
    ]);
    expect(harness.elements['settings-summary-motion'].textContent).toBe('关闭');
    expect(harness.elements['settings-summary-audio'].textContent).toBe('关闭 · 65%');
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      commandCount: 2,
      lastCommandType: SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME,
    }));
  });

  it('分页键盘只切换局部状态，危险操作经应用内确认后才提交', function () {
    var harness = createHarness();
    var prevented = false;
    harness.gameTab.onkeydown({ key: 'ArrowRight', preventDefault: function () { prevented = true; } });
    expect(prevented).toBe(true);
    expect(harness.dataTab.getAttribute('aria-selected')).toBe('true');
    expect(harness.dataPanel.getAttribute('aria-hidden')).toBe('false');
    expect(harness.dataTab.focus).toHaveBeenCalledOnce();
    harness.elements['settings-reset-tutorial-btn'].onclick();
    expect(harness.openConfirm).toHaveBeenCalledOnce();
    expect(harness.onCommand).not.toHaveBeenCalled();
    harness.openConfirm.mock.calls[0][0].onConfirm();
    expect(harness.onCommand).toHaveBeenCalledWith({ type: SETTINGS_COMMAND.RESET_TUTORIAL });
    expect(harness.controller.getDiagnostics().confirmCount).toBe(1);
  });

  it('重新绑定与 dispose 释放旧控件，reset 清空局部会话但保留绑定', function () {
    var harness = createHarness();
    var oldHandler = harness.elements['settings-motion-level'].onchange;
    harness.controller.reset();
    expect(harness.cancelConfirm).toHaveBeenCalledOnce();
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      activePanel: 'display', bound: true, commandCount: 0, resetCount: 1,
    }));
    expect(harness.elements['settings-motion-level'].onchange).toBe(oldHandler);
    expect(harness.controller.getDiagnostics().dismissBound).toBe(true);
    var diagnostics = harness.controller.dispose();
    expect(harness.elements['settings-motion-level'].onchange).toBeNull();
    expect(harness.gameTab.onkeydown).toBeNull();
    expect(harness.releaseDismiss).toHaveBeenCalledOnce();
    expect(diagnostics).toEqual(expect.objectContaining({
      bound: false, dismissBound: false, disposeCount: 1,
    }));
    expect(Object.isFrozen(diagnostics)).toBe(true);
  });
});
