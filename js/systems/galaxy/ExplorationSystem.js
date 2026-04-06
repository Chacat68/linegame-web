// js/systems/galaxy/ExplorationSystem.js — 探索系统（扫描 / 着陆 / POI / 秘密航线）
// 依赖：data/systems.js, systems/galaxy/GalaxyDataLayer.js
// 导出：scanSystem, landOnSystem, explorePoi, getTravelRouteInfo, getCurrentSystemSecretRoutes

import { findSystem } from '../../data/systems.js';
import * as GalaxyData from './GalaxyDataLayer.js';

const BASE_SCAN_FUEL_COST = 6;
const DEEP_SCAN_FUEL_COST = 4;
const BASE_LANDING_FEE = 40;
const LANDING_FEE_PER_LEVEL = 20;
const BASE_SECRET_ROUTE_MULTIPLIER = 0.65;
const CARTOGRAPHY_SECRET_ROUTE_MULTIPLIER = 0.5;

export function scanSystem(state, systemId, options) {
  options = options || {};
  const system = findSystem(systemId);
  if (!system) {
    return { ok: false, msgs: [{ text: '🛰️ 未知星球，无法执行扫描。', type: 'error' }] };
  }
  if (state.currentSystem !== systemId) {
    return { ok: false, msgs: [{ text: '📡 需要先抵达当前星球轨道，才能执行本地扫描。', type: 'error' }] };
  }

  const exploration = _getExplorationState(systemId);
  if (!exploration) {
    return { ok: false, msgs: [{ text: '📡 当前星球的探索数据尚未就绪。', type: 'error' }] };
  }
  if ((exploration.scanLevel || 0) > 0) {
    return { ok: false, msgs: [{ text: '🔍 该星球已完成轨道扫描。', type: 'info' }] };
  }

  const hasDeepScan = options.forceDeepScan || _hasTech(state, 'deep_scanner');
  const baseScanFuelCost = hasDeepScan ? DEEP_SCAN_FUEL_COST : BASE_SCAN_FUEL_COST;
  const scanFuelCost = Math.max(0, Math.round(baseScanFuelCost * Math.max(0, 1 - (options.scanFuelDiscount || 0))));
  if ((state.fuel || 0) < scanFuelCost) {
    return {
      ok: false,
      msgs: [{ text: '⛽ 燃料不足，扫描需要 ' + scanFuelCost + ' 单位燃料。', type: 'error' }],
    };
  }

  state.fuel -= scanFuelCost;
  exploration.scanLevel = hasDeepScan ? 2 : 1;
  exploration.scanCount = (exploration.scanCount || 0) + 1;
  exploration.lastScannedDay = state.day || 1;
  exploration.pois.forEach(function (poi) {
    poi.discovered = true;
    poi.discoveredDay = state.day || 1;
  });
  _saveExplorationState(systemId, exploration);

  var routeCount = (exploration.secretRoutes || []).length;
  var poiCount = (exploration.pois || []).length;
  var msgs = [{
    text: '🔍 已完成对「' + system.name + '」的' + (exploration.scanLevel > 1 ? '深度' : '轨道') + '扫描，消耗 ' + scanFuelCost + ' 单位燃料。',
    type: 'info',
  }];
  msgs.push({
    text: '🗺️ 已标记 ' + poiCount + ' 个可调查探索点' + (routeCount > 0 ? '，并锁定到 1 条可疑暗线信标。' : '。'),
    type: 'tip',
  });

  return { ok: true, msgs: msgs, meta: { systemId: systemId, scanFuelCost: scanFuelCost } };
}

export function landOnSystem(state, systemId, options) {
  options = options || {};
  const system = findSystem(systemId);
  if (!system) {
    return { ok: false, msgs: [{ text: '🛬 未知星球，无法着陆。', type: 'error' }] };
  }
  if (state.currentSystem !== systemId) {
    return { ok: false, msgs: [{ text: '🛬 只有停靠在当前星球时才能执行着陆。', type: 'error' }] };
  }

  const exploration = _getExplorationState(systemId);
  if (!exploration) {
    return { ok: false, msgs: [{ text: '🛬 当前星球的着陆数据尚未就绪。', type: 'error' }] };
  }
  if ((exploration.scanLevel || 0) <= 0) {
    return { ok: false, msgs: [{ text: '🔍 请先完成轨道扫描，再决定着陆。', type: 'error' }] };
  }
  if (exploration.landed) {
    return { ok: false, msgs: [{ text: '🛬 该星球已完成首次着陆，可直接继续调查已发现的 POI。', type: 'info' }] };
  }

  const landingFee = Math.max(0, Math.round(_getLandingFee(system) * Math.max(0, 1 - (options.landingFeeDiscount || 0))));
  if ((state.credits || 0) < landingFee) {
    return { ok: false, msgs: [{ text: '💰 信用积分不足，着陆需要 ' + landingFee + ' 积分。', type: 'error' }] };
  }

  state.credits -= landingFee;
  exploration.landed = true;
  exploration.landingCount = (exploration.landingCount || 0) + 1;
  exploration.lastLandedDay = state.day || 1;
  _saveExplorationState(systemId, exploration);

  const unresolvedCount = (exploration.pois || []).filter(function (poi) {
    return poi.discovered && !poi.resolved;
  }).length;

  return {
    ok: true,
    msgs: [
      { text: '🛬 已完成对「' + system.name + '」的首次着陆，支付停泊与地面通行费 ' + landingFee + ' 积分。', type: 'info' },
      { text: '🧭 地面行动已解锁，当前有 ' + unresolvedCount + ' 个探索点可调查。', type: 'tip' },
    ],
    meta: { systemId: systemId, landingFee: landingFee },
  };
}

export function explorePoi(state, systemId, poiId, options) {
  options = options || {};
  const system = findSystem(systemId);
  if (!system) {
    return { ok: false, msgs: [{ text: '🧭 未知星球，无法调查探索点。', type: 'error' }] };
  }
  if (state.currentSystem !== systemId) {
    return { ok: false, msgs: [{ text: '🧭 只有停靠在当前星球时才能调查本地 POI。', type: 'error' }] };
  }

  const exploration = _getExplorationState(systemId);
  if (!exploration || !exploration.landed) {
    return { ok: false, msgs: [{ text: '🛬 请先完成着陆，再调查地面探索点。', type: 'error' }] };
  }

  const poi = (exploration.pois || []).find(function (entry) { return entry.id === poiId; });
  if (!poi) {
    return { ok: false, msgs: [{ text: '🧭 未找到对应的探索点。', type: 'error' }] };
  }
  if (!poi.discovered) {
    return { ok: false, msgs: [{ text: '🔍 该探索点尚未被扫描发现。', type: 'error' }] };
  }
  if (poi.resolved) {
    return { ok: false, msgs: [{ text: '✅ 该探索点已经调查完毕。', type: 'info' }] };
  }

  var result = _resolvePoi(state, system, exploration, poi, options);
  poi.resolved = true;
  poi.resolvedDay = state.day || 1;
  poi.lastOutcome = result.summary;
  _saveExplorationState(systemId, exploration);

  var msgs = [{ text: poi.icon + ' ' + poi.name + '：' + result.summary, type: result.type || 'info' }];
  if (result.followup) {
    msgs.push({ text: result.followup, type: 'tip' });
  }
  return { ok: true, msgs: msgs, meta: { systemId: systemId, poiId: poiId, poiKind: poi.kind } };
}

export function getTravelRouteInfo(state, fromId, toId) {
  if (!fromId || !toId || fromId === toId) {
    return { active: false, fuelMultiplier: 1 };
  }

  var fromExploration = _getExplorationState(fromId);
  var toExploration = _getExplorationState(toId);
  var route = _findDiscoveredRoute(fromId, fromExploration, toId) || _findDiscoveredRoute(toId, toExploration, fromId);
  if (!route) {
    return { active: false, fuelMultiplier: 1 };
  }

  var multiplier = route.fuelMultiplier || BASE_SECRET_ROUTE_MULTIPLIER;
  if (_hasTech(state, 'stellar_cartography')) {
    multiplier = Math.min(multiplier, CARTOGRAPHY_SECRET_ROUTE_MULTIPLIER);
  }

  return {
    active: true,
    fuelMultiplier: multiplier,
    routeId: route.id,
    targetSystemId: route.targetSystemId,
    label: route.label,
  };
}

export function getCurrentSystemSecretRoutes(state) {
  if (!state || !state.currentSystem) return [];

  var exploration = _getExplorationState(state.currentSystem);
  if (!exploration || !Array.isArray(exploration.secretRoutes)) return [];

  return exploration.secretRoutes
    .filter(function (route) { return route.discovered; })
    .map(function (route) {
      var routeInfo = getTravelRouteInfo(state, state.currentSystem, route.targetSystemId);
      var fuelMultiplier = routeInfo.active ? routeInfo.fuelMultiplier : (route.fuelMultiplier || BASE_SECRET_ROUTE_MULTIPLIER);
      return {
        id: route.id,
        sourceSystemId: state.currentSystem,
        targetSystemId: route.targetSystemId,
        targetSystemName: route.targetSystemName,
        label: route.label,
        fuelMultiplier: fuelMultiplier,
        discountPercent: Math.round((1 - fuelMultiplier) * 100),
      };
    });
}

function _resolvePoi(state, system, exploration, poi, options) {
  var rewardMultiplier = Math.max(1, options && options.poiRewardMultiplier ? options.poiRewardMultiplier : 1);

  if (poi.kind === 'resource_cache') {
    var rewardCredits = Math.round(((poi.rewards && poi.rewards.credits) || 0) * rewardMultiplier);
    var rewardFuel = Math.round(((poi.rewards && poi.rewards.fuel) || 0) * rewardMultiplier);
    var rewardRep = Math.round(((poi.rewards && poi.rewards.reputation) || 0) * rewardMultiplier);
    state.credits += rewardCredits;
    state.fuel = Math.min(state.maxFuel || 100, (state.fuel || 0) + rewardFuel);
    state.reputation = (state.reputation || 0) + rewardRep;
    return {
      summary: '回收了补给与账本，获得 ' + rewardCredits + ' 积分、' + rewardFuel + ' 单位燃料。',
      followup: rewardRep > 0 ? '📈 此次发现还提升了你的公共声望。' : '',
      type: 'upgrade',
    };
  }

  if (poi.kind === 'anomaly_site') {
    var anomalyCredits = Math.round(((poi.rewards && poi.rewards.credits) || 0) * rewardMultiplier);
    var hullDamage = (poi.rewards && poi.rewards.hullDamage) || 0;
    if (_hasTech(state, 'anomaly_research')) {
      anomalyCredits = Math.round(anomalyCredits * 1.15);
      hullDamage = 0;
      state.reputation = (state.reputation || 0) + 2;
      return {
        summary: '凭借异常分析协议，你稳定提取了样本数据，获得 ' + anomalyCredits + ' 积分并避免了舰体损伤。',
        followup: '🔬 深入分析带来的研究信誉让你额外获得了 2 点声望。',
        type: 'upgrade',
      };
    }

    state.credits += anomalyCredits;
    state.shipHull = Math.max(1, (state.shipHull || 100) - hullDamage);
    return {
      summary: '异常区带来了 ' + anomalyCredits + ' 积分收益，但飞船在回收过程中受损 ' + hullDamage + ' 点。',
      followup: '⚠️ 研究「异常分析协议」后可以显著降低这类风险。',
      type: 'info',
    };
  }

  if (poi.kind === 'route_beacon') {
    var route = (exploration.secretRoutes || []).find(function (entry) { return entry.id === poi.secretRouteId; });
    if (route && !route.discovered) {
      route.discovered = true;
      route.discoveredDay = state.day || 1;
    }
    state.credits += Math.round(((poi.rewards && poi.rewards.credits) || 0) * rewardMultiplier);
    state.reputation = (state.reputation || 0) + Math.round(((poi.rewards && poi.rewards.reputation) || 0) * rewardMultiplier);
    var routeInfo = getTravelRouteInfo(state, system.id, route ? route.targetSystemId : null);
    var bonusPercent = Math.round((1 - routeInfo.fuelMultiplier) * 100);
    return {
      summary: '你重启了隐秘折跃信标，解锁了通往「' + (route ? route.targetSystemName : '未知航点') + '」的秘密航线。',
      followup: '🛰️ 该航线现可提供约 ' + bonusPercent + '% 的燃料节省。',
      type: 'upgrade',
    };
  }

  return {
    summary: '探索行动完成，但没有回收到可结算的收益。',
    type: 'info',
  };
}

function _findDiscoveredRoute(sourceId, exploration, targetId) {
  if (!exploration || !Array.isArray(exploration.secretRoutes)) return null;
  return exploration.secretRoutes.find(function (route) {
    return route.discovered && route.targetSystemId === targetId && route.sourceSystemId === sourceId;
  }) || null;
}

function _getLandingFee(system) {
  return BASE_LANDING_FEE + ((system.minLevel || 1) * LANDING_FEE_PER_LEVEL);
}

function _getExplorationState(systemId) {
  var planet = GalaxyData.getPlanetData(systemId);
  if (!planet || !planet.exploration) return null;
  return _clone(planet.exploration);
}

function _saveExplorationState(systemId, exploration) {
  GalaxyData.updatePlanetState(systemId, { exploration: _clone(exploration) });
}

function _hasTech(state, techId) {
  return !!(state && state.researchedTechs && state.researchedTechs.indexOf(techId) !== -1);
}

function _clone(value) {
  return JSON.parse(JSON.stringify(value));
}