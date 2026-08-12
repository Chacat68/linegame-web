// js/core/FeatureRegistry.js — manifest 驱动的延迟功能生命周期注册表
//
// FeatureRegistry 统一拥有动态模块的依赖、加载、初始化、会话同步、失败重试
// 与释放顺序。Feature 不能缓存调用 load() 时的 state；加载完成和 syncAll() 都
// 通过 getContext() 读取最新 session context，避免读档期间异步模块绑定旧状态。

function _noop() {}

function _getBodyDataset() {
  if (typeof document === 'undefined' || !document.body || !document.body.dataset) return null;
  return document.body.dataset;
}

function _setDomTelemetryState(feature, state) {
  var dataset = _getBodyDataset();
  if (!dataset || !feature) return;
  dataset[feature + 'UiState'] = state;
}

function _normalizeDefinition(definition) {
  var def = definition || {};
  return {
    dependencies: Array.isArray(def.dependencies)
      ? Array.from(new Set(def.dependencies.filter(function (item) { return typeof item === 'string' && item; })))
      : [],
    load: typeof def.load === 'function' ? def.load : null,
    initialize: typeof def.initialize === 'function' ? def.initialize : null,
    sync: typeof def.sync === 'function' ? def.sync : null,
    dispose: typeof def.dispose === 'function' ? def.dispose : null,
    onError: typeof def.onError === 'function' ? def.onError : null,
  };
}

function _createRecord(definition) {
  return {
    definition: _normalizeDefinition(definition),
    module: null,
    promise: null,
    error: null,
    initialized: false,
    generation: 0,
    loadCount: 0,
    syncCount: 0,
  };
}

export function createFeatureRegistry(options) {
  var opts = options || {};
  var getContext = typeof opts.getContext === 'function' ? opts.getContext : function () { return null; };
  var setTelemetryState = typeof opts.setTelemetryState === 'function'
    ? opts.setTelemetryState
    : _setDomTelemetryState;
  var records = Object.create(null);
  var order = [];

  function _notify(feature, state) {
    setTelemetryState(feature, state);
  }

  function define(feature, definition) {
    if (typeof feature !== 'string' || !feature.trim()) {
      throw new Error('FeatureRegistry requires a feature name.');
    }
    var name = feature.trim();
    var existing = records[name];
    if (existing && (existing.module || existing.promise)) {
      throw new Error('Cannot redefine active feature: ' + name);
    }
    if (!existing) order.push(name);
    records[name] = _createRecord(definition);
    _notify(name, 'idle');
    return api;
  }

  function registerManifest(manifest) {
    var entries = manifest && typeof manifest === 'object' ? Object.keys(manifest) : [];
    entries.forEach(function (feature) {
      define(feature, manifest[feature]);
    });
    _topologicalOrder();
    return api;
  }

  function has(feature) {
    return !!records[feature];
  }

  function get(feature) {
    return records[feature] ? records[feature].module : null;
  }

  function getError(feature) {
    return records[feature] ? records[feature].error : null;
  }

  function getState(feature) {
    var record = records[feature];
    if (!record) return 'missing';
    if (record.module) return 'ready';
    if (record.promise) return 'loading';
    if (record.error) return 'error';
    return 'idle';
  }

  function _reportError(feature, record, error) {
    record.error = error || new Error('Feature failed: ' + feature);
    _notify(feature, 'error');
    if (record.definition.onError) record.definition.onError(record.error, feature);
  }

  function _featureContext(feature, dependencies, request) {
    return {
      context: getContext(),
      dependencies: dependencies || Object.create(null),
      feature: feature,
      registry: api,
      request: request,
    };
  }

  function _activate(feature, record, module, dependencies, request) {
    var lifecycle = _featureContext(feature, dependencies, request);
    if (!record.initialized) {
      if (record.definition.initialize) record.definition.initialize(module, lifecycle);
      record.initialized = true;
    }
    if (record.definition.sync) record.definition.sync(module, lifecycle);
    record.syncCount += 1;
    return module;
  }

  function _disposeModule(feature, record, module) {
    if (!module || !record.definition.dispose) return;
    record.definition.dispose(module, _featureContext(feature));
  }

  function _load(feature, request, stack) {
    var record = records[feature];
    if (!record || !record.definition.load) return Promise.resolve(null);
    if (stack.indexOf(feature) !== -1) {
      return Promise.reject(new Error('Feature dependency cycle: ' + stack.concat(feature).join(' -> ')));
    }
    if (record.module) {
      try {
        record.error = null;
        _activate(feature, record, record.module, null, request);
        _notify(feature, 'ready');
        return Promise.resolve(record.module);
      } catch (error) {
        var failedModule = record.module;
        record.module = null;
        record.initialized = false;
        _disposeModule(feature, record, failedModule);
        _reportError(feature, record, error);
        return Promise.resolve(null);
      }
    }
    if (record.promise) return record.promise;

    var operationGeneration = ++record.generation;
    var dependencies = record.definition.dependencies.slice();
    record.error = null;
    _notify(feature, 'loading');
    record.promise = Promise.all(dependencies.map(function (dependency) {
      if (!records[dependency]) {
        return Promise.reject(new Error('Unknown dependency "' + dependency + '" for feature "' + feature + '".'));
      }
      return _load(dependency, undefined, stack.concat(feature));
    }))
      .then(function (modules) {
        var resolved = Object.create(null);
        dependencies.forEach(function (dependency, index) {
          resolved[dependency] = modules[index] || null;
        });
        var unavailable = dependencies.find(function (dependency) { return !resolved[dependency]; });
        if (unavailable) {
          throw new Error('Dependency "' + unavailable + '" is unavailable for feature "' + feature + '".');
        }
        return Promise.resolve(record.definition.load(_featureContext(feature, resolved, request)))
          .then(function (module) { return { module: module || null, dependencies: resolved }; });
      })
      .then(function (result) {
        var loadedModule = result.module;
        if (record.generation !== operationGeneration) {
          _disposeModule(feature, record, loadedModule);
          return null;
        }
        record.promise = null;
        if (!loadedModule) {
          _notify(feature, 'idle');
          return null;
        }
        try {
          record.module = loadedModule;
          record.initialized = false;
          _activate(feature, record, loadedModule, result.dependencies, request);
          record.error = null;
          record.loadCount += 1;
          _notify(feature, 'ready');
          return loadedModule;
        } catch (error) {
          record.module = null;
          record.initialized = false;
          _disposeModule(feature, record, loadedModule);
          _reportError(feature, record, error);
          return null;
        }
      })
      .catch(function (error) {
        if (record.generation !== operationGeneration) return null;
        record.module = null;
        record.promise = null;
        record.initialized = false;
        _reportError(feature, record, error);
        return null;
      });
    return record.promise;
  }

  function load(feature, request) {
    return _load(feature, request, []);
  }

  function sync(feature) {
    var record = records[feature];
    if (!record) return null;
    if (!record.module) {
      _notify(feature, getState(feature));
      return null;
    }
    try {
      record.error = null;
      _activate(feature, record, record.module);
      _notify(feature, 'ready');
      return record.module;
    } catch (error) {
      var failedModule = record.module;
      record.module = null;
      record.initialized = false;
      _disposeModule(feature, record, failedModule);
      _reportError(feature, record, error);
      return null;
    }
  }

  function _topologicalOrder() {
    var visiting = Object.create(null);
    var visited = Object.create(null);
    var sorted = [];

    function visit(feature, path) {
      if (visited[feature]) return;
      if (visiting[feature]) {
        throw new Error('Feature dependency cycle: ' + path.concat(feature).join(' -> '));
      }
      var record = records[feature];
      if (!record) throw new Error('Unknown feature in manifest: ' + feature);
      visiting[feature] = true;
      record.definition.dependencies.forEach(function (dependency) {
        if (!records[dependency]) {
          throw new Error('Unknown dependency "' + dependency + '" for feature "' + feature + '".');
        }
        visit(dependency, path.concat(feature));
      });
      visiting[feature] = false;
      visited[feature] = true;
      sorted.push(feature);
    }

    order.forEach(function (feature) { visit(feature, []); });
    return sorted;
  }

  function syncAll() {
    return _topologicalOrder().map(function (feature) {
      return { feature: feature, module: sync(feature) };
    });
  }

  function dispose(feature) {
    var record = records[feature];
    if (!record) return false;
    var module = record.module;
    record.generation += 1;
    record.module = null;
    record.promise = null;
    record.error = null;
    record.initialized = false;
    _disposeModule(feature, record, module);
    _notify(feature, 'idle');
    return true;
  }

  function disposeAll() {
    _topologicalOrder().reverse().forEach(dispose);
    return true;
  }

  function getDiagnostics() {
    var snapshot = Object.create(null);
    order.forEach(function (feature) {
      var record = records[feature];
      snapshot[feature] = Object.freeze({
        dependencies: Object.freeze(record.definition.dependencies.slice()),
        error: record.error,
        generation: record.generation,
        loadCount: record.loadCount,
        state: getState(feature),
        syncCount: record.syncCount,
      });
    });
    return Object.freeze(snapshot);
  }

  var api = Object.freeze({
    define: define,
    dispose: dispose,
    disposeAll: disposeAll,
    get: get,
    getDiagnostics: getDiagnostics,
    getError: getError,
    getState: getState,
    has: has,
    load: load,
    registerManifest: registerManifest,
    sync: sync,
    syncAll: syncAll,
  });

  return api;
}

export function loadDeferredStylesheet(feature, href) {
  if (!href) return Promise.resolve('');
  if (typeof document === 'undefined' || !document.createElement || !document.head || !document.head.appendChild) {
    return Promise.resolve(href);
  }

  var selector = 'link[data-deferred-ui-style="' + feature + '"]';
  var existing = document.querySelector ? document.querySelector(selector) : null;
  if (existing && existing.dataset && existing.dataset.loaded === 'true') {
    return Promise.resolve(existing.href || href);
  }

  return new Promise(function (resolve, reject) {
    var link = existing || document.createElement('link');
    var onLoad = function () {
      if (link.dataset) link.dataset.loaded = 'true';
      resolve(link.href || href);
    };
    var onError = function () {
      if (link.dataset) link.dataset.loaded = 'false';
      if (link.parentNode && link.parentNode.removeChild) link.parentNode.removeChild(link);
      reject(new Error('Failed to load deferred stylesheet: ' + feature));
    };

    if (link.addEventListener) {
      link.addEventListener('load', onLoad, { once: true });
      link.addEventListener('error', onError, { once: true });
    } else {
      link.onload = onLoad;
      link.onerror = onError;
    }

    if (!existing) {
      link.rel = 'stylesheet';
      link.href = href;
      if (link.dataset) link.dataset.deferredUiStyle = feature;
      var appStyles = document.getElementById ? document.getElementById('app-styles') : null;
      if (appStyles && document.head.insertBefore) document.head.insertBefore(link, appStyles);
      else document.head.appendChild(link);
    }
  });
}
