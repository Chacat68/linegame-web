import * as Audio from './AudioManager.js';
const KEY = 'linegame_settings';
export const DEFAULT_SOUND_EFFECTS_VOLUME = .35;
export function createDefaultSettings() { return { motionLevel: 'full', terminalBlur: true, soundEffectsEnabled: true, soundEffectsVolume: .35 }; }
export function normalizeSoundEffectsVolume(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : .35; }
function normalize(source = {}) {
  return { motionLevel: ['full','reduced','off'].includes(source.motionLevel) ? source.motionLevel : 'full', terminalBlur: source.terminalBlur !== false,
    soundEffectsEnabled: source.soundEffectsEnabled !== false, soundEffectsVolume: normalizeSoundEffectsVolume(source.soundEffectsVolume) };
}
export function loadSettings() { try { return normalize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return createDefaultSettings(); } }
export function saveSettings(settings) { localStorage.setItem(KEY, JSON.stringify(normalize(settings))); }
export function applySettings(settings, renderer) {
  document.body.dataset.motion = settings.motionLevel;
  document.body.dataset.terminalBlur = String(settings.terminalBlur);
  renderer.setMotionLevel(settings.motionLevel);
  Audio.applySettings(settings);
}
