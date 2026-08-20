import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createElement(id) {
  var listeners = Object.create(null);
  var attributes = Object.create(null);
  return {
    id: id || '', dataset: {}, hidden: false, focusCount: 0, textContent: '', innerHTML: '',
    addEventListener: function (type, handler) { (listeners[type] || (listeners[type] = [])).push(handler); },
    removeEventListener: function (type, handler) {
      listeners[type] = (listeners[type] || []).filter(function (item) { return item !== handler; });
    },
    dispatch: function (type, event) {
      var payload = Object.assign({ key: '', target: this, currentTarget: this, preventDefault: vi.fn() }, event || {});
      (listeners[type] || []).forEach(function (handler) { handler(payload); });
      return payload;
    },
    listenerCount: function (type) { return (listeners[type] || []).length; },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
    removeAttribute: function (name) { delete attributes[name]; },
    focus: function () { this.focusCount += 1; },
    contains: function () { return true; },
    querySelector: function () { return null; },
  };
}

function createFixture() {
  var root = createElement('context-inspector');
  root.setAttribute('aria-hidden', 'false');
  var toggle = createElement('context-toggle');
  toggle.dataset.contextWorkspace = 'map';
  var logsToggle = createElement('logs-context-toggle');
  logsToggle.dataset.contextWorkspace = 'logs';
  var close = createElement('context-close');
  var content = createElement('context-inspector-content');
  var empty = createElement('context-inspector-empty');
  var host = createElement('context-inspector-render-host');
  var title = createElement('context-inspector-title');
  root.querySelector = function (selector) { return selector === '[data-context-inspector-close]' ? close : null; };
  var elements = {
    'context-inspector': root,
    'context-inspector-content': content,
    'context-inspector-empty': empty,
    'context-inspector-render-host': host,
    'context-inspector-title': title,
  };
  var documentListeners = Object.create(null);
  return {
    root: root, toggle: toggle, logsToggle: logsToggle, close: close, content: content, empty: empty, host: host, title: title,
    documentListeners: documentListeners,
    document: {
      getElementById: function (id) { return elements[id] || null; },
      querySelector: function (selector) { return selector === '[data-context-inspector-toggle]' ? toggle : null; },
      querySelectorAll: function (selector) { return selector === '[data-context-inspector-toggle]' ? [toggle, logsToggle] : []; },
      addEventListener: function (type, handler) {
        (documentListeners[type] || (documentListeners[type] = [])).push(handler);
      },
      removeEventListener: function (type, handler) {
        documentListeners[type] = (documentListeners[type] || []).filter(function (item) { return item !== handler; });
      },
    },
  };
}

describe('ContextInspector protocol', function () {
  var originalDocument;
  beforeEach(function () { originalDocument = globalThis.document; vi.resetModules(); });
  afterEach(function () { globalThis.document = originalDocument; });

  it('每个 workspace 独立保存不可变 context key，切换后恢复', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');
    Inspector.init({ workspaceId: 'map' });
    var input = { type: 'planet', id: 'sol_prime', workspaceId: 'map', source: 'click', revision: 7, domain: { bad: true } };
    Inspector.replaceContext(input);
    input.id = 'mutated';
    Inspector.activateWorkspace('trade');
    expect(fixture.root.hidden).toBe(true);
    expect(fixture.root.inert).toBe(true);
    Inspector.replaceContext({ type: 'good', id: 'food', workspaceId: 'trade', source: 'table', revision: 2 });
    Inspector.activateWorkspace('map');

    expect(fixture.root.hidden).toBe(false);
    expect(fixture.root.inert).toBe(false);
    expect(Inspector.getContext()).toEqual({ type: 'planet', id: 'sol_prime', workspaceId: 'map', source: 'click', revision: 7 });
    expect(Inspector.getContext()).not.toHaveProperty('domain');
    expect(Object.isFrozen(Inspector.getContext())).toBe(true);
    expect(Inspector.getSnapshot().contexts.trade.id).toBe('food');
  });

  it('renderer 每次使用最新 provider state，且无 adapter 时显示空态', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');
    var currentState = { session: 1 };
    var calls = [];
    Inspector.init({ stateSource: function () { return currentState; }, workspaceId: 'map' });
    Inspector.registerRenderer('map', function (request) { calls.push(request); return true; });
    Inspector.replaceContext({ type: 'planet', id: 'sol_prime', workspaceId: 'map', source: 'click', revision: 1 });
    currentState = { session: 2 };
    Inspector.render();
    expect(calls.at(-1).state).toBe(currentState);
    expect(calls.at(-1).context.id).toBe('sol_prime');

    Inspector.activateWorkspace('fleet');
    expect(fixture.empty.hidden).toBe(false);
    expect(fixture.host.hidden).toBe(true);
    expect(Inspector.getSnapshot().rendererRegistered).toBe(false);
  });

  it('把 Context 内局部 intent 委托给当前 renderer，且每次读取最新 state', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');
    var currentState = { session: 1 };
    var onAction = vi.fn();
    Inspector.init({ stateSource: function () { return currentState; }, workspaceId: 'trade' });
    Inspector.registerRenderer('trade', function () {
      return { title: '商品检查', onAction: onAction };
    });
    Inspector.replaceContext({
      type: 'commodity', id: 'food', workspaceId: 'trade', source: 'card', revision: 1,
    });
    currentState = { session: 2 };
    var target = {
      dataset: { contextAction: 'open-detail', goodId: 'food' },
      closest: function (selector) { return selector === '[data-context-action]' ? this : null; },
    };
    var event = fixture.host.dispatch('click', { target: target });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith({
      action: 'open-detail',
      context: {
        type: 'commodity', id: 'food', workspaceId: 'trade', source: 'card', revision: 1,
      },
      dataset: target.dataset,
      state: currentState,
      target: target,
      workspaceId: 'trade',
    });
  });

  it('会话 revision 变化后丢弃旧选择，未配置 provider 时保持兼容', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');
    var revision = 3;
    Inspector.init({ workspaceId: 'map', revisionSource: function () { return revision; } });
    Inspector.replaceContext({
      type: 'planet',
      id: 'sol_prime',
      workspaceId: 'map',
      source: 'click',
      revision: 3,
    });
    expect(Inspector.getContext().id).toBe('sol_prime');

    revision = 4;
    expect(Inspector.reconcileRevision(revision)).toEqual(['map']);
    expect(Inspector.getContext()).toBe(null);
    expect(fixture.root.dataset.contextId).toBe('');
  });

  it('开合、Escape、rail 互斥与重复 init 保持焦点语义', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');
    var EventBus = await import('../js/core/EventBus.js');
    Inspector.init(); Inspector.init();
    expect(fixture.toggle.listenerCount('click')).toBe(1);
    expect(fixture.root.listenerCount('keydown')).toBe(0);
    expect(fixture.documentListeners.keydown).toHaveLength(1);
    fixture.documentListeners.keydown[0]({
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    });
    expect(Inspector.getSnapshot().open).toBe(false);
    expect(fixture.toggle.focusCount).toBe(1);
    fixture.toggle.dispatch('click');
    expect(Inspector.getSnapshot().open).toBe(true);
    EventBus.emit('starmap-rail:panel-open', { source: 'exploration-terminal' });
    expect(Inspector.getSnapshot().open).toBe(false);
  });

  it('桌面 adapter 首次注册时默认 dock，紧凑视口保持收起', async function () {
    var desktopFixture = createFixture();
    globalThis.document = desktopFixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');
    Inspector.init({ workspaceId: 'map', open: false });
    Inspector.activateWorkspace('trade');
    Inspector.activateWorkspace('trade');
    Inspector.registerRenderer('trade', function () { return true; });
    expect(Inspector.getSnapshot().open).toBe(true);

    vi.resetModules();
    var compactFixture = createFixture();
    globalThis.document = compactFixture.document;
    var CompactInspector = await import('../js/ui/ContextInspector.js');
    CompactInspector.init({ workspaceId: 'map', open: false, compact: true });
    CompactInspector.activateWorkspace('trade');
    CompactInspector.registerRenderer('trade', function () { return true; });
    expect(CompactInspector.getSnapshot().open).toBe(false);
  });

  it('可把选择源登记为焦点返回点，Escape 后不跳到其他工作区 toggle', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');
    var messageButton = createElement('message-1');
    Inspector.init({ workspaceId: 'logs', open: false });
    Inspector.registerRenderer('logs', function () { return true; });

    Inspector.open({ workspaceId: 'logs', focus: false, restoreFocusTo: messageButton });
    expect(Inspector.getSnapshot().open).toBe(true);
    expect(fixture.logsToggle.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.toggle.getAttribute('aria-expanded')).toBe('false');
    fixture.documentListeners.keydown[0]({
      key: 'Escape',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    });

    expect(Inspector.getSnapshot().open).toBe(false);
    expect(messageButton.focusCount).toBe(1);
    expect(fixture.toggle.focusCount).toBe(0);
  });

  it('dispose 释放按钮、rail、Escape 与 renderer，并允许重新初始化', async function () {
    var fixture = createFixture();
    globalThis.document = fixture.document;
    var Inspector = await import('../js/ui/ContextInspector.js');
    Inspector.init({ workspaceId: 'map' });
    Inspector.registerRenderer('map', function () { return true; });
    Inspector.replaceContext({
      type: 'planet', id: 'sol_prime', workspaceId: 'map', source: 'click', revision: 1,
    });

    expect(fixture.toggle.listenerCount('click')).toBe(1);
    expect(fixture.documentListeners.keydown).toHaveLength(1);
    expect(Inspector.dispose()).toBe(true);
    expect(Inspector.dispose()).toBe(false);
    expect(fixture.toggle.listenerCount('click')).toBe(0);
    expect(fixture.close.listenerCount('click')).toBe(0);
    expect(fixture.host.listenerCount('click')).toBe(0);
    // SurfaceManager 的 document dispatcher 属于应用壳；dispose 只注销本层。
    expect(fixture.documentListeners.keydown).toHaveLength(1);
    var preventedAfterDispose = vi.fn();
    fixture.documentListeners.keydown[0]({
      key: 'Escape',
      preventDefault: preventedAfterDispose,
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    });
    expect(preventedAfterDispose).not.toHaveBeenCalled();
    expect(Inspector.getSnapshot()).toEqual({
      initialized: false,
      open: false,
      activeWorkspaceId: 'map',
      context: null,
      contexts: {},
      rendererRegistered: false,
    });

    Inspector.init({ workspaceId: 'map' });
    expect(fixture.toggle.listenerCount('click')).toBe(1);
    expect(fixture.documentListeners.keydown).toHaveLength(1);
    Inspector.dispose();
  });
});
