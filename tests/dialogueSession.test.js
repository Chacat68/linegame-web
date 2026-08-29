import { describe, expect, it } from 'vitest';
import { createDialogueSession } from '../js/ui/DialogueSession.js';

describe('DialogueSession', function () {
  it('拒绝空场景并建立冻结的主线快照', function () {
    var session = createDialogueSession();
    expect(session.start(null)).toBe(false);
    expect(session.start({ lines: [] })).toBe(false);

    expect(session.start({ id: 'intro', lines: [{ text: 'A' }, { text: 'B' }] })).toBe(true);
    var snapshot = session.getSnapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot).toMatchObject({ active: true, isMainLine: true, lineIndex: 0, mainLineCount: 2 });
    expect(snapshot.line.text).toBe('A');
  });

  it('按主线、选择、回应和完成顺序推进', function () {
    var session = createDialogueSession();
    session.start({
      lines: [{ text: 'A' }, { text: 'B' }],
      choices: [{ id: 'ask', text: '追问', responseLines: [{ text: 'R1' }, { text: 'R2' }] }],
    });

    expect(session.advance().type).toBe('line');
    expect(session.advance().type).toBe('choices');
    expect(session.getSnapshot().choiceMode).toBe(true);
    expect(session.advance()).toMatchObject({ type: 'blocked', changed: false });
    expect(session.selectChoice(0).type).toBe('response');
    expect(session.getSnapshot()).toMatchObject({ isMainLine: false, lineIndex: 0 });
    expect(session.advance().type).toBe('line');
    expect(session.advance()).toMatchObject({ type: 'complete', changed: false });
    expect(session.getDiagnostics()).toMatchObject({ advanceCount: 4, selectionCount: 1, selectedChoiceId: 'ask' });
  });

  it('无回应文本的分支直接完成且非法选择不改变状态', function () {
    var session = createDialogueSession();
    session.start({ lines: [{ text: 'A' }], choices: [{ id: 'close', text: '结束' }] });
    expect(session.selectChoice(0)).toMatchObject({ type: 'blocked', changed: false });
    session.advance();
    expect(session.selectChoice(9)).toMatchObject({ type: 'blocked', changed: false });
    expect(session.selectChoice(0)).toMatchObject({ type: 'complete', changed: false });
    expect(session.getSnapshot().selectedChoice.id).toBe('close');
  });

  it('reset 清除场景与分支状态但保留诊断计数', function () {
    var session = createDialogueSession();
    session.start({ lines: [{ text: 'A' }] });
    session.reset();
    expect(session.getSnapshot()).toMatchObject({ active: false, line: null, choiceMode: false });
    expect(session.getDiagnostics()).toMatchObject({ startCount: 1, resetCount: 1 });
  });
});
