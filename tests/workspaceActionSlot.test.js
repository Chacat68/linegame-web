import { describe, expect, it } from 'vitest';
import { buildWorkspaceActionSlot } from '../js/ui/WorkspaceActionSlot.js';

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
});
