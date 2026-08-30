// js/ui/ContextInspectorController.js — Context/renderer 会话、动作与 Escape 编排 owner

import { registerEscapeLayer as registerDefaultEscapeLayer } from './SurfaceManager.js';
import { createContextInspectorSession } from './ContextInspectorSession.js';
import {
  getContextInspectorEmptyView,
  getContextInspectorShellView,
} from './ContextInspectorPresenter.js';
import { createContextInspectorViewAdapter } from './ContextInspectorViewAdapter.js';

export function createContextInspectorController(options) {
  var ports = options || {};
  var session = ports.session || createContextInspectorSession();
  var view = ports.viewAdapter || createContextInspectorViewAdapter();
  var registerEscapeLayer = ports.registerEscapeLayer || registerDefaultEscapeLayer;
  var renderersByWorkspace = new Map();
  var getState = function () { return null; };
  var releaseEscapeLayer = null;
  var currentActionHandler = null;

  function getActiveWorkspaceId() {
    return session.getSnapshot().activeWorkspaceId;
  }

  function _viewSnapshot() {
    return view && typeof view.getSnapshot === 'function'
      ? view.getSnapshot()
      : { initialized: false, open: false };
  }

  function setPanelVisible(visible, config) {
    var snapshot = _viewSnapshot();
    if (!snapshot.initialized) return false;
    var activeWorkspaceId = getActiveWorkspaceId();
    if (!config || config.remember !== false) session.rememberOpen(!!visible, activeWorkspaceId);
    return view.setPanelVisible(!!visible, activeWorkspaceId);
  }

  function handleToggle(request) {
    if (request && request.open) close({ restoreFocus: false });
    else open();
  }

  function handleClose() {
    close({ restoreFocus: true });
  }

  function handleContextAction(request) {
    if (typeof currentActionHandler !== 'function') return false;
    var workspaceId = getActiveWorkspaceId();
    var input = request || {};
    currentActionHandler({
      action: input.dataset ? input.dataset.contextAction || '' : '',
      context: session.getContext(workspaceId),
      dataset: input.dataset || {},
      state: getState(),
      target: input.target || null,
      workspaceId: workspaceId,
    });
    return true;
  }

  function init(config) {
    var opts = config || {};
    session.configure(opts);
    if (Object.prototype.hasOwnProperty.call(opts, 'stateSource')) {
      getState = typeof opts.stateSource === 'function'
        ? opts.stateSource
        : function () { return opts.stateSource || null; };
    }

    var viewSnapshot = view.init({
      document: opts.document,
      onAction: handleContextAction,
      onClose: handleClose,
      onToggle: handleToggle,
    });
    if (!viewSnapshot.initialized) return getSnapshot();

    if (releaseEscapeLayer) releaseEscapeLayer();
    releaseEscapeLayer = registerEscapeLayer('context-inspector', {
      priority: 20,
      isActive: function () { return _viewSnapshot().open; },
      onEscape: function () { close({ restoreFocus: true }); },
    }) || null;
    var shouldOpen = typeof opts.open === 'boolean' ? opts.open : viewSnapshot.open;
    activateWorkspace(opts.workspaceId || getActiveWorkspaceId(), {
      render: false,
      syncOpen: false,
    });
    render();
    setPanelVisible(shouldOpen);
    return getSnapshot();
  }

  function open(config) {
    if (!_viewSnapshot().initialized) return getSnapshot();
    var opts = config || {};
    if (opts.workspaceId) activateWorkspace(opts.workspaceId);
    if (opts.restoreFocusTo && typeof view.setRestoreFocusTarget === 'function') {
      view.setRestoreFocusTarget(opts.restoreFocusTo);
    }
    setPanelVisible(true);
    if (opts.focus !== false && typeof view.focusClose === 'function') view.focusClose();
    return getSnapshot();
  }

  function close(config) {
    if (!_viewSnapshot().initialized) return getSnapshot();
    setPanelVisible(false);
    if ((!config || config.restoreFocus !== false) && typeof view.restoreFocus === 'function') {
      view.restoreFocus();
    }
    return getSnapshot();
  }

  function setCompactMode(compact, config) {
    session.configure({ compact: compact === true });
    if (_viewSnapshot().initialized && (!config || config.syncOpen !== false)) {
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
    var viewSnapshot = _viewSnapshot();
    session.activateWorkspace(workspaceId, viewSnapshot.initialized ? viewSnapshot.open : undefined);
    var activeWorkspaceId = getActiveWorkspaceId();
    if (typeof view.setWorkspaceId === 'function') view.setWorkspaceId(activeWorkspaceId);
    if (opts.render !== false) render();
    if (viewSnapshot.initialized && opts.syncOpen !== false) {
      var openProjection = session.getOpenProjection(
        renderersByWorkspace.has(activeWorkspaceId),
        activeWorkspaceId
      );
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
    var shellView = getContextInspectorShellView({
      workspaceId: getActiveWorkspaceId(),
      context: context,
      rendererRegistered: typeof renderer === 'function',
      rendererResult: rendererResult,
    });
    if (typeof view.applyShellView === 'function') view.applyShellView(shellView);
  }

  function render() {
    currentActionHandler = null;
    var activeWorkspaceId = getActiveWorkspaceId();
    var context = session.resolveActiveContext();
    var renderer = renderersByWorkspace.get(activeWorkspaceId);
    applyShellView(context, renderer, null);
    if (typeof renderer !== 'function') {
      if (typeof view.renderEmpty === 'function') {
        view.renderEmpty(getContextInspectorEmptyView(context));
      }
      return getSnapshot();
    }

    if (typeof view.showHost === 'function') view.showHost();
    var result = renderer({
      workspaceId: activeWorkspaceId,
      context: context,
      state: getState(),
      container: typeof view.getRendererContainer === 'function'
        ? view.getRendererContainer(activeWorkspaceId)
        : null,
    });
    if (result === false) {
      session.clearContext(activeWorkspaceId);
      context = null;
      if (typeof view.renderEmpty === 'function') {
        view.renderEmpty(getContextInspectorEmptyView(null));
      }
    }
    applyShellView(context, renderer, result);
    if (result && typeof result.onAction === 'function') currentActionHandler = result.onAction;
    return getSnapshot();
  }

  function getSnapshot() {
    var sessionSnapshot = session.getSnapshot();
    var viewSnapshot = _viewSnapshot();
    return {
      initialized: !!viewSnapshot.initialized,
      open: !!viewSnapshot.open,
      activeWorkspaceId: sessionSnapshot.activeWorkspaceId,
      context: sessionSnapshot.context,
      contexts: sessionSnapshot.contexts,
      rendererRegistered: renderersByWorkspace.has(sessionSnapshot.activeWorkspaceId),
    };
  }

  function dispose() {
    var viewSnapshot = _viewSnapshot();
    var hadRuntime = !!(
      viewSnapshot.initialized || releaseEscapeLayer ||
      renderersByWorkspace.size || session.hasContexts()
    );
    if (view && typeof view.dispose === 'function') view.dispose();
    if (releaseEscapeLayer) releaseEscapeLayer();
    renderersByWorkspace = new Map();
    getState = function () { return null; };
    releaseEscapeLayer = null;
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
