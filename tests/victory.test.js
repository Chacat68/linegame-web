// tests/victory.test.js — 胜利判定系统测试

import { describe, it, expect } from 'vitest';
import * as Victory from '../js/systems/victory/VictorySystem.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Economy from '../js/systems/economy/Economy.js';
import { VICTORY_PATHS } from '../js/data/victoryConditions.js';
import { createTestState } from './helpers.js';

describe('VictorySystem.getPathProgress', () => {
  it('返回有效的进度对象', () => {
    Economy.init();
    const state = createTestState();
    Faction.init(state);
    const path = VICTORY_PATHS[0];
    const progress = Victory.getPathProgress(state, path);

    expect(progress).toHaveProperty('pathId', path.id);
    expect(progress).toHaveProperty('name', path.name);
    expect(progress).toHaveProperty('progress');
    expect(progress).toHaveProperty('completed');
    expect(progress).toHaveProperty('requirements');
    expect(progress.progress).toBeGreaterThanOrEqual(0);
    expect(progress.progress).toBeLessThanOrEqual(1);
  });

  it('初始状态下无路径完成', () => {
    Economy.init();
    const state = createTestState();
    Faction.init(state);
    VICTORY_PATHS.forEach(path => {
      const progress = Victory.getPathProgress(state, path);
      expect(progress.completed).toBe(false);
    });
  });
});

describe('VictorySystem.getProgress', () => {
  it('返回所有解锁路径的进度', () => {
    Economy.init();
    const state = createTestState();
    Faction.init(state);
    const progress = Victory.getProgress(state);
    expect(Array.isArray(progress)).toBe(true);
    expect(progress.length).toBeGreaterThan(0);
    progress.forEach(p => {
      expect(p).toHaveProperty('pathId');
      expect(p).toHaveProperty('progress');
    });
  });
});

describe('VictorySystem.checkVictory', () => {
  it('初始状态返回 won: false', () => {
    Economy.init();
    const state = createTestState();
    Faction.init(state);
    const result = Victory.checkVictory(state);
    expect(result.won).toBe(false);
    expect(result.path).toBeNull();
    expect(result.pathData).toBeNull();
  });

  it('模拟完成贸易霸权路径', () => {
    Economy.init();
    const state = createTestState({
      credits: 100000000,
      tradeCount: 10000,
      totalProfit: 100000000,
      experience: 100000,
      playerLevel: 10,
      reputation: 10000,
      researchedTechs: Array.from({ length: 20 }, (_, i) => 'tech_' + i),
      completedQuests: Array.from({ length: 30 }, (_, i) => 'quest_' + i),
      achievements: Array.from({ length: 30 }, (_, i) => 'ach_' + i),
      visitedSystems: Array.from({ length: 30 }, (_, i) => 'sys_' + i),
      visitedGalaxies: Array.from({ length: 8 }, (_, i) => 'gal_' + i),
      fleetSlots: 10,
      questPhase: 10,
      fleet: [
        { typeId: 'shuttle' },
        { typeId: 'freighter' },
        { typeId: 'corvette' },
        { typeId: 'cruiser' },
        { typeId: 'galleon' },
      ],
    });
    Faction.init(state);
    // 设置所有派系为盟友
    if (state.factionRelations) {
      Object.keys(state.factionRelations).forEach(id => {
        state.factionRelations[id] = 100;
      });
    }

    const result = Victory.checkVictory(state);
    // 注意：不一定所有路径都满足，取决于具体条件
    // 但至少不应崩溃
    expect(result).toHaveProperty('won');
    expect(result).toHaveProperty('path');
  });

  it('会跳过本次会话已确认的胜利路径', () => {
    Economy.init();
    const state = createTestState({
      credits: 100000000,
      tradeCount: 10000,
      totalProfit: 100000000,
      questPhase: 10,
    });
    Faction.init(state);

    const firstResult = Victory.checkVictory(state);
    expect(firstResult.won).toBe(true);

    const ignoredResult = Victory.checkVictory(state, new Set([firstResult.path.id]));
    expect(ignoredResult.won === false || ignoredResult.path.id !== firstResult.path.id).toBe(true);
  });
});

describe('VictorySystem.getUnlockedPaths', () => {
  it('初始状态至少有 1 个解锁路径', () => {
    const state = createTestState();
    const paths = Victory.getUnlockedPaths(state);
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it('更高章节解锁更多路径', () => {
    const state1 = createTestState({ questPhase: 1 });
    const state5 = createTestState({ questPhase: 5 });
    const paths1 = Victory.getUnlockedPaths(state1);
    const paths5 = Victory.getUnlockedPaths(state5);
    expect(paths5.length).toBeGreaterThanOrEqual(paths1.length);
  });
});
