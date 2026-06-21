// js/systems/galaxy/ExplorationSystem.js — 探索系统（扫描 / 着陆 / POI / 秘密航线 / 探索报告）
// 依赖：data/systems.js, systems/galaxy/GalaxyDataLayer.js
// 导出：getScanStatus, getLandingStatus, getPoiStatus, getSurveySummary,
//       scanSystem, landOnSystem, explorePoi, acknowledgeChainFollowup,
//       getTravelRouteInfo, getCurrentSystemSecretRoutes

import { GOODS } from '../../data/goods.js';
import { findSystem, getSystemsByGalaxy } from '../../data/systems.js';
import * as GalaxyData from './GalaxyDataLayer.js';

const BASE_SCAN_FUEL_COST = 6;
const DEEP_SCAN_FUEL_COST = 4;
const BASE_LANDING_FEE = 40;
const LANDING_FEE_PER_LEVEL = 20;
const BASE_SECRET_ROUTE_MULTIPLIER = 0.65;
const CARTOGRAPHY_SECRET_ROUTE_MULTIPLIER = 0.5;
const ORBIT_SCAN_LANDING_DISCOUNT = 0.15;
const DEEP_SCAN_LANDING_DISCOUNT = 0.3;
const CHAIN_SIGNAL_LABELS = {
  derelict_depot: '废弃补给站',
  ancient_relic: '古代遗迹',
  lost_beacon: '失落航标',
};

export function getScanStatus(state, systemId, options) {
  options = options || {};

  const system = findSystem(systemId);
  const exploration = system ? _getExplorationState(systemId) : null;
  const hasDeepScan = options.forceDeepScan || _hasTech(state, 'deep_scanner');
  const baseScanFuelCost = hasDeepScan ? DEEP_SCAN_FUEL_COST : BASE_SCAN_FUEL_COST;
  const scanFuelCost = Math.max(0, Math.round(baseScanFuelCost * Math.max(0, 1 - (options.scanFuelDiscount || 0))));
  const poiCount = exploration && Array.isArray(exploration.pois) ? exploration.pois.length : 0;
  const routeCount = exploration && Array.isArray(exploration.secretRoutes) ? exploration.secretRoutes.length : 0;
  const surveyProfile = system && exploration ? _getSurveyProfile(system, exploration) : null;
  const modeLabel = hasDeepScan ? '深度扫描' : '轨道扫描';
  const scanMode = hasDeepScan ? 'deep' : 'orbit';
  const scanYield = system && exploration ? _getScanYield(state, system, exploration, surveyProfile, scanMode) : _emptyScanYield();
  const scanDirective = system && exploration ? _getScanDirective(state, system, exploration, surveyProfile) : null;
  const scanSignalGrade = system && exploration ? _getScanSignalGrade(system, exploration, surveyProfile, scanMode) : 'C';
  const scanLandingFeeDiscount = _getScanLandingFeeDiscount(scanMode);
  const chainOverview = exploration ? _formatChainScanOverview(exploration) : '';
  const detailText = '执行' + modeLabel + '需要 ' + scanFuelCost + ' 单位燃料，可揭示 ' + poiCount + ' 个探索点' +
    (routeCount > 0 ? '，并校准 ' + routeCount + ' 条可疑暗线信标。' : '。') +
    (chainOverview ? (' 本地可能存在' + chainOverview + '。') : '') +
    (surveyProfile ? (' 当前档案预估为' + surveyProfile.threatLabel + ' / ' + surveyProfile.opportunityLabel + '区域。') : '') +
    ' 扫描会生成测绘图谱，立即结算' + _formatScanYield(scanYield) + '，并让首次着陆费用降低 ' + Math.round(scanLandingFeeDiscount * 100) + '%。' +
    (scanDirective ? (' 建议优先跟进「' + scanDirective.poiName + '」。') : '');

  const result = {
    canScan: true,
    alreadyScanned: false,
    reason: 'ready',
    scanMode: scanMode,
    scanModeLabel: modeLabel,
    scanFuelCost: scanFuelCost,
    scanSignalGrade: scanSignalGrade,
    scanYield: scanYield,
    scanLandingFeeDiscount: scanLandingFeeDiscount,
    scanDirective: scanDirective,
    poiCount: poiCount,
    routeCount: routeCount,
    buttonLabel: '🔭 ' + modeLabel + ' · ' + scanFuelCost + '燃料',
    actionLabel: '执行' + modeLabel + ' · ' + scanFuelCost + ' 燃料',
    detailText: detailText,
    blockedReason: '',
  };

  if (!system) {
    result.canScan = false;
    result.reason = 'unknown-system';
    result.blockedReason = '未知星球，无法执行扫描。';
    return result;
  }
  if (!exploration) {
    result.canScan = false;
    result.reason = 'not-ready';
    result.blockedReason = '当前星球的探索数据尚未就绪。';
    return result;
  }
  if ((((state && state.playerLevel) || 1)) < (system.minLevel || 1)) {
    result.canScan = false;
    result.reason = 'level-locked';
    result.blockedReason = '需要达到 Lv.' + (system.minLevel || 1) + ' 才能执行本地扫描。';
    return result;
  }
  if (!state || state.currentSystem !== systemId) {
    result.canScan = false;
    result.reason = 'not-in-orbit';
    result.blockedReason = '需要先抵达当前星球轨道，才能执行本地扫描。';
    return result;
  }
  if ((exploration.scanLevel || 0) > 0) {
    result.canScan = false;
    result.alreadyScanned = true;
    result.reason = 'already-scanned';
    result.blockedReason = '该星球已完成轨道扫描。';
    return result;
  }
  if (((state && state.fuel) || 0) < scanFuelCost) {
    result.canScan = false;
    result.reason = 'insufficient-fuel';
    result.blockedReason = '燃料不足，扫描需要 ' + scanFuelCost + ' 单位燃料。';
  }

  return result;
}

export function scanSystem(state, systemId, options) {
  const scanStatus = getScanStatus(state, systemId, options);
  const system = findSystem(systemId);
  const exploration = _getExplorationState(systemId);
  if (!scanStatus.canScan) {
    return {
      ok: false,
      msgs: [{ text: _getScanFailureMessage(scanStatus), type: scanStatus.reason === 'already-scanned' ? 'info' : 'error' }],
    };
  }

  state.fuel -= scanStatus.scanFuelCost;
  exploration.scanLevel = scanStatus.scanMode === 'deep' ? 2 : 1;
  exploration.scanCount = (exploration.scanCount || 0) + 1;
  exploration.lastScannedDay = state.day || 1;
  exploration.scanSignalGrade = scanStatus.scanSignalGrade;
  exploration.scanLandingFeeDiscount = scanStatus.scanLandingFeeDiscount || 0;
  exploration.scanYield = _clone(scanStatus.scanYield || _emptyScanYield());
  exploration.scanRecommendation = scanStatus.scanDirective ? scanStatus.scanDirective.reason : '';
  exploration.scanPriorityPoiId = scanStatus.scanDirective ? scanStatus.scanDirective.poiId : '';
  exploration.scanPriorityPoiName = scanStatus.scanDirective ? scanStatus.scanDirective.poiName : '';
  exploration.pois.forEach(function (poi) {
    poi.discovered = true;
    poi.discoveredDay = state.day || 1;
  });
  _syncExplorationChainStates(exploration, { day: state.day || 1 });
  _applyScanYield(state, scanStatus.scanYield);
  const scanReport = _createScanReport(system, exploration, scanStatus, state.day || 1);
  if (scanReport) _appendExplorationReport(exploration, scanReport);
  _saveExplorationState(systemId, exploration);

  var routeCount = (exploration.secretRoutes || []).length;
  var poiCount = (exploration.pois || []).length;
  var directiveText = scanStatus.scanDirective
    ? ('🧭 推荐优先调查「' + scanStatus.scanDirective.poiName + '」：' + scanStatus.scanDirective.reason)
    : '🧭 未发现明确优先目标，可按 POI 清单顺序调查。';
  var msgs = [{
    text: '🔍 已完成对「' + system.name + '」的' + (exploration.scanLevel > 1 ? '深度' : '轨道') + '扫描，消耗 ' + scanStatus.scanFuelCost + ' 单位燃料。',
    type: 'info',
  }];
  msgs.push({
    text: '🗺️ 已标记 ' + poiCount + ' 个可调查探索点' + (routeCount > 0 ? '，并锁定到 ' + routeCount + ' 条可疑暗线信标。' : '。'),
    type: 'tip',
  });
  msgs.push({
    text: '📊 测绘图谱评级 ' + scanStatus.scanSignalGrade + '，结算' + _formatScanYield(scanStatus.scanYield) + '，首次着陆费 -' + Math.round((scanStatus.scanLandingFeeDiscount || 0) * 100) + '%。',
    type: 'upgrade',
  });
  msgs.push({ text: directiveText, type: 'tip' });

  return {
    ok: true,
    msgs: msgs,
    meta: {
      systemId: systemId,
      scanFuelCost: scanStatus.scanFuelCost,
      scanSignalGrade: scanStatus.scanSignalGrade,
      scanYield: scanStatus.scanYield,
      scanLandingFeeDiscount: scanStatus.scanLandingFeeDiscount,
      scanDirective: scanStatus.scanDirective,
      scanReportId: scanReport ? scanReport.id : null,
    },
  };
}

export function getLandingStatus(state, systemId, options) {
  options = options || {};

  const system = findSystem(systemId);
  const exploration = system ? _getExplorationState(systemId) : null;
  const scanLandingFeeDiscount = exploration ? Math.max(0, Math.min(0.8, exploration.scanLandingFeeDiscount || 0)) : 0;
  const landingFeeDiscount = _combineDiscounts(options.landingFeeDiscount || 0, scanLandingFeeDiscount);
  const landingFee = system
    ? Math.max(0, Math.round(_getLandingFee(system) * Math.max(0, 1 - landingFeeDiscount)))
    : 0;
  const unresolvedPoiCount = exploration && Array.isArray(exploration.pois)
    ? exploration.pois.filter(function (poi) { return poi.discovered && !poi.resolved; }).length
    : 0;
  const surveyProfile = system && exploration ? _getSurveyProfile(system, exploration) : null;

  const result = {
    canLand: true,
    alreadyLanded: false,
    reason: 'ready',
    landingFee: landingFee,
    landingFeeDiscount: landingFeeDiscount,
    scanLandingFeeDiscount: scanLandingFeeDiscount,
    unresolvedPoiCount: unresolvedPoiCount,
    actionLabel: '申请首次着陆 · ' + landingFee + ' 积分',
    detailText: '首次着陆需要 ' + landingFee + ' 积分，落地后可立即调查 ' + unresolvedPoiCount + ' 个探索点。' +
      (scanLandingFeeDiscount > 0 ? (' 扫描校准已抵扣 ' + Math.round(scanLandingFeeDiscount * 100) + '% 着陆费用。') : '') +
      (exploration && exploration.scanRecommendation ? (' 当前推荐优先跟进：' + exploration.scanRecommendation) : '') +
      (surveyProfile ? (' 本地测绘目标偏向' + surveyProfile.opportunityLabel + '，完探奖励为「' + surveyProfile.completionRewardLabel + '」。') : ''),
    blockedReason: '',
  };

  if (!system) {
    result.canLand = false;
    result.reason = 'unknown-system';
    result.blockedReason = '未知星球，无法着陆。';
    return result;
  }
  if (!exploration) {
    result.canLand = false;
    result.reason = 'not-ready';
    result.blockedReason = '当前星球的着陆数据尚未就绪。';
    return result;
  }
  if ((((state && state.playerLevel) || 1)) < (system.minLevel || 1)) {
    result.canLand = false;
    result.reason = 'level-locked';
    result.blockedReason = '需要达到 Lv.' + (system.minLevel || 1) + ' 才能执行首次着陆。';
    return result;
  }
  if (!state || state.currentSystem !== systemId) {
    result.canLand = false;
    result.reason = 'not-in-orbit';
    result.blockedReason = '只有停靠在当前星球时才能执行着陆。';
    return result;
  }
  if ((exploration.scanLevel || 0) <= 0) {
    result.canLand = false;
    result.reason = 'not-scanned';
    result.blockedReason = '请先完成轨道扫描，再决定着陆。';
    return result;
  }
  if (exploration.landed) {
    result.canLand = false;
    result.alreadyLanded = true;
    result.reason = 'already-landed';
    result.blockedReason = '该星球已完成首次着陆，可直接继续调查已发现的 POI。';
    return result;
  }
  if (((state && state.credits) || 0) < landingFee) {
    result.canLand = false;
    result.reason = 'insufficient-credits';
    result.blockedReason = '信用积分不足，着陆需要 ' + landingFee + ' 积分。';
  }

  return result;
}

export function landOnSystem(state, systemId, options) {
  const landingStatus = getLandingStatus(state, systemId, options);
  const system = findSystem(systemId);
  const exploration = _getExplorationState(systemId);
  if (!landingStatus.canLand) {
    return {
      ok: false,
      msgs: [{ text: _getLandingFailureMessage(landingStatus), type: landingStatus.reason === 'already-landed' ? 'info' : 'error' }],
    };
  }

  state.credits -= landingStatus.landingFee;
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
      { text: '🛬 已完成对「' + system.name + '」的首次着陆，支付停泊与地面通行费 ' + landingStatus.landingFee + ' 积分。', type: 'info' },
      { text: '🧭 地面行动已解锁，当前有 ' + unresolvedCount + ' 个探索点可调查。', type: 'tip' },
    ],
    meta: { systemId: systemId, landingFee: landingStatus.landingFee },
  };
}

export function getPoiStatus(state, systemId, poiId, options) {
  options = options || {};

  const system = findSystem(systemId);
  const exploration = system ? _getExplorationState(systemId) : null;
  const poi = exploration && Array.isArray(exploration.pois)
    ? exploration.pois.find(function (entry) { return entry.id === poiId; })
    : null;

  const result = {
    canExplore: true,
    reason: 'ready',
    poiKind: poi ? poi.kind : null,
    chainKind: poi && poi.chain ? poi.chain.kind : '',
    chainLabel: poi && poi.chain ? poi.chain.label : '',
    actionLabel: poi ? ('调查 ' + poi.icon + ' ' + poi.name + ' · 无成本') : '调查探索点',
    detailText: poi ? _getPoiPreviewText(state, system, exploration, poi, options) : '',
    blockedReason: '',
  };

  if (!system) {
    result.canExplore = false;
    result.reason = 'unknown-system';
    result.blockedReason = '未知星球，无法调查探索点。';
    return result;
  }
  if (!exploration) {
    result.canExplore = false;
    result.reason = 'not-ready';
    result.blockedReason = '当前星球的探索数据尚未就绪。';
    return result;
  }
  if ((((state && state.playerLevel) || 1)) < (system.minLevel || 1)) {
    result.canExplore = false;
    result.reason = 'level-locked';
    result.blockedReason = '需要达到 Lv.' + (system.minLevel || 1) + ' 才能展开本地调查。';
    return result;
  }
  if (!state || state.currentSystem !== systemId) {
    result.canExplore = false;
    result.reason = 'not-in-orbit';
    result.blockedReason = '只有停靠在当前星球时才能调查本地 POI。';
    return result;
  }
  if (!exploration.landed) {
    result.canExplore = false;
    result.reason = 'not-landed';
    result.blockedReason = '请先完成着陆，再调查地面探索点。';
    return result;
  }
  if (!poi) {
    result.canExplore = false;
    result.reason = 'missing-poi';
    result.blockedReason = '未找到对应的探索点。';
    return result;
  }
  if (!poi.discovered) {
    result.canExplore = false;
    result.reason = 'not-discovered';
    result.blockedReason = '该探索点尚未被扫描发现。';
    return result;
  }
  if (poi.resolved) {
    result.canExplore = false;
    result.reason = 'already-resolved';
    result.blockedReason = '该探索点已经调查完毕。';
    return result;
  }

  return result;
}

export function getSurveySummary(state, systemId) {
  const system = findSystem(systemId);
  const exploration = system ? _getExplorationState(systemId) : null;
  if (!system || !exploration) return null;

  const profile = _getSurveyProfile(system, exploration);
  const totalPois = Array.isArray(exploration.pois) ? exploration.pois.length : 0;
  const resolvedCount = Array.isArray(exploration.pois)
    ? exploration.pois.filter(function (poi) { return poi.resolved; }).length
    : 0;
  const pendingCount = Math.max(0, totalPois - resolvedCount);
  const reports = Array.isArray(exploration.reports)
    ? exploration.reports.slice().sort(function (left, right) {
        return (right.day || 0) - (left.day || 0);
      })
    : [];
  const anomalyChains = _getExplorationChainSummary(exploration);

  return {
    threatLevel: profile.threatLevel,
    threatLabel: profile.threatLabel,
    opportunityFocus: profile.opportunityFocus,
    opportunityLabel: profile.opportunityLabel,
    completionRewardKind: profile.completionRewardKind,
    completionRewardLabel: profile.completionRewardLabel,
    intelLevel: exploration.intelLevel || 0,
    reportCount: reports.length,
    reports: reports,
    anomalyChainCount: anomalyChains.length,
    resolvedAnomalyChainCount: anomalyChains.filter(function (chain) { return chain.resolved; }).length,
    anomalyChains: anomalyChains,
    resolvedCount: resolvedCount,
    totalPois: totalPois,
    pendingCount: pendingCount,
    completed: _isSurveyComplete(exploration),
    completionBonusClaimed: !!exploration.completionBonusClaimed,
    completedDay: exploration.completedDay || 0,
    scanSignalGrade: exploration.scanSignalGrade || '',
    scanLandingFeeDiscount: exploration.scanLandingFeeDiscount || 0,
    scanRecommendation: exploration.scanRecommendation || '',
    scanPriorityPoiId: exploration.scanPriorityPoiId || '',
    scanPriorityPoiName: exploration.scanPriorityPoiName || '',
  };
}

export function getSurveyDecisionIntel(state, systemId) {
  const summary = getSurveySummary(state, systemId);
  if (!summary) return null;

  const reports = Array.isArray(summary.reports) ? summary.reports : [];
  const hasIntel = reports.length > 0;
  const hasDepotReport = _hasReportChainKind(reports, 'derelict_depot');
  const hasRelicReport = _hasReportChainKind(reports, 'ancient_relic');
  const hasBeaconReport = _hasReportChainKind(reports, 'lost_beacon');
  const hasMarketReport = _hasReportSignal(reports, 'market') ||
    (summary.completed && summary.completionRewardKind === 'market');
  const hasResearchReport = _hasReportSignal(reports, 'research') || hasRelicReport ||
    (summary.completed && summary.completionRewardKind === 'research');
  const hasRouteReport = _hasReportSignal(reports, 'route') || hasBeaconReport;
  const hasLogisticsReport = _hasReportSignal(reports, 'logistics') || hasDepotReport ||
    (hasIntel && summary.opportunityFocus === 'logistics') ||
    (summary.completed && summary.completionRewardKind === 'logistics');
  const nextChainFollowup = _getNextChainFollowup(summary.anomalyChains);
  const primarySignal = _getPrimaryDecisionSignal(summary, {
    market: hasMarketReport,
    research: hasResearchReport,
    route: hasRouteReport,
    logistics: hasLogisticsReport,
  });

  return {
    systemId: systemId,
    hasIntel: hasIntel,
    intelLevel: summary.intelLevel,
    reportCount: summary.reportCount,
    recentReportTitle: reports[0] ? reports[0].title : '',
    opportunityFocus: summary.opportunityFocus,
    opportunityLabel: summary.opportunityLabel,
    completed: summary.completed,
    completionRewardKind: summary.completionRewardKind,
    anomalyChainCount: summary.anomalyChainCount,
    resolvedAnomalyChainCount: summary.resolvedAnomalyChainCount,
    anomalyChains: summary.anomalyChains,
    readyFollowupCount: summary.anomalyChains.filter(function (chain) { return chain.followupReady; }).length,
    acknowledgedFollowupCount: summary.anomalyChains.filter(function (chain) { return chain.followupAcknowledged; }).length,
    nextChainFollowup: nextChainFollowup,
    primarySignal: primarySignal,
    primaryLabel: _getDecisionSignalLabel(primarySignal),
    marketSignal: hasMarketReport,
    researchSignal: hasResearchReport,
    routeSignal: hasRouteReport,
    logisticsSignal: hasLogisticsReport,
    depotSignal: hasDepotReport,
    relicSignal: hasRelicReport,
    beaconSignal: hasBeaconReport,
    anomalySignals: {
      derelictDepot: hasDepotReport,
      ancientRelic: hasRelicReport,
      lostBeacon: hasBeaconReport,
    },
    marketHint: _getSurveyMarketHint(summary, primarySignal, hasIntel),
    researchHint: _getSurveyResearchHint(summary, primarySignal, hasIntel),
    dispatchHint: _getSurveyDispatchHint(summary, primarySignal, hasIntel),
    anomalyHint: nextChainFollowup ? nextChainFollowup.reason : _getAnomalyChainHint(reports),
  };
}

export function explorePoi(state, systemId, poiId, options) {
  const poiStatus = getPoiStatus(state, systemId, poiId, options);
  const system = findSystem(systemId);
  const exploration = _getExplorationState(systemId);
  const poi = exploration && Array.isArray(exploration.pois)
    ? exploration.pois.find(function (entry) { return entry.id === poiId; })
    : null;
  if (!poiStatus.canExplore) {
    return {
      ok: false,
      msgs: [{ text: _getPoiFailureMessage(poiStatus), type: poiStatus.reason === 'already-resolved' ? 'info' : 'error' }],
    };
  }

  var result = _resolvePoi(state, system, exploration, poi, options);
  poi.resolved = true;
  poi.resolvedDay = state.day || 1;
  poi.lastOutcome = result.summary;
  if (result.report) {
    _appendExplorationReport(exploration, result.report);
  }
  var chainStates = _syncExplorationChainStates(exploration, {
    day: state.day || 1,
    poiId: poi.id,
    report: result.report || null,
  });
  var chainState = poi.chain && chainStates ? chainStates[poi.chain.id] : null;
  var completionBonus = _grantSurveyCompletionBonus(state, system, exploration);
  _saveExplorationState(systemId, exploration);

  var msgs = [{ text: poi.icon + ' ' + poi.name + '：' + result.summary, type: result.type || 'info' }];
  if (result.report) {
    msgs.push({ text: result.report.icon + ' 已写入勘探报告：「' + result.report.title + '」。', type: 'tip' });
  }
  if (result.followup) {
    msgs.push({ text: result.followup, type: 'tip' });
  }
  if (completionBonus && Array.isArray(completionBonus.msgs)) {
    completionBonus.msgs.forEach(function (message) {
      msgs.push(message);
    });
  }
  return {
    ok: true,
    msgs: msgs,
    meta: {
      systemId: systemId,
      poiId: poiId,
      poiKind: poi.kind,
      chainStateId: chainState ? chainState.id : null,
      chainStage: chainState ? chainState.stage : '',
      reportId: result.report ? result.report.id : null,
      completionBonus: !!completionBonus,
    },
  };
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

export function acknowledgeChainFollowup(state, systemId, chainId) {
  const system = findSystem(systemId);
  const exploration = system ? _getExplorationState(systemId) : null;
  if (!system || !exploration) {
    return { ok: false, msg: '未知星球，无法确认事件链后续。' };
  }

  const chainStates = _syncExplorationChainStates(exploration, { preserveFollowupState: true });
  const targetChainId = chainId || (_getNextChainFollowup(_getExplorationChainSummary(exploration)) || {}).chainId || '';
  if (!targetChainId || !chainStates[targetChainId]) {
    return { ok: false, msg: '未找到可跟进的事件链。' };
  }

  const chainState = chainStates[targetChainId];
  if (!chainState.resolved) {
    return { ok: false, msg: '事件链尚未归档，无法确认后续。' };
  }

  chainStates[targetChainId] = Object.assign({}, chainState, {
    followupReady: false,
    followupAcknowledged: true,
    followupAcknowledgedDay: state && state.day ? state.day : 1,
  });
  _saveExplorationState(systemId, exploration);

  return {
    ok: true,
    msg: '事件链后续已确认。',
    meta: {
      systemId: systemId,
      chainId: targetChainId,
      chainKind: chainState.kind || '',
      chainLabel: chainState.label || CHAIN_SIGNAL_LABELS[chainState.kind] || '探索链',
    },
  };
}

function _hasReportSignal(reports, signal) {
  return Array.isArray(reports) && reports.some(function (report) {
    if (!report) return false;
    if (report.kind === signal) return true;
    return Array.isArray(report.signalTags) && report.signalTags.indexOf(signal) !== -1;
  });
}

function _hasReportChainKind(reports, chainKind) {
  return Array.isArray(reports) && reports.some(function (report) {
    return report && report.chainKind === chainKind;
  });
}

function _getExplorationChainSummary(exploration) {
  if (!exploration || !Array.isArray(exploration.pois)) return [];
  var chainStates = _syncExplorationChainStates(exploration);
  return exploration.pois.filter(function (poi) {
    return poi && poi.chain && poi.chain.kind;
  }).map(function (poi) {
    var chain = poi.chain || {};
    var chainId = chain.id || (poi.id + '_chain');
    var chainState = chainStates[chainId] || {};
    var progress = _getChainProgressFromPoi(poi);
    return {
      id: chainId,
      kind: chain.kind || chainState.kind || '',
      label: chain.label || CHAIN_SIGNAL_LABELS[chain.kind] || '探索链',
      badge: chain.badge || '探索链',
      signal: chain.signal || '',
      poiId: poi.id,
      poiName: poi.name || '探索点',
      discovered: !!chainState.discovered || !!poi.discovered,
      resolved: !!chainState.resolved || !!poi.resolved,
      stage: chainState.stage || progress.stage,
      stageIndex: Number.isFinite(chainState.stageIndex) ? chainState.stageIndex : progress.stageIndex,
      stageLabel: chainState.stageLabel || _getChainStageLabel(chain, progress.stageIndex),
      discoveredDay: chainState.discoveredDay || poi.discoveredDay || 0,
      resolvedDay: chainState.resolvedDay || poi.resolvedDay || 0,
      followupReady: !!chainState.followupReady,
      followupAcknowledged: !!chainState.followupAcknowledged,
      followupAcknowledgedDay: chainState.followupAcknowledgedDay || 0,
      followupLabel: chainState.followupLabel || '',
      reportId: chainState.reportId || '',
    };
  });
}

function _syncExplorationChainStates(exploration, options) {
  if (!exploration || !Array.isArray(exploration.pois)) return {};
  options = options || {};
  if (!exploration.chainStates || typeof exploration.chainStates !== 'object') exploration.chainStates = {};

  exploration.pois.forEach(function (poi) {
    if (!poi || !poi.chain || !poi.chain.kind) return;
    var chain = poi.chain;
    var chainId = chain.id || (poi.id + '_chain');
    var existing = exploration.chainStates[chainId] || {};
    var progress = _getChainProgressFromPoi(poi);
    var isResolved = progress.stage === 'archived';
    var report = options.report && options.report.chainKind === chain.kind ? options.report : null;
    var reportId = isResolved ? (report ? report.id : (existing.reportId || '')) : '';
    var followupAcknowledged = isResolved && !!existing.followupAcknowledged;
    var followupReady = isResolved &&
      !followupAcknowledged &&
      (existing.followupReady || options.poiId === poi.id || !!reportId);

    exploration.chainStates[chainId] = {
      id: chainId,
      kind: chain.kind || existing.kind || '',
      label: chain.label || existing.label || CHAIN_SIGNAL_LABELS[chain.kind] || '探索链',
      badge: chain.badge || existing.badge || '探索链',
      signal: chain.signal || existing.signal || '',
      stage: progress.stage,
      stageIndex: progress.stageIndex,
      stageLabel: _getChainStageLabel(chain, progress.stageIndex),
      poiId: poi.id || existing.poiId || '',
      poiName: poi.name || existing.poiName || '探索点',
      discovered: !!poi.discovered,
      resolved: !!poi.resolved,
      discoveredDay: poi.discovered ? (poi.discoveredDay || existing.discoveredDay || options.day || 0) : 0,
      resolvedDay: poi.resolved ? (poi.resolvedDay || existing.resolvedDay || options.day || 0) : 0,
      followupReady: !!followupReady,
      followupAcknowledged: !!followupAcknowledged,
      followupAcknowledgedDay: followupAcknowledged ? (existing.followupAcknowledgedDay || 0) : 0,
      followupLabel: isResolved ? (existing.followupLabel || _getChainFollowupLabel(chain.kind)) : '',
      reportId: reportId,
    };
  });

  return exploration.chainStates;
}

function _getChainProgressFromPoi(poi) {
  if (poi && poi.resolved) return { stage: 'archived', stageIndex: 2 };
  if (poi && poi.discovered) return { stage: 'discovered', stageIndex: 1 };
  return { stage: 'locked', stageIndex: 0 };
}

function _getChainStageLabel(chain, stageIndex) {
  var stageLabels = chain && Array.isArray(chain.stageLabels) ? chain.stageLabels : [];
  if (stageLabels[stageIndex]) return stageLabels[stageIndex];
  if (stageIndex === 2) return '已归档';
  if (stageIndex === 1) return '待调查';
  return '待扫描';
}

function _getChainFollowupLabel(chainKind) {
  if (chainKind === 'lost_beacon') return '打开市场情报区确认暗线航图与派遣评分。';
  if (chainKind === 'ancient_relic') return '打开市场情报区确认科研补给与风险剖面。';
  if (chainKind === 'derelict_depot') return '打开市场情报区确认商网和派遣整备价值。';
  return '打开市场情报区查看后续经营影响。';
}

function _getNextChainFollowup(anomalyChains) {
  var readyChains = (Array.isArray(anomalyChains) ? anomalyChains : []).filter(function (chain) {
    return chain && chain.followupReady && !chain.followupAcknowledged;
  });
  if (readyChains.length === 0) return null;

  readyChains.sort(function (left, right) {
    var dayDelta = (right.resolvedDay || 0) - (left.resolvedDay || 0);
    if (dayDelta !== 0) return dayDelta;
    return _getChainFollowupPriority(right.kind) - _getChainFollowupPriority(left.kind);
  });

  var chain = readyChains[0];
  return {
    chainId: chain.id || '',
    chainKind: chain.kind || '',
    chainLabel: chain.label || CHAIN_SIGNAL_LABELS[chain.kind] || '探索链',
    poiId: chain.poiId || '',
    poiName: chain.poiName || '',
    reportId: chain.reportId || '',
    signal: chain.signal || '',
    reason: _getChainFollowupReason(chain),
    actionLabel: _getChainFollowupActionLabel(chain),
    workspaceId: _getChainFollowupWorkspace(chain).workspaceId,
    subworkspaceId: _getChainFollowupWorkspace(chain).subworkspaceId,
  };
}

function _getChainFollowupWorkspace(chain) {
  if (chain && chain.kind === 'derelict_depot') {
    return { workspaceId: 'operations', subworkspaceId: 'network' };
  }
  return { workspaceId: 'spot', subworkspaceId: 'intel' };
}

function _getChainFollowupActionLabel(chain) {
  if (chain && chain.kind === 'derelict_depot') return '规划商网';
  if (chain && chain.kind === 'lost_beacon') return '查看航图';
  if (chain && chain.kind === 'ancient_relic') return '查看样本';
  return '查看情报';
}

function _getChainFollowupPriority(chainKind) {
  if (chainKind === 'lost_beacon') return 3;
  if (chainKind === 'ancient_relic') return 2;
  if (chainKind === 'derelict_depot') return 1;
  return 0;
}

function _getChainFollowupReason(chain) {
  var label = chain && chain.label ? chain.label : (CHAIN_SIGNAL_LABELS[chain && chain.kind] || '探索链');
  if (chain && chain.kind === 'lost_beacon') {
    return label + '已归档，打开市场情报区确认暗线航图与派遣评分。';
  }
  if (chain && chain.kind === 'ancient_relic') {
    return label + '样本已归档，打开市场情报区确认科研补给与风险剖面。';
  }
  if (chain && chain.kind === 'derelict_depot') {
    return label + '已复原，打开市场情报区确认商网和派遣整备价值。';
  }
  return label + '已归档，打开市场情报区查看后续经营影响。';
}

function _formatChainScanOverview(exploration) {
  var chains = _getExplorationChainSummary(exploration).map(function (chain) {
    return chain.label;
  });
  chains = Array.from(new Set(chains)).filter(Boolean);
  if (chains.length === 0) return '';
  return chains.join('、');
}

function _getPrimaryDecisionSignal(summary, signals) {
  if (signals && signals.route) return 'route';
  if (signals && signals.research) return 'research';
  if (signals && signals.market) return 'market';
  if (signals && signals.logistics) return 'logistics';
  return summary && summary.opportunityFocus ? summary.opportunityFocus : 'logistics';
}

function _getDecisionSignalLabel(signal) {
  switch (signal) {
    case 'route':
      return '航线情报';
    case 'research':
      return '科研线索';
    case 'market':
      return '贸易窗口';
    case 'logistics':
      return '补给节点';
    default:
      return '勘探情报';
  }
}

function _getSurveyMarketHint(summary, signal, hasIntel) {
  if (!hasIntel) {
    return summary && summary.opportunityLabel
      ? '当前星球偏向' + summary.opportunityLabel + '，可先用市场页确认行情与补给。'
      : '当前暂无勘探报告，按节点类型查看市场。';
  }

  switch (signal) {
    case 'route':
      return '勘探报告已录入暗线航图，建议查看市场情报后组织低燃耗航线。';
    case 'research':
      return '勘探报告偏向科研样本，建议查看市场情报区辅助科研补给线。';
    case 'market':
      return '勘探报告确认局部交易窗口，优先查看市场情报区。';
    case 'logistics':
      return '勘探报告确认本地补给价值，优先查看现货交易与燃料补给。';
    default:
      return '勘探报告已归档，可结合行情决定下一笔交易。';
  }
}

function _getSurveyResearchHint(summary, signal, hasIntel) {
  if (!hasIntel) {
    return summary && summary.opportunityFocus === 'research'
      ? '本地类型偏科研，可通过扫描和 POI 调查补足研究线索。'
      : '';
  }

  switch (signal) {
    case 'research':
      return '本地报告包含科研样本，可作为当前研究补给线的优先参考。';
    case 'route':
      return '暗线报告可降低科研补给路线的燃料压力。';
    case 'market':
      return '贸易报告可帮助科研补给线选择更稳的周转货物。';
    case 'logistics':
      return '补给报告可缓解科研派遣前的燃料与维修压力。';
    default:
      return '';
  }
}

function _getSurveyDispatchHint(summary, signal, hasIntel) {
  if (!hasIntel) return '';

  switch (signal) {
    case 'route':
      return '已发现暗线，派遣评分会优先考虑低燃耗航线。';
    case 'research':
      return '科研报告会提高研究补给路线优先级。';
    case 'market':
      return '贸易报告会提高相关套利路线优先级。';
    case 'logistics':
      return '补给报告会提高低风险补给路线优先级。';
    default:
      return '';
  }
}

function _getAnomalyChainHint(reports) {
  if (_hasReportChainKind(reports, 'lost_beacon')) {
    return '失落航标已归档，派遣和旅行会优先参考这条低燃耗暗线。';
  }
  if (_hasReportChainKind(reports, 'ancient_relic')) {
    return '古代遗迹样本已归档，可作为科研补给和后续技术路线的依据。';
  }
  if (_hasReportChainKind(reports, 'derelict_depot')) {
    return '废弃补给站已复原，适合作为商网站点和后勤扩张判断依据。';
  }
  return '';
}

function _emptyScanYield() {
  return { credits: 0, fuel: 0, reputation: 0, researchDays: 0 };
}

function _getScanLandingFeeDiscount(scanMode) {
  return scanMode === 'deep' ? DEEP_SCAN_LANDING_DISCOUNT : ORBIT_SCAN_LANDING_DISCOUNT;
}

function _combineDiscounts(firstDiscount, secondDiscount) {
  var first = Math.max(0, Math.min(0.95, firstDiscount || 0));
  var second = Math.max(0, Math.min(0.95, secondDiscount || 0));
  return Math.max(0, Math.min(0.95, 1 - ((1 - first) * (1 - second))));
}

function _getScanYield(state, system, exploration, profile, scanMode) {
  if (!system || !exploration) return _emptyScanYield();

  profile = profile || _getSurveyProfile(system, exploration);
  var level = system.minLevel || 1;
  var poiCount = Array.isArray(exploration.pois) ? exploration.pois.length : 0;
  var routeCount = Array.isArray(exploration.secretRoutes) ? exploration.secretRoutes.length : 0;
  var modeMultiplier = scanMode === 'deep' ? 1.45 : 1;
  var focusMultiplier = profile.opportunityFocus === 'market'
    ? 1.25
    : (profile.opportunityFocus === 'research' ? 1.12 : 1);
  var credits = Math.round((28 + level * 11 + poiCount * 8 + routeCount * 16) * modeMultiplier * focusMultiplier);
  var fuel = 0;
  var reputation = 0;
  var researchDays = 0;

  if (profile.opportunityFocus === 'logistics') {
    fuel = Math.round((2 + level + routeCount) * (scanMode === 'deep' ? 1.5 : 1));
  } else if (profile.opportunityFocus === 'market') {
    reputation = scanMode === 'deep' ? 2 : 1;
  } else if (
    profile.opportunityFocus === 'research' &&
    scanMode === 'deep' &&
    state &&
    state.currentResearch &&
    state.currentResearch.daysLeft > 1
  ) {
    researchDays = 1;
  }

  return {
    credits: Math.max(0, credits),
    fuel: Math.max(0, fuel),
    reputation: Math.max(0, reputation),
    researchDays: Math.max(0, researchDays),
  };
}

function _applyScanYield(state, scanYield) {
  if (!state || !scanYield) return;

  state.credits = (state.credits || 0) + (scanYield.credits || 0);
  if (scanYield.fuel) {
    state.fuel = Math.min(state.maxFuel || 100, (state.fuel || 0) + scanYield.fuel);
  }
  if (scanYield.reputation) {
    state.reputation = (state.reputation || 0) + scanYield.reputation;
  }
  if (scanYield.researchDays && state.currentResearch && state.currentResearch.daysLeft > 1) {
    state.currentResearch.daysLeft = Math.max(1, state.currentResearch.daysLeft - scanYield.researchDays);
  }
}

function _applyPoiResearchProgress(state, poi, rewardMultiplier) {
  if (!state || !poi || !state.currentResearch || state.currentResearch.daysLeft <= 1) return 0;
  var baseDays = Math.round(((poi.rewards && poi.rewards.researchDays) || 0) * Math.max(1, rewardMultiplier || 1));
  if (baseDays <= 0) return 0;
  var reducedDays = Math.min(baseDays, Math.max(0, state.currentResearch.daysLeft - 1));
  state.currentResearch.daysLeft = Math.max(1, state.currentResearch.daysLeft - reducedDays);
  return reducedDays;
}

function _formatScanYield(scanYield) {
  var parts = [];
  if (scanYield && scanYield.credits) parts.push(scanYield.credits + ' 积分');
  if (scanYield && scanYield.fuel) parts.push(scanYield.fuel + ' 燃料');
  if (scanYield && scanYield.reputation) parts.push(scanYield.reputation + ' 声望');
  if (scanYield && scanYield.researchDays) parts.push('科研进度 +' + scanYield.researchDays + ' 天');
  return parts.length > 0 ? parts.join('、') : '扫描情报';
}

function _getScanSignalGrade(system, exploration, profile, scanMode) {
  if (!system || !exploration) return 'C';

  profile = profile || _getSurveyProfile(system, exploration);
  var poiCount = Array.isArray(exploration.pois) ? exploration.pois.length : 0;
  var routeCount = Array.isArray(exploration.secretRoutes) ? exploration.secretRoutes.length : 0;
  var score = 48 + poiCount * 7 + routeCount * 12 + (system.minLevel || 1) * 4;
  if (scanMode === 'deep') score += 20;
  if (profile.threatLevel === 'high') score += 10;
  else if (profile.threatLevel === 'medium') score += 5;

  if (score >= 92) return 'S';
  if (score >= 76) return 'A';
  if (score >= 60) return 'B';
  return 'C';
}

function _getScanDirective(state, system, exploration, profile) {
  if (!system || !exploration || !Array.isArray(exploration.pois)) return null;

  profile = profile || _getSurveyProfile(system, exploration);
  var poi = null;
  var reason = '';

  if (profile.threatLevel === 'high' && !_hasTech(state, 'anomaly_research')) {
    poi = _findPoiByKind(exploration, 'route_beacon') || _findPoiByKind(exploration, 'resource_cache');
    reason = '高风险区先锁定低损耗收益，异常点建议等舰体或科技准备后处理。';
  }

  if (!poi && profile.opportunityFocus === 'research') {
    poi = _findPoiByKind(exploration, 'anomaly_site');
    reason = '本地读数偏向科研样本，异常点最可能产出有效研究报告。';
  }
  if (!poi && profile.opportunityFocus === 'market') {
    poi = _findPoiByKind(exploration, 'route_beacon') || _findPoiByKind(exploration, 'resource_cache');
    reason = '贸易情报优先级最高，暗线或货运清单会直接影响后续路线收益。';
  }
  if (!poi) {
    poi = _findPoiByKind(exploration, 'resource_cache') || _findPoiByKind(exploration, 'route_beacon') || _findPoiByKind(exploration, 'anomaly_site');
    reason = '先回收稳定补给，可以抵消扫描与着陆消耗。';
  }

  if (!poi) return null;

  return {
    poiId: poi.id,
    poiKind: poi.kind,
    poiName: (poi.icon ? (poi.icon + ' ') : '') + poi.name,
    reason: reason,
  };
}

function _findPoiByKind(exploration, kind) {
  if (!exploration || !Array.isArray(exploration.pois)) return null;
  return exploration.pois.find(function (poi) {
    return poi.kind === kind && !poi.resolved;
  }) || null;
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
    var depotFollowup = [];
    if (rewardRep > 0) depotFollowup.push('📈 此次发现还提升了你的公共声望。');
    depotFollowup.push('废弃补给站信号会进入商网和派遣的后勤判断。');
    return {
      summary: '回收了补给与账本，获得 ' + rewardCredits + ' 积分、' + rewardFuel + ' 单位燃料。',
      followup: depotFollowup.join(' '),
      type: 'upgrade',
      report: _createManifestReport(system, state, poi),
    };
  }

  if (poi.kind === 'anomaly_site') {
    var anomalyCredits = Math.round(((poi.rewards && poi.rewards.credits) || 0) * rewardMultiplier);
    var hullDamage = (poi.rewards && poi.rewards.hullDamage) || 0;
    var researchDays = _applyPoiResearchProgress(state, poi, rewardMultiplier);
    if (_hasTech(state, 'anomaly_research')) {
      anomalyCredits = Math.round(anomalyCredits * 1.15);
      hullDamage = 0;
      state.credits += anomalyCredits;
      state.reputation = (state.reputation || 0) + 2;
      return {
        summary: '凭借异常分析协议，你稳定提取了样本数据，获得 ' + anomalyCredits + ' 积分并避免了舰体损伤。',
        followup: '🔬 深入分析带来的研究信誉让你额外获得了 2 点声望。' +
          (researchDays > 0 ? (' 古代遗迹样本让当前科研提速 ' + researchDays + ' 天。') : ''),
        type: 'upgrade',
        report: _createAnomalyReport(system, exploration, state, researchDays),
      };
    }

    state.credits += anomalyCredits;
    state.shipHull = Math.max(1, (state.shipHull || 100) - hullDamage);
    return {
      summary: '异常区带来了 ' + anomalyCredits + ' 积分收益，但飞船在回收过程中受损 ' + hullDamage + ' 点。',
      followup: '⚠️ 研究「异常分析协议」后可以显著降低这类风险。' +
        (researchDays > 0 ? (' 古代遗迹样本仍让当前科研提速 ' + researchDays + ' 天。') : ''),
      type: 'info',
      report: _createAnomalyReport(system, exploration, state, researchDays),
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
      summary: '你重启了失落航标，解锁了通往「' + (route ? route.targetSystemName : '未知航点') + '」的秘密航线。',
      followup: '🛰️ 该航线现可提供约 ' + bonusPercent + '% 的燃料节省。失落航标信号会进入后续派遣评分。',
      type: 'upgrade',
      report: _createRouteReport(system, route, routeInfo, state.day || 1),
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

function _getScanFailureMessage(scanStatus) {
  switch (scanStatus.reason) {
    case 'unknown-system':
      return '🛰️ 未知星球，无法执行扫描。';
    case 'not-ready':
      return '📡 当前星球的探索数据尚未就绪。';
    case 'level-locked':
      return '🔒 ' + scanStatus.blockedReason;
    case 'not-in-orbit':
      return '📡 需要先抵达当前星球轨道，才能执行本地扫描。';
    case 'already-scanned':
      return '🔍 该星球已完成轨道扫描。';
    case 'insufficient-fuel':
      return '⛽ 燃料不足，扫描需要 ' + scanStatus.scanFuelCost + ' 单位燃料。';
    default:
      return scanStatus.blockedReason || '📡 当前无法执行扫描。';
  }
}

function _getLandingFailureMessage(landingStatus) {
  switch (landingStatus.reason) {
    case 'unknown-system':
      return '🛬 未知星球，无法着陆。';
    case 'not-ready':
      return '🛬 当前星球的着陆数据尚未就绪。';
    case 'level-locked':
      return '🔒 ' + landingStatus.blockedReason;
    case 'not-in-orbit':
      return '🛬 只有停靠在当前星球时才能执行着陆。';
    case 'not-scanned':
      return '🔍 请先完成轨道扫描，再决定着陆。';
    case 'already-landed':
      return '🛬 该星球已完成首次着陆，可直接继续调查已发现的 POI。';
    case 'insufficient-credits':
      return '💰 信用积分不足，着陆需要 ' + landingStatus.landingFee + ' 积分。';
    default:
      return landingStatus.blockedReason || '🛬 当前无法执行着陆。';
  }
}

function _getPoiFailureMessage(poiStatus) {
  switch (poiStatus.reason) {
    case 'unknown-system':
      return '🧭 未知星球，无法调查探索点。';
    case 'not-ready':
      return '🧭 当前星球的探索数据尚未就绪。';
    case 'level-locked':
      return '🔒 ' + poiStatus.blockedReason;
    case 'not-in-orbit':
      return '🧭 只有停靠在当前星球时才能调查本地 POI。';
    case 'not-landed':
      return '🛬 请先完成着陆，再调查地面探索点。';
    case 'missing-poi':
      return '🧭 未找到对应的探索点。';
    case 'not-discovered':
      return '🔍 该探索点尚未被扫描发现。';
    case 'already-resolved':
      return '✅ 该探索点已经调查完毕。';
    default:
      return poiStatus.blockedReason || '🧭 当前无法调查该探索点。';
  }
}

function _getPoiPreviewText(state, system, exploration, poi, options) {
  var rewardMultiplier = Math.max(1, options && options.poiRewardMultiplier ? options.poiRewardMultiplier : 1);
  var chainPrefix = _getPoiChainPreviewPrefix(poi);

  if (poi.kind === 'resource_cache') {
    var rewardCredits = Math.round(((poi.rewards && poi.rewards.credits) || 0) * rewardMultiplier);
    var rewardFuel = Math.round(((poi.rewards && poi.rewards.fuel) || 0) * rewardMultiplier);
    var rewardRep = Math.round(((poi.rewards && poi.rewards.reputation) || 0) * rewardMultiplier);
    return chainPrefix + '无需额外费用，预计回收 ' + rewardCredits + ' 积分' +
      (rewardFuel > 0 ? '、' + rewardFuel + ' 单位燃料' : '') +
      (rewardRep > 0 ? '，并提升 ' + rewardRep + ' 点声望' : '') + '，同时会整理 1 条本地补给或贸易线索。';
  }

  if (poi.kind === 'anomaly_site') {
    var anomalyCredits = Math.round(((poi.rewards && poi.rewards.credits) || 0) * rewardMultiplier);
    var hullDamage = (poi.rewards && poi.rewards.hullDamage) || 0;
    var researchDays = (poi.rewards && poi.rewards.researchDays) || 0;
    if (_hasTech(state, 'anomaly_research')) {
      anomalyCredits = Math.round(anomalyCredits * 1.15);
      return chainPrefix + '无需额外费用，预计稳定提取样本，获得 ' + anomalyCredits + ' 积分，并避免舰体受损' +
        (researchDays > 0 ? ('，当前科研预计提速 ' + researchDays + ' 天') : '') +
        '，同时更新该星球的异常风险剖面。';
    }
    return chainPrefix + '无需额外费用，预计获得 ' + anomalyCredits + ' 积分，但可能损伤舰体 ' + hullDamage + ' 点' +
      (researchDays > 0 ? ('，当前科研预计提速 ' + researchDays + ' 天') : '') +
      '，并写入一份风险评估报告。';
  }

  if (poi.kind === 'route_beacon') {
    var route = (exploration.secretRoutes || []).find(function (entry) { return entry.id === poi.secretRouteId; });
    var routeCredits = Math.round(((poi.rewards && poi.rewards.credits) || 0) * rewardMultiplier);
    var routeRep = Math.round(((poi.rewards && poi.rewards.reputation) || 0) * rewardMultiplier);
    var fuelMultiplier = route && route.fuelMultiplier ? route.fuelMultiplier : BASE_SECRET_ROUTE_MULTIPLIER;
    if (_hasTech(state, 'stellar_cartography')) {
      fuelMultiplier = Math.min(fuelMultiplier, CARTOGRAPHY_SECRET_ROUTE_MULTIPLIER);
    }
    var discount = Math.round((1 - fuelMultiplier) * 100);
    return chainPrefix + '无需额外费用，预计解锁前往「' + (route ? route.targetSystemName : '未知航点') + '」的秘密航线，航程燃料约 -' + discount + '%，并获得 ' + routeCredits + ' 积分' +
      (routeRep > 0 ? ' 与 ' + routeRep + ' 点声望' : '') + '，并将航线写入长期航图。';
  }

  return chainPrefix + '无需额外费用，完成后会立即结算本次调查收益。';
}

function _getPoiChainPreviewPrefix(poi) {
  if (!poi || !poi.chain || !poi.chain.label) return '';
  var stages = Array.isArray(poi.chain.stageLabels) ? poi.chain.stageLabels : [];
  var stageText = stages.length > 1 ? (' · ' + stages[1]) : '';
  return '事件链「' + poi.chain.label + '」' + stageText + '：';
}

function _getSurveyProfile(system, exploration) {
  var defaults = _getDefaultSurveyProfile(system);
  return {
    threatLevel: (exploration && exploration.threatLevel) || defaults.threatLevel,
    threatLabel: (exploration && exploration.threatLabel) || defaults.threatLabel,
    opportunityFocus: (exploration && exploration.opportunityFocus) || defaults.opportunityFocus,
    opportunityLabel: (exploration && exploration.opportunityLabel) || defaults.opportunityLabel,
    completionRewardKind: (exploration && exploration.completionRewardKind) || defaults.completionRewardKind,
    completionRewardLabel: (exploration && exploration.completionRewardLabel) || defaults.completionRewardLabel,
  };
}

function _getDefaultSurveyProfile(system) {
  if (!system) {
    return {
      threatLevel: 'low',
      threatLabel: '低风险',
      opportunityFocus: 'logistics',
      opportunityLabel: '补给回收',
      completionRewardKind: 'logistics',
      completionRewardLabel: '补给回收包',
    };
  }

  var level = system.minLevel || 1;
  var threatLevel = 'low';
  if (level >= 4 || ['commercial', 'special', 'military'].indexOf(system.type) !== -1) threatLevel = 'high';
  else if (level >= 2 || ['mining', 'industrial'].indexOf(system.type) !== -1) threatLevel = 'medium';

  var opportunityFocus = 'logistics';
  if (['technology', 'research'].indexOf(system.type) !== -1) opportunityFocus = 'research';
  else if (['commercial', 'special', 'military'].indexOf(system.type) !== -1) opportunityFocus = 'market';

  var threatLabelMap = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
  };
  var opportunityLabelMap = {
    logistics: '补给回收',
    market: '贸易情报',
    research: '科研样本',
  };
  var completionLabelMap = {
    logistics: '补给回收包',
    market: '贸易综述',
    research: '研究线索',
  };

  return {
    threatLevel: threatLevel,
    threatLabel: threatLabelMap[threatLevel],
    opportunityFocus: opportunityFocus,
    opportunityLabel: opportunityLabelMap[opportunityFocus],
    completionRewardKind: opportunityFocus,
    completionRewardLabel: completionLabelMap[opportunityFocus],
  };
}

function _isSurveyComplete(exploration) {
  return !!(exploration && Array.isArray(exploration.pois) && exploration.pois.length > 0 && exploration.pois.every(function (poi) {
    return !!poi.resolved;
  }));
}

function _appendExplorationReport(exploration, report) {
  if (!exploration || !report) return false;
  if (!Array.isArray(exploration.reports)) exploration.reports = [];

  var normalizedReport = Object.assign({
    badge: '勘探报告',
    intelValue: 1,
    day: 0,
  }, report);
  var existingIndex = exploration.reports.findIndex(function (entry) {
    return entry.id === normalizedReport.id;
  });
  if (existingIndex !== -1) {
    exploration.reports.splice(existingIndex, 1, normalizedReport);
    return false;
  }

  exploration.reports.unshift(normalizedReport);
  exploration.intelLevel = (exploration.intelLevel || 0) + (normalizedReport.intelValue || 1);
  return true;
}

function _grantSurveyCompletionBonus(state, system, exploration) {
  if (!system || !exploration || exploration.completionBonusClaimed || !_isSurveyComplete(exploration)) {
    return null;
  }

  var profile = _getSurveyProfile(system, exploration);
  var bonusCredits = 90 + (system.minLevel || 1) * 35;
  var bonusReputation = 2 + Math.max(1, Math.floor((system.minLevel || 1) / 2));

  state.credits += bonusCredits;
  state.reputation = (state.reputation || 0) + bonusReputation;
  exploration.completionBonusClaimed = true;
  exploration.completedDay = state.day || 1;

  var msgs = [{
    text: '📘 已完成对「' + system.name + '」的区域测绘，获得 ' + bonusCredits + ' 积分与 ' + bonusReputation + ' 点声望。',
    type: 'upgrade',
  }];
  var completionReport = null;

  if (profile.completionRewardKind === 'research') {
    var reducedDays = 0;
    if (state.currentResearch && state.currentResearch.daysLeft > 1) {
      state.currentResearch.daysLeft -= 1;
      reducedDays = 1;
    }
    completionReport = _createResearchCompletionReport(system, state.day || 1, reducedDays);
    if (reducedDays > 0) {
      msgs.push({ text: '🔬 完整测绘档案让当前科研项目提速 1 天。', type: 'tip' });
    }
  } else if (profile.completionRewardKind === 'market') {
    completionReport = _createCompletionTradeReport(system, state.day || 1);
  } else {
    var bonusFuel = 4 + Math.max(1, system.minLevel || 1);
    var hullRepair = 3 + Math.floor((system.minLevel || 1) / 2);
    state.fuel = Math.min(state.maxFuel || 100, (state.fuel || 0) + bonusFuel);
    state.shipHull = Math.min(state.maxHull || 100, (state.shipHull || 100) + hullRepair);
    completionReport = _createLogisticsCompletionReport(system, state.day || 1, bonusFuel, hullRepair);
    msgs.push({
      text: '⛽ 勘探队额外回收了 ' + bonusFuel + ' 单位燃料，并完成 ' + hullRepair + ' 点舰体整备。',
      type: 'info',
    });
  }

  if (completionReport) {
    _appendExplorationReport(exploration, completionReport);
    msgs.push({ text: completionReport.icon + ' 完探奖励已归档：「' + completionReport.title + '」。', type: 'tip' });
  }

  return { msgs: msgs };
}

function _getPoiChainLabel(poi, fallback) {
  return poi && poi.chain && poi.chain.label ? poi.chain.label : fallback;
}

function _createManifestReport(system, state, poi) {
  var opportunity = _getBestTradeOpportunity(system, { legalOnly: false });
  if (!opportunity) {
    return {
      id: system.id + '_report_manifest',
      kind: 'market',
      signalTags: ['market', 'logistics'],
      chainKind: 'derelict_depot',
      chainLabel: _getPoiChainLabel(poi, '废弃补给站'),
      badge: '补给链',
      icon: '📦',
      title: '废弃补给站复原',
      detail: '回收账本显示「' + system.name + '」仍有可重复利用的地面补给链，适合作为中短线整补节点和商网扩张支点。',
      day: state.day || 1,
      intelValue: 1,
    };
  }

  return {
    id: system.id + '_report_manifest',
    kind: 'market',
    signalTags: ['market', 'logistics'],
    chainKind: 'derelict_depot',
    chainLabel: _getPoiChainLabel(poi, '废弃补给站'),
    badge: '补给链',
    icon: '📦',
    title: '废弃补给站复原',
    detail: '货运清单显示「' + opportunity.goodEmoji + ' ' + opportunity.goodName + '」在「' + system.name + '」长期低于周边均价，优先运往「' + opportunity.targetSystemName + '」存在' + opportunity.marginBand + '强度价差窗口。补给站复原后也可作为商网扩张和派遣整备依据。',
    day: state.day || 1,
    intelValue: 1,
  };
}

function _createScanReport(system, exploration, scanStatus, day) {
  if (!system || !exploration || !scanStatus) return null;

  var profile = _getSurveyProfile(system, exploration);
  var directive = scanStatus.scanDirective || null;
  var landingDiscount = Math.round((scanStatus.scanLandingFeeDiscount || 0) * 100);
  var chainOverview = _formatChainScanOverview(exploration);
  var directiveText = directive
    ? ('推荐优先跟进「' + directive.poiName + '」：' + directive.reason)
    : '未识别出明确优先点位，可按扫描终端给出的探索点清单逐项处理。';

  return {
    id: system.id + '_report_scan',
    kind: 'scan',
    badge: scanStatus.scanMode === 'deep' ? '深度图谱' : '轨道图谱',
    icon: '📡',
    title: '轨道测绘图谱 · ' + (scanStatus.scanSignalGrade || 'C') + ' 级',
    detail: '扫描确认「' + system.name + '」为' + profile.threatLabel + ' / ' + profile.opportunityLabel + '区域。' +
      (chainOverview ? ('同时识别出' + chainOverview + '链路。') : '') +
      '本次图谱已降低首次着陆费约 ' + landingDiscount + '%，并结算' + _formatScanYield(scanStatus.scanYield) + '。' +
      directiveText,
    day: day || 0,
    intelValue: scanStatus.scanMode === 'deep' ? 2 : 1,
  };
}

function _createAnomalyReport(system, exploration, state, reducedDays) {
  var profile = _getSurveyProfile(system, exploration);
  var riskHint = profile.threatLevel === 'high'
    ? '局部异常对低维护舰船依然有持续威胁，后续行动应优先保证舰体安全。'
    : (profile.threatLevel === 'medium'
      ? '异常读数可控，但仍建议在燃料与维修充足时继续深挖。'
      : '当前异常读数整体稳定，适合作为低压勘探点持续观察。');

  return {
    id: system.id + '_report_anomaly',
    kind: 'research',
    signalTags: ['research'],
    chainKind: 'ancient_relic',
    chainLabel: '古代遗迹',
    badge: '遗迹链',
    icon: '🧪',
    title: '古代遗迹样本',
    detail: '分析确认「' + system.name + '」属于' + profile.threatLabel + '勘探区。' + riskHint + (_hasTech(state, 'anomaly_research') ? ' 现有异常分析协议已足以稳定处理样本。' : ' 若补完「异常分析协议」，可显著提高这类点位的净收益。') +
      ((reducedDays || 0) > 0 ? (' 本次古代遗迹样本已让当前科研提速 ' + reducedDays + ' 天。') : ''),
    day: state.day || 1,
    reducedResearchDays: reducedDays || 0,
    intelValue: 1,
  };
}

function _createRouteReport(system, route, routeInfo, day) {
  var discount = Math.round((1 - (routeInfo && routeInfo.fuelMultiplier ? routeInfo.fuelMultiplier : BASE_SECRET_ROUTE_MULTIPLIER)) * 100);
  return {
    id: system.id + '_report_route',
    kind: 'route',
    signalTags: ['route'],
    chainKind: 'lost_beacon',
    chainLabel: '失落航标',
    badge: '航标链',
    icon: '🛰️',
    title: '失落航标重启',
    detail: '已将通往「' + (route ? route.targetSystemName : '未知航点') + '」的暗线写入长期航图。后续从「' + system.name + '」出发可节省约 ' + discount + '% 燃料，并提高相关派遣路线的可解释评分。',
    day: day || 0,
    intelValue: 1,
  };
}

function _createResearchCompletionReport(system, day, reducedDays) {
  return {
    id: system.id + '_report_completion',
    kind: 'completion',
    badge: '完探奖励',
    icon: '📘',
    title: '区域测绘归档',
    detail: reducedDays > 0
      ? '对「' + system.name + '」的完整测绘已归档到研究部门，当前科研项目因此额外提速 1 天。'
      : '对「' + system.name + '」的完整测绘已归档，后续可直接复用这份研究样本与地表剖面。',
    day: day,
    intelValue: 2,
  };
}

function _createCompletionTradeReport(system, day) {
  var opportunity = _getBestTradeOpportunity(system, { legalOnly: false });
  if (!opportunity) {
    return {
      id: system.id + '_report_completion',
      kind: 'completion',
      badge: '完探奖励',
      icon: '📘',
      title: '区域贸易综述',
      detail: '完整测绘确认「' + system.name + '」具备稳定的边境套利价值，可作为中后期高风险航线的跳板节点。',
      day: day,
      intelValue: 2,
    };
  }

  return {
    id: system.id + '_report_completion',
    kind: 'completion',
    badge: '完探奖励',
    icon: '📘',
    title: '区域贸易综述',
    detail: '完整测绘确认：以「' + opportunity.goodEmoji + ' ' + opportunity.goodName + '」为主的出货路线最值得优先关注，建议从「' + system.name + '」直连「' + opportunity.targetSystemName + '」。',
    day: day,
    intelValue: 2,
  };
}

function _createLogisticsCompletionReport(system, day, bonusFuel, hullRepair) {
  return {
    id: system.id + '_report_completion',
    kind: 'completion',
    badge: '完探奖励',
    icon: '📘',
    title: '补给节点归整',
    detail: '完整测绘回收了本地补给节点的剩余资源，为舰队额外提供 ' + bonusFuel + ' 单位燃料与 ' + hullRepair + ' 点整备余量。',
    day: day,
    intelValue: 2,
  };
}

function _getBestTradeOpportunity(system, options) {
  if (!system) return null;

  var legalOnly = !!(options && options.legalOnly);
  var candidates = getSystemsByGalaxy(system.galaxyId).filter(function (entry) {
    return entry.id !== system.id;
  });
  var best = null;

  GOODS.forEach(function (good) {
    if (!good.marketAccess || good.marketAccess.indexOf('open') === -1) return;
    if (legalOnly && good.legality !== 'legal') return;

    var sourceMultiplier = (system.prices && system.prices[good.id]) || 1;
    candidates.forEach(function (target) {
      var targetMultiplier = (target.prices && target.prices[good.id]) || 1;
      var delta = targetMultiplier - sourceMultiplier;
      if (delta <= 0.18) return;

      var score = delta * good.basePrice;
      if (!best || score > best.score) {
        best = {
          goodId: good.id,
          goodName: good.name,
          goodEmoji: good.emoji,
          targetSystemId: target.id,
          targetSystemName: target.name,
          score: score,
          delta: delta,
          marginBand: _getOpportunityMarginBand(delta),
        };
      }
    });
  });

  return best;
}

function _getOpportunityMarginBand(delta) {
  if (delta >= 1.0) return '高';
  if (delta >= 0.55) return '中';
  return '低';
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
