// js/core/SettingsCore.js — 首屏所需的轻量设置状态与应用逻辑

import * as Audio from './AudioManager.js';
import { TIME_CONFIG } from '../data/constants.js';

const SETTINGS_KEY = 'linegame_settings';
const VALID_MOTION_LEVELS = ['full', 'reduced', 'off'];
const VALID_DIFFICULTIES = ['easy', 'normal', 'hard'];
const VALID_REALTIME_DAY_DURATIONS_MS = TIME_CONFIG.availableRealtimeDayDurationsMs || [TIME_CONFIG.realtimeDayDurationMs];

export const DEFAULT_SOUND_EFFECTS_VOLUME = 0.35;

export function normalizeSecretRoutesVisible(value) {
  return value !== false;
}

export function normalizeRealtimeDayDurationMs(value) {
  var numericValue = Number(value);
  return VALID_REALTIME_DAY_DURATIONS_MS.indexOf(numericValue) >= 0
    ? numericValue
    : TIME_CONFIG.realtimeDayDurationMs;
}

export function normalizeSoundEffectsVolume(value) {
  var numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_SOUND_EFFECTS_VOLUME;
  return Math.max(0, Math.min(1, numericValue));
}

export function loadSettings() {
  try {
    var raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return {
        motionLevel: 'full',
        difficulty: 'normal',
        secretRoutesVisible: true,
        realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
        terminalBlur: true,
        soundEffectsEnabled: true,
        soundEffectsVolume: DEFAULT_SOUND_EFFECTS_VOLUME,
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
      secretRoutesVisible: normalizeSecretRoutesVisible(parsed.secretRoutesVisible),
      realtimeDayDurationMs: normalizeRealtimeDayDurationMs(parsed.realtimeDayDurationMs),
      terminalBlur: parsed.terminalBlur !== false,
      soundEffectsEnabled: parsed.soundEffectsEnabled !== false,
      soundEffectsVolume: normalizeSoundEffectsVolume(parsed.soundEffectsVolume),
    };
  } catch (_) {
    return {
      motionLevel: 'full',
      difficulty: 'normal',
      secretRoutesVisible: true,
      realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
      terminalBlur: true,
      soundEffectsEnabled: true,
      soundEffectsVolume: DEFAULT_SOUND_EFFECTS_VOLUME,
    };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function applySettings(settings, Renderer) {
  document.body.dataset.motion = settings.motionLevel || 'full';
  Renderer.setMotionLevel(settings.motionLevel || 'full');
  if (Renderer.setSecretRoutesVisible) {
    Renderer.setSecretRoutesVisible(normalizeSecretRoutesVisible(settings.secretRoutesVisible));
  }
  Audio.applySettings(settings);
}
