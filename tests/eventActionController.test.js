import { describe, expect, it } from 'vitest';
import { createActionExecutionPipeline } from '../js/core/ActionExecutionPipeline.js';
import { createEventActionController } from '../js/core/EventActionController.js';

function createHarness(options) {
  var config = options || {};
  var trace = [];
  var state = {
    maxCargo: 20,
    maxFuel: 100,
    maxHull: 100,
    fuelEfficiency: 1,
    cargo: { food: 5 },
    cargoCost: { food: 50 },
    credits: 100,
  };
  var runtime = config.runtime === null ? null : {
    resolveChoice: function (nextState, choiceIndex) {
      trace.push('resolve:' + choiceIndex);
      if (config.resolved === false) return { msgs: [], resolved: false };
      nextState.credits += 40;
      nextState.maxCargo += 5;
      return { msgs: [{ text: 'event done', type: 'info' }], resolved: true, eventId: 'event_1' };
    },
  };
  var previousSnapshot = null;
  var pipeline = createActionExecutionPipeline({
    emitMessage: function (message) { trace.push('message:' + message.text); },
    queueAchievementCheck: function () { trace.push('achievement:' + state.credits); },
    render: function () { trace.push('render:' + state.credits); },
    checkVictory: function () { trace.push('victory:' + state.credits); },
  });
  var controller = createEventActionController({
    getState: function () { trace.push('get-state'); return state; },
    systems: {
      Fleet: {
        commitActiveShipState: function (nextState, previous) {
          trace.push('commit-ship:' + nextState.maxCargo);
          previousSnapshot = previous;
        },
      },
    },
    pipeline: pipeline,
    getRuntime: function () { trace.push('get-runtime'); return runtime; },
    emitMessage: function (message) { trace.push('side-message:' + message.text); },
    refreshActionGuide: function () { trace.push('refresh-guide'); },
    captureState: function () { trace.push('capture'); },
    saveAutosave: function () { trace.push('save'); },
  });
  return {
    controller: controller,
    state: state,
    trace: trace,
    getPreviousSnapshot: function () { return previousSnapshot; },
  };
}

describe('EventActionController', function () {
  it('事件效果、舰船同步和存档完成后才发布消息并渲染', function () {
    var harness = createHarness();

    var result = harness.controller.resolveChoice(2);

    expect(result).toMatchObject({ ok: true, resolved: true, eventId: 'event_1' });
    expect(harness.trace).toEqual([
      'get-runtime', 'get-state', 'resolve:2', 'commit-ship:25', 'capture', 'save',
      'message:event done', 'achievement:140', 'render:140', 'victory:140',
    ]);
    expect(harness.getPreviousSnapshot()).toEqual({
      maxCargo: 20,
      maxFuel: 100,
      maxHull: 100,
      fuelEfficiency: 1,
      cargo: { food: 5 },
      cargoCost: { food: 50 },
    });
  });

  it('事件运行时未就绪时保留旧反馈并且不进入 pipeline', function () {
    var harness = createHarness({ runtime: null });

    expect(harness.controller.resolveChoice(0)).toBeNull();
    expect(harness.trace).toEqual([
      'get-runtime',
      'side-message:⚠️ 事件运行时尚未就绪，请重新打开事件。',
      'refresh-guide',
    ]);
  });

  it('未解析的无效选择只刷新投影，不提交舰船或存档', function () {
    var harness = createHarness({ resolved: false });

    expect(harness.controller.resolveChoice(99)).toMatchObject({ ok: null, resolved: false });
    expect(harness.trace).toEqual([
      'get-runtime', 'get-state', 'resolve:99', 'achievement:100', 'render:100',
    ]);
  });
});
