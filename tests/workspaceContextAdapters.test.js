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

function createDetailSurface() {
  var renderers = new Map();
  return {
    renderers: renderers,
    open: vi.fn(function () { return true; }),
    registerRenderer: vi.fn(function (type, renderer) {
      renderers.set(type, renderer);
      return function () { renderers.delete(type); };
    }),
  };
}

describe('WorkspaceContextAdapters', function () {
  it('连接市场、舰队和日志 presenter，并复用同一模块注册', function () {
    var inspector = createInspector();
    var detailSurface = createDetailSurface();
    var registry = createWorkspaceContextAdapters({ inspector: inspector, detailSurface: detailSurface });
    var market = {
      renderContextInspector: vi.fn(function () { return { title: '商品检查' }; }),
      renderWorkspaceDetail: vi.fn(function () { return { title: '商品详情' }; }),
    };
    var fleet = {
      renderContextInspector: vi.fn(function () { return { title: '舰船检查' }; }),
      renderWorkspaceDetail: vi.fn(function () { return { title: '舰船详情' }; }),
    };
    var logs = { renderContextInspector: vi.fn(function () { return true; }) };

    expect(registry.connectMarket(market)).toBe(true);
    expect(registry.connectMarket(market)).toBe(true);
    expect(registry.connectFleet(fleet)).toBe(true);
    expect(registry.connectLogs(logs)).toBe(true);
    expect(registry.connectLogs(logs)).toBe(true);
    expect(inspector.registerRenderer).toHaveBeenCalledTimes(3);
    var marketResult = inspector.renderers.get('trade')({ context: { type: 'commodity', id: 'food' } });
    var fleetResult = inspector.renderers.get('fleet')({ context: { type: 'ship', id: '0' } });
    inspector.renderers.get('logs')({ context: { type: 'message', id: 'message-1' } });
    expect(market.renderContextInspector).toHaveBeenCalledOnce();
    expect(fleet.renderContextInspector).toHaveBeenCalledOnce();
    expect(logs.renderContextInspector).toHaveBeenCalledOnce();
    expect(detailSurface.registerRenderer).toHaveBeenCalledTimes(2);
    expect(Array.from(detailSurface.renderers.keys())).toEqual(['trade-commodity', 'fleet-ship']);
    var trigger = { focus: vi.fn() };
    expect(marketResult.onAction({
      action: 'open-detail',
      context: { type: 'commodity', id: 'food' },
      target: trigger,
    })).toBe(true);
    expect(detailSurface.open).toHaveBeenCalledWith({
      type: 'trade-commodity',
      id: 'food',
      workspaceId: 'trade',
      source: 'context-inspector',
      revision: 8,
    }, {
      triggerElement: trigger,
      returnFocusSelector: '[data-context-action="open-detail"][data-good-id="food"]',
    });
    var request = { detail: { type: 'trade-commodity', id: 'food' }, state: {}, container: {} };
    expect(detailSurface.renderers.get('trade-commodity')(request)).toEqual({ title: '商品详情' });
    expect(market.renderWorkspaceDetail).toHaveBeenCalledWith(request);
    expect(fleetResult.onAction({
      action: 'open-detail',
      context: { type: 'ship', id: '0' },
      target: trigger,
    })).toBe(true);
    expect(detailSurface.open).toHaveBeenLastCalledWith({
      type: 'fleet-ship',
      id: '0',
      workspaceId: 'fleet',
      source: 'context-inspector',
      revision: 8,
    }, {
      triggerElement: trigger,
      returnFocusSelector: '[data-context-action="open-detail"][data-ship-index="0"]',
    });
    var fleetRequest = { detail: { type: 'fleet-ship', id: '0' }, state: {}, container: {} };
    expect(detailSurface.renderers.get('fleet-ship')(fleetRequest)).toEqual({ title: '舰船详情' });
    expect(fleet.renderWorkspaceDetail).toHaveBeenCalledWith(fleetRequest);
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

  it('dispose 同时释放 Context 与 L4 renderer', function () {
    var inspector = createInspector();
    var detailSurface = createDetailSurface();
    var registry = createWorkspaceContextAdapters({ inspector: inspector, detailSurface: detailSurface });
    registry.connectMarket({
      renderContextInspector: function () { return true; },
      renderWorkspaceDetail: function () { return true; },
    });

    expect(inspector.renderers.has('trade')).toBe(true);
    expect(detailSurface.renderers.has('trade-commodity')).toBe(true);
    registry.dispose();
    expect(inspector.renderers.has('trade')).toBe(false);
    expect(detailSurface.renderers.has('trade-commodity')).toBe(false);
  });
});
