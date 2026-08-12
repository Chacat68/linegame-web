// js/core/GameSessionLifecycle.js — 游戏会话切换的统一编排器
//
// begin() 负责停止旧会话、替换 state 并恢复有状态系统；present() 在 UI 壳
// 已就绪后同步投影、渲染并恢复计时。冷启动可以延迟 present，手动读档则
// 直接使用 transition()。两条路径共享同一套顺序和 stale-token 防护。

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError('GameSessionLifecycle requires ' + label + '.');
  }
  return value;
}

function _safeReason(options) {
  return options && typeof options.reason === 'string' && options.reason.trim()
    ? options.reason.trim()
    : 'session-transition';
}

export function createGameSessionLifecycle(dependencies) {
  var deps = dependencies || {};
  var runtime = deps.runtime || {};
  var clock = deps.clock || {};
  var hooks = deps.hooks || {};
  var replaceState = _requiredFunction(deps.replaceState, 'replaceState');
  var getSessionToken = _requiredFunction(deps.getSessionToken, 'getSessionToken');
  var isSessionTokenCurrent = _requiredFunction(deps.isSessionTokenCurrent, 'isSessionTokenCurrent');
  var restoreSystems = _requiredFunction(runtime.restore, 'runtime.restore');
  var stopClock = typeof clock.stop === 'function' ? clock.stop : _noop;
  var startClock = typeof clock.start === 'function' ? clock.start : _noop;
  var resetTransients = typeof hooks.resetTransients === 'function' ? hooks.resetTransients : _noop;
  var prepareState = typeof hooks.prepareState === 'function' ? hooks.prepareState : _noop;
  var syncProjections = typeof hooks.syncProjections === 'function' ? hooks.syncProjections : _noop;
  var render = typeof hooks.render === 'function' ? hooks.render : _noop;
  var resumeRecurring = typeof hooks.resumeRecurring === 'function' ? hooks.resumeRecurring : _noop;
  var restorePendingEvent = typeof hooks.restorePendingEvent === 'function' ? hooks.restorePendingEvent : _noop;
  var transitionSequence = 0;
  var phase = 'idle';
  var disposed = false;
  var activeTransition = null;
  var lastPresentation = null;
  var lastError = null;

  function _assertAvailable() {
    if (disposed) throw new Error('GameSessionLifecycle has been disposed.');
  }

  function _context(nextState, options) {
    var config = options || {};
    return {
      id: transitionSequence + 1,
      state: nextState,
      token: null,
      reason: _safeReason(config),
      mode: config.mode || 'replace',
      restoreEconomy: config.restoreEconomy !== false,
      restoreGalaxy: config.restoreGalaxy !== false,
      restoreRandomRuntime: config.restoreRandomRuntime !== false,
      syncDifficulty: config.syncDifficulty === true,
      restorePendingEvent: config.restorePendingEvent === true,
      metadata: config.metadata || null,
    };
  }

  function begin(nextState, options) {
    _assertAvailable();
    if (!nextState || typeof nextState !== 'object') {
      throw new TypeError('GameSessionLifecycle.begin requires a state object.');
    }

    var context = _context(nextState, options);
    transitionSequence = context.id;
    lastError = null;

    try {
      phase = 'stopping';
      stopClock(context);

      phase = 'resetting';
      resetTransients(context);

      phase = 'replacing';
      context.state = replaceState(nextState, context.reason);
      context.token = getSessionToken();
      prepareState(context.state, context);

      phase = 'restoring';
      context.restoreResult = restoreSystems(context.state, {
        reason: context.reason,
        sessionToken: context.token,
        restoreEconomy: context.restoreEconomy,
        restoreGalaxy: context.restoreGalaxy,
      });

      activeTransition = Object.freeze({
        id: context.id,
        state: context.state,
        token: context.token,
        reason: context.reason,
        mode: context.mode,
        restorePendingEvent: context.restorePendingEvent,
        metadata: context.metadata,
        context: context,
      });
      phase = 'restored';
      return activeTransition;
    } catch (error) {
      phase = 'error';
      lastError = error;
      activeTransition = null;
      throw error;
    }
  }

  function present(transition, options) {
    _assertAvailable();
    var target = transition || activeTransition;
    if (!target || target !== activeTransition) return null;
    if (lastPresentation && lastPresentation.transitionId === target.id) return lastPresentation;
    if (!isSessionTokenCurrent(target.token)) {
      phase = 'stale';
      return null;
    }

    var config = options || {};
    var context = target.context;
    var shouldRestorePending = typeof config.restorePendingEvent === 'boolean'
      ? config.restorePendingEvent
      : target.restorePendingEvent;

    try {
      phase = 'projecting';
      syncProjections(target.state, context);

      phase = 'rendering';
      render(target.state, context);

      phase = 'resuming';
      resumeRecurring(target.state, context);
      startClock(context);

      if (shouldRestorePending) restorePendingEvent(target.state, context);

      lastPresentation = Object.freeze({
        transitionId: target.id,
        state: target.state,
        token: target.token,
        reason: target.reason,
        mode: target.mode,
      });
      phase = 'running';
      return lastPresentation;
    } catch (error) {
      phase = 'error';
      lastError = error;
      // 投影或恢复计时失败时保持停止，避免半恢复会话继续推进。
      stopClock(context);
      throw error;
    }
  }

  function transition(nextState, options) {
    var begun = begin(nextState, options);
    if (options && options.deferPresent) return begun;
    return present(begun, options);
  }

  function dispose() {
    if (disposed) return getDiagnostics();
    stopClock({ reason: 'dispose', mode: 'dispose' });
    disposed = true;
    phase = 'disposed';
    activeTransition = null;
    return getDiagnostics();
  }

  function getDiagnostics() {
    return Object.freeze({
      phase: phase,
      disposed: disposed,
      transitionCount: transitionSequence,
      activeTransition: activeTransition,
      lastPresentation: lastPresentation,
      lastError: lastError,
    });
  }

  return Object.freeze({
    begin: begin,
    present: present,
    transition: transition,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
  });
}
