// js/data/playerLevels.js — 玩家等级定义（群星参考）
// 依赖：无
// 导出：PLAYER_LEVELS, REPUTATION_RANKS, getLevel, getRepRank, expForLevel

/**
 * 玩家等级（基于经验值）
 */
export const PLAYER_LEVELS = [
  { level: 1,  title: '见习商人',   expRequired: 0,     icon: '🌱', perk: null },
  { level: 2,  title: '学徒商人',   expRequired: 100,   icon: '🌿', perk: '解锁任务系统' },
  { level: 3,  title: '旅行商人',   expRequired: 300,   icon: '🚢', perk: '卖出价格 +3%' },
  { level: 4,  title: '星际行商',   expRequired: 600,   icon: '⭐', perk: '货舱 +5' },
  { level: 5,  title: '贸易精英',   expRequired: 1000,  icon: '💫', perk: '买入价格 -3%' },
  { level: 6,  title: '商业专家',   expRequired: 1600,  icon: '🔥', perk: '燃料效率 +10%' },
  { level: 7,  title: '行会长老',   expRequired: 2400,  icon: '👑', perk: '所有派系好感 +10' },
  { level: 8,  title: '商业寡头',   expRequired: 3500,  icon: '🏆', perk: '货舱 +10' },
  { level: 9,  title: '星际巨贾',   expRequired: 5000,  icon: '💎', perk: '卖出价格 +5%' },
  { level: 10, title: '银河商业帝皇', expRequired: 7500, icon: '🌟', perk: '全属性提升' },
];

/**
 * 声望等级（基于声望点数）
 */
export const REPUTATION_RANKS = [
  { id: 'unknown', name: '无名小卒', min: 0,    max: 50,   icon: '❓', discount: 0 },
  { id: 'known',   name: '小有名气', min: 50,   max: 150,  icon: '📢', discount: 0.02 },
  { id: 'famous',  name: '声名远扬', min: 150,  max: 400,  icon: '⭐', discount: 0.05 },
  { id: 'elite',   name: '商业精英', min: 400,  max: 800,  icon: '🌟', discount: 0.08 },
  { id: 'legend',  name: '银河传奇', min: 800,  max: Infinity, icon: '👑', discount: 0.12 },
];

/**
 * 计算等级所需总经验
 */
export function expForLevel(level) {
  const def = PLAYER_LEVELS.find(function (l) { return l.level === level; });
  return def ? def.expRequired : Infinity;
}

/**
 * 根据经验值获取当前等级定义
 */
export function getLevel(exp) {
  let current = PLAYER_LEVELS[0];
  for (let i = PLAYER_LEVELS.length - 1; i >= 0; i--) {
    if (exp >= PLAYER_LEVELS[i].expRequired) {
      current = PLAYER_LEVELS[i];
      break;
    }
  }
  return current;
}

/**
 * 根据声望获取声望等级
 */
export function getRepRank(reputation) {
  for (let i = REPUTATION_RANKS.length - 1; i >= 0; i--) {
    if (reputation >= REPUTATION_RANKS[i].min) {
      return REPUTATION_RANKS[i];
    }
  }
  return REPUTATION_RANKS[0];
}
