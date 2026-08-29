// js/ui/MarketUI.js — 商业终端（价格总览 + 节点工作台双模式）
// 依赖：市场 Session、Navigation 与各区域 Controller
// 导出：renderOverview, render (detail), showOverview, showDetail

import * as Faction from '../systems/faction/FactionSystem.js';
import * as ContextInspector from './ContextInspector.js';
import { normalizeMarketCommand } from '../core/MarketCommand.js';
import { getTradeStationCandidateIntel } from './MarketOperationsPresenter.js';
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
import { createMarketGoodsController } from './MarketGoodsController.js';
import { createMarketSelectionController } from './MarketSelectionController.js';
import { createMarketChartController } from './MarketChartController.js';
import { createMarketFinanceController } from './MarketFinanceController.js';
import { createMarketCommodityController } from './MarketCommodityController.js';
import { createMarketSpotController } from './MarketSpotController.js';
import { createMarketChromeController } from './MarketChromeController.js';

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
let _marketChromeController = null;
const _marketWorkspaceNavigation = createMarketWorkspaceNavigation({
  session: _marketSession,
  revealMarketGoodFocus: function (goodId, options) {
    return _marketChromeController
      ? _marketChromeController.revealGoodFocus(goodId, options)
      : false;
  },
  clearMarketGuideFocus: function () {
    return _marketChromeController
      ? _marketChromeController.clearGuideFocus()
      : false;
  },
});
_marketChromeController = createMarketChromeController({
  navigation: _marketWorkspaceNavigation,
});
const _marketOverviewController = createMarketOverviewController({
  session: _marketSession,
});
const _marketSelectionController = createMarketSelectionController({
  session: _marketSession,
  replaceContext: ContextInspector.replaceContext,
  getContext: ContextInspector.getContext,
  getCurrentContextRevision: ContextInspector.getCurrentRevision,
});
const _marketGoodsController = createMarketGoodsController({
  selection: _marketSelectionController,
  publishCommand: _publishMarketCommand,
});
const _marketChartController = createMarketChartController({
  session: _marketSession,
  selection: _marketSelectionController,
});
const _marketSpotController = createMarketSpotController({
  session: _marketSession,
  navigation: _marketWorkspaceNavigation,
  overview: _marketOverviewController,
  goods: _marketGoodsController,
  chart: _marketChartController,
});
const _marketFinanceController = createMarketFinanceController({
  session: _marketSession,
  navigation: _marketWorkspaceNavigation,
  publishCommand: _publishMarketCommand,
});
const _marketCommodityController = createMarketCommodityController({
  session: _marketSession,
});

function _hasDocument() {
  return typeof document !== 'undefined';
}

function _getMarketFocusKey(sysId, marketMode) {
  if (!sysId) return '';
  return sysId + ':' + (marketMode || 'open');
}

function _publishMarketCommand(onCommand, type, payload) {
  if (typeof onCommand !== 'function') return false;
  var command = normalizeMarketCommand(Object.assign({}, payload || {}, { type: type }));
  return command ? onCommand(command) : false;
}

export function revealMarketGoodFocus(goodId, options) {
  return _marketChromeController.revealGoodFocus(goodId, options);
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
  return _marketCommodityController.renderContextInspector(request);
}

export function renderWorkspaceDetail(request) {
  return _marketCommodityController.renderWorkspaceDetail(request);
}

export function setMarketWorkspaceFocus(focus) {
  return _marketWorkspaceNavigation.setFocus(focus);
}

export function getActiveMarketWorkspaceFocus() {
  return _marketWorkspaceNavigation.getActiveFocus();
}

function _renderMarketCapital(context) {
  return _marketFinanceController.renderCapital(context);
}

function _renderMarketOperations(context) {
  return _marketFinanceController.renderOperations(context);
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
  var renderRequest = Object.assign({}, input, {
    state: state,
    systemId: systemId,
    marketMode: effectiveMarketMode,
    galaxyId: galaxyId,
    onCommand: onCommand,
  });
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
    renderRequest: renderRequest,
    onOpenSystem: function (nextSystemId) {
      showDetail(nextSystemId, effectiveMarketMode);
      return render(Object.assign({}, renderRequest, {
        state: state,
        systemId: nextSystemId,
        marketMode: effectiveMarketMode,
        galaxyId: galaxyId,
      }));
    },
    rerenderSpot: function () {
      return renderSpot(renderRequest);
    },
    rerenderOperations: function () {
      return renderOperations(renderRequest);
    },
  };
}

function _renderMarketChrome(context) {
  return _marketChromeController.render(context);
}

function _renderMarketSpot(context) {
  return _marketSpotController.render(context);
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
    chrome: _marketChromeController.getDiagnostics(),
    overview: _marketOverviewController.getDiagnostics(),
    selection: _marketSelectionController.getDiagnostics(),
    chart: _marketChartController.getDiagnostics(),
    goods: _marketGoodsController.getDiagnostics(),
    spot: _marketSpotController.getDiagnostics(),
    finance: _marketFinanceController.getDiagnostics(),
    commodity: _marketCommodityController.getDiagnostics(),
  }));
}

export function resetRuntimeState() {
  _marketSession.reset();
  _marketChromeController.reset();
  _marketOverviewController.reset();
  _marketSelectionController.reset();
  _marketChartController.reset();
  _marketGoodsController.reset();
  _marketSpotController.reset();
  _marketFinanceController.reset();
  _marketCommodityController.reset();
  _lastRenderedRegions = Object.freeze([]);
  return getDiagnostics();
}

// ---------------------------------------------------------------------------
// 视图切换辅助
// ---------------------------------------------------------------------------

/** 显示详情，隐藏总览 */
export function showDetail(systemId, marketMode) {
  return _marketChromeController.showDetail(systemId, marketMode);
}
