// js/ui/MapNavigationController.js — 地图工作区导航、旅行分发与引导聚焦的唯一用例边界
import { buildMapPlanetTravelAction } from './MapPlanetDetailPresenter.js';
import {
  findSystem as findSystemById,
  getSystemAccessState as readSystemAccessState,
} from '../data/systems.js';

function _function(value, fallback) {
  return typeof value === 'function' ? value : fallback;
}

function _object(value) {
  return value && typeof value === 'object' ? value : {};
}

export function createMapNavigationController(options) {
  var ports = options || {};
  var contextInspector = _object(ports.contextInspector);
  var mapContext = _object(ports.mapContext);
  var panelView = _object(ports.panelView);
  var renderer = _object(ports.renderer);
  var session = _object(ports.session);
  var viewState = _object(ports.viewState);
  var buildTravelAction = _function(ports.buildTravelAction, buildMapPlanetTravelAction);
  var ensurePanelBindings = _function(ports.ensurePanelBindings, function () { return false; });
  var findSystem = _function(ports.findSystem, findSystemById);
  var getState = _function(ports.getState, function () { return null; });
  var getSystemAccessState = _function(ports.getSystemAccessState, readSystemAccessState);
  var rememberState = _function(ports.rememberState, function (state) { return state; });
  var renderPanel = _function(ports.renderPanel, function () { return false; });

  var navigationActions = null;
  var navigationChangeCallback = null;
  var travelActionHandler = null;
  var galaxyJumpActionHandler = null;
  var actionCount = 0;
  var focusCount = 0;
  var resetCount = 0;
  var travelCount = 0;
  var viewTransitionCount = 0;
  var workspaceRequestCount = 0;
  var lastAction = null;

  function _state(fallback) {
    var state = getState();
    return state && typeof state === 'object' ? state : (fallback || null);
  }

  function _record(type, details) {
    actionCount += 1;
    lastAction = Object.freeze(Object.assign({ type: type }, details || {}));
    return true;
  }

  function _callNavigation(methodName, args, fallback) {
    if (navigationActions && typeof navigationActions[methodName] === 'function') {
      return navigationActions[methodName].apply(navigationActions, args || []);
    }
    return fallback;
  }

  function _renderContext(state) {
    if (typeof contextInspector.render === 'function') contextInspector.render();
    var snapshot = typeof contextInspector.getSnapshot === 'function'
      ? contextInspector.getSnapshot()
      : null;
    if (!snapshot || !snapshot.initialized) renderPanel(state);
  }

  function requestWorkspace(workspaceId) {
    var workspace = typeof workspaceId === 'string' ? workspaceId.trim() : '';
    if (!workspace) return false;
    var changed = !!_callNavigation('navigate', [workspace], false);
    if (navigationChangeCallback) navigationChangeCallback(workspace);
    workspaceRequestCount += 1;
    _record('request-workspace', { changed: changed, workspaceId: workspace });
    return changed;
  }

  function openMarket(state, systemId, options) {
    if (!state || !systemId) return false;
    var opened = !!_callNavigation('openMarketSystemPanel', [state, systemId, options], false);
    if (opened) _record('open-market', { systemId: systemId });
    return opened;
  }

  function travelToPlanet(systemId) {
    var state = _state();
    if (!state || !systemId) return false;

    var system = findSystem(systemId);
    var travelAction = buildTravelAction(state, system);
    if (!system || !travelAction || travelAction.disabled) return false;

    if (typeof mapContext.clearSelected === 'function') mapContext.clearSelected(false);
    if (typeof viewState.clearHover === 'function') viewState.clearHover();

    if (system.galaxyId !== state.currentGalaxy) {
      if (!galaxyJumpActionHandler) return false;
      galaxyJumpActionHandler(system.id);
      travelCount += 1;
      return _record('galaxy-jump', { systemId: system.id });
    }

    if (!travelActionHandler) return false;
    travelActionHandler(system.id);
    travelCount += 1;
    return _record('travel', { systemId: system.id });
  }

  function switchToGalaxy(galaxyId) {
    var state = _state();
    if (!state || !galaxyId || typeof viewState.canViewGalaxy !== 'function' ||
      !viewState.canViewGalaxy(galaxyId)) return false;

    if (typeof mapContext.clearSelected === 'function') mapContext.clearSelected(false);
    if (typeof viewState.showGalaxyPlanets !== 'function' || !viewState.showGalaxyPlanets(galaxyId)) {
      return false;
    }
    if (typeof panelView.setGalaxyImmersionMode === 'function') {
      panelView.setGalaxyImmersionMode(false);
    }
    _renderContext(state);
    viewTransitionCount += 1;
    return _record('switch-galaxy', { galaxyId: galaxyId });
  }

  function returnToPlanetView() {
    var state = _state();
    if (!state) return false;

    if (typeof mapContext.clearSelected === 'function') mapContext.clearSelected(false);
    if (typeof viewState.showCurrentGalaxyPlanets !== 'function' ||
      !viewState.showCurrentGalaxyPlanets()) return false;
    if (typeof panelView.setGalaxyImmersionMode === 'function') {
      panelView.setGalaxyImmersionMode(false);
    }
    _renderContext(state);
    viewTransitionCount += 1;
    return _record('return-planets');
  }

  function toggleGalaxyView() {
    var state = _state();
    if (!state) return false;

    _callNavigation('closeMarket', [], false);
    if (state.mapView === 'galaxies') return returnToPlanetView();

    if (typeof mapContext.clearSelected === 'function') mapContext.clearSelected(false);
    if (typeof viewState.showGalaxies !== 'function' || !viewState.showGalaxies()) return false;
    if (typeof panelView.setGalaxyImmersionMode === 'function') {
      panelView.setGalaxyImmersionMode(true);
    }
    if (typeof contextInspector.replaceContext === 'function') {
      contextInspector.replaceContext({
        type: 'galaxy',
        id: state.viewingGalaxy || state.currentGalaxy,
        workspaceId: 'map',
        source: 'map-view',
        revision: typeof contextInspector.getCurrentRevision === 'function'
          ? contextInspector.getCurrentRevision()
          : 0,
      });
    }
    viewTransitionCount += 1;
    return _record('show-galaxies', { galaxyId: state.viewingGalaxy || state.currentGalaxy || '' });
  }

  function focusNavigationTarget(stateRef, systemId, options) {
    var state = stateRef || _state();
    var system = findSystem(systemId);
    if (!state || !system) return false;

    var access = getSystemAccessState(
      system.id,
      state.playerLevel || 1,
      state.researchedTechs || []
    );
    if (!access || !access.unlocked) return false;

    rememberState(state);
    requestWorkspace('map');
    if (typeof viewState.focusSystem === 'function') {
      viewState.focusSystem(system.id, system.galaxyId);
    }
    if (typeof mapContext.select === 'function') mapContext.select(system.id);
    if (typeof session.setNavigationGuideFocus === 'function') {
      session.setNavigationGuideFocus({
        systemId: system.id,
        goodId: options && options.goodId ? options.goodId : '',
        title: options && options.title ? options.title : '',
      });
    }
    ensurePanelBindings();
    if (typeof contextInspector.activateWorkspace === 'function') {
      contextInspector.activateWorkspace('map');
    }
    _renderContext(state);

    if (typeof renderer.selectPlanet === 'function') {
      renderer.selectPlanet(system.id, { focus: true, smooth: true });
    } else if (typeof renderer.focusPlanet === 'function') {
      renderer.focusPlanet(system.id, true);
    }

    focusCount += 1;
    _record('focus-system', { systemId: system.id });
    return true;
  }

  function focusStarmap() {
    return requestWorkspace('map');
  }

  function setNavigationActions(actions) {
    navigationActions = actions && typeof actions === 'object' ? actions : null;
    return !!navigationActions;
  }

  function setNavigationChangeCallback(callback) {
    navigationChangeCallback = typeof callback === 'function' ? callback : null;
    return !!navigationChangeCallback;
  }

  function setTravelHandlers(onTravel, onGalaxyJump) {
    travelActionHandler = typeof onTravel === 'function' ? onTravel : null;
    galaxyJumpActionHandler = typeof onGalaxyJump === 'function' ? onGalaxyJump : null;
    return !!(travelActionHandler || galaxyJumpActionHandler);
  }

  function reset() {
    actionCount = 0;
    focusCount = 0;
    travelCount = 0;
    viewTransitionCount = 0;
    workspaceRequestCount = 0;
    lastAction = null;
    resetCount += 1;
    return getDiagnostics();
  }

  function dispose() {
    navigationActions = null;
    navigationChangeCallback = null;
    travelActionHandler = null;
    galaxyJumpActionHandler = null;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      actionCount: actionCount,
      focusCount: focusCount,
      hasGalaxyJumpHandler: !!galaxyJumpActionHandler,
      hasNavigationActions: !!navigationActions,
      hasTravelHandler: !!travelActionHandler,
      lastAction: lastAction,
      resetCount: resetCount,
      travelCount: travelCount,
      viewTransitionCount: viewTransitionCount,
      workspaceRequestCount: workspaceRequestCount,
    });
  }

  return Object.freeze({
    dispose: dispose,
    focusNavigationTarget: focusNavigationTarget,
    focusStarmap: focusStarmap,
    getDiagnostics: getDiagnostics,
    openMarket: openMarket,
    requestWorkspace: requestWorkspace,
    reset: reset,
    returnToPlanetView: returnToPlanetView,
    setNavigationActions: setNavigationActions,
    setNavigationChangeCallback: setNavigationChangeCallback,
    setTravelHandlers: setTravelHandlers,
    switchToGalaxy: switchToGalaxy,
    toggleGalaxyView: toggleGalaxyView,
    travelToPlanet: travelToPlanet,
  });
}
