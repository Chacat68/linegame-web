import { describe, expect, it } from 'vitest';
import { createSceneMotionClock } from '../js/ui/SceneMotionClock.js';

describe('场景装饰时间', () => {
  it('30、60、120 Hz 下同一秒的动画进度一致', () => {
    for (const fps of [30, 60, 120]) {
      const clock = createSceneMotionClock();
      for (let frame = 0; frame <= fps; frame++) clock.advance(frame * 1000 / fps, true);
      expect(clock.elapsed).toBeCloseTo(1000);
    }
  });

  it('关闭动态或隐藏再返回时，不追赶后台经过的时间', () => {
    const clock = createSceneMotionClock();
    clock.advance(0, true);
    clock.advance(20, true);
    clock.advance(40, false);
    clock.advance(10000, false);
    expect(clock.advance(20000, true)).toEqual({ elapsed: 20, delta: 0 });
    clock.suspend();
    expect(clock.advance(30000, true)).toEqual({ elapsed: 20, delta: 0 });
    expect(clock.advance(30020, true)).toEqual({ elapsed: 40, delta: 20 });
  });

  it('长帧限幅，时钟回退时不产生负动画步长', () => {
    const clock = createSceneMotionClock();
    clock.advance(0, true);
    expect(clock.advance(1000, true).delta).toBe(100);
    expect(clock.advance(900, true).delta).toBe(0);
  });
});
