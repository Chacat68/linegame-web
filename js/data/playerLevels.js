// js/data/playerLevels.js — 玩家等级定义（群星参考）
// 依赖：无
// 导出：PLAYER_LEVELS, COMPANY_LEVELS, REPUTATION_RANKS, getLevel, getCompanyLevel, getRepRank, expForLevel, companyExpForLevel

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
 * 公司等级（基于公司经验）
 */
export const COMPANY_LEVELS = [
  { level: 1,  title: '新创企业',   expRequired: 0,    icon: '🏢' },
  { level: 2,  title: '地方商号',   expRequired: 120,  icon: '📦' },
  { level: 3,  title: '区域贸易商', expRequired: 300,  icon: '🚚' },
  { level: 4,  title: '星港商会',   expRequired: 650,  icon: '🛰️' },
  { level: 5,  title: '星际企业',   expRequired: 1100, icon: '🌌' },
  { level: 6,  title: '跨域集团',   expRequired: 1700, icon: '🏛️' },
  { level: 7,  title: '银河财团',   expRequired: 2500, icon: '💠' },
  { level: 8,  title: '贸易巨擘',   expRequired: 3600, icon: '👑' },
  { level: 9,  title: '星海寡头',   expRequired: 5000, icon: '💎' },
  { level: 10, title: '银河企业帝国', expRequired: 7000, icon: '🌟' },
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
 * 计算公司等级所需总经验
 */
export function companyExpForLevel(level) {
  const def = COMPANY_LEVELS.find(function (l) { return l.level === level; });
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
 * 根据公司经验获取当前公司等级定义
 */
export function getCompanyLevel(exp) {
  let current = COMPANY_LEVELS[0];
  for (let i = COMPANY_LEVELS.length - 1; i >= 0; i--) {
    if (exp >= COMPANY_LEVELS[i].expRequired) {
      current = COMPANY_LEVELS[i];
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
