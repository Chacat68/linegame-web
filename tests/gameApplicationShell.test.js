import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as GameApplication from '../js/core/GameApplication.js';
import * as GameManager from '../js/core/GameManager.js';
import { createGameApplicationTestHarness } from '../js/testing/GameApplicationTestHarness.js';
import {
  GAME_RUNTIME_NODE_IDS,
  createGameRuntimeNodeFactories,
} from '../js/core/GameRuntimeNodeFactories.js';
import { createGameSessionRuntimeFactories } from '../js/core/GameSessionRuntimeFactories.js';
import { createGameFeatureRuntimeFactories } from '../js/core/GameFeatureRuntimeFactories.js';
import { createGameActionRuntimeFactory } from '../js/core/GameActionRuntimeFactory.js';
import { createGameGuidanceRuntimeFactory } from '../js/core/GameGuidanceRuntimeFactory.js';
import { createGameUiRuntimeFactory } from '../js/core/GameUiRuntimeFactory.js';
import {
  RUNTIME_FACTORY_SOURCE_FILES,
  readRuntimeFactoryComposition,
} from './runtimeCompositionSource.js';

function createNoopFactoryContext() {
  var noop = function () {};
  return {
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
  };
}

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

  it('兼容门面与正式组合根只暴露应用生命周期', function () {
    expect(Object.keys(GameApplication).sort()).toEqual(['init', 'shutdown']);
    expect(Object.keys(GameManager).sort()).toEqual(['init', 'shutdown']);
    ['init', 'shutdown'].forEach(function (name) {
      expect(GameManager[name]).toBe(GameApplication[name]);
    });
  });

  it('应用级集成命令只由测试模式的冻结 harness 暴露', function () {
    var harness = createGameApplicationTestHarness();
    var applicationSource = readFileSync('js/core/GameApplication.js', 'utf8');
    var managerSource = readFileSync('js/core/GameManager.js', 'utf8');

    expect(Object.isFrozen(harness)).toBe(true);
    expect(Object.keys(harness).sort()).toEqual([
      'assignRoute',
      'confirmTrade',
      'executeGuidanceCommand',
      'getClockSnapshot',
      'getUiDiagnostics',
      'replaceState',
      'stopActiveDispatch',
    ]);
    expect(applicationSource).toContain("import.meta.env.MODE === 'test'");
    expect(applicationSource).not.toMatch(/export function _.*ForTest/);
    expect(managerSource).not.toContain('ForTest');
  });

  it('组合根用单一受限 Runtime Graph 持有并统一释放运行时引用', function () {
    var source = readFileSync('js/core/GameApplication.js', 'utf8');
    var factories = readFileSync('js/core/GameRuntimeNodeFactories.js', 'utf8');
    var factoryComposition = readRuntimeFactoryComposition();
    var startup = readFileSync('js/core/GameStartupProjection.js', 'utf8');

    expect(source).toContain("from './GameRuntimeGraph.js'");
    expect(source).toContain("from './GameRuntimeNodeFactories.js'");
    expect(source).toContain("from './GameStartupProjection.js'");
    expect(source).toContain('const _runtimeGraph = createGameRuntimeGraph(GAME_RUNTIME_NODE_IDS);');
    expect(source).toContain('_runtimeGraph.resolve(id, factory)');
    expect(source).toContain("_runtimeGraph.peek('gameLoop')");
    expect(source).toContain('_runtimeGraph.clear();');
    expect(source.split('\n').length).toBeLessThanOrEqual(230);
    expect(source).not.toContain('createGameActionRuntime({');
    expect(source).not.toContain('createGameUiApplicationRuntime({');
    expect(source).not.toContain('document.');
    expect(source).not.toContain("from './SettingsCore.js'");
    expect(source).not.toContain("from './AudioManager.js'");
    expect(source).not.toContain("from '../ui/StarmapRenderer.js'");
    expect(source).toContain('_startupProjection.prepareSession(difficulty, options)');
    expect(source).toContain('_startupProjection.initializeScene();');
    expect(source).toContain('_startupProjection.release();');
    expect(factories.split('\n').length).toBeLessThanOrEqual(130);
    expect(factories).not.toContain('createGameActionRuntime({');
    expect(factories).not.toContain('createGameUiApplicationRuntime({');
    expect(factoryComposition).toContain('createGameActionRuntime({');
    expect(factoryComposition).toContain('createGameUiApplicationRuntime({');
    RUNTIME_FACTORY_SOURCE_FILES.slice(1).forEach(function (file) {
      var clusterSource = readFileSync(file, 'utf8');
      expect(clusterSource.split('\n').length).toBeLessThanOrEqual(220);
      expect((clusterSource.match(/^import /gm) || []).length).toBeLessThanOrEqual(22);
    });
    expect(source).not.toMatch(/let _(?:featureRuntime|uiRuntime|systemRuntime|gameLoopRuntime|actionRuntime)\s*=/);
    expect(startup).toContain("import * as Settings from './SettingsCore.js'");
    expect(startup).toContain("import * as Audio from './AudioManager.js'");
    expect(startup).toContain("import * as Renderer from '../ui/StarmapRenderer.js'");
    expect(startup).toContain("_requireFunction(settingsPort, 'loadSettings'");
    expect(startup).toContain("_requireFunction(audioPort, 'init'");
    expect(startup).toContain("_requireFunction(rendererPort, 'init'");
  });

  it('节点工厂清单与 Runtime Graph 契约一一对应且不可变', function () {
    var factories = createGameRuntimeNodeFactories(createNoopFactoryContext());

    expect(Object.keys(factories).sort()).toEqual(GAME_RUNTIME_NODE_IDS.slice().sort());
    expect(Object.isFrozen(factories)).toBe(true);
    GAME_RUNTIME_NODE_IDS.forEach(function (id) {
      expect(factories[id]).toEqual(expect.any(Function));
    });
  });

  it('五个职责工厂簇对每个节点保持唯一归属', function () {
    var context = createNoopFactoryContext();
    var clusters = {
      feature: createGameFeatureRuntimeFactories(context),
      ui: createGameUiRuntimeFactory(context),
      session: createGameSessionRuntimeFactories(context),
      action: createGameActionRuntimeFactory(context),
      guidance: createGameGuidanceRuntimeFactory(context),
    };
    var ownership = {};

    Object.keys(clusters).forEach(function (clusterId) {
      Object.keys(clusters[clusterId]).forEach(function (nodeId) {
        if (!ownership[nodeId]) ownership[nodeId] = [];
        ownership[nodeId].push(clusterId);
      });
    });

    expect(Object.keys(ownership).sort()).toEqual(GAME_RUNTIME_NODE_IDS.slice().sort());
    GAME_RUNTIME_NODE_IDS.forEach(function (nodeId) {
      expect(ownership[nodeId]).toHaveLength(1);
    });
    expect(Object.keys(clusters.feature).sort()).toEqual([
      'achievement', 'dialogue', 'features', 'randomEvent', 'victory',
    ]);
    expect(Object.keys(clusters.session).sort()).toEqual([
      'gameLoop', 'persistence', 'sessionLifecycle', 'systems',
    ]);
    expect(Object.keys(clusters.action)).toEqual(['actions']);
    expect(Object.keys(clusters.guidance)).toEqual(['guidance']);
    expect(Object.keys(clusters.ui)).toEqual(['ui']);
  });
});
