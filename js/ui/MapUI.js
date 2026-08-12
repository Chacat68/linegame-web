// js/ui/MapUI.js — 星系地图交互事件绑定（支持星系/星球双层视图 + 市场面板）
// 导出：init, initTabs, init3DCallbacks, refreshGalaxyBtn, openMarket, closeMarket, isMarketOpen,
//        setRefreshMarket, setExplorationActions, getMarketViewSystem, refreshMarketLocation,
//        showMarketOverview, showMarketDetail, refreshPlanetDetail, getMapView, getCurrentGalaxyId,
//        getActiveArchiveTab
import * as Renderer3D from './StarmapRenderer.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as Economy from '../systems/economy/Economy.js';
import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import * as EventBus from '../core/EventBus.js';
import { GOODS } from '../data/goods.js';
import {
  buildContextualMarketAction,
  getContextualMarketFocus,
} from './MarketFocus.js';
import { getCommandActionAttributes, normalizeCommandAction, renderCommandActionContent } from './CommandAction.js';
import {
  closeAllSecondarySurfaces,
  closePrimarySurface,
  closeSecondarySurface,
  hasBlockingSurfaceOpen,
  isPrimarySurfaceVisible,
  openPrimarySurface,
  openSecondarySurface,
} from './SurfaceManager.js';
import {
  GALAXIES,
  findSystem,
  findGalaxy,
  GALAXY_JUMP_DAYS,
  getSystemsByGalaxy,
  getAccessibleGalaxies,
  getAccessibleSystems,
  getGalaxyAccessState,
  getSystemAccessState,
  isSystemAccessible,
}  from '../data/systems.js';

const _goodsById = GOODS.reduce(function (lookup, good) {
  lookup[good.id] = good;
  return lookup;
}, Object.create(null));

let _tabClickCallback = null;
let _navigationChangeCallback = null;
let _navigationGuideFocus = null;
let _marketOpen = false;
let _smallScreenMql = null;
let _explorationTerminalPanelOpen = false;
const STARMAP_RAIL_PANEL_OPEN_EVENT = 'starmap-rail:panel-open';
const STARMAP_RAIL_SOURCE_EXPLORATION_TERMINAL = 'exploration-terminal';
const STARMAP_GALAXY_VIEW_TOGGLE_EVENT = 'starmap:galaxy-view-toggle';

// 市场浏览状态
let _marketViewGalaxy = null;
let _marketViewSystem = null;      // 详情模式时选中的星球
let _marketMode = 'detail';
let _pendingMarketPanelFocus = null;
// 市场刷新回调（由 GameManager 注入）
let _refreshMarket = null;          // (mode) => void
let _stateRef = null;               // 用于内部事件引用
let _explorationActions = null;
let _planetDetailDisclosureState = Object.create(null);
let _selectedPlanetDetailSystem = null;
let _travelActionHandler = null;
let _galaxyJumpActionHandler = null;
let _hoveredGalaxyId = null;
let _mainBindingsInitialized = false;
let _tabBindingsInitialized = false;
let _railMutualExclusionBound = false;
let _galaxyViewToggleBound = false;

function _normalizeMarketPanelFocus(focus) {
  if (!focus || typeof focus !== 'object') return null;

  var workspaceId = typeof focus.workspaceId === 'string' ? focus.workspaceId.trim() : '';
  if (!workspaceId) return null;

  var subworkspaceId = typeof focus.subworkspaceId === 'string' ? focus.subworkspaceId.trim() : '';
  var marketMode = typeof focus.marketMode === 'string' ? focus.marketMode.trim() : '';
  var goodId = typeof focus.goodId === 'string' ? focus.goodId.trim() : '';
  var tradeAction = typeof focus.tradeAction === 'string' ? focus.tradeAction.trim() : '';
  return {
    workspaceId: workspaceId,
    subworkspaceId: subworkspaceId,
    marketMode: marketMode,
    goodId: goodId,
    tradeAction: tradeAction,
  };
}

function _getPoiStatus(stateRef, systemId, poiId) {
  if (!stateRef || !systemId || !poiId) return null;
  if (_explorationActions && typeof _explorationActions.getPoiStatus === 'function') {
    return _explorationActions.getPoiStatus(systemId, poiId);
  }
  return Exploration.getPoiStatus(stateRef, systemId, poiId);
}

function _appendFlowNote(flow, text) {
  if (!flow || !text) return;
  flow.secondaryNote = flow.secondaryNote ? (flow.secondaryNote + ' ' + text) : text;
}

function _escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function _clearSelectedPlanetDetail(shouldRefresh) {
  _selectedPlanetDetailSystem = null;
  _navigationGuideFocus = null;
  if (Renderer3D.clearSelection) Renderer3D.clearSelection();
  if (shouldRefresh && _stateRef) refreshPlanetDetail(_stateRef);
}

function _setSelectedPlanetDetail(systemId) {
  _selectedPlanetDetailSystem = systemId || null;
}

function _getDefaultArchiveTab(stateRef) {
  var safeState = stateRef || {};
  var activeQuestCount = Array.isArray(safeState.quests) ? safeState.quests.length : 0;
  var availableQuestCount = 0;
  try {
    availableQuestCount = Quest.getAvailableQuests(safeState).length;
  } catch (err) {
    availableQuestCount = 0;
  }
  if (activeQuestCount > 0 || availableQuestCount > 0) return 'tab-quest';
  try {
    var surveySummary = safeState.currentSystem
      ? Exploration.getSurveySummary(safeState, safeState.currentSystem)
      : null;
    if (surveySummary && surveySummary.reportCount > 0) return 'tab-exploration';
  } catch (err) {
    // 探索数据尚未初始化时继续使用其它档案分类。
  }
  if ((safeState.currentResearch && safeState.currentResearch.techId) || (safeState.researchOptions || []).length > 0) return 'tab-research';
  return 'tab-quest';
}

function _getGoodName(goodId) {
  var good = goodId ? _goodsById[goodId] : null;
  return good ? good.name : goodId;
}

function _getPlanetDetailDisplayId(stateRef) {
  if (_selectedPlanetDetailSystem) return _selectedPlanetDetailSystem;
  return stateRef ? (stateRef.hoveredSystem || stateRef.currentSystem) : null;
}

function _buildPlanetTravelAction(stateRef, sys) {
  if (!stateRef || !sys) return null;

  var playerLevel = stateRef.playerLevel || 1;
  var systemAccess = getSystemAccessState(sys.id, playerLevel, stateRef.researchedTechs || []);
  if (!systemAccess.unlocked) {
    var galaxyAccess = systemAccess.galaxyAccess;
    if (!galaxyAccess.unlocked) {
      var galaxyName = galaxyAccess.galaxy ? galaxyAccess.galaxy.name : '目标星系';
      return {
        type: 'travel',
        systemId: sys.id,
        label: '星系未开放',
        disabled: true,
        title: galaxyName + ' 需 Lv.' + galaxyAccess.requiredLevel + ' 解锁',
        hint: galaxyAccess.techRequired
          ? ('达到 Lv.' + galaxyAccess.requiredLevel + ' 或研究超空间跃迁后，可提前进入该星系入口层。')
          : ('达到 Lv.' + galaxyAccess.requiredLevel + ' 后，才可切换到该星系。'),
      };
    }

    return {
      type: 'travel',
      systemId: sys.id,
      label: '等级不足',
      disabled: true,
      title: '需 Lv.' + systemAccess.requiredLevel + '（当前 Lv.' + playerLevel + '）',
      hint: galaxyAccess.unlockedBy === 'tech'
        ? '超空间跃迁仅提前开放入口层；这颗高阶星球仍需达到对应等级。'
        : '达到对应等级后才能前往这颗星球。',
    };
  }

  if (sys.id === stateRef.currentSystem) {
    return {
      type: 'travel',
      systemId: sys.id,
      label: '当前停靠中',
      disabled: true,
      title: '你已经停靠在这颗星球。',
      hint: '这里已展开探索详情，可以直接调查探索点。',
    };
  }

  var activeShip = Array.isArray(stateRef.fleet)
    ? stateRef.fleet[stateRef.activeShipIndex || 0]
    : null;
  if (activeShip && activeShip.repairJob && activeShip.repairJob.remainingDays > 0) {
    return {
      type: 'travel',
      systemId: sys.id,
      label: '维修中',
      disabled: true,
      title: '当前飞船仍在维修中',
      hint: '剩余 ' + activeShip.repairJob.remainingDays + ' 天，维修完成后方可出航。',
    };
  }

  var crossGalaxy = sys.galaxyId !== stateRef.currentGalaxy;
  return {
    type: 'travel',
    systemId: sys.id,
    label: crossGalaxy ? '跃迁前往' : '前往该星球',
    disabled: false,
    title: crossGalaxy ? '跨星系跳转到该星球' : '前往该星球',
    hint: crossGalaxy
      ? '单击先看详情，再次点击同一星球或按钮可立即跃迁。'
      : '单击先看详情，再次点击同一星球或按钮可立即前往。',
  };
}

function _travelToPlanet(systemId) {
  if (!_stateRef || !systemId) return false;

  var sys = findSystem(systemId);
  var travelAction = _buildPlanetTravelAction(_stateRef, sys);
  if (!sys || !travelAction || travelAction.disabled) return false;

  _clearSelectedPlanetDetail(false);
  _stateRef.hoveredSystem = null;
  _hoveredGalaxyId = null;

  if (sys.galaxyId !== _stateRef.currentGalaxy) {
    if (_galaxyJumpActionHandler) {
      _galaxyJumpActionHandler(sys.id);
      return true;
    }
    return false;
  }

  if (_travelActionHandler) {
    _travelActionHandler(sys.id);
    return true;
  }
  return false;
}

function _switchToGalaxy(galaxyId) {
  if (!_stateRef || !galaxyId) return false;

  var accessState = getGalaxyAccessState(galaxyId, _stateRef.playerLevel || 1, _stateRef.researchedTechs || []);
  if (!accessState.unlocked) return false;

  _clearSelectedPlanetDetail(false);
  _closeExplorationTerminalPanel(_stateRef);
  _stateRef.hoveredSystem = null;
  _hoveredGalaxyId = null;
  _stateRef.viewingGalaxy = galaxyId;
  _stateRef.mapView = 'planets';
  refreshPlanetDetail(_stateRef);
  return true;
}

function _returnToPlanetView() {
  if (!_stateRef) return false;

  _clearSelectedPlanetDetail(false);
  _closeExplorationTerminalPanel(_stateRef);
  _stateRef.hoveredSystem = null;
  _hoveredGalaxyId = null;
  _stateRef.mapView = 'planets';
  _stateRef.viewingGalaxy = _stateRef.currentGalaxy;
  refreshPlanetDetail(_stateRef);
  return true;
}

function _bindPlanetDetailPanelEvents() {
  var panel = document.getElementById('planet-detail-panel');
  if (!panel || panel.dataset.detailUiBound === 'true') return;

  panel.addEventListener('click', function (event) {
    var galaxyButton = event.target.closest('[data-galaxy-action]');
    if (galaxyButton && panel.contains(galaxyButton)) {
      var galaxyAction = galaxyButton.dataset.galaxyAction;
      var galaxyId = galaxyButton.dataset.galaxyId;

      event.preventDefault();
      event.stopPropagation();

      if (galaxyAction === 'open') {
        _switchToGalaxy(galaxyId);
      } else if (galaxyAction === 'return-planets') {
        _returnToPlanetView();
      }
      return;
    }

    var actionButton = event.target.closest('[data-planet-detail-action]');
    if (!actionButton || !panel.contains(actionButton)) return;

    var action = actionButton.dataset.planetDetailAction;
    var systemId = actionButton.dataset.systemId;

    event.preventDefault();
    event.stopPropagation();

    if (action === 'close-detail') {
      _clearSelectedPlanetDetail(true);
      return;
    }

    if (action === 'travel') {
      _travelToPlanet(systemId);
    }
  });

  panel.addEventListener('click', function (event) {
    var summary = event.target.closest('summary');
    if (!summary || !panel.contains(summary)) return;

    var detail = summary.parentElement;
    if (!detail || detail.tagName !== 'DETAILS') return;

    var sectionId = detail.dataset.detailSection;
    if (!sectionId) return;
    _planetDetailDisclosureState[sectionId] = !detail.open;
  }, true);

  panel.addEventListener('toggle', function (event) {
    var target = event.target;
    if (!target || target.tagName !== 'DETAILS') return;

    var sectionId = target.dataset.detailSection;
    if (!sectionId) return;
    _planetDetailDisclosureState[sectionId] = target.open;
  }, true);

  panel.addEventListener('keydown', function (event) {
    if (!event || event.key !== 'Escape') return;
    var handled = false;
    if (_selectedPlanetDetailSystem) {
      _clearSelectedPlanetDetail(true);
      handled = true;
    } else if (_stateRef && _stateRef.mapView === 'galaxies') {
      handled = _returnToPlanetView();
    }
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
  });

  panel.dataset.detailUiBound = 'true';
}

function _isPlanetDetailSectionOpen(sectionId, defaultOpen) {
  if (Object.prototype.hasOwnProperty.call(_planetDetailDisclosureState, sectionId)) {
    return !!_planetDetailDisclosureState[sectionId];
  }
  return !!defaultOpen;
}

function _buildPlanetDetailChip(text, tone) {
  if (!text) return '';

  var className = 'planet-detail-chip';
  if (tone) className += ' planet-detail-chip--' + tone;
  return '<span class="' + className + '" role="listitem">' + _escapeHtml(text) + '</span>';
}

function _buildPlanetDetailKeyCard(label, value, options) {
  if (!label || !value) return '';

  var opts = options || {};
  var className = 'planet-detail-key-card';
  if (opts.wide) className += ' planet-detail-key-card--wide';
  if (opts.tone) className += ' planet-detail-key-card--' + opts.tone;

  return '<div class="' + className + '">' +
    '<div class="planet-detail-key-label">' + _escapeHtml(label) + '</div>' +
    '<div class="planet-detail-key-value">' + _escapeHtml(value) + '</div>' +
  '</div>';
}

function _buildPlanetDetailSummaryShell(sys, gal, heroChips, descHtml, heroGrid, options) {
  var opts = options || {};
  var titleId = 'planet-detail-title-' + _escapeHtmlAttr(sys.id);
  var kicker = opts.isPinned ? 'LOCKED STARMAP NODE' : 'STARMAP NODE PREVIEW';

  return '<section class="planet-detail-shell" aria-labelledby="' + titleId + '">' +
    '<header class="planet-detail-hero planet-detail-wide">' +
      '<div class="planet-detail-kicker">' + kicker + '</div>' +
      '<div class="planet-detail-title-row">' +
        '<h3 id="' + titleId + '" class="planet-detail-title">🪐 ' + _escapeHtml(sys.name) + '</h3>' +
        '<span class="planet-detail-galaxy-tag">' + _escapeHtml(gal ? (gal.icon + ' ' + gal.name) : '未知星系') + '</span>' +
      '</div>' +
      '<div class="planet-detail-chip-row" role="list" aria-label="航点状态">' + heroChips + '</div>' +
      '<p class="planet-detail-desc">' + descHtml + '</p>' +
    '</header>' +
    '<section class="planet-detail-summary-grid" aria-label="航点摘要">' +
      heroGrid +
    '</section>';
}

function _buildPlanetDetailActionShelf(actionHtml, guideFocus) {
  if (!actionHtml) return '';
  return '<section class="planet-detail-action-shelf" aria-label="' + (guideFocus ? '指引行动' : '航点行动') + '">' + actionHtml + '</section>';
}

function _buildPlanetDetailScrollBody(contentHtml) {
  return '<div class="planet-detail-scroll-body">' + contentHtml + '</div>';
}

function _closePlanetDetailSummaryShell() {
  return '</section>';
}

function _buildPlanetDetailField(label, value) {
  if (!label || !value) return '';
  return '<div class="planet-detail-item planet-detail-item--wrap">' +
    '<span class="planet-detail-label">' + _escapeHtml(label) + '</span>' + _escapeHtml(value) +
  '</div>';
}

function _formatTradeGoods(goodIds) {
  if (!Array.isArray(goodIds) || goodIds.length === 0) return '综合供需';
  return goodIds.map(function (goodId) {
    var good = _goodsById[goodId];
    if (!good) return goodId;
    return good.emoji + ' ' + good.name;
  }).join(' · ');
}

function _buildGalaxyTradeProfileSummary(galaxy) {
  var tradeProfile = galaxy && galaxy.tradeProfile;
  if (!tradeProfile) return '综合供需，适合作为中转市场';
  return '主供 ' + _formatTradeGoods(tradeProfile.exports) + '；高价收 ' + _formatTradeGoods(tradeProfile.imports);
}

function _buildPlanetDetailDisclosure(sectionId, title, bodyHtml, options) {
  if (!bodyHtml) return '';

  var opts = options || {};
  var className = 'planet-detail-disclosure';
  if (opts.compact) className += ' planet-detail-disclosure--compact';
  var openAttr = _isPlanetDetailSectionOpen(sectionId, opts.defaultOpen) ? ' open' : '';
  var previewHtml = opts.preview
    ? '<span class="planet-detail-disclosure-preview">' + _escapeHtml(opts.preview) + '</span>'
    : '';

  return '<details class="' + className + '" data-detail-section="' + _escapeHtmlAttr(sectionId) + '"' + openAttr + '>' +
    '<summary class="planet-detail-disclosure-summary">' +
      '<span class="planet-detail-disclosure-title">' + _escapeHtml(title) + '</span>' +
      previewHtml +
      '<span class="planet-detail-disclosure-caret" aria-hidden="true">▾</span>' +
    '</summary>' +
    '<div class="planet-detail-disclosure-body">' + bodyHtml + '</div>' +
  '</details>';
}

function _getCurrentSystemExplorationTarget(stateRef) {
  if (!stateRef) return null;
  if (stateRef.mapView !== 'planets') return null;
  if (stateRef.viewingGalaxy !== stateRef.currentGalaxy) return null;

  var sys = findSystem(stateRef.currentSystem);
  var planetData = GalaxyData.getPlanetData(stateRef.currentSystem);
  var exploration = planetData && planetData.exploration;

  if (!sys || !exploration) return null;

  var isUnlocked = isSystemAccessible(sys.id, stateRef.playerLevel || 1, stateRef.researchedTechs || []);
  var flow = _getExplorationFlow(stateRef, sys, planetData, true, isUnlocked);
  if (!flow) return null;

  var label = '当前地点';
  var title = flow.title || '查看当前地点';

  if (!isUnlocked) {
    label = '🔒 航点锁定';
  } else if (flow.unresolvedPois && flow.unresolvedPois.length > 0) {
    label = '🧭 可探索 · ' + flow.unresolvedPois.length;
  } else {
    label = '📘 航点档案';
  }

  return {
    systemId: sys.id,
    label: label,
    disabled: false,
    title: title,
  };
}

function _getExplorationTerminalBadge(label) {
  var match = String(label || '').match(/·\s*(\d+)$/);
  return match ? match[1] : '';
}

function _setExplorationTerminalButtonPresentation(btn, label, title) {
  var displayLabel = String(label || '当前地点');
  var titleText = title ? (displayLabel + ' · ' + title) : displayLabel;
  var labelEl = typeof btn.querySelector === 'function'
    ? btn.querySelector('[data-starmap-rail-label]')
    : null;

  if (labelEl) {
    labelEl.textContent = displayLabel;
  } else {
    btn.textContent = displayLabel;
  }
  btn.dataset.terminalBadge = _getExplorationTerminalBadge(displayLabel);
  btn.setAttribute('aria-label', displayLabel);
  btn.setAttribute('title', titleText);
}

function _bindStarmapRailMutualExclusion() {
  if (_railMutualExclusionBound) return;
  _railMutualExclusionBound = true;

  EventBus.on(STARMAP_RAIL_PANEL_OPEN_EVENT, function (data) {
    if (data && data.source === STARMAP_RAIL_SOURCE_EXPLORATION_TERMINAL) return;
    if (!_explorationTerminalPanelOpen) return;
    _closeExplorationTerminalPanel(_stateRef);
  });
}

function _notifyExplorationTerminalPanelOpened() {
  EventBus.emit(STARMAP_RAIL_PANEL_OPEN_EVENT, {
    source: STARMAP_RAIL_SOURCE_EXPLORATION_TERMINAL,
    panelId: 'exploration-terminal',
  });
}

_bindStarmapRailMutualExclusion();

function _setExplorationTerminalPanelOpen(nextOpen, stateRef) {
  var resolvedState = stateRef || _stateRef;
  _explorationTerminalPanelOpen = !!nextOpen;
  _updateExplorationTerminalButton(resolvedState);
  _renderCurrentSystemExplorationCard(resolvedState);
  if (_explorationTerminalPanelOpen) _notifyExplorationTerminalPanelOpened();
}

function _closeExplorationTerminalPanel(stateRef) {
  _setExplorationTerminalPanelOpen(false, stateRef);
}

function _updateExplorationTerminalButton(stateRef) {
  var btn = document.getElementById('exploration-terminal-btn');
  if (!btn) return;

  var target = _getCurrentSystemExplorationTarget(stateRef);
  var shouldShow = !!target;

  btn.setAttribute('aria-controls', 'current-system-exploration-card');
  btn.hidden = !shouldShow;
  btn.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  _setExplorationTerminalButtonPresentation(btn, '当前地点', '查看当前地点');
  btn.disabled = false;
  btn.removeAttribute('aria-disabled');
  btn.classList.toggle('active', !!_explorationTerminalPanelOpen);
  btn.classList.toggle('is-active', !!_explorationTerminalPanelOpen);
  btn.setAttribute('aria-pressed', _explorationTerminalPanelOpen ? 'true' : 'false');
  btn.setAttribute('aria-expanded', _explorationTerminalPanelOpen ? 'true' : 'false');
  btn.removeAttribute('data-system-id');

  if (!shouldShow) return;

  if (target) {
    _setExplorationTerminalButtonPresentation(btn, target.label || '当前地点', target.title || '查看当前地点');
    btn.dataset.systemId = target.systemId || '';
    if (target.disabled) {
      btn.disabled = true;
      btn.setAttribute('aria-disabled', 'true');
    }
    return;
  }

}

function _hideCurrentSystemExplorationCard() {
  var card = document.getElementById('current-system-exploration-card');
  if (!card) return;
  card.innerHTML = '';
  card.classList.remove('visible');
}

function _buildCurrentSystemExplorationCard(flow, sys) {
  if (!flow || !sys) return '';
  var terminalState = flow.phase;
  var surveySummary = _stateRef && sys ? Exploration.getSurveySummary(_stateRef, sys.id) : null;
  var chainHtml = _buildSurveyChainCards(surveySummary, { compact: true });
  var signalHtml = _buildCurrentSystemSignalPanel(flow, surveySummary);

  var flowHtml = _buildExplorationFlowCard(flow, {
    cardClass: 'planet-detail-flow-card current-system-flow-card',
    actionClass: 'current-system-action',
  }) + _buildExplorationProgressRow(flow);

  return '<div class="current-system-card-head">' +
    '<div class="current-system-card-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#rail-icon-explore"></use></svg></div>' +
    '<div class="current-system-card-head-main">' +
      '<div class="current-system-card-kicker">当前地点</div>' +
      '<div class="current-system-card-name">' + _escapeHtml(sys.name) + '</div>' +
    '</div>' +
    '<div class="current-system-card-state">' + _escapeHtml(terminalState) + '</div>' +
    '<button class="current-system-card-close hud-widget-close" type="button" data-exploration-terminal-close aria-label="关闭当前地点" title="关闭当前地点">×</button>' +
  '</div><div class="current-system-card-body">' + signalHtml + flowHtml + chainHtml + '</div>';
}

function _buildCurrentSystemSignalMetric(label, value, note, tone) {
  var className = 'current-system-signal-item' + (tone ? (' current-system-signal-item--' + tone) : '');
  return '<div class="' + className + '" role="listitem">' +
    '<span class="current-system-signal-label">' + _escapeHtml(label) + '</span>' +
    '<strong class="current-system-signal-value">' + _escapeHtml(value) + '</strong>' +
    '<span class="current-system-signal-note">' + _escapeHtml(note || '') + '</span>' +
  '</div>';
}

function _buildCurrentSystemSignalPanel(flow, surveySummary) {
  if (!flow) return '';

  var routeCount = Array.isArray(flow.discoveredRoutes) ? flow.discoveredRoutes.length : 0;
  var unresolvedCount = Array.isArray(flow.unresolvedPois) ? flow.unresolvedPois.length : 0;
  var reportCount = surveySummary && Array.isArray(surveySummary.reports) ? surveySummary.reports.length : 0;
  var chainCount = surveySummary && Array.isArray(surveySummary.anomalyChains) ? surveySummary.anomalyChains.length : 0;
  var focusTitle = '本地探索已整理';
  var focusNote = '当前航点没有阻塞项，可按面板内行动按钮继续处理本地事务。';
  var focusTone = 'complete';

  if (flow.nextAction && flow.nextAction.type === 'poi') {
    focusTitle = '地表调查待处理';
    focusNote = flow.secondaryNote || ('还有 ' + unresolvedCount + ' 个探索点等待调查。');
    focusTone = 'poi';
  } else if (routeCount > 0) {
    focusTitle = '隐藏航线图已更新';
    focusNote = '本地探索已归档，后续从这里出发会自动使用已发现航线折扣。';
    focusTone = 'route';
  } else if (flow.secondaryNote) {
    focusTitle = '本地条件受限';
    focusNote = flow.secondaryNote;
    focusTone = 'pending';
  }

  return '<section class="current-system-signal-panel" aria-label="当前航点当前状态">' +
    '<div class="current-system-signal-head">' +
      '<div>' +
        '<div class="current-system-signal-title">当前航点状态</div>' +
        '<div class="current-system-signal-subtitle">集中显示探索点、报告和隐藏航线，方便判断下一步。</div>' +
      '</div>' +
      '<span class="current-system-signal-badge">' + _escapeHtml(flow.roleTag || '当前停靠') + '</span>' +
    '</div>' +
    '<div class="current-system-signal-grid" role="list" aria-label="当前航点探索指标">' +
      _buildCurrentSystemSignalMetric('报告', String(reportCount), reportCount > 0 ? '探索结论已保存' : '暂无调查结论', reportCount > 0 ? 'ready' : '') +
      _buildCurrentSystemSignalMetric('探索点', flow.resolvedCount + '/' + flow.totalPois, unresolvedCount > 0 ? (unresolvedCount + ' 个待调查') : '已全部调查', unresolvedCount > 0 ? 'work' : 'ready') +
      _buildCurrentSystemSignalMetric('隐藏航线', String(routeCount), chainCount > 0 ? (chainCount + ' 条探索任务') : '暂无已发现航线', routeCount > 0 ? 'route' : '') +
    '</div>' +
    '<div class="current-system-signal-focus" aria-label="当前航点建议" data-tone="' + _escapeHtmlAttr(focusTone) + '">' +
      '<span class="current-system-signal-focus-kicker">当前建议</span>' +
      '<strong class="current-system-signal-focus-title">' + _escapeHtml(focusTitle) + '</strong>' +
      '<span class="current-system-signal-focus-note">' + _escapeHtml(focusNote) + '</span>' +
    '</div>' +
  '</section>';
}

function _updateSecretRoutesToggle() {
  var btn = document.getElementById('secret-routes-toggle-btn');
  if (!btn) return;

  var visible = Renderer3D.isSecretRoutesVisible ? Renderer3D.isSecretRoutesVisible() : true;
  btn.classList.toggle('active', !!visible);
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  btn.textContent = visible ? '🛰 隐藏航线已显示' : '🛰 显示隐藏航线';
  btn.title = visible ? '点击隐藏已发现的隐藏航线' : '点击显示已发现的隐藏航线';
}

function _bindExplorationTerminalPanelControls() {
  var card = document.getElementById('current-system-exploration-card');
  if (!card || card.dataset.closeBound === 'true') return;

  card.addEventListener('click', function (event) {
    var closeBtn = event.target.closest('[data-exploration-terminal-close]');
    if (!closeBtn || !card.contains(closeBtn)) return;

    event.preventDefault();
    event.stopPropagation();
    _closeExplorationTerminalPanel();
  });

  card.dataset.closeBound = 'true';
}

/**
 * 注入市场刷新回调（在 GameManager.init 中调用）
 * @param {Function} fn  (mode:'detail') => void  — 刷新市场
 */
export function setRefreshMarket(fn) {
  _refreshMarket = fn;
}

export function setExplorationActions(actions) {
  _explorationActions = actions || null;
  _bindExplorationActionEvents();
}

/**
 * 获取市场当前查看的星球 ID（供 GameManager 传给 MarketUI.render）
 * @param {object} state
 * @returns {string}
 */
export function getMarketViewSystem(state) {
  return _marketViewSystem || state.currentSystem;
}

/** 获取市场当前查看的星系 ID */
export function getMarketViewGalaxy(state) {
  return _marketViewGalaxy || state.currentGalaxy;
}

/** 获取当前市场模式 */
export function getMarketMode() {
  return _marketMode;
}

export function consumePendingMarketPanelFocus() {
  var focus = _pendingMarketPanelFocus;
  _pendingMarketPanelFocus = null;
  return focus;
}

/** 获取当前地图视图模式 */
export function getMapView() {
  return _stateRef ? _stateRef.mapView : 'planets';
}

/** 获取当前查看的星系ID */
export function getCurrentGalaxyId() {
  return _stateRef ? (_stateRef.viewingGalaxy || _stateRef.currentGalaxy) : 'milky_way';
}

/** 切换到总览模式 */
export function showMarketOverview() {
  _marketMode = 'overview';
  _marketViewSystem = null;
  if (_refreshMarket) _refreshMarket('overview');
}

/** 切换到详情模式 */
export function showMarketDetail(systemId) {
  _marketMode = 'detail';
  _marketViewSystem = systemId;
  if (_refreshMarket) _refreshMarket('detail');
}

export function toggleGalaxyView() {
  var currentState = _stateRef;
  if (!currentState) return false;

  closeMarket();
  _clearSelectedPlanetDetail(false);
  _closeExplorationTerminalPanel(currentState);
  if (currentState.mapView === 'galaxies') {
    return _returnToPlanetView();
  }

  currentState.hoveredSystem = null;
  _hoveredGalaxyId = null;
  currentState.mapView = 'galaxies';
  refreshPlanetDetail(currentState);
  return true;
}

function _bindGalaxyViewToggleEvent() {
  if (_galaxyViewToggleBound) return;
  _galaxyViewToggleBound = true;
  EventBus.on(STARMAP_GALAXY_VIEW_TOGGLE_EVENT, toggleGalaxyView);
}

/**
 * 绑定星系地图的鼠标交互
 * @param {object}   stateRef    游戏状态对象（引用）
 * @param {Function} onTravel    (systemId: string) => void
 * @param {Function} onGalaxyJump (galaxyId: string) => void  跨星系跳转回调
 */
export function init(stateRef, onTravel, onGalaxyJump) {
  // 保存状态引用供底部导航使用
  _stateRef = stateRef;
  _clearSelectedPlanetDetail(false);
  _bindStarmapRailMutualExclusion();
  _bindExplorationActionEvents();
  _bindExplorationTerminalPanelControls();
  _bindGalaxyViewToggleEvent();

  if (!_mainBindingsInitialized) {
    _mainBindingsInitialized = true;

    const secretRoutesBtn = document.getElementById('secret-routes-toggle-btn');
    if (secretRoutesBtn) {
      secretRoutesBtn.addEventListener('click', function () {
        const visible = Renderer3D.isSecretRoutesVisible ? Renderer3D.isSecretRoutesVisible() : true;
        if (Renderer3D.setSecretRoutesVisible) {
          Renderer3D.setSecretRoutesVisible(!visible);
        }
        _updateSecretRoutesToggle();
      });
    }

    const explorationTerminalBtn = document.getElementById('exploration-terminal-btn');
    if (explorationTerminalBtn) {
      explorationTerminalBtn.addEventListener('click', function () {
        var currentState = _stateRef || stateRef;
        var target = _getCurrentSystemExplorationTarget(currentState);
        if (!target) {
          _closeExplorationTerminalPanel(currentState);
          return;
        }
        _setExplorationTerminalPanelOpen(!_explorationTerminalPanelOpen, currentState);
      });
    }

    // 市场按钮
    const marketBtn = document.getElementById('market-view-btn');
    const marketCloseBtn = document.getElementById('market-close-btn');
    if (marketBtn) {
      marketBtn.addEventListener('click', function () {
        var currentState = _stateRef || stateRef;
        if (_marketOpen) {
          closeMarket();
          _setBottomNavActive('starmap');
        } else if (currentState) {
          _closeAllOverlayPanels();
          openMarket(currentState);
          _setBottomNavActive('market');
        }
      });
    }
    if (marketCloseBtn) {
      marketCloseBtn.addEventListener('click', function () {
        closeMarket();
        _setBottomNavActive('starmap');
      });
    }

    // 3D视图默认启用，按钮隐藏
    const toggle3DBtn = document.getElementById('map-3d-toggle-btn');
    if (toggle3DBtn) {
      toggle3DBtn.style.display = 'none';
    }
  }

  _updateSecretRoutesToggle();
  _updateExplorationTerminalButton(stateRef);
  refreshPlanetDetail(stateRef);
}

/**
 * 初始化星图回调（由 GameManager 在 init 后调用）
 */
export function init3DCallbacks(stateRef, onTravel, onGalaxyJump) {
  // 确保星图渲染器已激活
  if (!Renderer3D.isActive()) {
    Renderer3D.toggleView();
  }
  _travelActionHandler = onTravel || null;
  _galaxyJumpActionHandler = onGalaxyJump || null;
  window._mapHoverCallback = function(data) {
    var nextHoveredSystem = null;
    var nextHoveredGalaxy = null;
    if (data) {
      if (data.type === 'system') nextHoveredSystem = data.id;
      if (data.type === 'galaxy') nextHoveredGalaxy = data.id;
    }

    var changed = stateRef.hoveredSystem !== nextHoveredSystem || _hoveredGalaxyId !== nextHoveredGalaxy;
    stateRef.hoveredSystem = nextHoveredSystem;
    _hoveredGalaxyId = nextHoveredGalaxy;

    if (changed) {
      refreshPlanetDetail(stateRef);
    }
  };
  window._mapClickCallback = function(systemId) {
    const sys = findSystem(systemId);
    if (!sys) return;
    _hoveredGalaxyId = null;

    if (_selectedPlanetDetailSystem !== systemId) {
      _setSelectedPlanetDetail(systemId);
      stateRef.hoveredSystem = systemId;
      refreshPlanetDetail(stateRef);
      return;
    }

    _travelToPlanet(systemId);
  };
  window._mapBackgroundClickCallback = function() {
    if (!_selectedPlanetDetailSystem) return;
    _clearSelectedPlanetDetail(true);
  };
  window._galaxyClickCallback = function(galaxyId) {
    _switchToGalaxy(galaxyId);
  };
  window._switchToGalaxyView = function() {
    var currentState = _stateRef || stateRef;
    if (currentState && currentState.mapView !== 'galaxies') toggleGalaxyView();
  };
}

function _setGalaxyImmersionMode(active) {
  if (!document.body || !document.body.classList) return;
  document.body.classList.toggle('starmap-galaxy-mode', !!active);
}

/** 外部调用刷新星图控件状态 */
export function refreshGalaxyBtn(stateRef) {
  _updateSecretRoutesToggle();
  _updateExplorationTerminalButton(stateRef);
}

function _getSafetyLabel(score) {
  if (score >= 80) return '安定';
  if (score >= 60) return '可控';
  if (score >= 40) return '紧张';
  return '危险';
}

function _bindExplorationActionContainer(containerId) {
  var container = document.getElementById(containerId);
  if (!container || container.dataset.bound === 'true') return;

  container.addEventListener('click', function (event) {
    var button = event.target.closest('[data-exploration-action]');
    if (!button || button.disabled || !_explorationActions || !container.contains(button)) return;

    var action = button.dataset.explorationAction;
    var systemId = button.dataset.systemId;
    var poiId = button.dataset.poiId;

    event.preventDefault();
    event.stopPropagation();

    if (action === 'market') {
      openMarketSystemPanel(_stateRef, systemId, {
        workspaceId: button.dataset.marketWorkspaceId,
        subworkspaceId: button.dataset.marketSubworkspaceId,
        marketMode: button.dataset.marketMode || '',
      });
      return;
    }
    if (action === 'poi' && _explorationActions.onExplorePoi) {
      _explorationActions.onExplorePoi(systemId, poiId);
    }
  });

  container.dataset.bound = 'true';
}

function _bindExplorationActionEvents() {
  _bindExplorationActionContainer('planet-detail-panel');
  _bindExplorationActionContainer('current-system-exploration-card');
  _bindPlanetDetailPanelEvents();
  _bindExplorationTerminalPanelControls();
}

function _getExplorationFlow(stateRef, sys, planetData, isCurrentSystem, isUnlocked) {
  var exploration = planetData && planetData.exploration;
  if (!exploration) return null;

  var discoveredPois = (exploration.pois || []).slice();
  var unresolvedPois = _orderPoisForExploration(discoveredPois.filter(function (poi) { return !poi.resolved; }));
  var resolvedPois = discoveredPois.filter(function (poi) { return poi.resolved; });
  var discoveredRoutes = (exploration.secretRoutes || []).filter(function (route) { return route.discovered; });
  var totalPois = (exploration.pois || []).length;
  var flow = {
    exploration: exploration,
    discoveredPois: discoveredPois,
    unresolvedPois: unresolvedPois,
    resolvedPois: resolvedPois,
    discoveredRoutes: discoveredRoutes,
    resolvedCount: resolvedPois.length,
    totalPois: totalPois,
    roleTag: isCurrentSystem ? '当前停靠' : '悬停预览',
    phase: '',
    title: '',
    detail: '',
    nextAction: null,
    secondaryNote: '',
  };

  if (!isUnlocked) {
    flow.phase = '尚未解锁';
    flow.title = '等级不足，暂时无法展开本地探索';
    flow.detail = '达到 Lv.' + (sys.minLevel || 1) + ' 后才能调查这颗星球的探索点。';
    return flow;
  }

  if (!isCurrentSystem) {
    flow.phase = '抵达后可继续';
    if (unresolvedPois.length > 0) {
      flow.title = '抵达后可继续调查 ' + unresolvedPois.length + ' 个探索点';
      flow.detail = '这颗星球还有未完成的探索内容，靠近后即可继续推进。';
    } else if (discoveredRoutes.length > 0) {
      flow.title = '本地探索已完成';
      flow.detail = '这里已解锁 ' + discoveredRoutes.length + ' 条秘密航线，后续航行会自动享受燃料折扣。';
    } else {
      flow.title = '本地探索已完成';
      flow.detail = '当前没有待处理的探索行动，抵达后可直接前往市场或继续航行。';
    }
    return flow;
  }

  if (unresolvedPois.length > 0) {
    var nextPoi = unresolvedPois[0];
    var nextPoiPreview = _getPoiStatus(stateRef, sys.id, nextPoi.id);
    flow.phase = '待调查';
    flow.title = '调查当前航点探索点';
    flow.detail = nextPoiPreview && nextPoiPreview.detailText
      ? (nextPoi.icon + ' ' + nextPoi.name + '：' + nextPoiPreview.detailText)
      : ('优先处理 ' + nextPoi.icon + ' ' + nextPoi.name + '，完成后会自动切换到下一个待办。');
    flow.nextAction = {
      type: 'poi',
      systemId: sys.id,
      poiId: nextPoi.id,
      label: nextPoiPreview && nextPoiPreview.actionLabel ? nextPoiPreview.actionLabel : ('调查 ' + nextPoi.icon + ' ' + nextPoi.name),
      disabled: !!(nextPoiPreview && !nextPoiPreview.canExplore),
      title: nextPoiPreview && nextPoiPreview.blockedReason ? nextPoiPreview.blockedReason : '',
    };
    if (nextPoiPreview && nextPoiPreview.blockedReason && !nextPoiPreview.canExplore) {
      _appendFlowNote(flow, nextPoiPreview.blockedReason);
    }
    if (unresolvedPois.length > 1) {
      _appendFlowNote(flow, '当前还有 ' + unresolvedPois.length + ' 个探索点待调查，可在详情中选择目标。');
    }
    return flow;
  }

  flow.phase = '探索完成';
  if (discoveredRoutes.length > 0) {
    flow.title = '本地探索完成，隐藏航线已加入地图';
    flow.detail = '当前已解锁 ' + discoveredRoutes.length + ' 条秘密航线，之后从这里出发会自动应用燃料折扣。';
  } else {
    flow.title = '本地探索完成';
    flow.detail = '当前星球没有待处理的探索行动，可以继续贸易或前往下一颗星球。';
  }
  return flow;
}

function _orderPoisForExploration(pois) {
  if (!Array.isArray(pois) || pois.length <= 1) return pois || [];

  return pois.slice().sort(function (left, right) {
    if (left.resolved !== right.resolved) return left.resolved ? 1 : -1;
    return 0;
  });
}

function _buildExplorationActionButton(action, extraClass) {
  if (!action) return '';

  var commandAction = normalizeCommandAction(action);
  var classes = 'planet-detail-action planet-detail-action--command command-action-btn';
  if (extraClass) classes += ' ' + extraClass;
  var disabledAttr = commandAction.disabled ? ' disabled aria-disabled="true"' : '';
  var titleAttr = commandAction.title ? ' title="' + _escapeHtmlAttr(commandAction.title) + '"' : '';
  var commandAttrs = getCommandActionAttributes(commandAction, _escapeHtmlAttr);
  var marketDataset = '';

  if (commandAction.marketWorkspaceId) {
    marketDataset += ' data-market-workspace-id="' + _escapeHtmlAttr(commandAction.marketWorkspaceId) + '"';
  }
  if (commandAction.marketSubworkspaceId) {
    marketDataset += ' data-market-subworkspace-id="' + _escapeHtmlAttr(commandAction.marketSubworkspaceId) + '"';
  }
  if (commandAction.marketFocusLabel) {
    marketDataset += ' data-market-focus-label="' + _escapeHtmlAttr(commandAction.marketFocusLabel) + '"';
  }
  if (commandAction.marketMode) {
    marketDataset += ' data-market-mode="' + _escapeHtmlAttr(commandAction.marketMode) + '"';
  }

  return '<button class="' + classes + '" data-exploration-action="' + _escapeHtmlAttr(commandAction.type || '') + '" data-system-id="' + _escapeHtmlAttr(commandAction.systemId || '') + '"' +
    (commandAction.poiId ? ' data-poi-id="' + _escapeHtmlAttr(commandAction.poiId) + '"' : '') + marketDataset + commandAttrs + disabledAttr + titleAttr + '>' +
    renderCommandActionContent(commandAction, _escapeHtml) +
  '</button>';
}

function _buildExplorationFlowCard(flow, options) {
  if (!flow) return '';

  var className = (options && options.cardClass) || 'planet-detail-flow-card';
  var includeAction = !options || options.includeAction !== false;
  var actionHtml = includeAction && flow.nextAction
    ? '<div class="planet-detail-actions">' + _buildExplorationActionButton(flow.nextAction, options && options.actionClass) + '</div>'
    : '';
  var noteHtml = flow.secondaryNote
    ? '<div class="planet-detail-note">' + flow.secondaryNote + '</div>'
    : '';

  return '<div class="' + className + '">' +
    '<div class="planet-detail-flow-kicker">' + flow.phase + '</div>' +
    '<div class="planet-detail-flow-title">' + flow.title + '</div>' +
    '<div class="planet-detail-flow-text">' + flow.detail + '</div>' +
    actionHtml +
    noteHtml +
  '</div>';
}

function _buildExplorationProgressRow(flow) {
  return '<div class="planet-detail-progress-row">' +
    '<span class="planet-detail-progress-pill">探索点：' + flow.resolvedCount + '/' + flow.totalPois + '</span>' +
    '<span class="planet-detail-progress-pill">隐藏航线：' + flow.discoveredRoutes.length + '</span>' +
  '</div>';
}

function _buildSurveyMetricCard(label, value, note, extraClass) {
  var className = 'planet-detail-survey-card' + (extraClass ? (' ' + extraClass) : '');
  var noteHtml = note
    ? '<div class="planet-detail-survey-note">' + _escapeHtml(note) + '</div>'
    : '';
  return '<div class="' + className + '">' +
    '<div class="planet-detail-survey-label">' + _escapeHtml(label) + '</div>' +
    '<div class="planet-detail-survey-value">' + _escapeHtml(value) + '</div>' +
    noteHtml +
  '</div>';
}

function _buildSurveySummaryBlock(summary, systemId, options) {
  if (!summary) return '';

  var opts = options || {};

  var threatClass = summary.threatLevel === 'high'
    ? 'planet-detail-survey-card--danger'
    : (summary.threatLevel === 'medium' ? 'planet-detail-survey-card--warning' : 'planet-detail-survey-card--stable');
  var rewardValue = summary.completionBonusClaimed ? '已领取' : summary.completionRewardLabel;
  var rewardNote = summary.completionBonusClaimed
    ? '本地完探奖励已结算'
    : '调查全部探索点后自动发放';
  var marketActionHtml = '';

  if (_stateRef && systemId) {
    var marketAction = buildContextualMarketAction(_stateRef, systemId, {
      context: 'survey',
    });
    marketAction.type = 'market';
    marketAction.title = '打开 ' + (marketAction.systemName || '当前地点') + ' 的 ' + (marketAction.marketFocusLabel || '市场页');
    marketActionHtml = '<div class="planet-detail-actions planet-detail-survey-actions">' +
      _buildExplorationActionButton(marketAction) +
      (marketAction.contextHint ? '<div class="planet-detail-note">' + _escapeHtml(marketAction.contextHint) + '</div>' : '') +
    '</div>';
  }

  return '<div class="planet-detail-subsection">' +
    (opts.hideHeading ? '' : '<div class="planet-detail-subtitle">探索简报</div>') +
    '<div class="planet-detail-survey-grid">' +
      _buildSurveyMetricCard('威胁评级', summary.threatLabel, '决定行动节奏', threatClass) +
      _buildSurveyMetricCard('主要机会', summary.opportunityLabel, '决定优先获取的收益') +
      _buildSurveyMetricCard('情报等级', 'Lv.' + summary.intelLevel, '已归档 ' + summary.reportCount + ' 份') +
      _buildSurveyMetricCard('完探奖励', rewardValue, rewardNote) +
    '</div>' +
    marketActionHtml +
  '</div>';
}

function _buildSurveyReportsBlock(summary, options) {
  if (!summary || !Array.isArray(summary.reports) || summary.reports.length === 0) return '';

  var opts = options || {};

  var reportHtml = summary.reports.map(function (report) {
    var metaParts = [];
    if (report.chainLabel) metaParts.push(report.chainLabel);
    if (report.badge) metaParts.push(report.badge);
    if (report.day) metaParts.push('D' + report.day);
    return '<div class="planet-detail-report-card">' +
      '<div class="planet-detail-report-head">' +
        '<span class="planet-detail-report-title">' + _escapeHtml((report.icon || '📘') + ' ' + (report.title || '探索报告')) + '</span>' +
        '<span class="planet-detail-report-badge">' + _escapeHtml(metaParts.join(' · ') || '探索报告') + '</span>' +
      '</div>' +
      '<div class="planet-detail-report-text">' + _escapeHtml(report.detail || '') + '</div>' +
    '</div>';
  }).join('');

  return '<div class="planet-detail-subsection">' +
    (opts.hideHeading ? '' : '<div class="planet-detail-subtitle">调查结论</div>') +
    '<div class="planet-detail-report-list">' + reportHtml + '</div>' +
  '</div>';
}

function _getChainStageClass(chain) {
  var stage = chain && chain.stage ? String(chain.stage) : 'locked';
  if (stage === 'archived' || stage === 'discovered' || stage === 'locked') return stage;
  return 'locked';
}

function _getChainSignalText(chain) {
  var signal = chain && chain.signal ? chain.signal : '';
  if (signal === 'route') return '航线';
  if (signal === 'research') return '科研';
  if (signal === 'logistics') return '补给';
  if (signal === 'market') return '贸易';
  return chain && chain.badge ? chain.badge : '探索';
}

function _getChainNote(chain) {
  if (!chain) return '';
  if (chain.followupReady && chain.followupLabel) return chain.followupLabel;
  if (chain.resolved) return '报告已归档，可在【行情与路线】查看它有什么用。';
  if (chain.discovered) return '调查探索点后，结论会写入探索报告。';
  return '调查探索点后，结论会写入探索报告。';
}

function _buildSurveyChainCards(summary, options) {
  if (!summary || !Array.isArray(summary.anomalyChains) || summary.anomalyChains.length === 0) return '';

  var opts = options || {};
  var compactClass = opts.compact ? ' planet-detail-chain-grid--compact' : '';
  var chainHtml = summary.anomalyChains.map(function (chain) {
    var stageClass = _getChainStageClass(chain);
    return '<div class="planet-detail-chain-card planet-detail-chain-card--' + _escapeHtmlAttr(stageClass) + '">' +
      '<div class="planet-detail-chain-head">' +
        '<span class="planet-detail-chain-title">' + _escapeHtml((chain.badge ? (chain.badge + ' · ') : '') + (chain.label || '探索链')) + '</span>' +
        '<span class="planet-detail-chain-stage">' + _escapeHtml(chain.stageLabel || '待调查') + '</span>' +
      '</div>' +
      '<div class="planet-detail-chain-meta">' + _escapeHtml((chain.poiName || '探索点') + ' · ' + _getChainSignalText(chain)) + '</div>' +
      '<div class="planet-detail-chain-track" aria-hidden="true"><span></span></div>' +
      '<div class="planet-detail-chain-note">' + _escapeHtml(_getChainNote(chain)) + '</div>' +
    '</div>';
  }).join('');

  return '<div class="planet-detail-chain-grid' + compactClass + '">' + chainHtml + '</div>';
}

function _buildSurveyChainBlock(summary, options) {
  var opts = options || {};
  var cards = _buildSurveyChainCards(summary, opts);
  if (!cards) return '';
  return '<div class="planet-detail-subsection">' +
    (opts.hideHeading ? '' : '<div class="planet-detail-subtitle">遗迹 / 异常链</div>') +
    cards +
  '</div>';
}

function _getSurveyChainPreview(summary) {
  if (!summary || !Array.isArray(summary.anomalyChains) || summary.anomalyChains.length === 0) return '暂无后续任务';
  return (summary.resolvedAnomalyChainCount || 0) + '/' + summary.anomalyChains.length + ' 已归档';
}

function _buildPlanetArchiveDisclosure(info) {
  if (!info) return '';

  var archiveHtml = '<div class="planet-detail-archive-grid">' +
    _buildPlanetDetailField('居民', info.races) +
    _buildPlanetDetailField('人口', info.population) +
    _buildPlanetDetailField('政体', info.government) +
    _buildPlanetDetailField('治安', info.safety) +
    _buildPlanetDetailField('解锁', info.lockText) +
  '</div>';

  return _buildPlanetDetailDisclosure('archive', '星球档案', archiveHtml, {
    preview: info.population,
    defaultOpen: false,
  });
}

function _buildNavigationGuideBanner(guideFocus, sys) {
  if (!guideFocus || !sys) return '';

  var goodName = guideFocus.goodId ? _getGoodName(guideFocus.goodId) : '';
  return '<div class="planet-detail-guide-banner">' +
    '<span class="planet-detail-guide-kicker">当前指引</span>' +
    '<strong class="planet-detail-guide-title">前往 ' + _escapeHtml(sys.name) + '</strong>' +
    '<span class="planet-detail-guide-text">' +
      (goodName ? ('抵达后打开市场，卖出「' + _escapeHtml(goodName) + '」。') : '抵达后继续当前贸易目标。') +
    '</span>' +
  '</div>';
}

function _getGuideRouteRiskLabel(stateRef, fuelCost, fuelLeft, crossGalaxy, routeInfo, travelAction) {
  if (travelAction && travelAction.disabled) return '暂不可达';
  if (fuelLeft < 0) return '燃料不足';

  var maxFuel = Math.max(1, Number(stateRef && stateRef.maxFuel) || 1);
  if (fuelLeft <= Math.max(5, Math.round(maxFuel * 0.15))) return '燃料紧张';
  if (routeInfo && routeInfo.active) return '隐藏航线省油';
  if (crossGalaxy) return '跃迁航线';
  if (fuelCost <= 8) return '短程直航';
  return '常规直航';
}

function _buildNavigationGuideRoutePlan(stateRef, sys, guideFocus, travelAction) {
  if (!guideFocus || !stateRef || !sys) return '';

  var current = findSystem(stateRef.currentSystem);
  if (!current) return '';

  var isCurrentSystem = current.id === sys.id;
  var crossGalaxy = current.galaxyId !== sys.galaxyId;
  var routeInfo = isCurrentSystem
    ? null
    : Exploration.getTravelRouteInfo(stateRef, current.id, sys.id);
  var fuelCost = isCurrentSystem
    ? 0
    : Economy.getFuelCost(current.id, sys.id, stateRef.fuelEfficiency || 1, stateRef);
  var etaDays = isCurrentSystem ? 0 : (crossGalaxy ? GALAXY_JUMP_DAYS : 1);
  var currentFuel = Math.floor(Number(stateRef.fuel) || 0);
  var fuelLeft = currentFuel - fuelCost;
  var riskLabel = _getGuideRouteRiskLabel(stateRef, fuelCost, fuelLeft, crossGalaxy, routeInfo, travelAction);
  var routeMode = routeInfo && routeInfo.active
    ? ('秘密航线 · 燃料 -' + Math.round((1 - routeInfo.fuelMultiplier) * 100) + '%')
    : (crossGalaxy ? '跨星系跃迁' : '星图直航');
  var goodName = guideFocus.goodId ? _getGoodName(guideFocus.goodId) : '';
  var cargoQuantity = guideFocus.goodId && stateRef.cargo
    ? Math.max(0, stateRef.cargo[guideFocus.goodId] || 0)
    : 0;
  var cargoCost = guideFocus.goodId && stateRef.cargoCost
    ? Math.max(0, stateRef.cargoCost[guideFocus.goodId] || 0)
    : 0;
  var averageCost = cargoQuantity > 0 ? cargoCost / cargoQuantity : 0;
  var expectedSellPrice = guideFocus.goodId
    ? Economy.getSellPrice(sys.id, guideFocus.goodId, stateRef)
    : 0;
  var fuelReplacementCost = isCurrentSystem
    ? 0
    : fuelCost * Economy.getBuyPrice(sys.id, 'fuel', stateRef);
  var expectedNetProfit = cargoQuantity > 0
    ? Math.round((expectedSellPrice - averageCost) * cargoQuantity - fuelReplacementCost)
    : 0;
  var nextStep = goodName
    ? ('抵达后打开市场，确认卖出「' + goodName + '」并核对结算。')
    : '抵达后继续当前行动。';

  return '<div class="planet-detail-guide-route" data-planet-guide-route>' +
    '<div class="planet-detail-guide-route-grid">' +
      '<div class="planet-detail-guide-route-card"><span>燃料</span><strong>' + _escapeHtml(fuelCost + ' / 余 ' + Math.max(0, fuelLeft)) + '</strong></div>' +
      '<div class="planet-detail-guide-route-card"><span>预计</span><strong>' + _escapeHtml(etaDays + ' 天') + '</strong></div>' +
      '<div class="planet-detail-guide-route-card"><span>风险</span><strong>' + _escapeHtml(riskLabel) + '</strong></div>' +
      (goodName
        ? '<div class="planet-detail-guide-route-card"><span>卖价</span><strong>' + _escapeHtml(expectedSellPrice + ' / 单位') + '</strong></div>' +
          '<div class="planet-detail-guide-route-card"><span>预计净利</span><strong>' + _escapeHtml((expectedNetProfit >= 0 ? '+' : '') + expectedNetProfit) + '</strong></div>'
        : '') +
    '</div>' +
    '<div class="planet-detail-guide-route-foot">' +
      '<span>' + _escapeHtml(routeMode) + '</span>' +
      '<span>' + _escapeHtml(nextStep) + '</span>' +
    '</div>' +
  '</div>';
}

function _buildPinnedPlanetDetailActions(travelAction, guideFocus) {
  var buttons = [];
  if (travelAction) {
    var disabledAttr = travelAction.disabled ? ' disabled aria-disabled="true"' : '';
    var titleAttr = travelAction.title ? ' title="' + _escapeHtmlAttr(travelAction.title) + '"' : '';
    var actionClass = 'planet-detail-action' + (guideFocus ? ' planet-detail-action--guide-target' : '');
    var actionLabel = guideFocus && !travelAction.disabled ? '前往卖货点' : travelAction.label;
    buttons.push(
      '<button class="' + actionClass + '" type="button" data-planet-detail-action="travel" data-system-id="' + _escapeHtmlAttr(travelAction.systemId) + '"' + disabledAttr + titleAttr + '>' +
        _escapeHtml(actionLabel) +
      '</button>'
    );
  }
  buttons.push('<button class="planet-detail-action planet-detail-action--quiet" type="button" data-planet-detail-action="close-detail">收起详情</button>');

  return '<div class="planet-detail-actions planet-detail-actions--panel">' + buttons.join('') + '</div>' +
    (guideFocus
      ? '<div class="planet-detail-note planet-detail-note--hint">点击“前往卖货点”出航；抵达后在市场处理卖出。</div>'
      : (travelAction && travelAction.hint ? '<div class="planet-detail-note planet-detail-note--hint">' + _escapeHtml(travelAction.hint) + '</div>' : ''));
}

function _buildPlanetHoverSummaryNote(travelAction, isCurrentSystem) {
  var message = '';
  if (isCurrentSystem) {
    message = '点击锁定本地探索详情。';
  } else if (travelAction && !travelAction.disabled) {
    message = travelAction.hint;
  } else if (travelAction && travelAction.hint) {
    message = travelAction.hint;
  } else {
    message = '点击锁定这颗星球的详细信息。';
  }

  return '<div class="planet-detail-note planet-detail-note--hint">' + _escapeHtml(message) + '</div>';
}

function _buildExplorationActionBlock(flow, sys, isCurrentSystem, stateRef) {
  if (!flow || !isCurrentSystem || !flow.nextAction) return '';

  if (flow.nextAction.type !== 'poi' || flow.unresolvedPois.length <= 1) {
    return '<div class="planet-detail-actions">' + _buildExplorationActionButton(flow.nextAction) + '</div>';
  }

  return '<div class="planet-detail-actions">' + flow.unresolvedPois.map(function (poi) {
    var poiPreview = _getPoiStatus(stateRef, sys.id, poi.id);
    return _buildExplorationActionButton({
      type: 'poi',
      systemId: sys.id,
      poiId: poi.id,
      label: poiPreview && poiPreview.actionLabel ? poiPreview.actionLabel : ('调查 ' + poi.icon + ' ' + poi.name),
      disabled: !!(poiPreview && !poiPreview.canExplore),
      title: poiPreview && poiPreview.blockedReason ? poiPreview.blockedReason : '',
    });
  }).join('') + '</div>';
}

function _buildExplorationSection(stateRef, sys, planetData, isCurrentSystem, isUnlocked) {
  var flow = _getExplorationFlow(stateRef, sys, planetData, isCurrentSystem, isUnlocked);
  if (!flow) return '';
  var surveySummary = Exploration.getSurveySummary(stateRef, sys.id);

  var poiList = _orderPoisForExploration(flow.discoveredPois).sort(function (left, right) {
      if (left.resolved === right.resolved) return 0;
      return left.resolved ? 1 : -1;
    });

  var poiHtml = poiList.length > 0
    ? poiList.map(function (poi) {
      var badgeText = poi.resolved ? '已调查' : '待调查';
      if (!poi.resolved && flow.unresolvedPois.length > 0 && flow.unresolvedPois[0].id === poi.id) {
        badgeText = '优先';
      }
      var chainLabel = poi.chain && poi.chain.label ? (' · ' + poi.chain.label) : '';
      return '<div class="planet-detail-list-row">' +
        '<span>' + poi.icon + ' ' + poi.name + _escapeHtml(chainLabel) + '</span>' +
        '<span class="planet-detail-badge">' + badgeText + '</span>' +
      '</div>';
    }).join('')
    : '';

  var routeHtml = flow.discoveredRoutes.length > 0
    ? flow.discoveredRoutes.map(function (route) {
      var routeInfo = Exploration.getTravelRouteInfo(stateRef, sys.id, route.targetSystemId);
      var fuelMultiplier = routeInfo.active ? routeInfo.fuelMultiplier : (route.fuelMultiplier || 1);
      var discount = Math.round((1 - fuelMultiplier) * 100);
      return '<div class="planet-detail-list-row">' +
        '<span>🛰️ ' + route.targetSystemName + '</span>' +
        '<span class="planet-detail-badge">燃料 -' + discount + '%</span>' +
      '</div>';
    }).join('')
    : '';

  var actionHtml = _buildExplorationActionBlock(flow, sys, isCurrentSystem, stateRef);
  var surveyPreview = surveySummary
    ? (surveySummary.threatLabel + ' · ' + surveySummary.opportunityLabel)
    : '暂无简报';
  var reportsPreview = surveySummary && Array.isArray(surveySummary.reports) && surveySummary.reports.length > 0
    ? (surveySummary.reports.length + ' 份归档')
    : '暂无报告';
  var poiPreview = poiList.length > 0
    ? (flow.unresolvedPois.length > 0
      ? ('待处理 ' + flow.unresolvedPois.length + ' / 已发现 ' + poiList.length)
      : ('已处理 ' + poiList.length + ' 个'))
    : '暂无探索点';
  var routePreview = flow.discoveredRoutes.length > 0
    ? (flow.discoveredRoutes.length + ' 条已录入')
    : '未发现';

  return '<div class="planet-detail-section planet-detail-wide">' +
    '<div class="planet-detail-section-head">' +
      '<div class="planet-detail-section-title">探索流程</div>' +
      '<span class="planet-detail-chip">' + flow.roleTag + '</span>' +
    '</div>' +
    _buildExplorationFlowCard(flow, { includeAction: false }) +
    _buildExplorationProgressRow(flow) +
    actionHtml +
    _buildPlanetDetailDisclosure('intel', '探索简报', _buildSurveySummaryBlock(surveySummary, sys.id, {
      hideHeading: true,
    }), {
      preview: surveyPreview,
      defaultOpen: false,
      compact: true,
    }) +
    _buildPlanetDetailDisclosure('chains', '遗迹 / 异常链', _buildSurveyChainBlock(surveySummary, {
      hideHeading: true,
    }), {
      preview: _getSurveyChainPreview(surveySummary),
      defaultOpen: true,
    }) +
    _buildPlanetDetailDisclosure('reports', '调查结论', _buildSurveyReportsBlock(surveySummary, {
      hideHeading: true,
    }), {
      preview: reportsPreview,
      defaultOpen: false,
    }) +
    _buildPlanetDetailDisclosure('poi', '探索点清单', poiHtml ? '<div class="planet-detail-list">' + poiHtml + '</div>' : '', {
      preview: poiPreview,
      defaultOpen: false,
    }) +
    _buildPlanetDetailDisclosure('routes', '秘密航线', routeHtml ? '<div class="planet-detail-list">' + routeHtml + '</div>' : '', {
      preview: routePreview,
      defaultOpen: false,
    }) +
  '</div>';
}

function _buildGalaxyHubCard(stateRef, galaxy, focusGalaxyId) {
  var playerLevel = stateRef.playerLevel || 1;
  var accessState = getGalaxyAccessState(galaxy.id, playerLevel, stateRef.researchedTechs || []);
  var allSystems = getSystemsByGalaxy(galaxy.id);
  var accessibleSystems = getAccessibleSystems(galaxy.id, playerLevel, stateRef.researchedTechs || []);
  var visitedGalaxies = stateRef.visitedGalaxies && stateRef.visitedGalaxies.length > 0
    ? stateRef.visitedGalaxies
    : [stateRef.currentGalaxy];
  var isVisited = visitedGalaxies.indexOf(galaxy.id) !== -1;
  var isCurrentGalaxy = galaxy.id === stateRef.currentGalaxy;
  var isFocusGalaxy = focusGalaxyId === galaxy.id;
  var cardClass = 'galaxy-switcher-card';
  if (!accessState.unlocked) cardClass += ' galaxy-switcher-card--locked';
  if (isCurrentGalaxy) cardClass += ' galaxy-switcher-card--current';
  if (isFocusGalaxy) cardClass += ' galaxy-switcher-card--focus';

  var chipRow = [
    accessState.unlocked
      ? _buildPlanetDetailChip(isCurrentGalaxy ? '当前星系' : '已开放', isCurrentGalaxy ? 'accent' : 'stable')
      : _buildPlanetDetailChip('Lv.' + accessState.requiredLevel + ' 开放', 'warning'),
    _buildPlanetDetailChip(isVisited ? '已访问' : '未访问', 'muted'),
  ].join('');

  var note = accessState.unlocked
    ? (accessState.unlockedBy === 'tech' && playerLevel < accessState.requiredLevel
      ? '跃迁科技已提前开放'
      : (isCurrentGalaxy ? '当前驻留，可返回本地星图' : '航线已开放，可进入查看'))
    : (accessState.techRequired
      ? ('需 Lv.' + accessState.requiredLevel + ' 或超空间跃迁')
      : ('需达到 Lv.' + accessState.requiredLevel));

  var disabledAttr = accessState.unlocked ? '' : ' disabled aria-disabled="true"';
  var buttonLabel = accessState.unlocked
    ? (isCurrentGalaxy ? '查看当前星系' : '进入该星系')
    : ('Lv.' + accessState.requiredLevel + ' 开放');

  return '<article class="' + cardClass + '"' + (isCurrentGalaxy ? ' aria-current="location"' : '') + '>' +
    '<div class="galaxy-switcher-card-head">' +
      '<div class="galaxy-switcher-card-title">' + _escapeHtml(galaxy.icon + ' ' + galaxy.name) + '</div>' +
      '<div class="galaxy-switcher-card-meta">可探索 ' + accessibleSystems.length + ' / ' + allSystems.length + '</div>' +
    '</div>' +
    '<div class="galaxy-switcher-card-status">' +
      '<div class="planet-detail-chip-row">' + chipRow + '</div>' +
      '<span class="planet-detail-note galaxy-switcher-note">' + _escapeHtml(note) + '</span>' +
    '</div>' +
    '<div class="galaxy-switcher-signal">' + _escapeHtml(_buildGalaxyTradeProfileSummary(galaxy)) + '</div>' +
    '<div class="planet-detail-actions galaxy-switcher-actions">' +
      '<button class="planet-detail-action" type="button" data-galaxy-action="open" data-galaxy-id="' + _escapeHtmlAttr(galaxy.id) + '"' + disabledAttr + '>' + _escapeHtml(buttonLabel) + '</button>' +
    '</div>' +
  '</article>';
}

function _buildGalaxyHubPanel(stateRef) {
  var playerLevel = stateRef.playerLevel || 1;
  var currentGalaxy = findGalaxy(stateRef.currentGalaxy || 'milky_way') || GALAXIES[0];
  var focusGalaxy = findGalaxy(_hoveredGalaxyId || stateRef.currentGalaxy || 'milky_way') || currentGalaxy;
  var focusAccess = getGalaxyAccessState(focusGalaxy.id, playerLevel, stateRef.researchedTechs || []);
  var accessibleGalaxies = getAccessibleGalaxies(playerLevel, stateRef.researchedTechs || []);
  var galaxyList = GALAXIES.slice().sort(function (left, right) {
    var leftLevel = left.minLevel || 1;
    var rightLevel = right.minLevel || 1;
    if (leftLevel !== rightLevel) return leftLevel - rightLevel;
    return left.name.localeCompare(right.name, 'zh-CN');
  });
  var visitedGalaxies = stateRef.visitedGalaxies && stateRef.visitedGalaxies.length > 0
    ? stateRef.visitedGalaxies
    : [stateRef.currentGalaxy];
  var focusSystems = getSystemsByGalaxy(focusGalaxy.id);
  var focusAccessibleSystems = getAccessibleSystems(focusGalaxy.id, playerLevel, stateRef.researchedTechs || []);
  var focusUnlockText = focusAccess.unlocked
    ? (focusAccess.unlockedBy === 'tech' && playerLevel < focusAccess.requiredLevel ? '科技提前开放' : '已开放')
    : ('Lv.' + focusAccess.requiredLevel + ' 开放');

  return '<section class="galaxy-hub-shell" aria-labelledby="galaxy-hub-title">' +
    '<header class="galaxy-hub-toolbar">' +
      '<div class="galaxy-hub-toolbar-copy">' +
        '<span class="planet-detail-kicker">GALAXY NAVIGATION</span>' +
        '<h3 id="galaxy-hub-title" class="planet-detail-title">星系总览</h3>' +
      '</div>' +
      '<button class="planet-detail-action planet-detail-action--quiet galaxy-hub-return" type="button" data-galaxy-action="return-planets">返回星球</button>' +
    '</header>' +
    '<div class="galaxy-hub-focus planet-detail-hero planet-detail-wide" aria-label="星系导航重点">' +
      '<div class="planet-detail-kicker">当前查看</div>' +
      '<div class="planet-detail-title">' + _escapeHtml(focusGalaxy.icon + ' ' + focusGalaxy.name) + '</div>' +
      '<div class="planet-detail-chip-row">' +
        _buildPlanetDetailChip('Lv.' + playerLevel, 'accent') +
        _buildPlanetDetailChip('已开放 ' + accessibleGalaxies.length + ' / ' + GALAXIES.length, 'stable') +
        _buildPlanetDetailChip('已访问 ' + visitedGalaxies.length + ' 个', 'muted') +
        _buildPlanetDetailChip(focusUnlockText, focusAccess.unlocked ? 'stable' : 'warning') +
      '</div>' +
      '<div class="planet-detail-desc">' + _escapeHtml(focusGalaxy.description || '') + '</div>' +
      '<div class="planet-detail-key-grid">' +
        _buildPlanetDetailKeyCard('当前驻留', currentGalaxy.icon + ' ' + currentGalaxy.name) +
        _buildPlanetDetailKeyCard('当前星系', focusGalaxy.icon + ' ' + focusGalaxy.name) +
        _buildPlanetDetailKeyCard('可探索星球', focusAccessibleSystems.length + ' / ' + focusSystems.length) +
        _buildPlanetDetailKeyCard('切换方式', '点击星云或使用目录按钮进入', { wide: true }) +
        _buildPlanetDetailKeyCard('低买高卖线索', _buildGalaxyTradeProfileSummary(focusGalaxy), { wide: true }) +
      '</div>' +
      '<div class="planet-detail-note planet-detail-note--hint">点击星系总览里的星云模型，或直接使用下方目录按钮，即可切换到已开放的新星系。</div>' +
    '</div>' +
    '<div class="planet-detail-section galaxy-hub-directory planet-detail-wide">' +
      '<div class="planet-detail-section-head">' +
        '<div class="planet-detail-section-title">星系跃迁目录</div>' +
        _buildPlanetDetailChip(_hoveredGalaxyId ? '鼠标所指' : '当前导航', 'muted') +
      '</div>' +
      '<div class="galaxy-switcher-list">' +
        galaxyList.map(function (galaxy) {
          return _buildGalaxyHubCard(stateRef, galaxy, focusGalaxy.id);
        }).join('') +
      '</div>' +
    '</div>' +
  '</section>';
}

function _renderCurrentSystemExplorationCard(stateRef) {
  var card = document.getElementById('current-system-exploration-card');
  if (!card) return;

  var resolvedState = stateRef || _stateRef;

  if (!resolvedState || resolvedState.mapView !== 'planets' || resolvedState.viewingGalaxy !== resolvedState.currentGalaxy) {
    _explorationTerminalPanelOpen = false;
    _hideCurrentSystemExplorationCard();
    return;
  }

  if (!_explorationTerminalPanelOpen) {
    _hideCurrentSystemExplorationCard();
    return;
  }

  var sys = findSystem(resolvedState.currentSystem);
  var planetData = GalaxyData.getPlanetData(resolvedState.currentSystem);
  if (!sys || !planetData) {
    _hideCurrentSystemExplorationCard();
    return;
  }

  var isUnlocked = isSystemAccessible(sys.id, resolvedState.playerLevel || 1, resolvedState.researchedTechs || []);
  var flow = _getExplorationFlow(resolvedState, sys, planetData, true, isUnlocked);
  if (!flow) {
    _hideCurrentSystemExplorationCard();
    return;
  }

  card.innerHTML = _buildCurrentSystemExplorationCard(flow, sys);
  card.classList.add('visible');
}

export function refreshPlanetDetail(stateRef) {
  const panel = document.getElementById('planet-detail-panel');
  const mapCanvas = document.getElementById('map-canvas');
  const mapContainer = document.getElementById('map-container');
  if (!panel) return;
  if (!mapCanvas || !mapContainer) return;

  _updateExplorationTerminalButton(stateRef);
  _renderCurrentSystemExplorationCard(stateRef);
  _setGalaxyImmersionMode(stateRef && stateRef.mapView === 'galaxies');

  if (stateRef.mapView === 'galaxies') {
    const previousHubScrollTop = panel.classList.contains('planet-detail-panel--galaxy-hub')
      ? panel.scrollTop
      : 0;
    if (_selectedPlanetDetailSystem) {
      _clearSelectedPlanetDetail(false);
    }

    panel.classList.remove('planet-detail-panel--summary', 'planet-detail-panel--pinned', 'planet-detail-panel--guide-target');
    panel.classList.add('planet-detail-panel--galaxy-hub');
    panel.setAttribute('role', 'region');
    panel.removeAttribute('aria-label');
    panel.setAttribute('aria-labelledby', 'galaxy-hub-title');
    panel.setAttribute('aria-hidden', 'false');
    panel.setAttribute('tabindex', '-1');
    panel.innerHTML = _buildGalaxyHubPanel(stateRef);
    panel.classList.add('visible');

    const inspectorOwned = !!(panel.closest && panel.closest('#context-inspector'));
    if (inspectorOwned) {
      panel.style.width = '';
      panel.style.left = '';
      panel.style.top = '';
      panel.scrollTop = previousHubScrollTop;
      return;
    }

    const canvasW = mapContainer.clientWidth;
    const panelW = Math.min(340, Math.max(280, canvasW - 16));
    panel.style.width = panelW + 'px';
    panel.style.left = Math.max(8, canvasW - panelW - 14) + 'px';
    panel.style.top = '12px';
    panel.scrollTop = previousHubScrollTop;
    return;
  }

  const displayId = _getPlanetDetailDisplayId(stateRef);
  if (stateRef.mapView !== 'planets' || !displayId) {
    if (stateRef.mapView !== 'planets' && _selectedPlanetDetailSystem) {
      _clearSelectedPlanetDetail(false);
    }
    panel.classList.remove('planet-detail-panel--galaxy-hub');
    panel.classList.remove('planet-detail-panel--guide-target');
    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden', 'true');
    return;
  }
  const sys = findSystem(displayId);
  const planetData = GalaxyData.getPlanetData(displayId);
  if (!sys) {
    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden', 'true');
    return;
  }

  const gal = findGalaxy(sys.galaxyId);
  const details = sys.details || {};
  const races = (details.population || []).map(function (p) {
    return p.icon + p.name + '(' + p.percentage + '%)';
  }).join('、') || '未知';
  const government = details.government
    ? (details.government.name + ' · ' + details.government.style)
    : '未知政体';
  const specialties = (details.specialties || []).join('、') || '暂无';
  const safety = typeof details.safety === 'number'
    ? (details.safety + ' / 100（' + _getSafetyLabel(details.safety) + '）')
    : '未知';

  const faction = Faction.getFactionForSystem(sys.id);
  let factionText = '🛰️ 独立星区';
  let relationText = '🙂 中立 (0)';
  if (faction) {
    const rel = Faction.getRelation(stateRef, faction.id);
    const level = Faction.getLevel(stateRef, faction.id);
    factionText = faction.icon + ' ' + faction.name;
    relationText = level.emoji + ' ' + level.name + ' (' + (rel >= 0 ? '+' : '') + rel + ')';
  }

  const playerLevel = stateRef.playerLevel || 1;
  const systemAccess = getSystemAccessState(sys.id, playerLevel, stateRef.researchedTechs || []);
  const isUnlocked = systemAccess.unlocked;
  const isCurrentSystem = displayId === stateRef.currentSystem;
  const isPinned = _selectedPlanetDetailSystem === displayId;
  const guideFocus = _navigationGuideFocus && _navigationGuideFocus.systemId === displayId
    ? _navigationGuideFocus
    : null;
  const lockText = isUnlocked
    ? (systemAccess.unlockedBy === 'tech-entry' ? '超空间入口已开放' : '已解锁')
    : ('需 Lv.' + (sys.minLevel || 1) + '（当前 Lv.' + playerLevel + '）');
  const safetyChipText = typeof details.safety === 'number'
    ? ('治安 ' + _getSafetyLabel(details.safety))
    : '治安未知';
  const safetyTone = typeof details.safety === 'number'
    ? (details.safety >= 80 ? 'stable' : (details.safety >= 60 ? 'accent' : (details.safety >= 40 ? 'warning' : 'danger')))
    : 'muted';
  const lockTone = isUnlocked ? 'stable' : 'warning';
  const roleTone = isCurrentSystem ? 'accent' : 'muted';
  var heroChipParts = [
    _buildPlanetDetailChip(sys.typeLabel, 'accent'),
    _buildPlanetDetailChip(isCurrentSystem ? '当前停靠' : '悬停预览', roleTone),
    _buildPlanetDetailChip(safetyChipText, safetyTone),
    _buildPlanetDetailChip(lockText, lockTone),
  ];
  if (guideFocus) {
    heroChipParts.push(_buildPlanetDetailChip(guideFocus.goodId ? ('卖出 ' + _getGoodName(guideFocus.goodId)) : '当前指引', 'warning'));
  }
  const heroChips = heroChipParts.join('');
  const heroGrid = '<div class="planet-detail-key-grid">' +
    _buildPlanetDetailKeyCard('势力', factionText) +
    _buildPlanetDetailKeyCard('友好度', relationText) +
    _buildPlanetDetailKeyCard('特产', specialties, { wide: true }) +
  '</div>';
  const travelAction = _buildPlanetTravelAction(stateRef, sys);
  const archiveDisclosure = _buildPlanetArchiveDisclosure({
    races: races,
    population: details.totalPopulation || '未知',
    government: government,
    safety: safety,
    lockText: lockText,
  });

  panel.classList.remove('planet-detail-panel--galaxy-hub');
  panel.classList.toggle('planet-detail-panel--pinned', isPinned);
  panel.classList.toggle('planet-detail-panel--summary', !isPinned);
  panel.classList.toggle('planet-detail-panel--guide-target', !!guideFocus);
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', 'planet-detail-title-' + _escapeHtmlAttr(sys.id));
  panel.setAttribute('aria-hidden', 'false');
  if (isPinned) panel.setAttribute('tabindex', '-1');
  else panel.removeAttribute('tabindex');

  var summaryHtml =
    _buildPlanetDetailSummaryShell(sys, gal, heroChips, _escapeHtml(sys.description), heroGrid, { isPinned: isPinned }) +
      _buildNavigationGuideBanner(guideFocus, sys) +
      _buildNavigationGuideRoutePlan(stateRef, sys, guideFocus, travelAction) +
      (isPinned ? '' : _buildPlanetDetailActionShelf(_buildPlanetHoverSummaryNote(travelAction, isCurrentSystem), guideFocus)) +
      _closePlanetDetailSummaryShell();
  var detailBodyHtml = summaryHtml +
    (isPinned ? (_buildExplorationSection(stateRef, sys, planetData, isCurrentSystem, isUnlocked) + archiveDisclosure) : '');

  panel.innerHTML = isPinned
    ? (_buildPlanetDetailScrollBody(detailBodyHtml) +
      _buildPlanetDetailActionShelf(_buildPinnedPlanetDetailActions(travelAction, guideFocus), guideFocus))
    : detailBodyHtml;

  panel.classList.add('visible');

  const container = mapContainer;
  const canvasW = container.clientWidth;
  const canvasH = container.clientHeight;
  const inspectorOwned = !!(panel.closest && panel.closest('#context-inspector'));

  if (inspectorOwned) {
    panel.style.width = '';
    panel.style.left = '';
    panel.style.top = '';
    return;
  }

  // 优先使用3D投影坐标
  let nodeX, nodeY;
  const screenPos = Renderer3D.getPlanetScreenPosition(displayId);
  if (screenPos) {
    nodeX = screenPos.x;
    nodeY = screenPos.y;
  } else {
    nodeX = sys.x * canvasW;
    nodeY = sys.y * canvasH;
  }
  const offset = 14;

  const preferredWidth = isPinned ? 360 : 300;
  const minimumWidth = isPinned ? 240 : 220;
  const panelW = Math.min(preferredWidth, Math.max(minimumWidth, canvasW - 16));
  panel.style.width = panelW + 'px';

  const maxLeft = Math.max(8, canvasW - panelW - 8);
  const placeRight = nodeX < (canvasW * 0.58);
  let left = placeRight ? (nodeX + offset) : (nodeX - panelW - offset);
  left = Math.max(8, Math.min(maxLeft, left));

  const panelH = Math.max(160, panel.offsetHeight || 0);
  var commandSurfaceTop = canvasH;
  if (mapContainer.getBoundingClientRect) {
    var mapRect = mapContainer.getBoundingClientRect();
    ['bottom-nav', 'action-guide'].forEach(function (elementId) {
      var commandSurface = document.getElementById(elementId);
      if (!commandSurface || commandSurface.hidden || !commandSurface.getBoundingClientRect) return;
      var commandRect = commandSurface.getBoundingClientRect();
      if (commandRect.width <= 0 || commandRect.height <= 0) return;
      commandSurfaceTop = Math.min(commandSurfaceTop, commandRect.top - mapRect.top);
    });
  }
  const maxTop = Math.max(8, Math.min(
    canvasH - panelH - 8,
    commandSurfaceTop - panelH - 12
  ));
  let top = nodeY - panelH * 0.5;
  top = Math.max(8, Math.min(maxTop, top));

  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}

/** 打开市场面板（默认当前节点功能页） */
export function openMarket(stateRef, marketFocus) {
  const overlay = document.getElementById('market-overlay');
  const marketBtn = document.getElementById('market-view-btn');
  if (!overlay) return;
  _closeExplorationTerminalPanel(stateRef);
  _stateRef = stateRef;
  _pendingMarketPanelFocus = _normalizeMarketPanelFocus(marketFocus || getContextualMarketFocus(stateRef));
  _marketViewGalaxy = stateRef.currentGalaxy;
  _marketViewSystem = stateRef.currentSystem;
  _marketMode = 'detail';
  _marketOpen = true;
  if (marketBtn) marketBtn.classList.add('active');
  _buildMarketGalaxyNav(stateRef);
  _bindMarketDetailEvents(stateRef);
  if (_refreshMarket) _refreshMarket('detail');
  openPrimarySurface('market-overlay');
}

/** 以正式导航状态打开市场面板 */
export function openMarketPanel(stateRef, marketFocus) {
  _stateRef = stateRef || _stateRef;
  if (!_stateRef) return;
  _closeAllOverlayPanels();
  closeMarket();
  _setBottomNavActive('market');
  openMarket(_stateRef, marketFocus);
}

export function openMarketSystemPanel(stateRef, systemId, marketFocus) {
  if (!stateRef) return;

  openMarketPanel(stateRef, marketFocus);
  if (systemId && systemId !== stateRef.currentSystem) {
    showMarketDetail(systemId);
  }
}

/** 关闭市场面板 */
export function closeMarket(options) {
  const overlay = document.getElementById('market-overlay');
  const marketBtn = document.getElementById('market-view-btn');
  if (!overlay) return;
  _marketOpen = false;
  closePrimarySurface('market-overlay', options);
  if (marketBtn) marketBtn.classList.remove('active');
}

/** 市场是否打开 */
export function isMarketOpen() {
  return _marketOpen && isPrimarySurfaceVisible('market-overlay');
}

/** 旅行后刷新市场（保持当前节点功能页） */
export function refreshMarketLocation(stateRef) {
  if (!_marketOpen) return;
  _stateRef = stateRef;
  _marketViewGalaxy = stateRef.currentGalaxy;
  _marketViewSystem = stateRef.currentSystem;
  _marketMode = 'detail';
  _buildMarketGalaxyNav(stateRef);
  if (_refreshMarket) _refreshMarket('detail');
}

/** 绑定详情模式中的表格开关 */
function _bindMarketDetailEvents(state) {
  const sellToggle = document.getElementById('market-show-sell');
  if (sellToggle) {
    sellToggle.onchange = function () {
      if (_refreshMarket) _refreshMarket('detail');
    };
  }
}

/**
 * 构建星系选择导航栏（仅显示已访问星系）
 */
function _buildMarketGalaxyNav(state) {
  const nav = document.getElementById('market-galaxy-nav');
  if (!nav) return;
  nav.innerHTML = '';
  const visited = state.visitedGalaxies || [state.currentGalaxy];
  GALAXIES.forEach(function (g) {
    if (visited.indexOf(g.id) === -1) return;
    const btn = document.createElement('button');
    btn.className = 'market-galaxy-btn' + (g.id === _marketViewGalaxy ? ' active' : '');
    btn.type = 'button';
    btn.setAttribute('aria-label', '查看' + g.name + '市场');
    btn.setAttribute('aria-pressed', g.id === _marketViewGalaxy ? 'true' : 'false');
    const icon = document.createElement('span');
    icon.className = 'market-galaxy-btn-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = g.icon;
    const label = document.createElement('span');
    label.className = 'market-galaxy-btn-label';
    label.textContent = g.name;
    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener('click', function () {
      _marketViewGalaxy = g.id;
      _buildMarketGalaxyNav(state);
      if (_refreshMarket) _refreshMarket(_marketMode || 'detail');
    });
    nav.appendChild(btn);
  });
}

/**
 * 绑定标签页按钮切换
 * @param {Function} [onTabClick]  可选回调 (tabId:string) => void
 */
export function initTabs(onTabClick) {
  _tabClickCallback = onTabClick || null;
  if (_tabBindingsInitialized) return;
  _tabBindingsInitialized = true;

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      activateTab(btn.dataset.tab);
    });
    btn.addEventListener('keydown', _handleTerminalTabKeydown);
  });

  // 面板关闭按钮（新设计：覆盖层关闭按钮）
  var infoPanelToggle = document.getElementById('info-panel-toggle');
  if (infoPanelToggle) {
    infoPanelToggle.addEventListener('click', function () {
      _closeOverlayPanel('info-panel');
      _setBottomNavActive('starmap');
    });
  }
  _bindSecondaryPanelDismiss('info-panel');

  var tradePanelToggle = document.getElementById('trade-panel-toggle');
  if (tradePanelToggle) {
    tradePanelToggle.addEventListener('click', function () {
      _closeOverlayPanel('trade-panel');
      _setBottomNavActive('starmap');
    });
  }
  _bindSecondaryPanelDismiss('trade-panel');

  var consolePanelClose = document.getElementById('console-panel-close');
  if (consolePanelClose) {
    consolePanelClose.addEventListener('click', function () {
      _closeOverlayPanel('console-panel');
      _setBottomNavActive('starmap');
    });
  }

  if (typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', _handleSecondaryPanelKeydown);
  }

  // 底部导航按钮
  var bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) {
    bottomNav.addEventListener('click', function (e) {
      var btn = e.target.closest('.bottom-nav-btn');
      if (!btn) return;
      if (globalThis.__linegameUIManager) return;
      var view = btn.dataset.view;
      if (hasBlockingSurfaceOpen()) {
        var allowLogsBadgeClear = view === 'logs';
        if (!allowLogsBadgeClear) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          return;
        }
      }
      _handleBottomNav(view);
    });
    bottomNav.addEventListener('keydown', _handleBottomNavKeydown);
  }
}

export function setNavigationChangeCallback(callback) {
  _navigationChangeCallback = typeof callback === 'function' ? callback : null;
}

export function focusNavigationTarget(stateRef, systemId, options) {
  var resolvedState = stateRef || _stateRef;
  var sys = findSystem(systemId);
  if (!resolvedState || !sys) return false;

  var accessState = getSystemAccessState(sys.id, resolvedState.playerLevel || 1, resolvedState.researchedTechs || []);
  if (!accessState.unlocked) return false;

  _stateRef = resolvedState;
  _closeAllOverlayPanels();
  closeMarket();
  _hoveredGalaxyId = null;
  resolvedState.mapView = 'planets';
  resolvedState.viewingGalaxy = sys.galaxyId;
  resolvedState.hoveredSystem = sys.id;
  _setSelectedPlanetDetail(sys.id);
  _navigationGuideFocus = {
    systemId: sys.id,
    goodId: options && options.goodId ? options.goodId : '',
    title: options && options.title ? options.title : '',
  };
  _setBottomNavActive('starmap');
  _bindPlanetDetailPanelEvents();
  refreshPlanetDetail(resolvedState);

  if (Renderer3D.selectPlanet) {
    Renderer3D.selectPlanet(sys.id, { focus: true, smooth: true });
  } else if (Renderer3D.focusPlanet) {
    Renderer3D.focusPlanet(sys.id, true);
  }

  return true;
}

/**
 * 底部导航按钮处理
 * @param {string} view  按钮对应的视图名
 */
function _handleBottomNav(view) {
  if (globalThis.__linegameUIManager) {
    globalThis.__linegameUIManager.switchView(view);
    return;
  }

  var currentActive = document.querySelector('.bottom-nav-btn.active');
  var currentView = currentActive ? currentActive.dataset.view : 'starmap';

  if (view === 'starmap') {
    _closeAllOverlayPanels();
    closeMarket();
    _setBottomNavActive('starmap');
    return;
  }

  if (view === 'market') {
    // If already open, close it
    if (currentView === 'market' && _marketOpen) {
      closeMarket();
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      _setBottomNavActive('market');
      if (_stateRef) {
        openMarket(_stateRef);
      }
      // If _stateRef is not set yet, skip opening market (will be set on init)
    }
    return;
  }

  if (view === 'hangar') {
    if (currentView === 'hangar') {
      _closeOverlayPanel('trade-panel');
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      closeMarket();
      _openOverlayPanel('trade-panel');
      _setBottomNavActive('hangar');
    }
    return;
  }

  if (view === 'quests') {
    if (currentView === 'quests') {
      _closeOverlayPanel('info-panel');
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      closeMarket();
      var archiveTabId = _getDefaultArchiveTab(_stateRef);
      if (document.querySelector('.tab-btn[data-tab="' + archiveTabId + '"]')) {
        activateTab(archiveTabId);
      } else {
        _openOverlayPanel('info-panel');
        _setBottomNavActive('quests');
      }
    }
    return;
  }

  if (view === 'logs') {
    EventBus.emit('logs:badge:clear');
    if (!document.getElementById('console-panel')) {
      _setBottomNavActive(currentView || 'starmap');
      return;
    }
    if (currentView === 'logs') {
      _closeOverlayPanel('console-panel');
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      closeMarket();
      _openOverlayPanel('console-panel');
      _setBottomNavActive('logs');
    }
    return;
  }

  if (view === 'console') {
    if (!document.getElementById('console-panel')) {
      _handleBottomNav('logs');
      return;
    }
    if (currentView === 'console') {
      _closeOverlayPanel('console-panel');
      _setBottomNavActive('starmap');
    } else {
      _closeAllOverlayPanels();
      closeMarket();
      _openOverlayPanel('console-panel');
      _setBottomNavActive('console');
    }
    return;
  }
}

export function openQuestsPanel(stateRef) {
  _stateRef = stateRef || _stateRef;
  var archiveTabId = _getDefaultArchiveTab(_stateRef);
  if (document.querySelector('.tab-btn[data-tab="' + archiveTabId + '"]')) {
    activateTab(archiveTabId);
  } else {
    _openOverlayPanel('info-panel');
  }
}

function _openOverlayPanel(id) {
  if (_marketOpen) closeMarket();
  openSecondarySurface(id);
}

function _closeOverlayPanel(id) {
  closeSecondarySurface(id);
}

function _bindSecondaryPanelDismiss(id) {
  var panel = document.getElementById(id);
  if (!panel || !panel.dataset || typeof panel.addEventListener !== 'function') return;
  if (panel.dataset.secondaryDismissBound === '1') return;

  panel.addEventListener('click', function (event) {
    if (!event || event.target !== panel) return;
    _closeOverlayPanel(id);
    _setBottomNavActive('starmap');
  });
  panel.dataset.secondaryDismissBound = '1';
}

function _isOverlayPanelOpen(id) {
  var panel = document.getElementById(id);
  return !!(panel && panel.classList && panel.classList.contains('panel-open'));
}

function _handleSecondaryPanelKeydown(event) {
  if (!event || event.key !== 'Escape') return;
  if (hasBlockingSurfaceOpen()) return;

  if (_marketOpen) {
    closeMarket();
    _setBottomNavActive('starmap');
    if (typeof event.preventDefault === 'function') event.preventDefault();
    return;
  }

  var secondaryIds = ['info-panel', 'trade-panel', 'console-panel'];
  var activeId = secondaryIds.find(function (id) {
    return _isOverlayPanelOpen(id);
  });
  if (!activeId) return;

  _closeOverlayPanel(activeId);
  _setBottomNavActive('starmap');
  if (typeof event.preventDefault === 'function') event.preventDefault();
}

function _closeAllOverlayPanels() {
  _closeExplorationTerminalPanel();
  closeAllSecondarySurfaces();
}

function _setBottomNavActive(view) {
  if (globalThis.__linegameUIManager) {
    globalThis.__linegameUIManager.setBottomNavActiveDirectly(view);
  } else {
    document.querySelectorAll('.bottom-nav-btn').forEach(function (btn) {
      var isActive = btn.dataset.view === view;
      if (isActive) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
      _syncBottomNavButtonState(btn, isActive);
    });
  }
  if (_navigationChangeCallback) _navigationChangeCallback(view);
}

function _handleTerminalTabKeydown(event) {
  if (!event) return;
  var key = event.key;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'Home' && key !== 'End') return;

  var btn = event.currentTarget || event.target;
  if (!btn || !btn.dataset) return;
  var group = btn.dataset.tabGroup || '';
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.tab-btn[data-tab-group="' + group + '"]'));
  buttons = buttons.filter(function (button) {
    return button && !button.disabled && !(button.getAttribute && button.getAttribute('aria-disabled') === 'true');
  });
  var currentIndex = buttons.indexOf(btn);
  if (currentIndex < 0 || buttons.length === 0) return;

  var nextIndex = currentIndex;
  if (key === 'Home') {
    nextIndex = 0;
  } else if (key === 'End') {
    nextIndex = buttons.length - 1;
  } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
    nextIndex = (currentIndex + buttons.length - 1) % buttons.length;
  } else if (key === 'ArrowRight' || key === 'ArrowDown') {
    nextIndex = (currentIndex + 1) % buttons.length;
  }

  if (typeof event.preventDefault === 'function') event.preventDefault();
  var nextButton = buttons[nextIndex];
  if (nextButton && typeof nextButton.focus === 'function') {
    nextButton.focus();
  }
  if (nextButton && nextButton.dataset && nextButton.dataset.tab) {
    activateTab(nextButton.dataset.tab);
  }
}

function _syncBottomNavButtonState(btn, isActive) {
  if (!btn || typeof btn.setAttribute !== 'function') return;
  btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  if (isActive) {
    btn.setAttribute('aria-current', 'page');
  } else if (typeof btn.removeAttribute === 'function') {
    btn.removeAttribute('aria-current');
  }
}

function _handleBottomNavKeydown(event) {
  if (globalThis.__linegameUIManager) return;
  if (!event || !event.target || typeof event.target.closest !== 'function') return;
  var btn = event.target.closest('.bottom-nav-btn');
  if (!btn) return;

  var key = event.key;
  if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;

  var buttons = Array.prototype.slice.call(document.querySelectorAll('.bottom-nav-btn'));
  var currentIndex = buttons.indexOf(btn);
  if (currentIndex < 0 || buttons.length === 0) return;

  var nextIndex = currentIndex;
  if (key === 'Home') nextIndex = 0;
  else if (key === 'End') nextIndex = buttons.length - 1;
  else if (key === 'ArrowLeft') nextIndex = (currentIndex + buttons.length - 1) % buttons.length;
  else if (key === 'ArrowRight') nextIndex = (currentIndex + 1) % buttons.length;

  if (typeof event.preventDefault === 'function') event.preventDefault();
  if (buttons[nextIndex] && typeof buttons[nextIndex].focus === 'function') {
    buttons[nextIndex].focus();
  }
}

export function focusStarmap() {
  _handleBottomNav('starmap');
}

export function activateTab(tabId) {
  var btn = document.querySelector('.tab-btn[data-tab="' + tabId + '"]');
  if (!btn) return;

  var group = btn.dataset.tabGroup || '';
  document.querySelectorAll('.tab-btn[data-tab-group="' + group + '"]').forEach(function (b) {
    var isActiveButton = b === btn;
    b.classList.toggle('active', isActiveButton);
    if (typeof b.setAttribute === 'function') {
      b.setAttribute('aria-selected', isActiveButton ? 'true' : 'false');
    }
    b.tabIndex = isActiveButton ? 0 : -1;
  });
  document.querySelectorAll('.tab-pane[data-tab-group="' + group + '"]').forEach(function (p) {
    p.classList.remove('active');
    if (typeof p.setAttribute === 'function') p.setAttribute('aria-hidden', 'true');
  });
  btn.classList.add('active');

  var pane = document.getElementById(tabId);
  if (pane) {
    pane.classList.add('active');
    if (typeof pane.setAttribute === 'function') pane.setAttribute('aria-hidden', 'false');
  }

  // 如果所属面板是隐藏的覆盖层，则自动打开它并更新底部导航
  if (group === 'info') {
    _openOverlayPanel('info-panel');
    _setBottomNavActive('quests');
  } else if (group === 'trade') {
    _openOverlayPanel('trade-panel');
    _setBottomNavActive('hangar');
  }

  if (_tabClickCallback) _tabClickCallback(tabId);
}

export function getActiveArchiveTab() {
  if (typeof document === 'undefined' || !document.querySelector) return '';
  var activeTab = document.querySelector('.tab-btn[data-tab-group="info"].active');
  return activeTab && activeTab.dataset ? (activeTab.dataset.tab || '') : '';
}
