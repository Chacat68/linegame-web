import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as GameApplication from '../js/core/GameApplication.js';
import * as GameManager from '../js/core/GameManager.js';

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

    expect(source).toContain("from './GameRuntimeGraph.js'");
    expect(source).toContain('const _runtimeGraph = createGameRuntimeGraph(RUNTIME_NODE_IDS);');
    expect(source).toContain("_runtimeGraph.resolve('features'");
    expect(source).toContain("_runtimeGraph.peek('gameLoop')");
    expect(source).toContain('_runtimeGraph.clear();');
    expect(source).not.toMatch(/let _(?:featureRuntime|uiRuntime|systemRuntime|gameLoopRuntime|actionRuntime)\s*=/);
  });
});
