// js/ui/NavigationController.js — 纯状态工作区导航控制器
//
// 该模块只描述导航状态与层级，不读取 DOM，也不负责具体面板的显示隐藏。
// UI 适配层可以通过 hooks 驱动旧面板，并通过 subscribe 同步导航视觉状态。

export const WORKSPACES = Object.freeze(['map', 'trade', 'fleet', 'archive', 'logs']);

export const WORKSPACE_ALIASES = Object.freeze({
  map: 'map',
  starmap: 'map',
  trade: 'trade',
  market: 'trade',
  fleet: 'fleet',
  hangar: 'fleet',
  archive: 'archive',
  quests: 'archive',
  logs: 'logs',
});

/**
 * 将旧视图名称或工作区名称归一化为 canonical workspace。
 * @param {unknown} workspace
 * @returns {string|null}
 */
export function normalizeWorkspace(workspace) {
  if (typeof workspace !== 'string') return null;
  var key = workspace.trim().toLowerCase();
  return WORKSPACE_ALIASES[key] || null;
}

/**
 * 创建纯状态工作区导航控制器。
 *
 * hooks 接收同一个 change 对象：
 * { type, reason, from, to, state, snapshot, detail? }
 * 其中 getState 会在每次有效变化开始时调用，确保 hooks 拿到最新游戏状态。
 *
 * @param {Object} [options]
 * @param {string} [options.initialWorkspace='map']
 * @param {Function} [options.getState]
 * @param {Function} [options.onLeave]
 * @param {Function} [options.onEnter]
 * @param {Function} [options.onChange]
 */
export function createNavigationController(options) {
  var config = options || {};
  var getState = typeof config.getState === 'function'
    ? config.getState
    : function () { return null; };
  var onLeave = typeof config.onLeave === 'function' ? config.onLeave : function () {};
  var onEnter = typeof config.onEnter === 'function' ? config.onEnter : function () {};
  var onChange = typeof config.onChange === 'function' ? config.onChange : function () {};
  var initialWorkspace = normalizeWorkspace(config.initialWorkspace) || 'map';
  var activeWorkspace = initialWorkspace;
  var detailStacks = _createDetailStacks();
  var subscribers = new Set();

  function getSnapshot() {
    var stacks = {};
    var workspaces = {};

    WORKSPACES.forEach(function (workspace) {
      stacks[workspace] = detailStacks[workspace].slice();
      workspaces[workspace] = Object.freeze({
        active: workspace === activeWorkspace,
        detailDepth: stacks[workspace].length,
      });
    });

    var activeStack = stacks[activeWorkspace];
    return Object.freeze({
      activeWorkspace: activeWorkspace,
      activeDetail: activeStack.length > 0 ? activeStack[activeStack.length - 1] : null,
      detailStacks: Object.freeze(stacks),
      workspaces: Object.freeze(workspaces),
    });
  }

  function _publish(change) {
    var snapshot = getSnapshot();
    var publishedChange = Object.freeze(Object.assign({}, change, { snapshot: snapshot }));
    onChange(publishedChange);
    subscribers.forEach(function (listener) {
      listener(snapshot, publishedChange);
    });
  }

  /**
   * 导航到目标工作区。未知目标或重复导航都是无副作用的 no-op。
   * @returns {boolean} 是否发生了切换
   */
  function navigate(target, metadata) {
    var nextWorkspace = normalizeWorkspace(target);
    if (!nextWorkspace || nextWorkspace === activeWorkspace) return false;

    var previousWorkspace = activeWorkspace;
    var state = getState();
    var reason = metadata && metadata.reason ? metadata.reason : 'navigate';
    var baseChange = {
      type: 'workspace:change',
      reason: reason,
      from: previousWorkspace,
      to: nextWorkspace,
      state: state,
    };

    onLeave(Object.freeze(Object.assign({}, baseChange, { snapshot: getSnapshot() })));
    activeWorkspace = nextWorkspace;
    onEnter(Object.freeze(Object.assign({}, baseChange, { snapshot: getSnapshot() })));
    _publish(baseChange);
    return true;
  }

  /**
   * 仅同步外部 surface 已经完成的工作区变化，不重复执行 leave/enter hooks。
   * 兼容层用它接收 MapUI 等旧入口的状态回报。
   */
  function sync(target, metadata) {
    var nextWorkspace = normalizeWorkspace(target);
    if (!nextWorkspace || nextWorkspace === activeWorkspace) return false;

    var previousWorkspace = activeWorkspace;
    activeWorkspace = nextWorkspace;
    _publish({
      type: 'workspace:sync',
      reason: metadata && metadata.reason ? metadata.reason : 'external-sync',
      from: previousWorkspace,
      to: nextWorkspace,
      state: getState(),
    });
    return true;
  }

  /**
   * 向某个工作区压入详情层。默认操作当前工作区。
   * @returns {boolean} 是否成功压入
   */
  function openDetail(detail, workspace) {
    var targetWorkspace = typeof workspace === 'undefined'
      ? activeWorkspace
      : normalizeWorkspace(workspace);
    if (!targetWorkspace || detail === null || typeof detail === 'undefined') return false;

    detailStacks[targetWorkspace].push(detail);
    _publish({
      type: 'detail:open',
      reason: 'open-detail',
      from: activeWorkspace,
      to: activeWorkspace,
      workspace: targetWorkspace,
      detail: detail,
      state: getState(),
    });
    return true;
  }

  /**
   * 弹出某个工作区最上层详情。默认操作当前工作区。
   * @returns {*|null} 被关闭的详情；无详情或非法工作区时为 null
   */
  function closeDetail(workspace, metadata) {
    var targetWorkspace = typeof workspace === 'undefined'
      ? activeWorkspace
      : normalizeWorkspace(workspace);
    if (!targetWorkspace || detailStacks[targetWorkspace].length === 0) return null;

    var detail = detailStacks[targetWorkspace].pop();
    _publish({
      type: 'detail:close',
      reason: metadata && metadata.reason ? metadata.reason : 'close-detail',
      from: activeWorkspace,
      to: activeWorkspace,
      workspace: targetWorkspace,
      detail: detail,
      state: getState(),
    });
    return detail;
  }

  /**
   * 处理 Escape：先关当前工作区详情，再回地图；地图根层不处理。
   * @returns {'detail'|'workspace'|false}
   */
  function handleEscape() {
    if (detailStacks[activeWorkspace].length > 0) {
      closeDetail(activeWorkspace, { reason: 'escape' });
      return 'detail';
    }
    if (activeWorkspace !== 'map') {
      navigate('map', { reason: 'escape' });
      return 'workspace';
    }
    return false;
  }

  /**
   * 订阅后续有效状态变化。返回取消订阅函数。
   */
  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    subscribers.add(listener);
    return function () {
      subscribers.delete(listener);
    };
  }

  return Object.freeze({
    navigate: navigate,
    sync: sync,
    openDetail: openDetail,
    closeDetail: closeDetail,
    handleEscape: handleEscape,
    getSnapshot: getSnapshot,
    subscribe: subscribe,
  });
}

function _createDetailStacks() {
  var stacks = {};
  WORKSPACES.forEach(function (workspace) {
    stacks[workspace] = [];
  });
  return stacks;
}
