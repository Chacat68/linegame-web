import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLogsWorkspaceController } from '../js/ui/LogsWorkspaceController.js';

function createElement(tagName) {
  var listeners = Object.create(null);
  var classes = new Set();
  return {
    tagName: String(tagName || '').toUpperCase(),
    children: [],
    checked: false,
    className: '',
    dataset: {},
    hidden: false,
    textContent: '',
    title: '',
    value: '',
    addEventListener: function (name, listener) { listeners[name] = listener; },
    appendChild: function (child) { this.children.push(child); return child; },
    classList: { toggle: function (name, active) { if (active) classes.add(name); else classes.delete(name); } },
    contains: function () { return true; },
    dispatch: function (name) { if (listeners[name]) listeners[name]({ target: this }); },
    listenerCount: function () { return Object.keys(listeners).length; },
    removeEventListener: function (name, listener) {
      if (listeners[name] === listener) delete listeners[name];
    },
    replaceChildren: function () { this.children = []; },
    setAttribute: function (name, value) { this[name] = String(value); },
  };
}

describe('Logs workspace filters', function () {
  var originalDocument = globalThis.document;

  afterEach(function () {
    globalThis.document = originalDocument;
  });
  it('产品 DOM 提供类型、时间与重复聚合控制，窄屏保持两列筛选布局', function () {
    var html = readFileSync('index.html', 'utf8');
    var css = readFileSync('css/surfaces.css', 'utf8');
    var responsive = readFileSync('css/bridge-responsive.css', 'utf8');

    expect(html).toContain('id="logs-type-filter"');
    expect(html).toContain('id="logs-time-filter"');
    expect(html).toContain('id="logs-aggregate-toggle"');
    expect(html).toContain('id="logs-feed-summary"');
    expect(html).toContain('<option value="risk">风险</option>');
    expect(html).toContain('<option value="recent">近 5 分钟</option>');
    expect(css).toContain('.logs-filter-controls {');
    expect(css).toContain('.log-message-repeat {');
    expect(css).toMatch(/#message-log > :where\([\s\S]*?flex:\s*0 0 auto;/);
    expect(responsive).toMatch(/\.logs-filter-controls\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
  });

  it('Logs controller 消费会话可见投影，HUD 只保留稳定兼容端口', function () {
    var hudSource = readFileSync('js/ui/HUD.js', 'utf8');
    var source = readFileSync('js/ui/LogsWorkspaceController.js', 'utf8');

    expect(hudSource).toContain("from './LogsWorkspaceController.js'");
    expect(hudSource).toContain('return _logsController.refresh()');
    expect(source).toContain('session.getVisibleEntries()');
    expect(source).toContain('session.setFilterType(typeFilter.value)');
    expect(source).toContain('session.setTimeWindow(timeFilter.value)');
    expect(source).toContain('session.setAggregationEnabled(aggregationToggle.checked)');
    expect(source).toContain("repeat.textContent = '×' + entry.repeatCount");
    expect(source).toContain("visibleCount + ' / ' + totalCount + ' 条记录'");
  });

  it('筛选控件即时重绘列表，重复聚合可逆且原始记录不丢失', function () {
    var log = createElement('div');
    var typeFilter = createElement('select');
    var timeFilter = createElement('select');
    var aggregateToggle = createElement('input');
    var summary = createElement('span');
    var badge = createElement('span');
    aggregateToggle.checked = true;
    var elements = {
      'logs-aggregate-toggle': aggregateToggle,
      'logs-feed-summary': summary,
      'logs-nav-badge': badge,
      'logs-time-filter': timeFilter,
      'logs-type-filter': typeFilter,
      'message-log': log,
    };
    var contextInspector = {
      clearContext: vi.fn(),
      getContext: function () { return null; },
      getCurrentRevision: function () { return 3; },
      open: vi.fn(),
      replaceContext: vi.fn(),
    };

    globalThis.document = {
      createElement: createElement,
      getElementById: function (id) { return elements[id] || null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
    };

    var controller = createLogsWorkspaceController({
      contextInspector: contextInspector,
      typeLabels: { error: '警报', info: '系统' },
    });
    controller.initialize();
    controller.addMessage('周期刷新', 'info');
    controller.addMessage('周期刷新', 'info');

    expect(log.children).toHaveLength(1);
    expect(summary.textContent).toBe('1 / 2 条记录');
    expect(log.children[0].children[0].children.some(function (child) {
      return child.className === 'log-message-repeat' && child.textContent === '×2';
    })).toBe(true);

    controller.addMessage('船体受损', 'error');
    typeFilter.value = 'risk';
    typeFilter.dispatch('change');
    expect(log.children).toHaveLength(1);
    expect(log.children[0].className).toContain('msg-error');
    expect(summary.textContent).toBe('1 / 3 条记录');

    typeFilter.value = 'all';
    typeFilter.dispatch('change');
    aggregateToggle.checked = false;
    aggregateToggle.dispatch('change');
    expect(log.children).toHaveLength(3);
    expect(summary.textContent).toBe('3 条记录');
    expect(controller.getDiagnostics()).toMatchObject({
      aggregationEnabled: false,
      entryCount: 3,
      filterType: 'all',
      visibleEntryCount: 3,
    });

    expect(controller.getDiagnostics().listenerCount).toBe(4);
    expect(controller.dispose()).toBe(true);
    expect(controller.dispose()).toBe(false);
    expect(controller.getDiagnostics()).toMatchObject({ disposed: true, listenerCount: 0 });
    expect(typeFilter.dataset.logsFilterBound).toBeUndefined();
    expect(log.dataset.logSelectionBound).toBeUndefined();
    expect(typeFilter.listenerCount()).toBe(0);

    controller.initialize();
    expect(controller.getDiagnostics()).toMatchObject({ disposed: false, listenerCount: 4 });
    expect(typeFilter.listenerCount()).toBe(1);
  });
});
