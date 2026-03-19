// js/systems/trade/TradeStationSystem.js — 贸易站建设与经营
// 依赖：data/tradeStations.js, data/systems.js, systems/economy/Economy.js
// 导出：init, getOwnedStations, getBuildCandidates, getSummary, getStation,
//       buildStation, upgradeStation, hireManager, setStrategy,
//       getProjectedDailyIncome, advanceDay

import { GOODS } from '../../data/goods.js';
import { findSystem, SYSTEMS } from '../../data/systems.js';
import {
  TRADE_STATION_ALLOWED_TYPES,
  TRADE_STATION_LEVELS,
  TRADE_STATION_MANAGERS,
  TRADE_STATION_STRATEGIES,
  TRADE_STATION_TYPE_FOCUS,
} from '../../data/tradeStations.js';
import * as Economy from '../economy/Economy.js';

const _goodsById = GOODS.reduce(function (acc, good) {
  acc[good.id] = good;
  return acc;
}, Object.create(null));

function _ensureStations(state) {
  if (!state.tradeStations || typeof state.tradeStations !== 'object' || Array.isArray(state.tradeStations)) {
    state.tradeStations = {};
  }
  return state.tradeStations;
}

function _getLevelConfig(level) {
  return TRADE_STATION_LEVELS.find(function (entry) { return entry.level === level; }) || TRADE_STATION_LEVELS[0];
}

function _getManagerConfig(managerId) {
  return TRADE_STATION_MANAGERS.find(function (entry) { return entry.id === managerId; }) || null;
}

function _getStrategyConfig(strategyId) {
  return TRADE_STATION_STRATEGIES.find(function (entry) { return entry.id === strategyId; }) || TRADE_STATION_STRATEGIES[0];
}

function _isSystemEligible(system) {
  return !!(system && TRADE_STATION_ALLOWED_TYPES.indexOf(system.type) >= 0);
}

function _getSystemFocusGoods(system, strategy) {
  if (strategy && Array.isArray(strategy.focusGoods) && strategy.focusGoods.length > 0) {
    return strategy.focusGoods;
  }
  return TRADE_STATION_TYPE_FOCUS[system.type] || ['food', 'fuel', 'technology'];
}

function _getDailySnapshot(systemId, station) {
  const system = findSystem(systemId);
  if (!system) {
    return { factor: 0.75, marketFactor: 0.75, depthFactor: 0.95, cycleFactor: 1.0 };
  }

  const strategy = _getStrategyConfig(station.strategyId);
  const focusGoods = _getSystemFocusGoods(system, strategy);
  const ratios = focusGoods.map(function (goodId) {
    const good = _goodsById[goodId];
    if (!good || !good.basePrice) return 1;
    return Economy.getBuyPrice(systemId, goodId) / good.basePrice;
  });
  const avgRatio = ratios.reduce(function (sum, ratio) { return sum + ratio; }, 0) / Math.max(1, ratios.length);
  const marketFactor = Math.max(0.8, Math.min(1.3, avgRatio));
  const marketDepth = typeof Economy.getMarketDepth === 'function'
    ? Economy.getMarketDepth(systemId)
    : (system.marketDepth || 200);
  const depthFactor = Math.max(0.9, Math.min(1.15, marketDepth / 220));
  const cycle = typeof Economy.getEconomyCycle === 'function'
    ? Economy.getEconomyCycle()
    : { priceMod: 1 };
  const cycleFactor = Math.max(0.85, Math.min(1.15, cycle.priceMod || 1));
  const factor = Math.max(0.75, Math.min(1.35, marketFactor * 0.6 + depthFactor * 0.25 + cycleFactor * 0.15));
  return { factor, marketFactor, depthFactor, cycleFactor };
}

function _getUpgradeCost(level) {
  const current = _getLevelConfig(level);
  const next = _getLevelConfig(level + 1);
  if (!next || next.level === current.level) return 0;
  return Math.max(0, next.investment - current.investment);
}

function _createStation(systemId, day) {
  const levelConfig = _getLevelConfig(1);
  return {
    systemId: systemId,
    level: 1,
    strategyId: 'balanced',
    managerId: null,
    totalIncome: 0,
    investment: levelConfig.investment,
    lastIncome: 0,
    buildDay: day || 1,
    lastProcessedDay: day || 1,
  };
}

function _getStationMeta(state, station) {
  const system = findSystem(station.systemId);
  const levelConfig = _getLevelConfig(station.level);
  const manager = _getManagerConfig(station.managerId);
  const strategy = _getStrategyConfig(station.strategyId);
  const snapshot = _getDailySnapshot(station.systemId, station);
  const projected = _calculateDailyIncome(station, snapshot.factor, manager, strategy);
  const nextLevel = station.level < TRADE_STATION_LEVELS.length ? _getLevelConfig(station.level + 1) : null;

  return {
    system: system,
    station: station,
    levelConfig: levelConfig,
    manager: manager,
    strategy: strategy,
    projectedIncome: projected.net,
    grossIncome: projected.gross,
    upkeep: projected.upkeep,
    economicFactor: snapshot.factor,
    nextUpgradeCost: nextLevel ? _getUpgradeCost(station.level) : 0,
    nextLevel: nextLevel,
  };
}

function _calculateDailyIncome(station, economicFactor, manager, strategy) {
  const levelConfig = _getLevelConfig(station.level);
  const gross = Math.max(0, Math.round(
    levelConfig.baseIncome *
    economicFactor *
    (strategy ? strategy.incomeMultiplier : 1) *
    (manager ? manager.incomeMultiplier : 1)
  ));
  const upkeep = Math.max(0, Math.round(
    levelConfig.baseIncome *
    (strategy ? strategy.upkeepRate : 0.08) *
    (manager ? manager.upkeepMultiplier : 1)
  )) + (manager ? manager.dailySalary : 0);
  return {
    gross: gross,
    upkeep: upkeep,
    net: Math.max(0, gross - upkeep),
  };
}

export function init(state) {
  _ensureStations(state);
}

export function getStation(state, systemId) {
  const stations = _ensureStations(state);
  return stations[systemId] || null;
}

export function getOwnedStations(state) {
  const stations = _ensureStations(state);
  return Object.keys(stations).map(function (systemId) {
    return _getStationMeta(state, stations[systemId]);
  }).sort(function (a, b) {
    return (b.projectedIncome || 0) - (a.projectedIncome || 0);
  });
}

export function getBuildCandidates(state) {
  const visited = state.visitedSystems || [state.currentSystem];
  const stations = _ensureStations(state);
  return SYSTEMS.filter(function (system) {
    return _isSystemEligible(system) && visited.indexOf(system.id) >= 0 && !stations[system.id];
  }).map(function (system) {
    const levelConfig = _getLevelConfig(1);
    return {
      system: system,
      buildCost: levelConfig.investment,
      isCurrent: system.id === state.currentSystem,
      canAfford: (state.credits || 0) >= levelConfig.investment,
    };
  }).sort(function (a, b) {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return (b.system.marketDepth || 0) - (a.system.marketDepth || 0);
  });
}

export function getSummary(state) {
  const stations = getOwnedStations(state);
  return {
    count: stations.length,
    managedCount: stations.filter(function (entry) { return !!entry.manager; }).length,
    totalIncome: stations.reduce(function (sum, entry) {
      return sum + (entry.station.totalIncome || 0);
    }, 0),
    projectedIncome: stations.reduce(function (sum, entry) {
      return sum + (entry.projectedIncome || 0);
    }, 0),
  };
}

export function canBuildStation(state, systemId) {
  const stations = _ensureStations(state);
  const system = findSystem(systemId);
  const buildCost = _getLevelConfig(1).investment;

  if (!system) {
    return { ok: false, msg: '未知星球，无法建设贸易站。' };
  }
  if (!_isSystemEligible(system)) {
    return { ok: false, msg: system.name + ' 当前不支持建设贸易站。' };
  }
  if (stations[systemId]) {
    return { ok: false, msg: system.name + ' 已经拥有贸易站。' };
  }
  if ((state.visitedSystems || []).indexOf(systemId) === -1 && state.currentSystem !== systemId) {
    return { ok: false, msg: '需先亲自到访 ' + system.name + '，才能决定建站。' };
  }
  if ((state.credits || 0) < buildCost) {
    return { ok: false, msg: '信用积分不足，无法完成首期投资。' };
  }
  return { ok: true, msg: '' };
}

export function buildStation(state, systemId) {
  init(state);
  const guard = canBuildStation(state, systemId);
  if (!guard.ok) {
    return { ok: false, msgs: [{ text: '🏪 ' + guard.msg, type: 'error' }] };
  }

  const system = findSystem(systemId);
  const buildCost = _getLevelConfig(1).investment;
  state.credits -= buildCost;
  state.tradeStations[systemId] = _createStation(systemId, state.day || 1);

  return {
    ok: true,
    msgs: [{
      text: '🏗 已在 ' + system.name + ' 投资 ' + buildCost.toLocaleString() + ' 积分，贸易站开始运营。',
      type: 'upgrade',
    }],
    meta: { systemId: systemId, buildCost: buildCost },
  };
}

export function upgradeStation(state, systemId) {
  init(state);
  const station = state.tradeStations[systemId];
  if (!station) {
    return { ok: false, msgs: [{ text: '🏪 该星球尚未建设贸易站。', type: 'error' }] };
  }
  if (station.level >= TRADE_STATION_LEVELS.length) {
    return { ok: false, msgs: [{ text: '🏪 贸易站已达到最高等级。', type: 'info' }] };
  }

  const cost = _getUpgradeCost(station.level);
  if ((state.credits || 0) < cost) {
    return { ok: false, msgs: [{ text: '💰 信用积分不足，无法升级贸易站。', type: 'error' }] };
  }

  station.level += 1;
  station.investment = _getLevelConfig(station.level).investment;
  state.credits -= cost;

  return {
    ok: true,
    msgs: [{
      text: '🏗 ' + findSystem(systemId).name + ' 贸易站升级至 Lv.' + station.level + '，新增投资 ' + cost.toLocaleString() + ' 积分。',
      type: 'upgrade',
    }],
    meta: { systemId: systemId, level: station.level, cost: cost },
  };
}

export function hireManager(state, systemId, managerId) {
  init(state);
  const station = state.tradeStations[systemId];
  const manager = _getManagerConfig(managerId);
  if (!station) {
    return { ok: false, msgs: [{ text: '🏪 请先建设贸易站，再雇佣管理员。', type: 'error' }] };
  }
  if (!manager) {
    return { ok: false, msgs: [{ text: '👤 未知管理员方案。', type: 'error' }] };
  }
  if (station.managerId === managerId) {
    return { ok: false, msgs: [{ text: '👤 当前贸易站已雇佣这位管理员。', type: 'info' }] };
  }
  if ((state.credits || 0) < manager.hireCost) {
    return { ok: false, msgs: [{ text: '💰 信用积分不足，无法雇佣管理员。', type: 'error' }] };
  }

  state.credits -= manager.hireCost;
  station.managerId = managerId;

  return {
    ok: true,
    msgs: [{
      text: '👤 ' + manager.name + ' 已入驻 ' + findSystem(systemId).name + '，贸易站管理效率提升。',
      type: 'info',
    }],
    meta: { systemId: systemId, managerId: managerId, cost: manager.hireCost },
  };
}

export function setStrategy(state, systemId, strategyId) {
  init(state);
  const station = state.tradeStations[systemId];
  const strategy = _getStrategyConfig(strategyId);
  if (!station) {
    return { ok: false, msgs: [{ text: '🏪 请先建设贸易站，再调整经营策略。', type: 'error' }] };
  }
  if (station.strategyId === strategy.id) {
    return { ok: false, msgs: [{ text: '📈 当前已在执行该经营策略。', type: 'info' }] };
  }

  station.strategyId = strategy.id;
  return {
    ok: true,
    msgs: [{
      text: '📈 ' + findSystem(systemId).name + ' 贸易站已切换为「' + strategy.name + '」。',
      type: 'info',
    }],
    meta: { systemId: systemId, strategyId: strategy.id },
  };
}

export function getProjectedDailyIncome(state, systemId) {
  const station = getStation(state, systemId);
  if (!station) return 0;
  return _getStationMeta(state, station).projectedIncome;
}

export function advanceDay(state) {
  init(state);
  const stations = state.tradeStations;
  const entries = Object.keys(stations);
  if (entries.length === 0) {
    return { ok: true, totalIncome: 0, msgs: [] };
  }

  let totalIncome = 0;
  const perStation = [];

  entries.forEach(function (systemId) {
    const station = stations[systemId];
    const meta = _getStationMeta(state, station);
    const income = meta.projectedIncome;
    if (income <= 0) return;

    station.lastIncome = income;
    station.totalIncome = (station.totalIncome || 0) + income;
    station.lastProcessedDay = state.day || (station.lastProcessedDay || 1);
    state.credits += income;
    totalIncome += income;
    perStation.push(meta.system.name + ' +' + income.toLocaleString());
  });

  if (totalIncome <= 0) {
    return { ok: true, totalIncome: 0, msgs: [] };
  }

  return {
    ok: true,
    totalIncome: totalIncome,
    msgs: [{
      text: '🏪 贸易站日收益已到账：' + totalIncome.toLocaleString() + ' 积分（' + perStation.join('，') + '）。',
      type: 'info',
    }],
  };
}
