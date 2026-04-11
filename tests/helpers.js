// tests/helpers.js — 测试辅助工具
// 通过 createInitialState 复用 SAVE_STATE_SCHEMA 契约，避免测试状态与运行时结构漂移。

import { createInitialState } from '../js/data/constants.js';

/**
 * 创建一个干净的测试用游戏状态
 * 说明：测试默认从 constants.js 的统一状态契约生成，再叠加覆写字段。
 * @param {object} [overrides] 覆盖默认值
 * @returns {object} 游戏状态
 */
export function createTestState(overrides) {
  return createInitialState(Object.assign({ companyName: '测试公司' }, overrides));
}
