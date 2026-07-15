// js/systems/company/CompanyDirectiveSystem.js — 公司指令目标板规则
// 导出：getCompanyDirectiveBoard, getDirectiveSuggestion, getCompanyDirectiveActionSuggestion, claimCompanyDirectiveReward, claimAllCompanyDirectiveRewards

import { findSystem } from '../../data/systems.js';
import {
  getCompanyFeatureRequirement,
  getCompanyLevelValue,
  getCompanyPrivilegeSummary,
  getTradeStationCapacityState,
} from '../../data/companyAccess.js';
import * as Trade from '../trade/TradeSystem.js';
import * as Progression from '../progression/ProgressionSystem.js';

const TRACKED_SUGGESTION_PRIORITY = 26;
const DIRECTIVE_REWARDS = {
  cashflow: { credits: 650, companyExperience: 80, reputation: 3 },
  survey: { credits: 400, companyExperience: 70, reputation: 6 },
  network: { credits: 900, companyExperience: 120, reputation: 4 },
};
const DIRECTIVE_TITLES = {
  cashflow: '现金流校准',
  survey: '情报归档',
  network: '商网扩张',
};

function _safeNumber(value, fallback) {
  var numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback || 0;
  return numericValue;
}

function _formatNumber(value) {
  return Math.floor(_safeNumber(value, 0)).toLocaleString();
}

function _formatRewardLabel(reward) {
  var parts = [];
  if (reward.credits) parts.push(_formatNumber(reward.credits) + ' cr');
  if (reward.companyExperience) parts.push('公司经验 +' + _formatNumber(reward.companyExperience));
  if (reward.reputation) parts.push('声望 +' + _formatNumber(reward.reputation));
  return parts.join(' · ');
}

function _getClaimEntries(state) {
  var claims = state && state.companyDirectiveClaims && typeof state.companyDirectiveClaims === 'object' && !Array.isArray(state.companyDirectiveClaims)
    ? state.companyDirectiveClaims
    : {};
  return Object.keys(claims).map(function (claimId, index) {
    var claim = claims[claimId] && typeof claims[claimId] === 'object' ? claims[claimId] : {};
    var reward = claim.reward && typeof claim.reward === 'object' ? claim.reward : {};
    var directiveId = claim.directiveId || String(claimId).split(':')[0] || '';
    return {
      claimId: claimId,
      directiveId: directiveId,
      title: claim.title || DIRECTIVE_TITLES[directiveId] || '公司指令',
      code: claim.code || '',
      companyLevel: Math.max(1, Math.floor(_safeNumber(claim.companyLevel, 1))),
      claimedDay: Math.max(1, Math.floor(_safeNumber(claim.claimedDay, 1))),
      claimedIndex: Math.max(1, Math.floor(_safeNumber(claim.claimedIndex, index + 1))),
      reward: Object.assign({ credits: 0, companyExperience: 0, reputation: 0 }, reward),
      rewardLabel: claim.rewardLabel || _formatRewardLabel(reward),
    };
  }).sort(function (left, right) {
    if (right.claimedIndex !== left.claimedIndex) return right.claimedIndex - left.claimedIndex;
    if (right.claimedDay !== left.claimedDay) return right.claimedDay - left.claimedDay;
    return String(right.claimId).localeCompare(String(left.claimId));
  });
}

function _getNextDirectiveSummary(directives, recommended) {
  var claimableDirectives = (directives || []).filter(function (directive) {
    return directive && directive.claimable;
  });
  if (claimableDirectives.length > 0) {
    return {
      mode: 'claimable',
      count: claimableDirectives.length,
      label: claimableDirectives.length + ' 项奖励待领取',
      directiveIds: claimableDirectives.map(function (directive) { return directive.id; }),
    };
  }

  if (!recommended || recommended.completed) return null;
  return {
    mode: 'progress',
    directiveId: recommended.id,
    title: recommended.title,
    code: recommended.code,
    percent: recommended.percent,
    actionLabel: recommended.nextAction ? (recommended.nextAction.actionLabel || '') : '',
    label: '下一轮目标：' + recommended.title + ' ' + recommended.percent + '%',
  };
}

function _getRewardLoopLabel(claimableCount, recentClaim, nextDirective) {
  if (claimableCount > 0) return claimableCount + ' 项奖励待结算，领取后刷新下一轮目标';
  if (recentClaim && nextDirective) return '最近结算：' + recentClaim.title + '，' + nextDirective.label;
  if (recentClaim) return '最近结算：' + recentClaim.title + '，本轮公司指令已全部完成';
  if (nextDirective) return nextDirective.label;
  return '等待公司目标刷新';
}

function _getClaimResultSummary(state, reward) {
  var board = getCompanyDirectiveBoard(state);
  return {
    rewardLabel: _formatRewardLabel(reward || {}),
    recentClaim: board.recentClaim || null,
    nextDirective: board.nextDirective || null,
    rewardLoopLabel: board.rewardLoopLabel || '',
  };
}

function _clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function _createRequirement(config) {
  var current = Math.max(0, _safeNumber(config.current, 0));
  var target = Math.max(1, _safeNumber(config.target, 1));
  var ratio = _clampRatio(current / target);
  var suffix = config.suffix || '';
  return {
    id: config.id || '',
    label: config.label || '',
    current: current,
    target: target,
    currentLabel: _formatNumber(current) + suffix,
    targetLabel: _formatNumber(target) + suffix,
    progressRatio: ratio,
    done: current >= target,
  };
}

function _averageProgress(requirements) {
  if (!Array.isArray(requirements) || requirements.length === 0) return 0;
  var total = requirements.reduce(function (sum, requirement) {
    return sum + _clampRatio(requirement.progressRatio || 0);
  }, 0);
  return _clampRatio(total / requirements.length);
}

function _countExplorationReports(state) {
  var galaxyStates = state && state.galaxyStates && typeof state.galaxyStates === 'object'
    ? state.galaxyStates
    : {};
  return Object.keys(galaxyStates).reduce(function (sum, systemId) {
    var exploration = galaxyStates[systemId] && galaxyStates[systemId].exploration;
    return sum + (Array.isArray(exploration && exploration.reports) ? exploration.reports.length : 0);
  }, 0);
}

function _countCompletedSurveys(state) {
  var galaxyStates = state && state.galaxyStates && typeof state.galaxyStates === 'object'
    ? state.galaxyStates
    : {};
  return Object.keys(galaxyStates).reduce(function (sum, systemId) {
    var exploration = galaxyStates[systemId] && galaxyStates[systemId].exploration;
    if (!exploration || !Array.isArray(exploration.pois) || exploration.pois.length === 0) return sum;
    return sum + (exploration.pois.every(function (poi) { return !!(poi && poi.resolved); }) ? 1 : 0);
  }, 0);
}

function _getStationEntries(state) {
  var stations = state && state.tradeStations && typeof state.tradeStations === 'object'
    ? state.tradeStations
    : {};
  return Object.keys(stations).map(function (systemId) {
    return Object.assign({ systemId: systemId }, stations[systemId] || {});
  });
}

function _getStationLevelTotal(stations) {
  return (stations || []).reduce(function (sum, station) {
    return sum + Math.max(1, Math.floor(_safeNumber(station.level, 1)));
  }, 0);
}

function _createAction(config) {
  return Object.assign({
    actionLabel: '打开入口',
    actionType: 'market.open',
    payload: {},
    surface: 'company',
    commandIntent: '公司指令',
  }, config || {});
}

function _createDirective(config) {
  var requirements = config.requirements || [];
  var progressRatio = _averageProgress(requirements);
  var completed = requirements.length > 0 && requirements.every(function (requirement) {
    return !!requirement.done;
  });
  var reward = Object.assign({ credits: 0, companyExperience: 0, reputation: 0 }, config.reward || {});
  var claimId = (config.id || 'directive') + ':L' + Math.max(1, Math.floor(_safeNumber(config.companyLevel, 1)));
  var claims = config.claims && typeof config.claims === 'object' && !Array.isArray(config.claims)
    ? config.claims
    : {};
  var claimed = !!claims[claimId];
  return Object.assign({
    id: '',
    title: '',
    code: '',
    categoryLabel: '',
    statusLabel: completed ? '完成' : '执行中',
    description: '',
    rewardLabel: '',
    progressRatio: progressRatio,
    percent: Math.floor(progressRatio * 100),
    completed: completed,
    claimId: claimId,
    claimed: claimed,
    claimable: completed && !claimed,
    reward: reward,
    rewardLabel: _formatRewardLabel(reward),
    requirements: requirements,
    nextAction: null,
  }, config || {}, {
    progressRatio: progressRatio,
    percent: Math.floor(progressRatio * 100),
    completed: completed,
    claimId: claimId,
    claimed: claimed,
    claimable: completed && !claimed,
    reward: reward,
    rewardLabel: _formatRewardLabel(reward),
  });
}

function _buildTradeDirective(state, companyLevel) {
  var tradeTarget = Math.max(6, companyLevel * 8);
  var profitTarget = Math.max(1500, companyLevel * 3500);
  return _createDirective({
    id: 'cashflow',
    code: 'CF-' + String(companyLevel).padStart(2, '0'),
    companyLevel: companyLevel,
    claims: state && state.companyDirectiveClaims,
    title: '现金流校准',
    categoryLabel: '贸易扩张',
    description: '把短线买卖转成稳定现金流，为后续舰队、科研和站点投入提供预算。',
    reward: DIRECTIVE_REWARDS.cashflow,
    requirements: [
      _createRequirement({
        id: 'trade-count',
        label: '完成贸易',
        current: state && state.tradeCount,
        target: tradeTarget,
        suffix: ' 次',
      }),
      _createRequirement({
        id: 'total-profit',
        label: '累计利润',
        current: state && state.totalProfit,
        target: profitTarget,
        suffix: ' cr',
      }),
    ],
    nextAction: _createAction({
      actionLabel: '打开市场',
      actionType: 'market.open',
      payload: { workspaceId: 'spot', subworkspaceId: 'trade' },
      surface: 'market',
      commandIntent: '现货交易区',
      trackingReason: '当前追踪现金流指令，先回到现货交易区寻找可执行价差。',
    }),
  });
}

function _buildSurveyDirective(state, companyLevel) {
  var currentSystem = findSystem(state && state.currentSystem);
  var visitedTarget = Math.max(3, Math.min(60, companyLevel * 4));
  var reportTarget = Math.max(1, Math.min(12, Math.ceil(companyLevel * 1.5)));
  return _createDirective({
    id: 'survey',
    code: 'SV-' + String(companyLevel).padStart(2, '0'),
    companyLevel: companyLevel,
    claims: state && state.companyDirectiveClaims,
    title: '情报归档',
    categoryLabel: '探索情报',
    description: '扫描、着陆并调查 POI，把本地情报沉淀成市场、科研、航线和商网信号。',
    reward: DIRECTIVE_REWARDS.survey,
    requirements: [
      _createRequirement({
        id: 'visited-systems',
        label: '访问星球',
        current: Array.isArray(state && state.visitedSystems) ? state.visitedSystems.length : 0,
        target: visitedTarget,
        suffix: ' 颗',
      }),
      _createRequirement({
        id: 'survey-reports',
        label: '归档报告',
        current: _countExplorationReports(state),
        target: reportTarget,
        suffix: ' 份',
      }),
    ],
    nextAction: _createAction({
      actionLabel: '查看星图',
      actionType: 'map.focus',
      payload: {
        destinationSystemId: state && state.currentSystem ? state.currentSystem : '',
        destinationSystemName: currentSystem ? currentSystem.name : '',
      },
      surface: 'navigation',
      commandIntent: '星图情报',
      trackingReason: '当前追踪情报归档指令，先回到星图检查当前航点的扫描、着陆或 POI 状态。',
    }),
    completedSurveyCount: _countCompletedSurveys(state),
  });
}

function _buildNetworkDirective(state, companyLevel) {
  var stations = _getStationEntries(state);
  var capacity = getTradeStationCapacityState(state);
  var buildRequirement = getCompanyFeatureRequirement('tradeStationBuild');
  var networkUnlocked = companyLevel >= buildRequirement;
  var stationTarget = networkUnlocked
    ? Math.max(1, Math.min(Math.max(1, capacity.max || 1), Math.floor(companyLevel / 2)))
    : 1;
  var stationLevelTarget = networkUnlocked
    ? Math.max(stationTarget, (stationTarget * 2) - 1)
    : 1;
  var nextAction = networkUnlocked
    ? _createAction({
        actionLabel: '打开经营页',
        actionType: 'market.open',
        payload: {
          workspaceId: 'operations',
          subworkspaceId: companyLevel >= getCompanyFeatureRequirement('operationsNetwork') ? 'network' : 'stations',
        },
        surface: 'market',
        commandIntent: companyLevel >= getCompanyFeatureRequirement('operationsNetwork') ? '商网总览区' : '站点编排区',
        trackingReason: '当前追踪商网扩张指令，先进入经营页处理建站、升级、经理或策略动作。',
      })
    : _createAction({
        actionLabel: '补公司等级',
        actionType: 'market.open',
        payload: { workspaceId: 'spot', subworkspaceId: 'trade' },
        surface: 'market',
        commandIntent: '现货交易区',
        trackingReason: '贸易站建设尚未开放，先通过交易和任务提升公司等级。',
      });

  return _createDirective({
    id: 'network',
    code: 'NW-' + String(companyLevel).padStart(2, '0'),
    companyLevel: companyLevel,
    claims: state && state.companyDirectiveClaims,
    title: '商网扩张',
    categoryLabel: '经营建设',
    description: networkUnlocked
      ? '把已访问星球转成贸易站节点，扩大长期收益和区域协同覆盖。'
      : '先提升公司等级，为本地建站和后续商网指挥权限预留资金与等级。',
    reward: DIRECTIVE_REWARDS.network,
    requirements: networkUnlocked
      ? [
          _createRequirement({
            id: 'station-count',
            label: '贸易站节点',
            current: stations.length,
            target: stationTarget,
            suffix: ' 站',
          }),
          _createRequirement({
            id: 'station-levels',
            label: '站点等级合计',
            current: _getStationLevelTotal(stations),
            target: stationLevelTarget,
            suffix: ' 级',
          }),
        ]
      : [
          _createRequirement({
            id: 'company-level',
            label: '公司等级',
            current: companyLevel,
            target: buildRequirement,
            suffix: ' 级',
          }),
          _createRequirement({
            id: 'net-worth',
            label: '净资产准备',
            current: Trade.getNetWorth(state || {}),
            target: 6000,
            suffix: ' cr',
          }),
        ],
    nextAction: nextAction,
    stationCapacityLabel: capacity.label,
  });
}

export function getCompanyDirectiveBoard(state) {
  var safeState = state || {};
  var companyLevel = getCompanyLevelValue(safeState);
  var privilege = getCompanyPrivilegeSummary(safeState);
  var directives = [
    _buildTradeDirective(safeState, companyLevel),
    _buildSurveyDirective(safeState, companyLevel),
    _buildNetworkDirective(safeState, companyLevel),
  ];
  var completedCount = directives.filter(function (directive) {
    return directive.completed;
  }).length;
  var claimableCount = directives.filter(function (directive) {
    return directive.claimable;
  }).length;
  var recommended = directives.filter(function (directive) {
    return !directive.completed;
  }).sort(function (left, right) {
    return left.progressRatio - right.progressRatio;
  })[0] || directives[0] || null;
  var claimEntries = _getClaimEntries(safeState);
  var recentClaim = claimEntries[0] || null;
  var nextDirective = _getNextDirectiveSummary(directives, recommended);

  return {
    companyLevel: companyLevel,
    companyTitle: privilege.title || '公司',
    companyIcon: privilege.icon || '',
    nextMilestone: privilege.nextMilestone || null,
    directiveCount: directives.length,
    completedCount: completedCount,
    claimableCount: claimableCount,
    claimedRewardCount: claimEntries.length,
    activeCount: directives.length - completedCount,
    recommendedDirectiveId: recommended ? recommended.id : '',
    recentClaim: recentClaim,
    nextDirective: nextDirective,
    rewardLoopLabel: _getRewardLoopLabel(claimableCount, recentClaim, nextDirective),
    directives: directives,
  };
}

export function getCompanyDirectiveById(state, directiveId) {
  var board = getCompanyDirectiveBoard(state);
  return board.directives.find(function (directive) {
    return directive.id === directiveId;
  }) || null;
}

export function getDirectiveSuggestion(state, directiveId) {
  var directive = getCompanyDirectiveById(state, directiveId);
  if (!directive || directive.completed || !directive.nextAction) return null;
  var action = directive.nextAction;
  return {
    id: 'company-directive-' + directive.id,
    priority: TRACKED_SUGGESTION_PRIORITY,
    title: '推进公司指令：' + directive.title,
    reason: action.trackingReason || directive.description,
    actionLabel: action.actionLabel || '打开入口',
    actionType: action.actionType,
    payload: Object.assign({ directiveId: directive.id }, action.payload || {}),
    surface: action.surface || 'company',
    commandIntent: action.commandIntent || '公司指令',
    target: action.target || null,
  };
}

export function getCompanyDirectiveActionSuggestion(state, trackedDirectiveId) {
  var board = getCompanyDirectiveBoard(state);
  var claimableDirectives = (board.directives || []).filter(function (directive) {
    return directive && directive.claimable;
  });
  if (claimableDirectives.length > 0) {
    var reward = _sumRewards(claimableDirectives);
    var count = claimableDirectives.length;
    return {
      id: 'company-directive-claim-rewards',
      priority: 94,
      title: count > 1 ? ('领取 ' + count + ' 项公司指令奖励') : ('领取「' + claimableDirectives[0].title + '」奖励'),
      reason: '已完成的公司指令可结算为 ' + _formatRewardLabel(reward) + '，先领取可以推进公司等级和权限解锁。',
      actionLabel: count > 1 ? '全部领取' : '领取奖励',
      actionType: 'company.directive.claimAll',
      payload: {
        claimableCount: count,
        directiveIds: claimableDirectives.map(function (directive) { return directive.id; }),
        claimIds: claimableDirectives.map(function (directive) { return directive.claimId; }),
      },
      surface: 'company',
      commandIntent: '公司指令奖励',
      target: false,
    };
  }

  return trackedDirectiveId ? getDirectiveSuggestion(state, trackedDirectiveId) : null;
}

function _ensureClaimState(state) {
  if (!state.companyDirectiveClaims || typeof state.companyDirectiveClaims !== 'object' || Array.isArray(state.companyDirectiveClaims)) {
    state.companyDirectiveClaims = {};
  }
  return state.companyDirectiveClaims;
}

function _sumRewards(directives) {
  return (directives || []).reduce(function (total, directive) {
    var reward = directive && directive.reward ? directive.reward : {};
    total.credits += reward.credits || 0;
    total.companyExperience += reward.companyExperience || 0;
    total.reputation += reward.reputation || 0;
    return total;
  }, { credits: 0, companyExperience: 0, reputation: 0 });
}

function _applyReward(state, reward) {
  var msgs = [];
  if (reward.credits) state.credits = (state.credits || 0) + reward.credits;
  if (reward.reputation) state.reputation = (state.reputation || 0) + reward.reputation;
  if (reward.companyExperience) {
    var progressResult = Progression.gainCompanyExperience(state, reward.companyExperience);
    msgs.push.apply(msgs, progressResult.msgs || []);
  }
  return msgs;
}

function _recordDirectiveClaim(claims, state, directive) {
  var reward = Object.assign({ credits: 0, companyExperience: 0, reputation: 0 }, directive.reward || {});
  claims[directive.claimId] = {
    directiveId: directive.id,
    title: directive.title,
    code: directive.code,
    companyLevel: Math.max(1, Math.floor(_safeNumber(directive.companyLevel, getCompanyLevelValue(state)))),
    claimedDay: state.day || 1,
    claimedIndex: Object.keys(claims).length + 1,
    reward: reward,
    rewardLabel: directive.rewardLabel || _formatRewardLabel(reward),
  };
}

export function claimCompanyDirectiveReward(state, directiveId) {
  if (!state) {
    return { ok: false, reason: 'missing-state', msgs: [{ text: '⚠️ 缺少公司状态，无法结算指令。', type: 'error' }] };
  }

  var directive = getCompanyDirectiveById(state, directiveId);
  if (!directive) {
    return { ok: false, reason: 'unknown-directive', msgs: [{ text: '⚠️ 未找到公司指令，无法结算奖励。', type: 'error' }] };
  }
  if (!directive.completed) {
    return { ok: false, reason: 'not-complete', directive: directive, msgs: [{ text: '⚠️ 「' + directive.title + '」尚未完成。', type: 'error' }] };
  }

  var claims = _ensureClaimState(state);
  if (claims[directive.claimId]) {
    return { ok: false, reason: 'already-claimed', directive: directive, msgs: [{ text: 'ℹ️ 「' + directive.title + '」本轮奖励已经领取。', type: 'info' }] };
  }

  var reward = directive.reward || {};
  var msgs = _applyReward(state, reward);
  _recordDirectiveClaim(claims, state, directive);

  msgs.unshift({
    text: '▣ 公司指令完成：「' + directive.title + '」结算 ' + directive.rewardLabel + '。',
    type: 'upgrade',
  });
  var claimSummary = _getClaimResultSummary(state, reward);

  return {
    ok: true,
    directive: directive,
    claimId: directive.claimId,
    claimedCount: 1,
    reward: Object.assign({}, reward),
    rewardLabel: claimSummary.rewardLabel,
    recentClaim: claimSummary.recentClaim,
    nextDirective: claimSummary.nextDirective,
    rewardLoopLabel: claimSummary.rewardLoopLabel,
    msgs: msgs,
  };
}

export function claimAllCompanyDirectiveRewards(state) {
  if (!state) {
    return { ok: false, reason: 'missing-state', msgs: [{ text: '⚠️ 缺少公司状态，无法结算指令。', type: 'error' }] };
  }

  var board = getCompanyDirectiveBoard(state);
  var directives = (board.directives || []).filter(function (directive) {
    return directive && directive.claimable;
  });
  if (directives.length === 0) {
    return { ok: false, reason: 'none-claimable', msgs: [{ text: 'ℹ️ 当前没有可领取的公司指令奖励。', type: 'info' }] };
  }

  var claims = _ensureClaimState(state);
  var reward = _sumRewards(directives);
  var msgs = _applyReward(state, reward);
  directives.forEach(function (directive) {
    _recordDirectiveClaim(claims, state, directive);
  });
  msgs.unshift({
    text: '▣ 公司指令批量结算：' + directives.length + ' 项，合计 ' + _formatRewardLabel(reward) + '。',
    type: 'upgrade',
  });
  var claimSummary = _getClaimResultSummary(state, reward);

  return {
    ok: true,
    claimedCount: directives.length,
    claimIds: directives.map(function (directive) { return directive.claimId; }),
    directives: directives,
    reward: reward,
    rewardLabel: claimSummary.rewardLabel,
    recentClaim: claimSummary.recentClaim,
    nextDirective: claimSummary.nextDirective,
    rewardLoopLabel: claimSummary.rewardLoopLabel,
    msgs: msgs,
  };
}
