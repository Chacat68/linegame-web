import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createContextInspectorController } from '../js/ui/ContextInspectorController.js';
import { createContextInspectorSession } from '../js/ui/ContextInspectorSession.js';

function createElement(id) {
  var listeners = {};
  var attributes = {};
  return {
    id: id,
    dataset: {},
    hidden: false,
    inert: false,
    focus: vi.fn(),
    contains: function () { return true; },
    addEventListener: function (type, handler) { listeners[type] = handler; },
    removeEventListener: function (type, handler) {
      if (listeners[type] === handler) delete listeners[type];
    },
    dispatch: function (type, event) {
      if (listeners[type]) listeners[type](Object.assign({ currentTarget: this, target: this, preventDefault: vi.fn() }, event || {}));
    },
    getAttribute: function (name) { return attributes[name] || null; },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
  };
}

function createHarness() {
  var root = createElement('context-inspector');
  var close = createElement('context-close');
  var toggle = createElement('context-toggle');
  var content = createElement('context-inspector-content');
  var empty = createElement('context-inspector-empty');
  var host = createElement('context-inspector-render-host');
  var title = createElement('context-inspector-title');
  toggle.dataset.contextWorkspace = 'trade';
  root.querySelector = function () { return close; };
  var elements = {
    'context-inspector': root,
    'context-inspector-content': content,
    'context-inspector-empty': empty,
    'context-inspector-render-host': host,
    'context-inspector-title': title,
  };
  var escapeLayer = null;
  var release = vi.fn();
  var controller = createContextInspectorController({
    session: createContextInspectorSession(),
    registerEscapeLayer: vi.fn(function (id, layer) {
      escapeLayer = layer;
      return release;
    }),
  });
  return {
    controller: controller,
    root: root,
    close: close,
    toggle: toggle,
    host: host,
    title: title,
    release: release,
    getEscapeLayer: function () { return escapeLayer; },
    document: {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return [toggle]; },
    },
  };
}

describe('ContextInspectorController', function () {
  it('以最新 state 委托 Context action，并由注入 Escape 恢复来源焦点', function () {
    var harness = createHarness();
    var state = { revision: 1 };
    var onAction = vi.fn();
    var restoreTarget = createElement('restore');
    harness.controller.init({
      document: harness.document,
      workspaceId: 'trade',
      stateSource: function () { return state; },
      open: false,
    });
    harness.controller.registerRenderer('trade', function () {
      return { title: '商品检查', onAction: onAction };
    });
    harness.controller.replaceContext({ type: 'commodity', id: 'food', workspaceId: 'trade', revision: 1 });
    harness.controller.open({ focus: false, restoreFocusTo: restoreTarget });
    state = { revision: 2 };
    var target = {
      dataset: { contextAction: 'open-detail', goodId: 'food' },
      closest: function () { return this; },
    };
    harness.host.dispatch('click', { target: target });

    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
      action: 'open-detail', state: state, target: target, workspaceId: 'trade',
    }));
    harness.getEscapeLayer().onEscape();
    expect(restoreTarget.focus).toHaveBeenCalledOnce();
    expect(harness.controller.getSnapshot().open).toBe(false);
  });

  it('renderer 拒绝对象时清理 context，dispose 释放 DOM 与 Escape owner', function () {
    var harness = createHarness();
    harness.controller.init({ document: harness.document, workspaceId: 'trade' });
    harness.controller.registerRenderer('trade', function () { return false; });
    harness.controller.replaceContext({ type: 'commodity', id: 'missing', workspaceId: 'trade' });

    expect(harness.controller.getContext('trade')).toBe(null);
    expect(harness.root.dataset.contextId).toBe('');
    expect(harness.root.dataset.contentState).toBe('empty');
    expect(harness.controller.dispose()).toBe(true);
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.controller.dispose()).toBe(false);
  });

  it('视口模式切换使用独立开合偏好并恢复桌面状态', function () {
    var harness = createHarness();
    harness.controller.init({ document: harness.document, workspaceId: 'trade', open: true });
    harness.controller.registerRenderer('trade', function () { return true; });

    harness.controller.setCompactMode(true);
    expect(harness.root.hidden).toBe(true);
    expect(harness.toggle.getAttribute('aria-expanded')).toBe('false');

    harness.controller.open({ focus: false });
    expect(harness.root.hidden).toBe(false);
    harness.controller.setCompactMode(false);
    expect(harness.root.hidden).toBe(false);
  });

  it('兼容门面不再持有 DOM、Escape 或会话状态', function () {
    var facade = readFileSync('js/ui/ContextInspector.js', 'utf8');
    expect(facade).toContain("from './ContextInspectorController.js'");
    expect(facade).toContain("from './ContextInspectorSession.js'");
    expect(facade).toContain('export function setCompactMode');
    expect(facade).not.toMatch(/document\.|querySelector|registerEscapeLayer|new Map\(/);
  });
});
