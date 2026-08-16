import { describe, expect, it } from 'vitest';
import { createActionExecutionPipeline } from '../js/core/ActionExecutionPipeline.js';
import { createGameDayController } from '../js/core/GameDayController.js';

function createHarness(options) {
  var config = options || {};
  var trace = [];
  var state = {
    id: 'current',
    day: 4,
    shipHull: config.nextHull == null ? 90 : config.nextHull,
    daysWithoutDamage: 3,
  };
  var token = { state: state, revision: 8 };
  var result = config.result || {
    ok: true,
    msgs: [{ text: 'advanced', type: 'info' }],
    questResults: [{ completedQuests: [{ id: 'quest_1' }] }],
    meta: { days: 2 },
  };
  var pipeline = createActionExecutionPipeline({
    emitMessage: function (message) { trace.push('result-message:' + message.text); },
    emitErrorCue: function () { trace.push('error-cue'); },
    queueAchievementCheck: function () { trace.push('achievement:' + state.daysWithoutDamage); },
    render: function () { trace.push('render:' + state.daysWithoutDamage); },
    checkVictory: function () { trace.push('victory:' + state.daysWithoutDamage); },
  });
  var controller = createGameDayController({
    getState: function () { trace.push('get-state'); return state; },
    getSessionToken: function () { trace.push('get-token'); return token; },
    systems: {
      Fleet: {
        syncStateFromShip: function () { trace.push('sync-ship'); },
      },
    },
    runtime: {
      advanceDays: function (nextState, days, runtimeOptions) {
        trace.push('advance:' + days + ':' + runtimeOptions.reason + ':' + runtimeOptions.sessionToken.revision);
        nextState.day += days;
        return result;
      },
    },
    pipeline: pipeline,
    queueQuestDialogueResult: function () { trace.push('quest-dialogue'); },
    captureState: function (nextState, captureOptions) {
      trace.push('capture:' + captureOptions.reason + ':' + captureOptions.sessionToken.revision + ':' + nextState.day);
    },
    saveAutosave: function (nextState, saveOptions) {
      trace.push('save:' + saveOptions.reason + ':' + saveOptions.sessionToken.revision + ':' + nextState.day);
    },
  });
  return { controller: controller, state: state, token: token, trace: trace, result: result };
}

describe('GameDayController', function () {
  it('领域推进、教学/任务、无伤统计和存档完成后才发布结果并渲染', function () {
    var harness = createHarness();
    var clock = { lastHullSnapshot: 90 };

    var result = harness.controller.advance(2.9, { state: harness.state, clock: clock });

    expect(result).toBe(harness.result);
    expect(harness.state.day).toBe(6);
    expect(harness.state.daysWithoutDamage).toBe(5);
    expect(clock.lastHullSnapshot).toBe(90);
    expect(harness.trace).toEqual([
      'get-state', 'get-token', 'advance:2:realtime-clock:8',
      'sync-ship',
      'quest-dialogue', 'capture:realtime-day:8:6', 'save:realtime-day:8:6',
      'result-message:advanced', 'achievement:5', 'render:5', 'victory:5',
    ]);
  });

  it('最终船体低于 clock 快照时重置无伤天数', function () {
    var harness = createHarness({ nextHull: 70, completedChains: [] });
    var clock = { lastHullSnapshot: 90 };

    harness.controller.advance(1, { state: harness.state, clock: clock });

    expect(harness.state.daysWithoutDamage).toBe(0);
    expect(clock.lastHullSnapshot).toBe(70);
    expect(harness.trace).toContain('achievement:0');
  });

  it('旧 session 的 clock context 不会推进当前 state', function () {
    var harness = createHarness();

    expect(harness.controller.advance(1, {
      state: { id: 'stale' },
      clock: { lastHullSnapshot: 100 },
    })).toBeNull();

    expect(harness.trace).toEqual(['get-state']);
    expect(harness.state.day).toBe(4);
  });

  it('零天输入为无副作用 no-op', function () {
    var harness = createHarness();

    expect(harness.controller.advance(0)).toBeNull();
    expect(harness.trace).toEqual([]);
  });

  it('领域推进失败时不提交教学、存档或胜利', function () {
    var harness = createHarness({
      result: { ok: false, msgs: [{ text: 'failed', type: 'error' }], questResults: [] },
    });

    harness.controller.advance(1, { state: harness.state, clock: { lastHullSnapshot: 90 } });

    expect(harness.trace).toEqual([
      'get-state', 'get-token', 'advance:1:realtime-clock:8',
      'result-message:failed', 'error-cue', 'achievement:3', 'render:3',
    ]);
  });
});
