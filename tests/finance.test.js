import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Finance from '../js/systems/finance/FinanceSystem.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it('支持股票买卖并按周期发放股息', () => {
    const state = createTestState({ credits: 20000, day: 1 });
    Finance.init(state);

    const listing = Finance.getStockListings(state)[0];
    expect(Finance.buyStock(state, listing.id, 2).ok).toBe(true);
    expect(state.stockPortfolio[listing.id].shares).toBe(2);

    const creditsAfterBuy = state.credits;
    state.day = 2;
    Finance.advanceDay(state);
    state.day = 3;
    Finance.advanceDay(state);
    state.day = 4;
    Finance.advanceDay(state);
    state.day = 5;
    Finance.advanceDay(state);

    expect(state.credits).toBeGreaterThan(creditsAfterBuy);
    expect(state.stockPortfolio[listing.id].totalDividends).toBeGreaterThan(0);

    expect(Finance.sellStock(state, listing.id, 1).ok).toBe(true);
    expect(state.stockPortfolio[listing.id].shares).toBe(1);
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

  it('支持完整保险购买与次日理赔流程', () => {
    const state = createTestState({ credits: 10000, day: 8, shipHull: 100, maxHull: 100 });
    Finance.init(state);

    const purchase = Finance.purchaseInsurance(state, 'hull');
    expect(purchase.ok).toBe(true);
    expect(state.insurancePolicies.hull.active).toBe(true);

    state.shipHull = 45;
    const claim = Finance.submitClaim(state, 'hull');
    expect(claim.ok).toBe(true);
    expect(state.insuranceClaims[0].status).toBe('pending');

    const creditsBeforePayout = state.credits;
    state.day = 9;
    const payout = Finance.advanceDay(state);

    expect(payout.ok).toBe(true);
    expect(state.insuranceClaims[0].status).toBe('paid');
    expect(state.credits).toBeGreaterThan(creditsBeforePayout);
  });

  it('净资产会计入金融资产并扣除负债', () => {
    const state = createTestState({ credits: 10000, day: 1, visitedSystems: ['sol_prime'] });
    Finance.init(state);

    const offer = Finance.getLoanOffers(state)[0];
    Finance.takeLoan(state, offer.id);
    const listing = Finance.getStockListings(state)[0];
    Finance.buyStock(state, listing.id, 1);
    Finance.investInTradeStation(state, 'sol_prime', 5000);

    const overview = Finance.getOverview(state);
    expect(Finance.getNetWorthAdjustment(state)).toBe(
      overview.stockValue + overview.tradeInvestmentValue - overview.outstandingLoanBalance
    );
  });

  it('期货合约支持开仓与到期结算（多头盈利）', () => {
    const state = createTestState({ credits: 10000, day: 1, currentSystem: 'sol_prime' });
    Finance.init(state);

    const customQuote = {
      id: 'fut_water_3',
      goodId: 'water',
      name: '水资源',
      emoji: '💧',
      systemId: state.currentSystem,
      lockPrice: 10,
      contractSize: 5,
      settlementDay: state.day + 2,
      margin: 300,
      basisPrice: 10,
      trendLabel: '看涨',
    };
    state.futuresMarket.quotes = [customQuote];
    state.futuresMarket.lastGeneratedDay = state.day;

    const open = Finance.openFuturesPosition(state, customQuote.id, 'long');
    expect(open.ok).toBe(true);
    expect(state.futuresPositions).toHaveLength(1);
    expect(state.credits).toBe(10000 - customQuote.margin);

    const settlePrice = 16;
    vi.spyOn(Economy, 'getSellPrice').mockReturnValue(settlePrice);
    state.day = customQuote.settlementDay - 1;
    Finance.advanceDay(state);
    state.day = customQuote.settlementDay;
    Finance.advanceDay(state);

    const expectedPnl = Math.round((settlePrice - customQuote.lockPrice) * customQuote.contractSize);
    expect(state.futuresPositions).toHaveLength(0);
    expect(state.credits).toBe(10000 + expectedPnl);
  });

  it('空头期货在价格上行时会产生亏损，平仓返还保证金', () => {
    const state = createTestState({ credits: 8000, day: 2, currentSystem: 'sol_prime' });
    Finance.init(state);

    const quote = {
      id: 'fut_food_4',
      goodId: 'food',
      name: '食物',
      emoji: '🌾',
      systemId: state.currentSystem,
      lockPrice: 12,
      contractSize: 4,
      settlementDay: state.day + 1,
      margin: 200,
      basisPrice: 12,
      trendLabel: '震荡',
    };
    state.futuresMarket.quotes = [quote];
    state.futuresMarket.lastGeneratedDay = state.day;

    const open = Finance.openFuturesPosition(state, quote.id, 'short');
    expect(open.ok).toBe(true);
    expect(state.futuresPositions[0].direction).toBe('short');

    const settlePrice = 15;
    vi.spyOn(Economy, 'getSellPrice').mockReturnValue(settlePrice);
    const pnl = Math.round((quote.lockPrice - settlePrice) * quote.contractSize);

    const close = Finance.closeFuturesPosition(state, state.futuresPositions[0].id);
    expect(close.ok).toBe(true);
    expect(state.futuresPositions).toHaveLength(0);
    expect(state.credits).toBe(8000 + pnl);
  });
});
