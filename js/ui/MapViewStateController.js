// js/ui/MapViewStateController.js — 星图视图与悬停状态的唯一写入边界

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('MapViewStateController requires ' + label + '.');
  return value;
}

function _normalizeMapView(value) {
  return value === 'galaxies' ? 'galaxies' : 'planets';
}

export function createMapViewStateController(dependencies) {
  var deps = dependencies || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var getGalaxyAccessState = _requiredFunction(deps.getGalaxyAccessState, 'getGalaxyAccessState');
  var hoveredGalaxyId = null;
  var transitionCount = 0;
  var hoverChangeCount = 0;
  var lastTransition = null;

  function _state() {
    var state = getState();
    return state && typeof state === 'object' ? state : null;
  }

  function _record(type, state) {
    transitionCount += 1;
    lastTransition = Object.freeze({
      type: type,
      mapView: state ? _normalizeMapView(state.mapView) : 'planets',
      viewingGalaxy: state ? (state.viewingGalaxy || state.currentGalaxy || 'milky_way') : 'milky_way',
    });
    return true;
  }

  function getMapView() {
    var state = _state();
    return state ? _normalizeMapView(state.mapView) : 'planets';
  }

  function getCurrentGalaxyId() {
    var state = _state();
    return state ? (state.viewingGalaxy || state.currentGalaxy || 'milky_way') : 'milky_way';
  }

  function getHoveredGalaxyId() {
    return hoveredGalaxyId;
  }

  function setHover(target) {
    var state = _state();
    if (!state) return false;
    var nextSystemId = target && target.type === 'system' && target.id ? target.id : null;
    var nextGalaxyId = target && target.type === 'galaxy' && target.id ? target.id : null;
    var changed = state.hoveredSystem !== nextSystemId || hoveredGalaxyId !== nextGalaxyId;
    if (!changed) return false;
    state.hoveredSystem = nextSystemId;
    hoveredGalaxyId = nextGalaxyId;
    hoverChangeCount += 1;
    return true;
  }

  function clearHover() {
    return setHover(null);
  }

  function clearHoveredGalaxy() {
    if (hoveredGalaxyId === null) return false;
    hoveredGalaxyId = null;
    hoverChangeCount += 1;
    return true;
  }

  function showGalaxies() {
    var state = _state();
    if (!state) return false;
    state.hoveredSystem = null;
    hoveredGalaxyId = null;
    state.mapView = 'galaxies';
    return _record('show-galaxies', state);
  }

  function showCurrentGalaxyPlanets() {
    var state = _state();
    if (!state) return false;
    state.hoveredSystem = null;
    hoveredGalaxyId = null;
    state.mapView = 'planets';
    state.viewingGalaxy = state.currentGalaxy || 'milky_way';
    return _record('show-current-planets', state);
  }

  function canViewGalaxy(galaxyId) {
    var state = _state();
    if (!state || !galaxyId) return false;
    var access = getGalaxyAccessState(
      galaxyId,
      state.playerLevel || 1,
      state.researchedTechs || []
    );
    return !!(access && access.unlocked);
  }

  function showGalaxyPlanets(galaxyId) {
    var state = _state();
    if (!state || !canViewGalaxy(galaxyId)) return false;
    state.hoveredSystem = null;
    hoveredGalaxyId = null;
    state.viewingGalaxy = galaxyId;
    state.mapView = 'planets';
    return _record('show-galaxy-planets', state);
  }

  function focusSystem(systemId, galaxyId) {
    var state = _state();
    if (!state || !systemId || !galaxyId) return false;
    hoveredGalaxyId = null;
    state.mapView = 'planets';
    state.viewingGalaxy = galaxyId;
    state.hoveredSystem = systemId;
    return _record('focus-system', state);
  }

  function reset() {
    hoveredGalaxyId = null;
    transitionCount = 0;
    hoverChangeCount = 0;
    lastTransition = null;
  }

  function getDiagnostics() {
    return Object.freeze({
      currentGalaxyId: getCurrentGalaxyId(),
      hoverChangeCount: hoverChangeCount,
      hoveredGalaxyId: hoveredGalaxyId,
      mapView: getMapView(),
      lastTransition: lastTransition,
      transitionCount: transitionCount,
    });
  }

  return Object.freeze({
    canViewGalaxy: canViewGalaxy,
    clearHover: clearHover,
    clearHoveredGalaxy: clearHoveredGalaxy,
    focusSystem: focusSystem,
    getCurrentGalaxyId: getCurrentGalaxyId,
    getDiagnostics: getDiagnostics,
    getHoveredGalaxyId: getHoveredGalaxyId,
    getMapView: getMapView,
    reset: reset,
    setHover: setHover,
    showCurrentGalaxyPlanets: showCurrentGalaxyPlanets,
    showGalaxies: showGalaxies,
    showGalaxyPlanets: showGalaxyPlanets,
  });
}
