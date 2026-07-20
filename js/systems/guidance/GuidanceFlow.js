// js/systems/guidance/GuidanceFlow.js — 当前行动的目的、下一步与完成结果契约

export const GUIDANCE_FLOW_OUTCOMES = Object.freeze({
  'handle-pending-event': '事件结算后解除操作暂停，继续原来的航线或任务。',
  'accept-first-trade': '任务接入后，当前行动会继续指引买入或卖出。',
  'refuel-low-tank': '补给完成后会重新评估最近航程，可安全出发时恢复原路线。',
  'service-active-ship': '在维修页确认并支付后，恢复航行与自动跑商稳定性。',
  'fund-ship-service': '余额达到维修报价后，当前行动会回到维修方案。',
  'buy-low-price-good': '买入成交后，当前行动会选择卖货点并衔接结算。',
  'open-market-for-first-trade': '选定可负担商品并买入后，继续指引卖货。',
  'sell-first-cargo': '卖出成交后释放货舱，并结算对应交易目标。',
  'find-sell-destination': '抵达目标后，当前行动会切换为卖出确认。',
  'refuel-for-cargo-route': '补给完成后，当前行动会恢复前往目标卖货点。',
  'accept-first-explore': '任务接入后，当前行动会直接选择下一个未访问航点。',
  'visit-next-system': '抵达新航点后会记录访问进度，并结算「初探宇宙」。',
  'refuel-for-explore-route': '补给完成后，当前行动会恢复前往下一个未访问航点。',
  'prefill-quest-dispatch': '检查并开始路线后，舰船会按任务目标采购、运送或交付。',
  'prefill-research-supply-dispatch': '检查并开始路线后，舰船会为当前研究持续补给。',
  'resolve-research-funding': '恢复可用资金后，科研补给路线会自动重新出现。',
  'prefill-profitable-dispatch': '检查并开始路线后，舰船会按当前价差自动跑商。',
  'review-survey-chain-followup': '确认用途后，当前行动会转为相应的航线、科研或经营建议。',
  'review-survey-archive': '确认用途后，该报告不再重复提示，并刷新为可执行建议。',
  'install-recommended-ship-mod': '安装后立即重新评估跑商、探索与经营能力。',
  'explore-current-poi': '调查结果会写入档案，并解锁对应情报或连续任务。',
  'review-loan-obligation': '完成还款或资金安排后，避免逾期与信用继续下降。',
  'batch-upgrade-trade-stations': '确认覆盖范围与预算后，批量提高站点日收益。',
  'batch-invest-trade-stations': '确认投资计划后，按预计回报扩大多个站点的资本规模。',
  'batch-set-trade-station-strategy': '确认影响范围后，批量应用与探索情报匹配的经营方式。',
  'build-trade-station': '确认建设后，该航点开始产生长期经营收入。',
  'upgrade-trade-station': '确认升级后，提高该站点的每日收入与经营能力。',
});

const ACTION_TYPE_OUTCOMES = Object.freeze({
  'quest.accept': '任务接入后，当前行动会继续指向第一个未完成目标。',
  'quest.open': '选定可执行委托后，当前行动会按任务目标继续引导。',
  'market.open': '完成对应市场操作后，当前行动会重新评估优先级。',
  'market.focus': '完成对应市场操作后，当前行动会重新评估优先级。',
  'trade.buy': '买入成交后，当前行动会根据货舱刷新卖出或任务目标。',
  'trade.sell': '卖出成交后，当前行动会结算相关目标并刷新。',
  'trade.refuel': '补给后会重新评估可执行航线。',
  'travel.execute': '抵达后会记录航程进度并刷新当地行动。',
  'map.focus': '确认航程条件并抵达后，当前行动会刷新当地目标。',
  'fleet.dispatch.prefill': '检查并开始路线后，舰船会按方案自动执行。',
  'fleet.mod.open': '确认安装后会立即重新评估舰船能力。',
  'fleet.service.open': '确认维修后恢复舰船稳定性。',
  'archive.open': '确认情报后会刷新为可执行的下一条建议。',
  'exploration.poi': '调查完成后会写入探索档案并刷新现场目标。',
  'event.open': '事件结算后会恢复航行与其他操作。',
});

function _fallbackPurpose(suggestion) {
  if (suggestion && suggestion.reason) return suggestion.reason;
  return '完成当前步骤，让后续路线继续推进。';
}

export function decorateGuidanceFlow(suggestion) {
  var next = Object.assign({}, suggestion || {});
  next.purpose = next.purpose || _fallbackPurpose(next);
  next.nextStep = next.nextStep || next.actionLabel || '执行当前步骤';
  next.outcome = next.outcome || GUIDANCE_FLOW_OUTCOMES[next.id] || ACTION_TYPE_OUTCOMES[next.actionType] || '完成后会自动刷新下一条建议。';
  return next;
}

export function getGuidanceFlowIssues(suggestion) {
  var flow = decorateGuidanceFlow(suggestion);
  return ['id', 'title', 'purpose', 'nextStep', 'outcome', 'actionType'].filter(function (key) {
    return typeof flow[key] !== 'string' || flow[key].trim() === '';
  });
}
