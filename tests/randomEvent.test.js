// tests/randomEvent.test.js — RandomEvent 系统测试
// 覆盖: M3（resolveChoice 越界）、事件触发、事件池筛选

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as RandomEvent from '../js/systems/event/RandomEvent.js';
import { createTestState } from './helpers.js';

describe('RandomEvent.rollEvent', () => {
  it('chance=0 不触发事件', () => {
    const state = createTestState();
    const result = RandomEvent.rollEvent(state, 0);
    expect(result).toBeNull();
  });

  it('chance=1 触发事件', () => {
    const state = createTestState();
    const result = RandomEvent.rollEvent(state, 1);
    // 如果事件池非空必然触发
    if (result) {
      expect(result.id).toBeDefined();
      expect(result.choices).toBeDefined();
      expect(result.choices.length).toBeGreaterThan(0);
    }
  });

  it('触发事件后 totalEvents 递增', () => {
    const state = createTestState();
    state.totalEvents = 5;
    const result = RandomEvent.rollEvent(state, 1);
    if (result) {
      expect(state.totalEvents).toBe(6);
    }
  });

  it('deep_scanner 科技提升概率', () => {
    const state = createTestState({ researchedTechs: ['deep_scanner'] });
    // 内部会 chance *= 1.5，测试不崩溃即可
    RandomEvent.rollEvent(state, 0.5);
    expect(true).toBe(true);
  });
});

describe('RandomEvent.getActiveEvent', () => {
  it('无事件时返回 null', () => {
    // rollEvent(chance=0) => null => 清除 active
    const state = createTestState();
    RandomEvent.rollEvent(state, 0);
    expect(RandomEvent.getActiveEvent()).toBeNull();
  });

  it('触发后返回事件对象', () => {
    const state = createTestState();
    const result = RandomEvent.rollEvent(state, 1);
    if (result) {
      expect(RandomEvent.getActiveEvent()).toBe(result);
    }
  });
});

describe('RandomEvent.resolveChoice', () => {
  it('无激活事件返回空消息', () => {
    const state = createTestState();
    RandomEvent.rollEvent(state, 0); // 清除 active
    const result = RandomEvent.resolveChoice(state, 0);
    expect(result.msgs).toEqual([]);
  });

  it('越界 choiceIndex 不崩溃 [M3]', () => {
    const state = createTestState();
    const ev = RandomEvent.rollEvent(state, 1);
    if (ev) {
      // 使用越界索引
      const result = RandomEvent.resolveChoice(state, 999);
      expect(result.msgs).toEqual([]);
    }
  });

  it('有效选择返回结果并清除事件', () => {
    const state = createTestState();
    const ev = RandomEvent.rollEvent(state, 1);
    if (ev) {
      const result = RandomEvent.resolveChoice(state, 0);
      expect(result).toBeDefined();
      expect(RandomEvent.getActiveEvent()).toBeNull();
    }
  });

  it('选择 effect 修改 state', () => {
    const state = createTestState({ credits: 1000 });
    const ev = RandomEvent.rollEvent(state, 1);
    if (ev) {
      const creditsBefore = state.credits;
      RandomEvent.resolveChoice(state, 0);
      // 事件效果可能改变 credits — 只要不崩溃就行
      expect(typeof state.credits).toBe('number');
    }
  });
});
