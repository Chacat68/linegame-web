import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { TIME_CONFIG } from '../js/data/constants.js';
import {
  SETTINGS_COMMAND,
  createSettingsCommandController,
} from '../js/core/SettingsCommandController.js';

function createHarness() {
  var settings = {
    motionLevel: 'full',
    difficulty: 'normal',
    secretRoutesVisible: true,
    realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
    terminalBlur: true,
    soundEffectsEnabled: true,
    soundEffectsVolume: 0.35,
  };
  var store = {
    saveSettings: vi.fn(),
    applySettings: vi.fn(),
    createDefaultSettings: vi.fn(function () {
      return {
        motionLevel: 'full',
        difficulty: 'normal',
        secretRoutesVisible: true,
        realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
        terminalBlur: true,
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.35,
      };
    }),
  };
  var audio = {
    applySettings: vi.fn(),
    playCue: vi.fn(),
  };
  var events = { emit: vi.fn() };
  var emitLog = vi.fn();
  var state = { day: 42 };
  var exportUsageData = vi.fn(function (currentState) {
    return { filename: 'linegame-usage-data.json', day: currentState.day };
  });
  var callbacks = {
    onDifficultyChanged: vi.fn(),
    onRealtimeDayDurationChanged: vi.fn(),
    onResetTutorial: vi.fn(function () { return 'restarted'; }),
    onClearSaves: vi.fn(function () { return 4; }),
  };
  var controller = createSettingsCommandController({
    getSettings: function () { return settings; },
    getState: function () { return state; },
    Renderer: { id: 'renderer' },
    store: store,
    audio: audio,
    events: events,
    emitLog: emitLog,
    exportUsageData: exportUsageData,
    callbacks: callbacks,
  });
  return {
    audio: audio,
    callbacks: callbacks,
    controller: controller,
    emitLog: emitLog,
    events: events,
    exportUsageData: exportUsageData,
    settings: settings,
    store: store,
  };
}

describe('SettingsCommandController', function () {
  it('SettingsManager 只发布命令，不直接持久化或调用 Renderer/Audio', function () {
    var source = readFileSync('js/core/SettingsManager.js', 'utf8');

    expect(source).toContain('SETTINGS_COMMAND.SET_MOTION_LEVEL');
    expect(source).toContain('SETTINGS_COMMAND.RESET_DEFAULTS');
    expect(source).not.toContain('activeCallbacks.settings');
    expect(source).not.toContain('saveSettings(');
    expect(source).not.toContain('applyCoreSettings');
    expect(source).not.toContain('Audio.applySettings');
    expect(source).not.toContain('Renderer.setMotionLevel');
    expect(source).not.toContain('EventBus');
    expect(source).not.toContain('buildUsageDataExport');
    expect(source).not.toContain('new Blob');
  });

  it('统一提交显示设置并投影 Renderer、持久化与日志', function () {
    var harness = createHarness();

    var motion = harness.controller.execute({
      type: SETTINGS_COMMAND.SET_MOTION_LEVEL,
      value: 'reduced',
    });
    var secretRoutes = harness.controller.execute({
      type: SETTINGS_COMMAND.SET_SECRET_ROUTES_VISIBLE,
      value: false,
    });

    expect(motion).toEqual(expect.objectContaining({
      ok: true,
      message: '动画强度已更新为降低。',
      settings: expect.objectContaining({ motionLevel: 'reduced' }),
    }));
    expect(secretRoutes.settings.secretRoutesVisible).toBe(false);
    expect(harness.settings).toEqual(expect.objectContaining({
      motionLevel: 'reduced',
      secretRoutesVisible: false,
    }));
    expect(harness.store.saveSettings).toHaveBeenCalledTimes(2);
    expect(harness.store.applySettings).toHaveBeenCalledTimes(2);
    expect(harness.emitLog).toHaveBeenCalledTimes(2);
  });

  it('终端模糊与音效命令只触发各自的受控副作用', function () {
    var harness = createHarness();

    harness.controller.execute({ type: SETTINGS_COMMAND.SET_TERMINAL_BLUR, value: false });
    harness.controller.execute({ type: SETTINGS_COMMAND.SET_SOUND_EFFECTS_ENABLED, value: false });
    var preview = harness.controller.execute({
      type: SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME,
      value: '0.65',
      preview: true,
    });
    var committed = harness.controller.execute({
      type: SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME,
      value: '0.65',
    });

    expect(harness.events.emit).toHaveBeenCalledWith('settings:terminalBlur:changed', false);
    expect(harness.audio.applySettings).toHaveBeenCalledTimes(3);
    expect(harness.audio.playCue).toHaveBeenCalledOnce();
    expect(preview.message).toBe('');
    expect(preview.tone).toBe('neutral');
    expect(committed.message).toBe('音效音量已更新为65%。');
    expect(harness.settings).toEqual(expect.objectContaining({
      terminalBlur: false,
      soundEffectsEnabled: false,
      soundEffectsVolume: 0.65,
    }));
  });

  it('难度和实时流速通过 typed callback 更新会话边界', function () {
    var harness = createHarness();

    var difficulty = harness.controller.execute({
      type: SETTINGS_COMMAND.SET_DIFFICULTY,
      value: 'hard',
    });
    var duration = harness.controller.execute({
      type: SETTINGS_COMMAND.SET_REALTIME_DAY_DURATION,
      value: 30000,
    });

    expect(difficulty.message).toBe('游戏难度已更新为挑战模式。');
    expect(duration.message).toBe('时间流速已更新为30 秒 / 天。');
    expect(harness.callbacks.onDifficultyChanged).toHaveBeenCalledWith('hard');
    expect(harness.callbacks.onRealtimeDayDurationChanged).toHaveBeenCalledWith(30000);
    expect(harness.settings.difficulty).toBe('hard');
    expect(harness.settings.realtimeDayDurationMs).toBe(30000);
  });

  it('恢复默认值一次同步全部投影与会话回调', function () {
    var harness = createHarness();
    Object.assign(harness.settings, {
      motionLevel: 'off',
      difficulty: 'hard',
      secretRoutesVisible: false,
      realtimeDayDurationMs: 30000,
      terminalBlur: false,
      soundEffectsEnabled: false,
      soundEffectsVolume: 0.9,
    });

    var result = harness.controller.execute({ type: SETTINGS_COMMAND.RESET_DEFAULTS });

    expect(result.ok).toBe(true);
    expect(result.message).toBe('所有设置已恢复为默认值。');
    expect(harness.settings).toEqual(harness.store.createDefaultSettings.mock.results[0].value);
    expect(harness.store.applySettings).toHaveBeenCalledWith(harness.settings, { id: 'renderer' });
    expect(harness.callbacks.onDifficultyChanged).toHaveBeenCalledWith('normal');
    expect(harness.callbacks.onRealtimeDayDurationChanged).toHaveBeenCalledWith(TIME_CONFIG.realtimeDayDurationMs);
    expect(harness.events.emit).toHaveBeenCalledWith('settings:terminalBlur:changed', true);
    expect(harness.audio.playCue).toHaveBeenCalledWith('settings.change');
  });

  it('数据导出通过独立 effect 执行，并返回统一反馈与日志', function () {
    var harness = createHarness();

    var result = harness.controller.execute({ type: SETTINGS_COMMAND.EXPORT_USAGE_DATA });

    expect(harness.exportUsageData).toHaveBeenCalledWith({ day: 42 });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      message: '使用数据已导出为 JSON 文件，请检查内容后决定是否分享。',
      effectResult: { filename: 'linegame-usage-data.json', day: 42 },
    }));
    expect(harness.emitLog).toHaveBeenCalledWith({
      text: '📊 本地平衡统计已导出。',
      type: 'info',
    });
  });

  it('危险操作也使用同一命令端口，未知或非法值不会污染设置', function () {
    var harness = createHarness();
    var before = Object.assign({}, harness.settings);

    var resetTutorial = harness.controller.execute({ type: SETTINGS_COMMAND.RESET_TUTORIAL });
    var clearSaves = harness.controller.execute({ type: SETTINGS_COMMAND.CLEAR_SAVES });
    var invalidDifficulty = harness.controller.execute({
      type: SETTINGS_COMMAND.SET_DIFFICULTY,
      value: 'impossible',
    });
    var unknown = harness.controller.execute({ type: 'settings.unknown' });

    expect(resetTutorial.effectResult).toBe('restarted');
    expect(clearSaves.effectResult).toBe(4);
    expect(harness.callbacks.onResetTutorial).toHaveBeenCalledOnce();
    expect(harness.callbacks.onClearSaves).toHaveBeenCalledOnce();
    expect(invalidDifficulty).toEqual(expect.objectContaining({ ok: false, tone: 'error' }));
    expect(unknown.message).toContain('未知的设置命令');
    expect(harness.settings).toEqual(before);
    expect(harness.controller.getDiagnostics()).toEqual({
      commandCount: 2,
      lastCommandType: SETTINGS_COMMAND.CLEAR_SAVES,
    });
  });
});
