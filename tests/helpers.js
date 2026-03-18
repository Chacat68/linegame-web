// tests/helpers.js — 测试辅助工具
// 创建干净的游戏状态，避免直接依赖 INITIAL_STATE（包含完整的引用链）

import { createInitialState } from '../js/data/constants.js';

/**
 * 创建一个干净的测试用游戏状态
 * @param {object} [overrides] 覆盖默认值
 * @returns {object} 游戏状态
 */
export function createTestState(overrides) {
  return createInitialState(Object.assign({ companyName: '测试公司' }, overrides));
}
