// js/core/DialogueRuntimeController.js — 延迟剧情运行时与会话安全场景队列
//
// 本模块拥有 DialogueSystem/DialogueUI 的动态加载、队列、重置和 dispose。
// 队列项只保存 session token，不把旧 state 引用提交到新会话。

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError('DialogueRuntimeController requires ' + label + '.');
  }
  return value;
}

function _defaultLoadRuntime() {
  return Promise.all([
    import('../systems/story/DialogueSystem.js'),
    import('../ui/DialogueUI.js'),
  ]).then(function (modules) {
    return { Dialogue: modules[0], DialogueUI: modules[1] };
  });
}

function _ensureStoryState(state) {
  if (!state || typeof state !== 'object') return;
  if (!state.storyFlags || typeof state.storyFlags !== 'object' || Array.isArray(state.storyFlags)) {
    state.storyFlags = {};
  }
  if (!state.storyDecisions || typeof state.storyDecisions !== 'object' || Array.isArray(state.storyDecisions)) {
    state.storyDecisions = {};
  }
}

function _normalizeRuntime(runtime) {
  return runtime && runtime.Dialogue && runtime.DialogueUI ? runtime : null;
}

export function createDialogueRuntimeController(dependencies) {
  var deps = dependencies || {};
  var hooks = deps.hooks || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var getSessionToken = _requiredFunction(deps.getSessionToken, 'getSessionToken');
  var isSessionTokenCurrent = _requiredFunction(deps.isSessionTokenCurrent, 'isSessionTokenCurrent');
  var loadRuntime = typeof deps.loadRuntime === 'function' ? deps.loadRuntime : _defaultLoadRuntime;
  var setTelemetryState = typeof hooks.setTelemetryState === 'function' ? hooks.setTelemetryState : _noop;
  var reportFailure = typeof hooks.reportFailure === 'function' ? hooks.reportFailure : _noop;
  var onCompletedQuest = typeof hooks.onCompletedQuest === 'function' ? hooks.onCompletedQuest : _noop;

  var runtime = null;
  var loadPromise = null;
  var queue = [];
  var playing = false;
  var playbackSequence = 0;
  var activePlaybackId = null;
  var disposed = false;
  var generation = 0;
  var lastError = null;
  var completedSceneCount = 0;

  function _initialize(targetRuntime, state, hideScene) {
    if (!targetRuntime || !state) return false;
    targetRuntime.Dialogue.init(state);
    targetRuntime.DialogueUI.init();
    if (hideScene) targetRuntime.DialogueUI.hideScene();
    return true;
  }

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
      .then(function (loadedRuntime) {
        if (disposed) return null;
        var normalized = _normalizeRuntime(loadedRuntime);
        if (!normalized) throw new Error('Dialogue runtime modules are incomplete.');
        runtime = normalized;
        _initialize(runtime, getState(), false);
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

  function _drain() {
    if (disposed || playing || queue.length === 0) return;

    var next = queue.shift();
    if (!next || next.generation !== generation || !isSessionTokenCurrent(next.token)) {
      _drain();
      return;
    }

    playing = true;
    var playbackId = ++playbackSequence;
    activePlaybackId = playbackId;
    next.runtime.DialogueUI.showScene(next.scene, function (result) {
      // hide/reset 后第三方 UI 即使迟到回调，也不能清除新场景的 playing 状态。
      if (activePlaybackId !== playbackId) return;
      if (!disposed && next.generation === generation && isSessionTokenCurrent(next.token)) {
        var state = getState();
        next.runtime.Dialogue.finalizeScene(state, next.scene && next.scene.id, result || {});
        completedSceneCount += 1;
        if (typeof next.onAfter === 'function') next.onAfter();
      }
      playing = false;
      activePlaybackId = null;
      _drain();
    });
  }

  function queueScenes(scenes, onFinished, targetRuntime, token) {
    var items = Array.isArray(scenes) ? scenes.filter(Boolean) : [];
    if (items.length === 0) {
      if (typeof onFinished === 'function' && (!token || isSessionTokenCurrent(token))) onFinished();
      return 0;
    }

    var activeRuntime = _normalizeRuntime(targetRuntime || runtime);
    var activeToken = token || getSessionToken();
    if (!activeRuntime || !isSessionTokenCurrent(activeToken) || disposed) return 0;
    items.forEach(function (scene, index) {
      queue.push({
        scene: scene,
        onAfter: index === items.length - 1 ? onFinished : null,
        runtime: activeRuntime,
        token: activeToken,
        generation: generation,
      });
    });
    _drain();
    return items.length;
  }

  function queueTriggers(triggers, onFinished) {
    var requests = Array.isArray(triggers) ? triggers.filter(Boolean) : [];
    var token = getSessionToken();
    if (requests.length === 0) {
      if (typeof onFinished === 'function') onFinished();
      return Promise.resolve(0);
    }

    return load().then(function (activeRuntime) {
      if (!activeRuntime) {
        if (isSessionTokenCurrent(token) && typeof onFinished === 'function') onFinished();
        return 0;
      }
      if (!isSessionTokenCurrent(token) || disposed) return 0;

      var state = getState();
      _initialize(activeRuntime, state, false);
      var scenes = [];
      requests.forEach(function (request) {
        scenes = scenes.concat(activeRuntime.Dialogue.getScenesForTrigger(
          state,
          request.triggerType,
          request.context || {}
        ));
      });
      return queueScenes(scenes, onFinished, activeRuntime, token);
    });
  }

  function playTrigger(triggerType, context, onFinished) {
    return queueTriggers([{
      triggerType: triggerType,
      context: context || {},
    }], onFinished);
  }

  function queueQuestResult(result, onFinished) {
    if (!result) return Promise.resolve(0);

    var triggers = [];
    var hasCompletedQuest = false;
    if (Array.isArray(result.completedQuests)) {
      result.completedQuests.forEach(function (entry) {
        if (!entry || entry.failed) return;
        hasCompletedQuest = true;
        triggers.push({
          triggerType: 'quest_complete',
          context: { questId: entry.id, quest: entry.quest || null },
        });
      });
    }
    if (result.phaseAdvanced && result.newPhase) {
      triggers.push({
        triggerType: 'phase_unlock',
        context: { phaseId: result.newPhase.id, phase: result.newPhase },
      });
    }

    return queueTriggers(triggers, function () {
      if (hasCompletedQuest) onCompletedQuest(result);
      if (typeof onFinished === 'function') onFinished();
    });
  }

  function reset(state) {
    generation += 1;
    queue = [];
    playing = false;
    activePlaybackId = null;
    _ensureStoryState(state);
    if (runtime) _initialize(runtime, state, true);
    setTelemetryState(_telemetryState());
    return getDiagnostics();
  }

  function dispose() {
    if (disposed) return getDiagnostics();
    generation += 1;
    queue = [];
    playing = false;
    activePlaybackId = null;
    disposed = true;
    if (runtime && runtime.DialogueUI) {
      if (typeof runtime.DialogueUI.destroy === 'function') runtime.DialogueUI.destroy();
      else if (typeof runtime.DialogueUI.hideScene === 'function') runtime.DialogueUI.hideScene();
    }
    setTelemetryState('disposed');
    return getDiagnostics();
  }

  function getDiagnostics() {
    return Object.freeze({
      state: disposed ? 'disposed' : _telemetryState(),
      disposed: disposed,
      loaded: !!runtime,
      loading: !!loadPromise && !runtime,
      playing: playing,
      queuedSceneCount: queue.length,
      completedSceneCount: completedSceneCount,
      generation: generation,
      lastError: lastError,
    });
  }

  return Object.freeze({
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    load: load,
    playTrigger: playTrigger,
    queueQuestResult: queueQuestResult,
    queueScenes: queueScenes,
    queueTriggers: queueTriggers,
    reset: reset,
  });
}
