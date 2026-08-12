import { describe, expect, it, vi } from 'vitest';
import {
  WORKSPACES,
  createNavigationController,
  normalizeWorkspace,
} from '../js/ui/NavigationController.js';

describe('workspace navigation controller', function () {
  it('归一化 canonical workspace 与 legacy aliases', function () {
    expect(normalizeWorkspace('map')).toBe('map');
    expect(normalizeWorkspace(' starmap ')).toBe('map');
    expect(normalizeWorkspace('market')).toBe('trade');
    expect(normalizeWorkspace('hangar')).toBe('fleet');
    expect(normalizeWorkspace('quests')).toBe('archive');
    expect(normalizeWorkspace('LOGS')).toBe('logs');
    expect(normalizeWorkspace('unknown')).toBeNull();
  });

  it('始终只有一个 active workspace，重复导航不会折叠或发布变化', function () {
    var onChange = vi.fn();
    var controller = createNavigationController({
      initialWorkspace: 'market',
      onChange: onChange,
    });

    var initial = controller.getSnapshot();
    expect(initial.activeWorkspace).toBe('trade');
    expect(_activeWorkspaces(initial)).toEqual(['trade']);

    expect(controller.navigate('trade')).toBe(false);
    expect(controller.navigate('market')).toBe(false);
    expect(controller.getSnapshot().activeWorkspace).toBe('trade');
    expect(onChange).not.toHaveBeenCalled();

    expect(controller.navigate('hangar')).toBe(true);
    var next = controller.getSnapshot();
    expect(next.activeWorkspace).toBe('fleet');
    expect(_activeWorkspaces(next)).toEqual(['fleet']);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('每次有效切换读取最新 state，并按 leave、enter、change 顺序通知', function () {
    var state = { day: 1 };
    var events = [];
    var getState = vi.fn(function () { return state; });
    var controller = createNavigationController({
      getState: getState,
      onLeave: function (change) { events.push(['leave', change]); },
      onEnter: function (change) { events.push(['enter', change]); },
      onChange: function (change) { events.push(['change', change]); },
    });

    state = { day: 8 };
    controller.navigate('market');

    expect(getState).toHaveBeenCalledTimes(1);
    expect(events.map(function (entry) { return entry[0]; })).toEqual(['leave', 'enter', 'change']);
    events.forEach(function (entry) {
      expect(entry[1].state).toBe(state);
      expect(entry[1].from).toBe('map');
      expect(entry[1].to).toBe('trade');
    });
    expect(events[0][1].snapshot.activeWorkspace).toBe('map');
    expect(events[1][1].snapshot.activeWorkspace).toBe('trade');
    expect(events[2][1].snapshot.activeWorkspace).toBe('trade');

    state = { day: 9 };
    controller.navigate('logs');
    expect(getState).toHaveBeenCalledTimes(2);
    expect(events.at(-1)[1].state).toBe(state);
  });

  it('按工作区维护独立详情栈，Escape 只逐层关闭详情且不切换 L3', function () {
    var controller = createNavigationController();

    controller.navigate('trade');
    controller.openDetail('commodity:medicine');
    controller.openDetail('order:42');
    controller.openDetail('ship:alpha', 'fleet');

    expect(controller.getSnapshot().detailStacks.trade).toEqual([
      'commodity:medicine',
      'order:42',
    ]);
    expect(controller.getSnapshot().detailStacks.fleet).toEqual(['ship:alpha']);

    expect(controller.handleEscape()).toBe('detail');
    expect(controller.getSnapshot().activeWorkspace).toBe('trade');
    expect(controller.getSnapshot().detailStacks.trade).toEqual(['commodity:medicine']);

    expect(controller.handleEscape()).toBe('detail');
    expect(controller.getSnapshot().activeWorkspace).toBe('trade');
    expect(controller.handleEscape()).toBe(false);
    expect(controller.getSnapshot().activeWorkspace).toBe('trade');
    expect(controller.getSnapshot().detailStacks.fleet).toEqual(['ship:alpha']);

    controller.navigate('fleet');
    expect(controller.handleEscape()).toBe('detail');
    expect(controller.getSnapshot().activeWorkspace).toBe('fleet');
  });

  it('非法目标是无副作用的 no-op', function () {
    var onLeave = vi.fn();
    var onEnter = vi.fn();
    var onChange = vi.fn();
    var controller = createNavigationController({ onLeave, onEnter, onChange });
    var before = controller.getSnapshot();

    expect(controller.navigate('settings')).toBe(false);
    expect(controller.navigate(null)).toBe(false);
    expect(controller.openDetail('bad', 'settings')).toBe(false);
    expect(controller.closeDetail('settings')).toBeNull();

    expect(controller.getSnapshot()).toEqual(before);
    expect(onLeave).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('外部 surface 可只同步 active workspace 而不重复执行进入退出副作用', function () {
    var onLeave = vi.fn();
    var onEnter = vi.fn();
    var changes = [];
    var controller = createNavigationController({
      onLeave: onLeave,
      onEnter: onEnter,
      onChange: function (change) { changes.push(change); },
    });

    expect(controller.sync('market', { reason: 'legacy-surface-open' })).toBe(true);
    expect(controller.getSnapshot().activeWorkspace).toBe('trade');
    expect(onLeave).not.toHaveBeenCalled();
    expect(onEnter).not.toHaveBeenCalled();
    expect(changes[0].type).toBe('workspace:sync');
    expect(changes[0].reason).toBe('legacy-surface-open');
    expect(controller.sync('trade')).toBe(false);
  });

  it('subscribe 只接收有效变化，且可以取消订阅', function () {
    var listener = vi.fn();
    var controller = createNavigationController();
    var unsubscribe = controller.subscribe(listener);

    controller.navigate('starmap');
    controller.navigate('archive');
    controller.openDetail('quest:q-1');

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0][0].activeWorkspace).toBe('archive');
    expect(listener.mock.calls[0][1].type).toBe('workspace:change');
    expect(listener.mock.calls[1][1].type).toBe('detail:open');

    unsubscribe();
    controller.closeDetail();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

function _activeWorkspaces(snapshot) {
  return WORKSPACES.filter(function (workspace) {
    return snapshot.workspaces[workspace].active;
  });
}
