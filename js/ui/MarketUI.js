// js/ui/MarketUI.js — 商业终端（价格总览 + 节点工作台双模式）
// 依赖：data/goods.js, data/systems.js, systems/economy/Economy.js
// 导出：renderOverview, render (detail), showOverview, showDetail

import { GOODS }    from '../data/goods.js';
import { findSystem } from '../data/systems.js';
import * as Economy from '../systems/economy/Economy.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as Commerce from '../systems/commerce/CommerceFacade.js';
import * as ContextInspector from './ContextInspector.js';
import { MARKET_COMMAND, normalizeMarketCommand } from '../core/MarketCommand.js';
import {
  buildMarketSnapshots as _buildMarketSnapshots,
  renderMarketChartDashboard,
  updateMainMarketKlineChart,
} from './MarketChartPresenter.js';
import {
  renderAnalysisPanel as _renderAnalysisPanel,
  renderBlackMarketSection as _renderBlackMarketSection,
  renderQuickTradeDock as _renderQuickTradeDock,
  renderSpotGoodsToolbar as _renderSpotGoodsToolbar,
  renderSpotIntelSection as _renderSpotIntelSection,
  renderSpotTradeSection as _renderSpotTradeSection,
} from './MarketSpotPresenter.js';
import {
  renderMarketGoodsWorkspace as _renderMarketGoodsWorkspace,
  resolveMarketGoodsCommand as _resolveMarketGoodsCommand,
} from './MarketGoodsPresenter.js';
import { renderMarketCapitalWorkspace as _renderMarketCapitalWorkspace } from './MarketCapitalPresenter.js';
import {
  getTradeStationCandidateIntel,
  parseMarketBatchSystemIds as _parseBatchSystemIds,
  renderMarketOperationsWorkspace as _renderMarketOperationsWorkspace,
  updateMarketOperationsSortModes as _updateMarketOperationsSortModes,
} from './MarketOperationsPresenter.js';
import {
  buildMarketCommodityContextView,
  buildMarketCommodityDetailView,
} from './MarketCommodityDetailPresenter.js';
import {
  createMarketWorkspaceSession,
} from './MarketWorkspaceSession.js';
import {
  buildMarketProgression,
  getMarketExperienceRoute,
} from './MarketExperienceRoute.js';
import {
  createMarketWorkspaceNavigation,
} from './MarketWorkspaceNavigation.js';
import { createMarketOverviewController } from './MarketOverviewController.js';

export { getMarketExperienceRoute, getTradeStationCandidateIntel };

const _marketSession = createMarketWorkspaceSession();
export const MARKET_RENDER_REGION = Object.freeze({
  CHROME: 'market-chrome',
  SPOT: 'market-spot',
  CAPITAL: 'market-capital',
  OPERATIONS: 'market-operations',
});
const MARKET_RENDER_REGION_NAMES = Object.freeze(Object.values(MARKET_RENDER_REGION));

let _marketRenderCounts = {
  [MARKET_RENDER_REGION.CHROME]: 0,
  [MARKET_RENDER_REGION.SPOT]: 0,
  [MARKET_RENDER_REGION.CAPITAL]: 0,
  [MARKET_RENDER_REGION.OPERATIONS]: 0,
};
let _lastRenderedRegions = Object.freeze([]);
const _marketWorkspaceNavigation = createMarketWorkspaceNavigation({
  session: _marketSession,
  revealMarketGoodFocus: _revealMarketGoodFocus,
  clearMarketGuideFocus: _clearMarketGuideFocus,
});
const _marketOverviewController = createMarketOverviewController({
  session: _marketSession,
});

function _hasDocument() {
  return typeof document !== 'undefined';
}

function _getMarketFocusKey(sysId, marketMode) {
  if (!sysId) return '';
  return sysId + ':' + (marketMode || 'open');
}

function _escapeSelectorValue(value) {
  var text = String(value);
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(text);
  }
  if (typeof globalThis !== 'undefined' && globalThis.CSS && globalThis.CSS.escape) {
    return globalThis.CSS.escape(text);
  }
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function _publishMarketCommand(onCommand, type, payload) {
  if (typeof onCommand !== 'function') return false;
  var command = normalizeMarketCommand(Object.assign({}, payload || {}, { type: type }));
  return command ? onCommand(command) : false;
}

function _resolveMarketDatasetNode(target, root, datasetKey) {
  var node = target || null;
  var matchedNode = null;
  while (node) {
    if (!matchedNode && node.dataset && node.dataset[datasetKey]) matchedNode = node;
    if (node === root) return matchedNode;
    node = node.parentElement || node.parentNode || null;
  }
  return null;
}

function _resolveMarketActionNode(target, root) {
  return _resolveMarketDatasetNode(target, root, 'action');
}

function _clearMarketGuideFocus() {
  if (!_hasDocument() || !document.querySelectorAll) return;

  document.querySelectorAll('.market-good-card--guide-focus').forEach(function (card) {
    card.classList.remove('market-good-card--guide-focus');
    if (card.removeAttribute) card.removeAttribute('data-guide-focus');
  });
  document.querySelectorAll('.market-card-btn--guide-focus').forEach(function (button) {
    button.classList.remove('market-card-btn--guide-focus');
  });
}

function _revealMarketGoodFocus(goodId, options) {
  if (!_hasDocument() || !goodId || !document.querySelector) return false;

  _clearMarketGuideFocus();

  var card = document.querySelector('[data-market-good="' + _escapeSelectorValue(goodId) + '"]');
  if (!card) return false;
  var opts = options || {};
  var tradeAction = opts.tradeAction === 'sell' ? 'sell' : 'buy';

  card.classList.add('market-good-card--guide-focus');
  if (card.setAttribute) card.setAttribute('data-guide-focus', 'true');

  var actionButton = card.querySelector
    ? card.querySelector(tradeAction === 'sell' ? '.sell-card-btn' : '.buy-card-btn')
    : null;
  if (actionButton) {
    actionButton.classList.add('market-card-btn--guide-focus');
  }

  if (typeof card.scrollIntoView === 'function') {
    card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }

  return true;
}

export function revealMarketGoodFocus(goodId, options) {
  return _revealMarketGoodFocus(goodId, options);
}

export function setFocusedMarketGood(sysId, marketMode, goodId) {
  var normalizedGoodId = typeof goodId === 'string' ? goodId.trim() : '';
  var focusKey = _getMarketFocusKey(sysId, marketMode);
  if (!focusKey || !normalizedGoodId) return false;

  return _marketSession.setFocusedGood(focusKey, normalizedGoodId);
}

export function getFocusedMarketGood(sysId, marketMode) {
  var focusKey = String(sysId || '') + ':' + (marketMode === 'black' ? 'black' : 'open');
  return _marketSession.getFocusedGood(focusKey);
}

export function renderContextInspector(request) {
  var context = request && request.context;
  var state = request && request.state;
  var container = request && request.container;
  if (!context || context.type !== 'commodity' || !state || !container) return false;
  var good = GOODS.find(function (entry) { return entry.id === context.id; });
  if (!good) return false;

  var activeContext = _marketSession.getActiveContext();
  var systemId = activeContext && activeContext.systemId
    ? activeContext.systemId
    : state.currentSystem;
  var system = findSystem(systemId) || findSystem(state.currentSystem);
  if (!system) return false;
  var isBlack = !!(activeContext && activeContext.mode === 'black');
  var buyPrice = isBlack
    ? Economy.getBlackMarketBuyPrice(system.id, good.id, state)
    : Economy.getBuyPrice(system.id, good.id, state);
  var sellPrice = isBlack
    ? Economy.getBlackMarketSellPrice(system.id, good.id, state)
    : Economy.getSellPrice(system.id, good.id, state);
  var view = buildMarketCommodityContextView({
    good: good,
    system: system,
    marketMode: isBlack ? 'black' : 'open',
    buyPrice: buyPrice,
    sellPrice: sellPrice,
    supplyDemand: Economy.getSupplyDemand(system.id, good.id),
    held: Number((state.cargo || {})[good.id]) || 0,
    credits: state.credits,
  });
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function renderWorkspaceDetail(request) {
  var detail = request && request.detail;
  var state = request && request.state;
  var container = request && request.container;
  if (!detail || detail.type !== 'trade-commodity' || !state || !container) return false;
  var good = GOODS.find(function (entry) { return entry.id === detail.id; });
  if (!good) return false;

  var activeContext = _marketSession.getActiveContext();
  var systemId = activeContext && activeContext.systemId
    ? activeContext.systemId
    : state.currentSystem;
  var system = findSystem(systemId) || findSystem(state.currentSystem);
  if (!system) return false;
  var isBlack = !!(activeContext && activeContext.mode === 'black');
  var view = buildMarketCommodityDetailView({
    good: good,
    system: system,
    marketMode: isBlack ? 'black' : 'open',
    buyPrice: isBlack
      ? Economy.getBlackMarketBuyPrice(system.id, good.id, state)
      : Economy.getBuyPrice(system.id, good.id, state),
    sellPrice: isBlack
      ? Economy.getBlackMarketSellPrice(system.id, good.id, state)
      : Economy.getSellPrice(system.id, good.id, state),
    supplyDemand: Economy.getSupplyDemand(system.id, good.id),
    held: Number((state.cargo || {})[good.id]) || 0,
    credits: state.credits,
  });
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

export function setMarketWorkspaceFocus(focus) {
  return _marketWorkspaceNavigation.setFocus(focus);
}

export function getActiveMarketWorkspaceFocus() {
  return _marketWorkspaceNavigation.getActiveFocus();
}

function _getMarketChartGoodsList(marketMode) {
  return marketMode === 'black'
    ? Economy.getBlackMarketGoods()
    : GOODS.filter(function (good) {
        return good.marketAccess && good.marketAccess.indexOf('open') !== -1;
      });
}

function _updateMainKlineChart(state, sysId, snapshots, marketMode) {
  var focusKey = sysId + ':' + (marketMode || 'open');
  var range = _marketSession.getChartRange(focusKey);
  return updateMainMarketKlineChart({
    state: state,
    systemId: sysId,
    snapshots: snapshots,
    marketMode: marketMode,
    focusedGoodId: _marketSession.getFocusedGood(focusKey),
    range: range,
    onRangeChange: function (nextRange) {
      _marketSession.setChartRange(focusKey, nextRange);
      var updatedSnapshots = _buildMarketSnapshots(
        state,
        sysId,
        _getMarketChartGoodsList(marketMode),
        marketMode === 'black',
        nextRange
      );
      _renderMarketDashboard(state, sysId, marketMode, updatedSnapshots);
      _updateMainKlineChart(state, sysId, updatedSnapshots, marketMode);
    },
  });
}

function _renderMarketDashboard(state, sysId, marketMode, snapshots) {
  var focusKey = sysId + ':' + (marketMode || 'open');
  var focusedGoodId = _marketSession.getFocusedGood(focusKey);
  var hasFocusedSnapshot = snapshots && snapshots.some(function (entry) {
    return entry.good.id === focusedGoodId;
  });
  if (!hasFocusedSnapshot && snapshots && snapshots[0]) {
    focusedGoodId = snapshots[0].good.id;
    _marketSession.setFocusedGood(focusKey, focusedGoodId);
  }
  return renderMarketChartDashboard({
    state: state,
    systemId: sysId,
    snapshots: snapshots,
    marketMode: marketMode,
    focusedGoodId: focusedGoodId,
    range: _marketSession.getChartRange(focusKey),
    onFocusChange: function (goodId) {
      _marketSession.setFocusedGood(focusKey, goodId);
      ContextInspector.replaceContext({
        type: 'commodity',
        id: goodId,
        workspaceId: 'trade',
        source: 'market-chart-rank',
        revision: ContextInspector.getCurrentRevision(),
      });
      _renderMarketDashboard(state, sysId, marketMode, snapshots);
      _updateMainKlineChart(state, sysId, snapshots, marketMode);
    },
    onRangeChange: function (nextRange) {
      _marketSession.setChartRange(focusKey, nextRange);
      var updatedSnapshots = _buildMarketSnapshots(
        state,
        sysId,
        _getMarketChartGoodsList(marketMode),
        marketMode === 'black',
        nextRange
      );
      _renderMarketDashboard(state, sysId, marketMode, updatedSnapshots);
      _updateMainKlineChart(state, sysId, updatedSnapshots, marketMode);
    },
  });
}

function _getCommerceSnapshot(context) {
  if (!context.commerceSnapshotResolved) {
    context.commerceSnapshot = Commerce.getCommerceSnapshot(context.state);
    context.commerceSnapshotResolved = true;
  }
  return context.commerceSnapshot;
}

function _bindMarketFinanceCommands(container, context, options) {
  if (!container) return;
  var opts = options || {};
  _marketWorkspaceNavigation.bindSubworkspaceTabs(container, context.progression);

  container.onclick = function (event) {
    var button = _resolveMarketActionNode(event && event.target, container);
    if (!button || button.disabled || (button.getAttribute && button.getAttribute('aria-disabled') === 'true')) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    var action = button.dataset.action;

    if (action === 'market-batch-set-sort') {
      if (!opts.allowOperationsSort) return;
      _marketSession.setOperationsSortModes(_updateMarketOperationsSortModes(
        _marketSession.getOperationsSortModes(),
        button.dataset.batchSortScope,
        button.dataset.batchSortMode
      ));
      renderOperations(context.renderRequest);
      return;
    }

    if (action === 'market-take-loan') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.TAKE_LOAN, { loanOfferId: button.dataset.loanOfferId });
    } else if (action === 'market-repay-loan') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.REPAY_LOAN, { loanId: button.dataset.loanId });
    } else if (action === 'market-invest-trade-station') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.INVEST_STATION, { systemId: button.dataset.systemId });
    } else if (action === 'market-redeem-trade-station') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.REDEEM_STATION_INVESTMENT, { systemId: button.dataset.systemId });
    } else if (action === 'market-batch-invest-trade-stations') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.BATCH_INVEST_STATIONS, {
        systemIds: _parseBatchSystemIds(button.dataset.systemIds),
        amount: Number(button.dataset.batchAmount || 0) || undefined,
      });
    } else if (action === 'market-build-station') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.BUILD_STATION, { systemId: button.dataset.systemId });
    } else if (action === 'market-upgrade-station') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.UPGRADE_STATION, { systemId: button.dataset.systemId });
    } else if (action === 'market-set-strategy') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.SET_STATION_STRATEGY, {
        systemId: button.dataset.systemId,
        strategyId: button.dataset.strategyId,
      });
    } else if (action === 'market-batch-upgrade-stations') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.BATCH_UPGRADE_STATIONS, {
        systemIds: _parseBatchSystemIds(button.dataset.systemIds),
      });
    } else if (action === 'market-batch-set-strategy') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.BATCH_SET_STATION_STRATEGY, {
        strategyId: button.dataset.strategyId,
        systemIds: _parseBatchSystemIds(button.dataset.systemIds),
      });
    }
  };
}

function _renderMarketCapital(context) {
  var container = document.getElementById('market-capital-pane');
  if (!container) return false;
  var workspace = _renderMarketCapitalWorkspace({
    state: context.state,
    systemId: context.systemId,
    isCurrentSystem: context.isCurrentSystem,
    commerceSnapshot: _getCommerceSnapshot(context),
  });
  container.innerHTML = workspace.overviewHtml +
    '<div class="market-workspace-board market-capital-board">' + _marketWorkspaceNavigation.renderSubworkspace('capital', {
      local: workspace.localHtml,
    }, context.progression) + '</div>';
  _bindMarketFinanceCommands(container, context);
  return true;
}

function _renderMarketOperations(context) {
  var container = document.getElementById('market-operations-pane');
  if (!container) return false;
  var workspace = _renderMarketOperationsWorkspace({
    state: context.state,
    systemId: context.systemId,
    isCurrentSystem: context.isCurrentSystem,
    commerceSnapshot: _getCommerceSnapshot(context),
    sortModes: _marketSession.getOperationsSortModes(),
  });
  container.innerHTML = workspace.overviewHtml +
    '<div class="market-workspace-board market-operations-board">' +
      _marketWorkspaceNavigation.renderSubworkspace('operations', workspace.sections, context.progression) +
    '</div>';
  _bindMarketFinanceCommands(container, context, { allowOperationsSort: true });
  return true;
}

// ---------------------------------------------------------------------------
// 星球详情（交易视图）
// ---------------------------------------------------------------------------

function _createMarketRenderContext(request) {
  var input = request || {};
  var state = input.state;
  if (!state || !_hasDocument()) return null;
  var onCommand = input.onCommand;
  var systemId = input.systemId || state.currentSystem;
  var isCurrentSystem = systemId === state.currentSystem;
  var galaxyId = input.galaxyId || state.currentGalaxy;
  var blackMarketUnlocked = Faction.canAccessBlackMarket(state, systemId);
  var systemFaction = Faction.getFactionForSystem(systemId);
  var requestedMarketMode = input.marketMode === 'black' ? 'black' : 'open';
  var effectiveMarketMode = requestedMarketMode === 'black' && blackMarketUnlocked ? 'black' : 'open';
  var isBlack = effectiveMarketMode === 'black';
  var progression = buildMarketProgression(state, systemId, {
    systemFaction: systemFaction,
    blackMarketUnlocked: blackMarketUnlocked,
  });

  _marketSession.setActiveContext({ systemId: systemId, mode: effectiveMarketMode });
  _marketSession.setProgression(progression);
  if (isBlack && _marketSession.getSubworkspace('spot') === 'trade') {
    _marketSession.setSubworkspace('spot', 'black');
  } else if (!isBlack && _marketSession.getSubworkspace('spot') === 'black') {
    _marketSession.setSubworkspace('spot', 'trade');
  }
  _marketWorkspaceNavigation.ensureWorkspaceState(progression);
  return {
    input: input,
    state: state,
    onCommand: onCommand,
    systemId: systemId,
    isCurrentSystem: isCurrentSystem,
    galaxyId: galaxyId,
    marketMode: effectiveMarketMode,
    isBlack: isBlack,
    blackMarketUnlocked: blackMarketUnlocked,
    systemFaction: systemFaction,
    progression: progression,
    spotDataResolved: false,
    goodsList: null,
    focusKey: '',
    snapshots: null,
    focusedGoodId: null,
    commerceSnapshotResolved: false,
    commerceSnapshot: null,
    renderRequest: Object.assign({}, input, {
      state: state,
      systemId: systemId,
      marketMode: effectiveMarketMode,
      galaxyId: galaxyId,
      onCommand: onCommand,
    }),
  };
}

function _resolveMarketSpotData(context) {
  if (context.spotDataResolved) return context;
  context.goodsList = context.isBlack
    ? Economy.getBlackMarketGoods()
    : GOODS.filter(function (good) {
        return good.marketAccess && good.marketAccess.indexOf('open') !== -1;
      });
  context.focusKey = context.systemId + ':' + context.marketMode;
  var chartRange = _marketSession.getChartRange(context.focusKey);
  _marketSession.setChartRange(context.focusKey, chartRange);
  context.snapshots = _buildMarketSnapshots(
    context.state,
    context.systemId,
    context.goodsList,
    context.isBlack,
    chartRange
  );
  context.focusedGoodId = _marketSession.getFocusedGood(context.focusKey) ||
    (context.snapshots[0] && context.snapshots[0].good.id);
  context.spotDataResolved = true;
  return context;
}

function _renderMarketChrome(context) {
  _marketWorkspaceNavigation.renderWorkspaceTabs(context.progression);
  _updateMarketDetailMode(
    context.state,
    context.systemId,
    context.isCurrentSystem,
    context.marketMode
  );
  return true;
}

function _renderMarketSpot(context) {
  _resolveMarketSpotData(context);
  var state = context.state;
  var sysId = context.systemId;
  var isCurrentSys = context.isCurrentSystem;
  var effectiveMarketMode = context.marketMode;
  var progression = context.progression;
  var goodsList = context.goodsList;
  var snapshots = context.snapshots;
  var focusedGoodId = context.focusedGoodId;
  var focusKey = context.focusKey;
  var spotContainer = document.getElementById('market-spot-pane');

  if (spotContainer) {
    spotContainer.innerHTML = _marketWorkspaceNavigation.renderSubworkspace('spot', {
      trade: _renderSpotTradeSection(),
      intel: _renderSpotIntelSection({
        state: state,
        systemId: sysId,
        snapshots: snapshots,
        marketMode: effectiveMarketMode,
        systemFaction: context.systemFaction,
        blackMarketUnlocked: context.blackMarketUnlocked,
        priceMode: _marketSession.getOverviewPriceMode(),
      }),
      black: _renderBlackMarketSection({
        state: state,
        systemId: sysId,
        marketMode: effectiveMarketMode,
        systemFaction: context.systemFaction,
        blackMarketUnlocked: context.blackMarketUnlocked,
      }),
    }, progression);
    _marketWorkspaceNavigation.bindSubworkspaceTabs(spotContainer, progression);
  }

  _marketOverviewController.render({
    state: state,
    galaxyId: context.galaxyId,
    onOpenSystem: function (systemId) {
      showDetail(systemId, effectiveMarketMode);
      render(Object.assign({}, context.renderRequest, {
        state: state,
        systemId: systemId,
        marketMode: effectiveMarketMode,
        galaxyId: context.galaxyId,
      }));
    },
  });

  const goodsListEl = document.getElementById('market-goods-list');
  const goodsToolbarEl = document.getElementById('market-goods-toolbar');
  const analysisPanelEl = document.getElementById('market-analysis-panel');
  const quickTradeDockEl = document.getElementById('market-quick-trade-dock');
  if (!goodsListEl) return !!spotContainer;
  if (goodsToolbarEl) {
    goodsToolbarEl.innerHTML = _renderSpotGoodsToolbar({
      state: state,
      systemId: sysId,
      snapshots: snapshots,
      marketMode: effectiveMarketMode,
      focusedGoodId: focusedGoodId,
    });
  }
  if (quickTradeDockEl) {
    quickTradeDockEl.innerHTML = _renderQuickTradeDock({
      state: state,
      systemId: sysId,
      snapshots: snapshots,
      marketMode: effectiveMarketMode,
      isCurrentSystem: isCurrentSys,
      focusedGoodId: focusedGoodId,
    });
    quickTradeDockEl.onclick = function (event) {
      var button = _resolveMarketDatasetNode(event && event.target, quickTradeDockEl, 'marketQuickAction');
      if (!button || button.disabled) return;
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
      var quickGood = goodsList.find(function (good) {
        return good.id === button.dataset.id;
      });
      if (!quickGood) return;
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.OPEN_TRADE, {
        action: button.dataset.marketQuickAction === 'sell' ? 'sell' : 'buy',
        marketMode: effectiveMarketMode,
        good: quickGood,
      });
    };
  }
  _renderMarketDashboard(state, sysId, effectiveMarketMode, snapshots);
  _updateMainKlineChart(state, sysId, snapshots, effectiveMarketMode);

  var activeGoodId = focusedGoodId;
  if (activeGoodId) {
    _marketSession.setFocusedGood(focusKey, activeGoodId);
    ContextInspector.replaceContext({
      type: 'commodity',
      id: activeGoodId,
      workspaceId: 'trade',
      source: 'market-workspace',
      revision: ContextInspector.getCurrentRevision(),
    });
  }

  var goodsWorkspace = _renderMarketGoodsWorkspace({
    state: state,
    systemId: sysId,
    marketMode: effectiveMarketMode,
    isCurrentSystem: isCurrentSys,
    snapshots: snapshots,
    focusedGoodId: activeGoodId,
    systemFaction: context.systemFaction,
    blackMarketUnlocked: context.blackMarketUnlocked,
    canFocusRemote: typeof context.onCommand === 'function',
  });
  goodsListEl.innerHTML = goodsWorkspace.html;

  function findRenderedGood(goodId) {
    return goodsList.find(function (good) { return good.id === goodId; }) || null;
  }

  function focusRenderedGood(goodId) {
    var good = findRenderedGood(goodId);
    if (!good) return;
    _marketSession.setFocusedGood(focusKey, good.id);
    ContextInspector.replaceContext({
      type: 'commodity',
      id: good.id,
      workspaceId: 'trade',
      source: 'market-good-card',
      revision: ContextInspector.getCurrentRevision(),
    });
    renderSpot(context.renderRequest);
  }

  goodsListEl.onclick = function (event) {
    var command = _resolveMarketGoodsCommand(event && event.target, goodsListEl);
    if (!command) return;
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

    if (command.type === 'focus-good') {
      focusRenderedGood(command.goodId);
      return;
    }
    if (command.type === 'focus-remote-system') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.FOCUS_REMOTE_SYSTEM, { systemId: command.systemId });
      return;
    }
    if (command.type === 'refuel') {
      _publishMarketCommand(context.onCommand, MARKET_COMMAND.REFUEL);
      return;
    }

    var good = findRenderedGood(command.goodId);
    if (!good) return;
    if (command.type !== 'sell-good' && command.type !== 'buy-good') return;
    _publishMarketCommand(context.onCommand, MARKET_COMMAND.OPEN_TRADE, {
      action: command.type === 'sell-good' ? 'sell' : 'buy',
      marketMode: effectiveMarketMode,
      good: good,
    });
  };

  goodsListEl.onkeydown = function (event) {
    if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
    var command = _resolveMarketGoodsCommand(event.target, goodsListEl);
    if (!command || command.type !== 'focus-good') return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    focusRenderedGood(command.goodId);
  };

  // 右侧分析面板
  if (analysisPanelEl) {
    _renderAnalysisPanel({
      container: analysisPanelEl,
      state: state,
      systemId: sysId,
      snapshots: snapshots,
      marketMode: effectiveMarketMode,
      focusedGoodId: activeGoodId,
    });
  }
  return true;
}

function _normalizeMarketRenderRegions(regions) {
  var source = Array.isArray(regions) ? regions : [regions];
  var aliases = {
    chrome: MARKET_RENDER_REGION.CHROME,
    spot: MARKET_RENDER_REGION.SPOT,
    capital: MARKET_RENDER_REGION.CAPITAL,
    operations: MARKET_RENDER_REGION.OPERATIONS,
  };
  return source.reduce(function (result, region) {
    var normalized = aliases[region] || region;
    if (MARKET_RENDER_REGION_NAMES.indexOf(normalized) !== -1 && result.indexOf(normalized) === -1) {
      result.push(normalized);
    }
    return result;
  }, []);
}

/**
 * 只重绘声明的市场内部区域。区域端口共享一次状态解析，但不会触碰未声明面板。
 * @param {{state:object, systemId?:string, marketMode?:string, galaxyId?:string, onCommand?:Function}} request
 * @param {string|string[]} regions
 */
export function renderRegions(request, regions) {
  var context = _createMarketRenderContext(request);
  if (!context) return false;
  var requested = new Set(_normalizeMarketRenderRegions(regions));
  if (requested.size === 0) return false;
  var rendered = false;
  var completedRegions = [];

  function renderRegion(region, renderer) {
    if (!requested.has(region)) return;
    var completed = renderer(context) !== false;
    if (!completed) return;
    _marketRenderCounts[region] += 1;
    completedRegions.push(region);
    rendered = true;
  }

  renderRegion(MARKET_RENDER_REGION.CHROME, _renderMarketChrome);
  renderRegion(MARKET_RENDER_REGION.SPOT, _renderMarketSpot);
  renderRegion(MARKET_RENDER_REGION.CAPITAL, _renderMarketCapital);
  renderRegion(MARKET_RENDER_REGION.OPERATIONS, _renderMarketOperations);
  _lastRenderedRegions = Object.freeze(completedRegions);
  if (rendered) _marketWorkspaceNavigation.applyWorkspaceTabState(context.progression);
  return rendered;
}

export function renderChrome(request) {
  return renderRegions(request, MARKET_RENDER_REGION.CHROME);
}

export function renderSpot(request) {
  return renderRegions(request, MARKET_RENDER_REGION.SPOT);
}

export function renderCapital(request) {
  return renderRegions(request, MARKET_RENDER_REGION.CAPITAL);
}

export function renderOperations(request) {
  return renderRegions(request, MARKET_RENDER_REGION.OPERATIONS);
}

/**
 * 渲染单个星球的完整商业终端。
 * UI 只发布 typed market command，不直接持有领域 action 回调。
 * @param {{state:object, systemId?:string, marketMode?:string, galaxyId?:string, onCommand?:Function}} request
 */
export function render(request) {
  return renderRegions(request, MARKET_RENDER_REGION_NAMES);
}

export function getDiagnostics() {
  return Object.freeze(Object.assign({}, _marketSession.getDiagnostics(), {
    renderCounts: Object.freeze(Object.assign({}, _marketRenderCounts)),
    lastRenderedRegions: _lastRenderedRegions,
    overview: _marketOverviewController.getDiagnostics(),
  }));
}

export function resetRuntimeState() {
  _marketSession.reset();
  _marketOverviewController.reset();
  _lastRenderedRegions = Object.freeze([]);
  return getDiagnostics();
}

// ---------------------------------------------------------------------------
// 视图切换辅助
// ---------------------------------------------------------------------------

/** 显示详情，隐藏总览 */
export function showDetail(systemId, marketMode) {
  const dt = document.getElementById('market-detail');
  const loc = document.getElementById('market-detail-location');
  const title = document.getElementById('market-header-title');
  const tabs = document.getElementById('market-workspace-tabs');
  if (dt) dt.classList.remove('hidden');
  if (tabs) tabs.classList.remove('hidden');
  const sys = findSystem(systemId);
  const isBlack = marketMode === 'black';
  if (sys && loc) {
    loc.innerHTML = '<span class="market-detail-loc-name">' + sys.name + '</span>' +
      '<span class="market-detail-loc-sep"> // </span>' +
      '<span class="market-detail-loc-type">' + sys.typeLabel + '</span>' +
      '<span class="market-detail-loc-sep"> // </span>' +
      '<span class="market-detail-loc-status">市场状态: ' + (isBlack ? '🕶 黑市模式' : '可交易') + '</span>';
  }
  if (title) title.textContent = '市场中心';
}

function _updateMarketDetailMode(state, systemId, isCurrentSys, marketMode) {
  const modeEl = document.getElementById('market-detail-mode');
  if (!modeEl) return;
  const target = findSystem(systemId);
  const current = findSystem(state && state.currentSystem);
  const targetName = target ? target.name : '目标地点';
  const currentName = current ? current.name : '当前停靠点';
  const isBlack = marketMode === 'black';
  modeEl.className = 'market-detail-mode ' + (isCurrentSys ? 'is-local' : 'is-remote') + (isBlack ? ' is-black' : '');
  if (isCurrentSys) {
    modeEl.textContent = isBlack ? '当前停靠 · 黑市可操作' : '当前停靠 · 可交易';
    modeEl.title = isBlack
      ? '你正停靠在「' + targetName + '」，可以执行黑市交易。'
      : '你正停靠在「' + targetName + '」，可以执行买卖、补给和本地经营。';
    return;
  }
  modeEl.textContent = '远程只读 · 需前往';
  modeEl.title = '你停靠在「' + currentName + '」，正在远程查看「' + targetName + '」行情；交易、补给和本地经营需要抵达该地点。';
}
