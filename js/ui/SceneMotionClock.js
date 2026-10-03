// 装饰动画只累计可见时间；航行与游戏日历继续使用各自的真实时间。
export function createSceneMotionClock() {
  let previous = null;
  let elapsed = 0;
  return {
    get elapsed() { return elapsed; },
    advance(now, enabled) {
      const delta = enabled && previous !== null ? Math.max(0, Math.min(100, now - previous)) : 0;
      previous = enabled ? now : null;
      elapsed += delta;
      return { elapsed, delta };
    },
    suspend() { previous = null; },
  };
}
