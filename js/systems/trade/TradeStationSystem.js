// js/systems/trade/TradeStationSystem.js — 贸易站建设与经营
// 依赖：data/tradeStations.js, data/systems.js, systems/economy/Economy.js
// 导出：init, getOwnedStations, getBuildCandidates, getSummary, getStation,
//       buildStation, upgradeStation, hireManager, setStrategy,
//       batchUpgradeStations, batchHireManagers, batchSetStrategies,
//       getStrategyRecommendation, getNextNetworkAction,
//       getProjectedDailyIncome, advanceDay

import { GOODS } from '../../data/goods.js';
import { findGalaxy, findSystem, SYSTEMS } from '../../data/systems.js';
import {
  TRADE_STATION_ALLOWED_TYPES,
  TRADE_STATION_LEVELS,
  TRADE_STATION_MANAGERS,
  TRADE_STATION_REGION_SYNERGIES,
  TRADE_STATION_ROLES,
  TRADE_STATION_STRATEGIES,
  TRADE_STATION_TYPE_FOCUS,
} from '../../data/tradeStations.js';
import {
  getCompanyAccessState,
  getCompanyLevelValue,
  getMaxTradeStationLevel,
  getTradeStationCapacityState,
  getTradeStationLevelRequirement,
} from '../../data/companyAccess.js';
import * as Economy from '../economy/Economy.js';
import * as Exploration from '../galaxy/ExplorationSystem.js';

const ECONOMY_FACTOR_LIMITS = {
  fallbackFactor: 0.75,
  fallbackMarketFactor: 0.75,
  fallbackDepthFactor: 0.95,
  fallbackCycleFactor: 1.0,
  marketMin: 0.8,
  marketMax: 1.3,
  depthMin: 0.9,
  depthMax: 1.15,
  depthBaseline: 220,
  cycleMin: 0.85,
  cycleMax: 1.15,
  factorMin: 0.75,
  factorMax: 1.35,
  marketWeight: 0.6,
  depthWeight: 0.25,
  cycleWeight: 0.15,
};
const EXPLORATION_STATION_EFFECTS = {
  depotBuildDiscount: 0.12,
  relicPremiumIncomeBonus: 0.08,
  beaconThroughputBonus: 0.06,
};

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

function _getRoleConfig(roleId) {
  return TRADE_STATION_ROLES.find(function (entry) { return entry.id === roleId; }) || TRADE_STATION_ROLES[0];
}

function _isSystemEligible(system) {
  return !!(system && TRADE_STATION_ALLOWED_TYPES.indexOf(system.type) >= 0);
}

function _getStationRole(system) {
  if (!system) return _getRoleConfig('market_hub');
  return TRADE_STATION_ROLES.find(function (role) {
    return Array.isArray(role.systemTypes) && role.systemTypes.indexOf(system.type) >= 0;
  }) || _getRoleConfig('market_hub');
}

function _getCurrentStrategyId(state, systemId) {
  if (!state || !state.tradeStations || typeof state.tradeStations !== 'object') return 'balanced';
  const station = state.tradeStations[systemId];
  return station && station.strategyId ? station.strategyId : 'balanced';
}

function _getStrategyRecommendation(state, systemId, currentStrategyId) {
  const system = findSystem(systemId);
  const currentId = currentStrategyId || _getCurrentStrategyId(state, systemId);
  const intel = system && Exploration.getSurveyDecisionIntel(state || {}, systemId);
  let strategyId = 'balanced';
  let confidence = 'low';
  let intelSignal = 'none';
  let reason = '暂无可用勘探报告，建议先保持均衡经营。';

  if (intel && intel.hasIntel) {
    if (intel.researchSignal) {
      strategyId = 'premium';
      confidence = 'high';
      intelSignal = 'research';
      reason = '勘探报告包含科研样本，适合精品经营承接高附加值订单。';
    } else if (intel.logisticsSignal) {
      strategyId = 'expansion';
      confidence = 'high';
      intelSignal = 'logistics';
      reason = '勘探报告显示该节点具备补给与走量条件，适合扩张经营。';
    } else if (intel.marketSignal) {
      const premiumTypes = ['technology', 'medical', 'research'];
      strategyId = premiumTypes.indexOf(system.type) >= 0 ? 'premium' : 'expansion';
      confidence = 'high';
      intelSignal = 'market';
      reason = strategyId === 'premium'
        ? '勘探报告显示本地存在高端行情窗口，适合精品经营提高单笔利润。'
        : '勘探报告显示本地存在贸易窗口，适合扩张经营放大周转。';
    } else if (intel.routeSignal) {
      strategyId = 'balanced';
      confidence = 'medium';
      intelSignal = 'route';
      reason = '勘探报告包含航线情报，先保持均衡经营承接稳定转运。';
    }
  }

  const strategy = _getStrategyConfig(strategyId);
  return {
    strategyId: strategy.id,
    strategy: strategy,
    confidence: confidence,
    reason: reason,
    intelSignal: intelSignal,
    shouldSwitch: currentId !== strategy.id,
  };
}

function _getRegionalSynergy(state, systemId, includeSystem) {
  const system = findSystem(systemId);
  if (!system) {
    return {
      bonusMultiplier: 0,
      multiplier: 1,
      galaxyName: '',
      roleCounts: {},
      synergies: [],
      label: '未形成区域协同',
      summary: '缺少星系信息，暂不计算区域协同。',
    };
  }

  const stations = _ensureStations(state);
  const roleCounts = {};
  Object.keys(stations).forEach(function (stationSystemId) {
    const stationSystem = findSystem(stationSystemId);
    if (!stationSystem || stationSystem.galaxyId !== system.galaxyId) return;
    const role = _getStationRole(stationSystem);
    roleCounts[role.id] = (roleCounts[role.id] || 0) + 1;
  });
  if (includeSystem && !stations[systemId]) {
    const role = _getStationRole(system);
    roleCounts[role.id] = (roleCounts[role.id] || 0) + 1;
  }

  const matched = TRADE_STATION_REGION_SYNERGIES.filter(function (synergy) {
    return synergy.roleIds.every(function (roleId) {
      return (roleCounts[roleId] || 0) > 0;
    });
  });
  const bonusMultiplier = matched.reduce(function (sum, synergy) {
    return sum + (synergy.incomeBonus || 0);
  }, 0);
  const galaxy = findGalaxy(system.galaxyId);
  const label = matched.length > 0
    ? matched.map(function (synergy) { return synergy.name; }).join(' + ')
    : '未形成区域协同';
  const summary = matched.length > 0
    ? (label + '：区域日收益 +' + Math.round(bonusMultiplier * 100) + '%。')
    : '同星系补齐不同角色后，可获得区域组合收益。';

  return {
    bonusMultiplier: bonusMultiplier,
    multiplier: 1 + bonusMultiplier,
    galaxyName: galaxy ? galaxy.name : (system.galaxyId || ''),
    roleCounts: roleCounts,
    synergies: matched,
    label: label,
    summary: summary,
  };
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
    return {
      factor: ECONOMY_FACTOR_LIMITS.fallbackFactor,
      marketFactor: ECONOMY_FACTOR_LIMITS.fallbackMarketFactor,
      depthFactor: ECONOMY_FACTOR_LIMITS.fallbackDepthFactor,
      cycleFactor: ECONOMY_FACTOR_LIMITS.fallbackCycleFactor,
    };
  }

  const strategy = _getStrategyConfig(station.strategyId);
  const focusGoods = _getSystemFocusGoods(system, strategy);
  const ratios = focusGoods.map(function (goodId) {
    const good = _goodsById[goodId];
    if (!good || !good.basePrice) return 1;
    return Economy.getBuyPrice(systemId, goodId) / good.basePrice;
  });
  const avgRatio = ratios.reduce(function (sum, ratio) { return sum + ratio; }, 0) / Math.max(1, ratios.length);
  const marketFactor = Math.max(ECONOMY_FACTOR_LIMITS.marketMin, Math.min(ECONOMY_FACTOR_LIMITS.marketMax, avgRatio));
  const marketDepth = typeof Economy.getMarketDepth === 'function'
    ? Economy.getMarketDepth(systemId)
    : (system.marketDepth || 200);
  const depthFactor = Math.max(
    ECONOMY_FACTOR_LIMITS.depthMin,
    Math.min(ECONOMY_FACTOR_LIMITS.depthMax, marketDepth / ECONOMY_FACTOR_LIMITS.depthBaseline)
  );
  const cycle = typeof Economy.getEconomyCycle === 'function'
    ? Economy.getEconomyCycle()
    : { priceMod: 1 };
  const cycleFactor = Math.max(ECONOMY_FACTOR_LIMITS.cycleMin, Math.min(ECONOMY_FACTOR_LIMITS.cycleMax, cycle.priceMod || 1));
  const factor = Math.max(
    ECONOMY_FACTOR_LIMITS.factorMin,
    Math.min(
      ECONOMY_FACTOR_LIMITS.factorMax,
      marketFactor * ECONOMY_FACTOR_LIMITS.marketWeight +
      depthFactor * ECONOMY_FACTOR_LIMITS.depthWeight +
      cycleFactor * ECONOMY_FACTOR_LIMITS.cycleWeight
    )
  );
  return { factor, marketFactor, depthFactor, cycleFactor };
}

function _getUpgradeCost(level) {
  const current = _getLevelConfig(level);
  const next = _getLevelConfig(level + 1);
  if (!next || next.level === current.level) return 0;
  return Math.max(0, next.investment - current.investment);
}

function _createStation(systemId, day, investment) {
  const levelConfig = _getLevelConfig(1);
  const actualInvestment = Number.isFinite(Number(investment)) ? Math.max(0, Number(investment)) : levelConfig.investment;
  return {
    systemId: systemId,
    level: 1,
    strategyId: 'balanced',
    managerId: null,
    totalIncome: 0,
    investment: actualInvestment,
    lastIncome: 0,
    buildDay: day || 1,
    lastProcessedDay: day || 1,
  };
}

function _hasResolvedExplorationChain(intel, chainKind) {
  if (!intel) return false;
  if (Array.isArray(intel.anomalyChains) && intel.anomalyChains.some(function (chain) {
    return chain && chain.kind === chainKind && chain.resolved;
  })) {
    return true;
  }
  if (chainKind === 'derelict_depot') return !!intel.depotSignal;
  if (chainKind === 'ancient_relic') return !!intel.relicSignal;
  if (chainKind === 'lost_beacon') return !!intel.beaconSignal;
  return false;
}

function _getExplorationStationEffect(state, systemId, options) {
  const opts = options || {};
  const strategyId = opts.strategyId || (opts.station && opts.station.strategyId) || 'balanced';
  const intel = Exploration.getSurveyDecisionIntel(state || {}, systemId);
  const effect = {
    buildCostDiscount: 0,
    incomeBonus: 0,
    multiplier: 1,
    labels: [],
    summary: '',
  };

  if (_hasResolvedExplorationChain(intel, 'derelict_depot')) {
    effect.buildCostDiscount = EXPLORATION_STATION_EFFECTS.depotBuildDiscount;
    effect.labels.push('废弃补给站建站成本 -' + Math.round(effect.buildCostDiscount * 100) + '%');
  }
  if (_hasResolvedExplorationChain(intel, 'lost_beacon')) {
    effect.incomeBonus += EXPLORATION_STATION_EFFECTS.beaconThroughputBonus;
    effect.labels.push('失落航标转运吞吐 +' + Math.round(EXPLORATION_STATION_EFFECTS.beaconThroughputBonus * 100) + '%');
  }
  if (_hasResolvedExplorationChain(intel, 'ancient_relic')) {
    if (strategyId === 'premium') {
      effect.incomeBonus += EXPLORATION_STATION_EFFECTS.relicPremiumIncomeBonus;
      effect.labels.push('古代遗迹精品经营 +' + Math.round(EXPLORATION_STATION_EFFECTS.relicPremiumIncomeBonus * 100) + '%');
    } else {
      effect.labels.push('古代遗迹适配精品经营');
    }
  }

  effect.multiplier = 1 + effect.incomeBonus;
  effect.summary = effect.labels.join(' · ');
  return effect;
}

function _getStationBuildPlan(state, systemId, options) {
  const baseBuildCost = _getLevelConfig(1).investment;
  const explorationEffect = _getExplorationStationEffect(state, systemId, options);
  const buildCostDiscount = Math.max(0, Math.min(0.5, explorationEffect.buildCostDiscount || 0));
  return {
    baseBuildCost: baseBuildCost,
    buildCost: Math.max(0, Math.round(baseBuildCost * (1 - buildCostDiscount))),
    buildCostDiscount: buildCostDiscount,
    explorationEffect: explorationEffect,
  };
}

function _formatExplorationEffectSummary(effect) {
  return effect && effect.summary ? ('勘探加成：' + effect.summary + '。') : '';
}

function _getStationMeta(state, station) {
  const system = findSystem(station.systemId);
  const levelConfig = _getLevelConfig(station.level);
  const manager = _getManagerConfig(station.managerId);
  const strategy = _getStrategyConfig(station.strategyId);
  const role = _getStationRole(system);
  const regionalSynergy = _getRegionalSynergy(state, station.systemId);
  const strategyRecommendation = _getStrategyRecommendation(state, station.systemId, station.strategyId);
  const explorationEffect = _getExplorationStationEffect(state, station.systemId, {
    station: station,
    strategyId: station.strategyId,
  });
  const snapshot = _getDailySnapshot(station.systemId, station);
  const projected = _calculateDailyIncome(station, snapshot.factor, manager, strategy, regionalSynergy.multiplier * explorationEffect.multiplier);
  const companyMaxLevel = getMaxTradeStationLevel(state);
  const actualNextLevel = station.level < TRADE_STATION_LEVELS.length ? _getLevelConfig(station.level + 1) : null;
  const nextLevel = actualNextLevel && actualNextLevel.level <= companyMaxLevel ? actualNextLevel : null;
  const nextLevelLockLabel = actualNextLevel && actualNextLevel.level > companyMaxLevel
    ? _formatCompanyRequirement(getTradeStationLevelRequirement(actualNextLevel.level), getCompanyLevelValue(state), '升级至 Lv.' + actualNextLevel.level)
    : '';

  return {
    system: system,
    station: station,
    levelConfig: levelConfig,
    manager: manager,
    strategy: strategy,
    role: role,
    regionalSynergy: regionalSynergy,
    networkMultiplier: regionalSynergy.multiplier,
    explorationEffect: explorationEffect,
    explorationMultiplier: explorationEffect.multiplier,
    strategyRecommendation: strategyRecommendation,
    projectedIncome: projected.net,
    grossIncome: projected.gross,
    upkeep: projected.upkeep,
    economicFactor: snapshot.factor,
    nextUpgradeCost: nextLevel ? _getUpgradeCost(station.level) : 0,
    nextLevel: nextLevel,
    companyMaxLevel: companyMaxLevel,
    nextLevelLockLabel: nextLevelLockLabel,
  };
}

function _calculateDailyIncome(station, economicFactor, manager, strategy, networkMultiplier) {
  const levelConfig = _getLevelConfig(station.level);
  const safeNetworkMultiplier = Math.max(1, Number.isFinite(networkMultiplier) ? networkMultiplier : 1);
  const gross = Math.max(0, Math.round(
    levelConfig.baseIncome *
    economicFactor *
    (strategy ? strategy.incomeMultiplier : 1) *
    (manager ? manager.incomeMultiplier : 1) *
    safeNetworkMultiplier
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
  const access = getCompanyAccessState(state, 'tradeStationBuild');
  const capacity = getTradeStationCapacityState(state);
  const hasStationCapacity = !capacity.full;
  return SYSTEMS.filter(function (system) {
    return _isSystemEligible(system) && visited.indexOf(system.id) >= 0 && !stations[system.id];
  }).map(function (system) {
    const role = _getStationRole(system);
    const prospectiveRegionalSynergy = _getRegionalSynergy(state, system.id, true);
    const strategyRecommendation = _getStrategyRecommendation(state, system.id, 'balanced');
    const buildPlan = _getStationBuildPlan(state, system.id, {
      strategyId: strategyRecommendation.strategyId,
    });
    const canAfford = (state.credits || 0) >= buildPlan.buildCost;
    return {
      system: system,
      role: role,
      prospectiveRegionalSynergy: prospectiveRegionalSynergy,
      strategyRecommendation: strategyRecommendation,
      buildCost: buildPlan.buildCost,
      baseBuildCost: buildPlan.baseBuildCost,
      buildCostDiscount: buildPlan.buildCostDiscount,
      explorationEffect: buildPlan.explorationEffect,
      isCurrent: system.id === state.currentSystem,
      canAfford: canAfford && access.unlocked && hasStationCapacity,
      companyAccess: access,
      stationCapacity: capacity,
      lockReason: access.unlocked
        ? (hasStationCapacity ? '' : '公司站点容量已满：' + capacity.label)
        : access.lockLabel,
    };
  }).sort(function (a, b) {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return (b.system.marketDepth || 0) - (a.system.marketDepth || 0);
  });
}

export function getStrategyRecommendation(state, systemId) {
  return _getStrategyRecommendation(state, systemId, _getCurrentStrategyId(state, systemId));
}

function _createNetworkAction(type, priority, title, reason, actionLabel, systemId, payload, extra) {
  return Object.assign({
    id: type + '-' + systemId,
    type: type,
    priority: priority,
    title: title,
    reason: reason,
    actionLabel: actionLabel,
    systemId: systemId,
    payload: payload || null,
    disabled: false,
  }, extra || {});
}

function _sortActionCandidates(a, b) {
  if ((a.priority || 0) !== (b.priority || 0)) return (b.priority || 0) - (a.priority || 0);
  return String(a.systemId || '').localeCompare(String(b.systemId || ''));
}

export function getNextNetworkAction(state) {
  init(state);
  const credits = state.credits || 0;
  const ownedStations = getOwnedStations(state);
  const buildCandidates = getBuildCandidates(state);
  const actions = [];

  const synergyBuild = buildCandidates.filter(function (candidate) {
    return candidate.canAfford &&
      candidate.prospectiveRegionalSynergy &&
      candidate.prospectiveRegionalSynergy.bonusMultiplier > 0;
  }).sort(function (a, b) {
    const bonusDiff = (b.prospectiveRegionalSynergy.bonusMultiplier || 0) - (a.prospectiveRegionalSynergy.bonusMultiplier || 0);
    if (bonusDiff !== 0) return bonusDiff;
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return (b.system.marketDepth || 0) - (a.system.marketDepth || 0);
  })[0];
  if (synergyBuild) {
    const bonus = Math.round((synergyBuild.prospectiveRegionalSynergy.bonusMultiplier || 0) * 100);
    const explorationNote = _formatExplorationEffectSummary(synergyBuild.explorationEffect);
    actions.push(_createNetworkAction(
      'build',
      82,
      '补齐' + (synergyBuild.prospectiveRegionalSynergy.galaxyName || '本星系') + '商网协同',
      '在「' + synergyBuild.system.name + '」建站后可触发「' + synergyBuild.prospectiveRegionalSynergy.label + '」，区域日收益 +' + bonus + '%。' + explorationNote,
      '投资 ' + synergyBuild.buildCost.toLocaleString(),
      synergyBuild.system.id,
      { action: 'market-build-station', systemId: synergyBuild.system.id }
    ));
  }

  const upgradeTarget = ownedStations.filter(function (entry) {
    return !!entry.nextLevel && entry.nextUpgradeCost > 0 && credits >= entry.nextUpgradeCost;
  }).sort(function (a, b) {
    const aScore = (a.projectedIncome || 0) / Math.max(1, a.nextUpgradeCost || 1);
    const bScore = (b.projectedIncome || 0) / Math.max(1, b.nextUpgradeCost || 1);
    if (aScore !== bScore) return bScore - aScore;
    return (b.projectedIncome || 0) - (a.projectedIncome || 0);
  })[0];
  if (upgradeTarget) {
    actions.push(_createNetworkAction(
      'upgrade',
      70,
      '升级' + upgradeTarget.system.name + '贸易站',
      '该站当前预计日收益 +' + Math.floor(upgradeTarget.projectedIncome || 0).toLocaleString() + '，升级后可扩大长期现金流。',
      '升级至 Lv.' + upgradeTarget.nextLevel.level,
      upgradeTarget.station.systemId,
      { action: 'market-upgrade-station', systemId: upgradeTarget.station.systemId }
    ));
  }

  const managerAccess = getCompanyAccessState(state, 'tradeStationManager');
  const manager = TRADE_STATION_MANAGERS[0];
  const managerTarget = managerAccess.unlocked && manager && credits >= manager.hireCost
    ? ownedStations.filter(function (entry) {
        return !entry.station.managerId;
      }).sort(function (a, b) {
        return (b.projectedIncome || 0) - (a.projectedIncome || 0);
      })[0]
    : null;
  if (managerTarget) {
    actions.push(_createNetworkAction(
      'manager',
      60,
      '派驻' + manager.name,
      '「' + managerTarget.system.name + '」还没有管理员，先派驻基础经理能稳定抬高净收益。',
      '派驻 ' + manager.name,
      managerTarget.station.systemId,
      { action: 'market-hire-manager', systemId: managerTarget.station.systemId, managerId: manager.id }
    ));
  }

  const strategyAccess = getCompanyAccessState(state, 'tradeStationStrategy');
  const strategyTarget = strategyAccess.unlocked
    ? ownedStations.filter(function (entry) {
        return entry.strategyRecommendation && entry.strategyRecommendation.shouldSwitch;
      }).sort(function (a, b) {
        const aConfidence = a.strategyRecommendation.confidence === 'high' ? 2 : (a.strategyRecommendation.confidence === 'medium' ? 1 : 0);
        const bConfidence = b.strategyRecommendation.confidence === 'high' ? 2 : (b.strategyRecommendation.confidence === 'medium' ? 1 : 0);
        if (aConfidence !== bConfidence) return bConfidence - aConfidence;
        return (b.projectedIncome || 0) - (a.projectedIncome || 0);
      })[0]
    : null;
  if (strategyTarget) {
    actions.push(_createNetworkAction(
      'strategy',
      50,
      '调整' + strategyTarget.system.name + '经营策略',
      strategyTarget.strategyRecommendation.reason,
      '切换为' + strategyTarget.strategyRecommendation.strategy.name,
      strategyTarget.station.systemId,
      {
        action: 'market-set-strategy',
        systemId: strategyTarget.station.systemId,
        strategyId: strategyTarget.strategyRecommendation.strategyId,
      }
    ));
  }

  if (actions.length > 0) {
    return actions.sort(_sortActionCandidates)[0];
  }

  const fundingTarget = buildCandidates.filter(function (candidate) {
    return candidate.companyAccess &&
      candidate.companyAccess.unlocked &&
      !(candidate.stationCapacity && candidate.stationCapacity.full) &&
      credits < candidate.buildCost;
  }).sort(function (a, b) {
    return (a.buildCost || 0) - (b.buildCost || 0);
  })[0];
  if (fundingTarget) {
    const gap = Math.max(0, (fundingTarget.buildCost || 0) - credits);
    return _createNetworkAction(
      'funding',
      20,
      '准备下一座贸易站资金',
      '「' + fundingTarget.system.name + '」已具备建站资格，还差 ' + gap.toLocaleString() + ' 积分即可启动首期投资。',
      '资金不足',
      fundingTarget.system.id,
      null,
      { disabled: true, fundingGap: gap }
    );
  }

  const capacityTarget = buildCandidates.filter(function (candidate) {
    return candidate.companyAccess &&
      candidate.companyAccess.unlocked &&
      candidate.stationCapacity &&
      candidate.stationCapacity.full;
  }).sort(function (a, b) {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
    return (b.system.marketDepth || 0) - (a.system.marketDepth || 0);
  })[0];
  if (capacityTarget) {
    return _createNetworkAction(
      'companyGrowth',
      18,
      '提升公司等级扩张商网',
      '当前贸易站容量为 ' + capacityTarget.stationCapacity.label + '，继续提升公司等级后才能在「' + capacityTarget.system.name + '」建站。',
      '提升公司等级',
      capacityTarget.system.id,
      null,
      { disabled: true, disabledLabel: '容量已满', stationCapacity: capacityTarget.stationCapacity }
    );
  }

  return null;
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

function _getBatchTargets(state, systemIds, predicate) {
  const filter = Array.isArray(systemIds) && systemIds.length > 0 ? new Set(systemIds) : null;
  return getOwnedStations(state).filter(function (entry) {
    if (filter && !filter.has(entry.station.systemId)) return false;
    return typeof predicate === 'function' ? predicate(entry) : true;
  });
}

function _summarizeSystems(systemIds) {
  const names = (systemIds || []).map(function (systemId) {
    const system = findSystem(systemId);
    return system ? system.name : systemId;
  }).filter(Boolean);

  if (names.length === 0) return '';
  if (names.length <= 3) return names.join('、');
  return names.slice(0, 3).join('、') + ' 等 ' + names.length + ' 站';
}

function _formatCompanyRequirement(requiredLevel, currentLevel, actionLabel) {
  return actionLabel + '需要公司 Lv.' + requiredLevel + '（当前公司 Lv.' + currentLevel + '）。';
}

function _getCompanyFeatureGate(state, featureId, actionLabel) {
  const access = getCompanyAccessState(state, featureId);
  if (access.unlocked) return { ok: true, msg: '' };
  return {
    ok: false,
    msg: _formatCompanyRequirement(access.requiredLevel, access.currentLevel, actionLabel),
  };
}

export function batchUpgradeStations(state, systemIds) {
  init(state);
  const gate = _getCompanyFeatureGate(state, 'tradeStationBatchOps', '批量升级贸易站');
  if (!gate.ok) {
    return { ok: false, msgs: [{ text: '🏢 ' + gate.msg, type: 'error' }], meta: { targetCount: 0, executedCount: 0 } };
  }
  const targets = _getBatchTargets(state, systemIds, function (entry) {
    return !!entry.nextLevel && entry.nextUpgradeCost > 0;
  });

  if (targets.length === 0) {
    return { ok: false, msgs: [{ text: '🏪 当前没有可批量升级的贸易站。', type: 'info' }], meta: { targetCount: 0, executedCount: 0 } };
  }

  const executedIds = [];
  let spent = 0;
  let skippedBudget = 0;

  targets.forEach(function (entry) {
    const cost = entry.nextUpgradeCost || 0;
    if ((state.credits || 0) < cost) {
      skippedBudget += 1;
      return;
    }

    const station = state.tradeStations[entry.station.systemId];
    if (!station) return;

    station.level += 1;
    station.investment = _getLevelConfig(station.level).investment;
    state.credits -= cost;
    spent += cost;
    executedIds.push(station.systemId);
  });

  if (executedIds.length === 0) {
    return {
      ok: false,
      msgs: [{ text: '💰 信用积分不足，无法启动商网升级波次。', type: 'error' }],
      meta: { targetCount: targets.length, executedCount: 0, skippedBudget: skippedBudget },
    };
  }

  return {
    ok: true,
    msgs: [{
      text: '📡 商网升级波次已执行：' + executedIds.length + ' 站完成升级，追加投资 ' + spent.toLocaleString() + ' 积分（' + _summarizeSystems(executedIds) + '）。' +
        (skippedBudget > 0 ? (' 另有 ' + skippedBudget + ' 站因预算不足暂缓。') : ''),
      type: 'upgrade',
    }],
    meta: { targetCount: targets.length, executedCount: executedIds.length, spent: spent, skippedBudget: skippedBudget, systemIds: executedIds },
  };
}

export function batchHireManagers(state, managerId, systemIds) {
  init(state);
  const gate = _getCompanyFeatureGate(state, 'tradeStationBatchOps', '批量派驻经理');
  if (!gate.ok) {
    return { ok: false, msgs: [{ text: '🏢 ' + gate.msg, type: 'error' }], meta: { targetCount: 0, executedCount: 0 } };
  }
  const manager = _getManagerConfig(managerId);
  if (!manager) {
    return { ok: false, msgs: [{ text: '👤 未知管理员方案。', type: 'error' }], meta: { targetCount: 0, executedCount: 0 } };
  }

  const targets = _getBatchTargets(state, systemIds, function (entry) {
    return entry.station.managerId !== manager.id;
  });

  if (targets.length === 0) {
    return {
      ok: false,
      msgs: [{ text: '👤 全网贸易站已由「' + manager.name + '」接管，无需重复指派。', type: 'info' }],
      meta: { targetCount: 0, executedCount: 0 },
    };
  }

  const executedIds = [];
  let spent = 0;
  let skippedBudget = 0;

  targets.forEach(function (entry) {
    if ((state.credits || 0) < manager.hireCost) {
      skippedBudget += 1;
      return;
    }

    const station = state.tradeStations[entry.station.systemId];
    if (!station) return;

    station.managerId = manager.id;
    state.credits -= manager.hireCost;
    spent += manager.hireCost;
    executedIds.push(station.systemId);
  });

  if (executedIds.length === 0) {
    return {
      ok: false,
      msgs: [{ text: '💰 信用积分不足，无法批量派驻「' + manager.name + '」。', type: 'error' }],
      meta: { targetCount: targets.length, executedCount: 0, skippedBudget: skippedBudget },
    };
  }

  return {
    ok: true,
    msgs: [{
      text: '👤 已向 ' + executedIds.length + ' 座贸易站批量派驻「' + manager.name + '」，耗费 ' + spent.toLocaleString() + ' 积分（' + _summarizeSystems(executedIds) + '）。' +
        (skippedBudget > 0 ? (' 另有 ' + skippedBudget + ' 站因预算不足暂缓。') : ''),
      type: 'info',
    }],
    meta: { targetCount: targets.length, executedCount: executedIds.length, spent: spent, skippedBudget: skippedBudget, systemIds: executedIds, managerId: manager.id },
  };
}

export function batchSetStrategies(state, strategyId, systemIds) {
  init(state);
  const gate = _getCompanyFeatureGate(state, 'tradeStationBatchOps', '批量下达经营策略');
  if (!gate.ok) {
    return { ok: false, msgs: [{ text: '🏢 ' + gate.msg, type: 'error' }], meta: { targetCount: 0, executedCount: 0 } };
  }
  const strategy = _getStrategyConfig(strategyId);
  const targets = _getBatchTargets(state, systemIds, function (entry) {
    return entry.station.strategyId !== strategy.id;
  });

  if (targets.length === 0) {
    return {
      ok: false,
      msgs: [{ text: '📈 全网贸易站已经在执行「' + strategy.name + '」，无需重复下令。', type: 'info' }],
      meta: { targetCount: 0, executedCount: 0 },
    };
  }

  const executedIds = [];
  targets.forEach(function (entry) {
    const station = state.tradeStations[entry.station.systemId];
    if (!station) return;
    station.strategyId = strategy.id;
    executedIds.push(station.systemId);
  });

  return {
    ok: true,
    msgs: [{
      text: '📈 已向 ' + executedIds.length + ' 座贸易站下达「' + strategy.name + '」全网经营指令（' + _summarizeSystems(executedIds) + '）。',
      type: 'info',
    }],
    meta: { targetCount: targets.length, executedCount: executedIds.length, systemIds: executedIds, strategyId: strategy.id },
  };
}

export function canBuildStation(state, systemId) {
  const stations = _ensureStations(state);
  const system = findSystem(systemId);
  const buildPlan = _getStationBuildPlan(state, systemId);

  if (!system) {
    return { ok: false, msg: '未知星球，无法建设贸易站。' };
  }
  const companyGate = _getCompanyFeatureGate(state, 'tradeStationBuild', '建设贸易站');
  if (!companyGate.ok) {
    return { ok: false, msg: companyGate.msg };
  }
  if (!_isSystemEligible(system)) {
    return { ok: false, msg: system.name + ' 当前不支持建设贸易站。' };
  }
  if (stations[systemId]) {
    return { ok: false, msg: system.name + ' 已经拥有贸易站。' };
  }
  const capacity = getTradeStationCapacityState(state);
  if (capacity.full) {
    return {
      ok: false,
      msg: '当前公司贸易站容量已满（' + capacity.label + '），提升公司等级后可继续扩张。',
    };
  }
  if ((state.visitedSystems || []).indexOf(systemId) === -1 && state.currentSystem !== systemId) {
    return { ok: false, msg: '需先亲自到访 ' + system.name + '，才能决定建站。' };
  }
  if ((state.credits || 0) < buildPlan.buildCost) {
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
  const buildPlan = _getStationBuildPlan(state, systemId);
  const buildCost = buildPlan.buildCost;
  state.credits -= buildCost;
  state.tradeStations[systemId] = _createStation(systemId, state.day || 1, buildCost);
  const discountText = buildPlan.buildCostDiscount > 0
    ? ('（' + Math.round(buildPlan.buildCostDiscount * 100) + '% 勘探折抵）')
    : '';
  const effectNote = _formatExplorationEffectSummary(buildPlan.explorationEffect);

  return {
    ok: true,
    msgs: [{
      text: '🏗 已在 ' + system.name + ' 投资 ' + buildCost.toLocaleString() + ' 积分' + discountText + '，贸易站开始运营。',
      type: 'upgrade',
    }].concat(effectNote ? [{ text: effectNote, type: 'tip' }] : []),
    meta: {
      systemId: systemId,
      buildCost: buildCost,
      baseBuildCost: buildPlan.baseBuildCost,
      buildCostDiscount: buildPlan.buildCostDiscount,
      explorationEffect: buildPlan.explorationEffect,
    },
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
  const nextStationLevel = station.level + 1;
  const requiredCompanyLevel = getTradeStationLevelRequirement(nextStationLevel);
  const companyLevel = getCompanyLevelValue(state);
  if (companyLevel < requiredCompanyLevel) {
    return {
      ok: false,
      msgs: [{
        text: '🏢 ' + _formatCompanyRequirement(requiredCompanyLevel, companyLevel, '升级贸易站至 Lv.' + nextStationLevel),
        type: 'error',
      }],
    };
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
  const managerGate = _getCompanyFeatureGate(state, 'tradeStationManager', '雇佣贸易站管理员');
  if (!managerGate.ok) {
    return { ok: false, msgs: [{ text: '🏢 ' + managerGate.msg, type: 'error' }] };
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
  const strategyGate = _getCompanyFeatureGate(state, 'tradeStationStrategy', '调整贸易站经营策略');
  if (!strategyGate.ok) {
    return { ok: false, msgs: [{ text: '🏢 ' + strategyGate.msg, type: 'error' }] };
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
    station.lastProcessedDay = typeof state.day === 'number' ? state.day : (station.lastProcessedDay || 1);
    station.lastIncome = Math.max(0, income);
    if (income <= 0) return;

    station.totalIncome = (station.totalIncome || 0) + income;
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
