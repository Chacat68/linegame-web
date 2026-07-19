// js/systems/trade/AutoTradeSystem.js — 自动贸易路线计算
// 依赖：data/goods.js, data/systems.js, systems/economy/Economy.js, systems/trade/TradeSystem.js
// 导出：findBestTrade, findBestSellSystem, findQuestRoute

import { GOODS }   from '../../data/goods.js';
import { SYSTEMS, getSystemsByGalaxy, getAccessibleGalaxies, findGalaxy, getSystemAccessState } from '../../data/systems.js';
import { TECHNOLOGIES, TECH_CATEGORIES } from '../../data/technologies.js';
import * as Economy from '../economy/Economy.js';
import * as Faction from '../faction/FactionSystem.js';
import * as Exploration from '../galaxy/ExplorationSystem.js';
import { getTotalCargo } from './TradeSystem.js';
import {
  canUseMarket,
  evaluateTradePolicy,
  getUnitProfitRate,
  hasTradePolicy,
  isGoodAllowedInMarket,
  isOpenMarketGood,
  normalizeTradePolicy,
} from './TradePolicy.js';

export {
  canUseMarket,
  evaluateTradePolicy,
  getUnitProfitRate,
  hasTradePolicy,
  isGoodAllowedInMarket,
  isOpenMarketGood,
  normalizeTradePolicy,
} from './TradePolicy.js';

function _normalizeDispatchProfile(dispatchProfile) {
  var normalized = {
    roleId: 'logistics',
    roleLabel: '主力商运',
    strategyLabel: '默认跑商',
    strategyNote: '按当前利润与避险程度筛选路线。',
    preferredRiskMode: 'balanced',
    inspectionRiskMultiplier: 1,
    openMarketBonus: 0,
    blackMarketBonus: 0,
    lowRiskBonus: 0,
    highRiskPenalty: 0,
    fuelCostWeight: 1,
    cargoValueWeight: 1,
    legalTradeBonus: 0,
    techRouteBonus: 0,
    faultPressurePenalty: 0,
    faultPressure: 0,
    faultCount: 0,
    maintenanceValue: 100,
    maintenanceBand: 'pristine',
  };

  if (!dispatchProfile || typeof dispatchProfile !== 'object') return normalized;

  Object.keys(normalized).forEach(function (key) {
    if (dispatchProfile[key] != null) normalized[key] = dispatchProfile[key];
  });

  return normalized;
}

function _isTechRouteSystem(system) {
  return !!(system && ['technology', 'research', 'medical', 'special'].indexOf(system.type) !== -1);
}

var RESEARCH_SUPPLY_FOCUSES = {
  engineering: {
    label: '工程补给',
    summary: '偏好工业材料、技术组件与制造链补给。',
    goodScores: { technology: 112, minerals: 96, medicine: 18 },
    buySystemScores: { mining: 80, industrial: 72, technology: 56, energy: 34 },
    sellSystemScores: { technology: 94, industrial: 82, research: 68, military: 36 },
    riskMode: 'balanced',
  },
  commerce: {
    label: '贸易补给',
    summary: '偏好高附加值货物与商业终端循环。',
    goodScores: { luxury: 108, technology: 78, medicine: 34, food: 20 },
    buySystemScores: { commercial: 82, technology: 52, agricultural: 30, medical: 22 },
    sellSystemScores: { commercial: 100, special: 58, technology: 44, medical: 28 },
    riskMode: 'balanced',
  },
  exploration: {
    label: '远征补给',
    summary: '偏好科研样本、远征物资与边疆研究站。',
    goodScores: { technology: 104, medicine: 76, luxury: 18, water: 14 },
    buySystemScores: { research: 76, technology: 66, medical: 60, special: 24 },
    sellSystemScores: { research: 102, special: 80, technology: 58, medical: 42 },
    riskMode: 'safe',
  },
};

function _getGoodById(goodId) {
  return GOODS.find(function (good) { return good.id === goodId; }) || null;
}

function _getSystemById(systemId) {
  return SYSTEMS.find(function (system) { return system.id === systemId; }) || null;
}

function _getTradeCandidateSystems(state, options) {
  options = options || {};

  var allowedSystemIds = Array.isArray(options.systemIds) && options.systemIds.length > 0
    ? Array.from(new Set(options.systemIds))
    : null;
  var playerLevel = options.playerLevel || state.playerLevel || 1;
  var currentGalaxy = options.currentGalaxy || state.currentGalaxy || 'milky_way';
  var researchedTechs = Array.isArray(options.researchedTechs)
    ? options.researchedTechs
    : (state.researchedTechs || []);

  if (allowedSystemIds) {
    return allowedSystemIds.map(function (id) {
      return _getSystemById(id);
    }).filter(function (system) {
      return !!system && playerLevel >= (system.minLevel || 1);
    });
  }

  if (!options.allowCrossGalaxy) {
    return getSystemsByGalaxy(currentGalaxy).filter(function (system) {
      return playerLevel >= (system.minLevel || 1);
    });
  }

  var accessibleGalaxyIds = getAccessibleGalaxies(playerLevel, researchedTechs).map(function (galaxy) {
    return galaxy.id;
  });

  return SYSTEMS.filter(function (system) {
    return accessibleGalaxyIds.indexOf(system.galaxyId) !== -1
      && playerLevel >= (system.minLevel || 1);
  });
}

function _getGalaxyTradeProfile(galaxyId) {
  var galaxy = findGalaxy(galaxyId);
  return galaxy && galaxy.tradeProfile ? galaxy.tradeProfile : null;
}

function _scoreTradeThemeRoute(good, buySystem, sellSystem) {
  if (!good || !buySystem || !sellSystem) {
    return {
      score: 0,
      reasons: [],
      summary: '',
      routeModeLabel: '星系内中转',
      isCrossGalaxy: false,
      buyGalaxyName: buySystem && buySystem.galaxyId ? ((findGalaxy(buySystem.galaxyId) || {}).name || buySystem.galaxyId) : '',
      sellGalaxyName: sellSystem && sellSystem.galaxyId ? ((findGalaxy(sellSystem.galaxyId) || {}).name || sellSystem.galaxyId) : '',
    };
  }

  var buyGalaxy = findGalaxy(buySystem.galaxyId);
  var sellGalaxy = findGalaxy(sellSystem.galaxyId);
  var buyProfile = _getGalaxyTradeProfile(buySystem.galaxyId);
  var sellProfile = _getGalaxyTradeProfile(sellSystem.galaxyId);
  var isCrossGalaxy = buySystem.galaxyId !== sellSystem.galaxyId;
  var reasons = [];
  var summaryParts = [];
  var score = 0;

  if (buyProfile && Array.isArray(buyProfile.exports) && buyProfile.exports.indexOf(good.id) !== -1) {
    score += isCrossGalaxy ? 90 : 55;
    reasons.push('顺着' + (buyGalaxy ? buyGalaxy.name : '买入地') + '主供');
    summaryParts.push((buyGalaxy ? buyGalaxy.name : '买入地') + '主供' + good.name);
  }

  if (sellProfile && Array.isArray(sellProfile.imports) && sellProfile.imports.indexOf(good.id) !== -1) {
    score += isCrossGalaxy ? 110 : 70;
    reasons.push('命中' + (sellGalaxy ? sellGalaxy.name : '卖出地') + '缺口');
    summaryParts.push((sellGalaxy ? sellGalaxy.name : '卖出地') + '高价收' + good.name);
  }

  if (buyProfile && Array.isArray(buyProfile.imports) && buyProfile.imports.indexOf(good.id) !== -1) {
    score -= 36;
  }

  if (sellProfile && Array.isArray(sellProfile.exports) && sellProfile.exports.indexOf(good.id) !== -1) {
    score -= 36;
  }

  if (isCrossGalaxy && summaryParts.length >= 2) {
    score += 58;
    reasons.push('形成跨星系低买高卖路线');
  }

  return {
    score: score,
    reasons: Array.from(new Set(reasons)).slice(0, 2),
    summary: summaryParts.length > 0 ? summaryParts.join(' → ') : '',
    routeModeLabel: isCrossGalaxy ? '跨星系低买高卖' : '星系内中转',
    isCrossGalaxy: isCrossGalaxy,
    buyGalaxyName: buyGalaxy ? buyGalaxy.name : buySystem.galaxyId,
    sellGalaxyName: sellGalaxy ? sellGalaxy.name : sellSystem.galaxyId,
  };
}

function _buildDispatchStrategySummary(dispatchProfile, routeFit, fallbackNote, extraReasons, prioritizeExtra) {
  var routeReasons = routeFit && Array.isArray(routeFit.reasons) ? routeFit.reasons : [];
  var additionalReasons = Array.isArray(extraReasons) ? extraReasons : [];
  var reasons = prioritizeExtra
    ? additionalReasons.concat(routeReasons)
    : routeReasons.concat(additionalReasons);

  reasons = Array.from(new Set(reasons)).slice(0, 2);
  return dispatchProfile.strategyLabel + (reasons.length > 0
    ? '：' + reasons.join('，')
    : (fallbackNote ? '：' + fallbackNote : ''));
}

function _getResearchSupplyFocus(state, options) {
  options = options || {};

  var techId = options.researchTechId || options.techId || null;
  var sourceLabel = '候选方向';

  if (!techId && state.currentResearch && state.currentResearch.techId) {
    techId = state.currentResearch.techId;
    sourceLabel = '当前研究';
  }

  if (!techId) {
    var optionTechId = Array.isArray(options.researchOptions) && options.researchOptions.length > 0
      ? options.researchOptions[0]
      : ((state.researchOptions || [])[0] || null);
    techId = optionTechId;
  }

  if (!techId) return null;

  var tech = TECHNOLOGIES.find(function (item) { return item.id === techId; });
  if (!tech) return null;

  var category = TECH_CATEGORIES.find(function (item) { return item.id === tech.category; });
  return {
    techId: tech.id,
    techName: tech.name,
    categoryId: tech.category,
    categoryLabel: category ? category.name : tech.category,
    sourceLabel: sourceLabel,
  };
}

function _scoreDispatchRouteFit(dispatchProfile, context) {
  var score = 0;
  var reasons = [];

  if (context.marketMode === 'black' && dispatchProfile.blackMarketBonus) {
    score += dispatchProfile.blackMarketBonus;
    reasons.push('匹配黑市偏好');
  }
  if (context.marketMode === 'open' && dispatchProfile.openMarketBonus) {
    score += dispatchProfile.openMarketBonus;
    reasons.push('匹配公开市场');
  }
  if (context.riskAssessment && context.riskAssessment.riskLevel === 'low' && dispatchProfile.lowRiskBonus) {
    score += dispatchProfile.lowRiskBonus;
    reasons.push('低风险契合');
  }
  if (context.riskAssessment && context.riskAssessment.riskLevel === 'high' && dispatchProfile.highRiskPenalty) {
    score -= dispatchProfile.highRiskPenalty;
    reasons.push('高风险扣分');
  }
  if (context.good && context.good.legality === 'legal' && dispatchProfile.legalTradeBonus) {
    score += dispatchProfile.legalTradeBonus;
    reasons.push('适配合规货运');
  }
  if ((_isTechRouteSystem(context.buySystem) || _isTechRouteSystem(context.sellSystem)) && dispatchProfile.techRouteBonus) {
    score += dispatchProfile.techRouteBonus;
    reasons.push('匹配科研敏感航线');
  }
  if (dispatchProfile.cargoValueWeight > 1 && Number.isFinite(context.canBuy)) {
    score += Math.round((dispatchProfile.cargoValueWeight - 1) * Math.min(24, context.canBuy) * 4);
  }
  if (dispatchProfile.fuelCostWeight > 1 && Number.isFinite(context.fuelCredits)) {
    score -= Math.round(context.fuelCredits * (dispatchProfile.fuelCostWeight - 1) * 0.5);
    if (context.fuelCredits > 0) reasons.push('压低长航程');
  }
  if (dispatchProfile.faultPressure > 0) {
    var pressurePenalty = 0;
    if (context.marketMode === 'black') pressurePenalty += dispatchProfile.faultPressurePenalty;
    if (context.riskAssessment && context.riskAssessment.riskLevel === 'high') {
      pressurePenalty += Math.round(dispatchProfile.faultPressurePenalty * 0.75);
    } else if (context.riskAssessment && context.riskAssessment.riskLevel === 'medium') {
      pressurePenalty += Math.round(dispatchProfile.faultPressurePenalty * 0.35);
    }
    if (context.inspectionRisk && !context.inspectionRisk.protectedByBlackMarket && (context.inspectionRisk.checkChancePercent || 0) >= 10) {
      pressurePenalty += Math.round(dispatchProfile.faultPressurePenalty * 0.5);
    }

    if (pressurePenalty > 0) {
      score -= pressurePenalty;
      reasons.push('当前船况压制高风险');
    } else if (context.riskAssessment && context.riskAssessment.riskLevel === 'low') {
      reasons.push('当前船况适合低压循环');
    }
  }

  return {
    score: score,
    reasons: Array.from(new Set(reasons)).slice(0, 2),
  };
}

function _scoreSurveyIntelForRoute(state, buySystem, sellSystem, focus) {
  var score = 0;
  var reasons = [];
  var summaries = [];
  var focusCategory = focus && focus.categoryId ? focus.categoryId : '';
  var buyIntel = buySystem ? Exploration.getSurveyDecisionIntel(state, buySystem.id) : null;
  var sellIntel = sellSystem ? Exploration.getSurveyDecisionIntel(state, sellSystem.id) : null;

  function applyIntel(intel, roleLabel) {
    if (!intel || !intel.hasIntel) return;

    if (intel.routeSignal) {
      score += 38;
      reasons.push(roleLabel + '隐藏航线已记录');
      summaries.push(roleLabel + intel.dispatchHint);
    }
    if (intel.marketSignal) {
      score += focusCategory === 'commerce' ? 76 : 42;
      reasons.push(roleLabel + '贸易报告');
      summaries.push(roleLabel + intel.marketHint);
    }
    if (intel.researchSignal) {
      score += (focusCategory === 'engineering' || focusCategory === 'exploration') ? 74 : 32;
      reasons.push(roleLabel + '科研报告');
      if (intel.researchHint) summaries.push(roleLabel + intel.researchHint);
    }
    if (intel.logisticsSignal) {
      score += roleLabel === '买入地' ? 28 : 16;
      reasons.push(roleLabel + '补给报告');
      summaries.push(roleLabel + intel.marketHint);
    }
  }

  applyIntel(buyIntel, '买入地');
  applyIntel(sellIntel, '卖出地');

  reasons = Array.from(new Set(reasons)).slice(0, 2);
  summaries = Array.from(new Set(summaries)).slice(0, 1);

  return {
    score: score,
    reasons: reasons,
    summary: summaries.length > 0 ? ('探索线索：' + summaries[0]) : '',
  };
}

function _scoreQuestRouteCandidate(state, route, dispatchProfile, options) {
  var good = _getGoodById(route.goodId);
  var buySystem = _getSystemById(route.buySystemId);
  var sellSystem = _getSystemById(route.sellSystemId);
  var currentSystem = options.currentSystem || state.currentSystem;
  var fuelEfficiency = options.fuelEfficiency || state.fuelEfficiency || 1;
  var fuelUnitPrice = Number.isFinite(options.fuelUnitPrice)
    ? options.fuelUnitPrice
    : Economy.getBuyPrice(currentSystem, 'fuel', state);
  var travelToBuyFuel = currentSystem === route.buySystemId
    ? 0
    : Economy.getFuelCost(currentSystem, route.buySystemId, fuelEfficiency, state);
  var travelToSellFuel = route.buySystemId === route.sellSystemId
    ? 0
    : Economy.getFuelCost(route.buySystemId, route.sellSystemId, fuelEfficiency, state);
  var totalFuelCost = travelToBuyFuel + travelToSellFuel;
  var fuelCredits = totalFuelCost * fuelUnitPrice;
  var riskAssessment = good
    ? assessTradeRisk(good, route.buySystemId, route.sellSystemId, 'open')
    : { riskLevel: 'low', buyEnforcement: 'low', sellEnforcement: 'low', tags: [] };
  var inspectionRisk = good
    ? estimateDispatchInspectionRisk(state, good, Math.max(1, route.quantity || 1), route.sellSystemId, 'open', {
      checkChanceMultiplier: dispatchProfile.inspectionRiskMultiplier,
    })
    : { protectedByBlackMarket: false, checkChancePercent: 0 };
  var routeFit = _scoreDispatchRouteFit(dispatchProfile, {
    marketMode: 'open',
    good: good,
    buySystem: buySystem,
    sellSystem: sellSystem,
    canBuy: route.quantity || 1,
    fuelCredits: fuelCredits,
    riskAssessment: riskAssessment,
    inspectionRisk: inspectionRisk,
  });
  var themeFit = _scoreTradeThemeRoute(good, buySystem, sellSystem);
  var surveyFit = _scoreSurveyIntelForRoute(state, buySystem, sellSystem, null);
  var quantity = Math.max(1, route.quantity || 1);
  var score = (route.priority || 0) * 1000
    + routeFit.score
    + themeFit.score
    + surveyFit.score
    + (route.inCargo ? 160 : 0)
    + (((route.unitRevenue || 0) - (route.unitCost || 0)) * quantity)
    - fuelCredits
    - ((route.unitCost || 0) * quantity * (route.inCargo ? 0 : 0.2));

  return {
    score: score,
    route: Object.assign({}, route, {
      buySystemName: buySystem ? buySystem.name : route.buySystemId,
      sellSystemName: sellSystem ? sellSystem.name : route.sellSystemId,
      buyGalaxyId: buySystem ? buySystem.galaxyId : null,
      buyGalaxyName: themeFit.buyGalaxyName,
      sellGalaxyId: sellSystem ? sellSystem.galaxyId : null,
      sellGalaxyName: themeFit.sellGalaxyName,
      goodName: good ? good.name : route.goodId,
      strategyLabel: dispatchProfile.strategyLabel,
      strategySummary: _buildDispatchStrategySummary(dispatchProfile, routeFit, dispatchProfile.strategyNote, surveyFit.reasons.concat(themeFit.reasons), true),
      routeFitScore: routeFit.score,
      themeScore: themeFit.score,
      surveyIntelScore: surveyFit.score,
      surveyIntelSummary: surveyFit.summary,
      tradeThemeSummary: themeFit.summary,
      routeModeLabel: themeFit.routeModeLabel,
      dispatchProfile: dispatchProfile,
      riskLevel: riskAssessment.riskLevel,
      inspectionRisk: inspectionRisk,
      estimatedFuelCost: totalFuelCost,
      recommendedTradePolicy: {
        maxBuyPrice: null,
        minSellPrice: null,
        minProfitRate: null,
        riskMode: dispatchProfile.preferredRiskMode || 'balanced',
        marketMode: 'open',
      },
    }),
  };
}

function _getSellPriceForMarket(state, systemId, good, marketMode) {
  if (marketMode === 'black' && canUseMarket(state, systemId, 'black') && Economy.isBlackMarketGood(good.id)) {
    return Economy.getBlackMarketSellPrice(systemId, good.id, state);
  }
  return Economy.getSellPrice(systemId, good.id, state);
}

export function assessTradeRisk(good, buySystemId, sellSystemId, marketMode) {
  var buyEnforcement = Economy.getEnforcementLevel(buySystemId);
  var sellEnforcement = Economy.getEnforcementLevel(sellSystemId);
  var riskScore = 0;
  var tags = [];

  if (!good) {
    return {
      riskScore: 99,
      riskLevel: 'high',
      tags: ['unknown_good'],
      buyEnforcement: buyEnforcement,
      sellEnforcement: sellEnforcement,
    };
  }

  if (!isOpenMarketGood(good)) {
    riskScore += 100;
    tags.push('black_market_only');
  }

  if (marketMode === 'black') {
    riskScore += 2;
    tags.push('black_market_route');
  }

  if (good.legality === 'restricted') {
    riskScore += 2;
    tags.push('restricted_good');
  } else if (good.legality === 'illegal') {
    riskScore += 5;
    tags.push('illegal_good');
  }

  const regulatedRoute = marketMode === 'black' || good.legality !== 'legal';
  if (regulatedRoute) {
    if (buyEnforcement === 'high') {
      riskScore += 2;
      tags.push('high_enforcement_buy');
    } else if (buyEnforcement === 'medium') {
      riskScore += 1;
    }

    if (sellEnforcement === 'high') {
      riskScore += 2;
      tags.push('high_enforcement_sell');
    } else if (sellEnforcement === 'medium') {
      riskScore += 1;
    }
  }

  var riskLevel = 'low';
  if (riskScore >= 5) riskLevel = 'high';
  else if (riskScore >= 2) riskLevel = 'medium';

  return {
    riskScore: riskScore,
    riskLevel: riskLevel,
    tags: tags,
    buyEnforcement: buyEnforcement,
    sellEnforcement: sellEnforcement,
  };
}

export function applyRiskPreference(profit, riskAssessment, policy) {
  var normalized = normalizeTradePolicy(policy);
  var tags = riskAssessment && riskAssessment.tags ? riskAssessment.tags : [];
  var riskScore = riskAssessment ? riskAssessment.riskScore : 0;

  if (normalized.marketMode !== 'black' && tags.indexOf('black_market_only') !== -1) {
    return { allowed: false, adjustedProfit: profit };
  }

  if (normalized.riskMode === 'safe') {
    if (tags.indexOf('restricted_good') !== -1 || tags.indexOf('illegal_good') !== -1) {
      return { allowed: false, adjustedProfit: profit };
    }
    if (tags.indexOf('black_market_route') !== -1) {
      return { allowed: false, adjustedProfit: profit };
    }
    if (tags.indexOf('high_enforcement_buy') !== -1 || tags.indexOf('high_enforcement_sell') !== -1) {
      return { allowed: false, adjustedProfit: profit };
    }
    return { allowed: true, adjustedProfit: profit - riskScore * 50 };
  }

  if (normalized.riskMode === 'aggressive') {
    var aggressiveBonus = tags.indexOf('restricted_good') !== -1 ? 100 : 0;
    return { allowed: true, adjustedProfit: profit - riskScore * 10 + aggressiveBonus };
  }

  return { allowed: true, adjustedProfit: profit - riskScore * 30 };
}

export function estimateDispatchInspectionRisk(state, good, quantity, sellSystemId, marketMode, options) {
  options = options || {};
  var cargo = {};
  var riskEstimate;

  if (good && Number.isFinite(quantity) && quantity > 0) {
    cargo[good.id] = quantity;
  }

  riskEstimate = Economy.estimateSmugglingCargoRisk(state, sellSystemId, cargo);
  var adjustedChance = Math.max(0, Math.min(1, riskEstimate.checkChance * (options.checkChanceMultiplier || 1)));

  return {
    marketMode: marketMode || 'open',
    enforcement: riskEstimate.enforcement,
    enforcementLabel: riskEstimate.enforcementLabel,
    isHighEnforcement: riskEstimate.enforcement === 'high',
    hasContraband: riskEstimate.hasContraband,
    contrabandGoods: riskEstimate.contrabandGoods,
    protectedByBlackMarket: riskEstimate.protectedByBlackMarket,
    checkChance: adjustedChance,
    checkChancePercent: Math.round(adjustedChance * 100),
  };
}

export function findBestDispatchRoute(state, options, tradePolicy) {
  options = options || {};
  var normalizedPolicy = normalizeTradePolicy(tradePolicy);
  var dispatchProfile = _normalizeDispatchProfile(options.dispatchProfile);

  var currentSystem = options.currentSystem || state.currentSystem;
  var currentGalaxy = options.currentGalaxy || state.currentGalaxy || 'milky_way';
  var fuelEfficiency = Number.isFinite(options.fuelEfficiency) ? options.fuelEfficiency : state.fuelEfficiency;
  var credits = Number.isFinite(options.credits) ? options.credits : state.credits;
  var cargoFree = Number.isFinite(options.cargoFree) ? options.cargoFree : (state.maxCargo - getTotalCargo(state));
  var allowedSystemIds = Array.isArray(options.systemIds) && options.systemIds.length > 0 ? options.systemIds : null;
  var playerLevel = options.playerLevel || state.playerLevel || 1;

  if (!currentSystem || cargoFree <= 0 || credits <= 0) return null;

  var systems = _getTradeCandidateSystems(state, {
    systemIds: allowedSystemIds,
    currentGalaxy: currentGalaxy,
    playerLevel: playerLevel,
    researchedTechs: state.researchedTechs || [],
    allowCrossGalaxy: !!options.allowCrossGalaxy,
  });

  if (systems.length < 2) return null;

  var fuelUnitPrice = Economy.getBuyPrice(currentSystem, 'fuel', state);
  var best = null;

  GOODS.forEach(function (good) {
    if (good.id === 'fuel' || !isGoodAllowedInMarket(good, normalizedPolicy.marketMode)) return;

    systems.forEach(function (buySys) {
      if (!canUseMarket(state, buySys.id, normalizedPolicy.marketMode)) return;
      var buyPrice = Economy.getBuyPrice(buySys.id, good.id, state);
      if (normalizedPolicy.marketMode === 'black') {
        buyPrice = Economy.getBlackMarketBuyPrice(buySys.id, good.id, state);
      }
      if (buyPrice <= 0) return;

      var canBuy = Math.min(Math.floor(credits / buyPrice), cargoFree);
      if (canBuy <= 0) return;

      systems.forEach(function (sellSys) {
        if (sellSys.id === buySys.id) return;

        var sellPrice = _getSellPriceForMarket(state, sellSys.id, good, normalizedPolicy.marketMode);
        var policyCheck = evaluateTradePolicy(buyPrice, sellPrice, normalizedPolicy);
        if (!policyCheck.ok) return;
        var riskAssessment = assessTradeRisk(good, buySys.id, sellSys.id, normalizedPolicy.marketMode);

        var travelToBuyFuel = currentSystem === buySys.id ? 0 : Economy.getFuelCost(currentSystem, buySys.id, fuelEfficiency, state);
        var travelToSellFuel = buySys.id === sellSys.id ? 0 : Economy.getFuelCost(buySys.id, sellSys.id, fuelEfficiency, state);
        var totalFuelCost = travelToBuyFuel + travelToSellFuel;
        var fuelCredits = totalFuelCost * fuelUnitPrice;
        var profit = (sellPrice - buyPrice) * canBuy - fuelCredits;
        var riskAdjusted = applyRiskPreference(profit, riskAssessment, normalizedPolicy);
        var inspectionRisk = estimateDispatchInspectionRisk(state, good, canBuy, sellSys.id, normalizedPolicy.marketMode, {
          checkChanceMultiplier: dispatchProfile.inspectionRiskMultiplier,
        });
        var routeFit = _scoreDispatchRouteFit(dispatchProfile, {
          marketMode: normalizedPolicy.marketMode,
          good: good,
          buySystem: buySys,
          sellSystem: sellSys,
          canBuy: canBuy,
          fuelCredits: fuelCredits,
          riskAssessment: riskAssessment,
          inspectionRisk: inspectionRisk,
        });
        var themeFit = _scoreTradeThemeRoute(good, buySys, sellSys);
        var surveyFit = _scoreSurveyIntelForRoute(state, buySys, sellSys, null);
        var totalScore = riskAdjusted.adjustedProfit + routeFit.score + themeFit.score + surveyFit.score;

        if (!riskAdjusted.allowed) return;

        if (!best || totalScore > best.adjustedProfit) {
          best = {
            buySystemId: buySys.id,
            buySystemName: buySys.name,
            sellSystemId: sellSys.id,
            sellSystemName: sellSys.name,
            buyGalaxyId: buySys.galaxyId,
            buyGalaxyName: themeFit.buyGalaxyName,
            sellGalaxyId: sellSys.galaxyId,
            sellGalaxyName: themeFit.sellGalaxyName,
            goodId: good.id,
            goodName: good.name,
            quantity: canBuy,
            buyPrice: buyPrice,
            sellPrice: sellPrice,
            profit: profit,
            adjustedProfit: totalScore,
            baseAdjustedProfit: riskAdjusted.adjustedProfit,
            profitRate: policyCheck.profitRate,
            fuelCost: totalFuelCost,
            riskLevel: riskAssessment.riskLevel,
            riskTags: riskAssessment.tags,
            buyEnforcement: riskAssessment.buyEnforcement,
            sellEnforcement: riskAssessment.sellEnforcement,
            inspectionRisk: inspectionRisk,
            marketMode: normalizedPolicy.marketMode,
            strategyLabel: dispatchProfile.strategyLabel,
            strategySummary: _buildDispatchStrategySummary(dispatchProfile, routeFit, dispatchProfile.strategyNote, surveyFit.reasons.concat(themeFit.reasons), true),
            routeFitScore: routeFit.score,
            themeScore: themeFit.score,
            surveyIntelScore: surveyFit.score,
            surveyIntelSummary: surveyFit.summary,
            tradeThemeSummary: themeFit.summary,
            routeModeLabel: themeFit.routeModeLabel,
            dispatchProfile: dispatchProfile,
            recommendedTradePolicy: {
              maxBuyPrice: normalizedPolicy.maxBuyPrice,
              minSellPrice: normalizedPolicy.minSellPrice,
              minProfitRate: normalizedPolicy.minProfitRate,
              riskMode: normalizedPolicy.riskMode,
              marketMode: normalizedPolicy.marketMode,
            },
          };
        }
      });
    });
  });

  return best;
}

/**
 * 在当前星系寻找最优买入商品及最优目标星系。
 * 综合考虑买入价格、目标卖出价格与燃料成本。
 * @param {object} state
 * @returns {{ goodId, goodName, sellSystemId, sellSystemName, quantity, profit, buyPrice, sellPrice, fuelCost } | null}
 */
export function findBestTrade(state, tradePolicy) {
  var normalizedPolicy = normalizeTradePolicy(tradePolicy);
  const cargoFree = state.maxCargo - getTotalCargo(state);
  if (cargoFree <= 0) return null;

  // 燃料单价只与当前星系有关，在循环外计算一次
  const fuelUnitPrice = Economy.getBuyPrice(state.currentSystem, 'fuel', state);

  let best = null;

  GOODS.forEach(function (good) {
    if (good.id === 'fuel' || !isGoodAllowedInMarket(good, normalizedPolicy.marketMode)) return;

    if (!canUseMarket(state, state.currentSystem, normalizedPolicy.marketMode)) return;

    const buyPrice = normalizedPolicy.marketMode === 'black'
      ? Economy.getBlackMarketBuyPrice(state.currentSystem, good.id, state)
      : Economy.getBuyPrice(state.currentSystem, good.id, state);
    if (buyPrice <= 0) return;
    const canBuy = Math.min(Math.floor(state.credits / buyPrice), cargoFree);
    if (canBuy <= 0) return;

    SYSTEMS.forEach(function (sys) {
      if (sys.id === state.currentSystem) return;
      // 只搜索同星系内的星球
      if (sys.galaxyId !== (state.currentGalaxy || 'milky_way')) return;
      // 跳过未解锁或当前燃料无法抵达的星球
      const accessState = getSystemAccessState(sys.id, state.playerLevel || 1, state.researchedTechs || []);
      if (!accessState.unlocked) return;
      const sellPrice    = _getSellPriceForMarket(state, sys.id, good, normalizedPolicy.marketMode);
      const fuelCost     = Economy.getFuelCost(state.currentSystem, sys.id, state.fuelEfficiency, state);
      if (Number.isFinite(state.fuel) && fuelCost > state.fuel) return;
      const fuelCredits  = fuelCost * fuelUnitPrice;
      const profit       = (sellPrice - buyPrice) * canBuy - fuelCredits;
      const policyCheck  = evaluateTradePolicy(buyPrice, sellPrice, normalizedPolicy);
      const riskAssessment = assessTradeRisk(good, state.currentSystem, sys.id, normalizedPolicy.marketMode);
      const riskAdjusted = applyRiskPreference(profit, riskAssessment, normalizedPolicy);

      if (!policyCheck.ok || !riskAdjusted.allowed) return;

      if (!best || riskAdjusted.adjustedProfit > best.adjustedProfit) {
        best = {
          goodId:         good.id,
          goodName:       good.name,
          sellSystemId:   sys.id,
          sellSystemName: sys.name,
          quantity:       canBuy,
          profit:         profit,
          adjustedProfit: riskAdjusted.adjustedProfit,
          profitRate:     policyCheck.profitRate,
          buyPrice:       buyPrice,
          sellPrice:      sellPrice,
          fuelCost:       fuelCost,
          riskLevel:      riskAssessment.riskLevel,
          riskTags:       riskAssessment.tags,
          marketMode:     normalizedPolicy.marketMode,
        };
      }
    });
  });

  return best;
}

/**
 * 已有货物时，寻找最优出售星系（综合卖出收入与燃料成本）。
 * @param {object} state
 * @returns {{ systemId, systemName, profit, fuelCost } | null}
 */
export function findBestSellSystem(state) {
  const cargoEntries = Object.entries(state.cargo).filter(function (e) { return e[1] > 0; });
  if (cargoEntries.length === 0) return null;

  // 燃料单价只与当前星系有关，在循环外计算一次
  const fuelUnitPrice = Economy.getBuyPrice(state.currentSystem, 'fuel', state);
  const cargoCost = cargoEntries.reduce(function (sum, entry) {
    return sum + Math.max(0, Number((state.cargoCost || {})[entry[0]]) || 0);
  }, 0);
  let best = null;

  SYSTEMS.forEach(function (sys) {
    if (sys.id === state.currentSystem) return;
    // 只搜索同星系内的星球
    if (sys.galaxyId !== (state.currentGalaxy || 'milky_way')) return;
    // 跳过未解锁或当前燃料无法抵达的星球
    const accessState = getSystemAccessState(sys.id, state.playerLevel || 1, state.researchedTechs || []);
    if (!accessState.unlocked) return;

    let totalRevenue = 0;
    cargoEntries.forEach(function (entry) {
      totalRevenue += Economy.getSellPrice(sys.id, entry[0], state) * entry[1];
    });

    const fuelCost = Economy.getFuelCost(state.currentSystem, sys.id, state.fuelEfficiency, state);
    if (Number.isFinite(state.fuel) && fuelCost > state.fuel) return;
    const fuelExpense = fuelCost * fuelUnitPrice;
    const profit = totalRevenue - cargoCost - fuelExpense;

    if (!best || profit > best.profit) {
      best = {
        systemId:   sys.id,
        systemName: sys.name,
        profit:     profit,
        fuelCost:   fuelCost,
        fuelExpense: fuelExpense,
        cargoCost: cargoCost,
        revenue: totalRevenue,
      };
    }
  });

  return best;
}

/**
 * 根据活跃任务寻找需要执行的贸易路线。
 * 扫描玩家已接取的任务中未完成的目标，找出需要前往特定星球
 * 买入/交付/卖出资源的目标，返回对应的贸易路线。
 * 优先处理有时间限制（更紧急）的任务。
 * @param {object} state
 * @returns {{ buySystemId, sellSystemId, goodId, status, questId, questName } | null}
 */
export function findQuestRoute(state, options) {
  options = options || {};
  if (!state.quests || state.quests.length === 0) return null;

  var currentSystem = options.currentSystem || state.currentSystem;
  var currentGalaxy = options.currentGalaxy || state.currentGalaxy || 'milky_way';
  var playerLevel   = options.playerLevel || state.playerLevel || 1;
  var cargo         = options.cargo || state.cargo || {};
  var dispatchProfile = _normalizeDispatchProfile(options.dispatchProfile);
  var fuelUnitPrice = Economy.getBuyPrice(currentSystem, 'fuel', state);
  var candidateSystems = _getTradeCandidateSystems(state, {
    systemIds: options.systemIds,
    currentGalaxy: currentGalaxy,
    playerLevel: playerLevel,
    researchedTechs: state.researchedTechs || [],
    allowCrossGalaxy: options.allowCrossGalaxy !== false,
  });

  if (candidateSystems.length < 2) return null;

  var bestRoute = null;
  var bestScore = -Infinity;

  state.quests.forEach(function (quest) {
    quest.objectives.forEach(function (obj) {
      // 跳过已完成的目标
      if (obj.current >= (obj.amount || 1)) return;

      // 只处理有 targetSystem 的目标类型
      if (!obj.targetSystem) return;
      if (obj.type !== 'deliver' && obj.type !== 'sell_at' && obj.type !== 'buy_at') return;

      // 检查目标星球是否在当前星系内且已解锁
      var targetAccessible = candidateSystems.some(function (s) { return s.id === obj.targetSystem; });
      if (!targetAccessible) return;

      // 计算优先级：有时间限制的任务更紧急
      var priority = 0;
      if (quest.timeLimit > 0) {
        var daysLeft = quest.timeLimit - ((state.day || 0) - (quest.startDay || 0));
        priority = 100 - Math.max(0, daysLeft);
      }

      var route = null;
      var scoredCandidate = null;
      var neededQty = Math.max(1, (obj.amount || 1) - (obj.current || 0));

      if (obj.type === 'deliver' || obj.type === 'sell_at') {
        // 需要在 targetSystem 卖出/交付 goodId
        var inCargo = cargo[obj.goodId] || 0;
        if (inCargo > 0) {
          // 手中已有货物，直接前往目标星球卖出
          route = {
            buySystemId:  currentSystem,
            sellSystemId: obj.targetSystem,
            goodId:       obj.goodId,
            status:       currentSystem === obj.targetSystem ? 'selling' : 'traveling_sell',
            questId:      quest.id,
            questName:    quest.name,
            quantity:     Math.min(inCargo, neededQty),
            inCargo:      true,
            priority:     priority,
          };
        } else {
          // 需要先买货物：在价格、航程和分工偏好之间找最优来源
          candidateSystems.forEach(function (sys) {
            if (sys.id === obj.targetSystem) return; // 不在目标星球买
            var price = Economy.getBuyPrice(sys.id, obj.goodId, state);
            if (price <= 0) return;

            var candidate = _scoreQuestRouteCandidate(state, {
              buySystemId: sys.id,
              sellSystemId: obj.targetSystem,
              goodId: obj.goodId,
              status: currentSystem === sys.id ? 'buying' : 'traveling_buy',
              questId: quest.id,
              questName: quest.name,
              quantity: neededQty,
              unitCost: price,
              priority: priority,
            }, dispatchProfile, {
              currentSystem: currentSystem,
              fuelEfficiency: options.fuelEfficiency || state.fuelEfficiency || 1,
              fuelUnitPrice: fuelUnitPrice,
            });

            if (!scoredCandidate || candidate.score > scoredCandidate.score) {
              scoredCandidate = candidate;
            }
          });

          if (scoredCandidate) route = scoredCandidate.route;
        }
      } else if (obj.type === 'buy_at') {
        // 需要在 targetSystem 买入 goodId，买完后寻找最优卖出地
        var buyPriceAtTarget = Economy.getBuyPrice(obj.targetSystem, obj.goodId, state);
        if (buyPriceAtTarget <= 0) return;

        candidateSystems.forEach(function (sys) {
          if (sys.id === obj.targetSystem) return;
          var price = Economy.getSellPrice(sys.id, obj.goodId, state);
          if (price <= 0) return;

          var candidate = _scoreQuestRouteCandidate(state, {
            buySystemId: obj.targetSystem,
            sellSystemId: sys.id,
            goodId: obj.goodId,
            status: currentSystem === obj.targetSystem ? 'buying' : 'traveling_buy',
            questId: quest.id,
            questName: quest.name,
            quantity: neededQty,
            unitCost: buyPriceAtTarget,
            unitRevenue: price,
            priority: priority,
          }, dispatchProfile, {
            currentSystem: currentSystem,
            fuelEfficiency: options.fuelEfficiency || state.fuelEfficiency || 1,
            fuelUnitPrice: fuelUnitPrice,
          });

          if (!scoredCandidate || candidate.score > scoredCandidate.score) {
            scoredCandidate = candidate;
          }
        });

        if (scoredCandidate) route = scoredCandidate.route;
      }

      if (route && !scoredCandidate) {
        scoredCandidate = _scoreQuestRouteCandidate(state, route, dispatchProfile, {
          currentSystem: currentSystem,
          fuelEfficiency: options.fuelEfficiency || state.fuelEfficiency || 1,
          fuelUnitPrice: fuelUnitPrice,
        });
      }

      if (scoredCandidate && scoredCandidate.score > bestScore) {
        bestRoute = scoredCandidate.route;
        bestScore = scoredCandidate.score;
      }
    });
  });

  return bestRoute;
}

export function findResearchSupplyRoute(state, options) {
  options = options || {};

  var focus = _getResearchSupplyFocus(state, options);
  if (!focus) return null;

  var focusConfig = RESEARCH_SUPPLY_FOCUSES[focus.categoryId];
  if (!focusConfig) return null;

  var currentSystem = options.currentSystem || state.currentSystem;
  var currentGalaxy = options.currentGalaxy || state.currentGalaxy || 'milky_way';
  var playerLevel = options.playerLevel || state.playerLevel || 1;
  var fuelEfficiency = options.fuelEfficiency || state.fuelEfficiency || 1;
  var cargoFree = Number.isFinite(options.cargoFree) ? options.cargoFree : (state.maxCargo - getTotalCargo(state));
  var credits = Number.isFinite(options.credits) ? options.credits : state.credits;
  var dispatchProfile = _normalizeDispatchProfile(options.dispatchProfile);
  var recommendedRiskMode = focusConfig.riskMode || dispatchProfile.preferredRiskMode || 'balanced';
  var tradeSystems = _getTradeCandidateSystems(state, {
    systemIds: options.systemIds,
    currentGalaxy: currentGalaxy,
    playerLevel: playerLevel,
    researchedTechs: state.researchedTechs || [],
    allowCrossGalaxy: options.allowCrossGalaxy !== false,
  });
  var buySystems = tradeSystems.filter(function (system) {
    return ((focusConfig.buySystemScores && focusConfig.buySystemScores[system.type]) || 0) > 0;
  });
  var sellSystems = tradeSystems.filter(function (system) {
    return ((focusConfig.sellSystemScores && focusConfig.sellSystemScores[system.type]) || 0) > 0;
  });

  if (cargoFree <= 0 || credits <= 0 || buySystems.length === 0 || sellSystems.length === 0) return null;

  var fuelUnitPrice = Economy.getBuyPrice(currentSystem, 'fuel', state);
  var best = null;

  GOODS.forEach(function (good) {
    var goodFocusScore = (focusConfig.goodScores && focusConfig.goodScores[good.id]) || 0;
    if (goodFocusScore <= 0 || good.id === 'fuel' || !isGoodAllowedInMarket(good, 'open')) return;

    buySystems.forEach(function (buySys) {
      var buyTypeScore = (focusConfig.buySystemScores && focusConfig.buySystemScores[buySys.type]) || 0;
      var buyPrice = Economy.getBuyPrice(buySys.id, good.id, state);
      if (buyPrice <= 0) return;

      var canBuy = Math.min(cargoFree, Math.floor(credits / buyPrice));
      if (canBuy <= 0) return;

      sellSystems.forEach(function (sellSys) {
        if (sellSys.id === buySys.id) return;

        var sellTypeScore = (focusConfig.sellSystemScores && focusConfig.sellSystemScores[sellSys.type]) || 0;
        if (sellTypeScore <= 0 && buyTypeScore <= 0) return;

        var sellPrice = Economy.getSellPrice(sellSys.id, good.id, state);
        var travelToBuyFuel = currentSystem === buySys.id ? 0 : Economy.getFuelCost(currentSystem, buySys.id, fuelEfficiency, state);
        var travelToSellFuel = buySys.id === sellSys.id ? 0 : Economy.getFuelCost(buySys.id, sellSys.id, fuelEfficiency, state);
        var totalFuelCost = travelToBuyFuel + travelToSellFuel;
        var fuelCredits = totalFuelCost * fuelUnitPrice;
        var profit = (sellPrice - buyPrice) * canBuy - fuelCredits;
        var riskAssessment = assessTradeRisk(good, buySys.id, sellSys.id, 'open');
        var riskAdjusted = applyRiskPreference(profit, riskAssessment, {
          riskMode: recommendedRiskMode,
          marketMode: 'open',
        });
        var inspectionRisk = estimateDispatchInspectionRisk(state, good, canBuy, sellSys.id, 'open', {
          checkChanceMultiplier: dispatchProfile.inspectionRiskMultiplier,
        });
        var routeFit = _scoreDispatchRouteFit(dispatchProfile, {
          marketMode: 'open',
          good: good,
          buySystem: buySys,
          sellSystem: sellSys,
          canBuy: canBuy,
          fuelCredits: fuelCredits,
          riskAssessment: riskAssessment,
          inspectionRisk: inspectionRisk,
        });
        var themeFit = _scoreTradeThemeRoute(good, buySys, sellSys);
        var surveyFit = _scoreSurveyIntelForRoute(state, buySys, sellSys, focus);
        var focusScore = goodFocusScore + buyTypeScore + sellTypeScore;
        var totalScore = riskAdjusted.adjustedProfit + routeFit.score + focusScore + themeFit.score + surveyFit.score;

        if (!riskAdjusted.allowed) return;

        if (!best || totalScore > best.adjustedProfit) {
          best = {
            buySystemId: buySys.id,
            buySystemName: buySys.name,
            sellSystemId: sellSys.id,
            sellSystemName: sellSys.name,
            buyGalaxyId: buySys.galaxyId,
            buyGalaxyName: themeFit.buyGalaxyName,
            sellGalaxyId: sellSys.galaxyId,
            sellGalaxyName: themeFit.sellGalaxyName,
            goodId: good.id,
            goodName: good.name,
            goodEmoji: good.emoji,
            quantity: canBuy,
            profit: profit,
            adjustedProfit: totalScore,
            baseAdjustedProfit: riskAdjusted.adjustedProfit,
            buyPrice: buyPrice,
            sellPrice: sellPrice,
            fuelCost: totalFuelCost,
            riskLevel: riskAssessment.riskLevel,
            inspectionRisk: inspectionRisk,
            routeFitScore: routeFit.score,
            themeScore: themeFit.score,
            surveyIntelScore: surveyFit.score,
            surveyIntelSummary: surveyFit.summary,
            tradeThemeSummary: themeFit.summary,
            routeModeLabel: themeFit.routeModeLabel,
            focusScore: focusScore,
            strategyLabel: dispatchProfile.strategyLabel,
            strategySummary: _buildDispatchStrategySummary(dispatchProfile, routeFit, focusConfig.summary, surveyFit.reasons.concat(themeFit.reasons), true),
            dispatchProfile: dispatchProfile,
            focusTypeLabel: focus.sourceLabel,
            focusCategoryId: focus.categoryId,
            focusCategoryLabel: focus.categoryLabel,
            focusTechId: focus.techId,
            focusTechName: focus.techName,
            focusLabel: focusConfig.label,
            focusSummary: focusConfig.summary,
            recommendedTradePolicy: {
              maxBuyPrice: null,
              minSellPrice: null,
              minProfitRate: null,
              riskMode: recommendedRiskMode,
              marketMode: 'open',
            },
          };
        }
      });
    });
  });

  return best;
}
