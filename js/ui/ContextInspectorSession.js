// js/ui/ContextInspectorSession.js — 五工作区 Context key、开合偏好与 revision 会话

const DEFAULT_WORKSPACE_ID = 'map';
const CONTEXT_FIELDS = ['type', 'id', 'workspaceId', 'source', 'revision'];

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeWorkspaceId(value) {
  return normalizeString(value) || DEFAULT_WORKSPACE_ID;
}

function getOpenPreferenceKey(workspaceId, compact) {
  return (compact ? 'compact:' : 'regular:') + normalizeWorkspaceId(workspaceId);
}

function copyContext(context) {
  if (!context) return null;
  var copy = {};
  CONTEXT_FIELDS.forEach(function (field) { copy[field] = context[field]; });
  return Object.freeze(copy);
}

function normalizeContext(context, fallbackWorkspaceId) {
  if (!context || typeof context !== 'object') return null;
  var type = normalizeString(context.type);
  var id = normalizeString(context.id);
  if (!type || !id) return null;
  return Object.freeze({
    type: type,
    id: id,
    workspaceId: normalizeWorkspaceId(context.workspaceId || fallbackWorkspaceId),
    source: normalizeString(context.source) || 'unknown',
    revision: Number.isFinite(Number(context.revision)) ? Number(context.revision) : 0,
  });
}

export function createContextInspectorSession(options) {
  var activeWorkspaceId = DEFAULT_WORKSPACE_ID;
  var contextsByWorkspace = new Map();
  var openByWorkspace = new Map();
  var compactMode = false;
  var getRevision = function () { return null; };

  function configure(config) {
    var opts = config || {};
    compactMode = !!opts.compact;
    if (Object.prototype.hasOwnProperty.call(opts, 'revisionSource')) {
      getRevision = typeof opts.revisionSource === 'function'
        ? opts.revisionSource
        : function () { return opts.revisionSource; };
    }
    return getSnapshot();
  }

  function readCurrentRevision() {
    var value = getRevision();
    if (value === null || typeof value === 'undefined' || value === '') return null;
    var revision = Number(value);
    return Number.isFinite(revision) ? revision : null;
  }

  function activateWorkspace(workspaceId, currentOpen) {
    var nextWorkspaceId = normalizeWorkspaceId(workspaceId);
    var changed = nextWorkspaceId !== activeWorkspaceId;
    if (changed && typeof currentOpen === 'boolean') {
      openByWorkspace.set(getOpenPreferenceKey(activeWorkspaceId, compactMode), currentOpen);
    }
    activeWorkspaceId = nextWorkspaceId;
    return changed;
  }

  function rememberOpen(open, workspaceId) {
    openByWorkspace.set(
      getOpenPreferenceKey(workspaceId || activeWorkspaceId, compactMode),
      open === true
    );
  }

  function getOpenProjection(hasRenderer, workspaceId) {
    var targetWorkspaceId = normalizeWorkspaceId(workspaceId || activeWorkspaceId);
    var preferenceKey = getOpenPreferenceKey(targetWorkspaceId, compactMode);
    var hasPreference = openByWorkspace.has(preferenceKey);
    var defaultOpen = !compactMode && !!hasRenderer && targetWorkspaceId !== 'logs';
    return Object.freeze({
      hasPreference: hasPreference,
      open: hasPreference ? openByWorkspace.get(preferenceKey) === true : defaultOpen,
    });
  }

  function replaceContext(context, workspaceId) {
    var targetWorkspaceId = normalizeWorkspaceId(
      (context && context.workspaceId) || workspaceId || activeWorkspaceId
    );
    var normalized = normalizeContext(context, targetWorkspaceId);
    if (!normalized) return clearContext(targetWorkspaceId);
    contextsByWorkspace.set(targetWorkspaceId, normalized);
    return copyContext(normalized);
  }

  function clearContext(workspaceId) {
    contextsByWorkspace.delete(normalizeWorkspaceId(workspaceId || activeWorkspaceId));
    return null;
  }

  function getContext(workspaceId) {
    return copyContext(contextsByWorkspace.get(normalizeWorkspaceId(workspaceId || activeWorkspaceId)) || null);
  }

  function resolveActiveContext() {
    var context = getContext(activeWorkspaceId);
    var currentRevision = readCurrentRevision();
    if (context && currentRevision !== null && context.revision !== currentRevision) {
      contextsByWorkspace.delete(activeWorkspaceId);
      return null;
    }
    return context;
  }

  function reconcileRevision(revision) {
    var nextRevision = Number.isFinite(Number(revision)) ? Number(revision) : null;
    var changed = [];
    contextsByWorkspace.forEach(function (context, workspaceId) {
      if (nextRevision === null || context.revision !== nextRevision) {
        contextsByWorkspace.delete(workspaceId);
        changed.push(workspaceId);
      }
    });
    return changed;
  }

  function getSnapshot() {
    var contexts = {};
    contextsByWorkspace.forEach(function (context, workspaceId) {
      contexts[workspaceId] = copyContext(context);
    });
    return Object.freeze({
      activeWorkspaceId: activeWorkspaceId,
      context: getContext(activeWorkspaceId),
      contexts: Object.freeze(contexts),
      compact: compactMode,
    });
  }

  function hasContexts() {
    return contextsByWorkspace.size > 0;
  }

  function reset() {
    activeWorkspaceId = DEFAULT_WORKSPACE_ID;
    contextsByWorkspace = new Map();
    openByWorkspace = new Map();
    compactMode = false;
    getRevision = function () { return null; };
    return getSnapshot();
  }

  configure(options);
  return Object.freeze({
    activateWorkspace: activateWorkspace,
    clearContext: clearContext,
    configure: configure,
    getContext: getContext,
    getCurrentRevision: function () {
      var revision = readCurrentRevision();
      return revision === null ? 0 : revision;
    },
    getOpenProjection: getOpenProjection,
    getSnapshot: getSnapshot,
    hasContexts: hasContexts,
    normalizeWorkspaceId: normalizeWorkspaceId,
    reconcileRevision: reconcileRevision,
    rememberOpen: rememberOpen,
    replaceContext: replaceContext,
    reset: reset,
    resolveActiveContext: resolveActiveContext,
  });
}
