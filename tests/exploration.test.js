import { beforeEach, describe, expect, it } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../js/systems/galaxy/ExplorationSystem.js';
import { createTestState } from './helpers.js';

describe('ExplorationSystem', function () {
  let state;

  beforeEach(function () {
    state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      fuel: 100,
      maxFuel: 100,
      credits: 2000,
      shipHull: 100,
      maxHull: 100,
      researchedTechs: [],
    });

    Economy.init();
    GalaxyData.init(state);
  });

  it('扫描后应揭示当前星球的 POI', function () {
    const beforeScan = GalaxyData.getPlanetData('sol_prime');
    expect(beforeScan.exploration.scanLevel).toBe(0);
    expect(beforeScan.exploration.pois.every(function (poi) { return poi.discovered === false; })).toBe(true);

    const result = Exploration.scanSystem(state, 'sol_prime');

    expect(result.ok).toBe(true);
    const afterScan = GalaxyData.getPlanetData('sol_prime');
    expect(afterScan.exploration.scanLevel).toBeGreaterThan(0);
    expect(afterScan.exploration.pois.every(function (poi) { return poi.discovered === true; })).toBe(true);
    expect(state.fuel).toBeLessThan(100);
  });

  it('着陆前必须先完成扫描', function () {
    const result = Exploration.landOnSystem(state, 'sol_prime');

    expect(result.ok).toBe(false);
    expect(result.msgs[0].text).toContain('请先完成轨道扫描');
  });

  it('调查秘密航线信标后应降低对应航线燃料消耗', function () {
    const basePlanet = GalaxyData.getPlanetData('sol_prime');
    const routePoi = basePlanet.exploration.pois.find(function (poi) {
      return poi.kind === 'route_beacon';
    });
    const targetSystemId = basePlanet.exploration.secretRoutes[0].targetSystemId;

    expect(routePoi).toBeTruthy();
    expect(targetSystemId).toBeTruthy();

    const baseCost = Economy.getFuelCost('sol_prime', targetSystemId, 1, state);

    expect(Exploration.scanSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.landOnSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.explorePoi(state, 'sol_prime', routePoi.id).ok).toBe(true);

    const routeInfo = Exploration.getTravelRouteInfo(state, 'sol_prime', targetSystemId);
    const discountedCost = Economy.getFuelCost('sol_prime', targetSystemId, 1, state);

    expect(routeInfo.active).toBe(true);
    expect(discountedCost).toBeLessThan(baseCost);
  });

  it('当前星球应返回可用于地图渲染的已发现暗线摘要', function () {
    const basePlanet = GalaxyData.getPlanetData('sol_prime');
    const routePoi = basePlanet.exploration.pois.find(function (poi) {
      return poi.kind === 'route_beacon';
    });

    expect(Exploration.getCurrentSystemSecretRoutes(state)).toEqual([]);

    Exploration.scanSystem(state, 'sol_prime');
    Exploration.landOnSystem(state, 'sol_prime');
    Exploration.explorePoi(state, 'sol_prime', routePoi.id);

    const routes = Exploration.getCurrentSystemSecretRoutes(state);

    expect(routes).toHaveLength(1);
    expect(routes[0].sourceSystemId).toBe('sol_prime');
    expect(routes[0].targetSystemId).toBeTruthy();
    expect(routes[0].discountPercent).toBeGreaterThan(0);
  });

  it('恢复旧存档时应补齐默认探索状态', function () {
    GalaxyData.restorePlanetStates({
      sol_prime: {
        id: 'sol_prime',
        owner: 'player',
        status: 'normal',
      },
    });

    const restoredPlanet = GalaxyData.getPlanetData('sol_prime');

    expect(restoredPlanet.exploration).toBeTruthy();
    expect(Array.isArray(restoredPlanet.exploration.pois)).toBe(true);
    expect(Array.isArray(restoredPlanet.exploration.secretRoutes)).toBe(true);
  });
});