import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeferredFeatureLoader, loadDeferredStylesheet } from '../js/core/DeferredFeatureLoader.js';

var originalDocument = globalThis.document;

afterEach(function () {
  globalThis.document = originalDocument;
  vi.restoreAllMocks();
});

describe('DeferredFeatureLoader', function () {
  it('合并并发加载并在就绪后复用模块', async function () {
    globalThis.document = { body: { dataset: {} } };
    var importCount = 0;
    var initialized = [];
    var loader = createDeferredFeatureLoader();
    loader.define('market', {
      load: async function () {
        importCount += 1;
        return { id: 'market-ui' };
      },
      initialize: function (module, context) {
        initialized.push(module.id + ':' + context);
      },
    });

    var first = loader.load('market', 'first');
    var second = loader.load('market', 'second');
    expect(first).toBe(second);
    await expect(first).resolves.toEqual({ id: 'market-ui' });
    expect(importCount).toBe(1);
    expect(loader.getState('market')).toBe('ready');
    expect(document.body.dataset.marketUiState).toBe('ready');

    await expect(loader.load('market', 'again')).resolves.toEqual({ id: 'market-ui' });
    expect(importCount).toBe(1);
    expect(initialized).toEqual(['market-ui:first', 'market-ui:again']);
  });

  it('失败后保留错误遥测并允许重试', async function () {
    globalThis.document = { body: { dataset: {} } };
    var attempts = 0;
    var observedErrors = [];
    var loader = createDeferredFeatureLoader();
    loader.define('archive', {
      load: async function () {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary');
        return { ready: true };
      },
      onError: function (error) {
        observedErrors.push(error.message);
      },
    });

    await expect(loader.load('archive')).resolves.toBe(null);
    expect(loader.getState('archive')).toBe('error');
    expect(document.body.dataset.archiveUiState).toBe('error');
    expect(observedErrors).toEqual(['temporary']);

    await expect(loader.load('archive')).resolves.toEqual({ ready: true });
    expect(loader.getState('archive')).toBe('ready');
    expect(attempts).toBe(2);
  });

  it('初始化失败不会留下伪就绪模块', async function () {
    globalThis.document = { body: { dataset: {} } };
    var initializeAttempts = 0;
    var loader = createDeferredFeatureLoader();
    loader.define('fleet', {
      load: async function () { return { ready: true }; },
      initialize: function () {
        initializeAttempts += 1;
        if (initializeAttempts === 1) throw new Error('init failed');
      },
    });

    await expect(loader.load('fleet')).resolves.toBe(null);
    expect(loader.get('fleet')).toBe(null);
    expect(loader.getState('fleet')).toBe('error');

    await expect(loader.load('fleet')).resolves.toEqual({ ready: true });
    expect(loader.getState('fleet')).toBe('ready');
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
