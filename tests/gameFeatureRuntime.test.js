import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGameFeatureRuntime } from '../js/core/GameFeatureRuntime.js';

describe('GameFeatureRuntime', function () {
  it('注册 manifest，并在每次同步时读取最新会话上下文', async function () {
    var currentState = { id: 'state-a' };
    var contexts = [];
    var module = { id: 'feature-module' };
    var runtime = createGameFeatureRuntime({
      getContext: function () { return { state: currentState }; },
      manifest: {
        sample: {
          load: function () { return Promise.resolve(module); },
          sync: function (loaded, lifecycle) {
            contexts.push([loaded.id, lifecycle.context.state.id]);
          },
        },
      },
    });

    await expect(runtime.load('sample')).resolves.toBe(module);
    currentState = { id: 'state-b' };
    runtime.syncAll();

    expect(contexts).toEqual([
      ['feature-module', 'state-a'],
      ['feature-module', 'state-b'],
    ]);
    expect(runtime.get('sample')).toBe(module);
    expect(runtime.getState('sample')).toBe('ready');
  });

  it('复用并发加载，并透传调用请求', async function () {
    var resolveLoad;
    var load = vi.fn(function (lifecycle) {
      return new Promise(function (resolve) {
        resolveLoad = function () { resolve({ request: lifecycle.request }); };
      });
    });
    var runtime = createGameFeatureRuntime({
      getContext: function () { return { state: {} }; },
      manifest: { sample: { load: load } },
    });

    var first = runtime.load('sample', { source: 'first' });
    var second = runtime.load('sample', { source: 'second' });
    await Promise.resolve();
    resolveLoad();

    await expect(first).resolves.toEqual({ request: { source: 'first' } });
    await expect(second).resolves.toEqual({ request: { source: 'first' } });
    expect(load).toHaveBeenCalledOnce();
    expect(runtime.getDiagnostics().sample.loadCount).toBe(1);
  });

  it('loadOrReject 将注册表失败恢复成可诊断的 rejection', async function () {
    var failure = new Error('feature failed');
    var runtime = createGameFeatureRuntime({
      getContext: function () { return {}; },
      manifest: {
        broken: {
          load: function () { throw failure; },
        },
      },
    });

    await expect(runtime.loadOrReject('broken')).rejects.toBe(failure);
    expect(runtime.getError('broken')).toBe(failure);
    expect(runtime.getState('broken')).toBe('error');
  });

  it('loadOrReject 为不存在的功能提供稳定错误', async function () {
    var runtime = createGameFeatureRuntime({
      getContext: function () { return {}; },
      manifest: {},
    });

    await expect(runtime.loadOrReject('missing')).rejects.toThrow(
      'Deferred feature unavailable: missing',
    );
  });

  it('GameApplication 只组合已配置运行时，不再拥有注册与配置标志', function () {
    var gameManager = readFileSync('js/core/GameApplication.js', 'utf8');
    var runtime = readFileSync('js/core/GameFeatureRuntime.js', 'utf8');

    expect(gameManager).toContain("from './GameFeatureRuntime.js'");
    expect(gameManager).toContain('createGameFeatureRuntime({');
    expect(gameManager).not.toContain('createFeatureRegistry({');
    expect(gameManager).not.toContain('createGameFeatureManifest({');
    expect(gameManager).not.toContain('_deferredFeaturesConfigured');
    expect(gameManager).not.toContain('_configureDeferredFeatures');
    expect(runtime).toContain('createFeatureRegistry');
    expect(runtime).toContain('createGameFeatureManifest');
    expect(runtime).toContain('registry.registerManifest(manifest)');
  });
});
