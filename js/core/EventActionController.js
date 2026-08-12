// js/core/EventActionController.js — 随机事件选择、舰船同步与存档编排

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('EventActionController requires ' + label + '.');
  return value;
}

function _derivedShipSnapshot(state) {
  return {
    maxCargo: state.maxCargo,
    maxFuel: state.maxFuel,
    maxHull: state.maxHull,
    fuelEfficiency: state.fuelEfficiency,
    cargo: Object.assign({}, state.cargo || {}),
    cargoCost: Object.assign({}, state.cargoCost || {}),
  };
}

export function createEventActionController(dependencies) {
  var deps = dependencies || {};
  var Fleet = (deps.systems && deps.systems.Fleet) || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var execute = _requiredFunction(deps.pipeline && deps.pipeline.execute, 'pipeline.execute');
  var getRuntime = typeof deps.getRuntime === 'function' ? deps.getRuntime : function () { return null; };
  var emitMessage = typeof deps.emitMessage === 'function' ? deps.emitMessage : _noop;
  var refreshActionGuide = typeof deps.refreshActionGuide === 'function' ? deps.refreshActionGuide : _noop;
  var captureState = typeof deps.captureState === 'function' ? deps.captureState : _noop;
  var saveAutosave = typeof deps.saveAutosave === 'function' ? deps.saveAutosave : _noop;

  function _state() {
    var state = getState();
    if (!state || typeof state !== 'object') throw new Error('EventActionController requires an active state.');
    return state;
  }

  function resolveChoice(choiceIndex) {
    var runtime = getRuntime();
    if (!runtime || typeof runtime.resolveChoice !== 'function') {
      emitMessage({ text: '⚠️ 事件运行时尚未就绪，请重新打开事件。', type: 'error' });
      refreshActionGuide();
      return null;
    }

    var state = _state();
    var previousShipState = _derivedShipSnapshot(state);
    return execute({
      label: 'event.resolve',
      mutate: function () {
        var result = runtime.resolveChoice(state, choiceIndex) || { msgs: [], resolved: false };
        // RandomEvent 的领域结果使用 resolved；在动作边界映射到统一 ok 契约。
        return Object.assign({}, result, { ok: result.resolved ? true : null });
      },
      postEffects: function () {
        Fleet.commitActiveShipState(state, previousShipState);
        captureState(state);
        saveAutosave(state);
      },
    });
  }

  return Object.freeze({ resolveChoice: resolveChoice });
}
