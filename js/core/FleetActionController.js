// js/core/FleetActionController.js — 舰队、航线、改装与船员动作编排
//
// Controller 每次动作都从 getState() 读取当前会话，不持有 state 快照。
// 领域系统负责修改状态；这里仅统一事务顺序、计时器、任务/教学进度与反馈。

import { GOODS } from '../data/goods.js';
import { SHIP_MODS } from '../data/ships.js';
import {
  getDispatchConfirmedCompletion,
  getModInstalledCompletion,
  getServiceScheduledCompletion,
} from './ActionGuideCompletion.js';

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('FleetActionController requires ' + label + '.');
  return value;
}

function _activeShipIndex(state) {
  return state && Number.isInteger(state.activeShipIndex) ? state.activeShipIndex : 0;
}

function _isOk(result) {
  return !!(result && result.ok);
}

export function createFleetActionController(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var Fleet = systems.Fleet || {};
  var Crew = systems.Crew || {};
  var MidgameTeachingChain = systems.MidgameTeachingChain || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var dispatch = _requiredFunction(deps.dispatch, 'dispatch');
  var recordQuestProgress = typeof deps.recordQuestProgress === 'function' ? deps.recordQuestProgress : _noop;
  var completeTeachingStep = typeof deps.completeTeachingStep === 'function' ? deps.completeTeachingStep : _noop;
  var startDispatchClock = typeof deps.startDispatchClock === 'function' ? deps.startDispatchClock : _noop;
  var stopDispatchClock = typeof deps.stopDispatchClock === 'function' ? deps.stopDispatchClock : _noop;
  var resetRealtimeClock = typeof deps.resetRealtimeClock === 'function' ? deps.resetRealtimeClock : _noop;
  var cancelShipFlight = typeof deps.cancelShipFlight === 'function' ? deps.cancelShipFlight : _noop;
  var setRecentModInstallContext = typeof deps.setRecentModInstallContext === 'function'
    ? deps.setRecentModInstallContext
    : _noop;
  var showCompletion = typeof deps.showCompletion === 'function' ? deps.showCompletion : _noop;
  var getRouteGuidance = typeof deps.getRouteGuidance === 'function' ? deps.getRouteGuidance : function () { return null; };
  var getDispatchContext = typeof deps.getDispatchContext === 'function' ? deps.getDispatchContext : function () { return null; };
  var now = typeof deps.now === 'function'
    ? deps.now
    : function () { return typeof performance !== 'undefined' ? performance.now() : Date.now(); };

  function _state() {
    var state = getState();
    if (!state || typeof state !== 'object') throw new Error('FleetActionController requires an active state.');
    return state;
  }

  function onBuyShip(shipTypeId) {
    var state = _state();
    Fleet.syncShipFromState(state);
    var result = Fleet.buyShip(state, shipTypeId);
    if (_isOk(result)) recordQuestProgress({ action: 'buy_ship', shipTypeId: shipTypeId });
    dispatch(result);
    return result;
  }

  function onSwitchShip(shipIndex) {
    var state = _state();
    stopDispatchClock();
    Fleet.syncShipFromState(state);
    var result = Fleet.switchShip(state, shipIndex);
    if (_isOk(result)) {
      state.lastSwitchedShipIndex = shipIndex;
      state.lastShipSwitchAt = Date.now();
    }
    dispatch(result);
    if (_isOk(result) && Fleet.isActiveDispatched(state)) startDispatchClock();
    if (_isOk(result)) resetRealtimeClock(now());
    return result;
  }

  function onUpgradeShip(shipIndex, upgradeId) {
    var state = _state();
    Fleet.syncShipFromState(state);
    var result = Fleet.upgradeShip(state, upgradeId, shipIndex);
    dispatch(result);
    return result;
  }

  function onAssignRoute(shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) {
    var state = _state();
    Fleet.syncShipFromState(state);
    var isActive = shipIndex === _activeShipIndex(state);
    var result = Fleet.assignRoute(state, shipIndex, buySystemId, sellSystemId, goodId, tradePolicy);
    if (_isOk(result) && isActive) cancelShipFlight();
    dispatch(result);
    if (_isOk(result) && isActive) startDispatchClock();

    if (_isOk(result)) {
      recordQuestProgress({ action: 'dispatch_route', shipIndex: shipIndex, goodId: goodId });
      var activeTeachingChain = typeof MidgameTeachingChain.getActiveChain === 'function'
        ? MidgameTeachingChain.getActiveChain(state)
        : null;
      if (activeTeachingChain && activeTeachingChain.chain.id === 'research-supply') {
        var routeGuidance = getRouteGuidance();
        var recommendation = routeGuidance && typeof routeGuidance.findResearchSupplyRoute === 'function'
          ? routeGuidance.findResearchSupplyRoute(state, getDispatchContext())
          : null;
        if (recommendation && recommendation.goodId === goodId &&
            recommendation.buySystemId === buySystemId &&
            recommendation.sellSystemId === sellSystemId) {
          completeTeachingStep('research-supply', 'prefill-research-supply-dispatch');
        }
      } else if (activeTeachingChain && activeTeachingChain.chain.id === 'dispatch-ops') {
        completeTeachingStep('dispatch-ops', 'prefill-profitable-dispatch');
      }
      var good = GOODS.find(function (item) { return item.id === goodId; });
      showCompletion(getDispatchConfirmedCompletion(good ? good.name : ''));
    }
    return result;
  }

  function onCancelRoute(shipIndex) {
    var state = _state();
    var isActive = shipIndex === _activeShipIndex(state);
    var result = Fleet.cancelRoute(state, shipIndex);
    if (_isOk(result) && isActive) cancelShipFlight();
    dispatch(result);
    if (isActive) stopDispatchClock();
    return result;
  }

  function onBuySlot() {
    var result = Fleet.buySlot(_state());
    dispatch(result);
    return result;
  }

  function onSellShip(shipIndex) {
    var state = _state();
    Fleet.syncShipFromState(state);
    var result = Fleet.sellShip(state, shipIndex);
    dispatch(result);
    return result;
  }

  function onInstallMod(shipIndex, modId) {
    var state = _state();
    Fleet.syncShipFromState(state);
    var result = Fleet.installMod(state, modId, shipIndex);
    var installedMod = SHIP_MODS.find(function (mod) { return mod.id === modId; });
    if (_isOk(result)) {
      setRecentModInstallContext({
        shipIndex: shipIndex != null ? shipIndex : _activeShipIndex(state),
        modId: modId,
      });
    }
    dispatch(result);
    if (_isOk(result)) showCompletion(getModInstalledCompletion(installedMod ? installedMod.name : ''));
    return result;
  }

  function onUninstallMod(shipIndex, modId) {
    var state = _state();
    Fleet.syncShipFromState(state);
    var result = Fleet.uninstallMod(state, modId, shipIndex);
    dispatch(result);
    return result;
  }

  function onServiceShip(shipIndex, tierId) {
    var state = _state();
    Fleet.syncShipFromState(state);
    var result = Fleet.serviceShip(state, shipIndex, tierId);
    dispatch(result);
    if (_isOk(result)) showCompletion(getServiceScheduledCompletion());
    return result;
  }

  function onRecruitCrew(offerId) {
    var state = _state();
    var result = Crew.recruitCrew(state, offerId, state.currentSystem);
    if (_isOk(result)) recordQuestProgress({ action: 'recruit_crew', offerId: offerId });
    dispatch(result);
    return result;
  }

  function onAssignCrew(shipIndex, crewId) {
    var state = _state();
    var result = Crew.assignCrewToShip(state, crewId, shipIndex);
    if (_isOk(result) && shipIndex === _activeShipIndex(state)) Fleet.syncStateFromShip(state);
    dispatch(result);
    return result;
  }

  function onUnassignCrew(shipIndex, crewId) {
    var state = _state();
    var result = Crew.unassignCrewFromShip(state, crewId, shipIndex);
    if (_isOk(result) && shipIndex === _activeShipIndex(state)) Fleet.syncStateFromShip(state);
    dispatch(result);
    return result;
  }

  function onDismissCrew(crewId) {
    var state = _state();
    var existingCrew = Crew.getCrewById(state, crewId);
    var affectedShipIndex = existingCrew ? existingCrew.assignedShipIndex : null;
    var result = Crew.dismissCrew(state, crewId);
    if (_isOk(result) && affectedShipIndex === _activeShipIndex(state)) Fleet.syncStateFromShip(state);
    dispatch(result);
    return result;
  }

  return Object.freeze({
    onBuyShip: onBuyShip,
    onSwitchShip: onSwitchShip,
    onUpgradeShip: onUpgradeShip,
    onAssignRoute: onAssignRoute,
    onCancelRoute: onCancelRoute,
    onBuySlot: onBuySlot,
    onSellShip: onSellShip,
    onInstallMod: onInstallMod,
    onUninstallMod: onUninstallMod,
    onServiceShip: onServiceShip,
    onRecruitCrew: onRecruitCrew,
    onAssignCrew: onAssignCrew,
    onUnassignCrew: onUnassignCrew,
    onDismissCrew: onDismissCrew,
  });
}
