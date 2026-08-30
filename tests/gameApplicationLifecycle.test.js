import { describe, expect, it, vi } from 'vitest';
import {
  APPLICATION_SHUTDOWN_STAGES,
  createGameApplicationLifecycle,
} from '../js/core/GameApplicationLifecycle.js';

function createHarness(options) {
  var config = options || {};
  var trace = [];
  var runtimes = Object.create(null);
  APPLICATION_SHUTDOWN_STAGES.forEach(function (stage) {
    runtimes[stage.id] = {};
    runtimes[stage.id][stage.method] = vi.fn(function () {
      trace.push(stage.id);
      if (config.failStage === stage.id) throw new Error('failed:' + stage.id);
    });
  });
  var reportError = vi.fn();
  var release = vi.fn(function () { trace.push('release'); });
  var lifecycle = createGameApplicationLifecycle({
    getRuntime: function (id) {
      return config.missingStage === id ? null : runtimes[id];
    },
    release: release,
    reportError: reportError,
  });
  return {
    lifecycle: lifecycle,
    release: release,
    reportError: reportError,
    runtimes: runtimes,
    trace: trace,
  };
}

describe('GameApplicationLifecycle', function () {
  it('按依赖反序释放应用 runtime，且重复 shutdown 幂等', function () {
    var harness = createHarness();
    expect(APPLICATION_SHUTDOWN_STAGES.find(function (stage) { return stage.id === 'eventUi'; })).toEqual({
      id: 'eventUi', method: 'dispose',
    });
    var result = harness.lifecycle.shutdown({ reason: 'test-shutdown' });

    expect(harness.trace).toEqual(
      APPLICATION_SHUTDOWN_STAGES.map(function (stage) { return stage.id; }).concat('release')
    );
    expect(result.reason).toBe('test-shutdown');
    expect(result.completedStages).toEqual(harness.trace);
    expect(result.errors).toEqual([]);
    expect(harness.lifecycle.shutdown('ignored')).toBe(result);
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.lifecycle.getDiagnostics()).toEqual({
      disposed: true,
      shutdownCount: 1,
      lastShutdown: result,
    });
  });

  it('单个释放阶段失败不会阻断后续 UI/Feature/Renderer 与组合根释放', function () {
    var harness = createHarness({ failStage: 'gameLoop' });
    var result = harness.lifecycle.shutdown('failure-isolation');

    expect(result.completedStages).not.toContain('gameLoop');
    expect(harness.trace.at(-1)).toBe('release');
    expect(harness.trace).toContain('renderer');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].stage).toBe('gameLoop');
    expect(harness.reportError).toHaveBeenCalledWith('gameLoop', expect.any(Error));
    expect(harness.release).toHaveBeenCalledOnce();
  });

  it('未实例化的惰性 runtime 被跳过而不会影响其余 shutdown', function () {
    var harness = createHarness({ missingStage: 'features' });
    var result = harness.lifecycle.shutdown('lazy-runtime');

    expect(harness.trace).not.toContain('features');
    expect(result.completedStages).not.toContain('features');
    expect(result.completedStages).toContain('ui');
    expect(result.completedStages).toContain('renderer');
    expect(result.completedStages.at(-1)).toBe('release');
  });
});
