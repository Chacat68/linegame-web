// js/systems/achievement/AchievementSystem.js — 成就系统
// 依赖：data/achievements.js, core/EventBus.js
// 导出：init, checkAll, getUnlocked

import { ACHIEVEMENTS } from '../../data/achievements.js';
import * as EventBus     from '../../core/EventBus.js';

/**
 * 初始化成就系统
 */
export function init(state) {
  if (!state.achievements) state.achievements = [];
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
      if (ach.reward.exp)        state.experience  = (state.experience || 0) + ach.reward.exp;
      if (ach.reward.reputation) state.reputation  = (state.reputation || 0) + ach.reward.reputation;

      msgs.push({
        text: '🏆 成就解锁：' + ach.icon + ' ' + ach.name + '！' +
              (ach.reward.credits ? ' 💰+' + ach.reward.credits : '') +
              (ach.reward.exp ? ' ⭐+' + ach.reward.exp : ''),
        type: 'upgrade',
      });

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
