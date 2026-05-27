import { GOODS } from '../../data/goods.js';
import { SYSTEMS, findSystem, getAccessibleSystems } from '../../data/systems.js';
import { getCompanyAccessState } from '../../data/companyAccess.js';
import { TRADE_STATION_MANAGERS, TRADE_STATION_STRATEGIES } from '../../data/tradeStations.js';
import * as Quest from '../quest/QuestSystem.js?v=20260412-questroute2';
import * as TradeStation from '../trade/TradeStationSystem.js';
import * as Finance from '../finance/FinanceSystem.js';
import * as Futures from '../finance/FuturesSystem.js';

const FIRST_TRADE_QUEST_ID = 'starter_first_trade';
const FIRST_EXPLORE_QUEST_ID = 'starter_visit_2';
const LOW_PRICE_THRESHOLD = 0.85;
const LOW_FUEL_RATIO = 0.25;

function _hasCargo(state) {
  return _getCargoEntries(state).length > 0;
}

function _getCargoEntries(state) {
  if (!state || !state.cargo) return [];
  return Object.keys(state.cargo).filter(function (goodId) {
    return Number(state.cargo[goodId] || 0) > 0;
  }).map(function (goodId) {
    return {
      goodId: goodId,
      quantity: Number(state.cargo[goodId] || 0),
    };
  });
}

function _findQuestById(quests, questId) {
  return (quests || []).find(function (quest) {
    return quest && quest.id === questId;
  }) || null;
}

function _isQuestCompleted(state, questId) {
  return !!(state && Array.isArray(state.completedQuests) && state.completedQuests.includes(questId));
}

function _getAvailableQuest(state, questId) {
  return _findQuestById(Quest.getAvailableQuests(state), questId);
}

function _getActiveQuest(state, questId) {
  return _findQuestById(Quest.getActiveQuests(state), questId);
}

function _getGoodName(goodId) {
  var good = GOODS.find(function (item) { return item.id === goodId; });
  return good ? good.name : goodId;
}

function _getCurrentSystem(state) {
  return findSystem(state && state.currentSystem);
}

function _getLowPriceGood(state) {
  var system = _getCurrentSystem(state);
  if (!system || !system.prices) return null;

  return GOODS.filter(function (good) {
    if (good.id === 'fuel') return false;
    var multiplier = Number(system.prices[good.id] || 1);
    return multiplier > 0 && multiplier <= LOW_PRICE_THRESHOLD;
  }).sort(function (left, right) {
    return (system.prices[left.id] || 1) - (system.prices[right.id] || 1);
  }).map(function (good) {
    return {
      goodId: good.id,
      goodName: good.name,
      priceSignal: system.prices[good.id],
    };
  })[0] || null;
}

function _getPrimaryCargoEntry(state) {
  return _getCargoEntries(state).sort(function (left, right) {
    return right.quantity - left.quantity;
  })[0] || null;
}

function _isCurrentSystemGoodForSelling(state, goodId) {
  var system = _getCurrentSystem(state);
  if (!system || !system.prices || !goodId) return false;
  return Number(system.prices[goodId] || 1) >= 1;
}

function _findBestSellDestination(state, goodId) {
  if (!state || !goodId) return null;
  var systems = getAccessibleSystems(
    state.currentGalaxy || 'milky_way',
    state.playerLevel || 1,
    state.researchedTechs || []
  );
  if (!systems || systems.length === 0) systems = SYSTEMS;

  return systems.filter(function (system) {
    return system && system.id !== state.currentSystem && system.prices && system.prices[goodId];
  }).sort(function (left, right) {
    return (right.prices[goodId] || 1) - (left.prices[goodId] || 1);
  })[0] || null;
}

function _shouldOfferScan(scanStatus) {
  if (!scanStatus) return false;
  if (scanStatus.canScan === false) return false;
  if (scanStatus.reason === 'already-scanned') return false;
  if (scanStatus.scanLevel && scanStatus.scanLevel > 0) return false;
  return true;
}

function _shouldOfferLanding(landingStatus) {
  if (!landingStatus) return false;
  if (landingStatus.canLand === false) return false;
  if (landingStatus.reason === 'already-landed') return false;
  return true;
}

function _shouldOfferPoi(nextPoiStatus, nextPoi) {
  if (!nextPoiStatus || !nextPoi) return false;
  return nextPoiStatus.canExplore !== false;
}

function _shouldOfferRefuel(state) {
  if (!state) return false;
  var maxFuel = Number(state.maxFuel || 0);
  var fuel = Number(state.fuel || 0);
  if (!Number.isFinite(maxFuel) || maxFuel <= 0) return false;
  if (!Number.isFinite(fuel) || fuel < 0) fuel = 0;
  if (fuel >= maxFuel) return false;
  if (Number(state.credits || 0) <= 0) return false;
  return fuel / maxFuel <= LOW_FUEL_RATIO;
}

function _getFuelNeeded(state) {
  return Math.max(0, Math.ceil(Number(state.maxFuel || 0) - Number(state.fuel || 0)));
}

function _getPoiName(nextPoi) {
  if (!nextPoi) return '探索点';
  var icon = nextPoi.icon ? (nextPoi.icon + ' ') : '';
  return icon + (nextPoi.name || '探索点');
}

function _getPoiChainReason(nextPoi) {
  if (!nextPoi || !nextPoi.chainKind) {
    return '调查结论会写入勘探报告，并可能影响贸易、航线或科研收益。';
  }
  if (nextPoi.chainKind === 'ancient_relic') {
    return '古代遗迹样本可推进科研，并写入后续科研补给与派遣判断。';
  }
  if (nextPoi.chainKind === 'lost_beacon') {
    return '失落航标可能重启暗线航图，降低后续旅行和派遣燃料压力。';
  }
  if (nextPoi.chainKind === 'derelict_depot') {
    return '废弃补给站可复原后勤信号，影响商网站点策略和派遣整备判断。';
  }
  return '调查结论会写入勘探报告，并可能影响贸易、航线或科研收益。';
}

function _shouldOfferResearchSupply(researchSupplyRoute) {
  return !!(
    researchSupplyRoute &&
    researchSupplyRoute.buySystemId &&
    researchSupplyRoute.sellSystemId &&
    researchSupplyRoute.goodId
  );
}

function _shouldOfferResearchFunding(researchBlocker) {
  return !!(researchBlocker && researchBlocker.reasonId === 'credits');
}

function _shouldOfferDispatchRoute(dispatchRouteRecommendation) {
  return !!(
    dispatchRouteRecommendation &&
    dispatchRouteRecommendation.buySystemId &&
    dispatchRouteRecommendation.sellSystemId &&
    dispatchRouteRecommendation.goodId
  );
}

function _getDispatchRouteReason(dispatchRouteRecommendation) {
  if (!dispatchRouteRecommendation) return '当前已有可执行商运路线，可先带入机库确认派遣参数。';
  var routeText = (dispatchRouteRecommendation.buySystemName || dispatchRouteRecommendation.buySystemId || '买入地') +
    ' → ' +
    (dispatchRouteRecommendation.sellSystemName || dispatchRouteRecommendation.sellSystemId || '卖出地');
  var parts = [
    routeText + ' 的 ' + (dispatchRouteRecommendation.goodName || dispatchRouteRecommendation.goodId || '商品') + '路线可执行。',
  ];
  if (dispatchRouteRecommendation.strategySummary) parts.push(dispatchRouteRecommendation.strategySummary);
  if (dispatchRouteRecommendation.surveyIntelSummary) parts.push(dispatchRouteRecommendation.surveyIntelSummary);
  return parts.slice(0, 3).join(' ');
}

function _isRouteRecommendationOpen(recommendation, dispatchModalContext) {
  if (!_shouldOfferDispatchRoute(recommendation) || !dispatchModalContext) return false;
  return dispatchModalContext.buySystemId === recommendation.buySystemId
    && dispatchModalContext.sellSystemId === recommendation.sellSystemId
    && dispatchModalContext.goodId === recommendation.goodId;
}

function _shouldOfferRepair(serviceStatus) {
  if (!serviceStatus || !serviceStatus.repairQuote) return false;
  var quote = serviceStatus.repairQuote;
  if (quote.disabledReason) return false;
  var hullRatio = Number.isFinite(serviceStatus.hullRatio) ? serviceStatus.hullRatio : 1;
  return (quote.faultCount || 0) > 0 || hullRatio <= 0.75 || _hasMaintenancePressure(serviceStatus);
}

function _shouldOfferRepairFunding(serviceStatus) {
  return !!(
    serviceStatus &&
    serviceStatus.repairQuote &&
    serviceStatus.repairQuote.disabledReason === '积分不足'
  );
}

function _getServiceMaintenanceValue(serviceStatus) {
  if (!serviceStatus) return 100;
  if (Number.isFinite(serviceStatus.maintenanceValue)) return Math.max(0, Math.min(100, serviceStatus.maintenanceValue));
  if (serviceStatus.maintenance && Number.isFinite(serviceStatus.maintenance.value)) {
    return Math.max(0, Math.min(100, serviceStatus.maintenance.value));
  }
  return 100;
}

function _hasMaintenancePressure(serviceStatus) {
  var value = _getServiceMaintenanceValue(serviceStatus);
  var band = serviceStatus && serviceStatus.maintenanceBand
    ? serviceStatus.maintenanceBand
    : (serviceStatus && serviceStatus.maintenance ? serviceStatus.maintenance.band : '');
  return value <= 50 || band === 'worn' || band === 'critical';
}

function _getRepairSuggestionReason(serviceStatus) {
  var quote = serviceStatus && serviceStatus.repairQuote ? serviceStatus.repairQuote : {};
  var hullRatio = Number.isFinite(serviceStatus && serviceStatus.hullRatio) ? serviceStatus.hullRatio : 1;
  if (_hasMaintenancePressure(serviceStatus) && (quote.faultCount || 0) <= 0 && hullRatio > 0.75) {
    return '激活飞船维护度已降至 ' + Math.round(_getServiceMaintenanceValue(serviceStatus)) + '%，先入坞维修可避免燃耗、事件和派遣稳定性继续恶化。';
  }
  return '当前船况已影响后续派遣和航行稳定性，先进入机库确认维修方案。';
}

function _shouldOfferModRecommendation(modRecommendation) {
  return !!(
    modRecommendation &&
    modRecommendation.canInstall &&
    modRecommendation.modId &&
    modRecommendation.mod
  );
}

function _isModRecommendationOpen(modRecommendation, modModalContext) {
  if (!_shouldOfferModRecommendation(modRecommendation) || !modModalContext) return false;
  if (modModalContext.shipIndex !== modRecommendation.shipIndex) return false;
  return modModalContext.recommendedModId === modRecommendation.modId
    || modModalContext.focusModId === modRecommendation.modId;
}

function _wasModRecentlyInstalled(modRecommendation, recentModInstallContext) {
  if (!_shouldOfferModRecommendation(modRecommendation) || !recentModInstallContext) return false;
  return recentModInstallContext.shipIndex === modRecommendation.shipIndex;
}

function _shouldOfferSurveyIntel(surveyIntel) {
  return !!(
    surveyIntel &&
    surveyIntel.hasIntel &&
    (surveyIntel.marketSignal || surveyIntel.researchSignal || surveyIntel.routeSignal || surveyIntel.logisticsSignal)
  );
}

function _getSurveyIntelReason(surveyIntel) {
  if (!surveyIntel) return '勘探报告已经归档，先查看它对交易和派遣的影响。';
  if (surveyIntel.beaconSignal) return '失落航标已写入暗线航图，可用于后续航线和派遣判断。';
  if (surveyIntel.relicSignal) return '古代遗迹样本已经归档，可用于判断后续研究补给方向。';
  if (surveyIntel.depotSignal) return '废弃补给站已经复原，可用于后续派遣和商网经营。';
  if (surveyIntel.marketSignal) return '勘探报告已经形成贸易窗口，先查看行情分区再决定买卖或建站。';
  if (surveyIntel.routeSignal) return '勘探报告包含暗线航图，可用于后续航线和派遣判断。';
  if (surveyIntel.researchSignal) return '勘探报告包含科研样本，可用于判断后续研究补给方向。';
  if (surveyIntel.logisticsSignal) return '勘探报告指出补给节点，可用于后续派遣和商网经营。';
  return '勘探报告已经归档，先查看它对交易和派遣的影响。';
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

function _normalizeTargetValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _inferSuggestionTarget(suggestion) {
  if (!suggestion || suggestion.target === false) return null;
  if (suggestion.target && suggestion.target.surface) return suggestion.target;

  if (suggestion.actionType === 'market.open' || suggestion.actionType === 'market.focus') {
    var payload = suggestion.payload || {};
    var workspaceId = _normalizeTargetValue(payload.workspaceId) || 'spot';
    var subworkspaceId = _normalizeTargetValue(payload.subworkspaceId) || 'trade';
    var target = {
      surface: 'market',
      workspaceId: workspaceId,
      subworkspaceId: subworkspaceId,
    };
    if (workspaceId === 'spot' && subworkspaceId === 'intel' && payload.systemId) {
      target.systemId = _normalizeTargetValue(payload.systemId);
    }
    return target;
  }

  return null;
}

function _getActiveMarketTarget(state, options) {
  var opts = options || {};
  if (!opts.marketOpen) return null;

  var marketFocus = opts.marketFocus || opts.activeMarketFocus || null;
  var workspaceId = marketFocus ? _normalizeTargetValue(marketFocus.workspaceId) : '';
  var subworkspaceId = marketFocus ? _normalizeTargetValue(marketFocus.subworkspaceId) : '';
  var systemId = marketFocus ? _normalizeTargetValue(marketFocus.systemId) : '';
  var hasSpecificFocus = !!(workspaceId || subworkspaceId || systemId);

  return {
    surface: 'market',
    workspaceId: workspaceId,
    subworkspaceId: subworkspaceId,
    systemId: systemId || _normalizeTargetValue(opts.marketSystemId) || _normalizeTargetValue(state && state.currentSystem),
    hasSpecificFocus: hasSpecificFocus,
  };
}

function _targetFieldMatches(targetValue, activeValue) {
  if (!targetValue) return true;
  if (!activeValue) return false;
  return targetValue === activeValue;
}

function _isMarketTargetSatisfied(target, state, options) {
  var activeTarget = _getActiveMarketTarget(state, options);
  if (!activeTarget) return false;

  // Older callers may only know that the market is open. Treat that as a
  // broad satisfied market target, while precise callers can match tabs.
  if (!activeTarget.hasSpecificFocus) return true;

  return _targetFieldMatches(target.workspaceId, activeTarget.workspaceId) &&
    _targetFieldMatches(target.subworkspaceId, activeTarget.subworkspaceId) &&
    _targetFieldMatches(target.systemId, activeTarget.systemId);
}

function _isSuggestionTargetSatisfied(suggestion, state, options) {
  var target = _inferSuggestionTarget(suggestion);
  if (!target || !target.surface) return false;
  if (target.surface === 'market') return _isMarketTargetSatisfied(target, state, options);
  return false;
}

function _filterSatisfiedTargets(suggestions, state, options) {
  return (suggestions || []).filter(function (suggestion) {
    return !_isSuggestionTargetSatisfied(suggestion, state, options);
  });
}

export function getCurrentSuggestion(state, options) {
  if (!state) return null;

  var opts = options || {};
  if (opts.tutorialActive || opts.blockingModalOpen) return null;

  var activeQuests = Quest.getActiveQuests(state);
  var firstTradeActive = _getActiveQuest(state, FIRST_TRADE_QUEST_ID);
  var firstTradeAvailable = _getAvailableQuest(state, FIRST_TRADE_QUEST_ID);
  var firstExploreAvailable = _getAvailableQuest(state, FIRST_EXPLORE_QUEST_ID);
  var lowPriceGood = _getLowPriceGood(state);
  var suggestions = [];

  if (opts.eventPending) {
    suggestions.push(_createSuggestion({
      id: 'handle-pending-event',
      priority: 110,
      title: '处理待处理事件',
      reason: '事件会阻塞航行与跨界面操作，先处理完再继续当前路线。',
      actionLabel: '查看事件',
      actionType: 'event.open',
      payload: {},
      surface: 'system',
    }));
  }

  if (activeQuests.length === 0 && firstTradeAvailable && !_isQuestCompleted(state, FIRST_TRADE_QUEST_ID)) {
    suggestions.push(_createSuggestion({
      id: 'accept-first-trade',
      priority: 100,
      title: '接取「初次交易」',
      reason: '完成第一笔买卖，建立基础贸易节奏。',
      actionLabel: '接取任务',
      actionType: 'quest.accept',
      payload: { questId: FIRST_TRADE_QUEST_ID },
      surface: 'quest',
    }));
  }

  if (_shouldOfferRefuel(state)) {
    var fuelNeeded = _getFuelNeeded(state);
    suggestions.push(_createSuggestion({
      id: 'refuel-low-tank',
      priority: 95,
      title: '补足当前燃料',
      reason: '燃料已低于安全线，先补给可以避免下一段航行或扫描被阻塞。',
      actionLabel: '补充燃料',
      actionType: 'trade.refuel',
      payload: {
        fuelNeeded: fuelNeeded,
        workspaceId: 'spot',
        subworkspaceId: 'trade',
      },
      surface: 'market',
    }));
  }

  if (_shouldOfferRepair(opts.serviceStatus)) {
    suggestions.push(_createSuggestion({
      id: 'service-active-ship',
      priority: 58,
      title: '安排激活飞船维修',
      reason: _getRepairSuggestionReason(opts.serviceStatus),
      actionLabel: '打开机库',
      actionType: 'fleet.service.open',
      payload: {
        shipIndex: opts.serviceStatus.shipIndex || 0,
        repairCost: opts.serviceStatus.repairQuote.cost || 0,
        maintenanceValue: _getServiceMaintenanceValue(opts.serviceStatus),
      },
      surface: 'fleet',
    }));
  } else if (_shouldOfferRepairFunding(opts.serviceStatus)) {
    suggestions.push(_createSuggestion({
      id: 'fund-ship-service',
      priority: 35,
      title: '筹措维修资金',
      reason: '激活飞船需要维修但积分不足，先做一笔周转再回机库。',
      actionLabel: '打开市场',
      actionType: 'market.open',
      payload: {
        workspaceId: 'spot',
        subworkspaceId: 'trade',
      },
      surface: 'market',
      commandIntent: '现货交易区',
    }));
  }

  if (firstTradeActive && !_hasCargo(state) && lowPriceGood) {
    suggestions.push(_createSuggestion({
      id: 'buy-low-price-good',
      priority: 90,
      title: '买入「' + lowPriceGood.goodName + '」',
      reason: '当前价格偏低，适合打开确认单建仓推进交易目标。',
      actionLabel: '确认买入',
      actionType: 'trade.buy',
      payload: {
        goodId: lowPriceGood.goodId,
        marketType: 'open',
        tradeAction: 'buy',
        questName: firstTradeActive.name || '初次交易',
      },
      surface: 'market',
    }));
  }

  if (firstTradeActive && !_hasCargo(state) && !lowPriceGood && !opts.marketOpen) {
    suggestions.push(_createSuggestion({
      id: 'open-market-for-first-trade',
      priority: 88,
      title: '打开当前市场',
      reason: '当前暂无明确低价货，先查看市场再选择买入目标。',
      actionLabel: '打开市场',
      actionType: 'market.open',
      payload: { workspaceId: 'spot', subworkspaceId: 'trade' },
      surface: 'market',
    }));
  }

  var cargoEntry = _getPrimaryCargoEntry(state);
  if (cargoEntry) {
    var goodName = _getGoodName(cargoEntry.goodId);
    if (_isCurrentSystemGoodForSelling(state, cargoEntry.goodId)) {
      suggestions.push(_createSuggestion({
        id: 'sell-first-cargo',
        priority: 70,
        title: '卖出「' + goodName + '」',
        reason: '打开确认单卖出已有货物，完成第一笔交易。',
        actionLabel: '确认卖出',
        actionType: 'trade.sell',
        payload: {
          goodId: cargoEntry.goodId,
          marketType: 'open',
          tradeAction: 'sell',
          questName: firstTradeActive ? (firstTradeActive.name || '初次交易') : '',
        },
        surface: 'market',
      }));
    } else {
      var destination = _findBestSellDestination(state, cargoEntry.goodId);
      var canDirectTravel = !!destination && !opts.eventPending;
      suggestions.push(_createSuggestion({
        id: 'find-sell-destination',
        priority: 60,
        title: destination ? ('前往「' + destination.name + '」卖货') : '寻找卖出目的地',
        reason: opts.eventPending
          ? '先定位更好的卖货点；当前有待处理事件，处理后再起航。'
          : '选择需求更高的星球，获得更好利润。',
        actionLabel: canDirectTravel ? '直接前往' : (destination ? '定位卖货点' : '查看星图'),
        actionType: canDirectTravel ? 'travel.execute' : 'map.focus',
        payload: {
          goodId: cargoEntry.goodId,
          destinationSystemId: destination ? destination.id : '',
          destinationSystemName: destination ? destination.name : '',
        },
        surface: 'navigation',
      }));
    }
  }

  if (activeQuests.length === 0 && _isQuestCompleted(state, FIRST_TRADE_QUEST_ID) && firstExploreAvailable) {
    suggestions.push(_createSuggestion({
      id: 'accept-first-explore',
      priority: 50,
      title: '接取「初探宇宙」',
      reason: '贸易循环已建立，可以开始学习航行与扫描。',
      actionLabel: '接取任务',
      actionType: 'quest.accept',
      payload: { questId: FIRST_EXPLORE_QUEST_ID },
      surface: 'quest',
    }));
  }

  if (_shouldOfferResearchSupply(opts.researchSupplyRoute) && !_isRouteRecommendationOpen(opts.researchSupplyRoute, opts.dispatchModalContext)) {
    suggestions.push(_createSuggestion({
      id: 'prefill-research-supply-dispatch',
      priority: 24,
      title: '规划科研补给派遣',
      reason: '当前研究已有可执行补给路线，可交给激活飞船派遣推进中期成长。',
      actionLabel: '带入机库',
      actionType: 'fleet.dispatch.prefill',
      payload: {
        sourceLabel: '科研补给建议',
        recommendation: opts.researchSupplyRoute,
      },
      surface: 'fleet',
    }));
  } else if (_shouldOfferResearchFunding(opts.researchBlocker)) {
    suggestions.push(_createSuggestion({
      id: 'resolve-research-funding',
      priority: 34,
      title: '补足科研补给资金',
      reason: '当前研究方向缺少进货垫资，先打开市场做一笔周转。',
      actionLabel: '打开市场',
      actionType: 'market.open',
      payload: {
        workspaceId: 'spot',
        subworkspaceId: 'trade',
      },
      surface: 'market',
      commandIntent: '现货交易区',
    }));
  }

  if (!_shouldOfferResearchSupply(opts.researchSupplyRoute) && _shouldOfferDispatchRoute(opts.dispatchRouteRecommendation) && !_isRouteRecommendationOpen(opts.dispatchRouteRecommendation, opts.dispatchModalContext)) {
    suggestions.push(_createSuggestion({
      id: 'prefill-profitable-dispatch',
      priority: 23,
      title: '规划「' + (opts.dispatchRouteRecommendation.goodName || opts.dispatchRouteRecommendation.goodId || '商品') + '」派遣',
      reason: _getDispatchRouteReason(opts.dispatchRouteRecommendation),
      actionLabel: '带入机库',
      actionType: 'fleet.dispatch.prefill',
      payload: {
        sourceLabel: '派遣策略建议',
        recommendation: opts.dispatchRouteRecommendation,
      },
      surface: 'fleet',
    }));
  }

  if (_shouldOfferSurveyIntel(opts.surveyIntel)) {
    suggestions.push(_createSuggestion({
      id: 'review-survey-market-intel',
      priority: 32,
      title: '查看「' + (opts.surveyIntel.recentReportTitle || '勘探报告') + '」',
      reason: _getSurveyIntelReason(opts.surveyIntel),
      actionLabel: '查看行情',
      actionType: 'market.open',
      payload: {
        workspaceId: 'spot',
        subworkspaceId: 'intel',
        systemId: opts.surveyIntel.systemId || state.currentSystem,
        intelSignal: opts.surveyIntel.primarySignal || '',
      },
      surface: 'market',
      commandIntent: '市场情报区',
    }));
  }

  var financeSuggestion = _getFinanceSuggestion(state);
  if (financeSuggestion) suggestions.push(financeSuggestion);

  var tradeNetworkSuggestion = _getTradeNetworkSuggestion(state);
  if (tradeNetworkSuggestion) suggestions.push(tradeNetworkSuggestion);

  if (
    _shouldOfferModRecommendation(opts.modRecommendation) &&
    !_isModRecommendationOpen(opts.modRecommendation, opts.modModalContext) &&
    !_wasModRecentlyInstalled(opts.modRecommendation, opts.recentModInstallContext)
  ) {
    suggestions.push(_createSuggestion({
      id: 'install-recommended-ship-mod',
      priority: 19,
      title: '安装「' + opts.modRecommendation.mod.name + '」',
      reason: opts.modRecommendation.reason,
      actionLabel: '打开机库',
      actionType: 'fleet.mod.open',
      payload: {
        shipIndex: opts.modRecommendation.shipIndex || 0,
        modId: opts.modRecommendation.modId,
        modName: opts.modRecommendation.mod.name,
        modCost: opts.modRecommendation.mod.cost || 0,
      },
      surface: 'fleet',
      commandIntent: '模块改装',
    }));
  }

  if (_shouldOfferScan(opts.scanStatus)) {
    suggestions.push(_createSuggestion({
      id: 'scan-current-system',
      priority: 40,
      title: '扫描当前星球',
      reason: '扫描会揭示本地资源、风险和探索机会。',
      actionLabel: '执行扫描',
      actionType: 'exploration.scan',
      payload: { systemId: state.currentSystem },
      surface: 'exploration',
    }));
  }

  if (_shouldOfferLanding(opts.landingStatus)) {
    suggestions.push(_createSuggestion({
      id: 'land-current-system',
      priority: 38,
      title: '申请首次着陆',
      reason: '着陆后才能调查已发现的探索点，并把结果沉淀为勘探报告。',
      actionLabel: opts.landingStatus.actionLabel || '申请首次着陆',
      actionType: 'exploration.land',
      payload: { systemId: state.currentSystem },
      surface: 'exploration',
    }));
  }

  if (_shouldOfferPoi(opts.nextPoiStatus, opts.nextPoi)) {
    var poiName = _getPoiName(opts.nextPoi);
    suggestions.push(_createSuggestion({
      id: 'explore-current-poi',
      priority: 36,
      title: '调查「' + poiName + '」',
      reason: _getPoiChainReason(opts.nextPoi),
      actionLabel: opts.nextPoiStatus.actionLabel || ('调查 ' + poiName),
      actionType: 'exploration.poi',
      payload: {
        systemId: state.currentSystem,
        poiId: opts.nextPoi.poiId || opts.nextPoi.id || '',
      },
      surface: 'exploration',
    }));
  }

  suggestions = _filterSatisfiedTargets(suggestions, state, opts);
  if (suggestions.length === 0) return null;
  suggestions.sort(function (left, right) {
    return right.priority - left.priority;
  });
  return suggestions[0];
}

export const GUIDE_QUEST_IDS = {
  firstTrade: FIRST_TRADE_QUEST_ID,
  firstExplore: FIRST_EXPLORE_QUEST_ID,
};
