import { describe, expect, it, vi } from 'vitest';
import {
  createAchievementRuntimeController,
  ensureAchievementState,
} from '../js/core/AchievementRuntimeController.js';

function deferred() {
  var resolve;
  var reject;
  var promise = new Promise(function (resolvePromise, rejectPromise) {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise: promise, reject: reject, resolve: resolve };
}

function createHarness(overrides) {
  var options = overrides || {};
  var state = options.state || { achievements: [] };
  var revision = 1;
  var trace = [];
  var runtime = options.runtime || {
    init: vi.fn(function () { trace.push('init'); }),
    checkAll: vi.fn(function () {
      trace.push('check');
      return {
        msgs: [{ text: '解锁成就', type: 'success' }],
        newlyUnlocked: ['first-trade'],
      };
    }),
  };
  var loadRuntime = options.loadRuntime || vi.fn(function () { return Promise.resolve(runtime); });
  var controller = createAchievementRuntimeController({
    getState: function () { return state; },
    getSessionToken: function () { return { state: state, revision: revision }; },
    isSessionTokenCurrent: function (token) {
      return !!token && token.state === state && token.revision === revision;
    },
    loadRuntime: loadRuntime,
    emitMessage: function (message) { trace.push(['message', message]); },
    invalidate: function () { trace.push('invalidate'); },
    checkVictory: function () { trace.push('victory'); },
    reportFailure: function (error) { trace.push(['failure', error]); },
  });

  return {
    controller: controller,
    getState: function () { return state; },
    loadRuntime: loadRuntime,
    replaceState: function (nextState) {
      state = nextState;
      revision += 1;
    },
    runtime: runtime,
    trace: trace,
  };
}

describe('AchievementRuntimeController', function () {
  it('只修复非法成就字段，不覆盖已有进度', function () {
    var valid = { achievements: ['first-trade'] };
    var missing = {};
    var invalid = { achievements: 'broken' };

    expect(ensureAchievementState(valid)).toBe(false);
    expect(valid.achievements).toEqual(['first-trade']);
    expect(ensureAchievementState(missing)).toBe(true);
    expect(missing.achievements).toEqual([]);
    expect(ensureAchievementState(invalid)).toBe(true);
    expect(invalid.achievements).toEqual([]);
    expect(ensureAchievementState(null)).toBe(false);
  });

  it('合并并发检查，并按日志、视图失效、胜利检查的顺序提交解锁结果', async function () {
    var pending = deferred();
    var harness = createHarness({ loadRuntime: vi.fn(function () { return pending.promise; }) });

    var first = harness.controller.queueCheck();
    var second = harness.controller.queueCheck();

    expect(first).toBe(second);
    await Promise.resolve();
    expect(harness.loadRuntime).toHaveBeenCalledOnce();
    expect(harness.controller.getDiagnostics().queued).toBe(true);

    pending.resolve(harness.runtime);
    await expect(first).resolves.toEqual(expect.objectContaining({ newlyUnlocked: ['first-trade'] }));
    expect(harness.trace).toEqual([
      'init',
      'check',
      ['message', { text: '解锁成就', type: 'success' }],
      'invalidate',
      'victory',
    ]);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      checkCount: 1,
      queued: false,
      requestCount: 1,
    }));
  });

  it('没有新解锁时仍发布消息，但不触发重绘与胜利检查', async function () {
    var runtime = {
      init: vi.fn(),
      checkAll: vi.fn(function () {
        return { msgs: [{ text: '已检查', type: 'info' }], newlyUnlocked: [] };
      }),
    };
    var harness = createHarness({ runtime: runtime });

    await harness.controller.queueCheck();

    expect(harness.trace).toEqual([['message', { text: '已检查', type: 'info' }]]);
  });

  it('会话替换后丢弃迟到模块，不初始化旧 state 或发布旧结果', async function () {
    var pending = deferred();
    var harness = createHarness({ loadRuntime: vi.fn(function () { return pending.promise; }) });
    var operation = harness.controller.queueCheck();
    await Promise.resolve();

    harness.replaceState({ achievements: [] });
    pending.resolve(harness.runtime);

    await expect(operation).resolves.toBe(false);
    expect(harness.runtime.init).not.toHaveBeenCalled();
    expect(harness.runtime.checkAll).not.toHaveBeenCalled();
    expect(harness.trace).toEqual([]);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      staleDropCount: 1,
      queued: false,
    }));
  });

  it('reset 后旧请求不能清除或提交新的检查请求', async function () {
    var firstLoad = deferred();
    var secondLoad = deferred();
    var loads = 0;
    var harness = createHarness({
      loadRuntime: vi.fn(function () {
        loads += 1;
        return loads === 1 ? firstLoad.promise : secondLoad.promise;
      }),
    });

    var first = harness.controller.queueCheck();
    await Promise.resolve();
    harness.controller.reset();
    var second = harness.controller.queueCheck();
    await Promise.resolve();

    firstLoad.resolve(harness.runtime);
    await expect(first).resolves.toBe(false);
    expect(harness.controller.getDiagnostics().queued).toBe(true);
    expect(harness.runtime.checkAll).not.toHaveBeenCalled();

    secondLoad.resolve(harness.runtime);
    await expect(second).resolves.toEqual(expect.objectContaining({ newlyUnlocked: ['first-trade'] }));
    expect(harness.runtime.checkAll).toHaveBeenCalledOnce();
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      queued: false,
      requestCount: 2,
      resetCount: 1,
      staleDropCount: 1,
    }));
  });

  it('加载失败会释放队列并允许重试，dispose 后不再启动工作', async function () {
    var error = new Error('achievement unavailable');
    var runtime = {
      init: vi.fn(),
      checkAll: vi.fn(function () { return { msgs: [], newlyUnlocked: [] }; }),
    };
    var attempts = 0;
    var harness = createHarness({
      runtime: runtime,
      loadRuntime: vi.fn(function () {
        attempts += 1;
        return attempts === 1 ? Promise.reject(error) : Promise.resolve(runtime);
      }),
    });

    await expect(harness.controller.queueCheck()).resolves.toBe(false);
    expect(harness.trace).toEqual([['failure', error]]);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      failureCount: 1,
      queued: false,
    }));

    await expect(harness.controller.queueCheck()).resolves.toEqual(expect.objectContaining({ newlyUnlocked: [] }));
    expect(runtime.checkAll).toHaveBeenCalledOnce();
    harness.controller.dispose();
    await expect(harness.controller.queueCheck()).resolves.toBe(false);
    expect(harness.loadRuntime).toHaveBeenCalledTimes(2);
    expect(harness.controller.getDiagnostics().disposed).toBe(true);
  });
});
