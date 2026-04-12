import { describe, it, expect, beforeEach } from 'vitest';
import { TIME_CONFIG } from '../js/data/constants.js';
import * as Settings from '../js/core/SettingsManager.js';

if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: function (key) { return key in store ? store[key] : null; },
    setItem: function (key, value) { store[key] = String(value); },
    removeItem: function (key) { delete store[key]; },
    clear: function () { Object.keys(store).forEach(function (key) { delete store[key]; }); },
    get length() { return Object.keys(store).length; },
    key: function (index) { return Object.keys(store)[index] || null; },
  };
}

describe('Settings.loadSettings', function () {
  beforeEach(function () {
    globalThis.localStorage.clear();
  });

  it('默认返回 60 秒 / 天', function () {
    const settings = Settings.loadSettings();

    expect(settings.realtimeDayDurationMs).toBe(TIME_CONFIG.realtimeDayDurationMs);
  });

  it('保留合法的时间流速设置', function () {
    Settings.saveSettings({
      motionLevel: 'full',
      difficulty: 'normal',
      secretRoutesVisible: true,
      realtimeDayDurationMs: 30000,
    });

    const settings = Settings.loadSettings();
    expect(settings.realtimeDayDurationMs).toBe(30000);
  });

  it('将非法的时间流速回退到默认值', function () {
    globalThis.localStorage.setItem('linegame_settings', JSON.stringify({
      motionLevel: 'full',
      difficulty: 'normal',
      secretRoutesVisible: true,
      realtimeDayDurationMs: 45000,
    }));

    const settings = Settings.loadSettings();
    expect(settings.realtimeDayDurationMs).toBe(TIME_CONFIG.realtimeDayDurationMs);
  });
});