// js/ui/MarketUI.js — 商业终端（价格总览 + 节点工作台双模式）
// 依赖：data/goods.js, data/systems.js, systems/economy/Economy.js
// 导出：renderOverview, render (detail), showOverview, showDetail

import { GOODS }    from '../data/goods.js';
import { getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';
import { getCompanyAccessState, getCompanyLevelValue, getCompanyPrivilegeSummary } from '../data/companyAccess.js';
import * as Economy from '../systems/economy/Economy.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as Commerce from '../systems/commerce/CommerceFacade.js';
import * as ContextInspector from './ContextInspector.js';
import {
  buildMarketSnapshots as _buildMarketSnapshots,
  renderMarketChartDashboard,
  updateMainMarketKlineChart,
} from './MarketChartPresenter.js';
import {
  formatMarketHeatDelta as _formatMarketHeatDelta,
  getMarketHeatMeta as _getMarketHeatMeta,
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

export { getTradeStationCandidateIntel };

const _focusedMarketGood = Object.create(null);
let _activeMarketContext = null;
const _marketChartRange = Object.create(null);
let _marketBatchPlanSortModes = {
  investment: 'yield',
  upgrade: 'income',
  strategy: 'income',
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
  var operationsWorkspace = _renderMarketOperationsWorkspace({
    state: state,
    systemId: viewingSystem,
    isCurrentSystem: isCurrentSys,
    commerceSnapshot: commerceSnapshot,
    sortModes: _marketBatchPlanSortModes,
  });

  capitalContainer.innerHTML = capitalWorkspace.overviewHtml +
    '<div class="market-workspace-board market-capital-board">' + _renderMarketSubworkspace('capital', {
      local: capitalWorkspace.localHtml,
    }, progression) + '</div>';
  operationsContainer.innerHTML = operationsWorkspace.overviewHtml +
    '<div class="market-workspace-board market-operations-board">' +
      _renderMarketSubworkspace('operations', operationsWorkspace.sections, progression) +
    '</div>';

  [capitalContainer, operationsContainer].forEach(function (container) {
    if (!container) return;

    _bindMarketSubworkspaceTabs(container, progression);

    container.querySelectorAll('[data-action="market-batch-set-sort"]').forEach(function (button) {
      button.addEventListener('click', function () {
        _marketBatchPlanSortModes = _updateMarketOperationsSortModes(
          _marketBatchPlanSortModes,
          button.dataset.batchSortScope,
          button.dataset.batchSortMode
        );
        _renderFinancePanels(state, viewingSystem, isCurrentSys, financeActions, progression);
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
  _renderMarketDashboard(state, sysId, effectiveMarketMode, snapshots);
  _updateMainKlineChart(state, sysId, snapshots, effectiveMarketMode);

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

  var goodsWorkspace = _renderMarketGoodsWorkspace({
    state: state,
    systemId: sysId,
    marketMode: effectiveMarketMode,
    isCurrentSystem: isCurrentSys,
    snapshots: snapshots,
    focusedGoodId: activeGoodId,
    systemFaction: systemFaction,
    blackMarketUnlocked: blackMarketUnlocked,
    canFocusRemote: financeActions && typeof financeActions.onFocusRemoteSystem === 'function',
  });
  goodsListEl.innerHTML = goodsWorkspace.html;

  function findRenderedGood(goodId) {
    return goodsList.find(function (good) { return good.id === goodId; }) || null;
  }

  function focusRenderedGood(goodId) {
    var good = findRenderedGood(goodId);
    if (!good) return;
    _focusedMarketGood[focusKey] = good.id;
    ContextInspector.replaceContext({
      type: 'commodity',
      id: good.id,
      workspaceId: 'trade',
      source: 'market-good-card',
      revision: ContextInspector.getCurrentRevision(),
    });
    render(state, onBuy, onSell, onRefuel, sysId, effectiveMarketMode, tradeGalaxyId, onBlackBuy, onBlackSell, financeActions);
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
      if (financeActions && typeof financeActions.onFocusRemoteSystem === 'function') {
        financeActions.onFocusRemoteSystem(command.systemId);
      }
      return;
    }
    if (command.type === 'refuel') {
      if (typeof onRefuel === 'function') onRefuel();
      return;
    }

    var good = findRenderedGood(command.goodId);
    if (!good) return;
    if (command.type === 'sell-good') {
      var sellCallback = isBlack && onBlackSell ? onBlackSell : onSell;
      if (typeof sellCallback === 'function') sellCallback(good);
      return;
    }
    if (command.type === 'buy-good') {
      var buyCallback = isBlack && onBlackBuy ? onBlackBuy : onBuy;
      if (typeof buyCallback === 'function') buyCallback(good);
    }
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
