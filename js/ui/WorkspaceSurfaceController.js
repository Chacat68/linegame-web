// js/ui/WorkspaceSurfaceController.js — 五个 canonical L3 workspace 的 DOM 生命周期
//
// NavigationController 持有唯一 active workspace；本模块只把该状态投影为
// 可见性、inert、aria-hidden、焦点和可诊断的 DOM 契约。Market 仍嵌在
// map-section 内，因此 trade 激活时会单独冻结星图子节点，而不冻结宿主。

import { normalizeWorkspace } from './NavigationController.js';

export const WORKSPACE_SURFACE_DESCRIPTORS = Object.freeze({
  map: Object.freeze({ surfaceId: 'map-section', visibilityClass: null }),
  trade: Object.freeze({ surfaceId: 'market-overlay', visibilityClass: 'hidden' }),
  fleet: Object.freeze({ surfaceId: 'trade-panel', visibilityClass: 'panel-open' }),
  archive: Object.freeze({ surfaceId: 'info-panel', visibilityClass: 'panel-open' }),
  logs: Object.freeze({ surfaceId: 'console-panel', visibilityClass: 'panel-open' }),
});

const OVERLAY_WORKSPACES = Object.freeze(['trade', 'fleet', 'archive', 'logs']);
const DEFAULT_FOCUS_SELECTOR = [
  '[data-workspace-initial-focus]',
  '[role="tab"][aria-selected="true"]',
  '[role="tab"][tabindex="0"]',
].join(', ');

function _document(source) {
  if (typeof source === 'function') return source();
  if (source) return source;
  return typeof document === 'undefined' ? null : document;
}

function _surface(doc, workspaceId) {
  var descriptor = WORKSPACE_SURFACE_DESCRIPTORS[workspaceId];
  if (!doc || !descriptor || typeof doc.getElementById !== 'function') return null;
  return doc.getElementById(descriptor.surfaceId);
}

function _setAttribute(element, name, value) {
  if (element && typeof element.setAttribute === 'function') element.setAttribute(name, String(value));
}

function _setOverlayVisible(element, descriptor, visible) {
  if (!element || !descriptor || !element.classList) return;
  if (descriptor.visibilityClass === 'hidden') {
    element.classList.toggle('hidden', !visible);
  } else if (descriptor.visibilityClass) {
    element.classList.toggle(descriptor.visibilityClass, !!visible);
  }
  element.inert = !visible;
  _setAttribute(element, 'aria-hidden', visible ? 'false' : 'true');
  if (element.dataset) element.dataset.workspaceActive = visible ? 'true' : 'false';
}

function _isOverlayVisible(element, descriptor) {
  if (!element || !descriptor || !element.classList) return false;
  if (descriptor.visibilityClass === 'hidden') return !element.classList.contains('hidden');
  return !!(descriptor.visibilityClass && element.classList.contains(descriptor.visibilityClass));
}

function _setMapSceneInert(doc, inert) {
  if (!doc || typeof doc.getElementById !== 'function') return;
  var market = doc.getElementById('market-overlay');
  var mapContainer = doc.getElementById('map-container');
  var sceneNodes = [];
  if (mapContainer && mapContainer.children) {
    sceneNodes = Array.prototype.slice.call(mapContainer.children).filter(function (node) {
      return node && node !== market;
    });
  }
  var legend = doc.getElementById('map-legend');
  if (legend) sceneNodes.push(legend);
  sceneNodes.forEach(function (node) {
    node.inert = !!inert;
  });
}

function _focusSurface(surface) {
  if (!surface) return false;
  var target = null;
  if (typeof surface.querySelectorAll === 'function') {
    try {
      target = Array.prototype.slice.call(surface.querySelectorAll(DEFAULT_FOCUS_SELECTOR)).find(function (candidate) {
        if (!candidate || candidate.disabled || candidate.hidden || typeof candidate.focus !== 'function') return false;
        if (typeof candidate.closest !== 'function') return true;
        return !candidate.closest('[hidden], .hidden, [aria-hidden="true"], [inert]');
      }) || null;
    } catch (error) {
      target = null;
    }
  }
  target = target || surface;
  if (typeof target.focus !== 'function') return false;
  try {
    target.focus({ preventScroll: true });
  } catch (error) {
    target.focus();
  }
  return true;
}

export function createWorkspaceSurfaceController(options) {
  var opts = options || {};
  var activeWorkspace = 'map';
  var activationCount = 0;
  var disposed = false;
  var focusGeneration = 0;

  function _scheduleFocus(callback) {
    var doc = _document(opts.document);
    var view = doc && doc.defaultView;
    if (view && typeof view.requestAnimationFrame === 'function') {
      view.requestAnimationFrame(callback);
      return;
    }
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(callback);
      return;
    }
    setTimeout(callback, 0);
  }

  function getSnapshot() {
    var doc = _document(opts.document);
    var visibleSurfaceIds = [];
    OVERLAY_WORKSPACES.forEach(function (workspaceId) {
      var descriptor = WORKSPACE_SURFACE_DESCRIPTORS[workspaceId];
      var element = _surface(doc, workspaceId);
      if (_isOverlayVisible(element, descriptor)) visibleSurfaceIds.push(descriptor.surfaceId);
    });
    var expectedSurfaceId = activeWorkspace === 'map'
      ? null
      : WORKSPACE_SURFACE_DESCRIPTORS[activeWorkspace].surfaceId;
    var consistent = expectedSurfaceId === null
      ? visibleSurfaceIds.length === 0
      : visibleSurfaceIds.length === 1 && visibleSurfaceIds[0] === expectedSurfaceId;
    return Object.freeze({
      activationCount: activationCount,
      activeWorkspace: activeWorkspace,
      consistent: consistent,
      disposed: disposed,
      visibleSurfaceIds: Object.freeze(visibleSurfaceIds),
    });
  }

  function activate(workspace, options) {
    var targetWorkspace = normalizeWorkspace(workspace);
    var doc = _document(opts.document);
    if (!targetWorkspace || !doc) return false;
    var targetSurface = _surface(doc, targetWorkspace);
    if (!targetSurface) return false;

    var before = getSnapshot();
    OVERLAY_WORKSPACES.forEach(function (workspaceId) {
      _setOverlayVisible(
        _surface(doc, workspaceId),
        WORKSPACE_SURFACE_DESCRIPTORS[workspaceId],
        workspaceId === targetWorkspace
      );
    });

    var mapSurface = _surface(doc, 'map');
    var mapHostsActiveWorkspace = targetWorkspace === 'map' || targetWorkspace === 'trade';
    if (mapSurface) {
      mapSurface.inert = !mapHostsActiveWorkspace;
      _setAttribute(mapSurface, 'aria-hidden', mapHostsActiveWorkspace ? 'false' : 'true');
      if (mapSurface.dataset) mapSurface.dataset.workspaceActive = targetWorkspace === 'map' ? 'true' : 'false';
    }
    _setMapSceneInert(doc, targetWorkspace !== 'map');

    var main = typeof doc.getElementById === 'function' ? doc.getElementById('game-main') : null;
    if (main && main.dataset) main.dataset.activeWorkspace = targetWorkspace;

    activeWorkspace = targetWorkspace;
    activationCount += 1;
    disposed = false;
    focusGeneration += 1;

    var activationOptions = options || {};
    var changed = before.activeWorkspace !== targetWorkspace || !before.consistent;
    if (activationOptions.focus !== false && (changed || activationOptions.forceFocus === true)) {
      _focusSurface(targetSurface);
      var scheduledGeneration = focusGeneration;
      _scheduleFocus(function () {
        if (disposed || scheduledGeneration !== focusGeneration || activeWorkspace !== targetWorkspace) return;
        _focusSurface(targetSurface);
      });
    }
    return true;
  }

  function dispose() {
    var doc = _document(opts.document);
    if (disposed) return false;
    OVERLAY_WORKSPACES.forEach(function (workspaceId) {
      _setOverlayVisible(_surface(doc, workspaceId), WORKSPACE_SURFACE_DESCRIPTORS[workspaceId], false);
    });
    var mapSurface = _surface(doc, 'map');
    if (mapSurface) {
      mapSurface.inert = false;
      _setAttribute(mapSurface, 'aria-hidden', 'false');
      if (mapSurface.dataset) delete mapSurface.dataset.workspaceActive;
    }
    _setMapSceneInert(doc, false);
    var main = doc && typeof doc.getElementById === 'function' ? doc.getElementById('game-main') : null;
    if (main && main.dataset) delete main.dataset.activeWorkspace;
    activeWorkspace = 'map';
    focusGeneration += 1;
    disposed = true;
    return true;
  }

  return Object.freeze({
    activate: activate,
    dispose: dispose,
    getSnapshot: getSnapshot,
  });
}
