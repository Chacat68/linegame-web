// js/ui/SettingsViewPresenter.js — 设置控件与摘要纯投影

import {
  createDefaultSettings,
  normalizeRealtimeDayDurationMs,
  normalizeSecretRoutesVisible,
  normalizeSoundEffectsVolume,
} from '../core/SettingsCore.js';

const PANEL_TITLES = Object.freeze({
  display: '显示设置',
  game: '游戏设置',
  data: '数据管理',
});

function _formatMotionLevel(motionLevel) {
  if (motionLevel === 'reduced') return '降低';
  if (motionLevel === 'off') return '关闭';
  return '完整';
}

function _formatDifficulty(difficulty) {
  if (difficulty === 'easy') return '休闲模式';
  if (difficulty === 'hard') return '挑战模式';
  return '标准模式';
}

export function getSettingsPanelTitle(panelId) {
  return PANEL_TITLES[panelId] || '设置';
}

export function buildSettingsViewModel(settings) {
  var current = Object.assign(createDefaultSettings(), settings || {});
  var controls = Object.freeze({
    difficulty: ['easy', 'normal', 'hard'].indexOf(current.difficulty) !== -1
      ? current.difficulty
      : 'normal',
    motionLevel: ['full', 'reduced', 'off'].indexOf(current.motionLevel) !== -1
      ? current.motionLevel
      : 'full',
    realtimeDayDurationMs: normalizeRealtimeDayDurationMs(current.realtimeDayDurationMs),
    secretRoutesVisible: normalizeSecretRoutesVisible(current.secretRoutesVisible),
    soundEffectsEnabled: current.soundEffectsEnabled !== false,
    soundEffectsVolume: normalizeSoundEffectsVolume(current.soundEffectsVolume),
    terminalBlur: current.terminalBlur !== false,
  });
  var summary = Object.freeze({
    audio: (controls.soundEffectsEnabled ? '开启' : '关闭') + ' · ' + Math.round(controls.soundEffectsVolume * 100) + '%',
    difficulty: _formatDifficulty(controls.difficulty),
    motion: _formatMotionLevel(controls.motionLevel),
    time: Math.round(controls.realtimeDayDurationMs / 1000) + ' 秒 / 天',
    volume: Math.round(controls.soundEffectsVolume * 100) + '%',
  });
  return Object.freeze({ controls: controls, summary: summary });
}
