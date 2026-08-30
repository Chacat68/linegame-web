// js/ui/SurfaceManager.js — blocking surface 与全局 Escape 生命周期
// Canonical L3 workspace 由 NavigationController + WorkspaceSurfaceController 持有；
// 本模块只管理 blocking modal、焦点陷阱和非阻塞 Escape layer 仲裁。

import { createBlockingSurfaceDismissRegistry } from './BlockingSurfaceDismissRegistry.js';

const _surfaceState = globalThis.__linegameSurfaceManagerState || (globalThis.__linegameSurfaceManagerState = {
  observers: new Set(),
});
const _surfaceObservers = _surfaceState.observers;
const _returnFocusTargets = _surfaceState.returnFocusTargets || (_surfaceState.returnFocusTargets = new Map());
const _blockingDismissers = _surfaceState.blockingDismissers || (_surfaceState.blockingDismissers = new Map());
const _escapeLayers = _surfaceState.escapeLayers || (_surfaceState.escapeLayers = new Map());
const _blockingDismissRegistry = createBlockingSurfaceDismissRegistry({
  entries: _blockingDismissers,
  defaultDismiss: function (surfaceId) { hideBlockingSurface(surfaceId); },
  ensureDispatcher: function () { _ensureSurfaceDocumentDispatcher(); },
  onEntryReleased: function (surfaceId) {
    _returnFocusTargets.delete(surfaceId);
    _releaseSurfaceDocumentDispatcherIfIdle();
  },
});
const BLOCKING_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');
function _getBlockingSurfaces() {
  if (!globalThis.document || typeof document.querySelectorAll !== 'function') return [];
  return Array.from(document.querySelectorAll('.modal'));
}

function _setSurfaceVisible(surface, visible) {
  if (!surface || !surface.classList) return;
  surface.classList.toggle('hidden', !visible);
  surface.inert = !visible;
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

function _getVisibleBlockingSurfaceIds() {
  return _getBlockingSurfaces().filter(function (surface) {
    return !!(surface && surface.id && surface.classList && !surface.classList.contains('hidden'));
  }).map(function (surface) {
    return surface.id;
  });
}

function _getEscapeLayersByPriority() {
  return Array.from(_escapeLayers.values()).sort(function (left, right) {
    return right.priority - left.priority || right.sequence - left.sequence;
  });
}

function _isEscapeLayerActive(layer) {
  try {
    return !!layer.isActive();
  } catch (err) {
    return false;
  }
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

function _consumeEscape(event) {
  if (typeof event.preventDefault === 'function') event.preventDefault();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
  if (typeof event.stopPropagation === 'function') event.stopPropagation();
  event.__surfaceEscapeHandled = true;
}

function _dispatchEscape(event) {
  if (!event || event.key !== 'Escape' || event.defaultPrevented ||
      event.__surfaceEscapeHandled || event.__contextInspectorHandled) return false;

  // Blocking transactions always own Escape while visible. A non-dismissible
  // modal consumes the key without allowing it to close a lower layer.
  var blockingSurface = _getVisibleBlockingSurface();
  if (blockingSurface) {
    _consumeEscape(event);
    var dismissEntry = blockingSurface.id ? _blockingDismissRegistry.get(blockingSurface.id) : null;
    var dismissOwner = _blockingDismissRegistry.getOwner(dismissEntry);
    if (dismissEntry && dismissEntry.target === blockingSurface && dismissOwner && dismissOwner.closeOnEscape) {
      dismissOwner.onDismiss();
    }
    return true;
  }

  var layers = _getEscapeLayersByPriority();
  for (var i = 0; i < layers.length; i += 1) {
    var layer = layers[i];
    if (!_isEscapeLayerActive(layer)) continue;

    _consumeEscape(event);
    if (layer.dismissible && layer.onEscape) layer.onEscape(event);
    return true;
  }
  return false;
}

/**
 * 唯一的 document 级键盘 dispatcher。Tab 负责阻塞层焦点陷阱；Escape
 * 严格按 SurfaceManager 注册层级只消费一个动作。
 */
function _handleSurfaceDocumentKeydown(event) {
  if (!event) return;
  if (event.key === 'Tab') {
    _handleBlockingFocusTrap(event);
    return;
  }
  if (event.key === 'Escape') _dispatchEscape(event);
}

function _ensureSurfaceDocumentDispatcher() {
  if (!globalThis.document || typeof document.addEventListener !== 'function') return;
  var boundDocument = _surfaceState.dispatcherDocument;
  var boundHandler = _surfaceState.dispatcherHandler;
  if (boundDocument === document && boundHandler) return;
  if (boundDocument && boundHandler && typeof boundDocument.removeEventListener === 'function') {
    boundDocument.removeEventListener('keydown', boundHandler);
  }
  document.addEventListener('keydown', _handleSurfaceDocumentKeydown);
  _surfaceState.dispatcherDocument = document;
  _surfaceState.dispatcherHandler = _handleSurfaceDocumentKeydown;
}

function _releaseSurfaceDocumentDispatcherIfIdle() {
  if (_blockingDismissRegistry.size() > 0 || _escapeLayers.size > 0 || _getVisibleBlockingSurface()) return false;
  var boundDocument = _surfaceState.dispatcherDocument;
  var boundHandler = _surfaceState.dispatcherHandler;
  if (!boundDocument || !boundHandler) return false;
  if (typeof boundDocument.removeEventListener === 'function') {
    boundDocument.removeEventListener('keydown', boundHandler);
  }
  _surfaceState.dispatcherDocument = null;
  _surfaceState.dispatcherHandler = null;
  return true;
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

function _notifySurfaceObservers() {
  var visibleSurfaceIds = Object.freeze(_getVisibleBlockingSurfaceIds());
  var snapshot = Object.freeze({
    hasBlockingSurfaceOpen: visibleSurfaceIds.length > 0,
    visibleSurfaceIds: visibleSurfaceIds,
  });

  _surfaceObservers.forEach(function (observer) {
    observer(snapshot);
  });
}

export function showBlockingSurface(surfaceId, options) {
  if (!globalThis.document || typeof document.getElementById !== 'function') return null;
  var target = document.getElementById(surfaceId);
  if (!target) return null;

  if (!options || options.rememberTrigger !== false) {
    _rememberBlockingSurfaceTrigger(surfaceId, target);
  }
  _ensureSurfaceDocumentDispatcher();

  _getBlockingSurfaces().forEach(function (surface) {
    if (surface !== target) _setSurfaceVisible(surface, false);
  });

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
  _releaseSurfaceDocumentDispatcherIfIdle();
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

export function getDiagnostics() {
  var visibleBlockingSurfaceIds = Object.freeze(_getVisibleBlockingSurfaceIds());
  var escapeLayers = _getEscapeLayersByPriority();
  var escapeLayerIds = Object.freeze(escapeLayers.map(function (layer) { return layer.id; }));
  var activeEscapeLayerIds = Object.freeze(escapeLayers.filter(_isEscapeLayerActive).map(function (layer) {
    return layer.id;
  }));
  var blockingDismisserIds = Object.freeze(_blockingDismissRegistry.getIds());
  return Object.freeze({
    activeEscapeLayerIds: activeEscapeLayerIds,
    blockingDismisserCount: blockingDismisserIds.length,
    blockingDismisserIds: blockingDismisserIds,
    blockingDismisserOwnerCount: _blockingDismissRegistry.getOwnerCount(),
    dispatcherBound: !!(
      globalThis.document && _surfaceState.dispatcherDocument === document && _surfaceState.dispatcherHandler
    ),
    escapeLayerCount: escapeLayerIds.length,
    escapeLayerIds: escapeLayerIds,
    hasBlockingSurfaceOpen: visibleBlockingSurfaceIds.length > 0,
    observerCount: _surfaceObservers.size,
    returnFocusTargetCount: _returnFocusTargets.size,
    topBlockingSurfaceId: visibleBlockingSurfaceIds.length > 0
      ? visibleBlockingSurfaceIds[visibleBlockingSurfaceIds.length - 1]
      : null,
    visibleBlockingSurfaceIds: visibleBlockingSurfaceIds,
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

/**
 * 注册非阻塞层的 Escape 行为。调用方必须用 isActive 精确声明顶层是否
 * 存在；dispatcher 只处理首个 active 层，避免一次按键穿透多个 surface。
 *
 * @param {string} layerId
 * @param {{priority?: number, dismissible?: boolean, isActive: Function, onEscape?: Function}} options
 * @returns {Function} unregister
 */
export function registerEscapeLayer(layerId, options) {
  var layerOptions = options || {};
  if (!layerId || typeof layerOptions.isActive !== 'function') return function () {};

  var entry = {
    id: layerId,
    priority: Number.isFinite(layerOptions.priority) ? layerOptions.priority : 0,
    sequence: (_surfaceState.escapeSequence || 0) + 1,
    dismissible: layerOptions.dismissible !== false,
    isActive: layerOptions.isActive,
    onEscape: typeof layerOptions.onEscape === 'function' ? layerOptions.onEscape : null,
  };
  _surfaceState.escapeSequence = entry.sequence;
  _escapeLayers.set(layerId, entry);
  _ensureSurfaceDocumentDispatcher();

  return function unregisterEscapeLayer() {
    if (_escapeLayers.get(layerId) === entry) _escapeLayers.delete(layerId);
    _releaseSurfaceDocumentDispatcherIfIdle();
  };
}

/**
 * 为有明确 dispose/destroy 生命周期的 owner 注册阻塞层 dismiss。
 * 每个调用方得到独立、幂等的 release；同一 surface 的首个存活 owner
 * 决定当前策略，释放后自动切换到下一个 owner。
 *
 * @param {string} surfaceId
 * @param {{closeOnBackdrop?: boolean, closeOnEscape?: boolean, onDismiss?: Function}} options
 * @returns {Function} release
 */
export function registerBlockingSurfaceDismiss(surfaceId, options) {
  if (!globalThis.document || typeof document.getElementById !== 'function') return function () {};
  var target = document.getElementById(surfaceId);
  if (!target || !target.dataset) return function () {};
  return _blockingDismissRegistry.register(surfaceId, target, options);
}
