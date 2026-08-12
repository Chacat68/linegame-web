import { describe, expect, it } from 'vitest';
import { createDispatchActionController } from '../js/core/DispatchActionController.js';

function createHarness(tickResult, options) {
  var config = options || {};
  var trace = [];
  var state = { fuel: config.fuel == null ? 20 : config.fuel, routeActive: true };
  var controller = createDispatchActionController({
    getState: function () { trace.push('get-state'); return state; },
    systems: {
      Dispatch: {
        runActiveDispatchTick: function (nextState, tickOptions) {
          trace.push('run-tick:' + tickOptions.isGameOver() + ':' + tickOptions.hasBlockingSurfaceOpen());
          return tickResult;
        },
      },
      Fleet: {
        cancelActiveDispatch: function () { trace.push('cancel-dispatch'); state.routeActive = false; },
      },
    },
    refuel: function (refuelOptions) {
      trace.push('refuel:' + refuelOptions.showCompletion);
      state.fuel = config.fuelAfterRefuel == null ? 100 : config.fuelAfterRefuel;
    },
    travel: function (systemId) { trace.push('travel:' + systemId); },
    confirmTrade: function (action, goodId, quantity, marketType, tradeOptions) {
      trace.push('trade:' + action + ':' + goodId + ':' + quantity + ':' + marketType + ':' + tradeOptions.nextRouteStatus);
    },
    isGameOver: function () { return config.gameOver === true; },
    hasBlockingSurfaceOpen: function () { return config.blocked === true; },
    emitMessage: function (message) { trace.push('message:' + message.text); },
    stopClock: function () { trace.push('stop-clock'); },
    render: function () { trace.push('render'); },
  });
  return { controller: controller, state: state, trace: trace };
}

describe('DispatchActionController', function () {
  it('stopped 停止 recurring 并刷新一次', function () {
    var harness = createHarness({ action: 'stopped', msgs: [{ text: 'done' }] });

    harness.controller.tick();

    expect(harness.trace).toEqual([
      'get-state', 'run-tick:false:false', 'message:done', 'stop-clock', 'render',
    ]);
  });

  it('普通 travel 直接转发目的地', function () {
    var harness = createHarness({ action: 'travel', payload: { systemId: 'nova_station' }, msgs: [] });

    harness.controller.tick();

    expect(harness.trace).toEqual([
      'get-state', 'run-tick:false:false', 'travel:nova_station',
    ]);
  });

  it('travel_need_refuel 补给成功后继续航行且不占用 Command Slot 完成态', function () {
    var harness = createHarness({
      action: 'travel_need_refuel',
      payload: { systemId: 'nova_station', fuelCost: 40 },
      msgs: [],
    });

    harness.controller.tick();

    expect(harness.trace).toEqual([
      'get-state', 'run-tick:false:false', 'refuel:false', 'travel:nova_station',
    ]);
  });

  it('travel_need_refuel 仍不足时召回、停表并刷新最终状态', function () {
    var harness = createHarness({
      action: 'travel_need_refuel',
      payload: { systemId: 'nova_station', fuelCost: 40 },
      msgs: [],
    }, { fuelAfterRefuel: 30 });

    harness.controller.tick();

    expect(harness.trace).toEqual([
      'get-state', 'run-tick:false:false', 'refuel:false',
      'message:📡 自动跑商的船只燃料不足，已召回。',
      'cancel-dispatch', 'stop-clock', 'render',
    ]);
    expect(harness.state.routeActive).toBe(false);
  });

  it('buy_need_refuel 成功后在同一次交易提交中切到卖出航段', function () {
    var harness = createHarness({
      action: 'buy_need_refuel',
      payload: { goodId: 'food', quantity: 3, marketType: 'open', fuelCost: 40 },
      msgs: [],
    });

    harness.controller.tick();

    expect(harness.trace).toContain('trade:buy:food:3:open:traveling_sell');
  });

  it('buy/sell 声明各自的下一路线阶段', function () {
    var buyHarness = createHarness({
      action: 'buy', payload: { goodId: 'food', quantity: 2, marketType: 'open' }, msgs: [],
    });
    var sellHarness = createHarness({
      action: 'sell', payload: { goodId: 'food', quantity: 2, marketType: 'black' }, msgs: [],
    });

    buyHarness.controller.tick();
    sellHarness.controller.tick();

    expect(buyHarness.trace).toContain('trade:buy:food:2:open:traveling_sell');
    expect(sellHarness.trace).toContain('trade:sell:food:2:black:traveling_buy');
  });

  it('noop 只发布计算阶段消息，不额外刷新或执行动作', function () {
    var harness = createHarness({ action: 'noop', msgs: [{ text: 'waiting' }] }, { blocked: true });

    harness.controller.tick();

    expect(harness.trace).toEqual([
      'get-state', 'run-tick:false:true', 'message:waiting',
    ]);
  });
});
