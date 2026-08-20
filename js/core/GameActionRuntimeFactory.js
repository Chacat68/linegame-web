// js/core/GameActionRuntimeFactory.js — 领域动作运行时节点装配

import * as Economy from '../systems/economy/Economy.js';
import * as Trade from '../systems/trade/TradeSystem.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as Research from '../systems/research/ResearchSystem.js';
import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Crew from '../systems/fleet/CrewSystem.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import * as Tutorial from '../systems/tutorial/TutorialSystem.js';
import * as Progression from '../systems/progression/ProgressionSystem.js';
import * as MidgameTeachingChain from '../systems/guidance/MidgameTeachingChain.js';
import * as Renderer3D from '../ui/StarmapRenderer.js';
import * as MapUI from '../ui/MapUI.js';
import * as EventUI from '../ui/EventUI.js';
import * as Dispatch from './DispatchController.js';
import { EVENT_CONFIG } from '../data/constants.js';
import { createGameActionRuntime } from './GameActionRuntime.js';
import {
  hasBlockingSurfaceOpen,
  isBlockingSurfaceVisible,
} from '../ui/SurfaceManager.js';

export function createGameActionRuntimeFactory(context) {
  var resolve = context.resolve;
  var getState = context.getState;
  var getSessionToken = context.getSessionToken;
  var updateUI = context.updateUI;
  var emitLog = context.emitLog;
  var emitAudio = context.emitAudio;

  function _getFeatureRuntime() { return resolve('features'); }
  function _getSystemRuntime() { return resolve('systems'); }
  function _getGameLoopRuntime() { return resolve('gameLoop'); }
  function _getDialogueController() { return resolve('dialogue'); }
  function _getRandomEventController() { return resolve('randomEvent'); }
  function _getGuidanceRuntime() { return resolve('guidance'); }
  function _getVictoryController() { return resolve('victory'); }
  function _getAchievementController() { return resolve('achievement'); }
  function _getPersistenceController() { return resolve('persistence'); }

  function _returnToStarmapAfterTrade() {
    if (MapUI.focusStarmap) MapUI.focusStarmap();
    if (MapUI.closeMarket) MapUI.closeMarket();
  }

  return {
    actions: function () {
      return createGameActionRuntime({
        getState: getState,
        getSessionToken: getSessionToken,
        eventBaseChance: EVENT_CONFIG.baseChance,
        systems: {
          Trade: Trade,
          Economy: Economy,
          Fleet: Fleet,
          Crew: Crew,
          Faction: Faction,
          Research: Research,
          Quest: Quest,
          Tutorial: Tutorial,
          Progression: Progression,
          Exploration: Exploration,
          GalaxyData: GalaxyData,
          MidgameTeachingChain: MidgameTeachingChain,
          Dispatch: Dispatch,
        },
        ports: {
          ui: {
            invalidate: updateUI,
            showCompletion: function (completion) { _getGuidanceRuntime().showCompletion(completion); },
            cancelShipFlight: function () {
              if (Renderer3D.cancelShipFlight) Renderer3D.cancelShipFlight();
            },
            flyShip: function (previousSystem, systemId, flight) {
              if (!Renderer3D.isActive() || !previousSystem) return;
              Renderer3D.flyShipTo(previousSystem, systemId, null, flight.shipTypeId, {
                shipIndex: flight.shipIndex,
                routeRevision: flight.routeRevision,
              });
            },
            refreshGalaxy: MapUI.refreshGalaxyBtn,
            refreshMarketLocation: MapUI.refreshMarketLocation,
          },
          clock: {
            startDispatch: function () { return _getGameLoopRuntime().startDispatch(); },
            stopDispatch: function () { return _getGameLoopRuntime().stopDispatch(); },
            resetRealtime: function (timestamp) { return _getGameLoopRuntime().reset(timestamp); },
          },
          features: {
            get: function (feature) { return _getFeatureRuntime().get(feature); },
            load: function (feature) { return _getFeatureRuntime().load(feature); },
          },
          teaching: {
            checkCompletion: function () { return _getGuidanceRuntime().checkTeachingCompletion(); },
            completeStep: function (chainId, stepId) {
              return _getGuidanceRuntime().completeTeachingStep(chainId, stepId);
            },
          },
          guidance: {
            setRecentModInstallContext: function (payload) {
              _getGuidanceRuntime().setRecentModInstallContext(payload);
            },
            getDispatchContext: function (state) { return _getGuidanceRuntime().getDispatchContext(state); },
            refresh: function () { return _getGuidanceRuntime().refresh(); },
          },
          story: {
            queueQuestResult: function () { return _getDialogueController().queueQuestResult.apply(null, arguments); },
            playTrigger: function () { return _getDialogueController().playTrigger.apply(null, arguments); },
          },
          persistence: {
            captureState: _getPersistenceController().captureState,
            saveAutosave: _getPersistenceController().saveAutosave,
          },
          commands: {
            selectAvailableQuest: function () { return _getGuidanceRuntime().selectAvailableQuest.apply(null, arguments); },
            openRecommendedDispatch: function () { return _getGuidanceRuntime().openRecommendedDispatch.apply(null, arguments); },
          },
          navigation: {
            activateArchiveTab: MapUI.activateTab,
            openMarketPanel: MapUI.openMarketPanel,
            openMarketSystemPanel: MapUI.openMarketSystemPanel,
            returnToStarmap: _returnToStarmapAfterTrade,
          },
          randomEvents: {
            schedule: function () { return _getRandomEventController().scheduleRoll.apply(null, arguments); },
            getRuntime: function () { return _getRandomEventController().getRuntime(); },
          },
          surfaces: {
            hasPendingEvent: EventUI.hasPendingEvent,
            forcePendingEvent: EventUI.forcePendingEvent,
            isShipFlying: function () {
              return !!(Renderer3D.isActive() && Renderer3D.isShipFlying && Renderer3D.isShipFlying());
            },
            isGameOver: function () { return isBlockingSurfaceVisible('gameover-modal'); },
            hasBlockingSurfaceOpen: function () {
              if (hasBlockingSurfaceOpen()) return true;
              var FleetUI = _getFeatureRuntime().get('fleet');
              return !!(
                FleetUI &&
                typeof FleetUI.getActiveDispatchModalContext === 'function' &&
                FleetUI.getActiveDispatchModalContext()
              );
            },
          },
          events: {
            emitMessage: function (message) {
              emitLog({ text: message.text, type: message.type });
            },
            emitAudio: emitAudio,
          },
          achievements: { queueCheck: function () { return _getAchievementController().queueCheck(); } },
          victory: { check: function () { return _getVictoryController().check(); } },
          runtime: {
            advanceDays: function () { return _getSystemRuntime().advanceDays.apply(null, arguments); },
          },
        },
      });
    },
  };
}
