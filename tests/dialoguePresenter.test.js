import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDialogueView } from '../js/ui/DialoguePresenter.js';

describe('DialoguePresenter', function () {
  it('投影主线场景、进度和下一步语义', function () {
    var view = buildDialogueView({
      active: true,
      activeLineCount: 2,
      choiceMode: false,
      choices: [],
      isMainLine: true,
      line: { icon: '📡', speaker: '导航员', text: '收到。' },
      lineIndex: 0,
      mainLineCount: 2,
      scene: { label: '剧情演出', title: '通讯接入', footer: '保持联络' },
      selectedChoice: null,
    });

    expect(Object.isFrozen(view)).toBe(true);
    expect(view).toMatchObject({ currentStep: 1, totalSteps: 2, mode: 'line', footerVisible: true });
    expect(view.nextButton).toMatchObject({ label: '下一句', ariaLabel: '播放下一句', hidden: false });
    expect(view.summaryItems[0]).toEqual({ label: '进度', value: '1 / 2' });
    expect(view.progressHtml).toContain('dialogue-progress-dot active');
  });

  it('投影选择态、分支卡和回应阶段累计进度', function () {
    var choiceView = buildDialogueView({
      active: true,
      activeLineCount: 1,
      choiceMode: true,
      choices: [{ text: '追问', hint: '记录谨慎态度' }],
      isMainLine: true,
      line: { text: '请选择' },
      lineIndex: 0,
      mainLineCount: 1,
      scene: { lines: [{}] },
      selectedChoice: null,
    });
    expect(choiceView.nextButton).toMatchObject({ hidden: true, disabled: true });
    expect(choiceView.choices[0]).toMatchObject({ text: '追问', ariaLabel: '追问，记录谨慎态度' });
    expect(choiceView.branchItems[1].value).toBe('等待选择');

    var responseView = buildDialogueView({
      active: true,
      activeLineCount: 2,
      choiceMode: false,
      choices: [{ text: '追问' }],
      isMainLine: false,
      line: { text: '回应' },
      lineIndex: 0,
      mainLineCount: 1,
      scene: {},
      selectedChoice: { text: '追问', responseFooter: '已记录' },
    });
    expect(responseView).toMatchObject({ currentStep: 2, totalSteps: 3, footerText: '已记录' });
    expect(responseView.branchItems[0].note).toBe('回应通讯');
    expect(responseView.branchItems[3].value).toBe('追问');
  });

  it('保持纯投影边界，不读取 DOM、Surface 或事件', function () {
    var source = readFileSync('js/ui/DialoguePresenter.js', 'utf8');
    expect(source).not.toContain('document.');
    expect(source).not.toContain('SurfaceManager');
    expect(source).not.toContain('addEventListener');
    expect(buildDialogueView({ active: false })).toBeNull();
  });
});
