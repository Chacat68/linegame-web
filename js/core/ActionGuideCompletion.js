export function getMarketNavigationCompletion() {
  return {
    message: '已打开市场导航',
    detail: '下一条行动建议已刷新',
  };
}

export function getNavigationFocusCompletion(focused) {
  return focused
    ? {
        message: '已找到航点',
        detail: '检查目标详情后确认航行',
      }
    : {
        message: '已打开星图',
        detail: '下一条行动建议已刷新',
      };
}

export function getRemoteMarketFocusCompletion() {
  return {
    message: '已找到市场航点',
    detail: '检查目标详情后确认航行',
  };
}

export function getRefuelCompletion() {
  return {
    message: '已完成燃料补给',
    detail: '下一条行动建议已刷新',
  };
}

export function getDispatchDraftCompletion() {
  return {
    message: '已载入跑商路线',
    detail: '确认“开始跑商”后执行路线',
  };
}

export function getDispatchConfirmedCompletion(goodName) {
  return {
    message: '已确认自动跑商路线',
    detail: goodName ? ('跑商货物：' + goodName) : '舰队自动跑商路线已生效',
  };
}

export function getModInstalledCompletion(modName) {
  return {
    message: '已安装' + (modName ? '「' + modName + '」' : '推荐组件'),
    detail: '下一条跑商或经营建议已刷新',
  };
}

export function getServiceScheduledCompletion() {
  return {
    message: '已完成港口保养',
    detail: '船体与维护度已即时恢复',
  };
}

export function showContextCompletion(context, completion, options) {
  if (!context || typeof context.showCompletion !== 'function' || !completion) return;
  context.showCompletion(completion.message, completion.detail, options);
}
