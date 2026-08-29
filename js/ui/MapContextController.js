// js/ui/MapContextController.js — 地图 Context key、Renderer selection、Escape 与注册生命周期

export function createMapContextController(options) {
  var ports = options || {};
  var contextInspector = ports.contextInspector || {};
  var registerEscapeLayer = typeof ports.registerEscapeLayer === 'function'
    ? ports.registerEscapeLayer
    : function () { return function () {}; };
  var session = ports.session || {};
  var viewState = ports.viewState || {};
  var panelView = ports.panelView || {};
  var renderer = ports.renderer || {};
  var getState = typeof ports.getState === 'function' ? ports.getState : function () { return null; };
  var renderPanel = typeof ports.renderPanel === 'function' ? ports.renderPanel : function () { return false; };
  var returnToPlanets = typeof ports.returnToPlanets === 'function' ? ports.returnToPlanets : function () { return false; };
  var registered = false;
  var releaseRenderer = null;
  var releaseEscape = null;
  var selectCount = 0;
  var clearCount = 0;
  var rendererRequestCount = 0;

  function clearSelected(shouldRefresh) {
    if (typeof session.clearSelectedSystem === 'function') session.clearSelectedSystem();
    if (typeof session.clearNavigationGuideFocus === 'function') session.clearNavigationGuideFocus();
    if (typeof contextInspector.clearContext === 'function') {
      contextInspector.clearContext('map', { render: false });
    }
    if (typeof renderer.clearSelection === 'function') renderer.clearSelection();
    clearCount += 1;
    var state = getState();
    if (shouldRefresh && state) {
      if (typeof contextInspector.render === 'function') contextInspector.render();
      var snapshot = typeof contextInspector.getSnapshot === 'function'
        ? contextInspector.getSnapshot()
        : null;
      if (!snapshot || !snapshot.initialized) renderPanel(state);
    }
    return true;
  }

  function select(systemId) {
    var selectedSystemId = typeof session.setSelectedSystem === 'function'
      ? session.setSelectedSystem(systemId)
      : null;
    if (selectedSystemId && typeof contextInspector.replaceContext === 'function') {
      contextInspector.replaceContext({
        type: 'planet',
        id: selectedSystemId,
        workspaceId: 'map',
        source: 'map-selection',
        revision: typeof contextInspector.getCurrentRevision === 'function'
          ? contextInspector.getCurrentRevision()
          : 0,
      }, { render: false });
    } else if (typeof contextInspector.clearContext === 'function') {
      contextInspector.clearContext('map', { render: false });
    }
    selectCount += 1;
    return selectedSystemId;
  }

  function _renderContext(request) {
    rendererRequestCount += 1;
    var context = request && request.context;
    var state = request && request.state ? request.state : getState();
    if (!state) return false;

    if (!context) {
      if (typeof session.clearSelectedSystem === 'function') session.clearSelectedSystem();
      if (typeof viewState.clearHover === 'function') viewState.clearHover();
      if (typeof panelView.hide === 'function') panelView.hide({ preserveMode: true });
      return false;
    }
    if (context.type === 'planet') {
      if (typeof session.setSelectedSystem === 'function') session.setSelectedSystem(context.id);
      if (typeof viewState.setHover === 'function') viewState.setHover({ type: 'system', id: context.id });
    } else if (context.type === 'galaxy') {
      if (typeof viewState.showGalaxies === 'function') viewState.showGalaxies();
    } else {
      return false;
    }
    renderPanel(state);
    return true;
  }

  function register() {
    if (registered) return false;
    registered = true;
    if (typeof contextInspector.registerRenderer === 'function') {
      releaseRenderer = contextInspector.registerRenderer('map', _renderContext) || null;
    }
    releaseEscape = registerEscapeLayer('map-object-detail', {
      priority: 50,
      isActive: function () {
        var inspector = typeof contextInspector.getSnapshot === 'function'
          ? contextInspector.getSnapshot()
          : null;
        var state = getState();
        var selectedSystemId = typeof session.getSelectedSystem === 'function'
          ? session.getSelectedSystem()
          : null;
        return !!(inspector && inspector.open && inspector.activeWorkspaceId === 'map' && state && (
          selectedSystemId || state.mapView === 'galaxies'
        ));
      },
      onEscape: function () {
        var state = getState();
        var selectedSystemId = typeof session.getSelectedSystem === 'function'
          ? session.getSelectedSystem()
          : null;
        if (selectedSystemId) clearSelected(true);
        else if (state && state.mapView === 'galaxies') returnToPlanets();
      },
    }) || null;
    return true;
  }

  function reset() {
    if (typeof contextInspector.clearContext === 'function') {
      contextInspector.clearContext('map', { render: false });
    }
    if (typeof renderer.clearSelection === 'function') renderer.clearSelection();
    return getDiagnostics();
  }

  function dispose() {
    if (!registered) return false;
    if (typeof releaseRenderer === 'function') releaseRenderer();
    if (typeof releaseEscape === 'function') releaseEscape();
    releaseRenderer = null;
    releaseEscape = null;
    registered = false;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      clearCount: clearCount,
      registered: registered,
      rendererRequestCount: rendererRequestCount,
      selectCount: selectCount,
    });
  }

  return Object.freeze({
    clearSelected: clearSelected,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    register: register,
    reset: reset,
    select: select,
  });
}
