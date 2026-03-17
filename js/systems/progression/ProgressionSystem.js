// js/systems/progression/ProgressionSystem.js — 等级进阶系统
// 依赖：data/playerLevels.js, data/systems.js, systems/fleet/FleetSystem.js
// 导出：gainExperience, gainCompanyExperience, applyLevelPerk, announceNewRoutes
//
// 从 GameManager 中提取的纯逻辑模块。
// 所有函数均通过参数接收 state，返回 { msgs } 格式。

import * as PlayerLevels from '../../data/playerLevels.js';
import { SYSTEMS } from '../../data/systems.js';
import * as Fleet from '../fleet/FleetSystem.js';

const getLevel = PlayerLevels.getLevel;
const getCompanyLevel = PlayerLevels.getCompanyLevel || function () {
  return { level: 1, title: '新创企业', expRequired: 0, icon: '🏢' };
};
const COMPANY_LEVELS = PlayerLevels.COMPANY_LEVELS || [
  { level: 1, title: '新创企业', expRequired: 0, icon: '🏢' },
];

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 增加玩家经验并检查升级
 * @param {object} state  游戏状态
 * @param {number} amount 经验值
 * @returns {{ msgs: Array }}
 */
export function gainExperience(state, amount) {
  const msgs = [];
  const oldLevel = getLevel(state.experience || 0);
  state.experience = (state.experience || 0) + amount;
  const newLevel = getLevel(state.experience);

  if (newLevel.level > oldLevel.level) {
    state.playerLevel = newLevel.level;
    msgs.push({
      text: '🎉 升级！你现在是 ' + newLevel.icon + ' ' + newLevel.title + ' (Lv.' + newLevel.level + ')',
      type: 'upgrade',
    });
    // 应用升级奖励
    const perkMsgs = applyLevelPerk(state, newLevel.level);
    msgs.push(...perkMsgs.msgs);
    // 提示新解锁的星球
    const routeMsgs = announceNewRoutes(state, oldLevel.level, newLevel.level);
    msgs.push(...routeMsgs.msgs);
  }

  return { msgs };
}

/**
 * 增加公司经验并检查公司升级
 * @param {object} state  游戏状态
 * @param {number} amount 经验值
 * @returns {{ msgs: Array }}
 */
export function gainCompanyExperience(state, amount) {
  const msgs = [];
  const oldLevel = getCompanyLevel(state.companyExperience || 0);
  state.companyExperience = (state.companyExperience || 0) + Math.max(0, amount || 0);
  const newLevel = getCompanyLevel(state.companyExperience || 0);
  state.companyLevel = newLevel.level;

  if (newLevel.level > oldLevel.level) {
    const nextLevel = COMPANY_LEVELS.find(function (l) { return l.level === newLevel.level + 1; });
    msgs.push({
      text: '🏢 公司升级！「' + (state.companyName || '星际信使贸易公司') + '」晋升为 ' + newLevel.icon + ' ' + newLevel.title + '（Lv.' + newLevel.level + '）！',
      type: 'upgrade',
    });
    if (nextLevel) {
      const need = Math.max(0, nextLevel.expRequired - (state.companyExperience || 0));
      msgs.push({
        text: '📈 距离下一公司等级还需 ' + need + ' 经验。',
        type: 'info',
      });
    }
  }

  return { msgs };
}

/**
 * 应用等级奖励
 * @param {object} state  游戏状态
 * @param {number} level  新等级
 * @returns {{ msgs: Array }}
 */
export function applyLevelPerk(state, level) {
  const msgs = [];

  switch (level) {
    case 3:  // 卖出价格 +3%
      state.techSellBonus = (state.techSellBonus || 0) + 0.03;
      msgs.push({ text: '✨ 等级奖励：卖出价格 +3%', type: 'info' });
      break;
    case 4:  // 货舱 +5
      {
        const ship4 = Fleet.getActiveShip(state);
        if (ship4) ship4.maxCargo = Math.min(ship4.maxCargoCap, ship4.maxCargo + 5);
        Fleet.syncStateFromShip(state);
      }
      msgs.push({ text: '✨ 等级奖励：当前船只货舱容量 +5', type: 'info' });
      break;
    case 5:  // 买入价格 -3%
      state.techBuyDiscount = (state.techBuyDiscount || 0) + 0.03;
      msgs.push({ text: '✨ 等级奖励：买入价格 -3%', type: 'info' });
      break;
    case 6:  // 燃料效率 +10%
      {
        const ship6 = Fleet.getActiveShip(state);
        if (ship6) ship6.fuelEff = Math.max(ship6.minFuelEff, ship6.fuelEff * 0.9);
        Fleet.syncStateFromShip(state);
      }
      msgs.push({ text: '✨ 等级奖励：当前船只燃料效率 +10%', type: 'info' });
      break;
    case 7:  // 所有派系好感 +10
      if (state.factionRelations) {
        Object.keys(state.factionRelations).forEach(function (fid) {
          state.factionRelations[fid] = Math.min(100, state.factionRelations[fid] + 10);
        });
      }
      msgs.push({ text: '✨ 等级奖励：所有派系好感 +10', type: 'info' });
      break;
    case 8:  // 货舱 +10
      {
        const ship8 = Fleet.getActiveShip(state);
        if (ship8) ship8.maxCargo = Math.min(ship8.maxCargoCap, ship8.maxCargo + 10);
        Fleet.syncStateFromShip(state);
      }
      msgs.push({ text: '✨ 等级奖励：当前船只货舱容量 +10', type: 'info' });
      break;
    case 9:  // 卖出价格 +5%
      state.techSellBonus = (state.techSellBonus || 0) + 0.05;
      msgs.push({ text: '✨ 等级奖励：卖出价格 +5%', type: 'info' });
      break;
    case 10: // 全属性提升
      {
        const ship10 = Fleet.getActiveShip(state);
        if (ship10) {
          ship10.maxCargo = Math.min(ship10.maxCargoCap, ship10.maxCargo + 10);
          ship10.maxFuel  = Math.min(ship10.maxFuelCap, ship10.maxFuel + 20);
        }
        Fleet.syncStateFromShip(state);
      }
      state.techBuyDiscount = (state.techBuyDiscount || 0) + 0.05;
      state.techSellBonus = (state.techSellBonus || 0) + 0.05;
      msgs.push({ text: '✨ 银河商业帝皇加冕！当前船只全属性大幅提升！', type: 'upgrade' });
      break;
  }

  return { msgs };
}

/**
 * 升级时通知玩家新解锁的星球/航线
 * @param {object} state   游戏状态（未使用，保留以兼容签名）
 * @param {number} oldLvl  旧等级
 * @param {number} newLvl  新等级
 * @returns {{ msgs: Array }}
 */
export function announceNewRoutes(state, oldLvl, newLvl) {
  const msgs = [];
  const newPlanets = SYSTEMS.filter(function (s) {
    const ml = s.minLevel || 1;
    return ml > oldLvl && ml <= newLvl;
  });
  if (newPlanets.length > 0) {
    const names = newPlanets.slice(0, 5).map(function (s) { return s.name; }).join('、');
    const extra = newPlanets.length > 5 ? ' 等 ' + newPlanets.length + ' 颗星球' : '';
    msgs.push({
      text: '🗺️ 新航线开放！解锁了 ' + names + extra + '！',
      type: 'info',
    });
  }
  return { msgs };
}
