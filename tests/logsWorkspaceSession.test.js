import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createLogsWorkspaceSession } from '../js/ui/LogsWorkspaceSession.js';

describe('LogsWorkspaceSession', function () {
  it('HUD 通过纯会话端口持有通讯历史，不再复制模块全局数组和计数器', function () {
    var source = readFileSync('js/ui/HUD.js', 'utf8');
    var controllerSource = readFileSync('js/ui/LogsWorkspaceController.js', 'utf8');
    expect(source).toContain("from './LogsWorkspaceController.js'");
    expect(controllerSource).toContain("from './LogsWorkspaceSession.js'");
    ['_logsHistory', '_nextLogId', '_unreadLogCount'].forEach(function (legacyOwner) {
      expect(source).not.toContain(legacyOwner);
      expect(controllerSource).not.toContain(legacyOwner);
    });
  });

  it('独立实例按新到旧保留限额历史，并公开冻结诊断', function () {
    var clock = 0;
    var session = createLogsWorkspaceSession({
      maxEntries: 2,
      createTime: function () { return new Date(1000 * ++clock); },
    });
    var other = createLogsWorkspaceSession();

    session.addEntry({ text: '系统就绪', type: 'info' });
    session.addEntry({ text: '成交完成', type: 'trade' });
    session.addEntry({ text: '路线警报', type: 'danger' });

    expect(session.getEntries().map(function (entry) { return entry.text; })).toEqual([
      '路线警报',
      '成交完成',
    ]);
    expect(session.getEntry('message-1')).toBeNull();
    expect(session.getDiagnostics()).toEqual({
      aggregationEnabled: true,
      aggregationWindowMs: 30000,
      entryCount: 2,
      filterType: 'all',
      latestEntryId: 'message-3',
      maxEntries: 2,
      nextEntryId: 'message-4',
      recentWindowMs: 300000,
      resetCount: 0,
      sourceCounts: { commerce: 1, system: 1 },
      timeWindow: 'all',
      unreadCount: 3,
      visibleEntryCount: 2,
    });
    expect(Object.isFrozen(session.getDiagnostics())).toBe(true);
    expect(Object.isFrozen(session.getDiagnostics().sourceCounts)).toBe(true);
    expect(Object.isFrozen(session.getEntries())).toBe(true);
    expect(Object.isFrozen(session.getEntries()[0])).toBe(true);
    expect(other.getDiagnostics().entryCount).toBe(0);
  });

  it('按类型和最近五分钟筛选，并可切换短时重复聚合', function () {
    var session = createLogsWorkspaceSession();
    var now = Date.parse('2026-08-21T12:00:00Z');
    session.addEntry({ text: '旧系统记录', type: 'info', time: now - 10 * 60 * 1000 });
    session.addEntry({ text: '重复成交', type: 'buy', time: now - 20 * 1000 });
    session.addEntry({ text: '重复成交', type: 'buy', time: now - 5 * 1000 });
    session.addEntry({ text: '航线风险', type: 'error', time: now - 1000 });
    session.addEntry({ text: '科研完成', type: 'upgrade', source: 'research', time: now - 500 });

    session.setFilterType('trade');
    var aggregated = session.getVisibleEntries({ now: now });
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]).toMatchObject({
      id: 'message-3',
      repeatCount: 2,
      sourceEntryIds: ['message-3', 'message-2'],
      text: '重复成交',
      type: 'buy',
    });
    expect(Object.isFrozen(aggregated)).toBe(true);
    expect(Object.isFrozen(aggregated[0])).toBe(true);
    expect(Object.isFrozen(aggregated[0].sourceEntryIds)).toBe(true);

    session.setAggregationEnabled(false);
    expect(session.getVisibleEntries({ now: now }).map(function (entry) { return entry.id; })).toEqual([
      'message-3',
      'message-2',
    ]);

    session.setFilterType('not-a-filter');
    session.setTimeWindow('recent');
    expect(session.getVisibleEntries({ now: now }).map(function (entry) { return entry.id; })).toEqual([
      'message-5',
      'message-4',
      'message-3',
      'message-2',
    ]);
    expect(session.getDiagnostics({ now: now })).toMatchObject({
      aggregationEnabled: false,
      filterType: 'all',
      timeWindow: 'recent',
      visibleEntryCount: 4,
    });

    session.setFilterType('research');
    expect(session.getVisibleEntries({ now: now })).toMatchObject([
      { id: 'message-5', source: 'research', text: '科研完成' },
    ]);
  });

  it('reset 清空旧存档通讯、未读状态和消息序号', function () {
    var session = createLogsWorkspaceSession();
    session.addEntry({ text: '旧存档消息', type: 'tip' });
    session.clearUnread();
    session.addEntry({ text: '旧存档警报', type: 'danger' });

    expect(session.reset()).toEqual({
      aggregationEnabled: true,
      aggregationWindowMs: 30000,
      entryCount: 0,
      filterType: 'all',
      latestEntryId: null,
      maxEntries: 200,
      nextEntryId: 'message-1',
      recentWindowMs: 300000,
      resetCount: 1,
      sourceCounts: {},
      timeWindow: 'all',
      unreadCount: 0,
      visibleEntryCount: 0,
    });
    expect(session.addEntry({ text: '新会话', type: 'info' }).id).toBe('message-1');
  });

  it('HUD reset 同步清空日志 Context 和真实消息列表', async function () {
    vi.resetModules();
    var originalDocument = globalThis.document;
    var messageLog = {
      children: [],
      dataset: {},
      addEventListener: function () {},
      appendChild: function (child) { this.children.push(child); return child; },
      replaceChildren: function () { this.children = []; },
    };
    var badge = { hidden: true, textContent: '', title: '' };

    function element(tagName) {
      return {
        tagName: String(tagName || '').toUpperCase(),
        children: [],
        className: '',
        dataset: {},
        textContent: '',
        appendChild: function (child) { this.children.push(child); return child; },
        setAttribute: function (name, value) { this[name] = String(value); },
      };
    }

    globalThis.document = {
      createElement: element,
      getElementById: function (id) {
        if (id === 'message-log') return messageLog;
        if (id === 'logs-nav-badge') return badge;
        return null;
      },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
    };

    try {
      var HUD = await import('../js/ui/HUD.js?logs-session-lifecycle');
      var Inspector = await import('../js/ui/ContextInspector.js');
      HUD.init({ revisionSource: function () { return 7; } });
      HUD.addMessage('旧存档跃迁已完成', 'travel');
      Inspector.replaceContext({
        workspaceId: 'logs',
        type: 'message',
        id: 'message-1',
        source: 'test',
        revision: 7,
      }, { render: false });

      expect(HUD.getDiagnostics()).toMatchObject({
        entryCount: 1,
        selectedMessageId: 'message-1',
        unreadCount: 1,
      });
      expect(messageLog.children).toHaveLength(1);

      var diagnostics = HUD.resetRuntimeState();

      expect(diagnostics).toMatchObject({
        entryCount: 0,
        nextEntryId: 'message-1',
        resetCount: 1,
        selectedMessageId: null,
        unreadCount: 0,
      });
      expect(Inspector.getContext('logs')).toBeNull();
      expect(messageLog.children).toHaveLength(1);
      expect(messageLog.children[0].className).toContain('log-empty-state');
      expect(badge.hidden).toBe(true);
    } finally {
      globalThis.document = originalDocument;
    }
  });
});
