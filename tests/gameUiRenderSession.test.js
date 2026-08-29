import { describe, expect, it } from 'vitest';
import { createGameUiRenderSession } from '../js/ui/GameUiRenderSession.js';

describe('GameUiRenderSession', function () {
  it('按规范顺序去重记录区域并冻结事务快照', function () {
    var session = createGameUiRenderSession({ regionNames: ['market-spot', 'fleet-hangar', 'save'] });

    session.trace(function () {
      session.record(['fleet-hangar', 'market-spot', 'fleet-hangar']);
      session.record(['save', 'unknown']);
    });

    var snapshot = session.getSnapshot('fleet');
    expect(snapshot.workspaceRenders).toEqual({
      activeWorkspace: 'fleet',
      renderCounts: { 'market-spot': 1, 'fleet-hangar': 1, save: 1 },
      lastRenderedRegions: ['market-spot', 'fleet-hangar', 'save'],
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.workspaceRenders.renderCounts)).toBe(true);
  });

  it('追踪嵌套事务时只由最外层提交最后区域', function () {
    var session = createGameUiRenderSession({ regionNames: ['a', 'b'] });

    session.trace(function () {
      session.record(['b']);
      session.trace(function () { session.record(['a', 'b']); });
    });

    expect(session.getSnapshot().workspaceRenders.lastRenderedRegions).toEqual(['a', 'b']);
    expect(session.getSnapshot().workspaceRenders.renderCounts).toEqual({ a: 1, b: 2 });
  });

  it('reset 只清理工作区追踪，保留累计刷新与失效次数', function () {
    var session = createGameUiRenderSession({ regionNames: ['market'] });
    session.recordRenderAll();
    session.recordInvalidation(['shell']);
    session.record(['market']);

    var reset = session.resetWorkspaceTracking();

    expect(reset).toEqual({
      renderAllCount: 1,
      invalidationCount: 1,
      lastInvalidationRegions: [],
      workspaceRenders: {
        activeWorkspace: null,
        renderCounts: { market: 0 },
        lastRenderedRegions: [],
      },
    });
  });
});
