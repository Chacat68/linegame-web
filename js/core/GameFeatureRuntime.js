// js/core/GameFeatureRuntime.js — 游戏延迟功能的已配置运行时
//
// FeatureRegistry 提供通用状态机，GameFeatureManifest 声明游戏资源；本模块
// 将二者组合成一个稳定端口。调用方无需管理 configured 标志、重复注册或
// “null 表示失败”的错误恢复细节。

import { createFeatureRegistry } from './FeatureRegistry.js';
import { createGameFeatureManifest } from './GameFeatureManifest.js';

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('GameFeatureRuntime requires ' + label + '.');
  return value;
}

export function createGameFeatureRuntime(dependencies) {
  var deps = dependencies || {};
  var getContext = _requiredFunction(deps.getContext, 'getContext');
  var createRegistry = typeof deps.createRegistry === 'function'
    ? deps.createRegistry
    : createFeatureRegistry;
  var registry = createRegistry({
    getContext: getContext,
    setTelemetryState: deps.setTelemetryState,
  });
  var manifest = deps.manifest || createGameFeatureManifest({
    reportFailure: deps.reportFailure,
    hooks: deps.hooks,
    loadStylesheet: deps.loadStylesheet,
  });
  registry.registerManifest(manifest);

  function loadOrReject(feature, request) {
    return registry.load(feature, request).then(function (module) {
      if (module) return module;
      throw registry.getError(feature) || new Error('Deferred feature unavailable: ' + feature);
    });
  }

  return Object.freeze({
    dispose: registry.dispose,
    disposeAll: registry.disposeAll,
    get: registry.get,
    getDiagnostics: registry.getDiagnostics,
    getError: registry.getError,
    getState: registry.getState,
    has: registry.has,
    load: registry.load,
    loadOrReject: loadOrReject,
    sync: registry.sync,
    syncAll: registry.syncAll,
  });
}
