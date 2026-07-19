import { describe, expect, it } from 'vitest';
import {
  buildCommandFeedback,
  getCommandActionAttributes,
  getCommandKicker,
  normalizeCommandAction,
  renderCommandActionContent,
} from '../js/ui/CommandAction.js';

describe('CommandAction helpers', function () {
  it('会为市场动作生成统一 command 元信息', function () {
    const action = normalizeCommandAction({
      actionId: 'market',
      label: '查看市场情报',
      marketFocusLabel: '行情与路线',
    });

    expect(action).toMatchObject({
      commandSurface: 'market',
      commandIntent: '行情与路线',
      commandVerb: '查看市场情报',
    });
    expect(getCommandKicker(action)).toBe('市场 · 行情与路线');
  });

  it('会为探索动作生成统一按钮内容与 data 属性', function () {
    const action = normalizeCommandAction({
      type: 'poi',
      label: '调查 信标阵列',
      systemId: 'sol_prime',
    });

    const attrs = getCommandActionAttributes(action, function (value) {
      return String(value);
    });
    const html = renderCommandActionContent(action, function (value) {
      return String(value);
    });

    expect(attrs).toContain('data-command-surface="exploration"');
    expect(attrs).toContain('data-command-intent="调查探索点"');
    expect(html).toContain('探索 · 调查探索点');
    expect(html).toContain('调查 信标阵列');
  });

  it('会为机库派遣动作生成统一 surface 标签', function () {
    const action = normalizeCommandAction({
      actionId: 'dispatch',
      label: '带入机库跑商',
      commandIntent: '科研补给',
    });

    expect(action.commandSurface).toBe('fleet');
    expect(getCommandKicker(action)).toBe('机库 · 科研补给');
  });

  it('会生成统一的动作反馈文本', function () {
    const text = buildCommandFeedback({
      actionId: 'market',
      marketFocusLabel: '买卖货物',
    }, {
      destination: '当前市场 · 买卖货物',
      nextStep: '补足燃料',
      returnTo: '任务页继续推进当前任务',
    });

    expect(text).toBe('📊 已打开当前市场 · 买卖货物。下一步：补足燃料。返回：任务页继续推进当前任务。');
  });
});
