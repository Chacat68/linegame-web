import { describe, expect, it } from 'vitest';
import {
  GUIDANCE_FLOW_OUTCOMES,
  decorateGuidanceFlow,
  getGuidanceFlowIssues,
} from '../js/systems/guidance/GuidanceFlow.js';

const CURRENT_ACTION_IDS = [
  'handle-pending-event',
  'accept-first-trade',
  'refuel-low-tank',
  'service-active-ship',
  'fund-ship-service',
  'buy-low-price-good',
  'open-market-for-first-trade',
  'sell-first-cargo',
  'find-sell-destination',
  'refuel-for-cargo-route',
  'accept-first-explore',
  'visit-next-system',
  'refuel-for-explore-route',
  'prefill-quest-dispatch',
  'prefill-research-supply-dispatch',
  'resolve-research-funding',
  'prefill-profitable-dispatch',
  'review-survey-chain-followup',
  'review-survey-archive',
  'install-recommended-ship-mod',
  'explore-current-poi',
  'review-loan-obligation',
  'batch-upgrade-trade-stations',
  'batch-invest-trade-stations',
  'batch-set-trade-station-strategy',
  'build-trade-station',
  'upgrade-trade-station',
];

describe('GuidanceFlow', function () {
  it('所有当前行动 ID 都有明确的完成结果', function () {
    CURRENT_ACTION_IDS.forEach(function (id) {
      expect(GUIDANCE_FLOW_OUTCOMES[id], id).toBeTypeOf('string');
      expect(GUIDANCE_FLOW_OUTCOMES[id].length, id).toBeGreaterThan(8);
    });
  });

  it('行动契约统一输出目的、下一步和完成结果', function () {
    var flow = decorateGuidanceFlow({
      id: 'buy-low-price-good',
      title: '买入「食品」',
      reason: '当前价格偏低，适合建立交易仓位。',
      actionLabel: '确认买入',
      actionType: 'trade.buy',
    });

    expect(flow).toMatchObject({
      purpose: '当前价格偏低，适合建立交易仓位。',
      nextStep: '确认买入',
    });
    expect(flow.outcome).toContain('卖货点');
    expect(getGuidanceFlowIssues(flow)).toEqual([]);
  });

  it('扩展行动也会按 actionType 获得稳定的后续语义', function () {
    var flow = decorateGuidanceFlow({
      id: 'future-market-action',
      title: '处理新市场机会',
      reason: '新的价差窗口已出现。',
      actionLabel: '打开市场',
      actionType: 'market.open',
    });

    expect(flow.outcome).toContain('重新评估优先级');
    expect(getGuidanceFlowIssues(flow)).toEqual([]);
  });
});
