import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Dispatch from '../js/core/DispatchController.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { createTestState } from './helpers.js';

describe('DispatchController.runActiveDispatchTick', function () {
  beforeEach(function () {
    Economy.init();
  });

  afterEach(function () {
    Dispatch.stopActiveDispatch();
    vi.useRealTimers();
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
    var options = { isModalVisible: function () { return false; } };

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
    var options = { isModalVisible: function () { return false; } };

    var first = Dispatch.runActiveDispatchTick(state, options);
    var second = Dispatch.runActiveDispatchTick(state, options);

    expect(first.action).toBe('noop');
    expect(Fleet.getActiveShip(state).route.status).toBe('traveling_sell');
    expect(second.action).toBe('travel');
    expect(second.payload.systemId).toBe('nova_station');
  });

  it('启动自动派遣后会立即执行首个 tick', function () {
    vi.useFakeTimers();
    var tickFn = vi.fn();

    Dispatch.startActiveDispatch(tickFn);

    expect(tickFn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);

    expect(tickFn).toHaveBeenCalledTimes(1);
    expect(Dispatch.isRunning()).toBe(true);
  });

  it('停止自动派遣会取消尚未执行的启动 tick', function () {
    vi.useFakeTimers();
    var tickFn = vi.fn();

    Dispatch.startActiveDispatch(tickFn);
    Dispatch.stopActiveDispatch();
    vi.advanceTimersByTime(0);

    expect(tickFn).not.toHaveBeenCalled();
    expect(Dispatch.isRunning()).toBe(false);
  });

  it('自动跑商间隔可跟随游戏日长度，而不是固定五秒', function () {
    vi.useFakeTimers();
    var tickFn = vi.fn();

    Dispatch.startActiveDispatch(tickFn, 30000);
    vi.advanceTimersByTime(0);
    expect(tickFn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(29999);
    expect(tickFn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(tickFn).toHaveBeenCalledTimes(2);
  });
});
