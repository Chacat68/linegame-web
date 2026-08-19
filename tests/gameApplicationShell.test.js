import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as GameApplication from '../js/core/GameApplication.js';
import * as GameManager from '../js/core/GameManager.js';
import {
  GAME_RUNTIME_NODE_IDS,
  createGameRuntimeNodeFactories,
} from '../js/core/GameRuntimeNodeFactories.js';

describe('GameApplication shell', function () {
  it('GameManager 仅转发历史公共入口，启动器直接依赖正式组合根', function () {
    var managerSource = readFileSync('js/core/GameManager.js', 'utf8');
    var mainSource = readFileSync('js/main.js', 'utf8');

    expect(managerSource.split('\n').length).toBeLessThanOrEqual(24);
    expect(managerSource).toContain("from './GameApplication.js'");
    expect(managerSource).not.toContain('createGameActionRuntime');
    expect(managerSource).not.toContain('createGameUiApplicationRuntime');
    expect(managerSource).not.toContain('document.');
    expect(mainSource).toContain("from './core/GameApplication.js'");
  });

  it('兼容门面与正式组合根暴露同一组函数', function () {
    [
      'init',
      'shutdown',
      '_setStateForTest',
      '_handleActionGuideActionForTest',
      '_handleTradeConfirmForTest',
      '_handleAssignRouteForTest',
      '_stopActiveDispatchForTest',
      '_getGameClockSnapshotForTest',
      '_getUiDiagnosticsForTest',
    ].forEach(function (name) {
      expect(GameManager[name]).toBe(GameApplication[name]);
    });
  });

  it('组合根用单一受限 Runtime Graph 持有并统一释放运行时引用', function () {
    var source = readFileSync('js/core/GameApplication.js', 'utf8');
    var factories = readFileSync('js/core/GameRuntimeNodeFactories.js', 'utf8');

    expect(source).toContain("from './GameRuntimeGraph.js'");
    expect(source).toContain("from './GameRuntimeNodeFactories.js'");
    expect(source).toContain('const _runtimeGraph = createGameRuntimeGraph(GAME_RUNTIME_NODE_IDS);');
    expect(source).toContain('_runtimeGraph.resolve(id, factory)');
    expect(source).toContain("_runtimeGraph.peek('gameLoop')");
    expect(source).toContain('_runtimeGraph.clear();');
    expect(source.split('\n').length).toBeLessThanOrEqual(260);
    expect(source).not.toContain('createGameActionRuntime({');
    expect(source).not.toContain('createGameUiApplicationRuntime({');
    expect(source).not.toContain('document.');
    expect(factories.split('\n').length).toBeLessThanOrEqual(600);
    expect(factories).toContain('createGameActionRuntime({');
    expect(factories).toContain('createGameUiApplicationRuntime({');
    expect(source).not.toMatch(/let _(?:featureRuntime|uiRuntime|systemRuntime|gameLoopRuntime|actionRuntime)\s*=/);
  });

  it('节点工厂清单与 Runtime Graph 契约一一对应且不可变', function () {
    var noop = function () {};
    var factories = createGameRuntimeNodeFactories({
      resolve: noop,
      getState: noop,
      getSettings: noop,
      getRevision: noop,
      getSessionToken: noop,
      isSessionTokenCurrent: noop,
      replaceState: noop,
      resetSessionTransients: noop,
      updateUI: noop,
      startFreshSession: noop,
      emitLog: noop,
      emitAudio: noop,
      reportDeferredUiFailure: noop,
      events: {},
    });

    expect(Object.keys(factories).sort()).toEqual(GAME_RUNTIME_NODE_IDS.slice().sort());
    expect(Object.isFrozen(factories)).toBe(true);
    GAME_RUNTIME_NODE_IDS.forEach(function (id) {
      expect(factories[id]).toEqual(expect.any(Function));
    });
  });
});
