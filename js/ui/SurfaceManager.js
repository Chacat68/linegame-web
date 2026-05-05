// js/ui/SurfaceManager.js — 阻塞层显示规则
// 职责：确保 .modal 单实例显示，并在阻塞层打开时收起非阻塞事件通知条。

const _surfaceState = globalThis.__linegameSurfaceManagerState || (globalThis.__linegameSurfaceManagerState = {
  observers: new Set(),
});
const _surfaceObservers = _surfaceState.observers;

function _getBlockingSurfaces() {
  if (!globalThis.document || typeof document.querySelectorAll !== 'function') return [];
  return Array.from(document.querySelectorAll('.modal'));
}

function _setSurfaceVisible(surface, visible) {
  if (!surface || !surface.classList) return;
  surface.classList.toggle('hidden', !visible);
  if (typeof surface.setAttribute === 'function') {
    surface.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
}

function _notifySurfaceObservers() {
  var snapshot = {
    hasBlockingSurfaceOpen: hasBlockingSurfaceOpen(),
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