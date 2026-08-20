import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createLogsWorkspaceSession } from '../js/ui/LogsWorkspaceSession.js';

describe('LogsWorkspaceSession', function () {
  it('HUD 通过纯会话端口持有通讯历史，不再复制模块全局数组和计数器', function () {
    var source = readFileSync('js/ui/HUD.js', 'utf8');
    expect(source).toContain("from './LogsWorkspaceSession.js'");
    ['_logsHistory', '_nextLogId', '_unreadLogCount'].forEach(function (legacyOwner) {
      expect(source).not.toContain(legacyOwner);
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
      entryCount: 2,
      latestEntryId: 'message-3',
      maxEntries: 2,
      nextEntryId: 'message-4',
      resetCount: 0,
      unreadCount: 3,
    });
    expect(Object.isFrozen(session.getDiagnostics())).toBe(true);
    expect(Object.isFrozen(session.getEntries())).toBe(true);
    expect(Object.isFrozen(session.getEntries()[0])).toBe(true);
    expect(other.getDiagnostics().entryCount).toBe(0);
  });

  it('reset 清空旧存档通讯、未读状态和消息序号', function () {
    var session = createLogsWorkspaceSession();
    session.addEntry({ text: '旧存档消息', type: 'tip' });
    session.clearUnread();
    session.addEntry({ text: '旧存档警报', type: 'danger' });

    expect(session.reset()).toEqual({
      entryCount: 0,
      latestEntryId: null,
      maxEntries: 200,
      nextEntryId: 'message-1',
      resetCount: 1,
      unreadCount: 0,
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
