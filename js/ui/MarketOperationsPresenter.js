// js/ui/MarketOperationsPresenter.js — 贸易站经营工作区组合门面
// 只采集领域快照并组合四个纯投影子域；workspace 状态与 command 委托由 MarketFinanceController 拥有。

import * as Commerce from '../systems/commerce/CommerceFacade.js';
import * as Finance from '../systems/finance/FinanceSystem.js';
import * as TradeStation from '../systems/trade/TradeStationSystem.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import {
  getMarketBatchAffordablePlan,
  getMarketInvestmentBatchPlan,
  parseMarketBatchSystemIds as parseBatchSystemIds,
  updateMarketOperationsSortModes as updateSortModes,
} from './MarketBatchPlanPresenter.js';
import { renderMarketLocalOperations } from './MarketLocalOperationsPresenter.js';
import {
  renderMarketOperationsCommandDeck,
  renderMarketOperationsNetwork,
} from './MarketOperationsOverviewPresenter.js';
import {
  getTradeStationCandidateIntel as getCandidateIntel,
  renderMarketTradeStationList,
} from './MarketTradeStationListPresenter.js';

export function parseMarketBatchSystemIds(value) {
  return parseBatchSystemIds(value);
}

export function updateMarketOperationsSortModes(current, scope, mode) {
  return updateSortModes(current, scope, mode);
}

export function getTradeStationCandidateIntel(state, systemId, exploration) {
  return getCandidateIntel(state, systemId, exploration);
}

export function renderMarketOperationsWorkspace(request) {
  var input = request || {};
  var state = input.state || {};
  var viewingSystem = input.systemId;
  var finance = input.finance || Finance;
  var tradeStation = input.tradeStation || TradeStation;
  var commerce = input.commerce || Commerce;
  var exploration = input.exploration || Exploration;
  var commerceSnapshot = input.commerceSnapshot || commerce.getCommerceSnapshot(state);
  var sortModes = updateMarketOperationsSortModes(input.sortModes);
  var tradeInvestments = finance.getTradeInvestmentOptions(
    state,
    [viewingSystem].concat(state.visitedSystems || []).concat(Object.keys(state.tradeInvestments || {}))
  );
  var localInvestment = tradeInvestments.find(function (entry) {
    return entry.systemId === viewingSystem;
  }) || null;
  var tradeSummary = tradeStation.getSummary(state);
  var ownedStations = tradeStation.getOwnedStations(state);
  var buildCandidates = tradeStation.getBuildCandidates(state);
  var nextNetworkAction = tradeStation.getNextNetworkAction(state);
  var networkInvestmentPlan = getMarketInvestmentBatchPlan(state, ownedStations, finance);
  var networkUpgradePlan = getMarketBatchAffordablePlan(
    ownedStations.filter(function (entry) { return !!entry.nextLevel && entry.nextUpgradeCost > 0; }),
    state.credits || 0,
    function (entry) { return entry.nextUpgradeCost || 0; }
  );
  var localStation = ownedStations.find(function (entry) {
    return entry.station.systemId === viewingSystem;
  }) || null;
  var buildCandidate = buildCandidates.find(function (entry) {
    return entry.system.id === viewingSystem;
  }) || null;
  var projection = {
    state: state,
    viewingSystem: viewingSystem,
    isCurrentSystem: !!input.isCurrentSystem,
    exploration: exploration,
    commerceSnapshot: commerceSnapshot,
    tradeSummary: tradeSummary,
    ownedStations: ownedStations,
    buildCandidates: buildCandidates,
    localStation: localStation,
    buildCandidate: buildCandidate,
    localInvestment: localInvestment,
    nextNetworkAction: nextNetworkAction,
    networkInvestmentPlan: networkInvestmentPlan,
    networkUpgradePlan: networkUpgradePlan,
    sortModes: sortModes,
  };

  return {
    model: {
      commerceSnapshot: commerceSnapshot,
      tradeSummary: tradeSummary,
      ownedStations: ownedStations,
      buildCandidates: buildCandidates,
      localStation: localStation,
      buildCandidate: buildCandidate,
      localInvestment: localInvestment,
      networkInvestmentPlan: networkInvestmentPlan,
      networkUpgradePlan: networkUpgradePlan,
      sortModes: sortModes,
    },
    overviewHtml: renderMarketOperationsCommandDeck(projection),
    sections: {
      local: renderMarketLocalOperations(projection),
      network: renderMarketOperationsNetwork(projection),
      stations: renderMarketTradeStationList(projection),
    },
  };
}
