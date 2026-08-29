// js/ui/MapUI.js — 星系地图交互事件绑定（支持星系/星球双层视图）
// 导出：init, init3DCallbacks, refreshGalaxyBtn, refreshPlanetDetail,
//        setNavigationActions, setExplorationActions, getMapView, getCurrentGalaxyId
import * as Renderer3D from './StarmapRenderer.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import * as EventBus from '../core/EventBus.js';
import * as ContextInspector from './ContextInspector.js';
import * as WorkspaceDetailSurface from './WorkspaceDetailSurface.js';
import { createMapSurveyDetailController } from './MapSurveyDetailController.js';
import { buildGalaxyHubPanel } from './MapGalaxyHubPresenter.js';
import { createMapViewStateController } from './MapViewStateController.js';
import { createMapWorkspaceSession } from './MapWorkspaceSession.js';
import { createMapPanelController } from './MapPanelController.js';
import { buildMapPanelLayout } from './MapPanelLayout.js';
import {
  buildMapPlanetDetailView,
  buildMapPlanetTravelAction,
} from './MapPlanetDetailPresenter.js';
import {
  buildContextualMarketAction,
} from './MarketFocus.js';
import {
  registerEscapeLayer,
} from './SurfaceManager.js';
import {
  findSystem,
  getGalaxyAccessState,
  getSystemAccessState,
}  from '../data/systems.js';

let _navigationChangeCallback = null;
let _navigationActions = null;
let _smallScreenMql = null;
const STARMAP_GALAXY_VIEW_TOGGLE_EVENT = 'starmap:galaxy-view-toggle';

let _stateRef = null;               // 用于内部事件引用
let _getState = function () { return _stateRef; };
let _explorationActions = null;
let _travelActionHandler = null;
let _galaxyJumpActionHandler = null;
let _mainBindingsInitialized = false;
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
    return _callNavigation('openMarketSystemPanel', [state, systemId, options], false);
  },
});

const _mapPanelController = createMapPanelController({
  closeDetail: function () {
    _clearSelectedPlanetDetail(true);
  },
  explorePoi: function (systemId, poiId) {
    if (!_explorationActions || typeof _explorationActions.onExplorePoi !== 'function') return false;
    _explorationActions.onExplorePoi(systemId, poiId);
    return true;
  },
  hasSelectedSystem: function () {
    return !!_mapSession.getSelectedSystem();
  },
  isGalaxyView: function () {
    var state = _currentState();
    return !!(state && state.mapView === 'galaxies');
  },
  openGalaxy: _switchToGalaxy,
  openMarket: function (systemId, focus) {
    return _callNavigation('openMarketSystemPanel', [_currentState(), systemId, focus], false);
  },
  openSurvey: function (systemId, origin) {
    return _mapSurveyDetails.open(systemId, origin);
  },
  returnToPlanets: _returnToPlanetView,
  setDisclosure: function (sectionId, open) {
    return _mapSession.setDisclosure(sectionId, open);
  },
  travel: _travelToPlanet,
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

function _callNavigation(methodName, args, fallback) {
  if (_navigationActions && typeof _navigationActions[methodName] === 'function') {
    return _navigationActions[methodName].apply(_navigationActions, args || []);
  }
  return fallback;
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
  _setGalaxyImmersionMode(false);
  ContextInspector.render();
  if (!ContextInspector.getSnapshot().initialized) refreshPlanetDetail(state);
  return true;
}

function _returnToPlanetView() {
  var state = _currentState();
  if (!state) return false;

  _clearSelectedPlanetDetail(false);
  _mapViewState.showCurrentGalaxyPlanets();
  _setGalaxyImmersionMode(false);
  ContextInspector.render();
  if (!ContextInspector.getSnapshot().initialized) refreshPlanetDetail(state);
  return true;
}

function _bindMapPanelEvents() {
  var panel = document.getElementById('planet-detail-panel');
  return _mapPanelController.bind(panel, _bindDomListener);
}

function _isPlanetDetailSectionOpen(sectionId, defaultOpen) {
  var stored = _mapSession.getDisclosure(sectionId);
  return typeof stored === 'boolean' ? stored : !!defaultOpen;
}

export function setExplorationActions(actions) {
  _explorationActions = actions || null;
  _bindMapPanelEvents();
}

/** 获取当前地图视图模式 */
export function getMapView() {
  return _mapViewState.getMapView();
}

/** 获取当前查看的星系ID */
export function getCurrentGalaxyId() {
  return _mapViewState.getCurrentGalaxyId();
}

export function toggleGalaxyView() {
  var currentState = _currentState();
  if (!currentState) return false;

  _callNavigation('closeMarket', [], false);
  _clearSelectedPlanetDetail(false);
  if (currentState.mapView === 'galaxies') {
    return _returnToPlanetView();
  }

  _mapViewState.showGalaxies();
  _setGalaxyImmersionMode(true);
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
  _bindMapPanelEvents();
  _bindGalaxyViewToggleEvent();

  if (!_mainBindingsInitialized) {
    _mainBindingsInitialized = true;

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

function _applyPanelLayout(panel, layout) {
  if (!panel || !layout) return;
  panel.style.width = layout.width == null ? '' : layout.width + 'px';
  panel.style.left = layout.left == null ? '' : layout.left + 'px';
  panel.style.top = layout.top == null ? '' : layout.top + 'px';
}

function _measureCommandSurfaceTops(mapContainer) {
  if (!mapContainer || typeof mapContainer.getBoundingClientRect !== 'function') return [];
  var mapRect = mapContainer.getBoundingClientRect();
  var tops = [];
  ['bottom-nav', 'action-guide'].forEach(function (elementId) {
    var commandSurface = document.getElementById(elementId);
    if (!commandSurface || commandSurface.hidden || typeof commandSurface.getBoundingClientRect !== 'function') return;
    var commandRect = commandSurface.getBoundingClientRect();
    if (commandRect.width <= 0 || commandRect.height <= 0) return;
    tops.push(commandRect.top - mapRect.top);
  });
  return tops;
}

/** 外部调用刷新星图控件状态 */
export function refreshGalaxyBtn(stateRef) {
  _setGalaxyImmersionMode(stateRef && stateRef.mapView === 'galaxies');
}

export function refreshPlanetDetail(stateRef) {
  const panel = document.getElementById('planet-detail-panel');
  const mapContainer = document.getElementById('map-container');
  if (!panel) return;
  if (!mapContainer) return;

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
    _applyPanelLayout(panel, buildMapPanelLayout({
      containerHeight: mapContainer.clientHeight,
      containerWidth: mapContainer.clientWidth,
      embedded: inspectorOwned,
      mode: 'galaxy',
    }));
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

  const inspectorOwned = !!(panel.closest && panel.closest('#context-inspector'));
  const screenPos = Renderer3D.getPlanetScreenPosition(displayId);
  _applyPanelLayout(panel, buildMapPanelLayout({
    anchor: view.anchor,
    commandSurfaceTops: _measureCommandSurfaceTops(mapContainer),
    containerHeight: mapContainer.clientHeight,
    containerWidth: mapContainer.clientWidth,
    embedded: inspectorOwned,
    mode: 'planet',
    panelHeight: panel.offsetHeight,
    pinned: view.isPinned,
    screenPosition: screenPos,
  }));
}

export function setNavigationChangeCallback(callback) {
  _navigationChangeCallback = typeof callback === 'function' ? callback : null;
}

export function setNavigationActions(actions) {
  _navigationActions = actions && typeof actions === 'object' ? actions : null;
  return !!_navigationActions;
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
  _bindMapPanelEvents();
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

function _requestWorkspace(workspace) {
  var changed = !!_callNavigation('navigate', [workspace], false);
  if (_navigationChangeCallback) _navigationChangeCallback(workspace);
  return changed;
}

export function focusStarmap() {
  return _requestWorkspace('map');
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
  _setGalaxyImmersionMode(false);
  _mapSession.reset();
  ContextInspector.clearContext('map', { render: false });
  _closeActiveMapDetails();
  if (Renderer3D.clearSelection) Renderer3D.clearSelection();
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

  _clearBindingDataset('planet-detail-panel', 'mapPanelControllerBound');
  _navigationChangeCallback = null;
  _navigationActions = null;
  _explorationActions = null;
  _travelActionHandler = null;
  _galaxyJumpActionHandler = null;
  _stateRef = null;
  _getState = function () { return null; };
  _mapSession.reset();
  _smallScreenMql = null;
  _mainBindingsInitialized = false;
  _galaxyViewToggleBound = false;
  _mapContextRendererRegistered = false;
  _mapViewState.reset();
  _setGalaxyImmersionMode(false);
  return true;
}
