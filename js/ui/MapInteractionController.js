// js/ui/MapInteractionController.js — 星图 Renderer、EventBus 与 DOM 交互绑定 owner

import * as EventBus from '../core/EventBus.js';

const DEFAULT_GALAXY_VIEW_TOGGLE_EVENT = 'starmap:galaxy-view-toggle';

function _resolveWindow(getWindow) {
  if (typeof getWindow === 'function') return getWindow() || null;
  return typeof window !== 'undefined' ? window : null;
}

export function createMapInteractionController(options) {
  var ports = options || {};
  var eventBus = ports.eventBus || EventBus;
  var eventName = ports.galaxyViewToggleEvent || DEFAULT_GALAXY_VIEW_TOGGLE_EVENT;
  var renderer = ports.renderer || {};
  var session = ports.session || {};
  var viewState = ports.viewState || {};
  var mapContext = ports.mapContext || {};
  var findSystem = typeof ports.findSystem === 'function' ? ports.findSystem : function () { return null; };
  var getState = typeof ports.getState === 'function' ? ports.getState : function () { return null; };
  var refreshPanel = typeof ports.refreshPanel === 'function' ? ports.refreshPanel : function () { return false; };
  var renderContext = typeof ports.renderContext === 'function' ? ports.renderContext : function () {};
  var switchToGalaxy = typeof ports.switchToGalaxy === 'function' ? ports.switchToGalaxy : function () { return false; };
  var toggleGalaxyView = typeof ports.toggleGalaxyView === 'function' ? ports.toggleGalaxyView : function () { return false; };
  var travelToPlanet = typeof ports.travelToPlanet === 'function' ? ports.travelToPlanet : function () { return false; };
  var domListeners = [];
  var eventBound = false;
  var callbacksBound = false;
  var callbackWindow = null;
  var rendererCallbackBindCount = 0;

  function bindDomListener(target, eventNameRef, handler, listenerOptions) {
    if (!target || typeof target.addEventListener !== 'function' || typeof handler !== 'function') return false;
    target.addEventListener(eventNameRef, handler, listenerOptions);
    domListeners.push({
      eventName: eventNameRef,
      handler: handler,
      options: listenerOptions,
      target: target,
    });
    return true;
  }

  function _releaseDomListeners() {
    domListeners.splice(0).reverse().forEach(function (binding) {
      if (binding.target && typeof binding.target.removeEventListener === 'function') {
        binding.target.removeEventListener(binding.eventName, binding.handler, binding.options);
      }
      if (binding.target && binding.target.dataset) {
        delete binding.target.dataset.mapPanelControllerBound;
      }
    });
  }

  function bind() {
    if (eventBound) return false;
    if (typeof eventBus.on !== 'function') return false;
    eventBus.on(eventName, toggleGalaxyView);
    eventBound = true;
    return true;
  }

  function _clearRendererCallbacks(windowRef) {
    if (!windowRef) return;
    windowRef._mapHoverCallback = null;
    windowRef._mapClickCallback = null;
    windowRef._mapBackgroundClickCallback = null;
    windowRef._galaxyClickCallback = null;
    windowRef._switchToGalaxyView = null;
  }

  function initRendererCallbacks() {
    if (typeof renderer.isActive === 'function' && !renderer.isActive() && typeof renderer.toggleView === 'function') {
      renderer.toggleView();
    }

    var windowRef = _resolveWindow(ports.getWindow);
    if (!windowRef) return false;
    if (callbackWindow && callbackWindow !== windowRef) _clearRendererCallbacks(callbackWindow);
    callbackWindow = windowRef;
    callbacksBound = true;
    rendererCallbackBindCount += 1;

    windowRef._mapHoverCallback = function (data) {
      var state = getState();
      if (!state) return;
      if (typeof viewState.setHover === 'function' && viewState.setHover(data)) refreshPanel(state);
    };
    windowRef._mapClickCallback = function (systemId) {
      var state = getState();
      if (!state || !findSystem(systemId)) return;
      if (typeof viewState.clearHoveredGalaxy === 'function') viewState.clearHoveredGalaxy();

      var selectedSystemId = typeof session.getSelectedSystem === 'function'
        ? session.getSelectedSystem()
        : null;
      if (selectedSystemId !== systemId) {
        if (typeof mapContext.select === 'function') mapContext.select(systemId);
        if (typeof viewState.setHover === 'function') viewState.setHover({ type: 'system', id: systemId });
        renderContext();
        return;
      }
      travelToPlanet(systemId);
    };
    windowRef._mapBackgroundClickCallback = function () {
      var selectedSystemId = typeof session.getSelectedSystem === 'function'
        ? session.getSelectedSystem()
        : null;
      if (selectedSystemId && typeof mapContext.clearSelected === 'function') mapContext.clearSelected(true);
    };
    windowRef._galaxyClickCallback = function (galaxyId) {
      switchToGalaxy(galaxyId);
    };
    windowRef._switchToGalaxyView = function () {
      var state = getState();
      if (state && state.mapView !== 'galaxies') toggleGalaxyView();
    };
    return true;
  }

  function dispose() {
    var hadBindings = eventBound || callbacksBound || domListeners.length > 0;
    _releaseDomListeners();
    if (eventBound && typeof eventBus.off === 'function') eventBus.off(eventName, toggleGalaxyView);
    if (callbacksBound) _clearRendererCallbacks(callbackWindow);
    eventBound = false;
    callbacksBound = false;
    callbackWindow = null;
    return hadBindings;
  }

  function getDiagnostics() {
    return Object.freeze({
      callbacksBound: callbacksBound,
      domListenerCount: domListeners.length,
      eventBound: eventBound,
      rendererCallbackBindCount: rendererCallbackBindCount,
    });
  }

  return Object.freeze({
    bind: bind,
    bindDomListener: bindDomListener,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    initRendererCallbacks: initRendererCallbacks,
  });
}
