// js/systems/guidance/AdvancedGuidanceSystem.js — 中后期资本与商网建议

import { getCompanyAccessState } from '../../data/companyAccess.js';
import { TRADE_STATION_MANAGERS, TRADE_STATION_STRATEGIES } from '../../data/tradeStations.js';
import * as TradeStation from '../trade/TradeStationSystem.js';
import * as Finance from '../finance/FinanceSystem.js';
import * as Futures from '../finance/FuturesSystem.js';

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

function _hasStockHolding(state) {
  var portfolio = state && state.stockPortfolio && typeof state.stockPortfolio === 'object' ? state.stockPortfolio : {};
  return Object.keys(portfolio).some(function (stockId) {
    return portfolio[stockId] && (portfolio[stockId].shares || 0) > 0;
  });
}

function _hasCapitalFootprint(state) {
  if (_getActiveLoans(state).length > 0) return true;
  if (_hasStockHolding(state)) return true;
  if ((state && Array.isArray(state.futuresContracts) ? state.futuresContracts : []).some(function (contract) {
    return contract && contract.status === 'open';
  })) return true;
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
          ? '贷款即将进入展期，先打开资本调度区确认还款或现金安排。'
          : '贷款已有扣款异常，先处理负债可避免信用评级继续下滑。',
        actionLabel: '查看资本',
        actionType: 'market.open',
        payload: {
          workspaceId: 'capital',
          subworkspaceId: 'local',
          loanId: urgentLoan.id,
        },
        surface: 'market',
        commandIntent: '资本调度区',
      });
    }
  }

  var futuresAccess = getCompanyAccessState(state, 'futures');
  var openContracts = (futuresAccess.unlocked || _hasCapitalFootprint(state))
    ? Futures.getOpenContracts(state).sort(function (left, right) {
        return (left.daysLeft || 999) - (right.daysLeft || 999);
      })
    : [];
  var urgentContract = openContracts.find(function (contract) {
    return (contract.daysLeft || 0) <= 2 || Math.abs(contract.unrealizedPnl || 0) >= Math.max(1, (contract.margin || 1) * 0.5);
  });
  if (urgentContract) {
    return _createSuggestion({
      id: 'review-futures-contract',
      priority: 37,
      title: '复核「' + urgentContract.goodName + '」期货持仓',
      reason: (urgentContract.daysLeft || 0) <= 2
        ? '合约接近到期，先进入期货区确认是否提前平仓。'
        : '期货浮动盈亏已明显偏离保证金，先复核风险敞口。',
      actionLabel: '查看期货',
      actionType: 'market.open',
      payload: {
        workspaceId: 'capital',
        subworkspaceId: 'futures',
        contractId: urgentContract.id,
      },
      surface: 'market',
      commandIntent: '期货合约区',
    });
  }

  var stocksAccess = getCompanyAccessState(state, 'stocks');
  if (stocksAccess.unlocked && !_hasStockHolding(state)) {
    var affordableStock = Finance.getStockListings(state).find(function (listing) {
      return listing && (state.credits || 0) >= (listing.price || 0);
    });
    if (affordableStock) {
      return _createSuggestion({
        id: 'open-stock-position',
        priority: 20,
        title: '查看「' + affordableStock.name + '」股票标的',
        reason: '证券交易已解锁且当前没有股票持仓，可以先用一股建立资本市场观察位。',
        actionLabel: '查看股票',
        actionType: 'market.open',
        payload: {
          workspaceId: 'capital',
          subworkspaceId: 'stocks',
          stockId: affordableStock.id,
        },
        surface: 'market',
        commandIntent: '股票交易区',
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
    commandIntent: '商网总览区',
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
      title: '执行 ' + affordableUpgrades.length + ' 站商网升级波次',
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
      title: '执行 ' + affordableInvestments.length + ' 站资本增配波次',
      reason: '当前预算可同时覆盖多个贸易站增配，适合先用批量面板按殖利率排序。',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'network',
        batchScope: 'investment',
        amountPerTarget: affordableInvestments[0] ? affordableInvestments[0].suggestedAmount || 0 : 0,
        systemIds: affordableInvestments.map(function (entry) { return entry.systemId; }),
      },
    });
  }

  var managerPlan = TRADE_STATION_MANAGERS.map(function (manager) {
    var targets = ownedStations.filter(function (entry) {
      return entry.station.managerId !== manager.id;
    });
    var affordableCount = Math.min(targets.length, Math.floor(credits / Math.max(1, manager.hireCost || 1)));
    return {
      manager: manager,
      targets: targets.slice(0, affordableCount),
      affordableCount: affordableCount,
    };
  }).filter(function (entry) {
    return entry.affordableCount >= 2;
  }).sort(function (left, right) {
    if (left.affordableCount !== right.affordableCount) return right.affordableCount - left.affordableCount;
    return (left.manager.hireCost || 0) - (right.manager.hireCost || 0);
  })[0] || null;

  if (managerPlan) {
    return _createNetworkBatchSuggestion({
      id: 'batch-hire-trade-station-manager',
      priority: 29,
      title: '批量派驻「' + managerPlan.manager.name + '」',
      reason: '至少两个站点可进入同一轮人事配置，先在批量面板确认排序和成本。',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'network',
        batchScope: 'manager',
        managerId: managerPlan.manager.id,
        systemIds: managerPlan.targets.map(function (entry) { return entry.station.systemId; }),
      },
    });
  }

  var strategyPlan = TRADE_STATION_STRATEGIES.map(function (strategy) {
    return {
      strategy: strategy,
      targets: ownedStations.filter(function (entry) {
        return entry.station.strategyId !== strategy.id;
      }),
    };
  }).filter(function (entry) {
    return entry.targets.length >= 2;
  }).sort(function (left, right) {
    return (right.strategy.incomeMultiplier || 1) - (left.strategy.incomeMultiplier || 1);
  })[0] || null;

  if (strategyPlan) {
    return _createNetworkBatchSuggestion({
      id: 'batch-set-trade-station-strategy',
      priority: 27,
      title: '同步「' + strategyPlan.strategy.name + '」经营策略',
      reason: '多个贸易站可在同一轮切换策略，批量面板会先展示影响范围。',
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
      reason: '当前资金和公司等级已满足建站条件，可以把现金转成长期商网收益。',
      actionLabel: '打开经营页',
      actionType: 'market.open',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: buildCandidate.isCurrent ? 'local' : 'stations',
        systemId: buildCandidate.system.id,
      },
      surface: 'market',
      commandIntent: buildCandidate.isCurrent ? '本地节点经营区' : '站点编排区',
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
      reason: '已有站点可升级，提升等级会扩大商网日收益。',
      actionLabel: '打开商网',
      actionType: 'market.open',
      payload: {
        workspaceId: 'operations',
        subworkspaceId: 'stations',
        systemId: upgradeTarget.station.systemId,
      },
      surface: 'market',
      commandIntent: '站点编排区',
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

