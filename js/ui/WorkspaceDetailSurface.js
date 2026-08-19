// js/ui/WorkspaceDetailSurface.js — canonical workspace 的 L4 对象详情层
//
// NavigationController 持有不可变详情栈；本模块只把 activeDetail 投影到
// 一个真实 Surface，并负责逐层 Escape、局部 action 委托和焦点恢复。

import { registerEscapeLayer } from './SurfaceManager.js';

const ROOT_ID = 'workspace-detail-surface';
const TITLE_ID = 'workspace-detail-title';
const DEPTH_ID = 'workspace-detail-depth';
const CONTENT_ID = 'workspace-detail-content';
const CONTEXT_INSPECTOR_ID = 'context-inspector';
const BACK_SELECTOR = '[data-workspace-detail-back]';
const CLOSE_SELECTOR = '[data-workspace-detail-close]';
const ACTION_SELECTOR = '[data-workspace-detail-action], [data-exploration-action]';

function _document(source) {
  if (typeof source === 'function') return source();
  if (source) return source;
  return typeof document === 'undefined' ? null : document;
}

function _focus(element) {
  if (!element || typeof element.focus !== 'function') return false;
  try {
    element.focus({ preventScroll: true });
  } catch (error) {
    element.focus();
  }
  return true;
}

function _detailFingerprint(detail) {
  if (!detail) return '';
  if (typeof detail === 'string') return 'legacy:' + detail;
  return [detail.workspaceId, detail.type, detail.id, detail.revision].join(':');
}

function _attribute(element, name, value) {
  if (element && typeof element.setAttribute === 'function') element.setAttribute(name, String(value));
}

function _clearContainer(container) {
  if (!container) return;
  if (typeof container.replaceChildren === 'function') container.replaceChildren();
  else container.innerHTML = '';
}

export function createWorkspaceDetailSurface(options) {
  var opts = options || {};
  var renderers = new Map();
  var focusReturns = new Map();
  var navigation = null;
  var getState = function () { return null; };
  var getRevision = function () { return 0; };
  var root = null;
  var title = null;
  var depth = null;
  var content = null;
  var backButton = null;
  var closeButton = null;
  var contextInspector = null;
  var contextInspectorWasInert = false;
  var contextInspectorAriaHidden = null;
  var contextInspectorObscured = false;
  var documentRef = null;
  var unsubscribeNavigation = null;
  var releaseEscape = null;
  var currentSnapshot = null;
  var currentDetail = null;
  var currentActionHandler = null;
  var initialized = false;
  var renderCount = 0;
  var openCount = 0;
  var closeCount = 0;

  function _setContextInspectorObscured(obscured) {
    if (!contextInspector) return;
    if (obscured && !contextInspectorObscured) {
      contextInspectorWasInert = !!contextInspector.inert;
      contextInspectorAriaHidden = typeof contextInspector.getAttribute === 'function'
        ? contextInspector.getAttribute('aria-hidden')
        : null;
      contextInspector.inert = true;
      _attribute(contextInspector, 'aria-hidden', 'true');
      if (contextInspector.dataset) contextInspector.dataset.detailObscured = 'true';
      contextInspectorObscured = true;
      return;
    }
    if (!obscured && contextInspectorObscured) {
      contextInspector.inert = contextInspectorWasInert;
      if (contextInspectorAriaHidden === null && typeof contextInspector.removeAttribute === 'function') {
        contextInspector.removeAttribute('aria-hidden');
      } else if (contextInspectorAriaHidden !== null) {
        _attribute(contextInspector, 'aria-hidden', contextInspectorAriaHidden);
      }
      if (contextInspector.dataset) delete contextInspector.dataset.detailObscured;
      contextInspectorObscured = false;
    }
  }

  function _setVisible(visible) {
    if (!root) return;
    _setContextInspectorObscured(visible);
    root.hidden = !visible;
    root.inert = !visible;
    _attribute(root, 'aria-hidden', visible ? 'false' : 'true');
    if (root.dataset) root.dataset.state = visible ? 'open' : 'closed';
  }

  function _resolveNavigation(source) {
    return source && typeof source.getNavigationSnapshot === 'function' &&
      typeof source.subscribeNavigation === 'function' &&
      typeof source.openDetail === 'function' && typeof source.closeDetail === 'function'
      ? source
      : null;
  }

  function _getSnapshot() {
    return navigation ? navigation.getNavigationSnapshot() : null;
  }

  function _queryReturnFocus(entry) {
    if (!entry) return null;
    if (entry.target && entry.target.isConnected !== false) return entry.target;
    var doc = documentRef;
    if (!doc || !entry.selector || typeof doc.querySelector !== 'function') return null;
    try {
      return doc.querySelector(entry.selector);
    } catch (error) {
      return null;
    }
  }

  function _restoreFocus(detail) {
    var fingerprint = _detailFingerprint(detail);
    var entry = focusReturns.get(fingerprint);
    focusReturns.delete(fingerprint);
    return _focus(_queryReturnFocus(entry));
  }

  function _closeInvalidDetail(snapshot) {
    if (!navigation || !snapshot || !snapshot.activeDetail) return false;
    navigation.closeDetail(snapshot.activeWorkspace);
    return true;
  }

  function _render(snapshot, change) {
    currentSnapshot = snapshot || _getSnapshot();
    var detail = currentSnapshot && currentSnapshot.activeDetail;
    var previousFingerprint = _detailFingerprint(currentDetail);
    var nextFingerprint = _detailFingerprint(detail);

    if (!detail) {
      currentDetail = null;
      currentActionHandler = null;
      _setVisible(false);
      if (change && change.type === 'detail:close') _restoreFocus(change.detail);
      return false;
    }

    if (typeof detail !== 'object') {
      currentDetail = detail;
      currentActionHandler = null;
      _setVisible(false);
      return false;
    }

    var currentRevision = Number(getRevision());
    if (Number.isFinite(currentRevision) && Number(detail.revision) !== currentRevision) {
      return _closeInvalidDetail(currentSnapshot);
    }

    var renderer = renderers.get(detail.type);
    if (typeof renderer !== 'function') return _closeInvalidDetail(currentSnapshot);

    _clearContainer(content);
    currentActionHandler = null;
    var state = getState();
    var result = renderer({
      close: close,
      container: content,
      depth: currentSnapshot.workspaces[currentSnapshot.activeWorkspace].detailDepth,
      detail: detail,
      open: open,
      snapshot: currentSnapshot,
      state: state,
    });
    if (result === false) return _closeInvalidDetail(currentSnapshot);

    currentDetail = detail;
    var detailDepth = currentSnapshot.workspaces[currentSnapshot.activeWorkspace].detailDepth;
    var resultObject = result && typeof result === 'object' ? result : {};
    if (title) title.textContent = resultObject.title || '对象详情';
    if (depth) depth.textContent = '第 ' + detailDepth + ' 层';
    if (backButton) backButton.textContent = detailDepth > 1 ? '← 返回上一级' : '← 返回上下文';
    currentActionHandler = typeof resultObject.onAction === 'function' ? resultObject.onAction : null;
    if (root && root.dataset) {
      root.dataset.workspaceId = currentSnapshot.activeWorkspace;
      root.dataset.detailType = detail.type;
      root.dataset.detailId = detail.id;
      root.dataset.detailDepth = String(detailDepth);
    }
    _setVisible(true);
    renderCount += 1;

    if (change && change.type === 'detail:close') {
      _restoreFocus(change.detail);
    } else if (previousFingerprint !== nextFingerprint) {
      var initialTarget = null;
      if (resultObject.initialFocusSelector && content && typeof content.querySelector === 'function') {
        try { initialTarget = content.querySelector(resultObject.initialFocusSelector); } catch (error) { initialTarget = null; }
      }
      _focus(initialTarget || title || backButton || root);
    }
    return true;
  }

  function _handleAction(event) {
    var target = event && event.target && typeof event.target.closest === 'function'
      ? event.target.closest(ACTION_SELECTOR)
      : null;
    if (!target || !content || (typeof content.contains === 'function' && !content.contains(target))) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    if (typeof currentActionHandler === 'function') {
      currentActionHandler({
        action: target.dataset
          ? (target.dataset.workspaceDetailAction || target.dataset.explorationAction || '')
          : '',
        dataset: target.dataset || {},
        detail: currentDetail,
        state: getState(),
        target: target,
      });
    }
  }

  function _handleClose(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    close();
  }

  function init(config) {
    var initOptions = config || {};
    if (initialized) dispose({ preserveRenderers: true });
    navigation = _resolveNavigation(initOptions.navigation);
    getState = typeof initOptions.stateSource === 'function'
      ? initOptions.stateSource
      : function () { return initOptions.stateSource || null; };
    getRevision = typeof initOptions.revisionSource === 'function'
      ? initOptions.revisionSource
      : function () { return Number(initOptions.revisionSource) || 0; };

    var doc = _document(initOptions.document || opts.document);
    documentRef = doc;
    root = doc && typeof doc.getElementById === 'function' ? doc.getElementById(ROOT_ID) : null;
    title = doc && typeof doc.getElementById === 'function' ? doc.getElementById(TITLE_ID) : null;
    depth = doc && typeof doc.getElementById === 'function' ? doc.getElementById(DEPTH_ID) : null;
    content = doc && typeof doc.getElementById === 'function' ? doc.getElementById(CONTENT_ID) : null;
    backButton = root && typeof root.querySelector === 'function' ? root.querySelector(BACK_SELECTOR) : null;
    closeButton = root && typeof root.querySelector === 'function' ? root.querySelector(CLOSE_SELECTOR) : null;
    contextInspector = doc && typeof doc.getElementById === 'function' ? doc.getElementById(CONTEXT_INSPECTOR_ID) : null;

    if (backButton && typeof backButton.addEventListener === 'function') backButton.addEventListener('click', _handleClose);
    if (closeButton && typeof closeButton.addEventListener === 'function') closeButton.addEventListener('click', _handleClose);
    if (content && typeof content.addEventListener === 'function') content.addEventListener('click', _handleAction);
    if (navigation) unsubscribeNavigation = navigation.subscribeNavigation(_render);
    releaseEscape = registerEscapeLayer('workspace-detail-surface', {
      priority: 60,
      isActive: function () { return !!(root && !root.hidden && currentDetail); },
      onEscape: close,
    });
    initialized = !!root;
    _setVisible(false);
    _render(_getSnapshot(), null);
    return getSnapshot();
  }

  function registerRenderer(type, renderer) {
    var normalizedType = typeof type === 'string' ? type.trim() : '';
    if (!normalizedType || typeof renderer !== 'function') return function () {};
    renderers.set(normalizedType, renderer);
    if (currentDetail && currentDetail.type === normalizedType) _render(_getSnapshot(), null);
    return function () {
      if (renderers.get(normalizedType) === renderer) renderers.delete(normalizedType);
    };
  }

  function open(detail, options) {
    if (!navigation || !detail || typeof detail !== 'object') return false;
    var openOptions = options || {};
    var fingerprint = _detailFingerprint(detail);
    var doc = _document(openOptions.document || documentRef || opts.document);
    var trigger = openOptions.triggerElement || (doc && doc.activeElement) || null;
    var previousFocusEntry = focusReturns.get(fingerprint);
    focusReturns.set(fingerprint, {
      target: trigger && typeof trigger.focus === 'function' ? trigger : null,
      selector: openOptions.returnFocusSelector || '',
    });
    var opened = navigation.openDetail(detail, detail.workspaceId);
    if (!opened) {
      if (previousFocusEntry) focusReturns.set(fingerprint, previousFocusEntry);
      else focusReturns.delete(fingerprint);
    }
    else openCount += 1;
    return opened;
  }

  function close() {
    if (!navigation || !currentSnapshot || !currentSnapshot.activeDetail) return null;
    var closed = navigation.closeDetail(currentSnapshot.activeWorkspace);
    if (closed) closeCount += 1;
    return closed;
  }

  function getSnapshot() {
    var snapshot = currentSnapshot || _getSnapshot();
    return Object.freeze({
      activeDetail: snapshot ? snapshot.activeDetail : null,
      closeCount: closeCount,
      depth: snapshot && snapshot.workspaces && snapshot.workspaces[snapshot.activeWorkspace]
        ? snapshot.workspaces[snapshot.activeWorkspace].detailDepth
        : 0,
      initialized: initialized,
      open: !!(root && !root.hidden && currentDetail),
      openCount: openCount,
      registeredTypes: Object.freeze(Array.from(renderers.keys())),
      renderCount: renderCount,
      workspaceId: snapshot ? snapshot.activeWorkspace : null,
    });
  }

  function dispose(options) {
    var disposeOptions = options || {};
    if (unsubscribeNavigation) unsubscribeNavigation();
    if (releaseEscape) releaseEscape();
    if (backButton && typeof backButton.removeEventListener === 'function') backButton.removeEventListener('click', _handleClose);
    if (closeButton && typeof closeButton.removeEventListener === 'function') closeButton.removeEventListener('click', _handleClose);
    if (content && typeof content.removeEventListener === 'function') content.removeEventListener('click', _handleAction);
    _setVisible(false);
    if (!disposeOptions.preserveRenderers) renderers.clear();
    focusReturns.clear();
    navigation = null;
    root = null;
    title = null;
    depth = null;
    content = null;
    backButton = null;
    closeButton = null;
    contextInspector = null;
    contextInspectorWasInert = false;
    contextInspectorAriaHidden = null;
    contextInspectorObscured = false;
    documentRef = null;
    unsubscribeNavigation = null;
    releaseEscape = null;
    currentSnapshot = null;
    currentDetail = null;
    currentActionHandler = null;
    initialized = false;
  }

  return Object.freeze({
    close: close,
    dispose: dispose,
    getSnapshot: getSnapshot,
    init: init,
    open: open,
    registerRenderer: registerRenderer,
  });
}

const _defaultSurface = createWorkspaceDetailSurface();

export function init(options) { return _defaultSurface.init(options); }
export function registerRenderer(type, renderer) { return _defaultSurface.registerRenderer(type, renderer); }
export function open(detail, options) { return _defaultSurface.open(detail, options); }
export function close() { return _defaultSurface.close(); }
export function getSnapshot() { return _defaultSurface.getSnapshot(); }
export function dispose() { return _defaultSurface.dispose(); }
