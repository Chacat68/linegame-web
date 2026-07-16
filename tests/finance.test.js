import { beforeEach, describe, expect, it } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Finance from '../js/systems/finance/FinanceSystem.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

describe('FinanceSystem', () => {
  it('支持贷款申请、计息与自动还款', () => {
    const state = createTestState({ credits: 1000, day: 1 });
    Finance.init(state);

    const offer = Finance.getLoanOffers(state)[0];
    const result = Finance.takeLoan(state, offer.id);

    expect(result.ok).toBe(true);
    expect(state.credits).toBe(1000 + offer.principal);
    expect(state.loans).toHaveLength(1);

    const balanceBefore = state.loans[0].balance;
    const creditsBefore = state.credits;
    state.day = 2;
    const dayResult = Finance.advanceDay(state);

    expect(dayResult.ok).toBe(true);
    expect(state.loans[0].balance).toBeLessThan(balanceBefore);
    expect(state.credits).toBeLessThan(creditsBefore);
    expect(state.financeLastProcessedDay).toBe(2);
  });

  it('旧股票持仓会按当前价格清算，且迁移只执行一次', () => {
    const state = createTestState({
      credits: 20000,
      day: 1,
      storyFlags: {},
      stockPortfolio: {
        stock_sol_prime: { shares: 2, avgCost: 80, totalDividends: 0 },
      },
      stockMarket: {
        stock_sol_prime: {
          id: 'stock_sol_prime',
          systemId: 'sol_prime',
          name: '太阳系交易指数',
          price: 120,
          basePrice: 100,
          lastPrice: 120,
          dividendYield: 0.01,
          volatility: 0.6,
        },
      },
    });

    Finance.init(state);

    expect(state.credits).toBe(20240);
    expect(state.stockPortfolio).toEqual({});
    expect(state.storyFlags.capital_products_v2_retired).toBe(1);

    Finance.retireLegacyCapitalProducts(state);
    expect(state.credits).toBe(20240);
  });

  it('支持贸易站金融投资并产生分红', () => {
    const state = createTestState({
      credits: 20000,
      day: 3,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime', 'nova_station'],
    });
    Finance.init(state);

    const result = Finance.investInTradeStation(state, 'nova_station', 5000);
    expect(result.ok).toBe(true);
    expect(state.tradeInvestments.nova_station.amount).toBe(5000);

    const creditsAfterInvest = state.credits;
    state.day = 4;
    Finance.advanceDay(state);

    expect(state.credits).toBeGreaterThan(creditsAfterInvest);
    expect(state.tradeInvestments.nova_station.totalDividends).toBeGreaterThan(0);
  });

  it('支持按殖利率优先批量追加贸易站投资，并在预算不足时部分执行', () => {
    const state = createTestState({
      credits: 12000,
      day: 3,
      currentSystem: 'sol_prime',
      visitedSystems: ['sol_prime', 'nova_station', 'aegis_prime'],
    });
    Finance.init(state);

    const targets = Finance.getTradeInvestmentOptions(state, ['sol_prime', 'nova_station', 'aegis_prime']).map(function (entry) {
      return entry.systemId;
    });
    const result = Finance.batchInvestInTradeStations(state, ['sol_prime', 'nova_station', 'aegis_prime']);

    expect(result.ok).toBe(true);
    expect(result.meta.executedCount).toBe(2);
    expect(result.meta.systemIds).toEqual(targets.slice(0, 2));
    expect(state.tradeInvestments[targets[0]].amount).toBe(5000);
    expect(state.tradeInvestments[targets[1]].amount).toBe(5000);
    expect(state.tradeInvestments[targets[2]]).toBeUndefined();
    expect(state.credits).toBe(2000);
  });

  it('旧保险会退还剩余保费并取消未结理赔', () => {
    const state = createTestState({
      credits: 10000,
      day: 8,
      storyFlags: {},
      insurancePolicies: {
        hull: { id: 'hull', type: 'hull', active: true, premium: 1000, startDay: 1, expiryDay: 21 },
      },
      insuranceClaims: [
        { id: 'claim_1', policyType: 'hull', status: 'pending', payout: 5000 },
      ],
    });

    Finance.init(state);

    expect(state.insurancePolicies.hull.active).toBe(false);
    expect(state.insuranceClaims[0].status).toBe('cancelled');
    expect(state.credits).toBeGreaterThan(10000);
  });

  it('净资产会计入金融资产并扣除负债', () => {
    const state = createTestState({ credits: 10000, day: 1, visitedSystems: ['sol_prime'] });
    Finance.init(state);

    const offer = Finance.getLoanOffers(state)[0];
    Finance.takeLoan(state, offer.id);
    Finance.investInTradeStation(state, 'sol_prime', 5000);

    const overview = Finance.getOverview(state);
    expect(Finance.getNetWorthAdjustment(state)).toBe(
      overview.tradeInvestmentValue - overview.outstandingLoanBalance
    );
  });
});
