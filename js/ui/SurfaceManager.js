// js/ui/SurfaceManager.js — 界面 surface 显示规则
// 职责：收拢 primary workspace、secondary overlay、blocking modal 与 toast 的互斥行为。

const PRIMARY_SURFACE_IDS = ['market-overlay'];
const SECONDARY_SURFACE_IDS = ['info-panel', 'trade-panel', 'console-panel'];

const _surfaceState = globalThis.__linegameSurfaceManagerState || (globalThis.__linegameSurfaceManagerState = {
  observers: new Set(),
});
const _surfaceObservers = _surfaceState.observers;
const _returnFocusTargets = _surfaceState.returnFocusTargets || (_surfaceState.returnFocusTargets = new Map());
const _primaryReturnFocusTargets = _surfaceState.primaryReturnFocusTargets || (_surfaceState.primaryReturnFocusTargets = new Map());
const _secondaryReturnFocusTargets = _surfaceState.secondaryReturnFocusTargets || (_surfaceState.secondaryReturnFocusTargets = new Map());
const PRIMARY_RETURN_FOCUS_SELECTORS = {
  'market-overlay': '.bottom-nav-btn[data-view="market"]',
};
const SECONDARY_RETURN_FOCUS_SELECTORS = {
  'info-panel': '.bottom-nav-btn[data-view="quests"]',
  'trade-panel': '.bottom-nav-btn[data-view="hangar"]',
  'console-panel': '.bottom-nav-btn[data-view="console"]',
};
const BLOCKING_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');
let _focusTrapDocument = null;

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

function _focusBlockingSurface(surface, selector) {
  if (!surface || typeof surface.querySelector !== 'function') return;

  var focusTarget = null;
  try {
    if (selector) focusTarget = surface.querySelector(selector);
    if (!focusTarget) focusTarget = surface.querySelector('[autofocus]');
    if (!focusTarget) focusTarget = surface.querySelector('.modal-box, [tabindex="-1"]');
    if (!focusTarget) focusTarget = surface.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])');
  } catch (err) {
    focusTarget = null;
  }

  if (focusTarget && typeof focusTarget.focus === 'function') {
    try {
      focusTarget.focus({ preventScroll: true });
    } catch (err) {
      focusTarget.focus();
    }
  }
}

function _isFocusTargetAvailable(target) {
  if (!target || target.disabled || target.hidden) return false;
  if (typeof target.getAttribute === 'function') {
    if (target.getAttribute('aria-hidden') === 'true') return false;
    if (target.getAttribute('tabindex') === '-1') return false;
  }
  if (typeof target.closest === 'function' && target.closest('[hidden], .hidden, [aria-hidden="true"]')) return false;
  return typeof target.focus === 'function';
}

function _getBlockingFocusTargets(surface) {
  if (!surface || typeof surface.querySelectorAll !== 'function') return [];
  try {
    return Array.from(surface.querySelectorAll(BLOCKING_FOCUSABLE_SELECTOR)).filter(_isFocusTargetAvailable);
  } catch (err) {
    return [];
  }
}

function _getVisibleBlockingSurface() {
  var visibleSurfaces = _getBlockingSurfaces().filter(function (surface) {
    return !!(surface && surface.classList && !surface.classList.contains('hidden'));
  });
  return visibleSurfaces.length > 0 ? visibleSurfaces[visibleSurfaces.length - 1] : null;
}

function _handleBlockingFocusTrap(event) {
  if (!event || event.key !== 'Tab' || !globalThis.document) return;
  var surface = _getVisibleBlockingSurface();
  if (!surface) return;

  var focusTargets = _getBlockingFocusTargets(surface);
  if (focusTargets.length === 0) {
    if (typeof event.preventDefault === 'function') event.preventDefault();
    _focusBlockingSurface(surface);
    return;
  }

  var activeIndex = focusTargets.indexOf(document.activeElement);
  var nextTarget = null;
  if (event.shiftKey && activeIndex <= 0) {
    nextTarget = focusTargets[focusTargets.length - 1];
  } else if (!event.shiftKey && (activeIndex < 0 || activeIndex === focusTargets.length - 1)) {
    nextTarget = focusTargets[0];
  }

  if (!nextTarget) return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  try {
    nextTarget.focus({ preventScroll: true });
  } catch (err) {
    nextTarget.focus();
  }
}

function _ensureBlockingFocusTrap() {
  if (!globalThis.document || typeof document.addEventListener !== 'function') return;
  if (_focusTrapDocument === document) return;
  if (_focusTrapDocument && typeof _focusTrapDocument.removeEventListener === 'function') {
    _focusTrapDocument.removeEventListener('keydown', _handleBlockingFocusTrap);
  }
  document.addEventListener('keydown', _handleBlockingFocusTrap);
  _focusTrapDocument = document;
}

function _rememberBlockingSurfaceTrigger(surfaceId, surface) {
  if (!surfaceId || !globalThis.document) return;
  var activeElement = document.activeElement;
  if (!activeElement || typeof activeElement.focus !== 'function') return;
  if (activeElement === document.body || activeElement === surface) return;
  if (surface && typeof surface.contains === 'function' && surface.contains(activeElement)) return;
  _returnFocusTargets.set(surfaceId, activeElement);
}

function _restoreBlockingSurfaceTrigger(surfaceId) {
  var target = _returnFocusTargets.get(surfaceId);
  _returnFocusTargets.delete(surfaceId);
  if (!target || typeof target.focus !== 'function' || target.disabled) return;
  if (target.isConnected === false) return;
  if (target.classList && target.classList.contains('hidden')) return;
  if (typeof target.getAttribute === 'function' && target.getAttribute('aria-hidden') === 'true') return;
  if (typeof target.closest === 'function' && target.closest('[hidden], .hidden, [aria-hidden="true"]')) return;

  try {
    target.focus({ preventScroll: true });
  } catch (err) {
    target.focus();
  }
}

function _setOverlayPanelVisible(surface, visible) {
  if (!surface || !surface.classList) return;
  surface.classList.toggle('panel-open', !!visible);
  if (typeof surface.setAttribute === 'function') {
    surface.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }
}

function _focusElement(target) {
  if (!_isFocusTargetAvailable(target)) return;
  try {
    target.focus({ preventScroll: true });
  } catch (err) {
    target.focus();
  }
}

function _rememberPrimarySurfaceTrigger(surfaceId, surface, selector) {
  if (!surfaceId || !globalThis.document) return;
  var activeElement = document.activeElement;
  if (activeElement === document.body || activeElement === surface) activeElement = null;
  if (activeElement && surface && typeof surface.contains === 'function' && surface.contains(activeElement)) return;
  _primaryReturnFocusTargets.set(surfaceId, {
    target: activeElement && typeof activeElement.focus === 'function' ? activeElement : null,
    selector: selector || PRIMARY_RETURN_FOCUS_SELECTORS[surfaceId] || '',
  });
}

function _restorePrimarySurfaceTrigger(surfaceId) {
  var entry = _primaryReturnFocusTargets.get(surfaceId);
  _primaryReturnFocusTargets.delete(surfaceId);
  if (!entry) return;

  var target = entry.target;
  if (!_isFocusTargetAvailable(target) && entry.selector && typeof document.querySelector === 'function') {
    target = document.querySelector(entry.selector);
  }
  _focusElement(target);
}

function _focusPrimarySurface(surface, selector) {
  if (!surface) return;
  var target = null;
  if (typeof surface.querySelector === 'function') {
    try {
      target = selector ? surface.querySelector(selector) : null;
      if (!target) target = surface.querySelector('[data-primary-initial-focus], [role="tab"][aria-selected="true"], [role="tab"][tabindex="0"]');
    } catch (err) {
      target = null;
    }
  }
  _focusElement(target || surface);
}

function _rememberSecondarySurfaceTrigger(surfaceId, surface, selector) {
  if (!surfaceId || !globalThis.document) return;
  var activeElement = document.activeElement;
  if (activeElement === document.body || activeElement === surface) activeElement = null;
  if (activeElement && surface && typeof surface.contains === 'function' && surface.contains(activeElement)) return;
  _secondaryReturnFocusTargets.set(surfaceId, {
    target: activeElement && typeof activeElement.focus === 'function' ? activeElement : null,
    selector: selector || SECONDARY_RETURN_FOCUS_SELECTORS[surfaceId] || '',
  });
}

function _restoreSecondarySurfaceTrigger(surfaceId) {
  var entry = _secondaryReturnFocusTargets.get(surfaceId);
  _secondaryReturnFocusTargets.delete(surfaceId);
  if (!entry) return;

  var target = entry.target;
  if (!_isFocusTargetAvailable(target) && entry.selector && typeof document.querySelector === 'function') {
    target = document.querySelector(entry.selector);
  }
  _focusElement(target);
}

function _focusSecondarySurface(surface, selector) {
  if (!surface) return;
  var target = null;
  if (typeof surface.querySelector === 'function') {
    try {
      target = selector ? surface.querySelector(selector) : null;
      if (!target) target = surface.querySelector('[data-secondary-initial-focus], [role="tab"][aria-selected="true"]');
    } catch (err) {
      target = null;
    }
  }
  _focusElement(target || surface);
}

function _closePrimarySurfaces(exceptId) {
  _getSurfaceList(PRIMARY_SURFACE_IDS).forEach(function (surface) {
    if (exceptId && surface.id === exceptId) return;
    _setSurfaceVisible(surface, false);
    if (surface.id) _primaryReturnFocusTargets.delete(surface.id);
  });
}

function _closeSecondarySurfaces(exceptId) {
  _getSurfaceList(SECONDARY_SURFACE_IDS).forEach(function (surface) {
    if (exceptId && surface.id === exceptId) return;
    _setOverlayPanelVisible(surface, false);
    if (surface.id) _secondaryReturnFocusTargets.delete(surface.id);
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

export function openPrimarySurface(surfaceId, options) {
  var target = _getSurfaceById(surfaceId);
  if (!target) return null;
  var wasVisible = !!(target.classList && !target.classList.contains('hidden'));
  var surfaceOptions = options || {};

  if (!wasVisible) {
    _rememberPrimarySurfaceTrigger(surfaceId, target, surfaceOptions.returnFocusSelector);
  }

  _closeSecondarySurfaces();
  _closePrimarySurfaces(surfaceId);
  _setSurfaceVisible(target, true);
  _notifySurfaceObservers();
  if (!wasVisible && surfaceOptions.focus !== false) {
    _focusPrimarySurface(target, surfaceOptions.focusSelector);
  }
  return target;
}

export function closePrimarySurface(surfaceId) {
  var target = _getSurfaceById(surfaceId);
  if (!target) return null;
  var wasVisible = !!(target.classList && !target.classList.contains('hidden'));

  _setSurfaceVisible(target, false);
  _notifySurfaceObservers();
  if (wasVisible) _restorePrimarySurfaceTrigger(surfaceId);
  return target;
}

export function isPrimarySurfaceVisible(surfaceId) {
  var target = _getSurfaceById(surfaceId);
  return !!(target && target.classList && !target.classList.contains('hidden'));
}

export function openSecondarySurface(surfaceId, options) {
  var target = _getSurfaceById(surfaceId);
  if (!target) return null;
  var wasVisible = !!(target.classList && target.classList.contains('panel-open'));
  var surfaceOptions = options || {};

  if (!wasVisible) {
    _rememberSecondarySurfaceTrigger(surfaceId, target, surfaceOptions.returnFocusSelector);
  }

  _closePrimarySurfaces();
  _closeSecondarySurfaces(surfaceId);
  _setOverlayPanelVisible(target, true);
  _notifySurfaceObservers();
  if (!wasVisible && surfaceOptions.focus !== false) {
    _focusSecondarySurface(target, surfaceOptions.focusSelector);
  }
  return target;
}

export function closeSecondarySurface(surfaceId) {
  var target = _getSurfaceById(surfaceId);
  if (!target) return null;
  var wasVisible = !!(target.classList && target.classList.contains('panel-open'));

  _setOverlayPanelVisible(target, false);
  _notifySurfaceObservers();
  if (wasVisible) _restoreSecondarySurfaceTrigger(surfaceId);
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
  notifEl.onkeydown = null;
  notifEl.tabIndex = -1;
  if (typeof notifEl.setAttribute === 'function') {
    notifEl.setAttribute('aria-hidden', 'true');
    notifEl.setAttribute('tabindex', '-1');
  }
}

export function showEventNotificationBar(notifEl) {
  var target = notifEl || _getSurfaceById('event-notification');
  if (!target || !target.classList) return null;

  target.classList.remove('hidden');
  target.tabIndex = 0;
  if (typeof target.setAttribute === 'function') {
    target.setAttribute('aria-hidden', 'false');
    target.setAttribute('tabindex', '0');
  }

  return target;
}

export function showBlockingSurface(surfaceId, options) {
  if (!globalThis.document || typeof document.getElementById !== 'function') return null;
  var target = document.getElementById(surfaceId);
  if (!target) return null;

  if (!options || options.rememberTrigger !== false) {
    _rememberBlockingSurfaceTrigger(surfaceId, target);
  }
  _ensureBlockingFocusTrap();

  _getBlockingSurfaces().forEach(function (surface) {
    if (surface !== target) _setSurfaceVisible(surface, false);
  });

  hideEventNotificationBar();
  _setSurfaceVisible(target, true);
  _focusBlockingSurface(target, options && options.focusSelector);
  _notifySurfaceObservers();
  return target;
}

export function hideBlockingSurface(surfaceId) {
  if (!globalThis.document || typeof document.getElementById !== 'function') return null;
  var target = document.getElementById(surfaceId);
  if (!target) return null;
  var wasVisible = !!(target.classList && !target.classList.contains('hidden'));
  _setSurfaceVisible(target, false);
  _notifySurfaceObservers();
  if (wasVisible) _restoreBlockingSurfaceTrigger(surfaceId);
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
