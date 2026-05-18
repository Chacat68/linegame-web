// js/ui/SurfaceManager.js — 界面 surface 显示规则
// 职责：收拢 primary workspace、secondary overlay、blocking modal 与 toast 的互斥行为。

const PRIMARY_SURFACE_IDS = ['market-overlay'];
const SECONDARY_SURFACE_IDS = ['info-panel', 'trade-panel', 'console-panel'];

const _surfaceState = globalThis.__linegameSurfaceManagerState || (globalThis.__linegameSurfaceManagerState = {
  observers: new Set(),
});
const _surfaceObservers = _surfaceState.observers;

function _getBlockingSurfaces() {
  if (!globalThis.document || typeof document.querySelectorAll !== 'function') return [];
  return Array.from(document.querySelectorAll('.modal'));
}

function _getSurfaceById(surfaceId) {
  if (!surfaceId || !globalThis.document || typeof document.getElementById !== 'function') return null;
  return document.getElementById(surfaceId);
}

function _getSurfaceList(surfaceIds) {
  if (!Array.isArray(surfaceIds)) return [];
  return surfaceIds.map(_getSurfaceById).filter(Boolean);
}

function _setSurfaceVisible(surface, visible) {
  if (!surface || !surface.classList) return;
  surface.classList.toggle('hidden', !visible);
  if (typeof surface.setAttribute === 'function') {
    surface.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
}

function _setOverlayPanelVisible(surface, visible) {
  if (!surface || !surface.classList) return;
  surface.classList.toggle('panel-open', !!visible);
  if (typeof surface.setAttribute === 'function') {
    surface.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
}

function _closePrimarySurfaces(exceptId) {
  _getSurfaceList(PRIMARY_SURFACE_IDS).forEach(function (surface) {
    if (exceptId && surface.id === exceptId) return;
    _setSurfaceVisible(surface, false);
  });
}

function _closeSecondarySurfaces(exceptId) {
  _getSurfaceList(SECONDARY_SURFACE_IDS).forEach(function (surface) {
    if (exceptId && surface.id === exceptId) return;
    _setOverlayPanelVisible(surface, false);
  });
}

function _notifySurfaceObservers() {
  var snapshot = {
    hasBlockingSurfaceOpen: hasBlockingSurfaceOpen(),
    visiblePrimarySurfaceIds: _getSurfaceList(PRIMARY_SURFACE_IDS).filter(function (surface) {
      return !!(surface && surface.id && surface.classList && !surface.classList.contains('hidden'));
    }).map(function (surface) {
      return surface.id;
    }),
    visibleSecondarySurfaceIds: _getSurfaceList(SECONDARY_SURFACE_IDS).filter(function (surface) {
      return !!(surface && surface.id && surface.classList && surface.classList.contains('panel-open'));
    }).map(function (surface) {
      return surface.id;
    }),
    visibleSurfaceIds: _getBlockingSurfaces().filter(function (surface) {
      return !!(surface && surface.id && surface.classList && !surface.classList.contains('hidden'));
    }).map(function (surface) {
      return surface.id;
    }),
  };

  _surfaceObservers.forEach(function (observer) {
    observer(snapshot);
  });
}

export function openPrimarySurface(surfaceId) {
  var target = _getSurfaceById(surfaceId);
  if (!target) return null;

  _closeSecondarySurfaces();
  _closePrimarySurfaces(surfaceId);
  _setSurfaceVisible(target, true);
  _notifySurfaceObservers();
  return target;
}

export function closePrimarySurface(surfaceId) {
  var target = _getSurfaceById(surfaceId);
  if (!target) return null;

  _setSurfaceVisible(target, false);
  _notifySurfaceObservers();
  return target;
}

export function isPrimarySurfaceVisible(surfaceId) {
  var target = _getSurfaceById(surfaceId);
  return !!(target && target.classList && !target.classList.contains('hidden'));
}

export function openSecondarySurface(surfaceId) {
  var target = _getSurfaceById(surfaceId);
  if (!target) return null;

  _closePrimarySurfaces();
  _closeSecondarySurfaces(surfaceId);
  _setOverlayPanelVisible(target, true);
  _notifySurfaceObservers();
  return target;
}

export function closeSecondarySurface(surfaceId) {
  var target = _getSurfaceById(surfaceId);
  if (!target) return null;

  _setOverlayPanelVisible(target, false);
  _notifySurfaceObservers();
  return target;
}

export function closeAllSecondarySurfaces() {
  _closeSecondarySurfaces();
  _notifySurfaceObservers();
}

export function closeAllNonBlockingSurfaces() {
  _closePrimarySurfaces();
  _closeSecondarySurfaces();
  _notifySurfaceObservers();
}

export function hideEventNotificationBar() {
  if (!globalThis.document || typeof document.getElementById !== 'function') return;
  var notifEl = document.getElementById('event-notification');
  if (!notifEl || !notifEl.classList) return;
  notifEl.classList.add('hidden');
  notifEl.onclick = null;
}

export function showBlockingSurface(surfaceId) {
  if (!globalThis.document || typeof document.getElementById !== 'function') return null;
  var target = document.getElementById(surfaceId);
  if (!target) return null;

  _getBlockingSurfaces().forEach(function (surface) {
    if (surface !== target) _setSurfaceVisible(surface, false);
  });

  hideEventNotificationBar();
  _setSurfaceVisible(target, true);
  _notifySurfaceObservers();
  return target;
}

export function hideBlockingSurface(surfaceId) {
  if (!globalThis.document || typeof document.getElementById !== 'function') return null;
  var target = document.getElementById(surfaceId);
  if (!target) return null;
  _setSurfaceVisible(target, false);
  _notifySurfaceObservers();
  return target;
}

export function isBlockingSurfaceVisible(surfaceId) {
  if (!globalThis.document || typeof document.getElementById !== 'function') return false;
  var target = document.getElementById(surfaceId);
  return !!(target && target.classList && !target.classList.contains('hidden'));
}

export function hasBlockingSurfaceOpen(exceptId) {
  return _getBlockingSurfaces().some(function (surface) {
    if (!surface || !surface.id || !surface.classList) return false;
    if (exceptId && surface.id === exceptId) return false;
    return !surface.classList.contains('hidden');
  });
}

export function observeBlockingSurfaceState(observer) {
  if (typeof observer !== 'function') {
    return function () {};
  }

  _surfaceObservers.add(observer);
  return function () {
    _surfaceObservers.delete(observer);
  };
}

export function bindBlockingSurfaceDismiss(surfaceId, options) {
  if (!globalThis.document || typeof document.getElementById !== 'function') return null;

  var target = document.getElementById(surfaceId);
  if (!target || !target.dataset) return target;
  if (target.dataset.surfaceDismissBound === '1') return target;

  var closeOnBackdrop = !options || options.closeOnBackdrop !== false;
  var closeOnEscape = !options || options.closeOnEscape !== false;
  var onDismiss = options && typeof options.onDismiss === 'function'
    ? options.onDismiss
    : function () {
      hideBlockingSurface(surfaceId);
    };

  if (closeOnBackdrop && typeof target.addEventListener === 'function') {
    target.addEventListener('click', function (event) {
      if (event.target === target) onDismiss();
    });
  }

  if (closeOnEscape && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', function (event) {
      if (!event || event.key !== 'Escape') return;
      if (!isBlockingSurfaceVisible(surfaceId)) return;
      onDismiss();
    });
  }

  target.dataset.surfaceDismissBound = '1';
  return target;
}
