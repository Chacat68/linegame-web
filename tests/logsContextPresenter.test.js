import { describe, expect, it } from 'vitest';
import { renderLogContext, renderLogDetail } from '../js/ui/LogsContextPresenter.js';

describe('LogsContextPresenter', function () {
  it('按不可变 message key 解析只读历史并转义消息内容', function () {
    var container = { innerHTML: '' };
    var result = renderLogContext({
      context: { type: 'message', id: 'message-2' },
      container: container,
    }, [
      { id: 'message-1', type: 'info', text: '旧消息', time: new Date('2026-08-13T02:03:04') },
      { id: 'message-2', type: 'error', text: '<风险> & 检查', time: new Date('2026-08-13T05:06:07') },
    ], { info: '系统', error: '警报' });

    expect(result).toEqual({ title: '消息检查' });
    expect(container.innerHTML).toContain('&lt;风险&gt; &amp; 检查');
    expect(container.innerHTML).toContain('警报');
    expect(container.innerHTML).toContain('风险警报');
    expect(container.innerHTML).toContain('只读历史记录');
    expect(container.innerHTML).toContain('data-context-action="open-detail"');
    expect(container.innerHTML).toContain('data-context-id="message-2"');
    expect(container.innerHTML).not.toContain('旧消息');
  });

  it('把最新会话历史投影为只读 L4，并完整转义消息与内部类型', function () {
    var container = { innerHTML: '' };
    var entries = [
      { id: 'message-3', type: 'tip', text: '新消息', time: new Date('2026-08-13T08:09:10') },
      { id: 'message-2', type: '<error>', text: '<script>风险</script>', time: 'invalid' },
      { id: 'message-1', type: 'info', text: '旧消息', time: new Date('2026-08-13T02:03:04') },
    ];
    var result = renderLogDetail({
      detail: { type: 'logs-message', id: 'message-2' },
      container: container,
    }, entries, { info: '系统' });

    expect(result).toEqual({ title: '通讯记录 · 消息详情' });
    expect(container.innerHTML).toContain('data-workspace-object-detail="message-2"');
    expect(container.innerHTML).toContain('data-workspace-object-kind="message"');
    expect(container.innerHTML).toContain('倒序第 2 条');
    expect(container.innerHTML).toContain('当前共有 3 条会话记录');
    expect(container.innerHTML).toContain('当前运行会话');
    expect(container.innerHTML).toContain('&lt;script&gt;风险&lt;/script&gt;');
    expect(container.innerHTML).toContain('内部类型：&lt;error&gt;');
    expect(container.innerHTML).not.toContain('<script>');
  });

  it('拒绝错误类型和已淘汰的历史 key', function () {
    var container = { innerHTML: 'unchanged' };
    expect(renderLogContext({
      context: { type: 'quest', id: 'message-1' },
      container: container,
    }, [])).toBe(false);
    expect(renderLogContext({
      context: { type: 'message', id: 'missing' },
      container: container,
    }, [{ id: 'message-1', text: 'hi' }])).toBe(false);
    expect(renderLogDetail({
      detail: { type: 'logs-message', id: 'missing' },
      container: container,
    }, [{ id: 'message-1', text: 'hi' }])).toBe(false);
    expect(container.innerHTML).toBe('unchanged');
  });
});
