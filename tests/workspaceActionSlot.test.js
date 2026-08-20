import { describe, expect, it } from 'vitest';
import {
  buildWorkspaceActionSlot,
  buildWorkspaceOpenDetailSlot,
} from '../js/ui/WorkspaceActionSlot.js';

describe('WorkspaceActionSlot', function () {
  it('输出可识别的 local scope、对象上下文、动作 id 与无障碍禁用态', function () {
    var html = buildWorkspaceActionSlot({
      workspaceId: 'map',
      contextType: 'planet',
      contextId: 'nova_station',
      label: '航点局部操作',
      className: 'planet-detail-action-shelf',
      actions: [
        {
          id: 'travel',
          label: '前往该星球',
          disabled: true,
          title: '燃料不足',
          attributes: {
            'data-planet-detail-action': 'travel',
            'data-system-id': 'nova_station',
          },
        },
        { id: 'close-detail', label: '收起详情', variant: 'quiet' },
      ],
      note: '这是当前航点内的操作。',
    });

    expect(html).toContain('data-workspace-action-slot');
    expect(html).toContain('data-action-scope="local"');
    expect(html).toContain('data-workspace-id="map"');
    expect(html).toContain('data-context-type="planet"');
    expect(html).toContain('data-context-id="nova_station"');
    expect(html).toContain('data-workspace-action-id="travel"');
    expect(html).toContain('data-planet-detail-action="travel"');
    expect(html).toContain('disabled aria-disabled="true"');
    expect(html).toContain('workspace-action-slot__action--quiet');
    expect(html).not.toContain('当前建议');
    expect(html).not.toContain('下一步');
  });

  it('缺少 workspace 或有效动作时不渲染伪操作槽，并转义外部文本', function () {
    expect(buildWorkspaceActionSlot({ workspaceId: '', actions: [{ id: 'x', label: 'X' }] })).toBe('');
    expect(buildWorkspaceActionSlot({ workspaceId: 'map', actions: [] })).toBe('');
    var html = buildWorkspaceActionSlot({
      workspaceId: 'map',
      actions: [{ id: 'x', label: '<script>alert(1)</script>' }],
    });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('为 Context 对象详情生成统一 local-scope 入口并保留返回焦点锚点', function () {
    var html = buildWorkspaceOpenDetailSlot({
      workspaceId: 'trade',
      contextType: 'commodity',
      contextId: 'ore',
      label: '查看完整商品详情',
      attributes: { 'data-good-id': 'ore' },
    });

    expect(html).toContain('data-workspace-id="trade"');
    expect(html).toContain('data-context-type="commodity"');
    expect(html).toContain('data-context-id="ore"');
    expect(html).toContain('data-workspace-action-id="open-detail"');
    expect(html).toContain('data-context-action="open-detail"');
    expect(html).toContain('data-good-id="ore"');
  });
});
