// js/ui/SettingsModalController.js — 设置弹层内部 DOM、命令与释放生命周期

import { SETTINGS_COMMAND } from '../core/SettingsCommandController.js';
import * as ActionConfirmUI from './ActionConfirmUI.js';
import {
  bindBlockingSurfaceDismiss,
  hideBlockingSurface,
  showBlockingSurface,
} from './SurfaceManager.js';
import { buildSettingsViewModel, getSettingsPanelTitle } from './SettingsViewPresenter.js';

const SURFACE_ID = 'settings-modal';

function _optionalFunction(value, fallback) {
  return typeof value === 'function' ? value : fallback;
}

export function createSettingsModalController(options) {
  var dependencies = options || {};
  var getDocument = _optionalFunction(dependencies.getDocument, function () {
    return typeof globalThis !== 'undefined' ? globalThis.document : null;
  });
  var bindDismiss = _optionalFunction(dependencies.bindDismiss, bindBlockingSurfaceDismiss);
  var showSurface = _optionalFunction(dependencies.showSurface, showBlockingSurface);
  var hideSurface = _optionalFunction(dependencies.hideSurface, hideBlockingSurface);
  var openConfirm = _optionalFunction(dependencies.openConfirm, ActionConfirmUI.open);
  var cancelConfirm = _optionalFunction(dependencies.cancelConfirm, ActionConfirmUI.cancel);
  var fallbackGetSettings = _optionalFunction(dependencies.getSettings, function () { return {}; });

  var callbacks = { getSettings: fallbackGetSettings, onCommand: null };
  var activeModal = null;
  var activePanel = 'display';
  var bindings = [];
  var bindCount = 0;
  var commandCount = 0;
  var confirmCount = 0;
  var disposeCount = 0;
  var hideCount = 0;
  var resetCount = 0;
  var showCount = 0;
  var lastCommandType = null;

  function _document() {
    return getDocument() || null;
  }

  function _element(id) {
    var doc = _document();
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function _currentSettings() {
    var settings = typeof callbacks.getSettings === 'function' ? callbacks.getSettings() : null;
    return settings && typeof settings === 'object' ? settings : fallbackGetSettings();
  }

  function _bindProperty(element, property, handler) {
    if (!element) return;
    element[property] = handler;
    bindings.push({ element: element, property: property, handler: handler });
  }

  function _releaseBindings() {
    bindings.forEach(function (binding) {
      if (binding.element && binding.element[binding.property] === binding.handler) {
        binding.element[binding.property] = null;
      }
    });
    bindings = [];
    activeModal = null;
  }

  function _setText(id, value) {
    var element = _element(id);
    if (element) element.textContent = value;
  }

  function _setStatus(message, tone) {
    var status = _element('settings-change-status');
    if (!status) return;
    status.textContent = message || '';
    if (status.dataset) status.dataset.statusTone = tone || 'neutral';
  }

  function _syncView(settings) {
    var view = buildSettingsViewModel(settings || _currentSettings());
    var controls = view.controls;
    var motion = _element('settings-motion-level');
    var secretRoutes = _element('settings-secret-routes-visible');
    var terminalBlur = _element('settings-terminal-blur');
    var soundEnabled = _element('settings-sfx-enabled');
    var soundVolume = _element('settings-sfx-volume');
    var difficulty = _element('settings-difficulty-level');
    var timeScale = _element('settings-time-scale');
    if (motion) motion.value = controls.motionLevel;
    if (secretRoutes) secretRoutes.checked = controls.secretRoutesVisible;
    if (terminalBlur) terminalBlur.checked = controls.terminalBlur;
    if (soundEnabled) soundEnabled.checked = controls.soundEffectsEnabled;
    if (soundVolume) soundVolume.value = String(controls.soundEffectsVolume);
    if (difficulty) difficulty.value = controls.difficulty;
    if (timeScale) timeScale.value = String(controls.realtimeDayDurationMs);
    _setText('settings-sfx-volume-value', view.summary.volume);
    _setText('settings-summary-motion', view.summary.motion);
    _setText('settings-summary-difficulty', view.summary.difficulty);
    _setText('settings-summary-time', view.summary.time);
    _setText('settings-summary-audio', view.summary.audio);
    return view;
  }

  function _dispatch(command) {
    var result = typeof callbacks.onCommand === 'function'
      ? callbacks.onCommand(command)
      : Object.freeze({
          ok: false,
          type: command && command.type ? command.type : '',
          message: '设置运行时尚未就绪。',
          tone: 'error',
          settings: Object.freeze(Object.assign({}, _currentSettings())),
        });
    commandCount += 1;
    lastCommandType = command && command.type ? command.type : null;
    var resolved = result && typeof result === 'object' ? result : null;
    _syncView(resolved && resolved.settings ? resolved.settings : _currentSettings());
    if (resolved && resolved.message) {
      _setStatus(resolved.message, resolved.tone || (resolved.ok ? 'success' : 'error'));
    }
    return resolved;
  }

  function _activatePanel(panelId) {
    if (!activeModal) return false;
    activePanel = ['display', 'game', 'data'].indexOf(panelId) !== -1 ? panelId : 'display';
    if (activeModal.dataset) activeModal.dataset.activePanel = activePanel;
    var radio = _element('settings-tab-' + activePanel);
    if (radio) radio.checked = true;
    _setText('settings-page-title', getSettingsPanelTitle(activePanel));
    var tabs = typeof activeModal.querySelectorAll === 'function'
      ? Array.from(activeModal.querySelectorAll('[data-settings-panel-target]') || [])
      : [];
    tabs.forEach(function (tab) {
      var isActive = tab.dataset && tab.dataset.settingsPanelTarget === activePanel;
      if (typeof tab.setAttribute === 'function') {
        tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
        tab.setAttribute('tabindex', isActive ? '0' : '-1');
      }
    });
    var panels = typeof activeModal.querySelectorAll === 'function'
      ? Array.from(activeModal.querySelectorAll('[data-settings-panel]') || [])
      : [];
    panels.forEach(function (panel) {
      var isActive = panel.dataset && panel.dataset.settingsPanel === activePanel;
      if (typeof panel.setAttribute === 'function') {
        panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        panel.setAttribute('tabindex', isActive ? '0' : '-1');
      }
    });
    return true;
  }

  function _bindTabs() {
    if (!activeModal || typeof activeModal.querySelectorAll !== 'function') return;
    var tabs = Array.from(activeModal.querySelectorAll('[data-settings-panel-target]') || []);
    tabs.forEach(function (tab, index) {
      if (typeof tab.setAttribute === 'function') {
        tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' || index === 0 ? '0' : '-1');
      }
      _bindProperty(tab, 'onclick', function () {
        _activatePanel(tab.dataset && tab.dataset.settingsPanelTarget || 'display');
      });
      _bindProperty(tab, 'onkeydown', function (event) {
        if (!event) return;
        var key = event.key;
        if (key === 'Enter' || key === ' ') {
          if (typeof event.preventDefault === 'function') event.preventDefault();
          _activatePanel(tab.dataset && tab.dataset.settingsPanelTarget || 'display');
          return;
        }
        var nextIndex = index;
        if (key === 'ArrowRight' || key === 'ArrowDown') nextIndex = (index + 1) % tabs.length;
        else if (key === 'ArrowLeft' || key === 'ArrowUp') nextIndex = (index + tabs.length - 1) % tabs.length;
        else if (key === 'Home') nextIndex = 0;
        else if (key === 'End') nextIndex = tabs.length - 1;
        else return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        var nextTab = tabs[nextIndex];
        if (!nextTab) return;
        _activatePanel(nextTab.dataset && nextTab.dataset.settingsPanelTarget || 'display');
        if (typeof nextTab.focus === 'function') nextTab.focus();
      });
    });
  }

  function _bindControls() {
    var close = _element('settings-close-btn');
    var motion = _element('settings-motion-level');
    var secretRoutes = _element('settings-secret-routes-visible');
    var terminalBlur = _element('settings-terminal-blur');
    var soundEnabled = _element('settings-sfx-enabled');
    var soundVolume = _element('settings-sfx-volume');
    var difficulty = _element('settings-difficulty-level');
    var timeScale = _element('settings-time-scale');
    var resetDefaults = _element('settings-reset-defaults-btn');
    var resetTutorial = _element('settings-reset-tutorial-btn');
    var clearSaves = _element('settings-clear-saves-btn');
    var exportUsage = _element('settings-export-usage-data-btn');
    _bindProperty(close, 'onclick', hide);
    _bindProperty(motion, 'onchange', function () { _dispatch({ type: SETTINGS_COMMAND.SET_MOTION_LEVEL, value: motion.value }); });
    _bindProperty(secretRoutes, 'onchange', function () { _dispatch({ type: SETTINGS_COMMAND.SET_SECRET_ROUTES_VISIBLE, value: !!secretRoutes.checked }); });
    _bindProperty(terminalBlur, 'onchange', function () { _dispatch({ type: SETTINGS_COMMAND.SET_TERMINAL_BLUR, value: !!terminalBlur.checked }); });
    _bindProperty(soundEnabled, 'onchange', function () { _dispatch({ type: SETTINGS_COMMAND.SET_SOUND_EFFECTS_ENABLED, value: !!soundEnabled.checked }); });
    _bindProperty(soundVolume, 'oninput', function () { _dispatch({ type: SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME, value: soundVolume.value, preview: true }); });
    _bindProperty(soundVolume, 'onchange', function () { _dispatch({ type: SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME, value: soundVolume.value }); });
    _bindProperty(difficulty, 'onchange', function () { _dispatch({ type: SETTINGS_COMMAND.SET_DIFFICULTY, value: difficulty.value }); });
    _bindProperty(timeScale, 'onchange', function () { _dispatch({ type: SETTINGS_COMMAND.SET_REALTIME_DAY_DURATION, value: timeScale.value }); });
    _bindProperty(exportUsage, 'onclick', function () { _dispatch({ type: SETTINGS_COMMAND.EXPORT_USAGE_DATA }); });
    _bindProperty(resetDefaults, 'onclick', function () { _dispatch({ type: SETTINGS_COMMAND.RESET_DEFAULTS }); });
    _bindProperty(resetTutorial, 'onclick', function () {
      confirmCount += 1;
      openConfirm({
        kicker: '重新初始化', title: '重新开始并进入教程？',
        message: '当前运行状态会被新公司替换，已有本地存档不会被删除。', confirmLabel: '确认重新开始',
        details: [
          { label: '当前运行', value: '重置为新公司', tone: 'danger' },
          { label: '教程流程', value: '重新启用' },
          { label: '本地存档', value: '继续保留', tone: 'safe' },
        ],
        onConfirm: function () { _dispatch({ type: SETTINGS_COMMAND.RESET_TUTORIAL }); },
      });
    });
    _bindProperty(clearSaves, 'onclick', function () {
      confirmCount += 1;
      openConfirm({
        kicker: '本地数据清理', title: '清空全部本地存档？',
        message: '自动存档和所有手动槽位都会被删除，当前正在运行的公司不会立即重置。', confirmLabel: '确认清空存档',
        details: [
          { label: '自动存档', value: '永久删除', tone: 'danger' },
          { label: '手动槽位', value: '全部删除', tone: 'danger' },
          { label: '当前运行', value: '暂时保留', tone: 'safe' },
        ],
        onConfirm: function () { _dispatch({ type: SETTINGS_COMMAND.CLEAR_SAVES }); },
      });
    });
  }

  function bind(nextCallbacks) {
    callbacks = {
      getSettings: _optionalFunction(nextCallbacks && nextCallbacks.getSettings, fallbackGetSettings),
      onCommand: nextCallbacks && typeof nextCallbacks.onCommand === 'function' ? nextCallbacks.onCommand : null,
    };
    _releaseBindings();
    activeModal = _element(SURFACE_ID);
    if (!activeModal) return false;
    bindDismiss(SURFACE_ID);
    _bindTabs();
    _bindControls();
    bindCount += 1;
    return true;
  }

  function show() {
    if (!activeModal) return false;
    _syncView(_currentSettings());
    _setStatus('更改会自动保存在当前设备。', 'neutral');
    _activatePanel(activeModal.dataset && activeModal.dataset.activePanel || activePanel);
    showSurface(SURFACE_ID, { focusSelector: '[data-settings-panel-target][aria-selected="true"]' });
    showCount += 1;
    return true;
  }

  function hide() {
    hideSurface(SURFACE_ID);
    hideCount += 1;
    return true;
  }

  function reset() {
    cancelConfirm();
    hideSurface(SURFACE_ID);
    activePanel = 'display';
    if (activeModal) _activatePanel(activePanel);
    commandCount = 0;
    confirmCount = 0;
    lastCommandType = null;
    resetCount += 1;
    return getDiagnostics();
  }

  function dispose() {
    cancelConfirm();
    hideSurface(SURFACE_ID);
    _releaseBindings();
    callbacks = { getSettings: fallbackGetSettings, onCommand: null };
    activePanel = 'display';
    commandCount = 0;
    confirmCount = 0;
    lastCommandType = null;
    disposeCount += 1;
    return getDiagnostics();
  }

  function getDiagnostics() {
    return Object.freeze({
      activePanel: activePanel,
      bindCount: bindCount,
      bound: !!activeModal,
      commandCount: commandCount,
      confirmCount: confirmCount,
      disposeCount: disposeCount,
      hideCount: hideCount,
      lastCommandType: lastCommandType,
      resetCount: resetCount,
      showCount: showCount,
    });
  }

  return Object.freeze({
    bind: bind,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    hide: hide,
    reset: reset,
    show: show,
  });
}
