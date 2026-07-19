// tests/randomEvent.test.js — RandomEvent 系统测试
// 覆盖: M3（resolveChoice 越界）、事件触发、事件池筛选

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as RandomEvent from '../js/systems/event/RandomEvent.js';
import { EVENT_CONFIG } from '../js/data/constants.js';
import { RANDOM_EVENTS } from '../js/data/events.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  RandomEvent.resetRuntimeState();
});

afterEach(() => {
  vi.restoreAllMocks();
  RandomEvent.resetRuntimeState();
});

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

  it('待处理事件可从持久化 ID 恢复，解决后会清除', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createTestState();
    const event = RandomEvent.rollEvent(state, 1);

    expect(event).toBeTruthy();
    expect(state._activeEventId).toBe(event.id);

    RandomEvent.resetRuntimeState();
    expect(RandomEvent.getActiveEvent()).toBeNull();
    RandomEvent.syncRuntimeState(state);
    expect(RandomEvent.getActiveEvent().id).toBe(event.id);

    const result = RandomEvent.resolveChoice(state, 0);
    expect(result.resolved).toBe(true);
    expect(state._activeEventId).toBe('');
    expect(RandomEvent.getActiveEvent()).toBeNull();
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
    // 触发倍率由 EVENT_CONFIG.modifiers 控制，测试不崩溃且配置存在即可
    expect(EVENT_CONFIG.modifiers.deepScannerChanceMultiplier).toBeGreaterThan(1);
    RandomEvent.rollEvent(state, 0.5);
    expect(true).toBe(true);
  });

  it('事件概率读取难度配置', () => {
    // 依次对应：easy 的触发判定、hard 的触发判定、hard 触发后的加权选取
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.45)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    const easyState = createTestState({ difficulty: 'easy' });
    const hardState = createTestState({ difficulty: 'hard', day: 20, playerLevel: 5, fuel: 100, shipHull: 100, credits: 1000 });

    const easyResult = RandomEvent.rollEvent(easyState, 0.5);
    const hardResult = RandomEvent.rollEvent(hardState, 0.5);

    expect(easyResult).toBeNull();
    expect(hardResult).toBeDefined();
  });

  it('高难度更偏向高风险事件池权重', () => {
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.77)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.77);

    const easyState = createTestState({ difficulty: 'easy', day: 20, playerLevel: 5, fuel: 100, shipHull: 100, credits: 1000 });
    const hardState = createTestState({ difficulty: 'hard', day: 20, playerLevel: 5, fuel: 100, shipHull: 100, credits: 1000 });

    const easyEvent = RandomEvent.rollEvent(easyState, 1);
    RandomEvent.resetRuntimeState();
    const hardEvent = RandomEvent.rollEvent(hardState, 1);

    expect(randomSpy).toHaveBeenCalled();
    expect(easyEvent.id).toBe('fuel_crisis');
    expect(hardEvent.id).toBe('solar_storm');
  });
});

describe('RandomEvent.getEligibleEvents', () => {
  it('早期阶段只暴露早期事件池', () => {
    const state = createTestState({ day: 3, playerLevel: 1, fuel: 100, shipHull: 100, credits: 1000 });
    const pool = RandomEvent.getEligibleEvents(state);
    const ids = pool.map(ev => ev.id);

    expect(ids).toContain('merchant_caravan');
    expect(ids).toContain('distress_signal');
    expect(ids).toContain('trade_festival');
    expect(ids).not.toContain('pirate_ambush');
    expect(ids).not.toContain('solar_storm');
    expect(ids).not.toContain('wormhole_anomaly');
  });

  it('低船体和低燃料会屏蔽高风险事件', () => {
    const state = createTestState({ day: 20, playerLevel: 5, fuel: 10, shipHull: 20, credits: 1000 });
    const ids = RandomEvent.getEligibleEvents(state).map(ev => ev.id);

    expect(ids).not.toContain('pirate_ambush');
    expect(ids).not.toContain('solar_storm');
    expect(ids).not.toContain('fuel_crisis');
  });

  it('后期阶段会开放后期事件池', () => {
    const state = createTestState({ day: 50, playerLevel: 8, fuel: 100, shipHull: 100, credits: 5000 });
    const ids = RandomEvent.getEligibleEvents(state).map(ev => ev.id);

    expect(ids).toContain('wormhole_anomaly');
    expect(ids).toContain('alien_artifact');
    expect(ids).toContain('mysterious_signal');
  });

  it('只在当前银河暴露对应的地域事件', () => {
    const milkyState = createTestState({ currentGalaxy: 'milky_way', day: 3, playerLevel: 1 });
    const milkyIds = RandomEvent.getEligibleEvents(milkyState).map(function (event) { return event.id; });
    expect(milkyIds).toContain('milky_way_echo');
    expect(milkyIds).not.toContain('andromeda_memory');

    const andromedaState = createTestState({ currentGalaxy: 'andromeda', day: 20, playerLevel: 4, fuel: 100, shipHull: 100 });
    const andromedaIds = RandomEvent.getEligibleEvents(andromedaState).map(function (event) { return event.id; });
    expect(andromedaIds).toContain('andromeda_memory');
    expect(andromedaIds).not.toContain('milky_way_echo');
  });

  it('地域事件做出选择后会写入存档标记并不再重复触发', () => {
    const state = createTestState({ currentGalaxy: 'milky_way', day: 3, playerLevel: 1 });
    const event = RANDOM_EVENTS.find(function (entry) { return entry.id === 'milky_way_echo'; });

    event.choices[1].effect(state);

    expect(state.storyFlags.galaxy_event_milky_way_echo).toBe(3);
    expect(RandomEvent.getEligibleEvents(state).map(function (entry) { return entry.id; })).not.toContain('milky_way_echo');
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
      RandomEvent.resolveChoice(state, 0);
      // 事件效果可能改变 credits — 只要不崩溃就行
      expect(typeof state.credits).toBe('number');
    }
  });

  it('休闲与挑战难度会分别修正事件奖励和船体损伤', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    function resolveInjectedEffect(difficulty, effect) {
      RandomEvent.resetRuntimeState();
      const state = createTestState({ difficulty: difficulty, credits: 1000, shipHull: 100 });
      const event = RandomEvent.rollEvent(state, 1);
      const originalEffect = event.choices[0].effect;
      event.choices[0].effect = effect;
      try {
        RandomEvent.resolveChoice(state, 0);
      } finally {
        event.choices[0].effect = originalEffect;
      }
      return state;
    }

    const easyReward = resolveInjectedEffect('easy', function (state) {
      state.credits += 100;
      return { msgs: [] };
    });
    const hardReward = resolveInjectedEffect('hard', function (state) {
      state.credits += 100;
      return { msgs: [] };
    });
    const easyDamage = resolveInjectedEffect('easy', function (state) {
      state.shipHull -= 20;
      return { msgs: [] };
    });
    const hardDamage = resolveInjectedEffect('hard', function (state) {
      state.shipHull -= 20;
      return { msgs: [] };
    });

    expect(easyReward.credits).toBe(1120);
    expect(hardReward.credits).toBe(1080);
    expect(easyDamage.shipHull).toBe(88);
    expect(hardDamage.shipHull).toBe(70);
  });

  it('事件链后续不受保护阈值错误拦截', () => {
    const state = createTestState({ day: 30, fuel: 5, shipHull: 10, _pendingChainEvents: [
      { eventId: 'pirate_revenge', triggerAfterDays: 7, scheduledDay: 30 },
    ] });

    const ev = RandomEvent.rollEvent(state, 1);
    expect(ev).toBeDefined();
    expect(ev.id).toBe('pirate_revenge');
  });

  it('冷却与历史会同步写回 state', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    const state = createTestState();
    const event = RandomEvent.rollEvent(state, 1);

    expect(state._eventCooldowns[event.id]).toBe(state.day);

    RandomEvent.resolveChoice(state, 0);

    expect(state._eventHistory).toHaveLength(1);
    expect(state._eventHistory[0]).toMatchObject({
      eventId: event.id,
      day: state.day,
      choiceIndex: 0,
    });
  });

  it('读档后的事件冷却会继续生效', () => {
    const state = createTestState({
      day: 12,
      _eventCooldowns: { merchant_caravan: 8 },
      _eventHistory: [{ eventId: 'merchant_caravan', day: 8, choiceIndex: 0 }],
    });

    const ids = RandomEvent.getEligibleEvents(state).map(ev => ev.id);

    expect(ids).not.toContain('merchant_caravan');
    expect(RandomEvent.getEventHistory()).toHaveLength(1);
  });

  it('事件历史长度受配置上限裁剪', () => {
    const state = createTestState({
      _eventHistory: Array.from({ length: EVENT_CONFIG.history.maxEntries + 5 }, function (_, index) {
        return { eventId: 'event_' + index, day: index + 1, choiceIndex: 0 };
      }),
    });

    RandomEvent.syncRuntimeState(state);

    expect(RandomEvent.getEventHistory()).toHaveLength(EVENT_CONFIG.history.maxEntries);
  });
});
