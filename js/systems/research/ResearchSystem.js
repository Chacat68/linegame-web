// js/systems/research/ResearchSystem.js — 科技研究系统（群星风格三选一）
// 依赖：data/technologies.js, core/EventBus.js
// 导出：init, drawOptions, startResearch, advanceResearch, getResearchState, isResearched, applyTechEffects

import { TECHNOLOGIES, TECH_CATEGORIES } from '../../data/technologies.js';
import * as EventBus from '../../core/EventBus.js';

/**
 * 初始化研究系统状态（注入到 state 中）
 */
export function init(state) {
  if (!state.researchedTechs) state.researchedTechs = [];
  if (!state.currentResearch) state.currentResearch = null;   // { techId, daysLeft }
  if (!state.researchOptions) state.researchOptions = [];     // 当前可选的 3 个科技 id
  if (!state.techBuyDiscount) state.techBuyDiscount = 0;
  if (!state.techSellBonus)   state.techSellBonus = 0;

  // 首次初始化时抽取选项
  if (state.researchOptions.length === 0 && !state.currentResearch) {
    drawOptions(state);
  }
}

/**
 * 群星风格"三选一"：从可研究的科技中随机抽取 3 个
 */
export function drawOptions(state) {
  const available = TECHNOLOGIES.filter(function (tech) {
    // 已研究的排除
    if (state.researchedTechs.includes(tech.id)) return false;
    // 前置科技检查
    if (tech.requires.length > 0) {
      for (let i = 0; i < tech.requires.length; i++) {
        if (!state.researchedTechs.includes(tech.requires[i])) return false;
      }
    }
    return true;
  });

  // 打乱顺序，取前 3 个
  const shuffled = available.sort(function () { return Math.random() - 0.5; });
  state.researchOptions = shuffled.slice(0, 3).map(function (t) { return t.id; });

  return state.researchOptions;
}

/**
 * 开始研究一个科技
 * @param {object} state
 * @param {string} techId
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function startResearch(state, techId) {
  const tech = TECHNOLOGIES.find(function (t) { return t.id === techId; });
  if (!tech) return { ok: false, msgs: [{ text: '科技不存在。', type: 'error' }] };

  if (state.researchedTechs.includes(techId)) {
    return { ok: false, msgs: [{ text: '该科技已研究完成。', type: 'error' }] };
  }

  if (state.credits < tech.cost) {
    return { ok: false, msgs: [{ text: '💰 积分不足！需要 ' + tech.cost + ' 积分。', type: 'error' }] };
  }

  // 检查前置
  for (let i = 0; i < tech.requires.length; i++) {
    if (!state.researchedTechs.includes(tech.requires[i])) {
      const req = TECHNOLOGIES.find(function (t) { return t.id === tech.requires[i]; });
      return { ok: false, msgs: [{ text: '需要先研究「' + req.name + '」。', type: 'error' }] };
    }
  }

  state.credits -= tech.cost;
  state.currentResearch = { techId: techId, daysLeft: tech.researchDays };
  state.researchOptions = []; // 清空选项，研究完成后重新抽取

  EventBus.emit('research:started', { techId });
  return {
    ok: true,
    msgs: [{ text: '🔬 开始研究「' + tech.name + '」！预计 ' + tech.researchDays + ' 天完成。花费 ' + tech.cost + ' 积分。', type: 'upgrade' }],
  };
}

/**
 * 每天推进研究进度（在 advanceDay 时调用）
 * @returns {{ completed: boolean, msgs: Array }}
 */
export function advanceResearch(state) {
  if (!state.currentResearch) return { completed: false, msgs: [] };

  state.currentResearch.daysLeft -= 1;

  if (state.currentResearch.daysLeft <= 0) {
    const techId = state.currentResearch.techId;
    const tech = TECHNOLOGIES.find(function (t) { return t.id === techId; });

    state.researchedTechs.push(techId);
    state.currentResearch = null;

    // 应用科技效果
    _applyEffect(state, tech);

    // 抽取新选项
    drawOptions(state);

    EventBus.emit('research:completed', { techId });
    return {
      completed: true,
      msgs: [
        { text: '🎓 研究完成：「' + tech.name + '」！', type: 'upgrade' },
        { text: '✨ 效果：' + tech.effectText, type: 'info' },
      ],
    };
  }

  return {
    completed: false,
    msgs: [{ text: '🔬 研究进度：「' + TECHNOLOGIES.find(function (t) { return t.id === state.currentResearch.techId; }).name + '」剩余 ' + state.currentResearch.daysLeft + ' 天。', type: 'info' }],
  };
}

/**
 * 应用科技效果到状态
 */
function _applyEffect(state, tech) {
  const eff = tech.effect;
  if (eff.cargo)          state.maxCargo += eff.cargo;
  if (eff.maxFuel)        state.maxFuel += eff.maxFuel;
  if (eff.fuelEfficiency) state.fuelEfficiency *= eff.fuelEfficiency;
  if (eff.shipHull)       state.maxHull = (state.maxHull || 100) + eff.shipHull;
  if (eff.buyDiscount)    state.techBuyDiscount = (state.techBuyDiscount || 0) + eff.buyDiscount;
  if (eff.sellBonus)      state.techSellBonus = (state.techSellBonus || 0) + eff.sellBonus;
  if (eff.autoRepair)     state.autoRepair = (state.autoRepair || 0) + eff.autoRepair;
  if (eff.factionBonus) {
    // 所有派系关系 +N
    if (state.factionRelations) {
      Object.keys(state.factionRelations).forEach(function (fid) {
        state.factionRelations[fid] = Math.min(100, state.factionRelations[fid] + eff.factionBonus);
      });
    }
  }
}

/**
 * 是否已研究某科技
 */
export function isResearched(state, techId) {
  return state.researchedTechs && state.researchedTechs.includes(techId);
}

/**
 * 获取当前研究状态信息
 */
export function getResearchState(state) {
  return {
    current: state.currentResearch,
    options: state.researchOptions || [],
    completed: state.researchedTechs || [],
  };
}
