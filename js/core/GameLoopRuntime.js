// js/core/GameLoopRuntime.js — 游戏循环与命名周期任务的应用层边界
//
// GameClockController 只处理调度与累计时间；本运行时组合最新会话状态、
// 功能加载暂停、场景帧呈现、领域日推进和 active-dispatch 周期任务。

import { createGameClockController } from './GameClockController.js';
import { shouldLoadAdvancedCommerce } from '../ui/ActionGuideCoordinator.js';

const ACTIVE_DISPATCH_CLOCK_ID = 'active-dispatch';
const DEFAULT_DISPATCH_INTERVAL_DIVISOR = 2;
const DEFAULT_MIN_DISPATCH_INTERVAL_MS = 1000;

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('GameLoopRuntime requires ' + label + '.');
  return value;
}

function _defaultNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function _defaultGetDocument() {
  return typeof document === 'undefined' ? null : document;
}

export function createGameLoopRuntime(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var ui = deps.ui || {};
  var callbacks = deps.callbacks || {};
  var config = deps.config || {};
  var environment = deps.environment || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var getSettings = typeof deps.getSettings === 'function'
    ? deps.getSettings
    : function () { return {}; };
  var getFeatureRuntime = _requiredFunction(deps.getFeatureRuntime, 'getFeatureRuntime');
  var getGuidanceRuntime = _requiredFunction(deps.getGuidanceRuntime, 'getGuidanceRuntime');
  var getActionRuntime = _requiredFunction(deps.getActionRuntime, 'getActionRuntime');
  var createClock = typeof deps.createClock === 'function'
    ? deps.createClock
    : createGameClockController;
  var now = typeof environment.now === 'function' ? environment.now : _defaultNow;
  var getDocument = typeof environment.getDocument === 'function'
    ? environment.getDocument
    : _defaultGetDocument;
  var defaultDayDurationMs = Number.isFinite(config.defaultDayDurationMs)
    ? config.defaultDayDurationMs
    : 1;
  var dispatchIntervalDivisor = Number.isFinite(config.dispatchIntervalDivisor) && config.dispatchIntervalDivisor > 0
    ? config.dispatchIntervalDivisor
    : DEFAULT_DISPATCH_INTERVAL_DIVISOR;
  var minDispatchIntervalMs = Number.isFinite(config.minDispatchIntervalMs) && config.minDispatchIntervalMs > 0
    ? config.minDispatchIntervalMs
    : DEFAULT_MIN_DISPATCH_INTERVAL_MS;
  var clock = null;

  function getDayDurationMs() {
    var settings = getSettings() || {};
    return Number.isFinite(settings.realtimeDayDurationMs)
      ? settings.realtimeDayDurationMs
      : defaultDayDurationMs;
  }

  function _requiresCommerceRuntime(state) {
    return shouldLoadAdvancedCommerce(state);
  }

  function _pauseForDeferredCommerce(state) {
    if (!_requiresCommerceRuntime(state)) return false;
    var features = getFeatureRuntime();
    var commerceRuntime = features && typeof features.get === 'function'
      ? features.get('commerceRuntime')
      : null;
    var featureState = features && typeof features.getState === 'function'
      ? features.getState('commerceRuntime')
      : null;
    if (commerceRuntime || featureState === 'error') return false;
    var guidance = getGuidanceRuntime();
    if (guidance && typeof guidance.prefetchForState === 'function') {
      guidance.prefetchForState(state);
    }
    return true;
  }

  function isPaused(state) {
    if (_pauseForDeferredCommerce(state)) return true;
    var documentRef = getDocument();
    var tutorialActive = systems.Tutorial && typeof systems.Tutorial.isActive === 'function'
      ? systems.Tutorial.isActive()
      : false;
    var blockingModal = documentRef && typeof documentRef.querySelector === 'function'
      ? documentRef.querySelector('.modal:not(.hidden)')
      : null;
    return !!(documentRef && documentRef.hidden) || tutorialActive || !!blockingModal;
  }

  function _advanceDays(days, clockContext) {
    var actions = getActionRuntime();
    return actions && actions.day && typeof actions.day.advance === 'function'
      ? actions.day.advance(days, clockContext)
      : null;
  }

  function _renderFrame(state) {
    if (!state || !ui.Renderer || typeof ui.Renderer.render !== 'function') return;
    var mapView = ui.MapUI && typeof ui.MapUI.getMapView === 'function'
      ? ui.MapUI.getMapView()
      : 'planets';
    var galaxyId = ui.MapUI && typeof ui.MapUI.getCurrentGalaxyId === 'function'
      ? ui.MapUI.getCurrentGalaxyId()
      : 'milky_way';
    ui.Renderer.render(state, mapView, galaxyId);
  }

  function _getClock() {
    if (clock) return clock;
    clock = createClock({
      getState: getState,
      getDayDurationMs: getDayDurationMs,
      getHullSnapshot: function (state) {
        return state && Number.isFinite(state.shipHull) ? state.shipHull : 100;
      },
      isPaused: isPaused,
      onElapsedDays: _advanceDays,
      renderFrame: _renderFrame,
      clockMath: systems.GameTime,
    });
    return clock;
  }

  function start() {
    return _getClock().start();
  }

  function stop() {
    return clock ? clock.stop() : null;
  }

  function reset(timestamp) {
    return _getClock().reset(timestamp);
  }

  function _dispatchIntervalMs() {
    return Math.max(minDispatchIntervalMs, Math.floor(getDayDurationMs() / dispatchIntervalDivisor));
  }

  function _dispatchTick() {
    var actions = getActionRuntime();
    return actions && actions.dispatch && typeof actions.dispatch.tick === 'function'
      ? actions.dispatch.tick()
      : null;
  }

  function startDispatch() {
    _getClock().startRecurring(
      ACTIVE_DISPATCH_CLOCK_ID,
      _dispatchTick,
      _dispatchIntervalMs()
    );
    if (typeof callbacks.emitLog === 'function') {
      callbacks.emitLog({
        text: '📡 自动跑商已启动，将按游戏时间自动执行下一步。',
        type: 'info',
      });
    }
    return true;
  }

  function stopDispatch() {
    return clock ? clock.stopRecurring(ACTIVE_DISPATCH_CLOCK_ID) : false;
  }

  function resumeRecurring(state) {
    var targetState = state || getState();
    var active = systems.Fleet && typeof systems.Fleet.isActiveDispatched === 'function'
      ? systems.Fleet.isActiveDispatched(targetState)
      : false;
    if (!active) return false;
    return startDispatch();
  }

  function handleDayDurationChange(nextDurationMs) {
    if (typeof callbacks.setDayDuration === 'function') callbacks.setDayDuration(nextDurationMs);
    var activeDispatch = !!(clock && clock.isRecurring(ACTIVE_DISPATCH_CLOCK_ID));
    _getClock().reset(now());
    if (activeDispatch) startDispatch();
    return getSnapshot();
  }

  function getSnapshot() {
    return clock ? clock.getSnapshot() : null;
  }

  function getDiagnostics() {
    return Object.freeze({
      dayDurationMs: getDayDurationMs(),
      dispatchIntervalMs: _dispatchIntervalMs(),
      dispatchRunning: !!(clock && clock.isRecurring(ACTIVE_DISPATCH_CLOCK_ID)),
      clock: getSnapshot(),
    });
  }

  function dispose() {
    if (!clock) return null;
    var result = clock.dispose();
    clock = null;
    return result;
  }

  return Object.freeze({
    dispose: dispose,
    getDayDurationMs: getDayDurationMs,
    getDiagnostics: getDiagnostics,
    getSnapshot: getSnapshot,
    handleDayDurationChange: handleDayDurationChange,
    isPaused: isPaused,
    reset: reset,
    resumeRecurring: resumeRecurring,
    start: start,
    startDispatch: startDispatch,
    stop: stop,
    stopDispatch: stopDispatch,
  });
}
