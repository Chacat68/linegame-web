import { describe, expect, it, vi } from 'vitest';
import { createGameRuntimeGraph } from '../js/core/GameRuntimeGraph.js';

describe('GameRuntimeGraph', function () {
  it('惰性创建节点并复用同一实例', function () {
    var create = vi.fn(function () { return { id: 'features' }; });
    var graph = createGameRuntimeGraph(['features']);

    expect(graph.peek('features')).toBeNull();
    var first = graph.resolve('features', create);
    var second = graph.resolve('features', create);

    expect(second).toBe(first);
    expect(create).toHaveBeenCalledOnce();
    expect(graph.getDiagnostics().nodes.features).toMatchObject({
      state: 'ready',
      attemptCount: 1,
      createCount: 1,
    });
  });

  it('构造失败后保留诊断并允许用同一节点重试', function () {
    var graph = createGameRuntimeGraph(['ui']);
    var failure = new Error('ui failed');

    expect(function () {
      graph.resolve('ui', function () { throw failure; });
    }).toThrow(failure);
    expect(graph.peek('ui')).toBeNull();
    expect(graph.getDiagnostics().nodes.ui).toMatchObject({ state: 'error', error: failure });

    var runtime = graph.resolve('ui', function () { return { ready: true }; });
    expect(runtime).toEqual({ ready: true });
    expect(graph.getDiagnostics().nodes.ui).toMatchObject({
      state: 'ready',
      attemptCount: 2,
      createCount: 1,
      error: null,
    });
  });

  it('拒绝同步循环依赖并给出完整依赖链', function () {
    var graph = createGameRuntimeGraph(['actions', 'persistence']);

    expect(function () {
      graph.resolve('actions', function () {
        return graph.resolve('persistence', function () {
          return graph.resolve('actions', function () { return {}; });
        });
      });
    }).toThrow('Circular Runtime Graph dependency: actions -> persistence -> actions');
    expect(graph.getDiagnostics().nodes.actions.state).toBe('error');
    expect(graph.getDiagnostics().nodes.persistence.state).toBe('error');
  });

  it('统一清空已创建节点并开始新的 graph generation', function () {
    var graph = createGameRuntimeGraph(['features', 'ui', 'loop']);
    graph.resolve('features', function () { return { id: 'features' }; });
    graph.resolve('loop', function () { return { id: 'loop' }; });

    expect(graph.clear()).toEqual(['features', 'loop']);
    expect(graph.peek('features')).toBeNull();
    expect(graph.peek('loop')).toBeNull();
    expect(graph.getDiagnostics()).toMatchObject({
      generation: 2,
      nodes: {
        features: { state: 'idle', createCount: 1 },
        ui: { state: 'idle', createCount: 0 },
        loop: { state: 'idle', createCount: 1 },
      },
    });
  });

  it('拒绝未知节点、重复 id 和异步工厂', function () {
    expect(function () { createGameRuntimeGraph(['ui', 'ui']); }).toThrow('Duplicate');
    var graph = createGameRuntimeGraph(['ui']);
    expect(function () { graph.peek('missing'); }).toThrow('Unknown Runtime Graph node');
    expect(function () {
      graph.resolve('ui', function () { return Promise.resolve({}); });
    }).toThrow('must return a synchronous instance');
  });
});
