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
      isGameOver: function () { return false; },
    });

    expect(result.action).toBe('buy_need_refuel');
    expect(result.payload.fuelCost).toBe(requiredFuel);
    expect(result.payload.goodId).toBe('food');
  });

  it('没有资金且没有待售库存时会原地等待而不是空载航行', function () {
    var state = createTestState({
      credits: 0,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      cargo: {},
    });
    Fleet.init(state);
    state.credits = 0;
    Fleet.assignRoute(state, 0, 'sol_prime', 'nova_station', 'food');
    var options = { isGameOver: function () { return false; } };

    var first = Dispatch.runActiveDispatchTick(state, options);
    var second = Dispatch.runActiveDispatchTick(state, options);

    expect(first.action).toBe('noop');
    expect(second.action).toBe('noop');
    expect(Fleet.getActiveShip(state).route.status).toBe('buying');
    expect(state.currentSystem).toBe('sol_prime');
  });

  it('买不到新货但已有路线库存时仍会前往卖出地', function () {
    var state = createTestState({
      credits: 0,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      cargo: {},
    });
    Fleet.init(state);
    state.credits = 0;
    state.cargo.food = 1;
    state.cargoCost.food = 100;
    Fleet.assignRoute(state, 0, 'sol_prime', 'nova_station', 'food');
    var options = { isGameOver: function () { return false; } };

    var first = Dispatch.runActiveDispatchTick(state, options);
    var second = Dispatch.runActiveDispatchTick(state, options);

    expect(first.action).toBe('noop');
    expect(Fleet.getActiveShip(state).route.status).toBe('traveling_sell');
    expect(second.action).toBe('travel');
    expect(second.payload.systemId).toBe('nova_station');
  });

  it('游戏结算会终止 recurring，而普通阻塞层只暂停本次 tick', function () {
    var state = createTestState();
    Fleet.init(state);

    expect(Dispatch.runActiveDispatchTick(state, {
      isGameOver: function () { return true; },
      hasBlockingSurfaceOpen: function () { return true; },
    }).action).toBe('stopped');

    expect(Dispatch.runActiveDispatchTick(state, {
      isGameOver: function () { return false; },
      hasBlockingSurfaceOpen: function () { return true; },
    }).action).toBe('noop');
  });

  it('领域 tick 主动取消失效路线时立即返回 stopped', function () {
    var state = createTestState({ currentSystem: 'sol_prime' });
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
    ship.maintenance = 0;

    var result = Dispatch.runActiveDispatchTick(state, {
      isGameOver: function () { return false; },
      hasBlockingSurfaceOpen: function () { return false; },
    });

    expect(result.action).toBe('stopped');
    expect(ship.route).toBeNull();
    expect(result.msgs.some(function (message) { return message.text.includes('维护度过低'); })).toBe(true);
  });

});
