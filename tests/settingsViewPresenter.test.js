import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TIME_CONFIG } from '../js/data/constants.js';
import {
  buildSettingsViewModel,
  getSettingsPanelTitle,
} from '../js/ui/SettingsViewPresenter.js';

describe('SettingsViewPresenter', function () {
  it('纯投影规范化控件值与可读摘要', function () {
    var view = buildSettingsViewModel({
      motionLevel: 'reduced',
      difficulty: 'hard',
      realtimeDayDurationMs: 30000,
      secretRoutesVisible: false,
      terminalBlur: false,
      soundEffectsEnabled: false,
      soundEffectsVolume: 0.62,
    });
    expect(view.controls).toEqual({
      difficulty: 'hard',
      motionLevel: 'reduced',
      realtimeDayDurationMs: 30000,
      secretRoutesVisible: false,
      soundEffectsEnabled: false,
      soundEffectsVolume: 0.62,
      terminalBlur: false,
    });
    expect(view.summary).toEqual({
      audio: '关闭 · 62%',
      difficulty: '挑战模式',
      motion: '降低',
      time: '30 秒 / 天',
      volume: '62%',
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.controls)).toBe(true);
    expect(Object.isFrozen(view.summary)).toBe(true);
  });

  it('非法选择回退到设置规范并提供稳定分页标题', function () {
    var view = buildSettingsViewModel({
      motionLevel: 'unknown',
      difficulty: 'nightmare',
      realtimeDayDurationMs: 45000,
      soundEffectsVolume: 8,
    });
    expect(view.controls).toEqual(expect.objectContaining({
      motionLevel: 'full',
      difficulty: 'normal',
      realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
      soundEffectsVolume: 1,
    }));
    expect(getSettingsPanelTitle('display')).toBe('显示设置');
    expect(getSettingsPanelTitle('game')).toBe('游戏设置');
    expect(getSettingsPanelTitle('data')).toBe('数据管理');
    expect(getSettingsPanelTitle('missing')).toBe('设置');
  });

  it('源码所有权阻止 DOM 与命令回流纯 Presenter 或兼容门面', function () {
    var facade = readFileSync('js/core/SettingsManager.js', 'utf8');
    var presenter = readFileSync('js/ui/SettingsViewPresenter.js', 'utf8');
    var controller = readFileSync('js/ui/SettingsModalController.js', 'utf8');
    var entry = readFileSync('js/core/SettingsUiController.js', 'utf8');
    expect(facade).toContain("from '../ui/SettingsModalController.js'");
    expect(facade).not.toContain('document.');
    expect(facade).not.toContain('SETTINGS_COMMAND');
    expect(facade).not.toContain('settings-btn');
    expect(presenter).not.toContain('document.');
    expect(presenter).not.toContain('SETTINGS_COMMAND');
    expect(controller).not.toContain('localStorage');
    expect(controller).not.toContain('saveSettings(');
    expect(controller).not.toContain('Renderer.');
    expect(entry).toContain("getElementById('settings-btn')");
  });
});
