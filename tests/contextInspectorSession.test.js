import { describe, expect, it } from 'vitest';
import { createContextInspectorSession } from '../js/ui/ContextInspectorSession.js';

describe('ContextInspectorSession', function () {
  it('按工作区保存规范化不可变 key，并丢弃领域对象', function () {
    var session = createContextInspectorSession();
    var input = {
      type: ' planet ', id: ' sol_prime ', workspaceId: 'map', source: ' click ', revision: 4,
      domain: { mutable: true },
    };
    var context = session.replaceContext(input);
    input.id = 'changed';
    session.activateWorkspace('trade');
    session.replaceContext({ type: 'commodity', id: 'food', source: 'card', revision: 4 });

    expect(context).toEqual({
      type: 'planet', id: 'sol_prime', workspaceId: 'map', source: 'click', revision: 4,
    });
    expect(context).not.toHaveProperty('domain');
    expect(Object.isFrozen(context)).toBe(true);
    expect(session.getContext('map').id).toBe('sol_prime');
    expect(session.getContext('trade').id).toBe('food');
  });

  it('只在 provider 存在时按 revision 丢弃活动选择', function () {
    var revision = 6;
    var session = createContextInspectorSession({ revisionSource: function () { return revision; } });
    session.replaceContext({ type: 'planet', id: 'sol_prime', revision: 6 });
    expect(session.resolveActiveContext().id).toBe('sol_prime');

    revision = 7;
    expect(session.resolveActiveContext()).toBe(null);
    expect(session.getContext()).toBe(null);
    expect(session.getCurrentRevision()).toBe(7);
  });

  it('桌面非日志 workspace 默认打开，紧凑模式与日志默认收起', function () {
    var session = createContextInspectorSession();
    session.activateWorkspace('trade');
    expect(session.getOpenProjection(true)).toEqual({ hasPreference: false, open: true });
    session.rememberOpen(false);
    expect(session.getOpenProjection(true)).toEqual({ hasPreference: true, open: false });

    session.configure({ compact: true });
    session.activateWorkspace('fleet');
    expect(session.getOpenProjection(true)).toEqual({ hasPreference: false, open: false });
    session.configure({ compact: false });
    session.activateWorkspace('logs');
    expect(session.getOpenProjection(true)).toEqual({ hasPreference: false, open: false });
  });

  it('批量 reconcile 返回受影响工作区并可完整 reset', function () {
    var session = createContextInspectorSession();
    session.replaceContext({ type: 'planet', id: 'sol_prime', revision: 2 });
    session.activateWorkspace('archive');
    session.replaceContext({ type: 'quest', id: 'starter', revision: 3 });

    expect(session.reconcileRevision(3)).toEqual(['map']);
    expect(session.getSnapshot().contexts.archive.id).toBe('starter');
    expect(session.reset()).toEqual({
      activeWorkspaceId: 'map', context: null, contexts: {}, compact: false,
    });
  });
});
