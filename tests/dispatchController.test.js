import { beforeEach, describe, expect, it } from 'vitest';
import * as Dispatch from '../js/core/DispatchController.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { createTestState } from './helpers.js';

describe('DispatchController.runActiveDispatchTick', function () {
  beforeEach(function () {
    Economy.init();
  });

  it('买入前会先检查卖出航段燃料预算', function () {
    var state = createTestState({
      credits: 5000,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      cargo: {},
      playerLevel: 3,
    });

    Fleet.init(state);

    var ship = Fleet.getActiveShip(state);
    ship.route = {
      buySystemId: 'sol_prime',
      sellSystemId: 'nova_station',
      goodId: 'food',
      status: 'buying',
      marketMode: 'open',
      tradePolicy: null,
    };

    var requiredFuel = Economy.getFuelCost(ship.route.buySystemId, ship.route.sellSystemId, state.fuelEfficiency, state);
    ship.fuel = Math.max(0, requiredFuel - 1);
    state.fuel = ship.fuel;

    var result = Dispatch.runActiveDispatchTick(state, {
      isModalVisible: function () { return false; },
    });

    expect(result.action).toBe('buy_need_refuel');
    expect(result.payload.fuelCost).toBe(requiredFuel);
    expect(result.payload.goodId).toBe('food');
  });
});