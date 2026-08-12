import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFeatureRegistry, loadDeferredStylesheet } from '../js/core/FeatureRegistry.js';

var originalDocument = globalThis.document;

afterEach(function () {
  globalThis.document = originalDocument;
  vi.restoreAllMocks();
});

describe('FeatureRegistry', function () {
  it('按 manifest 依赖拓扑合并并发加载，并在提交时同步最新 session context', async function () {
    globalThis.document = { body: { dataset: {} } };
    var currentContext = { state: { id: 'A' }, revision: 1 };
    var resolveWorkspace;
    var workspacePromise = new Promise(function (resolve) { resolveWorkspace = resolve; });
    var trace = [];
    var registry = createFeatureRegistry({ getContext: function () { return currentContext; } });
    registry.registerManifest({
      runtime: {
        load: function () { trace.push('load:runtime'); return { id: 'runtime' }; },
        sync: function (module, lifecycle) { trace.push('sync:' + module.id + ':' + lifecycle.context.state.id); },
      },
      workspace: {
        dependencies: ['runtime'],
        load: function (lifecycle) {
          trace.push('load:workspace:' + lifecycle.dependencies.runtime.id);
          return workspacePromise;
        },
        initialize: function (module, lifecycle) {
          trace.push('init:' + module.id + ':' + lifecycle.context.state.id);
        },
        sync: function (module, lifecycle) {
          trace.push('sync:' + module.id + ':' + lifecycle.context.state.id);
        },
      },
    });

    var first = registry.load('workspace');
    var second = registry.load('workspace');
    expect(first).toBe(second);
    await Promise.resolve();
    currentContext = { state: { id: 'B' }, revision: 2 };
    resolveWorkspace({ id: 'workspace' });
    await expect(first).resolves.toEqual({ id: 'workspace' });

    expect(trace).toEqual([
      'load:runtime', 'sync:runtime:B', 'load:workspace:runtime',
      'init:workspace:B', 'sync:workspace:B',
    ]);
    expect(registry.getState('workspace')).toBe('ready');
    expect(document.body.dataset.workspaceUiState).toBe('ready');
    expect(registry.getDiagnostics().workspace).toMatchObject({ loadCount: 1, syncCount: 1 });
  });

  it('失败后保留错误遥测并允许显式重试', async function () {
    globalThis.document = { body: { dataset: {} } };
    var attempts = 0;
    var observedErrors = [];
    var registry = createFeatureRegistry();
    registry.registerManifest({
      archive: {
        load: function () {
          attempts += 1;
          if (attempts === 1) throw new Error('temporary');
          return { ready: true };
        },
        onError: function (error) { observedErrors.push(error.message); },
      },
    });

    await expect(registry.load('archive')).resolves.toBe(null);
    expect(registry.getState('archive')).toBe('error');
    expect(document.body.dataset.archiveUiState).toBe('error');
    expect(observedErrors).toEqual(['temporary']);
    await expect(registry.load('archive')).resolves.toEqual({ ready: true });
    expect(registry.getState('archive')).toBe('ready');
    expect(attempts).toBe(2);
  });

  it('初始化失败不会留下伪就绪模块', async function () {
    globalThis.document = { body: { dataset: {} } };
    var initializeAttempts = 0;
    var registry = createFeatureRegistry();
    registry.define('fleet', {
      load: function () { return { ready: true }; },
      initialize: function () {
        initializeAttempts += 1;
        if (initializeAttempts === 1) throw new Error('init failed');
      },
    });

    await expect(registry.load('fleet')).resolves.toBe(null);
    expect(registry.get('fleet')).toBe(null);
    expect(registry.getState('fleet')).toBe('error');
    await expect(registry.load('fleet')).resolves.toEqual({ ready: true });
    expect(registry.getState('fleet')).toBe('ready');
  });

  it('syncAll 按依赖拓扑读取最新 context，disposeAll 逆序释放', async function () {
    var context = { state: { id: 'A' } };
    var trace = [];
    var registry = createFeatureRegistry({ getContext: function () { return context; } });
    registry.registerManifest({
      base: {
        load: function () { return { id: 'base' }; },
        sync: function (module, lifecycle) { trace.push('sync:' + module.id + ':' + lifecycle.context.state.id); },
        dispose: function (module) { trace.push('dispose:' + module.id); },
      },
      child: {
        dependencies: ['base'],
        load: function () { return { id: 'child' }; },
        sync: function (module, lifecycle) { trace.push('sync:' + module.id + ':' + lifecycle.context.state.id); },
        dispose: function (module) { trace.push('dispose:' + module.id); },
      },
    });
    await registry.load('child');
    trace.length = 0;
    context = { state: { id: 'B' } };
    registry.syncAll();
    registry.disposeAll();

    expect(trace).toEqual(['sync:base:B', 'sync:child:B', 'dispose:child', 'dispose:base']);
    expect(registry.getState('base')).toBe('idle');
    expect(registry.getState('child')).toBe('idle');
  });

  it('dispose 会作废迟到加载并允许同一 feature 重新加载', async function () {
    var resolveFirst;
    var attempt = 0;
    var disposedModules = [];
    var registry = createFeatureRegistry();
    registry.define('settings', {
      load: function () {
        attempt += 1;
        if (attempt === 1) {
          return new Promise(function (resolve) { resolveFirst = resolve; });
        }
        return { id: 'current' };
      },
      dispose: function (module) { disposedModules.push(module.id); },
    });

    var staleLoad = registry.load('settings');
    await Promise.resolve();
    expect(registry.getState('settings')).toBe('loading');
    expect(registry.dispose('settings')).toBe(true);
    resolveFirst({ id: 'stale' });
    await expect(staleLoad).resolves.toBe(null);
    expect(disposedModules).toEqual(['stale']);
    expect(registry.getState('settings')).toBe('idle');

    await expect(registry.load('settings')).resolves.toEqual({ id: 'current' });
    expect(attempt).toBe(2);
    expect(registry.getState('settings')).toBe('ready');
  });

  it('注册时拒绝未知依赖和依赖环', function () {
    var registry = createFeatureRegistry();
    expect(function () {
      registry.registerManifest({ child: { dependencies: ['missing'], load: function () {} } });
    }).toThrow(/Unknown dependency/);

    var cyclic = createFeatureRegistry();
    expect(function () {
      cyclic.registerManifest({
        left: { dependencies: ['right'], load: function () {} },
        right: { dependencies: ['left'], load: function () {} },
      });
    }).toThrow(/dependency cycle/);
  });

  it('样式加载优先插入在应用样式之前并标记就绪', async function () {
    var inserted = null;
    var listeners = {};
    var link = {
      dataset: {},
      addEventListener: function (type, listener) { listeners[type] = listener; },
    };
    var appStyles = { id: 'app-styles' };
    globalThis.document = {
      body: { dataset: {} },
      querySelector: function () { return null; },
      createElement: function () { return link; },
      getElementById: function (id) { return id === 'app-styles' ? appStyles : null; },
      head: {
        appendChild: function () {},
        insertBefore: function (node, before) {
          inserted = { node: node, before: before };
          Promise.resolve().then(function () { listeners.load(); });
        },
      },
    };

    await expect(loadDeferredStylesheet('fleet', '/fleet.css')).resolves.toBe('/fleet.css');
    expect(inserted).toEqual({ node: link, before: appStyles });
    expect(link.dataset.deferredUiStyle).toBe('fleet');
    expect(link.dataset.loaded).toBe('true');
  });
});
