// js/core/DeferredFeatureLoader.js — 按需功能与样式资源加载器
//
// GameManager 只声明“什么时候需要某项功能”。加载状态、重试、失败回退和
// DOM 遥测由该运行时统一管理，避免每个终端重复维护 module/promise/error 三元组。

function _getBodyDataset() {
  if (typeof document === 'undefined' || !document.body || !document.body.dataset) return null;
  return document.body.dataset;
}

function _setTelemetryState(feature, state) {
  var dataset = _getBodyDataset();
  if (!dataset || !feature) return;
  dataset[feature + 'UiState'] = state;
}

function _createFeatureRecord(definition) {
  var def = definition || {};
  return {
    load: typeof def.load === 'function' ? def.load : null,
    initialize: typeof def.initialize === 'function' ? def.initialize : null,
    onError: typeof def.onError === 'function' ? def.onError : null,
    module: null,
    promise: null,
    error: null,
  };
}

export function createDeferredFeatureLoader() {
  var features = Object.create(null);

  function define(feature, definition) {
    if (!feature) throw new Error('Deferred feature name is required.');
    features[feature] = _createFeatureRecord(definition);
    _setTelemetryState(feature, 'idle');
    return api;
  }

  function has(feature) {
    return !!features[feature];
  }

  function get(feature) {
    return features[feature] ? features[feature].module : null;
  }

  function getState(feature) {
    var record = features[feature];
    if (!record) return 'missing';
    if (record.module) return 'ready';
    if (record.promise) return 'loading';
    if (record.error) return 'error';
    return 'idle';
  }

  function sync(feature, context) {
    var record = features[feature];
    if (!record) return null;
    _setTelemetryState(feature, getState(feature));
    if (record.module && record.initialize) record.initialize(record.module, context);
    return record.module;
  }

  function load(feature, context) {
    var record = features[feature];
    if (!record || !record.load) return Promise.resolve(null);
    if (record.module) {
      if (record.initialize) record.initialize(record.module, context);
      _setTelemetryState(feature, 'ready');
      return Promise.resolve(record.module);
    }
    if (record.promise) return record.promise;

    record.error = null;
    _setTelemetryState(feature, 'loading');
    record.promise = Promise.resolve()
      .then(function () {
        return record.load(context);
      })
      .then(function (module) {
        var loadedModule = module || null;
        if (loadedModule && record.initialize) record.initialize(loadedModule, context);
        record.module = loadedModule;
        record.promise = null;
        record.error = null;
        _setTelemetryState(feature, loadedModule ? 'ready' : 'idle');
        return loadedModule;
      })
      .catch(function (error) {
        record.module = null;
        record.promise = null;
        record.error = error || new Error('Deferred feature failed: ' + feature);
        _setTelemetryState(feature, 'error');
        if (record.onError) record.onError(record.error, feature);
        return null;
      });

    return record.promise;
  }

  function reset(feature) {
    if (!features[feature]) return false;
    features[feature] = _createFeatureRecord(features[feature]);
    _setTelemetryState(feature, 'idle');
    return true;
  }

  var api = {
    define: define,
    get: get,
    getState: getState,
    has: has,
    load: load,
    reset: reset,
    sync: sync,
  };

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
