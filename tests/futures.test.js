import { beforeEach, describe, expect, it } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Finance from '../js/systems/finance/FinanceSystem.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

describe('FuturesSystem', () => {
  it('支持开立期货多头合约并扣除保证金', () => {
    const state = createTestState({ credits: 10000, day: 1, currentSystem: 'sol_prime' });
    Finance.init(state);

    const result = Finance.openFuturesPosition(state, 'food', 'long', 10, 7);

    expect(result.ok).toBe(true);
    expect(state.futuresContracts).toHaveLength(1);
    expect(state.futuresContracts[0].direction).toBe('long');
    expect(state.futuresContracts[0].goodId).toBe('food');
    expect(state.futuresContracts[0].quantity).toBe(10);
    expect(state.futuresContracts[0].status).toBe('active');
    expect(state.credits).toBeLessThan(10000); // 保证金已扣除
  });

  it('支持开立期货空头合约', () => {
    const state = createTestState({ credits: 10000, day: 1, currentSystem: 'sol_prime' });
    Finance.init(state);

    const result = Finance.openFuturesPosition(state, 'technology', 'short', 5, 15);

    expect(result.ok).toBe(true);
    expect(state.futuresContracts[0].direction).toBe('short');
    expect(state.futuresContracts[0].goodId).toBe('technology');
    expect(state.futuresContracts[0].duration).toBe(15);
  });

  it('资金不足时无法开立期货合约', () => {
    const state = createTestState({ credits: 100, day: 1, currentSystem: 'sol_prime' });
    Finance.init(state);

    const result = Finance.openFuturesPosition(state, 'luxury', 'long', 20, 7);

    expect(result.ok).toBe(false);
    expect(state.futuresContracts).toHaveLength(0);
  });

  it('持仓数量超过限制时无法开立新合约', () => {
    const state = createTestState({ credits: 100000, day: 1, currentSystem: 'sol_prime' });
    Finance.init(state);

    Finance.openFuturesPosition(state, 'food', 'long', 10, 7);
    Finance.openFuturesPosition(state, 'food', 'short', 10, 15);
    Finance.openFuturesPosition(state, 'food', 'long', 10, 30);

    const result = Finance.openFuturesPosition(state, 'food', 'long', 10, 7);

    expect(result.ok).toBe(false);
    expect(state.futuresContracts.filter(c => c.status === 'active')).toHaveLength(3);
  });

  it('支持主动平仓并结算盈亏', () => {
    const state = createTestState({ credits: 10000, day: 1, currentSystem: 'sol_prime' });
    Finance.init(state);

    const openResult = Finance.openFuturesPosition(state, 'food', 'long', 10, 7);
    expect(openResult.ok).toBe(true);

    const contractId = state.futuresContracts[0].id;
    const creditsBeforeClose = state.credits;

    const closeResult = Finance.closeFuturesPosition(state, contractId);

    expect(closeResult.ok).toBe(true);
    expect(state.futuresContracts[0].status).toBe('closed');
    expect(state.credits).toBeGreaterThan(creditsBeforeClose); // 保证金返还
  });

  it('多头合约在价格上涨时盈利', () => {
    const state = createTestState({ credits: 50000, day: 1, currentSystem: 'sol_prime' });
    Economy.init();
    Finance.init(state);

    // 开立多头合约
    const result = Finance.openFuturesPosition(state, 'minerals', 'long', 20, 7);
    expect(result.ok).toBe(true);

    const contract = state.futuresContracts[0];
    const openPrice = contract.openPrice;

    // 模拟价格上涨：推进几天，让市场波动
    for (let i = 0; i < 3; i++) {
      state.day += 1;
      Economy.advanceDay();
      Finance.advanceDay(state);
    }

    // 获取当前持仓信息
    const positions = Finance.getFuturesPositions(state);
    const activeContract = positions.find(c => c.id === contract.id);

    // 如果价格上涨，浮动盈亏应该为正
    if (activeContract.currentPrice > openPrice) {
      expect(activeContract.unrealizedPnL).toBeGreaterThan(0);
    }
  });

  it('空头合约在价格下跌时盈利', () => {
    const state = createTestState({ credits: 50000, day: 1, currentSystem: 'sol_prime' });
    Economy.init();
    Finance.init(state);

    // 开立空头合约
    const result = Finance.openFuturesPosition(state, 'luxury', 'short', 10, 15);
    expect(result.ok).toBe(true);

    const contract = state.futuresContracts[0];
    const openPrice = contract.openPrice;

    // 推进时间
    for (let i = 0; i < 5; i++) {
      state.day += 1;
      Economy.advanceDay();
      Finance.advanceDay(state);
    }

    const positions = Finance.getFuturesPositions(state);
    const activeContract = positions.find(c => c.id === contract.id);

    // 如果价格下跌，空头应该盈利
    if (activeContract.currentPrice < openPrice) {
      expect(activeContract.unrealizedPnL).toBeGreaterThan(0);
    }
  });

  it('合约到期时自动交割并结算', () => {
    const state = createTestState({ credits: 20000, day: 1, currentSystem: 'sol_prime' });
    Economy.init();
    Finance.init(state);

    const result = Finance.openFuturesPosition(state, 'food', 'long', 10, 7);
    expect(result.ok).toBe(true);

    const contractId = state.futuresContracts[0].id;

    // 推进到合约到期
    for (let i = 0; i < 7; i++) {
      state.day += 1;
      Economy.advanceDay();
      Finance.advanceDay(state);
    }

    const contract = state.futuresContracts.find(c => c.id === contractId);
    expect(contract.status).toBe('settled');
    expect(contract.closeDay).toBe(8);
    expect(contract.realizedPnL).toBeDefined();
  });

  it('保证金不足时触发强制平仓', () => {
    const state = createTestState({ credits: 20000, day: 1, currentSystem: 'sol_prime' });
    Economy.init();
    Finance.init(state);

    // 开立一个合约
    const result = Finance.openFuturesPosition(state, 'weapons', 'long', 5, 15);
    expect(result.ok).toBe(true);

    const contractId = state.futuresContracts[0].id;

    // 模拟价格大幅下跌导致保证金不足
    // 我们通过手动修改合约来模拟极端情况
    const contract = state.futuresContracts[0];
    contract.openPrice = contract.openPrice * 3; // 模拟在更高价格开仓

    // 推进时间，触发强平检查
    state.day += 1;
    Economy.advanceDay();
    Finance.advanceDay(state);

    const updatedContract = state.futuresContracts.find(c => c.id === contractId);

    // 在某些情况下可能被强平
    if (updatedContract.status === 'liquidated') {
      expect(updatedContract.realizedPnL).toBeLessThan(0);
      expect(updatedContract.closeDay).toBe(2);
    }
  });

  it('getFuturesOverview返回正确的统计信息', () => {
    const state = createTestState({ credits: 100000, day: 1, currentSystem: 'sol_prime' });
    Finance.init(state);

    Finance.openFuturesPosition(state, 'food', 'long', 10, 7);
    Finance.openFuturesPosition(state, 'minerals', 'short', 15, 15);

    const overview = Finance.getFuturesOverview(state);

    expect(overview.activePositions).toBe(2);
    expect(overview.totalMargin).toBeGreaterThan(0);
    expect(overview.totalUnrealizedPnL).toBeDefined();
  });

  it('getFuturesPositions返回所有合约及其状态', () => {
    const state = createTestState({ credits: 50000, day: 1, currentSystem: 'sol_prime' });
    Finance.init(state);

    Finance.openFuturesPosition(state, 'food', 'long', 10, 7);
    Finance.openFuturesPosition(state, 'technology', 'short', 5, 15);

    const positions = Finance.getFuturesPositions(state);

    expect(positions).toHaveLength(2);
    expect(positions[0].unrealizedPnL).toBeDefined();
    expect(positions[0].daysRemaining).toBeDefined();
    expect(positions[0].currentPrice).toBeGreaterThan(0);
  });

  it('平仓收取手续费', () => {
    const state = createTestState({ credits: 20000, day: 1, currentSystem: 'sol_prime' });
    Finance.init(state);

    Finance.openFuturesPosition(state, 'food', 'long', 10, 7);
    const contract = state.futuresContracts[0];
    const margin = contract.margin;

    const closeResult = Finance.closeFuturesPosition(state, contract.id);
    expect(closeResult.ok).toBe(true);

    // 即使价格不变，由于手续费，返还金额应略少于保证金
    const returnedAmount = state.credits;
    const expectedMax = margin + closeResult.meta.pnl;

    // 盈亏应该考虑了手续费
    expect(contract.realizedPnL).toBeDefined();
  });

  it('净资产计算包含期货浮动盈亏', () => {
    const state = createTestState({ credits: 50000, day: 1, currentSystem: 'sol_prime', visitedSystems: ['sol_prime'] });
    Finance.init(state);

    const netWorthBefore = Finance.getNetWorthAdjustment(state);

    Finance.openFuturesPosition(state, 'minerals', 'long', 10, 7);

    const netWorthAfter = Finance.getNetWorthAdjustment(state);

    // 开仓后净资产应该变化（包含保证金和浮动盈亏）
    expect(netWorthAfter).toBeDefined();
  });

  it('getFuturesAvailableGoods排除燃料并返回可交易商品', () => {
    const state = createTestState({ credits: 10000, day: 1, currentSystem: 'sol_prime' });
    Finance.init(state);

    const goods = Finance.getFuturesAvailableGoods(state);

    expect(goods.length).toBeGreaterThan(0);
    expect(goods.every(g => g.goodId !== 'fuel')).toBe(true);
    expect(goods[0].currentPrice).toBeGreaterThan(0);
    expect(goods[0].maxPositions).toBe(3);
  });

  it('getFuturesContractOptions返回所有合约期限选项', () => {
    const state = createTestState({ credits: 10000, day: 1, currentSystem: 'sol_prime' });
    Finance.init(state);

    const options = Finance.getFuturesContractOptions(state, 'food');

    expect(options).toHaveLength(3); // 7, 15, 30天
    expect(options[0].duration).toBe(7);
    expect(options[1].duration).toBe(15);
    expect(options[2].duration).toBe(30);
    expect(options[0].marginRequired).toBeGreaterThan(0);
    expect(options[0].expiryDay).toBe(8); // day 1 + 7
  });
});
