import { describe, expect, it, vi } from 'vitest';
import { createDialogueRuntimeController } from '../js/core/DialogueRuntimeController.js';

function createHarness(options) {
  var config = options || {};
  var state = config.state || { id: 'A', storyFlags: {}, storyDecisions: {} };
  var revision = 1;
  var pendingShows = [];
  var trace = [];
  var runtime = config.runtime || {
    Dialogue: {
      init: function (target) { trace.push(['init', target.id]); },
      getScenesForTrigger: function (target, triggerType, context) {
        trace.push(['resolve', target.id, triggerType, context]);
        return (config.scenesByTrigger && config.scenesByTrigger[triggerType]) || [];
      },
      finalizeScene: function (target, sceneId, result) {
        trace.push(['finalize', target.id, sceneId, result]);
        target.storyFlags[sceneId] = true;
      },
    },
    DialogueUI: {
      init: function () { trace.push(['ui.init']); },
      hideScene: function () { trace.push(['ui.hide']); },
      showScene: function (scene, done) {
        trace.push(['show', scene.id]);
        pendingShows.push({ scene: scene, done: done });
      },
    },
  };
  var loadRuntime = config.loadRuntime || vi.fn(function () { return Promise.resolve(runtime); });
  var telemetry = [];
  var failures = [];
  var completedQuestResults = [];
  var controller = createDialogueRuntimeController({
    getState: function () { return state; },
    getSessionToken: function () { return { state: state, revision: revision }; },
    isSessionTokenCurrent: function (token) {
      return !!token && token.state === state && token.revision === revision;
    },
    loadRuntime: loadRuntime,
    hooks: {
      setTelemetryState: function (value) { telemetry.push(value); },
      reportFailure: function (error) { failures.push(error); },
      onCompletedQuest: function (result) { completedQuestResults.push(result); trace.push(['quest.completed']); },
    },
  });
  return {
    controller: controller,
    runtime: runtime,
    trace: trace,
    pendingShows: pendingShows,
    telemetry: telemetry,
    failures: failures,
    completedQuestResults: completedQuestResults,
    loadRuntime: loadRuntime,
    replaceState: function (nextState) { state = nextState; revision += 1; controller.reset(nextState); },
    getState: function () { return state; },
  };
}

describe('DialogueRuntimeController', function () {
  it('并发触发只加载一次，并按顺序播放和提交场景', async function () {
    var harness = createHarness({
      scenesByTrigger: {
        quest_accept: [{ id: 'intro' }, { id: 'followup' }],
      },
    });
    var finished = vi.fn();

    var first = harness.controller.playTrigger('quest_accept', { questId: 'starter' }, finished);
    var second = harness.controller.load();
    await Promise.all([first, second]);

    expect(harness.loadRuntime).toHaveBeenCalledOnce();
    expect(harness.telemetry).toEqual(['loading', 'ready']);
    expect(harness.trace.filter(function (entry) { return entry[0] === 'show'; })).toEqual([['show', 'intro']]);
    expect(harness.controller.getDiagnostics().queuedSceneCount).toBe(1);

    harness.pendingShows.shift().done({ choiceId: 'route-a' });
    expect(harness.trace.filter(function (entry) { return entry[0] === 'show'; })).toEqual([
      ['show', 'intro'],
      ['show', 'followup'],
    ]);
    harness.pendingShows.shift().done({ skipped: false });

    expect(finished).toHaveBeenCalledOnce();
    expect(harness.getState().storyFlags).toEqual({ intro: true, followup: true });
    expect(harness.controller.getDiagnostics()).toMatchObject({
      state: 'ready',
      playing: false,
      queuedSceneCount: 0,
      completedSceneCount: 2,
    });
  });

  it('会话替换会丢弃加载中的旧请求，不执行旧完成回调', async function () {
    var resolveRuntime;
    var runtimePromise = new Promise(function (resolve) { resolveRuntime = resolve; });
    var harness = createHarness({ loadRuntime: vi.fn(function () { return runtimePromise; }) });
    var finished = vi.fn();

    var pending = harness.controller.playTrigger('quest_accept', {}, finished);
    await Promise.resolve();
    harness.replaceState({ id: 'B', storyFlags: {}, storyDecisions: {} });
    resolveRuntime(harness.runtime);
    await pending;

    expect(finished).not.toHaveBeenCalled();
    expect(harness.pendingShows).toHaveLength(0);
    expect(harness.trace).toContainEqual(['init', 'B']);
    expect(harness.controller.getDiagnostics().queuedSceneCount).toBe(0);
  });

  it('reset 使旧 UI 回调失效，且迟到回调不会打断新场景', async function () {
    var harness = createHarness({
      scenesByTrigger: {
        old: [{ id: 'old-scene' }],
        current: [{ id: 'new-scene' }],
      },
    });
    await harness.controller.playTrigger('old');
    var oldShow = harness.pendingShows.shift();

    harness.replaceState({ id: 'B', storyFlags: {}, storyDecisions: {} });
    await harness.controller.playTrigger('current');
    var newShow = harness.pendingShows.shift();
    oldShow.done({ choiceId: 'stale' });

    expect(harness.controller.getDiagnostics().playing).toBe(true);
    expect(harness.trace).not.toContainEqual(['finalize', 'B', 'old-scene', { choiceId: 'stale' }]);
    newShow.done({ choiceId: 'fresh' });
    expect(harness.getState().storyFlags).toEqual({ 'new-scene': true });
    expect(harness.controller.getDiagnostics().playing).toBe(false);
  });

  it('任务结果按完成→阶段顺序排队，最后触发任务后续钩子', async function () {
    var harness = createHarness({
      scenesByTrigger: {
        quest_complete: [{ id: 'quest-outro' }],
        phase_unlock: [{ id: 'phase-intro' }],
      },
    });
    var result = {
      completedQuests: [{ id: 'starter', failed: false, quest: { id: 'starter' } }],
      phaseAdvanced: true,
      newPhase: { id: 'phase-2' },
    };
    var finished = vi.fn(function () { harness.trace.push(['finished']); });

    await harness.controller.queueQuestResult(result, finished);
    harness.pendingShows.shift().done({});
    harness.pendingShows.shift().done({});

    expect(harness.trace.filter(function (entry) {
      return ['resolve', 'show', 'finalize', 'quest.completed', 'finished'].includes(entry[0]);
    }).map(function (entry) { return entry[0] + ':' + (entry[2] || entry[1] || ''); })).toEqual([
      'resolve:quest_complete',
      'resolve:phase_unlock',
      'show:quest-outro',
      'finalize:quest-outro',
      'show:phase-intro',
      'finalize:phase-intro',
      'quest.completed:',
      'finished:',
    ]);
    expect(harness.completedQuestResults).toEqual([result]);
  });

  it('加载失败可重试，dispose 会隐藏当前场景并拒绝后续加载', async function () {
    var attempt = 0;
    var runtime;
    var harness = createHarness({
      loadRuntime: vi.fn(function () {
        attempt += 1;
        if (attempt === 1) return Promise.reject(new Error('offline'));
        return runtime;
      }),
    });
    runtime = harness.runtime;

    expect(await harness.controller.load()).toBe(null);
    expect(harness.failures).toHaveLength(1);
    expect(await harness.controller.load()).toBe(runtime);
    expect(harness.loadRuntime).toHaveBeenCalledTimes(2);

    harness.controller.dispose();
    expect(harness.trace.at(-1)).toEqual(['ui.hide']);
    expect(harness.controller.getDiagnostics()).toMatchObject({ state: 'disposed', disposed: true });
    expect(await harness.controller.load()).toBe(null);
  });
});
