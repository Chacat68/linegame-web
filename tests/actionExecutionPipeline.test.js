import { describe, expect, it } from 'vitest';
import { createActionExecutionPipeline } from '../js/core/ActionExecutionPipeline.js';

function createPipeline(trace, renderedSpecs) {
  return createActionExecutionPipeline({
    emitMessage: function () { trace.push('message'); },
    emitErrorCue: function () { trace.push('error-cue'); },
    finalizeState: function () { trace.push('finalize-state'); },
    queueAchievementCheck: function () { trace.push('achievement'); },
    render: function (result, specification) {
      trace.push('render');
      if (renderedSpecs) renderedSpecs.push({ result: result, specification: specification });
    },
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

  it('把动作声明的 dirtyRegions 原样交给最终渲染提交边界', function () {
    var trace = [];
    var rendered = [];
    var pipeline = createPipeline(trace, rendered);
    var dirtyRegions = ['shell', 'active-workspace', 'guide'];

    pipeline.execute({
      label: 'fleet.buy',
      dirtyRegions: dirtyRegions,
      mutate: function () { return { ok: true }; },
    });

    expect(rendered).toHaveLength(1);
    expect(rendered[0].specification.dirtyRegions).toBe(dirtyRegions);
    expect(rendered[0].result).toEqual({ ok: true });
  });

  it('把动作声明的 logSource 原样交给每条结果消息', function () {
    var emitted = [];
    var pipeline = createActionExecutionPipeline({
      emitMessage: function (message, result, source) {
        emitted.push({ message: message, result: result, source: source });
      },
    });
    var result = {
      ok: true,
      msgs: [{ text: '科研完成' }, { text: '已解锁技术' }],
    };

    pipeline.execute({
      label: 'research.complete',
      logSource: 'research',
      mutate: function () { return result; },
    });

    expect(emitted).toEqual([
      { message: result.msgs[0], result: result, source: 'research' },
      { message: result.msgs[1], result: result, source: 'research' },
    ]);
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
