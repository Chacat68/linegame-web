// js/core/GameManager.js — 兼容门面
//
// 新代码应依赖 GameApplication；该文件仅保留历史公共入口，避免现有启动器、
// 测试和外部集成在组合根迁移期间同时切换。

export {
  init,
  shutdown,
  _setStateForTest,
  _handleActionGuideActionForTest,
  _handleTradeConfirmForTest,
  _handleAssignRouteForTest,
  _stopActiveDispatchForTest,
  _getGameClockSnapshotForTest,
  _getUiDiagnosticsForTest,
} from './GameApplication.js';
