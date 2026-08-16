// js/ui/MarketUI.js — 商业终端（价格总览 + 节点工作台双模式）
// 依赖：data/goods.js, data/systems.js, systems/economy/Economy.js
// 导出：renderOverview, render (detail), showOverview, showDetail

import { GOODS }    from '../data/goods.js';
import { TRADE_STATION_STRATEGIES } from '../data/tradeStations.js';
import { getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';
import { getCompanyAccessState, getCompanyLevelValue, getCompanyPrivilegeSummary } from '../data/companyAccess.js';
import * as Economy from '../systems/economy/Economy.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as Commerce from '../systems/commerce/CommerceFacade.js';
import * as Finance from '../systems/finance/FinanceSystem.js';
import * as TradeStation from '../systems/trade/TradeStationSystem.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import * as ContextInspector from './ContextInspector.js';
import {
  buildMarketSnapshots as _buildMarketSnapshots,
  formatMarketChartDelta as _formatChartDelta,
  normalizeMarketChartHistory as _normalizeChartHistory,
  renderMarketChart as _renderMarketChart,
  renderMarketChartDashboard,
  updateMainMarketKlineChart,
} from './MarketChartPresenter.js';
import {
  describeTradeOpportunity as _describeTradeOpportunity,
  formatMarketHeatDelta as _formatMarketHeatDelta,
  getMarketHeatMeta as _getMarketHeatMeta,
  renderAnalysisPanel as _renderAnalysisPanel,
  renderBlackMarketSection as _renderBlackMarketSection,
  renderQuickTradeDock as _renderQuickTradeDock,
  renderSpotGoodsToolbar as _renderSpotGoodsToolbar,
  renderSpotIntelSection as _renderSpotIntelSection,
  renderSpotTradeSection as _renderSpotTradeSection,
} from './MarketSpotPresenter.js';
import { renderMarketCapitalWorkspace as _renderMarketCapitalWorkspace } from './MarketCapitalPresenter.js';

const _focusedMarketGood = Object.create(null);
let _activeMarketContext = null;
const _marketChartRange = Object.create(null);
const _marketBatchPlanSortModes = {
  investment: 'yield',
  upgrade: 'income',
  strategy: 'income',
};
const MARKET_BATCH_PLAN_SORT_OPTIONS = {
  investment: [
    { id: 'yield', label: '回报优先' },
    { id: 'stake', label: '低基数优先' },
    { id: 'name', label: '地点名' },
  ],
  upgrade: [
    { id: 'income', label: '收益优先' },
    { id: 'cost', label: '低成本优先' },
    { id: 'name', label: '地点名' },
  ],
  strategy: [
    { id: 'income', label: '收益优先' },
    { id: 'name', label: '地点名' },
  ],
};
const MARKET_WORKSPACE_TABS = [
  { id: 'spot', label: '交易', hint: '买卖与补给', stage: '01' },
  { id: 'capital', label: '资金', hint: '贷款与投资', stage: '03' },
  { id: 'operations', label: '贸易站', hint: '建站与经营', stage: '04' },
];
const MARKET_SUBWORKSPACE_TABS = {
  spot: [
    { id: 'trade', label: '交易', hint: '执行买卖与补给' },
    { id: 'intel', label: '行情', hint: '价格与地点信息' },
    { id: 'black', label: '黑市', hint: '特殊市场与风险' },
  ],
  capital: [
    { id: 'local', label: '贷款与投资', hint: '管理本地资金' },
  ],
  operations: [
    { id: 'local', label: '本地', hint: '当前地点经营' },
    { id: 'network', label: '总览', hint: '全部贸易站' },
    { id: 'stations', label: '批量管理', hint: '候选与已建站点' },
  ],
};

let _activeMarketWorkspaceTab = 'spot';
let _activeMarketSubworkspaceTabs = {
  spot: 'trade',
  capital: 'local',
  operations: 'local',
};
let _lastMarketProgression = null;
let _marketOverviewPriceMode = 'buy';

function _hasDocument() {
  return typeof document !== 'undefined';
}

function _countObjectKeys(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value).length
    : 0;
}

function _hasTradeInvestment(state) {
  return !!(state && state.tradeInvestments && typeof state.tradeInvestments === 'object' && Object.keys(state.tradeInvestments).some(function (systemId) {
    var investment = state.tradeInvestments[systemId];
    return investment && (investment.amount || investment.investedAmount || 0) > 0;
  }));
}

function _hasCapitalFootprint(state) {
  var activeLoans = (state && Array.isArray(state.loans) ? state.loans : []).some(function (loan) {
    return loan && loan.status === 'active' && (loan.balance || 0) > 0;
  });
  return activeLoans || _hasTradeInvestment(state);
}

function _getMarketExperienceStats(state, sysId, options) {
  var safeState = state || {};
  var opts = options || {};
  var systemFaction = opts.systemFaction || Faction.getFactionForSystem(sysId);
  var blackMarketUnlocked = typeof opts.blackMarketUnlocked === 'boolean'
    ? opts.blackMarketUnlocked
    : Faction.canAccessBlackMarket(safeState, sysId);
  var visitedSystems = Array.isArray(safeState.visitedSystems) ? safeState.visitedSystems : [];
  var stationCount = _countObjectKeys(safeState.tradeStations);
  var playerLevel = Math.max(1, Number(safeState.playerLevel) || 1);
  var companyLevel = getCompanyLevelValue(safeState);
  var companyPrivileges = getCompanyPrivilegeSummary(safeState);
  var day = Math.max(1, Number(safeState.day) || 1);
  var credits = Math.max(0, Number(safeState.credits) || 0);
  var hasCapitalFootprint = _hasCapitalFootprint(safeState);
  var hasOperationsFootprint = stationCount > 0 || _hasTradeInvestment(safeState);

  return {
    playerLevel: playerLevel,
    companyLevel: companyLevel,
    day: day,
    credits: credits,
    visitedCount: Math.max(visitedSystems.length, safeState.currentSystem ? 1 : 0),
    stationCount: stationCount,
    companyPrivileges: companyPrivileges,
    hasCapitalFootprint: hasCapitalFootprint,
    hasOperationsFootprint: hasOperationsFootprint,
    hasBlackMarket: !!(systemFaction && systemFaction.marketAccess && systemFaction.marketAccess.blackMarket),
    blackMarketUnlocked: !!blackMarketUnlocked,
  };
}

function _buildCompanyUnlockPath(access, extraCondition) {
  if (!access || access.unlocked) return '';
  var text = '当前公司 Lv.' + access.currentLevel + ' / 需要 Lv.' + access.requiredLevel + '。';
  if (extraCondition) text += extraCondition + ' ';
  return text + '最近获得公司经验：完成手动交易、任务结算、自动跑商和贸易站投资。';
}

function _buildMarketProgression(state, sysId, options) {
  var stats = _getMarketExperienceStats(state, sysId, options);
  var capitalAccess = getCompanyAccessState(state, 'capitalLocal');
  var tradeStationBuildAccess = getCompanyAccessState(state, 'tradeStationBuild');
  var operationsNetworkAccess = getCompanyAccessState(state, 'operationsNetwork');
  var capitalLocalUnlocked = capitalAccess.unlocked || stats.hasCapitalFootprint;
  var operationsLocalUnlocked = capitalAccess.unlocked || stats.hasOperationsFootprint;
  var operationsNetworkUnlocked = stats.stationCount > 0 && operationsNetworkAccess.unlocked;
  var operationsStationsUnlocked = tradeStationBuildAccess.unlocked || stats.stationCount > 0;
  var capitalUnlocked = capitalLocalUnlocked;
  var operationsUnlocked = operationsLocalUnlocked || operationsNetworkUnlocked || operationsStationsUnlocked;
  var blackUnlockLabel = stats.hasBlackMarket ? '需辛迪加友好关系' : '需找到黑市辖区';
  var capitalLockDetail = _buildCompanyUnlockPath(capitalAccess);
  var tradeStationLockDetail = _buildCompanyUnlockPath(tradeStationBuildAccess);
  var operationsNetworkLockDetail = _buildCompanyUnlockPath(operationsNetworkAccess, '同时需要至少建成 1 座贸易站。');

  return {
    stats: stats,
    workspace: {
      spot: { unlocked: true, stateLabel: '已开放', unlockLabel: '从这里开始' },
      capital: {
        unlocked: capitalUnlocked,
        stateLabel: capitalUnlocked ? '已开放' : '待解锁',
        unlockLabel: capitalAccess.lockLabel,
        lockDetail: capitalLockDetail,
      },
      operations: {
        unlocked: operationsUnlocked,
        stateLabel: operationsUnlocked ? '已开放' : '待解锁',
        unlockLabel: capitalAccess.lockLabel,
        lockDetail: capitalLockDetail,
      },
    },
    subworkspace: {
      spot: {
        trade: { unlocked: true, stateLabel: '核心', unlockLabel: '默认开放' },
        intel: { unlocked: true, stateLabel: '已开放', unlockLabel: '默认开放' },
        black: {
          unlocked: stats.blackMarketUnlocked,
          stateLabel: stats.blackMarketUnlocked ? '已开放' : '锁定',
          unlockLabel: blackUnlockLabel,
        },
      },
      capital: {
        local: {
          unlocked: capitalLocalUnlocked,
          stateLabel: capitalLocalUnlocked ? '已开放' : '锁定',
          unlockLabel: capitalAccess.lockLabel,
          lockDetail: capitalLockDetail,
        },
      },
      operations: {
        local: {
          unlocked: operationsLocalUnlocked,
          stateLabel: operationsLocalUnlocked ? '已开放' : '锁定',
          unlockLabel: capitalAccess.lockLabel,
          lockDetail: capitalLockDetail,
        },
        network: {
          unlocked: operationsNetworkUnlocked,
          stateLabel: operationsNetworkUnlocked ? '已开放' : '锁定',
          unlockLabel: operationsNetworkAccess.lockLabel + ' + 建成 1 座贸易站',
          lockDetail: operationsNetworkLockDetail,
        },
        stations: {
          unlocked: operationsStationsUnlocked,
          stateLabel: operationsStationsUnlocked ? '已开放' : '锁定',
          unlockLabel: tradeStationBuildAccess.lockLabel,
          lockDetail: tradeStationLockDetail,
        },
      },
    },
    routeStages: [
      {
        id: 'trade',
        index: '01',
        label: '买卖货物',
        note: '买卖、补给、看当前货舱',
        workspaceId: 'spot',
        subworkspaceId: 'trade',
        unlocked: true,
      },
      {
        id: 'intel',
        index: '02',
        label: '查看行情',
        note: '各地价格、涨跌和开放条件',
        workspaceId: 'spot',
        subworkspaceId: 'intel',
        unlocked: true,
      },
      {
        id: 'capital',
        index: '03',
        label: '管理资金',
        note: '贷款、本地投资和保险',
        workspaceId: 'capital',
        subworkspaceId: 'local',
        unlocked: capitalLocalUnlocked,
        unlockLabel: capitalAccess.lockLabel,
        lockDetail: capitalLockDetail,
      },
      {
        id: 'network',
        index: '04',
        label: '经营贸易站',
        note: '建站、升级和批量管理',
        workspaceId: 'operations',
        subworkspaceId: 'local',
        unlocked: operationsUnlocked,
        unlockLabel: capitalAccess.lockLabel,
        lockDetail: capitalLockDetail,
      },
    ],
  };
}

export function getMarketExperienceRoute(state, sysId) {
  var progression = _buildMarketProgression(state || {}, sysId || (state && state.currentSystem));
  return {
    stats: progression.stats,
    stages: progression.routeStages.map(function (stage) {
      return Object.assign({}, stage);
    }),
    workspace: {
      spot: Object.assign({}, progression.workspace.spot),
      capital: Object.assign({}, progression.workspace.capital),
      operations: Object.assign({}, progression.workspace.operations),
    },
    subworkspace: {
      spot: Object.assign({}, progression.subworkspace.spot),
      capital: Object.assign({}, progression.subworkspace.capital),
      operations: Object.assign({}, progression.subworkspace.operations),
    },
  };
}

function _normalizeMarketWorkspaceFocus(focus, progression) {
  if (!focus || typeof focus !== 'object') return null;

  var workspaceId = typeof focus.workspaceId === 'string' ? focus.workspaceId : '';
  if (!MARKET_WORKSPACE_TABS.some(function (entry) { return entry.id === workspaceId; })) return null;
  if (!_isMarketWorkspaceUnlocked(workspaceId, progression)) {
    workspaceId = _getFirstUnlockedWorkspace(progression);
  }

  var subworkspaceTabs = _getMarketSubworkspaceTabs(workspaceId, progression);
  var subworkspaceId = typeof focus.subworkspaceId === 'string' ? focus.subworkspaceId : '';
  if (subworkspaceTabs.length > 0 && !subworkspaceTabs.some(function (entry) { return entry.id === subworkspaceId && entry.unlocked !== false; })) {
    var firstUnlocked = subworkspaceTabs.find(function (entry) { return entry.unlocked !== false; });
    subworkspaceId = (firstUnlocked || subworkspaceTabs[0]).id;
  }

  return {
    workspaceId: workspaceId,
    subworkspaceId: subworkspaceTabs.length > 0 ? subworkspaceId : '',
    goodId: typeof focus.goodId === 'string' ? focus.goodId.trim() : '',
    tradeAction: typeof focus.tradeAction === 'string' ? focus.tradeAction.trim() : '',
  };
}

function _getMarketFocusKey(sysId, marketMode) {
  if (!sysId) return '';
  return sysId + ':' + (marketMode || 'open');
}

function _handleRovingControlKeydown(event, currentButton, buttons, onActivate) {
  var key = event && event.key;
  if (key !== 'ArrowRight' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') {
    return false;
  }

  var enabledButtons = Array.prototype.slice.call(buttons || []).filter(function (button) {
    return button && !button.disabled && button.dataset.marketLocked !== 'true';
  });
  if (enabledButtons.length === 0) return false;

  var currentIndex = enabledButtons.indexOf(currentButton);
  if (currentIndex < 0) currentIndex = 0;
  var nextIndex = currentIndex;
  if (key === 'ArrowRight' || key === 'ArrowDown') nextIndex = (currentIndex + 1) % enabledButtons.length;
  else if (key === 'ArrowLeft' || key === 'ArrowUp') nextIndex = (currentIndex - 1 + enabledButtons.length) % enabledButtons.length;
  else if (key === 'Home') nextIndex = 0;
  else if (key === 'End') nextIndex = enabledButtons.length - 1;

  if (typeof event.preventDefault === 'function') event.preventDefault();
  var nextButton = enabledButtons[nextIndex];
  onActivate(nextButton);
  if (typeof nextButton.focus === 'function') nextButton.focus();
  return true;
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

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeHtmlAttr(value) {
  return _escapeHtml(value);
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

  _focusedMarketGood[focusKey] = normalizedGoodId;
  return true;
}

export function getFocusedMarketGood(sysId, marketMode) {
  var focusKey = String(sysId || '') + ':' + (marketMode === 'black' ? 'black' : 'open');
  return _focusedMarketGood[focusKey] || null;
}

export function renderContextInspector(request) {
  var context = request && request.context;
  var state = request && request.state;
  var container = request && request.container;
  if (!context || context.type !== 'commodity' || !state || !container) return false;
  var good = GOODS.find(function (entry) { return entry.id === context.id; });
  if (!good) return false;

  var systemId = _activeMarketContext && _activeMarketContext.systemId
    ? _activeMarketContext.systemId
    : state.currentSystem;
  var system = findSystem(systemId) || findSystem(state.currentSystem);
  if (!system) return false;
  var isBlack = !!(_activeMarketContext && _activeMarketContext.mode === 'black');
  var buyPrice = isBlack
    ? Economy.getBlackMarketBuyPrice(system.id, good.id, state)
    : Economy.getBuyPrice(system.id, good.id, state);
  var sellPrice = isBlack
    ? Economy.getBlackMarketSellPrice(system.id, good.id, state)
    : Economy.getSellPrice(system.id, good.id, state);
  var supplyDemand = Economy.getSupplyDemand(system.id, good.id);
  var held = Number((state.cargo || {})[good.id]) || 0;

  container.innerHTML =
    '<article class="workspace-context-card workspace-context-card--commodity">' +
      '<div class="workspace-context-hero"><span aria-hidden="true">' + _escapeHtml(good.emoji) + '</span><div><small>' + _escapeHtml(system.name) + ' · ' + (isBlack ? '黑市' : '公开市场') + '</small><h3>' + _escapeHtml(good.name) + '</h3></div></div>' +
      '<p>' + _escapeHtml(good.desc) + '</p>' +
      '<div class="workspace-context-metrics" role="list">' +
        '<span role="listitem"><small>买入</small><strong>' + buyPrice.toLocaleString() + '</strong></span>' +
        '<span role="listitem"><small>卖出</small><strong>' + sellPrice.toLocaleString() + '</strong></span>' +
        '<span role="listitem"><small>货舱</small><strong>' + held.toLocaleString() + '</strong></span>' +
        '<span role="listitem"><small>供需</small><strong>' + supplyDemand.ratio.toFixed(2) + '×</strong></span>' +
      '</div>' +
      '<div class="workspace-context-tags"><span>' + (good.legality === 'illegal' ? '违禁品' : good.legality === 'restricted' ? '受监管' : '合法商品') + '</span><span>价差 ' + Math.max(0, buyPrice - sellPrice).toLocaleString() + '</span></div>' +
    '</article>';
  return { title: '商品检查' };
}

function _isMarketWorkspaceUnlocked(workspaceId, progression) {
  if (!progression || !progression.workspace || !progression.workspace[workspaceId]) return true;
  return progression.workspace[workspaceId].unlocked !== false;
}

function _isMarketSubworkspaceUnlocked(workspaceId, subworkspaceId, progression) {
  if (!progression || !progression.subworkspace || !progression.subworkspace[workspaceId]) return true;
  var access = progression.subworkspace[workspaceId][subworkspaceId];
  return !access || access.unlocked !== false;
}

function _getFirstUnlockedWorkspace(progression) {
  var first = MARKET_WORKSPACE_TABS.find(function (entry) {
    return _isMarketWorkspaceUnlocked(entry.id, progression);
  });
  return first ? first.id : 'spot';
}

function _ensureMarketWorkspaceState(progression) {
  if (!MARKET_WORKSPACE_TABS.some(function (entry) { return entry.id === _activeMarketWorkspaceTab; })) {
    _activeMarketWorkspaceTab = 'spot';
  }
  if (!_isMarketWorkspaceUnlocked(_activeMarketWorkspaceTab, progression)) {
    _activeMarketWorkspaceTab = _getFirstUnlockedWorkspace(progression);
  }
  _ensureMarketSubworkspaceState(_activeMarketWorkspaceTab, progression);
  return _activeMarketWorkspaceTab;
}

function _applyMarketSubworkspaceTabState(container, workspaceId, progression) {
  if (!container || !workspaceId) return;

  var activeTab = _ensureMarketSubworkspaceState(workspaceId, progression);
  container.querySelectorAll('[data-market-subworkspace-tab="' + workspaceId + '"]').forEach(function (entry) {
    var isActive = entry.dataset.marketSubworkspaceId === activeTab;
    entry.classList.toggle('active', isActive);
    entry.setAttribute('aria-selected', isActive ? 'true' : 'false');
    entry.setAttribute('tabindex', isActive ? '0' : '-1');
  });
  container.querySelectorAll('[data-market-subworkspace-pane="' + workspaceId + '"]').forEach(function (pane) {
    var isActive = pane.dataset.marketSubworkspaceId === activeTab;
    pane.classList.toggle('hidden', !isActive);
    pane.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    pane.setAttribute('tabindex', isActive ? '0' : '-1');
  });
}

export function setMarketWorkspaceFocus(focus) {
  var normalized = _normalizeMarketWorkspaceFocus(focus, _lastMarketProgression);
  if (!normalized) return false;

  _activeMarketWorkspaceTab = normalized.workspaceId;
  if (normalized.subworkspaceId) {
    _activeMarketSubworkspaceTabs[normalized.workspaceId] = normalized.subworkspaceId;
  }

  if (_hasDocument()) {
    _applyMarketWorkspaceTabState(_lastMarketProgression);
    _applyMarketSubworkspaceTabState(
      document.getElementById('market-' + normalized.workspaceId + '-pane'),
      normalized.workspaceId,
      _lastMarketProgression
    );
    if (normalized.goodId) {
      _revealMarketGoodFocus(normalized.goodId, { tradeAction: normalized.tradeAction });
    } else {
      _clearMarketGuideFocus();
    }
  }

  return true;
}

export function getActiveMarketWorkspaceFocus() {
  var workspaceId = _activeMarketWorkspaceTab || 'spot';
  var subworkspaceId = _activeMarketSubworkspaceTabs[workspaceId] || '';
  return {
    workspaceId: workspaceId,
    subworkspaceId: subworkspaceId,
    marketMode: subworkspaceId === 'black' ? 'black' : 'open',
  };
}

function _applyMarketWorkspaceTabState(progression) {
  if (!_hasDocument()) return;

  if (progression) _ensureMarketWorkspaceState(progression);
  var tabs = document.getElementById('market-workspace-tabs');
  var paneMap = {
    spot: document.getElementById('market-spot-pane'),
    capital: document.getElementById('market-capital-pane'),
    operations: document.getElementById('market-operations-pane'),
  };

  if (tabs) {
    tabs.querySelectorAll('[data-market-workspace-tab]').forEach(function (button) {
      var isActive = button.dataset.marketWorkspaceTab === _activeMarketWorkspaceTab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  Object.keys(paneMap).forEach(function (key) {
    if (!paneMap[key]) return;
    var isActive = key === _activeMarketWorkspaceTab;
    paneMap[key].classList.toggle('hidden', !isActive);
    paneMap[key].setAttribute('aria-labelledby', 'market-workspace-tab-' + key);
    paneMap[key].setAttribute('aria-hidden', isActive ? 'false' : 'true');
    paneMap[key].setAttribute('tabindex', isActive ? '0' : '-1');
  });
}

function _getMarketWorkspaceTabs(progression) {
  return MARKET_WORKSPACE_TABS.map(function (entry) {
    var access = progression && progression.workspace ? progression.workspace[entry.id] : null;
    return Object.assign({}, entry, {
      unlocked: !access || access.unlocked !== false,
      stateLabel: access && access.stateLabel ? access.stateLabel : '已开放',
      unlockLabel: access && access.unlockLabel ? access.unlockLabel : '',
      lockDetail: access && access.lockDetail ? access.lockDetail : '',
    });
  });
}

function _renderMarketWorkspaceTabs(progression) {
  var tabs = document.getElementById('market-workspace-tabs');
  if (!tabs) return;

  _ensureMarketWorkspaceState(progression);
  tabs.innerHTML = _getMarketWorkspaceTabs(progression).map(function (entry) {
    var locked = entry.unlocked === false;
    var active = entry.id === _activeMarketWorkspaceTab;
    var tabId = 'market-workspace-tab-' + entry.id;
    var paneId = 'market-' + entry.id + '-pane';
    return '<button id="' + tabId + '" class="market-workspace-tab' + (active ? ' active' : '') + (locked ? ' is-locked' : '') + '" type="button" role="tab" aria-controls="' + paneId + '" aria-selected="' + (active ? 'true' : 'false') + '" tabindex="' + (active ? '0' : '-1') + '" data-market-workspace-tab="' + entry.id + '" data-market-locked="' + (locked ? 'true' : 'false') + '"' + (locked ? ' disabled aria-disabled="true"' : '') + '>' +
      '<span class="market-workspace-tab-stage">' + entry.stage + '</span>' +
      '<span class="market-workspace-tab-copy">' +
        '<span class="market-workspace-tab-label">' + entry.label + '</span>' +
        '<span class="market-workspace-tab-hint">' + entry.hint + '</span>' +
      '</span>' +
      '<span class="market-workspace-tab-state">' + (locked ? entry.unlockLabel : entry.stateLabel) + '</span>' +
    '</button>';
  }).join('');

  var workspaceButtons = tabs.querySelectorAll('[data-market-workspace-tab]');
  function activateWorkspace(button) {
    if (button.disabled || button.dataset.marketLocked === 'true') return;
    _activeMarketWorkspaceTab = button.dataset.marketWorkspaceTab || 'spot';
    _ensureMarketSubworkspaceState(_activeMarketWorkspaceTab, progression);
    _applyMarketWorkspaceTabState(progression);
  }

  workspaceButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      activateWorkspace(button);
    });
    button.addEventListener('keydown', function (event) {
      _handleRovingControlKeydown(event, button, workspaceButtons, activateWorkspace);
    });
  });

  _applyMarketWorkspaceTabState(progression);
}

function _getMarketSubworkspaceTabs(workspaceId, progression) {
  var tabs = MARKET_SUBWORKSPACE_TABS[workspaceId] || [];
  return tabs.map(function (entry) {
    var workspaceAccess = progression && progression.subworkspace ? progression.subworkspace[workspaceId] : null;
    var access = workspaceAccess ? workspaceAccess[entry.id] : null;
    return Object.assign({}, entry, {
      unlocked: !access || access.unlocked !== false,
      stateLabel: access && access.stateLabel ? access.stateLabel : '已开放',
      unlockLabel: access && access.unlockLabel ? access.unlockLabel : '',
      lockDetail: access && access.lockDetail ? access.lockDetail : '',
    });
  });
}

function _ensureMarketSubworkspaceState(workspaceId, progression) {
  var tabs = _getMarketSubworkspaceTabs(workspaceId, progression);
  if (tabs.length === 0) return '';
  var activeTab = _activeMarketSubworkspaceTabs[workspaceId];
  if (!tabs.some(function (entry) { return entry.id === activeTab && entry.unlocked !== false; })) {
    var firstUnlocked = tabs.find(function (entry) { return entry.unlocked !== false; });
    activeTab = (firstUnlocked || tabs[0]).id;
    _activeMarketSubworkspaceTabs[workspaceId] = activeTab;
  }
  return activeTab;
}

function _renderMarketLockedPane(entry) {
  return '<section class="market-locked-pane">' +
    '<div class="market-locked-pane-mark">LOCK</div>' +
    '<div class="market-locked-pane-copy">' +
      '<div class="market-locked-pane-title">' + _escapeHtml(entry.label) + ' 暂未开放</div>' +
      '<div class="market-locked-pane-text">为了让市场体验按顺序展开，这个功能会在完成前置进度后加入终端。</div>' +
      '<div class="market-locked-pane-condition">' + _escapeHtml(entry.unlockLabel || '继续推进贸易路线') + '</div>' +
      (entry.lockDetail ? '<div class="market-locked-pane-path">' + _escapeHtml(entry.lockDetail) + '</div>' : '') +
    '</div>' +
  '</section>';
}

function _renderMarketSubworkspace(workspaceId, sections, progression) {
  var tabs = _getMarketSubworkspaceTabs(workspaceId, progression);
  if (tabs.length === 0) return '';

  var activeTab = _ensureMarketSubworkspaceState(workspaceId, progression);

  return '<div class="market-subworkspace" data-market-subworkspace="' + workspaceId + '">' +
    '<div class="market-subworkspace-tabs" role="tablist" aria-label="' + workspaceId + ' 二级菜单">' +
      tabs.map(function (entry) {
        var locked = entry.unlocked === false;
        var active = entry.id === activeTab;
        var tabId = 'market-subworkspace-tab-' + workspaceId + '-' + entry.id;
        var paneId = 'market-subworkspace-pane-' + workspaceId + '-' + entry.id;
        return '<button id="' + tabId + '" class="market-subworkspace-tab' + (active ? ' active' : '') + (locked ? ' is-locked' : '') + '" type="button" role="tab" aria-controls="' + paneId + '" aria-selected="' + (active ? 'true' : 'false') + '" tabindex="' + (active ? '0' : '-1') + '" data-market-subworkspace-tab="' + workspaceId + '" data-market-subworkspace-id="' + entry.id + '" data-market-locked="' + (locked ? 'true' : 'false') + '"' + (locked ? ' disabled aria-disabled="true"' : '') + '>' +
          '<span class="market-subworkspace-tab-label">' + entry.label + '</span>' +
          '<span class="market-subworkspace-tab-hint">' + entry.hint + '</span>' +
          '<span class="market-subworkspace-tab-state">' + (locked ? entry.unlockLabel : entry.stateLabel) + '</span>' +
        '</button>';
      }).join('') +
    '</div>' +
    '<div class="market-subworkspace-panes">' +
      tabs.map(function (entry) {
        var active = entry.id === activeTab;
        return '<div id="market-subworkspace-pane-' + workspaceId + '-' + entry.id + '" class="market-subworkspace-pane' + (active ? '' : ' hidden') + '" role="tabpanel" aria-labelledby="market-subworkspace-tab-' + workspaceId + '-' + entry.id + '" aria-hidden="' + (active ? 'false' : 'true') + '" tabindex="' + (active ? '0' : '-1') + '" data-market-subworkspace-pane="' + workspaceId + '" data-market-subworkspace-id="' + entry.id + '">' +
          (entry.unlocked === false ? _renderMarketLockedPane(entry) : (sections[entry.id] || '<div class="market-finance-empty">该分区暂无可用内容。</div>')) +
        '</div>';
      }).join('') +
    '</div>' +
  '</div>';
}

function _bindMarketSubworkspaceTabs(container, progression) {
  if (!container) return;

  var subworkspaceButtons = container.querySelectorAll('[data-market-subworkspace-tab]');
  function activateSubworkspace(button) {
    if (button.disabled || button.dataset.marketLocked === 'true') return;
    var workspaceId = button.dataset.marketSubworkspaceTab;
    var tabId = button.dataset.marketSubworkspaceId;
    if (!workspaceId || !tabId) return;
    _activeMarketSubworkspaceTabs[workspaceId] = tabId;
    _applyMarketSubworkspaceTabState(container, workspaceId, progression);
  }

  subworkspaceButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      activateSubworkspace(button);
    });
    button.addEventListener('keydown', function (event) {
      var workspaceId = button.dataset.marketSubworkspaceTab;
      var workspaceButtons = Array.prototype.slice.call(subworkspaceButtons).filter(function (entry) {
        return entry.dataset.marketSubworkspaceTab === workspaceId;
      });
      _handleRovingControlKeydown(event, button, workspaceButtons, activateSubworkspace);
    });
  });
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
  var range = _marketChartRange[focusKey] || 14;
  return updateMainMarketKlineChart({
    state: state,
    systemId: sysId,
    snapshots: snapshots,
    marketMode: marketMode,
    focusedGoodId: _focusedMarketGood[focusKey],
    range: range,
    onRangeChange: function (nextRange) {
      _marketChartRange[focusKey] = nextRange;
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
  var hasFocusedSnapshot = snapshots && snapshots.some(function (entry) {
    return entry.good.id === _focusedMarketGood[focusKey];
  });
  if (!hasFocusedSnapshot && snapshots && snapshots[0]) {
    _focusedMarketGood[focusKey] = snapshots[0].good.id;
  }
  return renderMarketChartDashboard({
    state: state,
    systemId: sysId,
    snapshots: snapshots,
    marketMode: marketMode,
    focusedGoodId: _focusedMarketGood[focusKey],
    range: _marketChartRange[focusKey] || 14,
    onFocusChange: function (goodId) {
      _focusedMarketGood[focusKey] = goodId;
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
      _marketChartRange[focusKey] = nextRange;
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

function _getBatchAffordablePlan(targets, budget, getCost) {
  var remaining = budget || 0;
  var affordableCount = 0;
  var affordableCost = 0;
  var totalCost = 0;
  var plannedTargets = [];
  var affordableTargets = [];
  var deferredTargets = [];

  targets.forEach(function (target) {
    var cost = Math.max(0, getCost(target) || 0);
    var targetWithCost = Object.assign({}, target, { planCost: cost });
    plannedTargets.push(targetWithCost);
    totalCost += cost;
    if (cost <= 0) {
      affordableTargets.push(targetWithCost);
      return;
    }
    if (remaining >= cost) {
      remaining -= cost;
      affordableCount += 1;
      affordableCost += cost;
      affordableTargets.push(targetWithCost);
      return;
    }
    deferredTargets.push(targetWithCost);
  });

  return {
    targetCount: targets.length,
    affordableCount: affordableCount,
    affordableCost: affordableCost,
    totalCost: totalCost,
    targets: plannedTargets,
    affordableTargets: affordableTargets,
    deferredTargets: deferredTargets,
  };
}

function _getStrategyBatchPlan(ownedStations, strategy) {
  var targets = ownedStations.filter(function (entry) {
    return entry.station.strategyId !== strategy.id;
  });
  return {
    targetCount: targets.length,
    affordableCount: targets.length,
    affordableCost: 0,
    totalCost: 0,
    targets: targets.slice(),
    affordableTargets: targets.slice(),
    deferredTargets: [],
  };
}

function _getInvestmentBatchPlan(state, ownedStations) {
  var targets = Finance.getTradeInvestmentOptions(state, ownedStations.map(function (entry) {
    return entry.station.systemId;
  }));
  var plan = _getBatchAffordablePlan(targets, state.credits || 0, function (entry) {
    return entry.suggestedAmount || 0;
  });

  plan.suggestedAmount = targets[0] ? Math.max(1000, targets[0].suggestedAmount || 0) : 0;
  plan.amountPerTarget = plan.suggestedAmount;
  return plan;
}

function _serializeBatchSystemIds(systemIds) {
  return (systemIds || []).filter(Boolean).join(',');
}

function _parseBatchSystemIds(value) {
  if (!value) return [];
  return value.split(',').map(function (entry) {
    return entry.trim();
  }).filter(Boolean);
}

function _getBatchPlanSortOptions(scope) {
  return MARKET_BATCH_PLAN_SORT_OPTIONS[scope] || [];
}

function _ensureBatchPlanSortMode(scope) {
  var options = _getBatchPlanSortOptions(scope);
  var current = _marketBatchPlanSortModes[scope];
  if (options.length === 0) return '';
  if (!options.some(function (entry) { return entry.id === current; })) {
    current = options[0].id;
    _marketBatchPlanSortModes[scope] = current;
  }
  return current;
}

function _setBatchPlanSortMode(scope, mode) {
  if (!_getBatchPlanSortOptions(scope).some(function (entry) { return entry.id === mode; })) return;
  _marketBatchPlanSortModes[scope] = mode;
}

function _getBatchPlanTargetName(target) {
  if (!target || typeof target !== 'object') return '';
  if (target.name) return target.name;
  if (target.system && target.system.name) return target.system.name;
  return '';
}

function _compareBatchPlanTargetName(a, b) {
  return _getBatchPlanTargetName(a).localeCompare(_getBatchPlanTargetName(b));
}

function _sortBatchPlanTargets(scope, targets, mode) {
  var activeMode = mode || _ensureBatchPlanSortMode(scope);
  return (targets || []).slice().sort(function (a, b) {
    var diff = 0;

    if (scope === 'investment') {
      if (activeMode === 'yield') {
        diff = (b.expectedYieldRate || 0) - (a.expectedYieldRate || 0);
        if (diff !== 0) return diff;
        diff = (a.investedAmount || 0) - (b.investedAmount || 0);
      } else if (activeMode === 'stake') {
        diff = (a.investedAmount || 0) - (b.investedAmount || 0);
        if (diff !== 0) return diff;
        diff = (b.expectedYieldRate || 0) - (a.expectedYieldRate || 0);
      }
    } else if (scope === 'upgrade') {
      if (activeMode === 'income') {
        diff = (b.projectedIncome || 0) - (a.projectedIncome || 0);
        if (diff !== 0) return diff;
        diff = (a.planCost || 0) - (b.planCost || 0);
      } else if (activeMode === 'cost') {
        diff = (a.planCost || 0) - (b.planCost || 0);
        if (diff !== 0) return diff;
        diff = (b.projectedIncome || 0) - (a.projectedIncome || 0);
      }
    } else if (scope === 'strategy') {
      if (activeMode === 'income') {
        diff = (b.projectedIncome || 0) - (a.projectedIncome || 0);
      }
    }

    if (diff !== 0) return diff;
    return _compareBatchPlanTargetName(a, b);
  });
}

function _getSortedBatchPlan(scope, plan, budget) {
  var sortedTargets = _sortBatchPlanTargets(scope, plan.targets || []);

  if (scope === 'strategy') {
    return Object.assign({}, plan, {
      targets: sortedTargets,
      affordableTargets: sortedTargets.slice(),
      deferredTargets: [],
      affordableCount: sortedTargets.length,
      targetCount: sortedTargets.length,
    });
  }

  var sortedPlan = _getBatchAffordablePlan(sortedTargets, budget || 0, function (target) {
    return target.planCost || 0;
  });

  if (typeof plan.suggestedAmount !== 'undefined') sortedPlan.suggestedAmount = plan.suggestedAmount;
  if (typeof plan.amountPerTarget !== 'undefined') sortedPlan.amountPerTarget = plan.amountPerTarget;
  return sortedPlan;
}

function _renderBatchPlanSortToolbar(scope, label) {
  var options = _getBatchPlanSortOptions(scope);
  if (options.length <= 1) return '';

  var activeMode = _ensureBatchPlanSortMode(scope);
  return '<div class="market-batch-plan-sort-row">' +
    '<span class="market-batch-plan-sort-label">' + (label || '排序视角') + '</span>' +
    '<div class="market-batch-plan-sort-options">' + options.map(function (option) {
      return '<button class="market-batch-plan-sort-btn' + (option.id === activeMode ? ' active' : '') + '" data-action="market-batch-set-sort" data-batch-sort-scope="' + scope + '" data-batch-sort-mode="' + option.id + '">' + option.label + '</button>';
    }).join('') + '</div>' +
  '</div>';
}

function _renderWorkspaceDeckMetric(label, value, note, toneClass) {
  return '<article class="market-workspace-deck-card' + (toneClass ? ' ' + toneClass : '') + '">' +
    '<span class="market-workspace-deck-card-label">' + label + '</span>' +
    '<strong class="market-workspace-deck-card-value">' + value + '</strong>' +
    '<span class="market-workspace-deck-card-note">' + note + '</span>' +
  '</article>';
}

function _renderWorkspaceDeckPill(label, value, toneClass) {
  return '<span class="market-workspace-deck-pill' + (toneClass ? ' ' + toneClass : '') + '">' +
    label + '<strong>' + value + '</strong>' +
  '</span>';
}

function _renderBatchPlanMetric(label, value, note) {
  return '<div class="market-batch-plan-metric">' +
    '<span class="market-batch-plan-metric-label">' + label + '</span>' +
    '<strong class="market-batch-plan-metric-value">' + value + '</strong>' +
    '<span class="market-batch-plan-metric-note">' + note + '</span>' +
  '</div>';
}

function _renderBatchPlanTargets(targets, renderTargetMeta) {
  if (!targets || targets.length === 0) {
    return '<div class="market-batch-plan-empty">本轮暂无可覆盖站点。</div>';
  }

  var previewTargets = targets.slice(0, 5);
  var hiddenCount = Math.max(0, targets.length - previewTargets.length);

  return '<div class="market-batch-plan-target-list">' +
    previewTargets.map(function (target) {
      var meta = renderTargetMeta(target);
      return '<div class="market-batch-plan-target">' +
        '<div class="market-batch-plan-target-name">' + meta.title + '</div>' +
        '<div class="market-batch-plan-target-note">' + meta.note + '</div>' +
      '</div>';
    }).join('') +
    (hiddenCount > 0
      ? '<div class="market-batch-plan-target market-batch-plan-target-more">+' + hiddenCount + ' 站仍在本轮计划中</div>'
      : '') +
  '</div>';
}

function _renderBatchPlanDeferredNote(targets, renderTargetMeta, prefix) {
  if (!targets || targets.length === 0) return '';

  var previewTargets = targets.slice(0, 3);
  var hiddenCount = Math.max(0, targets.length - previewTargets.length);
  return '<div class="market-batch-plan-deferred-block">' +
    '<div class="market-batch-plan-deferred-head">' +
      '<span class="market-batch-plan-section-label">' + (prefix || '预算后置') + '</span>' +
      '<span class="market-batch-plan-deferred-count">' + targets.length + ' 站</span>' +
    '</div>' +
    '<div class="market-batch-plan-deferred-copy">本轮预算或排序优先级会把这些站点留到下一波执行。</div>' +
    '<div class="market-batch-plan-deferred-list">' + previewTargets.map(function (target) {
      var meta = renderTargetMeta(target);
      return '<div class="market-batch-plan-deferred-item">' +
        '<div class="market-batch-plan-deferred-item-name">' + meta.title + '</div>' +
        '<div class="market-batch-plan-deferred-item-note">' + meta.note + '</div>' +
      '</div>';
    }).join('') +
    (hiddenCount > 0
      ? '<div class="market-batch-plan-deferred-item market-batch-plan-deferred-item-more">+' + hiddenCount + ' 站仍在等待下一波预算</div>'
      : '') +
    '</div>' +
  '</div>';
}

function _renderBatchPlanCard(options) {
  var actionableSystemIds = options.actionableSystemIds || [];
  var disabled = actionableSystemIds.length === 0;
  var buttonAttrs = options.buttonAttrs || '';

  return '<article class="market-batch-plan-card' + (options.toneClass ? ' ' + options.toneClass : '') + '">' +
    '<div class="market-batch-plan-card-head">' +
      '<div>' +
        '<div class="market-batch-plan-card-title">' + options.title + '</div>' +
        '<div class="market-batch-plan-card-subtitle">' + options.subtitle + '</div>' +
      '</div>' +
      '<span class="market-batch-plan-card-badge">' + options.badge + '</span>' +
    '</div>' +
    '<div class="market-batch-plan-card-desc">' + options.description + '</div>' +
    (options.sortMarkup || '') +
    '<div class="market-batch-plan-metrics">' + options.metrics.join('') + '</div>' +
    '<div class="market-batch-plan-section-label">覆盖清单</div>' +
    _renderBatchPlanTargets(options.coverageTargets, options.renderTargetMeta) +
    (options.deferredMarkup || '') +
    '<div class="market-batch-plan-card-footer">' +
      '<div class="market-batch-plan-footer-note">' + options.footerNote + '</div>' +
      '<button class="btn-action trade-station-build-btn' + (disabled ? ' disabled' : '') + '" data-action="' + options.action + '" data-system-ids="' + _serializeBatchSystemIds(actionableSystemIds) + '"' + buttonAttrs + (disabled ? ' disabled' : '') + '>' + options.actionLabel + '</button>' +
    '</div>' +
  '</article>';
}

function _renderOperationsBatchPlanningPanel(state, ownedStations, networkInvestmentPlan, networkUpgradePlan) {
  var investmentPlan = _getSortedBatchPlan('investment', networkInvestmentPlan, state.credits || 0);
  var upgradePlan = _getSortedBatchPlan('upgrade', networkUpgradePlan, state.credits || 0);
  var renderInvestmentTargetMeta = function (target) {
    return {
      title: target.name,
      note: '每天预计回报 ' + ((target.expectedYieldRate || 0) * 100).toFixed(2) + '% · 已投 ' + Math.floor(target.investedAmount || 0).toLocaleString() + ' · 本轮 +' + Math.floor(target.planCost || 0).toLocaleString(),
    };
  };
  var renderUpgradeTargetMeta = function (target) {
    return {
      title: target.system.name + ' · Lv.' + target.station.level,
      note: '升级 +' + Math.floor(target.planCost || 0).toLocaleString() + ' · 日收益 +' + Math.floor(target.projectedIncome || 0).toLocaleString() + ' · 下一档 ' + (target.nextLevel ? target.nextLevel.name : '已满级'),
    };
  };
  var strategyPlans = TRADE_STATION_STRATEGIES.map(function (strategy) {
    var basePlan = _getStrategyBatchPlan(ownedStations, strategy);
    return {
      strategy: strategy,
      plan: _getSortedBatchPlan('strategy', basePlan),
    };
  });
  var readyWaveCount = [
    investmentPlan.affordableTargets.length > 0,
    upgradePlan.affordableTargets.length > 0,
  ].filter(Boolean).length + strategyPlans.filter(function (entry) {
    return entry.plan.affordableTargets.length > 0;
  }).length;

  return '<section class="market-finance-section market-batch-plan-panel">' +
    '<div class="market-finance-section-head market-batch-plan-head">' +
      '<div>' +
        '<div class="market-finance-title">🧭 批量计划面板</div>' +
        '<div class="market-finance-subtitle">先审阅覆盖站点、单站成本和预算缺口，再决定是否执行批量操作。所有按钮都会按当前计划中的系统清单下发，而不是对全网盲发广播。</div>' +
      '</div>' +
      '<span class="market-finance-chip">待命批量操作 ' + readyWaveCount + '</span>' +
    '</div>' +
    '<div class="market-batch-plan-summary-strip">' +
      '<span class="market-batch-plan-summary-pill">可用信用积分<strong>' + Math.floor(state.credits || 0).toLocaleString() + '</strong></span>' +
      '<span class="market-batch-plan-summary-pill">可控站点<strong>' + ownedStations.length + '</strong></span>' +
      '<span class="market-batch-plan-summary-pill">可投资<strong>' + investmentPlan.affordableTargets.length + '</strong></span>' +
      '<span class="market-batch-plan-summary-pill">升级待命<strong>' + upgradePlan.affordableTargets.length + '</strong></span>' +
    '</div>' +
    '<div class="market-batch-plan-grid market-batch-plan-grid-major">' +
      _renderBatchPlanCard({
        title: '批量追加投资',
        subtitle: '优先投向回报较高的站点',
        badge: investmentPlan.affordableTargets.length > 0 ? '可执行' : '待预算',
        description: '按每天预计回报从高到低排序，预算会先投向更划算的站点。',
        sortMarkup: _renderBatchPlanSortToolbar('investment', '排序视角'),
        metrics: [
          _renderBatchPlanMetric('覆盖', investmentPlan.affordableCount + '/' + investmentPlan.targetCount, '候选 ' + investmentPlan.targetCount + ' 站，本轮可覆盖 ' + investmentPlan.affordableCount + ' 站。'),
          _renderBatchPlanMetric('单站标准', Math.floor(investmentPlan.amountPerTarget || 0).toLocaleString(), '当前每站按统一金额增配，执行清单与实际扣款保持一致。'),
          _renderBatchPlanMetric('预算', Math.floor(investmentPlan.affordableCost || 0).toLocaleString(), '全量需求 ' + Math.floor(investmentPlan.totalCost || 0).toLocaleString() + '，超出部分自动后置。'),
        ],
        coverageTargets: investmentPlan.affordableTargets,
        renderTargetMeta: renderInvestmentTargetMeta,
        deferredMarkup: _renderBatchPlanDeferredNote(investmentPlan.deferredTargets, renderInvestmentTargetMeta, '预算后置'),
        footerNote: investmentPlan.affordableTargets.length > 0
          ? '将按预计顺序依次向这些贸易站追加资金。'
          : '当前预算不足以向任何贸易站追加投资。',
        actionLabel: investmentPlan.affordableTargets.length > 0
          ? ('执行 ' + investmentPlan.affordableTargets.length + ' 站增配')
          : '暂无可执行增配',
        action: 'market-batch-invest-trade-stations',
        actionableSystemIds: investmentPlan.affordableTargets.map(function (target) { return target.systemId; }),
        buttonAttrs: ' data-batch-amount="' + Math.floor(investmentPlan.amountPerTarget || 0) + '"',
        toneClass: 'tone-cool',
      }) +
      _renderBatchPlanCard({
        title: '商网升级批量操作',
        subtitle: '收益优先',
        badge: upgradePlan.affordableTargets.length > 0 ? '可执行' : '待预算',
        description: '按预计日收益从高到低排序，先给最能放大现金流的站点做等级升级。',
        sortMarkup: _renderBatchPlanSortToolbar('upgrade', '排序视角'),
        metrics: [
          _renderBatchPlanMetric('覆盖', upgradePlan.affordableCount + '/' + upgradePlan.targetCount, '待升级 ' + upgradePlan.targetCount + ' 站，本轮可升级 ' + upgradePlan.affordableCount + ' 站。'),
          _renderBatchPlanMetric('已预留', Math.floor(upgradePlan.affordableCost || 0).toLocaleString(), '当前可覆盖升级成本。'),
          _renderBatchPlanMetric('全量需求', Math.floor(upgradePlan.totalCost || 0).toLocaleString(), '超出预算的站点会留在下轮批量操作。'),
        ],
        coverageTargets: upgradePlan.affordableTargets,
        renderTargetMeta: renderUpgradeTargetMeta,
        deferredMarkup: _renderBatchPlanDeferredNote(upgradePlan.deferredTargets, renderUpgradeTargetMeta, '预算后置'),
        footerNote: upgradePlan.affordableTargets.length > 0
          ? '按钮只会对预估列表中的站点下发升级。'
          : '当前预算不足以覆盖任何升级目标。',
        actionLabel: upgradePlan.affordableTargets.length > 0
          ? ('执行 ' + upgradePlan.affordableTargets.length + ' 站升级')
          : '暂无可执行升级',
        action: 'market-batch-upgrade-stations',
        actionableSystemIds: upgradePlan.affordableTargets.map(function (target) { return target.station.systemId; }),
        toneClass: 'tone-warm',
      }) +
    '</div>' +
    '<div class="market-batch-plan-lane">' +
      '<div class="market-batch-plan-lane-title">🧭 批量调整经营方式</div>' +
      _renderBatchPlanSortToolbar('strategy', '排序视角') +
      '<div class="market-batch-plan-grid">' +
        strategyPlans.map(function (entry) {
          var strategy = entry.strategy;
          var plan = entry.plan;
          var renderStrategyTargetMeta = function (target) {
            return {
              title: target.system.name,
              note: '当前 ' + target.strategy.name + ' · 预计日收益 +' + Math.floor(target.projectedIncome || 0).toLocaleString() + ' · 切换后同步为「' + strategy.name + '」',
            };
          };
          return _renderBatchPlanCard({
            title: strategy.name,
            subtitle: '全网经营方式同步',
            badge: plan.targetCount > 0 ? '可执行' : '已同步',
            description: '切换经营方式不消耗积分，但会立即改变整张商网的收益重点。',
            metrics: [
              _renderBatchPlanMetric('覆盖', String(plan.targetCount), '本轮需要切换的站点数量。'),
              _renderBatchPlanMetric('收益 / 风险', Math.round((strategy.incomeMultiplier || 1) * 100) + '% · ' + (strategy.riskLabel || '稳健'), strategy.desc || '用于判断这种经营方式是否合适。'),
              _renderBatchPlanMetric('预算', '0', '同步经营方式不占用额外信用积分。'),
            ],
            coverageTargets: plan.affordableTargets,
            renderTargetMeta: renderStrategyTargetMeta,
            footerNote: plan.targetCount > 0
              ? '执行后会只同步预览中的站点。'
              : '所有贸易站都已经采用这套经营方式。',
            actionLabel: plan.targetCount > 0
              ? ('同步 ' + plan.targetCount + ' 站经营方式')
              : '无需重复同步',
            action: 'market-batch-set-strategy',
            actionableSystemIds: plan.affordableTargets.map(function (target) { return target.station.systemId; }),
            buttonAttrs: ' data-strategy-id="' + strategy.id + '"',
          });
        }).join('') +
      '</div>' +
    '</div>' +
  '</section>';
}


function _renderOperationsCommandDeck(viewingSystem, commerceSnapshot, tradeSummary, ownedStations, buildCandidates, localStation, buildCandidate, networkInvestmentPlan, networkUpgradePlan) {
  var system = findSystem(viewingSystem);
  var systemLabel = system ? (system.name + ' · ' + system.typeLabel) : viewingSystem;
  var localStatusLabel = localStation
    ? '本地站点在线'
    : (buildCandidate ? '可建站地点' : '等待解锁');
  var localStatusNote = localStation
    ? '当前地点已有贸易站，可直接升级、投资或调整经营方式。'
    : (buildCandidate
        ? '当前地点已满足建站条件，可以决定是否投入长期资金。'
        : '当前地点还不能建站，建议先访问和探索更多地点。');

  return '<section class="market-workspace-deck market-operations-deck">' +
    '<div class="market-workspace-deck-hero">' +
      '<div class="market-workspace-deck-copy">' +
        '<div class="market-workspace-deck-kicker">Network Command</div>' +
        '<div class="market-workspace-deck-title">商网指挥台 · ' + localStatusLabel + '</div>' +
        '<div class="market-workspace-deck-summary">经营页分为本地贸易站、批量管理和建站候选。先判断这里是否值得建站，再决定是否批量升级、投资或调整经营方向。</div>' +
      '</div>' +
      '<div class="market-workspace-deck-emphasis">' +
        '<span class="market-workspace-deck-emphasis-label">本地状态</span>' +
        '<strong>' + localStatusLabel + '</strong>' +
        '<span class="market-workspace-deck-emphasis-note">' + localStatusNote + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="market-workspace-deck-grid">' +
      _renderWorkspaceDeckMetric('商网规模', String(tradeSummary.count || 0), '已建站点越多，远程指令台的价值越高。') +
      _renderWorkspaceDeckMetric('日收益', '+' + Math.floor(commerceSnapshot.stationDailyIncome || 0).toLocaleString(), '累计收益 ' + Math.floor(tradeSummary.totalIncome || 0).toLocaleString() + '，适合判断扩张节奏。', 'tone-cool') +
      _renderWorkspaceDeckMetric('升级批量操作', networkUpgradePlan.targetCount > 0 ? (networkUpgradePlan.affordableCount + '/' + networkUpgradePlan.targetCount) : '0/0', '当前预算可覆盖 ' + Math.floor(networkUpgradePlan.affordableCost || 0).toLocaleString() + ' 投资额。', 'tone-warm') +
      _renderWorkspaceDeckMetric('可建站地点', String(buildCandidates.length), buildCandidate ? ('当前地点可直接投资 ' + Math.floor(buildCandidate.buildCost || 0).toLocaleString()) : '继续探索可找到新的建站地点。', 'tone-hot') +
    '</div>' +
    '<div class="market-workspace-deck-strip">' +
      _renderWorkspaceDeckPill('地点', systemLabel) +
      _renderWorkspaceDeckPill('本地状态', localStatusLabel, localStation ? 'tone-cool' : (buildCandidate ? 'tone-warm' : '')) +
      _renderWorkspaceDeckPill('已建站', String(ownedStations.length)) +
      _renderWorkspaceDeckPill('可建站地点', String(buildCandidates.length)) +
      _renderWorkspaceDeckPill('可批量投资', networkInvestmentPlan.targetCount > 0 ? (networkInvestmentPlan.affordableCount + '/' + networkInvestmentPlan.targetCount) : '0/0', (networkInvestmentPlan.affordableCount || 0) > 0 ? 'tone-cool' : '') +
      _renderWorkspaceDeckPill('升级批量操作', networkUpgradePlan.targetCount > 0 ? (networkUpgradePlan.affordableCount + '/' + networkUpgradePlan.targetCount) : '0/0', (networkUpgradePlan.affordableCount || 0) > 0 ? 'tone-warm' : '') +
    '</div>' +
  '</section>';
}

function _renderLocalOperationsMetric(label, value, note, toneClass) {
  return '<div class="market-local-operations-item' + (toneClass ? ' ' + toneClass : '') + '" role="listitem">' +
    '<span class="market-local-operations-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="market-local-operations-value">' + _escapeHtml(value) + '</strong>' +
    '<span class="market-local-operations-note">' + _escapeHtml(note) + '</span>' +
  '</div>';
}

function _renderLocalOperationsPanel(state, viewingSystem, localStation, buildCandidate, localInvestment, isCurrentSys) {
  var system = findSystem(viewingSystem);
  var systemName = system ? system.name : viewingSystem;
  var credits = Math.floor((state && state.credits) || 0);
  var statusValue = '未开放';
  var statusNote = systemName + ' 暂无可维护站点或建站资格';
  var outputValue = '--';
  var outputNote = '完成前置探索后可评估本地经营产能';
  var configValue = '--';
  var configNote = '当前没有设置经营方式';
  var capitalValue = '--';
  var capitalNote = '可用现金 ' + credits.toLocaleString();
  var statusTone = '';
  var outputTone = '';
  var configTone = '';
  var capitalTone = '';
  var focusTitle = '当前地点暂无可经营内容';
  var focusNote = '该地点还没有贸易站，也暂时不能建站。';
  var focusTone = 'idle';

  if (localStation) {
    var recommendation = localStation.strategyRecommendation;
    var upgradeCost = Math.floor(localStation.nextUpgradeCost || 0);
    var investmentAmount = localInvestment ? Math.floor(localInvestment.suggestedAmount || 0) : 0;
    statusValue = 'Lv.' + localStation.station.level + ' 在线';
    statusNote = systemName + ' · ' + (localStation.role ? localStation.role.name : '未分工');
    outputValue = '+' + Math.floor(localStation.projectedIncome || 0).toLocaleString() + '/日';
    outputNote = '毛收入 ' + Math.floor(localStation.grossIncome || 0).toLocaleString() + ' · 维护 ' + Math.floor(localStation.upkeep || 0).toLocaleString();
    configValue = localStation.strategy ? localStation.strategy.name : '待配置';
    configNote = '当前经营方式';
    statusTone = 'tone-cool';
    outputTone = 'tone-cool';
    configTone = localStation.strategy ? 'tone-cool' : 'tone-warm';

    if (localStation.nextLevel && upgradeCost > 0) {
      capitalValue = '升级 ' + upgradeCost.toLocaleString();
      capitalNote = credits >= upgradeCost ? '当前预算可覆盖升级' : ('尚缺 ' + (upgradeCost - credits).toLocaleString());
      capitalTone = credits >= upgradeCost ? 'tone-cool' : 'tone-warm';
    } else if (localInvestment && investmentAmount > 0) {
      capitalValue = '增投 ' + investmentAmount.toLocaleString();
      capitalNote = credits >= investmentAmount ? '当前预算可覆盖增投' : ('尚缺 ' + (investmentAmount - credits).toLocaleString());
      capitalTone = credits >= investmentAmount ? 'tone-cool' : 'tone-warm';
    } else {
      capitalValue = '已满级';
      capitalNote = '当前没有站点升级成本';
      capitalTone = 'tone-cool';
    }

    if (!isCurrentSys) {
      focusTitle = '远程经营审阅';
      focusNote = '可查看收益与经营方式，抵达后才能升级、投资或调整经营方式。';
      focusTone = 'remote';
    } else if (recommendation && recommendation.shouldSwitch) {
      focusTitle = '经营方式可以调整';
      focusNote = '当前经营方式与本地线索不太匹配，可切换为「' + recommendation.strategy.name + '」。';
      focusTone = 'watch';
    } else if (localStation.nextLevel && upgradeCost > 0 && credits >= upgradeCost) {
      focusTitle = '站点升级窗口已打开';
      focusNote = '现有预算可覆盖 Lv.' + localStation.nextLevel.level + ' 升级成本 ' + upgradeCost.toLocaleString() + '。';
      focusTone = 'ready';
    } else if (localInvestment && investmentAmount > 0 && credits >= investmentAmount) {
      focusTitle = '本地增投具备预算';
      focusNote = '当前可覆盖建议增投 ' + investmentAmount.toLocaleString() + '，预估日分红率 ' + (localInvestment.expectedYieldRate * 100).toFixed(2) + '%。';
      focusTone = 'ready';
    } else {
      focusTitle = '本地站点运行稳定';
      focusNote = '经营方式已设置，当前每天预计收入 +' + Math.floor(localStation.projectedIncome || 0).toLocaleString() + '。';
      focusTone = 'stable';
    }
  } else if (buildCandidate) {
    var buildCost = Math.floor(buildCandidate.buildCost || 0);
    var strategy = buildCandidate.strategyRecommendation && buildCandidate.strategyRecommendation.strategy;
    statusValue = '可建站';
    statusNote = systemName + ' · ' + (buildCandidate.role ? buildCandidate.role.name : '待评估角色');
    outputValue = '市场大小 ' + Math.floor((buildCandidate.system && buildCandidate.system.marketDepth) || 200).toLocaleString();
    outputNote = '建站后进入本地经营与商网收益循环';
    configValue = strategy ? strategy.name : '稳健经营';
    configNote = '默认经营方式 · 建成后可调整';
    capitalValue = '建站 ' + buildCost.toLocaleString();
    capitalNote = buildCandidate.canAfford ? '资金与资格均已满足' : (buildCandidate.lockReason || ('尚缺 ' + Math.max(0, buildCost - credits).toLocaleString()));
    statusTone = 'tone-warm';
    outputTone = 'tone-cool';
    configTone = 'tone-cool';
    capitalTone = buildCandidate.canAfford ? 'tone-cool' : 'tone-hot';

    if (!isCurrentSys) {
      focusTitle = '远程候选审阅';
      focusNote = '该地点可以建站，抵达后即可投资建设。';
      focusTone = 'remote';
    } else if (buildCandidate.canAfford) {
      focusTitle = '建站条件已具备';
      focusNote = '资金、公司权限和站点容量均已满足，当前建站成本 ' + buildCost.toLocaleString() + '。';
      focusTone = 'ready';
    } else if (buildCandidate.lockReason) {
      focusTitle = '建站资格受限';
      focusNote = buildCandidate.lockReason;
      focusTone = 'risk';
    } else {
      focusTitle = '建站预算不足';
      focusNote = '当前现金尚缺 ' + Math.max(0, buildCost - credits).toLocaleString() + '。';
      focusTone = 'risk';
    }
  } else if (!isCurrentSys) {
    focusTitle = '远程地点尚未开放经营';
    focusNote = '该地点还没有贸易站，也暂时不能建站；抵达并完成探索后再查看。';
    focusTone = 'remote';
  }

  return '<section class="market-local-operations-panel" aria-label="本地经营局部状态">' +
    '<div class="market-local-operations-head">' +
      '<div>' +
        '<div class="market-local-operations-title">本地经营工位</div>' +
        '<div class="market-local-operations-subtitle">集中查看建站条件、每日收入、经营方向和可用资金。</div>' +
      '</div>' +
      '<span class="market-local-operations-badge">' + (isCurrentSys ? '本地可执行' : '远程只读') + '</span>' +
    '</div>' +
    '<div class="market-local-operations-grid" role="list" aria-label="本地经营指标">' +
      _renderLocalOperationsMetric('地点状态', statusValue, statusNote, statusTone) +
      _renderLocalOperationsMetric('经营产能', outputValue, outputNote, outputTone) +
      _renderLocalOperationsMetric('经营方式', configValue, configNote, configTone) +
      _renderLocalOperationsMetric('可用资金', capitalValue, capitalNote, capitalTone) +
    '</div>' +
    '<div class="market-local-operations-focus" aria-label="本地经营状态" data-tone="' + _escapeHtmlAttr(focusTone) + '">' +
      '<span class="market-local-operations-focus-kicker">经营状态</span>' +
      '<strong class="market-local-operations-focus-title">' + _escapeHtml(focusTitle) + '</strong>' +
      '<span class="market-local-operations-focus-note">' + _escapeHtml(focusNote) + '</span>' +
    '</div>' +
  '</section>';
}

function _renderTradeStationListBriefItem(label, value, note, toneClass) {
  return '<div class="trade-station-list-brief-item' + (toneClass ? ' ' + toneClass : '') + '" role="listitem">' +
    '<span class="trade-station-list-brief-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="trade-station-list-brief-value">' + _escapeHtml(value) + '</strong>' +
    '<span class="trade-station-list-brief-note">' + _escapeHtml(note) + '</span>' +
  '</div>';
}

function _renderTradeStationListBrief(ownedStations, buildCandidates, localStation, buildCandidate, networkInvestmentPlan, networkUpgradePlan) {
  var candidateCount = buildCandidates.length;
  var ownedCount = ownedStations.length;
  var investmentReady = networkInvestmentPlan && networkInvestmentPlan.affordableCount ? networkInvestmentPlan.affordableCount : 0;
  var investmentTotal = networkInvestmentPlan && networkInvestmentPlan.targetCount ? networkInvestmentPlan.targetCount : 0;
  var upgradeReady = networkUpgradePlan && networkUpgradePlan.affordableCount ? networkUpgradePlan.affordableCount : 0;
  var upgradeTotal = networkUpgradePlan && networkUpgradePlan.targetCount ? networkUpgradePlan.targetCount : 0;
  var localStatus = localStation
    ? '本地站点'
    : (buildCandidate ? '当前可建' : '待解锁');
  var localNote = localStation
    ? '当前地点可维护配置'
    : (buildCandidate ? '当前地点可建站' : '当前地点暂时不能建站');
  var candidateNote = buildCandidate
    ? '包含当前查看地点'
    : (candidateCount > 0 ? '已访问地点等待查看' : '继续探索以解锁新地点');
  var signalTitle = '等待第一个建站地点';
  var signalNote = '目前没有候选地点，先访问和探索更多地方。';
  var signalTone = 'trade-station-list-signal--idle';

  if (buildCandidate) {
    signalTitle = '当前地点可以建站';
    signalNote = buildCandidate.system.name + ' 已进入建站候选，投资门槛 ' + Math.floor(buildCandidate.buildCost || 0).toLocaleString() + '。';
    signalTone = buildCandidate.canAfford ? 'trade-station-list-signal--ready' : 'trade-station-list-signal--watch';
  } else if (localStation) {
    signalTitle = '本地站点可维护';
    signalNote = localStation.system.name + ' 已建站，适合先检查升级与经营方式。';
    signalTone = 'trade-station-list-signal--ready';
  } else if (upgradeReady > 0) {
    signalTitle = '升级批量操作待命';
    signalNote = '当前预算可覆盖 ' + upgradeReady + ' / ' + upgradeTotal + ' 个升级目标。';
    signalTone = 'trade-station-list-signal--ready';
  } else if (investmentReady > 0) {
    signalTitle = '追加投资待命';
    signalNote = '当前预算可覆盖 ' + investmentReady + ' / ' + investmentTotal + ' 个增配目标。';
    signalTone = 'trade-station-list-signal--ready';
  } else if (candidateCount > 0) {
    signalTitle = '候选地点等待查看';
    signalNote = '先比较候选地点的市场大小、用途和探索信息，再决定建站顺序。';
    signalTone = 'trade-station-list-signal--watch';
  } else if (ownedCount > 0) {
    signalTitle = '全网保持观察';
    signalNote = '当前没有候选或可执行批量操作，已建站列表用于复核收益和配置。';
    signalTone = 'trade-station-list-signal--watch';
  }

  return '<div class="trade-station-list-brief" role="group" aria-label="商网列表摘要">' +
    '<div class="trade-station-list-brief-head">' +
      '<div>' +
        '<div class="trade-station-list-brief-title">商网列表摘要</div>' +
        '<div class="trade-station-list-brief-subtitle">把候选、已建站点和可执行批量操作压成局部状态，进入列表前先确定关注点。</div>' +
      '</div>' +
      '<span class="market-finance-chip">站点分区</span>' +
    '</div>' +
    '<div class="trade-station-list-brief-grid" role="list">' +
      _renderTradeStationListBriefItem('可建站地点', String(candidateCount), candidateNote, buildCandidate ? 'tone-hot' : '') +
      _renderTradeStationListBriefItem('已建站点', String(ownedCount), ownedCount > 0 ? '可维护收益与配置' : '等待第一座贸易站', ownedCount > 0 ? 'tone-cool' : '') +
      _renderTradeStationListBriefItem('本地状态', localStatus, localNote, localStation ? 'tone-cool' : (buildCandidate ? 'tone-warm' : '')) +
      _renderTradeStationListBriefItem('可执行批量操作', upgradeReady + ' 升级 / ' + investmentReady + ' 增配', '目标池 ' + (upgradeTotal + investmentTotal) + ' 项', (upgradeReady + investmentReady) > 0 ? 'tone-warm' : '') +
    '</div>' +
    '<div class="trade-station-list-signal ' + signalTone + '">' +
      '<span class="trade-station-list-signal-kicker">站点状态</span>' +
      '<strong class="trade-station-list-signal-title">' + _escapeHtml(signalTitle) + '</strong>' +
      '<span class="trade-station-list-signal-note">' + _escapeHtml(signalNote) + '</span>' +
    '</div>' +
  '</div>';
}

export function getTradeStationCandidateIntel(state, systemId) {
  var intel = Exploration.getSurveyDecisionIntel(state || {}, systemId);
  if (!intel || !intel.hasIntel) return null;

  if (intel.depotSignal) {
    return {
      systemId: systemId,
      signal: 'logistics',
      label: '废弃补给站',
      note: intel.anomalyHint || intel.dispatchHint || intel.marketHint || '探索报告显示这里适合作为补给点。',
    };
  }
  if (intel.routeSignal) {
    return {
      systemId: systemId,
      signal: 'route',
      label: '隐藏航线图',
      note: intel.dispatchHint || '探索报告包含航线情报，可用于规划贸易站路线。',
    };
  }
  if (intel.researchSignal) {
    return {
      systemId: systemId,
      signal: 'research',
      label: intel.relicSignal ? '古代遗迹' : '科研样本',
      note: intel.researchHint || '探索报告显示这里能为研究提供帮助。',
    };
  }
  if (intel.marketSignal) {
    return {
      systemId: systemId,
      signal: 'market',
      label: '贸易窗口',
      note: intel.marketHint || '探索报告显示这里可能有交易机会。',
    };
  }
  if (intel.logisticsSignal) {
    return {
      systemId: systemId,
      signal: 'logistics',
      label: '补给点',
      note: intel.dispatchHint || intel.marketHint || '探索报告显示这里适合作为补给点。',
    };
  }

  return {
    systemId: systemId,
    signal: intel.primarySignal || 'survey',
    label: intel.primaryLabel || '探索线索',
    note: intel.marketHint || intel.dispatchHint || '该地点已有探索报告，可用来判断是否适合建站。',
  };
}

function _renderTradeStationCandidateIntel(state, systemId, className) {
  var intel = getTradeStationCandidateIntel(state, systemId);
  if (!intel) return '';
  var extraClass = className ? (' ' + className) : '';
  return '<div class="trade-station-intel-note' + extraClass + '">' +
    '<span class="market-finance-chip">探索支持 · ' + _escapeHtml(intel.label) + '</span>' +
    '<span>' + _escapeHtml(intel.note) + '</span>' +
  '</div>';
}

function _renderTradeStationExplorationEffectMeta(effect, className) {
  if (!effect || !effect.summary) return '';
  var metaClass = className || 'trade-station-card-meta';
  return '<div class="' + metaClass + '">' +
    _escapeHtml('连续任务加成：' + effect.summary) +
  '</div>';
}

function _formatSynergyBonus(synergy) {
  if (!synergy || !synergy.bonusMultiplier) return '';
  return '+' + Math.round((synergy.bonusMultiplier || 0) * 100) + '%';
}

function _renderTradeStationRoleMeta(role, synergy, prefix) {
  if (!role) return '';
  var label = prefix || '角色';
  var bonus = _formatSynergyBonus(synergy);
  var synergyText = bonus
    ? ((synergy.galaxyName ? (synergy.galaxyName + ' · ') : '') + synergy.label + ' ' + bonus)
    : '区域协同待补齐';
  return '<div class="trade-station-card-meta">' +
    _escapeHtml(label + '：' + role.name + ' · ' + synergyText) +
  '</div>';
}

function _renderMarketFinanceRoleMeta(role, synergy, prefix) {
  if (!role) return '';
  var label = prefix || '角色';
  var bonus = _formatSynergyBonus(synergy);
  var synergyText = bonus
    ? ((synergy.galaxyName ? (synergy.galaxyName + ' · ') : '') + synergy.label + ' ' + bonus)
    : '区域协同待补齐';
  return '<div class="market-finance-card-meta">' +
    _escapeHtml(label + '：' + role.name + ' · ' + synergyText) +
  '</div>';
}

function _formatStrategyConfidence(confidence) {
  if (confidence === 'high') return '高置信';
  if (confidence === 'medium') return '中置信';
  return '低置信';
}

function _renderStrategyRecommendationMeta(recommendation, className) {
  if (!recommendation || !recommendation.strategy) return '';
  var metaClass = className || 'trade-station-card-meta';
  var status = recommendation.shouldSwitch ? '建议切换' : '当前匹配';
  return '<div class="' + metaClass + '">' +
    _escapeHtml('建议方式：' + recommendation.strategy.name + ' · ' + status + ' · ' + _formatStrategyConfidence(recommendation.confidence) + ' · ' + recommendation.reason) +
  '</div>';
}

function _renderStrategyRecommendationButton(entry, className) {
  if (!entry || !entry.station || !entry.strategyRecommendation || !entry.strategyRecommendation.shouldSwitch) return '';
  var recommendation = entry.strategyRecommendation;
  var buttonClass = className || 'trade-station-upgrade-btn';
  var stationLabel = entry.system && entry.system.name ? entry.system.name : entry.station.systemId;
  return '<button class="btn-action ' + buttonClass + '" data-action="market-set-strategy" data-system-id="' + _escapeHtmlAttr(entry.station.systemId) + '" data-strategy-id="' + _escapeHtmlAttr(recommendation.strategyId) + '" aria-label="' + _escapeHtmlAttr(stationLabel + ' 切换为建议方式 ' + recommendation.strategy.name) + '">' +
    '采用建议方式' +
  '</button>';
}

function _getTradeStationDomId(prefix, systemId) {
  var safeId = String(systemId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
  return prefix + '-' + safeId;
}

function _renderNextNetworkAction(action) {
  if (!action) {
    return '<div class="market-finance-card">' +
      '<div class="market-finance-card-head">' +
        '<span class="market-finance-card-title">下一笔商网动作</span>' +
        '<span class="market-finance-chip">暂无待处理</span>' +
      '</div>' +
      '<div class="market-finance-card-meta">当前商网没有明显优先动作，可继续跑贸易、探索情报或积累资金。</div>' +
    '</div>';
  }

  var buttonHtml = '';
  if (action.payload && action.payload.action && !action.disabled) {
    var attrs = ' data-action="' + _escapeHtmlAttr(action.payload.action) + '"';
    if (action.payload.systemId) attrs += ' data-system-id="' + _escapeHtmlAttr(action.payload.systemId) + '"';
    if (action.payload.managerId) attrs += ' data-manager-id="' + _escapeHtmlAttr(action.payload.managerId) + '"';
    if (action.payload.strategyId) attrs += ' data-strategy-id="' + _escapeHtmlAttr(action.payload.strategyId) + '"';
    buttonHtml = '<div class="market-finance-actions">' +
      '<button class="btn-action market-finance-btn"' + attrs + '>' + _escapeHtml(action.actionLabel || '执行') + '</button>' +
    '</div>';
  }

  var chipLabel = action.disabled
    ? (action.disabledLabel || '资金准备')
    : action.actionLabel;
  return '<div class="market-finance-card is-featured">' +
    '<div class="market-finance-card-head">' +
      '<span class="market-finance-card-title">下一笔商网动作</span>' +
      '<span class="market-finance-chip">' + _escapeHtml(chipLabel) + '</span>' +
    '</div>' +
    '<div class="market-finance-card-meta">' + _escapeHtml(action.title) + '</div>' +
    '<div class="market-finance-card-meta">' + _escapeHtml(action.reason) + '</div>' +
    buttonHtml +
  '</div>';
}

function _renderOverviewTable(state, galaxyId, onPlanetClick, tableIds) {
  var thead = document.getElementById(tableIds.theadId);
  var tbody = document.getElementById(tableIds.tbodyId);
  if (!thead || !tbody) return;

  var isSell = _marketOverviewPriceMode === 'sell';
  var table = document.getElementById(tableIds.tableId);
  var status = document.getElementById(tableIds.statusId);
  if (table) {
    table.dataset.priceMode = _marketOverviewPriceMode;
    table.setAttribute('aria-label', isSell ? '各地商品卖出价格表' : '各地商品买入价格表');
  }
  if (status) status.textContent = '表格显示各地的' + (isSell ? '卖出价。' : '买入价。');

  var overviewGoods = GOODS.filter(function (good) {
    return good.marketAccess && good.marketAccess.indexOf('open') !== -1;
  });
  var hasRemotePriceIntel = (state.researchedTechs || []).indexOf('trade_network') !== -1;

  thead.innerHTML = '';
  var headRow = document.createElement('tr');
  headRow.innerHTML = '<th class="mkt-ov-planet-th" scope="col">星球</th>' +
    overviewGoods.map(function (good) {
      return '<th class="mkt-ov-good-th" scope="col" title="' + good.name + '">' + good.emoji + '</th>';
    }).join('');
  thead.appendChild(headRow);

  var playerLevel = state.playerLevel || 1;
  var allSystems = getSystemsByGalaxy(galaxyId);
  var accessible = allSystems.filter(function (system) {
    return isSystemAccessible(system.id, playerLevel, state.researchedTechs);
  });
  var visited = state.visitedSystems || [];

  accessible.sort(function (a, b) {
    var aPriority = (a.id === state.currentSystem ? -2 : 0) + (visited.indexOf(a.id) !== -1 ? -1 : 0);
    var bPriority = (b.id === state.currentSystem ? -2 : 0) + (visited.indexOf(b.id) !== -1 ? -1 : 0);
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (a.minLevel || 1) - (b.minLevel || 1);
  });

  tbody.innerHTML = '';
  accessible.forEach(function (system) {
    var isCurrent = system.id === state.currentSystem;
    var isVisited = visited.indexOf(system.id) !== -1;
    var canViewPrices = isCurrent || isVisited || hasRemotePriceIntel;
    var row = document.createElement('tr');
    row.className = 'mkt-ov-row' +
      (isCurrent ? ' mkt-ov-current' : '') +
      (isVisited ? ' mkt-ov-visited' : ' mkt-ov-unvisited');
    row.dataset.sysId = system.id;

    var planetCell = '<td class="mkt-ov-planet">' +
      '<button class="mkt-ov-planet-action" type="button" aria-label="' +
        (canViewPrices ? '查看' : '尚未掌握') + _escapeHtmlAttr(system.name) + '市场详情"' +
        (canViewPrices ? '' : ' disabled aria-disabled="true"') + '>' +
        '<span class="mkt-ov-dot" style="background:' + system.color + '"></span>' +
        (isCurrent ? '📍 ' : '') +
        '<span class="mkt-ov-name">' + _escapeHtml(system.name) + '</span>' +
        '<span class="mkt-ov-type">' + _escapeHtml(system.typeLabel) + '</span>' +
      '</button>' +
      '</td>';

    var priceCells = '';
    overviewGoods.forEach(function (good) {
      if (!canViewPrices) {
        priceCells += '<td class="mkt-ov-price-cell price-unknown" title="访问该地点或研究贸易情报网络后解锁精确报价">' +
          '<span class="mkt-ov-price-chip"><span class="mkt-ov-price-value">—</span></span>' +
        '</td>';
        return;
      }
      var price = isSell
        ? Economy.getSellPrice(system.id, good.id, state)
        : Economy.getBuyPrice(system.id, good.id, state);
      var multiplier = Economy.getSystemMultiplier(system.id, good.id);
      var heatMeta = _getMarketHeatMeta(multiplier);
      var heatDelta = _formatMarketHeatDelta(multiplier);
      var rangeClass = multiplier < 0.7 ? 'price-low' : (multiplier > 1.4 ? 'price-high' : '');

      priceCells += '<td class="mkt-ov-price-cell ' + heatMeta.className + ' ' + rangeClass + '" title="' + good.name + ' · ' + heatMeta.label + ' · ' + heatMeta.note + '">' +
        '<span class="mkt-ov-price-chip">' +
          '<span class="mkt-ov-price-value">' + price + '</span>' +
          '<span class="mkt-ov-price-delta ' + heatDelta.className + '">' + heatDelta.text + '</span>' +
        '</span>' +
      '</td>';
    });

    row.innerHTML = planetCell + priceCells;
    function openPlanetMarket() {
      onPlanetClick(system.id);
    }
    if (canViewPrices) row.addEventListener('click', openPlanetMarket);
    var planetAction = row.querySelector('.mkt-ov-planet-action');
    if (planetAction && canViewPrices) {
      planetAction.addEventListener('click', function (event) {
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        openPlanetMarket();
      });
    }
    row.style.cursor = 'pointer';

    tbody.appendChild(row);
  });
}

function _renderFinancePanels(state, viewingSystem, isCurrentSys, financeActions, progression) {
  var capitalContainer = document.getElementById('market-capital-pane');
  var operationsContainer = document.getElementById('market-operations-pane');
  if (!capitalContainer || !operationsContainer) return;

  financeActions = financeActions || {};

  var commerceSnapshot = Commerce.getCommerceSnapshot(state);
  var capitalWorkspace = _renderMarketCapitalWorkspace({
    state: state,
    systemId: viewingSystem,
    isCurrentSystem: isCurrentSys,
    commerceSnapshot: commerceSnapshot,
  });
  var tradeInvestments = Finance.getTradeInvestmentOptions(
    state,
    [viewingSystem].concat(state.visitedSystems || []).concat(Object.keys(state.tradeInvestments || {}))
  );
  var localInvestment = tradeInvestments.find(function (entry) {
    return entry.systemId === viewingSystem;
  }) || null;
  var hasLocalInvestment = !!(localInvestment && localInvestment.investedAmount > 0);
  var localInvestmentPositionMeta = hasLocalInvestment
    ? ('已投 ' + Math.floor(localInvestment.investedAmount).toLocaleString() +
      ' · 每天预计 +' + Math.floor(localInvestment.expectedDailyDividend || 0).toLocaleString() +
      ' · 约 ' + Math.floor(localInvestment.estimatedPaybackDays || 0) + ' 天回本 · 累计分红 ' +
      Math.floor(localInvestment.totalDividends || 0).toLocaleString() +
      (localInvestment.canRedeem
        ? (' · 现在退出预计收回 ' + Math.floor(localInvestment.estimatedExitValue || 0).toLocaleString())
        : (' · 第 ' + localInvestment.redeemableDay + ' 天可退出')))
    : '';
  var tradeSummary = TradeStation.getSummary(state);
  var ownedStations = TradeStation.getOwnedStations(state);
  var buildCandidates = TradeStation.getBuildCandidates(state);
  var nextNetworkAction = TradeStation.getNextNetworkAction(state);
  var networkInvestmentPlan = _getInvestmentBatchPlan(state, ownedStations);
  var networkUpgradePlan = _getBatchAffordablePlan(
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


  var operationsLocalSection = '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">🏪 本地经营</div>' +
        '<div class="market-finance-subtitle">在当前地点决定是否建站、升级或调整经营方式。</div>' +
      '</div>' +
      '<span class="market-finance-chip">商网 ' + tradeSummary.count + ' 站</span>' +
    '</div>' +
    _renderLocalOperationsPanel(state, viewingSystem, localStation, buildCandidate, localInvestment, isCurrentSys);

  if (localStation) {
    operationsLocalSection += '<div class="market-finance-card is-featured">' +
      '<div class="market-finance-card-head">' +
        '<span class="market-finance-card-title">' + localStation.system.name + ' 贸易站</span>' +
        '<span class="market-finance-chip">Lv.' + localStation.station.level + ' · ' + localStation.levelConfig.name + '</span>' +
      '</div>' +
      '<div class="market-finance-card-meta">预计日收益 +' + Math.floor(localStation.projectedIncome).toLocaleString() + ' · 累计 ' + Math.floor(localStation.station.totalIncome || 0).toLocaleString() + ' · 经济系数 ×' + localStation.economicFactor.toFixed(2) + '</div>' +
      _renderMarketFinanceRoleMeta(localStation.role, localStation.regionalSynergy, '站点角色') +
      _renderStrategyRecommendationMeta(localStation.strategyRecommendation, 'market-finance-card-meta') +
      _renderTradeStationExplorationEffectMeta(localStation.explorationEffect, 'market-finance-card-meta') +
      '<div class="market-finance-card-meta">经营方式：' + localStation.strategy.name + '</div>' +
      (localInvestment
        ? '<div class="market-finance-card-meta">站点投资：' + (hasLocalInvestment ? localInvestmentPositionMeta : ('建议投入 ' + localInvestment.suggestedAmount.toLocaleString() + ' · 每天预计回报率 ' + (localInvestment.expectedYieldRate * 100).toFixed(2) + '%')) + '</div>'
        : '') +
      (isCurrentSys
        ? '<div class="market-finance-actions" role="group" aria-label="' + _escapeHtmlAttr(localStation.system.name + ' 贸易站操作') + '">' +
            _renderStrategyRecommendationButton(localStation, 'market-finance-btn') +
            '<button class="btn-action market-finance-btn' + (localStation.nextLevel ? '' : ' disabled') + '" data-action="market-upgrade-station" data-system-id="' + _escapeHtmlAttr(localStation.station.systemId) + '" aria-label="' + _escapeHtmlAttr(localStation.system.name + (localStation.nextLevel ? (' 升级至 Lv.' + localStation.nextLevel.level) : ' 已满级')) + '"' + (localStation.nextLevel ? '' : ' disabled aria-disabled="true"') + '>' + (localStation.nextLevel ? ('升级 +' + localStation.nextUpgradeCost.toLocaleString()) : (localStation.nextLevelLockLabel || '已满级')) + '</button>' +
            (localInvestment ? '<button class="btn-action market-finance-btn" data-action="market-invest-trade-station" data-system-id="' + _escapeHtmlAttr(localInvestment.systemId) + '" aria-label="' + _escapeHtmlAttr(localStation.system.name + ' 追加站点投资') + '">追加投资</button>' : '') +
            (hasLocalInvestment
              ? '<button class="btn-action market-finance-btn' + (localInvestment.canRedeem ? '' : ' disabled') + '" data-action="market-redeem-trade-station" data-system-id="' + _escapeHtmlAttr(localInvestment.systemId) + '" aria-label="' + _escapeHtmlAttr(localInvestment.canRedeem ? (localStation.system.name + ' 退出站点投资，预计收回 ' + localInvestment.estimatedExitValue) : (localStation.system.name + ' 站点投资第 ' + localInvestment.redeemableDay + ' 天可退出')) + '"' + (localInvestment.canRedeem ? '' : ' disabled aria-disabled="true"') + '>' +
                (localInvestment.canRedeem ? ('退出并收回 ' + Math.floor(localInvestment.estimatedExitValue || 0).toLocaleString()) : ('第 ' + localInvestment.redeemableDay + ' 天可退出')) + '</button>'
              : '') +
          '</div>' +
          '<div class="market-finance-station-stack">' +
            '<div class="market-finance-subsection">🧭 经营方式</div>' +
            '<div class="trade-station-choice-row" role="group" aria-label="' + _escapeHtmlAttr(localStation.system.name + ' 经营方式选择') + '">' + TRADE_STATION_STRATEGIES.map(function (strategy) {
              var active = localStation.station.strategyId === strategy.id;
              return '<button class="trade-station-choice-btn' + (active ? ' active' : '') + '" data-action="market-set-strategy" data-system-id="' + _escapeHtmlAttr(localStation.station.systemId) + '" data-strategy-id="' + _escapeHtmlAttr(strategy.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '" aria-label="' + _escapeHtmlAttr(localStation.system.name + ' 经营方式 ' + strategy.name + '，预计收益 ' + Math.round(strategy.incomeMultiplier * 100) + '%，' + (strategy.riskLabel || '稳健')) + '">' +
                strategy.name + '<span>' + Math.round(strategy.incomeMultiplier * 100) + '% · ' + (strategy.riskLabel || '稳健') + '</span></button>';
            }).join('') + '</div>' +
          '</div>'
        : '<div class="market-finance-locked">📡 远程查看模式：可查看该站点收益与经营方式，抵达后才能升级或调整。</div>') +
    '</div>';
  } else if (buildCandidate) {
    operationsLocalSection += '<div class="market-finance-card">' +
      '<div class="market-finance-card-head">' +
        '<span class="market-finance-card-title">在 ' + buildCandidate.system.name + ' 建立贸易站</span>' +
        '<span class="market-finance-chip">' + buildCandidate.system.typeLabel + '</span>' +
      '</div>' +
        '<div class="market-finance-card-meta">市场大小 ' + (buildCandidate.system.marketDepth || 200) + ' · ' + buildCandidate.system.description + '</div>' +
      _renderMarketFinanceRoleMeta(buildCandidate.role, buildCandidate.prospectiveRegionalSynergy, '预期角色') +
      _renderStrategyRecommendationMeta(buildCandidate.strategyRecommendation, 'market-finance-card-meta') +
      _renderTradeStationExplorationEffectMeta(buildCandidate.explorationEffect, 'market-finance-card-meta') +
      _renderTradeStationCandidateIntel(state, buildCandidate.system.id, 'is-local') +
      '<div class="market-finance-card-meta">' + (buildCandidate.lockReason || '建站后可持续利用本地价格和市场状态赚钱。') + '</div>' +
      (localInvestment
        ? '<div class="market-finance-card-meta">站点投资：' + (hasLocalInvestment ? localInvestmentPositionMeta : ('建议投入 ' + localInvestment.suggestedAmount.toLocaleString() + '；投入后锁定 30 天，退出成本 12%')) + '</div>'
        : '') +
      (isCurrentSys
        ? '<div class="market-finance-actions">' +
            '<button class="btn-action market-finance-btn' + (buildCandidate.canAfford ? '' : ' disabled') + '" data-action="market-build-station" data-system-id="' + _escapeHtmlAttr(buildCandidate.system.id) + '" aria-label="' + _escapeHtmlAttr('在 ' + buildCandidate.system.name + ' 建立贸易站，投资 ' + buildCandidate.buildCost.toLocaleString()) + '"' + (buildCandidate.canAfford ? '' : ' disabled aria-disabled="true"') + '>' + (buildCandidate.canAfford ? ('投资 ' + buildCandidate.buildCost.toLocaleString()) : (buildCandidate.lockReason || ('投资 ' + buildCandidate.buildCost.toLocaleString()))) + '</button>' +
            (localInvestment ? '<button class="btn-action market-finance-btn" data-action="market-invest-trade-station" data-system-id="' + _escapeHtmlAttr(localInvestment.systemId) + '" aria-label="' + _escapeHtmlAttr(buildCandidate.system.name + ' 先做财务投资') + '">先做财务投资</button>' : '') +
            (hasLocalInvestment
              ? '<button class="btn-action market-finance-btn' + (localInvestment.canRedeem ? '' : ' disabled') + '" data-action="market-redeem-trade-station" data-system-id="' + _escapeHtmlAttr(localInvestment.systemId) + '"' + (localInvestment.canRedeem ? '' : ' disabled aria-disabled="true"') + '>' +
                (localInvestment.canRedeem ? ('退出并收回 ' + Math.floor(localInvestment.estimatedExitValue || 0).toLocaleString()) : ('第 ' + localInvestment.redeemableDay + ' 天可退出')) + '</button>'
              : '') +
          '</div>'
        : '<div class="market-finance-locked">📡 这里可以建站。抵达后可直接投资建设。</div>') +
    '</div>';
  } else {
    operationsLocalSection += '<div class="market-finance-empty">该地点暂时不能建设贸易站，或尚未完成前置探索。</div>';
  }

  if (ownedStations.length > 0) {
    operationsLocalSection += '<div class="market-finance-subsection">📡 商网快照</div>' +
      '<div class="market-finance-action-list">' + ownedStations.slice(0, 4).map(function (entry) {
        return '<div class="market-finance-network-row">' +
          '<div class="market-finance-network-main">' +
            '<div class="market-finance-action-title">' + entry.system.name + ' · Lv.' + entry.station.level + '</div>' +
            '<div class="market-finance-action-meta">日收益 +' + Math.floor(entry.projectedIncome).toLocaleString() + ' · ' + (entry.role ? entry.role.name : '未分工') + ' · 经营方式 ' + entry.strategy.name + '</div>' +
          '</div>' +
          '<div class="market-finance-network-note">累计 ' + Math.floor(entry.station.totalIncome || 0).toLocaleString() + '</div>' +
        '</div>';
      }).join('') + '</div>';
  }

  operationsLocalSection += '</section>';

  var operationsNetworkSection = '<section class="market-finance-section">' +
    '<div class="trade-station-summary-card">' +
      '<div class="trade-station-summary-head">' +
        '<span class="trade-station-summary-title">📡 商业网络总览</span>' +
        '<span class="trade-station-summary-sub">信用评级 ' + commerceSnapshot.creditRating + ' · 商网总览现由经营页统一承载</span>' +
      '</div>' +
      '<div class="trade-station-summary-grid">' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">站点数量</span><span class="trade-station-metric-value">' + commerceSnapshot.ownedStationCount + '</span></div>' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">预计日收益</span><span class="trade-station-metric-value">+' + Math.floor(commerceSnapshot.stationDailyIncome).toLocaleString() + '</span></div>' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">累计收益</span><span class="trade-station-metric-value">' + Math.floor(tradeSummary.totalIncome).toLocaleString() + '</span></div>' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">站点投资</span><span class="trade-station-metric-value">' + Math.floor(commerceSnapshot.tradeInvestmentValue).toLocaleString() + '</span></div>' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">贷款余额</span><span class="trade-station-metric-value">' + Math.floor(commerceSnapshot.totalLoans).toLocaleString() + '</span></div>' +
      '</div>' +
      '<div class="trade-station-summary-tip">这里统一查看远程价格、建站候选和所有贸易站的经营情况。</div>' +
    '</div>' +
    _renderNextNetworkAction(nextNetworkAction) +
  '</section>';

  if (ownedStations.length > 0) {
    operationsNetworkSection += _renderOperationsBatchPlanningPanel(state, ownedStations, networkInvestmentPlan, networkUpgradePlan);
  }

  if (ownedStations.length > 0) {
    operationsNetworkSection += '<section class="market-finance-section">' +
      '<div class="trade-station-section-title">⚡ 核心站点快照</div>' +
      '<div class="market-finance-action-list">' + ownedStations.slice(0, 6).map(function (entry) {
        return '<div class="market-finance-network-row">' +
          '<div class="market-finance-network-main">' +
            '<div class="market-finance-action-title">' + entry.system.name + ' · Lv.' + entry.station.level + '</div>' +
            '<div class="market-finance-action-meta">日收益 +' + Math.floor(entry.projectedIncome).toLocaleString() + ' · ' + (entry.role ? entry.role.name : '未分工') + ' · 经营方式 ' + entry.strategy.name + '</div>' +
          '</div>' +
          '<div class="market-finance-network-note">累计 ' + Math.floor(entry.station.totalIncome || 0).toLocaleString() + '</div>' +
        '</div>';
      }).join('') + '</div>' +
    '</section>';
  }

  var operationsStationsSection = '<section class="market-finance-section">' +
    _renderTradeStationListBrief(ownedStations, buildCandidates, localStation, buildCandidate, networkInvestmentPlan, networkUpgradePlan) +
    '<div class="trade-station-section-title">🏗 建站候选</div>';

  if (buildCandidate || buildCandidates.length > 0) {
    operationsStationsSection += '<div class="trade-station-card-list trade-station-card-list--candidates" role="list" aria-label="建站候选列表">';
    buildCandidates.forEach(function (candidate) {
      var cardId = _getTradeStationDomId('trade-station-candidate-card', candidate.system.id);
      var titleId = _getTradeStationDomId('trade-station-candidate-title', candidate.system.id);
      var metaId = _getTradeStationDomId('trade-station-candidate-meta', candidate.system.id);
      var descId = _getTradeStationDomId('trade-station-candidate-desc', candidate.system.id);
      operationsStationsSection += '<article id="' + _escapeHtmlAttr(cardId) + '" class="trade-station-build-card" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(titleId) + '" aria-describedby="' + _escapeHtmlAttr(metaId + ' ' + descId) + '">' +
        '<div class="trade-station-card-head">' +
          '<span id="' + _escapeHtmlAttr(titleId) + '" class="trade-station-card-name">' + candidate.system.name + '</span>' +
          '<span class="trade-station-card-badge">' + candidate.system.typeLabel + '</span>' +
        '</div>' +
        '<div id="' + _escapeHtmlAttr(metaId) + '" class="trade-station-card-meta">市场大小 ' + (candidate.system.marketDepth || 200) + ' · ' + (candidate.isCurrent ? '当前停靠中，可立即投资' : '已访问，可先加入建站计划') + '</div>' +
        _renderTradeStationRoleMeta(candidate.role, candidate.prospectiveRegionalSynergy, '预期角色') +
        _renderStrategyRecommendationMeta(candidate.strategyRecommendation, 'trade-station-card-meta') +
        _renderTradeStationExplorationEffectMeta(candidate.explorationEffect, 'trade-station-card-meta') +
        _renderTradeStationCandidateIntel(state, candidate.system.id, 'is-candidate') +
        '<div id="' + _escapeHtmlAttr(descId) + '" class="trade-station-card-desc">' + candidate.system.description + '</div>' +
        '<button class="btn-action trade-station-build-btn' + (candidate.canAfford ? '' : ' disabled') + '" data-action="market-build-station" data-system-id="' + _escapeHtmlAttr(candidate.system.id) + '" aria-describedby="' + _escapeHtmlAttr(metaId + ' ' + descId) + '" aria-label="' + _escapeHtmlAttr('在 ' + candidate.system.name + ' 建立贸易站，投资 ' + candidate.buildCost.toLocaleString() + ' 积分') + '"' + (candidate.canAfford ? '' : ' disabled aria-disabled="true"') + '>' + (candidate.canAfford ? ('投资 ' + candidate.buildCost.toLocaleString() + ' 积分') : (candidate.lockReason || ('投资 ' + candidate.buildCost.toLocaleString() + ' 积分'))) + '</button>' +
      '</article>';
    });
    operationsStationsSection += '</div>';
  } else {
    operationsStationsSection += '<div class="trade-station-empty">先探索更多星球，才能解锁新的建站候选。</div>';
  }

  operationsStationsSection += '</section>';

  operationsStationsSection += '<section class="market-finance-section">' +
    '<div class="trade-station-section-title">📡 已建贸易站</div>';

  if (ownedStations.length === 0) {
    operationsStationsSection += '<div class="trade-station-empty">还没有贸易站。先在当前停靠地点完成第一笔长期投资。</div>';
  } else {
    operationsStationsSection += '<div class="trade-station-card-list trade-station-card-list--owned" role="list" aria-label="已建贸易站列表">';
    ownedStations.forEach(function (entry) {
      var station = entry.station;
      var cardId = _getTradeStationDomId('trade-station-owned-card', station.systemId);
      var titleId = _getTradeStationDomId('trade-station-owned-title', station.systemId);
      var incomeId = _getTradeStationDomId('trade-station-owned-income', station.systemId);
      var strategyGroupId = _getTradeStationDomId('trade-station-strategy-group', station.systemId);
      operationsStationsSection += '<article id="' + _escapeHtmlAttr(cardId) + '" class="trade-station-card" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(titleId) + '" aria-describedby="' + _escapeHtmlAttr(incomeId) + '">' +
        '<div class="trade-station-card-head">' +
          '<span id="' + _escapeHtmlAttr(titleId) + '" class="trade-station-card-name">' + entry.system.name + ' 贸易站</span>' +
          '<span class="trade-station-card-badge">Lv.' + station.level + ' · ' + entry.levelConfig.name + '</span>' +
        '</div>' +
        '<div id="' + _escapeHtmlAttr(incomeId) + '" class="trade-station-income-row" role="group" aria-label="' + _escapeHtmlAttr(entry.system.name + ' 收益指标') + '">' +
          '<span>预计日收益 <b>+' + Math.floor(entry.projectedIncome).toLocaleString() + '</b></span>' +
          '<span>上一日 +' + Math.floor(station.lastIncome || 0).toLocaleString() + '</span>' +
          '<span>累计 ' + Math.floor(station.totalIncome || 0).toLocaleString() + '</span>' +
        '</div>' +
        _renderTradeStationRoleMeta(entry.role, entry.regionalSynergy, '站点角色') +
        _renderStrategyRecommendationMeta(entry.strategyRecommendation, 'trade-station-card-meta') +
        _renderTradeStationExplorationEffectMeta(entry.explorationEffect, 'trade-station-card-meta') +
        '<div class="trade-station-card-meta">经济系数 ×' + entry.economicFactor.toFixed(2) + ' · 累计投资 ' + Math.floor(station.investment || 0).toLocaleString() + ' · 建于第 ' + (station.buildDay || 1) + ' 天</div>' +
        '<div class="trade-station-card-meta">经营方式：' + entry.strategy.name + '</div>' +
        '<div class="trade-station-actions" role="group" aria-label="' + _escapeHtmlAttr(entry.system.name + ' 贸易站操作') + '">' +
          _renderStrategyRecommendationButton(entry, 'trade-station-upgrade-btn') +
          '<button class="btn-action trade-station-upgrade-btn' + (entry.nextLevel ? '' : ' disabled') + '" data-action="market-upgrade-station" data-system-id="' + _escapeHtmlAttr(station.systemId) + '" aria-label="' + _escapeHtmlAttr(entry.system.name + (entry.nextLevel ? (' 升级至 Lv.' + entry.nextLevel.level) : ' 已达满级')) + '"' + (entry.nextLevel ? '' : ' disabled aria-disabled="true"') + '>' +
            (entry.nextLevel ? ('升级至 Lv.' + entry.nextLevel.level + '（+' + entry.nextUpgradeCost.toLocaleString() + '）') : (entry.nextLevelLockLabel || '已达满级')) +
          '</button>' +
        '</div>' +
        '<div id="' + _escapeHtmlAttr(strategyGroupId) + '" class="trade-station-subsection">🧭 经营方式</div>' +
        '<div class="trade-station-choice-row" role="group" aria-labelledby="' + _escapeHtmlAttr(strategyGroupId) + '">' +
          TRADE_STATION_STRATEGIES.map(function (strategy) {
            var activeClass = station.strategyId === strategy.id ? ' active' : '';
            var active = station.strategyId === strategy.id;
            return '<button class="trade-station-choice-btn' + activeClass + '" data-action="market-set-strategy" data-system-id="' + _escapeHtmlAttr(station.systemId) + '" data-strategy-id="' + _escapeHtmlAttr(strategy.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '" aria-label="' + _escapeHtmlAttr(entry.system.name + ' 经营方式 ' + strategy.name + '，预计收益 ' + Math.round(strategy.incomeMultiplier * 100) + '%，' + (strategy.riskLabel || '稳健')) + '">' +
              strategy.name + '<span>' + Math.round(strategy.incomeMultiplier * 100) + '% · ' + (strategy.riskLabel || '稳健') + '</span></button>';
          }).join('') +
        '</div>' +
      '</article>';
    });
    operationsStationsSection += '</div>';
  }

  operationsStationsSection += '</section>';


  capitalContainer.innerHTML = capitalWorkspace.overviewHtml +
    '<div class="market-workspace-board market-capital-board">' + _renderMarketSubworkspace('capital', {
      local: capitalWorkspace.localHtml,
    }, progression) + '</div>';
  operationsContainer.innerHTML = _renderOperationsCommandDeck(
    viewingSystem,
    commerceSnapshot,
    tradeSummary,
    ownedStations,
    buildCandidates,
    localStation,
    buildCandidate,
    networkInvestmentPlan,
    networkUpgradePlan
  ) + '<div class="market-workspace-board market-operations-board">' + _renderMarketSubworkspace('operations', {
    local: operationsLocalSection,
    network: operationsNetworkSection,
    stations: operationsStationsSection,
  }, progression) + '</div>';

  [capitalContainer, operationsContainer].forEach(function (container) {
    if (!container) return;

    _bindMarketSubworkspaceTabs(container, progression);

    container.querySelectorAll('[data-action="market-batch-set-sort"]').forEach(function (button) {
      button.addEventListener('click', function () {
        _setBatchPlanSortMode(button.dataset.batchSortScope, button.dataset.batchSortMode);
        _renderFinancePanels(state, viewingSystem, isCurrentSys, financeActions);
      });
    });

    container.querySelectorAll('[data-action="market-take-loan"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onTakeLoan) financeActions.onTakeLoan(button.dataset.loanOfferId);
      });
    });

    container.querySelectorAll('[data-action="market-repay-loan"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onRepayLoan) financeActions.onRepayLoan(button.dataset.loanId);
      });
    });

    container.querySelectorAll('[data-action="market-invest-trade-station"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onInvestTradeStation) financeActions.onInvestTradeStation(button.dataset.systemId);
      });
    });

    container.querySelectorAll('[data-action="market-redeem-trade-station"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onRedeemTradeStationInvestment) financeActions.onRedeemTradeStationInvestment(button.dataset.systemId);
      });
    });

    container.querySelectorAll('[data-action="market-batch-invest-trade-stations"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onBatchInvestTradeStations) financeActions.onBatchInvestTradeStations(
          _parseBatchSystemIds(button.dataset.systemIds),
          Number(button.dataset.batchAmount || 0) || undefined
        );
      });
    });

    container.querySelectorAll('[data-action="market-build-station"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onBuildTradeStation) financeActions.onBuildTradeStation(button.dataset.systemId);
      });
    });

    container.querySelectorAll('[data-action="market-upgrade-station"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onUpgradeTradeStation) financeActions.onUpgradeTradeStation(button.dataset.systemId);
      });
    });

    container.querySelectorAll('[data-action="market-set-strategy"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onSetTradeStationStrategy) financeActions.onSetTradeStationStrategy(button.dataset.systemId, button.dataset.strategyId);
      });
    });

    container.querySelectorAll('[data-action="market-batch-upgrade-stations"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onBatchUpgradeTradeStations) financeActions.onBatchUpgradeTradeStations(_parseBatchSystemIds(button.dataset.systemIds));
      });
    });

    container.querySelectorAll('[data-action="market-batch-set-strategy"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onBatchSetTradeStationStrategy) financeActions.onBatchSetTradeStationStrategy(button.dataset.strategyId, _parseBatchSystemIds(button.dataset.systemIds));
      });
    });

  });
}

// ---------------------------------------------------------------------------
// 价格总览表（默认视图）
// ---------------------------------------------------------------------------

function _setMarketOverviewPriceMode(mode) {
  _marketOverviewPriceMode = mode === 'sell' ? 'sell' : 'buy';
}

function _syncMarketOverviewPriceModeControls() {
  ['buy', 'sell'].forEach(function (mode) {
    var button = document.getElementById('market-overview-price-' + mode);
    if (!button) return;
    var active = mode === _marketOverviewPriceMode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', active ? 'true' : 'false');
    button.setAttribute('tabindex', active ? '0' : '-1');
  });
}

function _bindMarketOverviewPriceMode(onChange) {
  var buttons = ['buy', 'sell'].map(function (mode) {
    return document.getElementById('market-overview-price-' + mode);
  }).filter(Boolean);

  function activatePriceMode(button) {
    _setMarketOverviewPriceMode(button.dataset.marketOverviewPriceMode);
    _syncMarketOverviewPriceModeControls();
    onChange();
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      activatePriceMode(button);
    });
    button.addEventListener('keydown', function (event) {
      _handleRovingControlKeydown(event, button, buttons, activatePriceMode);
    });
  });
}

// ---------------------------------------------------------------------------
// 星球详情（交易视图）
// ---------------------------------------------------------------------------

/**
 * 渲染单个星球的商品详情表格（含买入/卖出按钮）
 * @param {object}   state
 * @param {Function} onBuy          (good) => void
 * @param {Function} onSell         (good) => void
 * @param {Function} onRefuel       () => void
 * @param {string}   [viewingSystem] 查看的星球 ID（默认为当前星球）
 * @param {string}   [marketMode]   'open' | 'black'（默认 'open'）
 * @param {string}   [viewingGalaxy] 查看的星系 ID（用于交易图表）
 * @param {Function} [onBlackBuy]    黑市买入回调 (good) => void
 * @param {Function} [onBlackSell]   黑市卖出回调 (good) => void
 * @param {object}   [financeActions] 贷款、站点投资与商网动作回调
 */
export function render(state, onBuy, onSell, onRefuel, viewingSystem, marketMode, viewingGalaxy, onBlackBuy, onBlackSell, financeActions) {
  const sysId         = viewingSystem || state.currentSystem;
  const isCurrentSys  = sysId === state.currentSystem;
  const spotContainer = document.getElementById('market-spot-pane');
  const tradeGalaxyId = viewingGalaxy || state.currentGalaxy;

  // 非当前星球时显示只读提示
  // 黑市模式横幅
  var blackMarketUnlocked = Faction.canAccessBlackMarket(state, sysId);
  var systemFaction = Faction.getFactionForSystem(sysId);
  var requestedMarketMode = marketMode === 'black' ? 'black' : 'open';
  var effectiveMarketMode = requestedMarketMode === 'black' && blackMarketUnlocked ? 'black' : 'open';
  _activeMarketContext = { systemId: sysId, mode: effectiveMarketMode };
  const isBlack = effectiveMarketMode === 'black';
  var progression = _buildMarketProgression(state, sysId, {
    systemFaction: systemFaction,
    blackMarketUnlocked: blackMarketUnlocked,
  });
  _lastMarketProgression = progression;

  if (isBlack && _activeMarketSubworkspaceTabs.spot === 'trade') {
    _activeMarketSubworkspaceTabs.spot = 'black';
  } else if (!isBlack && _activeMarketSubworkspaceTabs.spot === 'black') {
    _activeMarketSubworkspaceTabs.spot = 'trade';
  }

  _ensureMarketWorkspaceState(progression);
  _renderMarketWorkspaceTabs(progression);
  _updateMarketDetailMode(state, sysId, isCurrentSys, effectiveMarketMode);

  // 根据市场模式筛选商品
  var goodsList = isBlack
    ? Economy.getBlackMarketGoods()
    : GOODS.filter(function (good) {
        return good.marketAccess && good.marketAccess.indexOf('open') !== -1;
      });
  var focusKey = sysId + ':' + effectiveMarketMode;
  if (!_marketChartRange[focusKey]) _marketChartRange[focusKey] = 14;
  var snapshots = _buildMarketSnapshots(state, sysId, goodsList, isBlack, _marketChartRange[focusKey]);
  var focusedGoodId = _focusedMarketGood[focusKey] || (snapshots[0] && snapshots[0].good.id);

  if (spotContainer) {
    spotContainer.innerHTML = _renderMarketSubworkspace('spot', {
      trade: _renderSpotTradeSection(),
      intel: _renderSpotIntelSection({
        state: state,
        systemId: sysId,
        snapshots: snapshots,
        marketMode: effectiveMarketMode,
        systemFaction: systemFaction,
        blackMarketUnlocked: blackMarketUnlocked,
        priceMode: _marketOverviewPriceMode,
      }),
      black: _renderBlackMarketSection({
        state: state,
        systemId: sysId,
        marketMode: effectiveMarketMode,
        systemFaction: systemFaction,
        blackMarketUnlocked: blackMarketUnlocked,
      }),
    }, progression);
    _bindMarketSubworkspaceTabs(spotContainer, progression);
  }

  function renderTradeOverview() {
    _renderOverviewTable(state, tradeGalaxyId, function (systemId) {
      showDetail(systemId, effectiveMarketMode);
      render(state, onBuy, onSell, onRefuel, systemId, effectiveMarketMode, tradeGalaxyId, onBlackBuy, onBlackSell, financeActions);
    }, {
      tableId: 'market-trade-overview-table',
      theadId: 'market-trade-overview-thead',
      tbodyId: 'market-trade-overview-tbody',
      statusId: 'market-overview-price-status',
    });
  }

  renderTradeOverview();
  _bindMarketOverviewPriceMode(renderTradeOverview);

  const goodsListEl = document.getElementById('market-goods-list');
  const goodsToolbarEl = document.getElementById('market-goods-toolbar');
  const analysisPanelEl = document.getElementById('market-analysis-panel');
  const quickTradeDockEl = document.getElementById('market-quick-trade-dock');
  if (!goodsListEl) return;
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
    quickTradeDockEl.querySelectorAll('[data-market-quick-action]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        if (button.disabled) return;
        var quickGood = goodsList.find(function (good) {
          return good.id === button.dataset.id;
        });
        if (!quickGood) return;
        if (button.dataset.marketQuickAction === 'sell') {
          var sellCallback = isBlack && onBlackSell ? onBlackSell : onSell;
          sellCallback(quickGood);
          return;
        }
        var buyCallback = isBlack && onBlackBuy ? onBlackBuy : onBuy;
        buyCallback(quickGood);
      });
    });
  }
  goodsListEl.innerHTML = '';
  _renderMarketDashboard(state, sysId, effectiveMarketMode, snapshots);
  _updateMainKlineChart(state, sysId, snapshots, effectiveMarketMode);

  // 市场深度提示
  var depth = Economy.getMarketDepth(sysId);
  var depthLabel = depth >= 350 ? '大型' : depth >= 200 ? '中型' : '小型';
  var depthDiv = document.createElement('div');
  if (isBlack) {
    depthDiv.className = 'market-goods-depth-info black-banner';
    depthDiv.innerHTML = '🕶 黑市交易 —— 高风险高回报，违禁品不受监管' +
      '<span class="bm-warning">⚠ 携带违禁品前往联邦区域将触发执法检查</span>';
  } else {
    depthDiv.className = 'market-goods-depth-info';
    depthDiv.innerHTML = '📊 可交易规模：<strong>' + depthLabel + '</strong> —— ' +
      (depth >= 350 ? '一次买卖较多货物，价格也不容易被推高或压低' : depth >= 200 ? '普通数量的买卖对价格影响适中' : '一次买卖太多，会明显改变当地价格') +
      (systemFaction && systemFaction.marketAccess && systemFaction.marketAccess.blackMarket
        ? (blackMarketUnlocked
          ? ' · 🕶 黑市资格已解锁'
          : ' · 🔒 黑市需与辛迪加达到友好关系')
        : '');
  }
  depthDiv.setAttribute('role', 'listitem');
  goodsListEl.appendChild(depthDiv);

  if (!isCurrentSys) {
    var noteDiv = document.createElement('div');
    var currentSystem = findSystem(state.currentSystem);
    var viewedSystem = findSystem(sysId);
    var currentName = currentSystem ? currentSystem.name : '当前停靠点';
    var viewedName = viewedSystem ? viewedSystem.name : '该地点';
    var canFocusRemote = financeActions && typeof financeActions.onFocusRemoteSystem === 'function';
    noteDiv.className = 'market-goods-readonly-note';
    noteDiv.setAttribute('role', 'listitem');
    noteDiv.innerHTML = '<span class="readonly-icon">📡</span>' +
      '<span class="market-goods-readonly-copy"><strong>远程只读</strong> · 当前停靠「' + _escapeHtml(currentName) + '」，前往「' + _escapeHtml(viewedName) + '」后可交易、补给和本地经营。</span>' +
      (canFocusRemote
        ? '<button class="market-goods-readonly-action command-action-btn" type="button" data-action="market-focus-remote-system" data-system-id="' + _escapeHtmlAttr(sysId) + '">设为航点</button>'
        : '');
    if (canFocusRemote) {
      var focusRemoteBtn = noteDiv.querySelector('[data-action="market-focus-remote-system"]');
      if (focusRemoteBtn) {
        focusRemoteBtn.addEventListener('click', function (event) {
          event.stopPropagation();
          financeActions.onFocusRemoteSystem(focusRemoteBtn.dataset.systemId);
        });
      }
    }
    goodsListEl.appendChild(noteDiv);
  }

  var activeGoodId = focusedGoodId;
  if (activeGoodId) {
    _focusedMarketGood[focusKey] = activeGoodId;
    ContextInspector.replaceContext({
      type: 'commodity',
      id: activeGoodId,
      workspaceId: 'trade',
      source: 'market-workspace',
      revision: ContextInspector.getCurrentRevision(),
    }, { render: false });
  }

  goodsList.forEach(function (good) {
    var buyPrice, sellPrice;
    if (isBlack) {
      buyPrice  = Economy.getBlackMarketBuyPrice(sysId, good.id, state);
      sellPrice = Economy.getBlackMarketSellPrice(sysId, good.id, state);
    } else {
      buyPrice  = Economy.getBuyPrice(sysId, good.id, state);
      sellPrice = Economy.getSellPrice(sysId, good.id, state);
    }
    var inCargo     = state.cargo[good.id] || 0;
    var mult        = Economy.getSystemMultiplier(sysId, good.id);
    var sd          = Economy.getSupplyDemand(sysId, good.id);
    var isCheap     = mult < 0.7;
    var isExpensive = mult > 1.4;

    // Sparkline
    var history = Economy.getPriceHistory(sysId, good.id);
    var chartHistory = _normalizeChartHistory(history, sellPrice, 8);
    var chartDelta = _formatChartDelta(chartHistory);
    var spread = Math.max(0, buyPrice - sellPrice);
    var opportunity = _describeTradeOpportunity(sysId, {
      good: good,
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      spread: spread,
      supplyDemand: sd,
    }, inCargo);
    var miniChart = _renderMarketChart(chartHistory, sellPrice, good.name, {
      width: 72, height: 40, topPad: 4, chartBottom: 28, volumeBase: 36, className: 'market-good-card-chart',
    });

    // Tags
    var tag = '';
    if (good.legality === 'illegal') {
      tag = '<span class="market-good-tag tag-illegal">违禁</span>';
    } else if (good.legality === 'restricted') {
      tag = '<span class="market-good-tag tag-restricted">受监管</span>';
    } else if (sd.ratio > 1.3) {
      tag = '<span class="market-good-tag tag-hot">高需求</span>';
    } else if (sd.ratio < 0.7) {
      tag = '<span class="market-good-tag tag-cold">充足</span>';
    }

    // Heat color for icon bg
    var heatMeta = _getMarketHeatMeta(mult);
    var iconColorClass = heatMeta.className.replace('mkt-ov-', 'icon-');

    var card = document.createElement('div');
    card.className = 'market-good-card' +
      (activeGoodId === good.id ? ' is-active' : '') +
      (isCheap ? ' price-low-card' : '') +
      (isExpensive ? ' price-high-card' : '');
    card.dataset.marketGood = good.id;
    card.dataset.legality = good.legality || 'legal';
    card.dataset.signal = opportunity.className;
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', good.name + '，买入 ' + buyPrice + '，卖出 ' + sellPrice + '，' + opportunity.label);

    card.innerHTML =
      '<div class="market-good-card-icon ' + iconColorClass + '">' + good.emoji + '</div>' +
      '<div class="market-good-card-info">' +
        '<div class="market-good-card-name">' + good.name + tag + '</div>' +
        '<div class="market-good-card-desc">' + good.desc +
          (inCargo > 0 ? ' · <span class="market-good-card-held">×' + inCargo + '</span>' : '') +
        '</div>' +
        '<div class="market-good-card-meta-row">' +
          '<span class="market-good-card-signal ' + opportunity.className + '">' + opportunity.label + '</span>' +
          '<span class="market-good-card-stat">' + (sd.ratio > 1.3 ? '供货紧张' : (sd.ratio < 0.7 ? '供货充足' : '供货平稳')) + '</span>' +
          '<span class="market-good-card-stat">买卖相差 ' + spread.toLocaleString() + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="market-good-card-chart-col">' +
        '<div class="market-good-card-chart-label">最近价格</div>' +
        miniChart +
      '</div>' +
      '<div class="market-good-card-price-block">' +
        '<div class="market-good-card-price-row">' +
          '<span class="market-good-card-price">' + buyPrice.toLocaleString() + '</span>' +
          '<span class="market-good-card-unit">CR</span>' +
        '</div>' +
        '<div class="market-good-card-secondary">卖出 ' + sellPrice.toLocaleString() + ' · ' + heatMeta.label + '</div>' +
        '<div class="market-good-card-delta ' + chartDelta.className.replace('market-chart-', '') + '">' +
          chartDelta.text + ' △' +
        '</div>' +
      '</div>' +
      '<div class="market-good-card-actions">' +
        (isCurrentSys && inCargo > 0
          ? '<button class="market-card-btn sell-card-btn' + (isBlack ? ' bm-card-btn' : '') + '" type="button" data-id="' + good.id + '">' + (isBlack ? '🕶 卖' : '出售') + '</button>'
          : '') +
        (isCurrentSys
          ? '<button class="market-card-btn buy-card-btn' + (isBlack ? ' bm-card-btn' : '') + '" type="button" data-id="' + good.id + '">' + (isBlack ? '🕶 买' : '买入') + '</button>'
          : '') +
      '</div>';

    // Bind events
    if (isCurrentSys) {
      var buyCallback = isBlack && onBlackBuy ? onBlackBuy : onBuy;
      var sellCallback = isBlack && onBlackSell ? onBlackSell : onSell;
      var buyBtn = card.querySelector('.buy-card-btn');
      if (buyBtn) buyBtn.addEventListener('click', function (e) { e.stopPropagation(); buyCallback(good); });
      var sellBtn = card.querySelector('.sell-card-btn');
      if (sellBtn) sellBtn.addEventListener('click', function (e) { e.stopPropagation(); sellCallback(good); });
    }
    card.addEventListener('click', function () {
      _focusedMarketGood[focusKey] = good.id;
      ContextInspector.replaceContext({
        type: 'commodity',
        id: good.id,
        workspaceId: 'trade',
        source: 'market-good-card',
        revision: ContextInspector.getCurrentRevision(),
      });
      render(state, onBuy, onSell, onRefuel, viewingSystem, effectiveMarketMode, tradeGalaxyId, onBlackBuy, onBlackSell, financeActions);
    });
    card.addEventListener('keydown', function (event) {
      if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      _focusedMarketGood[focusKey] = good.id;
      ContextInspector.replaceContext({
        type: 'commodity',
        id: good.id,
        workspaceId: 'trade',
        source: 'market-good-card',
        revision: ContextInspector.getCurrentRevision(),
      });
      render(state, onBuy, onSell, onRefuel, viewingSystem, effectiveMarketMode, tradeGalaxyId, onBlackBuy, onBlackSell, financeActions);
    });
    goodsListEl.appendChild(card);
  });

  // 补燃料（仅当前星球）
  if (isCurrentSys) {
    var fuelNeeded = Math.ceil(state.maxFuel - state.fuel);
    if (fuelNeeded > 0) {
      var refuelDiv = document.createElement('div');
      refuelDiv.className = 'market-goods-refuel';
      refuelDiv.setAttribute('role', 'listitem');
      refuelDiv.innerHTML = '<button id="refuel-btn" class="btn-refuel">⚡ 补充燃料（' + fuelNeeded + ' 单位）</button>';
      refuelDiv.querySelector('#refuel-btn').addEventListener('click', onRefuel);
      goodsListEl.appendChild(refuelDiv);
    }
  }

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

  _renderFinancePanels(state, sysId, isCurrentSys, financeActions, progression);
  _applyMarketWorkspaceTabState(progression);
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
