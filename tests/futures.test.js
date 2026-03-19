import { beforeEach, describe, expect, it } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Futures from '../js/systems/finance/FuturesSystem.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

describe('FuturesSystem', () => {
  it('初始化后期货合约列表为空，且返回交易标的', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);

    expect(Array.isArray(state.futuresContracts)).toBe(true);
    expect(state.futuresContracts).toHaveLength(0);

    const listings = Futures.getFuturesListings(state);
    expect(listings.length).toBeGreaterThan(0);
    listings.forEach(function (listing) {
      expect(typeof listing.goodId).toBe('string');
      expect(typeof listing.name).toBe('string');
      expect(listing.currentPrice).toBeGreaterThan(0);
      expect(listing.margin).toBeGreaterThan(0);
      expect(listing.contractUnit).toBeGreaterThan(0);
      expect(typeof listing.contractValue).toBe('number');
      expect(typeof listing.termDays).toBe('number');
      expect(typeof listing.systemId).toBe('string');
      expect(typeof listing.heldLong).toBe('number');
      expect(typeof listing.heldShort).toBe('number');
    });
  });

  it('可以开立做多合约并扣除保证金', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);

    const listing = Futures.getFuturesListings(state)[0];
    const creditsBefore = state.credits;
    const result = Futures.openLongContract(state, listing.goodId);

    expect(result.ok).toBe(true);
    expect(state.futuresContracts).toHaveLength(1);
    expect(state.futuresContracts[0].direction).toBe('long');
    expect(state.futuresContracts[0].status).toBe('open');
    expect(state.credits).toBe(creditsBefore - listing.margin);
  });

  it('可以开立做空合约并扣除保证金', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);

    const listing = Futures.getFuturesListings(state)[0];
    const creditsBefore = state.credits;
    const result = Futures.openShortContract(state, listing.goodId);

    expect(result.ok).toBe(true);
    expect(state.futuresContracts[0].direction).toBe('short');
    expect(state.credits).toBe(creditsBefore - listing.margin);
  });

  it('积分不足时无法开立合约', () => {
    const state = createTestState({ credits: 1, day: 1 });
    Futures.init(state);

    const listing = Futures.getFuturesListings(state)[0];
    const result = Futures.openLongContract(state, listing.goodId);

    expect(result.ok).toBe(false);
    expect(state.futuresContracts).toHaveLength(0);
  });

  it('可以手动平仓并归还保证金', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);

    const listing = Futures.getFuturesListings(state)[0];
    Futures.openLongContract(state, listing.goodId);
    const creditsAfterOpen = state.credits;
    const contract = state.futuresContracts[0];

    const result = Futures.closeContract(state, contract.id);
    expect(result.ok).toBe(true);
    expect(contract.status).toBe('closed');
    // 至少归还了保证金（盈亏为零时正好归还保证金）
    expect(state.credits).toBeGreaterThanOrEqual(creditsAfterOpen);
  });

  it('到期天数到达时自动结算合约', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);

    const listing = Futures.getFuturesListings(state)[0];
    Futures.openLongContract(state, listing.goodId);
    const contract = state.futuresContracts[0];
    const expiryDay = contract.expiryDay;

    // 推进到到期日
    for (let d = 2; d <= expiryDay; d++) {
      state.day = d;
      Futures.advanceDay(state);
    }

    expect(contract.status).toBe('closed');
    expect(contract.settlementPrice).toBeGreaterThan(0);
    expect(typeof contract.pnl).toBe('number');
  });

  it('getOpenContracts 只返回未平仓合约', () => {
    const state = createTestState({ credits: 20000, day: 1 });
    Futures.init(state);

    const listings = Futures.getFuturesListings(state);
    Futures.openLongContract(state, listings[0].goodId);
    Futures.openShortContract(state, listings[1].goodId);

    expect(Futures.getOpenContracts(state)).toHaveLength(2);

    const contractId = state.futuresContracts[0].id;
    Futures.closeContract(state, contractId);

    expect(Futures.getOpenContracts(state)).toHaveLength(1);
    expect(Futures.getClosedContracts(state)).toHaveLength(1);
  });

  it('未实现盈亏反映在净资产调整中', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);

    // 无持仓时净资产调整为0
    expect(Futures.getNetWorthAdjustment(state)).toBe(0);

    const listing = Futures.getFuturesListings(state)[0];
    Futures.openLongContract(state, listing.goodId);

    // 开立合约后净资产调整等于未实现盈亏
    const openContracts = Futures.getOpenContracts(state);
    const expectedAdj = openContracts.reduce(function (s, c) { return s + c.unrealizedPnl; }, 0);
    expect(Futures.getNetWorthAdjustment(state)).toBe(expectedAdj);
  });

  it('未找到的合约 ID 平仓时返回失败', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);

    const result = Futures.closeContract(state, 'nonexistent_id');
    expect(result.ok).toBe(false);
  });

  it('每天结算只处理一次（幂等保护）', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);

    const listing = Futures.getFuturesListings(state)[0];
    Futures.openLongContract(state, listing.goodId);

    state.day = 2;
    Futures.advanceDay(state);
    const creditsAfterFirst = state.credits;
    // 再次调用同一天不会重复结算
    Futures.advanceDay(state);
    expect(state.credits).toBe(creditsAfterFirst);
  });
});
