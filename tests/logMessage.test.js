import { describe, expect, it, vi } from 'vitest';
import {
  LOG_MESSAGE_SOURCE,
  createScopedLogEmitter,
  isLogMessageSource,
  normalizeLogMessage,
} from '../js/core/LogMessage.js';

describe('LogMessage envelope', function () {
  it('规范化并冻结 text/type/source，不接受未知枚举', function () {
    var message = normalizeLogMessage({
      text: ' 研究完成 ',
      type: 'UPGRADE',
      source: 'RESEARCH',
    });

    expect(message).toEqual({ text: ' 研究完成 ', type: 'upgrade', source: 'research' });
    expect(Object.isFrozen(message)).toBe(true);
    expect(normalizeLogMessage({ text: '未知', type: 'custom', source: 'custom' })).toEqual({
      text: '未知',
      type: 'info',
      source: 'system',
    });
  });

  it('旧 text/type 端口只按类型兼容商业与航行来源，不读取正文猜测', function () {
    expect(normalizeLogMessage({ text: '任意正文', type: 'buy' }).source).toBe('commerce');
    expect(normalizeLogMessage({ text: '任意正文', type: 'travel' }).source).toBe('navigation');
    expect(normalizeLogMessage({ text: '任务两个字', type: 'info' }).source).toBe('system');
  });

  it('scoped emitter 注入 typed source，同时保留消息自身更精确的来源', function () {
    var emit = vi.fn();
    var emitResearch = createScopedLogEmitter(emit, LOG_MESSAGE_SOURCE.RESEARCH);

    emitResearch({ text: '队列开始', type: 'upgrade' });
    emitResearch({ text: '任务联动', type: 'tip', source: LOG_MESSAGE_SOURCE.QUEST });

    expect(emit).toHaveBeenNthCalledWith(1, {
      text: '队列开始',
      type: 'upgrade',
      source: 'research',
    });
    expect(emit).toHaveBeenNthCalledWith(2, {
      text: '任务联动',
      type: 'tip',
      source: 'quest',
    });
  });

  it('公开来源白名单供运行时与 UI 共用', function () {
    expect(isLogMessageSource('commerce')).toBe(true);
    expect(isLogMessageSource('research')).toBe(true);
    expect(isLogMessageSource('unknown')).toBe(false);
  });
});
