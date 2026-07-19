// js/systems/fleet/CrewSystem.js — 船员系统：成长、专长与人才市场
// 依赖：data/crew.js, data/systems.js
// 导出：ensureState, ensureShip, getDefaultCrewCapacity, getCrewMarket,
//       getRecruitableCrew, recruitCrew, assignCrewToShip, unassignCrewFromShip,
//       dismissCrew, getCrewById, getShipCrew, getReserveCrew, getShipEffects,
//       getCrewEffectProfile, payDailyWages

import {
  CREW_MARKET_CONFIG,
  CREW_NAME_POOLS,
  CREW_ROLES,
  getCrewRoleDef,
  getCrewRoleLabel,
  getCrewSpecialtyDef,
} from '../../data/crew.js';
import { findSystem } from '../../data/systems.js';

const LEGACY_TEMPLATE_MAP = {
  ace_pilot: {
    role: 'pilot',
    specialtyId: 'route_savant',
    name: '凌岚',
    emoji: '🧭',
    title: '资深领航员',
    level: 4,
    hireCost: 420,
    wage: 95,
    legacyEffect: { fuelEffMultiplier: 0.9 },
  },
  dock_engineer: {
    role: 'engineer',
    specialtyId: 'damage_control',
    name: '霍原',
    emoji: '🔧',
    title: '轮机工程师',
    level: 3,
    hireCost: 460,
    wage: 110,
    legacyEffect: { autoRepair: 4 },
  },
  cargo_master: {
    role: 'quartermaster',
    specialtyId: 'container_architect',
    name: '宋柯',
    emoji: '📦',
    title: '货运主管',
    level: 3,
    hireCost: 500,
    wage: 120,
    legacyEffect: { cargo: 8 },
  },
  market_broker: {
    role: 'broker',
    specialtyId: 'market_maker',
    name: '艾尔莎',
    emoji: '💼',
    title: '市场经纪人',
    level: 3,
    hireCost: 560,
    wage: 135,
    legacyEffect: { buyDiscount: 0.02, sellBonus: 0.02 },
  },
  smuggler_broker: {
    role: 'broker',
    specialtyId: 'gray_channel',
    name: '维诺',
    emoji: '🕶',
    title: '灰市联络人',
    level: 3,
    hireCost: 680,
    wage: 150,
    legacyEffect: { sellBonus: 0.03 },
  },
  salvage_engineer: {
    role: 'engineer',
    specialtyId: 'salvage_rigger',
    name: '阿沐',
    emoji: '🛠',
    title: '损管工程师',
    level: 3,
    hireCost: 540,
    wage: 125,
    legacyEffect: { autoRepair: 2, cargo: 4 },
  },
  route_analyst: {
    role: 'pilot',
    specialtyId: 'route_savant',
    name: '白栖',
    emoji: '📡',
    title: '航线分析员',
    level: 2,
    hireCost: 520,
    wage: 118,
    legacyEffect: { fuelEffMultiplier: 0.94, buyDiscount: 0.01 },
  },
  luxury_agent: {
    role: 'broker',
    specialtyId: 'luxury_curator',
    name: '芙蕾雅',
    emoji: '✨',
    title: '奢侈品代理',
    level: 3,
    hireCost: 720,
    wage: 160,
    legacyEffect: { sellBonus: 0.04 },
  },
};

const MARKET_TYPE_PROFILES = {
  agricultural: {
    themeLabel: '农产与补给港',
    offerCount: 3,
    slotRoles: ['quartermaster', 'pilot', 'broker'],
    slotSpecialties: ['container_architect', 'convoy_scout', 'cold_chain_keeper'],
    preferredSpecialties: ['container_architect', 'convoy_scout', 'cold_chain_keeper'],
    talentRates: { trained: 0.42, elite: 0.08 },
  },
  technology: {
    themeLabel: '技术人才港',
    offerCount: 4,
    slotRoles: ['engineer', 'pilot', 'broker', 'engineer'],
    slotSpecialties: ['reactor_tuner', 'route_savant', 'market_maker', 'damage_control'],
    preferredSpecialties: ['reactor_tuner', 'route_savant', 'market_maker'],
    talentRates: { trained: 0.56, elite: 0.14 },
  },
  mining: {
    themeLabel: '采掘劳务港',
    offerCount: 3,
    slotRoles: ['engineer', 'quartermaster', 'pilot'],
    slotSpecialties: ['damage_control', 'salvage_logistician', 'void_runner'],
    preferredSpecialties: ['damage_control', 'salvage_logistician', 'salvage_rigger'],
    talentRates: { trained: 0.48, elite: 0.11 },
  },
  commercial: {
    themeLabel: '商贸人才港',
    offerCount: 4,
    slotRoles: ['broker', 'broker', 'quartermaster', 'pilot'],
    slotSpecialties: ['market_maker', 'luxury_curator', 'container_architect', 'convoy_scout'],
    preferredSpecialties: ['market_maker', 'luxury_curator', 'container_architect'],
    talentRates: { trained: 0.54, elite: 0.16 },
  },
  military: {
    themeLabel: '军需与边境港',
    offerCount: 4,
    slotRoles: ['engineer', 'pilot', 'broker', 'quartermaster'],
    slotSpecialties: ['damage_control', 'void_runner', 'gray_channel', 'salvage_logistician'],
    preferredSpecialties: ['damage_control', 'void_runner', 'gray_channel'],
    talentRates: { trained: 0.5, elite: 0.13 },
  },
  medical: {
    themeLabel: '医药物流港',
    offerCount: 3,
    slotRoles: ['quartermaster', 'engineer', 'broker'],
    slotSpecialties: ['cold_chain_keeper', 'reactor_tuner', 'luxury_curator'],
    preferredSpecialties: ['cold_chain_keeper', 'reactor_tuner', 'luxury_curator'],
    talentRates: { trained: 0.46, elite: 0.1 },
  },
  industrial: {
    themeLabel: '制造与装卸港',
    offerCount: 4,
    slotRoles: ['engineer', 'quartermaster', 'engineer', 'broker'],
    slotSpecialties: ['salvage_rigger', 'container_architect', 'damage_control', 'market_maker'],
    preferredSpecialties: ['salvage_rigger', 'container_architect', 'damage_control'],
    talentRates: { trained: 0.52, elite: 0.12 },
  },
  energy: {
    themeLabel: '能源维保港',
    offerCount: 4,
    slotRoles: ['engineer', 'pilot', 'quartermaster', 'engineer'],
    slotSpecialties: ['reactor_tuner', 'void_runner', 'cold_chain_keeper', 'damage_control'],
    preferredSpecialties: ['reactor_tuner', 'void_runner', 'damage_control'],
    talentRates: { trained: 0.5, elite: 0.12 },
  },
  research: {
    themeLabel: '学研人才港',
    offerCount: 4,
    slotRoles: ['pilot', 'engineer', 'broker', 'quartermaster'],
    slotSpecialties: ['route_savant', 'reactor_tuner', 'market_maker', 'cold_chain_keeper'],
    preferredSpecialties: ['route_savant', 'reactor_tuner', 'cold_chain_keeper'],
    talentRates: { trained: 0.58, elite: 0.15 },
  },
  special: {
    themeLabel: '灰市与边缘港',
    offerCount: 4,
    slotRoles: ['broker', 'engineer', 'pilot', 'broker'],
    slotSpecialties: ['gray_channel', 'salvage_rigger', 'void_runner', 'market_maker'],
    preferredSpecialties: ['gray_channel', 'salvage_rigger', 'void_runner'],
    talentRates: { trained: 0.56, elite: 0.18 },
  },
};

const SPECIAL_SYSTEM_MARKET_OVERRIDES = {
  imperial_capital: {
    themeLabel: '帝都经纪圈',
    slotRoles: ['broker', 'broker', 'broker', 'quartermaster', 'pilot'],
    slotSpecialties: ['luxury_curator', 'market_maker', 'luxury_curator', 'container_architect', 'route_savant'],
    preferredSpecialties: ['luxury_curator', 'market_maker'],
    talentRates: { trained: 0.58, elite: 0.2 },
  },
  free_port: {
    themeLabel: '自由雇佣港',
    slotRoles: ['broker', 'quartermaster', 'pilot', 'broker', 'engineer'],
    slotSpecialties: ['market_maker', 'container_architect', 'convoy_scout', 'gray_channel', 'damage_control'],
    preferredSpecialties: ['market_maker', 'gray_channel', 'convoy_scout'],
    talentRates: { trained: 0.56, elite: 0.16 },
  },
  shadow_haven: {
    themeLabel: '暗港灰色市场',
    slotRoles: ['broker', 'engineer', 'broker', 'pilot', 'quartermaster'],
    slotSpecialties: ['gray_channel', 'salvage_rigger', 'market_maker', 'void_runner', 'salvage_logistician'],
    preferredSpecialties: ['gray_channel', 'salvage_rigger', 'void_runner'],
    talentRates: { trained: 0.58, elite: 0.19 },
  },
  frontier_outpost: {
    themeLabel: '边境应急劳市',
    slotRoles: ['engineer', 'pilot', 'quartermaster', 'broker'],
    slotSpecialties: ['damage_control', 'void_runner', 'salvage_logistician', 'gray_channel'],
    preferredSpecialties: ['damage_control', 'salvage_logistician', 'void_runner'],
    talentRates: { trained: 0.52, elite: 0.14 },
  },
  pirate_haven: {
    themeLabel: '海盗转运黑港',
    slotRoles: ['broker', 'pilot', 'engineer', 'broker'],
    slotSpecialties: ['gray_channel', 'void_runner', 'salvage_rigger', 'market_maker'],
    preferredSpecialties: ['gray_channel', 'void_runner', 'salvage_rigger'],
    talentRates: { trained: 0.6, elite: 0.22 },
  },
  warp_bazaar: {
    themeLabel: '裂隙奇才市场',
    slotRoles: ['broker', 'pilot', 'broker', 'engineer', 'quartermaster'],
    slotSpecialties: ['gray_channel', 'route_savant', 'luxury_curator', 'reactor_tuner', 'cold_chain_keeper'],
    preferredSpecialties: ['gray_channel', 'route_savant', 'luxury_curator'],
    talentRates: { trained: 0.6, elite: 0.22 },
  },
  jade_port: {
    themeLabel: '翠玉高货港',
    slotRoles: ['quartermaster', 'broker', 'quartermaster', 'pilot'],
    slotSpecialties: ['cold_chain_keeper', 'luxury_curator', 'container_architect', 'convoy_scout'],
    preferredSpecialties: ['cold_chain_keeper', 'luxury_curator', 'container_architect'],
    talentRates: { trained: 0.5, elite: 0.14 },
  },
};

function _rng(seed) {
  var value = seed | 0;
  if (!value) value = 1;
  return function () {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function _hashText(text) {
  var hash = 2166136261;
  for (var index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function _cloneEffect(effect) {
  return effect ? JSON.parse(JSON.stringify(effect)) : {};
}

function _mergeAdditiveEffect(target, source) {
  Object.keys(source || {}).forEach(function (key) {
    if (key === 'fuelEffMultiplier') {
      target.fuelEffMultiplier = (target.fuelEffMultiplier || 1) * source[key];
      return;
    }
    target[key] = (target[key] || 0) + source[key];
  });
  return target;
}

function _getRefreshDay(day) {
  var safeDay = Math.max(1, Number.isFinite(day) ? Math.floor(day) : 1);
  return Math.floor((safeDay - 1) / CREW_MARKET_CONFIG.refreshIntervalDays) * CREW_MARKET_CONFIG.refreshIntervalDays + 1;
}

function _getNextRefreshDay(refreshDay) {
  return refreshDay + CREW_MARKET_CONFIG.refreshIntervalDays;
}

function _getCrewExpToNext(level, potential) {
  var safeLevel = Math.max(1, level || 1);
  var safePotential = Math.max(1, Math.min(3, potential || 1));
  return 45 + safeLevel * 28 + (3 - safePotential) * 10;
}

function _getTitleForLevel(role, level) {
  if (!role || !Array.isArray(role.titles) || role.titles.length === 0) return role ? role.roleName : '船员';
  return role.titles[Math.min(role.titles.length - 1, Math.max(0, (level || 1) - 1))];
}

function _getPotentialLabel(potential) {
  if (potential >= 3) return '王牌潜力';
  if (potential === 2) return '稳定成长';
  return '即战熟手';
}

function _getSystemMarketProfile(system) {
  var typeProfile = MARKET_TYPE_PROFILES[system && system.type ? system.type : 'commercial'] || MARKET_TYPE_PROFILES.commercial;
  var systemOverride = system && SPECIAL_SYSTEM_MARKET_OVERRIDES[system.id] ? SPECIAL_SYSTEM_MARKET_OVERRIDES[system.id] : null;
  return {
    themeLabel: systemOverride && systemOverride.themeLabel ? systemOverride.themeLabel : typeProfile.themeLabel,
    offerCount: systemOverride && systemOverride.slotRoles ? systemOverride.slotRoles.length : typeProfile.offerCount,
    slotRoles: (systemOverride && systemOverride.slotRoles ? systemOverride.slotRoles : typeProfile.slotRoles).slice(),
    slotSpecialties: (systemOverride && systemOverride.slotSpecialties ? systemOverride.slotSpecialties : typeProfile.slotSpecialties || []).slice(),
    preferredSpecialties: (typeProfile.preferredSpecialties || []).concat(systemOverride && systemOverride.preferredSpecialties ? systemOverride.preferredSpecialties : []),
    talentRates: Object.assign({}, typeProfile.talentRates || {}, systemOverride && systemOverride.talentRates ? systemOverride.talentRates : {}),
  };
}

function _pickWeightedRole(randomValue, systemType, marketProfile, slotIndex) {
  if (marketProfile && Array.isArray(marketProfile.slotRoles) && slotIndex < marketProfile.slotRoles.length) {
    var forcedRole = getCrewRoleDef(marketProfile.slotRoles[slotIndex]);
    if (forcedRole) return forcedRole;
  }
  var cumulative = 0;
  var weighted = CREW_ROLES.map(function (role) {
    var weight = role.marketWeightByType && role.marketWeightByType[systemType] != null
      ? role.marketWeightByType[systemType]
      : 1;
    cumulative += weight;
    return { role: role, cumulative: cumulative };
  });
  if (cumulative <= 0) return CREW_ROLES[0];
  var roll = randomValue() * cumulative;
  for (var index = 0; index < weighted.length; index += 1) {
    if (roll <= weighted[index].cumulative) return weighted[index].role;
  }
  return weighted[weighted.length - 1].role;
}

function _pickSpecialty(randomValue, role, systemType, marketProfile, slotIndex) {
  var specialties = (role.specialtyPool || []).map(function (specialtyId) {
    return getCrewSpecialtyDef(specialtyId);
  }).filter(Boolean);
  if (specialties.length === 0) return null;

  if (marketProfile && Array.isArray(marketProfile.slotSpecialties) && slotIndex < marketProfile.slotSpecialties.length) {
    var forcedSpecialty = getCrewSpecialtyDef(marketProfile.slotSpecialties[slotIndex]);
    if (forcedSpecialty && forcedSpecialty.role === role.id) return forcedSpecialty;
  }

  var totalWeight = 0;
  var weighted = specialties.map(function (specialty) {
    var weight = 1;
    if (Array.isArray(specialty.systemBias) && specialty.systemBias.indexOf(systemType) !== -1) {
      weight += 0.7;
    }
    if (marketProfile && Array.isArray(marketProfile.preferredSpecialties) && marketProfile.preferredSpecialties.indexOf(specialty.id) !== -1) {
      weight += 1.2;
    }
    totalWeight += weight;
    return { specialty: specialty, cumulative: totalWeight };
  });

  var roll = randomValue() * totalWeight;
  for (var index = 0; index < weighted.length; index += 1) {
    if (roll <= weighted[index].cumulative) return weighted[index].specialty;
  }
  return weighted[weighted.length - 1].specialty;
}

function _pickTalentTier(randomValue, marketProfile) {
  var roll = randomValue();
  var eliteThreshold = 1 - ((marketProfile && marketProfile.talentRates && marketProfile.talentRates.elite) || 0.12);
  var trainedThreshold = 1 - (((marketProfile && marketProfile.talentRates && marketProfile.talentRates.elite) || 0.12) + ((marketProfile && marketProfile.talentRates && marketProfile.talentRates.trained) || 0.48));
  if (roll >= eliteThreshold) {
    return { level: 3, potential: 3, multiplier: 1.42, wageMultiplier: 1.32, label: '王牌' };
  }
  if (roll >= trainedThreshold) {
    return { level: 2, potential: 2, multiplier: 1.18, wageMultiplier: 1.16, label: '熟练' };
  }
  return { level: 1, potential: 1, multiplier: 1, wageMultiplier: 1, label: '见习' };
}

function _generateName(randomValue) {
  var firstNames = CREW_NAME_POOLS.first || ['林'];
  var secondNames = CREW_NAME_POOLS.second || ['川'];
  return firstNames[Math.floor(randomValue() * firstNames.length)] + secondNames[Math.floor(randomValue() * secondNames.length)];
}

function _createOffer(system, refreshDay, index, marketProfile) {
  var systemId = system && system.id ? system.id : 'sol_prime';
  var systemType = system && system.type ? system.type : 'commercial';
  var seed = _hashText(systemId + '|' + refreshDay + '|' + index);
  var randomValue = _rng(seed || 1);
  var role = _pickWeightedRole(randomValue, systemType, marketProfile, index);
  var specialty = _pickSpecialty(randomValue, role, systemType, marketProfile, index);
  var tier = _pickTalentTier(randomValue, marketProfile);
  var name = _generateName(randomValue);
  var costNoise = 0.92 + randomValue() * 0.18;
  var wageNoise = 0.95 + randomValue() * 0.15;
  var roleName = role.roleName;
  var expPerDay = role.expPerDay + tier.potential;
  var hireCost = Math.round(role.baseHireCost * tier.multiplier * costNoise + tier.level * 22 + tier.potential * 18);
  var wage = Math.round(role.baseWage * tier.wageMultiplier * wageNoise + tier.level * 6 + tier.potential * 4);
  var maxLevel = 4 + tier.potential;

  return {
    id: 'crew_offer_' + systemId + '_' + refreshDay + '_' + index,
    marketSystemId: systemId,
    refreshDay: refreshDay,
    name: name,
    emoji: role.emoji,
    role: role.id,
    roleName: roleName,
    title: _getTitleForLevel(role, tier.level),
    level: tier.level,
    exp: 0,
    expToNext: _getCrewExpToNext(tier.level, tier.potential),
    potential: tier.potential,
    potentialLabel: _getPotentialLabel(tier.potential),
    specialtyId: specialty ? specialty.id : null,
    specialtyName: specialty ? specialty.name : roleName,
    branchLabel: specialty ? specialty.shortLabel : roleName,
    hireCost: hireCost,
    wage: wage,
    expPerDay: expPerDay,
    maxLevel: maxLevel,
    marketTag: tier.label,
    desc: role.desc,
  };
}

function _generateMarket(state, systemId) {
  var system = findSystem(systemId);
  var refreshDay = _getRefreshDay(state.day || 1);
  var marketProfile = _getSystemMarketProfile(system || { id: systemId, type: 'commercial' });
  var offerCount = Math.max(CREW_MARKET_CONFIG.baseOfferCount, Math.min(CREW_MARKET_CONFIG.maxOfferCount, marketProfile.offerCount || CREW_MARKET_CONFIG.baseOfferCount));

  var offers = [];
  for (var index = 0; index < offerCount; index += 1) {
    offers.push(_createOffer(system || { id: systemId, type: 'commercial' }, refreshDay, index, marketProfile));
  }

  return {
    systemId: systemId,
    refreshDay: refreshDay,
    nextRefreshDay: _getNextRefreshDay(refreshDay),
    themeLabel: marketProfile.themeLabel,
    offers: offers,
  };
}

function _normalizeMarketOffer(offer) {
  if (!offer || typeof offer !== 'object') return null;
  var role = getCrewRoleDef(offer.role);
  var specialty = offer.specialtyId ? getCrewSpecialtyDef(offer.specialtyId) : null;
  if (!role) return null;
  return {
    id: String(offer.id || ''),
    marketSystemId: String(offer.marketSystemId || ''),
    refreshDay: Math.max(1, Math.floor(offer.refreshDay || 1)),
    name: String(offer.name || role.roleName),
    emoji: String(offer.emoji || role.emoji || '👤'),
    role: role.id,
    roleName: role.roleName,
    title: String(offer.title || _getTitleForLevel(role, offer.level || 1)),
    level: Math.max(1, Math.floor(offer.level || 1)),
    exp: Math.max(0, Math.floor(offer.exp || 0)),
    expToNext: Math.max(1, Math.floor(offer.expToNext || _getCrewExpToNext(offer.level || 1, offer.potential || 1))),
    potential: Math.max(1, Math.min(3, Math.floor(offer.potential || 1))),
    potentialLabel: String(offer.potentialLabel || _getPotentialLabel(offer.potential || 1)),
    specialtyId: specialty ? specialty.id : null,
    specialtyName: specialty ? specialty.name : role.roleName,
    branchLabel: specialty ? specialty.shortLabel : role.roleName,
    hireCost: Math.max(0, Math.floor(offer.hireCost || role.baseHireCost || 0)),
    wage: Math.max(0, Math.floor(offer.wage || role.baseWage || 0)),
    expPerDay: Math.max(1, Math.floor(offer.expPerDay || role.expPerDay || 10)),
    maxLevel: Math.max(3, Math.floor(offer.maxLevel || 5)),
    marketTag: String(offer.marketTag || '见习'),
    desc: String(offer.desc || role.desc || ''),
  };
}

function _normalizeCrew(crew, fallbackIndex) {
  if (!crew || typeof crew !== 'object') return null;

  if (crew.templateId && LEGACY_TEMPLATE_MAP[crew.templateId]) {
    var legacy = LEGACY_TEMPLATE_MAP[crew.templateId];
    var legacyRole = getCrewRoleDef(legacy.role);
    var legacySpecialty = legacy.specialtyId ? getCrewSpecialtyDef(legacy.specialtyId) : null;
    return {
      id: crew.id || ('crew_' + fallbackIndex),
      name: crew.name || legacy.name,
      emoji: crew.emoji || legacy.emoji,
      role: legacy.role,
      roleName: legacyRole ? legacyRole.roleName : getCrewRoleLabel(legacy.role),
      title: crew.title || legacy.title,
      level: legacy.level,
      exp: 0,
      expToNext: _getCrewExpToNext(legacy.level, 2),
      potential: 2,
      potentialLabel: _getPotentialLabel(2),
      specialtyId: legacySpecialty ? legacySpecialty.id : null,
      specialtyName: legacySpecialty ? legacySpecialty.name : getCrewRoleLabel(legacy.role),
      branchLabel: legacySpecialty ? legacySpecialty.shortLabel : getCrewRoleLabel(legacy.role),
      wage: crew.wage || legacy.wage,
      wageArrears: Math.max(0, Math.floor(crew.wageArrears || 0)),
      hireCost: crew.hireCost || legacy.hireCost,
      hiredDay: crew.hiredDay || 1,
      assignedShipIndex: crew.assignedShipIndex != null ? crew.assignedShipIndex : null,
      expPerDay: legacyRole ? legacyRole.expPerDay + 2 : 10,
      maxLevel: 6,
      marketOriginId: crew.marketOriginId || null,
      legacyEffect: _cloneEffect(legacy.legacyEffect),
    };
  }

  var role = getCrewRoleDef(crew.role);
  if (!role) return null;
  var specialty = crew.specialtyId ? getCrewSpecialtyDef(crew.specialtyId) : null;
  var level = Math.max(1, Math.floor(crew.level || 1));
  var potential = Math.max(1, Math.min(3, Math.floor(crew.potential || 1)));
  return {
    id: String(crew.id || ('crew_' + fallbackIndex)),
    name: String(crew.name || role.roleName),
    emoji: String(crew.emoji || role.emoji || '👤'),
    role: role.id,
    roleName: role.roleName,
    title: String(crew.title || _getTitleForLevel(role, level)),
    level: level,
    exp: Math.max(0, Math.floor(crew.exp || 0)),
    expToNext: Math.max(1, Math.floor(crew.expToNext || _getCrewExpToNext(level, potential))),
    potential: potential,
    potentialLabel: String(crew.potentialLabel || _getPotentialLabel(potential)),
    specialtyId: specialty ? specialty.id : null,
    specialtyName: specialty ? specialty.name : role.roleName,
    branchLabel: specialty ? specialty.shortLabel : role.roleName,
    wage: Math.max(0, Math.floor(crew.wage || role.baseWage || 0)),
    wageArrears: Math.max(0, Math.floor(crew.wageArrears || 0)),
    hireCost: Math.max(0, Math.floor(crew.hireCost || role.baseHireCost || 0)),
    hiredDay: Math.max(1, Math.floor(crew.hiredDay || 1)),
    assignedShipIndex: crew.assignedShipIndex != null ? crew.assignedShipIndex : null,
    expPerDay: Math.max(1, Math.floor(crew.expPerDay || role.expPerDay || 10)),
    maxLevel: Math.max(level, Math.floor(crew.maxLevel || (4 + potential))),
    marketOriginId: crew.marketOriginId || null,
    legacyEffect: crew.legacyEffect ? _cloneEffect(crew.legacyEffect) : null,
  };
}

export function getDefaultCrewCapacity(shipType) {
  if (!shipType) return 2;
  if (shipType.id === 'galleon') return 4;
  if (shipType.id === 'freighter' || shipType.id === 'clipper') return 3;
  return 2;
}

export function ensureState(state) {
  if (!Array.isArray(state.crewRoster)) state.crewRoster = [];
  if (!Number.isFinite(state.crewCounter) || state.crewCounter < 1) state.crewCounter = 1;
  if (!state.crewMarket || typeof state.crewMarket !== 'object' || Array.isArray(state.crewMarket)) state.crewMarket = {};

  state.crewRoster = state.crewRoster.map(function (crew, index) {
    return _normalizeCrew(crew, state.crewCounter + index);
  }).filter(Boolean);

  var maxCounter = state.crewCounter;
  state.crewRoster.forEach(function (crew) {
    var match = /^(?:crew_)(\d+)$/.exec(crew.id || '');
    if (match) maxCounter = Math.max(maxCounter, Number(match[1]) + 1);
  });
  state.crewCounter = maxCounter;

  Object.keys(state.crewMarket).forEach(function (systemId) {
    var entry = state.crewMarket[systemId];
    if (!entry || typeof entry !== 'object') {
      delete state.crewMarket[systemId];
      return;
    }
    var normalizedOffers = Array.isArray(entry.offers)
      ? entry.offers.map(_normalizeMarketOffer).filter(Boolean)
      : [];
    state.crewMarket[systemId] = {
      systemId: systemId,
      refreshDay: Math.max(1, Math.floor(entry.refreshDay || _getRefreshDay(state.day || 1))),
      nextRefreshDay: Math.max(2, Math.floor(entry.nextRefreshDay || _getNextRefreshDay(entry.refreshDay || 1))),
      themeLabel: entry.themeLabel || '',
      offers: normalizedOffers,
    };
  });
}

export function ensureShip(ship, shipType) {
  if (!ship) return;
  if (!Array.isArray(ship.crewIds)) ship.crewIds = [];
  if (!Number.isFinite(ship.crewCapacity) || ship.crewCapacity < 1) {
    ship.crewCapacity = getDefaultCrewCapacity(shipType);
  }
}

export function getCrewById(state, crewId) {
  ensureState(state);
  return state.crewRoster.find(function (crew) {
    return crew.id === crewId;
  }) || null;
}

export function getShipCrew(state, ship) {
  ensureState(state);
  if (!ship || !Array.isArray(ship.crewIds)) return [];
  return ship.crewIds.map(function (crewId) {
    return getCrewById(state, crewId);
  }).filter(Boolean);
}

export function getReserveCrew(state) {
  ensureState(state);
  return state.crewRoster.filter(function (crew) {
    return crew.assignedShipIndex == null;
  });
}

export function getCrewMarket(state, systemId) {
  ensureState(state);
  var key = String(systemId || state.currentSystem || 'sol_prime');
  var expectedRefreshDay = _getRefreshDay(state.day || 1);
  var existing = state.crewMarket[key];
  if (!existing || existing.refreshDay !== expectedRefreshDay) {
    state.crewMarket[key] = _generateMarket(state, key);
  }
  return state.crewMarket[key];
}

export function getRecruitableCrew(state, systemId) {
  return getCrewMarket(state, systemId).offers;
}

export function getCrewEffectProfile(crewLike) {
  if (!crewLike) {
    return {
      cargo: 0,
      autoRepair: 0,
      buyDiscount: 0,
      sellBonus: 0,
      fuelEffMultiplier: 1,
    };
  }

  if (crewLike.legacyEffect) {
    return Object.assign({
      cargo: 0,
      autoRepair: 0,
      buyDiscount: 0,
      sellBonus: 0,
      fuelEffMultiplier: 1,
    }, _cloneEffect(crewLike.legacyEffect));
  }

  var role = getCrewRoleDef(crewLike.role);
  if (!role) {
    return {
      cargo: 0,
      autoRepair: 0,
      buyDiscount: 0,
      sellBonus: 0,
      fuelEffMultiplier: 1,
    };
  }

  var level = Math.max(1, crewLike.level || 1);
  var effect = {
    cargo: 0,
    autoRepair: 0,
    buyDiscount: 0,
    sellBonus: 0,
    fuelEffMultiplier: 1,
  };
  var roleEffect = _cloneEffect(role.baseEffect);
  var growth = role.growthPerLevel || {};

  Object.keys(growth).forEach(function (key) {
    if (key === 'fuelEffMultiplier') {
      var baseMultiplier = roleEffect.fuelEffMultiplier != null ? roleEffect.fuelEffMultiplier : 1;
      roleEffect.fuelEffMultiplier = Math.max(0.75, baseMultiplier - growth[key] * Math.max(0, level - 1));
      return;
    }
    roleEffect[key] = (roleEffect[key] || 0) + growth[key] * Math.max(0, level - 1);
  });
  _mergeAdditiveEffect(effect, roleEffect);

  var specialty = crewLike.specialtyId ? getCrewSpecialtyDef(crewLike.specialtyId) : null;
  if (specialty && specialty.bonusEffect) {
    _mergeAdditiveEffect(effect, specialty.bonusEffect);
  }

  effect.fuelEffMultiplier = Math.max(0.7, effect.fuelEffMultiplier || 1);
  effect.cargo = Math.round((effect.cargo || 0) * 10) / 10;
  effect.autoRepair = Math.round((effect.autoRepair || 0) * 10) / 10;
  effect.buyDiscount = Math.round((effect.buyDiscount || 0) * 1000) / 1000;
  effect.sellBonus = Math.round((effect.sellBonus || 0) * 1000) / 1000;
  effect.fuelEffMultiplier = Math.round(effect.fuelEffMultiplier * 1000) / 1000;
  return effect;
}

export function getShipEffects(state, ship, options) {
  options = options || {};
  var excludedCrewId = options.excludeCrewId || null;
  var effects = {
    cargo: 0,
    autoRepair: 0,
    buyDiscount: 0,
    sellBonus: 0,
    fuelEffMultiplier: 1,
  };

  getShipCrew(state, ship).forEach(function (crew) {
    if (!crew || crew.id === excludedCrewId) return;
    // 允许一天周转缓冲；连续欠薪后船员暂停提供专长，直到欠款结清。
    if ((crew.wageArrears || 0) >= Math.max(1, (crew.wage || 0) * 2)) return;
    var profile = getCrewEffectProfile(crew);
    effects.cargo += profile.cargo || 0;
    effects.autoRepair += profile.autoRepair || 0;
    effects.buyDiscount += profile.buyDiscount || 0;
    effects.sellBonus += profile.sellBonus || 0;
    effects.fuelEffMultiplier *= profile.fuelEffMultiplier || 1;
  });

  effects.fuelEffMultiplier = Math.max(0.5, Math.round(effects.fuelEffMultiplier * 10000) / 10000);
  effects.cargo = Math.round(effects.cargo);
  effects.autoRepair = Math.round(effects.autoRepair * 10) / 10;
  effects.buyDiscount = Math.round(effects.buyDiscount * 1000) / 1000;
  effects.sellBonus = Math.round(effects.sellBonus * 1000) / 1000;
  return effects;
}

function _createCrewInstanceFromOffer(state, offer) {
  var role = getCrewRoleDef(offer.role);
  return {
    id: 'crew_' + state.crewCounter,
    name: offer.name,
    emoji: offer.emoji || (role ? role.emoji : '👤'),
    role: offer.role,
    roleName: offer.roleName || (role ? role.roleName : getCrewRoleLabel(offer.role)),
    title: offer.title,
    level: offer.level,
    exp: 0,
    expToNext: offer.expToNext || _getCrewExpToNext(offer.level, offer.potential),
    potential: offer.potential,
    potentialLabel: offer.potentialLabel || _getPotentialLabel(offer.potential),
    specialtyId: offer.specialtyId || null,
    specialtyName: offer.specialtyName || (offer.specialtyId ? (getCrewSpecialtyDef(offer.specialtyId) || {}).name : getCrewRoleLabel(offer.role)),
    branchLabel: offer.branchLabel || getCrewRoleLabel(offer.role),
    wage: offer.wage,
    wageArrears: 0,
    hireCost: offer.hireCost,
    hiredDay: state.day || 1,
    assignedShipIndex: null,
    expPerDay: offer.expPerDay || (role ? role.expPerDay : 10),
    maxLevel: offer.maxLevel || 5,
    marketOriginId: offer.id,
    legacyEffect: null,
  };
}

export function recruitCrew(state, offerId, systemId) {
  ensureState(state);
  var market = getCrewMarket(state, systemId);
  var offerIndex = market.offers.findIndex(function (offer) {
    return offer.id === offerId;
  });
  if (offerIndex === -1) {
    return { ok: false, msgs: [{ text: '📋 当前人才市场没有这位候选人。', type: 'error' }] };
  }

  var offer = market.offers[offerIndex];
  if (state.crewRoster.some(function (crew) { return crew.marketOriginId === offer.id; })) {
    return { ok: false, msgs: [{ text: '👥 这位候选人已在你的名册中。', type: 'info' }] };
  }
  if ((state.credits || 0) < offer.hireCost) {
    return { ok: false, msgs: [{ text: '💰 积分不足，无法支付签约费用。', type: 'error' }] };
  }

  state.credits -= offer.hireCost;
  var crew = _createCrewInstanceFromOffer(state, offer);
  state.crewCounter += 1;
  state.crewRoster.push(crew);
  market.offers.splice(offerIndex, 1);

  return {
    ok: true,
    msgs: [{
      text: '👥 签下「' + crew.emoji + ' ' + crew.name + '」(' + crew.roleName + ' / ' + crew.branchLabel + ')，花费 ' + offer.hireCost + ' 积分。',
      type: 'upgrade',
    }],
  };
}

function _resolveShip(state, shipIndex) {
  if (!Array.isArray(state.fleet) || shipIndex < 0 || shipIndex >= state.fleet.length) return null;
  return state.fleet[shipIndex];
}

function _canRemoveCrew(state, ship, crewId) {
  var currentCargo = Object.values(ship.cargo || {}).reduce(function (sum, qty) { return sum + qty; }, 0);
  var nextEffects = getShipEffects(state, ship, { excludeCrewId: crewId });
  var nextCapacity = ship.maxCargo + (nextEffects.cargo || 0);
  return currentCargo <= nextCapacity;
}

export function assignCrewToShip(state, crewId, shipIndex) {
  ensureState(state);
  var crew = getCrewById(state, crewId);
  var ship = _resolveShip(state, shipIndex);
  if (!crew || !ship) {
    return { ok: false, msgs: [{ text: '❌ 无法分配船员。', type: 'error' }] };
  }
  if (ship.route) {
    return { ok: false, msgs: [{ text: '📡 正在自动跑商的飞船不能调整船员。', type: 'error' }] };
  }
  if (crew.assignedShipIndex === shipIndex) {
    return { ok: false, msgs: [{ text: '⚓ 该船员已在这艘船上。', type: 'info' }] };
  }
  if ((ship.crewIds || []).length >= (ship.crewCapacity || 1)) {
    return { ok: false, msgs: [{ text: '🚫 该飞船的船员舱位已满。', type: 'error' }] };
  }

  if (crew.assignedShipIndex != null) {
    var previousShip = _resolveShip(state, crew.assignedShipIndex);
    if (previousShip) {
      if (!_canRemoveCrew(state, previousShip, crew.id)) {
        return { ok: false, msgs: [{ text: '📦 原飞船当前货物过多，无法先撤下这名船员。', type: 'error' }] };
      }
      previousShip.crewIds = previousShip.crewIds.filter(function (id) { return id !== crew.id; });
    }
  }

  ship.crewIds.push(crew.id);
  crew.assignedShipIndex = shipIndex;

  return {
    ok: true,
    msgs: [{ text: '🧑‍✈️ 船员「' + crew.name + '」已分配至「' + ship.name + '」。', type: 'info' }],
  };
}

export function unassignCrewFromShip(state, crewId, shipIndex) {
  ensureState(state);
  var crew = getCrewById(state, crewId);
  var ship = _resolveShip(state, shipIndex);
  if (!crew || !ship) {
    return { ok: false, msgs: [{ text: '❌ 无法调整船员。', type: 'error' }] };
  }
  if (ship.route) {
    return { ok: false, msgs: [{ text: '📡 正在自动跑商的飞船不能调整船员。', type: 'error' }] };
  }
  if (crew.assignedShipIndex !== shipIndex || ship.crewIds.indexOf(crewId) === -1) {
    return { ok: false, msgs: [{ text: '⚠️ 该船员当前不在这艘船上。', type: 'info' }] };
  }
  if (!_canRemoveCrew(state, ship, crewId)) {
    return { ok: false, msgs: [{ text: '📦 货舱当前超出撤离后容量，无法卸下该船员。', type: 'error' }] };
  }

  ship.crewIds = ship.crewIds.filter(function (id) { return id !== crewId; });
  crew.assignedShipIndex = null;

  return {
    ok: true,
    msgs: [{ text: '🔁 船员「' + crew.name + '」已回到预备队。', type: 'info' }],
  };
}

export function dismissCrew(state, crewId) {
  ensureState(state);
  var crew = getCrewById(state, crewId);
  if (!crew) {
    return { ok: false, msgs: [{ text: '❌ 船员不存在。', type: 'error' }] };
  }

  if (crew.assignedShipIndex != null) {
    var ship = _resolveShip(state, crew.assignedShipIndex);
    if (ship) {
      if (ship.route) {
        return { ok: false, msgs: [{ text: '📡 正在自动跑商的飞船不能解雇船员。', type: 'error' }] };
      }
      if (!_canRemoveCrew(state, ship, crewId)) {
        return { ok: false, msgs: [{ text: '📦 当前货物超出撤离后容量，无法解雇该船员。', type: 'error' }] };
      }
      ship.crewIds = ship.crewIds.filter(function (id) { return id !== crewId; });
    }
  }

  state.crewRoster = state.crewRoster.filter(function (item) {
    return item.id !== crewId;
  });

  return {
    ok: true,
    msgs: [{ text: '🧾 已解雇船员「' + crew.name + '」。', type: 'info' }],
  };
}

function _grantCrewExperience(state, days) {
  if (days <= 0) return [];
  var msgs = [];
  state.crewRoster.forEach(function (crew) {
    if (!crew || crew.assignedShipIndex == null) return;
    var gain = Math.max(1, Math.floor((crew.expPerDay || 10) * days));
    crew.exp += gain;
    while (crew.level < crew.maxLevel && crew.exp >= crew.expToNext) {
      crew.exp -= crew.expToNext;
      crew.level += 1;
      crew.expToNext = _getCrewExpToNext(crew.level, crew.potential);
      var role = getCrewRoleDef(crew.role);
      crew.title = _getTitleForLevel(role, crew.level);
      msgs.push({
        text: '🌟 船员「' + crew.name + '」升至 Lv.' + crew.level + '，专长分支「' + crew.branchLabel + '」进一步成熟。',
        type: 'upgrade',
      });
    }
    if (crew.level >= crew.maxLevel) {
      crew.exp = 0;
    }
  });
  return msgs;
}

export function payDailyWages(state, days) {
  ensureState(state);
  var settledDays = Math.max(0, Number.isFinite(days) ? Math.floor(days) : 0);
  if (settledDays <= 0 || state.crewRoster.length === 0) {
    return { ok: true, msgs: [] };
  }

  var msgs = _grantCrewExperience(state, settledDays);

  var totalDue = state.crewRoster.reduce(function (sum, crew) {
    return sum + (crew.wageArrears || 0) + (crew.wage || 0) * settledDays;
  }, 0);
  if (totalDue <= 0) {
    return { ok: true, msgs: msgs };
  }

  var remainingCredits = Math.max(0, state.credits || 0);
  var paid = 0;
  state.crewRoster.forEach(function (crew) {
    var crewDue = (crew.wageArrears || 0) + (crew.wage || 0) * settledDays;
    var crewPaid = Math.min(remainingCredits, crewDue);
    remainingCredits -= crewPaid;
    paid += crewPaid;
    crew.wageArrears = crewDue - crewPaid;
  });
  state.credits -= paid;
  var arrears = totalDue - paid;
  msgs.unshift({ text: '💼 已结算船员工资 ' + paid + ' 积分（' + settledDays + ' 天）。', type: 'info' });
  if (arrears > 0) {
    msgs.push({ text: '⚠️ 仍有 ' + arrears + ' 积分工资未结清；连续欠薪的船员将暂停提供专长。', type: 'error' });
  }
  return { ok: true, msgs: msgs, meta: { paid: paid, arrears: arrears, days: settledDays } };
}
