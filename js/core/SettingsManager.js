// js/core/SettingsManager.js — 设置管理
// 依赖：SettingsCommandController typed command port
// 导出：loadSettings, saveSettings, initSettingsModal,
//       showSettingsModal, hideSettingsModal

import { bindBlockingSurfaceDismiss, hideBlockingSurface, showBlockingSurface } from '../ui/SurfaceManager.js';
import * as ActionConfirmUI from '../ui/ActionConfirmUI.js';
import { SETTINGS_COMMAND } from './SettingsCommandController.js';
import {
  loadSettings,
  normalizeRealtimeDayDurationMs as _normalizeRealtimeDayDurationMs,
  normalizeSecretRoutesVisible as _normalizeSecretRoutesVisible,
  normalizeSoundEffectsVolume as _normalizeSoundEffectsVolume,
} from './SettingsCore.js';

export { loadSettings, saveSettings } from './SettingsCore.js';
let _settingsModalCallbacks = null;

function _getSettingsModalCallbacks() {
  return _settingsModalCallbacks || {
    getSettings: loadSettings,
    onCommand: null,
  };
}

function _getCurrentSettings() {
  var callbacks = _getSettingsModalCallbacks();
  var settings = typeof callbacks.getSettings === 'function'
    ? callbacks.getSettings()
    : null;
  return settings && typeof settings === 'object' ? settings : loadSettings();
}

function _dispatchSettingsCommand(command) {
  var callbacks = _getSettingsModalCallbacks();
  if (typeof callbacks.onCommand !== 'function') {
    return Object.freeze({
      ok: false,
      type: command && command.type ? command.type : '',
      message: '设置运行时尚未就绪。',
      tone: 'error',
      settings: Object.freeze(Object.assign({}, _getCurrentSettings())),
    });
  }
  return callbacks.onCommand(command);
}

function _presentCommandResult(result) {
  var resolved = result && typeof result === 'object' ? result : null;
  var settings = resolved && resolved.settings ? resolved.settings : _getCurrentSettings();
  _syncSettingsOverview(settings);
  if (resolved && resolved.message) {
    _setSettingsChangeStatus(resolved.message, resolved.tone || (resolved.ok ? 'success' : 'error'));
  }
  return settings;
}

// ---------------------------------------------------------------------------
// 设置弹窗
// ---------------------------------------------------------------------------

/**
 * 初始化设置弹窗事件绑定
 * @param {object} callbacks
 * @param {Function} callbacks.getSettings       最新设置 provider
 * @param {Function} callbacks.onCommand         typed settings command port
 * @param {Function} callbacks.onOpen             设置弹窗打开前回调
 */
export function initSettingsModal(callbacks) {
  _settingsModalCallbacks = callbacks || null;

  var settingsBtn   = document.getElementById('settings-btn');
  var modal         = document.getElementById('settings-modal');
  var closeBtn      = document.getElementById('settings-close-btn');
  var motionSelect  = document.getElementById('settings-motion-level');
  var secretRoutesToggle = document.getElementById('settings-secret-routes-visible');
  var terminalBlurToggle = document.getElementById('settings-terminal-blur');
  var soundEffectsToggle = document.getElementById('settings-sfx-enabled');
  var soundEffectsVolume = document.getElementById('settings-sfx-volume');
  var soundEffectsVolumeValue = document.getElementById('settings-sfx-volume-value');
  var difficultySelect = document.getElementById('settings-difficulty-level');
  var timeScaleSelect = document.getElementById('settings-time-scale');
  var resetDefaultsBtn = document.getElementById('settings-reset-defaults-btn');
  var resetTutorialBtn = document.getElementById('settings-reset-tutorial-btn');
  var clearSavesBtn    = document.getElementById('settings-clear-saves-btn');
  var exportUsageDataBtn = document.getElementById('settings-export-usage-data-btn');
  if (!settingsBtn || !modal) return;

  if (settingsBtn.dataset.settingsBound === 'true') return;
  settingsBtn.dataset.settingsBound = 'true';
  bindBlockingSurfaceDismiss('settings-modal');

  settingsBtn.addEventListener('click', function (e) {
    e.preventDefault();
    var activeCallbacks = _getSettingsModalCallbacks();
    if (activeCallbacks.onOpen) activeCallbacks.onOpen();
    showSettingsModal();
  });
  if (closeBtn) closeBtn.addEventListener('click', hideSettingsModal);
  _bindSettingsPanelKeyboard(modal);
  if (motionSelect) {
    motionSelect.onchange = function () {
      _presentCommandResult(_dispatchSettingsCommand({
        type: SETTINGS_COMMAND.SET_MOTION_LEVEL,
        value: motionSelect.value,
      }));
    };
  }
  if (secretRoutesToggle) {
    secretRoutesToggle.onchange = function () {
      _presentCommandResult(_dispatchSettingsCommand({
        type: SETTINGS_COMMAND.SET_SECRET_ROUTES_VISIBLE,
        value: !!secretRoutesToggle.checked,
      }));
    };
  }
  if (terminalBlurToggle) {
    terminalBlurToggle.onchange = function () {
      _presentCommandResult(_dispatchSettingsCommand({
        type: SETTINGS_COMMAND.SET_TERMINAL_BLUR,
        value: !!terminalBlurToggle.checked,
      }));
    };
  }
  if (soundEffectsToggle) {
    soundEffectsToggle.onchange = function () {
      _presentCommandResult(_dispatchSettingsCommand({
        type: SETTINGS_COMMAND.SET_SOUND_EFFECTS_ENABLED,
        value: !!soundEffectsToggle.checked,
      }));
    };
  }
  if (soundEffectsVolume) {
    soundEffectsVolume.oninput = function () {
      var result = _dispatchSettingsCommand({
        type: SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME,
        value: soundEffectsVolume.value,
        preview: true,
      });
      var settings = _presentCommandResult(result);
      _syncSoundEffectsVolumeLabel(soundEffectsVolumeValue, settings.soundEffectsVolume);
    };
    soundEffectsVolume.onchange = function () {
      _presentCommandResult(_dispatchSettingsCommand({
        type: SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME,
        value: soundEffectsVolume.value,
      }));
    };
  }
  if (exportUsageDataBtn) {
    exportUsageDataBtn.onclick = function () {
      _presentCommandResult(_dispatchSettingsCommand({
        type: SETTINGS_COMMAND.EXPORT_USAGE_DATA,
      }));
    };
  }
  if (difficultySelect) {
    difficultySelect.onchange = function () {
      _presentCommandResult(_dispatchSettingsCommand({
        type: SETTINGS_COMMAND.SET_DIFFICULTY,
        value: difficultySelect.value,
      }));
    };
  }
  if (timeScaleSelect) {
    timeScaleSelect.onchange = function () {
      _presentCommandResult(_dispatchSettingsCommand({
        type: SETTINGS_COMMAND.SET_REALTIME_DAY_DURATION,
        value: timeScaleSelect.value,
      }));
    };
  }
  if (resetDefaultsBtn) {
    resetDefaultsBtn.onclick = function () {
      var settings = _presentCommandResult(_dispatchSettingsCommand({
        type: SETTINGS_COMMAND.RESET_DEFAULTS,
      }));
      _syncSettingsControls({
        motionSelect: motionSelect,
        secretRoutesToggle: secretRoutesToggle,
        terminalBlurToggle: terminalBlurToggle,
        soundEffectsToggle: soundEffectsToggle,
        soundEffectsVolume: soundEffectsVolume,
        soundEffectsVolumeValue: soundEffectsVolumeValue,
        difficultySelect: difficultySelect,
        timeScaleSelect: timeScaleSelect,
      }, settings);
    };
  }
  if (resetTutorialBtn) {
    resetTutorialBtn.onclick = function () {
      ActionConfirmUI.open({
        kicker: '重新初始化',
        title: '重新开始并进入教程？',
        message: '当前运行状态会被新公司替换，已有本地存档不会被删除。',
        confirmLabel: '确认重新开始',
        details: [
          { label: '当前运行', value: '重置为新公司', tone: 'danger' },
          { label: '教程流程', value: '重新启用' },
          { label: '本地存档', value: '继续保留', tone: 'safe' },
        ],
        onConfirm: function () {
          _dispatchSettingsCommand({ type: SETTINGS_COMMAND.RESET_TUTORIAL });
        },
      });
    };
  }
  if (clearSavesBtn) {
    clearSavesBtn.onclick = function () {
      ActionConfirmUI.open({
        kicker: '本地数据清理',
        title: '清空全部本地存档？',
        message: '自动存档和所有手动槽位都会被删除，当前正在运行的公司不会立即重置。',
        confirmLabel: '确认清空存档',
        details: [
          { label: '自动存档', value: '永久删除', tone: 'danger' },
          { label: '手动槽位', value: '全部删除', tone: 'danger' },
          { label: '当前运行', value: '暂时保留', tone: 'safe' },
        ],
        onConfirm: function () {
          _dispatchSettingsCommand({ type: SETTINGS_COMMAND.CLEAR_SAVES });
        },
      });
    };
  }
}

function _bindSettingsPanelKeyboard(modal) {
  if (!modal || typeof modal.querySelectorAll !== 'function') return;
  var tabs = Array.prototype.slice.call(modal.querySelectorAll('[data-settings-panel-target]') || []);
  if (!tabs.length) return;

  tabs.forEach(function (tab, index) {
    if (!tab || tab.dataset.settingsKeyboardBound === 'true') return;
    tab.dataset.settingsKeyboardBound = 'true';
    if (typeof tab.setAttribute === 'function') {
      tab.setAttribute('tabindex', tab.getAttribute('aria-selected') === 'true' || index === 0 ? '0' : '-1');
    }

    tab.addEventListener('click', function () {
      _activateSettingsPanel(tab.dataset.settingsPanelTarget || 'display');
    });

    tab.addEventListener('keydown', function (event) {
      if (!event) return;
      var key = event.key;
      if (key === 'Enter' || key === ' ') {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        _activateSettingsPanel(tab.dataset.settingsPanelTarget || 'display');
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
      _activateSettingsPanel(nextTab.dataset.settingsPanelTarget || 'display');
      if (typeof nextTab.focus === 'function') nextTab.focus();
    });
  });
}

/**
 * 显示设置弹窗
 */
export function showSettingsModal() {
  _toggleSettingsModal(true);
}

/**
 * 隐藏设置弹窗
 */
export function hideSettingsModal() {
  _toggleSettingsModal(false);
}

// ---------------------------------------------------------------------------
// 私有
// ---------------------------------------------------------------------------

function _toggleSettingsModal(isVisible) {
  var modal = document.getElementById('settings-modal');
  var motionSelect = document.getElementById('settings-motion-level');
  var secretRoutesToggle = document.getElementById('settings-secret-routes-visible');
  var terminalBlurToggle = document.getElementById('settings-terminal-blur');
  var soundEffectsToggle = document.getElementById('settings-sfx-enabled');
  var soundEffectsVolume = document.getElementById('settings-sfx-volume');
  var soundEffectsVolumeValue = document.getElementById('settings-sfx-volume-value');
  var difficultySelect = document.getElementById('settings-difficulty-level');
  var timeScaleSelect = document.getElementById('settings-time-scale');
  if (!modal) return;
  if (isVisible) {
    var current = _getCurrentSettings();
    _syncSettingsControls({
      motionSelect: motionSelect,
      secretRoutesToggle: secretRoutesToggle,
      terminalBlurToggle: terminalBlurToggle,
      soundEffectsToggle: soundEffectsToggle,
      soundEffectsVolume: soundEffectsVolume,
      soundEffectsVolumeValue: soundEffectsVolumeValue,
      difficultySelect: difficultySelect,
      timeScaleSelect: timeScaleSelect,
    }, current);
    _syncSettingsOverview(current);
    _setSettingsChangeStatus('更改会自动保存在当前设备。', 'neutral');
  }
  if (isVisible) _activateSettingsPanel(modal.dataset.activePanel || 'display');
  if (isVisible) {
    showBlockingSurface('settings-modal', {
      focusSelector: '[data-settings-panel-target][aria-selected="true"]',
    });
  }
  else hideBlockingSurface('settings-modal');
}

function _syncSettingsControls(controls, settings) {
  var elements = controls || {};
  var current = settings || _getCurrentSettings();
  if (elements.motionSelect) elements.motionSelect.value = current.motionLevel || 'full';
  if (elements.secretRoutesToggle) {
    elements.secretRoutesToggle.checked = _normalizeSecretRoutesVisible(current.secretRoutesVisible);
  }
  if (elements.terminalBlurToggle) elements.terminalBlurToggle.checked = current.terminalBlur !== false;
  if (elements.soundEffectsToggle) elements.soundEffectsToggle.checked = current.soundEffectsEnabled !== false;
  if (elements.soundEffectsVolume) {
    elements.soundEffectsVolume.value = String(_normalizeSoundEffectsVolume(current.soundEffectsVolume));
  }
  _syncSoundEffectsVolumeLabel(elements.soundEffectsVolumeValue, current.soundEffectsVolume);
  if (elements.difficultySelect) elements.difficultySelect.value = current.difficulty || 'normal';
  if (elements.timeScaleSelect) {
    elements.timeScaleSelect.value = String(_normalizeRealtimeDayDurationMs(current.realtimeDayDurationMs));
  }
}

function _syncSoundEffectsVolumeLabel(labelEl, volume) {
  if (!labelEl) return;
  labelEl.textContent = Math.round(_normalizeSoundEffectsVolume(volume) * 100) + '%';
}

function _setSettingsChangeStatus(message, tone) {
  var statusEl = document.getElementById('settings-change-status');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  if (statusEl.dataset) statusEl.dataset.statusTone = tone || 'neutral';
}

function _formatRealtimeDayDurationLabel(durationMs) {
  return Math.round(durationMs / 1000) + ' 秒 / 天';
}

function _syncSettingsOverview(settings) {
  var activeSettings = settings || _getCurrentSettings();
  _setSettingsOverviewValue('settings-summary-motion', _formatMotionLevelLabel(activeSettings.motionLevel));
  _setSettingsOverviewValue('settings-summary-difficulty', _formatDifficultyLabel(activeSettings.difficulty));
  _setSettingsOverviewValue('settings-summary-time', _formatRealtimeDayDurationLabel(_normalizeRealtimeDayDurationMs(activeSettings.realtimeDayDurationMs)));
  _setSettingsOverviewValue('settings-summary-audio', _formatSoundEffectsSummary(activeSettings));
}

function _setSettingsOverviewValue(id, value) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
}

function _formatMotionLevelLabel(motionLevel) {
  if (motionLevel === 'reduced') return '降低';
  if (motionLevel === 'off') return '关闭';
  return '完整';
}

function _formatDifficultyLabel(difficulty) {
  if (difficulty === 'easy') return '休闲模式';
  if (difficulty === 'hard') return '挑战模式';
  return '标准模式';
}

function _formatSoundEffectsSummary(settings) {
  var enabled = settings && settings.soundEffectsEnabled !== false;
  var volume = _normalizeSoundEffectsVolume(settings && settings.soundEffectsVolume);
  return (enabled ? '开启' : '关闭') + ' · ' + Math.round(volume * 100) + '%';
}

function _activateSettingsPanel(panelId) {
  var modal = document.getElementById('settings-modal');
  if (!modal) return;

  var targetId = panelId || 'display';
  modal.dataset.activePanel = targetId;

  var radio = document.getElementById('settings-tab-' + targetId);
  if (radio) radio.checked = true;

  var titleEl = document.getElementById('settings-page-title');
  if (titleEl) {
    var titles = { display: '显示设置', game: '游戏设置', data: '数据管理' };
    titleEl.textContent = titles[targetId] || '设置';
  }

  modal.querySelectorAll('[data-settings-panel-target]').forEach(function (btn) {
    var isActive = btn.dataset.settingsPanelTarget === targetId;
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');
  });

  modal.querySelectorAll('[data-settings-panel]').forEach(function (panel) {
    var isActive = panel.dataset.settingsPanel === targetId;
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    panel.setAttribute('tabindex', isActive ? '0' : '-1');
  });
}
