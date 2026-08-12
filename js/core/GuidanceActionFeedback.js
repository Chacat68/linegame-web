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
  if (suggestion.actionType === 'quest.open') return '已打开任务档案，请选择可完成委托';
  if (suggestion.actionType === 'market.open' || suggestion.actionType === 'market.focus') {
    return '已打开市场导航，正在定位对应操作';
  }
  if (suggestion.actionType === 'archive.open') return '已切到探索档案，正在确认报告用途';
  if (suggestion.actionType === 'map.focus') return '已找到航点，查看详情后可起航';
  if (suggestion.actionType === 'travel.execute') return '已执行航行指令，抵达后刷新建议';
  if (suggestion.actionType === 'trade.refuel') return '已执行燃料补给，正在刷新下一步';
  if (suggestion.actionType === 'event.open') return '已打开待处理事件，完成后继续刷新建议';
  if (suggestion.actionType === 'guidance.chain.start') return '正在启动专题教学并生成第一步';
  if (suggestion.actionType === 'fleet.dispatch.prefill') return '已载入跑商路线，确认后开始';
  if (suggestion.actionType === 'fleet.mod.open') return '已切到机库，查看推荐改装';
  if (suggestion.actionType === 'fleet.service.open') return '已切到机库，正在定位即时保养';
  if (typeof suggestion.actionType === 'string' && suggestion.actionType.indexOf('exploration.') === 0) {
    return '已执行探索指令，正在刷新现场建议';
  }
  return '已执行，正在生成下一条建议';
}
