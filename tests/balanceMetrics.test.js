import { describe, expect, it } from 'vitest';
import * as BalanceMetrics from '../js/systems/metrics/BalanceMetricsSystem.js';
import { createTestState } from './helpers.js';

describe('BalanceMetricsSystem', () => {
  it('只在本地状态记录首单与十分钟后的继续经营', () => {
    const state = createTestState({ day: 2 });
    const firstTradeAt = 1000000;

    BalanceMetrics.recordTrade(state, 'buy', 'food', 'open', { totalCost: 100 }, firstTradeAt);
    BalanceMetrics.recordActivity(state, 'travel', firstTradeAt + (9 * 60 * 1000));

    expect(state.balanceMetrics.firstTrade.day).toBe(2);
    expect(state.balanceMetrics.continuedAfterTenMinutes).toBe(false);

    state.day = 3;
    BalanceMetrics.recordActivity(state, 'trade', firstTradeAt + (10 * 60 * 1000));

    expect(state.balanceMetrics.continuedAfterTenMinutes).toBe(true);
    expect(state.balanceMetrics.continuationDay).toBe(3);
  });

  it('统计各商品已实现利润和最大商品利润占比', () => {
    const state = createTestState();

    BalanceMetrics.recordTrade(state, 'sell', 'food', 'open', { profit: 300 }, 1000);
    BalanceMetrics.recordTrade(state, 'sell', 'technology', 'open', { profit: 200 }, 2000);
    const snapshot = BalanceMetrics.getAcceptanceSnapshot(state);

    expect(snapshot.realizedProfit).toBe(500);
    expect(snapshot.largestGoodProfitShare).toBeCloseTo(0.6, 5);
  });

  it('记录长期路线选择、30 天资产快照和完成用时', () => {
    const state = createTestState({ day: 20, credits: 8000, tradeCount: 10 });

    BalanceMetrics.recordRouteSelection(state, 'trade_baron', { netWorth: 12000 }, 1000);
    state.day = 50;
    state.credits = 15000;
    BalanceMetrics.advanceDay(state);
    state.day = 72;
    const completed = BalanceMetrics.recordRouteCompletion(state, 'trade_baron', { netWorth: 30000 }, 2000);

    expect(completed.selectedDay).toBe(20);
    expect(completed.day30Assets.day).toBe(50);
    expect(completed.daysToComplete).toBe(52);
    expect(completed.completedAssets.netWorth).toBe(30000);
  });
});
