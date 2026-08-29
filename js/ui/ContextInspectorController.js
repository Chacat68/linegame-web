// js/ui/ContextInspectorController.js — Context Inspector DOM、renderer 宿主、动作与 Escape owner

import { registerEscapeLayer as registerDefaultEscapeLayer } from './SurfaceManager.js';
import { createContextInspectorSession } from './ContextInspectorSession.js';
import {
  getContextInspectorEmptyView,
  getContextInspectorShellView,
} from './ContextInspectorPresenter.js';

const ROOT_ID = 'context-inspector';
const CONTENT_ID = 'context-inspector-content';
const EMPTY_ID = 'context-inspector-empty';
const HOST_ID = 'context-inspector-render-host';
const TITLE_ID = 'context-inspector-title';
const TOGGLE_SELECTOR = '[data-context-inspector-toggle]';
const CLOSE_SELECTOR = '[data-context-inspector-close]';
const ACTION_SELECTOR = '[data-context-action]';

export function createContextInspectorController(options) {
  var ports = options || {};
  var session = ports.session || createContextInspectorSession();
  var registerEscapeLayer = ports.registerEscapeLayer || registerDefaultEscapeLayer;
  var root = null;
  var content = null;
  var empty = null;
  var host = null;
  var title = null;
  var toggles = [];
  var lastToggle = null;
  var closeButton = null;
  var renderersByWorkspace = new Map();
  var getState = function () { return null; };
  var isOpen = false;
  var releaseEscapeLayer = null;
  var documentPort = null;
  var currentActionHandler = null;

  function getDocument(config) {
    if (config && config.document) return config.document;
    return typeof document !== 'undefined' ? document : null;
  }

  function setAttribute(element, name, value) {
    if (element && typeof element.setAttribute === 'function') {
      element.setAttribute(name, String(value));
    }
  }

  function getActiveWorkspaceId() {
    return session.getSnapshot().activeWorkspaceId;
  }

  function setPanelVisible(visible, config) {
    if (!root) return;
    isOpen = !!visible;
    var activeWorkspaceId = getActiveWorkspaceId();
    if (!config || config.remember !== false) session.rememberOpen(isOpen, activeWorkspaceId);
    root.hidden = !isOpen;
    root.inert = !isOpen;
    setAttribute(root, 'aria-hidden', isOpen ? 'false' : 'true');
    toggles.forEach(function (toggle) {
      var toggleWorkspaceId = toggle && toggle.dataset
        ? String(toggle.dataset.contextWorkspace || '').trim()
        : '';
      var ownsActiveWorkspace = !toggleWorkspaceId || toggleWorkspaceId === activeWorkspaceId;
      setAttribute(toggle, 'aria-expanded', isOpen && ownsActiveWorkspace ? 'true' : 'false');
    });
    if (root.dataset) root.dataset.state = isOpen ? 'open' : 'closed';
  }

  function focusElement(element) {
    if (!element || typeof element.focus !== 'function') return;
    try {
      element.focus({ preventScroll: true });
    } catch (err) {
      element.focus();
    }
  }

  function renderEmpty(context) {
    if (!empty) return;
    var view = getContextInspectorEmptyView(context);
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
  }

  function getRendererContainer(workspaceId) {
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
    if (!view && documentPort && typeof documentPort.createElement === 'function' && typeof host.appendChild === 'function') {
      view = documentPort.createElement('div');
      view.className = 'context-workspace-view context-workspace-view--' + workspaceId;
      view.dataset.contextWorkspaceView = workspaceId;
      host.appendChild(view);
    }
    workspaceViews.forEach(function (candidate) { candidate.hidden = candidate !== view; });
    if (view) view.hidden = false;
    return view || host;
  }

  function handleToggleClick(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    lastToggle = event && event.currentTarget ? event.currentTarget : null;
    if (isOpen) close({ restoreFocus: false });
    else open();
  }

  function handleCloseClick(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    close({ restoreFocus: true });
  }

  function handleContextAction(event) {
    var target = event && event.target && typeof event.target.closest === 'function'
      ? event.target.closest(ACTION_SELECTOR)
      : null;
    if (!target || !host || (typeof host.contains === 'function' && !host.contains(target))) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof currentActionHandler !== 'function') return;
    var workspaceId = getActiveWorkspaceId();
    currentActionHandler({
      action: target.dataset ? target.dataset.contextAction || '' : '',
      context: session.getContext(workspaceId),
      dataset: target.dataset || {},
      state: getState(),
      target: target,
      workspaceId: workspaceId,
    });
  }

  function bindElement(element, datasetKey, eventName, handler) {
    if (!element || typeof element.addEventListener !== 'function') return;
    if (element.dataset && element.dataset[datasetKey] === 'true') return;
    element.addEventListener(eventName, handler);
    if (element.dataset) element.dataset[datasetKey] = 'true';
  }

  function clearDomReferences() {
    root = null;
    content = null;
    empty = null;
    host = null;
    title = null;
    toggles = [];
    lastToggle = null;
    closeButton = null;
    isOpen = false;
  }

  function init(config) {
    var opts = config || {};
    session.configure(opts);
    documentPort = getDocument(opts);
    if (Object.prototype.hasOwnProperty.call(opts, 'stateSource')) {
      getState = typeof opts.stateSource === 'function'
        ? opts.stateSource
        : function () { return opts.stateSource || null; };
    }

    if (!documentPort || typeof documentPort.getElementById !== 'function') {
      clearDomReferences();
      documentPort = null;
      return getSnapshot();
    }

    root = documentPort.getElementById(ROOT_ID);
    if (!root) {
      clearDomReferences();
      return getSnapshot();
    }

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
      bindElement(toggle, 'contextInspectorToggleBound', 'click', handleToggleClick);
    });
    bindElement(closeButton, 'contextInspectorCloseBound', 'click', handleCloseClick);
    bindElement(host, 'contextInspectorActionBound', 'click', handleContextAction);
    if (releaseEscapeLayer) releaseEscapeLayer();
    releaseEscapeLayer = registerEscapeLayer('context-inspector', {
      priority: 20,
      isActive: function () { return !!(root && isOpen); },
      onEscape: function () { close({ restoreFocus: true }); },
    });
    var shouldOpen = typeof opts.open === 'boolean'
      ? opts.open
      : !(Boolean(root.hidden) || (
        typeof root.getAttribute === 'function' && root.getAttribute('aria-hidden') === 'true'
      ));
    activateWorkspace(opts.workspaceId || getActiveWorkspaceId(), {
      render: false,
      syncOpen: false,
    });
    render();
    setPanelVisible(shouldOpen);
    return getSnapshot();
  }

  function open(config) {
    if (!root) return getSnapshot();
    var opts = config || {};
    if (opts.workspaceId) activateWorkspace(opts.workspaceId);
    if (opts.restoreFocusTo) lastToggle = opts.restoreFocusTo;
    setPanelVisible(true);
    if (opts.focus !== false) focusElement(closeButton);
    return getSnapshot();
  }

  function close(config) {
    if (!root) return getSnapshot();
    setPanelVisible(false);
    if (!config || config.restoreFocus !== false) focusElement(lastToggle || toggles[0]);
    return getSnapshot();
  }

  function setCompactMode(compact, config) {
    session.configure({ compact: compact === true });
    if (root && (!config || config.syncOpen !== false)) {
      var activeWorkspaceId = getActiveWorkspaceId();
      var openProjection = session.getOpenProjection(
        renderersByWorkspace.has(activeWorkspaceId),
        activeWorkspaceId
      );
      setPanelVisible(openProjection.open, { remember: false });
    }
    return getSnapshot();
  }

  function activateWorkspace(workspaceId, config) {
    var opts = config || {};
    session.activateWorkspace(workspaceId, root ? isOpen : undefined);
    var activeWorkspaceId = getActiveWorkspaceId();
    if (root && root.dataset) root.dataset.workspaceId = activeWorkspaceId;
    if (opts.render !== false) render();
    if (root && opts.syncOpen !== false) {
      var openProjection = session.getOpenProjection(renderersByWorkspace.has(activeWorkspaceId), activeWorkspaceId);
      setPanelVisible(openProjection.open, { remember: openProjection.hasPreference });
    }
    return getSnapshot();
  }

  function replaceContext(context, config) {
    var opts = config || {};
    var activeWorkspaceId = getActiveWorkspaceId();
    var workspaceId = session.normalizeWorkspaceId(
      (context && context.workspaceId) || opts.workspaceId || activeWorkspaceId
    );
    var result = session.replaceContext(context, workspaceId);
    if (workspaceId === activeWorkspaceId && opts.render !== false) render();
    return result;
  }

  function clearContext(workspaceId, config) {
    var targetWorkspaceId = session.normalizeWorkspaceId(workspaceId || getActiveWorkspaceId());
    session.clearContext(targetWorkspaceId);
    if (targetWorkspaceId === getActiveWorkspaceId() && (!config || config.render !== false)) render();
    return null;
  }

  function reconcileRevision(revision, config) {
    var changed = session.reconcileRevision(revision);
    if (changed.indexOf(getActiveWorkspaceId()) !== -1 && (!config || config.render !== false)) render();
    return changed;
  }

  function registerRenderer(workspaceId, renderer) {
    var normalizedWorkspaceId = session.normalizeWorkspaceId(workspaceId);
    if (typeof renderer !== 'function') {
      renderersByWorkspace.delete(normalizedWorkspaceId);
      if (normalizedWorkspaceId === getActiveWorkspaceId()) render();
      return function () {};
    }
    renderersByWorkspace.set(normalizedWorkspaceId, renderer);
    if (normalizedWorkspaceId === getActiveWorkspaceId()) {
      render();
      var openProjection = session.getOpenProjection(true, normalizedWorkspaceId);
      if (!openProjection.hasPreference && openProjection.open) {
        setPanelVisible(true, { remember: false });
      }
    }
    return function () {
      if (renderersByWorkspace.get(normalizedWorkspaceId) === renderer) {
        renderersByWorkspace.delete(normalizedWorkspaceId);
        if (normalizedWorkspaceId === getActiveWorkspaceId()) render();
      }
    };
  }

  function applyShellView(context, renderer, rendererResult) {
    var view = getContextInspectorShellView({
      workspaceId: getActiveWorkspaceId(),
      context: context,
      rendererRegistered: typeof renderer === 'function',
      rendererResult: rendererResult,
    });
    if (title) title.textContent = view.title;
    if (root && root.dataset) {
      root.dataset.contextType = view.contextType;
      root.dataset.contextId = view.contextId;
      root.dataset.contentState = view.contextId ? 'context' : 'empty';
      root.dataset.rendererState = view.rendererState;
    }
  }

  function render() {
    currentActionHandler = null;
    var activeWorkspaceId = getActiveWorkspaceId();
    var context = session.resolveActiveContext();
    var renderer = renderersByWorkspace.get(activeWorkspaceId);
    applyShellView(context, renderer, null);
    if (typeof renderer !== 'function') {
      renderEmpty(context);
      return getSnapshot();
    }

    if (empty) empty.hidden = true;
    if (host) host.hidden = false;
    var result = renderer({
      workspaceId: activeWorkspaceId,
      context: context,
      state: getState(),
      container: getRendererContainer(activeWorkspaceId),
    });
    if (result === false) {
      session.clearContext(activeWorkspaceId);
      context = null;
      renderEmpty(null);
    }
    applyShellView(context, renderer, result);
    if (result && typeof result.onAction === 'function') currentActionHandler = result.onAction;
    return getSnapshot();
  }

  function getSnapshot() {
    var sessionSnapshot = session.getSnapshot();
    return {
      initialized: !!root,
      open: !!(root && isOpen),
      activeWorkspaceId: sessionSnapshot.activeWorkspaceId,
      context: sessionSnapshot.context,
      contexts: sessionSnapshot.contexts,
      rendererRegistered: renderersByWorkspace.has(sessionSnapshot.activeWorkspaceId),
    };
  }

  function dispose() {
    var hadRuntime = !!(
      root || documentPort || releaseEscapeLayer ||
      renderersByWorkspace.size || session.hasContexts()
    );
    toggles.forEach(function (toggle) {
      if (toggle && typeof toggle.removeEventListener === 'function') {
        toggle.removeEventListener('click', handleToggleClick);
      }
      if (toggle && toggle.dataset) delete toggle.dataset.contextInspectorToggleBound;
    });
    if (closeButton && typeof closeButton.removeEventListener === 'function') {
      closeButton.removeEventListener('click', handleCloseClick);
    }
    if (closeButton && closeButton.dataset) delete closeButton.dataset.contextInspectorCloseBound;
    if (host && typeof host.removeEventListener === 'function') {
      host.removeEventListener('click', handleContextAction);
    }
    if (host && host.dataset) delete host.dataset.contextInspectorActionBound;
    if (releaseEscapeLayer) releaseEscapeLayer();

    clearDomReferences();
    renderersByWorkspace = new Map();
    getState = function () { return null; };
    releaseEscapeLayer = null;
    documentPort = null;
    currentActionHandler = null;
    session.reset();
    return hadRuntime;
  }

  return Object.freeze({
    activateWorkspace: activateWorkspace,
    clearContext: clearContext,
    close: close,
    dispose: dispose,
    getContext: session.getContext,
    getCurrentRevision: session.getCurrentRevision,
    getSnapshot: getSnapshot,
    init: init,
    open: open,
    reconcileRevision: reconcileRevision,
    registerRenderer: registerRenderer,
    render: render,
    replaceContext: replaceContext,
    setCompactMode: setCompactMode,
  });
}
