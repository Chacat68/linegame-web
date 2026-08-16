// js/core/RandomEventRuntimeController.js — 随机事件的延迟运行时与会话安全 roll 队列

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError('RandomEventRuntimeController requires ' + label + '.');
  }
  return value;
}

function _defaultLoadRuntime() {
  return import('../systems/event/RandomEvent.js');
}

function _resetPersistedState(state) {
  if (!state || typeof state !== 'object') return;
  state._eventCooldowns = {};
  state._eventHistory = [];
  state._activeEventId = '';
  state._tripsSinceLastEvent = 999;
}

export function createRandomEventRuntimeController(dependencies) {
  var deps = dependencies || {};
  var hooks = deps.hooks || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var getSessionToken = _requiredFunction(deps.getSessionToken, 'getSessionToken');
  var isSessionTokenCurrent = _requiredFunction(deps.isSessionTokenCurrent, 'isSessionTokenCurrent');
  var loadRuntime = typeof deps.loadRuntime === 'function' ? deps.loadRuntime : _defaultLoadRuntime;
  var setTelemetryState = typeof hooks.setTelemetryState === 'function' ? hooks.setTelemetryState : _noop;
  var reportFailure = typeof hooks.reportFailure === 'function' ? hooks.reportFailure : _noop;
  var presentEvent = typeof hooks.presentEvent === 'function' ? hooks.presentEvent : _noop;
  var onChoice = typeof hooks.onChoice === 'function' ? hooks.onChoice : _noop;
  var emitAudio = typeof hooks.emitAudio === 'function' ? hooks.emitAudio : _noop;
  var emitMessage = typeof hooks.emitMessage === 'function' ? hooks.emitMessage : _noop;
  var captureState = typeof hooks.captureState === 'function' ? hooks.captureState : _noop;
  var saveAutosave = typeof hooks.saveAutosave === 'function' ? hooks.saveAutosave : _noop;
  var refreshActionGuide = typeof hooks.refreshActionGuide === 'function' ? hooks.refreshActionGuide : _noop;

  var runtime = null;
  var loadPromise = null;
  var rollQueue = Promise.resolve(null);
  var generation = 0;
  var disposed = false;
  var lastError = null;
  var rollCount = 0;
  var triggeredCount = 0;

  function _telemetryState() {
    return runtime ? 'ready' : (loadPromise ? 'loading' : (lastError ? 'error' : 'idle'));
  }

  function load() {
    if (disposed) return Promise.resolve(null);
    if (runtime) return Promise.resolve(runtime);
    if (loadPromise) return loadPromise;

    lastError = null;
    setTelemetryState('loading');
    loadPromise = Promise.resolve()
      .then(loadRuntime)
      .then(function (module) {
        if (disposed) return null;
        if (!module || typeof module.syncRuntimeState !== 'function' || typeof module.rollEvent !== 'function') {
          throw new Error('Random event runtime module is incomplete.');
        }
        runtime = module;
        var state = getState();
        if (state) runtime.syncRuntimeState(state);
        setTelemetryState('ready');
        return runtime;
      })
      .catch(function (error) {
        loadPromise = null;
        lastError = error;
        if (!disposed) {
          setTelemetryState('error');
          reportFailure(error);
        }
        return null;
      });
    return loadPromise;
  }

  function sync(state) {
    var targetState = state || getState();
    if (runtime && targetState) runtime.syncRuntimeState(targetState);
    setTelemetryState(_telemetryState());
    return targetState;
  }

  function reset(state) {
    generation += 1;
    rollQueue = Promise.resolve(null);
    var targetState = state || getState();
    if (runtime) runtime.resetRuntimeState(targetState);
    else _resetPersistedState(targetState);
    setTelemetryState(_telemetryState());
    return getDiagnostics();
  }

  function _showEvent(event) {
    if (!event) return;
    triggeredCount += 1;
    emitAudio('event.alert');
    presentEvent(event, onChoice);
    emitMessage({
      text: '📢 遭遇事件：' + event.title + '！请通过当前行动处理。',
      type: 'info',
    });
  }

  function scheduleRoll(state, baseChance) {
    var requestedState = state || getState();
    var token = getSessionToken();
    var requestedGeneration = generation;
    if (!requestedState || requestedState !== getState() || !isSessionTokenCurrent(token) || disposed) {
      return Promise.resolve(null);
    }

    rollQueue = rollQueue
      .catch(function () { return null; })
      .then(load)
      .then(function (activeRuntime) {
        if (!activeRuntime || disposed || requestedGeneration !== generation || !isSessionTokenCurrent(token)) {
          return null;
        }

        activeRuntime.syncRuntimeState(requestedState);
        var event = activeRuntime.rollEvent(requestedState, baseChance);
        rollCount += 1;
        _showEvent(event);
        captureState(requestedState, { reason: 'random-event-roll', sessionToken: token });
        saveAutosave(requestedState, { reason: 'random-event-roll', sessionToken: token });
        refreshActionGuide();
        return event;
      });
    return rollQueue;
  }

  function restorePending(state) {
    var requestedState = state || getState();
    if (!requestedState || !requestedState._activeEventId || disposed) return Promise.resolve(null);
    var token = getSessionToken();
    var requestedGeneration = generation;
    if (requestedState !== getState() || !isSessionTokenCurrent(token)) return Promise.resolve(null);

    return load().then(function (activeRuntime) {
      if (!activeRuntime || disposed || requestedGeneration !== generation || !isSessionTokenCurrent(token)) {
        return null;
      }
      activeRuntime.syncRuntimeState(requestedState);
      var event = activeRuntime.getActiveEvent();
      if (!event) return null;
      presentEvent(event, onChoice);
      refreshActionGuide();
      return event;
    });
  }

  function getRuntime() {
    return runtime;
  }

  function dispose() {
    if (disposed) return getDiagnostics();
    disposed = true;
    generation += 1;
    rollQueue = Promise.resolve(null);
    setTelemetryState('disposed');
    return getDiagnostics();
  }

  function getDiagnostics() {
    return Object.freeze({
      state: disposed ? 'disposed' : _telemetryState(),
      disposed: disposed,
      loaded: !!runtime,
      loading: !!loadPromise && !runtime,
      generation: generation,
      rollCount: rollCount,
      triggeredCount: triggeredCount,
      lastError: lastError,
    });
  }

  return Object.freeze({
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    getRuntime: getRuntime,
    load: load,
    reset: reset,
    restorePending: restorePending,
    scheduleRoll: scheduleRoll,
    sync: sync,
  });
}
