// js/systems/progression/ProgressionSystem.js — 等级进阶系统
// 依赖：data/playerLevels.js, data/systems.js, systems/fleet/FleetSystem.js
// 导出：gainExperience, gainCompanyExperience, applyLevelPerk, announceNewRoutes
//
// 从 GameManager 中提取的纯逻辑模块。
// 所有函数均通过参数接收 state，返回 { msgs } 格式。

import * as PlayerLevels from '../../data/playerLevels.js';
import { FACTION_CONFIG, PROGRESSION_CONFIG } from '../../data/constants.js';
import { SYSTEMS, GALAXIES } from '../../data/systems.js';
import { getCompanyUnlocksAtLevel } from '../../data/companyAccess.js';
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
  const experienceLevelBefore = getLevel(state.experience || 0);
  // playerLevel 记录的是已经实际结算过奖励的等级；旧版本直接加经验时它可能落后。
  const settledLevelBefore = Math.min(
    experienceLevelBefore.level,
    Math.max(1, Number(state.playerLevel) || experienceLevelBefore.level)
  );
  state.experience = (state.experience || 0) + Math.max(0, Number(amount) || 0);
  const newLevel = getLevel(state.experience);
  state.playerLevel = newLevel.level;

  if (newLevel.level > settledLevelBefore) {
    msgs.push({
      text: '🎉 升级！你现在是 ' + newLevel.icon + ' ' + newLevel.title + ' (Lv.' + newLevel.level + ')',
      type: 'upgrade',
    });
    // 一次奖励可能跨越多个等级，沿途奖励必须逐级结算。
    for (let level = settledLevelBefore + 1; level <= newLevel.level; level += 1) {
      const perkMsgs = applyLevelPerk(state, level);
      msgs.push(...perkMsgs.msgs);
    }
    // 提示新解锁的星球
    const routeMsgs = announceNewRoutes(state, settledLevelBefore, newLevel.level);
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
    const unlockSummary = _formatCompanyUnlockSummary(oldLevel.level, newLevel.level);
    if (unlockSummary) {
      msgs.push({
        text: '🧭 新公司权限开放：' + unlockSummary + '。',
        type: 'upgrade',
      });
    }
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

function _formatCompanyUnlockSummary(oldLevel, newLevel) {
  const summaries = [];
  for (let level = Math.max(1, oldLevel + 1); level <= newLevel; level += 1) {
    const milestone = getCompanyUnlocksAtLevel(level);
    if (!milestone || !milestone.items || milestone.items.length === 0) continue;
    summaries.push('Lv.' + milestone.level + ' ' + milestone.title + '：' + milestone.items.join('、'));
  }
  return summaries.join('；');
}

/**
 * 应用等级奖励
 * @param {object} state  游戏状态
 * @param {number} level  新等级
 * @returns {{ msgs: Array }}
 */
export function applyLevelPerk(state, level) {
  const msgs = [];
  const perk = PROGRESSION_CONFIG.levelPerks[level];

  switch (level) {
    case 3:  // 卖出价格 +3%
      state.techSellBonus = (state.techSellBonus || 0) + perk.value;
      msgs.push({ text: perk.message, type: 'info' });
      break;
    case 4:  // 货舱 +5
      if (_getActiveShipSafely(state)) Fleet.syncStateFromShip(state);
      msgs.push({ text: perk.message, type: 'info' });
      break;
    case 5:  // 买入价格 -3%
      state.techBuyDiscount = (state.techBuyDiscount || 0) + perk.value;
      msgs.push({ text: perk.message, type: 'info' });
      break;
    case 6:  // 燃料效率 +10%
      if (_getActiveShipSafely(state)) Fleet.syncStateFromShip(state);
      msgs.push({ text: perk.message, type: 'info' });
      break;
    case 7:  // 所有派系好感 +10
      if (state.factionRelations) {
        Object.keys(state.factionRelations).forEach(function (fid) {
          state.factionRelations[fid] = Math.min(FACTION_CONFIG.relations.max, state.factionRelations[fid] + perk.value);
        });
      }
      msgs.push({ text: perk.message, type: 'info' });
      break;
    case 8:  // 货舱 +10
      if (_getActiveShipSafely(state)) Fleet.syncStateFromShip(state);
      msgs.push({ text: perk.message, type: 'info' });
      break;
    case 9:  // 卖出价格 +5%
      state.techSellBonus = (state.techSellBonus || 0) + perk.value;
      msgs.push({ text: perk.message, type: 'info' });
      break;
    case 10: // 全属性提升
      if (_getActiveShipSafely(state)) Fleet.syncStateFromShip(state);
      state.techBuyDiscount = (state.techBuyDiscount || 0) + perk.buyDiscount;
      state.techSellBonus = (state.techSellBonus || 0) + perk.sellBonus;
      msgs.push({ text: perk.message, type: 'upgrade' });
      break;
  }

  return { msgs };
}

function _getActiveShipSafely(state) {
  if (!state || !Array.isArray(state.fleet) || state.fleet.length === 0) return null;
  return Fleet.getActiveShip(state);
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
  const previewLimit = PROGRESSION_CONFIG.routeAnnouncementPreviewLimit || 5;
  const newPlanets = SYSTEMS.filter(function (s) {
    const ml = s.minLevel || 1;
    return ml > oldLvl && ml <= newLvl;
  });
  if (newPlanets.length > 0) {
    const names = newPlanets.slice(0, previewLimit).map(function (s) { return s.name; }).join('、');
    const extra = newPlanets.length > previewLimit ? ' 等 ' + newPlanets.length + ' 颗星球' : '';
    msgs.push({
      text: '🗺️ 新航线开放！解锁了 ' + names + extra + '！',
      type: 'info',
    });
  }

  const newGalaxies = GALAXIES.filter(function (galaxy) {
    const requiredLevel = galaxy.minLevel || 1;
    return !galaxy.unlocked && requiredLevel > oldLvl && requiredLevel <= newLvl;
  });
  if (newGalaxies.length > 0) {
    msgs.push({
      text: '🌌 新星系开放！现可切换至 ' + newGalaxies.map(function (galaxy) {
        return galaxy.icon + ' ' + galaxy.name;
      }).join('、') + '。',
      type: 'upgrade',
    });
  }

  return { msgs };
}
