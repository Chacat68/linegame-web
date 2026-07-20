// js/systems/galaxy/ExplorationSystem.js — 探索系统（POI / 秘密航线 / 探索报告）
// 依赖：data/systems.js, systems/galaxy/GalaxyDataLayer.js
// 导出：getPoiStatus, getSurveySummary, explorePoi, acknowledgeSurveyReport,
//       acknowledgeChainFollowup,
//       getTravelRouteInfo, getCurrentSystemSecretRoutes

import { GOODS } from '../../data/goods.js';
import { findSystem, getSystemsByGalaxy, isSystemAccessible } from '../../data/systems.js';
import * as GalaxyData from './GalaxyDataLayer.js';

const BASE_SECRET_ROUTE_MULTIPLIER = 0.65;
const CARTOGRAPHY_SECRET_ROUTE_MULTIPLIER = 0.5;
const CHAIN_SIGNAL_LABELS = {
  derelict_depot: '废弃补给站',
  ancient_relic: '古代遗迹',
  lost_beacon: '失落航标',
};

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
  if (!isSystemAccessible(systemId, (state && state.playerLevel) || 1, state && state.researchedTechs)) {
    result.canExplore = false;
    result.reason = 'level-locked';
    result.blockedReason = '需要达到 Lv.' + (system.minLevel || 1) + ' 才能展开本地调查。';
    return result;
  }
  if (!state || state.currentSystem !== systemId) {
    result.canExplore = false;
    result.reason = 'not-in-orbit';
    result.blockedReason = '只有停靠在当前星球时才能调查本地探索点。';
    return result;
  }
  if (!poi) {
    result.canExplore = false;
    result.reason = 'missing-poi';
    result.blockedReason = '未找到对应的探索点。';
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
    reviewedReportKey: exploration.reviewedReportKey || '',
    reviewedReportDay: exploration.reviewedReportDay || 0,
  };
}

export function getSurveyDecisionIntel(state, systemId) {
  const summary = getSurveySummary(state, systemId);
  if (!summary) return null;

  const reports = Array.isArray(summary.reports) ? summary.reports : [];
  const hasIntel = reports.length > 0;
  const recentReport = reports[0] || null;
  const recentReportKey = _getReportReviewKey(recentReport);
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
    hasUnreviewedReport: !!(hasIntel && recentReportKey && summary.reviewedReportKey !== recentReportKey),
    intelLevel: summary.intelLevel,
    reportCount: summary.reportCount,
    recentReportId: recentReport ? recentReport.id : '',
    recentReportKey: recentReportKey,
    recentReportTitle: recentReport ? recentReport.title : '',
    recentReportSignal: _getReportDecisionSignal(recentReport, summary.completionRewardKind || primarySignal),
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
    msgs.push({ text: result.report.icon + ' 已写入探索报告：「' + result.report.title + '」。', type: 'tip' });
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
    return { ok: false, msg: '未知星球，无法确认连续任务后续。' };
  }

  const chainStates = _syncExplorationChainStates(exploration, { preserveFollowupState: true });
  const targetChainId = chainId || (_getNextChainFollowup(_getExplorationChainSummary(exploration)) || {}).chainId || '';
  if (!targetChainId || !chainStates[targetChainId]) {
    return { ok: false, msg: '未找到可跟进的连续任务。' };
  }

  const chainState = chainStates[targetChainId];
  if (!chainState.resolved) {
    return { ok: false, msg: '连续任务尚未完成，无法确认后续。' };
  }

  chainStates[targetChainId] = Object.assign({}, chainState, {
    followupReady: false,
    followupAcknowledged: true,
    followupAcknowledgedDay: state && state.day ? state.day : 1,
  });
  _saveExplorationState(systemId, exploration);

  return {
    ok: true,
    msg: '连续任务后续已确认。',
    meta: {
      systemId: systemId,
      chainId: targetChainId,
      chainKind: chainState.kind || '',
      chainLabel: chainState.label || CHAIN_SIGNAL_LABELS[chainState.kind] || '探索链',
    },
  };
}

export function acknowledgeSurveyReport(state, systemId, reportId) {
  const system = findSystem(systemId);
  const exploration = system ? _getExplorationState(systemId) : null;
  if (!system || !exploration) {
    return { ok: false, msg: '未知星球，无法确认探索报告。' };
  }

  const reports = Array.isArray(exploration.reports)
    ? exploration.reports.slice().sort(function (left, right) {
        return (right.day || 0) - (left.day || 0);
      })
    : [];
  const report = reportId
    ? reports.find(function (entry) { return entry && entry.id === reportId; })
    : reports[0];
  const reportKey = _getReportReviewKey(report);
  if (!report || !reportKey) {
    return { ok: false, msg: '未找到可确认的探索报告。' };
  }

  exploration.reviewedReportKey = reportKey;
  exploration.reviewedReportDay = state && state.day ? state.day : 1;
  _saveExplorationState(systemId, exploration);

  return {
    ok: true,
    msg: '探索报告已确认。',
    meta: {
      systemId: systemId,
      reportId: report.id || '',
      reportKey: reportKey,
      reportTitle: report.title || '探索报告',
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
  if (stageIndex === 0) return '待调查';
  if (stageLabels[stageIndex]) return stageLabels[stageIndex];
  if (stageIndex === 2) return '已归档';
  if (stageIndex === 1) return '待调查';
  return '待调查';
}

function _getChainFollowupLabel(chainKind) {
  if (chainKind === 'lost_beacon') return '打开【档案 → 探索】，查看隐藏航线和跑商建议。';
  if (chainKind === 'ancient_relic') return '打开【档案 → 探索】，查看研究帮助和风险。';
  if (chainKind === 'derelict_depot') return '打开【档案 → 探索】，查看贸易站和跑商价值。';
  return '打开【档案 → 探索】，查看这份情报有什么用。';
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
  return { workspaceId: 'archive', subworkspaceId: 'exploration' };
}

function _getChainFollowupActionLabel(chain) {
  return '打开档案确认';
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
    return '「' + label + '」解锁了低燃耗航线，先在档案中确认后才作为航行与跑商依据。';
  }
  if (chain && chain.kind === 'ancient_relic') {
    return '「' + label + '」包含科研样本，需要先确认研究价值与后续风险。';
  }
  if (chain && chain.kind === 'derelict_depot') {
    return '「' + label + '」恢复了补给数据，需要先确认它对跑商与商网的实际价值。';
  }
  return '「' + label + '」的情报已归档，需要先确认实际用途再纳入后续决策。';
}

function _getPrimaryDecisionSignal(summary, signals) {
  if (signals && signals.route) return 'route';
  if (signals && signals.research) return 'research';
  if (signals && signals.market) return 'market';
  if (signals && signals.logistics) return 'logistics';
  return summary && summary.opportunityFocus ? summary.opportunityFocus : 'logistics';
}

function _getReportReviewKey(report) {
  if (!report || !report.id) return '';
  return String(report.id) + '@' + String(Number(report.day) || 0);
}

function _getReportDecisionSignal(report, fallbackSignal) {
  if (!report) return fallbackSignal || 'logistics';
  var tags = Array.isArray(report.signalTags) ? report.signalTags : [];
  if (report.chainKind === 'lost_beacon' || report.kind === 'route' || tags.indexOf('route') !== -1) return 'route';
  if (report.chainKind === 'ancient_relic' || report.kind === 'research' || tags.indexOf('research') !== -1) return 'research';
  if (report.chainKind === 'derelict_depot' || report.kind === 'market' || tags.indexOf('market') !== -1) return 'market';
  if (tags.indexOf('logistics') !== -1) return 'logistics';
  return fallbackSignal || 'logistics';
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
      return '补给点';
    default:
      return '探索线索';
  }
}

function _getSurveyMarketHint(summary, signal, hasIntel) {
  if (!hasIntel) {
    return summary && summary.opportunityLabel
      ? '当前星球偏向' + summary.opportunityLabel + '，可先用市场页确认行情与补给。'
      : '当前暂无探索报告，可先查看普通市场。';
  }

  switch (signal) {
    case 'route':
      return '探索报告发现了隐藏航线；在档案复核记录后，可回到星图规划省油路线。';
    case 'research':
      return '探索报告包含研究样本；可在档案复核记录，并到【科技】查看研究方向。';
    case 'market':
      return '探索报告发现了交易机会；可在档案复核记录，再到市场查看实时行情。';
    case 'logistics':
      return '探索报告确认这里适合补给；记录已归档，可继续买卖货物或补充燃料。';
    default:
      return '探索报告已归档，可结合行情决定下一笔交易。';
  }
}

function _getSurveyResearchHint(summary, signal, hasIntel) {
  if (!hasIntel) {
    return summary && summary.opportunityFocus === 'research'
      ? '这里偏科研，可以调查探索点来获得研究线索。'
      : '';
  }

  switch (signal) {
    case 'research':
      return '本地报告包含科研样本，可作为当前研究补给线的优先参考。';
    case 'route':
      return '隐藏航线报告可降低科研补给路线的燃料压力。';
    case 'market':
      return '贸易报告可帮助科研补给线选择更稳的周转货物。';
    case 'logistics':
      return '补给报告可缓解科研自动补给前的燃料与维修压力。';
    default:
      return '';
  }
}

function _getSurveyDispatchHint(summary, signal, hasIntel) {
  if (!hasIntel) return '';

  switch (signal) {
    case 'route':
      return '已发现隐藏航线，自动跑商会优先考虑低燃耗路线。';
    case 'research':
      return '科研报告会提高研究补给路线优先级。';
    case 'market':
      return '贸易报告会优先推荐相关的低买高卖路线。';
    case 'logistics':
      return '补给报告会提高低风险补给路线优先级。';
    default:
      return '';
  }
}

function _getAnomalyChainHint(reports) {
  if (_hasReportChainKind(reports, 'lost_beacon')) {
    return _getReportChainLabel(reports, 'lost_beacon', '失落航标') + '已保存，自动跑商和旅行会优先参考这条低燃耗路线。';
  }
  if (_hasReportChainKind(reports, 'ancient_relic')) {
    return _getReportChainLabel(reports, 'ancient_relic', '古代遗迹') + '样本已归档，可作为科研补给和后续技术路线的依据。';
  }
  if (_hasReportChainKind(reports, 'derelict_depot')) {
    return _getReportChainLabel(reports, 'derelict_depot', '废弃补给站') + '已复原，适合作为商网站点和后勤扩张判断依据。';
  }
  return '';
}

function _getReportChainLabel(reports, chainKind, fallback) {
  const report = (Array.isArray(reports) ? reports : []).find(function (entry) {
    return entry && entry.chainKind === chainKind && entry.chainLabel;
  });
  return report ? report.chainLabel : fallback;
}

function _applyPoiResearchProgress(state, poi, rewardMultiplier) {
  if (!state || !poi || !state.currentResearch || state.currentResearch.daysLeft <= 1) return 0;
  var baseDays = Math.round(((poi.rewards && poi.rewards.researchDays) || 0) * Math.max(1, rewardMultiplier || 1));
  if (baseDays <= 0) return 0;
  var reducedDays = Math.min(baseDays, Math.max(0, state.currentResearch.daysLeft - 1));
  state.currentResearch.daysLeft = Math.max(1, state.currentResearch.daysLeft - reducedDays);
  return reducedDays;
}

function _resolvePoi(state, system, exploration, poi, options) {
  var rewardMultiplier = Math.max(1, options && options.poiRewardMultiplier ? options.poiRewardMultiplier : 1);

  if (poi.kind === 'resource_cache') {
    var depotLabel = _getPoiChainLabel(poi, '废弃补给站');
    var rewardCredits = Math.round(((poi.rewards && poi.rewards.credits) || 0) * rewardMultiplier);
    var rewardFuel = Math.round(((poi.rewards && poi.rewards.fuel) || 0) * rewardMultiplier);
    var rewardRep = Math.round(((poi.rewards && poi.rewards.reputation) || 0) * rewardMultiplier);
    state.credits += rewardCredits;
    state.fuel = Math.min(state.maxFuel || 100, (state.fuel || 0) + rewardFuel);
    state.reputation = (state.reputation || 0) + rewardRep;
    var depotFollowup = [];
    if (rewardRep > 0) depotFollowup.push('📈 此次发现还提升了你的公共声望。');
    depotFollowup.push(depotLabel + '线索会用于商网和自动跑商的补给判断。');
    return {
      summary: '回收了补给与账本，获得 ' + rewardCredits + ' 积分、' + rewardFuel + ' 单位燃料。',
      followup: depotFollowup.join(' '),
      type: 'upgrade',
      report: _createManifestReport(system, state, poi),
    };
  }

  if (poi.kind === 'anomaly_site') {
    var relicLabel = _getPoiChainLabel(poi, '古代遗迹');
    var anomalyCredits = Math.round(((poi.rewards && poi.rewards.credits) || 0) * rewardMultiplier);
    var hullDamage = (poi.rewards && poi.rewards.hullDamage) || 0;
    var researchDays = _applyPoiResearchProgress(state, poi, rewardMultiplier);
    if (_hasTech(state, 'anomaly_research')) {
      anomalyCredits = Math.round(anomalyCredits * 1.15);
      hullDamage = 0;
      state.credits += anomalyCredits;
      state.reputation = (state.reputation || 0) + 2;
      return {
        summary: '凭借异常分析技术，你稳定提取了样本数据，获得 ' + anomalyCredits + ' 积分并避免了舰体损伤。',
        followup: '🔬 深入分析带来的研究信誉让你额外获得了 2 点声望。' +
          (researchDays > 0 ? (' ' + relicLabel + '样本让当前科研提速 ' + researchDays + ' 天。') : ''),
        type: 'upgrade',
        report: _createAnomalyReport(system, exploration, state, researchDays, poi),
      };
    }

    state.credits += anomalyCredits;
    state.shipHull = Math.max(1, (state.shipHull || 100) - hullDamage);
    return {
      summary: '异常区带来了 ' + anomalyCredits + ' 积分收益，但飞船在回收过程中受损 ' + hullDamage + ' 点。',
      followup: '⚠️ 研究「异常分析」后可以显著降低这类风险。' +
        (researchDays > 0 ? (' ' + relicLabel + '样本仍让当前科研提速 ' + researchDays + ' 天。') : ''),
      type: 'info',
      report: _createAnomalyReport(system, exploration, state, researchDays, poi),
    };
  }

  if (poi.kind === 'route_beacon') {
    var routeLabel = _getPoiChainLabel(poi, '失落航标');
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
      summary: '你重启了' + routeLabel + '，解锁了通往「' + (route ? route.targetSystemName : '未知航点') + '」的秘密航线。',
      followup: '🛰️ 该航线现可节省约 ' + bonusPercent + '% 燃料。' + routeLabel + '线索会用于后续自动跑商选路。',
      type: 'upgrade',
      report: _createRouteReport(system, route, routeInfo, state.day || 1, poi),
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

function _getPoiFailureMessage(poiStatus) {
  switch (poiStatus.reason) {
    case 'unknown-system':
      return '🧭 未知星球，无法调查探索点。';
    case 'not-ready':
      return '🧭 当前星球的探索数据尚未就绪。';
    case 'level-locked':
      return '🔒 ' + poiStatus.blockedReason;
    case 'not-in-orbit':
      return '🧭 只有停靠在当前星球时才能调查本地探索点。';
    case 'missing-poi':
      return '🧭 未找到对应的探索点。';
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
  return '连续任务「' + poi.chain.label + '」' + stageText + '：';
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
    badge: '探索报告',
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
    text: '📘 已完成对「' + system.name + '」的区域探索，获得 ' + bonusCredits + ' 积分与 ' + bonusReputation + ' 点声望。',
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
      msgs.push({ text: '🔬 完整探索报告让当前科研项目提速 1 天。', type: 'tip' });
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
      text: '⛽ 探索队额外回收了 ' + bonusFuel + ' 单位燃料，并完成 ' + hullRepair + ' 点舰体整备。',
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
  var chainLabel = _getPoiChainLabel(poi, '废弃补给站');
  var opportunity = _getBestTradeOpportunity(system, { legalOnly: false });
  if (!opportunity) {
    return {
      id: system.id + '_report_manifest',
      kind: 'market',
      signalTags: ['market', 'logistics'],
      chainKind: 'derelict_depot',
      chainLabel: _getPoiChainLabel(poi, '废弃补给站'),
      badge: '补给任务',
      icon: '📦',
      title: chainLabel + '复原',
      detail: '回收账本显示「' + system.name + '」仍有可重复利用的地面补给，适合作为中短线补给点和贸易网络扩张起点。',
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
    badge: '补给任务',
    icon: '📦',
    title: chainLabel + '复原',
    detail: '货运清单显示「' + opportunity.goodEmoji + ' ' + opportunity.goodName + '」在「' + system.name + '」长期低于周边均价，优先运往「' + opportunity.targetSystemName + '」有' + opportunity.marginBand + '的价差机会。补给站复原后也可用于商网扩张和自动跑商补给。',
    day: state.day || 1,
    intelValue: 1,
  };
}

function _createAnomalyReport(system, exploration, state, reducedDays, poi) {
  var profile = _getSurveyProfile(system, exploration);
  var chainLabel = _getPoiChainLabel(poi, '古代遗迹');
  var riskHint = profile.threatLevel === 'high'
    ? '局部异常对低维护舰船依然有持续威胁，后续行动应优先保证舰体安全。'
    : (profile.threatLevel === 'medium'
      ? '异常读数可控，但仍建议在燃料与维修充足时继续深挖。'
      : '当前异常读数整体稳定，适合作为低风险探索点持续观察。');

  return {
    id: system.id + '_report_anomaly',
    kind: 'research',
    signalTags: ['research'],
    chainKind: 'ancient_relic',
    chainLabel: chainLabel,
    badge: '遗迹任务',
    icon: '🧪',
    title: chainLabel + '样本',
    detail: '分析确认「' + system.name + '」属于' + profile.threatLabel + '探索区。' + riskHint + (_hasTech(state, 'anomaly_research') ? ' 现有异常分析技术已足以稳定处理样本。' : ' 若完成「异常分析」，可显著提高这类地点的实际收益。') +
      ((reducedDays || 0) > 0 ? (' 本次' + chainLabel + '样本已让当前科研提速 ' + reducedDays + ' 天。') : ''),
    day: state.day || 1,
    reducedResearchDays: reducedDays || 0,
    intelValue: 1,
  };
}

function _createRouteReport(system, route, routeInfo, day, poi) {
  var discount = Math.round((1 - (routeInfo && routeInfo.fuelMultiplier ? routeInfo.fuelMultiplier : BASE_SECRET_ROUTE_MULTIPLIER)) * 100);
  return {
    id: system.id + '_report_route',
    kind: 'route',
    signalTags: ['route'],
    chainKind: 'lost_beacon',
    chainLabel: _getPoiChainLabel(poi, '失落航标'),
    badge: '航标任务',
    icon: '🛰️',
    title: _getPoiChainLabel(poi, '失落航标') + '重启',
    detail: '已将通往「' + (route ? route.targetSystemName : '未知航点') + '」的隐藏航线写入地图。后续从「' + system.name + '」出发可节省约 ' + discount + '% 燃料，自动跑商也会优先考虑这条路线。',
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
    title: '区域探索报告',
    detail: reducedDays > 0
      ? '对「' + system.name + '」的完整探索报告已交给研究部门，当前科研项目因此额外提速 1 天。'
      : '对「' + system.name + '」的完整探索报告已保存，后续可直接使用这份研究样本与地表资料。',
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
      detail: '完整探索确认「' + system.name + '」具备稳定的边境贸易价值，可作为中后期高风险航线的中转站。',
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
    detail: '完整探索确认：优先运送「' + opportunity.goodEmoji + ' ' + opportunity.goodName + '」最值得关注，建议从「' + system.name + '」直达「' + opportunity.targetSystemName + '」。',
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
    title: '整理补给点',
    detail: '完整探索回收了本地补给点的剩余资源，为舰队额外提供 ' + bonusFuel + ' 单位燃料并修复 ' + hullRepair + ' 点船体。',
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
