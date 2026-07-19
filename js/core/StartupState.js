// js/core/StartupState.js — 冷启动状态选择
// 只有应用冷启动会默认恢复自动存档；明确重新开始时可关闭恢复。

import { INITIAL_STATE, DIFFICULTY_LEVELS } from '../data/constants.js';
import * as Save from '../systems/save/SaveSystem.js';

export function resolveStartupState(difficulty, settings, options) {
  options = options || {};
  const shouldRestoreAutosave = options.restoreAutosave !== false;

  if (shouldRestoreAutosave) {
    const loaded = Save.loadGame(0);
    if (loaded.ok) {
      return {
        state: loaded.state,
        restoredAutosave: true,
        loadMessage: loaded.msg,
      };
    }
  }

  const state = _deepClone(INITIAL_STATE);
  const requestedDifficulty = difficulty || (settings && settings.difficulty) || 'normal';
  const difficultyConfig = DIFFICULTY_LEVELS[requestedDifficulty] || DIFFICULTY_LEVELS.normal;
  state.difficulty = difficultyConfig.id;
  state.credits = difficultyConfig.startCredits;

  return {
    state: state,
    restoredAutosave: false,
    loadMessage: '',
  };
}

function _deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
