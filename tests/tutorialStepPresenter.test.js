import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildTutorialStepView } from '../js/ui/TutorialStepPresenter.js';

describe('TutorialStepPresenter', function () {
  it('生成冻结的手动步骤进度与可访问语义', function () {
    var view = buildTutorialStepView({
      step: { phase: 2, trigger: 'manual', title: '确认市场', content: '点击【市场】' },
      index: 1,
      total: 4,
    });

    expect(Object.isFrozen(view)).toBe(true);
    expect(view).toMatchObject({ stepNumber: 2, totalSteps: 4, trigger: 'manual', position: 'center' });
    expect(view.ariaLabel).toBe('第 2 / 4 步：确认市场');
    expect(view.ariaDescribedBy).toBe('tutorial-tooltip-content');
    expect(view.html).toContain('aria-valuenow="50"');
    expect(view.html).toContain('<span class="tut-keyword">市场</span>');
    expect(view.html).toContain('id="tut-next-btn"');
  });

  it('动作步骤隐藏下一步并安全投影辅助动作', function () {
    var view = buildTutorialStepView({
      step: {
        phase: 1,
        trigger: 'click',
        npcName: '<script>',
        title: '执行操作',
        content: '不要执行 <img>',
        helperAction: { id: 'route" onclick="bad', label: '推荐<路线>' },
      },
      index: -3,
      total: 0,
    });

    expect(view.trigger).toBe('action');
    expect(view.stepNumber).toBe(1);
    expect(view.totalSteps).toBe(1);
    expect(view.html).not.toContain('id="tut-next-btn"');
    expect(view.html).toContain('id="tutorial-action-hint" role="status"');
    expect(view.html).toContain('&lt;script&gt;');
    expect(view.html).toContain('推荐&lt;路线&gt;');
    expect(view.html).not.toContain('<img>');
    expect(view.ariaDescribedBy).toContain('tutorial-action-hint');
  });

  it('保持纯投影边界，不读取 DOM、事件总线或教程系统', function () {
    var source = readFileSync('js/ui/TutorialStepPresenter.js', 'utf8');

    expect(source).not.toContain('document.');
    expect(source).not.toContain('EventBus');
    expect(source).not.toContain('TutorialSystem');
    expect(source).not.toContain('addEventListener');
  });
});
