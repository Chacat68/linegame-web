import { describe, expect, it } from 'vitest';
import {
  getVictoryNextRequirement,
  renderVictoryProgressModal,
  renderVictoryProgressSummary,
} from '../js/ui/VictoryProgressPresenter.js';

function createElement() {
  return {
    attributes: {},
    innerHTML: '',
    textContent: '',
    setAttribute: function (name, value) { this.attributes[name] = String(value); },
  };
}

describe('VictoryProgressPresenter', function () {
  it('渲染唯一长期路线摘要，并按已解锁路径数量陈述状态', function () {
    var summary = createElement();
    var doc = { getElementById: function () { return summary; } };

    expect(renderVictoryProgressSummary([
      { completed: true },
      { completed: false },
    ], 3, doc)).toBe(true);
    expect(summary.textContent).toBe('1/3 已完成');

    renderVictoryProgressSummary([], 0, doc);
    expect(summary.textContent).toBe('0 条路径（章节解锁中）');
  });

  it('详情 presenter 选择最接近的未完成条件并转义领域内容', function () {
    var body = createElement();
    var doc = { getElementById: function (id) { return id === 'victory-modal-body' ? body : null; } };
    var path = {
      pathId: 'explore<unsafe>',
      name: '银河 <远征>',
      icon: '🧭',
      color: '#00ffff',
      progress: 0.75,
      completed: false,
      requirements: [
        { label: '航点', current: 3, target: 4, done: false },
        { label: '科研', current: 1, target: 4, done: false },
      ],
      policy: {
        name: '远征信条',
        summary: '<script>unsafe()</script>',
        benefit: '探索收益',
        tradeoff: '货舱减少',
      },
      policySelected: false,
      policyLocked: false,
    };

    expect(getVictoryNextRequirement(path).label).toBe('航点');
    expect(renderVictoryProgressModal([path], doc)).toBe(true);
    expect(body.attributes['aria-label']).toBe('长期路线进度详情');
    expect(body.innerHTML).toContain('当前最接近：银河 &lt;远征&gt;');
    expect(body.innerHTML).toContain('航点 · 3/4');
    expect(body.innerHTML).toContain('data-victory-policy-id="explore&lt;unsafe&gt;"');
    expect(body.innerHTML).not.toContain('<script>');
  });
});
