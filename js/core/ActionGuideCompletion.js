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
    detail: goodName ? ('自动贸易目标：' + goodName) : '自动贸易路线已生效',
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
    message: '已安排维修船坞',
    detail: '维修完成后继续派遣或航行',
  };
}

export function showContextCompletion(context, completion, options) {
  if (!context || typeof context.showCompletion !== 'function' || !completion) return;
  context.showCompletion(completion.message, completion.detail, options);
}
