// js/ui/MarketFinanceController.js — 资金与贸易站 DOM、命令和局部排序生命周期
// Presenter 只生成投影；本控制器共享 Commerce 快照并通过 typed command 端口发布意图。

import { MARKET_COMMAND } from '../core/MarketCommand.js';
import * as Commerce from '../systems/commerce/CommerceFacade.js';
import { renderMarketCapitalWorkspace } from './MarketCapitalPresenter.js';
import {
  parseMarketBatchSystemIds,
  renderMarketOperationsWorkspace,
  updateMarketOperationsSortModes,
} from './MarketOperationsPresenter.js';

export const MARKET_FINANCE_ELEMENT_IDS = Object.freeze({
  capital: 'market-capital-pane',
  operations: 'market-operations-pane',
});

function _resolveDatasetNode(target, root, datasetKey) {
  var node = target || null;
  var matchedNode = null;
  while (node) {
    if (!matchedNode && node.dataset && node.dataset[datasetKey]) matchedNode = node;
    if (node === root) return matchedNode;
    node = node.parentElement || node.parentNode || null;
  }
  return null;
}

function _resolveCommand(action, dataset) {
  if (action === 'market-take-loan') {
    return { type: MARKET_COMMAND.TAKE_LOAN, payload: { loanOfferId: dataset.loanOfferId } };
  }
  if (action === 'market-repay-loan') {
    return { type: MARKET_COMMAND.REPAY_LOAN, payload: { loanId: dataset.loanId } };
  }
  if (action === 'market-invest-trade-station') {
    return { type: MARKET_COMMAND.INVEST_STATION, payload: { systemId: dataset.systemId } };
  }
  if (action === 'market-redeem-trade-station') {
    return { type: MARKET_COMMAND.REDEEM_STATION_INVESTMENT, payload: { systemId: dataset.systemId } };
  }
  if (action === 'market-batch-invest-trade-stations') {
    return {
      type: MARKET_COMMAND.BATCH_INVEST_STATIONS,
      payload: {
        systemIds: parseMarketBatchSystemIds(dataset.systemIds),
        amount: Number(dataset.batchAmount || 0) || undefined,
      },
    };
  }
  if (action === 'market-build-station') {
    return { type: MARKET_COMMAND.BUILD_STATION, payload: { systemId: dataset.systemId } };
  }
  if (action === 'market-upgrade-station') {
    return { type: MARKET_COMMAND.UPGRADE_STATION, payload: { systemId: dataset.systemId } };
  }
  if (action === 'market-set-strategy') {
    return {
      type: MARKET_COMMAND.SET_STATION_STRATEGY,
      payload: { systemId: dataset.systemId, strategyId: dataset.strategyId },
    };
  }
  if (action === 'market-batch-upgrade-stations') {
    return {
      type: MARKET_COMMAND.BATCH_UPGRADE_STATIONS,
      payload: { systemIds: parseMarketBatchSystemIds(dataset.systemIds) },
    };
  }
  if (action === 'market-batch-set-strategy') {
    return {
      type: MARKET_COMMAND.BATCH_SET_STATION_STRATEGY,
      payload: {
        strategyId: dataset.strategyId,
        systemIds: parseMarketBatchSystemIds(dataset.systemIds),
      },
    };
  }
  return null;
}

export function createMarketFinanceController(options) {
  var opts = options || {};
  var session = opts.session;
  var navigation = opts.navigation;
  var commerce = opts.commerce || Commerce;
  var renderCapitalWorkspace = typeof opts.renderCapitalWorkspace === 'function'
    ? opts.renderCapitalWorkspace
    : renderMarketCapitalWorkspace;
  var renderOperationsWorkspace = typeof opts.renderOperationsWorkspace === 'function'
    ? opts.renderOperationsWorkspace
    : renderMarketOperationsWorkspace;
  var updateOperationsSortModes = typeof opts.updateOperationsSortModes === 'function'
    ? opts.updateOperationsSortModes
    : updateMarketOperationsSortModes;
  var commerceSnapshots = new WeakMap();
  var capitalRenderCount = 0;
  var operationsRenderCount = 0;
  var capitalBindCount = 0;
  var operationsBindCount = 0;
  var sortChangeCount = 0;
  var commandPublishCount = 0;
  var commerceSnapshotResolveCount = 0;
  var lastCommandType = null;
  var lastSortScope = null;
  var lastSortMode = null;
  var lastSystemId = null;
  var lastRegion = null;

  function getDocument() {
    if (typeof opts.getDocument === 'function') return opts.getDocument();
    return typeof document !== 'undefined' ? document : null;
  }

  function getElement(doc, id) {
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function getCommerceSnapshot(request) {
    if (request.commerceSnapshot) return request.commerceSnapshot;
    if (!commerceSnapshots.has(request)) {
      commerceSnapshots.set(request, commerce.getCommerceSnapshot(request.state));
      commerceSnapshotResolveCount += 1;
    }
    return commerceSnapshots.get(request);
  }

  function publishCommand(request, type, payload) {
    if (typeof request.onCommand !== 'function' || typeof opts.publishCommand !== 'function') return false;
    opts.publishCommand(request.onCommand, type, payload);
    commandPublishCount += 1;
    lastCommandType = type;
    return true;
  }

  function updateOperationsSort(request, dataset) {
    var scope = dataset.batchSortScope;
    var mode = dataset.batchSortMode;
    var current = session.getOperationsSortModes();
    var next = updateOperationsSortModes(current, scope, mode);
    if (!scope || next[scope] !== mode || current[scope] === next[scope]) return false;

    session.setOperationsSortModes(next);
    sortChangeCount += 1;
    lastSortScope = scope;
    lastSortMode = mode;
    if (typeof request.rerenderOperations === 'function') request.rerenderOperations();
    return true;
  }

  function bindCommands(container, request, region) {
    if (!container) return;
    navigation.bindSubworkspaceTabs(container, request.progression);

    container.onclick = function (event) {
      var button = _resolveDatasetNode(event && event.target, container, 'action');
      if (!button || button.disabled || (button.getAttribute && button.getAttribute('aria-disabled') === 'true')) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

      if (button.dataset.action === 'market-batch-set-sort') {
        if (region === 'operations') updateOperationsSort(request, button.dataset);
        return;
      }

      var command = _resolveCommand(button.dataset.action, button.dataset);
      if (command) publishCommand(request, command.type, command.payload);
    };

    if (region === 'capital') capitalBindCount += 1;
    else operationsBindCount += 1;
  }

  function renderCapital(request) {
    var input = request || {};
    var container = getElement(getDocument(), MARKET_FINANCE_ELEMENT_IDS.capital);
    if (!container) return false;
    var workspace = renderCapitalWorkspace({
      state: input.state,
      systemId: input.systemId,
      isCurrentSystem: input.isCurrentSystem,
      commerceSnapshot: getCommerceSnapshot(input),
    });
    container.innerHTML = workspace.overviewHtml +
      '<div class="market-workspace-board market-capital-board">' + navigation.renderSubworkspace('capital', {
        local: workspace.localHtml,
      }, input.progression) + '</div>';
    bindCommands(container, input, 'capital');
    capitalRenderCount += 1;
    lastSystemId = input.systemId || null;
    lastRegion = 'capital';
    return true;
  }

  function renderOperations(request) {
    var input = request || {};
    var container = getElement(getDocument(), MARKET_FINANCE_ELEMENT_IDS.operations);
    if (!container) return false;
    var workspace = renderOperationsWorkspace({
      state: input.state,
      systemId: input.systemId,
      isCurrentSystem: input.isCurrentSystem,
      commerceSnapshot: getCommerceSnapshot(input),
      sortModes: session.getOperationsSortModes(),
    });
    container.innerHTML = workspace.overviewHtml +
      '<div class="market-workspace-board market-operations-board">' +
        navigation.renderSubworkspace('operations', workspace.sections, input.progression) +
      '</div>';
    bindCommands(container, input, 'operations');
    operationsRenderCount += 1;
    lastSystemId = input.systemId || null;
    lastRegion = 'operations';
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      capitalRenderCount: capitalRenderCount,
      operationsRenderCount: operationsRenderCount,
      capitalBindCount: capitalBindCount,
      operationsBindCount: operationsBindCount,
      sortChangeCount: sortChangeCount,
      commandPublishCount: commandPublishCount,
      commerceSnapshotResolveCount: commerceSnapshotResolveCount,
      lastCommandType: lastCommandType,
      lastSortScope: lastSortScope,
      lastSortMode: lastSortMode,
      lastSystemId: lastSystemId,
      lastRegion: lastRegion,
    });
  }

  function reset() {
    commerceSnapshots = new WeakMap();
    capitalRenderCount = 0;
    operationsRenderCount = 0;
    capitalBindCount = 0;
    operationsBindCount = 0;
    sortChangeCount = 0;
    commandPublishCount = 0;
    commerceSnapshotResolveCount = 0;
    lastCommandType = null;
    lastSortScope = null;
    lastSortMode = null;
    lastSystemId = null;
    lastRegion = null;
    return getDiagnostics();
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    renderCapital: renderCapital,
    renderOperations: renderOperations,
    reset: reset,
  });
}
