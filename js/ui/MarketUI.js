// js/ui/MarketUI.js — 商业终端（价格总览 + 节点工作台双模式）
// 依赖：data/goods.js, data/systems.js, systems/economy/Economy.js
// 导出：renderOverview, render (detail), showOverview, showDetail

import { GOODS }    from '../data/goods.js';
import {
  TRADE_STATION_MANAGERS,
  TRADE_STATION_STRATEGIES,
} from '../data/tradeStations.js';
import { getSystemsByGalaxy, findSystem, isSystemAccessible } from '../data/systems.js';
import { getCompanyAccessState, getCompanyLevelValue, getCompanyPrivilegeSummary } from '../data/companyAccess.js';
import * as Economy from '../systems/economy/Economy.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as Commerce from '../systems/commerce/CommerceFacade.js';
import * as Finance from '../systems/finance/FinanceSystem.js';
import * as Futures from '../systems/finance/FuturesSystem.js';
import * as TradeStation from '../systems/trade/TradeStationSystem.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';

const _focusedMarketGood = Object.create(null);
const _marketChartRange = Object.create(null);
const _marketBatchPlanSortModes = {
  investment: 'yield',
  upgrade: 'income',
  manager: 'income',
  strategy: 'income',
};
const MARKET_BATCH_PLAN_SORT_OPTIONS = {
  investment: [
    { id: 'yield', label: '回报优先' },
    { id: 'stake', label: '低基数优先' },
    { id: 'name', label: '节点名' },
  ],
  upgrade: [
    { id: 'income', label: '收益优先' },
    { id: 'cost', label: '低成本优先' },
    { id: 'name', label: '节点名' },
  ],
  manager: [
    { id: 'income', label: '收益优先' },
    { id: 'level', label: '等级优先' },
    { id: 'name', label: '节点名' },
  ],
  strategy: [
    { id: 'income', label: '收益优先' },
    { id: 'name', label: '节点名' },
  ],
};
const MARKET_RANGE_OPTIONS = [7, 14, 30];
const MARKET_WORKSPACE_TABS = [
  { id: 'spot', label: '现货', hint: '买卖与补给', stage: '01' },
  { id: 'capital', label: '资本', hint: '融资与仓位', stage: '03' },
  { id: 'operations', label: '商网', hint: '站点与经营', stage: '05' },
];
const MARKET_SUBWORKSPACE_TABS = {
  spot: [
    { id: 'trade', label: '交易', hint: '执行买卖与补给' },
    { id: 'intel', label: '行情', hint: '价格与勘探线索' },
    { id: 'black', label: '黑市', hint: '特殊市场与风险' },
  ],
  capital: [
    { id: 'local', label: '调度', hint: '贷款、保险、本地投资' },
    { id: 'stocks', label: '股票', hint: '指数与持仓' },
    { id: 'futures', label: '期货', hint: '合约与持仓' },
  ],
  operations: [
    { id: 'local', label: '本地', hint: '当前节点经营' },
    { id: 'network', label: '总览', hint: '网络快照与指标' },
    { id: 'stations', label: '站点', hint: '候选与已建站点' },
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

function _countStockHoldings(state) {
  if (!state || !state.stockPortfolio || typeof state.stockPortfolio !== 'object') return 0;
  return Object.keys(state.stockPortfolio).filter(function (stockId) {
    var holding = state.stockPortfolio[stockId];
    return holding && (holding.shares || 0) > 0;
  }).length;
}

function _countOpenFutures(state) {
  return (state && Array.isArray(state.futuresContracts) ? state.futuresContracts : []).filter(function (contract) {
    return contract && contract.status === 'open';
  }).length;
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
  var activePolicies = (state && Array.isArray(state.insurancePolicies) ? state.insurancePolicies : []).some(function (policy) {
    return policy && policy.active;
  });
  return activeLoans || activePolicies || _countStockHoldings(state) > 0 || _countOpenFutures(state) > 0 || _hasTradeInvestment(state);
}

function _getSurveyIntelFlag(state, sysId) {
  try {
    var surveyIntel = Exploration.getSurveyDecisionIntel(state || {}, sysId);
    return !!(surveyIntel && surveyIntel.hasIntel);
  } catch (err) {
    return false;
  }
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
  var stockHoldingCount = _countStockHoldings(safeState);
  var openFuturesCount = _countOpenFutures(safeState);
  var playerLevel = Math.max(1, Number(safeState.playerLevel) || 1);
  var companyLevel = getCompanyLevelValue(safeState);
  var companyPrivileges = getCompanyPrivilegeSummary(safeState);
  var day = Math.max(1, Number(safeState.day) || 1);
  var credits = Math.max(0, Number(safeState.credits) || 0);
  var hasCapitalFootprint = _hasCapitalFootprint(safeState);
  var hasOperationsFootprint = stationCount > 0 || _hasTradeInvestment(safeState);
  var hasSurveyIntel = _getSurveyIntelFlag(safeState, sysId);

  return {
    playerLevel: playerLevel,
    companyLevel: companyLevel,
    day: day,
    credits: credits,
    visitedCount: Math.max(visitedSystems.length, safeState.currentSystem ? 1 : 0),
    stationCount: stationCount,
    companyPrivileges: companyPrivileges,
    stockHoldingCount: stockHoldingCount,
    openFuturesCount: openFuturesCount,
    hasCapitalFootprint: hasCapitalFootprint,
    hasOperationsFootprint: hasOperationsFootprint,
    hasSurveyIntel: hasSurveyIntel,
    hasBlackMarket: !!(systemFaction && systemFaction.marketAccess && systemFaction.marketAccess.blackMarket),
    blackMarketUnlocked: !!blackMarketUnlocked,
  };
}

function _buildCompanyUnlockPath(access, extraCondition) {
  if (!access || access.unlocked) return '';
  var text = '当前公司 Lv.' + access.currentLevel + ' / 需要 Lv.' + access.requiredLevel + '。';
  if (extraCondition) text += extraCondition + ' ';
  return text + '最近获得公司经验：完成手动交易、任务结算、舰队派遣和贸易站投资。';
}

function _buildMarketProgression(state, sysId, options) {
  var stats = _getMarketExperienceStats(state, sysId, options);
  var capitalAccess = getCompanyAccessState(state, 'capitalLocal');
  var stocksAccess = getCompanyAccessState(state, 'stocks');
  var futuresAccess = getCompanyAccessState(state, 'futures');
  var tradeStationBuildAccess = getCompanyAccessState(state, 'tradeStationBuild');
  var operationsNetworkAccess = getCompanyAccessState(state, 'operationsNetwork');
  var capitalLocalUnlocked = capitalAccess.unlocked || stats.hasCapitalFootprint;
  var stocksUnlocked = stocksAccess.unlocked || stats.stockHoldingCount > 0;
  var futuresUnlocked = futuresAccess.unlocked || stats.openFuturesCount > 0;
  var operationsLocalUnlocked = capitalAccess.unlocked || stats.hasOperationsFootprint;
  var operationsNetworkUnlocked = stats.stationCount > 0 && operationsNetworkAccess.unlocked;
  var operationsStationsUnlocked = tradeStationBuildAccess.unlocked || stats.stationCount > 0;
  var capitalUnlocked = capitalLocalUnlocked || stocksUnlocked || futuresUnlocked;
  var operationsUnlocked = operationsLocalUnlocked || operationsNetworkUnlocked || operationsStationsUnlocked;
  var blackUnlockLabel = stats.hasBlackMarket ? '需辛迪加友好关系' : '需找到黑市辖区';
  var capitalLockDetail = _buildCompanyUnlockPath(capitalAccess);
  var stocksLockDetail = _buildCompanyUnlockPath(stocksAccess);
  var futuresLockDetail = _buildCompanyUnlockPath(futuresAccess);
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
        intel: { unlocked: true, stateLabel: stats.hasSurveyIntel ? '有报告' : '已开放', unlockLabel: '默认开放' },
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
        stocks: {
          unlocked: stocksUnlocked,
          stateLabel: stocksUnlocked ? '已开放' : '锁定',
          unlockLabel: stocksAccess.lockLabel,
          lockDetail: stocksLockDetail,
        },
        futures: {
          unlocked: futuresUnlocked,
          stateLabel: futuresUnlocked ? '已开放' : '锁定',
          unlockLabel: futuresAccess.lockLabel,
          lockDetail: futuresLockDetail,
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
        label: '现货成交',
        note: '买卖、补给、看当前货舱',
        workspaceId: 'spot',
        subworkspaceId: 'trade',
        unlocked: true,
      },
      {
        id: 'intel',
        index: '02',
        label: '行情判断',
        note: '价格矩阵、波动榜、勘探报告',
        workspaceId: 'spot',
        subworkspaceId: 'intel',
        unlocked: true,
      },
      {
        id: 'capital',
        index: '03',
        label: '资本调度',
        note: '贷款、保险、本地投资',
        workspaceId: 'capital',
        subworkspaceId: 'local',
        unlocked: capitalLocalUnlocked,
        unlockLabel: capitalAccess.lockLabel,
        lockDetail: capitalLockDetail,
      },
      {
        id: 'positions',
        index: '04',
        label: '长期仓位',
        note: '股票与期货分开开放',
        workspaceId: 'capital',
        subworkspaceId: stocksUnlocked ? 'stocks' : 'futures',
        unlocked: stocksUnlocked || futuresUnlocked,
        unlockLabel: stocksAccess.lockLabel + '，' + futuresAccess.lockLabel + '开放期货',
        lockDetail: (stocksUnlocked ? futuresLockDetail : stocksLockDetail),
      },
      {
        id: 'network',
        index: '05',
        label: '商网经营',
        note: '建站、升级、全网编排',
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
    chainId: typeof focus.chainId === 'string' ? focus.chainId.trim() : '',
    chainKind: typeof focus.chainKind === 'string' ? focus.chainKind.trim() : '',
    chainLabel: typeof focus.chainLabel === 'string' ? focus.chainLabel.trim() : '',
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
  document.querySelectorAll('.market-survey-chain-row--guide-focus').forEach(function (row) {
    row.classList.remove('market-survey-chain-row--guide-focus');
    if (row.removeAttribute) row.removeAttribute('data-guide-focus');
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

function _revealSurveyChainFocus(chainId) {
  if (!_hasDocument() || !chainId || !document.querySelector) return false;

  _clearMarketGuideFocus();

  var row = document.querySelector('[data-market-survey-chain-id="' + _escapeSelectorValue(chainId) + '"]');
  if (!row) return false;

  row.classList.add('market-survey-chain-row--guide-focus');
  if (row.setAttribute) row.setAttribute('data-guide-focus', 'true');
  if (typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }
  return true;
}

export function revealSurveyChainFocus(chainId) {
  return _revealSurveyChainFocus(chainId);
}

export function setFocusedMarketGood(sysId, marketMode, goodId) {
  var normalizedGoodId = typeof goodId === 'string' ? goodId.trim() : '';
  var focusKey = _getMarketFocusKey(sysId, marketMode);
  if (!focusKey || !normalizedGoodId) return false;

  _focusedMarketGood[focusKey] = normalizedGoodId;
  return true;
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
    _renderMarketExperienceRoute(_lastMarketProgression);
    if (normalized.goodId) {
      _revealMarketGoodFocus(normalized.goodId, { tradeAction: normalized.tradeAction });
    } else if (normalized.chainId) {
      _revealSurveyChainFocus(normalized.chainId);
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
    _renderMarketExperienceRoute(progression);
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
    _renderMarketExperienceRoute(progression);
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

function _isMarketRouteStageActive(stage) {
  if (!stage) return false;
  if (stage.workspaceId !== _activeMarketWorkspaceTab) return false;
  if (!stage.subworkspaceId) return true;
  return _activeMarketSubworkspaceTabs[stage.workspaceId] === stage.subworkspaceId;
}

function _renderMarketExperienceRoute(progression) {
  if (!_hasDocument()) return;

  var routeEl = document.getElementById('market-experience-route');
  if (!routeEl || !progression || !Array.isArray(progression.routeStages)) return;

  var stats = progression.stats || {};
  var privileges = stats.companyPrivileges || {};
  var caps = privileges.caps || {};
  var stationCapacity = caps.tradeStations || {};
  var stationLevel = caps.tradeStationLevel || {};
  var fleetSlots = caps.fleetSlots || {};
  var privilegeNote = '贸易站 ' + (stationCapacity.label || ((stats.stationCount || 0) + ' 座')) +
    ' · 站点上限 ' + (stationLevel.label || '未开放') +
    ' · 舰队席位 ' + (fleetSlots.used || 1) + '/' + (fleetSlots.max || 1);
  routeEl.innerHTML = '<section class="market-experience-route" aria-label="市场体验线路">' +
    '<div class="market-experience-route-copy">' +
      '<div class="market-experience-route-kicker">MARKET FLOW</div>' +
      '<div class="market-experience-route-title">先成交，再扩张</div>' +
      '<div class="market-experience-route-note">公司 Lv.' + _escapeHtml(stats.companyLevel || 1) + ' · 玩家 Lv.' + _escapeHtml(stats.playerLevel || 1) + ' · 已访问 ' + _escapeHtml(stats.visitedCount || 1) + ' 站</div>' +
      '<div class="market-experience-route-note">' + _escapeHtml(privilegeNote) + '</div>' +
    '</div>' +
    '<div class="market-experience-route-steps">' +
      progression.routeStages.map(function (stage) {
        var locked = stage.unlocked === false;
        var active = _isMarketRouteStageActive(stage);
        var stageTitle = locked ? (stage.lockDetail || stage.unlockLabel || '继续推进贸易路线') : stage.note;
        return '<button class="market-experience-step' + (active ? ' active' : '') + (locked ? ' is-locked' : '') + '" type="button" title="' + _escapeHtmlAttr(stageTitle || '') + '" data-market-route-workspace="' + _escapeHtmlAttr(stage.workspaceId) + '" data-market-route-subworkspace="' + _escapeHtmlAttr(stage.subworkspaceId || '') + '" data-market-locked="' + (locked ? 'true' : 'false') + '"' + (locked ? ' disabled aria-disabled="true"' : '') + '>' +
          '<span class="market-experience-step-index">' + _escapeHtml(stage.index) + '</span>' +
          '<span class="market-experience-step-copy">' +
            '<span class="market-experience-step-label">' + _escapeHtml(stage.label) + '</span>' +
            '<span class="market-experience-step-note">' + _escapeHtml(locked ? (stage.unlockLabel || '继续推进贸易路线') : stage.note) + '</span>' +
          '</span>' +
        '</button>';
      }).join('') +
    '</div>' +
  '</section>';

  routeEl.querySelectorAll('[data-market-route-workspace]').forEach(function (button) {
    button.addEventListener('click', function () {
      if (button.disabled || button.dataset.marketLocked === 'true') return;
      var workspaceId = button.dataset.marketRouteWorkspace || 'spot';
      var subworkspaceId = button.dataset.marketRouteSubworkspace || '';
      _activeMarketWorkspaceTab = workspaceId;
      if (subworkspaceId) _activeMarketSubworkspaceTabs[workspaceId] = subworkspaceId;
      _applyMarketWorkspaceTabState(progression);
      _applyMarketSubworkspaceTabState(document.getElementById('market-' + workspaceId + '-pane'), workspaceId, progression);
      _renderMarketExperienceRoute(progression);
    });
  });
}

function _pickSnapshot(snapshots, comparator) {
  if (!snapshots || snapshots.length === 0) return null;
  return snapshots.slice().sort(comparator)[0] || null;
}

function _getMarketHeatMeta(multiplier) {
  if (multiplier < 0.65) {
    return { className: 'mkt-ov-price-freeze', label: '冰点价', note: '强烈低估，适合买入' };
  }
  if (multiplier < 0.85) {
    return { className: 'mkt-ov-price-cool', label: '低位区', note: '价格偏低，可考虑建仓' };
  }
  if (multiplier <= 1.15) {
    return { className: 'mkt-ov-price-neutral', label: '均衡区', note: '价格接近常态' };
  }
  if (multiplier <= 1.45) {
    return { className: 'mkt-ov-price-warm', label: '溢价区', note: '价格偏高，适合观察卖点' };
  }
  return { className: 'mkt-ov-price-hot', label: '过热区', note: '价格显著偏高，适合出货' };
}

function _formatMarketHeatDelta(multiplier) {
  var deltaPct = Math.round((multiplier - 1) * 100);
  if (deltaPct > 0) {
    return { text: '▲' + deltaPct + '%', className: 'up' };
  }
  if (deltaPct < 0) {
    return { text: '▼' + Math.abs(deltaPct) + '%', className: 'down' };
  }
  return { text: '•0%', className: 'flat' };
}

function _renderSpotTradeSection() {
  return '<div id="market-quick-trade-dock" class="market-quick-trade-dock" role="status" aria-label="快速交易焦点" aria-live="polite"></div>' +
    '<div id="market-spot-command-deck" class="market-spot-command-deck" role="region" aria-label="现货交易摘要"></div>' +
    '<div class="market-spot-trade-layout" role="region" aria-label="现货交易工作台">' +
      '<div class="market-spot-main-col">' +
        '<div class="market-trade-board" role="region" aria-label="价格走势与商品列表">' +
          '<section class="market-goods-shell" aria-label="商品交易列表">' +
            '<div id="market-goods-toolbar" class="market-goods-toolbar"></div>' +
            '<div id="market-goods-list" class="market-goods-list" role="list"></div>' +
          '</section>' +
          '<div id="market-kline-panel" class="market-kline-panel" role="region" aria-label="价格走势">' +
            '<div class="market-kline-header">' +
              '<div class="market-kline-title" id="market-kline-title"></div>' +
              '<div class="market-kline-range-bar" id="market-kline-range-bar"></div>' +
            '</div>' +
            '<div class="market-kline-ohlc" id="market-kline-ohlc"></div>' +
            '<div class="market-kline-body" id="market-kline-body"></div>' +
            '<div class="market-kline-footer">' +
              '<div class="market-kline-metrics" id="market-kline-metrics"></div>' +
            '</div>' +
          '</div>' +
          '<div class="market-intel-drawers" role="region" aria-label="市场辅助情报">' +
            '<details class="market-collapse market-collapse-chart">' +
              '<summary>🗺 星系价格矩阵 <span class="market-collapse-hint">切到热力图看整张星区价差</span></summary>' +
              '<div class="market-collapse-body">' +
                '<div class="market-heatmap-toolbar">' +
                  '<div class="market-heatmap-legend" aria-label="交易热力图图例">' +
                    '<span class="market-heatmap-legend-item freeze">冰点价</span>' +
                    '<span class="market-heatmap-legend-item cool">低位区</span>' +
                    '<span class="market-heatmap-legend-item neutral">均衡区</span>' +
                    '<span class="market-heatmap-legend-item warm">溢价区</span>' +
                    '<span class="market-heatmap-legend-item hot">过热区</span>' +
                  '</div>' +
                  '<div class="market-price-view" aria-label="价格矩阵口径">' +
                    '<span id="market-price-view-label" class="market-price-view-label">价格口径</span>' +
                    '<div class="market-price-mode" role="radiogroup" aria-labelledby="market-price-view-label">' +
                      '<button id="market-overview-price-buy" class="market-price-mode-btn' + (_marketOverviewPriceMode === 'buy' ? ' is-active' : '') + '" type="button" role="radio" aria-checked="' + (_marketOverviewPriceMode === 'buy' ? 'true' : 'false') + '" aria-controls="market-trade-overview-table" tabindex="' + (_marketOverviewPriceMode === 'buy' ? '0' : '-1') + '" data-market-overview-price-mode="buy">买入价</button>' +
                      '<button id="market-overview-price-sell" class="market-price-mode-btn' + (_marketOverviewPriceMode === 'sell' ? ' is-active' : '') + '" type="button" role="radio" aria-checked="' + (_marketOverviewPriceMode === 'sell' ? 'true' : 'false') + '" aria-controls="market-trade-overview-table" tabindex="' + (_marketOverviewPriceMode === 'sell' ? '0' : '-1') + '" data-market-overview-price-mode="sell">卖出价</button>' +
                    '</div>' +
                    '<span id="market-overview-price-status" class="market-price-view-status" role="status" aria-live="polite">矩阵显示各节点的' + (_marketOverviewPriceMode === 'sell' ? '卖出价' : '买入价') + '</span>' +
                  '</div>' +
                '</div>' +
                '<div class="market-trade-overview-scroll">' +
                  '<table id="market-trade-overview-table" aria-describedby="market-overview-price-status">' +
                    '<thead id="market-trade-overview-thead"></thead>' +
                    '<tbody id="market-trade-overview-tbody"></tbody>' +
                  '</table>' +
                '</div>' +
              '</div>' +
            '</details>' +
            '<details class="market-collapse market-collapse-chart">' +
              '<summary>📈 行情仪表盘 <span class="market-collapse-hint">切到涨跌榜和波动榜复核方向</span></summary>' +
              '<div class="market-collapse-body">' +
                '<div id="market-terminal-dashboard" class="market-terminal-dashboard"></div>' +
              '</div>' +
            '</details>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<aside id="market-analysis-panel" class="market-analysis-panel" aria-label="市场行动摘要"></aside>' +
    '</div>';
}

function _getFocusedMarketSnapshot(sysId, marketMode, snapshots) {
  if (!snapshots || snapshots.length === 0) return null;

  var focusKey = sysId + ':' + (marketMode || 'open');
  var focusedGoodId = _focusedMarketGood[focusKey];
  return snapshots.find(function (entry) {
    return entry.good.id === focusedGoodId;
  }) || snapshots[0] || null;
}

function _describeTradeOpportunity(sysId, snapshot, heldQuantity) {
  if (!snapshot) {
    return { label: '均衡看盘', note: '当前没有足够数据形成交易信号。', className: 'balance' };
  }

  var multiplier = Economy.getSystemMultiplier(sysId, snapshot.good.id);
  var demandRatio = snapshot.supplyDemand && snapshot.supplyDemand.ratio
    ? snapshot.supplyDemand.ratio
    : 1;
  var spread = snapshot.spread || 0;
  var safeHeldQuantity = heldQuantity || 0;

  if (multiplier <= 0.82 && demandRatio >= 0.95) {
    return { label: '低位建仓', note: '价格处在折价区，适合分批吸纳后等待需求回流。', className: 'accumulate' };
  }
  if (multiplier >= 1.18 && safeHeldQuantity > 0) {
    return { label: '适合出货', note: '已有库存可兑现溢价，优先锁定利润而不是继续加仓。', className: 'distribute' };
  }
  if (demandRatio >= 1.35) {
    return { label: '需求拉升', note: '需求强于供给，短线波动会被放大，适合盯紧价格节奏。', className: 'surge' };
  }
  if (spread >= Math.max(12, Math.round((snapshot.sellPrice || 0) * 0.12))) {
    return { label: '利差观察', note: '买卖差较大，先看波动和承接，再决定是否介入。', className: 'watch' };
  }
  return { label: '均衡看盘', note: '价格和供需暂时平衡，更适合观察而不是重仓出手。', className: 'balance' };
}

function _renderSpotCommandDeck(state, sysId, snapshots, marketMode, isCurrentSys, systemFaction, blackMarketUnlocked) {
  if (!snapshots || snapshots.length === 0) return '';

  var focused = _getFocusedMarketSnapshot(sysId, marketMode, snapshots);
  var system = findSystem(sysId);
  var cargoUsed = Object.values(state.cargo || {}).reduce(function (sum, quantity) {
    return sum + quantity;
  }, 0);
  var cargoMax = state.maxCargo || 100;
  var marketDepth = Economy.getMarketDepth(sysId);
  var discounted = snapshots.slice().sort(function (a, b) {
    return Economy.getSystemMultiplier(sysId, a.good.id) - Economy.getSystemMultiplier(sysId, b.good.id);
  })[0] || focused;
  var widestSpread = snapshots.slice().sort(function (a, b) {
    return (b.spread || 0) - (a.spread || 0);
  })[0] || focused;
  var strongestDemand = snapshots.slice().sort(function (a, b) {
    return (b.supplyDemand ? b.supplyDemand.ratio : 1) - (a.supplyDemand ? a.supplyDemand.ratio : 1);
  })[0] || focused;
  var focusSignal = _describeTradeOpportunity(sysId, focused, state.cargo[focused.good.id] || 0);
  var rangeKey = sysId + ':' + (marketMode || 'open');
  var selectedRange = _marketChartRange[rangeKey] || 14;

  function renderMetric(label, value, note, tone) {
    return '<article class="market-spot-command-card' + (tone ? ' ' + tone : '') + '">' +
      '<span class="market-spot-command-card-label">' + label + '</span>' +
      '<strong class="market-spot-command-card-value">' + value + '</strong>' +
      '<span class="market-spot-command-card-note">' + note + '</span>' +
    '</article>';
  }

  function renderPill(label, value, extraClass) {
    return '<span class="market-spot-command-pill' + (extraClass ? ' ' + extraClass : '') + '">' +
      label + '<strong>' + value + '</strong>' +
    '</span>';
  }

  return '<div class="market-spot-command-hero">' +
    '<div class="market-spot-command-copy">' +
      '<div class="market-spot-command-kicker">交易指挥台</div>' +
      '<div class="market-spot-command-title">' + focused.good.emoji + ' ' + focused.good.name + ' · ' + focusSignal.label + '</div>' +
      '<div class="market-spot-command-summary">' + focusSignal.note + ' 当前窗口按近 ' + selectedRange + ' 天数据校准，点击下方货物可立刻切换主图和执行按钮。</div>' +
    '</div>' +
    '<div class="market-spot-command-emphasis">' +
      '<span class="market-spot-command-emphasis-label">' + (marketMode === 'black' ? '黑市通道' : '公开市场') + '</span>' +
      '<strong>' + (isCurrentSys ? '可即时成交' : '远程观察中') + '</strong>' +
    '</div>' +
  '</div>' +
  '<div class="market-spot-command-grid">' +
    renderMetric('可用信用积分', Math.floor(state.credits || 0).toLocaleString(), '信用积分越充足，越能在折价区连续吸筹。') +
    renderMetric('折价窗口', discounted.good.emoji + ' ' + discounted.buyPrice.toLocaleString(), '当前最便宜的建仓入口。', 'accent-cool') +
    renderMetric('最大利差', widestSpread.good.emoji + ' ' + widestSpread.spread.toLocaleString(), '需要靠节奏兑现，不适合盲目追价。', 'accent-warm') +
    renderMetric('最强需求', strongestDemand.good.emoji + ' ' + strongestDemand.supplyDemand.ratio.toFixed(2) + 'x', '供需错位最大，值得优先盯盘。', 'accent-hot') +
  '</div>' +
  '<div class="market-spot-command-strip">' +
    renderPill('节点', (system ? system.name : sysId) + ' · ' + (system ? system.typeLabel : '未知')) +
    renderPill('货舱', cargoUsed + '/' + cargoMax) +
    renderPill('深度', String(marketDepth)) +
    renderPill('势力', systemFaction ? systemFaction.name : '中立地带') +
    renderPill('黑市', blackMarketUnlocked ? '已解锁' : '未解锁', blackMarketUnlocked ? 'accumulate' : '') +
    renderPill('信号', focusSignal.label, focusSignal.className) +
  '</div>';
}

function _renderQuickTradeDock(state, sysId, snapshots, marketMode, isCurrentSys) {
  if (!snapshots || snapshots.length === 0) return '';

  var focused = _getFocusedMarketSnapshot(sysId, marketMode, snapshots);
  if (!focused) return '';

  var cargo = state.cargo || {};
  var inCargo = cargo[focused.good.id] || 0;
  var cargoUsed = Object.values(cargo).reduce(function (sum, quantity) {
    return sum + quantity;
  }, 0);
  var cargoMax = state.maxCargo || 100;
  var cargoSpace = Math.max(0, cargoMax - cargoUsed);
  var maxAffordable = focused.buyPrice > 0
    ? Math.floor((state.credits || 0) / focused.buyPrice)
    : 0;
  var maxBuy = Math.max(0, Math.min(cargoSpace, maxAffordable));
  var signal = _describeTradeOpportunity(sysId, focused, inCargo);
  var modeLabel = marketMode === 'black' ? '黑市盘口' : '公开盘口';

  return '<section class="market-quick-trade-card" data-market-quick-good="' + _escapeHtmlAttr(focused.good.id) + '">' +
    '<div class="market-quick-trade-main">' +
      '<span class="market-quick-trade-icon">' + focused.good.emoji + '</span>' +
      '<div class="market-quick-trade-copy">' +
        '<div class="market-quick-trade-kicker">ACTIVE ORDER · ' + _escapeHtml(modeLabel) + '</div>' +
        '<div class="market-quick-trade-title">' + _escapeHtml(focused.good.name) + ' · ' + _escapeHtml(signal.label) + '</div>' +
        '<div class="market-quick-trade-note">' + _escapeHtml(signal.note) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="market-quick-trade-prices" aria-label="当前聚焦货物价格">' +
      '<span><em>买入</em><strong>' + focused.buyPrice.toLocaleString() + '</strong></span>' +
      '<span><em>卖出</em><strong>' + focused.sellPrice.toLocaleString() + '</strong></span>' +
      '<span><em>货舱</em><strong>' + inCargo + '/' + cargoMax + '</strong></span>' +
      '<span><em>最多买</em><strong>' + maxBuy + '</strong></span>' +
    '</div>' +
    '<div class="market-quick-trade-actions">' +
      (isCurrentSys
        ? '<button class="market-quick-trade-btn market-quick-trade-btn--sell' + (inCargo > 0 ? '' : ' disabled') + '" type="button" data-market-quick-action="sell" data-id="' + _escapeHtmlAttr(focused.good.id) + '"' + (inCargo > 0 ? '' : ' disabled') + '>' + (inCargo > 0 ? '出售库存' : '无库存') + '</button>' +
          '<button class="market-quick-trade-btn market-quick-trade-btn--buy" type="button" data-market-quick-action="buy" data-id="' + _escapeHtmlAttr(focused.good.id) + '">买入 / 补仓</button>'
        : '<button class="market-quick-trade-btn disabled" type="button" disabled>远程只读</button>') +
    '</div>' +
  '</section>';
}

function _renderSpotGoodsToolbar(state, sysId, snapshots, marketMode) {
  if (!snapshots || snapshots.length === 0) return '';

  var focused = _getFocusedMarketSnapshot(sysId, marketMode, snapshots);
  var focusSignal = _describeTradeOpportunity(sysId, focused, state.cargo[focused.good.id] || 0);
  var cargoKinds = snapshots.filter(function (entry) {
    return (state.cargo[entry.good.id] || 0) > 0;
  }).length;
  var hotGoods = snapshots.filter(function (entry) {
    return entry.supplyDemand && entry.supplyDemand.ratio >= 1.2;
  }).length;

  function renderPill(label, value) {
    return '<span class="market-goods-toolbar-pill">' + label + '<strong>' + value + '</strong></span>';
  }

  return '<div class="market-goods-toolbar-copy">' +
    '<div class="market-goods-toolbar-title">执行列表</div>' +
    '<div class="market-goods-toolbar-note">当前盯盘：' + focused.good.emoji + ' ' + focused.good.name + ' · ' + focusSignal.label + '。点击任意货物可刷新主图和本地成交按钮。</div>' +
  '</div>' +
  '<div class="market-goods-toolbar-pills">' +
    renderPill('商品', String(snapshots.length)) +
    renderPill('在舱品类', String(cargoKinds)) +
    renderPill('高需求', String(hotGoods)) +
    renderPill('模式', marketMode === 'black' ? '黑市' : '公开') +
  '</div>';
}

function _renderAnalysisPanel(container, state, sysId, snapshots, marketMode) {
  if (!container || !snapshots || snapshots.length === 0) {
    container.innerHTML = '';
    return;
  }

  var system = findSystem(sysId);

  // 市场总指标
  var totalVolume = snapshots.reduce(function (sum, s) { return sum + s.buyPrice; }, 0);
  var avgSpread = snapshots.reduce(function (sum, s) { return sum + s.spread; }, 0) / snapshots.length;
  var marketDepth = Economy.getMarketDepth(sysId);
  var densityLabel = marketDepth >= 350 ? '高' : marketDepth >= 200 ? '中' : '低';
  var systemFaction = Faction.getFactionForSystem(sysId);
  var focused = _getFocusedMarketSnapshot(sysId, marketMode, snapshots);
  var focusSignal = focused
    ? _describeTradeOpportunity(sysId, focused, state.cargo[focused.good.id] || 0)
    : _describeTradeOpportunity(sysId, null, 0);

  // 近期波动排行（按涨跌幅排序，取 Top 4）
  var movers = snapshots.slice().sort(function (a, b) {
    return Math.abs(parseFloat(b.delta.text)) - Math.abs(parseFloat(a.delta.text));
  }).slice(0, 4);

  var watchList = snapshots.slice().sort(function (a, b) {
    var aScore = ((a.supplyDemand && a.supplyDemand.ratio) || 1) * 100 + (a.spread || 0) + (a.swing || 0);
    var bScore = ((b.supplyDemand && b.supplyDemand.ratio) || 1) * 100 + (b.spread || 0) + (b.swing || 0);
    return bScore - aScore;
  }).slice(0, 4);

  // 货舱概览
  var cargoItems = snapshots.filter(function (s) { return (state.cargo[s.good.id] || 0) > 0; });
  var cargoUsed = Object.values(state.cargo || {}).reduce(function (sum, q) { return sum + q; }, 0);
  var cargoMax = state.maxCargo || 100;

  container.innerHTML =
    '<div class="market-analysis-card market-analysis-main">' +
      '<div class="market-analysis-header">' +
        '<div>' +
          '<div class="market-analysis-title">📡 行动摘要</div>' +
          '<div class="market-analysis-subtitle">' + (system ? system.name : '当前节点') + ' · ' + (marketMode === 'black' ? '黑市策略窗' : '公开盘策略窗') + '</div>' +
        '</div>' +
        '<span class="market-analysis-chip">流动性 ' + densityLabel + '</span>' +
      '</div>' +
      '<div class="market-analysis-metrics">' +
        '<div class="market-analysis-metric">' +
          '<span class="market-analysis-metric-label">总买入额</span>' +
          '<span class="market-analysis-metric-value">' + (totalVolume >= 1000000 ? (totalVolume / 1000000).toFixed(1) + '<small>M</small>' : totalVolume >= 1000 ? (totalVolume / 1000).toFixed(1) + '<small>K</small>' : totalVolume.toLocaleString()) + ' <small>CR/小时</small></span>' +
        '</div>' +
        '<div class="market-analysis-metric">' +
          '<span class="market-analysis-metric-label">交易密度</span>' +
          '<span class="market-analysis-metric-value">' + densityLabel + '</span>' +
        '</div>' +
        '<div class="market-analysis-metric">' +
          '<span class="market-analysis-metric-label">平均利差</span>' +
          '<span class="market-analysis-metric-value">' + Math.round(avgSpread).toLocaleString() + ' <small>CR</small></span>' +
        '</div>' +
        '<div class="market-analysis-metric">' +
          '<span class="market-analysis-metric-label">货舱占用</span>' +
          '<span class="market-analysis-metric-value">' + cargoUsed + '<small>/' + cargoMax + '</small></span>' +
        '</div>' +
      '</div>' +
      '<hr class="market-analysis-divider" />' +
      '<div class="market-analysis-section-title">当前策略</div>' +
      '<div class="market-analysis-signal-card ' + focusSignal.className + '">' +
        '<div class="market-analysis-signal-head">' +
          '<span class="market-analysis-signal-title">' + (focused ? (focused.good.emoji + ' ' + focused.good.name) : '暂无聚焦货物') + '</span>' +
          '<span class="market-analysis-signal-label">' + focusSignal.label + '</span>' +
        '</div>' +
        '<div class="market-analysis-signal-note">' +
          (focused
            ? (focusSignal.note + ' 买入 ' + focused.buyPrice.toLocaleString() + ' / 卖出 ' + focused.sellPrice.toLocaleString() + ' / 供需 ' + focused.supplyDemand.ratio.toFixed(2) + 'x。')
            : focusSignal.note) +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="market-analysis-card">' +
      '<div class="market-analysis-title">🎯 优先观察</div>' +
      '<div class="market-analysis-mover-list">' +
        watchList.map(function (entry) {
          var entrySignal = _describeTradeOpportunity(sysId, entry, state.cargo[entry.good.id] || 0);
          return '<div class="market-analysis-mover">' +
            '<div class="market-analysis-mover-copy">' +
              '<span class="market-analysis-mover-name">' + entry.good.emoji + ' ' + entry.good.name + '</span>' +
              '<span class="market-analysis-mover-note">' + entrySignal.label + ' · 供需 ' + entry.supplyDemand.ratio.toFixed(2) + 'x · 差价 ' + entry.spread.toLocaleString() + '</span>' +
            '</div>' +
            '<span class="market-analysis-mover-delta ' + entry.delta.className.replace('market-chart-', '') + '">' + entry.delta.text + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
      '<hr class="market-analysis-divider" />' +
      '<div class="market-analysis-section-title">近期波动</div>' +
      '<div class="market-analysis-mover-list">' +
        movers.map(function (entry) {
          var deltaVal = parseFloat(entry.delta.text);
          var deltaClass = deltaVal > 0.5 ? 'up' : (deltaVal < -0.5 ? 'down' : 'flat');
          return '<div class="market-analysis-mover">' +
            '<span class="market-analysis-mover-name">' + entry.good.emoji + ' ' + entry.good.name + '</span>' +
            '<span class="market-analysis-mover-delta ' + deltaClass + '">' + entry.delta.text + '</span>' +
          '</div>';
        }).join('') +
      '</div>' +
    '</div>' +
    '<div class="market-analysis-card">' +
      '<div class="market-analysis-title">📦 航运状态</div>' +
      '<div class="market-analysis-cargo-bar">' +
        '<div class="market-analysis-cargo-bar-track">' +
          '<div class="market-analysis-cargo-bar-fill" style="width:' + Math.min(100, Math.round(cargoUsed / cargoMax * 100)) + '%"></div>' +
        '</div>' +
        '<span class="market-analysis-cargo-bar-text">' + cargoUsed + '/' + cargoMax + '</span>' +
      '</div>' +
      (cargoItems.length > 0
        ? '<div class="market-analysis-cargo-list">' +
            cargoItems.map(function (entry) {
              var qty = state.cargo[entry.good.id] || 0;
              return '<div class="market-analysis-cargo-row">' +
                '<span>' + entry.good.emoji + ' ' + entry.good.name + '</span>' +
                '<span class="market-analysis-cargo-qty">×' + qty + '</span>' +
              '</div>';
            }).join('') +
          '</div>'
        : '<div class="market-analysis-empty">货舱为空</div>') +
      '<div class="market-analysis-fact-list">' +
        '<div class="market-analysis-fact-row"><span>当前势力</span><strong>' + (systemFaction ? systemFaction.name : '中立地带') + '</strong></div>' +
        '<div class="market-analysis-fact-row"><span>运行模式</span><strong>' + (marketMode === 'black' ? '🕶 黑市' : '🏪 公开') + '</strong></div>' +
        '<div class="market-analysis-fact-row"><span>节点类型</span><strong>' + (system ? system.typeLabel : '未知') + '</strong></div>' +
        '<div class="market-analysis-fact-row"><span>市场深度</span><strong>' + marketDepth + '</strong></div>' +
      '</div>' +
    '</div>';
}

function _renderSpotIntelSection(state, sysId, snapshots, marketMode, systemFaction, blackMarketUnlocked) {
  var system = findSystem(sysId);
  var surveyIntel = Exploration.getSurveyDecisionIntel(state, sysId);
  var bestDemand = _pickSnapshot(snapshots, function (a, b) {
    return b.supplyDemand.ratio - a.supplyDemand.ratio;
  });
  var biggestSwing = _pickSnapshot(snapshots, function (a, b) {
    return b.swing - a.swing;
  });
  var lowestBuy = _pickSnapshot(snapshots, function (a, b) {
    return a.buyPrice - b.buyPrice;
  });
  var widestSpread = _pickSnapshot(snapshots, function (a, b) {
    return b.spread - a.spread;
  });
  var watchList = snapshots.slice().sort(function (a, b) {
    return (b.supplyDemand.ratio + b.swing / 100) - (a.supplyDemand.ratio + a.swing / 100);
  }).slice(0, 4);
  var marketDepth = Economy.getMarketDepth(sysId);
  var nodeTitleId = _getMarketFinanceDomId('market-intel-node-title', sysId);
  var nodeMetaId = _getMarketFinanceDomId('market-intel-node-meta', sysId);
  var accessTitleId = _getMarketFinanceDomId('market-intel-access-title', sysId);
  var accessMetaId = _getMarketFinanceDomId('market-intel-access-meta', sysId);

  return '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">🧭 市场情报台</div>' +
        '<div class="market-finance-subtitle">把当前节点的价格、波动和准入状态压缩成一张作战看板，方便决定下一笔交易。</div>' +
      '</div>' +
      '<span class="market-finance-chip">' + (marketMode === 'black' ? '黑市视图' : '公开视图') + '</span>' +
    '</div>' +
    '<div class="market-finance-summary-grid market-spot-intel-grid">' +
      '<div class="market-finance-summary-metric"><span>最低买入</span><strong>' + (lowestBuy ? (lowestBuy.good.emoji + ' ' + lowestBuy.buyPrice.toLocaleString()) : '—') + '</strong></div>' +
      '<div class="market-finance-summary-metric"><span>最高需求</span><strong>' + (bestDemand ? (bestDemand.good.emoji + ' ' + bestDemand.supplyDemand.ratio.toFixed(2) + 'x') : '—') + '</strong></div>' +
      '<div class="market-finance-summary-metric"><span>最大波动</span><strong>' + (biggestSwing ? (biggestSwing.good.emoji + ' ' + biggestSwing.swing.toLocaleString()) : '—') + '</strong></div>' +
      '<div class="market-finance-summary-metric"><span>买卖价差</span><strong>' + (widestSpread ? (widestSpread.good.emoji + ' ' + widestSpread.spread.toLocaleString()) : '—') + '</strong></div>' +
    '</div>' +
    _renderSpotIntelSignalPanel(surveyIntel, watchList, marketMode, blackMarketUnlocked) +
  '</section>' +
  _renderSurveyIntelMarketSection(surveyIntel) +
  '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">📡 节点速览</div>' +
        '<div class="market-finance-subtitle">查看该节点的深度、势力和特殊市场准入，判断它更适合买货、出货还是布点。</div>' +
      '</div>' +
    '</div>' +
    '<div class="market-finance-action-list market-intel-node-list" role="list" aria-label="节点行情与准入速览">' +
      '<article class="market-finance-action-row market-intel-node-row" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(nodeTitleId) + '" aria-describedby="' + _escapeHtmlAttr(nodeMetaId) + '">' +
        '<div class="market-finance-action-main">' +
          '<div id="' + _escapeHtmlAttr(nodeTitleId) + '" class="market-finance-action-title">' + (system ? system.name : '当前节点') + '</div>' +
          '<div id="' + _escapeHtmlAttr(nodeMetaId) + '" class="market-finance-action-meta">市场深度 ' + marketDepth + ' · ' + (system ? system.typeLabel : '未知类型') + ' · ' + (system ? system.description : '无节点说明') + '</div>' +
        '</div>' +
        '<div class="market-finance-network-note">' + (systemFaction ? systemFaction.name : '中立地带') + '</div>' +
      '</article>' +
      '<article class="market-finance-action-row market-intel-node-row" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(accessTitleId) + '" aria-describedby="' + _escapeHtmlAttr(accessMetaId) + '">' +
        '<div class="market-finance-action-main">' +
          '<div id="' + _escapeHtmlAttr(accessTitleId) + '" class="market-finance-action-title">特殊市场准入</div>' +
          '<div id="' + _escapeHtmlAttr(accessMetaId) + '" class="market-finance-action-meta">' + (systemFaction && systemFaction.marketAccess && systemFaction.marketAccess.blackMarket ? '该势力辖区存在黑市通路。' : '该节点无黑市入口，现货交易仅限公开市场。') + '</div>' +
        '</div>' +
        '<div class="market-finance-network-note">' + (blackMarketUnlocked ? '已解锁' : '未解锁') + '</div>' +
      '</article>' +
    '</div>' +
  '</section>' +
  '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">🎯 值得盯盘的货物</div>' +
        '<div class="market-finance-subtitle">优先把波动和需求同时较高的品类拉进观察名单。</div>' +
      '</div>' +
    '</div>' +
    (watchList.length > 0
      ? '<div class="market-finance-action-list market-watch-list" role="list" aria-label="值得盯盘的货物">' + watchList.map(function (entry) {
          var watchTitleId = _getMarketFinanceDomId('market-watch-title', entry.good.id);
          var watchMetaId = _getMarketFinanceDomId('market-watch-meta', entry.good.id);
          return '<article class="market-finance-action-row market-watch-row" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(watchTitleId) + '" aria-describedby="' + _escapeHtmlAttr(watchMetaId) + '">' +
            '<div class="market-finance-action-main">' +
              '<div id="' + _escapeHtmlAttr(watchTitleId) + '" class="market-finance-action-title">' + entry.good.emoji + ' ' + entry.good.name + '</div>' +
              '<div id="' + _escapeHtmlAttr(watchMetaId) + '" class="market-finance-action-meta">买入 ' + entry.buyPrice.toLocaleString() + ' · 卖出 ' + entry.sellPrice.toLocaleString() + ' · 需求/供给 ' + entry.supplyDemand.ratio.toFixed(2) + 'x</div>' +
            '</div>' +
            '<div class="market-finance-network-note">波动 ' + entry.swing.toLocaleString() + '</div>' +
          '</article>';
        }).join('') + '</div>'
      : '<div class="market-finance-empty">当前没有足够的行情数据生成观察名单。</div>') +
  '</section>';
}

function _renderSpotSignalMetric(label, value, note, toneClass) {
  return '<div class="market-spot-signal-item' + (toneClass ? ' ' + toneClass : '') + '" role="listitem">' +
    '<span class="market-spot-signal-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="market-spot-signal-value">' + _escapeHtml(value) + '</strong>' +
    '<span class="market-spot-signal-note">' + _escapeHtml(note) + '</span>' +
  '</div>';
}

function _renderSpotFocus(title, note, tone) {
  return '<div class="market-spot-focus" aria-label="市场局部信号" data-tone="' + _escapeHtmlAttr(tone || 'idle') + '">' +
    '<span class="market-spot-focus-kicker">局部信号</span>' +
    '<strong class="market-spot-focus-title">' + _escapeHtml(title) + '</strong>' +
    '<span class="market-spot-focus-note">' + _escapeHtml(note) + '</span>' +
  '</div>';
}

function _renderSpotIntelSignalPanel(surveyIntel, watchList, marketMode, blackMarketUnlocked) {
  var chains = surveyIntel && Array.isArray(surveyIntel.anomalyChains) ? surveyIntel.anomalyChains : [];
  var hasIntel = !!(surveyIntel && surveyIntel.hasIntel);
  var reportCount = hasIntel ? (surveyIntel.reportCount || 0) : 0;
  var intelLevel = hasIntel ? (surveyIntel.intelLevel || 0) : 0;
  var readyFollowupCount = hasIntel && typeof surveyIntel.readyFollowupCount === 'number'
    ? surveyIntel.readyFollowupCount
    : chains.filter(function (chain) { return !!chain.followupReady && !chain.followupAcknowledged; }).length;
  var archivedChainCount = chains.filter(function (chain) {
    return chain.resolved || chain.stage === 'archived';
  }).length;
  var focusTitle = '行情观察窗口';
  var focusNote = watchList.length > 0
    ? ('当前有 ' + watchList.length + ' 个货物进入盯盘列表，先比较需求、波动和价差。')
    : '当前行情数据不足，先使用节点速览判断是否值得停留。';
  var focusTone = watchList.length > 0 ? 'watch' : 'idle';

  if (readyFollowupCount > 0) {
    focusTitle = '事件链待跟进';
    focusNote = surveyIntel.nextChainFollowup
      ? (surveyIntel.nextChainFollowup.followupLabel || surveyIntel.nextChainFollowup.label || '有事件链后续可以确认。')
      : ('有 ' + readyFollowupCount + ' 条事件链后续等待确认。');
    focusTone = 'risk';
  } else if (hasIntel) {
    focusTitle = '勘探报告可用';
    focusNote = (surveyIntel.primaryLabel || '勘探情报') + ' 已纳入市场情报页，可和节点准入、盯盘货物一起判断。';
    focusTone = 'ready';
  } else if (blackMarketUnlocked) {
    focusTitle = marketMode === 'black' ? '黑市情报并入盘口' : '特殊市场可切换';
    focusNote = '当前节点具备黑市准入，可在黑市页复核风险后切换盘口。';
    focusTone = 'ready';
  }

  return '<div class="market-spot-signal-panel market-intel-signal-panel" aria-label="市场情报局部态势">' +
    '<div class="market-spot-signal-head">' +
      '<div>' +
        '<div class="market-spot-signal-title">情报链摘要</div>' +
        '<div class="market-spot-signal-subtitle">把勘探报告、事件链、盯盘货物和特殊市场准入压成一组局部态势。</div>' +
      '</div>' +
      '<span class="market-finance-chip">' + (hasIntel ? '报告可用' : '行情观察') + '</span>' +
    '</div>' +
    '<div class="market-spot-signal-grid" role="list" aria-label="市场情报指标">' +
      _renderSpotSignalMetric('报告归档', reportCount + ' 份', hasIntel ? ('情报等级 Lv.' + intelLevel) : '暂无勘探报告', hasIntel ? 'tone-cool' : '') +
      _renderSpotSignalMetric('事件链', readyFollowupCount + ' 待跟进', archivedChainCount + ' 条已归档链路', readyFollowupCount > 0 ? 'tone-hot' : (archivedChainCount > 0 ? 'tone-cool' : '')) +
      _renderSpotSignalMetric('盯盘货物', String(watchList.length), watchList.length > 0 ? '按需求、波动与价差排序' : '等待更多价格波动', watchList.length > 0 ? 'tone-warm' : '') +
      _renderSpotSignalMetric('特殊准入', blackMarketUnlocked ? '黑市开放' : '公开视图', marketMode === 'black' ? '当前查看黑市盘口' : '当前查看公开盘口', blackMarketUnlocked ? 'tone-cool' : '') +
    '</div>' +
    _renderSpotFocus(focusTitle, focusNote, focusTone) +
  '</div>';
}

function _renderSurveyIntelMarketSection(surveyIntel) {
  if (!surveyIntel || !surveyIntel.hasIntel) return '';

  var signalNotes = [];
  if (surveyIntel.marketSignal) signalNotes.push('贸易窗口');
  if (surveyIntel.researchSignal) signalNotes.push('科研样本');
  if (surveyIntel.routeSignal) signalNotes.push('暗线航图');
  if (surveyIntel.logisticsSignal) signalNotes.push('补给节点');
  if (signalNotes.length === 0) signalNotes.push(surveyIntel.opportunityLabel || '勘探情报');
  var chainRowsHtml = _renderSurveyIntelChainRows(surveyIntel);
  var reportTitleId = _getMarketFinanceDomId('market-survey-report-title', surveyIntel.systemId || surveyIntel.recentReportTitle || 'current');
  var reportMetaId = _getMarketFinanceDomId('market-survey-report-meta', surveyIntel.systemId || surveyIntel.recentReportTitle || 'current');

  return '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">📘 勘探报告联动</div>' +
        '<div class="market-finance-subtitle">' + _escapeHtml(surveyIntel.marketHint) + '</div>' +
      '</div>' +
      '<span class="market-finance-chip">' + _escapeHtml(surveyIntel.primaryLabel) + '</span>' +
    '</div>' +
    '<div class="market-finance-action-list market-survey-chain-list" role="list" aria-label="勘探报告联动链路">' +
      '<article class="market-finance-action-row market-survey-report-row" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(reportTitleId) + '" aria-describedby="' + _escapeHtmlAttr(reportMetaId) + '">' +
        '<div class="market-finance-action-main">' +
          '<div id="' + _escapeHtmlAttr(reportTitleId) + '" class="market-finance-action-title">' + _escapeHtml(surveyIntel.recentReportTitle || '勘探报告') + '</div>' +
          '<div id="' + _escapeHtmlAttr(reportMetaId) + '" class="market-finance-action-meta">情报等级 Lv.' + _escapeHtml(surveyIntel.intelLevel) + ' · 已归档 ' + _escapeHtml(surveyIntel.reportCount) + ' 份 · ' + _escapeHtml(signalNotes.join(' / ')) + '</div>' +
        '</div>' +
        '<div class="market-finance-network-note">' + _escapeHtml(surveyIntel.anomalyHint || surveyIntel.dispatchHint || '行情参考') + '</div>' +
      '</article>' +
      chainRowsHtml +
    '</div>' +
  '</section>';
}

function _renderSurveyIntelChainRows(surveyIntel) {
  var chains = surveyIntel && Array.isArray(surveyIntel.anomalyChains) ? surveyIntel.anomalyChains : [];
  if (chains.length === 0) return '';

  var visibleChains = chains.slice().sort(function (left, right) {
    var resolvedDelta = (right.resolved ? 1 : 0) - (left.resolved ? 1 : 0);
    if (resolvedDelta !== 0) return resolvedDelta;
    return (right.stageIndex || 0) - (left.stageIndex || 0);
  });

  return visibleChains.map(function (chain) {
    var stageClass = _getSurveyChainStageClass(chain);
    var chainId = chain.id || (chain.kind || 'chain') + '-' + (chain.stageIndex || 0);
    var titleId = _getMarketFinanceDomId('market-survey-chain-title', chainId);
    var metaId = _getMarketFinanceDomId('market-survey-chain-meta', chainId);
    var noteId = _getMarketFinanceDomId('market-survey-chain-note', chainId);
    var rowClasses = [
      'market-finance-action-row',
      'market-survey-chain-row',
      'market-survey-chain-row--' + stageClass,
    ];
    if (chain.followupReady) rowClasses.push('is-followup-ready');
    if (chain.followupAcknowledged) rowClasses.push('is-followup-acknowledged');
    return '<article class="' + rowClasses.map(_escapeHtmlAttr).join(' ') + '" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(titleId) + '" aria-describedby="' + _escapeHtmlAttr(metaId + ' ' + noteId) + '" data-market-survey-chain-id="' + _escapeHtmlAttr(chain.id || '') + '" data-market-survey-chain-kind="' + _escapeHtmlAttr(chain.kind || '') + '">' +
      '<div class="market-finance-action-main">' +
        '<div id="' + _escapeHtmlAttr(titleId) + '" class="market-finance-action-title">' + _escapeHtml((chain.badge ? (chain.badge + ' · ') : '') + (chain.label || '探索链')) + '</div>' +
        '<div id="' + _escapeHtmlAttr(metaId) + '" class="market-finance-action-meta">' + _escapeHtml((chain.poiName || '探索点') + ' · ' + (chain.stageLabel || '待扫描') + ' · ' + _getSurveyChainImpact(chain)) + '</div>' +
      '</div>' +
      '<div id="' + _escapeHtmlAttr(noteId) + '" class="market-finance-network-note market-survey-chain-note">' + _escapeHtml(_getSurveyChainNote(chain)) + '</div>' +
    '</article>';
  }).join('');
}

function _getSurveyChainStageClass(chain) {
  var stage = chain && chain.stage ? String(chain.stage) : 'locked';
  if (stage === 'archived' || stage === 'discovered' || stage === 'locked') return stage;
  return 'locked';
}

function _getSurveyChainImpact(chain) {
  if (!chain) return '经营影响';
  if (chain.kind === 'lost_beacon') return '航线 / 派遣';
  if (chain.kind === 'ancient_relic') return '科研 / 风险';
  if (chain.kind === 'derelict_depot') return '商网 / 整备';
  if (chain.signal === 'market') return '贸易 / 价格';
  return '经营影响';
}

function _getSurveyChainNote(chain) {
  if (!chain) return '待归档';
  if (chain.followupAcknowledged) {
    return chain.followupAcknowledgedDay ? ('已跟进 · 第 ' + chain.followupAcknowledgedDay + ' 天') : '已跟进';
  }
  if (chain.followupReady && chain.followupLabel) return chain.followupLabel;
  if (chain.resolved) return '报告已归档';
  if (chain.discovered) return '待调查';
  return '待扫描';
}

function _renderBlackMarketSection(state, sysId, marketMode, systemFaction, blackMarketUnlocked) {
  var hasBlackMarket = !!(systemFaction && systemFaction.marketAccess && systemFaction.marketAccess.blackMarket);
  var blackGoods = Economy.getBlackMarketGoods();
  var blackStatusTitleId = _getMarketFinanceDomId('market-black-status-title', sysId);
  var blackStatusMetaId = _getMarketFinanceDomId('market-black-status-meta', sysId);
  var blackStatusRiskId = _getMarketFinanceDomId('market-black-status-risk', sysId);

  return '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">🕶 特殊市场接入</div>' +
        '<div class="market-finance-subtitle">把公开市场和黑市切换单独收进这一页，避免交易表里混入额外控制按钮。</div>' +
      '</div>' +
      '<span class="market-finance-chip">当前 ' + (marketMode === 'black' ? '黑市' : '公开') + '</span>' +
    '</div>' +
    _renderBlackMarketRiskPanel(state, sysId, marketMode, hasBlackMarket, blackMarketUnlocked, blackGoods) +
    (hasBlackMarket
      ? '<div class="market-black-switcher">' +
          '<div class="market-mode-bar market-mode-bar-panel" role="group" aria-label="市场模式切换">' +
            '<button class="market-mode-btn' + (marketMode !== 'black' ? ' active' : '') + '" data-mode="open" aria-pressed="' + (marketMode !== 'black' ? 'true' : 'false') + '" aria-label="切换到公开市场">🏪 公开市场</button>' +
            (blackMarketUnlocked
              ? '<button class="market-mode-btn' + (marketMode === 'black' ? ' active' : '') + '" data-mode="black" aria-pressed="' + (marketMode === 'black' ? 'true' : 'false') + '" aria-label="切换到黑市">🕶 黑市</button>'
              : '<button class="market-mode-btn disabled" disabled aria-disabled="true" title="需与辛迪加达到友好关系">🔒 黑市</button>') +
          '</div>' +
          '<article class="market-finance-card market-black-status-card' + (marketMode === 'black' ? ' is-featured' : '') + '" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(blackStatusTitleId) + '" aria-describedby="' + _escapeHtmlAttr(blackStatusMetaId + ' ' + blackStatusRiskId) + '">' +
            '<div class="market-finance-card-head"><span id="' + _escapeHtmlAttr(blackStatusTitleId) + '" class="market-finance-card-title">' + (marketMode === 'black' ? '黑市已接管前台视图' : '当前仍停留在公开市场') + '</span><span class="market-finance-chip">' + (blackMarketUnlocked ? '可切换' : '权限不足') + '</span></div>' +
            '<div id="' + _escapeHtmlAttr(blackStatusMetaId) + '" class="market-finance-card-meta">' + (blackMarketUnlocked
              ? '切换到黑市后，现货交易子页会改用灰市/违禁品报价与对应买卖动作。'
              : '该节点存在黑市，但当前资格不足，只能提前查看风险说明。') + '</div>' +
            '<div id="' + _escapeHtmlAttr(blackStatusRiskId) + '" class="market-finance-card-meta">⚠ 携带违禁品进入联邦区域会触发执法检查，黑市收益高，但路线风险和名望代价更大。</div>' +
          '</article>' +
        '</div>'
      : '<div class="market-finance-locked">📡 当前节点不提供黑市入口。若要走特殊货物流通，需要前往允许黑市交易的势力辖区。</div>') +
  '</section>' +
  '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">☠ 灰市货目录</div>' +
        '<div class="market-finance-subtitle">这里列出可能出现在黑市的商品，用于提前规划货舱和路线。</div>' +
      '</div>' +
    '</div>' +
    (blackGoods.length > 0
      ? '<div class="market-finance-card-grid market-black-goods-grid" role="list" aria-label="灰市货目录">' + blackGoods.map(function (good) {
          var goodTitleId = _getMarketFinanceDomId('market-black-good-title', good.id);
          var goodLegalId = _getMarketFinanceDomId('market-black-good-legal', good.id);
          var goodChainId = _getMarketFinanceDomId('market-black-good-chain', good.id);
          return '<article class="market-finance-card market-black-good-card" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(goodTitleId) + '" aria-describedby="' + _escapeHtmlAttr(goodLegalId + ' ' + goodChainId) + '">' +
            '<div class="market-finance-card-head">' +
              '<span id="' + _escapeHtmlAttr(goodTitleId) + '" class="market-finance-card-title">' + good.emoji + ' ' + good.name + '</span>' +
              '<span class="market-finance-chip">' + (good.legality === 'illegal' ? '违禁' : '灰市') + '</span>' +
            '</div>' +
            '<div id="' + _escapeHtmlAttr(goodLegalId) + '" class="market-finance-card-meta">' + _legalityTooltip(good) + '</div>' +
            '<div id="' + _escapeHtmlAttr(goodChainId) + '" class="market-finance-card-meta">' + (_supplyChainTooltip(good) || '无额外产业链提示') + '</div>' +
          '</article>';
        }).join('') + '</div>'
      : '<div class="market-finance-empty">当前没有定义黑市商品。</div>') +
  '</section>';
}

function _renderBlackMarketRiskPanel(state, sysId, marketMode, hasBlackMarket, blackMarketUnlocked, blackGoods) {
  var risk = Economy.estimateSmugglingCargoRisk(state || {}, sysId, (state && state.cargo) || {});
  var illegalGoodsCount = (blackGoods || []).filter(function (good) {
    return good.legality === 'illegal';
  }).length;
  var accessValue = hasBlackMarket ? (blackMarketUnlocked ? '可切换' : '待解锁') : '无入口';
  var accessNote = hasBlackMarket
    ? (blackMarketUnlocked ? ('货目录 ' + blackGoods.length + ' 项 · 违禁 ' + illegalGoodsCount + ' 项') : '需要提升辛迪加关系后开放')
    : '当前势力辖区不提供黑市通路';
  var focusTitle = '无本地入口';
  var focusNote = '该节点不提供黑市接入，特殊货物流通需要转向辛迪加辖区。';
  var focusTone = 'idle';

  if (hasBlackMarket && !blackMarketUnlocked) {
    focusTitle = '黑市资格未达标';
    focusNote = '可以先查看风险与货目录，但当前无法切换到黑市盘口。';
    focusTone = 'watch';
  } else if (blackMarketUnlocked && risk.hasContraband && risk.protectedByBlackMarket) {
    focusTitle = '黑市保护已覆盖';
    focusNote = '当前货舱含违禁品，但该节点黑市资格已开放，入港检查压力降至 ' + risk.checkChancePercent + '%。';
    focusTone = 'ready';
  } else if (risk.hasContraband) {
    focusTitle = '走私检查暴露';
    focusNote = '当前货舱含 ' + risk.contrabandGoods.join('、') + '，预计检查概率 ' + risk.checkChancePercent + '%。';
    focusTone = 'risk';
  } else if (blackMarketUnlocked && marketMode === 'black') {
    focusTitle = '灰市盘口在线';
    focusNote = '当前现货页已切换到黑市报价，适合先核对违禁品和受监管商品。';
    focusTone = 'ready';
  } else if (blackMarketUnlocked) {
    focusTitle = '可切换观察';
    focusNote = '黑市资格已开放，切换前先确认货舱、路线和执法等级。';
    focusTone = 'watch';
  }

  return '<div class="market-spot-signal-panel market-black-risk-panel" aria-label="黑市风险局部态势">' +
    '<div class="market-spot-signal-head">' +
      '<div>' +
        '<div class="market-spot-signal-title">黑市风险态势</div>' +
        '<div class="market-spot-signal-subtitle">先看准入、执法、违禁货值和检查概率，再决定是否切换特殊市场。</div>' +
      '</div>' +
      '<span class="market-finance-chip">' + (risk.protectedByBlackMarket ? '保护覆盖' : risk.enforcementLabel) + '</span>' +
    '</div>' +
    '<div class="market-spot-signal-grid" role="list" aria-label="黑市风险指标">' +
      _renderSpotSignalMetric('准入状态', accessValue, accessNote, blackMarketUnlocked ? 'tone-cool' : (hasBlackMarket ? 'tone-warm' : '')) +
      _renderSpotSignalMetric('执法等级', risk.enforcementLabel, '声望修正 ×' + risk.reputationModifier.toFixed(2), risk.enforcement === 'high' ? 'tone-hot' : (risk.enforcement === 'medium' ? 'tone-warm' : 'tone-cool')) +
      _renderSpotSignalMetric('违禁货值', Math.floor(risk.contrabandValue || 0).toLocaleString(), risk.hasContraband ? risk.contrabandGoods.join('、') : '货舱暂无违禁品', risk.hasContraband ? 'tone-hot' : '') +
      _renderSpotSignalMetric('检查概率', risk.checkChancePercent + '%', risk.protectedByBlackMarket ? '黑市资格降低入港检查压力' : '由执法等级、货值占比和声望决定', risk.checkChancePercent > 0 ? 'tone-hot' : 'tone-cool') +
    '</div>' +
    _renderSpotFocus(focusTitle, focusNote, focusTone) +
  '</div>';
}

// ---------------------------------------------------------------------------
// 股市风格图表辅助（迷你 K 线 + 均线）
// ---------------------------------------------------------------------------

function _normalizeChartHistory(data, fallbackPrice, range) {
  var limit = Math.max(2, Math.floor(range || 12));
  var series = Array.isArray(data) ? data.slice(-limit) : [];
  var safeFallback = Math.max(1, Math.round(fallbackPrice || 1));
  if (series.length === 0) series = [safeFallback, safeFallback];
  if (series.length === 1) series.unshift(series[0]);
  while (series.length < Math.min(8, limit)) {
    series.unshift(series[0]);
  }
  return series.map(function (value) {
    return Math.max(1, Math.round(value || safeFallback));
  });
}

function _buildPseudoCandles(history) {
  return history.map(function (close, index) {
    var open = index === 0 ? history[0] : history[index - 1];
    var spread = Math.max(1, Math.round(Math.abs(close - open) * 0.35) + 1);
    return {
      open: open,
      close: close,
      high: Math.max(open, close) + spread,
      low: Math.max(1, Math.min(open, close) - spread),
      volume: Math.max(1, Math.abs(close - open) + spread),
    };
  });
}

function _movingAverage(values, period) {
  return values.map(function (_, index) {
    var start = Math.max(0, index - period + 1);
    var slice = values.slice(start, index + 1);
    var sum = slice.reduce(function (acc, value) { return acc + value; }, 0);
    return sum / slice.length;
  });
}

function _formatChartDelta(history) {
  if (!history || history.length < 2) return { text: '0.0%', className: 'market-chart-flat' };
  var start = history[0] || 1;
  var end = history[history.length - 1] || start;
  var delta = ((end - start) / Math.max(1, start)) * 100;
  var sign = delta > 0 ? '+' : '';
  var className = delta > 0.5 ? 'market-chart-up' : (delta < -0.5 ? 'market-chart-down' : 'market-chart-flat');
  return {
    text: sign + delta.toFixed(1) + '%',
    className: className,
  };
}

function _renderMarketChart(history, currentPrice, goodLabel, options) {
  var normalized = _normalizeChartHistory(history, currentPrice);
  var candles = _buildPseudoCandles(normalized);
  var movingAvg = _movingAverage(normalized, 4);
  var minPrice = Math.min.apply(null, candles.map(function (item) { return item.low; }).concat(movingAvg));
  var maxPrice = Math.max.apply(null, candles.map(function (item) { return item.high; }).concat(movingAvg));
  var priceRange = Math.max(1, maxPrice - minPrice);
  var maxVolume = Math.max.apply(null, candles.map(function (item) { return item.volume; }));
  options = options || {};
  var width = options.width || 132;
  var height = options.height || 58;
  var topPad = options.topPad || 5;
  var chartBottom = options.chartBottom || 40;
  var volumeBase = options.volumeBase || 53;
  var outerClass = options.className || 'market-mini-chart';
  var slot = (width - 10) / candles.length;
  var bodyWidth = Math.max(4, Math.min(8, slot - 3));

  function scaleY(value) {
    return topPad + ((maxPrice - value) / priceRange) * (chartBottom - topPad);
  }

  function scaleVolume(value) {
    return Math.max(2, (value / Math.max(1, maxVolume)) * 8);
  }

  var volumeBars = candles.map(function (item, index) {
    var x = 5 + index * slot + Math.max(1, (slot - bodyWidth) / 2);
    var barHeight = scaleVolume(item.volume);
    return '<rect x="' + x.toFixed(1) + '" y="' + (volumeBase - barHeight).toFixed(1) + '" width="' + bodyWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" class="market-chart-volume" />';
  }).join('');

  var candleShapes = candles.map(function (item, index) {
    var centerX = 5 + index * slot + (slot / 2);
    var wickTop = scaleY(item.high);
    var wickBottom = scaleY(item.low);
    var openY = scaleY(item.open);
    var closeY = scaleY(item.close);
    var bodyY = Math.min(openY, closeY);
    var bodyHeight = Math.max(2, Math.abs(closeY - openY));
    var bodyX = centerX - (bodyWidth / 2);
    var cls = item.close >= item.open ? 'market-chart-candle up' : 'market-chart-candle down';
    return '<line x1="' + centerX.toFixed(1) + '" y1="' + wickTop.toFixed(1) + '" x2="' + centerX.toFixed(1) + '" y2="' + wickBottom.toFixed(1) + '" class="market-chart-wick ' + (item.close >= item.open ? 'up' : 'down') + '" />' +
      '<rect x="' + bodyX.toFixed(1) + '" y="' + bodyY.toFixed(1) + '" width="' + bodyWidth.toFixed(1) + '" height="' + bodyHeight.toFixed(1) + '" rx="1" class="' + cls + '" />';
  }).join('');

  var maPath = movingAvg.map(function (value, index) {
    var x = 5 + index * slot + (slot / 2);
    var y = scaleY(value);
    return (index === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  return '<svg class="' + outerClass + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + goodLabel + ' 市场K线图">' +
    '<rect x="0.5" y="0.5" width="' + (width - 1) + '" height="' + (height - 1) + '" rx="8" class="market-chart-frame" />' +
    '<line x1="4" y1="40.5" x2="128" y2="40.5" class="market-chart-axis" />' +
    '<line x1="4" y1="53.5" x2="128" y2="53.5" class="market-chart-axis market-chart-axis-volume" />' +
    '<path d="' + maPath + '" class="market-chart-ma" />' +
    volumeBars +
    candleShapes +
  '</svg>';
}

function _renderMiniMarketChart(history, currentPrice, goodLabel) {
  return _renderMarketChart(history, currentPrice, goodLabel, {
    width: 132,
    height: 58,
    topPad: 5,
    chartBottom: 40,
    volumeBase: 53,
    className: 'market-mini-chart',
  });
}

// ---------------------------------------------------------------------------
// 主 K 线图（股市风格，含 Y 轴刻度、X 轴日期、网格、当前价线、OHLC）
// ---------------------------------------------------------------------------

function _renderFullKlineChart(history, currentPrice, goodLabel, range) {
  var normalized = _normalizeChartHistory(history, currentPrice, range);
  var candles = _buildPseudoCandles(normalized);
  var ma5 = _movingAverage(normalized, 5);
  var ma10 = _movingAverage(normalized, Math.min(10, normalized.length));

  // 尺寸设定
  var W = 560, H = 260;
  var marginLeft = 52, marginRight = 10, marginTop = 8, marginBottom = 32;
  var chartLeft = marginLeft, chartRight = W - marginRight;
  var chartTop = marginTop, chartBottom = H - marginBottom - 40;
  var volumeTop = chartBottom + 6, volumeBottom = H - marginBottom;

  var allPrices = candles.reduce(function (arr, c) { return arr.concat([c.high, c.low]); }, []).concat(ma5).concat(ma10);
  var minP = Math.min.apply(null, allPrices);
  var maxP = Math.max.apply(null, allPrices);
  var priceRange = Math.max(1, maxP - minP);
  var maxVol = Math.max.apply(null, candles.map(function (c) { return c.volume; }));

  var chartW = chartRight - chartLeft;
  var slot = chartW / candles.length;
  var bodyW = Math.max(4, Math.min(12, slot - 4));

  function yPrice(v) {
    return chartTop + ((maxP - v) / priceRange) * (chartBottom - chartTop);
  }
  function yVol(v) {
    var h = Math.max(2, (v / Math.max(1, maxVol)) * (volumeBottom - volumeTop - 2));
    return volumeBottom - h;
  }

  // ── 网格线（4 条水平线） ──
  var gridCount = 4;
  var gridLines = '';
  var priceLabels = '';
  for (var gi = 0; gi <= gridCount; gi++) {
    var gv = minP + (priceRange * gi / gridCount);
    var gy = yPrice(gv);
    gridLines += '<line x1="' + chartLeft + '" y1="' + gy.toFixed(1) + '" x2="' + chartRight + '" y2="' + gy.toFixed(1) + '" class="kline-grid" />';
    priceLabels += '<text x="' + (chartLeft - 6) + '" y="' + (gy + 3).toFixed(1) + '" class="kline-price-label">' + Math.round(gv) + '</text>';
  }

  // ── 成交量分隔线 ──
  gridLines += '<line x1="' + chartLeft + '" y1="' + volumeTop + '" x2="' + chartRight + '" y2="' + volumeTop + '" class="kline-grid kline-grid-vol" />';

  // ── 成交量柱 ──
  var volBars = candles.map(function (c, i) {
    var cx = chartLeft + i * slot + slot / 2;
    var bx = cx - bodyW / 2;
    var vy = yVol(c.volume);
    var cls = c.close >= c.open ? 'up' : 'down';
    return '<rect x="' + bx.toFixed(1) + '" y="' + vy.toFixed(1) + '" width="' + bodyW.toFixed(1) + '" height="' + (volumeBottom - vy).toFixed(1) + '" class="kline-vol ' + cls + '" />';
  }).join('');

  // ── K 线蜡烛 ──
  var candleSvg = candles.map(function (c, i) {
    var cx = chartLeft + i * slot + slot / 2;
    var bx = cx - bodyW / 2;
    var oY = yPrice(c.open), cY = yPrice(c.close);
    var hY = yPrice(c.high), lY = yPrice(c.low);
    var topBody = Math.min(oY, cY);
    var bH = Math.max(2, Math.abs(cY - oY));
    var cls = c.close >= c.open ? 'up' : 'down';
    return '<line x1="' + cx.toFixed(1) + '" y1="' + hY.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y2="' + lY.toFixed(1) + '" class="kline-wick ' + cls + '" />' +
      '<rect x="' + bx.toFixed(1) + '" y="' + topBody.toFixed(1) + '" width="' + bodyW.toFixed(1) + '" height="' + bH.toFixed(1) + '" rx="1" class="kline-candle ' + cls + '" />';
  }).join('');

  // ── 均线 ──
  function maPath(values, cls) {
    var d = values.map(function (v, i) {
      var x = chartLeft + i * slot + slot / 2;
      var y = yPrice(v);
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<path d="' + d + '" class="kline-ma ' + cls + '" />';
  }
  var maPaths = maPath(ma5, 'kline-ma5') + maPath(ma10, 'kline-ma10');

  // ── 当前价线 ──
  var lastClose = candles[candles.length - 1].close;
  var lastY = yPrice(lastClose);
  var priceLine = '<line x1="' + chartLeft + '" y1="' + lastY.toFixed(1) + '" x2="' + chartRight + '" y2="' + lastY.toFixed(1) + '" class="kline-current-line" />' +
    '<rect x="' + (chartRight - 1) + '" y="' + (lastY - 9).toFixed(1) + '" width="48" height="18" rx="3" class="kline-current-tag-bg" />' +
    '<text x="' + (chartRight + 23) + '" y="' + (lastY + 4).toFixed(1) + '" class="kline-current-tag">' + lastClose + '</text>';

  // ── X 轴日期标签 ──
  var xLabels = '';
  var labelInterval = Math.max(1, Math.floor(candles.length / 6));
  for (var xi = 0; xi < candles.length; xi += labelInterval) {
    var lx = chartLeft + xi * slot + slot / 2;
    xLabels += '<text x="' + lx.toFixed(1) + '" y="' + (H - 6) + '" class="kline-date-label">D' + (xi + 1) + '</text>';
  }

  // ── 边框 ──
  var border = '<rect x="' + chartLeft + '" y="' + chartTop + '" width="' + chartW + '" height="' + (volumeBottom - chartTop) + '" rx="0" class="kline-border" />';

  // ── 组装 ──
  return '<svg class="market-kline-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + goodLabel + ' K线走势图">' +
    border + gridLines + priceLabels +
    volBars + candleSvg + maPaths + priceLine + xLabels +
    '<text x="' + (chartLeft + 4) + '" y="' + (chartTop + 12) + '" class="kline-ma-legend kline-ma5">MA5</text>' +
    '<text x="' + (chartLeft + 36) + '" y="' + (chartTop + 12) + '" class="kline-ma-legend kline-ma10">MA10</text>' +
  '</svg>';
}

function _updateMainKlineChart(state, sysId, snapshots, marketMode) {
  var panel = document.getElementById('market-kline-panel');
  if (!panel) return;

  var focusKey = sysId + ':' + (marketMode || 'open');
  var range = _marketChartRange[focusKey] || 14;
  var focusedId = _focusedMarketGood[focusKey];
  var focused = snapshots.find(function (s) { return s.good.id === focusedId; }) || snapshots[0];
  if (!focused) return;

  var isBlack = marketMode === 'black';
  var history = _normalizeChartHistory(
    Economy.getPriceHistory(sysId, focused.good.id), focused.sellPrice, range
  );
  var candles = _buildPseudoCandles(history);
  var last = candles[candles.length - 1];
  var delta = _formatChartDelta(history);

  // 标题
  var titleEl = document.getElementById('market-kline-title');
  if (titleEl) {
    titleEl.innerHTML = '<span class="kline-title-emoji">' + focused.good.emoji + '</span>' +
      '<span class="kline-title-name">' + focused.good.name + '</span>' +
      '<span class="kline-title-price">' + focused.sellPrice.toLocaleString() + ' CR</span>' +
      '<span class="kline-title-delta ' + delta.className + '">' + delta.text + '</span>';
  }

  // 档期选择
  var rangeBar = document.getElementById('market-kline-range-bar');
  if (rangeBar) {
    rangeBar.innerHTML = MARKET_RANGE_OPTIONS.map(function (d) {
      return '<button class="kline-range-btn' + (d === range ? ' active' : '') + '" data-kline-range="' + d + '">' + d + 'D</button>';
    }).join('');
    rangeBar.querySelectorAll('[data-kline-range]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _marketChartRange[focusKey] = Number(btn.dataset.klineRange);
        _updateMainKlineChart(state, sysId, snapshots, marketMode);
      });
    });
  }

  // OHLC 数据条
  var ohlcEl = document.getElementById('market-kline-ohlc');
  if (ohlcEl) {
    ohlcEl.innerHTML =
      '<span class="kline-ohlc-item">O <em>' + last.open + '</em></span>' +
      '<span class="kline-ohlc-item">H <em>' + last.high + '</em></span>' +
      '<span class="kline-ohlc-item">L <em>' + last.low + '</em></span>' +
      '<span class="kline-ohlc-item">C <em>' + last.close + '</em></span>' +
      '<span class="kline-ohlc-item">Vol <em>' + last.volume + '</em></span>' +
      '<span class="kline-ohlc-item">买卖差 <em>' + focused.spread + '</em></span>';
  }

  // K 线图主体
  var bodyEl = document.getElementById('market-kline-body');
  if (bodyEl) {
    bodyEl.innerHTML = _renderFullKlineChart(history, focused.sellPrice, focused.good.name, range);
  }

  // 底部指标
  var metricsEl = document.getElementById('market-kline-metrics');
  if (metricsEl) {
    var sd = focused.supplyDemand;
    var pressureLabel = sd.ratio > 1.3 ? '追涨区' : (sd.ratio < 0.8 ? '承压区' : '盘整区');
    metricsEl.innerHTML =
      '<span class="kline-metric">供需比 <em>' + sd.ratio.toFixed(2) + 'x</em></span>' +
      '<span class="kline-metric">压力区 <em>' + pressureLabel + '</em></span>' +
      '<span class="kline-metric">波动度 <em>' + focused.swing + '</em></span>' +
      '<span class="kline-metric">' + (isBlack ? '黑市溢价' : '市场模式') + ' <em>' + (isBlack ? '×1.35' : '公开') + '</em></span>';
  }
}

function _buildMarketSnapshots(state, sysId, goodsList, isBlack, range) {
  return goodsList.map(function (good) {
    var buyPrice = isBlack
      ? Economy.getBlackMarketBuyPrice(sysId, good.id, state)
      : Economy.getBuyPrice(sysId, good.id, state);
    var sellPrice = isBlack
      ? Economy.getBlackMarketSellPrice(sysId, good.id, state)
      : Economy.getSellPrice(sysId, good.id, state);
    var history = _normalizeChartHistory(Economy.getPriceHistory(sysId, good.id), sellPrice, range);
    var delta = _formatChartDelta(history);
    var swing = history.reduce(function (acc, value, index) {
      if (index === 0) return 0;
      return acc + Math.abs(value - history[index - 1]);
    }, 0);
    return {
      good: good,
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      history: history,
      delta: delta,
      swing: swing,
      spread: Math.max(0, buyPrice - sellPrice),
      supplyDemand: Economy.getSupplyDemand(sysId, good.id),
    };
  });
}

function _renderMarketDashboard(state, sysId, marketMode, snapshots) {
  var container = document.getElementById('market-terminal-dashboard');
  if (!container) return;
  if (!snapshots || snapshots.length === 0) {
    container.innerHTML = '';
    return;
  }

  var focusKey = sysId + ':' + marketMode;
  var selectedRange = _marketChartRange[focusKey] || 14;
  var focusedGoodId = _focusedMarketGood[focusKey];
  if (!focusedGoodId || !snapshots.some(function (entry) { return entry.good.id === focusedGoodId; })) {
    focusedGoodId = snapshots[0].good.id;
    _focusedMarketGood[focusKey] = focusedGoodId;
  }

  var focused = snapshots.find(function (entry) { return entry.good.id === focusedGoodId; }) || snapshots[0];
  var gainers = snapshots.slice().sort(function (a, b) {
    return parseFloat(b.delta.text) - parseFloat(a.delta.text);
  }).slice(0, 3);
  var losers = snapshots.slice().sort(function (a, b) {
    return parseFloat(a.delta.text) - parseFloat(b.delta.text);
  }).slice(0, 3);
  var hotList = snapshots.slice().sort(function (a, b) {
    return b.swing - a.swing;
  }).slice(0, 3);
  var pressureLabel = focused.supplyDemand.ratio > 1.3 ? '追涨区' : (focused.supplyDemand.ratio < 0.8 ? '承压区' : '盘整区');

  function renderList(title, items, className) {
    return '<div class="market-terminal-side-card">' +
      '<div class="market-terminal-side-title">' + title + '</div>' +
      items.map(function (entry) {
        return '<button class="market-terminal-rank-row" data-focus-good="' + entry.good.id + '">' +
          '<span class="market-terminal-rank-name">' + entry.good.emoji + ' ' + entry.good.name + '</span>' +
          '<span class="market-terminal-rank-value ' + className + '">' + entry.delta.text + '</span>' +
        '</button>';
      }).join('') +
    '</div>';
  }

  container.innerHTML = '<section class="market-terminal-hero">' +
    '<div class="market-terminal-main">' +
      '<div class="market-terminal-head">' +
        '<div>' +
          '<div class="market-terminal-title">' + focused.good.emoji + ' ' + focused.good.name + '</div>' +
          '<div class="market-terminal-subtitle">' + (marketMode === 'black' ? '黑市盘口' : '公开市场盘口') + ' · ' + pressureLabel + ' · 点选下方商品可切换图表</div>' +
        '</div>' +
        '<div class="market-terminal-price-wrap">' +
          '<div class="market-terminal-price">' + focused.sellPrice.toLocaleString() + '</div>' +
          '<div class="market-terminal-price-delta ' + focused.delta.className + '">' + focused.delta.text + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="market-terminal-toolbar">' +
        '<div class="market-terminal-range-group">' + MARKET_RANGE_OPTIONS.map(function (days) {
          return '<button class="market-terminal-range-btn' + (days === selectedRange ? ' active' : '') + '" data-range="' + days + '">' + days + '天</button>';
        }).join('') + '</div>' +
        '<div class="market-terminal-toolbar-note">统计窗口：近 ' + selectedRange + ' 天</div>' +
      '</div>' +
      '<div class="market-terminal-chart-wrap">' +
        _renderMarketChart(focused.history, focused.sellPrice, focused.good.name, {
          width: 340,
          height: 164,
          topPad: 12,
          chartBottom: 122,
          volumeBase: 154,
          className: 'market-hero-chart',
        }) +
      '</div>' +
      '<div class="market-terminal-metrics">' +
        '<div class="market-terminal-metric"><span>买卖价差</span><strong>' + focused.spread.toLocaleString() + '</strong></div>' +
        '<div class="market-terminal-metric"><span>需求/供给</span><strong>' + focused.supplyDemand.ratio.toFixed(2) + 'x</strong></div>' +
        '<div class="market-terminal-metric"><span>波动热度</span><strong>' + focused.swing.toLocaleString() + '</strong></div>' +
      '</div>' +
    '</div>' +
    '<div class="market-terminal-side">' +
      renderList('📈 涨幅榜', gainers, 'market-chart-up') +
      renderList('📉 跌幅榜', losers, 'market-chart-down') +
      renderList('⚡ 热门波动', hotList, 'market-chart-flat') +
    '</div>' +
  '</section>';

  container.querySelectorAll('[data-focus-good]').forEach(function (button) {
    button.addEventListener('click', function () {
      _focusedMarketGood[focusKey] = button.dataset.focusGood;
      _renderMarketDashboard(state, sysId, marketMode, snapshots);
      var activeRow = document.querySelector('[data-market-good="' + button.dataset.focusGood + '"]');
      if (activeRow && typeof activeRow.scrollIntoView === 'function') {
        activeRow.scrollIntoView({ block: 'nearest' });
      }
    });
  });

  container.querySelectorAll('[data-range]').forEach(function (button) {
    button.addEventListener('click', function () {
      _marketChartRange[focusKey] = Math.max(7, Math.min(30, Math.floor(Number(button.dataset.range) || 14)));
      var updatedSnapshots = _buildMarketSnapshots(
        state,
        sysId,
        marketMode === 'black' ? Economy.getBlackMarketGoods() : GOODS,
        marketMode === 'black',
        _marketChartRange[focusKey]
      );
      _renderMarketDashboard(state, sysId, marketMode, updatedSnapshots);
      _updateMainKlineChart(state, sysId, updatedSnapshots, marketMode);
    });
  });
}

function _getStockPriceDelta(listing) {
  var lastPrice = listing.lastPrice || listing.price || 0;
  return (listing.price || 0) - lastPrice;
}

function _sortStockListings(listings, systemId) {
  return listings.slice().sort(function (a, b) {
    var aPriority = a.systemId === systemId ? 0 : 1;
    var bPriority = b.systemId === systemId ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return (b.price || 0) - (a.price || 0);
  });
}

// ---------------------------------------------------------------------------
// 产业链提示
// ---------------------------------------------------------------------------
function _supplyChainTooltip(good) {
  if (!good.upstream || good.upstream.length === 0) return '';
  var deps = good.upstream.map(function (dep) {
    var upGood = GOODS.find(function (g) { return g.id === dep.goodId; });
    return (upGood ? upGood.emoji + upGood.name : dep.goodId) + '(' + Math.round(dep.weight * 100) + '%)';
  }).join(', ');
  return '🔗 依赖: ' + deps;
}

function _marketAccessLabel(good) {
  if (!good.marketAccess || good.marketAccess.indexOf('black') === -1) return '';
  if (good.legality === 'illegal') return '☠ 黑市货';
  return '🕶 灰市货';
}

function _legalityTooltip(good) {
  if (good.legality === 'illegal') return '仅可在黑市安全流通';
  if (good.legality === 'restricted') return '受监管商品，在黑市需求更高';
  return '';
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

function _getManagerBatchPlan(state, ownedStations, manager) {
  var targets = ownedStations.filter(function (entry) {
    return entry.station.managerId !== manager.id;
  });
  var affordableCount = Math.min(targets.length, Math.floor((state.credits || 0) / Math.max(1, manager.hireCost)));
  var plannedTargets = targets.map(function (entry) {
    return Object.assign({}, entry, { planCost: manager.hireCost });
  });
  return {
    targetCount: targets.length,
    affordableCount: affordableCount,
    affordableCost: affordableCount * manager.hireCost,
    totalCost: targets.length * manager.hireCost,
    targets: plannedTargets,
    affordableTargets: plannedTargets.slice(0, affordableCount),
    deferredTargets: plannedTargets.slice(affordableCount),
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
    } else if (scope === 'manager') {
      if (activeMode === 'income') {
        diff = (b.projectedIncome || 0) - (a.projectedIncome || 0);
        if (diff !== 0) return diff;
        diff = (b.station && b.station.level || 0) - (a.station && a.station.level || 0);
      } else if (activeMode === 'level') {
        diff = (b.station && b.station.level || 0) - (a.station && a.station.level || 0);
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
      note: '殖利率 ' + ((target.expectedYieldRate || 0) * 100).toFixed(2) + '% · 已投 ' + Math.floor(target.investedAmount || 0).toLocaleString() + ' · 本轮 +' + Math.floor(target.planCost || 0).toLocaleString(),
    };
  };
  var renderUpgradeTargetMeta = function (target) {
    return {
      title: target.system.name + ' · Lv.' + target.station.level,
      note: '升级 +' + Math.floor(target.planCost || 0).toLocaleString() + ' · 日收益 +' + Math.floor(target.projectedIncome || 0).toLocaleString() + ' · 下一档 ' + (target.nextLevel ? target.nextLevel.name : '已满级'),
    };
  };
  var managerPlans = TRADE_STATION_MANAGERS.map(function (manager) {
    var basePlan = _getManagerBatchPlan(state, ownedStations, manager);
    return {
      manager: manager,
      plan: _getSortedBatchPlan('manager', basePlan, state.credits || 0),
    };
  });
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
  ].filter(Boolean).length + managerPlans.filter(function (entry) {
    return entry.plan.affordableTargets.length > 0;
  }).length + strategyPlans.filter(function (entry) {
    return entry.plan.affordableTargets.length > 0;
  }).length;

  return '<section class="market-finance-section market-batch-plan-panel">' +
    '<div class="market-finance-section-head market-batch-plan-head">' +
      '<div>' +
        '<div class="market-finance-title">🧭 批量计划面板</div>' +
        '<div class="market-finance-subtitle">先审阅覆盖站点、单站成本和预算缺口，再决定是否执行波次。所有按钮都会按当前计划中的系统清单下发，而不是对全网盲发广播。</div>' +
      '</div>' +
      '<span class="market-finance-chip">待命波次 ' + readyWaveCount + '</span>' +
    '</div>' +
    '<div class="market-batch-plan-summary-strip">' +
      '<span class="market-batch-plan-summary-pill">可用信用积分<strong>' + Math.floor(state.credits || 0).toLocaleString() + '</strong></span>' +
      '<span class="market-batch-plan-summary-pill">可控站点<strong>' + ownedStations.length + '</strong></span>' +
      '<span class="market-batch-plan-summary-pill">资本待命<strong>' + investmentPlan.affordableTargets.length + '</strong></span>' +
      '<span class="market-batch-plan-summary-pill">升级待命<strong>' + upgradePlan.affordableTargets.length + '</strong></span>' +
    '</div>' +
    '<div class="market-batch-plan-grid market-batch-plan-grid-major">' +
      _renderBatchPlanCard({
        title: '资本增配波次',
        subtitle: '殖利率优先',
        badge: investmentPlan.affordableTargets.length > 0 ? '可执行' : '待预算',
        description: '按站点预估殖利率从高到低排序，先把本轮预算打到回报更高的节点。',
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
          ? '将按预估顺序依次向这些节点追加资金。'
          : '当前预算不足以覆盖任何增配节点。',
        actionLabel: investmentPlan.affordableTargets.length > 0
          ? ('执行 ' + investmentPlan.affordableTargets.length + ' 站增配')
          : '暂无可执行增配',
        action: 'market-batch-invest-trade-stations',
        actionableSystemIds: investmentPlan.affordableTargets.map(function (target) { return target.systemId; }),
        buttonAttrs: ' data-batch-amount="' + Math.floor(investmentPlan.amountPerTarget || 0) + '"',
        toneClass: 'tone-cool',
      }) +
      _renderBatchPlanCard({
        title: '商网升级波次',
        subtitle: '收益优先',
        badge: upgradePlan.affordableTargets.length > 0 ? '可执行' : '待预算',
        description: '按预计日收益从高到低排序，先给最能放大现金流的站点做等级升级。',
        sortMarkup: _renderBatchPlanSortToolbar('upgrade', '排序视角'),
        metrics: [
          _renderBatchPlanMetric('覆盖', upgradePlan.affordableCount + '/' + upgradePlan.targetCount, '待升级 ' + upgradePlan.targetCount + ' 站，本轮可升级 ' + upgradePlan.affordableCount + ' 站。'),
          _renderBatchPlanMetric('已预留', Math.floor(upgradePlan.affordableCost || 0).toLocaleString(), '当前可覆盖升级成本。'),
          _renderBatchPlanMetric('全量需求', Math.floor(upgradePlan.totalCost || 0).toLocaleString(), '超出预算的站点会留在下轮波次。'),
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
      '<div class="market-batch-plan-lane-title">👤 人事波次</div>' +
      _renderBatchPlanSortToolbar('manager', '排序视角') +
      '<div class="market-batch-plan-grid">' +
        managerPlans.map(function (entry) {
          var manager = entry.manager;
          var plan = entry.plan;
          var renderManagerTargetMeta = function (target) {
            return {
              title: target.system.name,
              note: '当前 ' + (target.manager ? target.manager.name : '未配置') + ' · 日收益 +' + Math.floor(target.projectedIncome || 0).toLocaleString() + ' · 本轮 +' + Math.floor(target.planCost || 0).toLocaleString(),
            };
          };
          return _renderBatchPlanCard({
            title: manager.name,
            subtitle: '批量经理指派',
            badge: plan.affordableTargets.length > 0 ? '可执行' : (plan.targetCount > 0 ? '待预算' : '已同步'),
            description: '先看当前收益更高的站点，再决定是否让同一位经理接管整轮目标。',
            metrics: [
              _renderBatchPlanMetric('覆盖', plan.affordableCount + '/' + plan.targetCount, '需切换 ' + plan.targetCount + ' 站，本轮可派驻 ' + plan.affordableCount + ' 站。'),
              _renderBatchPlanMetric('单站成本', Math.floor(manager.hireCost || 0).toLocaleString(), '按经理雇佣费逐站扣款。'),
              _renderBatchPlanMetric('预算', Math.floor(plan.affordableCost || 0).toLocaleString(), '全量需求 ' + Math.floor(plan.totalCost || 0).toLocaleString() + '。'),
            ],
            coverageTargets: plan.affordableTargets,
            renderTargetMeta: renderManagerTargetMeta,
            deferredMarkup: _renderBatchPlanDeferredNote(plan.deferredTargets, renderManagerTargetMeta, '预算后置'),
            footerNote: plan.targetCount === 0
              ? '全网已完成该经理配置。'
              : (plan.affordableTargets.length > 0 ? '执行后只会指派预览中的站点。' : '当前预算不足，无法启动这轮派驻。'),
            actionLabel: plan.affordableTargets.length > 0
              ? ('派驻 ' + manager.name + ' 至 ' + plan.affordableTargets.length + ' 站')
              : '暂无可执行派驻',
            action: 'market-batch-hire-manager',
            actionableSystemIds: plan.affordableTargets.map(function (target) { return target.station.systemId; }),
            buttonAttrs: ' data-manager-id="' + manager.id + '"',
          });
        }).join('') +
      '</div>' +
    '</div>' +
    '<div class="market-batch-plan-lane">' +
      '<div class="market-batch-plan-lane-title">📈 策略波次</div>' +
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
            subtitle: '全网策略同步',
            badge: plan.targetCount > 0 ? '可执行' : '已同步',
            description: '策略切换不消耗积分，但会立即重排整张商网的经营重心。',
            metrics: [
              _renderBatchPlanMetric('覆盖', String(plan.targetCount), '本轮需要切换的站点数量。'),
              _renderBatchPlanMetric('收益系数', Math.round((strategy.incomeMultiplier || 1) * 100) + '%', '用于判断这轮策略的方向性。'),
              _renderBatchPlanMetric('预算', '0', '策略同步不占用额外信用积分。'),
            ],
            coverageTargets: plan.affordableTargets,
            renderTargetMeta: renderStrategyTargetMeta,
            footerNote: plan.targetCount > 0
              ? '执行后会只同步预览中的站点。'
              : '全网已处于这套经营策略。',
            actionLabel: plan.targetCount > 0
              ? ('同步 ' + plan.targetCount + ' 站策略')
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

function _renderCapitalCommandDeck(viewingSystem, isCurrentSys, financeOverview, commerceSnapshot, stockListings, openContracts) {
  var system = findSystem(viewingSystem);
  var systemLabel = system ? (system.name + ' · ' + system.typeLabel) : viewingSystem;
  var leadingStock = stockListings[0] || null;
  var topContract = openContracts.slice().sort(function (a, b) {
    return Math.abs(b.unrealizedPnl || 0) - Math.abs(a.unrealizedPnl || 0);
  })[0] || null;
  var localModeLabel = isCurrentSys ? '本地可调度' : '远程观察';
  var localModeNote = isCurrentSys
    ? '贷款、保险和本地投资现在都能立刻落单。'
    : '当前只适合审阅资产和风险敞口，落地后才能执行本地动作。';

  return '<section class="market-workspace-deck market-capital-deck">' +
    '<div class="market-workspace-deck-hero">' +
      '<div class="market-workspace-deck-copy">' +
        '<div class="market-workspace-deck-kicker">Capital Control</div>' +
        '<div class="market-workspace-deck-title">资本指挥台 · ' + localModeLabel + '</div>' +
        '<div class="market-workspace-deck-summary">资本页只处理资金成本、风险保障和证券仓位，不再和现货交易抢同一层注意力。先看债务和保险，再决定是否扩张股票与期货仓位。</div>' +
      '</div>' +
      '<div class="market-workspace-deck-emphasis">' +
        '<span class="market-workspace-deck-emphasis-label">当前状态</span>' +
        '<strong>' + localModeLabel + '</strong>' +
        '<span class="market-workspace-deck-emphasis-note">' + localModeNote + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="market-workspace-deck-grid">' +
      _renderWorkspaceDeckMetric('贷款敞口', Math.floor(financeOverview.outstandingLoanBalance || 0).toLocaleString(), '活跃贷款 ' + (financeOverview.activeLoanCount || 0) + ' 笔，信用评级 ' + (commerceSnapshot.creditRating || financeOverview.creditRating || 0) + '。') +
      _renderWorkspaceDeckMetric('股票市值', Math.floor(financeOverview.stockValue || 0).toLocaleString(), leadingStock ? ('优先标的 ' + leadingStock.name + ' · 现价 ' + Math.floor(leadingStock.price || 0).toLocaleString()) : '当前没有持仓或可用领涨标的。', 'tone-cool') +
      _renderWorkspaceDeckMetric('保险覆盖', String(financeOverview.activePolicies || 0), '待处理理赔 ' + (financeOverview.pendingClaims || 0) + ' 单，适合先处理风险缺口。', 'tone-neutral') +
      _renderWorkspaceDeckMetric('期货仓位', String(openContracts.length), topContract ? ('盯住 ' + topContract.goodName + ' · 浮盈 ' + ((topContract.unrealizedPnl || 0) >= 0 ? '+' : '') + Math.floor(topContract.unrealizedPnl || 0).toLocaleString()) : '当前没有未平仓合约。', 'tone-warm') +
    '</div>' +
    '<div class="market-workspace-deck-strip">' +
      _renderWorkspaceDeckPill('节点', systemLabel) +
      _renderWorkspaceDeckPill('信用评级', String(commerceSnapshot.creditRating || financeOverview.creditRating || 0), 'tone-cool') +
      _renderWorkspaceDeckPill('活跃贷款', String(financeOverview.activeLoanCount || 0)) +
      _renderWorkspaceDeckPill('在保保单', String(financeOverview.activePolicies || 0)) +
      _renderWorkspaceDeckPill('待处理理赔', String(financeOverview.pendingClaims || 0), (financeOverview.pendingClaims || 0) > 0 ? 'tone-warm' : '') +
      _renderWorkspaceDeckPill('股票标的', String(stockListings.length)) +
      _renderWorkspaceDeckPill('期货合约', String(openContracts.length)) +
    '</div>' +
  '</section>';
}

function _renderCapitalSignalMetric(label, value, note, toneClass) {
  return '<div class="market-capital-signal-item' + (toneClass ? ' ' + toneClass : '') + '" role="listitem">' +
    '<span class="market-capital-signal-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="market-capital-signal-value">' + _escapeHtml(value) + '</strong>' +
    '<span class="market-capital-signal-note">' + _escapeHtml(note) + '</span>' +
  '</div>';
}

function _renderCapitalSignalPanel(state, financeOverview, stockListings, openContracts, activeLoans, isCurrentSys) {
  var credits = Math.floor((state && state.credits) || 0);
  var heldStocks = (stockListings || []).filter(function (listing) {
    return (listing.shares || 0) > 0;
  });
  var heldShares = heldStocks.reduce(function (sum, listing) {
    return sum + (listing.shares || 0);
  }, 0);
  var totalUnrealizedPnl = (openContracts || []).reduce(function (sum, contract) {
    return sum + (contract.unrealizedPnl || 0);
  }, 0);
  var totalMarginLocked = (openContracts || []).reduce(function (sum, contract) {
    return sum + (contract.margin || 0);
  }, 0);
  var expiringSoonCount = (openContracts || []).filter(function (contract) {
    return (contract.daysLeft || 0) <= 2;
  }).length;
  var debtBalance = Math.floor((financeOverview && financeOverview.outstandingLoanBalance) || 0);
  var activeLoanCount = activeLoans ? activeLoans.length : ((financeOverview && financeOverview.activeLoanCount) || 0);
  var pendingClaimCount = (financeOverview && financeOverview.pendingClaims) || 0;
  var stockValue = Math.floor((financeOverview && financeOverview.stockValue) || 0);
  var stockNote = heldStocks.length > 0
    ? (heldStocks.length + ' 个标的 · ' + heldShares + ' 股')
    : ((stockListings && stockListings.length > 0) ? ('可观察 ' + stockListings.length + ' 个标的') : '暂无可交易股票');
  var futuresPnlText = (totalUnrealizedPnl >= 0 ? '+' : '') + Math.floor(totalUnrealizedPnl).toLocaleString();
  var focusTitle = '资本空仓观察';
  var focusNote = '当前没有明显债务、理赔或衍生品压力，适合先复核本地资本调度区。';
  var focusTone = 'idle';

  if (!isCurrentSys) {
    focusTitle = '远程审阅模式';
    focusNote = '当前节点只能查看资产和风险轮廓，抵达后再开放贷款、保险与本地投资动作。';
    focusTone = 'watch';
  } else if (debtBalance > 0 && debtBalance >= Math.max(1, credits) * 0.75) {
    focusTitle = '贷款现金流承压';
    focusNote = '未结清贷款接近或超过可用现金，先在本地资本调度区检查还款节奏。';
    focusTone = 'debt';
  } else if ((openContracts || []).length > 0 && totalUnrealizedPnl < 0) {
    focusTitle = '期货浮亏承压';
    focusNote = '未平仓合约合计浮亏 ' + futuresPnlText + '，适合先复核保证金和临近到期合约。';
    focusTone = 'risk';
  } else if (expiringSoonCount > 0) {
    focusTitle = '合约临近结算';
    focusNote = expiringSoonCount + ' 份合约将在 2 天内到期，期货列表里可直接查看锁定价与当前价。';
    focusTone = 'risk';
  } else if (pendingClaimCount > 0) {
    focusTitle = '理赔等待入账';
    focusNote = pendingClaimCount + ' 单理赔处理中，风险保障区可复核预计到账。';
    focusTone = 'claim';
  } else if (heldStocks.length > 0) {
    focusTitle = '股票持仓活跃';
    focusNote = '当前股票仓位覆盖 ' + heldStocks.length + ' 个标的，优先比较市值和日波动。';
    focusTone = 'stock';
  } else if (credits > 0) {
    focusTitle = '现金等待配置';
    focusNote = '可用现金 ' + credits.toLocaleString() + '，资本页可按贷款、保险、股票和期货分区复核。';
    focusTone = 'cash';
  }

  return '<section class="market-capital-signal-panel" aria-label="资本市场局部态势">' +
    '<div class="market-capital-signal-head">' +
      '<div>' +
        '<div class="market-capital-signal-title">资本态势矩阵</div>' +
        '<div class="market-capital-signal-subtitle">先把现金、持仓、期货和债务压成一屏，再进入下方分区操作。</div>' +
      '</div>' +
      '<span class="market-finance-chip">' + (isCurrentSys ? '本地可执行' : '远程审阅') + '</span>' +
    '</div>' +
    '<div class="market-capital-signal-grid" role="list" aria-label="资本市场态势矩阵">' +
      _renderCapitalSignalMetric('可用现金', credits.toLocaleString(), '执行贷款、保险、证券动作前的即时预算。', credits > 0 ? 'tone-cool' : '') +
      _renderCapitalSignalMetric('股票持仓', stockValue.toLocaleString(), stockNote, heldStocks.length > 0 ? 'tone-cool' : '') +
      _renderCapitalSignalMetric('期货敞口', String((openContracts || []).length), '保证金 ' + Math.floor(totalMarginLocked).toLocaleString() + ' · 浮盈亏 ' + futuresPnlText, totalUnrealizedPnl < 0 ? 'tone-hot' : ((openContracts || []).length > 0 ? 'tone-warm' : '')) +
      _renderCapitalSignalMetric('债务/理赔', activeLoanCount + ' / ' + pendingClaimCount, '贷款余额 ' + debtBalance.toLocaleString() + ' · 待理赔 ' + pendingClaimCount + ' 单', debtBalance > 0 || pendingClaimCount > 0 ? 'tone-warm' : '') +
    '</div>' +
    '<div class="market-capital-focus" aria-label="资本局部信号" data-tone="' + _escapeHtmlAttr(focusTone) + '">' +
      '<span class="market-capital-focus-kicker">局部信号</span>' +
      '<strong class="market-capital-focus-title">' + _escapeHtml(focusTitle) + '</strong>' +
      '<span class="market-capital-focus-note">' + _escapeHtml(focusNote) + '</span>' +
    '</div>' +
  '</section>';
}

function _renderCapitalLocalMetric(label, value, note, toneClass) {
  return '<div class="market-capital-local-item' + (toneClass ? ' ' + toneClass : '') + '" role="listitem">' +
    '<span class="market-capital-local-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="market-capital-local-value">' + _escapeHtml(value) + '</strong>' +
    '<span class="market-capital-local-note">' + _escapeHtml(note) + '</span>' +
  '</div>';
}

function _renderCapitalLocalGuardPanel(state, activeLoans, loanOffers, insuranceProducts, pendingClaims, isCurrentSys) {
  var credits = Math.floor((state && state.credits) || 0);
  var loans = activeLoans || [];
  var products = insuranceProducts || [];
  var claims = pendingClaims || [];
  var loanBalance = loans.reduce(function (sum, loan) {
    return sum + Math.max(0, loan.balance || 0);
  }, 0);
  var dailyPayment = loans.reduce(function (sum, loan) {
    return sum + Math.max(0, loan.dailyPayment || 0);
  }, 0);
  var activePolicies = products.filter(function (product) {
    return !!product.active;
  });
  var activeCoverage = activePolicies.reduce(function (sum, product) {
    return sum + Math.max(0, product.coverage || 0);
  }, 0);
  var claimableAmount = products.reduce(function (sum, product) {
    return sum + Math.max(0, product.claimableAmount || 0);
  }, 0);
  var pendingClaimAmount = claims.reduce(function (sum, claim) {
    return sum + Math.max(0, claim.approvedAmount || 0);
  }, 0);
  var availableOfferCount = (loanOffers || []).filter(function (offer) {
    return !!offer.available;
  }).length;
  var runwayDays = dailyPayment > 0 ? Math.floor(credits / dailyPayment) : null;
  var focusTitle = '本地资金防线待配置';
  var focusNote = '当前没有贷款、有效保单或待处理理赔，可直接比较下方报价与保障范围。';
  var focusTone = 'idle';

  if (!isCurrentSys) {
    focusTitle = '远程只读观察';
    focusNote = '当前可查看债务和保障轮廓，贷款、投保与理赔动作需要抵达节点后执行。';
    focusTone = 'watch';
  } else if (claims.length > 0) {
    focusTitle = '理赔回款待入账';
    focusNote = claims.length + ' 笔理赔正在处理，预计回款 ' + Math.floor(pendingClaimAmount).toLocaleString() + '。';
    focusTone = 'claim';
  } else if (dailyPayment > credits && dailyPayment > 0) {
    focusTitle = '当日偿付存在缺口';
    focusNote = '每日扣款 ' + Math.floor(dailyPayment).toLocaleString() + ' 已超过可用现金，债务压力处于高位。';
    focusTone = 'risk';
  } else if (loanBalance > 0 && loanBalance >= Math.max(1, credits) * 0.75) {
    focusTitle = '债务现金流承压';
    focusNote = '贷款余额 ' + Math.floor(loanBalance).toLocaleString() + ' 接近或超过可用现金，偿付窗口约 ' + runwayDays + ' 天。';
    focusTone = 'debt';
  } else if (claimableAmount > 0) {
    focusTitle = '存在可申报损失';
    focusNote = '当前保单合计可申报 ' + Math.floor(claimableAmount).toLocaleString() + '，下方险种已开放理赔动作。';
    focusTone = 'claim';
  } else if (activePolicies.length === 0) {
    focusTitle = '保障覆盖为空';
    focusNote = '当前没有生效保单，可在风险保障列比较保费、保额与可赔范围。';
    focusTone = 'watch';
  } else if (loans.length > 0) {
    focusTitle = '偿付节奏可控';
    focusNote = '每日扣款 ' + Math.floor(dailyPayment).toLocaleString() + '，现有现金约可覆盖 ' + runwayDays + ' 天。';
    focusTone = 'active';
  } else {
    focusTitle = '保障结构稳定';
    focusNote = activePolicies.length + ' 份保单生效中，当前没有债务或待处理理赔。';
    focusTone = 'stable';
  }

  return '<section class="market-capital-local-panel" aria-label="本地资金防线局部态势">' +
    '<div class="market-capital-local-head">' +
      '<div>' +
        '<div class="market-capital-local-title">本地资金防线</div>' +
        '<div class="market-capital-local-subtitle">先核对每日偿付、有效保障和理赔回款，再处理下方贷款与保险动作。</div>' +
      '</div>' +
      '<span class="market-capital-local-badge">' + (isCurrentSys ? '本地可执行' : '远程只读') + '</span>' +
    '</div>' +
    '<div class="market-capital-local-grid" role="list" aria-label="本地资金防线指标">' +
      _renderCapitalLocalMetric('贷款余额', Math.floor(loanBalance).toLocaleString(), loans.length + ' 笔未结清 · 可用报价 ' + availableOfferCount + ' 个', loanBalance > 0 ? 'tone-warm' : '') +
      _renderCapitalLocalMetric('每日偿付', Math.floor(dailyPayment).toLocaleString(), runwayDays === null ? '当前没有固定日扣款' : ('现金约覆盖 ' + runwayDays + ' 天'), dailyPayment > credits ? 'tone-hot' : (dailyPayment > 0 ? 'tone-warm' : '')) +
      _renderCapitalLocalMetric('有效保障', String(activePolicies.length), '合计保额 ' + Math.floor(activeCoverage).toLocaleString(), activePolicies.length > 0 ? 'tone-cool' : '') +
      _renderCapitalLocalMetric('理赔状态', String(claims.length), claims.length > 0 ? ('预计回款 ' + Math.floor(pendingClaimAmount).toLocaleString()) : ('当前可申报 ' + Math.floor(claimableAmount).toLocaleString()), claims.length > 0 || claimableAmount > 0 ? 'tone-cool' : '') +
    '</div>' +
    '<div class="market-capital-local-focus" aria-label="本地资金局部信号" data-tone="' + _escapeHtmlAttr(focusTone) + '">' +
      '<span class="market-capital-local-focus-kicker">局部信号</span>' +
      '<strong class="market-capital-local-focus-title">' + _escapeHtml(focusTitle) + '</strong>' +
      '<span class="market-capital-local-focus-note">' + _escapeHtml(focusNote) + '</span>' +
    '</div>' +
  '</section>';
}

function _renderFuturesRiskMetric(label, value, note, toneClass) {
  return '<div class="market-futures-risk-item ' + _escapeHtmlAttr(toneClass || 'tone-neutral') + '" role="listitem">' +
    '<span class="market-futures-risk-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="market-futures-risk-value">' + _escapeHtml(value) + '</strong>' +
    '<span class="market-futures-risk-note">' + _escapeHtml(note || '') + '</span>' +
  '</div>';
}

function _renderStockPositionMetric(label, value, note, toneClass) {
  return '<div class="market-stock-position-item ' + _escapeHtmlAttr(toneClass || 'tone-neutral') + '" role="listitem">' +
    '<span class="market-stock-position-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="market-stock-position-value">' + _escapeHtml(value) + '</strong>' +
    '<span class="market-stock-position-note">' + _escapeHtml(note || '') + '</span>' +
  '</div>';
}

function _renderStockPositionPanel(state, stockListings, viewingSystem) {
  var listings = Array.isArray(stockListings) ? stockListings : [];
  var heldListings = listings.filter(function (listing) { return (listing.shares || 0) > 0; });
  var totalShares = heldListings.reduce(function (sum, listing) { return sum + (listing.shares || 0); }, 0);
  var marketValue = heldListings.reduce(function (sum, listing) {
    return sum + (listing.price || 0) * (listing.shares || 0);
  }, 0);
  var costBasis = heldListings.reduce(function (sum, listing) {
    return sum + (listing.avgCost || 0) * (listing.shares || 0);
  }, 0);
  var unrealizedPnl = marketValue - costBasis;
  var totalDividends = heldListings.reduce(function (sum, listing) {
    return sum + (listing.totalDividends || 0);
  }, 0);
  var dailyMove = heldListings.reduce(function (sum, listing) {
    return sum + _getStockPriceDelta(listing) * (listing.shares || 0);
  }, 0);
  var risingCount = heldListings.filter(function (listing) { return _getStockPriceDelta(listing) > 0; }).length;
  var fallingCount = heldListings.filter(function (listing) { return _getStockPriceDelta(listing) < 0; }).length;
  var localListing = listings.find(function (listing) { return listing.systemId === viewingSystem; }) || null;
  var affordableListing = listings.filter(function (listing) {
    return (listing.price || 0) <= ((state && state.credits) || 0);
  }).sort(function (left, right) {
    return (left.price || 0) - (right.price || 0);
  })[0] || null;
  var weakestHolding = heldListings.reduce(function (weakest, listing) {
    var pnl = ((listing.price || 0) - (listing.avgCost || 0)) * (listing.shares || 0);
    if (!weakest || pnl < weakest.pnl) return { listing: listing, pnl: pnl };
    return weakest;
  }, null);
  var focusTitle = '股票空仓观察';
  var focusNote = affordableListing
    ? ('当前现金可覆盖 ' + affordableListing.name + ' 1 股，先比较本地指数和日波动。')
    : '当前现金不足以买入最小标的，先观察价格变化。';
  var focusTone = affordableListing ? 'cash' : 'watch';

  if (unrealizedPnl < 0 && weakestHolding) {
    focusTitle = '持仓浮亏承压';
    focusNote = weakestHolding.listing.name + ' 当前浮亏 ' + weakestHolding.pnl.toLocaleString() + '，先复核均价和日波动。';
    focusTone = 'risk';
  } else if (dailyMove < 0 && heldListings.length > 0) {
    focusTitle = '持仓日内回落';
    focusNote = '当前持仓日变动 ' + dailyMove.toLocaleString() + '，下跌标的 ' + fallingCount + ' 个。';
    focusTone = 'watch';
  } else if (unrealizedPnl > 0) {
    focusTitle = '持仓浮盈可观察';
    focusNote = '当前持仓浮盈 +' + unrealizedPnl.toLocaleString() + '，可对照上涨标的决定是否减仓。';
    focusTone = 'gain';
  } else if (heldListings.length > 0) {
    focusTitle = '持仓结构稳定';
    focusNote = '当前持有 ' + heldListings.length + ' 个标的，共 ' + totalShares + ' 股，继续观察日波动。';
    focusTone = 'active';
  }

  return '<section class="market-stock-position-panel" aria-label="股票持仓局部态势">' +
    '<div class="market-stock-position-head">' +
      '<div>' +
        '<div class="market-stock-position-title">股票持仓态势</div>' +
        '<div class="market-stock-position-subtitle">先核对仓位、市值、成本和日变动，再进入单个标的操作。</div>' +
      '</div>' +
      '<span class="market-stock-position-badge">' + _escapeHtml(localListing ? '本地指数在线' : '全市场观察') + '</span>' +
    '</div>' +
    '<div class="market-stock-position-grid" role="list" aria-label="股票持仓指标">' +
      _renderStockPositionMetric('持仓', String(heldListings.length), totalShares + ' 股 · ' + listings.length + ' 个可观察标的', heldListings.length > 0 ? 'tone-active' : 'tone-neutral') +
      _renderStockPositionMetric('市值', Math.floor(marketValue).toLocaleString(), '成本 ' + Math.floor(costBasis).toLocaleString(), marketValue > 0 ? 'tone-active' : 'tone-neutral') +
      _renderStockPositionMetric('浮动收益', (unrealizedPnl >= 0 ? '+' : '') + Math.floor(unrealizedPnl).toLocaleString(), '累计股息 ' + Math.floor(totalDividends).toLocaleString(), unrealizedPnl < 0 ? 'tone-hot' : (unrealizedPnl > 0 ? 'tone-cool' : 'tone-neutral')) +
      _renderStockPositionMetric('日变动', (dailyMove >= 0 ? '+' : '') + Math.floor(dailyMove).toLocaleString(), '上涨 ' + risingCount + ' / 下跌 ' + fallingCount, dailyMove < 0 ? 'tone-warm' : (dailyMove > 0 ? 'tone-cool' : 'tone-neutral')) +
    '</div>' +
    '<div class="market-stock-position-focus" aria-label="股票局部信号" data-tone="' + _escapeHtmlAttr(focusTone) + '">' +
      '<span class="market-stock-position-focus-kicker">局部信号</span>' +
      '<strong class="market-stock-position-focus-title">' + _escapeHtml(focusTitle) + '</strong>' +
      '<span class="market-stock-position-focus-note">' + _escapeHtml(focusNote) + '</span>' +
    '</div>' +
  '</section>';
}

function _renderFuturesRiskPanel(state, futuresListings, openContracts, recentClosedContracts) {
  var listings = Array.isArray(futuresListings) ? futuresListings : [];
  var contracts = Array.isArray(openContracts) ? openContracts : [];
  var closed = Array.isArray(recentClosedContracts) ? recentClosedContracts : [];
  var snapshot = Futures.getFuturesSnapshot
    ? Futures.getFuturesSnapshot(state)
    : {
        openContractCount: contracts.length,
        totalMarginLocked: contracts.reduce(function (sum, contract) { return sum + (contract.margin || 0); }, 0),
        totalUnrealizedPnl: contracts.reduce(function (sum, contract) { return sum + (contract.unrealizedPnl || 0); }, 0),
        expiringSoonCount: contracts.filter(function (contract) { return (contract.daysLeft || 0) <= 2; }).length,
      };
  var longCount = contracts.filter(function (contract) { return contract.direction === 'long'; }).length;
  var shortCount = contracts.filter(function (contract) { return contract.direction === 'short'; }).length;
  var cheapestListing = listings.reduce(function (best, listing) {
    if (!best || (listing.margin || 0) < (best.margin || 0)) return listing;
    return best;
  }, null);
  var minDaysLeft = contracts.reduce(function (min, contract) {
    var days = Number.isFinite(contract.daysLeft) ? contract.daysLeft : 0;
    return min == null ? days : Math.min(min, days);
  }, null);
  var recentPnl = closed.reduce(function (sum, contract) {
    return sum + (contract.pnl || 0);
  }, 0);
  var totalPnl = snapshot.totalUnrealizedPnl || 0;
  var focusTitle = '期货观察中';
  var focusNote = cheapestListing
    ? ('最低保证金 ' + cheapestListing.margin.toLocaleString() + '，先从价差更清晰的标的开仓。')
    : '当前没有可交易标的，等待市场刷新。';
  var focusTone = 'idle';

  if ((snapshot.expiringSoonCount || 0) > 0) {
    focusTitle = '到期压力升高';
    focusNote = snapshot.expiringSoonCount + ' 份合约将在 2 天内到期，先确认平仓或持有到结算。';
    focusTone = 'risk';
  } else if (totalPnl < 0) {
    focusTitle = '浮亏承压';
    focusNote = '未实现盈亏 ' + totalPnl.toLocaleString() + '，先复核反向持仓和保证金占用。';
    focusTone = 'risk';
  } else if (totalPnl > 0) {
    focusTitle = '浮盈可锁定';
    focusNote = '未实现盈亏 +' + totalPnl.toLocaleString() + '，可优先检查是否需要平仓落袋。';
    focusTone = 'gain';
  } else if (contracts.length > 0) {
    focusTitle = '仓位运行中';
    focusNote = '多头 ' + longCount + ' / 空头 ' + shortCount + '，保持观察当前价和剩余天数。';
    focusTone = 'active';
  }

  return '<section class="market-futures-risk-panel" aria-label="期货风控局部态势">' +
    '<div class="market-futures-risk-head">' +
      '<div>' +
        '<div class="market-futures-risk-title">期货风控态势</div>' +
        '<div class="market-futures-risk-subtitle">先看保证金、盈亏和到期压力，再进入开仓或平仓操作。</div>' +
      '</div>' +
      '<span class="market-futures-risk-badge">' + Futures.DEFAULT_TERM_DAYS + ' 天合约</span>' +
    '</div>' +
    '<div class="market-futures-risk-grid" role="list" aria-label="期货风控指标">' +
      _renderFuturesRiskMetric('持仓', String(snapshot.openContractCount || 0), '多 ' + longCount + ' / 空 ' + shortCount, contracts.length > 0 ? 'tone-active' : 'tone-neutral') +
      _renderFuturesRiskMetric('保证金', Math.floor(snapshot.totalMarginLocked || 0).toLocaleString(), cheapestListing ? ('最低开仓 ' + cheapestListing.margin.toLocaleString()) : '暂无标的', (snapshot.totalMarginLocked || 0) > 0 ? 'tone-warm' : 'tone-neutral') +
      _renderFuturesRiskMetric('浮动盈亏', (totalPnl >= 0 ? '+' : '') + totalPnl.toLocaleString(), closed.length > 0 ? ('近 ' + closed.length + ' 笔 ' + (recentPnl >= 0 ? '+' : '') + recentPnl.toLocaleString()) : '暂无成交回看', totalPnl < 0 ? 'tone-hot' : (totalPnl > 0 ? 'tone-cool' : 'tone-neutral')) +
      _renderFuturesRiskMetric('到期', minDaysLeft == null ? '无持仓' : (minDaysLeft + ' 天'), (snapshot.expiringSoonCount || 0) > 0 ? (snapshot.expiringSoonCount + ' 份临近结算') : '无临近到期', (snapshot.expiringSoonCount || 0) > 0 ? 'tone-hot' : 'tone-neutral') +
    '</div>' +
    '<div class="market-futures-risk-focus" aria-label="期货局部信号" data-tone="' + _escapeHtmlAttr(focusTone) + '">' +
      '<span class="market-futures-risk-focus-kicker">局部信号</span>' +
      '<strong class="market-futures-risk-focus-title">' + _escapeHtml(focusTitle) + '</strong>' +
      '<span class="market-futures-risk-focus-note">' + _escapeHtml(focusNote) + '</span>' +
    '</div>' +
  '</section>';
}

function _renderOperationsCommandDeck(viewingSystem, commerceSnapshot, tradeSummary, ownedStations, buildCandidates, localStation, buildCandidate, networkInvestmentPlan, networkUpgradePlan) {
  var system = findSystem(viewingSystem);
  var systemLabel = system ? (system.name + ' · ' + system.typeLabel) : viewingSystem;
  var localStatusLabel = localStation
    ? '本地站点在线'
    : (buildCandidate ? '可落子节点' : '等待解锁');
  var localStatusNote = localStation
    ? '当前节点已有贸易站，可直接升级、增投、换经理和切策略。'
    : (buildCandidate
        ? '当前节点已满足建站条件，决定是否投入长期资本。'
        : '当前节点暂无建站资格，更适合先扩展访问与侦察面。');

  return '<section class="market-workspace-deck market-operations-deck">' +
    '<div class="market-workspace-deck-hero">' +
      '<div class="market-workspace-deck-copy">' +
        '<div class="market-workspace-deck-kicker">Network Command</div>' +
        '<div class="market-workspace-deck-title">商网指挥台 · ' + localStatusLabel + '</div>' +
        '<div class="market-workspace-deck-summary">经营页负责把本地站点、全网批量指令和候选建站点拆开看。先判断当前节点该不该落子，再决定全网升级、增资和人事编排。</div>' +
      '</div>' +
      '<div class="market-workspace-deck-emphasis">' +
        '<span class="market-workspace-deck-emphasis-label">本地态势</span>' +
        '<strong>' + localStatusLabel + '</strong>' +
        '<span class="market-workspace-deck-emphasis-note">' + localStatusNote + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="market-workspace-deck-grid">' +
      _renderWorkspaceDeckMetric('商网规模', String(tradeSummary.count || 0), '已建站点越多，远程指令台的价值越高。') +
      _renderWorkspaceDeckMetric('日收益', '+' + Math.floor(commerceSnapshot.stationDailyIncome || 0).toLocaleString(), '累计收益 ' + Math.floor(tradeSummary.totalIncome || 0).toLocaleString() + '，适合判断扩张节奏。', 'tone-cool') +
      _renderWorkspaceDeckMetric('升级波次', networkUpgradePlan.targetCount > 0 ? (networkUpgradePlan.affordableCount + '/' + networkUpgradePlan.targetCount) : '0/0', '当前预算可覆盖 ' + Math.floor(networkUpgradePlan.affordableCost || 0).toLocaleString() + ' 投资额。', 'tone-warm') +
      _renderWorkspaceDeckMetric('建站候选', String(buildCandidates.length), buildCandidate ? ('当前节点可直接投资 ' + Math.floor(buildCandidate.buildCost || 0).toLocaleString()) : '继续探索可解锁新的建站窗口。', 'tone-hot') +
    '</div>' +
    '<div class="market-workspace-deck-strip">' +
      _renderWorkspaceDeckPill('节点', systemLabel) +
      _renderWorkspaceDeckPill('本地状态', localStatusLabel, localStation ? 'tone-cool' : (buildCandidate ? 'tone-warm' : '')) +
      _renderWorkspaceDeckPill('已建站', String(ownedStations.length)) +
      _renderWorkspaceDeckPill('候选节点', String(buildCandidates.length)) +
      _renderWorkspaceDeckPill('资本波次', networkInvestmentPlan.targetCount > 0 ? (networkInvestmentPlan.affordableCount + '/' + networkInvestmentPlan.targetCount) : '0/0', (networkInvestmentPlan.affordableCount || 0) > 0 ? 'tone-cool' : '') +
      _renderWorkspaceDeckPill('升级波次', networkUpgradePlan.targetCount > 0 ? (networkUpgradePlan.affordableCount + '/' + networkUpgradePlan.targetCount) : '0/0', (networkUpgradePlan.affordableCount || 0) > 0 ? 'tone-warm' : '') +
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
  var configNote = '当前没有管理员或经营策略配置';
  var capitalValue = '--';
  var capitalNote = '可用现金 ' + credits.toLocaleString();
  var statusTone = '';
  var outputTone = '';
  var configTone = '';
  var capitalTone = '';
  var focusTitle = '当前节点暂无经营入口';
  var focusNote = '该节点尚未形成可维护站点或建站候选，当前仅保留经营状态审阅。';
  var focusTone = 'idle';

  if (localStation) {
    var recommendation = localStation.strategyRecommendation;
    var upgradeCost = Math.floor(localStation.nextUpgradeCost || 0);
    var investmentAmount = localInvestment ? Math.floor(localInvestment.suggestedAmount || 0) : 0;
    statusValue = 'Lv.' + localStation.station.level + ' 在线';
    statusNote = systemName + ' · ' + (localStation.role ? localStation.role.name : '未分工');
    outputValue = '+' + Math.floor(localStation.projectedIncome || 0).toLocaleString() + '/日';
    outputNote = '毛收入 ' + Math.floor(localStation.grossIncome || 0).toLocaleString() + ' · 维护 ' + Math.floor(localStation.upkeep || 0).toLocaleString();
    configValue = localStation.manager ? localStation.manager.name : '待配置';
    configNote = '当前策略 ' + (localStation.strategy ? localStation.strategy.name : '未设置');
    statusTone = 'tone-cool';
    outputTone = 'tone-cool';
    configTone = localStation.manager ? 'tone-cool' : 'tone-warm';

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
      focusNote = '可查看收益、管理员和策略配置，抵达后才开放升级、增投与人事动作。';
      focusTone = 'remote';
    } else if (!localStation.manager) {
      focusTitle = '管理员席位空缺';
      focusNote = '站点已经运行，但当前未配置管理员；下方人事席位可比较雇佣成本。';
      focusTone = 'watch';
    } else if (recommendation && recommendation.shouldSwitch) {
      focusTitle = '经营策略可校准';
      focusNote = '当前策略与本地信号存在偏差，可切换为「' + recommendation.strategy.name + '」。';
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
      focusNote = '管理员和策略已配置，当前日收益 +' + Math.floor(localStation.projectedIncome || 0).toLocaleString() + '。';
      focusTone = 'stable';
    }
  } else if (buildCandidate) {
    var buildCost = Math.floor(buildCandidate.buildCost || 0);
    var strategy = buildCandidate.strategyRecommendation && buildCandidate.strategyRecommendation.strategy;
    statusValue = '可建站';
    statusNote = systemName + ' · ' + (buildCandidate.role ? buildCandidate.role.name : '待评估角色');
    outputValue = '深度 ' + Math.floor((buildCandidate.system && buildCandidate.system.marketDepth) || 200).toLocaleString();
    outputNote = '建站后进入本地经营与商网收益循环';
    configValue = strategy ? strategy.name : '均衡经营';
    configNote = '候选预设策略 · 建成后可调整';
    capitalValue = '建站 ' + buildCost.toLocaleString();
    capitalNote = buildCandidate.canAfford ? '资金与资格均已满足' : (buildCandidate.lockReason || ('尚缺 ' + Math.max(0, buildCost - credits).toLocaleString()));
    statusTone = 'tone-warm';
    outputTone = 'tone-cool';
    configTone = 'tone-cool';
    capitalTone = buildCandidate.canAfford ? 'tone-cool' : 'tone-hot';

    if (!isCurrentSys) {
      focusTitle = '远程候选审阅';
      focusNote = '该节点具备建站条件，抵达后才能执行本地建站投资。';
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
    focusTitle = '远程节点待解锁';
    focusNote = '当前节点没有可审阅站点或候选资格，抵达并完成前置探索后再刷新本地经营状态。';
    focusTone = 'remote';
  }

  return '<section class="market-local-operations-panel" aria-label="本地经营局部态势">' +
    '<div class="market-local-operations-head">' +
      '<div>' +
        '<div class="market-local-operations-title">本地经营工位</div>' +
        '<div class="market-local-operations-subtitle">把节点资格、经营产能、人员配置与资本窗口压成一屏。</div>' +
      '</div>' +
      '<span class="market-local-operations-badge">' + (isCurrentSys ? '本地可执行' : '远程只读') + '</span>' +
    '</div>' +
    '<div class="market-local-operations-grid" role="list" aria-label="本地经营指标">' +
      _renderLocalOperationsMetric('节点状态', statusValue, statusNote, statusTone) +
      _renderLocalOperationsMetric('经营产能', outputValue, outputNote, outputTone) +
      _renderLocalOperationsMetric('管理配置', configValue, configNote, configTone) +
      _renderLocalOperationsMetric('资本窗口', capitalValue, capitalNote, capitalTone) +
    '</div>' +
    '<div class="market-local-operations-focus" aria-label="本地经营局部信号" data-tone="' + _escapeHtmlAttr(focusTone) + '">' +
      '<span class="market-local-operations-focus-kicker">局部信号</span>' +
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
    ? '当前节点可维护配置'
    : (buildCandidate ? '当前节点可落子' : '当前节点暂无建站资格');
  var candidateNote = buildCandidate
    ? '含当前查看节点'
    : (candidateCount > 0 ? '已访问候选待巡检' : '继续探索解锁窗口');
  var signalTitle = '等待首站信号';
  var signalNote = '候选列表为空时，先把更多已访问节点纳入观察面。';
  var signalTone = 'trade-station-list-signal--idle';

  if (buildCandidate) {
    signalTitle = '当前节点可投建';
    signalNote = buildCandidate.system.name + ' 已进入建站候选，投资门槛 ' + Math.floor(buildCandidate.buildCost || 0).toLocaleString() + '。';
    signalTone = buildCandidate.canAfford ? 'trade-station-list-signal--ready' : 'trade-station-list-signal--watch';
  } else if (localStation) {
    signalTitle = '本地站点可维护';
    signalNote = localStation.system.name + ' 已建站，适合先检查升级、经理和经营策略。';
    signalTone = 'trade-station-list-signal--ready';
  } else if (upgradeReady > 0) {
    signalTitle = '升级波次待命';
    signalNote = '当前预算可覆盖 ' + upgradeReady + ' / ' + upgradeTotal + ' 个升级目标。';
    signalTone = 'trade-station-list-signal--ready';
  } else if (investmentReady > 0) {
    signalTitle = '资本增配待命';
    signalNote = '当前预算可覆盖 ' + investmentReady + ' / ' + investmentTotal + ' 个增配目标。';
    signalTone = 'trade-station-list-signal--ready';
  } else if (candidateCount > 0) {
    signalTitle = '候选节点待巡检';
    signalNote = '先比较候选节点的市场深度、角色和勘探支持，再决定落子顺序。';
    signalTone = 'trade-station-list-signal--watch';
  } else if (ownedCount > 0) {
    signalTitle = '全网保持观察';
    signalNote = '当前没有候选或可执行波次，已建站列表用于复核收益和配置。';
    signalTone = 'trade-station-list-signal--watch';
  }

  return '<div class="trade-station-list-brief" role="group" aria-label="商网列表摘要">' +
    '<div class="trade-station-list-brief-head">' +
      '<div>' +
        '<div class="trade-station-list-brief-title">商网列表摘要</div>' +
        '<div class="trade-station-list-brief-subtitle">把候选、已建站点和可执行波次压成局部态势，进入列表前先确定关注点。</div>' +
      '</div>' +
      '<span class="market-finance-chip">站点分区</span>' +
    '</div>' +
    '<div class="trade-station-list-brief-grid" role="list">' +
      _renderTradeStationListBriefItem('候选节点', String(candidateCount), candidateNote, buildCandidate ? 'tone-hot' : '') +
      _renderTradeStationListBriefItem('已建站点', String(ownedCount), ownedCount > 0 ? '可维护收益与配置' : '等待第一座贸易站', ownedCount > 0 ? 'tone-cool' : '') +
      _renderTradeStationListBriefItem('本地态势', localStatus, localNote, localStation ? 'tone-cool' : (buildCandidate ? 'tone-warm' : '')) +
      _renderTradeStationListBriefItem('可执行波次', upgradeReady + ' 升级 / ' + investmentReady + ' 增配', '目标池 ' + (upgradeTotal + investmentTotal) + ' 项', (upgradeReady + investmentReady) > 0 ? 'tone-warm' : '') +
    '</div>' +
    '<div class="trade-station-list-signal ' + signalTone + '">' +
      '<span class="trade-station-list-signal-kicker">局部信号</span>' +
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
      note: intel.anomalyHint || intel.dispatchHint || intel.marketHint || '勘探报告显示该节点可作为后勤补给支点。',
    };
  }
  if (intel.routeSignal) {
    return {
      systemId: systemId,
      signal: 'route',
      label: '暗线航图',
      note: intel.dispatchHint || '勘探报告包含航线情报，适合作为商网路径判断参考。',
    };
  }
  if (intel.researchSignal) {
    return {
      systemId: systemId,
      signal: 'research',
      label: intel.relicSignal ? '古代遗迹' : '科研样本',
      note: intel.researchHint || '勘探报告显示该节点可为科研补给链提供参考。',
    };
  }
  if (intel.marketSignal) {
    return {
      systemId: systemId,
      signal: 'market',
      label: '贸易窗口',
      note: intel.marketHint || '勘探报告显示该节点存在可复核的本地行情窗口。',
    };
  }
  if (intel.logisticsSignal) {
    return {
      systemId: systemId,
      signal: 'logistics',
      label: '补给节点',
      note: intel.dispatchHint || intel.marketHint || '勘探报告显示该节点可作为后勤补给支点。',
    };
  }

  return {
    systemId: systemId,
    signal: intel.primarySignal || 'survey',
    label: intel.primaryLabel || '勘探情报',
    note: intel.marketHint || intel.dispatchHint || '该节点已有归档勘探情报，可作为建站判断参考。',
  };
}

function _renderTradeStationCandidateIntel(state, systemId, className) {
  var intel = getTradeStationCandidateIntel(state, systemId);
  if (!intel) return '';
  var extraClass = className ? (' ' + className) : '';
  return '<div class="trade-station-intel-note' + extraClass + '">' +
    '<span class="market-finance-chip">勘探支持 · ' + _escapeHtml(intel.label) + '</span>' +
    '<span>' + _escapeHtml(intel.note) + '</span>' +
  '</div>';
}

function _renderTradeStationExplorationEffectMeta(effect, className) {
  if (!effect || !effect.summary) return '';
  var metaClass = className || 'trade-station-card-meta';
  return '<div class="' + metaClass + '">' +
    _escapeHtml('事件链加成：' + effect.summary) +
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
    _escapeHtml('建议策略：' + recommendation.strategy.name + ' · ' + status + ' · ' + _formatStrategyConfidence(recommendation.confidence) + ' · ' + recommendation.reason) +
  '</div>';
}

function _renderStrategyRecommendationButton(entry, className) {
  if (!entry || !entry.station || !entry.strategyRecommendation || !entry.strategyRecommendation.shouldSwitch) return '';
  var recommendation = entry.strategyRecommendation;
  var buttonClass = className || 'trade-station-upgrade-btn';
  var stationLabel = entry.system && entry.system.name ? entry.system.name : entry.station.systemId;
  return '<button class="btn-action ' + buttonClass + '" data-action="market-set-strategy" data-system-id="' + _escapeHtmlAttr(entry.station.systemId) + '" data-strategy-id="' + _escapeHtmlAttr(recommendation.strategyId) + '" aria-label="' + _escapeHtmlAttr(stationLabel + ' 切换为建议策略 ' + recommendation.strategy.name) + '">' +
    '切换为建议策略' +
  '</button>';
}

function _getTradeStationDomId(prefix, systemId) {
  var safeId = String(systemId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
  return prefix + '-' + safeId;
}

function _getMarketFinanceDomId(prefix, value) {
  var safeId = String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '-');
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
    table.setAttribute('aria-label', isSell ? '各节点商品卖出价矩阵' : '各节点商品买入价矩阵');
  }
  if (status) status.textContent = '矩阵显示各节点的' + (isSell ? '卖出价。' : '买入价。');

  thead.innerHTML = '';
  var headRow = document.createElement('tr');
  headRow.innerHTML = '<th class="mkt-ov-planet-th" scope="col">星球</th>' +
    GOODS.map(function (good) {
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
    var row = document.createElement('tr');
    row.className = 'mkt-ov-row' +
      (isCurrent ? ' mkt-ov-current' : '') +
      (isVisited ? ' mkt-ov-visited' : ' mkt-ov-unvisited');
    row.dataset.sysId = system.id;

    var planetCell = '<td class="mkt-ov-planet">' +
      '<button class="mkt-ov-planet-action" type="button" aria-label="查看' + _escapeHtmlAttr(system.name) + '市场详情">' +
        '<span class="mkt-ov-dot" style="background:' + system.color + '"></span>' +
        (isCurrent ? '📍 ' : '') +
        '<span class="mkt-ov-name">' + _escapeHtml(system.name) + '</span>' +
        '<span class="mkt-ov-type">' + _escapeHtml(system.typeLabel) + '</span>' +
      '</button>' +
      '</td>';

    var priceCells = '';
    GOODS.forEach(function (good) {
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
    row.addEventListener('click', openPlanetMarket);
    var planetAction = row.querySelector('.mkt-ov-planet-action');
    if (planetAction) {
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
  var financeOverview = Finance.getOverview(state);
  var loanOffers = Finance.getLoanOffers(state).slice(0, 3);
  var activeLoans = (state.loans || []).filter(function (loan) {
    return loan.status === 'active' && loan.balance > 0;
  });
  var insuranceProducts = Finance.getInsuranceProducts(state).slice(0, 3);
  var pendingClaims = (state.insuranceClaims || []).filter(function (claim) {
    return claim.status === 'pending';
  }).slice(0, 3);
  var allStockListings = _sortStockListings(Finance.getStockListings(state), viewingSystem);
  var stockListings = allStockListings.slice(0, 5);
  var futuresListings = Futures.getFuturesListings(state);
  var openContracts = Futures.getOpenContracts(state);
  var recentClosedContracts = Futures.getClosedContracts(state).slice(-4).reverse();
  var tradeInvestments = Finance.getTradeInvestmentOptions(state);
  var localInvestment = tradeInvestments.find(function (entry) {
    return entry.systemId === viewingSystem;
  }) || null;
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

  var capitalLocalSection = '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">🏦 本地资本调度</div>' +
        '<div class="market-finance-subtitle">贷款、保险和本地站点追加投资与停靠节点绑定。远程查看时只保留情报，不开放交易。</div>' +
      '</div>' +
    '</div>' +
    _renderCapitalLocalGuardPanel(state, activeLoans, loanOffers, insuranceProducts, pendingClaims, isCurrentSys);

  if (!isCurrentSys) {
    capitalLocalSection += '<div class="market-finance-locked">📡 当前是远程查看模式。抵达该节点后，可在这里申请贷款、办理保险并追加本地站点投资。</div>';
  } else {
    capitalLocalSection += '<div class="market-finance-layout">' +
      '<div class="market-finance-column">' +
        '<div class="market-finance-subsection">🏦 贷款席位</div>' +
        (activeLoans.length > 0
          ? '<div class="market-finance-action-list" role="list" aria-label="未结清贷款列表">' + activeLoans.map(function (loan) {
              var loanKey = loan.id || loan.name;
              var loanTitleId = _getMarketFinanceDomId('market-loan-title', loanKey);
              var loanMetaId = _getMarketFinanceDomId('market-loan-meta', loanKey);
              return '<article class="market-finance-action-row" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(loanTitleId) + '" aria-describedby="' + _escapeHtmlAttr(loanMetaId) + '">' +
                '<div class="market-finance-action-main">' +
                  '<div id="' + _escapeHtmlAttr(loanTitleId) + '" class="market-finance-action-title">' + loan.name + '</div>' +
                  '<div id="' + _escapeHtmlAttr(loanMetaId) + '" class="market-finance-action-meta">余额 ' + Math.floor(loan.balance).toLocaleString() + ' · 日扣款 ' + Math.floor(loan.dailyPayment).toLocaleString() + ' · 剩余 ' + loan.remainingDays + ' 天</div>' +
                '</div>' +
                '<div class="market-finance-inline-actions" role="group" aria-label="' + _escapeHtmlAttr(loan.name + ' 贷款操作') + '">' +
                  '<button class="btn-action market-finance-btn" data-action="market-repay-loan" data-loan-id="' + _escapeHtmlAttr(loan.id) + '" aria-describedby="' + _escapeHtmlAttr(loanMetaId) + '" aria-label="' + _escapeHtmlAttr('偿还 ' + loan.name) + '">还款</button>' +
                '</div>' +
              '</article>';
            }).join('') + '</div>'
          : '<div class="market-finance-empty">暂无未结清贷款。</div>') +
        (loanOffers.length > 0
          ? '<div class="trade-station-choice-row market-finance-offer-row" role="group" aria-label="贷款报价选择">' + loanOffers.map(function (offer) {
              return '<button class="trade-station-choice-btn' + (offer.available ? '' : ' disabled') + '" data-action="market-take-loan" data-loan-offer-id="' + _escapeHtmlAttr(offer.id) + '" aria-label="' + _escapeHtmlAttr('申请 ' + offer.name + '，到账 ' + offer.principal.toLocaleString() + '，期限 ' + offer.termDays + ' 天') + '"' + (offer.available ? '' : ' disabled aria-disabled="true"') + '>' +
                offer.name + '<span>+' + offer.principal.toLocaleString() + ' / ' + offer.termDays + '天</span></button>';
            }).join('') + '</div>'
          : '') +
      '</div>' +
      '<div class="market-finance-column">' +
        '<div class="market-finance-subsection">🛡 风险保障</div>' +
        (insuranceProducts.length > 0
          ? '<div class="market-finance-action-list" role="list" aria-label="保险产品列表">' + insuranceProducts.map(function (product) {
              var productTitleId = _getMarketFinanceDomId('market-insurance-title', product.id);
              var productMetaId = _getMarketFinanceDomId('market-insurance-meta', product.id);
              return '<article class="market-finance-action-row" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(productTitleId) + '" aria-describedby="' + _escapeHtmlAttr(productMetaId) + '">' +
                '<div class="market-finance-action-main">' +
                  '<div id="' + _escapeHtmlAttr(productTitleId) + '" class="market-finance-action-title">' + product.name + '</div>' +
                  '<div id="' + _escapeHtmlAttr(productMetaId) + '" class="market-finance-action-meta">保费 ' + Math.floor(product.premium).toLocaleString() + ' · 保额 ' + Math.floor(product.coverage).toLocaleString() + ' · 可赔 ' + Math.floor(product.claimableAmount).toLocaleString() + '</div>' +
                '</div>' +
                '<div class="market-finance-inline-actions" role="group" aria-label="' + _escapeHtmlAttr(product.name + ' 保险操作') + '">' +
                  '<button class="btn-action market-finance-btn' + (product.active ? ' disabled' : '') + '" data-action="market-purchase-insurance" data-policy-type="' + _escapeHtmlAttr(product.id) + '" aria-describedby="' + _escapeHtmlAttr(productMetaId) + '" aria-label="' + _escapeHtmlAttr('投保 ' + product.name) + '"' + (product.active ? ' disabled aria-disabled="true"' : '') + '>投保</button>' +
                  '<button class="btn-action market-finance-btn' + (product.claimableAmount > 0 ? '' : ' disabled') + '" data-action="market-submit-claim" data-policy-type="' + _escapeHtmlAttr(product.id) + '" aria-describedby="' + _escapeHtmlAttr(productMetaId) + '" aria-label="' + _escapeHtmlAttr('提交 ' + product.name + ' 理赔') + '"' + (product.claimableAmount > 0 ? '' : ' disabled aria-disabled="true"') + '>理赔</button>' +
                '</div>' +
              '</article>';
            }).join('') + '</div>'
          : '<div class="market-finance-empty">当前暂无可用保险产品。</div>') +
        (pendingClaims.length > 0
          ? '<div class="market-finance-history" role="list" aria-label="待处理理赔记录">' + pendingClaims.map(function (claim) {
              return '<div class="market-finance-history-row" role="listitem"><span>' + claim.policyType + '</span><span>预计到账 ' + Math.floor(claim.approvedAmount).toLocaleString() + '</span></div>';
            }).join('') + '</div>'
          : '') +
      '</div>' +
    '</div>';
  }

  capitalLocalSection += '</section>';

  var operationsLocalSection = '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">🏪 节点经营</div>' +
        '<div class="market-finance-subtitle">围绕当前查看节点决定是否建站、升级、雇佣管理员与切换经营策略。</div>' +
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
      '<div class="market-finance-card-meta">管理员：' + (localStation.manager ? localStation.manager.name : '未配置') + ' · 策略：' + localStation.strategy.name + '</div>' +
      (localInvestment
        ? '<div class="market-finance-card-meta">本地追加投资：已投 ' + Math.floor(localInvestment.investedAmount || 0).toLocaleString() + ' · 建议追加 ' + localInvestment.suggestedAmount.toLocaleString() + ' · 预估日分红 ' + (localInvestment.expectedYieldRate * 100).toFixed(2) + '%</div>'
        : '') +
      (isCurrentSys
        ? '<div class="market-finance-actions" role="group" aria-label="' + _escapeHtmlAttr(localStation.system.name + ' 贸易站操作') + '">' +
            _renderStrategyRecommendationButton(localStation, 'market-finance-btn') +
            '<button class="btn-action market-finance-btn' + (localStation.nextLevel ? '' : ' disabled') + '" data-action="market-upgrade-station" data-system-id="' + _escapeHtmlAttr(localStation.station.systemId) + '" aria-label="' + _escapeHtmlAttr(localStation.system.name + (localStation.nextLevel ? (' 升级至 Lv.' + localStation.nextLevel.level) : ' 已满级')) + '"' + (localStation.nextLevel ? '' : ' disabled aria-disabled="true"') + '>' + (localStation.nextLevel ? ('升级 +' + localStation.nextUpgradeCost.toLocaleString()) : (localStation.nextLevelLockLabel || '已满级')) + '</button>' +
            (localInvestment ? '<button class="btn-action market-finance-btn" data-action="market-invest-trade-station" data-system-id="' + _escapeHtmlAttr(localInvestment.systemId) + '" aria-label="' + _escapeHtmlAttr(localStation.system.name + ' 追加站点投资') + '">追加投资</button>' : '') +
          '</div>' +
          '<div class="market-finance-station-stack">' +
            '<div class="market-finance-subsection">👤 管理员</div>' +
            '<div class="trade-station-choice-row" role="group" aria-label="' + _escapeHtmlAttr(localStation.system.name + ' 管理员选择') + '">' + TRADE_STATION_MANAGERS.map(function (manager) {
              var active = localStation.station.managerId === manager.id;
              return '<button class="trade-station-choice-btn' + (active ? ' active' : '') + '" data-action="market-hire-manager" data-system-id="' + _escapeHtmlAttr(localStation.station.systemId) + '" data-manager-id="' + _escapeHtmlAttr(manager.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '" aria-label="' + _escapeHtmlAttr(localStation.system.name + ' 管理员选择 ' + manager.name + '，雇佣成本 ' + manager.hireCost.toLocaleString()) + '">' +
                manager.name + '<span>' + manager.hireCost.toLocaleString() + '</span></button>';
            }).join('') + '</div>' +
            '<div class="market-finance-subsection">📈 经营策略</div>' +
            '<div class="trade-station-choice-row" role="group" aria-label="' + _escapeHtmlAttr(localStation.system.name + ' 经营策略选择') + '">' + TRADE_STATION_STRATEGIES.map(function (strategy) {
              var active = localStation.station.strategyId === strategy.id;
              return '<button class="trade-station-choice-btn' + (active ? ' active' : '') + '" data-action="market-set-strategy" data-system-id="' + _escapeHtmlAttr(localStation.station.systemId) + '" data-strategy-id="' + _escapeHtmlAttr(strategy.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '" aria-label="' + _escapeHtmlAttr(localStation.system.name + ' 经营策略选择 ' + strategy.name + '，收益系数 ' + Math.round(strategy.incomeMultiplier * 100) + '%') + '">' +
                strategy.name + '<span>' + Math.round(strategy.incomeMultiplier * 100) + '%</span></button>';
            }).join('') + '</div>' +
          '</div>'
        : '<div class="market-finance-locked">📡 远程查看模式：可审阅该站点收益与配置，抵达后才能升级、雇佣和切换策略。</div>') +
    '</div>';
  } else if (buildCandidate) {
    operationsLocalSection += '<div class="market-finance-card">' +
      '<div class="market-finance-card-head">' +
        '<span class="market-finance-card-title">在 ' + buildCandidate.system.name + ' 建立商业节点</span>' +
        '<span class="market-finance-chip">' + buildCandidate.system.typeLabel + '</span>' +
      '</div>' +
      '<div class="market-finance-card-meta">市场深度 ' + (buildCandidate.system.marketDepth || 200) + ' · ' + buildCandidate.system.description + '</div>' +
      _renderMarketFinanceRoleMeta(buildCandidate.role, buildCandidate.prospectiveRegionalSynergy, '预期角色') +
      _renderStrategyRecommendationMeta(buildCandidate.strategyRecommendation, 'market-finance-card-meta') +
      _renderTradeStationExplorationEffectMeta(buildCandidate.explorationEffect, 'market-finance-card-meta') +
      _renderTradeStationCandidateIntel(state, buildCandidate.system.id, 'is-local') +
      '<div class="market-finance-card-meta">' + (buildCandidate.lockReason || '建站后可持续吃到本地行情与经济周期红利。') + '</div>' +
      (localInvestment
        ? '<div class="market-finance-card-meta">同步可做站点投资：已投 ' + Math.floor(localInvestment.investedAmount || 0).toLocaleString() + ' · 建议追加 ' + localInvestment.suggestedAmount.toLocaleString() + '</div>'
        : '') +
      (isCurrentSys
        ? '<div class="market-finance-actions">' +
            '<button class="btn-action market-finance-btn' + (buildCandidate.canAfford ? '' : ' disabled') + '" data-action="market-build-station" data-system-id="' + _escapeHtmlAttr(buildCandidate.system.id) + '" aria-label="' + _escapeHtmlAttr('在 ' + buildCandidate.system.name + ' 建立商业节点，投资 ' + buildCandidate.buildCost.toLocaleString()) + '"' + (buildCandidate.canAfford ? '' : ' disabled aria-disabled="true"') + '>' + (buildCandidate.canAfford ? ('投资 ' + buildCandidate.buildCost.toLocaleString()) : (buildCandidate.lockReason || ('投资 ' + buildCandidate.buildCost.toLocaleString()))) + '</button>' +
            (localInvestment ? '<button class="btn-action market-finance-btn" data-action="market-invest-trade-station" data-system-id="' + _escapeHtmlAttr(localInvestment.systemId) + '" aria-label="' + _escapeHtmlAttr(buildCandidate.system.name + ' 先做财务投资') + '">先做财务投资</button>' : '') +
          '</div>'
        : '<div class="market-finance-locked">📡 这是可建站候选节点。抵达后可直接在此发起投资。</div>') +
    '</div>';
  } else {
    operationsLocalSection += '<div class="market-finance-empty">该节点暂不提供贸易站建设资格，或尚未完成前置探索。</div>';
  }

  if (ownedStations.length > 0) {
    operationsLocalSection += '<div class="market-finance-subsection">📡 商网快照</div>' +
      '<div class="market-finance-action-list">' + ownedStations.slice(0, 4).map(function (entry) {
        return '<div class="market-finance-network-row">' +
          '<div class="market-finance-network-main">' +
            '<div class="market-finance-action-title">' + entry.system.name + ' · Lv.' + entry.station.level + '</div>' +
            '<div class="market-finance-action-meta">日收益 +' + Math.floor(entry.projectedIncome).toLocaleString() + ' · ' + (entry.role ? entry.role.name : '未分工') + ' · 管理员 ' + (entry.manager ? entry.manager.name : '未配置') + ' · 策略 ' + entry.strategy.name + '</div>' +
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
        '<div class="trade-station-metric"><span class="trade-station-metric-label">股票市值</span><span class="trade-station-metric-value">' + Math.floor(commerceSnapshot.stockPortfolioValue).toLocaleString() + '</span></div>' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">站点投资</span><span class="trade-station-metric-value">' + Math.floor(commerceSnapshot.tradeInvestmentValue).toLocaleString() + '</span></div>' +
        '<div class="trade-station-metric"><span class="trade-station-metric-label">贷款余额</span><span class="trade-station-metric-value">' + Math.floor(commerceSnapshot.totalLoans).toLocaleString() + '</span></div>' +
      '</div>' +
      '<div class="trade-station-summary-tip">这里统一处理远程看盘、建站候选筛选与所有已建节点的经营编排，是当前唯一的商网管理入口。</div>' +
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
            '<div class="market-finance-action-meta">日收益 +' + Math.floor(entry.projectedIncome).toLocaleString() + ' · ' + (entry.role ? entry.role.name : '未分工') + ' · 管理员 ' + (entry.manager ? entry.manager.name : '未配置') + ' · 策略 ' + entry.strategy.name + '</div>' +
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
        '<div id="' + _escapeHtmlAttr(metaId) + '" class="trade-station-card-meta">市场深度 ' + (candidate.system.marketDepth || 200) + ' · ' + (candidate.isCurrent ? '当前停靠中，可立即投资' : '已访问，可先纳入建站计划') + '</div>' +
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
    operationsStationsSection += '<div class="trade-station-empty">还没有贸易站。先在当前停靠节点完成第一笔长期投资。</div>';
  } else {
    operationsStationsSection += '<div class="trade-station-card-list trade-station-card-list--owned" role="list" aria-label="已建贸易站列表">';
    ownedStations.forEach(function (entry) {
      var station = entry.station;
      var cardId = _getTradeStationDomId('trade-station-owned-card', station.systemId);
      var titleId = _getTradeStationDomId('trade-station-owned-title', station.systemId);
      var incomeId = _getTradeStationDomId('trade-station-owned-income', station.systemId);
      var managerGroupId = _getTradeStationDomId('trade-station-manager-group', station.systemId);
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
        '<div class="trade-station-card-meta">管理员：' + (entry.manager ? (entry.manager.name + '（日薪 ' + entry.manager.dailySalary + '）') : '未雇佣') + ' · 策略：' + entry.strategy.name + '</div>' +
        '<div class="trade-station-actions" role="group" aria-label="' + _escapeHtmlAttr(entry.system.name + ' 贸易站操作') + '">' +
          _renderStrategyRecommendationButton(entry, 'trade-station-upgrade-btn') +
          '<button class="btn-action trade-station-upgrade-btn' + (entry.nextLevel ? '' : ' disabled') + '" data-action="market-upgrade-station" data-system-id="' + _escapeHtmlAttr(station.systemId) + '" aria-label="' + _escapeHtmlAttr(entry.system.name + (entry.nextLevel ? (' 升级至 Lv.' + entry.nextLevel.level) : ' 已达满级')) + '"' + (entry.nextLevel ? '' : ' disabled aria-disabled="true"') + '>' +
            (entry.nextLevel ? ('升级至 Lv.' + entry.nextLevel.level + '（+' + entry.nextUpgradeCost.toLocaleString() + '）') : (entry.nextLevelLockLabel || '已达满级')) +
          '</button>' +
        '</div>' +
        '<div id="' + _escapeHtmlAttr(managerGroupId) + '" class="trade-station-subsection">👤 管理员</div>' +
        '<div class="trade-station-choice-row" role="group" aria-labelledby="' + _escapeHtmlAttr(managerGroupId) + '">' +
          TRADE_STATION_MANAGERS.map(function (manager) {
            var activeClass = station.managerId === manager.id ? ' active' : '';
            var active = station.managerId === manager.id;
            return '<button class="trade-station-choice-btn' + activeClass + '" data-action="market-hire-manager" data-system-id="' + _escapeHtmlAttr(station.systemId) + '" data-manager-id="' + _escapeHtmlAttr(manager.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '" aria-label="' + _escapeHtmlAttr(entry.system.name + ' 管理员选择 ' + manager.name + '，雇佣成本 ' + manager.hireCost.toLocaleString()) + '">' +
              manager.name + '<span>' + manager.hireCost.toLocaleString() + '</span></button>';
          }).join('') +
        '</div>' +
        '<div id="' + _escapeHtmlAttr(strategyGroupId) + '" class="trade-station-subsection">📈 经营策略</div>' +
        '<div class="trade-station-choice-row" role="group" aria-labelledby="' + _escapeHtmlAttr(strategyGroupId) + '">' +
          TRADE_STATION_STRATEGIES.map(function (strategy) {
            var activeClass = station.strategyId === strategy.id ? ' active' : '';
            var active = station.strategyId === strategy.id;
            return '<button class="trade-station-choice-btn' + activeClass + '" data-action="market-set-strategy" data-system-id="' + _escapeHtmlAttr(station.systemId) + '" data-strategy-id="' + _escapeHtmlAttr(strategy.id) + '" aria-pressed="' + (active ? 'true' : 'false') + '" aria-label="' + _escapeHtmlAttr(entry.system.name + ' 经营策略选择 ' + strategy.name + '，收益系数 ' + Math.round(strategy.incomeMultiplier * 100) + '%') + '">' +
              strategy.name + '<span>' + Math.round(strategy.incomeMultiplier * 100) + '%</span></button>';
          }).join('') +
        '</div>' +
      '</article>';
    });
    operationsStationsSection += '</div>';
  }

  operationsStationsSection += '</section>';

  var capitalStocksSection = '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">📈 股票市场</div>' +
        '<div class="market-finance-subtitle">本地指数优先展示，可直接从市场页建仓或减仓。</div>' +
      '</div>' +
    '</div>' +
    _renderStockPositionPanel(state, allStockListings, viewingSystem);

  if (stockListings.length === 0) {
    capitalStocksSection += '<div class="market-finance-empty">暂无可交易股票。</div>';
  } else {
    capitalStocksSection += '<div class="market-finance-card-grid market-finance-card-grid--stocks" role="list" aria-label="股票标的列表">' + stockListings.map(function (listing) {
      var delta = _getStockPriceDelta(listing);
      var deltaClass = delta >= 0 ? 'market-finance-value-up' : 'market-finance-value-down';
      var deltaText = (delta >= 0 ? '+' : '') + delta.toLocaleString();
      var listingKey = listing.id || listing.systemId || listing.name;
      var stockTitleId = _getMarketFinanceDomId('market-stock-title', listingKey);
      var stockPositionId = _getMarketFinanceDomId('market-stock-position', listingKey);
      var stockDeltaId = _getMarketFinanceDomId('market-stock-delta', listingKey);
      return '<article class="market-finance-card' + (listing.systemId === viewingSystem ? ' is-featured' : '') + '" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(stockTitleId) + '" aria-describedby="' + _escapeHtmlAttr(stockPositionId + ' ' + stockDeltaId) + '">' +
        '<div class="market-finance-card-head">' +
          '<span id="' + _escapeHtmlAttr(stockTitleId) + '" class="market-finance-card-title">' + listing.name + '</span>' +
          '<span class="market-finance-chip">' + listing.price.toLocaleString() + '</span>' +
        '</div>' +
        '<div id="' + _escapeHtmlAttr(stockPositionId) + '" class="market-finance-card-meta">持仓 ' + (listing.shares || 0) + ' 股 · 均价 ' + Math.floor(listing.avgCost || 0).toLocaleString() + '</div>' +
        '<div id="' + _escapeHtmlAttr(stockDeltaId) + '" class="market-finance-card-meta">日波动 <span class="' + deltaClass + '">' + deltaText + '</span></div>' +
        '<div class="market-finance-actions" role="group" aria-label="' + _escapeHtmlAttr(listing.name + ' 股票操作') + '">' +
          '<button class="btn-action market-finance-btn" data-action="market-buy-stock" data-stock-id="' + _escapeHtmlAttr(listing.id) + '" aria-describedby="' + _escapeHtmlAttr(stockPositionId + ' ' + stockDeltaId) + '" aria-label="' + _escapeHtmlAttr('买入 1 股 ' + listing.name) + '">买入 1 股</button>' +
          '<button class="btn-action market-finance-btn' + ((listing.shares || 0) > 0 ? '' : ' disabled') + '" data-action="market-sell-stock" data-stock-id="' + _escapeHtmlAttr(listing.id) + '" aria-describedby="' + _escapeHtmlAttr(stockPositionId + ' ' + stockDeltaId) + '" aria-label="' + _escapeHtmlAttr('卖出 1 股 ' + listing.name) + '"' + ((listing.shares || 0) > 0 ? '' : ' disabled aria-disabled="true"') + '>卖出 1 股</button>' +
        '</div>' +
      '</article>';
    }).join('') + '</div>';
  }
  capitalStocksSection += '</section>';

  var capitalFuturesSection = '<section class="market-finance-section">' +
    '<div class="market-finance-section-head">' +
      '<div>' +
        '<div class="market-finance-title">📋 期货市场</div>' +
        '<div class="market-finance-subtitle">以当前现货价锁定合约。做多押涨，做空押跌，保证金为合约价值的 20%。</div>' +
      '</div>' +
      '<span class="market-finance-chip">' + Futures.DEFAULT_TERM_DAYS + ' 天标准合约</span>' +
    '</div>' +
    _renderFuturesRiskPanel(state, futuresListings, openContracts, recentClosedContracts);

  if (futuresListings.length === 0) {
    capitalFuturesSection += '<div class="market-finance-empty">暂无可交易期货标的。</div>';
  } else {
    capitalFuturesSection += '<div class="market-finance-card-grid market-finance-card-grid--futures" role="list" aria-label="期货标的列表">' + futuresListings.map(function (listing) {
      var futuresTitleId = _getMarketFinanceDomId('market-futures-title', listing.goodId);
      var futuresMetaId = _getMarketFinanceDomId('market-futures-meta', listing.goodId);
      var futuresPositionId = _getMarketFinanceDomId('market-futures-position', listing.goodId);
      var futuresLabel = (listing.emoji ? listing.emoji + ' ' : '') + listing.name;
      return '<article class="market-finance-card" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(futuresTitleId) + '" aria-describedby="' + _escapeHtmlAttr(futuresMetaId + ' ' + futuresPositionId) + '">' +
        '<div class="market-finance-card-head">' +
          '<span id="' + _escapeHtmlAttr(futuresTitleId) + '" class="market-finance-card-title">' + futuresLabel + '</span>' +
          '<span class="market-finance-chip">现价 ' + listing.currentPrice.toLocaleString() + '</span>' +
        '</div>' +
        '<div id="' + _escapeHtmlAttr(futuresMetaId) + '" class="market-finance-card-meta">合约规模 ' + listing.contractUnit + ' 单位 · 保证金 ' + listing.margin.toLocaleString() + '</div>' +
        '<div id="' + _escapeHtmlAttr(futuresPositionId) + '" class="market-finance-card-meta">持多 ' + listing.heldLong + ' 份 · 持空 ' + listing.heldShort + ' 份</div>' +
        '<div class="market-finance-actions" role="group" aria-label="' + _escapeHtmlAttr(listing.name + ' 期货操作') + '">' +
          '<button class="btn-action market-finance-btn market-finance-btn-long" data-action="market-futures-long" data-good-id="' + _escapeHtmlAttr(listing.goodId) + '" aria-describedby="' + _escapeHtmlAttr(futuresMetaId + ' ' + futuresPositionId) + '" aria-label="' + _escapeHtmlAttr('做多 ' + listing.name) + '">做多</button>' +
          '<button class="btn-action market-finance-btn market-finance-btn-short" data-action="market-futures-short" data-good-id="' + _escapeHtmlAttr(listing.goodId) + '" aria-describedby="' + _escapeHtmlAttr(futuresMetaId + ' ' + futuresPositionId) + '" aria-label="' + _escapeHtmlAttr('做空 ' + listing.name) + '">做空</button>' +
        '</div>' +
      '</article>';
    }).join('') + '</div>';
  }

  if (openContracts.length > 0) {
    capitalFuturesSection += '<div class="market-finance-subsection">📂 当前持仓</div>' +
      '<div class="market-finance-contract-list" role="list" aria-label="当前期货持仓">' + openContracts.map(function (contract) {
        var pnlClass = (contract.unrealizedPnl || 0) >= 0 ? 'market-finance-value-up' : 'market-finance-value-down';
        var pnlText = ((contract.unrealizedPnl || 0) >= 0 ? '+' : '') + (contract.unrealizedPnl || 0).toLocaleString();
        var contractTitleId = _getMarketFinanceDomId('market-contract-title', contract.id);
        var contractMetaId = _getMarketFinanceDomId('market-contract-meta', contract.id);
        var contractPnlId = _getMarketFinanceDomId('market-contract-pnl', contract.id);
        return '<article class="market-finance-contract-row" role="listitem" tabindex="0" aria-labelledby="' + _escapeHtmlAttr(contractTitleId) + '" aria-describedby="' + _escapeHtmlAttr(contractMetaId + ' ' + contractPnlId) + '">' +
          '<div>' +
            '<div id="' + _escapeHtmlAttr(contractTitleId) + '" class="market-finance-contract-title">' + contract.goodName + ' · ' + (contract.direction === 'long' ? '多头' : '空头') + '</div>' +
            '<div id="' + _escapeHtmlAttr(contractMetaId) + '" class="market-finance-contract-meta">锁定价 ' + contract.lockedPrice.toLocaleString() + ' · 当前价 ' + contract.currentPrice.toLocaleString() + ' · 剩余 ' + contract.daysLeft + ' 天</div>' +
          '</div>' +
          '<div class="market-finance-contract-side" role="group" aria-label="' + _escapeHtmlAttr(contract.goodName + ' 合约操作') + '">' +
            '<span id="' + _escapeHtmlAttr(contractPnlId) + '" class="' + pnlClass + '">' + pnlText + '</span>' +
            '<button class="btn-action market-finance-btn" data-action="market-futures-close" data-contract-id="' + _escapeHtmlAttr(contract.id) + '" aria-describedby="' + _escapeHtmlAttr(contractMetaId + ' ' + contractPnlId) + '" aria-label="' + _escapeHtmlAttr('平仓 ' + contract.goodName + (contract.direction === 'long' ? ' 多头' : ' 空头')) + '">平仓</button>' +
          '</div>' +
        '</article>';
      }).join('') + '</div>';
  }

  if (recentClosedContracts.length > 0) {
    capitalFuturesSection += '<div class="market-finance-subsection">📜 近期成交</div>' +
      '<div class="market-finance-history" role="list" aria-label="近期合约成交">' + recentClosedContracts.map(function (contract) {
        var pnl = contract.pnl || 0;
        return '<div class="market-finance-history-row" role="listitem">' +
          '<span>' + contract.goodName + ' · ' + (contract.direction === 'long' ? '多头' : '空头') + '</span>' +
          '<span>' + (pnl >= 0 ? '+' : '') + pnl.toLocaleString() + '</span>' +
        '</div>';
      }).join('') + '</div>';
  }

  capitalFuturesSection += '</section>';

  capitalContainer.innerHTML = _renderCapitalCommandDeck(
    viewingSystem,
    isCurrentSys,
    financeOverview,
    commerceSnapshot,
    stockListings,
    openContracts
  ) + _renderCapitalSignalPanel(
    state,
    financeOverview,
    allStockListings,
    openContracts,
    activeLoans,
    isCurrentSys
  ) + '<div class="market-workspace-board market-capital-board">' + _renderMarketSubworkspace('capital', {
    local: capitalLocalSection,
    stocks: capitalStocksSection,
    futures: capitalFuturesSection,
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

    container.querySelectorAll('[data-action="market-buy-stock"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onBuyStock) financeActions.onBuyStock(button.dataset.stockId);
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

    container.querySelectorAll('[data-action="market-sell-stock"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onSellStock) financeActions.onSellStock(button.dataset.stockId);
      });
    });

    container.querySelectorAll('[data-action="market-invest-trade-station"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onInvestTradeStation) financeActions.onInvestTradeStation(button.dataset.systemId);
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

    container.querySelectorAll('[data-action="market-purchase-insurance"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onPurchaseInsurance) financeActions.onPurchaseInsurance(button.dataset.policyType);
      });
    });

    container.querySelectorAll('[data-action="market-submit-claim"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onSubmitInsuranceClaim) financeActions.onSubmitInsuranceClaim(button.dataset.policyType);
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

    container.querySelectorAll('[data-action="market-hire-manager"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onHireTradeStationManager) financeActions.onHireTradeStationManager(button.dataset.systemId, button.dataset.managerId);
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

    container.querySelectorAll('[data-action="market-batch-hire-manager"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onBatchHireTradeStationManager) financeActions.onBatchHireTradeStationManager(button.dataset.managerId, _parseBatchSystemIds(button.dataset.systemIds));
      });
    });

    container.querySelectorAll('[data-action="market-batch-set-strategy"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onBatchSetTradeStationStrategy) financeActions.onBatchSetTradeStationStrategy(button.dataset.strategyId, _parseBatchSystemIds(button.dataset.systemIds));
      });
    });

    container.querySelectorAll('[data-action="market-futures-long"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onFuturesLong) financeActions.onFuturesLong(button.dataset.goodId);
      });
    });

    container.querySelectorAll('[data-action="market-futures-short"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onFuturesShort) financeActions.onFuturesShort(button.dataset.goodId);
      });
    });

    container.querySelectorAll('[data-action="market-futures-close"]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (financeActions.onFuturesClose) financeActions.onFuturesClose(button.dataset.contractId);
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
 * @param {object}   [financeActions] 股票/期货市场动作回调
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
  var goodsList = isBlack ? Economy.getBlackMarketGoods() : GOODS;
  var focusKey = sysId + ':' + effectiveMarketMode;
  if (!_marketChartRange[focusKey]) _marketChartRange[focusKey] = 14;
  var snapshots = _buildMarketSnapshots(state, sysId, goodsList, isBlack, _marketChartRange[focusKey]);

  if (spotContainer) {
    spotContainer.innerHTML = _renderMarketSubworkspace('spot', {
      trade: _renderSpotTradeSection(),
      intel: _renderSpotIntelSection(state, sysId, snapshots, effectiveMarketMode, systemFaction, blackMarketUnlocked),
      black: _renderBlackMarketSection(state, sysId, effectiveMarketMode, systemFaction, blackMarketUnlocked),
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
  const spotCommandDeckEl = document.getElementById('market-spot-command-deck');
  const quickTradeDockEl = document.getElementById('market-quick-trade-dock');
  if (!goodsListEl) return;
  if (spotCommandDeckEl) {
    spotCommandDeckEl.innerHTML = _renderSpotCommandDeck(
      state,
      sysId,
      snapshots,
      effectiveMarketMode,
      isCurrentSys,
      systemFaction,
      blackMarketUnlocked
    );
  }
  if (goodsToolbarEl) {
    goodsToolbarEl.innerHTML = _renderSpotGoodsToolbar(state, sysId, snapshots, effectiveMarketMode);
  }
  if (quickTradeDockEl) {
    quickTradeDockEl.innerHTML = _renderQuickTradeDock(state, sysId, snapshots, effectiveMarketMode, isCurrentSys);
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
  var depthLabel = depth >= 350 ? '深度市场' : depth >= 200 ? '中等市场' : '浅层市场';
  var depthDiv = document.createElement('div');
  if (isBlack) {
    depthDiv.className = 'market-goods-depth-info black-banner';
    depthDiv.innerHTML = '🕶 黑市交易 —— 高风险高回报，违禁品不受监管' +
      '<span class="bm-warning">⚠ 携带违禁品前往联邦区域将触发执法检查</span>';
  } else {
    depthDiv.className = 'market-goods-depth-info';
    depthDiv.innerHTML = '📊 市场深度：<strong>' + depth + '</strong>（' + depthLabel + '）——' +
      (depth >= 350 ? '大宗交易对价格影响较小' : depth >= 200 ? '交易影响适中' : '大宗交易将显著影响价格') +
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
    var viewedName = viewedSystem ? viewedSystem.name : '该节点';
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

  var activeGoodId = _focusedMarketGood[focusKey] || (snapshots[0] && snapshots[0].good.id);

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
      tag = '<span class="market-good-tag tag-restricted">灰市</span>';
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
          '<span class="market-good-card-stat">供需 ' + sd.ratio.toFixed(2) + 'x</span>' +
          '<span class="market-good-card-stat">差价 ' + spread.toLocaleString() + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="market-good-card-chart-col">' +
        '<div class="market-good-card-chart-label">价格纪录</div>' +
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
          ? '<button class="market-card-btn sell-card-btn' + (isBlack ? ' bm-card-btn' : '') + '" data-id="' + good.id + '">' + (isBlack ? '🕶 卖' : '出售') + '</button>'
          : '') +
        (isCurrentSys
          ? '<button class="market-card-btn buy-card-btn' + (isBlack ? ' bm-card-btn' : '') + '" data-id="' + good.id + '">' + (isBlack ? '🕶 买' : '买入') + '</button>'
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
      render(state, onBuy, onSell, onRefuel, viewingSystem, effectiveMarketMode, tradeGalaxyId, onBlackBuy, onBlackSell, financeActions);
    });
    card.addEventListener('keydown', function (event) {
      if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      _focusedMarketGood[focusKey] = good.id;
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
    _renderAnalysisPanel(analysisPanelEl, state, sysId, snapshots, effectiveMarketMode);
  }

  _renderFinancePanels(state, sysId, isCurrentSys, financeActions, progression);
  _applyMarketWorkspaceTabState(progression);
  _renderMarketExperienceRoute(progression);
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
      '<span class="market-detail-loc-status">终端状态: ' + (isBlack ? '🕶 黑市模式' : '在线') + '</span>';
  }
  if (title) title.textContent = '交易所终端';
}

function _updateMarketDetailMode(state, systemId, isCurrentSys, marketMode) {
  const modeEl = document.getElementById('market-detail-mode');
  if (!modeEl) return;
  const target = findSystem(systemId);
  const current = findSystem(state && state.currentSystem);
  const targetName = target ? target.name : '目标节点';
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
  modeEl.title = '你停靠在「' + currentName + '」，正在远程查看「' + targetName + '」行情；交易、补给和本地经营需要抵达该节点。';
}
