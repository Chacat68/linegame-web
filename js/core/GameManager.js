// js/core/GameManager.js — 兼容门面
//
// 新代码应依赖 GameApplication；该文件仅保留历史生命周期入口，避免外部集成
// 在组合根迁移期间同时切换。测试控制面位于独立的 TestHarness。

export {
  init,
  shutdown,
} from './GameApplication.js';
