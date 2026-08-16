// js/core/GamePersistenceController.js — 存档事务与会话恢复用例
//
// SaveSystem 只负责格式与槽位 IO；本控制器拥有“运行时快照 → 保存”、
// “读取 → 会话切换”、自动存档、清空槽位与重开策略。异步调用方必须
// 携带原始 session token，旧会话不得写回当前槽位。

import * as DefaultStore from '../systems/save/SaveSystem.js';

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError('GamePersistenceController requires ' + label + '.');
  }
  return value;
}

function _normalizeReason(reason, fallback) {
  return typeof reason === 'string' && reason.trim() ? reason.trim() : fallback;
}

function _saveOptions(options) {
  var normalized = Object.assign({}, options || {});
  delete normalized.sessionToken;
  return normalized;
}

export function createGamePersistenceController(dependencies) {
  var deps = dependencies || {};
  var store = deps.store || DefaultStore;
  var getState = _requiredFunction(deps.getState, 'getState');
  var getSessionToken = _requiredFunction(deps.getSessionToken, 'getSessionToken');
  var isSessionTokenCurrent = _requiredFunction(deps.isSessionTokenCurrent, 'isSessionTokenCurrent');
  var captureRuntime = _requiredFunction(deps.captureRuntime, 'captureRuntime');
  var transitionState = _requiredFunction(deps.transitionState, 'transitionState');
  var startFreshSession = _requiredFunction(deps.startFreshSession, 'startFreshSession');
  var resetTutorial = typeof deps.resetTutorial === 'function' ? deps.resetTutorial : _noop;
  var hideSettings = typeof deps.hideSettings === 'function' ? deps.hideSettings : _noop;
  var emitMessage = typeof deps.emitMessage === 'function' ? deps.emitMessage : _noop;
  var invalidateSaveUi = typeof deps.invalidateSaveUi === 'function' ? deps.invalidateSaveUi : _noop;
  var slotIds = Array.isArray(deps.slotIds) && deps.slotIds.length > 0
    ? Array.from(new Set(deps.slotIds))
    : [0, 1, 2, 3];

  var captureCount = 0;
  var autosaveCount = 0;
  var manualSaveCount = 0;
  var manualLoadCount = 0;
  var clearCount = 0;
  var restartCount = 0;
  var staleDropCount = 0;
  var lastOperation = null;

  function _request(state, options) {
    var targetState = typeof state === 'undefined' ? getState() : state;
    var hasExplicitToken = !!options && Object.prototype.hasOwnProperty.call(options, 'sessionToken');
    var token = hasExplicitToken ? options.sessionToken : getSessionToken();
    if (!targetState || targetState !== getState() || !isSessionTokenCurrent(token)) {
      staleDropCount += 1;
      return null;
    }
    return { state: targetState, token: token };
  }

  function _publishResult(result, fallbackMessage) {
    var normalized = result && typeof result === 'object'
      ? result
      : { ok: false, msg: fallbackMessage };
    emitMessage({
      text: normalized.msg || fallbackMessage,
      type: normalized.ok ? 'info' : 'error',
    });
    return normalized;
  }

  function captureState(state, options) {
    var request = _request(state, options);
    if (!request) return null;
    var captureOptions = Object.assign({}, options || {}, { sessionToken: request.token });
    var result = captureRuntime(request.state, captureOptions);
    captureCount += 1;
    lastOperation = Object.freeze({
      type: 'capture',
      reason: _normalizeReason(captureOptions.reason, 'capture'),
      state: request.state,
      token: request.token,
      result: result,
    });
    return result;
  }

  function saveAutosave(state, options) {
    var request = _request(state, options);
    if (!request) return null;
    var saveOptions = Object.assign(_saveOptions(options), { isAutosave: true });
    var result = store.saveGame(0, request.state, saveOptions);
    autosaveCount += 1;
    lastOperation = Object.freeze({
      type: 'autosave',
      reason: _normalizeReason(options && options.reason, 'autosave'),
      state: request.state,
      token: request.token,
      result: result,
    });
    return result;
  }

  function saveSlot(slotId) {
    var state = getState();
    var token = getSessionToken();
    captureState(state, { reason: 'manual-save', sessionToken: token });
    var result = store.saveGame(slotId, state);
    manualSaveCount += 1;
    lastOperation = Object.freeze({
      type: 'manual-save',
      slotId: slotId,
      state: state,
      token: token,
      result: result,
    });
    _publishResult(result, '存档失败。');
    invalidateSaveUi();
    return result;
  }

  function loadSlot(slotId) {
    var result = store.loadGame(slotId);
    manualLoadCount += 1;
    if (result && result.ok) {
      hideSettings();
      transitionState(result.state, {
        reason: 'manual-load',
        mode: 'manual-load',
        restoreEconomy: true,
        restoreGalaxy: true,
        restoreRandomRuntime: true,
        syncDifficulty: true,
        restorePendingEvent: true,
      });
    }
    lastOperation = Object.freeze({
      type: 'manual-load',
      slotId: slotId,
      result: result,
    });
    _publishResult(result, '读档失败。');
    return result;
  }

  function clearAllSlots() {
    slotIds.forEach(function (slotId) { store.deleteSlot(slotId); });
    clearCount += 1;
    lastOperation = Object.freeze({ type: 'clear-all', slotIds: Object.freeze(slotIds.slice()) });
    emitMessage({ text: '🗑 本地存档已全部清空。', type: 'info' });
    invalidateSaveUi();
    return slotIds.length;
  }

  function restart(reason) {
    var restartReason = _normalizeReason(reason, 'restart');
    resetTutorial();
    store.deleteSlot(0);
    restartCount += 1;
    lastOperation = Object.freeze({ type: 'restart', reason: restartReason });
    return startFreshSession(restartReason);
  }

  function getDiagnostics() {
    return Object.freeze({
      autosaveCount: autosaveCount,
      captureCount: captureCount,
      clearCount: clearCount,
      lastOperation: lastOperation,
      manualLoadCount: manualLoadCount,
      manualSaveCount: manualSaveCount,
      restartCount: restartCount,
      staleDropCount: staleDropCount,
    });
  }

  return Object.freeze({
    captureState: captureState,
    clearAllSlots: clearAllSlots,
    getDiagnostics: getDiagnostics,
    loadSlot: loadSlot,
    restart: restart,
    saveAutosave: saveAutosave,
    saveSlot: saveSlot,
  });
}
