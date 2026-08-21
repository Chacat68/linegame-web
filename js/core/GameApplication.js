// js/core/GameApplication.js — 游戏应用组合根
//
// 只拥有应用级状态、Runtime Graph、启动/关闭顺序与公共端口。
// 具体节点装配由 GameRuntimeNodeFactories 持有。

import * as EventBus from './EventBus.js';
import * as EventUI from '../ui/EventUI.js';
import * as ContextInspector from '../ui/ContextInspector.js';
import { createGameFeatureFailureReporter } from './GameFeatureManifest.js';
import { createStateSession } from './StateSession.js';
import { createGameApplicationLifecycle } from './GameApplicationLifecycle.js';
import { createGameRuntimeGraph } from './GameRuntimeGraph.js';
import { createGameStartupProjection } from './GameStartupProjection.js';
import { resolveDirtyRegions } from './ActionPresentation.js';
import {
  GAME_RUNTIME_NODE_IDS,
  createGameRuntimeNodeFactories,
  releaseGameRuntimeStaticPorts,
} from './GameRuntimeNodeFactories.js';
import { registerGameApplicationTestHarness } from '../testing/GameApplicationTestHarnessRegistry.js';

const _session = createStateSession();
const _startupProjection = createGameStartupProjection();
const _runtimeNodeSet = new Set(GAME_RUNTIME_NODE_IDS);
const _runtimeGraph = createGameRuntimeGraph(GAME_RUNTIME_NODE_IDS);
const _reportDeferredUiFailure = createGameFeatureFailureReporter({
  emitLog: function (message) { EventBus.emit('log:message', message); },
  reportError: function (feature, error) {
    console.error('[GameApplication] Failed to load deferred ' + feature + ' feature.', error);
  },
});

let _state = null;
let _runtimeFactories = null;
let _applicationLifecycle = null;

function _replaceState(nextState, reason) {
  _session.replace(nextState, { reason: reason });
  _state = _session.getState();
  ContextInspector.reconcileRevision(_session.getRevision(), { render: false });
  return _state;
}

function _getSessionToken() {
  return _session.getToken();
}

function _isSessionTokenCurrent(token) {
  return _session.isCurrent(token);
}

function _getRuntimeFactories() {
  if (_runtimeFactories) return _runtimeFactories;
  _runtimeFactories = createGameRuntimeNodeFactories({
    resolve: _resolveRuntime,
    getState: function () { return _state; },
    getSettings: _startupProjection.getSettings,
    getRevision: function () { return _session.getRevision(); },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    replaceState: _replaceState,
    resetSessionTransients: _resetSessionTransients,
    updateUI: _updateUI,
    startFreshSession: function (reason) {
      return init(null, { restoreAutosave: false, reason: reason });
    },
    emitLog: function (message) { EventBus.emit('log:message', message); },
    emitAudio: function (cue) { EventBus.emit('audio:cue', { cue: cue }); },
    reportDeferredUiFailure: _reportDeferredUiFailure,
    events: EventBus,
  });
  return _runtimeFactories;
}

function _resolveRuntime(id) {
  var factory = _getRuntimeFactories()[id];
  if (typeof factory !== 'function') throw new Error('Unknown Runtime Graph factory: ' + id);
  return _runtimeGraph.resolve(id, factory);
}

function _getFeatureRuntime() { return _resolveRuntime('features'); }
function _getUiRuntime() { return _resolveRuntime('ui'); }
function _getSystemRuntime() { return _resolveRuntime('systems'); }
function _getGameLoopRuntime() { return _resolveRuntime('gameLoop'); }
function _getSessionLifecycle() { return _resolveRuntime('sessionLifecycle'); }
function _getActionRuntime() { return _resolveRuntime('actions'); }
function _getDialogueController() { return _resolveRuntime('dialogue'); }
function _getRandomEventController() { return _resolveRuntime('randomEvent'); }
function _getGuidanceRuntime() { return _resolveRuntime('guidance'); }

function _resetSessionTransients() {
  ['achievement', 'guidance', 'ui', 'victory'].forEach(function (id) {
    var runtime = _runtimeGraph.peek(id);
    if (runtime) runtime.reset();
  });
}

function _getApplicationLifecycle() {
  if (_applicationLifecycle) return _applicationLifecycle;
  _applicationLifecycle = createGameApplicationLifecycle({
    getRuntime: function (id) {
      if (_runtimeNodeSet.has(id)) return _runtimeGraph.peek(id);
      if (id === 'renderer') return _startupProjection.getRenderer();
      if (id === 'eventUi') return EventUI;
      return null;
    },
    release: function (context) {
      releaseGameRuntimeStaticPorts();
      _replaceState(null, context.reason);
      _runtimeGraph.clear();
      _runtimeFactories = null;
      _startupProjection.release();
    },
    reportError: function (stage, error) {
      console.error('[GameApplicationLifecycle] Failed to shut down ' + stage + '.', error);
    },
  });
  return _applicationLifecycle;
}

function _beginApplicationLifecycle() {
  if (_applicationLifecycle && _applicationLifecycle.getDiagnostics().disposed) {
    _applicationLifecycle = null;
  }
  return _getApplicationLifecycle();
}

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

export function init(difficulty, options) {
  _beginApplicationLifecycle();
  var startup = _startupProjection.prepareSession(difficulty, options);
  var restoredAutosave = startup.restoredAutosave;
  var sessionReason = options && options.reason
    ? options.reason
    : (restoredAutosave ? 'restore-autosave' : 'new-game');

  var sessionTransition = _getSessionLifecycle().begin(startup.state, {
    reason: sessionReason,
    mode: restoredAutosave ? 'restore-autosave' : 'new-game',
    restoreEconomy: restoredAutosave,
    restoreGalaxy: restoredAutosave,
    restoreRandomRuntime: restoredAutosave,
    syncDifficulty: restoredAutosave,
    restorePendingEvent: restoredAutosave,
  });

  _startupProjection.initializeScene();
  var uiRuntime = _getUiRuntime();
  uiRuntime.initialize();

  // UI 壳完成绑定后，再由生命周期统一同步投影、渲染并恢复计时。
  _getSessionLifecycle().present(sessionTransition);
  var sceneReadyPromise = uiRuntime.whenSceneReady();
  uiRuntime.presentEntry({ restoredAutosave: restoredAutosave });
  return sceneReadyPromise;
}

/** 释放整个应用实例；与读档/重开所用的 session transition 不同。 */
export function shutdown(reason) {
  return _getApplicationLifecycle().shutdown({ reason: reason || 'application-shutdown' });
}

function _createTestHarness() {
  return Object.freeze({
    replaceState: function (state) {
      _replaceState(state || null, 'test-harness');
      var guidance = _runtimeGraph.peek('guidance');
      if (guidance) guidance.reset();
      if (_state) {
        _getDialogueController().reset(_state);
        _getRandomEventController().sync(_state);
      }
    },
    executeGuidanceCommand: function (suggestion) {
      return _getGuidanceRuntime().execute(suggestion);
    },
    confirmTrade: function (action, goodId, quantity, marketType) {
      return _getActionRuntime().trade.confirm(action, goodId, quantity, marketType);
    },
    assignRoute: function (shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) {
      return _getActionRuntime().fleet.onAssignRoute(
        shipIndex,
        buySystemId,
        sellSystemId,
        goodId,
        tradePolicy
      );
    },
    stopActiveDispatch: function () {
      return _getGameLoopRuntime().stopDispatch();
    },
    getClockSnapshot: function () {
      var gameLoop = _runtimeGraph.peek('gameLoop');
      return gameLoop ? gameLoop.getSnapshot() : null;
    },
    getUiDiagnostics: function () {
      return _getUiRuntime().getDiagnostics();
    },
  });
}

if (import.meta.env.MODE === 'test') {
  registerGameApplicationTestHarness(_createTestHarness);
}

// UI 失效唯一入口；全量会话同步必须显式传 UI_REGION.ALL。
function _updateUI(regions) {
  var uiRuntime = _getUiRuntime();
  if (uiRuntime.navigation.isMarketOpen() && !_getFeatureRuntime().get('market')) uiRuntime.ensureMarket();
  return uiRuntime.invalidate(resolveDirtyRegions(regions));
}
