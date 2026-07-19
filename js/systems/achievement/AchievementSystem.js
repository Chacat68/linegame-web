// js/systems/achievement/AchievementSystem.js — 成就系统
// 依赖：data/achievements.js, core/EventBus.js
// 导出：init, checkAll, getUnlocked

import { ACHIEVEMENTS, ACHIEVEMENT_ALIASES } from '../../data/achievements.js';
import * as EventBus     from '../../core/EventBus.js';
import * as Progression  from '../progression/ProgressionSystem.js';

/**
 * 初始化成就系统
 */
export function init(state) {
  if (!state.achievements) state.achievements = [];
  const activeIds = new Set(ACHIEVEMENTS.map(function (achievement) { return achievement.id; }));
  state.achievements = Array.from(new Set(state.achievements.map(function (achievementId) {
    // 当前仍有效的 ID 优先保留，避免同名旧别名吞掉现役成就。
    return activeIds.has(achievementId) ? achievementId : (ACHIEVEMENT_ALIASES[achievementId] || achievementId);
  }).filter(function (achievementId) {
    return activeIds.has(achievementId) || !Object.prototype.hasOwnProperty.call(ACHIEVEMENT_ALIASES, achievementId);
  })));
}

/**
 * 检查所有成就，解锁满足条件的成就
 * @param {object} state
 * @returns {{ newlyUnlocked: Array, msgs: Array }}
 */
export function checkAll(state) {
  const msgs = [];
  const newlyUnlocked = [];

  ACHIEVEMENTS.forEach(function (ach) {
    if (state.achievements.includes(ach.id)) return; // 已解锁

    if (ach.condition(state)) {
      state.achievements.push(ach.id);
      newlyUnlocked.push(ach);

      // 发放奖励
      if (ach.reward.credits)    state.credits    += ach.reward.credits;
      const progressionResult = ach.reward.exp
        ? Progression.gainExperience(state, ach.reward.exp)
        : { msgs: [] };
      if (ach.reward.reputation) state.reputation  = (state.reputation || 0) + ach.reward.reputation;

      msgs.push({
        text: '🏆 成就解锁：' + ach.icon + ' ' + ach.name + '！' +
              (ach.reward.credits ? ' 💰+' + ach.reward.credits : '') +
              (ach.reward.exp ? ' ⭐+' + ach.reward.exp : ''),
        type: 'upgrade',
      });
      msgs.push(...progressionResult.msgs);

      EventBus.emit('achievement:unlocked', { id: ach.id });
    }
  });

  return { newlyUnlocked, msgs };
}

/**
 * 获取已解锁成就列表
 */
export function getUnlocked(state) {
  return ACHIEVEMENTS.filter(function (ach) {
    return state.achievements && state.achievements.includes(ach.id);
  });
}

/**
 * 获取所有成就及其解锁状态
 */
export function getAll(state) {
  return ACHIEVEMENTS.map(function (ach) {
    return {
      id:          ach.id,
      name:        ach.name,
      description: ach.description,
      icon:        ach.icon,
      category:    ach.category,
      reward:      ach.reward,
      unlocked:    state.achievements && state.achievements.includes(ach.id),
    };
  });
}
