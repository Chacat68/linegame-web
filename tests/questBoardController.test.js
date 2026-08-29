import { describe, expect, it } from 'vitest';
import { createQuestBoardController } from '../js/ui/QuestBoardController.js';
import { createQuestWorkspaceSession } from '../js/ui/QuestWorkspaceSession.js';

function createTarget(selector, dataset, options) {
  var opts = options || {};
  return {
    dataset: Object.assign({}, dataset || {}),
    disabled: !!opts.disabled,
    closest: function (candidate) { return candidate === selector ? this : null; },
  };
}

function createContainer() {
  var selected = {
    focused: false,
    scrolled: false,
    focus: function () { this.focused = true; },
    scrollIntoView: function () { this.scrolled = true; },
  };
  var acceptHub = {
    scrolled: false,
    scrollIntoView: function () { this.scrolled = true; },
  };
  return {
    onclick: null,
    onkeydown: null,
    selected: selected,
    acceptHub: acceptHub,
    querySelector: function (selector) {
      if (selector === '[data-quest-accept-hub]') return acceptHub;
      if (selector === '[data-quest-select-id="starter_first_trade"]') return selected;
      return null;
    },
  };
}

describe('QuestBoardController', function () {
  it('以单一容器委托候选选择和键盘检查，并公开冻结诊断', function () {
    var session = createQuestWorkspaceSession();
    var inspected = [];
    var renderCount = 0;
    var container = createContainer();
    var controller = createQuestBoardController({
      inspectQuest: function (questId, source) { inspected.push([questId, source]); },
      session: session,
    });
    expect(controller.bind(container, {
      state: {},
      onRequestRender: function () { renderCount += 1; },
    })).toBe(true);

    container.onclick({
      target: createTarget('[data-quest-select-id]', { questSelectId: 'starter_first_trade' }),
    });
    expect(session.getSelectedAvailableQuest()).toBe('starter_first_trade');
    expect(inspected).toEqual([['starter_first_trade', 'archive-quest-picker']]);
    expect(renderCount).toBe(1);

    var prevented = false;
    container.onkeydown({
      key: 'Enter',
      target: createTarget('.quest-card[data-quest-id]', { questId: 'starter_visit_2' }),
      preventDefault: function () { prevented = true; },
    });
    expect(prevented).toBe(true);
    expect(inspected[1]).toEqual(['starter_visit_2', 'archive-quest-card']);
    var diagnostics = controller.getDiagnostics();
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.activeContext)).toBe(true);
    expect(diagnostics).toEqual(expect.objectContaining({
      bindCount: 1,
      intentCount: 2,
      lastIntent: 'quest.inspect',
    }));
  });

  it('放弃任务必须经过确认，并丢弃重绘后到达的旧确认', function () {
    var session = createQuestWorkspaceSession();
    var confirmations = [];
    var abandoned = [];
    var container = createContainer();
    var controller = createQuestBoardController({
      openConfirmation: function (options) { confirmations.push(options); return true; },
      session: session,
    });
    var request = {
      state: {},
      onAbandon: function (questId) { abandoned.push(questId); },
    };
    controller.bind(container, request);
    container.onclick({
      target: createTarget('.quest-abandon-btn', { id: 'quest_a', name: '旧任务' }),
    });
    expect(abandoned).toEqual([]);
    expect(confirmations[0].title).toContain('旧任务');
    controller.bind(container, request);
    confirmations[0].onConfirm();
    expect(abandoned).toEqual([]);
    expect(controller.getDiagnostics().droppedConfirmationCount).toBe(1);

    container.onclick({
      target: createTarget('.quest-abandon-btn', { id: 'quest_b', name: '新任务' }),
    });
    confirmations[1].onConfirm();
    expect(abandoned).toEqual(['quest_b']);
    controller.clearContext();
    expect(container.onclick).toBe(null);
    expect(container.onkeydown).toBe(null);
  });

  it('回退任务 intent 会更新会话、重绘聚焦并继续发布 blocker action', function () {
    var session = createQuestWorkspaceSession();
    var resolved = [];
    var renderCount = 0;
    var container = createContainer();
    var controller = createQuestBoardController({ session: session });
    controller.bind(container, {
      state: {},
      onRequestRender: function () { renderCount += 1; },
      onResolveQuestBlocker: function (action) { resolved.push(action); },
    });
    container.onclick({
      target: createTarget('.quest-dispatch-blocker-btn', {
        actionId: 'quest-focus',
        reasonId: 'fallback',
        questId: 'blocked_quest',
        questName: '阻塞任务',
        targetQuestId: 'starter_first_trade',
        targetQuestName: '第一桶金',
      }),
    });

    expect(session.getSelectedAvailableQuest()).toBe('starter_first_trade');
    expect(renderCount).toBe(1);
    expect(container.acceptHub.scrolled).toBe(true);
    expect(container.selected.scrolled).toBe(true);
    expect(container.selected.focused).toBe(true);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ actionId: 'quest-focus', targetQuestId: 'starter_first_trade' });
    expect(controller.getDiagnostics()).toEqual(expect.objectContaining({
      focusRequestCount: 1,
      focusSuccessCount: 1,
      lastIntent: 'quest.blocker.resolve',
    }));

    var reset = controller.reset();
    expect(reset).toEqual(expect.objectContaining({
      activeContext: null,
      bindCount: 0,
      intentCount: 0,
      resetCount: 1,
    }));
  });
});
