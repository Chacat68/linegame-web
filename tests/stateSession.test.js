import { describe, expect, it, vi } from 'vitest';
import { createStateSession } from '../js/core/StateSession.js';

describe('StateSession', function () {
  it('单调替换 state 并发布可追踪的 revision', function () {
    var first = { id: 'first' };
    var second = { id: 'second' };
    var listener = vi.fn();
    var session = createStateSession(first);
    session.subscribe(listener);

    expect(session.getState()).toBe(first);
    expect(session.getRevision()).toBe(0);
    var change = session.replace(second, { reason: 'manual-load' });

    expect(session.getState()).toBe(second);
    expect(session.getRevision()).toBe(1);
    expect(change).toMatchObject({ reason: 'manual-load', previousState: first, state: second, revision: 1 });
    expect(listener).toHaveBeenCalledWith(change);
  });

  it('用 state 引用和 revision 双重校验延迟任务', function () {
    var session = createStateSession({ id: 'first' });
    var token = session.getToken();

    expect(session.isCurrent(token)).toBe(true);
    session.replace({ id: 'second' });
    expect(session.isCurrent(token)).toBe(false);
    expect(session.isCurrent(session.getToken())).toBe(true);
  });

  it('隔离失败订阅者，state 提交和其它投影通知仍会完成', function () {
    var reported = [];
    var received = [];
    var nextState = { id: 'loaded' };
    var session = createStateSession({ id: 'first' }, {
      onSubscriberError: function (error, change) {
        reported.push([error.message, change.state]);
      },
    });
    session.subscribe(function () { throw new Error('broken projection'); });
    session.subscribe(function (change) { received.push(change); });

    expect(function () { session.replace(nextState, { reason: 'manual-load' }); }).not.toThrow();
    expect(session.getState()).toBe(nextState);
    expect(session.getRevision()).toBe(1);
    expect(received).toHaveLength(1);
    expect(reported).toEqual([['broken projection', nextState]]);
  });
});
