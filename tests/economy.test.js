// tests/economy.test.js — Economy 系统测试
// 覆盖: C1（空指针崩溃）、H4（_modifiers 未初始化）、H5（sellTax 极端值）

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { ECONOMY_CONFIG } from '../js/data/constants.js';
import { GOODS } from '../js/data/goods.js';
import { SYSTEMS } from '../js/data/systems.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Economy configuration', () => {
  it('暴露只读经济配置快照', () => {
    const config = Economy.getEconomyConfig();
    expect(config).toEqual(ECONOMY_CONFIG);

    config.pricing.minimumPrice = 999;

    const nextConfig = Economy.getEconomyConfig();
    expect(nextConfig.pricing.minimumPrice).toBe(ECONOMY_CONFIG.pricing.minimumPrice);
  });

  it('经济周期默认使用配置中的初始阶段', () => {
    const cycle = Economy.getEconomyCycle();
    expect(cycle.phase).toBe(ECONOMY_CONFIG.cycle.phases[ECONOMY_CONFIG.cycle.initialPhaseIndex].id);
  });

  it('买入/卖出价格修正顺序暴露在配置中', () => {
    const config = Economy.getEconomyConfig();
    expect(config.pricing.buyAdjustmentOrder).toEqual(['factionTax', 'techBuyDiscount', 'fleetTradeBonus']);
    expect(config.pricing.sellAdjustmentOrder).toEqual(['factionTax', 'techSellBonus', 'fleetTradeBonus']);
  });

  it('经济周期切换会直接影响同一商品价格', () => {
    const state = createTestState({ tradeCount: 8 });
    Faction.init(state);

    Economy.setCycleState({ phaseIndex: 0, dayInPhase: 0, phaseDuration: 40, totalCycles: 0 });
    const prosperityPrice = Economy.getBuyPrice('sol_prime', 'technology', state);

    Economy.setCycleState({ phaseIndex: 3, dayInPhase: 0, phaseDuration: 40, totalCycles: 0 });
    const recessionPrice = Economy.getBuyPrice('sol_prime', 'technology', state);

    expect(prosperityPrice).toBeGreaterThan(recessionPrice);
  });

  it('新游戏会重置市场阶段，不继承上一局运行时状态', () => {
    Economy.setCycleState({ phaseIndex: 3, dayInPhase: 12, phaseDuration: 30, totalCycles: 4 });

    Economy.init();

    expect(Economy.getCycleState().phaseIndex).toBe(ECONOMY_CONFIG.cycle.initialPhaseIndex);
    expect(Economy.getCycleState().dayInPhase).toBe(0);
  });

  it('完整市场快照会恢复价格、供需、历史和繁荣阶段', () => {
    const state = createTestState({ tradeCount: 20 });
    Faction.init(state);
    Economy.setCycleState({ phaseIndex: 0, dayInPhase: 5, phaseDuration: 40, totalCycles: 2 });
    Economy.onPlayerBuy('sol_prime', 'technology', 7);
    Economy.advanceDay();

    const expected = {
      price: Economy.getBuyPrice('sol_prime', 'technology', state),
      supplyDemand: Economy.getSupplyDemand('sol_prime', 'technology'),
      history: Economy.getPriceHistory('sol_prime', 'technology'),
      cycle: Economy.getCycleState(),
    };
    const snapshot = Economy.getMarketState();

    Economy.init(snapshot);

    expect(Economy.getBuyPrice('sol_prime', 'technology', state)).toBe(expected.price);
    expect(Economy.getSupplyDemand('sol_prime', 'technology')).toEqual(expected.supplyDemand);
    expect(Economy.getPriceHistory('sol_prime', 'technology')).toEqual(expected.history);
    expect(Economy.getCycleState()).toEqual(expected.cycle);
    expect(Economy.getCycleState().phaseIndex).toBe(0);
  });
});

describe('Economy.getBuyPrice', () => {
  it('新手期会压缩跨节点价差，并按交易次数平滑退场', () => {
    const earlyState = createTestState({ playerLevel: 1, tradeCount: 0 });
    const finalGuardState = createTestState({ playerLevel: 1, tradeCount: 11 });
    const matureState = createTestState({ playerLevel: 1, tradeCount: 12 });
    [earlyState, finalGuardState, matureState].forEach(Faction.init);

    function totalSpread(state) {
      return GOODS.filter(function (good) {
        return good.marketAccess.includes('open');
      }).reduce(function (sum, good) {
        const prices = SYSTEMS.map(function (system) {
          return Economy.getBuyPrice(system.id, good.id, state);
        });
        return sum + Math.max.apply(Math, prices) - Math.min.apply(Math, prices);
      }, 0);
    }

    const earlySpread = totalSpread(earlyState);
    const finalGuardSpread = totalSpread(finalGuardState);
    const matureSpread = totalSpread(matureState);
    expect(earlySpread).toBeLessThan(finalGuardSpread);
    expect(Math.abs(matureSpread - finalGuardSpread)).toBeLessThanOrEqual(
      Math.ceil(finalGuardSpread * 0.08)
    );
  });

  it('难度价格波动参数会放大供需紧张时的价格反应', () => {
    Economy.onPlayerBuy('sol_prime', 'technology', 100);
    const easy = createTestState({ tradeCount: 12, difficulty: 'easy' });
    const normal = createTestState({ tradeCount: 12, difficulty: 'normal' });
    const hard = createTestState({ tradeCount: 12, difficulty: 'hard' });
    [easy, normal, hard].forEach(Faction.init);

    const easyPrice = Economy.getBuyPrice('sol_prime', 'technology', easy);
    const normalPrice = Economy.getBuyPrice('sol_prime', 'technology', normal);
    const hardPrice = Economy.getBuyPrice('sol_prime', 'technology', hard);

    expect(easyPrice).toBeLessThan(normalPrice);
    expect(normalPrice).toBeLessThan(hardPrice);
  });

  it('对有效 systemId 和 goodId 返回正整数', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getBuyPrice('sol_prime', 'food', state);
    expect(price).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(price)).toBe(true);
  });

  it('对无效 systemId 返回 1（C1 已修复）', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getBuyPrice('nonexistent_system', 'food', state);
    expect(price).toBe(1);
  });

  it('对无效 goodId 返回 1（C1 已修复）', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getBuyPrice('sol_prime', 'nonexistent_good', state);
    expect(price).toBe(1);
  });

  it('不传 state 时仍返回正整数', () => {
    const price = Economy.getBuyPrice('sol_prime', 'food');
    expect(price).toBeGreaterThanOrEqual(1);
  });

  it('激活货运飞船时，船只技能会降低买入价格', () => {
    const baseState = createTestState({ tradeCount: 8 });
    Faction.init(baseState);
    Fleet.init(baseState);
    const basePrice = Economy.getBuyPrice('sol_prime', 'weapons', baseState);

    const freighterState = createTestState({ credits: 10000, tradeCount: 8 });
    Faction.init(freighterState);
    Fleet.init(freighterState);
    freighterState.fleetSlots = 2;
    Fleet.buyShip(freighterState, 'freighter');
    Fleet.switchShip(freighterState, 1);

    const discountedPrice = Economy.getBuyPrice('sol_prime', 'weapons', freighterState);
    expect(discountedPrice).toBeLessThan(basePrice);
  });

  it('买入议价会合并科技、舰船与派系代价后按统一上限结算', () => {
    const state = createTestState({ credits: 10000, techBuyDiscount: 0.10, tradeCount: 20 });
    Faction.init(state);
    Fleet.init(state);
    state.fleetSlots = 2;
    expect(Fleet.buyShip(state, 'freighter').ok).toBe(true);
    expect(Fleet.switchShip(state, 1).ok).toBe(true);

    vi.spyOn(Faction, 'getTaxModifier').mockReturnValue(1.12);

    const basePrice = Economy.getBuyPrice('sol_prime', 'food');
    const actual = Economy.getBuyPrice('sol_prime', 'food', state);
    const profile = Economy.getTradeNegotiationProfile(state, 'sol_prime');
    const expected = Math.ceil(basePrice * (1 - profile.buyAdvantage) * (1 + profile.buyPenalty));

    expect(actual).toBe(expected);
    expect(profile.rawBuyAdvantage).toBeCloseTo(0.13);
    expect(profile.buyPenalty).toBeCloseTo(0.03);
  });
});

describe('Economy.getSellPrice', () => {
  it('新手保护只由交易次数推进，升级不会让报价突变', () => {
    const lowLevel = createTestState({ playerLevel: 1, tradeCount: 2 });
    const highLevel = createTestState({ playerLevel: 8, tradeCount: 2 });
    Faction.init(lowLevel);
    Faction.init(highLevel);

    SYSTEMS.slice(0, 12).forEach(function (system) {
      GOODS.filter(function (good) {
        return good.marketAccess.includes('open');
      }).forEach(function (good) {
        expect(Economy.getSellPrice(system.id, good.id, highLevel)).toBe(
          Economy.getSellPrice(system.id, good.id, lowLevel)
        );
      });
    });
  });

  it('对有效参数返回正整数', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getSellPrice('sol_prime', 'food', state);
    expect(price).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(price)).toBe(true);
  });

  it('对无效 systemId 返回 1（C1 已修复）', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getSellPrice('nonexistent_system', 'food', state);
    expect(price).toBe(1);
  });

  it('友好派系卖出价应高于敌对派系 [H5]', () => {
    const friendly = createTestState({ tradeCount: 20 });
    Faction.init(friendly);
    // 设置 federation 为盟友
    friendly.factionRelations.federation = 80;

    const hostile = createTestState({ tradeCount: 20 });
    Faction.init(hostile);
    // 设置 federation 为敌对
    hostile.factionRelations.federation = -80;

    // sol_prime 属于 federation
    const priceFriendly = Economy.getSellPrice('sol_prime', 'luxury', friendly);
    const priceHostile = Economy.getSellPrice('sol_prime', 'luxury', hostile);

    expect(priceFriendly).toBeGreaterThan(priceHostile);
  });

  it('sellTax 极端值时价格仍然 >= 1 [H5]', () => {
    const state = createTestState();
    Faction.init(state);
    // 设置极端敌对
    state.factionRelations.federation = -100;
    const price = Economy.getSellPrice('sol_prime', 'food', state);
    expect(price).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(price)).toBe(true);
  });

  it('完整舰队编队加成会提高卖出价格', () => {
    const baseState = createTestState({ credits: 50000, tradeCount: 8 });
    Faction.init(baseState);
    Fleet.init(baseState);
    const basePrice = Economy.getSellPrice('sol_prime', 'luxury', baseState);

    const fleetState = createTestState({ credits: 50000, tradeCount: 8 });
    Faction.init(fleetState);
    Fleet.init(fleetState);
    fleetState.fleetSlots = 4;
    Fleet.buyShip(fleetState, 'freighter');
    Fleet.buyShip(fleetState, 'clipper');
    Fleet.buyShip(fleetState, 'galleon');

    const boostedPrice = Economy.getSellPrice('sol_prime', 'luxury', fleetState);
    expect(boostedPrice).toBeGreaterThan(basePrice);
  });

  it('卖出议价与买入议价共享递减预算', () => {
    const state = createTestState({ credits: 50000, techSellBonus: 0.08, tradeCount: 20 });
    Faction.init(state);
    Fleet.init(state);
    state.fleetSlots = 2;
    expect(Fleet.buyShip(state, 'galleon').ok).toBe(true);
    expect(Fleet.switchShip(state, 1).ok).toBe(true);

    vi.spyOn(Faction, 'getTaxModifier').mockReturnValue(0.92);

    const basePrice = Economy.getSellPrice('sol_prime', 'food');
    const actual = Economy.getSellPrice('sol_prime', 'food', state);
    const profile = Economy.getTradeNegotiationProfile(state, 'sol_prime');
    const expected = Math.floor(basePrice * (1 + profile.sellAdvantage) * (1 - profile.sellPenalty));

    expect(actual).toBe(expected);
    expect(profile.rawCombinedAdvantage).toBeGreaterThan(profile.combinedAdvantage);
    expect(profile.combinedAdvantage).toBeLessThanOrEqual(ECONOMY_CONFIG.pricing.negotiation.maxCombinedAdvantage);
  });
});

describe('Economy.getFuelCost', () => {
  it('同星系旅行返回合理燃料值', () => {
    const cost = Economy.getFuelCost('sol_prime', 'nova_station', 1.0);
    expect(cost).toBeGreaterThanOrEqual(1);
    expect(Number.isFinite(cost)).toBe(true);
  });

  it('对无效 systemId 不崩溃（返回 999）', () => {
    const cost = Economy.getFuelCost('nonexistent_a', 'nonexistent_b', 1.0);
    expect(cost).toBe(ECONOMY_CONFIG.travel.invalidSystemFuelCost);
  });

  it('更高效率系数应消耗更少燃料', () => {
    const costNormal = Economy.getFuelCost('sol_prime', 'nova_station', 1.0);
    const costEfficient = Economy.getFuelCost('sol_prime', 'nova_station', 0.5);
    expect(costEfficient).toBeLessThanOrEqual(costNormal);
  });
});

describe('Economy.advanceDay', () => {
  it('多次调用不崩溃', () => {
    expect(() => {
      for (let i = 0; i < 100; i++) {
        Economy.advanceDay();
      }
    }).not.toThrow();
  });
});

describe('Economy.getSupplyDemand', () => {
  it('返回正 supply、demand 和有限 ratio', () => {
    const sd = Economy.getSupplyDemand('sol_prime', 'food');
    expect(sd.supply).toBeGreaterThan(0);
    expect(sd.demand).toBeGreaterThan(0);
    expect(Number.isFinite(sd.ratio)).toBe(true);
  });

  it('对不存在的 systemId 返回默认值', () => {
    const sd = Economy.getSupplyDemand('nonexistent', 'food');
    expect(sd.supply).toBe(ECONOMY_CONFIG.supplyDemand.baseline);
    expect(sd.demand).toBe(ECONOMY_CONFIG.supplyDemand.baseline);
    expect(sd.ratio).toBe(1);
  });
});

describe('Economy.onPlayerBuy / onPlayerSell', () => {
  it('买入减少供给、增加需求', () => {
    const before = Economy.getSupplyDemand('sol_prime', 'food');
    Economy.onPlayerBuy('sol_prime', 'food', 5);
    const after = Economy.getSupplyDemand('sol_prime', 'food');
    expect(after.supply).toBeLessThanOrEqual(before.supply);
    expect(after.demand).toBeGreaterThanOrEqual(before.demand);
  });

  it('卖出增加供给、减少需求', () => {
    const before = Economy.getSupplyDemand('sol_prime', 'minerals');
    Economy.onPlayerSell('sol_prime', 'minerals', 5);
    const after = Economy.getSupplyDemand('sol_prime', 'minerals');
    expect(after.supply).toBeGreaterThanOrEqual(before.supply);
    expect(after.demand).toBeLessThanOrEqual(before.demand);
  });

  it('对无效 systemId 不崩溃', () => {
    expect(() => {
      Economy.onPlayerBuy('nonexistent', 'food', 5);
      Economy.onPlayerSell('nonexistent', 'food', 5);
    }).not.toThrow();
  });

  it('买卖后供需仍被限制在配置边界内', () => {
    for (let i = 0; i < 50; i++) {
      Economy.onPlayerBuy('sol_prime', 'food', 10);
    }
    let afterBuy = Economy.getSupplyDemand('sol_prime', 'food');
    expect(afterBuy.supply).toBeGreaterThanOrEqual(ECONOMY_CONFIG.supplyDemand.min);
    expect(afterBuy.demand).toBeLessThanOrEqual(ECONOMY_CONFIG.supplyDemand.max);

    for (let i = 0; i < 50; i++) {
      Economy.onPlayerSell('sol_prime', 'food', 10);
    }
    let afterSell = Economy.getSupplyDemand('sol_prime', 'food');
    expect(afterSell.supply).toBeLessThanOrEqual(ECONOMY_CONFIG.supplyDemand.max);
    expect(afterSell.demand).toBeGreaterThanOrEqual(ECONOMY_CONFIG.supplyDemand.min);
  });
});
