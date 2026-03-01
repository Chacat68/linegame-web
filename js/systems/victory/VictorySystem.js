// js/systems/victory/VictorySystem.js — 多路径胜利检测系统
// 依赖：data/victoryConditions.js, systems/trade/TradeSystem.js, systems/faction/FactionSystem.js
// 导出：checkVictory, getProgress, getPathProgress

import { VICTORY_PATHS } from '../../data/victoryConditions.js';
import * as Trade from '../trade/TradeSystem.js';
import * as Faction from '../faction/FactionSystem.js';
import { FACTIONS } from '../../data/factions.js';
import { getLevel } from '../../data/playerLevels.js';

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
      return (state.achievements || []).length;

    case 'completedQuests':
      return (state.completedQuests || []).length;

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
    requirements: reqs,
  };
}

/**
 * 获取全部路径的进度
 * @param {object} state
 * @returns {Array}
 */
export function getProgress(state) {
  return VICTORY_PATHS.map(function (path) {
    return getPathProgress(state, path);
  });
}

/**
 * 检测是否有任何路径达成胜利
 * @param {object} state
 * @returns {{ won: boolean, path: object|null, pathData: object|null }}
 */
export function checkVictory(state) {
  for (let i = 0; i < VICTORY_PATHS.length; i++) {
    const path = VICTORY_PATHS[i];
    const progress = getPathProgress(state, path);
    if (progress.completed) {
      return { won: true, path: path, pathData: progress };
    }
  }
  return { won: false, path: null, pathData: null };
}
