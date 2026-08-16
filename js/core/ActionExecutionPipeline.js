// js/core/ActionExecutionPipeline.js — 玩家动作的统一提交顺序
//
// mutate 只运行领域系统；postEffects 在成功后补齐统计、任务与持久化；
// 最后才发布消息、刷新视图并检查成就/胜利，避免消费者读取半更新 state。

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('ActionExecutionPipeline requires ' + label + '.');
  return value;
}

export function createActionExecutionPipeline(dependencies) {
  var deps = dependencies || {};
  var emitMessage = typeof deps.emitMessage === 'function' ? deps.emitMessage : _noop;
  var emitErrorCue = typeof deps.emitErrorCue === 'function' ? deps.emitErrorCue : _noop;
  var finalizeState = typeof deps.finalizeState === 'function' ? deps.finalizeState : _noop;
  var queueAchievementCheck = typeof deps.queueAchievementCheck === 'function' ? deps.queueAchievementCheck : _noop;
  var render = typeof deps.render === 'function' ? deps.render : _noop;
  var checkVictory = typeof deps.checkVictory === 'function' ? deps.checkVictory : _noop;
  var running = false;
  var executionCount = 0;
  var lastExecution = null;

  function execute(specification) {
    var spec = specification || {};
    var mutate = _requiredFunction(spec.mutate, 'specification.mutate');
    if (running) throw new Error('ActionExecutionPipeline does not allow nested execute calls.');
    running = true;
    executionCount += 1;
    var executionId = executionCount;
    var result = null;
    var phase = 'mutating';
    try {
      result = mutate();
      if (result && result.ok && typeof spec.postEffects === 'function') {
        phase = 'post-effects';
        spec.postEffects(result);
      } else if ((!result || result.ok === false) && typeof spec.onFailure === 'function') {
        phase = 'failure-effects';
        spec.onFailure(result);
      }

      if (result && result.ok) {
        phase = 'finalizing-state';
        finalizeState(result);
      }

      phase = 'messages';
      if (result && Array.isArray(result.msgs)) {
        result.msgs.forEach(function (message) { emitMessage(message, result); });
      }
      if (result && result.ok === false) emitErrorCue(result);

      phase = 'committing';
      queueAchievementCheck(result);
      render(result);
      if (result && result.ok) checkVictory(result);

      phase = 'complete';
      lastExecution = Object.freeze({
        id: executionId,
        label: spec.label || 'action',
        ok: !!(result && result.ok),
        result: result,
        phase: phase,
      });
      return result;
    } catch (error) {
      lastExecution = Object.freeze({
        id: executionId,
        label: spec.label || 'action',
        ok: false,
        result: result,
        phase: phase,
        error: error,
      });
      throw error;
    } finally {
      running = false;
    }
  }

  function getDiagnostics() {
    return Object.freeze({ running: running, executionCount: executionCount, lastExecution: lastExecution });
  }

  return Object.freeze({ execute: execute, getDiagnostics: getDiagnostics });
}
