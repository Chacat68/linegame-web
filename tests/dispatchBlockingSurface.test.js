import { beforeEach, describe, expect, it } from 'vitest';
import * as Dispatch from '../js/core/DispatchController.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { createTestState } from './helpers.js';

describe('DispatchController.runActiveDispatchTick blocking surfaces', function () {
  beforeEach(function () {
    Economy.init();
  });

  it('任意阻塞层打开时会暂停派遣 tick', function () {
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

    var result = Dispatch.runActiveDispatchTick(state, {
      isGameOver: function () { return false; },
      hasBlockingSurfaceOpen: function () { return true; },
    });

    expect(result.action).toBe('noop');
    expect(result.msgs).toEqual([]);
  });
});
