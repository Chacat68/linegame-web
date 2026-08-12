import { describe, expect, it } from 'vitest';
import { createActionExecutionPipeline } from '../js/core/ActionExecutionPipeline.js';
import { createTravelActionController } from '../js/core/TravelActionController.js';

function createHarness(options) {
  var config = options || {};
  var trace = [];
  var ship = { typeId: 'shuttle', route: config.route || null, routeRevision: 3 };
  var state = {
    currentSystem: 'sol_prime',
    currentGalaxy: 'milky_way',
    activeShipIndex: 0,
    cargo: {},
    cargoCost: {},
    shipHull: 80,
    maxHull: 100,
    reputation: 0,
  };
  var result = config.result || { ok: true, msgs: [{ text: 'arrived', type: 'info' }], meta: { crossGalaxy: true } };
  var smuggle = config.smuggle || { msgs: [], caught: false, evaded: false };
  var pipeline = createActionExecutionPipeline({
    emitMessage: function (message) { trace.push('result:' + message.text); },
    queueAchievementCheck: function () { trace.push('achievement:' + state.reputation); },
    render: function () { trace.push('render:' + state.reputation); },
    checkVictory: function () { trace.push('victory:' + state.reputation); },
  });
  var controller = createTravelActionController({
    getState: function () { trace.push('get-state'); return state; },
    systems: {
      Trade: {
        travelTo: function (nextState, systemId) {
          trace.push('travel');
          if (result.ok) {
            nextState.currentSystem = systemId;
            nextState.currentGalaxy = result.meta && result.meta.crossGalaxy ? 'andromeda' : 'milky_way';
          }
          return result;
        },
      },
      Economy: {
        checkSmugglingCargo: function () { trace.push('smuggle'); return smuggle; },
        recordSmugglingEvaded: function () { trace.push('smuggle-evaded'); },
      },
      Fleet: {
        syncStateFromShip: function () { trace.push('sync-state'); },
        applyTravelWear: function () { trace.push('wear'); return { msgs: [] }; },
        getActiveShip: function () { return ship; },
        getEffectiveShipStats: function () {
          return { autoRepair: 2, eventChanceMultiplier: 0.5 };
        },
        cancelActiveDispatch: function () { trace.push('cancel-dispatch'); },
        commitActiveShipState: function () { trace.push('commit-ship'); },
      },
      Faction: {
        getFactionForSystem: function () { return { id: 'federation' }; },
      },
      Quest: {
        checkProgress: function (nextState, payload) { trace.push('quest:' + payload.crossGalaxy); return { msgs: [] }; },
      },
      Tutorial: {
        checkTrigger: function () { trace.push('tutorial'); },
        isActive: function () { return config.tutorialActive === true; },
      },
      Progression: {
        gainExperience: function () { trace.push('experience'); return { msgs: [] }; },
        gainCompanyExperience: function () { trace.push('company-exp'); return { msgs: [] }; },
      },
    },
    pipeline: pipeline,
    hasPendingEvent: function () { return config.pendingEvent === true; },
    forcePendingEvent: function () { trace.push('force-event'); },
    isShipFlying: function () { return config.shipFlying === true; },
    emitMessage: function (message) { trace.push('side:' + message.text); },
    emitAudio: function () { trace.push('audio'); },
    flyShip: function (from, to) { trace.push('flight:' + from + '>' + to); },
    refreshGalaxy: function () { trace.push('refresh-galaxy'); },
    refreshMarketLocation: function () { trace.push('refresh-market'); },
    stopDispatchClock: function () { trace.push('stop-dispatch'); },
    queueQuestDialogueResult: function () { trace.push('quest-dialogue'); },
    scheduleRandomEvent: function (nextState, chance) { trace.push('random:' + chance); },
    captureState: function () { trace.push('capture'); },
    saveAutosave: function () { trace.push('save'); },
    eventBaseChance: 0.2,
  });
  return { controller: controller, trace: trace, state: state, ship: ship, result: result };
}

describe('TravelActionController', function () {
  it('成功航行完成全部后置效果与存档后才渲染/检查胜利', function () {
    var harness = createHarness();

    harness.controller.travel('nova_station');

    expect(harness.trace).toEqual([
      'get-state', 'sync-state', 'travel', 'audio', 'wear',
      'flight:sol_prime>nova_station', 'refresh-galaxy', 'refresh-market', 'smuggle',
      'tutorial', 'experience', 'company-exp', 'quest:true', 'quest-dialogue',
      'random:0.1', 'commit-ship', 'capture', 'save',
      'result:arrived', 'achievement:1', 'render:1', 'victory:1',
    ]);
    expect(harness.state.currentSystem).toBe('nova_station');
    expect(harness.state.visitedSystems).toContain('nova_station');
    expect(harness.state.visitedGalaxies).toContain('andromeda');
    expect(harness.state.shipHull).toBe(82);
  });

  it('待处理事件在 mutation 前阻止航行并强制打开事件', function () {
    var harness = createHarness({ pendingEvent: true });

    expect(harness.controller.travel('nova_station')).toBeNull();
    expect(harness.trace).toEqual([
      'get-state', 'sync-state', 'force-event', 'side:⚠️ 请先处理当前事件再继续航行。',
    ]);
  });

  it('飞行动画未结束时不再次执行 travel mutation', function () {
    var harness = createHarness({ shipFlying: true });

    expect(harness.controller.travel('nova_station')).toBeNull();
    expect(harness.trace).toEqual([
      'get-state', 'sync-state', 'side:🛰️ 飞船正在飞行中，请等待抵达后再发起下一次航行。',
    ]);
  });

  it('旅行失败不执行磨损、任务、存档或动画', function () {
    var harness = createHarness({ result: { ok: false, msgs: [{ text: 'blocked', type: 'error' }] } });

    harness.controller.travel('locked');

    expect(harness.trace).toEqual([
      'get-state', 'sync-state', 'travel', 'result:blocked', 'achievement:0', 'render:0',
    ]);
  });

  it('黑市路线被查获时取消派遣并停止 recurring clock', function () {
    var harness = createHarness({
      route: { marketMode: 'black' },
      smuggle: { msgs: [], caught: true, evaded: false },
    });

    harness.controller.travel('nova_station');

    expect(harness.trace).toContain('cancel-dispatch');
    expect(harness.trace).toContain('stop-dispatch');
    expect(harness.trace).toContain('side:⏹️ 黑市自动跑商因走私被查获而中止。');
  });

  it('教程期间不安排随机事件，但仍保存完整航行 state', function () {
    var harness = createHarness({ tutorialActive: true });

    harness.controller.travel('nova_station');

    expect(harness.trace.some(function (item) { return item.indexOf('random:') === 0; })).toBe(false);
    expect(harness.trace.indexOf('save')).toBeLessThan(harness.trace.indexOf('render:1'));
  });

  it('走私规避会记录统计', function () {
    var harness = createHarness({ smuggle: { msgs: [], caught: false, evaded: true } });

    harness.controller.travel('nova_station');

    expect(harness.trace).toContain('smuggle-evaded');
  });
});
