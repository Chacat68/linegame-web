import { describe, expect, it } from 'vitest';
import {
  getContextInspectorEmptyView,
  getContextInspectorShellView,
} from '../js/ui/ContextInspectorPresenter.js';

describe('ContextInspectorPresenter', function () {
  it('未选择对象时解释如何建立工作区上下文', function () {
    expect(getContextInspectorEmptyView(null)).toEqual({
      title: '尚未选择上下文',
      note: '在当前工作区选择对象后，这里会显示对应信息。',
    });
  });

  it('缺少适配器时保留选择事实并解释接入状态', function () {
    expect(getContextInspectorEmptyView({ type: 'ship', id: '0' })).toEqual({
      title: '此工作区尚未接入详情',
      note: '当前选择已记录；详情适配器接入后会显示在这里。',
    });
  });

  it('壳层模型统一标题、context key 与 renderer 状态', function () {
    expect(getContextInspectorShellView({
      workspaceId: 'fleet',
      context: { type: 'ship', id: '0' },
      rendererRegistered: true,
      rendererResult: { title: '舰船检查' },
    })).toMatchObject({
      title: '舰船检查',
      contextType: 'ship',
      contextId: '0',
      rendererState: 'ready',
    });
  });
});
