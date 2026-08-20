import { describe, expect, it } from 'vitest';
import { buildWorkspaceObjectDetailView } from '../js/ui/WorkspaceObjectDetailPresenter.js';

describe('WorkspaceObjectDetailPresenter', function () {
  it('把已归一化领域事实投影为一致的语义 L4 结构', function () {
    var view = buildWorkspaceObjectDetailView({
      id: 'quest-1',
      kind: 'quest',
      kindLabel: '任务',
      detailLabel: '任务详情',
      icon: '📋',
      eyebrow: '贸易任务 · 第 1 章',
      title: '第一笔贸易',
      description: '完成一次有效交易。',
      metrics: [
        { label: '状态', value: '进行中' },
        { label: '目标', value: '0/1' },
      ],
      facts: [
        { label: '目标 01', value: '完成交易次数', detail: '0/1 · 待推进' },
      ],
      tags: ['进行中', '常规任务'],
    });

    expect(view.title).toBe('第一笔贸易 · 任务详情');
    expect(view.html).toContain('data-workspace-object-detail="quest-1"');
    expect(view.html).toContain('data-workspace-object-kind="quest"');
    expect(view.html).toContain('workspace-detail-object-grid');
    expect(view.html).toContain('role="list" aria-label="第一笔贸易任务事实"');
    expect(view.html).toContain('完成交易次数');
    expect(view.html).toContain('常规任务');
  });

  it('转义标题、描述、指标、事实、标签和属性中的不可信文本', function () {
    var view = buildWorkspaceObjectDetailView({
      id: 'x" onmouseover="boom',
      kind: 'quest<script>',
      title: '<img src=x onerror=boom>',
      description: '<script>boom()</script>',
      metrics: [{ label: '<b>状态</b>', value: '<svg onload=boom>' }],
      facts: [{ label: '<i>目标</i>', value: '<iframe>', detail: '" onclick="boom' }],
      tags: ['<video onerror=boom>'],
      note: '<style>body{display:none}</style>',
    });

    expect(view.html).not.toContain('<img');
    expect(view.html).not.toContain('<script>');
    expect(view.html).not.toContain('<svg');
    expect(view.html).not.toContain('<iframe');
    expect(view.html).not.toContain('<video');
    expect(view.html).not.toContain('<style>');
    expect(view.html).toContain('&lt;img src=x onerror=boom&gt;');
    expect(view.html).toContain('x&quot; onmouseover=&quot;boom');
  });

  it('拒绝缺少稳定 id、类型或标题的对象，并忽略畸形事实项', function () {
    expect(buildWorkspaceObjectDetailView({ kind: 'quest', title: '任务' })).toBeNull();
    expect(buildWorkspaceObjectDetailView({ id: 'q', title: '任务' })).toBeNull();
    expect(buildWorkspaceObjectDetailView({ id: 'q', kind: 'quest' })).toBeNull();

    var view = buildWorkspaceObjectDetailView({
      id: 'q',
      kind: 'quest',
      title: '任务',
      metrics: [null, 'bad', { label: '', value: 'x' }],
      facts: [{ label: '有效项', value: '有效值' }, { label: '缺值' }],
    });
    expect(view.html).not.toContain('workspace-context-metrics');
    expect(view.html).toContain('有效项');
    expect(view.html).not.toContain('缺值');
  });
});
