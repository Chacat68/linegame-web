// js/core/TravelActionController.js — 航行、走私检查、任务与存档编排

import { DEFAULT_ACTION_DIRTY_REGIONS } from './ActionPresentation.js';
import { LOG_MESSAGE_SOURCE } from './LogMessage.js';

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('TravelActionController requires ' + label + '.');
  return value;
}

function _emitMessages(result, emitMessage, source) {
  var messages = Array.isArray(result) ? result : (result && Array.isArray(result.msgs) ? result.msgs : []);
  messages.forEach(function (message) {
    emitMessage(Object.assign({ source: source || LOG_MESSAGE_SOURCE.NAVIGATION }, message || {}));
  });
}

export function createTravelActionController(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var Trade = systems.Trade || {};
  var Economy = systems.Economy || {};
  var Fleet = systems.Fleet || {};
  var Faction = systems.Faction || {};
  var Quest = systems.Quest || {};
  var Tutorial = systems.Tutorial || {};
  var Progression = systems.Progression || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var execute = _requiredFunction(deps.pipeline && deps.pipeline.execute, 'pipeline.execute');
  var hasPendingEvent = typeof deps.hasPendingEvent === 'function' ? deps.hasPendingEvent : function () { return false; };
  var forcePendingEvent = typeof deps.forcePendingEvent === 'function' ? deps.forcePendingEvent : _noop;
  var isShipFlying = typeof deps.isShipFlying === 'function' ? deps.isShipFlying : function () { return false; };
  var emitMessage = typeof deps.emitMessage === 'function' ? deps.emitMessage : _noop;
  var emitAudio = typeof deps.emitAudio === 'function' ? deps.emitAudio : _noop;
  var flyShip = typeof deps.flyShip === 'function' ? deps.flyShip : _noop;
  var refreshGalaxy = typeof deps.refreshGalaxy === 'function' ? deps.refreshGalaxy : _noop;
  var refreshMarketLocation = typeof deps.refreshMarketLocation === 'function' ? deps.refreshMarketLocation : _noop;
  var stopDispatchClock = typeof deps.stopDispatchClock === 'function' ? deps.stopDispatchClock : _noop;
  var queueQuestDialogueResult = typeof deps.queueQuestDialogueResult === 'function' ? deps.queueQuestDialogueResult : _noop;
  var scheduleRandomEvent = typeof deps.scheduleRandomEvent === 'function' ? deps.scheduleRandomEvent : _noop;
  var captureState = typeof deps.captureState === 'function' ? deps.captureState : _noop;
  var saveAutosave = typeof deps.saveAutosave === 'function' ? deps.saveAutosave : _noop;
  var eventBaseChance = Number.isFinite(deps.eventBaseChance) ? deps.eventBaseChance : 0;

  function _state() {
    var state = getState();
    if (!state || typeof state !== 'object') throw new Error('TravelActionController requires an active state.');
    return state;
  }

  function travel(systemId) {
    var state = _state();
    Fleet.syncStateFromShip(state);

    if (hasPendingEvent()) {
      forcePendingEvent();
      emitMessage({ text: '⚠️ 请先处理当前事件再继续航行。', type: 'error' });
      return null;
    }
    if (isShipFlying()) {
      emitMessage({ text: '🛰️ 飞船正在飞行中，请等待抵达后再发起下一次航行。', type: 'info' });
      return null;
    }

    var previousSystem = state.currentSystem;
    return execute({
      label: 'travel',
      logSource: LOG_MESSAGE_SOURCE.NAVIGATION,
      dirtyRegions: DEFAULT_ACTION_DIRTY_REGIONS,
      mutate: function () { return Trade.travelTo(state, systemId); },
      postEffects: function (result) {
        emitAudio('travel');
        _emitMessages(
          Fleet.applyTravelWear(state, state.activeShipIndex, result.meta),
          emitMessage,
          LOG_MESSAGE_SOURCE.FLEET
        );

        var activeShipForFlight = Fleet.getActiveShip(state);
        flyShip(previousSystem, systemId, {
          shipTypeId: activeShipForFlight ? activeShipForFlight.typeId : 'shuttle',
          shipIndex: state.activeShipIndex || 0,
          routeRevision: activeShipForFlight && activeShipForFlight.route
            ? (activeShipForFlight.routeRevision || 0)
            : null,
        });
        if (result.meta && result.meta.crossGalaxy) refreshGalaxy(state);
        refreshMarketLocation(state);

        var activeShipStats = Fleet.getEffectiveShipStats(state, Fleet.getActiveShip(state));
        var smuggleResult = Economy.checkSmugglingCargo(state, state.currentSystem, state.cargo, {
          cargoCost: state.cargoCost,
          applyHullDamage: function (damage) {
            state.shipHull = Math.max(1, (state.shipHull || 100) - damage);
          },
          checkChanceMultiplier: activeShipStats.smugglingCheckMultiplier || 1,
          fineMultiplier: activeShipStats.smugglingFineMultiplier || 1,
          hullDamageMultiplier: activeShipStats.smugglingHullMultiplier || 1,
        });
        _emitMessages(smuggleResult, emitMessage, LOG_MESSAGE_SOURCE.COMMERCE);
        if (smuggleResult.caught) {
          var activeShipAfterCheck = Fleet.getActiveShip(state);
          if (activeShipAfterCheck && activeShipAfterCheck.route && activeShipAfterCheck.route.marketMode === 'black') {
            Fleet.cancelActiveDispatch(state);
            stopDispatchClock();
            emitMessage({
              text: '⏹️ 黑市自动跑商因走私被查获而中止。',
              type: 'error',
              source: LOG_MESSAGE_SOURCE.COMMERCE,
            });
          }
        }
        if (smuggleResult.evaded) Economy.recordSmugglingEvaded(state);

        if (!Array.isArray(state.visitedSystems)) state.visitedSystems = [];
        if (!Array.isArray(state.visitedGalaxies)) state.visitedGalaxies = [];
        if (state.visitedSystems.indexOf(state.currentSystem) === -1) state.visitedSystems.push(state.currentSystem);
        if (state.visitedGalaxies.indexOf(state.currentGalaxy) === -1) state.visitedGalaxies.push(state.currentGalaxy);

        Tutorial.checkTrigger('travel');
        _emitMessages(Progression.gainExperience(state, 5), emitMessage, LOG_MESSAGE_SOURCE.PROGRESSION);
        _emitMessages(
          Progression.gainCompanyExperience(state, 2),
          emitMessage,
          LOG_MESSAGE_SOURCE.PROGRESSION
        );
        state.reputation = (state.reputation || 0) + 1;

        var travelFaction = Faction.getFactionForSystem(state.currentSystem);
        var questResult = Quest.checkProgress(state, {
          action: 'travel',
          systemId: state.currentSystem,
          factionId: travelFaction ? travelFaction.id : null,
          crossGalaxy: !!(result.meta && result.meta.crossGalaxy),
        });
        _emitMessages(questResult, emitMessage, LOG_MESSAGE_SOURCE.QUEST);
        queueQuestDialogueResult(questResult);

        var totalAutoRepair = (state.autoRepair || 0) + (activeShipStats.autoRepair || 0);
        if (totalAutoRepair > 0) {
          state.shipHull = Math.min(state.maxHull || 100, (state.shipHull || 100) + totalAutoRepair);
        }
        if (!Tutorial.isActive()) {
          scheduleRandomEvent(state, eventBaseChance * (activeShipStats.eventChanceMultiplier || 1));
        }

        Fleet.commitActiveShipState(state);
        captureState(state);
        saveAutosave(state);
      },
    });
  }

  return Object.freeze({ travel: travel });
}
