// js/systems/quest/QuestSystem.js — 任务系统（群星风格）
// 依赖：data/quests.js, data/playerLevels.js, systems/faction/FactionSystem.js
// 导出：init, getAvailableQuests, acceptQuest, checkProgress, getActiveQuests, completeQuest

import { QUESTS, QUEST_TYPES } from '../../data/quests.js';
import { getLevel }            from '../../data/playerLevels.js';
import * as Faction            from '../faction/FactionSystem.js';

/**
 * 初始化任务系统
 */
export function init(state) {
  if (!state.quests)          state.quests          = [];
  if (!state.completedQuests) state.completedQuests = [];
}

/**
 * 获取当前可接取的任务列表（排除已完成和进行中的）
 */
export function getAvailableQuests(state) {
  const playerLvl = getLevel(state.experience || 0).level;
  const activeIds   = state.quests.map(function (q) { return q.id; });
  const completedIds = state.completedQuests || [];

  return QUESTS.filter(function (quest) {
    if (activeIds.includes(quest.id))    return false;
    if (completedIds.includes(quest.id)) return false;
    if (quest.minLevel > playerLvl)      return false;
    return true;
  });
}

/**
 * 接取任务
 * @param {object} state
 * @param {string} questId
 * @returns {{ ok, msgs }}
 */
export function acceptQuest(state, questId) {
  const template = QUESTS.find(function (q) { return q.id === questId; });
  if (!template) return { ok: false, msgs: [{ text: '任务不存在。', type: 'error' }] };

  if (state.quests.length >= 5) {
    return { ok: false, msgs: [{ text: '❌ 最多同时进行 5 个任务！', type: 'error' }] };
  }

  // 深拷贝任务实例
  const quest = JSON.parse(JSON.stringify(template));
  quest.startDay = state.day;
  state.quests.push(quest);

  const typeInfo = QUEST_TYPES[quest.type] || {};
  return {
    ok: true,
    msgs: [{
      text: (typeInfo.icon || '📋') + ' 接取任务「' + quest.name + '」！',
      type: 'upgrade',
    }],
  };
}

/**
 * 放弃任务
 */
export function abandonQuest(state, questId) {
  state.quests = state.quests.filter(function (q) { return q.id !== questId; });
  return { ok: true, msgs: [{ text: '❌ 已放弃任务。', type: 'info' }] };
}

/**
 * 检查所有活跃任务的进度（在交易/旅行后调用）
 * @param {object} state
 * @param {object} context  { action, goodId, quantity, systemId, factionId }
 * @returns {{ completedQuests: Array, msgs: Array }}
 */
export function checkProgress(state, context) {
  const msgs = [];
  const completed = [];

  state.quests.forEach(function (quest) {
    // 检查是否超时
    if (quest.timeLimit > 0 && state.day - quest.startDay > quest.timeLimit) {
      msgs.push({
        text: '⏰ 任务「' + quest.name + '」已超时失败！',
        type: 'error',
      });
      completed.push({ id: quest.id, failed: true });
      return;
    }

    let allDone = true;
    quest.objectives.forEach(function (obj) {
      _updateObjective(obj, context, state);
      if (obj.current < (obj.amount || 1)) allDone = false;
    });

    if (allDone) {
      completed.push({ id: quest.id, failed: false });
    }
  });

  // 处理完成/失败
  completed.forEach(function (c) {
    const quest = state.quests.find(function (q) { return q.id === c.id; });
    if (!quest) return;

    if (!c.failed) {
      // 发放奖励
      state.credits     += quest.rewards.credits || 0;
      state.experience   = (state.experience || 0) + (quest.rewards.exp || 0);
      state.reputation   = (state.reputation || 0) + (quest.rewards.reputation || 0);
      state.completedQuests.push(quest.id);

      const typeInfo = QUEST_TYPES[quest.type] || {};
      msgs.push({
        text: '🎉 任务完成「' + quest.name + '」！奖励：💰' +
              quest.rewards.credits + ' 积分, ⭐' + quest.rewards.exp + ' 经验',
        type: 'upgrade',
      });
    }

    // 从活跃列表移除
    state.quests = state.quests.filter(function (q) { return q.id !== c.id; });
  });

  return { completedQuests: completed, msgs: msgs };
}

/**
 * 获取当前活跃任务列表
 */
export function getActiveQuests(state) {
  return state.quests || [];
}

// ---------------------------------------------------------------------------
// 私有：更新单个目标进度
// ---------------------------------------------------------------------------
function _updateObjective(obj, ctx, state) {
  switch (obj.type) {
    case 'deliver':
      // 在目标星系卖出指定商品
      if (ctx.action === 'sell' && ctx.goodId === obj.goodId &&
          ctx.systemId === obj.targetSystem) {
        obj.current = Math.min(obj.amount, obj.current + ctx.quantity);
      }
      break;

    case 'buy_at':
      // 在指定星系买入指定商品
      if (ctx.action === 'buy' && ctx.goodId === obj.goodId &&
          ctx.systemId === obj.targetSystem) {
        obj.current = Math.min(obj.amount, obj.current + ctx.quantity);
      }
      break;

    case 'earn_profit':
      if (ctx.action === 'sell') {
        obj.current = Math.min(obj.amount, obj.current + (ctx.totalEarned || 0));
      }
      break;

    case 'trade_count':
      if (ctx.action === 'buy' || ctx.action === 'sell') {
        obj.current = Math.min(obj.amount, obj.current + 1);
      }
      break;

    case 'trade_good':
      if ((ctx.action === 'buy' || ctx.action === 'sell') && ctx.goodId === obj.goodId) {
        obj.current = Math.min(obj.amount, obj.current + ctx.quantity);
      }
      break;

    case 'visit_systems':
      if (ctx.action === 'travel') {
        if (!obj.visited) obj.visited = [];
        if (!obj.visited.includes(ctx.systemId)) {
          obj.visited.push(ctx.systemId);
          obj.current = obj.visited.length;
        }
      }
      break;

    case 'visit_system':
      if (ctx.action === 'travel' && ctx.systemId === obj.targetSystem) {
        obj.current = 1;
      }
      break;

    case 'faction_trade':
      if ((ctx.action === 'buy' || ctx.action === 'sell') && ctx.factionId === obj.factionId) {
        obj.current = Math.min(obj.amount, obj.current + 1);
      }
      break;

    case 'sell_in_faction':
      if (ctx.action === 'sell' && ctx.factionId === obj.factionId && ctx.goodId === obj.goodId) {
        obj.current = Math.min(obj.amount, obj.current + ctx.quantity);
      }
      break;
  }
}
