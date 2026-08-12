// js/core/DispatchActionController.js — 激活船只自动派遣 tick 编排
//
// DispatchController 只计算下一条动作；本控制器把动作交给已经接入统一
// pipeline 的补给、航行与交易控制器，并管理 recurring clock 的停止边界。

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('DispatchActionController requires ' + label + '.');
  return value;
}

function _emitMessages(result, emitMessage) {
  var messages = result && Array.isArray(result.msgs) ? result.msgs : [];
  messages.forEach(function (message) { emitMessage(message); });
}

export function createDispatchActionController(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var Dispatch = systems.Dispatch || {};
  var Fleet = systems.Fleet || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var runTick = _requiredFunction(Dispatch.runActiveDispatchTick, 'systems.Dispatch.runActiveDispatchTick');
  var refuel = _requiredFunction(deps.refuel, 'refuel');
  var travel = _requiredFunction(deps.travel, 'travel');
  var confirmTrade = _requiredFunction(deps.confirmTrade, 'confirmTrade');
  var isGameOver = typeof deps.isGameOver === 'function' ? deps.isGameOver : function () { return false; };
  var hasBlockingSurfaceOpen = typeof deps.hasBlockingSurfaceOpen === 'function'
    ? deps.hasBlockingSurfaceOpen
    : function () { return false; };
  var emitMessage = typeof deps.emitMessage === 'function' ? deps.emitMessage : _noop;
  var stopClock = typeof deps.stopClock === 'function' ? deps.stopClock : _noop;
  var render = typeof deps.render === 'function' ? deps.render : _noop;

  function _state() {
    var state = getState();
    if (!state || typeof state !== 'object') throw new Error('DispatchActionController requires an active state.');
    return state;
  }

  function _cancelForFuel(state, message) {
    emitMessage({ text: message, type: 'error' });
    Fleet.cancelActiveDispatch(state);
    stopClock();
    render();
  }

  function _refuelOrCancel(state, fuelCost, failureMessage) {
    refuel({ showCompletion: false });
    if (state.fuel >= fuelCost) return true;
    _cancelForFuel(state, failureMessage);
    return false;
  }

  function tick() {
    var state = _state();
    var tickResult = runTick(state, {
      isGameOver: isGameOver,
      hasBlockingSurfaceOpen: hasBlockingSurfaceOpen,
    }) || { action: 'noop', msgs: [] };
    _emitMessages(tickResult, emitMessage);

    switch (tickResult.action) {
      case 'stopped':
        stopClock();
        render();
        break;

      case 'travel_need_refuel':
        if (_refuelOrCancel(
          state,
          tickResult.payload.fuelCost,
          '📡 自动跑商的船只燃料不足，已召回。'
        )) {
          travel(tickResult.payload.systemId);
        }
        break;

      case 'buy_need_refuel':
        if (_refuelOrCancel(
          state,
          tickResult.payload.fuelCost,
          '📡 自动跑商的船只补给后仍无法完成下一段航程，已召回。'
        )) {
          confirmTrade(
            'buy',
            tickResult.payload.goodId,
            tickResult.payload.quantity,
            tickResult.payload.marketType,
            { nextRouteStatus: 'traveling_sell' }
          );
        }
        break;

      case 'travel':
        travel(tickResult.payload.systemId);
        break;

      case 'buy':
        confirmTrade(
          'buy',
          tickResult.payload.goodId,
          tickResult.payload.quantity,
          tickResult.payload.marketType,
          { nextRouteStatus: 'traveling_sell' }
        );
        break;

      case 'sell':
        confirmTrade(
          'sell',
          tickResult.payload.goodId,
          tickResult.payload.quantity,
          tickResult.payload.marketType,
          { nextRouteStatus: 'traveling_buy' }
        );
        break;

      // noop 表示等待价格、阻塞 surface 或暂时无动作；领域系统已保留状态。
      default:
        break;
    }
    return tickResult;
  }

  return Object.freeze({ tick: tick });
}
