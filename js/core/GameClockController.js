// js/core/GameClockController.js — 游戏 RAF 与实时日推进的生命周期所有者
//
// 控制器只管理时钟、调度和 pause/reset 语义。领域日结算与画面渲染
// 通过注入 hook 完成，避免 GameManager 自己持有第二套 RAF 状态机。

function _defaultNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function _defaultRequestFrame(callback) {
  if (typeof requestAnimationFrame !== 'function') return null;
  return requestAnimationFrame(callback);
}

function _defaultCancelFrame(frameId) {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frameId);
}

function _defaultSetInterval(callback, intervalMs) {
  return setInterval(callback, intervalMs);
}

function _defaultClearInterval(intervalId) {
  clearInterval(intervalId);
}

function _defaultSetTimeout(callback, delayMs) {
  return setTimeout(callback, delayMs);
}

function _defaultClearTimeout(timeoutId) {
  clearTimeout(timeoutId);
}

function _finiteTimestamp(value, fallback) {
  if (Number.isFinite(value)) return value;
  return Number.isFinite(fallback) ? fallback : 0;
}

/**
 * @param {Object} dependencies
 * @param {Function} dependencies.getState 始终返回当前 StateSession state
 * @param {Function} dependencies.getDayDurationMs
 * @param {Function} dependencies.isPaused
 * @param {Function} dependencies.getHullSnapshot
 * @param {Function} dependencies.onElapsedDays
 * @param {Function} dependencies.renderFrame
 * @param {{resetRealtimeClock: Function, consumeElapsedDays: Function}} dependencies.clockMath
 * @param {{now?: Function, requestFrame?: Function, cancelFrame?: Function}} [dependencies.scheduler]
 */
export function createGameClockController(dependencies) {
  var deps = dependencies || {};
  var scheduler = deps.scheduler || {};
  var now = typeof scheduler.now === 'function' ? scheduler.now : _defaultNow;
  var requestFrame = typeof scheduler.requestFrame === 'function'
    ? scheduler.requestFrame
    : _defaultRequestFrame;
  var cancelFrame = typeof scheduler.cancelFrame === 'function'
    ? scheduler.cancelFrame
    : _defaultCancelFrame;
  var setRecurringInterval = typeof scheduler.setInterval === 'function'
    ? scheduler.setInterval
    : _defaultSetInterval;
  var clearRecurringInterval = typeof scheduler.clearInterval === 'function'
    ? scheduler.clearInterval
    : _defaultClearInterval;
  var setKickoffTimeout = typeof scheduler.setTimeout === 'function'
    ? scheduler.setTimeout
    : _defaultSetTimeout;
  var clearKickoffTimeout = typeof scheduler.clearTimeout === 'function'
    ? scheduler.clearTimeout
    : _defaultClearTimeout;
  var getState = typeof deps.getState === 'function' ? deps.getState : function () { return null; };
  var getDayDurationMs = typeof deps.getDayDurationMs === 'function'
    ? deps.getDayDurationMs
    : function () { return 1; };
  var isPaused = typeof deps.isPaused === 'function' ? deps.isPaused : function () { return false; };
  var getHullSnapshot = typeof deps.getHullSnapshot === 'function'
    ? deps.getHullSnapshot
    : function (state) { return state && Number.isFinite(state.shipHull) ? state.shipHull : 100; };
  var onElapsedDays = typeof deps.onElapsedDays === 'function' ? deps.onElapsedDays : function () {};
  var renderFrame = typeof deps.renderFrame === 'function' ? deps.renderFrame : function () {};
  var clockMath = deps.clockMath || {};

  if (typeof clockMath.resetRealtimeClock !== 'function' ||
      typeof clockMath.consumeElapsedDays !== 'function') {
    throw new TypeError('GameClockController requires resetRealtimeClock and consumeElapsedDays.');
  }

  var running = false;
  var frameId = null;
  var frameGeneration = 0;
  var realtimeClock = null;
  var lastTimestamp = null;
  var recurringTasks = new Map();

  function reset(timestamp, stateOverride, options) {
    var state = typeof stateOverride === 'undefined' ? getState() : stateOverride;
    var safeTimestamp = _finiteTimestamp(timestamp, now());
    if (options && options.fresh) realtimeClock = null;
    realtimeClock = clockMath.resetRealtimeClock(
      realtimeClock,
      safeTimestamp,
      getHullSnapshot(state)
    );
    lastTimestamp = safeTimestamp;
    return realtimeClock;
  }

  function _scheduleNextFrame() {
    if (!running || frameId !== null) return frameId;
    var scheduledGeneration = frameGeneration;
    var nextFrameId = null;
    nextFrameId = requestFrame(function (timestamp) {
      // cancelAnimationFrame cannot retract a callback that is already queued.
      // Generation + ownership checks prevent that stale callback from clearing
      // or extending the next session's frame chain.
      if (scheduledGeneration !== frameGeneration || !running || frameId !== nextFrameId) return;
      frameId = null;
      tick(timestamp);
      _scheduleNextFrame();
    });
    if (nextFrameId === null || typeof nextFrameId === 'undefined') {
      // 无 RAF 的环境不能保持“running 但永远无下一帧”的假状态。
      running = false;
      frameId = null;
      return null;
    }
    frameId = nextFrameId;
    return frameId;
  }

  function tick(timestamp) {
    var safeTimestamp = _finiteTimestamp(timestamp, now());
    var state = getState();
    lastTimestamp = safeTimestamp;

    if (state) {
      if (isPaused(state, safeTimestamp)) {
        reset(safeTimestamp, state);
      } else {
        if (!realtimeClock) reset(safeTimestamp, state);
        var tickResult = clockMath.consumeElapsedDays(
          realtimeClock,
          safeTimestamp,
          getDayDurationMs(state)
        ) || { elapsedDays: 0 };
        var elapsedDays = Math.max(0, Number.isFinite(tickResult.elapsedDays)
          ? Math.floor(tickResult.elapsedDays)
          : 0);
        if (elapsedDays > 0) {
          onElapsedDays(elapsedDays, {
            state: state,
            timestamp: safeTimestamp,
            clock: realtimeClock,
            tickResult: tickResult,
          });
        }
      }
    }

    renderFrame(state, safeTimestamp);
    return getSnapshot();
  }

  function start() {
    stopFrames();
    running = true;
    var startedAt = _finiteTimestamp(now(), 0);
    // start 表示一个新的运行会话；旧 state 未满一天的余量不得继承。
    reset(startedAt, undefined, { fresh: true });
    tick(startedAt);
    _scheduleNextFrame();
    return getSnapshot();
  }

  function stopFrames() {
    running = false;
    frameGeneration += 1;
    if (frameId !== null) cancelFrame(frameId);
    frameId = null;
    return getSnapshot();
  }

  function startRecurring(id, callback, intervalMs, options) {
    if (typeof id !== 'string' || !id.trim() || typeof callback !== 'function') return false;
    var taskId = id.trim();
    var safeIntervalMs = Math.max(1, Number.isFinite(intervalMs) ? Math.floor(intervalMs) : 1);
    stopRecurring(taskId);

    var task = {
      id: taskId,
      callback: callback,
      intervalMs: safeIntervalMs,
      intervalId: null,
      kickoffId: null,
    };
    function runCurrentTask() {
      if (recurringTasks.get(taskId) !== task) return;
      var currentState = getState();
      // Named game tasks share the same pause contract as realtime-day ticks:
      // hidden pages, tutorials and blocking transactions must not advance them.
      if (!currentState || isPaused(currentState, now())) return;
      callback();
    }

    // 先登记身份，再交给 scheduler。即使测试 scheduler 同步触发，或浏览器
    // 在 clearInterval 前已把旧 callback 排队，只有当前同名任务可以提交动作。
    recurringTasks.set(taskId, task);
    try {
      task.intervalId = setRecurringInterval(runCurrentTask, safeIntervalMs);
      if (!options || options.immediate !== false) {
        task.kickoffId = setKickoffTimeout(function () {
          task.kickoffId = null;
          runCurrentTask();
        }, 0);
      }
    } catch (error) {
      if (task.intervalId !== null) clearRecurringInterval(task.intervalId);
      recurringTasks.delete(taskId);
      throw error;
    }
    return true;
  }

  function stopRecurring(id) {
    var task = typeof id === 'string' ? recurringTasks.get(id) : null;
    if (!task) return false;
    if (task.kickoffId !== null) clearKickoffTimeout(task.kickoffId);
    if (task.intervalId !== null) clearRecurringInterval(task.intervalId);
    recurringTasks.delete(id);
    return true;
  }

  function isRecurring(id) {
    return typeof id === 'string' && recurringTasks.has(id);
  }

  function stop() {
    stopFrames();
    Array.from(recurringTasks.keys()).forEach(stopRecurring);
    return getSnapshot();
  }

  function dispose() {
    stop();
    realtimeClock = null;
    lastTimestamp = null;
    return getSnapshot();
  }

  function getSnapshot() {
    return Object.freeze({
      running: running,
      frameScheduled: frameId !== null,
      frameId: frameId,
      frameGeneration: frameGeneration,
      lastTimestamp: lastTimestamp,
      clock: realtimeClock,
      recurringTasks: Object.freeze(Array.from(recurringTasks.values()).map(function (task) {
        return Object.freeze({ id: task.id, intervalMs: task.intervalMs });
      })),
    });
  }

  return Object.freeze({
    start: start,
    stop: stop,
    stopFrames: stopFrames,
    reset: reset,
    tick: tick,
    startRecurring: startRecurring,
    stopRecurring: stopRecurring,
    isRecurring: isRecurring,
    dispose: dispose,
    getSnapshot: getSnapshot,
  });
}
