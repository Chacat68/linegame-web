import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGameActionRuntime } from '../js/core/GameActionRuntime.js';
import { readApplicationComposition } from './runtimeCompositionSource.js';

function createHarness() {
  var state = { id: 'A' };
  var trace = [];
  var questResult = {
    ok: true,
    msgs: [{ text: '任务推进', type: 'success' }],
    completedQuests: [],
  };
  var runtime = createGameActionRuntime({
    getState: function () { return state; },
    getSessionToken: function () { return { state: state, revision: 1 }; },
    systems: {
      Quest: {
        checkProgress: function (targetState, context) {
          trace.push(['quest', targetState.id, context]);
          return questResult;
        },
      },
      Dispatch: {
        runActiveDispatchTick: function () { return { action: 'noop', msgs: [] }; },
      },
    },
    ports: {
      ui: {
        invalidate: function (regions) { trace.push(['invalidate', regions]); },
        showCompletion: function (completion) { trace.push(['completion', completion]); },
      },
      teaching: {
        checkCompletion: function () { trace.push('teaching'); },
      },
      story: {
        queueQuestResult: function (result) { trace.push(['story', result]); },
      },
      features: {
        get: function () { return null; },
        load: vi.fn(),
      },
      persistence: {
        captureState: vi.fn(),
        saveAutosave: vi.fn(),
      },
      events: {
        emitMessage: function (message) { trace.push(['message', message]); },
        emitAudio: function (cue) { trace.push(['audio', cue]); },
      },
      achievements: {
        queueCheck: function () { trace.push('achievement'); },
      },
      victory: {
        check: function () { trace.push('victory'); },
      },
      runtime: {
        advanceDays: function () { return { ok: true, msgs: [], questResults: [] }; },
      },
    },
  });

  return {
    questResult: questResult,
    runtime: runtime,
    setState: function (nextState) { state = nextState; },
    trace: trace,
  };
}

describe('GameActionRuntime', function () {
  it('一次构造完整动作图并公开稳定领域端口', function () {
    var harness = createHarness();

    expect(harness.runtime).toEqual(expect.objectContaining({
      archive: expect.objectContaining({ onAcceptQuest: expect.any(Function) }),
      commerce: expect.objectContaining({ onBuildTradeStation: expect.any(Function) }),
      day: expect.objectContaining({ advance: expect.any(Function) }),
      dispatch: expect.objectContaining({ tick: expect.any(Function) }),
      event: expect.objectContaining({ resolveChoice: expect.any(Function) }),
      exploration: expect.objectContaining({ explorePoi: expect.any(Function) }),
      fleet: expect.objectContaining({ onAssignRoute: expect.any(Function) }),
      pipeline: expect.objectContaining({ execute: expect.any(Function) }),
      trade: expect.objectContaining({ confirm: expect.any(Function) }),
      travel: expect.objectContaining({ travel: expect.any(Function) }),
    }));
    expect(Object.isFrozen(harness.runtime)).toBe(true);
  });

  it('兼容结果发布保持教学 → 消息 → 成就 → 增量刷新 → 胜利顺序', function () {
    var harness = createHarness();
    var result = {
      ok: true,
      msgs: [{ text: '操作完成', type: 'success' }],
    };

    expect(harness.runtime.presentResult(result, ['hud', 'guide'])).toBe(result);
    expect(harness.trace).toEqual([
      'teaching',
      ['message', { text: '操作完成', type: 'success' }],
      'achievement',
      ['invalidate', ['hud', 'guide']],
      'victory',
    ]);
  });

  it('失败结果发布错误提示音，但不推进教学或胜利', function () {
    var harness = createHarness();

    harness.runtime.presentResult({
      ok: false,
      msgs: [{ text: '操作失败', type: 'error' }],
    }, ['guide']);

    expect(harness.trace).toEqual([
      ['message', { text: '操作失败', type: 'error' }],
      ['audio', 'error'],
      'achievement',
      ['invalidate', ['guide']],
    ]);
  });

  it('任务进度每次读取最新 state，并在剧情队列前发布领域消息', function () {
    var harness = createHarness();
    harness.setState({ id: 'B' });

    expect(harness.runtime.recordQuestProgress({ action: 'buy_ship' })).toBe(harness.questResult);
    expect(harness.trace).toEqual([
      ['quest', 'B', { action: 'buy_ship' }],
      ['message', { text: '任务推进', type: 'success' }],
      ['story', harness.questResult],
    ]);
  });

  it('GameApplication 只持有单一动作运行时，不再逐项 import 或缓存控制器', function () {
    var gameApplication = readFileSync('js/core/GameApplication.js', 'utf8');
    var gameManager = readApplicationComposition();
    var actionRuntime = readFileSync('js/core/GameActionRuntime.js', 'utf8');
    var factories = [
      'FleetActionController',
      'CommerceOperationsController',
      'ArchiveActionController',
      'ActionExecutionPipeline',
      'TradeActionController',
      'TravelActionController',
      'ExplorationOperationsController',
      'EventActionController',
      'DispatchActionController',
      'GameDayController',
    ];

    expect(gameManager).toContain("from './GameActionRuntime.js'");
    expect(gameApplication).toContain("from './GameRuntimeNodeFactories.js'");
    expect(gameApplication).toContain("_resolveRuntime('actions')");
    expect(gameManager).not.toContain('let _actionRuntime = null;');
    expect(gameManager).not.toMatch(/let _(?:fleet|commerce|archive|trade|travel|exploration|event|dispatch|gameDay)Actions\s*=/);
    factories.forEach(function (factory) {
      expect(gameManager).not.toContain("from './" + factory + ".js'");
      expect(actionRuntime).toContain("from './" + factory + ".js'");
    });
  });
});
