// js/systems/victory/VictorySystem.js — 多路径胜利检测系统
// 依赖：data/victoryConditions.js, systems/trade/TradeSystem.js, systems/faction/FactionSystem.js
// 导出：checkVictory, getProgress, getPathProgress

import { VICTORY_PATHS } from '../../data/victoryConditions.js';
import * as Trade from '../trade/TradeSystem.js';
import * as Faction from '../faction/FactionSystem.js';
import { FACTIONS } from '../../data/factions.js';
import { getLevel } from '../../data/playerLevels.js';
import { getSelectedVictoryPolicy, normalizeVictoryPathId } from './VictoryPolicy.js';
import { ACHIEVEMENTS, ACHIEVEMENT_ALIASES } from '../../data/achievements.js';
import * as BalanceMetrics from '../metrics/BalanceMetricsSystem.js';

const ACTIVE_ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(function (achievement) { return achievement.id; }));

function _getCoreAchievementCount(state) {
  const validIds = new Set();
  (state.achievements || []).forEach(function (achievementId) {
    var normalizedId = ACTIVE_ACHIEVEMENT_IDS.has(achievementId)
      ? achievementId
      : (ACHIEVEMENT_ALIASES[achievementId] || achievementId);
    if (ACTIVE_ACHIEVEMENT_IDS.has(normalizedId)) validIds.add(normalizedId);
  });
  return validIds.size;
}

function _getCompletedSurveyCount(state) {
  var galaxyStates = state && state.galaxyStates && typeof state.galaxyStates === 'object'
    ? state.galaxyStates
    : {};
  return Object.values(galaxyStates).filter(function (planetState) {
    var pois = planetState && planetState.exploration && Array.isArray(planetState.exploration.pois)
      ? planetState.exploration.pois
      : [];
    return pois.length > 0 && pois.every(function (poi) { return poi && poi.resolved; });
  }).length;
}

function _getUnlockedPathCount(state) {
  var chapter = state.questPhase || 1;
  // 路线已精简为 5 条：前两章快速展开方向，避免玩家因数量减少反而更晚看到选择。
  return Math.min(VICTORY_PATHS.length, Math.max(2, Math.max(1, chapter) * 2));
}

export function getUnlockedPaths(state) {
  if (state && state.storyDecisions && state.storyDecisions.victory_policy) {
    state.storyDecisions.victory_policy = normalizeVictoryPathId(state.storyDecisions.victory_policy);
  }
  var count = _getUnlockedPathCount(state);
  return VICTORY_PATHS.slice(0, count);
}

/**
 * 计算单个需求的当前进度值
 * @param {object} state    游戏状态
 * @param {object} req      需求对象 { type, target, label }
 * @returns {number}         当前值
 */
function _getRequirementValue(state, req) {
  switch (req.type) {
    case 'netWorth':
      return Trade.getNetWorth(state);

    case 'tradeCount':
      return state.tradeCount || 0;

    case 'researchCount':
      return (state.researchedTechs || []).length;

    case 'playerLevel':
      return getLevel(state.experience || 0).level;

    case 'allFactionsAllied': {
      // 计算已结盟的派系数量（关系值 ≥ 70）
      let alliedCount = 0;
      FACTIONS.forEach(function (f) {
        const rel = Faction.getRelation(state, f.id);
        if (rel >= 70) alliedCount++;
      });
      return alliedCount;
    }

    case 'reputation':
      return state.reputation || 0;

    case 'visitedGalaxies':
      return (state.visitedGalaxies || []).length;

    case 'visitedSystems':
      return (state.visitedSystems || []).length;

    case 'achievements':
      return _getCoreAchievementCount(state);

    case 'completedSurveys':
      return _getCompletedSurveyCount(state);

    case 'completedQuests':
      return (state.completedQuests || []).length;

    case 'fleetSlots':
      return (state.fleetSlots || 1);

    case 'shipTypes': {
      var types = {};
      (state.fleet || []).forEach(function (s) { types[s.typeId] = true; });
      return Object.keys(types).length;
    }

    case 'totalProfit':
      return state.totalProfit || 0;

    case 'day':
      return state.day || 1;

    default:
      return 0;
  }
}

/**
 * 获取某条路径的详细进度
 * @param {object} state   游戏状态
 * @param {object} path    VICTORY_PATHS 中的一项
 * @returns {{ pathId, name, icon, color, progress, completed, requirements: Array<{label, current, target, done}> }}
 */
export function getPathProgress(state, path) {
  let totalPct = 0;
  const reqs = path.requirements.map(function (req) {
    const current = _getRequirementValue(state, req);
    const pct = Math.min(1, current / req.target);
    totalPct += pct;
    return {
      label: req.label,
      current: Math.floor(current),
      target: req.target,
      done: current >= req.target,
    };
  });

  const progress = totalPct / path.requirements.length; // 0~1 平均进度
  const completed = reqs.every(function (r) { return r.done; });

  return {
    pathId: path.id,
    name: path.name,
    icon: path.icon,
    color: path.color,
    progress: progress,
    completed: completed,
    policy: path.policy || null,
    policySelected: !!(state.storyDecisions && normalizeVictoryPathId(state.storyDecisions.victory_policy) === path.id),
    policyLocked: !!(state.storyDecisions && state.storyDecisions.victory_policy && normalizeVictoryPathId(state.storyDecisions.victory_policy) !== path.id),
    activePolicyId: normalizeVictoryPathId(state.storyDecisions && state.storyDecisions.victory_policy),
    requirements: reqs,
  };
}

export function getActivePolicy(state) {
  return getSelectedVictoryPolicy(state);
}

export function choosePolicy(state, pathId) {
  const existing = normalizeVictoryPathId(state && state.storyDecisions && state.storyDecisions.victory_policy);
  if (existing) {
    const active = getSelectedVictoryPolicy(state);
    return {
      ok: false,
      msgs: [{ text: '🔒 长期路线不可更改：当前已选择「' + (active ? active.name : existing) + '」。', type: 'info' }],
    };
  }
  const path = getUnlockedPaths(state).find(function (entry) { return entry.id === normalizeVictoryPathId(pathId); });
  if (!path || !path.policy) {
    return { ok: false, msgs: [{ text: '🔒 该长期路线尚未随任务章节解锁。', type: 'error' }] };
  }
  if (!state.storyDecisions || typeof state.storyDecisions !== 'object' || Array.isArray(state.storyDecisions)) {
    state.storyDecisions = {};
  }
  state.storyDecisions.victory_policy = path.id;
  BalanceMetrics.recordRouteSelection(state, path.id, { netWorth: Trade.getNetWorth(state) });
  return {
    ok: true,
    policy: getSelectedVictoryPolicy(state),
    msgs: [{ text: '📜 已选择长期路线「' + path.policy.name + '」。收益：' + path.policy.benefit + '；代价：' + path.policy.tradeoff + '。此选择不可更改。', type: 'upgrade' }],
  };
}

/**
 * 获取全部路径的进度
 * @param {object} state
 * @returns {Array}
 */
export function getProgress(state) {
  return getUnlockedPaths(state).map(function (path) {
    return getPathProgress(state, path);
  });
}

/**
 * 检测是否有任何路径达成胜利
 * @param {object} state
 * @param {Set<string>|Array<string>} [ignoredPathIds] 本次会话中已确认的路径
 * @returns {{ won: boolean, path: object|null, pathData: object|null }}
 */
export function checkVictory(state, ignoredPathIds) {
  var unlockedPaths = getUnlockedPaths(state);
  var selectedPathId = normalizeVictoryPathId(state && state.storyDecisions && state.storyDecisions.victory_policy);
  // 胜利信条既然不可逆，就必须同时约束最终结算路线；否则玩家可以拿一条路线的
  // 常驻收益，再从另一条更容易的路线结算，选择本身不会形成长期取舍。
  if (selectedPathId) {
    unlockedPaths = unlockedPaths.filter(function (path) { return path.id === selectedPathId; });
  }
  for (let i = 0; i < unlockedPaths.length; i++) {
    const path = unlockedPaths[i];
    const ignored = ignoredPathIds && typeof ignoredPathIds.has === 'function'
      ? Array.from(ignoredPathIds).some(function (id) { return normalizeVictoryPathId(id) === path.id; })
      : (Array.isArray(ignoredPathIds) && ignoredPathIds.some(function (id) { return normalizeVictoryPathId(id) === path.id; }));
    if (ignored) continue;
    const progress = getPathProgress(state, path);
    if (progress.completed) {
      return { won: true, path: path, pathData: progress };
    }
  }
  return { won: false, path: null, pathData: null };
}
