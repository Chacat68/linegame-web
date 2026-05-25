// js/core/AudioManager.js — 轻量音效管理
// 职责：提供设置驱动的短反馈音，不引入外部音频资源。

import * as EventBus from './EventBus.js';

const DEFAULT_VOLUME = 0.35;
const MIN_CUE_INTERVAL_MS = 45;

const CUE_DEFINITIONS = {
  'ui.click': { type: 'sine', start: 620, end: 760, duration: 0.045, gain: 0.28 },
  'settings.change': { type: 'triangle', start: 480, end: 640, duration: 0.08, gain: 0.24 },
  'trade.buy': { type: 'triangle', start: 520, end: 700, duration: 0.1, gain: 0.3 },
  'trade.sell': { type: 'triangle', start: 680, end: 920, duration: 0.11, gain: 0.32 },
  travel: { type: 'sawtooth', start: 220, end: 340, duration: 0.14, gain: 0.2 },
  'event.alert': { type: 'square', start: 220, end: 160, duration: 0.16, gain: 0.18 },
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

  EventBus.on('audio:cue', function (data) {
    if (typeof data === 'string') {
      playCue(data);
      return;
    }
    playCue(data && data.cue ? data.cue : '');
  });

  if (globalThis.document && typeof document.addEventListener === 'function') {
    document.addEventListener('click', function (event) {
      var target = event && event.target && typeof event.target.closest === 'function'
        ? event.target.closest('button, a, [role="button"]')
        : null;
      if (!target || target.disabled) return;
      playCue('ui.click');
    }, true);
  }
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
