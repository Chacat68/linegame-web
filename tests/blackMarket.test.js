// tests/blackMarket.test.js — 黑市系统测试
// 覆盖：黑市价格、走私检查、商品过滤、统计记录

import { describe, it, expect, beforeEach } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import { GOODS } from '../js/data/goods.js';
import { ECONOMY_CONFIG } from '../js/data/constants.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

// ---------------------------------------------------------------------------
// 黑市价格
// ---------------------------------------------------------------------------

describe('Economy.getBlackMarketBuyPrice', () => {
  it('黑市买入价高于公开市场买入价', () => {
    const state = createTestState();
    Faction.init(state);
    // 采样多次取平均，减少随机波动干扰
    let openTotal = 0, blackTotal = 0;
    for (let i = 0; i < 50; i++) {
      openTotal += Economy.getBuyPrice('sol_prime', 'weapons', state);
      blackTotal += Economy.getBlackMarketBuyPrice('sol_prime', 'weapons', state);
    }
    expect(blackTotal / 50).toBeGreaterThan(openTotal / 50);
  });

  it('返回值至少为 minimumPrice', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getBlackMarketBuyPrice('sol_prime', 'food', state);
    expect(price).toBeGreaterThanOrEqual(ECONOMY_CONFIG.pricing.minimumPrice);
  });

  it('不存在的商品返回 minimumPrice', () => {
    const state = createTestState();
    Faction.init(state);
    const price = Economy.getBlackMarketBuyPrice('sol_prime', 'nonexistent', state);
    expect(price).toBe(ECONOMY_CONFIG.pricing.minimumPrice);
  });
});

describe('Economy.getBlackMarketSellPrice', () => {
  it('黑市卖出价高于公开市场卖出价', () => {
    const state = createTestState();
    Faction.init(state);
    let openTotal = 0, blackTotal = 0;
    for (let i = 0; i < 50; i++) {
      openTotal += Economy.getSellPrice('sol_prime', 'weapons', state);
      blackTotal += Economy.getBlackMarketSellPrice('sol_prime', 'weapons', state);
    }
    expect(blackTotal / 50).toBeGreaterThan(openTotal / 50);
  });

  it('违禁品黑市卖出价显著高于受监管商品', () => {
    const state = createTestState();
    Faction.init(state);
    let illegalTotal = 0, restrictedTotal = 0;
    for (let i = 0; i < 50; i++) {
      illegalTotal += Economy.getBlackMarketSellPrice('sol_prime', 'weapons', state);
      restrictedTotal += Economy.getBlackMarketSellPrice('sol_prime', 'technology', state);
    }
    // 武器 basePrice=120 vs 科技 basePrice=60，但违禁品加成 1.6 vs 受监管 1.25
    // 所以 weaponsAvg / techAvg > (120/60) 简单比值
    expect(illegalTotal / restrictedTotal).toBeGreaterThan(1.5);
  });
});

// ---------------------------------------------------------------------------
// 商品分类
// ---------------------------------------------------------------------------

describe('Economy.isBlackMarketGood', () => {
  it('武器是黑市商品', () => {
    expect(Economy.isBlackMarketGood('weapons')).toBe(true);
  });

  it('科技可在黑市交易', () => {
    expect(Economy.isBlackMarketGood('technology')).toBe(true);
  });

  it('食物不在黑市交易', () => {
    expect(Economy.isBlackMarketGood('food')).toBe(false);
  });

  it('不存在的商品返回 false', () => {
    expect(Economy.isBlackMarketGood('nonexistent')).toBe(false);
  });
});

describe('Economy.getBlackMarketGoods', () => {
  it('返回包含武器、科技、奢侈品', () => {
    const goods = Economy.getBlackMarketGoods();
    const ids = goods.map(g => g.id);
    expect(ids).toContain('weapons');
    expect(ids).toContain('technology');
    expect(ids).toContain('luxury');
  });

  it('不包含食物、水等合法商品', () => {
    const goods = Economy.getBlackMarketGoods();
    const ids = goods.map(g => g.id);
    expect(ids).not.toContain('food');
    expect(ids).not.toContain('water');
    expect(ids).not.toContain('minerals');
  });
});

// ---------------------------------------------------------------------------
// 走私检查
// ---------------------------------------------------------------------------

describe('Economy.checkSmuggling', () => {
  it('无违禁品时不触发检查', () => {
    const state = createTestState({ cargo: { food: 5 } });
    Faction.init(state);
    const result = Economy.checkSmuggling(state, 'sol_prime');
    expect(result.caught).toBe(false);
    expect(result.fine).toBe(0);
    expect(result.confiscated).toEqual([]);
  });

  it('空货舱不触发检查', () => {
    const state = createTestState();
    Faction.init(state);
    const result = Economy.checkSmuggling(state, 'sol_prime');
    expect(result.caught).toBe(false);
  });

  it('辛迪加友好区域免检', () => {
    const state = createTestState({
      cargo: { weapons: 10 },
      factionRelations: { federation: 0, syndicate: 50, technocracy: 0 },
    });
    Faction.init(state);
    const result = Economy.checkSmuggling(state, 'shadow_haven');
    expect(result.caught).toBe(false);
    expect(result.msgs.length).toBeGreaterThan(0);
    expect(result.msgs[0].text).toContain('庇护');
  });

  it('被抓时扣款并没收违禁品', () => {
    // 设置极高走私品比例 + 联邦高执法 → 几乎必被抓
    const state = createTestState({
      credits: 10000,
      cargo: { weapons: 10 },
      shipHull: 100,
      reputation: -100, // 低声望 → 更易被抓
    });
    Faction.init(state);

    // 多次尝试确保至少一次被抓
    let caughtOnce = false;
    for (let i = 0; i < 100; i++) {
      const s = createTestState({
        credits: 10000,
        cargo: { weapons: 10 },
        shipHull: 100,
        reputation: -100,
      });
      Faction.init(s);
      const result = Economy.checkSmuggling(s, 'sol_prime');
      if (result.caught) {
        caughtOnce = true;
        expect(s.credits).toBeLessThan(10000);
        expect(s.cargo.weapons).toBeUndefined();
        expect(s.shipHull).toBeLessThan(100);
        expect(result.confiscated.length).toBeGreaterThan(0);
        expect(s.smugglingStats.caught).toBe(1);
        break;
      }
    }
    expect(caughtOnce).toBe(true);
  });

  it('高声望降低被抓概率', () => {
    // 以统计方式验证，高声望被抓次数应少于低声望
    let caughtLow = 0, caughtHigh = 0;
    const runs = 500;
    for (let i = 0; i < runs; i++) {
      const sLow = createTestState({
        credits: 50000, cargo: { weapons: 5 }, shipHull: 100, reputation: -50,
      });
      Faction.init(sLow);
      if (Economy.checkSmuggling(sLow, 'sol_prime').caught) caughtLow++;

      const sHigh = createTestState({
        credits: 50000, cargo: { weapons: 5 }, shipHull: 100, reputation: 80,
      });
      Faction.init(sHigh);
      if (Economy.checkSmuggling(sHigh, 'sol_prime').caught) caughtHigh++;
    }
    expect(caughtHigh).toBeLessThan(caughtLow);
  });
});

// ---------------------------------------------------------------------------
// 统计记录
// ---------------------------------------------------------------------------

describe('Economy smuggling stats', () => {
  it('recordSmugglingEvaded 递增 evaded', () => {
    const state = createTestState();
    Economy.recordSmugglingEvaded(state);
    expect(state.smugglingStats.evaded).toBe(1);
    Economy.recordSmugglingEvaded(state);
    expect(state.smugglingStats.evaded).toBe(2);
  });

  it('recordBlackMarketTrade 递增 blackMarketTrades', () => {
    const state = createTestState();
    Economy.recordBlackMarketTrade(state);
    expect(state.smugglingStats.blackMarketTrades).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// BLACK_MARKET_CONFIG 存在性验证
// ---------------------------------------------------------------------------

describe('ECONOMY_CONFIG.blackMarket', () => {
  it('配置存在且包含必要字段', () => {
    const bm = ECONOMY_CONFIG.blackMarket;
    expect(bm).toBeDefined();
    expect(bm.pricePremium).toBeGreaterThan(1);
    expect(bm.sellPremium).toBeGreaterThan(1);
    expect(bm.volatility).toBeGreaterThan(1);
    expect(bm.illegalSellBonus).toBeGreaterThan(bm.restrictedSellBonus);
  });
});

describe('ECONOMY_CONFIG.smuggling', () => {
  it('走私配置存在且合理', () => {
    const s = ECONOMY_CONFIG.smuggling;
    expect(s).toBeDefined();
    expect(s.baseCheckChance).toBeGreaterThan(0);
    expect(s.baseCheckChance).toBeLessThan(1);
    expect(s.fineMultiplier).toBeGreaterThan(0);
    expect(s.baseFine).toBeGreaterThan(0);
  });
});
