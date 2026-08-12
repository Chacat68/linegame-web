import { describe, expect, it, vi } from 'vitest';
import { createGameClockController } from '../js/core/GameClockController.js';
import * as GameTime from '../js/systems/time/GameTimeSystem.js';

function createScheduler(startedAt) {
  var currentNow = startedAt || 0;
  var nextId = 1;
  var callbacks = new Map();
  var cancelled = [];
  var intervals = new Map();
  var timeouts = new Map();
  var nextTimerId = 100;
  return {
    now: function () { return currentNow; },
    requestFrame: vi.fn(function (callback) {
      var id = nextId++;
      callbacks.set(id, callback);
      return id;
    }),
    cancelFrame: vi.fn(function (id) {
      cancelled.push(id);
      callbacks.delete(id);
    }),
    setInterval: vi.fn(function (callback, intervalMs) {
      var id = nextTimerId++;
      intervals.set(id, { callback: callback, intervalMs: intervalMs });
      return id;
    }),
    clearInterval: vi.fn(function (id) { intervals.delete(id); }),
    setTimeout: vi.fn(function (callback) {
      var id = nextTimerId++;
      timeouts.set(id, callback);
      return id;
    }),
    clearTimeout: vi.fn(function (id) { timeouts.delete(id); }),
    advanceFrame: function (timestamp) {
      currentNow = timestamp;
      var entry = callbacks.entries().next().value;
      if (!entry) return false;
      callbacks.delete(entry[0]);
      entry[1](timestamp);
      return true;
    },
    pendingCount: function () { return callbacks.size; },
    flushTimeouts: function () {
      var pending = Array.from(timeouts.values());
      timeouts.clear();
      pending.forEach(function (callback) { callback(); });
    },
    fireIntervals: function () {
      Array.from(intervals.values()).forEach(function (entry) { entry.callback(); });
    },
    intervalCount: function () { return intervals.size; },
    timeoutCount: function () { return timeouts.size; },
    cancelled: cancelled,
  };
}

function createController(options) {
  var config = options || {};
  return createGameClockController({
    getState: config.getState || function () { return config.state || null; },
    getDayDurationMs: config.getDayDurationMs || function () { return 100; },
    isPaused: config.isPaused || function () { return false; },
    getHullSnapshot: function (state) { return state ? state.shipHull : 100; },
    onElapsedDays: config.onElapsedDays,
    renderFrame: config.renderFrame,
    clockMath: GameTime,
    scheduler: config.scheduler,
  });
}

describe('GameClockController', function () {
  it('start 立即渲染并始终只保留一个 RAF，重复 start 会取消旧帧', function () {
    var scheduler = createScheduler(40);
    var renderFrame = vi.fn();
    var controller = createController({
      state: { shipHull: 100 },
      scheduler: scheduler,
      renderFrame: renderFrame,
    });

    controller.start();
    expect(renderFrame).toHaveBeenCalledWith(expect.any(Object), 40);
    expect(scheduler.pendingCount()).toBe(1);

    controller.start();
    expect(scheduler.cancelFrame).toHaveBeenCalledTimes(1);
    expect(scheduler.pendingCount()).toBe(1);
    expect(controller.getSnapshot()).toMatchObject({ running: true, frameScheduled: true });
  });

  it('无 RAF scheduler 时执行首帧后进入 stopped，避免假 running 状态', function () {
    var renderFrame = vi.fn();
    var controller = createController({
      state: { shipHull: 100 },
      scheduler: {
        now: function () { return 12; },
        requestFrame: function () { return null; },
        cancelFrame: function () {},
      },
      renderFrame: renderFrame,
    });

    controller.start();

    expect(renderFrame).toHaveBeenCalledOnce();
    expect(controller.getSnapshot()).toMatchObject({ running: false, frameScheduled: false, frameId: null });
  });

  it('每一帧重新读取当前 StateSession state，不向新会话提交旧引用', function () {
    var scheduler = createScheduler(0);
    var first = { id: 'first', shipHull: 100 };
    var loaded = { id: 'loaded', shipHull: 90 };
    var current = first;
    var rendered = [];
    var controller = createController({
      scheduler: scheduler,
      getState: function () { return current; },
      renderFrame: function (state) { rendered.push(state); },
    });

    controller.start();
    current = loaded;
    scheduler.advanceFrame(50);

    expect(rendered).toEqual([first, loaded]);
    expect(scheduler.pendingCount()).toBe(1);
  });

  it('stop 后替换会话再 start，只从新 state 建立时钟和首帧', function () {
    var scheduler = createScheduler(0);
    var first = { id: 'first', shipHull: 100 };
    var loaded = { id: 'loaded', shipHull: 65 };
    var current = first;
    var rendered = [];
    var controller = createController({
      scheduler: scheduler,
      getState: function () { return current; },
      renderFrame: function (state) { rendered.push(state); },
    });

    controller.start();
    controller.stop();
    current = loaded;
    controller.start();

    expect(rendered).toEqual([first, loaded]);
    expect(controller.getSnapshot().clock.lastHullSnapshot).toBe(65);
    expect(scheduler.pendingCount()).toBe(1);
  });

  it('新会话 start 不继承旧 state 未满一天的累计余量', function () {
    var scheduler = createScheduler(0);
    var current = { id: 'first', shipHull: 100 };
    var elapsed = [];
    var controller = createController({
      scheduler: scheduler,
      getState: function () { return current; },
      onElapsedDays: function (days) { elapsed.push(days); },
    });

    controller.start();
    scheduler.advanceFrame(50);
    expect(controller.getSnapshot().clock.accumulatedMs).toBe(50);

    controller.stop();
    current = { id: 'loaded', shipHull: 70 };
    controller.start();
    expect(controller.getSnapshot().clock.accumulatedMs).toBe(0);
    scheduler.advanceFrame(50);
    expect(elapsed).toEqual([]);
  });

  it('已出队的旧 RAF callback 不会清除或扩展新会话帧链', function () {
    var now = 0;
    var callbacks = new Map();
    var nextId = 1;
    var renderFrame = vi.fn();
    var scheduler = {
      now: function () { return now; },
      requestFrame: vi.fn(function (callback) {
        var id = nextId++;
        callbacks.set(id, callback);
        return id;
      }),
      // 故意不从 callbacks 删除，模拟 callback 已被浏览器排入任务队列。
      cancelFrame: vi.fn(),
    };
    var controller = createController({
      state: { shipHull: 100 },
      scheduler: scheduler,
      renderFrame: renderFrame,
    });

    controller.start();
    var staleId = controller.getSnapshot().frameId;
    controller.start();
    var currentId = controller.getSnapshot().frameId;
    expect(currentId).not.toBe(staleId);

    callbacks.get(staleId)(10);
    expect(controller.getSnapshot().frameId).toBe(currentId);
    expect(scheduler.requestFrame).toHaveBeenCalledTimes(2);
    expect(renderFrame).toHaveBeenCalledTimes(2);

    callbacks.get(currentId)(20);
    expect(scheduler.requestFrame).toHaveBeenCalledTimes(3);
    expect(renderFrame).toHaveBeenCalledTimes(3);
  });

  it('按累计实时时间批量推进天数，并把可变 clock context 交给日结算 hook', function () {
    var scheduler = createScheduler(0);
    var elapsed = [];
    var state = { shipHull: 80 };
    var controller = createController({
      state: state,
      scheduler: scheduler,
      onElapsedDays: function (days, context) {
        elapsed.push(days);
        expect(context.state).toBe(state);
        context.clock.lastHullSnapshot = 75;
      },
    });

    controller.start();
    scheduler.advanceFrame(250);

    expect(elapsed).toEqual([2]);
    expect(controller.getSnapshot().clock.accumulatedMs).toBe(50);
    expect(controller.getSnapshot().clock.lastHullSnapshot).toBe(75);
  });

  it('暂停期间重置时间基线，恢复后不会补算暂停时长', function () {
    var scheduler = createScheduler(0);
    var paused = true;
    var onElapsedDays = vi.fn();
    var controller = createController({
      state: { shipHull: 100 },
      scheduler: scheduler,
      isPaused: function () { return paused; },
      onElapsedDays: onElapsedDays,
    });

    controller.start();
    scheduler.advanceFrame(1000);
    paused = false;
    scheduler.advanceFrame(1050);
    expect(onElapsedDays).not.toHaveBeenCalled();

    scheduler.advanceFrame(1100);
    expect(onElapsedDays).toHaveBeenCalledOnce();
    expect(onElapsedDays).toHaveBeenCalledWith(1, expect.objectContaining({ timestamp: 1100 }));
  });

  it('stop/dispose 取消待执行帧且停止后的旧 callback 不会重新排程', function () {
    var scheduler = createScheduler(0);
    var controller = createController({ state: { shipHull: 100 }, scheduler: scheduler });

    controller.start();
    var scheduledId = controller.getSnapshot().frameId;
    controller.stop();

    expect(scheduler.cancelFrame).toHaveBeenCalledWith(scheduledId);
    expect(scheduler.pendingCount()).toBe(0);
    expect(controller.getSnapshot().running).toBe(false);

    controller.dispose();
    expect(controller.getSnapshot()).toMatchObject({
      running: false,
      frameScheduled: false,
      lastTimestamp: null,
      clock: null,
    });
  });

  it('统一持有命名 recurring task，重启同名任务不会留下旧 interval/kickoff', function () {
    var scheduler = createScheduler(0);
    var first = vi.fn();
    var next = vi.fn();
    var paused = true;
    var controller = createController({
      state: { shipHull: 100 },
      scheduler: scheduler,
      isPaused: function () { return paused; },
    });

    expect(controller.startRecurring('dispatch', first, 5000)).toBe(true);
    expect(scheduler.intervalCount()).toBe(1);
    expect(scheduler.timeoutCount()).toBe(1);

    expect(controller.startRecurring('dispatch', next, 3000)).toBe(true);
    expect(scheduler.clearInterval).toHaveBeenCalledTimes(1);
    expect(scheduler.clearTimeout).toHaveBeenCalledTimes(1);
    expect(scheduler.intervalCount()).toBe(1);
    expect(scheduler.timeoutCount()).toBe(1);

    scheduler.flushTimeouts();
    scheduler.fireIntervals();
    expect(first).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();

    paused = false;
    scheduler.fireIntervals();
    expect(next).toHaveBeenCalledOnce();
    expect(controller.getSnapshot().recurringTasks).toEqual([{ id: 'dispatch', intervalMs: 3000 }]);
  });

  it('已出队的旧 interval callback 在同名任务替换后不会提交动作', function () {
    var scheduledCallbacks = [];
    var first = vi.fn();
    var next = vi.fn();
    var controller = createController({
      state: { shipHull: 100 },
      scheduler: {
        now: function () { return 0; },
        requestFrame: function () { return null; },
        cancelFrame: function () {},
        setInterval: function (callback) {
          scheduledCallbacks.push(callback);
          return scheduledCallbacks.length;
        },
        clearInterval: function () {},
        setTimeout: function () { return null; },
        clearTimeout: function () {},
      },
    });

    controller.startRecurring('dispatch', first, 5000, { immediate: false });
    var staleCallback = scheduledCallbacks[0];
    controller.startRecurring('dispatch', next, 3000, { immediate: false });

    staleCallback();
    scheduledCallbacks[1]();
    expect(first).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('stop/dispose 同时清理 RAF 和所有 recurring tasks', function () {
    var scheduler = createScheduler(0);
    var controller = createController({ state: { shipHull: 100 }, scheduler: scheduler });

    controller.start();
    controller.startRecurring('dispatch', vi.fn(), 5000);
    controller.startRecurring('telemetry', vi.fn(), 1000, { immediate: false });
    controller.stop();

    expect(scheduler.pendingCount()).toBe(0);
    expect(scheduler.intervalCount()).toBe(0);
    expect(scheduler.timeoutCount()).toBe(0);
    expect(controller.getSnapshot().recurringTasks).toEqual([]);
  });
});
