// js/ui/MapUI.js — 星系地图交互事件绑定（支持星系/星球双层视图）
// 导出：init, init3DCallbacks, refreshGalaxyBtn, refreshPlanetDetail,
//        setNavigationActions, setExplorationActions, getMapView, getCurrentGalaxyId
import * as Renderer3D from './StarmapRenderer.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import * as ContextInspector from './ContextInspector.js';
import * as WorkspaceDetailSurface from './WorkspaceDetailSurface.js';
import { createMapSurveyDetailController } from './MapSurveyDetailController.js';
import { createMapViewStateController } from './MapViewStateController.js';
import { createMapWorkspaceSession } from './MapWorkspaceSession.js';
import { createMapPanelController } from './MapPanelController.js';
import { createMapPanelViewController } from './MapPanelViewController.js';
import { createMapContextController } from './MapContextController.js';
import { createMapInteractionController } from './MapInteractionController.js';
import {
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

let _stateRef = null;               // 用于内部事件引用
let _getState = function () { return _stateRef; };
let _explorationActions = null;
let _travelActionHandler = null;
let _galaxyJumpActionHandler = null;
let _mainBindingsInitialized = false;
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

let _mapContext = null;
const _mapPanelView = createMapPanelViewController({
  clearSelectedSystem: function (shouldRefresh) {
    return _mapContext ? _mapContext.clearSelected(shouldRefresh) : false;
  },
  getDocument: function () { return typeof document !== 'undefined' ? document : null; },
  getPoiStatus: _getPoiStatus,
  isDisclosureOpen: _isPlanetDetailSectionOpen,
  renderer: Renderer3D,
  session: _mapSession,
  viewState: _mapViewState,
});

_mapContext = createMapContextController({
  contextInspector: ContextInspector,
  getState: _currentState,
  panelView: _mapPanelView,
  registerEscapeLayer: registerEscapeLayer,
  renderPanel: refreshPlanetDetail,
  renderer: Renderer3D,
  returnToPlanets: _returnToPlanetView,
  session: _mapSession,
  viewState: _mapViewState,
});

const _mapInteractions = createMapInteractionController({
  findSystem: findSystem,
  getState: _currentState,
  getWindow: function () { return typeof window !== 'undefined' ? window : null; },
  mapContext: _mapContext,
  refreshPanel: refreshPlanetDetail,
  renderContext: function () { ContextInspector.render(); },
  renderer: Renderer3D,
  session: _mapSession,
  switchToGalaxy: _switchToGalaxy,
  toggleGalaxyView: toggleGalaxyView,
  travelToPlanet: _travelToPlanet,
  viewState: _mapViewState,
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
    _mapContext.clearSelected(true);
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

function _buildSurveyMarketAction(state, systemId) {
  if (!state || !systemId) return null;
  var marketAction = buildContextualMarketAction(state, systemId, { context: 'survey' });
  return Object.assign({}, marketAction, {
    type: 'market',
    title: '打开 ' + (marketAction.systemName || '当前地点') + ' 的 ' +
      (marketAction.marketFocusLabel || '市场页'),
  });
}

function _travelToPlanet(systemId) {
  var state = _currentState();
  if (!state || !systemId) return false;

  var sys = findSystem(systemId);
  var travelAction = buildMapPlanetTravelAction(state, sys);
  if (!sys || !travelAction || travelAction.disabled) return false;

  _mapContext.clearSelected(false);
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

  _mapContext.clearSelected(false);
  _mapViewState.showGalaxyPlanets(galaxyId);
  _mapPanelView.setGalaxyImmersionMode(false);
  ContextInspector.render();
  if (!ContextInspector.getSnapshot().initialized) refreshPlanetDetail(state);
  return true;
}

function _returnToPlanetView() {
  var state = _currentState();
  if (!state) return false;

  _mapContext.clearSelected(false);
  _mapViewState.showCurrentGalaxyPlanets();
  _mapPanelView.setGalaxyImmersionMode(false);
  ContextInspector.render();
  if (!ContextInspector.getSnapshot().initialized) refreshPlanetDetail(state);
  return true;
}

function _bindMapPanelEvents() {
  var panel = document.getElementById('planet-detail-panel');
  return _mapPanelController.bind(panel, _mapInteractions.bindDomListener);
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
  _mapContext.clearSelected(false);
  if (currentState.mapView === 'galaxies') {
    return _returnToPlanetView();
  }

  _mapViewState.showGalaxies();
  _mapPanelView.setGalaxyImmersionMode(true);
  ContextInspector.replaceContext({
    type: 'galaxy',
    id: currentState.viewingGalaxy || currentState.currentGalaxy,
    workspaceId: 'map',
    source: 'map-view',
    revision: ContextInspector.getCurrentRevision(),
  });
  return true;
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
  _mapContext.clearSelected(false);
  _mapContext.register();
  _mapSurveyDetails.register();
  _bindMapPanelEvents();
  _mapInteractions.bind();

  _mainBindingsInitialized = true;

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
  _travelActionHandler = onTravel || null;
  _galaxyJumpActionHandler = onGalaxyJump || null;
  _mapInteractions.initRendererCallbacks();
}

/** 外部调用刷新星图控件状态 */
export function refreshGalaxyBtn(stateRef) {
  _mapPanelView.setGalaxyImmersionMode(stateRef && stateRef.mapView === 'galaxies');
}

export function refreshPlanetDetail(stateRef) {
  return _mapPanelView.render(stateRef);
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
  _mapContext.select(sys.id);
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
    interactions: _mapInteractions.getDiagnostics(),
    mapContext: _mapContext.getDiagnostics(),
    surveyDetails: _mapSurveyDetails.getDiagnostics(),
    panelView: _mapPanelView.getDiagnostics(),
    viewState: _mapViewState.getDiagnostics(),
  }));
}

/** 清理跨存档的星图选择和面板暂态，保留 DOM/listener/provider 接线。 */
export function resetRuntimeState() {
  _mapViewState.clearHover();
  _mapViewState.reset();
  _mapPanelView.setGalaxyImmersionMode(false);
  _mapSession.reset();
  _mapContext.reset();
  _closeActiveMapDetails();
  return getDiagnostics();
}

/**
 * 释放 MapUI 拥有的 DOM/EventBus/Context/global callback 绑定。
 * 领域 state 不会被清空；后续 init 可使用新的 StateSession provider 重建投影。
 */
export function dispose() {
  if (_disposed) return false;
  _disposed = true;

  _mapInteractions.dispose();
  _mapContext.dispose();
  _mapSurveyDetails.dispose();

  _navigationChangeCallback = null;
  _navigationActions = null;
  _explorationActions = null;
  _travelActionHandler = null;
  _galaxyJumpActionHandler = null;
  _stateRef = null;
  _getState = function () { return null; };
  _mapSession.reset();
  _mainBindingsInitialized = false;
  _mapViewState.reset();
  _mapPanelView.setGalaxyImmersionMode(false);
  return true;
}
