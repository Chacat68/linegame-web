import { describe, expect, it } from 'vitest';
import { createFleetDispatchSession } from '../js/ui/FleetDispatchSession.js';

describe('FleetDispatchSession', function () {
  it('拒绝无效草案，并记录不创建半开会话的打开状态', function () {
    var session = createFleetDispatchSession();
    expect(session.open(null, 'inline')).toBe(false);
    session.noteOpenStatus('invalid-request');
    expect(session.getDiagnostics()).toEqual(expect.objectContaining({
      activeContext: null,
      lastOpenStatus: 'invalid-request',
      openCount: 0,
    }));
  });

  it('独占草案更新并返回隔离、冻结的 diagnostics', function () {
    var session = createFleetDispatchSession();
    var policy = { riskMode: 'balanced', marketMode: 'open' };
    expect(session.open({ shipIndex: 1, buySystemId: 'alpha', tradePolicy: policy }, 'inline')).toBe(true);
    policy.riskMode = 'aggressive';
    session.update({
      sellSystemId: 'beta',
      goodId: 'food',
      tradePolicy: { riskMode: 'safe', marketMode: 'open' },
      status: 'ready',
    });
    session.markEstimateUpdated();
    session.markCommandSubmitted();

    var active = session.getActiveContext();
    active.tradePolicy.riskMode = 'mutated-copy';
    expect(session.getActiveContext()).toMatchObject({
      shipIndex: 1,
      buySystemId: 'alpha',
      sellSystemId: 'beta',
      goodId: 'food',
      tradePolicy: { riskMode: 'safe', marketMode: 'open' },
      status: 'ready',
    });
    var diagnostics = session.getDiagnostics();
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.activeContext)).toBe(true);
    expect(Object.isFrozen(diagnostics.activeContext.tradePolicy)).toBe(true);
    expect(diagnostics).toEqual(expect.objectContaining({
      openCount: 1,
      estimateUpdateCount: 1,
      commandSubmitCount: 1,
      lastOpenStatus: 'inline',
    }));
  });

  it('close 与 reset 维护可预测的生命周期计数', function () {
    var session = createFleetDispatchSession();
    session.open({ shipIndex: 0 }, 'blocking');
    expect(session.close('cancel')).toBe(true);
    expect(session.close('noop')).toBe(false);
    expect(session.getDiagnostics()).toEqual(expect.objectContaining({
      activeContext: null,
      closeCount: 1,
      lastCloseReason: 'noop',
    }));
    expect(session.reset()).toEqual(expect.objectContaining({
      closeCount: 0,
      openCount: 0,
      resetCount: 1,
      lastOpenStatus: 'idle',
      lastCloseReason: null,
    }));
  });
});
