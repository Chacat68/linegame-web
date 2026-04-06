// js/systems/fleet/ShipSpecialization.js — 舰船专精与战术协议

export const SHIP_MASTERY_TRACKS = [
  { id: 'trade', name: '贸易专精', shortName: '贸易', icon: '💹' },
  { id: 'navigation', name: '航行专精', shortName: '航行', icon: '🛰️' },
  { id: 'exploration', name: '探索专精', shortName: '探索', icon: '🧭' },
];

export const SHIP_MASTERY_THRESHOLDS = [0, 25, 75, 160, 300];

export const SHIP_DOCTRINES = {
  trade: {
    id: 'trade',
    name: '贸易协议',
    shortName: '贸易',
    icon: '💹',
    protocol: {
      name: '套利窗口',
      icon: '📈',
      trigger: 'trade',
      cooldownDays: 4,
      baseCharges: 2,
      desc: '接下来数次交易获得更强的买入折扣、卖出溢价与临时货舱缓存。',
    },
  },
  navigation: {
    id: 'navigation',
    name: '航行协议',
    shortName: '航行',
    icon: '🛰️',
    protocol: {
      name: '曲速预热',
      icon: '🌀',
      trigger: 'travel',
      cooldownDays: 4,
      baseCharges: 2,
      desc: '接下来数次航行大幅降低燃耗，并显著压低事件与走私检查风险。',
    },
  },
  exploration: {
    id: 'exploration',
    name: '探索协议',
    shortName: '探索',
    icon: '🧭',
    protocol: {
      name: '量子测绘',
      icon: '🔭',
      trigger: 'exploration',
      cooldownDays: 4,
      baseCharges: 2,
      desc: '接下来数次探索行动获得免费深度扫描、着陆折扣与额外发现收益。',
    },
  },
};

const DEFAULT_DOCTRINES_BY_TYPE = {
  shuttle: 'navigation',
  freighter: 'trade',
  clipper: 'exploration',
  galleon: 'trade',
};

export function getMasteryTrack(trackId) {
  return SHIP_MASTERY_TRACKS.find(function (track) { return track.id === trackId; }) || SHIP_MASTERY_TRACKS[0];
}

export function getDoctrine(doctrineId) {
  return SHIP_DOCTRINES[doctrineId] || SHIP_DOCTRINES.trade;
}

export function getDefaultDoctrine(shipTypeId) {
  return DEFAULT_DOCTRINES_BY_TYPE[shipTypeId] || 'trade';
}

export function createShipSpecializationState(shipTypeId) {
  return {
    doctrine: getDefaultDoctrine(shipTypeId),
    xp: {
      trade: 0,
      navigation: 0,
      exploration: 0,
    },
    activeProtocol: null,
    protocolCooldowns: {
      trade: 0,
      navigation: 0,
      exploration: 0,
    },
  };
}

export function ensureShipSpecializationState(ship, shipType) {
  if (!ship || typeof ship !== 'object') return null;

  if (!ship.specialization || typeof ship.specialization !== 'object' || Array.isArray(ship.specialization)) {
    ship.specialization = createShipSpecializationState(shipType ? shipType.id : ship.typeId);
  }

  var specialization = ship.specialization;
  if (!specialization.doctrine || !SHIP_DOCTRINES[specialization.doctrine]) {
    specialization.doctrine = getDefaultDoctrine(shipType ? shipType.id : ship.typeId);
  }

  if (!specialization.xp || typeof specialization.xp !== 'object' || Array.isArray(specialization.xp)) {
    specialization.xp = { trade: 0, navigation: 0, exploration: 0 };
  }
  SHIP_MASTERY_TRACKS.forEach(function (track) {
    if (!Number.isFinite(specialization.xp[track.id])) specialization.xp[track.id] = 0;
  });

  if (!specialization.protocolCooldowns || typeof specialization.protocolCooldowns !== 'object' || Array.isArray(specialization.protocolCooldowns)) {
    specialization.protocolCooldowns = { trade: 0, navigation: 0, exploration: 0 };
  }
  SHIP_MASTERY_TRACKS.forEach(function (track) {
    if (!Number.isFinite(specialization.protocolCooldowns[track.id])) specialization.protocolCooldowns[track.id] = 0;
  });

  if (!specialization.activeProtocol || typeof specialization.activeProtocol !== 'object' || Array.isArray(specialization.activeProtocol)) {
    specialization.activeProtocol = null;
  } else if (!specialization.activeProtocol.doctrineId || !SHIP_DOCTRINES[specialization.activeProtocol.doctrineId] || (specialization.activeProtocol.remainingCharges || 0) <= 0) {
    specialization.activeProtocol = null;
  }

  return specialization;
}

export function getMasteryLevel(xp) {
  var safeXp = Math.max(0, xp || 0);
  var level = 0;
  SHIP_MASTERY_THRESHOLDS.forEach(function (threshold, index) {
    if (safeXp >= threshold) level = index;
  });
  return level;
}

export function getNextMasteryThreshold(level) {
  return level + 1 < SHIP_MASTERY_THRESHOLDS.length
    ? SHIP_MASTERY_THRESHOLDS[level + 1]
    : null;
}

export function createDoctrineProtocol(doctrineId, level, currentDay) {
  var doctrine = getDoctrine(doctrineId);
  var baseCharges = doctrine.protocol.baseCharges || 1;
  return {
    doctrineId: doctrineId,
    remainingCharges: baseCharges + (level >= 3 ? 1 : 0),
    activatedDay: currentDay || 1,
  };
}

export function getShipSpecializationProfile(ship, currentDay) {
  var specialization = ensureShipSpecializationState(ship);
  var day = currentDay || 1;
  var levels = {};
  var nextThresholds = {};
  var progress = {};

  SHIP_MASTERY_TRACKS.forEach(function (track) {
    var xp = specialization.xp[track.id] || 0;
    var level = getMasteryLevel(xp);
    var nextThreshold = getNextMasteryThreshold(level);
    var currentThreshold = SHIP_MASTERY_THRESHOLDS[level] || 0;
    levels[track.id] = level;
    nextThresholds[track.id] = nextThreshold;
    progress[track.id] = nextThreshold == null
      ? 1
      : Math.max(0, Math.min(1, (xp - currentThreshold) / Math.max(1, nextThreshold - currentThreshold)));
  });

  var effects = _buildPassiveEffects(levels);
  var activeProtocol = specialization.activeProtocol && specialization.activeProtocol.remainingCharges > 0
    ? Object.assign({}, specialization.activeProtocol)
    : null;
  if (activeProtocol) {
    _applyProtocolEffects(effects, activeProtocol.doctrineId);
  }

  var doctrine = getDoctrine(specialization.doctrine);
  return {
    doctrineId: doctrine.id,
    doctrine: doctrine,
    levels: levels,
    xp: Object.assign({}, specialization.xp),
    nextThresholds: nextThresholds,
    progress: progress,
    activeProtocol: activeProtocol
      ? Object.assign({}, doctrine.protocol, activeProtocol)
      : null,
    cooldowns: _buildCooldownState(specialization, day),
    effects: effects,
  };
}

function _buildCooldownState(specialization, currentDay) {
  var cooldowns = {};
  SHIP_MASTERY_TRACKS.forEach(function (track) {
    var readyDay = specialization.protocolCooldowns[track.id] || 0;
    cooldowns[track.id] = Math.max(0, readyDay - currentDay);
  });
  return cooldowns;
}

function _buildPassiveEffects(levels) {
  var tradeLevel = levels.trade || 0;
  var navigationLevel = levels.navigation || 0;
  var explorationLevel = levels.exploration || 0;

  return {
    cargoBonus: tradeLevel * 4,
    buyDiscount: tradeLevel * 0.01,
    sellBonus: tradeLevel * 0.015,
    fuelEffMultiplier: Math.max(0.78, 1 - navigationLevel * 0.05),
    eventChanceMultiplier: Math.max(0.55, 1 - navigationLevel * 0.08),
    smugglingCheckMultiplier: Math.max(0.55, 1 - navigationLevel * 0.09),
    smugglingFineMultiplier: Math.max(0.60, 1 - navigationLevel * 0.07),
    smugglingHullMultiplier: Math.max(0.55, 1 - navigationLevel * 0.10),
    scanFuelDiscount: Math.min(0.60, explorationLevel * 0.12),
    landingFeeDiscount: Math.min(0.40, explorationLevel * 0.08),
    poiRewardMultiplier: 1 + explorationLevel * 0.08,
    forceDeepScan: false,
  };
}

function _applyProtocolEffects(effects, doctrineId) {
  if (doctrineId === 'trade') {
    effects.cargoBonus += 10;
    effects.buyDiscount += 0.05;
    effects.sellBonus += 0.06;
    return;
  }

  if (doctrineId === 'navigation') {
    effects.fuelEffMultiplier = Math.max(0.40, effects.fuelEffMultiplier * 0.72);
    effects.eventChanceMultiplier = Math.max(0.25, effects.eventChanceMultiplier * 0.45);
    effects.smugglingCheckMultiplier = Math.max(0.25, effects.smugglingCheckMultiplier * 0.45);
    effects.smugglingFineMultiplier = Math.max(0.25, effects.smugglingFineMultiplier * 0.60);
    effects.smugglingHullMultiplier = Math.max(0.20, effects.smugglingHullMultiplier * 0.50);
    return;
  }

  if (doctrineId === 'exploration') {
    effects.scanFuelDiscount = Math.min(1, effects.scanFuelDiscount + 0.60);
    effects.landingFeeDiscount = Math.min(0.75, effects.landingFeeDiscount + 0.35);
    effects.poiRewardMultiplier += 0.50;
    effects.forceDeepScan = true;
  }
}