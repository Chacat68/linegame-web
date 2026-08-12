// tests/midgameTeachingChain.test.js — 中期专题教学链单元测试

import { describe, it, expect, beforeEach } from 'vitest';
import * as MidgameTeachingChain from '../js/systems/guidance/MidgameTeachingChain.js';

function makeState(overrides) {
  return Object.assign({
    day: 5,
    companyLevel: 5,
    companyExperience: 0,
    currentResearch: { techId: 'tech_current', daysLeft: 2 },
    researchedTechs: ['tech_1'],
    completedQuests: ['starter_first_trade'],
    tradeStations: {},
    loans: [],
    fleet: [
      { id: 'ship_1', operatingStats: { tradeCycles: 2 } },
      { id: 'ship_2', operatingStats: { tradeCycles: 1 } },
    ],
    midgameChains: null,
  }, overrides || {});
}

function initState(overrides) {
  var state = makeState(overrides);
  MidgameTeachingChain.init(state);
  return state;
}

function ids(chains) {
  return chains.map(function (chain) { return chain.id; });
}

describe('MidgameTeachingChain', function () {
  var state;

  beforeEach(function () {
    state = initState();
  });

  it('按四条链创建完整且互不共享的默认记录', function () {
    expect(Object.keys(state.midgameChains).sort()).toEqual([
      'capital-risk',
      'dispatch-ops',
      'research-supply',
      'trade-station-basics',
    ]);
    Object.keys(state.midgameChains).forEach(function (chainId) {
      expect(state.midgameChains[chainId]).toEqual({
        active: false,
        completed: false,
        completedSteps: [],
        startedDay: null,
        baselineValue: null,
      });
    });
    state.midgameChains['research-supply'].completedSteps.push('one');
    expect(state.midgameChains['dispatch-ops'].completedSteps).toEqual([]);
  });

  it('重复初始化会规范化但不会覆盖已有进度', function () {
    state.midgameChains['dispatch-ops'] = {
      active: true,
      completed: false,
      completedSteps: ['prefill-profitable-dispatch', 9],
      startedDay: 3.8,
      baselineValue: 7,
    };
    MidgameTeachingChain.init(state);
    expect(state.midgameChains['dispatch-ops']).toEqual({
      active: true,
      completed: false,
      completedSteps: ['prefill-profitable-dispatch'],
      startedDay: 3,
      baselineValue: 7,
    });
  });

  it('科研链只保留可在所有科研状态下执行的通用派遣步骤', function () {
    expect(MidgameTeachingChain.TEACHING_CHAINS.researchSupply.steps).toEqual([
      'prefill-research-supply-dispatch',
    ]);
  });

  it('getAvailableChains 只返回可由当前状态直接验证为已解锁的链', function () {
    expect(ids(MidgameTeachingChain.getAvailableChains(state))).toEqual([
      'research-supply',
      'dispatch-ops',
      'trade-station-basics',
    ]);

    var locked = initState({
      companyLevel: 1,
      currentResearch: null,
      researchedTechs: [],
      completedQuests: [],
      loans: [],
    });
    expect(MidgameTeachingChain.getAvailableChains(locked)).toEqual([]);
  });

  it('资金链只有在贷款功能开放且存在活动贷款时解锁', function () {
    var capital = initState({
      companyLevel: 2,
      loans: [{ id: 'loan_1', status: 'active', balance: 800 }],
    });
    expect(ids(MidgameTeachingChain.getAvailableChains(capital))).toContain('capital-risk');
  });

  it('startChain 拒绝未解锁的链', function () {
    state.currentResearch = null;
    state.researchedTechs = [];
    expect(MidgameTeachingChain.startChain(state, 'research-supply')).toBe(false);
    expect(state.midgameChains['research-supply'].active).toBe(false);
  });

  it('startChain 记录启动日并阻止第二条链并发', function () {
    expect(MidgameTeachingChain.startChain(state, 'research-supply')).toBe(true);
    expect(state.midgameChains['research-supply'].startedDay).toBe(5);
    expect(MidgameTeachingChain.startChain(state, 'dispatch-ops')).toBe(false);
    expect(MidgameTeachingChain.getAvailableChains(state)).toEqual([]);
  });

  it('派遣链启动时以所有舰船的 operatingStats.tradeCycles 总和作为基线', function () {
    expect(MidgameTeachingChain.startChain(state, 'dispatch-ops')).toBe(true);
    expect(state.midgameChains['dispatch-ops'].baselineValue).toBe(3);
  });

  it('派遣链要求启动后完成三次经营循环', function () {
    MidgameTeachingChain.startChain(state, 'dispatch-ops');
    expect(MidgameTeachingChain.completeChainStep(
      state,
      'dispatch-ops',
      'prefill-profitable-dispatch'
    ).completed).toBe(false);

    state.fleet[0].operatingStats.tradeCycles = 4;
    expect(MidgameTeachingChain.checkChainCompletion(state)).toEqual([]);
    state.fleet[1].operatingStats.tradeCycles = 2;
    expect(MidgameTeachingChain.checkChainCompletion(state)).toEqual([
      expect.objectContaining({ chainId: 'dispatch-ops' }),
    ]);
  });

  it('派遣循环计数会安全忽略无效或缺失的舰船统计', function () {
    state.fleet.push(
      { id: 'ship_bad', operatingStats: { tradeCycles: 'invalid' } },
      { id: 'ship_missing' }
    );
    MidgameTeachingChain.startChain(state, 'dispatch-ops');
    expect(state.midgameChains['dispatch-ops'].baselineValue).toBe(3);
  });

  it('自然完成即使业务条件已满足也必须等待全部步骤完成', function () {
    state.researchedTechs = ['tech_1', 'tech_2'];
    MidgameTeachingChain.startChain(state, 'research-supply');
    expect(MidgameTeachingChain.checkChainCompletion(state)).toEqual([]);
    expect(state.midgameChains['research-supply'].active).toBe(true);
  });

  it('科研链在通用步骤完成且累计完成两项研究后完成', function () {
    state.researchedTechs = ['tech_1', 'tech_2'];
    MidgameTeachingChain.startChain(state, 'research-supply');
    var result = MidgameTeachingChain.completeChainStep(
      state,
      'research-supply',
      'prefill-research-supply-dispatch'
    );
    expect(result.completed).toBe(true);
    expect(state.midgameChains['research-supply']).toEqual(expect.objectContaining({
      active: false,
      completed: true,
    }));
  });

  it('completeChainStep 拒绝不属于链定义的 suggestion id', function () {
    MidgameTeachingChain.startChain(state, 'research-supply');
    expect(MidgameTeachingChain.completeChainStep(
      state,
      'research-supply',
      'resolve-research-funding'
    )).toBeNull();
    expect(state.midgameChains['research-supply'].completedSteps).toEqual([]);
  });

  it('贸易站链对应建设并升级同一经营资产', function () {
    MidgameTeachingChain.startChain(state, 'trade-station-basics');
    state.tradeStations.sol = { systemId: 'sol', level: 2 };
    expect(MidgameTeachingChain.completeChainStep(
      state,
      'trade-station-basics',
      'build-trade-station'
    ).completed).toBe(false);
    expect(MidgameTeachingChain.completeChainStep(
      state,
      'trade-station-basics',
      'upgrade-trade-station'
    ).completed).toBe(true);
  });

  it('资金链在复核步骤完成且贷款结清后自然完成', function () {
    state.loans = [{ id: 'loan_1', status: 'active', balance: 800 }];
    MidgameTeachingChain.startChain(state, 'capital-risk');
    expect(MidgameTeachingChain.completeChainStep(
      state,
      'capital-risk',
      'review-loan-obligation'
    ).completed).toBe(false);
    state.loans[0].status = 'paid';
    state.loans[0].balance = 0;
    expect(MidgameTeachingChain.checkChainCompletion(state)).toEqual([
      expect.objectContaining({ chainId: 'capital-risk' }),
    ]);
  });

  it('活跃链查询与 suggestion 优先级只暴露剩余步骤', function () {
    MidgameTeachingChain.startChain(state, 'trade-station-basics');
    expect(MidgameTeachingChain.getActiveChain(state).chain.id).toBe('trade-station-basics');
    expect(MidgameTeachingChain.getChainPrioritySuggestions(state)).toEqual([
      'build-trade-station',
      'upgrade-trade-station',
    ]);
    expect(MidgameTeachingChain.isChainNextStep(state, 'build-trade-station')).toBe(true);
    expect(MidgameTeachingChain.isChainNextStep(state, 'upgrade-trade-station')).toBe(false);
    expect(MidgameTeachingChain.isInActiveChain(state, 'upgrade-trade-station')).toBe(true);
  });

  it('摘要包含可用、活跃和已完成三类状态', function () {
    var summary = MidgameTeachingChain.getChainSummary(state);
    expect(ids(summary.available)).toContain('research-supply');
    expect(summary.active).toBeNull();
    expect(summary.completed).toEqual([]);
  });

  it('未知链和步骤安全返回失败', function () {
    expect(MidgameTeachingChain.startChain(state, 'nonexistent-chain')).toBe(false);
    expect(MidgameTeachingChain.completeChainStep(
      state,
      'nonexistent-chain',
      'nonexistent-step'
    )).toBeNull();
  });
});
