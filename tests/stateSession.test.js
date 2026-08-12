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
});
