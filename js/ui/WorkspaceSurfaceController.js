// js/ui/WorkspaceSurfaceController.js — 五个 canonical L3 workspace 的 DOM 生命周期
//
// NavigationController 持有唯一 active workspace；本模块只把该状态投影为
// 统一的 is-active、inert、aria-hidden、焦点和可诊断 DOM 契约。

import { normalizeWorkspace } from './NavigationController.js';

export const WORKSPACE_SURFACE_DESCRIPTORS = Object.freeze({
  map: Object.freeze({ surfaceId: 'map-section' }),
  trade: Object.freeze({ surfaceId: 'market-overlay' }),
  fleet: Object.freeze({ surfaceId: 'trade-panel' }),
  archive: Object.freeze({ surfaceId: 'info-panel' }),
  logs: Object.freeze({ surfaceId: 'console-panel' }),
});

const WORKSPACE_IDS = Object.freeze(Object.keys(WORKSPACE_SURFACE_DESCRIPTORS));
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

function _setWorkspaceActive(element, visible) {
  if (!element || !element.classList) return;
  element.classList.toggle('is-active', !!visible);
  element.inert = !visible;
  _setAttribute(element, 'aria-hidden', visible ? 'false' : 'true');
  if (element.dataset) element.dataset.workspaceActive = visible ? 'true' : 'false';
}

function _isWorkspaceActive(element) {
  return !!(element && element.classList && element.classList.contains('is-active'));
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
  var focusCommitCount = 0;
  var lastFocusedWorkspace = null;
  var disposed = false;
  var focusGeneration = 0;

  function _scheduleFocus(callback) {
    var doc = _document(opts.document);
    var view = doc && doc.defaultView;
    if (view && typeof view.requestAnimationFrame === 'function') {
      // 两帧后再确认一次焦点：浏览器/自动化点击可能在首帧末尾把焦点
      // 归还给触发按钮，热加载工作区不能因此覆盖 canonical entry focus。
      view.requestAnimationFrame(function () {
        view.requestAnimationFrame(function () {
          if (typeof view.setTimeout === 'function') view.setTimeout(callback, 0);
          else callback();
        });
      });
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
    WORKSPACE_IDS.forEach(function (workspaceId) {
      var descriptor = WORKSPACE_SURFACE_DESCRIPTORS[workspaceId];
      var element = _surface(doc, workspaceId);
      if (_isWorkspaceActive(element)) visibleSurfaceIds.push(descriptor.surfaceId);
    });
    var expectedSurfaceId = WORKSPACE_SURFACE_DESCRIPTORS[activeWorkspace].surfaceId;
    var consistent = visibleSurfaceIds.length === 1 && visibleSurfaceIds[0] === expectedSurfaceId;
    return Object.freeze({
      activationCount: activationCount,
      activeWorkspace: activeWorkspace,
      consistent: consistent,
      disposed: disposed,
      focusCommitCount: focusCommitCount,
      lastFocusedWorkspace: lastFocusedWorkspace,
      visibleSurfaceIds: Object.freeze(visibleSurfaceIds),
    });
  }

  function _commitWorkspaceFocus(surface, workspace) {
    if (!_focusSurface(surface)) return false;
    focusCommitCount += 1;
    lastFocusedWorkspace = workspace;
    var doc = _document(opts.document);
    var main = doc && typeof doc.getElementById === 'function' ? doc.getElementById('game-main') : null;
    if (main && main.dataset) {
      main.dataset.workspaceFocusOwner = workspace;
      main.dataset.workspaceFocusCommitCount = String(focusCommitCount);
    }
    return true;
  }

  function activate(workspace, options) {
    var targetWorkspace = normalizeWorkspace(workspace);
    var doc = _document(opts.document);
    if (!targetWorkspace || !doc) return false;
    var targetSurface = _surface(doc, targetWorkspace);
    if (!targetSurface) return false;

    var before = getSnapshot();
    WORKSPACE_IDS.forEach(function (workspaceId) {
      _setWorkspaceActive(_surface(doc, workspaceId), workspaceId === targetWorkspace);
    });

    var main = typeof doc.getElementById === 'function' ? doc.getElementById('game-main') : null;
    if (main && main.dataset) main.dataset.activeWorkspace = targetWorkspace;

    activeWorkspace = targetWorkspace;
    activationCount += 1;
    disposed = false;
    focusGeneration += 1;

    var activationOptions = options || {};
    var changed = before.activeWorkspace !== targetWorkspace || !before.consistent;
    if (activationOptions.focus !== false && (changed || activationOptions.forceFocus === true)) {
      _commitWorkspaceFocus(targetSurface, targetWorkspace);
      var scheduledGeneration = focusGeneration;
      _scheduleFocus(function () {
        if (disposed || scheduledGeneration !== focusGeneration || activeWorkspace !== targetWorkspace) return;
        _commitWorkspaceFocus(targetSurface, targetWorkspace);
      });
    }
    return true;
  }

  function dispose() {
    var doc = _document(opts.document);
    if (disposed) return false;
    WORKSPACE_IDS.forEach(function (workspaceId) {
      _setWorkspaceActive(_surface(doc, workspaceId), workspaceId === 'map');
    });
    var main = doc && typeof doc.getElementById === 'function' ? doc.getElementById('game-main') : null;
    if (main && main.dataset) {
      delete main.dataset.activeWorkspace;
      delete main.dataset.workspaceFocusOwner;
      delete main.dataset.workspaceFocusCommitCount;
    }
    activeWorkspace = 'map';
    lastFocusedWorkspace = null;
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
