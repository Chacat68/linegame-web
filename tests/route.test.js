import { beforeEach, describe, expect, it } from 'vitest';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../js/systems/galaxy/ExplorationSystem.js';
import * as RouteModel from '../js/systems/route/RouteSystem.js';
import { createTestState } from './helpers.js';

function createRoute(status, buySystemId, sellSystemId) {
  return {
    buySystemId: buySystemId,
    sellSystemId: sellSystemId,
    goodId: 'food',
    status: status,
    tradePolicy: { marketMode: 'open', maxBuyPrice: null, minSellPrice: null, minProfitRate: null, riskMode: 'balanced' },
    marketMode: 'open',
    lastBuyPrice: null,
    lastPolicyMessage: null,
  };
}

describe('RouteSystem', function () {
  beforeEach(function () {
    Economy.init();
  });

  it('为派遣船只输出统一的当前航段描述', function () {
    const state = createTestState({ currentSystem: 'sol_prime' });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.location = 'nova_station';
    ship.route = createRoute('traveling_buy', 'mineral_belt', 'fuel_depot');

    const descriptor = RouteModel.getShipRouteDescriptor(state, ship, 0);

    expect(descriptor.startSystemId).toBe('sol_prime');
    expect(descriptor.endSystemId).toBe('mineral_belt');
    expect(descriptor.hasTravelSegment).toBe(true);
    expect(descriptor.statusLabel).toBe('🚀 前往买入地');
  });

  it('可按需过滤当前正飞行的活跃船派遣线', function () {
    const state = createTestState({ credits: 10000, currentSystem: 'sol_prime' });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    state.fleet[0].route = createRoute('traveling_buy', 'sol_prime', 'fuel_depot');
    state.fleet[1].route = createRoute('traveling_sell', 'mineral_belt', 'nova_station');
    state.fleet[1].location = 'mineral_belt';

    const descriptors = RouteModel.getFleetRouteDescriptors(state, { skipShipIndex: 0 });

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].shipIndex).toBe(1);
    expect(descriptors[0].startSystemId).toBe('mineral_belt');
  });

  it('将已发现隐藏航线转成统一航线描述', function () {
    const state = createTestState({
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
    GalaxyData.init(state);

    const basePlanet = GalaxyData.getPlanetData('sol_prime');
    const routePoi = basePlanet.exploration.pois.find(function (poi) {
      return poi.kind === 'route_beacon';
    });

    Exploration.explorePoi(state, 'sol_prime', routePoi.id);

    const descriptors = RouteModel.getSecretRouteDescriptors(state);

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].sourceSystemId).toBe('sol_prime');
    expect(descriptors[0].targetSystemId).toBeTruthy();
    expect(descriptors[0].hasTravelSegment).toBe(true);
  });

  it('主动飞行也使用同一描述结构', function () {
    const descriptor = RouteModel.createFlightRouteDescriptor('sol_prime', 'nova_station', {
      shipIndex: 2,
      shipTypeId: 'clipper',
      routeRevision: 7,
    });

    expect(descriptor.startSystemId).toBe('sol_prime');
    expect(descriptor.endSystemId).toBe('nova_station');
    expect(descriptor.shipIndex).toBe(2);
    expect(descriptor.shipTypeId).toBe('clipper');
    expect(descriptor.routeRevision).toBe(7);
  });
});
