export function getMarketNavigationCompletion() {
  return {
    message: '已打开市场导航',
    detail: '下一条行动建议已刷新',
  };
}

export function getNavigationFocusCompletion(focused) {
  return focused
    ? {
        message: '已定位航点',
        detail: '检查目标详情后确认航行',
      }
    : {
        message: '已打开星图',
        detail: '下一条行动建议已刷新',
      };
}

export function getRemoteMarketFocusCompletion() {
  return {
    message: '已定位市场航点',
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
    message: '已载入派遣草案',
    detail: '确认“一键派遣”后执行路线',
  };
}

export function getDispatchConfirmedCompletion(goodName) {
  return {
    message: '已确认派遣路线',
    detail: goodName ? ('派遣货物：' + goodName) : '舰队派遣路线已生效',
  };
}

export function getModInstalledCompletion(modName) {
  return {
    message: '已安装' + (modName ? '「' + modName + '」' : '推荐组件'),
    detail: '下一条派遣或经营建议已刷新',
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
