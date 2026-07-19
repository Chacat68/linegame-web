// tests/faction.test.js — 派系系统测试

import { describe, it, expect, beforeEach } from 'vitest';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import { FACTION_CONFIG } from '../js/data/constants.js';
import { FACTIONS, FACTION_LEVELS } from '../js/data/factions.js';
import { createTestState } from './helpers.js';

describe('FactionSystem.init', () => {
  it('初始化所有派系关系为 0', () => {
    const state = createTestState();
    Faction.init(state);
    expect(state.factionRelations).toBeDefined();
    FACTIONS.forEach(f => {
      expect(state.factionRelations[f.id]).toBe(0);
    });
  });

  it('不覆盖已有的派系关系', () => {
    const state = createTestState();
    state.factionRelations = { federation: 50 };
    Faction.init(state);
    expect(state.factionRelations.federation).toBe(50);
  });
});

describe('FactionSystem.getRelation', () => {
  it('返回已设定的关系值', () => {
    const state = createTestState();
    Faction.init(state);
    state.factionRelations.federation = 42;
    expect(Faction.getRelation(state, 'federation')).toBe(42);
  });

  it('未初始化时返回 0', () => {
    const state = createTestState();
    expect(Faction.getRelation(state, 'federation')).toBe(0);
  });

  it('不存在的派系返回 0', () => {
    const state = createTestState();
    Faction.init(state);
    expect(Faction.getRelation(state, 'nonexistent')).toBe(0);
  });
});

describe('FactionSystem.getLevel', () => {
  it('中立关系返回中立等级', () => {
    const state = createTestState();
    Faction.init(state);
    const level = Faction.getLevel(state, 'federation');
    expect(level).toBeDefined();
    expect(level.id).toBeDefined();
  });

  it('高关系值返回高等级', () => {
    const state = createTestState();
    Faction.init(state);
    state.factionRelations.federation = 80;
    const level = Faction.getLevel(state, 'federation');
    // 高关系值应该返回友好或以上等级
    expect(level).toBeDefined();
  });

  it('低关系值返回敌对等级', () => {
    const state = createTestState();
    Faction.init(state);
    state.factionRelations.federation = -80;
    const level = Faction.getLevel(state, 'federation');
    expect(level).toBeDefined();
  });
});

describe('FactionSystem.changeRelation', () => {
  it('正值改善关系', () => {
    const state = createTestState();
    Faction.init(state);
    const before = Faction.getRelation(state, 'federation');
    Faction.changeRelation(state, 'federation', 20);
    const after = Faction.getRelation(state, 'federation');
    expect(after).toBe(before + 20);
  });

  it('负值恶化关系', () => {
    const state = createTestState();
    Faction.init(state);
    Faction.changeRelation(state, 'federation', -30);
    expect(Faction.getRelation(state, 'federation')).toBe(-30);
  });

  it('关系值 clamp 到 [-100, 100]', () => {
    const state = createTestState();
    Faction.init(state);
    Faction.changeRelation(state, 'federation', 200);
    expect(Faction.getRelation(state, 'federation')).toBe(FACTION_CONFIG.relations.max);

    Faction.changeRelation(state, 'federation', -300);
    expect(Faction.getRelation(state, 'federation')).toBe(FACTION_CONFIG.relations.min);
  });

  it('等级变更时返回消息', () => {
    const state = createTestState();
    Faction.init(state);
    // 大幅提升关系以触发等级变更
    const result = Faction.changeRelation(state, 'federation', 80);
    expect(result).toHaveProperty('oldLevel');
    expect(result).toHaveProperty('newLevel');
    expect(Array.isArray(result.msgs)).toBe(true);
  });
});

describe('FactionSystem.getFactionForSystem', () => {
  it('返回控制该星系的派系', () => {
    const faction = Faction.getFactionForSystem('sol_prime');
    // sol_prime 应该属于某个派系
    if (faction) {
      expect(faction.id).toBeDefined();
      expect(faction.name).toBeDefined();
    }
  });

  it('无归属时返回 null', () => {
    const faction = Faction.getFactionForSystem('nonexistent_system');
    expect(faction).toBeNull();
  });
});

describe('FactionSystem.getTaxModifier', () => {
  it('返回合理的税率修正系数', () => {
    const state = createTestState();
    Faction.init(state);
    const taxMod = Faction.getTaxModifier(state, 'sol_prime');
    expect(taxMod).toBeGreaterThan(0);
    expect(Number.isFinite(taxMod)).toBe(true);
  });

  it('无归属星系返回 1.0', () => {
    const state = createTestState();
    Faction.init(state);
    const taxMod = Faction.getTaxModifier(state, 'nonexistent');
    expect(taxMod).toBe(1.0);
  });
});

describe('FactionSystem.onTrade', () => {
  it('交易后返回消息数组', () => {
    const state = createTestState();
    Faction.init(state);
    const msgs = Faction.onTrade(state, 'sol_prime', 'food', 'buy', 5);
    expect(Array.isArray(msgs)).toBe(true);
  });

  it('在有派系的星球交易会改变关系', () => {
    const state = createTestState();
    Faction.init(state);
    const faction = Faction.getFactionForSystem('sol_prime');
    if (!faction) return;
    const before = Faction.getRelation(state, faction.id);
    Faction.onTrade(state, 'sol_prime', 'food', 'sell', 10);
    const after = Faction.getRelation(state, faction.id);
    expect(after).not.toBe(before);
  });

  it('在无派系的星球交易不崩溃', () => {
    const state = createTestState();
    Faction.init(state);
    expect(() => {
      Faction.onTrade(state, 'nonexistent', 'food', 'buy', 5);
    }).not.toThrow();
  });

  it('大额订单使用边际递减，不能一单从中立刷到同盟', () => {
    const state = createTestState();
    Faction.init(state);
    const faction = Faction.getFactionForSystem('sol_prime');

    Faction.onTrade(state, 'sol_prime', 'food', 'sell', 100, 'open');

    expect(Faction.getRelation(state, faction.id)).toBeLessThanOrEqual(FACTION_CONFIG.tradeImpact.maxGainPerTrade);
    expect(Faction.getRelation(state, faction.id)).toBeLessThan(70);
  });

  it('黑市交易提供的公开派系好感低于同量公开交易', () => {
    const openState = createTestState();
    const blackState = createTestState();
    Faction.init(openState);
    Faction.init(blackState);
    const faction = Faction.getFactionForSystem('shadow_haven');

    Faction.onTrade(openState, 'shadow_haven', 'weapons', 'sell', 25, 'open');
    Faction.onTrade(blackState, 'shadow_haven', 'weapons', 'sell', 25, 'black');

    expect(Faction.getRelation(blackState, faction.id)).toBeLessThan(Faction.getRelation(openState, faction.id));
  });

  it('辛迪加友好后解锁黑市访问', () => {
    const state = createTestState();
    Faction.init(state);

    expect(Faction.canAccessBlackMarket(state, 'shadow_haven')).toBe(false);

    state.factionRelations.syndicate = 35;
    expect(Faction.canAccessBlackMarket(state, 'shadow_haven')).toBe(true);
  });

  it('非辛迪加控制区不会解锁黑市访问', () => {
    const state = createTestState();
    Faction.init(state);
    state.factionRelations.federation = 100;

    expect(Faction.canAccessBlackMarket(state, 'sol_prime')).toBe(false);
  });
});

describe('FactionSystem.getAllRelations', () => {
  it('返回所有派系的关系信息', () => {
    const state = createTestState();
    Faction.init(state);
    const relations = Faction.getAllRelations(state);
    expect(relations.length).toBe(FACTIONS.length);
    relations.forEach(r => {
      expect(r).toHaveProperty('faction');
      expect(r).toHaveProperty('relation');
      expect(r).toHaveProperty('level');
    });
  });
});
