// js/core/GuidanceActionFeedback.js — 操作控制器加载前即可使用的轻量反馈文本

export function getProcessingMessage(suggestion) {
  if (!suggestion) return '已执行，正在生成下一条建议';
  if (suggestion.actionType === 'trade.buy' || suggestion.actionType === 'trade.sell') {
    var questName = suggestion.payload && suggestion.payload.questName ? suggestion.payload.questName : '';
    return questName
      ? '已打开交易确认，完成后将推进「' + questName + '」'
      : '已打开交易确认，完成后会刷新下一步';
  }
  if (suggestion.actionType === 'quest.accept') return '已接入任务档案，正在衔接下一步';
  if (suggestion.actionType === 'map.focus') return '已定位航点，查看详情后可起航';
  if (suggestion.actionType === 'travel.execute') return '已执行航行指令，抵达后刷新建议';
  if (suggestion.actionType === 'trade.refuel') return '已执行燃料补给，正在刷新下一步';
  if (suggestion.actionType === 'event.open') return '已打开待处理事件，完成后继续刷新建议';
  if (suggestion.actionType === 'fleet.dispatch.prefill') return '已载入派遣草案，确认后执行路线';
  if (suggestion.actionType === 'fleet.mod.open') return '已切到机库，查看推荐改装';
  if (suggestion.actionType === 'fleet.service.open') return '已切到机库，检查维修方案';
  if (suggestion.actionType === 'company.directive.claimAll') return '已结算公司指令奖励，正在刷新下一步';
  if (typeof suggestion.actionType === 'string' && suggestion.actionType.indexOf('exploration.') === 0) {
    return '已执行探索指令，正在刷新现场建议';
  }
  return '已执行，正在生成下一条建议';
}
