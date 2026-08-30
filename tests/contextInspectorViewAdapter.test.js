import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createContextInspectorViewAdapter } from '../js/ui/ContextInspectorViewAdapter.js';

function createElement(id) {
  var listeners = {};
  var attributes = {};
  return {
    id: id || '',
    className: '',
    dataset: {},
    hidden: false,
    inert: false,
    children: [],
    focus: vi.fn(),
    contains: function () { return true; },
    addEventListener: function (type, handler) { listeners[type] = handler; },
    removeEventListener: function (type, handler) {
      if (listeners[type] === handler) delete listeners[type];
    },
    appendChild: function (child) { this.children.push(child); },
    dispatch: function (type, event) {
      if (listeners[type]) {
        listeners[type](Object.assign({
          currentTarget: this,
          preventDefault: vi.fn(),
          target: this,
        }, event || {}));
      }
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
  };
}

function createHarness() {
  var root = createElement('context-inspector');
  var content = createElement('context-inspector-content');
  var empty = createElement('context-inspector-empty');
  var host = createElement('context-inspector-render-host');
  var title = createElement('context-inspector-title');
  var close = createElement('context-close');
  var toggle = createElement('context-toggle');
  var emptyTitle = createElement('empty-title');
  var emptyNote = createElement('empty-note');
  toggle.dataset.contextWorkspace = 'trade';
  root.querySelector = function (selector) {
    return selector === '[data-context-inspector-close]' ? close : null;
  };
  empty.querySelector = function (selector) {
    if (selector === '[data-context-empty-title]') return emptyTitle;
    if (selector === '[data-context-empty-note]') return emptyNote;
    return null;
  };
  var elements = {
    'context-inspector': root,
    'context-inspector-content': content,
    'context-inspector-empty': empty,
    'context-inspector-render-host': host,
    'context-inspector-title': title,
  };
  var documentRef = {
    createElement: vi.fn(function (tagName) { return createElement(tagName); }),
    getElementById: vi.fn(function (id) { return elements[id] || null; }),
    querySelectorAll: vi.fn(function () { return [toggle]; }),
  };
  return {
    adapter: createContextInspectorViewAdapter(),
    close: close,
    content: content,
    document: documentRef,
    empty: empty,
    emptyNote: emptyNote,
    emptyTitle: emptyTitle,
    host: host,
    root: root,
    title: title,
    toggle: toggle,
  };
}

describe('ContextInspectorViewAdapter', function () {
  it('独占 DOM、事件与焦点，Controller 只保留会话和 renderer 编排', function () {
    var adapterSource = readFileSync('js/ui/ContextInspectorViewAdapter.js', 'utf8');
    var controllerSource = readFileSync('js/ui/ContextInspectorController.js', 'utf8');

    expect(controllerSource).toContain("from './ContextInspectorViewAdapter.js'");
    expect(controllerSource).not.toMatch(/getElementById|querySelector|addEventListener|removeEventListener|\.focus\(/);
    expect(adapterSource).toMatch(/getElementById|querySelector|addEventListener|removeEventListener|\.focus\(/);
    expect(adapterSource).not.toMatch(/ContextInspectorSession|renderersByWorkspace|registerEscapeLayer/);
    expect(controllerSource.split('\n').length).toBeLessThan(320);
  });

  it('统一根节点、ARIA、Toggle/Close/Action 委派与释放', function () {
    var harness = createHarness();
    var onToggle = vi.fn();
    var onClose = vi.fn();
    var onAction = vi.fn();
    expect(harness.adapter.init({
      document: harness.document,
      onAction: onAction,
      onClose: onClose,
      onToggle: onToggle,
    })).toMatchObject({ initialized: true, open: true });

    expect(harness.adapter.setPanelVisible(false, 'trade')).toBe(true);
    expect(harness.root.hidden).toBe(true);
    expect(harness.root.inert).toBe(true);
    expect(harness.root.getAttribute('aria-hidden')).toBe('true');
    expect(harness.toggle.getAttribute('aria-expanded')).toBe('false');

    harness.toggle.dispatch('click');
    harness.close.dispatch('click');
    var actionTarget = {
      dataset: { contextAction: 'open-detail', goodId: 'food' },
      closest: function () { return this; },
    };
    harness.host.dispatch('click', { target: actionTarget });
    expect(onToggle).toHaveBeenCalledWith({ open: false, target: harness.toggle });
    expect(onClose).toHaveBeenCalledOnce();
    expect(onAction).toHaveBeenCalledWith({ dataset: actionTarget.dataset, target: actionTarget });

    expect(harness.adapter.dispose()).toBe(true);
    harness.host.dispatch('click', { target: actionTarget });
    expect(onAction).toHaveBeenCalledOnce();
    expect(harness.toggle.dataset.contextInspectorToggleBound).toBeUndefined();
  });

  it('为地图复用星球宿主，并为其他工作区创建隔离容器', function () {
    var harness = createHarness();
    var planetPanel = createElement('planet-detail-panel');
    var archiveView = createElement('archive-view');
    archiveView.dataset.contextWorkspaceView = 'archive';
    harness.host.querySelector = function (selector) {
      return selector === '#planet-detail-panel' ? planetPanel : null;
    };
    harness.host.querySelectorAll = function () { return [archiveView]; };
    harness.adapter.init({ document: harness.document });

    expect(harness.adapter.getRendererContainer('map')).toBe(planetPanel);
    expect(planetPanel.hidden).toBe(false);
    expect(archiveView.hidden).toBe(true);

    var tradeView = harness.adapter.getRendererContainer('trade');
    expect(tradeView.dataset.contextWorkspaceView).toBe('trade');
    expect(tradeView.className).toContain('context-workspace-view--trade');
    expect(harness.host.children).toContain(tradeView);
    expect(planetPanel.hidden).toBe(true);
  });

  it('投影壳层/空态并管理关闭按钮与来源焦点', function () {
    var harness = createHarness();
    var restoreTarget = createElement('restore');
    harness.adapter.init({ document: harness.document });

    expect(harness.adapter.applyShellView({
      title: '商品检查',
      contextType: 'commodity',
      contextId: 'food',
      rendererState: 'ready',
    })).toBe(true);
    expect(harness.title.textContent).toBe('商品检查');
    expect(harness.root.dataset).toMatchObject({
      contentState: 'context',
      contextId: 'food',
      contextType: 'commodity',
      rendererState: 'ready',
    });

    expect(harness.adapter.renderEmpty({ title: '尚未选择上下文', note: '请选择对象' })).toBe(true);
    expect(harness.emptyTitle.textContent).toBe('尚未选择上下文');
    expect(harness.emptyNote.textContent).toBe('请选择对象');
    expect(harness.host.hidden).toBe(true);

    harness.adapter.setRestoreFocusTarget(restoreTarget);
    expect(harness.adapter.focusClose()).toBe(true);
    expect(harness.adapter.restoreFocus()).toBe(true);
    expect(harness.close.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(restoreTarget.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(Object.isFrozen(harness.adapter.getDiagnostics())).toBe(true);
  });
});
