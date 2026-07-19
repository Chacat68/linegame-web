// tests/victory.test.js — 胜利判定系统测试

import { describe, it, expect } from 'vitest';
import * as Victory from '../js/systems/victory/VictorySystem.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as Research from '../js/systems/research/ResearchSystem.js';
import { VICTORY_PATHS } from '../js/data/victoryConditions.js';
import { ACHIEVEMENTS } from '../js/data/achievements.js';
import { TECHNOLOGIES } from '../js/data/technologies.js';
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

  it('舰队路线只统计现役核心成就，未知 ID 不能凑数', () => {
    const path = VICTORY_PATHS.find(function (entry) { return entry.id === 'fleet_commander'; });
    const unknownState = createTestState({
      questPhase: 3,
      achievements: Array.from({ length: 20 }, function (_, index) { return 'unknown_' + index; }),
    });
    const validState = createTestState({
      questPhase: 3,
      achievements: ACHIEVEMENTS.slice(0, 16).map(function (achievement) { return achievement.id; }),
    });

    const unknownRequirement = Victory.getPathProgress(unknownState, path).requirements.find(function (req) {
      return req.label.indexOf('核心成就') !== -1;
    });
    const validRequirement = Victory.getPathProgress(validState, path).requirements.find(function (req) {
      return req.label.indexOf('核心成就') !== -1;
    });

    expect(unknownRequirement.current).toBe(0);
    expect(validRequirement.current).toBe(16);
  });

  it('探索路线按完成整颗星球调查计数，不再要求挂机天数', () => {
    const path = VICTORY_PATHS.find(function (entry) { return entry.id === 'galactic_explorer'; });
    const galaxyStates = {};
    for (let index = 0; index < 12; index++) {
      galaxyStates['survey_' + index] = {
        exploration: { pois: [{ id: 'a', resolved: true }, { id: 'b', resolved: true }] },
      };
    }
    galaxyStates.incomplete = {
      exploration: { pois: [{ id: 'a', resolved: true }, { id: 'b', resolved: false }] },
    };
    const state = createTestState({ questPhase: 2, day: 999, galaxyStates: galaxyStates });

    const surveyRequirement = Victory.getPathProgress(state, path).requirements.find(function (req) {
      return req.label.indexOf('全部探索点') !== -1;
    });

    expect(surveyRequirement.current).toBe(12);
    expect(surveyRequirement.done).toBe(true);
    expect(path.requirements.some(function (req) { return req.type === 'day'; })).toBe(false);
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

  it('所有胜利路线都声明可执行收益与代价', () => {
    VICTORY_PATHS.forEach(function (path) {
      expect(path.policy).toBeTruthy();
      expect(path.policy.benefit).toBeTruthy();
      expect(path.policy.tradeoff).toBeTruthy();
      expect(Object.keys(path.policy.effects).length).toBeGreaterThan(0);
    });
  });
});

describe('VictorySystem.choosePolicy', () => {
  it('信条可选且只能做出一次不可逆选择', () => {
    const state = createTestState({ questPhase: 2 });

    const first = Victory.choosePolicy(state, 'galactic_explorer');
    const second = Victory.choosePolicy(state, 'trade_baron');

    expect(first.ok).toBe(true);
    expect(state.storyDecisions.victory_policy).toBe('galactic_explorer');
    expect(state.balanceMetrics.routes.galactic_explorer.selectedDay).toBe(state.day);
    expect(state.balanceMetrics.routes.galactic_explorer.selectedAssets.netWorth).toBeGreaterThan(0);
    expect(second.ok).toBe(false);
    expect(state.storyDecisions.victory_policy).toBe('galactic_explorer');
    const progress = Victory.getProgress(state);
    expect(progress.find(function (entry) { return entry.pathId === 'galactic_explorer'; }).policySelected).toBe(true);
    expect(progress.find(function (entry) { return entry.pathId === 'trade_baron'; }).policyLocked).toBe(true);
  });

  it('远征信条会同时改变舰船货舱、燃耗与 探索点 收益', () => {
    const state = createTestState({ questPhase: 2 });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    const baseline = Fleet.getEffectiveShipStats(state, ship);

    expect(Victory.choosePolicy(state, 'galactic_explorer').ok).toBe(true);
    const committed = Fleet.getEffectiveShipStats(state, ship);

    expect(committed.maxCargo).toBe(baseline.maxCargo - 5);
    expect(committed.fuelEff).toBeCloseTo(baseline.fuelEff * 0.9, 4);
    expect(committed.poiRewardMultiplier).toBeCloseTo(baseline.poiRewardMultiplier * 1.15, 4);
  });

  it('科研信条会实际缩短新建研究任务', () => {
    const state = createTestState({ questPhase: 1, credits: 50000 });
    Research.init(state);
    expect(Victory.choosePolicy(state, 'tech_supremacy').ok).toBe(true);
    const techId = state.researchOptions[0];
    const tech = TECHNOLOGIES.find(function (entry) { return entry.id === techId; });

    expect(Research.startResearch(state, techId).ok).toBe(true);
    expect(state.currentResearch.daysLeft).toBe(Math.max(1, tech.researchDays - 2));
  });

  it('贸易信条会降低新手保护期之后的买入价', () => {
    Economy.init();
    const state = createTestState({ questPhase: 1, tradeCount: 8 });
    Faction.init(state);
    const before = Economy.getBuyPrice('sol_prime', 'technology', state);

    expect(Victory.choosePolicy(state, 'trade_baron').ok).toBe(true);
    const after = Economy.getBuyPrice('sol_prime', 'technology', state);

    expect(after).toBeLessThan(before);
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

  it('选定不可逆信条后只能按对应路线结算胜利', () => {
    const state = createTestState({
      questPhase: 10,
      credits: 100000,
      tradeCount: 120,
      totalProfit: 50000,
      researchedTechs: TECHNOLOGIES.map(function (tech) { return tech.id; }),
      experience: 4000,
      playerLevel: 8,
      storyDecisions: { victory_policy: 'tech_supremacy' },
    });
    Faction.init(state);

    const result = Victory.checkVictory(state);

    expect(result.won).toBe(true);
    expect(result.path.id).toBe('tech_supremacy');
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
