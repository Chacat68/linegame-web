// js/ui/HUD.js — Shell 交互生命周期与消息日志
// 依赖：core/EventBus.js, data/constants.js
// 导出：init, dispose, addMessage 及 Shell interaction port

import * as EventBus            from '../core/EventBus.js';
import * as Victory             from '../systems/victory/VictorySystem.js';
import { hideBlockingSurface, registerBlockingSurfaceDismiss, showBlockingSurface } from './SurfaceManager.js';
import * as ContextInspector from './ContextInspector.js';
import { renderLogContext, renderLogDetail } from './LogsContextPresenter.js';
import { createLogsWorkspaceController } from './LogsWorkspaceController.js';
import { createHudInteractionController } from './HudInteractionController.js';
import { renderGalaxyViewSummary } from './HeaderStatusPresenter.js';
import { LOG_MESSAGE_SOURCE_LABELS } from '../core/LogMessage.js';
const LOG_TYPE_LABELS = {
  info: '系统',
  tip: '提示',
  trade: '交易',
  travel: '航行',
  buy: '买入',
  sell: '卖出',
  upgrade: '升级',
  danger: '警报',
  error: '警报',
};
let _initialized = false;
const _logsController = createLogsWorkspaceController({
  contextInspector: ContextInspector,
  maxEntries: 200,
  onHistoryChanged: function (payload) {
    EventBus.emit('logs:history:changed', payload);
  },
  renderContext: renderLogContext,
  renderDetail: renderLogDetail,
  sourceLabels: LOG_MESSAGE_SOURCE_LABELS,
  typeLabels: LOG_TYPE_LABELS,
});
const _hudInteractions = createHudInteractionController({
  events: EventBus,
  surfaces: {
    bindDismiss: registerBlockingSurfaceDismiss,
    hide: hideBlockingSurface,
    show: showBlockingSurface,
  },
  contextInspector: ContextInspector,
  logsController: _logsController,
  victory: Victory,
  getState: function () { return null; },
  renderGalaxySummary: function (state) {
    renderGalaxyViewSummary(state, null, function () {
      _hudInteractions.ensureGalaxyToggle();
    });
  },
});

// ---------------------------------------------------------------------------
// 初始化：订阅 EventBus 日志事件
// ---------------------------------------------------------------------------

export function init(options) {
  var opts = options || {};
  if (_initialized) return false;
  _initialized = _hudInteractions.initialize({
    stateSource: typeof opts.stateSource === 'function'
      ? opts.stateSource
      : function () { return null; },
    revisionSource: typeof opts.revisionSource === 'function'
      ? opts.revisionSource
      : null,
  });
  return _initialized;
}

export function setVictoryActions(actions) {
  _hudInteractions.setVictoryActions(actions);
}

export function ensureGalaxyToggle() {
  return _hudInteractions.ensureGalaxyToggle();
}

export function syncVictoryProgress(progressList, unlockedPathCount) {
  return _hudInteractions.syncVictory(progressList, unlockedPathCount);
}

export function addMessage(message, type, source) {
  return _logsController.addMessage(message, type, source);
}

/**
 * 从内存历史恢复日志终端。页面结构被重绘后，打开日志仍能看到已接收的记录。
 */
export function refreshLogView() {
  return _logsController.refresh();
}

/** Context adapter entry point. The latest in-memory history is resolved per render. */
export function renderContextInspector(request) {
  return _logsController.renderContextInspector(request);
}

/** L4 adapter entry point. Message id is resolved against the latest history. */
export function renderWorkspaceDetail(request) {
  return _logsController.renderWorkspaceDetail(request);
}

export function clearLogUnreadCount() {
  return _logsController.clearUnreadCount();
}

export function getDiagnostics() {
  return _logsController.getDiagnostics({
    initialized: _initialized,
    shell: _hudInteractions.getDiagnostics(),
  });
}

/** 清空当前运行会话的通讯记录，但保留 HUD 壳与 listener 绑定。 */
export function resetRuntimeState() {
  _logsController.reset();
  return getDiagnostics();
}

export function dispose() {
  var released = _hudInteractions.dispose();
  _initialized = false;
  return released;
}
