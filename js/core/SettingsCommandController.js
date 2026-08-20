// js/core/SettingsCommandController.js — 设置终端 typed command 与副作用边界
//
// SettingsManager 只发布命令和呈现反馈；本 controller 独占设置 mutation、
// 持久化、Renderer/Audio 投影以及会话级回调。

import * as Audio from './AudioManager.js';
import * as SettingsCore from './SettingsCore.js';
import { exportUsageDataFile } from './UsageDataExportEffect.js';
import { DIFFICULTY_LEVELS } from '../data/constants.js';

export const SETTINGS_COMMAND = Object.freeze({
  CLEAR_SAVES: 'settings.saves.clear',
  EXPORT_USAGE_DATA: 'settings.usage-data.export',
  RESET_DEFAULTS: 'settings.defaults.reset',
  RESET_TUTORIAL: 'settings.tutorial.reset',
  SET_DIFFICULTY: 'settings.difficulty.set',
  SET_MOTION_LEVEL: 'settings.motion.set',
  SET_REALTIME_DAY_DURATION: 'settings.realtime-day-duration.set',
  SET_SECRET_ROUTES_VISIBLE: 'settings.secret-routes-visible.set',
  SET_SOUND_EFFECTS_ENABLED: 'settings.sound-effects-enabled.set',
  SET_SOUND_EFFECTS_VOLUME: 'settings.sound-effects-volume.set',
  SET_TERMINAL_BLUR: 'settings.terminal-blur.set',
});

const MOTION_LEVELS = Object.freeze(['full', 'reduced', 'off']);

function _requiredFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError('SettingsCommandController requires ' + label + '.');
  }
  return value;
}

function _motionLabel(value) {
  if (value === 'reduced') return '降低';
  if (value === 'off') return '关闭';
  return '完整';
}

function _difficultyLabel(value) {
  if (value === 'easy') return '休闲模式';
  if (value === 'hard') return '挑战模式';
  return '标准模式';
}

function _dayDurationLabel(value) {
  return Math.round(value / 1000) + ' 秒 / 天';
}

function _snapshot(settings) {
  return Object.freeze(Object.assign({}, settings || {}));
}

export function createSettingsCommandController(dependencies) {
  var deps = dependencies || {};
  var getSettings = _requiredFunction(deps.getSettings, 'getSettings');
  var getState = typeof deps.getState === 'function' ? deps.getState : function () { return null; };
  var store = deps.store || SettingsCore;
  var audio = deps.audio || Audio;
  var Renderer = deps.Renderer || {};
  var events = deps.events || {};
  var emitLog = typeof deps.emitLog === 'function' ? deps.emitLog : function () {};
  var exportUsageData = typeof deps.exportUsageData === 'function'
    ? deps.exportUsageData
    : exportUsageDataFile;
  var callbacks = deps.callbacks || {};
  var commandCount = 0;
  var lastCommandType = null;

  function _currentSettings() {
    var settings = getSettings();
    if (!settings || typeof settings !== 'object') {
      throw new TypeError('SettingsCommandController expected getSettings() to return an object.');
    }
    return settings;
  }

  function _save(settings) {
    _requiredFunction(store.saveSettings, 'store.saveSettings')(settings);
  }

  function _applyAll(settings) {
    _requiredFunction(store.applySettings, 'store.applySettings')(settings, Renderer);
  }

  function _applyAudio(settings) {
    if (typeof audio.applySettings === 'function') audio.applySettings(settings);
  }

  function _playSettingsCue() {
    if (typeof audio.playCue === 'function') audio.playCue('settings.change');
  }

  function _emit(eventName, payload) {
    if (typeof events.emit === 'function') events.emit(eventName, payload);
  }

  function _success(command, settings, options) {
    var meta = options || {};
    commandCount += 1;
    lastCommandType = command.type;
    if (meta.log) emitLog(meta.log);
    return Object.freeze({
      ok: true,
      type: command.type,
      message: meta.message || '',
      tone: meta.tone || 'success',
      settings: _snapshot(settings),
      effectResult: meta.effectResult,
    });
  }

  function _failure(command, message) {
    return Object.freeze({
      ok: false,
      type: command && command.type ? command.type : '',
      message: message || '无法应用该设置。',
      tone: 'error',
      settings: _snapshot(_currentSettings()),
    });
  }

  function execute(command) {
    if (!command || typeof command.type !== 'string') {
      return _failure(command, '设置命令格式无效。');
    }

    var settings = _currentSettings();
    var value;
    var effectResult;

    switch (command.type) {
      case SETTINGS_COMMAND.SET_MOTION_LEVEL:
        value = String(command.value || '');
        if (MOTION_LEVELS.indexOf(value) < 0) return _failure(command, '动画强度设置无效。');
        settings.motionLevel = value;
        _save(settings);
        _applyAll(settings);
        return _success(command, settings, {
          message: '动画强度已更新为' + _motionLabel(value) + '。',
          log: { text: '⚙ 已更新动画强度：' + _motionLabel(value) + '。', type: 'info' },
        });

      case SETTINGS_COMMAND.SET_SECRET_ROUTES_VISIBLE:
        value = !!command.value;
        settings.secretRoutesVisible = value;
        _save(settings);
        _applyAll(settings);
        return _success(command, settings, {
          message: '隐藏航线显示已' + (value ? '开启' : '关闭') + '。',
          log: { text: '⚙ 已更新隐藏航线显示：' + (value ? '显示' : '隐藏') + '。', type: 'info' },
        });

      case SETTINGS_COMMAND.SET_TERMINAL_BLUR:
        value = !!command.value;
        settings.terminalBlur = value;
        _save(settings);
        _emit('settings:terminalBlur:changed', value);
        return _success(command, settings, {
          message: '全息终端模糊已' + (value ? '开启' : '关闭') + '。',
          log: {
            text: '⚙ 已更新全息终端高斯模糊特效：' + (value ? '开启 (高品质)' : '关闭 (低开销)') + '。',
            type: 'info',
          },
        });

      case SETTINGS_COMMAND.SET_SOUND_EFFECTS_ENABLED:
        value = !!command.value;
        settings.soundEffectsEnabled = value;
        _save(settings);
        _applyAudio(settings);
        if (value) _playSettingsCue();
        return _success(command, settings, {
          message: '音效反馈已' + (value ? '开启' : '关闭') + '。',
          log: { text: '⚙ 已更新音效反馈：' + (value ? '开启' : '关闭') + '。', type: 'info' },
        });

      case SETTINGS_COMMAND.SET_SOUND_EFFECTS_VOLUME:
        value = SettingsCore.normalizeSoundEffectsVolume(command.value);
        settings.soundEffectsVolume = value;
        _save(settings);
        _applyAudio(settings);
        if (command.preview !== true) _playSettingsCue();
        return _success(command, settings, command.preview === true ? {
          tone: 'neutral',
        } : {
          message: '音效音量已更新为' + Math.round(value * 100) + '%。',
        });

      case SETTINGS_COMMAND.SET_DIFFICULTY:
        value = String(command.value || '');
        if (!DIFFICULTY_LEVELS[value]) return _failure(command, '游戏难度设置无效。');
        settings.difficulty = value;
        _save(settings);
        if (typeof callbacks.onDifficultyChanged === 'function') callbacks.onDifficultyChanged(value);
        return _success(command, settings, {
          message: '游戏难度已更新为' + _difficultyLabel(value) + '。',
          log: { text: '⚙ 已更新游戏难度：' + _difficultyLabel(value) + '。', type: 'info' },
        });

      case SETTINGS_COMMAND.SET_REALTIME_DAY_DURATION:
        value = SettingsCore.normalizeRealtimeDayDurationMs(command.value);
        if (value !== Number(command.value)) return _failure(command, '时间流速设置无效。');
        settings.realtimeDayDurationMs = value;
        _save(settings);
        if (typeof callbacks.onRealtimeDayDurationChanged === 'function') {
          callbacks.onRealtimeDayDurationChanged(value);
        }
        return _success(command, settings, {
          message: '时间流速已更新为' + _dayDurationLabel(value) + '。',
          log: { text: '⚙ 已更新时间流速：' + _dayDurationLabel(value) + '。', type: 'info' },
        });

      case SETTINGS_COMMAND.RESET_DEFAULTS:
        Object.assign(settings, _requiredFunction(store.createDefaultSettings, 'store.createDefaultSettings')());
        _save(settings);
        _applyAll(settings);
        if (typeof callbacks.onDifficultyChanged === 'function') {
          callbacks.onDifficultyChanged(settings.difficulty);
        }
        if (typeof callbacks.onRealtimeDayDurationChanged === 'function') {
          callbacks.onRealtimeDayDurationChanged(settings.realtimeDayDurationMs);
        }
        _emit('settings:terminalBlur:changed', settings.terminalBlur);
        _playSettingsCue();
        return _success(command, settings, {
          message: '所有设置已恢复为默认值。',
          log: { text: '⚙ 设置已恢复为默认值。', type: 'info' },
        });

      case SETTINGS_COMMAND.EXPORT_USAGE_DATA:
        effectResult = exportUsageData(getState());
        return _success(command, settings, {
          effectResult: effectResult,
          message: '使用数据已导出为 JSON 文件，请检查内容后决定是否分享。',
          log: { text: '📊 本地平衡统计已导出。', type: 'info' },
        });

      case SETTINGS_COMMAND.RESET_TUTORIAL:
        effectResult = typeof callbacks.onResetTutorial === 'function'
          ? callbacks.onResetTutorial()
          : undefined;
        return _success(command, settings, { effectResult: effectResult });

      case SETTINGS_COMMAND.CLEAR_SAVES:
        effectResult = typeof callbacks.onClearSaves === 'function'
          ? callbacks.onClearSaves()
          : undefined;
        return _success(command, settings, { effectResult: effectResult });

      default:
        return _failure(command, '未知的设置命令：' + command.type + '。');
    }
  }

  function getDiagnostics() {
    return Object.freeze({
      commandCount: commandCount,
      lastCommandType: lastCommandType,
    });
  }

  return Object.freeze({
    execute: execute,
    getDiagnostics: getDiagnostics,
  });
}
