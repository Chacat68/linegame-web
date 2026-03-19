// js/systems/event/RandomEvent.js — 随机事件系统（群星风格选择事件）
// 依赖：data/events.js, data/constants.js, core/EventBus.js
// 导出：rollEvent, getActiveEvent, resolveChoice, getCooldownState, getEventHistory,
//       getEligibleEvents, resetRuntimeState, syncRuntimeState

import { RANDOM_EVENTS } from '../../data/events.js';
import { DIFFICULTY_LEVELS, EVENT_CONFIG } from '../../data/constants.js';
import * as EventBus from '../../core/EventBus.js';

let _activeEvent = null;

// 事件冷却追踪：{ eventId: lastTriggeredDay }
const _cooldowns = Object.create(null);
const COOLDOWN_DAYS = EVENT_CONFIG.cooldownDays;

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
  _hydrateRuntimeState(state);

  const difficulty = _getDifficultySettings(state);
  chance *= difficulty.eventChanceMod || 1.0;

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

  const pool = chainEvent ? [chainEvent] : getEligibleEvents(state);

  if (pool.length === 0) { _activeEvent = null; return null; }

  // 加权随机选取
  const totalWeight = pool.reduce(function (sum, ev) { return sum + _getEventWeight(ev, difficulty); }, 0);
  let roll = Math.random() * totalWeight;
  let chosen = pool[0];
  for (let i = 0; i < pool.length; i++) {
    roll -= _getEventWeight(pool[i], difficulty);
    if (roll <= 0) { chosen = pool[i]; break; }
  }

  // 设定冷却
  _cooldowns[chosen.id] = currentDay;
  _persistRuntimeState(state);

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
  _hydrateRuntimeState(state);

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

  _persistRuntimeState(state);
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

export function syncRuntimeState(state) {
  _hydrateRuntimeState(state);
}

export function resetRuntimeState(state) {
  _activeEvent = null;
  Object.keys(_cooldowns).forEach(function (key) { delete _cooldowns[key]; });
  _eventHistory.length = 0;
  if (state && typeof state === 'object') {
    state._eventCooldowns = {};
    state._eventHistory = [];
  }
}

export function getEligibleEvents(state) {
  _hydrateRuntimeState(state);
  const currentDay = state.day || 1;
  return RANDOM_EVENTS.filter(function (ev) {
    if (ev.stage === 'chain') return false;
    if (ev.condition && !ev.condition(state)) return false;
    if (_isOnCooldown(ev, currentDay)) return false;
    if (!_matchesStage(ev, state)) return false;
    if (!_passesProtection(ev, state)) return false;
    return true;
  });
}

function _getDifficultySettings(state) {
  return DIFFICULTY_LEVELS[(state && state.difficulty) || 'normal'] || DIFFICULTY_LEVELS.normal;
}

function _getEventWeight(eventDef, difficulty) {
  var riskWeights = difficulty && difficulty.eventRiskWeights ? difficulty.eventRiskWeights : null;
  var risk = eventDef.risk || 'risky';
  var riskMod = riskWeights && typeof riskWeights[risk] === 'number' ? riskWeights[risk] : 1;
  return (eventDef.weight || 10) * riskMod;
}

function _hydrateRuntimeState(state) {
  if (!state || typeof state !== 'object') return;

  if (!state._eventCooldowns || typeof state._eventCooldowns !== 'object' || Array.isArray(state._eventCooldowns)) {
    state._eventCooldowns = {};
  }
  if (!Array.isArray(state._eventHistory)) {
    state._eventHistory = [];
  }

  Object.keys(_cooldowns).forEach(function (key) { delete _cooldowns[key]; });
  Object.keys(state._eventCooldowns).forEach(function (key) {
    if (typeof state._eventCooldowns[key] === 'number') {
      _cooldowns[key] = state._eventCooldowns[key];
    }
  });

  _eventHistory.length = 0;
  state._eventHistory.slice(-MAX_HISTORY).forEach(function (entry) {
    _eventHistory.push(entry);
  });
}

function _persistRuntimeState(state) {
  if (!state || typeof state !== 'object') return;
  state._eventCooldowns = Object.assign({}, _cooldowns);
  state._eventHistory = _eventHistory.slice(-MAX_HISTORY);
}

function _isOnCooldown(eventDef, currentDay) {
  return !!(_cooldowns[eventDef.id] && (currentDay - _cooldowns[eventDef.id]) < COOLDOWN_DAYS);
}

function _matchesStage(eventDef, state) {
  var stage = eventDef.stage || 'mid';
  if (stage === 'chain') return true;

  var day = state.day || 1;
  var playerLevel = state.playerLevel || 1;
  var stages = EVENT_CONFIG.stages;

  if (stage === 'early') {
    return day <= stages.early.maxDay || playerLevel <= stages.early.maxPlayerLevel;
  }
  if (stage === 'mid') {
    return (day > stages.early.maxDay || playerLevel > stages.early.maxPlayerLevel) &&
      (day <= stages.mid.maxDay || playerLevel <= stages.mid.maxPlayerLevel);
  }
  return day > stages.mid.maxDay || playerLevel > stages.mid.maxPlayerLevel;
}

function _passesProtection(eventDef, state) {
  var rules = eventDef.protection || {};
  if (rules.bypassProtection) return true;

  var hull = state.shipHull == null ? 100 : state.shipHull;
  var fuel = state.fuel == null ? 100 : state.fuel;
  var credits = state.credits == null ? 0 : state.credits;
  var day = state.day || 1;
  var playerLevel = state.playerLevel || 1;
  var protection = EVENT_CONFIG.protection;

  if (eventDef.risk === 'dangerous' &&
      day <= protection.earlyDangerousMaxDay &&
      playerLevel <= protection.earlyDangerousMaxLevel) {
    return false;
  }
  if (rules.avoidWhenLowHull && hull <= protection.lowHullThreshold) {
    return false;
  }
  if (rules.avoidWhenLowFuel && fuel <= protection.lowFuelThreshold) {
    return false;
  }
  if (rules.avoidWhenLowCredits && credits <= protection.lowCreditsThreshold) {
    return false;
  }
  return true;
}
