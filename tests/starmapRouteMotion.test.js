import { describe, expect, it } from 'vitest';
import {
  buildRouteMotionKey,
  getRouteMotionProgress,
  getRouteVisibilityMode,
  getShipTravelVisualState,
  pruneRouteMotionStates,
  resolveRouteMotionState,
} from '../js/ui/StarmapRouteMotion.js';

describe('StarmapRouteMotion', function () {
  it('新航路第一次出现时从起点开始', function () {
    const starts = new Map();
    const route = {
      id: 'ship-route-1',
      routeRevision: 3,
      startSystemId: 'sol_prime',
      endSystemId: 'fuel_depot',
      statusLabel: '🚀 前往买入地',
    };
    const motion = resolveRouteMotionState(starts, route, 240000);

    expect(buildRouteMotionKey(route)).toContain('sol_prime:fuel_depot');
    expect(getRouteMotionProgress(240000, motion.startTime, 'full')).toBe(0);
    expect(getRouteMotionProgress(241000, motion.startTime, 'full')).toBeCloseTo(5 / 12, 6);
    expect(getRouteMotionProgress(250000, motion.startTime, 'full')).toBe(1);
  });

  it('场景重建时保留同一航段的起步时间', function () {
    const starts = new Map();
    const route = { id: 'ship-route-1', startSystemId: 'sol_prime', endSystemId: 'fuel_depot' };

    expect(resolveRouteMotionState(starts, route, 1000).startTime).toBe(1000);
    expect(resolveRouteMotionState(starts, route, 1500).startTime).toBe(1000);
  });

  it('上一航段完成前保持旧航路，完成后再进入下一地点', function () {
    const states = new Map();
    const oldRoute = { id: 'ship-route-1', startSystemId: 'sol_prime', endSystemId: 'fuel_depot', isTraveling: true };
    const nextRoute = { id: 'ship-route-1', startSystemId: 'fuel_depot', endSystemId: 'nova_station', isTraveling: true };

    resolveRouteMotionState(states, oldRoute, 1000);
    const pending = resolveRouteMotionState(states, nextRoute, 2000);
    const advanced = resolveRouteMotionState(states, nextRoute, 3400);

    expect(pending.route.startSystemId).toBe('sol_prime');
    expect(pending.route.endSystemId).toBe('fuel_depot');
    expect(pending.hasPendingRoute).toBe(true);
    expect(advanced.route.startSystemId).toBe('fuel_depot');
    expect(advanced.route.endSystemId).toBe('nova_station');
    expect(advanced.startTime).toBe(3400);
  });

  it('港内作业切换到新航段时立即让飞船从新起点出现', function () {
    const states = new Map();
    const docked = { id: 'ship-route-1', startSystemId: 'sol_prime', endSystemId: 'fuel_depot', isTraveling: false };
    const departed = { id: 'ship-route-1', startSystemId: 'fuel_depot', endSystemId: 'nova_station', isTraveling: true };

    resolveRouteMotionState(states, docked, 1000);
    const motion = resolveRouteMotionState(states, departed, 1100);

    expect(motion.route.startSystemId).toBe('fuel_depot');
    expect(motion.route.endSystemId).toBe('nova_station');
    expect(motion.startTime).toBe(1100);
    expect(motion.hasPendingRoute).toBe(false);
  });

  it('关闭动态效果时静置展示航行状态，但航段计时仍会结束', function () {
    expect(getRouteMotionProgress(1200, 1000, 'off', 1000)).toBe(0.5);
    expect(getRouteMotionProgress(2000, 1000, 'off', 1000)).toBe(1);
  });

  it('统一识别场内航行、跃入、跃出和场外航段', function () {
    expect(getRouteVisibilityMode(true, true)).toBe('local');
    expect(getRouteVisibilityMode(false, true)).toBe('entering');
    expect(getRouteVisibilityMode(true, false)).toBe('exiting');
    expect(getRouteVisibilityMode(false, false)).toBe('hidden');
  });

  it('为飞船起航和抵达提供渐显、巡航与渐隐状态', function () {
    const start = getShipTravelVisualState(0, 'full', 'local');
    const cruise = getShipTravelVisualState(0.5, 'full', 'local');
    const arrival = getShipTravelVisualState(0.94, 'full', 'local');
    const done = getShipTravelVisualState(1, 'full', 'local');

    expect(start.phase).toBe('hidden');
    expect(cruise.phase).toBe('cruise');
    expect(cruise.opacity).toBe(1);
    expect(arrival.phase).toBe('disappearing');
    expect(arrival.opacity).toBeLessThan(1);
    expect(done.opacity).toBe(0);
  });

  it('清理已经不在星图中的航路状态', function () {
    const states = new Map([
      ['ship-route-1', { startTime: 1000 }],
      ['ship-route-2', { startTime: 2000 }],
    ]);

    pruneRouteMotionStates(states, new Set(['ship-route-2']));

    expect(states.has('ship-route-1')).toBe(false);
    expect(states.has('ship-route-2')).toBe(true);
  });
});
