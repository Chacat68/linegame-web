import { describe, expect, it } from 'vitest';
import { renderLogContext } from '../js/ui/LogsContextPresenter.js';

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
    expect(container.innerHTML).not.toContain('旧消息');
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
    expect(container.innerHTML).toBe('unchanged');
  });
});
