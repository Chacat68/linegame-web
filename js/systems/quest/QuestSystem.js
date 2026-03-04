// js/systems/quest/QuestSystem.js — 任务系统（按章节推进解锁）
// 依赖：data/quests.js, data/playerLevels.js, systems/faction/FactionSystem.js
// 导出：init, getAvailableQuests, getLockedQuests, acceptQuest, checkProgress,
//       getActiveQuests, completeQuest, getQuestPhaseProgress,
//       getCurrentQuestPhase, getCurrentQuestPhaseProgress

import { QUESTS, QUEST_TYPES, QUEST_PHASES } from '../../data/quests.js';
import { getLevel }            from '../../data/playerLevels.js';
import * as Faction            from '../faction/FactionSystem.js';

/**
 * 初始化任务系统
 */
export function init(state) {
  if (!state.quests)          state.quests          = [];
  if (!state.completedQuests) state.completedQuests = [];
  if (!state.questPhase) {
    state.questPhase = _inferCurrentQuestPhase(state);
  } else {
    state.questPhase = Math.max(1, Math.min(QUEST_PHASES.length, state.questPhase));
  }
  _syncQuestPhase(state);
}

function _inferCurrentQuestPhase(state) {
  var completedIds = state.completedQuests || [];
  var inferred = 1;

  for (var i = 1; i <= QUEST_PHASES.length; i++) {
    var phaseQuests = QUESTS.filter(function (q) { return (q.phase || 1) === i; });
    if (phaseQuests.length === 0) {
      if (i < QUEST_PHASES.length) inferred = i + 1;
      continue;
    }

    var doneAll = phaseQuests.every(function (q) { return completedIds.includes(q.id); });
    if (doneAll && i < QUEST_PHASES.length) {
      inferred = i + 1;
      continue;
    }
    break;
  }

  var highestActive = 0;
  (state.quests || []).forEach(function (q) {
    highestActive = Math.max(highestActive, q.phase || 1);
  });

  return Math.max(inferred, highestActive, 1);
}

function _syncQuestPhase(state) {
  var current = state.questPhase || 1;
  while (current < QUEST_PHASES.length) {
    var phaseQuests = QUESTS.filter(function (q) { return (q.phase || 1) === current; });
    if (phaseQuests.length === 0) {
      current += 1;
      continue;
    }
    var doneAll = phaseQuests.every(function (q) {
      return (state.completedQuests || []).includes(q.id);
    });
    if (!doneAll) break;
    current += 1;
  }
  state.questPhase = Math.max(1, Math.min(QUEST_PHASES.length, current));
}

function _isQuestDone(quest) {
  if (!quest || !quest.objectives || quest.objectives.length === 0) return false;
  return quest.objectives.every(function (obj) {
    return (obj.current || 0) >= (obj.amount || 1);
  });
}

export function getCurrentQuestPhase(state) {
  if (!state.questPhase) {
    state.questPhase = _inferCurrentQuestPhase(state);
  }
  return state.questPhase;
}

export function getCurrentQuestPhaseProgress(state) {
  var current = getCurrentQuestPhase(state);
  var phase = QUEST_PHASES[current - 1];
  var completedIds = state.completedQuests || [];
  var quests = QUESTS.filter(function (q) { return (q.phase || 1) === current; });
  var completed = quests.filter(function (q) { return completedIds.includes(q.id); }).length;
  return {
    currentPhase: current,
    phase: phase,
    total: quests.length,
    completed: completed,
    percent: quests.length > 0 ? Math.round(completed / quests.length * 100) : 100,
    isFinalPhase: current === QUEST_PHASES.length,
  };
}

/**
 * 检查单个任务是否满足所有解锁条件
 * @returns {{ unlocked: boolean, reasons: string[] }}
 */
function _checkUnlockConditions(quest, state) {
  const reasons = [];
  const playerLvl = getLevel(state.experience || 0).level;

  // 等级检查
  if (quest.minLevel > playerLvl) {
    reasons.push('需要等级 ' + quest.minLevel + '（当前 ' + playerLvl + '）');
  }

  // 前置任务检查
  if (quest.prerequisites && quest.prerequisites.length > 0) {
    const completedIds = state.completedQuests || [];
    const missing = quest.prerequisites.filter(function (preId) {
      return !completedIds.includes(preId);
    });
    if (missing.length > 0) {
      missing.forEach(function (preId) {
        var preQuest = QUESTS.find(function (q) { return q.id === preId; });
        var preName = preQuest ? preQuest.name : preId;
        reasons.push('需完成前置任务「' + preName + '」');
      });
    }
  }

  // 额外解锁条件
  var cond = quest.unlockConditions || {};

  if (cond.minTradeCount && (state.tradeCount || 0) < cond.minTradeCount) {
    reasons.push('需完成 ' + cond.minTradeCount + ' 次交易（当前 ' + (state.tradeCount || 0) + '）');
  }

  if (cond.minVisitedSystems && (state.visitedSystems || []).length < cond.minVisitedSystems) {
    reasons.push('需访问 ' + cond.minVisitedSystems + ' 个星球（当前 ' + (state.visitedSystems || []).length + '）');
  }

  if (cond.minReputation && (state.reputation || 0) < cond.minReputation) {
    reasons.push('需声望 ' + cond.minReputation + '（当前 ' + (state.reputation || 0) + '）');
  }

  if (cond.minTotalProfit && (state.totalProfit || 0) < cond.minTotalProfit) {
    reasons.push('需累计利润 ' + cond.minTotalProfit + '（当前 ' + (state.totalProfit || 0) + '）');
  }

  if (cond.requiredFactionRelation) {
    var rel = Faction.getRelation
      ? Faction.getRelation(state, cond.requiredFactionRelation.factionId)
      : 0;
    if (rel < cond.requiredFactionRelation.minRelation) {
      reasons.push('需提升派系关系至 ' + cond.requiredFactionRelation.minRelation);
    }
  }

  return { unlocked: reasons.length === 0, reasons: reasons };
}

/**
 * 获取当前可接取的任务列表（已解锁，排除已完成和进行中的）
 */
export function getAvailableQuests(state) {
  var currentPhase = getCurrentQuestPhase(state);
  var activeIds   = state.quests.map(function (q) { return q.id; });
  var completedIds = state.completedQuests || [];

  return QUESTS.filter(function (quest) {
    if ((quest.phase || 1) !== currentPhase) return false;
    if (activeIds.includes(quest.id))    return false;
    if (completedIds.includes(quest.id)) return false;

    var result = _checkUnlockConditions(quest, state);
    return result.unlocked;
  });
}

/**
 * 获取尚未解锁但可见的任务（已锁定，展示解锁条件）
 * 只展示下一阶段或当前阶段中未解锁的任务，避免剧透过多
 */
export function getLockedQuests(state) {
  var currentPhase = getCurrentQuestPhase(state);
  var activeIds   = state.quests.map(function (q) { return q.id; });
  var completedIds = state.completedQuests || [];

  return QUESTS.filter(function (quest) {
    if (activeIds.includes(quest.id))    return false;
    if (completedIds.includes(quest.id)) return false;
    if ((quest.phase || 1) !== currentPhase) return false;

    var result = _checkUnlockConditions(quest, state);
    return !result.unlocked;
  }).map(function (quest) {
    var result = _checkUnlockConditions(quest, state);
    return {
      id: quest.id,
      name: quest.name,
      type: quest.type,
      phase: quest.phase || 1,
      description: quest.description,
      rewards: quest.rewards,
      timeLimit: quest.timeLimit,
      lockReasons: result.reasons,
    };
  });
}

/**
 * 获取各阶段的完成进度
 */
export function getQuestPhaseProgress(state) {
  var completedIds = state.completedQuests || [];
  return QUEST_PHASES.map(function (phase, idx) {
    var phaseNum = idx + 1;
    var phaseQuests = QUESTS.filter(function (q) { return (q.phase || 1) === phaseNum; });
    var completed = phaseQuests.filter(function (q) { return completedIds.includes(q.id); });
    return {
      phase: phase,
      total: phaseQuests.length,
      completed: completed.length,
      percent: phaseQuests.length > 0 ? Math.round(completed.length / phaseQuests.length * 100) : 0,
    };
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

  if ((template.phase || 1) !== getCurrentQuestPhase(state)) {
    return { ok: false, msgs: [{ text: '该任务尚未解锁当前章节。', type: 'error' }] };
  }

  if (state.quests.length >= 5) {
    return { ok: false, msgs: [{ text: '❌ 最多同时进行 5 个任务！', type: 'error' }] };
  }

  // 深拷贝任务实例
  const quest = JSON.parse(JSON.stringify(template));
  quest.startDay = state.day;

  // 立即同步一次与当前位置相关的目标，避免“已到达目标星球但未结算”
  if (quest.objectives && quest.objectives.length > 0) {
    quest.objectives.forEach(function (obj) {
      if (obj.type === 'visit_system' && state.currentSystem === obj.targetSystem) {
        obj.current = 1;
      }

      if (obj.type === 'visit_systems') {
        if (!obj.visited) obj.visited = [];
        var knownVisited = state.visitedSystems || [];
        knownVisited.forEach(function (systemId) {
          if (!obj.visited.includes(systemId)) obj.visited.push(systemId);
        });
        obj.current = Math.min(obj.amount || 1, obj.visited.length);
      }
    });
  }

  const typeInfo = QUEST_TYPES[quest.type] || {};

  // 若接取时目标已满足（例如“前往某星球”且当前已在目标地），立即完成
  if (_isQuestDone(quest)) {
    state.credits     += quest.rewards.credits || 0;
    state.experience   = (state.experience || 0) + (quest.rewards.exp || 0);
    state.reputation   = (state.reputation || 0) + (quest.rewards.reputation || 0);
    if (!state.completedQuests.includes(quest.id)) {
      state.completedQuests.push(quest.id);
    }
    _syncQuestPhase(state);

    return {
      ok: true,
      msgs: [{
        text: (typeInfo.icon || '📋') + ' 任务「' + quest.name + '」已立即完成！奖励：💰' +
              (quest.rewards.credits || 0) + ' 积分, ⭐' + (quest.rewards.exp || 0) + ' 经验',
        type: 'upgrade',
      }],
    };
  }

  state.quests.push(quest);

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
  var phaseBefore = getCurrentQuestPhase(state);

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
    if (!quest.objectives || quest.objectives.length === 0) {
      allDone = false;
    } else {
      quest.objectives.forEach(function (obj) {
        _updateObjective(obj, context, state);
        if (obj.current < (obj.amount || 1)) allDone = false;
      });
    }

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

  _syncQuestPhase(state);
  var phaseAfter = state.questPhase || 1;
  if (phaseAfter > phaseBefore) {
    var p = QUEST_PHASES[phaseAfter - 1];
    if (p) {
      msgs.push({
        text: '🎬 恭喜你进入' + p.name + '！新的章节任务与胜利条件已解锁。',
        type: 'upgrade',
      });
    }
  }

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
      // 兼容：旅行事件触发，或玩家当前就在目标星球
      if ((ctx.action === 'travel' && ctx.systemId === obj.targetSystem) ||
          state.currentSystem === obj.targetSystem) {
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

    case 'sell_at':
      // 在指定星系卖出指定商品
      if (ctx.action === 'sell' && ctx.goodId === obj.goodId &&
          ctx.systemId === obj.targetSystem) {
        obj.current = Math.min(obj.amount, obj.current + ctx.quantity);
      }
      break;

    case 'faction_relation':
      // 派系关系检查（每次触发时从 state 读取实际关系值）
      if (state.factionRelations && state.factionRelations[obj.factionId] != null) {
        obj.current = state.factionRelations[obj.factionId];
      }
      break;

    case 'survive_days':
      // 生存天数（每次旅行触发）
      if (ctx.action === 'travel') {
        obj.current = Math.min(obj.amount, (obj.current || 0) + 1);
      }
      break;

    case 'galaxy_jump':
      // 跨星系跃迁
      if (ctx.action === 'galaxy_jump') {
        obj.current = Math.min(obj.amount, (obj.current || 0) + 1);
      }
      break;
  }
}
