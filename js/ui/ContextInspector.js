// js/ui/ContextInspector.js — workspace-scoped context protocol and shell
//
// The inspector owns context keys, never domain objects. Renderers resolve the
// latest domain state through the provider on every render.

import * as EventBus from '../core/EventBus.js';
import { registerEscapeLayer } from './SurfaceManager.js';

const ROOT_ID = 'context-inspector';
const CONTENT_ID = 'context-inspector-content';
const EMPTY_ID = 'context-inspector-empty';
const HOST_ID = 'context-inspector-render-host';
const TITLE_ID = 'context-inspector-title';
const TOGGLE_SELECTOR = '[data-context-inspector-toggle]';
const CLOSE_SELECTOR = '[data-context-inspector-close]';
const ACTION_SELECTOR = '[data-context-action]';
const DEFAULT_WORKSPACE_ID = 'map';
const RAIL_EVENT = 'starmap-rail:panel-open';
const RAIL_SOURCE = 'context-inspector';
const CONTEXT_FIELDS = ['type', 'id', 'workspaceId', 'source', 'revision'];

let _root = null;
let _content = null;
let _empty = null;
let _host = null;
let _title = null;
let _toggles = [];
let _lastToggle = null;
let _closeButton = null;
let _activeWorkspaceId = DEFAULT_WORKSPACE_ID;
let _contextsByWorkspace = new Map();
let _renderersByWorkspace = new Map();
let _openByWorkspace = new Map();
let _getState = function () { return null; };
let _getRevision = function () { return null; };
let _isOpen = false;
let _railListenerBound = false;
let _railListener = null;
let _releaseEscapeLayer = null;
let _document = null;
let _compactMode = false;
let _currentActionHandler = null;

function _getDocument(options) {
  if (options && options.document) return options.document;
  return typeof document !== 'undefined' ? document : null;
}

function _normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _normalizeWorkspaceId(value) {
  return _normalizeString(value) || DEFAULT_WORKSPACE_ID;
}

function _readCurrentRevision() {
  var value = _getRevision();
  if (value === null || typeof value === 'undefined' || value === '') return null;
  var revision = Number(value);
  return Number.isFinite(revision) ? revision : null;
}

function _copyContext(context) {
  if (!context) return null;
  var copy = {};
  CONTEXT_FIELDS.forEach(function (field) { copy[field] = context[field]; });
  return Object.freeze(copy);
}

function _normalizeContext(context, fallbackWorkspaceId) {
  if (!context || typeof context !== 'object') return null;
  var type = _normalizeString(context.type);
  var id = _normalizeString(context.id);
  if (!type || !id) return null;

  return Object.freeze({
    type: type,
    id: id,
    workspaceId: _normalizeWorkspaceId(context.workspaceId || fallbackWorkspaceId),
    source: _normalizeString(context.source) || 'unknown',
    revision: Number.isFinite(Number(context.revision)) ? Number(context.revision) : 0,
  });
}

function _setAttribute(element, name, value) {
  if (element && typeof element.setAttribute === 'function') {
    element.setAttribute(name, String(value));
  }
}

function _setPanelVisible(visible, options) {
  if (!_root) return;
  _isOpen = !!visible;
  if (!options || options.remember !== false) {
    _openByWorkspace.set(_activeWorkspaceId, _isOpen);
  }
  _root.hidden = !_isOpen;
  _root.inert = !_isOpen;
  _setAttribute(_root, 'aria-hidden', _isOpen ? 'false' : 'true');
  _toggles.forEach(function (toggle) {
    var toggleWorkspaceId = toggle && toggle.dataset
      ? _normalizeString(toggle.dataset.contextWorkspace)
      : '';
    var ownsActiveWorkspace = !toggleWorkspaceId || toggleWorkspaceId === _activeWorkspaceId;
    _setAttribute(toggle, 'aria-expanded', _isOpen && ownsActiveWorkspace ? 'true' : 'false');
  });
  if (_root.dataset) _root.dataset.state = _isOpen ? 'open' : 'closed';
}

function _focusElement(element) {
  if (!element || typeof element.focus !== 'function') return;
  try {
    element.focus({ preventScroll: true });
  } catch (err) {
    element.focus();
  }
}

function _renderEmpty(context) {
  if (!_empty) return;
  var hasContext = !!context;
  var title = hasContext ? '此工作区尚未接入详情' : '尚未选择上下文';
  var note = hasContext
    ? '当前选择已记录；详情适配器接入后会显示在这里。'
    : '在当前工作区选择对象后，这里会显示对应信息。';
  var titleElement = typeof _empty.querySelector === 'function'
    ? _empty.querySelector('[data-context-empty-title]')
    : null;
  var noteElement = typeof _empty.querySelector === 'function'
    ? _empty.querySelector('[data-context-empty-note]')
    : null;
  if (titleElement) titleElement.textContent = title;
  if (noteElement) noteElement.textContent = note;
  _empty.hidden = false;
  if (_host) _host.hidden = true;
}

function _getRendererContainer(workspaceId) {
  if (!_host) return _content;
  var workspaceViews = typeof _host.querySelectorAll === 'function'
    ? Array.from(_host.querySelectorAll('[data-context-workspace-view]'))
    : [];
  var planetPanel = typeof _host.querySelector === 'function'
    ? _host.querySelector('#planet-detail-panel')
    : null;

  if (workspaceId === 'map') {
    workspaceViews.forEach(function (view) { view.hidden = true; });
    if (planetPanel) planetPanel.hidden = false;
    return planetPanel || _host;
  }

  if (planetPanel) planetPanel.hidden = true;
  var view = workspaceViews.find(function (candidate) {
    return candidate && candidate.dataset && candidate.dataset.contextWorkspaceView === workspaceId;
  });
  if (!view && _document && typeof _document.createElement === 'function' && typeof _host.appendChild === 'function') {
    view = _document.createElement('div');
    view.className = 'context-workspace-view context-workspace-view--' + workspaceId;
    view.dataset.contextWorkspaceView = workspaceId;
    _host.appendChild(view);
  }
  workspaceViews.forEach(function (candidate) { candidate.hidden = candidate !== view; });
  if (view) view.hidden = false;
  return view || _host;
}

function _handleToggleClick(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  _lastToggle = event && event.currentTarget ? event.currentTarget : null;
  if (_isOpen) close({ restoreFocus: false });
  else open();
}

function _handleCloseClick(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  close({ restoreFocus: true });
}

function _handleContextAction(event) {
  var target = event && event.target && typeof event.target.closest === 'function'
    ? event.target.closest(ACTION_SELECTOR)
    : null;
  if (!target || !_host || (typeof _host.contains === 'function' && !_host.contains(target))) return;
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (typeof _currentActionHandler !== 'function') return;
  _currentActionHandler({
    action: target.dataset ? target.dataset.contextAction || '' : '',
    context: getContext(_activeWorkspaceId),
    dataset: target.dataset || {},
    state: _getState(),
    target: target,
    workspaceId: _activeWorkspaceId,
  });
}

function _bindElement(element, datasetKey, eventName, handler) {
  if (!element || typeof element.addEventListener !== 'function') return;
  if (element.dataset && element.dataset[datasetKey] === 'true') return;
  element.addEventListener(eventName, handler);
  if (element.dataset) element.dataset[datasetKey] = 'true';
}

function _bindRailListener() {
  if (_railListenerBound) return;
  _railListener = function (data) {
    if (data && data.source === RAIL_SOURCE) return;
    close({ restoreFocus: false });
  };
  EventBus.on(RAIL_EVENT, _railListener);
  _railListenerBound = true;
}

/** Initialize the shell. State may be an object or a latest-state provider. */
export function init(options) {
  var opts = options || {};
  var doc = _getDocument(opts);
  _document = doc;
  _compactMode = !!opts.compact;
  if (Object.prototype.hasOwnProperty.call(opts, 'stateSource')) {
    _getState = typeof opts.stateSource === 'function'
      ? opts.stateSource
      : function () { return opts.stateSource || null; };
  }
  if (Object.prototype.hasOwnProperty.call(opts, 'revisionSource')) {
    _getRevision = typeof opts.revisionSource === 'function'
      ? opts.revisionSource
      : function () { return opts.revisionSource; };
  }

  if (!doc || typeof doc.getElementById !== 'function') {
    _root = null;
    _content = null;
    _empty = null;
    _host = null;
    _title = null;
    _toggles = [];
    _lastToggle = null;
    _closeButton = null;
    _isOpen = false;
    _document = null;
    return getSnapshot();
  }

  _root = doc.getElementById(ROOT_ID);
  if (!_root) {
    _content = null;
    _empty = null;
    _host = null;
    _title = null;
    _toggles = [];
    _lastToggle = null;
    _closeButton = null;
    _isOpen = false;
    return getSnapshot();
  }

  _content = doc.getElementById(CONTENT_ID);
  _empty = doc.getElementById(EMPTY_ID);
  _host = doc.getElementById(HOST_ID);
  _title = doc.getElementById(TITLE_ID);
  _toggles = typeof doc.querySelectorAll === 'function'
    ? Array.from(doc.querySelectorAll(TOGGLE_SELECTOR))
    : (typeof doc.querySelector === 'function' && doc.querySelector(TOGGLE_SELECTOR)
        ? [doc.querySelector(TOGGLE_SELECTOR)]
        : []);
  _closeButton = typeof _root.querySelector === 'function' ? _root.querySelector(CLOSE_SELECTOR) : null;

  _toggles.forEach(function (toggle) {
    _bindElement(toggle, 'contextInspectorToggleBound', 'click', _handleToggleClick);
  });
  _bindElement(_closeButton, 'contextInspectorCloseBound', 'click', _handleCloseClick);
  _bindElement(_host, 'contextInspectorActionBound', 'click', _handleContextAction);
  if (_releaseEscapeLayer) _releaseEscapeLayer();
  _releaseEscapeLayer = registerEscapeLayer('context-inspector', {
    priority: 20,
    isActive: function () { return !!(_root && _isOpen); },
    onEscape: function () { close({ restoreFocus: true }); },
  });
  _bindRailListener();

  var shouldOpen = typeof opts.open === 'boolean'
    ? opts.open
    : !(Boolean(_root.hidden) || (
      typeof _root.getAttribute === 'function' && _root.getAttribute('aria-hidden') === 'true'
    ));
  activateWorkspace(opts.workspaceId || _activeWorkspaceId || DEFAULT_WORKSPACE_ID, {
    render: false,
    syncOpen: false,
  });
  render();
  _setPanelVisible(shouldOpen);
  return getSnapshot();
}

export function open(options) {
  if (!_root) return getSnapshot();
  var opts = options || {};
  if (opts.workspaceId) activateWorkspace(opts.workspaceId);
  if (opts.restoreFocusTo) _lastToggle = opts.restoreFocusTo;
  _setPanelVisible(true);
  if (opts.notifyRail !== false) {
    EventBus.emit(RAIL_EVENT, { source: RAIL_SOURCE, panelId: ROOT_ID });
  }
  if (opts.focus !== false) _focusElement(_closeButton);
  return getSnapshot();
}

export function close(options) {
  if (!_root) return getSnapshot();
  _setPanelVisible(false);
  if (!options || options.restoreFocus !== false) _focusElement(_lastToggle || _toggles[0]);
  return getSnapshot();
}

/** Switch workspace without discarding that workspace's last context key. */
export function activateWorkspace(workspaceId, options) {
  var nextWorkspaceId = _normalizeWorkspaceId(workspaceId);
  var isWorkspaceChange = nextWorkspaceId !== _activeWorkspaceId;
  if (_root && isWorkspaceChange) _openByWorkspace.set(_activeWorkspaceId, _isOpen);
  _activeWorkspaceId = nextWorkspaceId;
  if (_root && _root.dataset) _root.dataset.workspaceId = _activeWorkspaceId;
  if (!options || options.render !== false) render();
  if (_root && (!options || options.syncOpen !== false)) {
    var hasPreference = _openByWorkspace.has(_activeWorkspaceId);
    var hasRenderer = _renderersByWorkspace.has(_activeWorkspaceId);
    var defaultOpen = !_compactMode && hasRenderer && _activeWorkspaceId !== 'logs';
    _setPanelVisible(hasPreference ? _openByWorkspace.get(_activeWorkspaceId) === true : defaultOpen, {
      remember: hasPreference,
    });
  }
  return getSnapshot();
}

/** Replace a workspace context with a normalized immutable key. */
export function replaceContext(context, options) {
  var opts = options || {};
  var workspaceId = _normalizeWorkspaceId(
    (context && context.workspaceId) || opts.workspaceId || _activeWorkspaceId
  );
  var normalized = _normalizeContext(context, workspaceId);
  if (!normalized) return clearContext(workspaceId, opts);
  _contextsByWorkspace.set(workspaceId, normalized);
  if (workspaceId === _activeWorkspaceId && opts.render !== false) render();
  return _copyContext(normalized);
}

export function clearContext(workspaceId, options) {
  var targetWorkspaceId = _normalizeWorkspaceId(workspaceId || _activeWorkspaceId);
  _contextsByWorkspace.delete(targetWorkspaceId);
  if (targetWorkspaceId === _activeWorkspaceId && (!options || options.render !== false)) render();
  return null;
}

export function getContext(workspaceId) {
  return _copyContext(_contextsByWorkspace.get(_normalizeWorkspaceId(workspaceId || _activeWorkspaceId)) || null);
}

export function getCurrentRevision() {
  var revision = _readCurrentRevision();
  return revision === null ? 0 : revision;
}

/**
 * Context keys belong to one StateSession revision. After a save is loaded,
 * stale selections are dropped before any renderer can resolve them against
 * the new state object.
 */
export function reconcileRevision(revision, options) {
  var nextRevision = Number.isFinite(Number(revision)) ? Number(revision) : null;
  var changed = [];
  _contextsByWorkspace.forEach(function (context, workspaceId) {
    if (nextRevision === null || context.revision !== nextRevision) {
      _contextsByWorkspace.delete(workspaceId);
      changed.push(workspaceId);
    }
  });
  if (changed.indexOf(_activeWorkspaceId) !== -1 && (!options || options.render !== false)) render();
  return changed;
}

/** Register a renderer/adapter for a workspace. Returns an unregister callback. */
export function registerRenderer(workspaceId, renderer) {
  var normalizedWorkspaceId = _normalizeWorkspaceId(workspaceId);
  if (typeof renderer !== 'function') {
    _renderersByWorkspace.delete(normalizedWorkspaceId);
    if (normalizedWorkspaceId === _activeWorkspaceId) render();
    return function () {};
  }
  _renderersByWorkspace.set(normalizedWorkspaceId, renderer);
  if (normalizedWorkspaceId === _activeWorkspaceId) {
    render();
    if (!_openByWorkspace.has(normalizedWorkspaceId) && !_compactMode && normalizedWorkspaceId !== 'logs') {
      _setPanelVisible(true, { remember: false });
    }
  }
  return function () {
    if (_renderersByWorkspace.get(normalizedWorkspaceId) === renderer) {
      _renderersByWorkspace.delete(normalizedWorkspaceId);
      if (normalizedWorkspaceId === _activeWorkspaceId) render();
    }
  };
}

export const registerAdapter = registerRenderer;

/** Resolve latest state, then delegate the active context key to its renderer. */
export function render() {
  _currentActionHandler = null;
  var context = getContext(_activeWorkspaceId);
  var currentRevision = _readCurrentRevision();
  if (context && currentRevision !== null && context.revision !== currentRevision) {
    _contextsByWorkspace.delete(_activeWorkspaceId);
    context = null;
  }
  var renderer = _renderersByWorkspace.get(_activeWorkspaceId);
  if (_title) _title.textContent = _activeWorkspaceId === 'map' ? '地图上下文' : '当前上下文';
  if (_root && _root.dataset) {
    _root.dataset.contextType = context ? context.type : '';
    _root.dataset.contextId = context ? context.id : '';
    _root.dataset.rendererState = renderer ? 'ready' : 'missing';
  }

  if (typeof renderer !== 'function') {
    _renderEmpty(context);
    return getSnapshot();
  }

  var state = _getState();
  if (_empty) _empty.hidden = true;
  if (_host) _host.hidden = false;
  var rendererContainer = _getRendererContainer(_activeWorkspaceId);
  var result = renderer({
    workspaceId: _activeWorkspaceId,
    context: context,
    state: state,
    container: rendererContainer,
  });
  if (result === false) {
    if (context) _contextsByWorkspace.delete(_activeWorkspaceId);
    _renderEmpty(null);
  } else if (result && result.title && _title) {
    _title.textContent = String(result.title);
  }
  if (result && typeof result.onAction === 'function') {
    _currentActionHandler = result.onAction;
  }
  return getSnapshot();
}

export function getSnapshot() {
  var contexts = {};
  _contextsByWorkspace.forEach(function (context, workspaceId) {
    contexts[workspaceId] = _copyContext(context);
  });
  return {
    initialized: !!_root,
    open: !!(_root && _isOpen),
    activeWorkspaceId: _activeWorkspaceId,
    context: getContext(_activeWorkspaceId),
    contexts: contexts,
    rendererRegistered: _renderersByWorkspace.has(_activeWorkspaceId),
  };
}

/** 释放 Inspector shell 的 DOM/EventBus/Escape/adapter 所有权。 */
export function dispose() {
  var hadRuntime = !!(
    _root || _document || _railListenerBound || _releaseEscapeLayer ||
    _renderersByWorkspace.size || _contextsByWorkspace.size
  );

  _toggles.forEach(function (toggle) {
    if (toggle && typeof toggle.removeEventListener === 'function') {
      toggle.removeEventListener('click', _handleToggleClick);
    }
    if (toggle && toggle.dataset) delete toggle.dataset.contextInspectorToggleBound;
  });
  if (_closeButton && typeof _closeButton.removeEventListener === 'function') {
    _closeButton.removeEventListener('click', _handleCloseClick);
  }
  if (_closeButton && _closeButton.dataset) delete _closeButton.dataset.contextInspectorCloseBound;
  if (_host && typeof _host.removeEventListener === 'function') {
    _host.removeEventListener('click', _handleContextAction);
  }
  if (_host && _host.dataset) delete _host.dataset.contextInspectorActionBound;
  if (_railListenerBound && _railListener) EventBus.off(RAIL_EVENT, _railListener);
  if (_releaseEscapeLayer) _releaseEscapeLayer();

  _root = null;
  _content = null;
  _empty = null;
  _host = null;
  _title = null;
  _toggles = [];
  _lastToggle = null;
  _closeButton = null;
  _activeWorkspaceId = DEFAULT_WORKSPACE_ID;
  _contextsByWorkspace = new Map();
  _renderersByWorkspace = new Map();
  _openByWorkspace = new Map();
  _getState = function () { return null; };
  _getRevision = function () { return null; };
  _isOpen = false;
  _railListenerBound = false;
  _railListener = null;
  _releaseEscapeLayer = null;
  _document = null;
  _compactMode = false;
  _currentActionHandler = null;
  return hadRuntime;
}
