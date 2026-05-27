// js/data/companyAccess.js — 公司等级功能准入规则
// 依赖：data/playerLevels.js
// 导出：COMPANY_FEATURE_REQUIREMENTS, getCompanyLevelValue,
//       getCompanyFeatureRequirement, getCompanyAccessState,
//       meetsCompanyLevel, getFleetSlotCompanyRequirement,
//       getMaxTradeStationLevel, getTradeStationLevelRequirement

import { COMPANY_LEVELS, getCompanyLevel } from './playerLevels.js';

export const COMPANY_FEATURE_REQUIREMENTS = {
  capitalLocal: 2,
  tradeInvestment: 2,
  stocks: 3,
  tradeStationBuild: 4,
  tradeStationStrategy: 4,
  tradeStationManager: 5,
  futures: 5,
  tradeStationBatchOps: 6,
  operationsNetwork: 6,
};

export const COMPANY_UNLOCK_MILESTONES = [
  {
    level: 2,
    title: '资本工具',
    items: ['贷款与保险', '贸易站财务投资', '舰队席位 II'],
  },
  {
    level: 3,
    title: '证券交易',
    items: ['股票交易', '舰队席位 III'],
  },
  {
    level: 4,
    title: '贸易站建设',
    items: ['本地建站', '站点策略'],
  },
  {
    level: 5,
    title: '专业化运营',
    items: ['贸易站经理', '期货交易', '贸易站 Lv.2', '舰队席位 IV'],
  },
  {
    level: 6,
    title: '商网指挥',
    items: ['商网总览', '批量投资/升级/人事', '贸易站 Lv.3'],
  },
  {
    level: 7,
    title: '舰队扩编',
    items: ['舰队席位 V'],
  },
  {
    level: 8,
    title: '高级站点',
    items: ['贸易站 Lv.4'],
  },
  {
    level: 9,
    title: '满编经营',
    items: ['舰队席位 VI', '贸易站 Lv.5'],
  },
];

const FLEET_SLOT_REQUIREMENTS = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 7,
  6: 9,
};

const TRADE_STATION_LEVEL_REQUIREMENTS = {
  1: 4,
  2: 5,
  3: 6,
  4: 8,
  5: 9,
};

const TRADE_STATION_CAPACITY_BY_COMPANY_LEVEL = {
  1: 0,
  2: 0,
  3: 0,
  4: 2,
  5: 4,
  6: 8,
  7: 10,
  8: 12,
  9: 16,
  10: 20,
};

const COMPANY_FEATURE_LABELS = {
  capitalLocal: '贷款与保险',
  tradeInvestment: '站点投资',
  stocks: '股票交易',
  tradeStationBuild: '贸易站建设',
  tradeStationStrategy: '站点策略',
  tradeStationManager: '经理派驻',
  futures: '期货交易',
  tradeStationBatchOps: '批量指令',
  operationsNetwork: '商网总览',
};

export function getCompanyLevelValue(state) {
  const safeState = state || {};
  const explicitLevel = Number.isFinite(safeState.companyLevel)
    ? Math.max(1, Math.floor(safeState.companyLevel))
    : 1;
  const expLevel = getCompanyLevel(safeState.companyExperience || 0).level || 1;
  return Math.max(explicitLevel, expLevel);
}

export function getCompanyFeatureRequirement(featureId) {
  return COMPANY_FEATURE_REQUIREMENTS[featureId] || 1;
}

export function getCompanyUnlocksAtLevel(level) {
  const normalizedLevel = Math.max(1, Math.floor(level || 1));
  const milestone = COMPANY_UNLOCK_MILESTONES.find(function (entry) {
    return entry.level === normalizedLevel;
  });
  return milestone
    ? {
        level: milestone.level,
        title: milestone.title,
        items: milestone.items.slice(),
      }
    : null;
}

export function getCompanyUnlockRoadmap(state, limit) {
  const currentLevel = getCompanyLevelValue(state);
  const maxItems = Math.max(1, Math.floor(limit || 2));
  return COMPANY_UNLOCK_MILESTONES.filter(function (entry) {
    return entry.level >= currentLevel;
  }).slice(0, maxItems).map(function (entry) {
    return {
      level: entry.level,
      title: entry.title,
      items: entry.items.slice(),
      unlocked: currentLevel >= entry.level,
      current: currentLevel === entry.level,
    };
  });
}

export function getMaxFleetSlots(state) {
  const companyLevel = getCompanyLevelValue(state);
  let maxSlots = 1;
  Object.keys(FLEET_SLOT_REQUIREMENTS).forEach(function (slotText) {
    const slotId = Number(slotText);
    if (companyLevel >= FLEET_SLOT_REQUIREMENTS[slotId]) {
      maxSlots = Math.max(maxSlots, slotId);
    }
  });
  return maxSlots;
}

export function getMaxTradeStations(state) {
  const companyLevel = Math.min(10, getCompanyLevelValue(state));
  let maxStations = 0;
  Object.keys(TRADE_STATION_CAPACITY_BY_COMPANY_LEVEL).forEach(function (levelText) {
    const level = Number(levelText);
    if (companyLevel >= level) {
      maxStations = Math.max(maxStations, TRADE_STATION_CAPACITY_BY_COMPANY_LEVEL[level]);
    }
  });
  return maxStations;
}

export function getTradeStationCapacityState(state) {
  const stations = state && state.tradeStations && typeof state.tradeStations === 'object'
    ? state.tradeStations
    : {};
  const used = Object.keys(stations).length;
  const max = getMaxTradeStations(state);
  return {
    used: used,
    max: max,
    available: Math.max(0, max - used),
    full: max > 0 && used >= max,
    unlocked: max > 0,
    label: max > 0 ? (used + '/' + max + ' 站') : '未开放',
  };
}

function _getCompanyLevelDefinition(level) {
  const normalizedLevel = Math.max(1, Math.floor(level || 1));
  return COMPANY_LEVELS.find(function (entry) {
    return entry.level === normalizedLevel;
  }) || COMPANY_LEVELS[0];
}

function _getUnlockedCompanyFeatures(state) {
  return Object.keys(COMPANY_FEATURE_REQUIREMENTS).filter(function (featureId) {
    return getCompanyAccessState(state, featureId).unlocked;
  }).map(function (featureId) {
    return {
      id: featureId,
      label: COMPANY_FEATURE_LABELS[featureId] || featureId,
      requiredLevel: getCompanyFeatureRequirement(featureId),
    };
  }).sort(function (left, right) {
    return left.requiredLevel - right.requiredLevel;
  });
}

export function getCompanyPrivilegeSummary(state) {
  const safeState = state || {};
  const currentLevel = getCompanyLevelValue(safeState);
  const currentDef = _getCompanyLevelDefinition(currentLevel);
  const nextDef = COMPANY_LEVELS.find(function (entry) {
    return entry.level > currentLevel;
  }) || null;
  const companyExperience = Math.max(0, Number(safeState.companyExperience) || 0);
  const expIntoLevel = Math.max(0, companyExperience - (currentDef.expRequired || 0));
  const expSpan = nextDef ? Math.max(1, (nextDef.expRequired || 0) - (currentDef.expRequired || 0)) : 1;
  const expToNext = nextDef ? Math.max(0, (nextDef.expRequired || 0) - companyExperience) : 0;
  const stationCapacity = getTradeStationCapacityState(safeState);
  const maxStationLevel = getMaxTradeStationLevel(safeState);
  const fleetSlotsUnlocked = getMaxFleetSlots(safeState);
  const nextMilestone = COMPANY_UNLOCK_MILESTONES.find(function (entry) {
    return entry.level > currentLevel;
  }) || null;
  const currentMilestone = getCompanyUnlocksAtLevel(currentLevel);

  return {
    level: currentLevel,
    title: currentDef.title,
    icon: currentDef.icon,
    companyExperience: companyExperience,
    expIntoLevel: expIntoLevel,
    expSpan: expSpan,
    expToNext: expToNext,
    progressRatio: nextDef ? Math.max(0, Math.min(1, expIntoLevel / expSpan)) : 1,
    nextLevel: nextDef ? {
      level: nextDef.level,
      title: nextDef.title,
      icon: nextDef.icon,
      expRequired: nextDef.expRequired,
    } : null,
    currentMilestone: currentMilestone,
    nextMilestone: nextMilestone ? {
      level: nextMilestone.level,
      title: nextMilestone.title,
      items: nextMilestone.items.slice(),
    } : null,
    unlockedFeatures: _getUnlockedCompanyFeatures(safeState),
    caps: {
      fleetSlots: {
        used: Math.max(1, Number(safeState.fleetSlots) || 1),
        max: fleetSlotsUnlocked,
      },
      tradeStations: stationCapacity,
      tradeStationLevel: {
        max: maxStationLevel,
        label: maxStationLevel > 0 ? ('Lv.' + maxStationLevel) : '未开放',
      },
    },
  };
}

export function getCompanyAccessState(state, featureId) {
  const currentLevel = getCompanyLevelValue(state);
  const requiredLevel = getCompanyFeatureRequirement(featureId);
  return {
    unlocked: currentLevel >= requiredLevel,
    currentLevel: currentLevel,
    requiredLevel: requiredLevel,
    lockLabel: '公司 Lv.' + requiredLevel + ' 解锁',
  };
}

export function meetsCompanyLevel(state, featureId) {
  return getCompanyAccessState(state, featureId).unlocked;
}

export function getFleetSlotCompanyRequirement(slotId) {
  const normalizedSlotId = Math.max(1, Math.floor(slotId || 1));
  return FLEET_SLOT_REQUIREMENTS[normalizedSlotId] || FLEET_SLOT_REQUIREMENTS[6];
}

export function getTradeStationLevelRequirement(stationLevel) {
  const normalizedLevel = Math.max(1, Math.floor(stationLevel || 1));
  return TRADE_STATION_LEVEL_REQUIREMENTS[normalizedLevel] || Infinity;
}

export function getMaxTradeStationLevel(state) {
  const companyLevel = getCompanyLevelValue(state);
  let maxLevel = 0;
  Object.keys(TRADE_STATION_LEVEL_REQUIREMENTS).forEach(function (levelText) {
    const stationLevel = Number(levelText);
    if (companyLevel >= TRADE_STATION_LEVEL_REQUIREMENTS[stationLevel]) {
      maxLevel = Math.max(maxLevel, stationLevel);
    }
  });
  return maxLevel;
}
