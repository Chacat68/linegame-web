import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createElement(id) {
  var listeners = Object.create(null);
  var attributes = Object.create(null);
  return {
    id: id || '',
    dataset: {},
    hidden: false,
    tabIndex: 0,
    focusCount: 0,
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatch: function (type, event) {
      var payload = Object.assign({
        key: '',
        target: this,
        currentTarget: this,
        preventDefault: vi.fn(),
      }, event || {});
      (listeners[type] || []).forEach(function (handler) { handler(payload); });
      return payload;
    },
    listenerCount: function (type) {
      return (listeners[type] || []).length;
    },
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute: function (name) {
      delete attributes[name];
    },
    focus: function () {
      this.focusCount += 1;
    },
  };
}

function createFixture(defaultTab) {
  var root = createElement('context-inspector');
  root.dataset.defaultTab = defaultTab || 'target';
  root.setAttribute('aria-hidden', 'false');
  var toggle = createElement('context-toggle');
  var close = createElement('context-close');
  var ids = ['target', 'market', 'network', 'quest'];
  var tabs = ids.map(function (id) {
    var tab = createElement('context-tab-' + id);
    tab.dataset.contextInspectorTab = id;
    tab.setAttribute('aria-controls', 'context-pane-' + id);
    return tab;
  });
  var panes = ids.map(function (id) {
    var pane = createElement('context-pane-' + id);
    pane.dataset.contextInspectorPane = id;
    return pane;
  });

  root.querySelector = function (selector) {
    return selector === '[data-context-inspector-close]' ? close : null;
  };
  root.querySelectorAll = function (selector) {
    if (selector === '[data-context-inspector-tab]') return tabs;
    if (selector === '[data-context-inspector-pane]') return panes;
    return [];
  };

  return {
    root: root,
    toggle: toggle,
    close: close,
    tabs: tabs,
    panes: panes,
    document: {
      getElementById: function (id) { return id === 'context-inspector' ? root : null; },
      querySelector: function (selector) {
        return selector === '[data-context-inspector-toggle]' ? toggle : null;
      },
    },
  };
}

describe('ContextInspector', function () {
  var originalDocument;

  beforeEach(function () {
    originalDocument = globalThis.document;
    vi.resetModules();
  });

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('按 data-default-tab 初始化并保持唯一可见切片', async function () {
    var fixture = createFixture('market');
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');

    expect(Inspector.init()).toEqual({
      initialized: true,
      open: true,
      activeTab: 'market',
      tabs: ['target', 'market', 'network', 'quest'],
    });
    expect(fixture.toggle.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.tabs.filter(function (tab) { return tab.getAttribute('aria-selected') === 'true'; })).toEqual([fixture.tabs[1]]);
    expect(fixture.panes.filter(function (pane) { return !pane.hidden; })).toEqual([fixture.panes[1]]);

    fixture.tabs[3].dispatch('click');
    expect(Inspector.getSnapshot().activeTab).toBe('quest');
    expect(fixture.tabs[3].tabIndex).toBe(0);
    expect(fixture.tabs[1].tabIndex).toBe(-1);
    expect(fixture.panes.filter(function (pane) { return !pane.hidden; })).toEqual([fixture.panes[3]]);
  });

  it('支持循环方向键以及 Home/End 导航并移动焦点', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');
    Inspector.init();

    var right = fixture.tabs[0].dispatch('keydown', { key: 'ArrowRight' });
    expect(right.preventDefault).toHaveBeenCalledOnce();
    expect(Inspector.getSnapshot().activeTab).toBe('market');
    expect(fixture.tabs[1].focusCount).toBe(1);

    fixture.tabs[1].dispatch('keydown', { key: 'End' });
    expect(Inspector.getSnapshot().activeTab).toBe('quest');
    fixture.tabs[3].dispatch('keydown', { key: 'ArrowRight' });
    expect(Inspector.getSnapshot().activeTab).toBe('target');
    fixture.tabs[0].dispatch('keydown', { key: 'Home' });
    expect(fixture.tabs[0].focusCount).toBeGreaterThan(0);
  });

  it('关闭时同步可见性，Escape 和关闭按钮都能恢复入口焦点', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');
    Inspector.init();

    fixture.tabs[0].dispatch('keydown', { key: 'Escape' });
    expect(Inspector.getSnapshot().open).toBe(false);
    expect(fixture.root.hidden).toBe(true);
    expect(fixture.root.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.toggle.getAttribute('aria-expanded')).toBe('false');
    expect(fixture.toggle.focusCount).toBe(1);

    fixture.toggle.dispatch('click');
    expect(Inspector.getSnapshot().open).toBe(true);
    fixture.close.dispatch('click');
    expect(Inspector.getSnapshot().open).toBe(false);
    expect(fixture.toggle.focusCount).toBe(2);
  });

  it('允许窄屏以收起状态初始化并同步入口语义', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');

    Inspector.init({ open: false });

    expect(Inspector.getSnapshot().open).toBe(false);
    expect(fixture.root.hidden).toBe(true);
    expect(fixture.root.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('重复 init 不叠加监听，空 DOM 调用也安全', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');

    Inspector.init();
    Inspector.init();
    expect(fixture.toggle.listenerCount('click')).toBe(1);
    expect(fixture.close.listenerCount('click')).toBe(1);
    expect(fixture.root.listenerCount('keydown')).toBe(1);
    fixture.tabs.forEach(function (tab) {
      expect(tab.listenerCount('click')).toBe(1);
      expect(tab.listenerCount('keydown')).toBe(1);
    });

    globalThis.document = {
      getElementById: function () { return null; },
      querySelector: function () { return null; },
    };
    expect(function () { Inspector.init(); }).not.toThrow();
    expect(Inspector.getSnapshot()).toEqual({ initialized: false, open: false, activeTab: null, tabs: [] });
    expect(function () { Inspector.open(); Inspector.close(); Inspector.select('target'); }).not.toThrow();
  });

  it('其它星图 rail surface 打开时会关闭检查器', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');
    var EventBus = await import('../js/core/EventBus.js');
    Inspector.init();

    EventBus.emit('starmap-rail:panel-open', { source: 'exploration-terminal' });
    expect(Inspector.getSnapshot().open).toBe(false);
    expect(fixture.toggle.focusCount).toBe(0);
  });
});
