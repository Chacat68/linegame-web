// js/systems/faction/FactionSystem.js — 派系外交系统（群星风格）
// 依赖：data/factions.js, core/EventBus.js
// 导出：init, getRelation, getLevel, changeRelation, getFactionForSystem, getTaxModifier, getAllRelations

import { FACTIONS, FACTION_LEVELS } from '../../data/factions.js';
import * as EventBus from '../../core/EventBus.js';

/**
 * 初始化派系关系（注入到 state 中）
 */
export function init(state) {
  if (!state.factionRelations) {
    state.factionRelations = {};
    FACTIONS.forEach(function (f) {
      state.factionRelations[f.id] = 0; // 初始中立
    });
  }
}

/**
 * 获取与指定派系的关系值
 */
export function getRelation(state, factionId) {
  return (state.factionRelations && state.factionRelations[factionId]) || 0;
}

/**
 * 获取与指定派系的关系等级对象
 */
export function getLevel(state, factionId) {
  const val = getRelation(state, factionId);
  for (let i = FACTION_LEVELS.length - 1; i >= 0; i--) {
    if (val >= FACTION_LEVELS[i].min && val < FACTION_LEVELS[i].max) {
      return FACTION_LEVELS[i];
    }
  }
  return FACTION_LEVELS[2]; // neutral fallback
}

/**
 * 改变与派系的关系
 * @param {object} state
 * @param {string} factionId
 * @param {number} delta  正数改善，负数恶化
 * @returns {{ oldLevel, newLevel, msgs: Array }}
 */
export function changeRelation(state, factionId, delta) {
  if (!state.factionRelations) init(state);

  const oldVal = state.factionRelations[factionId] || 0;
  const oldLevel = getLevel(state, factionId);

  state.factionRelations[factionId] = Math.max(-100, Math.min(100, oldVal + delta));

  const newLevel = getLevel(state, factionId);
  const faction = FACTIONS.find(function (f) { return f.id === factionId; });
  const msgs = [];

  if (oldLevel.id !== newLevel.id) {
    msgs.push({
      text: faction.icon + ' 与 ' + faction.name + ' 的关系变为：' + newLevel.emoji + ' ' + newLevel.name,
      type: delta > 0 ? 'sell' : 'error',
    });
    EventBus.emit('faction:levelChanged', {
      factionId, oldLevel: oldLevel.id, newLevel: newLevel.id
    });
  }

  return { oldLevel, newLevel, msgs };
}

/**
 * 查找控制指定星系的派系
 * @returns {object|null} 派系定义
 */
export function getFactionForSystem(systemId) {
  return FACTIONS.find(function (f) {
    return f.controlledSystems.includes(systemId);
  }) || null;
}

/**
 * 获取指定星系的贸易税修正系数（基于派系关系）
 */
export function getTaxModifier(state, systemId) {
  const faction = getFactionForSystem(systemId);
  if (!faction) return 1.0;
  const level = getLevel(state, faction.id);
  return level.taxMod;
}

/**
 * 交易时自动更新派系关系
 * @param {object} state
 * @param {string} systemId  交易发生的星系
 * @param {string} goodId    交易的商品
 * @param {'buy'|'sell'} action
 * @param {number} quantity
 */
export function onTrade(state, systemId, goodId, action, quantity) {
  const faction = getFactionForSystem(systemId);
  if (!faction) return [];

  let delta = Math.ceil(quantity * 0.5); // 基础好感度变化

  // 检查商品偏好
  if (faction.tradePreference.liked.includes(goodId)) {
    delta = Math.ceil(delta * 1.5);
  } else if (faction.tradePreference.disliked.includes(goodId)) {
    delta = -Math.abs(delta);
  }

  // 卖出在对方星球 = 他们需要你，好感度增加更多
  if (action === 'sell') delta = Math.ceil(delta * 1.2);

  const result = changeRelation(state, faction.id, delta);
  return result.msgs;
}

/**
 * 获取所有派系及关系信息
 */
export function getAllRelations(state) {
  return FACTIONS.map(function (f) {
    return {
      faction: f,
      relation: getRelation(state, f.id),
      level: getLevel(state, f.id),
    };
  });
}
