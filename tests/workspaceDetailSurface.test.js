import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createNavigationController } from '../js/ui/NavigationController.js';
import { createWorkspaceDetailSurface } from '../js/ui/WorkspaceDetailSurface.js';

function createElement(id) {
  var listeners = new Map();
  var attributes = new Map();
  var queries = new Map();
  return {
    id: id || '',
    dataset: {},
    hidden: false,
    inert: false,
    innerHTML: '',
    isConnected: true,
    textContent: '',
    focus: vi.fn(),
    addEventListener: function (name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener: function (name, listener) {
      if (listeners.has(name)) listeners.get(name).delete(listener);
    },
    dispatchEvent: function (event) {
      Array.from(listeners.get(event.type) || []).forEach(function (listener) { listener(event); });
    },
    setAttribute: function (name, value) { attributes.set(name, String(value)); },
    getAttribute: function (name) { return attributes.has(name) ? attributes.get(name) : null; },
    querySelector: function (selector) { return queries.get(selector) || null; },
    setQuery: function (selector, value) { queries.set(selector, value); },
    contains: function () { return true; },
    replaceChildren: function () { this.innerHTML = ''; },
  };
}

function createDocument() {
  var root = createElement('workspace-detail-surface');
  var title = createElement('workspace-detail-title');
  var depth = createElement('workspace-detail-depth');
  var content = createElement('workspace-detail-content');
  var contextInspector = createElement('context-inspector');
  var back = createElement('workspace-detail-back');
  var close = createElement('workspace-detail-close');
  var listeners = new Map();
  var selectors = new Map();
  var elements = new Map([
    [root.id, root],
    [title.id, title],
    [depth.id, depth],
    [content.id, content],
  ]);
  root.hidden = true;
  root.inert = true;
  root.setQuery('[data-workspace-detail-back]', back);
  root.setQuery('[data-workspace-detail-close]', close);
  contextInspector.setAttribute('aria-hidden', 'false');
  elements.set(contextInspector.id, contextInspector);
  var doc = {
    activeElement: null,
    body: createElement('body'),
    getElementById: function (id) { return elements.get(id) || null; },
    querySelector: function (selector) { return selectors.get(selector) || null; },
    querySelectorAll: function (selector) { return selector === '.modal' ? [] : []; },
    addEventListener: function (name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener: function (name, listener) {
      if (listeners.has(name)) listeners.get(name).delete(listener);
    },
    dispatchEvent: function (event) {
      Array.from(listeners.get(event.type) || []).forEach(function (listener) { listener(event); });
    },
    setQuery: function (selector, value) { selectors.set(selector, value); },
  };
  return { doc: doc, root: root, title: title, depth: depth, content: content, back: back, close: close, contextInspector: contextInspector };
}

function createNavigationAdapter(controller) {
  return {
    closeDetail: controller.closeDetail,
    getNavigationSnapshot: controller.getSnapshot,
    openDetail: controller.openDetail,
    subscribeNavigation: controller.subscribe,
  };
}

function escapeEvent() {
  return {
    type: 'keydown',
    key: 'Escape',
    defaultPrevented: false,
    preventDefault: vi.fn(function () { this.defaultPrevented = true; }),
    stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

describe('WorkspaceDetailSurface', function () {
  var originalDocument = globalThis.document;
  var activeSurfaces = [];

  afterEach(function () {
    activeSurfaces.splice(0).forEach(function (surface) { surface.dispose(); });
    globalThis.document = originalDocument;
  });

  it('把 immutable detail stack 投影为两层 Surface，Escape 每次只退一层并恢复焦点', function () {
    var dom = createDocument();
    globalThis.document = dom.doc;
    var state = { marker: 'state-a' };
    var revision = 7;
    var navigation = createNavigationController({ getState: function () { return state; } });
    var surface = createWorkspaceDetailSurface({ document: dom.doc });
    activeSurfaces.push(surface);
    var renderedStates = [];
    var reportReplacement = createElement('report-replacement');
    var launcher = createElement('survey-launcher');
    var reportButton = createElement('report-button');
    var marketButton = createElement('market-button');
    var delegatedActions = vi.fn();
    reportButton.dataset.workspaceDetailAction = 'open-report';
    marketButton.dataset.explorationAction = 'market';

    dom.doc.setQuery('[data-workspace-detail-report-id="report-1"]', reportReplacement);
    surface.registerRenderer('map-survey', function (request) {
      renderedStates.push(request.state);
      request.container.innerHTML = '<button data-workspace-detail-report-id="report-1">报告</button>';
      return {
        title: '地球 · 探索档案',
        onAction: function (action) {
          delegatedActions(action.action);
          if (action.action !== 'open-report') return false;
          reportButton.isConnected = false;
          return request.open({
            type: 'map-report',
            id: 'sol::report-1',
            workspaceId: 'map',
            source: 'survey',
            revision: revision,
          }, {
            triggerElement: reportButton,
            returnFocusSelector: '[data-workspace-detail-report-id="report-1"]',
          });
        },
      };
    });
    surface.registerRenderer('map-report', function (request) {
      renderedStates.push(request.state);
      request.container.innerHTML = '<article>报告正文 ' + request.state.marker + '</article>';
      return { title: '地球 · 单份报告' };
    });
    surface.init({
      navigation: createNavigationAdapter(navigation),
      stateSource: function () { return state; },
      revisionSource: function () { return revision; },
      document: dom.doc,
    });

    expect(surface.open({
      type: 'map-survey',
      id: 'sol',
      workspaceId: 'map',
      source: 'context',
      revision: revision,
    }, { triggerElement: launcher })).toBe(true);
    expect(dom.root.hidden).toBe(false);
    expect(dom.root.inert).toBe(false);
    expect(dom.contextInspector.inert).toBe(true);
    expect(dom.contextInspector.getAttribute('aria-hidden')).toBe('true');
    expect(dom.root.dataset.detailDepth).toBe('1');
    expect(dom.title.textContent).toBe('地球 · 探索档案');
    expect(Object.isFrozen(navigation.getSnapshot().activeDetail)).toBe(true);

    dom.content.dispatchEvent({
      type: 'click',
      target: { closest: function () { return marketButton; } },
      preventDefault: vi.fn(),
    });
    expect(delegatedActions).toHaveBeenLastCalledWith('market');

    state = { marker: 'state-b' };
    dom.content.dispatchEvent({
      type: 'click',
      target: { closest: function () { return reportButton; } },
      preventDefault: vi.fn(),
    });
    expect(dom.root.dataset.detailDepth).toBe('2');
    expect(dom.title.textContent).toBe('地球 · 单份报告');
    expect(dom.content.innerHTML).toContain('state-b');
    expect(renderedStates.at(-1)).toBe(state);

    var firstEscape = escapeEvent();
    dom.doc.dispatchEvent(firstEscape);
    expect(firstEscape.preventDefault).toHaveBeenCalledOnce();
    expect(navigation.getSnapshot().activeWorkspace).toBe('map');
    expect(navigation.getSnapshot().workspaces.map.detailDepth).toBe(1);
    expect(dom.root.dataset.detailDepth).toBe('1');
    expect(reportReplacement.focus).toHaveBeenCalledOnce();

    dom.doc.dispatchEvent(escapeEvent());
    expect(navigation.getSnapshot().activeWorkspace).toBe('map');
    expect(navigation.getSnapshot().workspaces.map.detailDepth).toBe(0);
    expect(dom.root.hidden).toBe(true);
    expect(dom.root.inert).toBe(true);
    expect(dom.contextInspector.inert).toBe(false);
    expect(dom.contextInspector.getAttribute('aria-hidden')).toBe('false');
    expect(launcher.focus).toHaveBeenCalledOnce();
  });

  it('会在会话 revision 变化后丢弃旧详情键，不拿新 state 解释旧对象', function () {
    var dom = createDocument();
    globalThis.document = dom.doc;
    var revision = 2;
    var navigation = createNavigationController();
    var surface = createWorkspaceDetailSurface({ document: dom.doc });
    activeSurfaces.push(surface);
    surface.registerRenderer('map-survey', function () { return { title: '旧档案' }; });
    surface.init({
      navigation: createNavigationAdapter(navigation),
      stateSource: function () { return {}; },
      revisionSource: function () { return revision; },
      document: dom.doc,
    });
    surface.open({ type: 'map-survey', id: 'sol', workspaceId: 'map', revision: 2 });
    expect(surface.getSnapshot().open).toBe(true);

    revision = 3;
    navigation.navigate('trade');
    navigation.navigate('map');

    expect(navigation.getSnapshot().detailStacks.map).toEqual([]);
    expect(surface.getSnapshot().open).toBe(false);
  });

  it('刷新当前详情时使用最新数据，并在对象淘汰后关闭失效详情', function () {
    var dom = createDocument();
    globalThis.document = dom.doc;
    var entries = new Map([['message-1', '初始消息']]);
    var navigation = createNavigationController();
    var surface = createWorkspaceDetailSurface({ document: dom.doc });
    activeSurfaces.push(surface);
    surface.registerRenderer('logs-message', function (request) {
      var message = entries.get(request.detail.id);
      if (!message) return false;
      request.container.innerHTML = '<article>' + message + '</article>';
      return { title: '通讯记录 · 消息详情' };
    });
    surface.init({
      navigation: createNavigationAdapter(navigation),
      stateSource: function () { return {}; },
      revisionSource: function () { return 0; },
      document: dom.doc,
    });

    navigation.navigate('logs');
    surface.open({ type: 'logs-message', id: 'message-1', workspaceId: 'logs', revision: 0 });
    expect(dom.content.innerHTML).toContain('初始消息');
    var renderCount = surface.getSnapshot().renderCount;

    entries.set('message-1', '更新后的消息');
    expect(surface.refresh()).toBe(true);
    expect(dom.content.innerHTML).toContain('更新后的消息');
    expect(surface.getSnapshot().renderCount).toBe(renderCount + 1);

    entries.delete('message-1');
    expect(surface.refresh()).toBe(true);
    expect(navigation.getSnapshot().workspaces.logs.detailDepth).toBe(0);
    expect(surface.getSnapshot().open).toBe(false);
  });

  it('静态壳层声明真实 L4 surface、层级 token 与窄屏安全区', function () {
    var html = readFileSync('index.html', 'utf8');
    var tokens = readFileSync('css/tokens.css', 'utf8');
    var css = readFileSync('css/workspace-detail.css', 'utf8');

    expect(html).toContain('id="workspace-detail-surface"');
    expect(html).toContain('data-workspace-detail-back');
    expect(html).toContain('id="workspace-detail-content"');
    expect(tokens).toContain('--ui-z-detail: 108');
    expect(css).toContain('z-index: var(--ui-z-detail)');
    expect(css).toContain('@media (max-width: 700px)');
    expect(css).toContain('var(--ui-command-reserve)');
  });
});
