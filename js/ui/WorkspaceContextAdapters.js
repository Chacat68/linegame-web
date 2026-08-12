// js/ui/WorkspaceContextAdapters.js — Context Inspector 的工作区适配注册表
//
// 领域 UI 仍随各自 feature 延迟加载；本模块只维护 workspace → renderer
// 的轻量路由，不持有游戏 state 或领域对象。

const ARCHIVE_RENDERER_BY_TYPE = {
  quest: 'QuestUI',
  technology: 'ResearchUI',
  faction: 'FactionUI',
  achievement: 'AchievementUI',
  report: 'ArchiveExplorationUI',
};

function _sameContext(left, right) {
  return !!left && !!right &&
    left.workspaceId === right.workspaceId &&
    left.type === right.type &&
    String(left.id) === String(right.id) &&
    left.revision === right.revision;
}

function _contextRenderer(module) {
  return module && typeof module.renderContextInspector === 'function'
    ? module.renderContextInspector
    : null;
}

export function createWorkspaceContextAdapters(options) {
  var config = options || {};
  var inspector = config.inspector || null;
  var getRevision = typeof config.getRevision === 'function'
    ? config.getRevision
    : function () {
        return inspector && typeof inspector.getCurrentRevision === 'function'
          ? inspector.getCurrentRevision()
          : 0;
      };
  var featureRefs = new Map();
  var releases = new Map();

  function _register(workspaceId, featureRef, renderer) {
    if (!inspector || typeof inspector.registerRenderer !== 'function') return false;
    if (featureRefs.get(workspaceId) === featureRef) return true;
    var previousRelease = releases.get(workspaceId);
    if (typeof previousRelease === 'function') previousRelease();
    featureRefs.set(workspaceId, featureRef);
    releases.set(workspaceId, inspector.registerRenderer(workspaceId, renderer));
    return true;
  }

  function connectMarket(module) {
    var renderer = _contextRenderer(module);
    if (!renderer) return false;
    return _register('trade', module, function (request) {
      return renderer(request);
    });
  }

  function connectFleet(module) {
    var renderer = _contextRenderer(module);
    if (!renderer) return false;
    return _register('fleet', module, function (request) {
      return renderer(request);
    });
  }

  function connectLogs(module) {
    var renderer = _contextRenderer(module);
    if (!renderer) return false;
    return _register('logs', module, function (request) {
      return renderer(request);
    });
  }

  function connectArchive(module) {
    if (!module || typeof module !== 'object') return false;
    return _register('archive', module, function (request) {
      var context = request && request.context;
      var moduleName = context ? ARCHIVE_RENDERER_BY_TYPE[context.type] : null;
      var renderer = moduleName ? _contextRenderer(module[moduleName]) : null;
      if (!renderer) return false;
      return renderer(request);
    });
  }

  function syncSelection(workspaceId, selection, options) {
    if (!inspector || typeof inspector.replaceContext !== 'function' || !selection) return null;
    var next = {
      workspaceId: workspaceId,
      type: selection.type,
      id: String(selection.id == null ? '' : selection.id),
      source: selection.source || 'workspace-selection',
      revision: Number(getRevision()) || 0,
    };
    var current = typeof inspector.getContext === 'function'
      ? inspector.getContext(workspaceId)
      : null;
    if (_sameContext(current, next)) return current;
    return inspector.replaceContext(next, options);
  }

  function clearSelection(workspaceId, options) {
    if (!inspector || typeof inspector.clearContext !== 'function') return null;
    return inspector.clearContext(workspaceId, options);
  }

  function dispose() {
    releases.forEach(function (release) {
      if (typeof release === 'function') release();
    });
    releases.clear();
    featureRefs.clear();
  }

  return Object.freeze({
    clearSelection: clearSelection,
    connectArchive: connectArchive,
    connectFleet: connectFleet,
    connectLogs: connectLogs,
    connectMarket: connectMarket,
    dispose: dispose,
    syncSelection: syncSelection,
  });
}
