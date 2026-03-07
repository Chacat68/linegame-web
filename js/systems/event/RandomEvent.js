// js/systems/event/RandomEvent.js — 随机事件系统（群星风格选择事件）
// 依赖：data/events.js, core/EventBus.js
// 导出：rollEvent, getActiveEvent, resolveChoice, getCooldownState, getEventHistory

import { RANDOM_EVENTS } from '../../data/events.js';
import * as EventBus from '../../core/EventBus.js';

let _activeEvent = null;

// 事件冷却追踪：{ eventId: lastTriggeredDay }
const _cooldowns = Object.create(null);
const COOLDOWN_DAYS = 10; // 同一事件至少间隔 10 天

// 事件历史：[{ eventId, day, choiceIndex }]（最近 30 条）
const _eventHistory = [];
const MAX_HISTORY = 30;

/**
 * 航行到达时掷骰判定是否触发事件
 * @param {object} state  游戏状态
 * @param {number} chance 基础概率 (0-1)，默认 0.25
 * @returns {object|null} 触发的事件定义，或 null
 */
export function rollEvent(state, chance) {
  if (typeof chance === 'undefined') chance = 0.25;

  // 难度调节事件概率
  if (state.difficulty) {
    var diffSettings = { easy: 0.8, hard: 1.3 };
    chance *= (diffSettings[state.difficulty] || 1.0);
  }

  // 科技 deep_scanner 提升概率
  if (state.researchedTechs && state.researchedTechs.includes('deep_scanner')) {
    chance *= 1.5;
  }

  if (Math.random() > chance) {
    _activeEvent = null;
    return null;
  }

  const currentDay = state.day || 1;

  // 优先检查是否有待触发的事件链后续
  const chainEvent = _checkEventChain(state);

  // 按权重加条件筛选可用事件（排除冷却中的事件）
  const pool = chainEvent ? [chainEvent] : RANDOM_EVENTS.filter(function (ev) {
    if (ev.condition && !ev.condition(state)) return false;
    // 冷却检查
    if (_cooldowns[ev.id] && (currentDay - _cooldowns[ev.id]) < COOLDOWN_DAYS) return false;
    return true;
  });

  if (pool.length === 0) { _activeEvent = null; return null; }

  // 加权随机选取
  const totalWeight = pool.reduce(function (sum, ev) { return sum + (ev.weight || 10); }, 0);
  let roll = Math.random() * totalWeight;
  let chosen = pool[0];
  for (let i = 0; i < pool.length; i++) {
    roll -= (pool[i].weight || 10);
    if (roll <= 0) { chosen = pool[i]; break; }
  }

  // 设定冷却
  _cooldowns[chosen.id] = currentDay;

  _activeEvent = chosen;
  state.totalEvents = (state.totalEvents || 0) + 1;
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

  // 记录历史
  _eventHistory.push({ eventId: eventId, day: state.day || 1, choiceIndex: choiceIndex });
  if (_eventHistory.length > MAX_HISTORY) _eventHistory.shift();

  // 检查是否触发事件链后续
  if (_activeEvent.chainFollowUp) {
    var followUp = _activeEvent.chainFollowUp[choiceIndex];
    if (followUp) {
      if (!state._pendingChainEvents) state._pendingChainEvents = [];
      state._pendingChainEvents.push({
        eventId: followUp,
        triggerAfterDays: _activeEvent.chainDelay || 3,
        scheduledDay: (state.day || 1) + (_activeEvent.chainDelay || 3),
      });
    }
  }

  _activeEvent = null;

  EventBus.emit('event:resolved', { eventId, choiceIndex });
  return result;
}

/**
 * 检查是否有事件链后续需要触发
 */
function _checkEventChain(state) {
  if (!state._pendingChainEvents || state._pendingChainEvents.length === 0) return null;
  var currentDay = state.day || 1;
  for (var i = 0; i < state._pendingChainEvents.length; i++) {
    var pending = state._pendingChainEvents[i];
    if (currentDay >= pending.scheduledDay) {
      state._pendingChainEvents.splice(i, 1);
      var chainEv = RANDOM_EVENTS.find(function (ev) { return ev.id === pending.eventId; });
      return chainEv || null;
    }
  }
  return null;
}

/**
 * 获取事件冷却状态（用于 UI 调试/显示）
 */
export function getCooldownState() {
  return Object.assign({}, _cooldowns);
}

/**
 * 获取最近事件历史
 */
export function getEventHistory() {
  return _eventHistory.slice();
}
