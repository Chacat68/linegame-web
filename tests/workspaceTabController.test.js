import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceTabController } from '../js/ui/WorkspaceTabController.js';

function classList(values) {
  var state = new Set(values || []);
  return {
    contains: function (value) { return state.has(value); },
    toggle: function (value, force) {
      if (force) state.add(value);
      else state.delete(value);
    },
  };
}

function element(id, classes) {
  var listeners = Object.create(null);
  var attributes = Object.create(null);
  return {
    id: id,
    classList: classList(classes),
    dataset: {},
    disabled: false,
    tabIndex: 0,
    focused: false,
    addEventListener: function (name, handler) {
      if (!listeners[name]) listeners[name] = [];
      listeners[name].push(handler);
    },
    removeEventListener: function (name, handler) {
      listeners[name] = (listeners[name] || []).filter(function (item) { return item !== handler; });
    },
    dispatch: function (name, event) {
      (listeners[name] || []).forEach(function (handler) { handler(event || { target: this }); }, this);
    },
    listenerCount: function (name) { return (listeners[name] || []).length; },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) { return attributes[name] || null; },
    focus: function () { this.focused = true; },
    scrollIntoView: vi.fn(),
  };
}

function createHarness() {
  var quest = element('archive-tab-quest', ['tab-btn', 'active']);
  quest.dataset = { tab: 'tab-quest', tabGroup: 'info' };
  var research = element('archive-tab-research', ['tab-btn']);
  research.dataset = { tab: 'tab-research', tabGroup: 'info' };
  var fleet = element('hangar-tab-fleet', ['tab-btn', 'active']);
  fleet.dataset = { tab: 'tab-fleet', tabGroup: 'trade' };
  var shop = element('hangar-tab-shop', ['tab-btn']);
  shop.dataset = { tab: 'tab-shop', tabGroup: 'trade' };
  var buttons = [quest, research, fleet, shop];
  var panes = [
    element('tab-quest', ['tab-pane', 'active']),
    element('tab-research', ['tab-pane']),
    element('tab-fleet', ['tab-pane', 'active']),
    element('tab-shop', ['tab-pane']),
  ];
  panes[0].dataset.tabGroup = panes[1].dataset.tabGroup = 'info';
  panes[2].dataset.tabGroup = panes[3].dataset.tabGroup = 'trade';
  var byId = Object.fromEntries(buttons.concat(panes).map(function (item) { return [item.id, item]; }));
  ['info-panel-toggle', 'trade-panel-toggle', 'console-panel-close', 'info-panel', 'trade-panel'].forEach(function (id) {
    byId[id] = element(id);
  });
  var doc = {
    getElementById: function (id) { return byId[id] || null; },
    querySelectorAll: function (selector) {
      if (selector === '.tab-btn') return buttons;
      var group = selector.match(/data-tab-group="([^"]+)"/);
      if (selector.indexOf('.tab-btn') === 0 && group) {
        return buttons.filter(function (button) { return button.dataset.tabGroup === group[1]; });
      }
      if (selector.indexOf('.tab-pane') === 0 && group) {
        return panes.filter(function (pane) { return pane.dataset.tabGroup === group[1]; });
      }
      return [];
    },
    querySelector: function (selector) {
      var tab = selector.match(/data-tab="([^"]+)"/);
      if (tab) return buttons.find(function (button) { return button.dataset.tab === tab[1]; }) || null;
      var group = selector.match(/data-tab-group="([^"]+)"/);
      if (group && selector.endsWith('.active')) {
        return buttons.find(function (button) {
          return button.dataset.tabGroup === group[1] && button.classList.contains('active');
        }) || null;
      }
      return null;
    },
  };
  return { buttons: buttons, byId: byId, document: doc, panes: panes };
}

describe('WorkspaceTabController', function () {
  it('统一投影 tab/tabpanel ARIA、canonical workspace 与变更元数据', function () {
    var harness = createHarness();
    var navigate = vi.fn();
    var changes = [];
    var controller = createWorkspaceTabController({
      getState: function () { return {}; },
      getDocument: function () { return harness.document; },
      navigate: navigate,
      onChange: function (tabId, metadata) { changes.push([tabId, metadata]); },
    });
    expect(controller.init()).toBe(true);
    expect(controller.init()).toBe(false);
    expect(harness.byId['archive-tab-quest'].tabIndex).toBe(0);
    expect(harness.byId['archive-tab-research'].tabIndex).toBe(-1);
    expect(controller.activate('tab-research')).toBe(true);
    expect(controller.getActive('info')).toBe('tab-research');
    expect(harness.byId['archive-tab-quest'].getAttribute('aria-selected')).toBe('false');
    expect(harness.byId['archive-tab-research'].getAttribute('aria-selected')).toBe('true');
    expect(harness.byId['tab-quest'].getAttribute('aria-hidden')).toBe('true');
    expect(harness.byId['tab-research'].getAttribute('aria-hidden')).toBe('false');
    expect(navigate).toHaveBeenCalledWith('archive');
    expect(changes[0]).toEqual(['tab-research', {
      changed: true,
      group: 'info',
      previousTabId: 'tab-quest',
      source: 'programmatic',
    }]);
  });

  it('方向键跳过禁用项、提交焦点并让当前项进入移动端可视区', function () {
    var harness = createHarness();
    var prevented = false;
    var controller = createWorkspaceTabController({
      getState: function () { return {}; },
      getDocument: function () { return harness.document; },
    });
    controller.init();
    harness.byId['archive-tab-quest'].dispatch('keydown', {
      key: 'ArrowRight',
      currentTarget: harness.byId['archive-tab-quest'],
      preventDefault: function () { prevented = true; },
    });
    expect(prevented).toBe(true);
    expect(harness.byId['archive-tab-research'].focused).toBe(true);
    expect(harness.byId['archive-tab-research'].scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
    });
  });

  it('档案深链、关闭按钮、背景 dismiss 与 dispose 共用同一导航端口', function () {
    var harness = createHarness();
    var navigate = vi.fn(function () { return true; });
    var controller = createWorkspaceTabController({
      getState: function () { return { currentResearch: { techId: 'fusion' } }; },
      getDocument: function () { return harness.document; },
      navigate: navigate,
      resolveArchiveTab: function () { return 'tab-research'; },
    });
    controller.init();
    expect(controller.openArchive()).toBe(true);
    expect(controller.getActive('info')).toBe('tab-research');
    harness.byId['info-panel-toggle'].dispatch('click');
    harness.byId['trade-panel'].dispatch('click', { target: harness.byId['trade-panel'] });
    expect(navigate.mock.calls.map(function (call) { return call[0]; })).toEqual(['archive', 'map', 'map']);
    expect(controller.dispose()).toBe(true);
    expect(controller.dispose()).toBe(false);
    expect(harness.byId['archive-tab-quest'].listenerCount('click')).toBe(0);
  });
});
