// js/core/AudioManager.js — 轻量音效管理
// 职责：提供设置驱动的短反馈音，不引入外部音频资源。


const DEFAULT_VOLUME = 0.35;
const MIN_CUE_INTERVAL_MS = 45;

const CUE_DEFINITIONS = {
  'ui.click': { type: 'sine', start: 620, end: 760, duration: 0.045, gain: 0.28 },
  success: { type: 'sine', start: 740, end: 980, duration: 0.12, gain: 0.3 },
  error: { type: 'sawtooth', start: 180, end: 120, duration: 0.12, gain: 0.22 },
};

let _settings = {
  soundEffectsEnabled: true,
  soundEffectsVolume: DEFAULT_VOLUME,
};
let _audioContext = null;
let _bound = false;
let _lastCueAt = 0;
let _contextFactory = null;

function _normalizeVolume(value) {
  var numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, numericValue));
}

function _normalizeEnabled(value) {
  return value !== false;
}

export function normalizeAudioSettings(settings) {
  var source = settings || {};
  return {
    soundEffectsEnabled: _normalizeEnabled(source.soundEffectsEnabled),
    soundEffectsVolume: _normalizeVolume(source.soundEffectsVolume),
  };
}

export function init(settings) {
  applySettings(settings);
  if (_bound) return;
  _bound = true;

  globalThis.document?.addEventListener('click', _click, true);

}

function _click(event) {
  const target = event.target?.closest?.('button, a, [role="button"]');
  if (target && !target.disabled) playCue('ui.click');
}
export function dispose() {
  globalThis.document?.removeEventListener('click', _click, true);
  _bound = false;
  if (_audioContext?.close) _audioContext.close().catch(() => {});
  _audioContext = null;
  _lastCueAt = 0;
}

export function applySettings(settings) {
  _settings = normalizeAudioSettings(settings);
}

export function playCue(cueId) {
  if (!_settings.soundEffectsEnabled || _settings.soundEffectsVolume <= 0) return false;
  var cue = CUE_DEFINITIONS[cueId];
  if (!cue) return false;
  var nowMs = Date.now();
  if (nowMs - _lastCueAt < MIN_CUE_INTERVAL_MS) return false;
  _lastCueAt = nowMs;

  var context = _getAudioContext();
  if (!context) return false;

  try {
    if (context.state === 'suspended' && typeof context.resume === 'function') {
      context.resume().catch(function () {});
    }
    _playTone(context, cue);
    return true;
  } catch (_) {
    return false;
  }
}

export function _setAudioContextFactoryForTest(factory) {
  _contextFactory = typeof factory === 'function' ? factory : null;
  _audioContext = null;
  _lastCueAt = 0;
}

function _getAudioContext() {
  if (_audioContext) return _audioContext;
  var factory = _contextFactory;
  if (!factory) {
    var AudioContextCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextCtor) return null;
    factory = function () { return new AudioContextCtor(); };
  }
  _audioContext = factory();
  return _audioContext;
}

function _setFrequency(param, start, end, now, duration) {
  if (!param) return;
  if (typeof param.setValueAtTime === 'function') {
    param.setValueAtTime(start, now);
  } else {
    param.value = start;
  }
  if (typeof param.exponentialRampToValueAtTime === 'function') {
    param.exponentialRampToValueAtTime(Math.max(1, end), now + duration);
  } else {
    param.value = end;
  }
}

function _setGain(param, value, now, duration) {
  if (!param) return;
  if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(now);
  if (typeof param.setValueAtTime === 'function') {
    param.setValueAtTime(0.0001, now);
  } else {
    param.value = 0.0001;
  }
  if (typeof param.linearRampToValueAtTime === 'function') {
    param.linearRampToValueAtTime(value, now + 0.01);
  } else {
    param.value = value;
  }
  if (typeof param.exponentialRampToValueAtTime === 'function') {
    param.exponentialRampToValueAtTime(0.0001, now + duration);
  } else {
    param.value = 0.0001;
  }
}

function _playTone(context, cue) {
  var oscillator = context.createOscillator();
  var gainNode = context.createGain();
  var now = context.currentTime || 0;
  var duration = cue.duration || 0.1;

  oscillator.type = cue.type || 'sine';
  _setFrequency(oscillator.frequency, cue.start || 440, cue.end || cue.start || 440, now, duration);
  _setGain(gainNode.gain, _settings.soundEffectsVolume * (cue.gain || 0.25), now, duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}
