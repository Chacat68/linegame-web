import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { applyMerchantTheme, getMerchantDisplayGalaxy } from '../js/ui/MerchantTheme.js';
import { composeMerchantScene, getPresentedSceneSystems, getMerchantExplorationSignal } from '../js/ui/MerchantScenePresentation.js';
import { buildMerchantStarmapProjection } from '../js/ui/MerchantStarmapProjection.js';
import { MERCHANT_DEFAULTS, MERCHANT_DISTANCES } from '../js/data/merchant.js';
import { createInitialState } from '../js/data/constants.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';

describe('商队星系主题与显示构图', () => {
  it('界面跟随查看星系，未知或缺失星系回退，不把船的位置当成查看位置', () => {
    expect(getMerchantDisplayGalaxy({ viewingGalaxy: 'jade_expanse', currentGalaxy: 'milky_way' })).toBe('jade_expanse');
    expect(getMerchantDisplayGalaxy({ viewingGalaxy: 'unknown', currentGalaxy: 'andromeda' })).toBe('andromeda');
    expect(getMerchantDisplayGalaxy({ viewingGalaxy: '__proto__' })).toBe('milky_way');
    expect(getMerchantDisplayGalaxy(null)).toBe('milky_way');
  });

  it('切换星系仅更新主题与环境变量，重复刷新不重写，也不覆盖利润等语义色', () => {
    const values = new Map([['--ui-success', '#b1ce9b']]);
    const writes = [];
    const body = { dataset: {}, style: { setProperty(key, value) { values.set(key, value); writes.push(key); } } };
    applyMerchantTheme({ viewingGalaxy: 'milky_way' }, body);
    const warm = values.get('--ui-accent');
    const count = writes.length;
    applyMerchantTheme({ viewingGalaxy: 'milky_way' }, body);
    expect(writes).toHaveLength(count);
    applyMerchantTheme({ viewingGalaxy: 'andromeda' }, body);
    expect(values.get('--ui-accent')).not.toBe(warm);
    expect(body.dataset.merchantGalaxy).toBe('andromeda');
    expect(values.get('--ui-success')).toBe('#b1ce9b');
    expect(values.get('--ui-scene-space')).toBeTruthy();
  });

  it('重新初始化的界面由同一份星系状态恢复主题，不依赖单独保存颜色', () => {
    const makeBody = () => ({ dataset: {}, style: { setProperty() {} } });
    const state = { viewingGalaxy: 'chrono_rift' };
    const first = makeBody(), reloaded = makeBody();
    applyMerchantTheme(state, first);
    applyMerchantTheme(JSON.parse(JSON.stringify(state)), reloaded);
    expect(reloaded.dataset.merchantGalaxy).toBe(first.dataset.merchantGalaxy);
    expect(Object.keys(state)).toEqual(['viewingGalaxy']);
  });

  it('经营场景只呈现已开放港口，开拓后再显示新星球，历史场景不受影响', () => {
    const systems = [{ id: 'sol_prime' }, { id: 'old-station' }, { id: 'nebula_forge' }];
    const state = { merchant: { unlockedPorts: ['sol_prime', 'mineral_belt'] } };
    expect(getPresentedSceneSystems(systems, state).map(system => system.id)).toEqual(['sol_prime']);
    state.merchant.unlockedPorts.push('nebula_forge');
    expect(getPresentedSceneSystems(systems, state).map(system => system.id)).toEqual(['sol_prime', 'nebula_forge']);
    expect(getPresentedSceneSystems(systems, {})).toBe(systems);
    const distant = [{ id: 'andromeda-port' }];
    expect(getPresentedSceneSystems(distant, state)).toEqual([]);
  });

  it('紧凑构图不写回地点数据，也不改变实际贸易距离', () => {
    const distanceSnapshot = JSON.stringify(MERCHANT_DISTANCES);
    const positions = new Map([['sol_prime', new Vector3(100, 0, 100)], ['mineral_belt', new Vector3(300, 0, 300)]]);
    composeMerchantScene(positions, { merchant: {} });
    expect(positions.get('sol_prime').distanceTo(positions.get('mineral_belt'))).toBeLessThan(100);
    expect(JSON.stringify(MERCHANT_DISTANCES)).toBe(distanceSnapshot);
    const legacy = new Map([['sol_prime', new Vector3(100, 0, 100)]]);
    composeMerchantScene(legacy, {});
    expect(legacy.get('sol_prime').toArray()).toEqual([100, 0, 100]);
  });

  it('航次去返程不会抢占玩家查看的星系，也不修改原存档', () => {
    const merchant = JSON.parse(JSON.stringify(MERCHANT_DEFAULTS));
    merchant.tasks = [{ id: 'task-1', from: 'sol_prime', to: 'mineral_belt' }];
    Object.assign(merchant.ships[0], { taskId: 'task-1', phase: 'outbound', departAt: 100, arriveAt: 200 });
    const state = { merchant, viewingGalaxy: 'jade_expanse', currentGalaxy: 'milky_way' };
    const before = JSON.stringify(state);
    expect(buildMerchantStarmapProjection(state, 150).viewingGalaxy).toBe('jade_expanse');
    expect(JSON.stringify(state)).toBe(before);
    merchant.ships[0].phase = 'return';
    expect(buildMerchantStarmapProjection(state, 150).viewingGalaxy).toBe('jade_expanse');
  });

  it('探索只显示未知信号与真实去返程，勘察停船，完整返港后才出现新港模型', () => {
    const start = 1_800_000_000_000;
    const state = createInitialState({ viewingGalaxy: 'jade_expanse' });
    state.merchant.companyLevel = 2; state.merchant.exploration.rngState = 42;
    Merchant.init(state, start); Merchant.advance(state, start);
    const systems = [{ id: 'sol_prime' }, { id: 'mineral_belt' }, { id: 'nebula_forge' }];
    const presented = () => getPresentedSceneSystems(systems, state).map(system => system.id);
    const project = now => {
      const before = structuredClone(state), result = buildMerchantStarmapProjection(state, now);
      expect(state).toEqual(before);
      expect(result.viewingGalaxy).toBe('jade_expanse');
      return result.merchantStarmapRoutes;
    };
    expect(getMerchantExplorationSignal(state)).toBeNull();
    Merchant.advance(state, state.merchant.exploration.nextEventAt);
    const event = state.merchant.exploration.event, beganAt = state.merchant.lastTickAt;
    expect(getMerchantExplorationSignal(state)).toBe(event);
    expect(presented()).toEqual(['sol_prime', 'mineral_belt']);
    expect(project(beganAt)).toEqual([]);
    expect(Merchant.command(state, 'explore', { eventId: event.id, shipId: 'ship-1' }, beganAt).ok).toBe(true);
    const halfLeg = Math.floor(event.legMs / 2);
    let [route] = project(beganAt + halfLeg);
    expect(route).toMatchObject({ source: 'exploration', startSystemId: 'sol_prime', endSystemId: 'nebula_forge', isMoving: true, statusLabel: '探索去程' });
    expect(route.progress).toBeCloseTo(.5, 4);
    Merchant.advance(state, beganAt + event.legMs);
    [route] = project(state.merchant.lastTickAt);
    expect(route).toMatchObject({ progress: 1, isMoving: false, statusLabel: '勘察中' });
    expect(presented()).toEqual(['sol_prime', 'mineral_belt']);
    expect(getMerchantExplorationSignal(state)).toBe(event);
    const returningAt = event.arriveAt;
    Merchant.advance(state, returningAt);
    [route] = project(returningAt + halfLeg);
    expect(route).toMatchObject({ source: 'exploration', startSystemId: 'nebula_forge', endSystemId: 'sol_prime', isMoving: true, statusLabel: '探索返港' });
    expect(route.progress).toBeCloseTo(.5, 4);
    expect(presented()).toEqual(['sol_prime', 'mineral_belt']);
    Merchant.advance(state, event.arriveAt);
    expect(getMerchantExplorationSignal(state)).toBeNull();
    expect(presented()).toEqual(['sol_prime', 'mineral_belt', 'nebula_forge']);
    expect(project(state.merchant.lastTickAt)).toEqual([]);
    expect(state.currentGalaxy).toBe('milky_way');
    expect(state.viewingGalaxy).toBe('jade_expanse');
  });
});
