// js/systems/research/ResearchSystem.js — 科技研究系统（群星风格三选一）
// 依赖：data/technologies.js, core/EventBus.js
// 导出：init, drawOptions, startResearch, advanceResearch,
//       cancelQueuedResearch, moveQueuedResearchUp, moveQueuedResearchDown,
//       clearResearchQueue,
//       getResearchState, isResearched, applyTechEffects

import { TECHNOLOGIES, TECH_CATEGORIES } from '../../data/technologies.js';
import * as EventBus from '../../core/EventBus.js';

/**
 * 初始化研究系统状态（注入到 state 中）
 */
export function init(state) {
  if (!state.researchedTechs) state.researchedTechs = [];
  if (!state.currentResearch) state.currentResearch = null;   // { techId, daysLeft }
  if (!state.researchQueue) state.researchQueue = [];         // [{ techId, daysLeft }]
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
  if (!state.researchOptions) state.researchOptions = [];

  // 清理无效选项（已研究、已在研究、已入队或前置不满足）
  state.researchOptions = state.researchOptions.filter(function (techId) {
    return _isTechAvailable(state, techId);
  });

  // 补齐到 3 项
  const available = _getAvailableTechs(state);
  while (state.researchOptions.length < 3 && available.length > 0) {
    const idx = Math.floor(Math.random() * available.length);
    const tech = available[idx];
    state.researchOptions.push(tech.id);
    available.splice(idx, 1);
  }

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

  if (state.currentResearch && state.currentResearch.techId === techId) {
    return { ok: false, msgs: [{ text: '该科技正在研究中。', type: 'error' }] };
  }

  if ((state.researchQueue || []).some(function (item) { return item.techId === techId; })) {
    return { ok: false, msgs: [{ text: '该科技已在研究队列中。', type: 'error' }] };
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
  const researchTask = { techId: techId, daysLeft: tech.researchDays };

  let msg = '';
  if (!state.currentResearch) {
    state.currentResearch = researchTask;
    EventBus.emit('research:started', { techId });
    msg = '🔬 开始研究「' + tech.name + '」！预计 ' + tech.researchDays + ' 天完成。花费 ' + tech.cost + ' 积分。';
  } else {
    if (!state.researchQueue) state.researchQueue = [];
    state.researchQueue.push(researchTask);
    EventBus.emit('research:queued', { techId, position: state.researchQueue.length });
    msg = '🗂️ 已将「' + tech.name + '」加入研究队列（第 ' + state.researchQueue.length + ' 位）。花费 ' + tech.cost + ' 积分。';
  }

  state.researchOptions = (state.researchOptions || []).filter(function (id) { return id !== techId; });
  drawOptions(state);

  return {
    ok: true,
    msgs: [{ text: msg, type: 'upgrade' }],
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

    // 补齐新选项
    drawOptions(state);

    const msgs = [
      { text: '🎓 研究完成：「' + tech.name + '」！', type: 'upgrade' },
      { text: '✨ 效果：' + tech.effectText, type: 'info' },
    ];

    // 自动接力队列
    if (state.researchQueue && state.researchQueue.length > 0) {
      const next = state.researchQueue.shift();
      state.currentResearch = { techId: next.techId, daysLeft: next.daysLeft };
      const nextTech = TECHNOLOGIES.find(function (t) { return t.id === next.techId; });
      EventBus.emit('research:started', { techId: next.techId, fromQueue: true });
      msgs.push({ text: '▶️ 队列接力：开始研究「' + nextTech.name + '」，剩余 ' + next.daysLeft + ' 天。', type: 'info' });
    }

    EventBus.emit('research:completed', { techId });
    return {
      completed: true,
      msgs: msgs,
    };
  }

  return {
    completed: false,
    msgs: [{ text: '🔬 研究进度：「' + TECHNOLOGIES.find(function (t) { return t.id === state.currentResearch.techId; }).name + '」剩余 ' + state.currentResearch.daysLeft + ' 天。', type: 'info' }],
  };
}

/**
 * 取消队列中的科技（未开始研究）
 * @param {object} state
 * @param {string} techId
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function cancelQueuedResearch(state, techId) {
  if (!state.researchQueue || state.researchQueue.length === 0) {
    return { ok: false, msgs: [{ text: '研究队列为空。', type: 'error' }] };
  }

  const idx = state.researchQueue.findIndex(function (item) { return item.techId === techId; });
  if (idx < 0) {
    return { ok: false, msgs: [{ text: '该科技不在研究队列中。', type: 'error' }] };
  }

  const task = state.researchQueue[idx];
  state.researchQueue.splice(idx, 1);

  const tech = TECHNOLOGIES.find(function (t) { return t.id === task.techId; });
  const refund = tech ? tech.cost : 0;
  if (refund > 0) state.credits += refund;

  drawOptions(state);

  EventBus.emit('research:queueCanceled', { techId: task.techId, refund: refund });
  return {
    ok: true,
    msgs: [{ text: '↩️ 已取消队列中的「' + (tech ? tech.name : task.techId) + '」，返还 ' + refund + ' 积分。', type: 'info' }],
  };
}

/**
 * 将队列中的科技上移一位（提高优先级）
 * @param {object} state
 * @param {string} techId
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function moveQueuedResearchUp(state, techId) {
  if (!state.researchQueue || state.researchQueue.length === 0) {
    return { ok: false, msgs: [{ text: '研究队列为空。', type: 'error' }] };
  }

  const idx = state.researchQueue.findIndex(function (item) { return item.techId === techId; });
  if (idx < 0) {
    return { ok: false, msgs: [{ text: '该科技不在研究队列中。', type: 'error' }] };
  }
  if (idx === 0) {
    return { ok: false, msgs: [{ text: '该科技已经是队列最高优先级。', type: 'info' }] };
  }

  const current = state.researchQueue[idx];
  state.researchQueue[idx] = state.researchQueue[idx - 1];
  state.researchQueue[idx - 1] = current;

  const tech = TECHNOLOGIES.find(function (t) { return t.id === techId; });
  EventBus.emit('research:queueMoved', { techId: techId, from: idx + 1, to: idx });
  return {
    ok: true,
    msgs: [{ text: '⬆️ 已提升「' + (tech ? tech.name : techId) + '」的研究优先级。', type: 'info' }],
  };
}

/**
 * 将队列中的科技下移一位（降低优先级）
 * @param {object} state
 * @param {string} techId
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function moveQueuedResearchDown(state, techId) {
  if (!state.researchQueue || state.researchQueue.length === 0) {
    return { ok: false, msgs: [{ text: '研究队列为空。', type: 'error' }] };
  }

  const idx = state.researchQueue.findIndex(function (item) { return item.techId === techId; });
  if (idx < 0) {
    return { ok: false, msgs: [{ text: '该科技不在研究队列中。', type: 'error' }] };
  }
  if (idx === state.researchQueue.length - 1) {
    return { ok: false, msgs: [{ text: '该科技已经是队列最低优先级。', type: 'info' }] };
  }

  const current = state.researchQueue[idx];
  state.researchQueue[idx] = state.researchQueue[idx + 1];
  state.researchQueue[idx + 1] = current;

  const tech = TECHNOLOGIES.find(function (t) { return t.id === techId; });
  EventBus.emit('research:queueMoved', { techId: techId, from: idx + 1, to: idx + 2 });
  return {
    ok: true,
    msgs: [{ text: '⬇️ 已降低「' + (tech ? tech.name : techId) + '」的研究优先级。', type: 'info' }],
  };
}

/**
 * 一键清空研究队列（返还全部未开始研究的费用）
 * @param {object} state
 * @returns {{ ok: boolean, msgs: Array }}
 */
export function clearResearchQueue(state) {
  if (!state.researchQueue || state.researchQueue.length === 0) {
    return { ok: false, msgs: [{ text: '研究队列为空。', type: 'info' }] };
  }

  let refund = 0;
  state.researchQueue.forEach(function (item) {
    const tech = TECHNOLOGIES.find(function (t) { return t.id === item.techId; });
    if (tech) refund += tech.cost;
  });

  const cleared = state.researchQueue.length;
  state.researchQueue = [];
  if (refund > 0) state.credits += refund;

  drawOptions(state);

  EventBus.emit('research:queueCleared', { count: cleared, refund: refund });
  return {
    ok: true,
    msgs: [{ text: '🧹 已清空研究队列（' + cleared + ' 项），返还 ' + refund + ' 积分。', type: 'info' }],
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
    queue: state.researchQueue || [],
    options: state.researchOptions || [],
    completed: state.researchedTechs || [],
  };
}

function _getUnavailableIds(state) {
  const blocked = Object.create(null);
  (state.researchedTechs || []).forEach(function (id) { blocked[id] = true; });
  if (state.currentResearch && state.currentResearch.techId) {
    blocked[state.currentResearch.techId] = true;
  }
  (state.researchQueue || []).forEach(function (item) {
    if (item && item.techId) blocked[item.techId] = true;
  });
  (state.researchOptions || []).forEach(function (id) { blocked[id] = true; });
  return blocked;
}

function _isTechAvailable(state, techId) {
  const tech = TECHNOLOGIES.find(function (t) { return t.id === techId; });
  if (!tech) return false;
  if ((state.researchedTechs || []).includes(tech.id)) return false;
  if (state.currentResearch && state.currentResearch.techId === tech.id) return false;
  if ((state.researchQueue || []).some(function (item) { return item.techId === tech.id; })) return false;
  if (tech.requires.length > 0) {
    for (let i = 0; i < tech.requires.length; i++) {
      if (!(state.researchedTechs || []).includes(tech.requires[i])) return false;
    }
  }
  return true;
}

function _getAvailableTechs(state) {
  const blocked = _getUnavailableIds(state);
  return TECHNOLOGIES.filter(function (tech) {
    if (blocked[tech.id]) return false;
    return _isTechAvailable(state, tech.id);
  });
}
