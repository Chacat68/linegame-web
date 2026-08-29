import { describe, expect, it } from 'vitest';
import { createQuestWorkspaceSession } from '../js/ui/QuestWorkspaceSession.js';

describe('QuestWorkspaceSession', function () {
  it('规范化候选任务焦点并公开冻结诊断', function () {
    var session = createQuestWorkspaceSession();
    expect(session.getSelectedAvailableQuest()).toBe(null);
    expect(session.setSelectedAvailableQuest(' starter_first_trade ')).toBe('starter_first_trade');
    expect(session.setSelectedAvailableQuest('starter_first_trade')).toBe('starter_first_trade');

    var diagnostics = session.getDiagnostics();
    expect(diagnostics).toEqual({
      selectedAvailableQuestId: 'starter_first_trade',
      selectionCount: 1,
      resetCount: 0,
    });
    expect(Object.isFrozen(diagnostics)).toBe(true);
  });

  it('不同会话互不污染，reset 会清除焦点并记录代次', function () {
    var first = createQuestWorkspaceSession();
    var second = createQuestWorkspaceSession();
    first.setSelectedAvailableQuest('starter_first_trade');
    second.setSelectedAvailableQuest('starter_visit_2');

    expect(first.getSelectedAvailableQuest()).toBe('starter_first_trade');
    expect(second.getSelectedAvailableQuest()).toBe('starter_visit_2');
    expect(first.reset()).toEqual({
      selectedAvailableQuestId: null,
      selectionCount: 0,
      resetCount: 1,
    });
    expect(second.getSelectedAvailableQuest()).toBe('starter_visit_2');
    expect(first.setSelectedAvailableQuest('  ')).toBe(null);
    expect(first.getDiagnostics().selectionCount).toBe(0);
  });
});
