import { describe, expect, it } from 'vitest';
import {
  getDispatchConfirmedCompletion,
  getDispatchDraftCompletion,
  getMarketNavigationCompletion,
  getModInstalledCompletion,
  getNavigationFocusCompletion,
  getRefuelCompletion,
  getRemoteMarketFocusCompletion,
  getServiceScheduledCompletion,
  showContextCompletion,
} from '../js/core/ActionGuideCompletion.js';

describe('ActionGuideCompletion', function () {
  it('集中返回行动完成态文案', function () {
    expect(getMarketNavigationCompletion()).toEqual({
      message: '已打开市场导航',
      detail: '下一条行动建议已刷新',
    });
    expect(getNavigationFocusCompletion(true)).toEqual({
      message: '已找到航点',
      detail: '检查目标详情后确认航行',
    });
    expect(getNavigationFocusCompletion(false)).toEqual({
      message: '已打开星图',
      detail: '下一条行动建议已刷新',
    });
    expect(getRemoteMarketFocusCompletion()).toEqual({
      message: '已找到市场航点',
      detail: '检查目标详情后确认航行',
    });
    expect(getRefuelCompletion()).toEqual({
      message: '已完成燃料补给',
      detail: '下一条行动建议已刷新',
    });
    expect(getDispatchDraftCompletion()).toEqual({
      message: '已载入跑商路线',
      detail: '确认“开始跑商”后执行路线',
    });
    expect(getDispatchConfirmedCompletion('食物')).toEqual({
      message: '已确认自动跑商路线',
      detail: '跑商货物：食物',
    });
    expect(getDispatchConfirmedCompletion()).toEqual({
      message: '已确认自动跑商路线',
      detail: '舰队自动跑商路线已生效',
    });
    expect(getModInstalledCompletion('深空测绘阵列')).toEqual({
      message: '已安装「深空测绘阵列」',
      detail: '下一条跑商或经营建议已刷新',
    });
    expect(getModInstalledCompletion()).toEqual({
      message: '已安装推荐组件',
      detail: '下一条跑商或经营建议已刷新',
    });
    expect(getServiceScheduledCompletion()).toEqual({
      message: '已完成港口保养',
      detail: '船体与维护度已即时恢复',
    });
  });

  it('会把完成态转发给上下文', function () {
    var calls = [];
    showContextCompletion({
      showCompletion: function (message, detail, options) {
        calls.push([message, detail, options]);
      },
    }, getDispatchDraftCompletion(), { durationMs: 10 });

    expect(calls).toEqual([
      ['已载入跑商路线', '确认“开始跑商”后执行路线', { durationMs: 10 }],
    ]);
    expect(showContextCompletion({}, getDispatchDraftCompletion())).toBeUndefined();
  });
});
