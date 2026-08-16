// js/core/GameApplicationLifecycle.js — 应用级 shutdown 编排
//
// Session transition 负责替换一次游戏状态；本模块只负责整个应用实例退出时，
// 按依赖反序停止时钟、取消异步 controller、释放 UI/Feature/Renderer，最后
// 解除组合根引用。缺失的惰性 runtime 不会因 shutdown 被反向创建。

export const APPLICATION_SHUTDOWN_STAGES = Object.freeze([
  Object.freeze({ id: 'sessionLifecycle', method: 'dispose' }),
  Object.freeze({ id: 'gameLoop', method: 'dispose' }),
  Object.freeze({ id: 'dialogue', method: 'dispose' }),
  Object.freeze({ id: 'randomEvent', method: 'dispose' }),
  Object.freeze({ id: 'achievement', method: 'dispose' }),
  Object.freeze({ id: 'victory', method: 'reset' }),
  Object.freeze({ id: 'guidance', method: 'reset' }),
  Object.freeze({ id: 'ui', method: 'dispose' }),
  Object.freeze({ id: 'features', method: 'disposeAll' }),
  Object.freeze({ id: 'renderer', method: 'dispose' }),
  Object.freeze({ id: 'eventUi', method: 'clearPendingEvent' }),
]);

function _requiredFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError('GameApplicationLifecycle requires ' + label + '.');
  }
  return value;
}

function _freezeError(stage, error) {
  return Object.freeze({ stage: stage, error: error });
}

export function createGameApplicationLifecycle(dependencies) {
  var deps = dependencies || {};
  var getRuntime = _requiredFunction(deps.getRuntime, 'getRuntime');
  var release = _requiredFunction(deps.release, 'release');
  var reportError = typeof deps.reportError === 'function' ? deps.reportError : function () {};
  var disposed = false;
  var shutdownCount = 0;
  var lastShutdown = null;

  function shutdown(options) {
    if (disposed) return lastShutdown;
    var config = typeof options === 'string' ? { reason: options } : (options || {});
    var reason = config.reason || 'application-shutdown';
    var completedStages = [];
    var errors = [];
    disposed = true;
    shutdownCount += 1;

    APPLICATION_SHUTDOWN_STAGES.forEach(function (stage) {
      var runtime = null;
      try {
        runtime = getRuntime(stage.id);
        if (!runtime || typeof runtime[stage.method] !== 'function') return;
        runtime[stage.method]({ reason: reason, mode: 'application-shutdown' });
        completedStages.push(stage.id);
      } catch (error) {
        errors.push(_freezeError(stage.id, error));
        reportError(stage.id, error);
      }
    });

    try {
      release({ reason: reason, mode: 'application-shutdown' });
      completedStages.push('release');
    } catch (error) {
      errors.push(_freezeError('release', error));
      reportError('release', error);
    }

    lastShutdown = Object.freeze({
      reason: reason,
      shutdownCount: shutdownCount,
      completedStages: Object.freeze(completedStages.slice()),
      errors: Object.freeze(errors.slice()),
    });
    return lastShutdown;
  }

  function getDiagnostics() {
    return Object.freeze({
      disposed: disposed,
      shutdownCount: shutdownCount,
      lastShutdown: lastShutdown,
    });
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    shutdown: shutdown,
  });
}
