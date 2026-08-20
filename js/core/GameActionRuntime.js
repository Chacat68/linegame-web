// js/core/GameActionRuntime.js — 游戏动作控制器图与共享提交边界
//
// 本模块是动作层的 composition root：九个领域 action controller、统一
// pipeline、兼容结果发布和任务进度提交共享同一 latest-state provider。
// GameManager 只注入命名端口，不再分别持有每个动作实例和互相接线。

import { createFleetActionController } from './FleetActionController.js';
import { createCommerceOperationsController } from './CommerceOperationsController.js';
import { createArchiveActionController } from './ArchiveActionController.js';
import { createActionExecutionPipeline } from './ActionExecutionPipeline.js';
import { DEFAULT_ACTION_DIRTY_REGIONS, normalizeDirtyRegions } from './ActionPresentation.js';
import { createTradeActionController } from './TradeActionController.js';
import { createTravelActionController } from './TravelActionController.js';
import { createExplorationOperationsController } from './ExplorationOperationsController.js';
import { createEventActionController } from './EventActionController.js';
import { createDispatchActionController } from './DispatchActionController.js';
import { createGameDayController } from './GameDayController.js';

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('GameActionRuntime requires ' + label + '.');
  return value;
}

function _method(group, name, fallback) {
  return group && typeof group[name] === 'function' ? group[name] : (fallback || _noop);
}

export function createGameActionRuntime(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var ports = deps.ports || {};
  var ui = ports.ui || {};
  var clock = ports.clock || {};
  var features = ports.features || {};
  var teaching = ports.teaching || {};
  var guidance = ports.guidance || {};
  var story = ports.story || {};
  var persistence = ports.persistence || {};
  var commands = ports.commands || {};
  var navigation = ports.navigation || {};
  var randomEvents = ports.randomEvents || {};
  var surfaces = ports.surfaces || {};
  var events = ports.events || {};
  var achievements = ports.achievements || {};
  var victory = ports.victory || {};
  var runtime = ports.runtime || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var getSessionToken = typeof deps.getSessionToken === 'function'
    ? deps.getSessionToken
    : function () { return null; };
  var emitMessage = _method(events, 'emitMessage');
  var emitAudio = _method(events, 'emitAudio');
  var invalidate = _method(ui, 'invalidate');

  function _showCompletion(completion) {
    if (completion) _method(ui, 'showCompletion')(completion);
  }

  function presentResult(result, presentation) {
    if (result && result.ok) _method(teaching, 'checkCompletion')();
    if (result && Array.isArray(result.msgs)) {
      result.msgs.forEach(function (message) {
        emitMessage({ text: message.text, type: message.type });
      });
    }
    if (result && result.ok === false) emitAudio('error');
    _method(achievements, 'queueCheck')();

    var dirtyRegions = normalizeDirtyRegions(presentation);
    if (dirtyRegions.length > 0) invalidate(dirtyRegions);
    else invalidate();
    if (result && result.ok) _method(victory, 'check')();
    return result;
  }

  function recordQuestProgress(context) {
    var state = getState();
    var Quest = systems.Quest || {};
    if (!state || typeof Quest.checkProgress !== 'function') return null;
    var questResult = Quest.checkProgress(state, context || { action: 'state_sync' });
    var messages = questResult && Array.isArray(questResult.msgs) ? questResult.msgs : [];
    messages.forEach(function (message) {
      emitMessage({ text: message.text, type: message.type });
    });
    _method(story, 'queueQuestResult')(questResult);
    return questResult;
  }

  var pipeline = createActionExecutionPipeline({
    emitMessage: emitMessage,
    emitErrorCue: function () { emitAudio('error'); },
    finalizeState: _method(teaching, 'checkCompletion'),
    queueAchievementCheck: _method(achievements, 'queueCheck'),
    render: function (result, specification) {
      var dirtyRegions = specification && specification.dirtyRegions;
      if (dirtyRegions) invalidate(dirtyRegions);
      else invalidate();
    },
    checkVictory: _method(victory, 'check'),
  });

  var fleet = createFleetActionController({
    getState: getState,
    systems: {
      Fleet: systems.Fleet,
      Crew: systems.Crew,
      MidgameTeachingChain: systems.MidgameTeachingChain,
    },
    dispatch: presentResult,
    recordQuestProgress: recordQuestProgress,
    completeTeachingStep: _method(teaching, 'completeStep'),
    startDispatchClock: _method(clock, 'startDispatch'),
    stopDispatchClock: _method(clock, 'stopDispatch'),
    resetRealtimeClock: _method(clock, 'resetRealtime'),
    cancelShipFlight: _method(ui, 'cancelShipFlight'),
    setRecentModInstallContext: _method(guidance, 'setRecentModInstallContext'),
    showCompletion: _showCompletion,
    getRouteGuidance: function () { return _method(features, 'get')('routeGuidance'); },
    getDispatchContext: _method(guidance, 'getDispatchContext', function () { return null; }),
  });

  var commerce = createCommerceOperationsController({
    getState: getState,
    getRuntime: function () { return _method(features, 'get')('commerceRuntime'); },
    requestRuntime: function () { return _method(features, 'load')('commerceRuntime'); },
    dispatch: presentResult,
    recordQuestProgress: recordQuestProgress,
    completeTeachingStep: _method(teaching, 'completeStep'),
  });

  var archive = createArchiveActionController({
    getState: getState,
    systems: {
      Research: systems.Research,
      Quest: systems.Quest,
      Tutorial: systems.Tutorial,
    },
    dispatch: presentResult,
    updateUI: function (presentation) {
      var dirtyRegions = normalizeDirtyRegions(presentation, DEFAULT_ACTION_DIRTY_REGIONS);
      invalidate(dirtyRegions.length > 0 ? dirtyRegions : DEFAULT_ACTION_DIRTY_REGIONS);
    },
    emitLog: emitMessage,
    activateArchiveTab: _method(navigation, 'activateArchiveTab'),
    openMarketPanel: _method(navigation, 'openMarketPanel'),
    openMarketSystemPanel: _method(navigation, 'openMarketSystemPanel'),
    selectAvailableQuest: _method(commands, 'selectAvailableQuest'),
    openRecommendedDispatch: _method(commands, 'openRecommendedDispatch'),
    queueQuestDialogueResult: _method(story, 'queueQuestResult'),
    playTriggerDialogue: _method(story, 'playTrigger'),
  });

  var trade = createTradeActionController({
    getState: getState,
    systems: {
      Trade: systems.Trade,
      Economy: systems.Economy,
      Fleet: systems.Fleet,
      Faction: systems.Faction,
      Quest: systems.Quest,
      Tutorial: systems.Tutorial,
      Progression: systems.Progression,
    },
    pipeline: pipeline,
    returnToStarmap: _method(navigation, 'returnToStarmap'),
    emitAudio: emitAudio,
    emitMessage: emitMessage,
    queueQuestDialogueResult: _method(story, 'queueQuestResult'),
    showCompletion: _showCompletion,
  });

  var travel = createTravelActionController({
    getState: getState,
    systems: {
      Trade: systems.Trade,
      Economy: systems.Economy,
      Fleet: systems.Fleet,
      Faction: systems.Faction,
      Quest: systems.Quest,
      Tutorial: systems.Tutorial,
      Progression: systems.Progression,
    },
    pipeline: pipeline,
    hasPendingEvent: _method(surfaces, 'hasPendingEvent', function () { return false; }),
    forcePendingEvent: _method(surfaces, 'forcePendingEvent'),
    isShipFlying: _method(surfaces, 'isShipFlying', function () { return false; }),
    emitMessage: emitMessage,
    emitAudio: emitAudio,
    flyShip: _method(ui, 'flyShip'),
    refreshGalaxy: _method(ui, 'refreshGalaxy'),
    refreshMarketLocation: _method(ui, 'refreshMarketLocation'),
    stopDispatchClock: _method(clock, 'stopDispatch'),
    queueQuestDialogueResult: _method(story, 'queueQuestResult'),
    scheduleRandomEvent: _method(randomEvents, 'schedule'),
    captureState: _method(persistence, 'captureState'),
    saveAutosave: _method(persistence, 'saveAutosave'),
    eventBaseChance: Number.isFinite(deps.eventBaseChance) ? deps.eventBaseChance : 0,
  });

  var exploration = createExplorationOperationsController({
    getState: getState,
    systems: {
      Exploration: systems.Exploration,
      Fleet: systems.Fleet,
      GalaxyData: systems.GalaxyData,
    },
    pipeline: pipeline,
  });

  var event = createEventActionController({
    getState: getState,
    systems: { Fleet: systems.Fleet },
    pipeline: pipeline,
    getRuntime: _method(randomEvents, 'getRuntime', function () { return null; }),
    emitMessage: emitMessage,
    refreshActionGuide: _method(guidance, 'refresh'),
    captureState: _method(persistence, 'captureState'),
    saveAutosave: _method(persistence, 'saveAutosave'),
  });

  var dispatch = createDispatchActionController({
    getState: getState,
    systems: { Dispatch: systems.Dispatch, Fleet: systems.Fleet },
    refuel: function (options) { return trade.refuel(options); },
    travel: function (systemId) { return travel.travel(systemId); },
    confirmTrade: function () { return trade.confirm.apply(null, arguments); },
    isGameOver: _method(surfaces, 'isGameOver', function () { return false; }),
    hasBlockingSurfaceOpen: _method(surfaces, 'hasBlockingSurfaceOpen', function () { return false; }),
    emitMessage: emitMessage,
    stopClock: _method(clock, 'stopDispatch'),
    render: invalidate,
  });

  var day = createGameDayController({
    getState: getState,
    getSessionToken: getSessionToken,
    systems: { Fleet: systems.Fleet },
    runtime: { advanceDays: _requiredFunction(runtime.advanceDays, 'ports.runtime.advanceDays') },
    pipeline: pipeline,
    queueQuestDialogueResult: _method(story, 'queueQuestResult'),
    captureState: _method(persistence, 'captureState'),
    saveAutosave: _method(persistence, 'saveAutosave'),
  });

  return Object.freeze({
    archive: archive,
    commerce: commerce,
    day: day,
    dispatch: dispatch,
    event: event,
    exploration: exploration,
    fleet: fleet,
    pipeline: pipeline,
    presentResult: presentResult,
    recordQuestProgress: recordQuestProgress,
    trade: trade,
    travel: travel,
  });
}
