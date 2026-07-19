// js/systems/guidance/AdvancedGuidanceSystem.js — 中后期资本与商网建议

import { getCompanyAccessState } from '../../data/companyAccess.js';
import { TRADE_STATION_STRATEGIES } from '../../data/tradeStations.js';
import * as TradeStation from '../trade/TradeStationSystem.js';
import * as Finance from '../finance/FinanceSystem.js';

function _createSuggestion(config) {
  return Object.assign({
    id: '',
    priority: 0,
    title: '',
    reason: '',
    actionLabel: '',
    actionType: '',
    payload: {},
    surface: 'system',
    target: null,
  }, config || {});
}

function _getActiveLoans(state) {
  return (state && Array.isArray(state.loans) ? state.loans : []).filter(function (loan) {
    return loan && loan.status === 'active' && (loan.balance || 0) > 0;
  });
}

function _hasCapitalFootprint(state) {
  if (_getActiveLoans(state).length > 0) return true;
  var investments = state && state.tradeInvestments && typeof state.tradeInvestments === 'object' ? state.tradeInvestments : {};
  return Object.keys(investments).some(function (systemId) {
    return investments[systemId] && (investments[systemId].amount || 0) > 0;
  });
}

function _getFinanceSuggestion(state) {
  if (!state) return null;

  var activeLoans = _getActiveLoans(state).sort(function (left, right) {
    return (left.remainingDays || 999) - (right.remainingDays || 999);
  });
  var capitalAccess = getCompanyAccessState(state, 'capitalLocal');
  var capitalAvailable = capitalAccess.unlocked || _hasCapitalFootprint(state);
  if (capitalAvailable && activeLoans.length > 0) {
    var urgentLoan = activeLoans.find(function (loan) {
      return (loan.remainingDays || 0) <= 2 || (loan.missedPayments || 0) > 0;
    });
    if (urgentLoan) {
      return _createSuggestion({
        id: 'review-loan-obligation',
        priority: 37,
        title: '处理「' + urgentLoan.name + '」还款',
        reason: (urgentLoan.remainingDays || 0) <= 2
          ? '贷款即将到期，先打开【资金管理】确认还款或现金安排。'
          : '贷款已有扣款异常，先处理负债可避免信用评级继续下滑。',
        actionLabel: '查看贷款',
        actionType: 'market.open',
        payload: {
          workspaceId: 'capital',
          subworkspaceId: 'local',
          loanId: urgentLoan.id,
        },
        surface: 'market',
        commandIntent: '资金管理',
      });
    }
  }

  return null;
}

function _isBatchTradeNetworkUnlocked(state) {
  var batchAccess = getCompanyAccessState(state, 'tradeStationBatchOps');
  var networkAccess = getCompanyAccessState(state, 'operationsNetwork');
  return !!(batchAccess.unlocked && networkAccess.unlocked);
}

function _getAffordableTargets(targets, credits, getCost) {
  var remaining = Number(stateSafeCredits(credits));
  var affordable = [];
  (targets || []).forEach(function (target) {
    var cost = Math.max(0, Number(getCost(target) || 0));
    if (cost === 0 || remaining >= cost) {
      remaining -= cost;
      affordable.push(Object.assign({}, target, { planCost: cost }));
    }
  });
  return affordable;
}

function stateSafeCredits(credits) {
  return Number.isFinite(Number(credits)) ? Math.max(0, Number(credits)) : 0;
}

function _createNetworkBatchSuggestion(config) {
  return _createSuggestion(Object.assign({
    actionLabel: '打开批量面板',
    actionType: 'market.open',
    payload: {
      workspaceId: 'operations',
      subworkspaceId: 'network',
    },
    surface: 'market',
    commandIntent: '贸易站总览',
  }, config || {}));
}

function _getBatchTradeNetworkSuggestion(state, ownedStations) {
  if (!_isBatchTradeNetworkUnlocked(state)) return null;
  if (!ownedStations || ownedStations.length < 2) return null;

  var credits = stateSafeCredits(state.credits);
  var upgradeTargets = ownedStations.filter(function (entry) {
    return entry && entry.nextLevel && (entry.nextUpgradeCost || 0) > 0;
  });
  var affordableUpgrades = _getAffordableTargets(upgradeTargets, credits, function (entry) {
    return entry.nextUpgradeCost || 0;
  });
  if (affordableUpgrades.length >= 2) {
    return _createNetworkBatchSuggestion({
      id: 'batch-upgrade-trade-stations',
      priority: 33,
      title: '批量升级 ' + affordableUpgrades.length + ' 座贸易站',
      reason: '多个站点已满足升级条件，先进入批量计划面板审阅覆盖清单和预算。',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'network',
        batchScope: 'upgrade',
        systemIds: affordableUpgrades.map(function (entry) { return entry.station.systemId; }),
      },
    });
  }

  var investmentTargets = Finance.getTradeInvestmentOptions(state, ownedStations.map(function (entry) {
    return entry.station.systemId;
  }));
  var affordableInvestments = _getAffordableTargets(investmentTargets, credits, function (entry) {
    return entry.suggestedAmount || 0;
  });
  if (affordableInvestments.length >= 2) {
    return _createNetworkBatchSuggestion({
      id: 'batch-invest-trade-stations',
      priority: 31,
      title: '向 ' + affordableInvestments.length + ' 座贸易站追加投资',
      reason: '当前预算可同时追加多个贸易站投资，适合按每天预计回报排序。',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'network',
        batchScope: 'investment',
        amountPerTarget: affordableInvestments[0] ? affordableInvestments[0].suggestedAmount || 0 : 0,
        systemIds: affordableInvestments.map(function (entry) { return entry.systemId; }),
      },
    });
  }

  var strategyPlan = TRADE_STATION_STRATEGIES.map(function (strategy) {
    return {
      strategy: strategy,
      targets: ownedStations.filter(function (entry) {
        return entry.strategyRecommendation &&
          entry.strategyRecommendation.shouldSwitch &&
          entry.strategyRecommendation.strategyId === strategy.id;
      }),
    };
  }).filter(function (entry) {
    return entry.targets.length >= 2;
  }).sort(function (left, right) {
    return right.targets.length - left.targets.length;
  })[0] || null;

  if (strategyPlan) {
    return _createNetworkBatchSuggestion({
      id: 'batch-set-trade-station-strategy',
      priority: 27,
      title: '同步「' + strategyPlan.strategy.name + '」经营方式',
      reason: '多个贸易站的探索线索指向同一经营方式，批量面板会先展示影响范围。',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'network',
        batchScope: 'strategy',
        strategyId: strategyPlan.strategy.id,
        systemIds: strategyPlan.targets.map(function (entry) { return entry.station.systemId; }),
      },
    });
  }

  return null;
}

function _getTradeNetworkSuggestion(state) {
  if (!state) return null;

  var ownedStations = TradeStation.getOwnedStations(state);
  var batchSuggestion = _getBatchTradeNetworkSuggestion(state, ownedStations);
  if (batchSuggestion) return batchSuggestion;

  var buildCandidate = TradeStation.getBuildCandidates(state).find(function (candidate) {
    return candidate && candidate.canAfford;
  });
  if (buildCandidate) {
    return _createSuggestion({
      id: 'build-trade-station',
      priority: 22,
      title: '建设「' + buildCandidate.system.name + '」贸易站',
      reason: '当前资金和公司等级已满足建站条件，可以用现金换取长期收入。',
      actionLabel: '打开经营页',
      actionType: 'market.open',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: buildCandidate.isCurrent ? 'local' : 'stations',
        systemId: buildCandidate.system.id,
      },
      surface: 'market',
      commandIntent: buildCandidate.isCurrent ? '本地贸易站' : '批量管理',
    });
  }

  var upgradeTarget = ownedStations.find(function (entry) {
    return entry && entry.nextLevel && (state.credits || 0) >= (entry.nextUpgradeCost || 0);
  });
  if (upgradeTarget) {
    return _createSuggestion({
      id: 'upgrade-trade-station',
      priority: 21,
      title: '升级「' + upgradeTarget.system.name + '」贸易站',
      reason: '已有贸易站可升级，提升等级会增加每天的收入。',
      actionLabel: '查看贸易站',
      actionType: 'market.open',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'stations',
        systemId: upgradeTarget.station.systemId,
      },
      surface: 'market',
      commandIntent: '批量管理',
    });
  }

  return null;
}

export function getAdvancedGuidanceSuggestions(state) {
  if (!state) return [];
  var suggestions = [];
  var financeSuggestion = _getFinanceSuggestion(state);
  if (financeSuggestion) suggestions.push(financeSuggestion);
  var tradeNetworkSuggestion = _getTradeNetworkSuggestion(state);
  if (tradeNetworkSuggestion) suggestions.push(tradeNetworkSuggestion);
  return suggestions;
}
