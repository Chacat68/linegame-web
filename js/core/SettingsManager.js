// js/core/SettingsManager.js — 设置管理
// 依赖：core/EventBus.js
// 导出：loadSettings, saveSettings, applySettings,
//       initSettingsModal, showSettingsModal, hideSettingsModal

import * as EventBus from './EventBus.js';

const SETTINGS_KEY = 'linegame_settings';

const VALID_MOTION_LEVELS = ['full', 'reduced', 'off'];

// ---------------------------------------------------------------------------
// 设置加载 / 持久化
// ---------------------------------------------------------------------------

/**
 * 从 localStorage 加载设置
 * @returns {{ motionLevel: string }}
 */
export function loadSettings() {
  try {
    var raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { motionLevel: 'full' };
    var parsed = JSON.parse(raw);
    return {
      motionLevel: VALID_MOTION_LEVELS.indexOf(parsed.motionLevel) >= 0
        ? parsed.motionLevel
        : 'full',
    };
  } catch (_) {
    return { motionLevel: 'full' };
  }
}

/**
 * 保存设置到 localStorage
 * @param {{ motionLevel: string }} settings
 */
export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * 将设置应用到 DOM 和渲染器
 * @param {{ motionLevel: string }} settings
 * @param {{ setMotionLevel: Function }} Renderer
 */
export function applySettings(settings, Renderer) {
  document.body.dataset.motion = settings.motionLevel || 'full';
  Renderer.setMotionLevel(settings.motionLevel || 'full');
}

// ---------------------------------------------------------------------------
// 设置弹窗
// ---------------------------------------------------------------------------

/**
 * 初始化设置弹窗事件绑定
 * @param {object} callbacks
 * @param {{ motionLevel: string }} callbacks.settings  当前设置引用
 * @param {Function} callbacks.onSettingsChanged  设置变更后的回调
 * @param {Function} callbacks.onResetTutorial    重置教程回调
 * @param {Function} callbacks.onClearSaves       清空存档回调
 * @param {{ setMotionLevel: Function }} callbacks.Renderer  渲染器引用
 */
export function initSettingsModal(callbacks) {
  var settingsBtn   = document.getElementById('settings-btn');
  var modal         = document.getElementById('settings-modal');
  var closeBtn      = document.getElementById('settings-close-btn');
  var motionSelect  = document.getElementById('settings-motion-level');
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
  if (resetDefaultsBtn) {
    resetDefaultsBtn.onclick = function () {
      callbacks.settings.motionLevel = 'full';
      saveSettings(callbacks.settings);
      applySettings(callbacks.settings, callbacks.Renderer);
      if (motionSelect) motionSelect.value = 'full';
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
  if (!modal) return;
  if (motionSelect && isVisible) {
    // 读取当前 localStorage 设置同步到 select
    var current = loadSettings();
    motionSelect.value = current.motionLevel || 'full';
  }
  if (isVisible) _activateSettingsPanel(modal.dataset.activePanel || 'display');
  modal.classList.toggle('hidden', !isVisible);
  modal.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
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
