// js/ui/MapUI.js — 星系地图交互事件绑定（支持星系/星球双层视图 + 市场面板）
// 导出：init, initTabs, init3DCallbacks, refreshGalaxyBtn, openMarket, closeMarket, isMarketOpen,
//        setRefreshMarket, setExplorationActions, getMarketViewSystem, refreshMarketLocation,
//        showMarketOverview, showMarketDetail, refreshPlanetDetail, getMapView, getCurrentGalaxyId,
//        getActiveArchiveTab
import * as Renderer3D from './StarmapRenderer.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import * as EventBus from '../core/EventBus.js';
import * as ContextInspector from './ContextInspector.js';
import * as WorkspaceDetailSurface from './WorkspaceDetailSurface.js';
import { createMapSurveyDetailController } from './MapSurveyDetailController.js';
import { buildGalaxyHubPanel } from './MapGalaxyHubPresenter.js';
import { createMapViewStateController } from './MapViewStateController.js';
import { createMapWorkspaceSession } from './MapWorkspaceSession.js';
import {
  buildMapPlanetDetailView,
  buildMapPlanetTravelAction,
} from './MapPlanetDetailPresenter.js';
import {
  buildContextualMarketAction,
  getContextualMarketFocus,
} from './MarketFocus.js';
import {
  registerEscapeLayer,
} from './SurfaceManager.js';
import {
  GALAXIES,
  findSystem,
  getGalaxyAccessState,
  getSystemAccessState,
}  from '../data/systems.js';

let _tabClickCallback = null;
let _navigationChangeCallback = null;
let _workspaceNavigationActions = null;
let _smallScreenMql = null;
const STARMAP_GALAXY_VIEW_TOGGLE_EVENT = 'starmap:galaxy-view-toggle';

// 市场刷新回调（由 GameManager 注入）
let _refreshMarket = null;          // (mode) => void
let _stateRef = null;               // 用于内部事件引用
let _getState = function () { return _stateRef; };
let _explorationActions = null;
let _travelActionHandler = null;
let _galaxyJumpActionHandler = null;
let _mainBindingsInitialized = false;
let _tabBindingsInitialized = false;
let _galaxyViewToggleBound = false;
let _mapContextRendererRegistered = false;
let _releaseMapContextRenderer = null;
let _releaseMapDetailEscape = null;
let _domListeners = [];
let _disposed = true;
const _mapSession = createMapWorkspaceSession();

function _currentState(fallback) {
  var state = typeof _getState === 'function' ? _getState() : null;
  return state || _stateRef || fallback || null;
}

const _mapViewState = createMapViewStateController({
  getState: _currentState,
  getGalaxyAccessState: getGalaxyAccessState,
});

const _mapSurveyDetails = createMapSurveyDetailController({
  surface: WorkspaceDetailSurface,
  getState: _currentState,
  getRevision: ContextInspector.getCurrentRevision,
  findSystem: findSystem,
  getSurveySummary: Exploration.getSurveySummary,
  getMarketAction: _buildSurveyMarketAction,
  openMarket: function (state, systemId, options) {
    return openMarketSystemPanel(state, systemId, options);
  },
});

function _bindDomListener(target, eventName, handler, options) {
  if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') return false;
  target.addEventListener(eventName, handler, options);
  _domListeners.push({ target: target, eventName: eventName, handler: handler, options: options });
  return true;
}

function _releaseDomListeners() {
  _domListeners.splice(0).reverse().forEach(function (binding) {
    if (binding.target && typeof binding.target.removeEventListener === 'function') {
      binding.target.removeEventListener(binding.eventName, binding.handler, binding.options);
    }
  });
}

/**
 * 同步当前会话。长期回调始终读 provider，手动读档时无需重绑 DOM。
 */
export function syncState(stateSource) {
  _getState = typeof stateSource === 'function'
    ? stateSource
    : function () { return stateSource || null; };
  _stateRef = _currentState(null);
  _mapViewState.reset();
  return _stateRef;
}

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

function _clearSelectedPlanetDetail(shouldRefresh) {
  _mapSession.clearSelectedSystem();
  _mapSession.clearNavigationGuideFocus();
  ContextInspector.clearContext('map', { render: false });
  if (Renderer3D.clearSelection) Renderer3D.clearSelection();
  var state = _currentState();
  if (shouldRefresh && state) {
    ContextInspector.render();
    if (!ContextInspector.getSnapshot().initialized) refreshPlanetDetail(state);
  }
}

function _setSelectedPlanetDetail(systemId) {
  var selectedSystemId = _mapSession.setSelectedSystem(systemId);
  if (selectedSystemId) {
    ContextInspector.replaceContext({
      type: 'planet',
      id: selectedSystemId,
      workspaceId: 'map',
      source: 'map-selection',
      revision: ContextInspector.getCurrentRevision(),
    }, { render: false });
  } else {
    ContextInspector.clearContext('map', { render: false });
  }
}

function _registerMapContextRenderer() {
  if (_mapContextRendererRegistered) return;
  _mapContextRendererRegistered = true;
  _releaseMapContextRenderer = ContextInspector.registerRenderer('map', function (request) {
    var context = request && request.context;
    var state = request && request.state ? request.state : _currentState();
    if (!state) return false;

    if (!context) {
      _mapSession.clearSelectedSystem();
      _mapViewState.clearHover();
      var panel = document.getElementById('planet-detail-panel');
      if (panel && panel.classList) panel.classList.remove('visible');
      if (panel && typeof panel.setAttribute === 'function') panel.setAttribute('aria-hidden', 'true');
      return false;
    } else if (context.type === 'planet') {
      _mapSession.setSelectedSystem(context.id);
      _mapViewState.setHover({ type: 'system', id: context.id });
    } else if (context.type === 'galaxy') {
      _mapViewState.showGalaxies();
    } else {
      return false;
    }
    refreshPlanetDetail(state);
    return true;
  });
  _releaseMapDetailEscape = registerEscapeLayer('map-object-detail', {
    priority: 50,
    isActive: function () {
      var inspector = ContextInspector.getSnapshot();
      var state = _currentState();
      return !!(inspector.open && inspector.activeWorkspaceId === 'map' && state && (
        _mapSession.getSelectedSystem() || state.mapView === 'galaxies'
      ));
    },
    onEscape: function () {
      var state = _currentState();
      if (_mapSession.getSelectedSystem()) {
        _clearSelectedPlanetDetail(true);
      } else if (state && state.mapView === 'galaxies') {
        _returnToPlanetView();
      }
    },
  });
  _mapSurveyDetails.register();
}

function _buildSurveyMarketAction(state, systemId) {
  if (!state || !systemId) return null;
  var marketAction = buildContextualMarketAction(state, systemId, { context: 'survey' });
  return Object.assign({}, marketAction, {
    type: 'market',
    title: '打开 ' + (marketAction.systemName || '当前地点') + ' 的 ' +
      (marketAction.marketFocusLabel || '市场页'),
  });
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

function _getPlanetDetailDisplayId(stateRef) {
  var selectedSystemId = _mapSession.getSelectedSystem();
  if (selectedSystemId) return selectedSystemId;
  return stateRef ? (stateRef.hoveredSystem || stateRef.currentSystem) : null;
}

function _travelToPlanet(systemId) {
  var state = _currentState();
  if (!state || !systemId) return false;

  var sys = findSystem(systemId);
  var travelAction = buildMapPlanetTravelAction(state, sys);
  if (!sys || !travelAction || travelAction.disabled) return false;

  _clearSelectedPlanetDetail(false);
  _mapViewState.clearHover();

  if (sys.galaxyId !== state.currentGalaxy) {
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
  var state = _currentState();
  if (!state || !galaxyId) return false;

  if (!_mapViewState.canViewGalaxy(galaxyId)) return false;

  _clearSelectedPlanetDetail(false);
  _mapViewState.showGalaxyPlanets(galaxyId);
  ContextInspector.render();
  if (!ContextInspector.getSnapshot().initialized) refreshPlanetDetail(state);
  return true;
}

function _returnToPlanetView() {
  var state = _currentState();
  if (!state) return false;

  _clearSelectedPlanetDetail(false);
  _mapViewState.showCurrentGalaxyPlanets();
  ContextInspector.render();
  if (!ContextInspector.getSnapshot().initialized) refreshPlanetDetail(state);
  return true;
}

function _bindPlanetDetailPanelEvents() {
  var panel = document.getElementById('planet-detail-panel');
  if (!panel || panel.dataset.detailUiBound === 'true') return;

  _bindDomListener(panel, 'click', function (event) {
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

    if (action === 'open-survey') {
      _mapSurveyDetails.open(systemId, actionButton);
      return;
    }

    if (action === 'travel') {
      _travelToPlanet(systemId);
    }
  });

  _bindDomListener(panel, 'click', function (event) {
    var summary = event.target.closest('summary');
    if (!summary || !panel.contains(summary)) return;

    var detail = summary.parentElement;
    if (!detail || detail.tagName !== 'DETAILS') return;

    var sectionId = detail.dataset.detailSection;
    if (!sectionId) return;
    _mapSession.setDisclosure(sectionId, !detail.open);
  }, true);

  _bindDomListener(panel, 'toggle', function (event) {
    var target = event.target;
    if (!target || target.tagName !== 'DETAILS') return;

    var sectionId = target.dataset.detailSection;
    if (!sectionId) return;
    _mapSession.setDisclosure(sectionId, target.open);
  }, true);

  _bindDomListener(panel, 'keydown', function (event) {
    if (!event || event.key !== 'Escape') return;
    var handled = false;
    if (_mapSession.getSelectedSystem()) {
      _clearSelectedPlanetDetail(true);
      handled = true;
    } else {
      var currentState = _currentState();
      if (currentState && currentState.mapView === 'galaxies') handled = _returnToPlanetView();
    }
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
  });

  panel.dataset.detailUiBound = 'true';
}

function _isPlanetDetailSectionOpen(sectionId, defaultOpen) {
  var stored = _mapSession.getDisclosure(sectionId);
  return typeof stored === 'boolean' ? stored : !!defaultOpen;
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
  return _mapSession.getMarketViewSystem() || state.currentSystem;
}

/** 获取市场当前查看的星系 ID */
export function getMarketViewGalaxy(state) {
  return _mapSession.getMarketViewGalaxy() || state.currentGalaxy;
}

/** 获取当前市场模式 */
export function getMarketMode() {
  return _mapSession.getMarketMode();
}

export function consumePendingMarketPanelFocus() {
  return _mapSession.takePendingMarketFocus();
}

/** 获取当前地图视图模式 */
export function getMapView() {
  return _mapViewState.getMapView();
}

/** 获取当前查看的星系ID */
export function getCurrentGalaxyId() {
  return _mapViewState.getCurrentGalaxyId();
}

/** 切换到总览模式 */
export function showMarketOverview() {
  _mapSession.setMarketMode('overview');
  _mapSession.setMarketViewSystem(null);
  if (_refreshMarket) _refreshMarket('overview');
}

/** 切换到详情模式 */
export function showMarketDetail(systemId) {
  _mapSession.setMarketMode('detail');
  _mapSession.setMarketViewSystem(systemId);
  if (_refreshMarket) _refreshMarket('detail');
}

export function toggleGalaxyView() {
  var currentState = _currentState();
  if (!currentState) return false;

  closeMarket();
  _clearSelectedPlanetDetail(false);
  if (currentState.mapView === 'galaxies') {
    return _returnToPlanetView();
  }

  _mapViewState.showGalaxies();
  ContextInspector.replaceContext({
    type: 'galaxy',
    id: currentState.viewingGalaxy || currentState.currentGalaxy,
    workspaceId: 'map',
    source: 'map-view',
    revision: ContextInspector.getCurrentRevision(),
  });
  return true;
}

function _bindGalaxyViewToggleEvent() {
  if (_galaxyViewToggleBound) return;
  _galaxyViewToggleBound = true;
  EventBus.on(STARMAP_GALAXY_VIEW_TOGGLE_EVENT, toggleGalaxyView);
}

/**
 * 绑定星系地图的鼠标交互
 * @param {object|Function} stateSource 游戏状态对象或读取当前会话的 provider
 * @param {Function} onTravel    (systemId: string) => void
 * @param {Function} onGalaxyJump (galaxyId: string) => void  跨星系跳转回调
 */
export function init(stateSource, onTravel, onGalaxyJump) {
  _disposed = false;
  // 保存状态引用供底部导航使用
  syncState(stateSource);
  _clearSelectedPlanetDetail(false);
  _registerMapContextRenderer();
  _bindExplorationActionEvents();
  _bindGalaxyViewToggleEvent();

  if (!_mainBindingsInitialized) {
    _mainBindingsInitialized = true;

    // 市场按钮只发布 canonical workspace 导航，不直接切换 DOM surface。
    const marketBtn = document.getElementById('market-view-btn');
    const marketCloseBtn = document.getElementById('market-close-btn');
    if (marketBtn) {
      _bindDomListener(marketBtn, 'click', function () {
        var currentState = _currentState();
        if (_mapSession.isMarketOpen()) {
          _requestWorkspace('map');
        } else if (currentState) {
          openMarketPanel(currentState);
        }
      });
    }
    if (marketCloseBtn) {
      _bindDomListener(marketCloseBtn, 'click', function () {
        _requestWorkspace('map');
      });
    }

    // 3D视图默认启用，按钮隐藏
    const toggle3DBtn = document.getElementById('map-3d-toggle-btn');
    if (toggle3DBtn) {
      toggle3DBtn.style.display = 'none';
    }
  }

  var currentState = _currentState();
  ContextInspector.activateWorkspace('map');
  if (!ContextInspector.getSnapshot().initialized) refreshPlanetDetail(currentState);
}

/**
 * 初始化星图回调（由 GameManager 在 init 后调用）
 */
export function init3DCallbacks(stateSource, onTravel, onGalaxyJump) {
  _disposed = false;
  if (stateSource) syncState(stateSource);
  // 确保星图渲染器已激活
  if (!Renderer3D.isActive()) {
    Renderer3D.toggleView();
  }
  _travelActionHandler = onTravel || null;
  _galaxyJumpActionHandler = onGalaxyJump || null;
  window._mapHoverCallback = function(data) {
    var currentState = _currentState();
    if (!currentState) return;
    if (_mapViewState.setHover(data)) {
      refreshPlanetDetail(currentState);
    }
  };
  window._mapClickCallback = function(systemId) {
    var currentState = _currentState();
    if (!currentState) return;
    const sys = findSystem(systemId);
    if (!sys) return;
    _mapViewState.clearHoveredGalaxy();

    if (_mapSession.getSelectedSystem() !== systemId) {
      _setSelectedPlanetDetail(systemId);
      _mapViewState.setHover({ type: 'system', id: systemId });
      ContextInspector.render();
      return;
    }

    _travelToPlanet(systemId);
  };
  window._mapBackgroundClickCallback = function() {
    if (!_mapSession.getSelectedSystem()) return;
    _clearSelectedPlanetDetail(true);
  };
  window._galaxyClickCallback = function(galaxyId) {
    _switchToGalaxy(galaxyId);
  };
  window._switchToGalaxyView = function() {
    var currentState = _currentState();
    if (currentState && currentState.mapView !== 'galaxies') toggleGalaxyView();
  };
}

function _setGalaxyImmersionMode(active) {
  if (typeof document === 'undefined' || !document.body || !document.body.classList) return;
  document.body.classList.toggle('starmap-galaxy-mode', !!active);
}

/** 外部调用刷新星图控件状态 */
export function refreshGalaxyBtn(stateRef) {
  _setGalaxyImmersionMode(stateRef && stateRef.mapView === 'galaxies');
}

function _bindExplorationActionContainer(containerId) {
  var container = document.getElementById(containerId);
  if (!container || container.dataset.bound === 'true') return;

  _bindDomListener(container, 'click', function (event) {
    var button = event.target.closest('[data-exploration-action]');
    if (!button || button.disabled || !_explorationActions || !container.contains(button)) return;

    var action = button.dataset.explorationAction;
    var systemId = button.dataset.systemId;
    var poiId = button.dataset.poiId;

    event.preventDefault();
    event.stopPropagation();

    if (action === 'market') {
      openMarketSystemPanel(_currentState(), systemId, {
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
  _bindPlanetDetailPanelEvents();
}
export function refreshPlanetDetail(stateRef) {
  const panel = document.getElementById('planet-detail-panel');
  const mapCanvas = document.getElementById('map-canvas');
  const mapContainer = document.getElementById('map-container');
  if (!panel) return;
  if (!mapCanvas || !mapContainer) return;

  _setGalaxyImmersionMode(stateRef && stateRef.mapView === 'galaxies');

  if (stateRef.mapView === 'galaxies') {
    const previousHubScrollTop = panel.classList.contains('planet-detail-panel--galaxy-hub')
      ? panel.scrollTop
      : 0;
    if (_mapSession.getSelectedSystem()) {
      _clearSelectedPlanetDetail(false);
    }

    panel.classList.remove('planet-detail-panel--summary', 'planet-detail-panel--pinned', 'planet-detail-panel--guide-target');
    panel.classList.add('planet-detail-panel--galaxy-hub');
    panel.setAttribute('role', 'region');
    panel.removeAttribute('aria-label');
    panel.setAttribute('aria-labelledby', 'galaxy-hub-title');
    panel.setAttribute('aria-hidden', 'false');
    panel.setAttribute('tabindex', '-1');
    panel.innerHTML = buildGalaxyHubPanel(stateRef, { focusGalaxyId: _mapViewState.getHoveredGalaxyId() });
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
    if (stateRef.mapView !== 'planets' && _mapSession.getSelectedSystem()) {
      _clearSelectedPlanetDetail(false);
    }
    panel.classList.remove('planet-detail-panel--galaxy-hub');
    panel.classList.remove('planet-detail-panel--guide-target');
    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden', 'true');
    return;
  }
  const view = buildMapPlanetDetailView(stateRef, displayId, {
    selectedSystemId: _mapSession.getSelectedSystem(),
    navigationGuideFocus: _mapSession.getNavigationGuideFocus(),
    getPoiStatus: _getPoiStatus,
    isDisclosureOpen: _isPlanetDetailSectionOpen,
  });
  if (!view) {
    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden', 'true');
    return;
  }

  panel.classList.remove('planet-detail-panel--galaxy-hub');
  panel.classList.toggle('planet-detail-panel--pinned', view.isPinned);
  panel.classList.toggle('planet-detail-panel--summary', !view.isPinned);
  panel.classList.toggle('planet-detail-panel--guide-target', !!view.guideFocus);
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-labelledby', view.titleId);
  panel.setAttribute('aria-hidden', 'false');
  if (view.isPinned) panel.setAttribute('tabindex', '-1');
  else panel.removeAttribute('tabindex');
  panel.innerHTML = view.html;
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
    nodeX = view.anchor.x * canvasW;
    nodeY = view.anchor.y * canvasH;
  }
  const offset = 14;

  const preferredWidth = view.isPinned ? 360 : 300;
  const minimumWidth = view.isPinned ? 240 : 220;
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
  const marketBtn = document.getElementById('market-view-btn');
  if (!stateRef) return false;
  _stateRef = stateRef;
  _mapSession.setPendingMarketFocus(_normalizeMarketPanelFocus(
    marketFocus || _mapSession.getPendingMarketFocus() || getContextualMarketFocus(stateRef)
  ));
  _mapSession.setMarketViewGalaxy(stateRef.currentGalaxy);
  _mapSession.setMarketViewSystem(stateRef.currentSystem);
  _mapSession.setMarketMode('detail');
  _mapSession.setMarketOpen(true);
  if (marketBtn) marketBtn.classList.add('active');
  _buildMarketGalaxyNav(stateRef);
  _bindMarketDetailEvents(stateRef);
  if (_refreshMarket) _refreshMarket('detail');
  return true;
}

/** 以正式导航状态打开市场面板 */
export function openMarketPanel(stateRef, marketFocus) {
  _stateRef = stateRef || _stateRef;
  if (!_stateRef) return false;
  _mapSession.setPendingMarketFocus(_normalizeMarketPanelFocus(
    marketFocus || getContextualMarketFocus(_stateRef)
  ));
  var changed = _requestWorkspace('trade');
  // navigate 对当前 workspace 是幂等 no-op，此时仍需刷新局部市场上下文。
  if (!changed) openMarket(_stateRef, _mapSession.getPendingMarketFocus());
  return changed || _mapSession.isMarketOpen();
}

export function openMarketSystemPanel(stateRef, systemId, marketFocus) {
  if (!stateRef) return;

  openMarketPanel(stateRef, marketFocus);
  if (systemId && systemId !== stateRef.currentSystem) {
    showMarketDetail(systemId);
  }
}

/** 关闭市场面板 */
export function closeMarket() {
  const marketBtn = document.getElementById('market-view-btn');
  _mapSession.setMarketOpen(false);
  if (marketBtn) marketBtn.classList.remove('active');
  return true;
}

/** 市场是否打开 */
export function isMarketOpen() {
  return _mapSession.isMarketOpen();
}

/** 旅行后刷新市场（保持当前节点功能页） */
export function refreshMarketLocation(stateRef) {
  if (!_mapSession.isMarketOpen()) return;
  _stateRef = stateRef;
  _mapSession.setMarketViewGalaxy(stateRef.currentGalaxy);
  _mapSession.setMarketViewSystem(stateRef.currentSystem);
  _mapSession.setMarketMode('detail');
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
    var selectedGalaxyId = _mapSession.getMarketViewGalaxy();
    btn.className = 'market-galaxy-btn' + (g.id === selectedGalaxyId ? ' active' : '');
    btn.type = 'button';
    btn.setAttribute('aria-label', '查看' + g.name + '市场');
    btn.setAttribute('aria-pressed', g.id === selectedGalaxyId ? 'true' : 'false');
    const icon = document.createElement('span');
    icon.className = 'market-galaxy-btn-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = g.icon;
    const label = document.createElement('span');
    label.className = 'market-galaxy-btn-label';
    label.textContent = g.name;
    btn.appendChild(icon);
    btn.appendChild(label);
    _bindDomListener(btn, 'click', function () {
      _mapSession.setMarketViewGalaxy(g.id);
      _buildMarketGalaxyNav(state);
      if (_refreshMarket) _refreshMarket(_mapSession.getMarketMode());
    });
    nav.appendChild(btn);
  });
}

/**
 * 绑定标签页按钮切换
 * @param {Function} [onTabClick]  可选回调 (tabId:string) => void
 */
export function initTabs(onTabClick) {
  _disposed = false;
  _tabClickCallback = onTabClick || null;
  if (_tabBindingsInitialized) return;
  _tabBindingsInitialized = true;

  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    _bindDomListener(btn, 'click', function () {
      activateTab(btn.dataset.tab);
    });
    _bindDomListener(btn, 'keydown', _handleTerminalTabKeydown);
  });

  // 面板关闭按钮（新设计：覆盖层关闭按钮）
  var infoPanelToggle = document.getElementById('info-panel-toggle');
  if (infoPanelToggle) {
    _bindDomListener(infoPanelToggle, 'click', function () {
      _requestWorkspace('map');
    });
  }
  _bindWorkspacePanelDismiss('info-panel');

  var tradePanelToggle = document.getElementById('trade-panel-toggle');
  if (tradePanelToggle) {
    _bindDomListener(tradePanelToggle, 'click', function () {
      _requestWorkspace('map');
    });
  }
  _bindWorkspacePanelDismiss('trade-panel');

  var consolePanelClose = document.getElementById('console-panel-close');
  if (consolePanelClose) {
    _bindDomListener(consolePanelClose, 'click', function () {
      _requestWorkspace('map');
    });
  }
}

export function setNavigationChangeCallback(callback) {
  _navigationChangeCallback = typeof callback === 'function' ? callback : null;
}

export function setWorkspaceNavigationActions(actions) {
  _workspaceNavigationActions = actions && typeof actions.navigate === 'function'
    ? { navigate: actions.navigate }
    : null;
}

export function focusNavigationTarget(stateRef, systemId, options) {
  var resolvedState = stateRef || _stateRef;
  var sys = findSystem(systemId);
  if (!resolvedState || !sys) return false;

  var accessState = getSystemAccessState(sys.id, resolvedState.playerLevel || 1, resolvedState.researchedTechs || []);
  if (!accessState.unlocked) return false;

  _stateRef = resolvedState;
  _requestWorkspace('map');
  _mapViewState.focusSystem(sys.id, sys.galaxyId);
  _setSelectedPlanetDetail(sys.id);
  _mapSession.setNavigationGuideFocus({
    systemId: sys.id,
    goodId: options && options.goodId ? options.goodId : '',
    title: options && options.title ? options.title : '',
  });
  _bindPlanetDetailPanelEvents();
  ContextInspector.activateWorkspace('map');
  ContextInspector.render();
  // Compatibility for isolated presenter usage before the inspector shell is initialized.
  if (!ContextInspector.getSnapshot().initialized) refreshPlanetDetail(resolvedState);

  if (Renderer3D.selectPlanet) {
    Renderer3D.selectPlanet(sys.id, { focus: true, smooth: true });
  } else if (Renderer3D.focusPlanet) {
    Renderer3D.focusPlanet(sys.id, true);
  }

  return true;
}

export function openQuestsPanel(stateRef) {
  _stateRef = stateRef || _stateRef;
  var archiveTabId = _getDefaultArchiveTab(_stateRef);
  if (document.querySelector('.tab-btn[data-tab="' + archiveTabId + '"]')) {
    activateTab(archiveTabId);
  } else {
    _requestWorkspace('archive');
  }
}

function _bindWorkspacePanelDismiss(id) {
  var panel = document.getElementById(id);
  if (!panel || !panel.dataset || typeof panel.addEventListener !== 'function') return;
  if (panel.dataset.workspaceDismissBound === '1') return;

  _bindDomListener(panel, 'click', function (event) {
    if (!event || event.target !== panel) return;
    _requestWorkspace('map');
  });
  panel.dataset.workspaceDismissBound = '1';
}

function _requestWorkspace(workspace) {
  var changed = !!(
    _workspaceNavigationActions
    && typeof _workspaceNavigationActions.navigate === 'function'
    && _workspaceNavigationActions.navigate(workspace)
  );
  if (_navigationChangeCallback) _navigationChangeCallback(workspace);
  return changed;
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

export function focusStarmap() {
  return _requestWorkspace('map');
}

export function activateTab(tabId) {
  var btn = document.querySelector('.tab-btn[data-tab="' + tabId + '"]');
  if (!btn) return;

  var group = btn.dataset.tabGroup || '';
  var previousButton = document.querySelector('.tab-btn[data-tab-group="' + group + '"].active');
  var previousTabId = previousButton && previousButton.dataset ? (previousButton.dataset.tab || '') : '';
  var changed = previousTabId !== tabId;
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

  // 标签只声明所属 canonical workspace；DOM 可见性由 WorkspaceSurfaceController 投影。
  if (group === 'info') {
    _requestWorkspace('archive');
  } else if (group === 'trade') {
    _requestWorkspace('fleet');
  }

  if (_tabClickCallback) {
    _tabClickCallback(tabId, {
      changed: changed,
      group: group,
      previousTabId: previousTabId,
    });
  }
}

export function getActiveArchiveTab() {
  if (typeof document === 'undefined' || !document.querySelector) return '';
  var activeTab = document.querySelector('.tab-btn[data-tab-group="info"].active');
  return activeTab && activeTab.dataset ? (activeTab.dataset.tab || '') : '';
}

function _clearBindingDataset(id, key) {
  if (typeof document === 'undefined' || !document.getElementById) return;
  var element = document.getElementById(id);
  if (element && element.dataset) delete element.dataset[key];
}

function _closeActiveMapDetails() {
  var closed = 0;
  var snapshot = typeof WorkspaceDetailSurface.getSnapshot === 'function'
    ? WorkspaceDetailSurface.getSnapshot()
    : null;
  while (snapshot && snapshot.activeDetail && snapshot.activeDetail.workspaceId === 'map' && closed < 16) {
    if (!WorkspaceDetailSurface.close()) break;
    closed += 1;
    snapshot = WorkspaceDetailSurface.getSnapshot();
  }
  return closed;
}

export function getDiagnostics() {
  var context = ContextInspector.getContext('map');
  var detailSnapshot = typeof WorkspaceDetailSurface.getSnapshot === 'function'
    ? WorkspaceDetailSurface.getSnapshot()
    : null;
  var activeDetail = detailSnapshot && detailSnapshot.activeDetail &&
    detailSnapshot.activeDetail.workspaceId === 'map'
    ? detailSnapshot.activeDetail
    : null;
  return Object.freeze(Object.assign({}, _mapSession.getDiagnostics(), {
    activeContext: context,
    activeDetail: activeDetail,
    disposed: _disposed,
    initialized: _mainBindingsInitialized,
    surveyDetails: _mapSurveyDetails.getDiagnostics(),
    viewState: _mapViewState.getDiagnostics(),
  }));
}

/** 清理跨存档的星图选择和面板暂态，保留 DOM/listener/provider 接线。 */
export function resetRuntimeState() {
  _mapViewState.clearHover();
  _mapViewState.reset();
  _mapSession.reset();
  ContextInspector.clearContext('map', { render: false });
  _closeActiveMapDetails();
  if (Renderer3D.clearSelection) Renderer3D.clearSelection();
  var marketButton = typeof document !== 'undefined' && document.getElementById
    ? document.getElementById('market-view-btn')
    : null;
  if (marketButton && marketButton.classList) marketButton.classList.remove('active');
  return getDiagnostics();
}

/**
 * 释放 MapUI 拥有的 DOM/EventBus/Context/global callback 绑定。
 * 领域 state 不会被清空；后续 init 可使用新的 StateSession provider 重建投影。
 */
export function dispose() {
  if (_disposed) return false;
  _disposed = true;

  _releaseDomListeners();
  if (_galaxyViewToggleBound) {
    EventBus.off(STARMAP_GALAXY_VIEW_TOGGLE_EVENT, toggleGalaxyView);
  }
  if (_releaseMapContextRenderer) _releaseMapContextRenderer();
  if (_releaseMapDetailEscape) _releaseMapDetailEscape();
  _mapSurveyDetails.dispose();
  _releaseMapContextRenderer = null;
  _releaseMapDetailEscape = null;

  if (typeof window !== 'undefined') {
    window._mapHoverCallback = null;
    window._mapClickCallback = null;
    window._mapBackgroundClickCallback = null;
    window._galaxyClickCallback = null;
    window._switchToGalaxyView = null;
  }

  _clearBindingDataset('planet-detail-panel', 'detailUiBound');
  _clearBindingDataset('planet-detail-panel', 'bound');
  _clearBindingDataset('info-panel', 'workspaceDismissBound');
  _clearBindingDataset('trade-panel', 'workspaceDismissBound');

  _tabClickCallback = null;
  _navigationChangeCallback = null;
  _workspaceNavigationActions = null;
  _refreshMarket = null;
  _explorationActions = null;
  _travelActionHandler = null;
  _galaxyJumpActionHandler = null;
  _stateRef = null;
  _getState = function () { return null; };
  _mapSession.reset();
  _smallScreenMql = null;
  _mainBindingsInitialized = false;
  _tabBindingsInitialized = false;
  _galaxyViewToggleBound = false;
  _mapContextRendererRegistered = false;
  _mapViewState.reset();
  _setGalaxyImmersionMode(false);
  return true;
}
