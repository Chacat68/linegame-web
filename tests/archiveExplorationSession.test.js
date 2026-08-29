import { describe, expect, it } from 'vitest';
import { createArchiveExplorationSession } from '../js/ui/ArchiveExplorationSession.js';

describe('ArchiveExplorationSession', function () {
  it('保存字符串化焦点并公开冻结快照', function () {
    var session = createArchiveExplorationSession();
    expect(session.setFocus(42, 7)).toEqual({ systemId: '42', chainId: '7' });
    expect(session.getDiagnostics()).toEqual({
      focus: { systemId: '42', chainId: '7' },
      setCount: 1,
      resetCount: 0,
    });
    expect(Object.isFrozen(session.getFocus())).toBe(true);
    expect(Object.isFrozen(session.getDiagnostics())).toBe(true);
  });

  it('允许清空焦点，并在 reset 时清零会话计数', function () {
    var session = createArchiveExplorationSession();
    session.setFocus('sol_prime', 'chain-a');
    expect(session.setFocus(null)).toBeNull();
    expect(session.getDiagnostics().setCount).toBe(2);
    expect(session.reset()).toEqual({ focus: null, setCount: 0, resetCount: 1 });
  });
});
