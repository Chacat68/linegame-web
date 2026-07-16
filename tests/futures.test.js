import { beforeEach, describe, expect, it } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Futures from '../js/systems/finance/FuturesSystem.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

function seedLegacyContract(state, overrides) {
  const listing = Futures.getFuturesListings(state)[0];
  const contract = Object.assign({
    id: 'legacy_futures_1',
    goodId: listing.goodId,
    goodName: listing.name,
    direction: 'long',
    lockedPrice: listing.currentPrice,
    contractUnit: listing.contractUnit,
    margin: listing.margin,
    systemId: listing.systemId,
    openDay: 1,
    expiryDay: 5,
    status: 'open',
    settlementPrice: null,
    pnl: null,
  }, overrides || {});
  state.futuresContracts.push(contract);
  return contract;
}

describe('FuturesSystem legacy compatibility', () => {
  it('仍能读取旧存档清单，但不再允许新开多空合约', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);
    const listing = Futures.getFuturesListings(state)[0];

    expect(listing.currentPrice).toBeGreaterThan(0);
    expect(Futures.openLongContract(state, listing.goodId).ok).toBe(false);
    expect(Futures.openShortContract(state, listing.goodId).ok).toBe(false);
    expect(state.futuresContracts).toHaveLength(0);
    expect(state.credits).toBe(10000);
  });

  it('旧合约仍可安全平仓并归还结算资金', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);
    const contract = seedLegacyContract(state);

    const result = Futures.closeContract(state, contract.id);

    expect(result.ok).toBe(true);
    expect(contract.status).toBe('closed');
    expect(state.credits).toBeGreaterThanOrEqual(10000);
  });

  it('旧合约到期后自动结算，开放与关闭列表保持可读', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);
    const expired = seedLegacyContract(state, { expiryDay: 2 });
    seedLegacyContract(state, { id: 'legacy_futures_2', expiryDay: 9 });

    state.day = 2;
    Futures.advanceDay(state);

    expect(expired.status).toBe('closed');
    expect(Futures.getOpenContracts(state)).toHaveLength(1);
    expect(Futures.getClosedContracts(state)).toHaveLength(1);
  });

  it('旧合约未实现盈亏仍可计入存档兼容净值', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);
    seedLegacyContract(state);

    expect(Number.isFinite(Futures.getNetWorthAdjustment(state))).toBe(true);
  });

  it('每天结算只处理一次', () => {
    const state = createTestState({ credits: 10000, day: 1 });
    Futures.init(state);
    seedLegacyContract(state, { expiryDay: 2 });

    state.day = 2;
    Futures.advanceDay(state);
    const creditsAfterFirst = state.credits;
    Futures.advanceDay(state);

    expect(state.credits).toBe(creditsAfterFirst);
  });
});
