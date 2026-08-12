// js/core/ExplorationOperationsController.js — POI 探索状态变更与提交编排

function _requiredFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError('ExplorationOperationsController requires ' + label + '.');
  }
  return value;
}

export function createExplorationOperationsController(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var Exploration = systems.Exploration || {};
  var Fleet = systems.Fleet || {};
  var GalaxyData = systems.GalaxyData || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var execute = _requiredFunction(deps.pipeline && deps.pipeline.execute, 'pipeline.execute');

  function _state() {
    var state = getState();
    if (!state || typeof state !== 'object') {
      throw new Error('ExplorationOperationsController requires an active state.');
    }
    return state;
  }

  function _poiRewardMultiplier(state) {
    var activeShip = Fleet.getActiveShip(state);
    var shipStats = Fleet.getEffectiveShipStats(state, activeShip) || {};
    return Number.isFinite(shipStats.poiRewardMultiplier) ? shipStats.poiRewardMultiplier : 1;
  }

  function getPoiStatus(systemId, poiId) {
    var state = _state();
    return Exploration.getPoiStatus(state, systemId, poiId, {
      poiRewardMultiplier: _poiRewardMultiplier(state),
    });
  }

  function explorePoi(systemId, poiId) {
    var state = _state();
    Fleet.syncStateFromShip(state);
    var poiRewardMultiplier = _poiRewardMultiplier(state);

    return execute({
      label: 'exploration.poi',
      mutate: function () {
        return Exploration.explorePoi(state, systemId, poiId, {
          poiRewardMultiplier: poiRewardMultiplier,
        });
      },
      postEffects: function () {
        Fleet.commitActiveShipState(state);
        state.galaxyStates = GalaxyData.getAllPlanetStates();
      },
    });
  }

  return Object.freeze({
    explorePoi: explorePoi,
    getPoiStatus: getPoiStatus,
  });
}
