import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createDeferredFeatureStatusUI } from '../js/ui/DeferredFeatureStatusUI.js';

function createFakeElement(tagName) {
  var attributes = Object.create(null);
  var listeners = Object.create(null);
  return {
    tagName: String(tagName || 'div').toUpperCase(),
    children: [],
    parentNode: null,
    className: '',
    textContent: '',
    hidden: false,
    disabled: false,
    type: '',
    appendChild: function (child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild: function (child) {
      this.children = this.children.filter(function (candidate) { return candidate !== child; });
      child.parentNode = null;
    },
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: function (type, handler) {
      listeners[type] = (listeners[type] || []).filter(function (candidate) { return candidate !== handler; });
    },
    dispatch: function (type) {
      (listeners[type] || []).slice().forEach(function (handler) {
        handler({ target: this, preventDefault: function () {} });
      }, this);
    },
    listenerCount: function (type) { return (listeners[type] || []).length; },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute: function (name) { delete attributes[name]; },
    querySelector: function () { return null; },
  };
}

function findByClass(root, className) {
  if (!root) return null;
  if (String(root.className || '').split(/\s+/).indexOf(className) !== -1) return root;
  for (var i = 0; i < root.children.length; i += 1) {
    var match = findByClass(root.children[i], className);
    if (match) return match;
  }
  return null;
}

function createHarness() {
  var roots = Object.create(null);
  var hosts = Object.create(null);
  [
    ['market-overlay', '.market-overlay-shell'],
    ['trade-panel', '.workspace-terminal-body'],
    ['info-panel', '.workspace-terminal-body'],
    ['settings-panel-data', '.settings-save-shell'],
    ['settings-modal', '.settings-feature-status-host'],
  ].forEach(function (entry) {
    var root = createFakeElement('section');
    var host = createFakeElement('div');
    root.querySelector = function (selector) { return selector === entry[1] ? host : null; };
    roots[entry[0]] = root;
    hosts[entry[0]] = host;
  });
  var doc = {
    createElement: function (tagName) { return createFakeElement(tagName); },
    getElementById: function (id) { return roots[id] || null; },
  };
  return {
    doc: doc,
    roots: roots,
    hosts: hosts,
    ui: createDeferredFeatureStatusUI({ document: doc }),
  };
}

describe('DeferredFeatureStatusUI', function () {
  it('在当前终端内投影 loading/error，并以单一按钮重试后清理', async function () {
    var harness = createHarness();
    var retry = vi.fn(function () { return Promise.resolve(true); });
    var root = harness.roots['trade-panel'];
    var host = harness.hosts['trade-panel'];

    expect(harness.ui.showLoading('fleet')).toBe(true);
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(root.getAttribute('data-deferred-feature-state')).toBe('loading');
    expect(host.children).toHaveLength(1);
    expect(findByClass(host.children[0], 'deferred-feature-status-actions').hidden).toBe(true);

    var panel = host.children[0];
    expect(panel.hidden).toBe(false);
    expect(panel.getAttribute('role')).toBe('status');
    expect(findByClass(panel, 'deferred-feature-status-title').textContent).toBe('正在连接机库');

    expect(harness.ui.showError('fleet', retry)).toBe(true);
    expect(root.getAttribute('aria-busy')).toBe('false');
    expect(root.getAttribute('data-deferred-feature-state')).toBe('error');
    expect(panel.getAttribute('role')).toBe('alert');
    var button = findByClass(panel, 'deferred-feature-retry');
    expect(button.hidden).toBe(false);
    expect(button.textContent).toBe('重试机库');
    expect(button.listenerCount('click')).toBe(1);

    button.dispatch('click');
    button.dispatch('click');
    await Promise.resolve();
    expect(retry).toHaveBeenCalledOnce();
    expect(harness.ui.getDiagnostics()).toEqual({
      activeFeatures: ['fleet'],
      errorCount: 1,
      loadingCount: 1,
      retryCount: 1,
    });

    expect(harness.ui.clear('fleet')).toBe(true);
    expect(panel.hidden).toBe(true);
    expect(root.getAttribute('aria-busy')).toBe('false');
    expect(root.getAttribute('data-deferred-feature-state')).toBe(null);

    harness.ui.showLoading('fleet');
    expect(host.children).toHaveLength(1);
    expect(button.listenerCount('click')).toBe(1);
    harness.ui.dispose();
    expect(host.children).toHaveLength(0);
    expect(root.getAttribute('data-deferred-feature-state')).toBe(null);
    expect(harness.ui.getDiagnostics()).toEqual({
      activeFeatures: [],
      errorCount: 0,
      loadingCount: 0,
      retryCount: 0,
    });
  });

  it('缺少宿主或未知功能时安全降级', function () {
    var ui = createDeferredFeatureStatusUI({
      document: { createElement: function () { return createFakeElement('div'); }, getElementById: function () { return null; } },
    });

    expect(ui.showLoading('market')).toBe(false);
    expect(ui.showError('unknown', function () {})).toBe(false);
    expect(ui.clear('archive')).toBe(false);
    expect(ui.getDiagnostics().activeFeatures).toEqual([]);

    var css = readFileSync('css/surfaces.css', 'utf8');
    expect(css).toContain('.deferred-feature-status {');
    expect(css).toContain('.deferred-feature-status[hidden]');
    expect(css).toContain('.deferred-feature-retry:focus-visible');
    expect(css).toContain('body[data-motion="reduced"] .deferred-feature-status-signal');
  });

  it('设置延迟模块使用 blocking modal 内的统一状态宿主', function () {
    var harness = createHarness();
    var root = harness.roots['settings-modal'];
    var host = harness.hosts['settings-modal'];
    var dismiss = vi.fn();

    expect(harness.ui.showLoading('settings')).toBe(true);
    expect(root.getAttribute('data-deferred-feature-state')).toBe('loading');
    expect(host.children).toHaveLength(1);
    expect(findByClass(host.children[0], 'deferred-feature-status-title').textContent)
      .toBe('正在连接设置中心');

    expect(harness.ui.showError('settings', function () {}, dismiss)).toBe(true);
    expect(findByClass(host.children[0], 'deferred-feature-retry').textContent)
      .toBe('重试设置中心');
    var dismissButton = findByClass(host.children[0], 'deferred-feature-dismiss');
    expect(findByClass(host.children[0], 'deferred-feature-status-actions').hidden).toBe(false);
    expect(dismissButton.hidden).toBe(false);
    expect(dismissButton.textContent).toBe('关闭设置');
    dismissButton.dispatch('click');
    expect(dismiss).toHaveBeenCalledOnce();

    var css = readFileSync('css/surfaces.css', 'utf8');
    expect(css).toContain('.deferred-feature-dismiss:focus-visible');
  });
});
