import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceContextAdapters } from '../js/ui/WorkspaceContextAdapters.js';

function createInspector() {
  var renderers = new Map();
  var contexts = new Map();
  return {
    renderers: renderers,
    registerRenderer: vi.fn(function (workspaceId, renderer) {
      renderers.set(workspaceId, renderer);
      return function () { renderers.delete(workspaceId); };
    }),
    replaceContext: vi.fn(function (context) {
      contexts.set(context.workspaceId, Object.freeze({ ...context }));
      return contexts.get(context.workspaceId);
    }),
    clearContext: vi.fn(function (workspaceId) { contexts.delete(workspaceId); }),
    getContext: vi.fn(function (workspaceId) { return contexts.get(workspaceId) || null; }),
    getCurrentRevision: function () { return 8; },
  };
}

describe('WorkspaceContextAdapters', function () {
  it('连接延迟市场和舰队 presenter，并复用同一模块注册', function () {
    var inspector = createInspector();
    var registry = createWorkspaceContextAdapters({ inspector: inspector });
    var market = { renderContextInspector: vi.fn(function () { return true; }) };
    var fleet = { renderContextInspector: vi.fn(function () { return true; }) };

    expect(registry.connectMarket(market)).toBe(true);
    expect(registry.connectMarket(market)).toBe(true);
    expect(registry.connectFleet(fleet)).toBe(true);
    expect(inspector.registerRenderer).toHaveBeenCalledTimes(2);
    inspector.renderers.get('trade')({ context: { type: 'commodity', id: 'food' } });
    inspector.renderers.get('fleet')({ context: { type: 'ship', id: '0' } });
    expect(market.renderContextInspector).toHaveBeenCalledOnce();
    expect(fleet.renderContextInspector).toHaveBeenCalledOnce();
  });

  it('按 archive context type 路由，不把未知对象交给错误 presenter', function () {
    var inspector = createInspector();
    var registry = createWorkspaceContextAdapters({ inspector: inspector });
    var archive = {
      QuestUI: { renderContextInspector: vi.fn(function () { return true; }) },
      ResearchUI: { renderContextInspector: vi.fn(function () { return true; }) },
    };
    registry.connectArchive(archive);
    var render = inspector.renderers.get('archive');

    expect(render({ context: { type: 'technology', id: 'warp_drive' } })).toBe(true);
    expect(archive.ResearchUI.renderContextInspector).toHaveBeenCalledOnce();
    expect(archive.QuestUI.renderContextInspector).not.toHaveBeenCalled();
    expect(render({ context: { type: 'unknown', id: 'x' } })).toBe(false);
  });

  it('同步不可变 key 时注入 revision，并避免重复替换', function () {
    var inspector = createInspector();
    var registry = createWorkspaceContextAdapters({ inspector: inspector });
    var selection = { type: 'commodity', id: 'food', source: 'market-card' };

    registry.syncSelection('trade', selection);
    registry.syncSelection('trade', selection);
    expect(inspector.replaceContext).toHaveBeenCalledOnce();
    expect(inspector.replaceContext).toHaveBeenCalledWith({
      workspaceId: 'trade',
      type: 'commodity',
      id: 'food',
      source: 'market-card',
      revision: 8,
    }, undefined);
  });
});
