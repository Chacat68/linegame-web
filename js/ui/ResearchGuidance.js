// js/ui/ResearchGuidance.js — 科研补给引导的纯状态推导
// 不依赖 DOM，可在不加载完整 ResearchUI 的情况下供全局行动指引使用。

import { TECHNOLOGIES, TECH_CATEGORIES } from '../data/technologies.js';
import { getSystemsByGalaxy } from '../data/systems.js';

export function getResearchSupplyFocus(state) {
  state = state || {};
  var techId = state.currentResearch && state.currentResearch.techId
    ? state.currentResearch.techId
    : (((state.researchOptions || [])[0]) || null);

  if (!techId) return null;

  var tech = TECHNOLOGIES.find(function (item) { return item.id === techId; });
  if (!tech) return null;

  var category = TECH_CATEGORIES.find(function (item) { return item.id === tech.category; });
  return {
    techId: tech.id,
    techName: tech.name,
    categoryId: tech.category,
    categoryLabel: category ? category.name : tech.category,
    sourceLabel: state.currentResearch && state.currentResearch.techId ? '当前研究' : '候选方向',
  };
}

export function getResearchDispatchBlockerState(state, researchDispatchContext) {
  state = state || {};
  var focus = getResearchSupplyFocus(state);
  if (!focus) return null;

  researchDispatchContext = researchDispatchContext || {};
  var currentGalaxy = researchDispatchContext.currentGalaxy || state.currentGalaxy || 'milky_way';
  var playerLevel = Number.isFinite(researchDispatchContext.playerLevel)
    ? researchDispatchContext.playerLevel
    : (state.playerLevel || 1);
  var cargoFree = Number.isFinite(researchDispatchContext.cargoFree)
    ? researchDispatchContext.cargoFree
    : Math.max(0, (state.maxCargo || 0) - Object.values(state.cargo || {}).reduce(function (sum, qty) {
      return sum + qty;
    }, 0));
  var credits = Number.isFinite(researchDispatchContext.credits)
    ? researchDispatchContext.credits
    : (state.credits || 0);
  var accessibleSystems = getSystemsByGalaxy(currentGalaxy).filter(function (sys) {
    return playerLevel >= (sys.minLevel || 1);
  });

  if (cargoFree <= 0) {
    return Object.assign({}, focus, {
      reasonId: 'cargo',
      blockedReason: '当前货舱已满，暂时没有空位执行科研补给。',
      summaryText: '先清出部分舱位后，科研补给建议会自动恢复。',
    });
  }

  if (credits <= 0) {
    return Object.assign({}, focus, {
      reasonId: 'credits',
      blockedReason: '当前资金不足，暂时无法为科研补给垫付进货成本。',
      summaryText: '先做一笔周转或卖货回款，再回来安排这条科研补给线。',
    });
  }

  if (accessibleSystems.length < 2) {
    return Object.assign({}, focus, {
      reasonId: 'level',
      blockedReason: '当前可达科研补给点不足，先提升等级解锁更多星球。',
      summaryText: '先把可达星球池拉开，再回来规划更稳的科研补给循环。',
    });
  }

  return Object.assign({}, focus, {
    reasonId: 'generic',
    blockedReason: '当前没有匹配这项研究方向的稳定补给线。',
    summaryText: '先推进市场或任务节奏，等补给条件稳定后会再出现科研建议。',
  });
}
