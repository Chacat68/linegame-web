import { describe, expect, it } from 'vitest';
import { createActionExecutionPipeline } from '../js/core/ActionExecutionPipeline.js';

function createPipeline(trace) {
  return createActionExecutionPipeline({
    emitMessage: function () { trace.push('message'); },
    emitErrorCue: function () { trace.push('error-cue'); },
    finalizeState: function () { trace.push('finalize-state'); },
    queueAchievementCheck: function () { trace.push('achievement'); },
    render: function () { trace.push('render'); },
    checkVictory: function () { trace.push('victory'); },
  });
}

describe('ActionExecutionPipeline', function () {
  it('成功动作在完整 post-effects 后才发布消息、渲染、成就与胜利', function () {
    var trace = [];
    var pipeline = createPipeline(trace);
    var result = { ok: true, msgs: [{ text: 'done' }] };

    expect(pipeline.execute({
      label: 'trade.buy',
      mutate: function () { trace.push('mutate'); return result; },
      postEffects: function () { trace.push('post-effects'); },
    })).toBe(result);

    expect(trace).toEqual([
      'mutate', 'post-effects', 'finalize-state', 'message', 'achievement', 'render', 'victory',
    ]);
    expect(pipeline.getDiagnostics().lastExecution).toMatchObject({ label: 'trade.buy', ok: true, phase: 'complete' });
  });

  it('失败动作跳过成功后置效果和胜利，但仍发布错误与刷新', function () {
    var trace = [];
    var pipeline = createPipeline(trace);

    pipeline.execute({
      mutate: function () { trace.push('mutate'); return { ok: false, msgs: [{ text: 'failed' }] }; },
      postEffects: function () { trace.push('post-effects'); },
      onFailure: function () { trace.push('failure-effects'); },
    });

    expect(trace).toEqual([
      'mutate', 'failure-effects', 'message', 'error-cue', 'achievement', 'render',
    ]);
  });

  it('成功动作在领域后置效果后统一完成派生状态', function () {
    var trace = [];
    var pipeline = createPipeline(trace);

    pipeline.execute({
      mutate: function () { trace.push('mutate'); return { ok: true }; },
      postEffects: function () { trace.push('post-effects'); },
    });

    expect(trace.indexOf('finalize-state')).toBeGreaterThan(trace.indexOf('post-effects'));
    expect(trace.indexOf('finalize-state')).toBeLessThan(trace.indexOf('render'));
  });

  it('post-effects 抛错时不提交 UI、成就或胜利', function () {
    var trace = [];
    var pipeline = createPipeline(trace);

    expect(function () {
      pipeline.execute({
        mutate: function () { trace.push('mutate'); return { ok: true }; },
        postEffects: function () { trace.push('post-effects'); throw new Error('broken'); },
      });
    }).toThrow('broken');

    expect(trace).toEqual(['mutate', 'post-effects']);
    expect(pipeline.getDiagnostics().lastExecution.phase).toBe('post-effects');
  });

  it('拒绝嵌套 execute，避免提交顺序交叉', function () {
    var trace = [];
    var pipeline = createPipeline(trace);

    expect(function () {
      pipeline.execute({ mutate: function () {
        return pipeline.execute({ mutate: function () { return { ok: true }; } });
      } });
    }).toThrow(/nested/);
  });
});
