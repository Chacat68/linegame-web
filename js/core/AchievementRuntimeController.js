// js/core/AchievementRuntimeController.js — 成就检查队列与会话安全提交
//
// FeatureRegistry 仍负责动态模块的加载和同步；本控制器只拥有检查请求的
// 合并、会话校验、结果发布与失败恢复。任何延迟结果在提交前都必须同时
// 通过 generation 与 StateSession token 校验，不能污染已经替换的存档。

import { ACHIEVEMENT_UNLOCK_PRESENTATION } from './ActionPresentation.js';

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError('AchievementRuntimeController requires ' + label + '.');
  }
  return value;
}

export function ensureAchievementState(state) {
  if (!state || typeof state !== 'object') return false;
  if (Array.isArray(state.achievements)) return false;
  state.achievements = [];
  return true;
}

export function createAchievementRuntimeController(dependencies) {
  var deps = dependencies || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var getSessionToken = _requiredFunction(deps.getSessionToken, 'getSessionToken');
  var isSessionTokenCurrent = _requiredFunction(deps.isSessionTokenCurrent, 'isSessionTokenCurrent');
  var loadRuntime = _requiredFunction(deps.loadRuntime, 'loadRuntime');
  var emitMessage = typeof deps.emitMessage === 'function' ? deps.emitMessage : _noop;
  var invalidate = typeof deps.invalidate === 'function' ? deps.invalidate : _noop;
  var checkVictory = typeof deps.checkVictory === 'function' ? deps.checkVictory : _noop;
  var reportFailure = typeof deps.reportFailure === 'function' ? deps.reportFailure : _noop;

  var generation = 0;
  var activePromise = null;
  var queued = false;
  var disposed = false;
  var requestCount = 0;
  var checkCount = 0;
  var staleDropCount = 0;
  var failureCount = 0;
  var resetCount = 0;
  var lastError = null;

  function _isRequestCurrent(requestGeneration, requestedState, token) {
    return !disposed
      && requestGeneration === generation
      && requestedState === getState()
      && isSessionTokenCurrent(token);
  }

  function _publishResult(result) {
    var normalized = result && typeof result === 'object' ? result : {};
    var messages = Array.isArray(normalized.msgs) ? normalized.msgs : [];
    var newlyUnlocked = Array.isArray(normalized.newlyUnlocked) ? normalized.newlyUnlocked : [];

    messages.forEach(function (message) {
      if (!message || typeof message !== 'object') return;
      emitMessage({ text: message.text, type: message.type });
    });
    if (newlyUnlocked.length > 0) {
      invalidate(ACHIEVEMENT_UNLOCK_PRESENTATION.dirtyRegions);
      checkVictory();
    }
    return normalized;
  }

  function queueCheck() {
    if (disposed) return Promise.resolve(false);
    if (activePromise) return activePromise;

    var requestedState = getState();
    if (!requestedState) return Promise.resolve(false);

    var requestedToken = getSessionToken();
    var requestGeneration = generation;
    var operation = null;
    queued = true;
    requestCount += 1;

    operation = Promise.resolve()
      .then(loadRuntime)
      .then(function (Achievement) {
        if (!_isRequestCurrent(requestGeneration, requestedState, requestedToken)) {
          staleDropCount += 1;
          return false;
        }
        if (!Achievement || typeof Achievement.checkAll !== 'function') return false;

        if (typeof Achievement.init === 'function') Achievement.init(requestedState);
        var result = Achievement.checkAll(requestedState);
        checkCount += 1;
        return _publishResult(result);
      })
      .catch(function (error) {
        if (!_isRequestCurrent(requestGeneration, requestedState, requestedToken)) {
          staleDropCount += 1;
          return false;
        }
        lastError = error;
        failureCount += 1;
        reportFailure(error);
        return false;
      })
      .finally(function () {
        if (requestGeneration !== generation || activePromise !== operation) return;
        queued = false;
        activePromise = null;
      });

    activePromise = operation;
    return operation;
  }

  function reset() {
    generation += 1;
    queued = false;
    activePromise = null;
    lastError = null;
    resetCount += 1;
  }

  function dispose() {
    if (disposed) return;
    reset();
    disposed = true;
  }

  function getDiagnostics() {
    return Object.freeze({
      checkCount: checkCount,
      disposed: disposed,
      failureCount: failureCount,
      generation: generation,
      lastError: lastError,
      queued: queued,
      requestCount: requestCount,
      resetCount: resetCount,
      staleDropCount: staleDropCount,
    });
  }

  return Object.freeze({
    dispose: dispose,
    ensureState: ensureAchievementState,
    getDiagnostics: getDiagnostics,
    queueCheck: queueCheck,
    reset: reset,
  });
}
