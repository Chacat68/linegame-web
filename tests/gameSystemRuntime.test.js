import { describe, expect, it, vi } from 'vitest';
import { createGameSystemRuntime, RESTORE_ORDER } from '../js/core/GameSystemRuntime.js';

function system(name, order, methods) {
  var target = {};
  (methods || ['init']).forEach(function (method) {
    target[method] = vi.fn(function () {
      order.push(name + '.' + method);
      if (method === 'getCycleState') return { phaseIndex: 2 };
      if (method === 'getMarketState') return { snapshot: true };
      if (method === 'getAllPlanetStates') return { earth: { discovered: true } };
    });
  });
  return target;
}

describe('GameSystemRuntime', function () {
  it('冷启动与读档共用一份领域系统顺序表', function () {
    var calls = [];
    var runtime = createGameSystemRuntime({
      systems: {
        Economy: system('economy', calls, ['init', 'setCycleState']),
        Fleet: system('fleet', calls),
        Faction: system('faction', calls),
        Research: system('research', calls),
        Quest: system('quest', calls),
        Tutorial: system('tutorial', calls),
        BalanceMetrics: system('balance', calls),
        MidgameTeachingChain: system('midgame', calls),
        GalaxyData: system('galaxy', calls, ['init', 'restorePlanetStates']),
      },
      hooks: {
        ensureAchievementState: function () { calls.push('achievement.ensure'); },
        initializeAchievement: function () { calls.push('achievement.init'); },
        syncDeferredBusiness: function () { calls.push('deferred.sync'); },
      },
    });
    var state = { economyCycle: { phaseIndex: 1 }, galaxyStates: { earth: {} } };

    var result = runtime.restore(state, { reason: 'manual-load' });

    expect(result.order).toEqual(RESTORE_ORDER);
    expect(calls).toEqual([
      'economy.init', 'economy.setCycleState', 'fleet.init', 'faction.init',
      'research.init', 'quest.init', 'tutorial.init', 'balance.init', 'midgame.init',
      'achievement.ensure', 'achievement.init', 'galaxy.init', 'galaxy.restorePlanetStates', 'deferred.sync',
    ]);
  });

  it('在一个 capture 入口回写船队、经济和星球快照', function () {
    var calls = [];
    var runtime = createGameSystemRuntime({
      systems: {
        Fleet: system('fleet', calls, ['syncShipFromState']),
        Economy: system('economy', calls, ['getCycleState', 'getMarketState']),
        GalaxyData: system('galaxy', calls, ['getAllPlanetStates']),
      },
    });
    var state = {};

    var result = runtime.capture(state, { reason: 'manual-save' });

    expect(result.order).toEqual(['fleet', 'economy', 'galaxyData']);
    expect(state).toMatchObject({
      economyCycle: { phaseIndex: 2 },
      economyMarketState: { snapshot: true },
      galaxyStates: { earth: { discovered: true } },
    });
  });

  it('同一 session revision 不会重复 restore 有状态系统', function () {
    var calls = [];
    var runtime = createGameSystemRuntime({
      systems: {
        Economy: system('economy', calls, ['init']),
        Fleet: system('fleet', calls),
      },
    });
    var state = {};
    var token = { state: state, revision: 4 };

    var first = runtime.restore(state, { sessionToken: token });
    var second = runtime.restore(state, { sessionToken: token });

    expect(second).toBe(first);
    expect(calls.filter(function (call) { return call === 'fleet.init'; })).toHaveLength(1);

    runtime.restore(state, { sessionToken: { state: state, revision: 5 } });
    expect(calls.filter(function (call) { return call === 'fleet.init'; })).toHaveLength(2);
  });
});
