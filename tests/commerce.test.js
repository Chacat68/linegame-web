// tests/commerce.test.js — CommerceFacade 商业终端门面测试
// 覆盖：统一市场交易、黑市统计、贸易站委托、金融委托

import { describe, it, expect, beforeEach } from 'vitest';
import * as Commerce from '../js/systems/commerce/CommerceFacade.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Finance from '../js/systems/finance/FinanceSystem.js';
import * as TradeStation from '../js/systems/trade/TradeStationSystem.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

// ---------------------------------------------------------------------------
// 统一市场买入
// ---------------------------------------------------------------------------

describe('Commerce.buyGood (公开市场)', () => {
  it('成功买入并扣除积分', () => {
    const state = createTestState({ credits: 5000, maxCargo: 20 });
    Faction.init(state);
    const result = Commerce.buyGood(state, 'food', 5, 'open');
    expect(result.ok).toBe(true);
    expect(state.cargo.food).toBe(5);
    expect(state.credits).toBeLessThan(5000);
  });

  it('积分不足时失败', () => {
    const state = createTestState({ credits: 0, maxCargo: 20 });
    Faction.init(state);
    const result = Commerce.buyGood(state, 'food', 5, 'open');
    expect(result.ok).toBe(false);
  });

  it('省略 marketType 等同于公开市场', () => {
    const state = createTestState({ credits: 5000, maxCargo: 20 });
    Faction.init(state);
    const result = Commerce.buyGood(state, 'food', 3);
    expect(result.ok).toBe(true);
  });
});

describe('Commerce.buyGood (黑市)', () => {
  it('黑市买入成功并记录黑市交易统计', () => {
    const state = createTestState({ credits: 50000, maxCargo: 50 });
    Faction.init(state);
    const result = Commerce.buyGood(state, 'weapons', 2, 'black');
    expect(result.ok).toBe(true);
    expect(state.cargo.weapons).toBe(2);
    // 黑市交易应被统计
    expect(state.smugglingStats.blackMarketTrades).toBe(1);
  });

  it('黑市买入使用更高的黑市价格', () => {
    // 使用 minerals (basePrice=30) 确保价格差异在整数精度下可见
    const state = createTestState({ credits: 100000, maxCargo: 100 });
    Faction.init(state);

    const stateCopy = createTestState({ credits: 100000, maxCargo: 100 });
    Faction.init(stateCopy);

    Commerce.buyGood(state, 'minerals', 10, 'black');
    Commerce.buyGood(stateCopy, 'minerals', 10, 'open');

    // 黑市应该花费更多（黑市溢价 1.35）
    expect(state.credits).toBeLessThan(stateCopy.credits);
  });
});

// ---------------------------------------------------------------------------
// 统一市场卖出
// ---------------------------------------------------------------------------

describe('Commerce.sellGood (公开市场)', () => {
  it('成功卖出', () => {
    const state = createTestState({ credits: 0, cargo: { food: 10 }, cargoCost: { food: 100 } });
    Faction.init(state);
    const result = Commerce.sellGood(state, 'food', 5, 'open');
    expect(result.ok).toBe(true);
    expect(state.credits).toBeGreaterThan(0);
    expect(state.cargo.food).toBe(5);
  });

  it('数量不足时失败', () => {
    const state = createTestState({ cargo: { food: 2 } });
    Faction.init(state);
    const result = Commerce.sellGood(state, 'food', 5, 'open');
    expect(result.ok).toBe(false);
  });
});

describe('Commerce.sellGood (黑市)', () => {
  it('黑市卖出成功并记录统计', () => {
    const state = createTestState({ credits: 0, cargo: { weapons: 5 }, cargoCost: { weapons: 600 } });
    Faction.init(state);
    const result = Commerce.sellGood(state, 'weapons', 3, 'black');
    expect(result.ok).toBe(true);
    expect(state.credits).toBeGreaterThan(0);
    expect(state.smugglingStats.blackMarketTrades).toBe(1);
  });

  it('黑市卖出价高于公开市场', () => {
    const stateBlack = createTestState({ credits: 0, cargo: { weapons: 5 }, cargoCost: { weapons: 0 } });
    Faction.init(stateBlack);
    Commerce.sellGood(stateBlack, 'weapons', 5, 'black');
    const blackEarned = stateBlack.credits;

    const stateOpen = createTestState({ credits: 0, cargo: { weapons: 5 }, cargoCost: { weapons: 0 } });
    Faction.init(stateOpen);
    Commerce.sellGood(stateOpen, 'weapons', 5, 'open');
    const openEarned = stateOpen.credits;

    expect(blackEarned).toBeGreaterThan(openEarned);
  });
});

// ---------------------------------------------------------------------------
// getCommerceSnapshot
// ---------------------------------------------------------------------------

describe('Commerce.getCommerceSnapshot', () => {
  it('返回必要的快照字段', () => {
    const state = createTestState({ credits: 10000 });
    Faction.init(state);
    Finance.init(state);
    TradeStation.init(state);
    const snap = Commerce.getCommerceSnapshot(state);

    expect(snap).toBeDefined();
    expect(typeof snap.ownedStationCount).toBe('number');
    expect(typeof snap.stationDailyIncome).toBe('number');
    expect(typeof snap.totalLoans).toBe('number');
    expect(typeof snap.stockPortfolioValue).toBe('number');
    expect(typeof snap.creditRating).toBe('number');
    expect(typeof snap.activeLoans).toBe('number');
  });

  it('初始状态下贸易站为 0', () => {
    const state = createTestState();
    Faction.init(state);
    Finance.init(state);
    TradeStation.init(state);
    const snap = Commerce.getCommerceSnapshot(state);
    expect(snap.ownedStationCount).toBe(0);
    expect(snap.stationDailyIncome).toBe(0);
    expect(snap.activeLoans).toBe(0);
  });

  it('信用评级处于合理范围', () => {
    const state = createTestState();
    Finance.init(state);
    const snap = Commerce.getCommerceSnapshot(state);
    expect(snap.creditRating).toBeGreaterThanOrEqual(300);
    expect(snap.creditRating).toBeLessThanOrEqual(850);
  });
});

// ---------------------------------------------------------------------------
// 贸易站操作委托
// ---------------------------------------------------------------------------

describe('Commerce.buildTradeStation', () => {
  it('积分不足时建站失败', () => {
    const state = createTestState({ credits: 0, visitedSystems: ['sol_prime'] });
    Faction.init(state);
    TradeStation.init(state);
    const result = Commerce.buildTradeStation(state, 'sol_prime');
    expect(result.ok).toBe(false);
  });

  it('未访问的星球无法建站', () => {
    const state = createTestState({ credits: 999999 });
    Faction.init(state);
    TradeStation.init(state);
    const result = Commerce.buildTradeStation(state, 'nova_station');
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 金融操作委托
// ---------------------------------------------------------------------------

describe('Commerce.takeLoan', () => {
  it('申请贷款成功', () => {
    const state = createTestState({ credits: 500 });
    Finance.init(state);
    const result = Commerce.takeLoan(state, 'starter');
    expect(result.ok).toBe(true);
    expect(state.credits).toBeGreaterThan(500);
    expect(state.loans.length).toBe(1);
  });

  it('已有 3 笔贷款时不能继续申请', () => {
    const state = createTestState({ credits: 500 });
    Finance.init(state);
    Commerce.takeLoan(state, 'starter');
    Commerce.takeLoan(state, 'starter');
    Commerce.takeLoan(state, 'starter');
    // 第 4 笔应失败（上限 3 笔）
    const result = Commerce.takeLoan(state, 'starter');
    expect(result.ok).toBe(false);
  });
});

describe('Commerce.buyStock / sellStock', () => {
  it('买卖股票成功', () => {
    const state = createTestState({ credits: 100000 });
    Finance.init(state);

    const stockId = Object.keys(state.stockMarket)[0];
    const buyResult = Commerce.buyStock(state, stockId);
    expect(buyResult.ok).toBe(true);
    // stockPortfolio 存储的是 { shares, avgCost, totalDividends } 对象
    expect(state.stockPortfolio[stockId]).toBeDefined();
    expect(state.stockPortfolio[stockId].shares).toBe(1);

    const sellResult = Commerce.sellStock(state, stockId);
    expect(sellResult.ok).toBe(true);
    // 卖完后持仓应为 0 或条目被删除
    const remainingShares = state.stockPortfolio[stockId] ? state.stockPortfolio[stockId].shares : 0;
    expect(remainingShares).toBe(0);
  });
});
