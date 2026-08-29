import { describe, expect, it, vi } from 'vitest';
import { createGamePersistenceController } from '../js/core/GamePersistenceController.js';
import { SAVE_COMMAND } from '../js/core/SaveCommand.js';

function createHarness(options) {
  var config = options || {};
  var state = config.state || { id: 'session-a' };
  var revision = 1;
  var trace = [];
  var store = {
    saveGame: vi.fn(function (slotId, targetState, saveOptions) {
      trace.push(['save', slotId, targetState.id, saveOptions || null]);
      return config.saveResult || { ok: true, msg: '保存完成' };
    }),
    loadGame: vi.fn(function (slotId) {
      trace.push(['load', slotId]);
      return config.loadResult || { ok: true, msg: '读取完成', state: { id: 'loaded' } };
    }),
    deleteSlot: vi.fn(function (slotId) { trace.push(['delete', slotId]); }),
  };
  var controller = createGamePersistenceController({
    store: store,
    getState: function () { return state; },
    getSessionToken: function () { return { state: state, revision: revision }; },
    isSessionTokenCurrent: function (token) {
      return !!token && token.state === state && token.revision === revision;
    },
    captureRuntime: function (targetState, captureOptions) {
      trace.push(['capture', targetState.id, captureOptions.reason, captureOptions.sessionToken.revision]);
      return { captured: true };
    },
    transitionState: function (nextState, transitionOptions) {
      trace.push(['transition', nextState.id, transitionOptions]);
      state = nextState;
      revision += 1;
      return { transitioned: true };
    },
    startFreshSession: function (reason) {
      trace.push(['start-fresh', reason]);
      return { started: reason };
    },
    resetTutorial: function () { trace.push('reset-tutorial'); },
    hideSettings: function () { trace.push('hide-settings'); },
    emitMessage: function (message) { trace.push(['message', message]); },
    invalidateSaveUi: function () { trace.push('invalidate-save'); },
  });

  return {
    controller: controller,
    getState: function () { return state; },
    getToken: function () { return { state: state, revision: revision }; },
    replaceState: function (nextState) {
      state = nextState;
      revision += 1;
    },
    store: store,
    trace: trace,
  };
}

describe('GamePersistenceController', function () {
  it('只为当前 session 捕获运行时快照，并把原 token 传给 runtime', function () {
    var harness = createHarness();
    var state = harness.getState();
    var token = harness.getToken();

    expect(harness.controller.captureState(state, {
      reason: 'travel-autosave',
      sessionToken: token,
    })).toEqual({ captured: true });
    expect(harness.trace).toEqual([['capture', 'session-a', 'travel-autosave', 1]]);

    harness.replaceState({ id: 'session-b' });
    expect(harness.controller.captureState(state, {
      reason: 'late-callback',
      sessionToken: token,
    })).toBeNull();
    expect(harness.controller.captureState(null, { sessionToken: null })).toBeNull();
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      captureCount: 1,
      staleDropCount: 2,
    }));
  });

  it('自动存档固定写入 0 号槽，并从 Save 选项剥离 session token', function () {
    var harness = createHarness();
    var state = harness.getState();
    var token = harness.getToken();

    var result = harness.controller.saveAutosave(state, {
      reason: 'realtime-day',
      sessionToken: token,
      timestampMs: 123,
    });

    expect(result).toEqual({ ok: true, msg: '保存完成' });
    expect(harness.trace).toEqual([
      ['save', 0, 'session-a', { reason: 'realtime-day', timestampMs: 123, isAutosave: true }],
    ]);
    expect(harness.controller.getDiagnostics().autosaveCount).toBe(1);
  });

  it('手动保存严格按 capture → save → message → invalidate 提交', function () {
    var harness = createHarness();

    expect(harness.controller.saveSlot(2)).toEqual({ ok: true, msg: '保存完成' });
    expect(harness.trace).toEqual([
      ['capture', 'session-a', 'manual-save', 1],
      ['save', 2, 'session-a', null],
      ['message', { text: '保存完成', type: 'info' }],
      'invalidate-save',
    ]);
    expect(harness.controller.getDiagnostics().manualSaveCount).toBe(1);
  });

  it('手动保存失败仍发布错误并刷新存档工作区', function () {
    var harness = createHarness({ saveResult: { ok: false, msg: '空间不足' } });

    expect(harness.controller.saveSlot(1)).toEqual({ ok: false, msg: '空间不足' });
    expect(harness.trace.slice(-2)).toEqual([
      ['message', { text: '空间不足', type: 'error' }],
      'invalidate-save',
    ]);
  });

  it('通过 typed command 统一路由手动保存与读取并拒绝非法输入', function () {
    var harness = createHarness({ loadResult: { ok: false, msg: '槽位为空' } });

    expect(harness.controller.handleCommand({
      type: SAVE_COMMAND.SAVE_SLOT,
      slotId: '2',
    })).toEqual({ ok: true, msg: '保存完成' });
    expect(harness.controller.handleCommand({
      type: SAVE_COMMAND.LOAD_SLOT,
      slotId: 3,
    })).toEqual({ ok: false, msg: '槽位为空' });
    expect(harness.controller.handleCommand({ type: SAVE_COMMAND.LOAD_SLOT, slotId: -1 })).toBe(false);
    expect(harness.controller.handleCommand({ type: 'save.unknown', slotId: 1 })).toBe(false);
    expect(harness.store.saveGame).toHaveBeenCalledWith(2, expect.any(Object));
    expect(harness.store.loadGame).toHaveBeenCalledWith(3);
  });

  it('成功读档先关闭设置，再通过统一生命周期恢复并发布结果', function () {
    var loadedState = { id: 'loaded-session' };
    var harness = createHarness({ loadResult: { ok: true, msg: '读取完成', state: loadedState } });

    expect(harness.controller.loadSlot(3)).toEqual({ ok: true, msg: '读取完成', state: loadedState });
    expect(harness.trace).toEqual([
      ['load', 3],
      'hide-settings',
      ['transition', 'loaded-session', {
        reason: 'manual-load',
        mode: 'manual-load',
        restoreEconomy: true,
        restoreGalaxy: true,
        restoreRandomRuntime: true,
        syncDifficulty: true,
        restorePendingEvent: true,
      }],
      ['message', { text: '读取完成', type: 'info' }],
    ]);
    expect(harness.getState()).toBe(loadedState);
  });

  it('读档失败不关闭设置或切换 session，只发布存储错误', function () {
    var harness = createHarness({ loadResult: { ok: false, msg: '槽位为空' } });

    expect(harness.controller.loadSlot(3)).toEqual({ ok: false, msg: '槽位为空' });
    expect(harness.trace).toEqual([
      ['load', 3],
      ['message', { text: '槽位为空', type: 'error' }],
    ]);
    expect(harness.getState().id).toBe('session-a');
  });

  it('清空槽位与重开会话由同一持久化 owner 执行', function () {
    var harness = createHarness();

    expect(harness.controller.clearAllSlots()).toBe(4);
    expect(harness.controller.restart('victory-restart')).toEqual({ started: 'victory-restart' });
    expect(harness.trace).toEqual([
      ['delete', 0],
      ['delete', 1],
      ['delete', 2],
      ['delete', 3],
      ['message', { text: '🗑 本地存档已全部清空。', type: 'info' }],
      'invalidate-save',
      'reset-tutorial',
      ['delete', 0],
      ['start-fresh', 'victory-restart'],
    ]);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      clearCount: 1,
      restartCount: 1,
    }));
  });
});
