import { describe, expect, it, vi } from 'vitest';
import { createGameSessionLifecycle } from '../js/core/GameSessionLifecycle.js';

function createHarness(overrides) {
  var trace = [];
  var state = { id: 'old' };
  var revision = 0;
  var currentToken = { state: state, revision: revision };
  var config = overrides || {};
  var lifecycle = createGameSessionLifecycle({
    replaceState: function (nextState, reason) {
      trace.push('replace:' + reason);
      state = nextState;
      revision += 1;
      currentToken = { state: state, revision: revision };
      return state;
    },
    getSessionToken: function () { return currentToken; },
    isSessionTokenCurrent: function (token) {
      return token === currentToken && token.state === state && token.revision === revision;
    },
    runtime: {
      restore: function (nextState, options) {
        trace.push('restore:' + nextState.id + ':' + options.reason);
        return { state: nextState, options: options };
      },
    },
    clock: {
      stop: function () { trace.push('stop'); },
      start: function () { trace.push('start'); },
    },
    hooks: {
      resetTransients: function () { trace.push('reset-transients'); },
      prepareState: function (nextState, context) {
        trace.push('prepare:' + (context.restoreRandomRuntime ? 'restore' : 'reset'));
      },
      syncProjections: config.syncProjections || function () { trace.push('sync-projections'); },
      render: function () { trace.push('render'); },
      resumeRecurring: function () { trace.push('resume-recurring'); },
      restorePendingEvent: function () { trace.push('restore-pending'); },
    },
  });
  return {
    lifecycle: lifecycle,
    trace: trace,
    replaceOutsideLifecycle: function (nextState) {
      state = nextState;
      revision += 1;
      currentToken = { state: state, revision: revision };
    },
  };
}

describe('GameSessionLifecycle', function () {
  it('统一执行 stop → replace/restore → projection/render → recurring/clock/pending 顺序', function () {
    var harness = createHarness();
    var nextState = { id: 'loaded' };

    var result = harness.lifecycle.transition(nextState, {
      reason: 'manual-load',
      mode: 'manual-load',
      restoreEconomy: true,
      restoreGalaxy: true,
      restoreRandomRuntime: true,
      restorePendingEvent: true,
    });

    expect(result.state).toBe(nextState);
    expect(harness.trace).toEqual([
      'stop',
      'reset-transients',
      'replace:manual-load',
      'prepare:restore',
      'restore:loaded:manual-load',
      'sync-projections',
      'render',
      'resume-recurring',
      'start',
      'restore-pending',
    ]);
    expect(harness.lifecycle.getDiagnostics().phase).toBe('running');
  });

  it('允许冷启动先恢复系统，等 UI 壳完成后再 present', function () {
    var harness = createHarness();
    var nextState = { id: 'fresh' };
    var transition = harness.lifecycle.begin(nextState, {
      reason: 'new-game',
      mode: 'new-game',
      restoreEconomy: false,
      restoreGalaxy: false,
      restoreRandomRuntime: false,
    });

    expect(harness.trace).toEqual([
      'stop',
      'reset-transients',
      'replace:new-game',
      'prepare:reset',
      'restore:fresh:new-game',
    ]);
    expect(harness.lifecycle.getDiagnostics().phase).toBe('restored');

    harness.lifecycle.present(transition);
    expect(harness.trace.slice(-4)).toEqual([
      'sync-projections',
      'render',
      'resume-recurring',
      'start',
    ]);
  });

  it('同一 transition 只 present 一次，避免重复 RAF 与派遣计时器', function () {
    var harness = createHarness();
    var transition = harness.lifecycle.begin({ id: 'once' }, { reason: 'restore-autosave' });

    var first = harness.lifecycle.present(transition);
    var second = harness.lifecycle.present(transition);

    expect(second).toBe(first);
    expect(harness.trace.filter(function (item) { return item === 'start'; })).toHaveLength(1);
    expect(harness.trace.filter(function (item) { return item === 'resume-recurring'; })).toHaveLength(1);
  });

  it('拒绝向已被替换的 session token 提交投影与计时器', function () {
    var harness = createHarness();
    var transition = harness.lifecycle.begin({ id: 'stale' }, { reason: 'manual-load' });
    harness.replaceOutsideLifecycle({ id: 'newer' });

    expect(harness.lifecycle.present(transition)).toBeNull();
    expect(harness.trace).not.toContain('sync-projections');
    expect(harness.trace).not.toContain('start');
    expect(harness.lifecycle.getDiagnostics().phase).toBe('stale');
  });

  it('投影失败时重新停表，不让半恢复会话继续推进', function () {
    var failure = new Error('projection failed');
    var harness = createHarness({
      syncProjections: vi.fn(function () { throw failure; }),
    });
    var transition = harness.lifecycle.begin({ id: 'broken' }, { reason: 'manual-load' });

    expect(function () { harness.lifecycle.present(transition); }).toThrow(failure);
    expect(harness.trace.filter(function (item) { return item === 'stop'; })).toHaveLength(2);
    expect(harness.trace).not.toContain('start');
    expect(harness.lifecycle.getDiagnostics().phase).toBe('error');
  });

  it('dispose 清理全部计时，并拒绝后续 session replace', function () {
    var harness = createHarness();
    harness.lifecycle.dispose();

    expect(harness.trace).toEqual(['stop']);
    expect(harness.lifecycle.getDiagnostics().disposed).toBe(true);
    expect(function () {
      harness.lifecycle.begin({ id: 'late' });
    }).toThrow(/disposed/);
  });
});
