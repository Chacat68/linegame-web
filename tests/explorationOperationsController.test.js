import { describe, expect, it } from 'vitest';
import { createActionExecutionPipeline } from '../js/core/ActionExecutionPipeline.js';
import { createExplorationOperationsController } from '../js/core/ExplorationOperationsController.js';

function createHarness(options) {
  var config = options || {};
  var trace = [];
  var state = { id: 'current', galaxyStates: {} };
  var result = config.result || { ok: true, msgs: [{ text: 'survey complete', type: 'info' }] };
  var pipeline = createActionExecutionPipeline({
    emitMessage: function (message) { trace.push('message:' + message.text); },
    emitErrorCue: function () { trace.push('error-cue'); },
    queueAchievementCheck: function () { trace.push('achievement:' + Object.keys(state.galaxyStates).length); },
    render: function () { trace.push('render:' + Object.keys(state.galaxyStates).length); },
    checkVictory: function () { trace.push('victory:' + Object.keys(state.galaxyStates).length); },
  });
  var controller = createExplorationOperationsController({
    getState: function () { trace.push('get-state'); return state; },
    systems: {
      Exploration: {
        getPoiStatus: function (nextState, systemId, poiId, settings) {
          trace.push('status:' + systemId + ':' + poiId + ':' + settings.poiRewardMultiplier);
          return { canExplore: nextState === state };
        },
        explorePoi: function (nextState, systemId, poiId, settings) {
          trace.push('explore:' + systemId + ':' + poiId + ':' + settings.poiRewardMultiplier);
          return result;
        },
      },
      Fleet: {
        syncStateFromShip: function () { trace.push('sync-ship'); },
        getActiveShip: function () { trace.push('active-ship'); return { id: 'ship' }; },
        getEffectiveShipStats: function () { trace.push('ship-stats'); return { poiRewardMultiplier: 1.5 }; },
        commitActiveShipState: function () { trace.push('commit-ship'); },
      },
      GalaxyData: {
        getAllPlanetStates: function () { trace.push('capture-galaxy'); return { sol_prime: { surveyed: true } }; },
      },
    },
    pipeline: pipeline,
  });
  return { controller: controller, state: state, trace: trace };
}

describe('ExplorationOperationsController', function () {
  it('成功探索先提交舰船与星图快照，再发布结果和胜利检查', function () {
    var harness = createHarness();

    harness.controller.explorePoi('sol_prime', 'poi_1');

    expect(harness.trace).toEqual([
      'get-state', 'sync-ship', 'active-ship', 'ship-stats',
      'explore:sol_prime:poi_1:1.5', 'commit-ship', 'capture-galaxy',
      'message:survey complete', 'achievement:1', 'render:1', 'victory:1',
    ]);
    expect(harness.state.galaxyStates.sol_prime.surveyed).toBe(true);
  });

  it('探索失败不提交舰船或星图快照', function () {
    var harness = createHarness({ result: { ok: false, msgs: [{ text: 'blocked', type: 'error' }] } });

    harness.controller.explorePoi('sol_prime', 'poi_1');

    expect(harness.trace).toEqual([
      'get-state', 'sync-ship', 'active-ship', 'ship-stats',
      'explore:sol_prime:poi_1:1.5', 'message:blocked', 'error-cue',
      'achievement:0', 'render:0',
    ]);
  });

  it('POI 状态查询使用最新 state 和当前舰船倍率', function () {
    var harness = createHarness();

    expect(harness.controller.getPoiStatus('nova_station', 'poi_2')).toEqual({ canExplore: true });
    expect(harness.trace).toEqual([
      'get-state', 'active-ship', 'ship-stats', 'status:nova_station:poi_2:1.5',
    ]);
  });
});
