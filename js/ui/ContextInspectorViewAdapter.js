// js/ui/ContextInspectorViewAdapter.js — Inspector DOM、宿主容器、事件与焦点的唯一适配边界

const ROOT_ID = 'context-inspector';
const CONTENT_ID = 'context-inspector-content';
const EMPTY_ID = 'context-inspector-empty';
const HOST_ID = 'context-inspector-render-host';
const TITLE_ID = 'context-inspector-title';
const TOGGLE_SELECTOR = '[data-context-inspector-toggle]';
const CLOSE_SELECTOR = '[data-context-inspector-close]';
const ACTION_SELECTOR = '[data-context-action]';

function _resolveDocument(config, getDocument) {
  if (config && config.document) return config.document;
  if (typeof getDocument === 'function') return getDocument() || null;
  return typeof document !== 'undefined' ? document : null;
}

function _setAttribute(element, name, value) {
  if (element && typeof element.setAttribute === 'function') {
    element.setAttribute(name, String(value));
  }
}

function _focus(element) {
  if (!element || typeof element.focus !== 'function') return false;
  try {
    element.focus({ preventScroll: true });
  } catch (err) {
    element.focus();
  }
  return true;
}

export function createContextInspectorViewAdapter(options) {
  var ports = options || {};
  var getDocument = ports.getDocument;
  var root = null;
  var content = null;
  var empty = null;
  var host = null;
  var title = null;
  var toggles = [];
  var lastToggle = null;
  var closeButton = null;
  var documentPort = null;
  var isOpen = false;
  var onToggle = null;
  var onClose = null;
  var onAction = null;
  var actionDispatchCount = 0;
  var bindCount = 0;
  var disposeCount = 0;
  var emptyRenderCount = 0;
  var hostRequestCount = 0;
  var visibilityChangeCount = 0;

  function _bind(element, datasetKey, eventName, handler) {
    if (!element || typeof element.addEventListener !== 'function') return false;
    if (element.dataset && element.dataset[datasetKey] === 'true') return false;
    element.addEventListener(eventName, handler);
    if (element.dataset) element.dataset[datasetKey] = 'true';
    bindCount += 1;
    return true;
  }

  function _unbind(element, datasetKey, eventName, handler) {
    if (element && typeof element.removeEventListener === 'function') {
      element.removeEventListener(eventName, handler);
    }
    if (element && element.dataset) delete element.dataset[datasetKey];
  }

  function _handleToggle(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    lastToggle = event && event.currentTarget ? event.currentTarget : null;
    if (onToggle) onToggle({ open: isOpen, target: lastToggle });
  }

  function _handleClose(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (onClose) onClose({ target: event && event.currentTarget ? event.currentTarget : null });
  }

  function _handleAction(event) {
    var target = event && event.target && typeof event.target.closest === 'function'
      ? event.target.closest(ACTION_SELECTOR)
      : null;
    if (!target || !host || (typeof host.contains === 'function' && !host.contains(target))) return false;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    actionDispatchCount += 1;
    if (onAction) onAction({
      dataset: target.dataset || {},
      target: target,
    });
    return true;
  }

  function _releaseBindings() {
    toggles.forEach(function (toggle) {
      _unbind(toggle, 'contextInspectorToggleBound', 'click', _handleToggle);
    });
    _unbind(closeButton, 'contextInspectorCloseBound', 'click', _handleClose);
    _unbind(host, 'contextInspectorActionBound', 'click', _handleAction);
  }

  function _clearReferences() {
    root = null;
    content = null;
    empty = null;
    host = null;
    title = null;
    toggles = [];
    lastToggle = null;
    closeButton = null;
    documentPort = null;
    isOpen = false;
  }

  function init(config) {
    var opts = config || {};
    _releaseBindings();
    _clearReferences();
    onToggle = typeof opts.onToggle === 'function' ? opts.onToggle : null;
    onClose = typeof opts.onClose === 'function' ? opts.onClose : null;
    onAction = typeof opts.onAction === 'function' ? opts.onAction : null;
    documentPort = _resolveDocument(opts, getDocument);
    if (!documentPort || typeof documentPort.getElementById !== 'function') return getSnapshot();

    root = documentPort.getElementById(ROOT_ID);
    if (!root) return getSnapshot();
    content = documentPort.getElementById(CONTENT_ID);
    empty = documentPort.getElementById(EMPTY_ID);
    host = documentPort.getElementById(HOST_ID);
    title = documentPort.getElementById(TITLE_ID);
    toggles = typeof documentPort.querySelectorAll === 'function'
      ? Array.from(documentPort.querySelectorAll(TOGGLE_SELECTOR))
      : (typeof documentPort.querySelector === 'function' && documentPort.querySelector(TOGGLE_SELECTOR)
          ? [documentPort.querySelector(TOGGLE_SELECTOR)]
          : []);
    closeButton = typeof root.querySelector === 'function' ? root.querySelector(CLOSE_SELECTOR) : null;

    toggles.forEach(function (toggle) {
      _bind(toggle, 'contextInspectorToggleBound', 'click', _handleToggle);
    });
    _bind(closeButton, 'contextInspectorCloseBound', 'click', _handleClose);
    _bind(host, 'contextInspectorActionBound', 'click', _handleAction);
    isOpen = !(Boolean(root.hidden) || (
      typeof root.getAttribute === 'function' && root.getAttribute('aria-hidden') === 'true'
    ));
    return getSnapshot();
  }

  function setPanelVisible(visible, activeWorkspaceId) {
    if (!root) return false;
    isOpen = !!visible;
    root.hidden = !isOpen;
    root.inert = !isOpen;
    _setAttribute(root, 'aria-hidden', isOpen ? 'false' : 'true');
    toggles.forEach(function (toggle) {
      var toggleWorkspaceId = toggle && toggle.dataset
        ? String(toggle.dataset.contextWorkspace || '').trim()
        : '';
      var ownsActiveWorkspace = !toggleWorkspaceId || toggleWorkspaceId === activeWorkspaceId;
      _setAttribute(toggle, 'aria-expanded', isOpen && ownsActiveWorkspace ? 'true' : 'false');
    });
    if (root.dataset) root.dataset.state = isOpen ? 'open' : 'closed';
    visibilityChangeCount += 1;
    return true;
  }

  function setWorkspaceId(workspaceId) {
    if (!root || !root.dataset) return false;
    root.dataset.workspaceId = workspaceId || '';
    return true;
  }

  function setRestoreFocusTarget(element) {
    lastToggle = element || null;
    return !!lastToggle;
  }

  function focusClose() {
    return _focus(closeButton);
  }

  function restoreFocus() {
    return _focus(lastToggle || toggles[0]);
  }

  function renderEmpty(view) {
    if (!empty || !view) return false;
    var titleElement = typeof empty.querySelector === 'function'
      ? empty.querySelector('[data-context-empty-title]')
      : null;
    var noteElement = typeof empty.querySelector === 'function'
      ? empty.querySelector('[data-context-empty-note]')
      : null;
    if (titleElement) titleElement.textContent = view.title;
    if (noteElement) noteElement.textContent = view.note;
    empty.hidden = false;
    if (host) host.hidden = true;
    emptyRenderCount += 1;
    return true;
  }

  function showHost() {
    if (empty) empty.hidden = true;
    if (host) host.hidden = false;
    return !!host;
  }

  function getRendererContainer(workspaceId) {
    hostRequestCount += 1;
    if (!host) return content;
    var workspaceViews = typeof host.querySelectorAll === 'function'
      ? Array.from(host.querySelectorAll('[data-context-workspace-view]'))
      : [];
    var planetPanel = typeof host.querySelector === 'function'
      ? host.querySelector('#planet-detail-panel')
      : null;

    if (workspaceId === 'map') {
      workspaceViews.forEach(function (view) { view.hidden = true; });
      if (planetPanel) planetPanel.hidden = false;
      return planetPanel || host;
    }

    if (planetPanel) planetPanel.hidden = true;
    var view = workspaceViews.find(function (candidate) {
      return candidate && candidate.dataset && candidate.dataset.contextWorkspaceView === workspaceId;
    });
    if (!view && documentPort && typeof documentPort.createElement === 'function' &&
      typeof host.appendChild === 'function') {
      view = documentPort.createElement('div');
      view.className = 'context-workspace-view context-workspace-view--' + workspaceId;
      view.dataset.contextWorkspaceView = workspaceId;
      host.appendChild(view);
    }
    workspaceViews.forEach(function (candidate) { candidate.hidden = candidate !== view; });
    if (view) view.hidden = false;
    return view || host;
  }

  function applyShellView(view) {
    if (!view) return false;
    if (title) title.textContent = view.title;
    if (root && root.dataset) {
      root.dataset.contextType = view.contextType;
      root.dataset.contextId = view.contextId;
      root.dataset.contentState = view.contextId ? 'context' : 'empty';
      root.dataset.rendererState = view.rendererState;
    }
    return true;
  }

  function getSnapshot() {
    return Object.freeze({
      initialized: !!root,
      open: !!(root && isOpen),
    });
  }

  function getDiagnostics() {
    return Object.freeze({
      actionDispatchCount: actionDispatchCount,
      bindCount: bindCount,
      disposeCount: disposeCount,
      emptyRenderCount: emptyRenderCount,
      hostRequestCount: hostRequestCount,
      initialized: !!root,
      open: !!(root && isOpen),
      visibilityChangeCount: visibilityChangeCount,
    });
  }

  function dispose() {
    var hadRuntime = !!(root || documentPort);
    _releaseBindings();
    _clearReferences();
    onToggle = null;
    onClose = null;
    onAction = null;
    if (hadRuntime) disposeCount += 1;
    return hadRuntime;
  }

  return Object.freeze({
    applyShellView: applyShellView,
    dispose: dispose,
    focusClose: focusClose,
    getDiagnostics: getDiagnostics,
    getRendererContainer: getRendererContainer,
    getSnapshot: getSnapshot,
    init: init,
    renderEmpty: renderEmpty,
    restoreFocus: restoreFocus,
    setPanelVisible: setPanelVisible,
    setRestoreFocusTarget: setRestoreFocusTarget,
    setWorkspaceId: setWorkspaceId,
    showHost: showHost,
  });
}
