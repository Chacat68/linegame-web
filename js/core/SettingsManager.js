// js/core/SettingsManager.js — 设置管理
// 依赖：core/EventBus.js
// 导出：loadSettings, saveSettings, applySettings,
//       initSettingsModal, showSettingsModal, hideSettingsModal

import * as EventBus from './EventBus.js';
import * as Audio from './AudioManager.js';
import { TIME_CONFIG } from '../data/constants.js';
import { bindBlockingSurfaceDismiss, hideBlockingSurface, showBlockingSurface } from '../ui/SurfaceManager.js';
import * as ActionConfirmUI from '../ui/ActionConfirmUI.js';
import {
  DEFAULT_SOUND_EFFECTS_VOLUME,
  applySettings as applyCoreSettings,
  loadSettings,
  normalizeRealtimeDayDurationMs as _normalizeRealtimeDayDurationMs,
  normalizeSecretRoutesVisible as _normalizeSecretRoutesVisible,
  normalizeSoundEffectsVolume as _normalizeSoundEffectsVolume,
  saveSettings,
} from './SettingsCore.js';

export { loadSettings, saveSettings } from './SettingsCore.js';
let _settingsModalCallbacks = null;

function _getSettingsModalCallbacks() {
  return _settingsModalCallbacks || {
    settings: loadSettings(),
    Renderer: {
      setMotionLevel: function () {},
      setSecretRoutesVisible: function () {},
    },
    onDifficultyChanged: null,
    onRealtimeDayDurationChanged: null,
    onResetTutorial: null,
    onClearSaves: null,
  };
}

/**
 * 将设置应用到 DOM 和渲染器
 * @param {{ motionLevel: string, secretRoutesVisible: boolean }} settings
 * @param {{ setMotionLevel: Function, setSecretRoutesVisible: Function }} Renderer
 */
export function applySettings(settings, Renderer) {
  applyCoreSettings(settings, Renderer);
  _syncSettingsOverview(settings);
}

// ---------------------------------------------------------------------------
// 设置弹窗
// ---------------------------------------------------------------------------

/**
 * 初始化设置弹窗事件绑定
 * @param {object} callbacks
 * @param {{ motionLevel: string, secretRoutesVisible: boolean, difficulty: string, realtimeDayDurationMs: number }} callbacks.settings  当前设置引用
 * @param {Function} callbacks.onSettingsChanged  设置变更后的回调
 * @param {Function} callbacks.onDifficultyChanged 难度变更回调
 * @param {Function} callbacks.onRealtimeDayDurationChanged 实时天数流速变更回调
 * @param {Function} callbacks.onOpen             设置弹窗打开前回调
 * @param {Function} callbacks.onResetTutorial     重置教程回调
 * @param {Function} callbacks.onClearSaves        清空存档回调
 * @param {{ setMotionLevel: Function, setSecretRoutesVisible: Function }} callbacks.Renderer  渲染器引用
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
      var activeCallbacks = _getSettingsModalCallbacks();
      activeCallbacks.settings.motionLevel = motionSelect.value;
      saveSettings(activeCallbacks.settings);
      applySettings(activeCallbacks.settings, activeCallbacks.Renderer);
      _syncSettingsOverview(activeCallbacks.settings);
      _setSettingsChangeStatus('动画强度已更新为' + _formatMotionLevelLabel(motionSelect.value) + '。', 'success');
      EventBus.emit('log:message', {
        text: '⚙ 已更新动画强度：' + (motionSelect.value === 'full' ? '完整' : (motionSelect.value === 'reduced' ? '降低' : '关闭')) + '。',
        type: 'info',
      });
    };
  }
  if (secretRoutesToggle) {
    secretRoutesToggle.onchange = function () {
      var activeCallbacks = _getSettingsModalCallbacks();
      activeCallbacks.settings.secretRoutesVisible = !!secretRoutesToggle.checked;
      saveSettings(activeCallbacks.settings);
      applySettings(activeCallbacks.settings, activeCallbacks.Renderer);
      _syncSettingsOverview(activeCallbacks.settings);
      _setSettingsChangeStatus('隐藏航线显示已' + (secretRoutesToggle.checked ? '开启' : '关闭') + '。', 'success');
      EventBus.emit('log:message', {
        text: '⚙ 已更新隐藏航线显示：' + (secretRoutesToggle.checked ? '显示' : '隐藏') + '。',
        type: 'info',
      });
    };
  }
  if (terminalBlurToggle) {
    terminalBlurToggle.onchange = function () {
      var activeCallbacks = _getSettingsModalCallbacks();
      activeCallbacks.settings.terminalBlur = !!terminalBlurToggle.checked;
      saveSettings(activeCallbacks.settings);
      EventBus.emit('settings:terminalBlur:changed', activeCallbacks.settings.terminalBlur);
      _syncSettingsOverview(activeCallbacks.settings);
      _setSettingsChangeStatus('全息终端模糊已' + (terminalBlurToggle.checked ? '开启' : '关闭') + '。', 'success');
      EventBus.emit('log:message', {
        text: '⚙ 已更新全息终端高斯模糊特效：' + (terminalBlurToggle.checked ? '开启 (高品质)' : '关闭 (低开销)') + '。',
        type: 'info',
      });
    };
  }
  if (soundEffectsToggle) {
    soundEffectsToggle.onchange = function () {
      var activeCallbacks = _getSettingsModalCallbacks();
      activeCallbacks.settings.soundEffectsEnabled = !!soundEffectsToggle.checked;
      saveSettings(activeCallbacks.settings);
      Audio.applySettings(activeCallbacks.settings);
      if (soundEffectsToggle.checked) Audio.playCue('settings.change');
      _syncSettingsOverview(activeCallbacks.settings);
      _setSettingsChangeStatus('音效反馈已' + (soundEffectsToggle.checked ? '开启' : '关闭') + '。', 'success');
      EventBus.emit('log:message', {
        text: '⚙ 已更新音效反馈：' + (soundEffectsToggle.checked ? '开启' : '关闭') + '。',
        type: 'info',
      });
    };
  }
  if (soundEffectsVolume) {
    soundEffectsVolume.oninput = function () {
      var activeCallbacks = _getSettingsModalCallbacks();
      activeCallbacks.settings.soundEffectsVolume = _normalizeSoundEffectsVolume(soundEffectsVolume.value);
      saveSettings(activeCallbacks.settings);
      Audio.applySettings(activeCallbacks.settings);
      _syncSoundEffectsVolumeLabel(soundEffectsVolumeValue, activeCallbacks.settings.soundEffectsVolume);
      _syncSettingsOverview(activeCallbacks.settings);
    };
    soundEffectsVolume.onchange = function () {
      Audio.playCue('settings.change');
      var activeCallbacks = _getSettingsModalCallbacks();
      _setSettingsChangeStatus('音效音量已更新为' + Math.round(_normalizeSoundEffectsVolume(activeCallbacks.settings.soundEffectsVolume) * 100) + '%。', 'success');
    };
  }
  if (difficultySelect) {
    difficultySelect.onchange = function () {
      var activeCallbacks = _getSettingsModalCallbacks();
      activeCallbacks.settings.difficulty = difficultySelect.value;
      saveSettings(activeCallbacks.settings);
      if (activeCallbacks.onDifficultyChanged) {
        activeCallbacks.onDifficultyChanged(difficultySelect.value);
      }
      _syncSettingsOverview(activeCallbacks.settings);
      _setSettingsChangeStatus('游戏难度已更新为' + _formatDifficultyLabel(difficultySelect.value) + '。', 'success');
      var labelMap = {
        easy: '休闲模式',
        normal: '标准模式',
        hard: '挑战模式',
      };
      EventBus.emit('log:message', {
        text: '⚙ 已更新游戏难度：' + (labelMap[difficultySelect.value] || '标准模式') + '。',
        type: 'info',
      });
    };
  }
  if (timeScaleSelect) {
    timeScaleSelect.onchange = function () {
      var activeCallbacks = _getSettingsModalCallbacks();
      var nextDurationMs = _normalizeRealtimeDayDurationMs(timeScaleSelect.value);
      activeCallbacks.settings.realtimeDayDurationMs = nextDurationMs;
      saveSettings(activeCallbacks.settings);
      if (activeCallbacks.onRealtimeDayDurationChanged) {
        activeCallbacks.onRealtimeDayDurationChanged(nextDurationMs);
      }
      _syncSettingsOverview(activeCallbacks.settings);
      _setSettingsChangeStatus('时间流速已更新为' + _formatRealtimeDayDurationLabel(nextDurationMs) + '。', 'success');
      EventBus.emit('log:message', {
        text: '⚙ 已更新时间流速：' + _formatRealtimeDayDurationLabel(nextDurationMs) + '。',
        type: 'info',
      });
    };
  }
  if (resetDefaultsBtn) {
    resetDefaultsBtn.onclick = function () {
      var activeCallbacks = _getSettingsModalCallbacks();
      activeCallbacks.settings.motionLevel = 'full';
      activeCallbacks.settings.difficulty = 'normal';
      activeCallbacks.settings.secretRoutesVisible = true;
      activeCallbacks.settings.realtimeDayDurationMs = TIME_CONFIG.realtimeDayDurationMs;
      activeCallbacks.settings.terminalBlur = true;
      activeCallbacks.settings.soundEffectsEnabled = true;
      activeCallbacks.settings.soundEffectsVolume = DEFAULT_SOUND_EFFECTS_VOLUME;
      saveSettings(activeCallbacks.settings);
      applySettings(activeCallbacks.settings, activeCallbacks.Renderer);
      if (motionSelect) motionSelect.value = 'full';
      if (secretRoutesToggle) secretRoutesToggle.checked = true;
      if (terminalBlurToggle) terminalBlurToggle.checked = true;
      if (soundEffectsToggle) soundEffectsToggle.checked = true;
      if (soundEffectsVolume) soundEffectsVolume.value = String(DEFAULT_SOUND_EFFECTS_VOLUME);
      _syncSoundEffectsVolumeLabel(soundEffectsVolumeValue, DEFAULT_SOUND_EFFECTS_VOLUME);
      if (difficultySelect) difficultySelect.value = 'normal';
      if (timeScaleSelect) timeScaleSelect.value = String(TIME_CONFIG.realtimeDayDurationMs);
      if (activeCallbacks.onDifficultyChanged) activeCallbacks.onDifficultyChanged('normal');
      if (activeCallbacks.onRealtimeDayDurationChanged) activeCallbacks.onRealtimeDayDurationChanged(TIME_CONFIG.realtimeDayDurationMs);
      EventBus.emit('settings:terminalBlur:changed', true);
      Audio.playCue('settings.change');
      _syncSettingsOverview(activeCallbacks.settings);
      _setSettingsChangeStatus('所有设置已恢复为默认值。', 'success');
      EventBus.emit('log:message', { text: '⚙ 设置已恢复为默认值。', type: 'info' });
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
          var activeCallbacks = _getSettingsModalCallbacks();
          if (activeCallbacks.onResetTutorial) activeCallbacks.onResetTutorial();
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
          var activeCallbacks = _getSettingsModalCallbacks();
          if (activeCallbacks.onClearSaves) activeCallbacks.onClearSaves();
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
    var current = loadSettings();
    // 读取当前 localStorage 设置同步到 select
    if (motionSelect) {
      motionSelect.value = current.motionLevel || 'full';
    }
    if (secretRoutesToggle) secretRoutesToggle.checked = _normalizeSecretRoutesVisible(current.secretRoutesVisible);
    if (terminalBlurToggle) terminalBlurToggle.checked = current.terminalBlur !== false;
    if (soundEffectsToggle) soundEffectsToggle.checked = current.soundEffectsEnabled !== false;
    if (soundEffectsVolume) soundEffectsVolume.value = String(_normalizeSoundEffectsVolume(current.soundEffectsVolume));
    _syncSoundEffectsVolumeLabel(soundEffectsVolumeValue, current.soundEffectsVolume);
    if (difficultySelect) difficultySelect.value = current.difficulty || 'normal';
    if (timeScaleSelect) timeScaleSelect.value = String(_normalizeRealtimeDayDurationMs(current.realtimeDayDurationMs));
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
  var activeSettings = settings || loadSettings();
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
