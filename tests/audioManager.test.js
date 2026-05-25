import { afterEach, describe, expect, it } from 'vitest';
import * as Audio from '../js/core/AudioManager.js';

function createAudioParam() {
  return {
    value: 0,
    cancelScheduledValues: function () {},
    setValueAtTime: function (value) { this.value = value; },
    linearRampToValueAtTime: function (value) { this.value = value; },
    exponentialRampToValueAtTime: function (value) { this.value = value; },
  };
}

function createFakeAudioContext(log) {
  return {
    currentTime: 10,
    destination: {},
    state: 'running',
    createOscillator: function () {
      return {
        type: '',
        frequency: createAudioParam(),
        connect: function () { log.push('osc.connect'); },
        start: function () { log.push('osc.start'); },
        stop: function () { log.push('osc.stop'); },
      };
    },
    createGain: function () {
      return {
        gain: createAudioParam(),
        connect: function () { log.push('gain.connect'); },
      };
    },
  };
}

describe('AudioManager', function () {
  afterEach(function () {
    Audio._setAudioContextFactoryForTest(null);
    Audio.applySettings({
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.35,
    });
  });

  it('归一化音效设置', function () {
    expect(Audio.normalizeAudioSettings({
      soundEffectsEnabled: false,
      soundEffectsVolume: 2,
    })).toEqual({
      soundEffectsEnabled: false,
      soundEffectsVolume: 1,
    });

    expect(Audio.normalizeAudioSettings({
      soundEffectsVolume: 'bad',
    })).toEqual({
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.35,
    });
  });

  it('关闭音效时不会创建音频上下文', function () {
    var created = false;
    Audio._setAudioContextFactoryForTest(function () {
      created = true;
      return createFakeAudioContext([]);
    });
    Audio.applySettings({
      soundEffectsEnabled: false,
      soundEffectsVolume: 0.35,
    });

    expect(Audio.playCue('trade.buy')).toBe(false);
    expect(created).toBe(false);
  });

  it('未知提示音不会创建音频上下文', function () {
    var created = false;
    Audio._setAudioContextFactoryForTest(function () {
      created = true;
      return createFakeAudioContext([]);
    });

    expect(Audio.playCue('missing.cue')).toBe(false);
    expect(created).toBe(false);
  });

  it('开启音效后会合成并播放提示音', function () {
    var log = [];
    Audio._setAudioContextFactoryForTest(function () {
      return createFakeAudioContext(log);
    });
    Audio.applySettings({
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.4,
    });

    expect(Audio.playCue('trade.sell')).toBe(true);
    expect(log).toEqual([
      'osc.connect',
      'gain.connect',
      'osc.start',
      'osc.stop',
    ]);
  });
});
