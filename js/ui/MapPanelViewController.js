// js/ui/MapPanelViewController.js — 星图星系/星球面板 DOM、ARIA、滚动与几何 owner

import { buildGalaxyHubPanel } from './MapGalaxyHubPresenter.js';
import { buildMapPanelLayout } from './MapPanelLayout.js';
import { buildMapPlanetDetailView } from './MapPlanetDetailPresenter.js';

function _resolveDocument(getDocument) {
  if (typeof getDocument === 'function') return getDocument() || null;
  return typeof document !== 'undefined' ? document : null;
}

export function createMapPanelViewController(options) {
  var ports = options || {};
  var getDocument = ports.getDocument;
  var renderer = ports.renderer || {};
  var session = ports.session || {};
  var viewState = ports.viewState || {};
  var getPoiStatus = typeof ports.getPoiStatus === 'function' ? ports.getPoiStatus : function () { return null; };
  var isDisclosureOpen = typeof ports.isDisclosureOpen === 'function'
    ? ports.isDisclosureOpen
    : function (sectionId, defaultOpen) { return !!defaultOpen; };
  var clearSelectedSystem = typeof ports.clearSelectedSystem === 'function'
    ? ports.clearSelectedSystem
    : function () {};
  var renderCount = 0;
  var galaxyRenderCount = 0;
  var planetRenderCount = 0;
  var hiddenRenderCount = 0;
  var lastMode = 'hidden';
  var lastDisplayId = null;

  function setGalaxyImmersionMode(active) {
    var documentRef = _resolveDocument(getDocument);
    if (!documentRef || !documentRef.body || !documentRef.body.classList) return false;
    documentRef.body.classList.toggle('starmap-galaxy-mode', !!active);
    return true;
  }

  function _applyLayout(panel, layout) {
    if (!panel || !layout) return;
    panel.style.width = layout.width == null ? '' : layout.width + 'px';
    panel.style.left = layout.left == null ? '' : layout.left + 'px';
    panel.style.top = layout.top == null ? '' : layout.top + 'px';
  }

  function _measureCommandSurfaceTops(documentRef, mapContainer) {
    if (!mapContainer || typeof mapContainer.getBoundingClientRect !== 'function') return [];
    var mapRect = mapContainer.getBoundingClientRect();
    var tops = [];
    ['bottom-nav', 'action-guide'].forEach(function (elementId) {
      var commandSurface = documentRef.getElementById(elementId);
      if (!commandSurface || commandSurface.hidden || typeof commandSurface.getBoundingClientRect !== 'function') return;
      var commandRect = commandSurface.getBoundingClientRect();
      if (commandRect.width <= 0 || commandRect.height <= 0) return;
      tops.push(commandRect.top - mapRect.top);
    });
    return tops;
  }

  function _getDisplayId(state) {
    var selectedSystemId = typeof session.getSelectedSystem === 'function'
      ? session.getSelectedSystem()
      : null;
    if (selectedSystemId) return selectedSystemId;
    return state ? (state.hoveredSystem || state.currentSystem) : null;
  }

  function _hide(panel) {
    panel.classList.remove('planet-detail-panel--galaxy-hub');
    panel.classList.remove('planet-detail-panel--guide-target');
    panel.classList.remove('visible');
    panel.setAttribute('aria-hidden', 'true');
    hiddenRenderCount += 1;
    lastMode = 'hidden';
    lastDisplayId = null;
    return false;
  }

  function _renderGalaxy(state, panel, mapContainer) {
    var previousScrollTop = panel.classList.contains('planet-detail-panel--galaxy-hub')
      ? panel.scrollTop
      : 0;
    if (typeof session.getSelectedSystem === 'function' && session.getSelectedSystem()) {
      clearSelectedSystem(false);
    }

    panel.classList.remove('planet-detail-panel--summary', 'planet-detail-panel--pinned', 'planet-detail-panel--guide-target');
    panel.classList.add('planet-detail-panel--galaxy-hub');
    panel.setAttribute('role', 'region');
    panel.removeAttribute('aria-label');
    panel.setAttribute('aria-labelledby', 'galaxy-hub-title');
    panel.setAttribute('aria-hidden', 'false');
    panel.setAttribute('tabindex', '-1');
    panel.innerHTML = buildGalaxyHubPanel(state, {
      focusGalaxyId: typeof viewState.getHoveredGalaxyId === 'function'
        ? viewState.getHoveredGalaxyId()
        : null,
    });
    panel.classList.add('visible');

    _applyLayout(panel, buildMapPanelLayout({
      containerHeight: mapContainer.clientHeight,
      containerWidth: mapContainer.clientWidth,
      embedded: !!(panel.closest && panel.closest('#context-inspector')),
      mode: 'galaxy',
    }));
    panel.scrollTop = previousScrollTop;
    galaxyRenderCount += 1;
    lastMode = 'galaxy';
    lastDisplayId = null;
    return true;
  }

  function _renderPlanet(state, panel, mapContainer, displayId) {
    var view = buildMapPlanetDetailView(state, displayId, {
      selectedSystemId: typeof session.getSelectedSystem === 'function'
        ? session.getSelectedSystem()
        : null,
      navigationGuideFocus: typeof session.getNavigationGuideFocus === 'function'
        ? session.getNavigationGuideFocus()
        : null,
      getPoiStatus: getPoiStatus,
      isDisclosureOpen: isDisclosureOpen,
    });
    if (!view) return _hide(panel);

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

    var screenPosition = typeof renderer.getPlanetScreenPosition === 'function'
      ? renderer.getPlanetScreenPosition(displayId)
      : null;
    _applyLayout(panel, buildMapPanelLayout({
      anchor: view.anchor,
      commandSurfaceTops: _measureCommandSurfaceTops(_resolveDocument(getDocument), mapContainer),
      containerHeight: mapContainer.clientHeight,
      containerWidth: mapContainer.clientWidth,
      embedded: !!(panel.closest && panel.closest('#context-inspector')),
      mode: 'planet',
      panelHeight: panel.offsetHeight,
      pinned: view.isPinned,
      screenPosition: screenPosition,
    }));
    planetRenderCount += 1;
    lastMode = 'planet';
    lastDisplayId = displayId;
    return true;
  }

  function render(state) {
    var documentRef = _resolveDocument(getDocument);
    if (!state || !documentRef || typeof documentRef.getElementById !== 'function') return false;
    var panel = documentRef.getElementById('planet-detail-panel');
    var mapContainer = documentRef.getElementById('map-container');
    if (!panel || !mapContainer) return false;
    renderCount += 1;
    setGalaxyImmersionMode(state.mapView === 'galaxies');

    if (state.mapView === 'galaxies') return _renderGalaxy(state, panel, mapContainer);

    var displayId = _getDisplayId(state);
    if (state.mapView !== 'planets' || !displayId) {
      if (state.mapView !== 'planets' && typeof session.getSelectedSystem === 'function' && session.getSelectedSystem()) {
        clearSelectedSystem(false);
      }
      return _hide(panel);
    }
    return _renderPlanet(state, panel, mapContainer, displayId);
  }

  function hide(options) {
    var documentRef = _resolveDocument(getDocument);
    if (!documentRef || typeof documentRef.getElementById !== 'function') return false;
    var panel = documentRef.getElementById('planet-detail-panel');
    if (!panel) return false;
    if (options && options.preserveMode) {
      panel.classList.remove('visible');
      panel.setAttribute('aria-hidden', 'true');
      hiddenRenderCount += 1;
      lastMode = 'hidden';
      lastDisplayId = null;
      return false;
    }
    return _hide(panel);
  }

  function getDiagnostics() {
    return Object.freeze({
      galaxyRenderCount: galaxyRenderCount,
      hiddenRenderCount: hiddenRenderCount,
      lastDisplayId: lastDisplayId,
      lastMode: lastMode,
      planetRenderCount: planetRenderCount,
      renderCount: renderCount,
    });
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    hide: hide,
    render: render,
    setGalaxyImmersionMode: setGalaxyImmersionMode,
  });
}
