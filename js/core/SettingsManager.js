// js/core/SettingsManager.js — 设置管理
// 依赖：core/EventBus.js
// 导出：loadSettings, saveSettings, applySettings,
//       initSettingsModal, showSettingsModal, hideSettingsModal

import * as EventBus from './EventBus.js';
import { TIME_CONFIG } from '../data/constants.js';

const SETTINGS_KEY = 'linegame_settings';

const VALID_MOTION_LEVELS = ['full', 'reduced', 'off'];
const VALID_DIFFICULTIES = ['easy', 'normal', 'hard'];
const VALID_REALTIME_DAY_DURATIONS_MS = TIME_CONFIG.availableRealtimeDayDurationsMs || [TIME_CONFIG.realtimeDayDurationMs];

function _normalizeSecretRoutesVisible(value) {
  return value !== false;
}

function _normalizeRealtimeDayDurationMs(value) {
  var numericValue = Number(value);
  return VALID_REALTIME_DAY_DURATIONS_MS.indexOf(numericValue) >= 0
    ? numericValue
    : TIME_CONFIG.realtimeDayDurationMs;
}

// ---------------------------------------------------------------------------
// 设置加载 / 持久化
// ---------------------------------------------------------------------------

/**
 * 从 localStorage 加载设置
 * @returns {{ motionLevel: string, difficulty: string, secretRoutesVisible: boolean, realtimeDayDurationMs: number }}
 */
export function loadSettings() {
  try {
    var raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return {
        motionLevel: 'full',
        difficulty: 'normal',
        secretRoutesVisible: true,
        realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
      };
    }
    var parsed = JSON.parse(raw);
    return {
      motionLevel: VALID_MOTION_LEVELS.indexOf(parsed.motionLevel) >= 0
        ? parsed.motionLevel
        : 'full',
      difficulty: VALID_DIFFICULTIES.indexOf(parsed.difficulty) >= 0
        ? parsed.difficulty
        : 'normal',
      secretRoutesVisible: _normalizeSecretRoutesVisible(parsed.secretRoutesVisible),
      realtimeDayDurationMs: _normalizeRealtimeDayDurationMs(parsed.realtimeDayDurationMs),
    };
  } catch (_) {
    return {
      motionLevel: 'full',
      difficulty: 'normal',
      secretRoutesVisible: true,
      realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
    };
  }
}

/**
 * 保存设置到 localStorage
 * @param {{ motionLevel: string, difficulty: string, secretRoutesVisible: boolean, realtimeDayDurationMs: number }} settings
 */
export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * 将设置应用到 DOM 和渲染器
 * @param {{ motionLevel: string, secretRoutesVisible: boolean }} settings
 * @param {{ setMotionLevel: Function, setSecretRoutesVisible: Function }} Renderer
 */
export function applySettings(settings, Renderer) {
  document.body.dataset.motion = settings.motionLevel || 'full';
  Renderer.setMotionLevel(settings.motionLevel || 'full');
  if (Renderer.setSecretRoutesVisible) {
    Renderer.setSecretRoutesVisible(_normalizeSecretRoutesVisible(settings.secretRoutesVisible));
  }
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
 * @param {Function} callbacks.onResetTutorial     重置教程回调
 * @param {Function} callbacks.onClearSaves        清空存档回调
 * @param {{ setMotionLevel: Function, setSecretRoutesVisible: Function }} callbacks.Renderer  渲染器引用
 */
export function initSettingsModal(callbacks) {
  var settingsBtn   = document.getElementById('settings-btn');
  var modal         = document.getElementById('settings-modal');
  var closeBtn      = document.getElementById('settings-close-btn');
  var motionSelect  = document.getElementById('settings-motion-level');
  var secretRoutesToggle = document.getElementById('settings-secret-routes-visible');
  var difficultySelect = document.getElementById('settings-difficulty-level');
  var timeScaleSelect = document.getElementById('settings-time-scale');
  var resetDefaultsBtn = document.getElementById('settings-reset-defaults-btn');
  var resetTutorialBtn = document.getElementById('settings-reset-tutorial-btn');
  var clearSavesBtn    = document.getElementById('settings-clear-saves-btn');
  if (!settingsBtn || !modal) return;

  if (settingsBtn.dataset.settingsBound === 'true') return;
  settingsBtn.dataset.settingsBound = 'true';

  settingsBtn.addEventListener('click', function (e) {
    e.preventDefault();
    showSettingsModal();
  });
  if (closeBtn) closeBtn.addEventListener('click', hideSettingsModal);
  if (motionSelect) {
    motionSelect.onchange = function () {
      callbacks.settings.motionLevel = motionSelect.value;
      saveSettings(callbacks.settings);
      applySettings(callbacks.settings, callbacks.Renderer);
      EventBus.emit('log:message', {
        text: '⚙ 已更新动画强度：' + (motionSelect.value === 'full' ? '完整' : (motionSelect.value === 'reduced' ? '降低' : '关闭')) + '。',
        type: 'info',
      });
    };
  }
  if (secretRoutesToggle) {
    secretRoutesToggle.onchange = function () {
      callbacks.settings.secretRoutesVisible = !!secretRoutesToggle.checked;
      saveSettings(callbacks.settings);
      applySettings(callbacks.settings, callbacks.Renderer);
      EventBus.emit('log:message', {
        text: '⚙ 已更新暗线显示：' + (secretRoutesToggle.checked ? '显示' : '隐藏') + '。',
        type: 'info',
      });
    };
  }
  if (difficultySelect) {
    difficultySelect.onchange = function () {
      callbacks.settings.difficulty = difficultySelect.value;
      saveSettings(callbacks.settings);
      if (callbacks.onDifficultyChanged) {
        callbacks.onDifficultyChanged(difficultySelect.value);
      }
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
      var nextDurationMs = _normalizeRealtimeDayDurationMs(timeScaleSelect.value);
      callbacks.settings.realtimeDayDurationMs = nextDurationMs;
      saveSettings(callbacks.settings);
      if (callbacks.onRealtimeDayDurationChanged) {
        callbacks.onRealtimeDayDurationChanged(nextDurationMs);
      }
      EventBus.emit('log:message', {
        text: '⚙ 已更新时间流速：' + _formatRealtimeDayDurationLabel(nextDurationMs) + '。',
        type: 'info',
      });
    };
  }
  if (resetDefaultsBtn) {
    resetDefaultsBtn.onclick = function () {
      callbacks.settings.motionLevel = 'full';
      callbacks.settings.difficulty = 'normal';
      callbacks.settings.secretRoutesVisible = true;
      callbacks.settings.realtimeDayDurationMs = TIME_CONFIG.realtimeDayDurationMs;
      saveSettings(callbacks.settings);
      applySettings(callbacks.settings, callbacks.Renderer);
      if (motionSelect) motionSelect.value = 'full';
      if (secretRoutesToggle) secretRoutesToggle.checked = true;
      if (difficultySelect) difficultySelect.value = 'normal';
      if (timeScaleSelect) timeScaleSelect.value = String(TIME_CONFIG.realtimeDayDurationMs);
      if (callbacks.onDifficultyChanged) callbacks.onDifficultyChanged('normal');
      if (callbacks.onRealtimeDayDurationChanged) callbacks.onRealtimeDayDurationChanged(TIME_CONFIG.realtimeDayDurationMs);
      EventBus.emit('log:message', { text: '⚙ 设置已恢复为默认值。', type: 'info' });
    };
  }
  if (resetTutorialBtn) {
    resetTutorialBtn.onclick = function () {
      if (!confirm('这会重新开始当前游戏，并在开局重新进入教程。是否继续？')) return;
      callbacks.onResetTutorial();
    };
  }
  if (clearSavesBtn) {
    clearSavesBtn.onclick = function () {
      if (!confirm('确定清空所有本地存档吗？此操作不可撤销。')) return;
      callbacks.onClearSaves();
    };
  }
  modal.addEventListener('click', function (e) {
    if (e.target === modal) hideSettingsModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      hideSettingsModal();
    }
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
  var difficultySelect = document.getElementById('settings-difficulty-level');
  var timeScaleSelect = document.getElementById('settings-time-scale');
  if (!modal) return;
  if (motionSelect && isVisible) {
    // 读取当前 localStorage 设置同步到 select
    var current = loadSettings();
    motionSelect.value = current.motionLevel || 'full';
    if (secretRoutesToggle) secretRoutesToggle.checked = _normalizeSecretRoutesVisible(current.secretRoutesVisible);
    if (difficultySelect) difficultySelect.value = current.difficulty || 'normal';
    if (timeScaleSelect) timeScaleSelect.value = String(_normalizeRealtimeDayDurationMs(current.realtimeDayDurationMs));
  }
  if (isVisible) _activateSettingsPanel(modal.dataset.activePanel || 'display');
  modal.classList.toggle('hidden', !isVisible);
  modal.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
}

function _formatRealtimeDayDurationLabel(durationMs) {
  return Math.round(durationMs / 1000) + ' 秒 / 天';
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
  });
}
