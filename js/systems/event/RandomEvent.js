// js/systems/event/RandomEvent.js — 随机事件系统（群星风格选择事件）
// 依赖：data/events.js, core/EventBus.js
// 导出：rollEvent, getActiveEvent, resolveChoice

import { RANDOM_EVENTS } from '../../data/events.js';
import * as EventBus from '../../core/EventBus.js';

let _activeEvent = null;

/**
 * 航行到达时掷骰判定是否触发事件
 * @param {object} state  游戏状态
 * @param {number} chance 基础概率 (0-1)，默认 0.25
 * @returns {object|null} 触发的事件定义，或 null
 */
export function rollEvent(state, chance) {
  if (typeof chance === 'undefined') chance = 0.25;

  // 科技 deep_scanner 提升概率
  if (state.researchedTechs && state.researchedTechs.includes('deep_scanner')) {
    chance *= 1.5;
  }

  if (Math.random() > chance) {
    _activeEvent = null;
    return null;
  }

  // 按权重加条件筛选可用事件
  const pool = RANDOM_EVENTS.filter(function (ev) {
    if (ev.condition && !ev.condition(state)) return false;
    return true;
  });

  if (pool.length === 0) { _activeEvent = null; return null; }

  // 加权随机选取
  const totalWeight = pool.reduce(function (sum, ev) { return sum + ev.weight; }, 0);
  let roll = Math.random() * totalWeight;
  let chosen = pool[0];
  for (let i = 0; i < pool.length; i++) {
    roll -= pool[i].weight;
    if (roll <= 0) { chosen = pool[i]; break; }
  }

  _activeEvent = chosen;
  EventBus.emit('event:triggered', { eventId: chosen.id });
  return chosen;
}

/**
 * 获取当前激活的事件
 */
export function getActiveEvent() {
  return _activeEvent;
}

/**
 * 玩家做出选择
 * @param {object} state       游戏状态
 * @param {number} choiceIndex 选择的索引
 * @returns {{ msgs: Array }} 结果消息
 */
export function resolveChoice(state, choiceIndex) {
  if (!_activeEvent) return { msgs: [] };

  const choice = _activeEvent.choices[choiceIndex];
  if (!choice) return { msgs: [] };

  const result = choice.effect(state);
  const eventId = _activeEvent.id;
  _activeEvent = null;

  EventBus.emit('event:resolved', { eventId, choiceIndex });
  return result;
}
