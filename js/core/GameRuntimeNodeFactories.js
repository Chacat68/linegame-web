// js/core/GameRuntimeNodeFactories.js — 应用运行时节点工厂
//
// 只负责把领域系统、UI 端口和应用服务装配为 Runtime Graph 节点。
// 节点实例、会话状态与启动/关闭顺序仍由 GameApplication 持有。

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
import * as GameTime from '../systems/time/GameTimeSystem.js';
import * as Victory from '../systems/victory/VictorySystem.js';
import * as BalanceMetrics from '../systems/metrics/BalanceMetricsSystem.js';
import * as Progression from '../systems/progression/ProgressionSystem.js';
import * as Guidance from '../systems/guidance/GuidanceSystem.js';
import * as MidgameTeachingChain from '../systems/guidance/MidgameTeachingChain.js';
import * as Renderer3D from '../ui/StarmapRenderer.js';
import * as HUD from '../ui/HUD.js';
import * as ShipUI from '../ui/ShipUI.js';
import * as MapUI from '../ui/MapUI.js';
import * as Modal from '../ui/Modal.js';
import * as EventUI from '../ui/EventUI.js';
import * as ActionGuideUI from '../ui/ActionGuideUI.js';
import * as ContextInspector from '../ui/ContextInspector.js';
import * as DeferredFeatureStatusUI from '../ui/DeferredFeatureStatusUI.js';
import * as WorkspaceDetailSurface from '../ui/WorkspaceDetailSurface.js';
import * as UIManager from '../ui/UIManager.js';
import * as Dispatch from './DispatchController.js';
import * as Settings from './SettingsCore.js';
import { DIFFICULTY_LEVELS, EVENT_CONFIG, TIME_CONFIG } from '../data/constants.js';
import { SYSTEMS } from '../data/systems.js';
import { getLevel } from '../data/playerLevels.js';
import { DEFAULT_ACTION_DIRTY_REGIONS, UI_REGION } from './ActionPresentation.js';
import { createGameFeatureRuntime } from './GameFeatureRuntime.js';
import { createGameSystemRuntime } from './GameSystemRuntime.js';
import { createGameLoopRuntime } from './GameLoopRuntime.js';
import { createGameSessionLifecycle } from './GameSessionLifecycle.js';
import { createGameActionRuntime } from './GameActionRuntime.js';
import { createDialogueRuntimeController } from './DialogueRuntimeController.js';
import { createRandomEventRuntimeController } from './RandomEventRuntimeController.js';
import { createGameGuidanceRuntime } from './GameGuidanceRuntime.js';
import { createVictoryRuntimeController } from './VictoryRuntimeController.js';
import { createAchievementRuntimeController } from './AchievementRuntimeController.js';
import { createGamePersistenceController } from './GamePersistenceController.js';
import { createGameUiApplicationRuntime } from './GameUiApplicationRuntime.js';
import {
  hasBlockingSurfaceOpen,
  hideBlockingSurface,
  isBlockingSurfaceVisible,
} from '../ui/SurfaceManager.js';

export const GAME_RUNTIME_NODE_IDS = Object.freeze([
  'features',
  'ui',
  'systems',
  'gameLoop',
  'sessionLifecycle',
  'actions',
  'dialogue',
  'randomEvent',
  'guidance',
  'victory',
  'achievement',
  'persistence',
]);

export function releaseGameRuntimeStaticPorts() {
  GameTime.setAdvancedDayProcessor(null);
}

function _requireFunction(context, name) {
  if (!context || typeof context[name] !== 'function') {
    throw new TypeError('GameRuntimeNodeFactories requires context.' + name + '().');
  }
  return context[name];
}

export function createGameRuntimeNodeFactories(context) {
  var resolve = _requireFunction(context, 'resolve');
  var getState = _requireFunction(context, 'getState');
  var getSettings = _requireFunction(context, 'getSettings');
  var getRevision = _requireFunction(context, 'getRevision');
  var getSessionToken = _requireFunction(context, 'getSessionToken');
  var isSessionTokenCurrent = _requireFunction(context, 'isSessionTokenCurrent');
  var replaceState = _requireFunction(context, 'replaceState');
  var resetSessionTransients = _requireFunction(context, 'resetSessionTransients');
  var updateUI = _requireFunction(context, 'updateUI');
  var startFreshSession = _requireFunction(context, 'startFreshSession');
  var emitLog = _requireFunction(context, 'emitLog');
  var emitAudio = _requireFunction(context, 'emitAudio');
  var reportDeferredUiFailure = _requireFunction(context, 'reportDeferredUiFailure');

  function _getFeatureRuntime() { return resolve('features'); }
  function _getUiRuntime() { return resolve('ui'); }
  function _getSystemRuntime() { return resolve('systems'); }
  function _getGameLoopRuntime() { return resolve('gameLoop'); }
  function _getSessionLifecycle() { return resolve('sessionLifecycle'); }
  function _getActionRuntime() { return resolve('actions'); }
  function _getDialogueController() { return resolve('dialogue'); }
  function _getRandomEventController() { return resolve('randomEvent'); }
  function _getGuidanceRuntime() { return resolve('guidance'); }
  function _getVictoryController() { return resolve('victory'); }
  function _getAchievementController() { return resolve('achievement'); }
  function _getPersistenceController() { return resolve('persistence'); }

  function _setDeferredUiState(surface, state) {
    if (typeof document === 'undefined' || !document.body || !document.body.dataset) return;
    document.body.dataset[surface + 'UiState'] = state;
  }

  function _initializeCommerceRuntime(CommerceRuntime, state) {
    var targetState = state || getState();
    if (!CommerceRuntime || !targetState) return;
    CommerceRuntime.init(targetState);
    GameTime.setAdvancedDayProcessor(CommerceRuntime.advanceDay);
  }

  function _syncDeferredFeatures() {
    _getFeatureRuntime().syncAll();
    _getGuidanceRuntime().prefetchForState(getState());
  }

  function _prepareSessionState(state, sessionContext) {
    _getVictoryController().reset();
    _getDialogueController().reset(state);
    if (sessionContext.restoreRandomRuntime) _getRandomEventController().sync(state);
    else _getRandomEventController().reset(state);
    EventUI.clearPendingEvent();

    if (sessionContext.syncDifficulty) {
      getSettings().difficulty = state.difficulty;
      Settings.saveSettings(getSettings());
    }
  }

  function _syncSessionProjections(state) {
    MapUI.syncState(getState);
    Renderer3D.resetRuntimeState(state.currentSystem);
    MapUI.refreshGalaxyBtn(state);
  }

  function _returnToStarmapAfterTrade() {
    if (MapUI.focusStarmap) MapUI.focusStarmap();
    if (MapUI.closeMarket) MapUI.closeMarket();
  }

  var factories = {
    features: function () {
      return createGameFeatureRuntime({
        getContext: function () {
          return {
            state: getState(),
            revision: getRevision(),
            sessionToken: getSessionToken(),
            settings: getSettings(),
          };
        },
        reportFailure: reportDeferredUiFailure,
        hooks: {
          initializeCommerceRuntime: _initializeCommerceRuntime,
          setAdvancedGuidanceProvider: Guidance.setAdvancedGuidanceProvider,
          setQuestRouteResolver: Dispatch.setQuestRouteResolver,
          resetAchievementRuntime: function () { _getAchievementController().reset(); },
          syncArchiveView: function (ArchiveUI) { _getGuidanceRuntime().syncArchiveView(ArchiveUI); },
          syncVictoryView: function (module) { _getVictoryController().syncView(module); },
          handleVictoryLoadFailure: function () { _getVictoryController().handleLoadFailure(); },
          syncTutorialView: function (module) { _getGuidanceRuntime().syncTutorialView(module); },
          syncSettingsView: function (module) { _getUiRuntime().syncSettings(module); },
        },
      });
    },

    guidance: function () {
      return createGameGuidanceRuntime({
        getState: getState,
        getSessionToken: getSessionToken,
        isSessionTokenCurrent: isSessionTokenCurrent,
        features: _getFeatureRuntime(),
        systems: {
          Economy: Economy,
          Exploration: Exploration,
          Fleet: Fleet,
          GalaxyData: GalaxyData,
          Guidance: Guidance,
          MidgameTeachingChain: MidgameTeachingChain,
          Quest: Quest,
          Trade: Trade,
          Tutorial: Tutorial,
        },
        ui: {
          ActionGuideUI: ActionGuideUI,
          EventUI: EventUI,
          MapUI: MapUI,
          Modal: Modal,
          UIManager: UIManager,
        },
        actions: {
          acceptQuest: function () { return _getActionRuntime().archive.onAcceptQuest.apply(null, arguments); },
          explorePoi: function () { return _getActionRuntime().exploration.explorePoi.apply(null, arguments); },
          getFleetActions: function () { return _getActionRuntime().fleet; },
          getPoiStatus: function () { return _getActionRuntime().exploration.getPoiStatus.apply(null, arguments); },
          refuel: function () { return _getActionRuntime().trade.refuel.apply(null, arguments); },
          travel: function () { return _getActionRuntime().travel.travel.apply(null, arguments); },
        },
        selectors: { hasBlockingSurfaceOpen: hasBlockingSurfaceOpen },
        callbacks: {
          emitLog: emitLog,
          invalidate: function () { updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
          renderFleet: function (FleetUI) { return _getUiRuntime().renderFleet(FleetUI); },
          reportError: function (scope, error) {
            console.error('[GameGuidanceRuntime] Failed in ' + scope + '.', error);
          },
        },
      });
    },

    achievement: function () {
      return createAchievementRuntimeController({
        getState: getState,
        getSessionToken: getSessionToken,
        isSessionTokenCurrent: isSessionTokenCurrent,
        loadRuntime: function () { return _getFeatureRuntime().load('achievement'); },
        emitMessage: emitLog,
        invalidate: function () { updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
        checkVictory: function () { _getVictoryController().check(); },
        reportFailure: function (error) { reportDeferredUiFailure('achievement', error); },
      });
    },

    persistence: function () {
      return createGamePersistenceController({
        getState: getState,
        getSessionToken: getSessionToken,
        isSessionTokenCurrent: isSessionTokenCurrent,
        captureRuntime: function (state, options) { return _getSystemRuntime().capture(state, options); },
        transitionState: function (state, options) { return _getSessionLifecycle().transition(state, options); },
        startFreshSession: startFreshSession,
        resetTutorial: Tutorial.reset,
        hideSettings: function () { _getUiRuntime().hideSettings(); },
        emitMessage: emitLog,
        invalidateSaveUi: function () { updateUI([UI_REGION.SAVE, UI_REGION.GUIDE]); },
      });
    },

    systems: function () {
      return createGameSystemRuntime({
        systems: {
          Economy: Economy,
          Fleet: Fleet,
          Faction: Faction,
          Research: Research,
          Quest: Quest,
          Tutorial: Tutorial,
          BalanceMetrics: BalanceMetrics,
          MidgameTeachingChain: MidgameTeachingChain,
          GalaxyData: GalaxyData,
          GameTime: GameTime,
        },
        hooks: {
          ensureAchievementState: function (state) { _getAchievementController().ensureState(state); },
          syncFeatureRegistry: _syncDeferredFeatures,
        },
      });
    },

    gameLoop: function () {
      return createGameLoopRuntime({
        getState: getState,
        getSettings: getSettings,
        getFeatureRuntime: _getFeatureRuntime,
        getGuidanceRuntime: _getGuidanceRuntime,
        getActionRuntime: _getActionRuntime,
        systems: { Fleet: Fleet, Tutorial: Tutorial, GameTime: GameTime },
        ui: { MapUI: MapUI, Renderer: Renderer3D },
        callbacks: {
          setDayDuration: function (nextDurationMs) {
            getSettings().realtimeDayDurationMs = nextDurationMs;
          },
          emitLog: emitLog,
        },
        config: { defaultDayDurationMs: TIME_CONFIG.realtimeDayDurationMs },
      });
    },

    sessionLifecycle: function () {
      return createGameSessionLifecycle({
        replaceState: replaceState,
        getSessionToken: getSessionToken,
        isSessionTokenCurrent: isSessionTokenCurrent,
        runtime: {
          restore: function (state, options) { return _getSystemRuntime().restore(state, options); },
        },
        clock: {
          stop: function () { return _getGameLoopRuntime().stop(); },
          start: function () { return _getGameLoopRuntime().start(); },
        },
        hooks: {
          resetTransients: resetSessionTransients,
          prepareState: _prepareSessionState,
          syncProjections: _syncSessionProjections,
          render: function () { updateUI(); },
          resumeRecurring: function (state) { return _getGameLoopRuntime().resumeRecurring(state); },
          restorePendingEvent: function (state) { return _getRandomEventController().restorePending(state); },
        },
      });
    },

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

    dialogue: function () {
      return createDialogueRuntimeController({
        getState: getState,
        getSessionToken: getSessionToken,
        isSessionTokenCurrent: isSessionTokenCurrent,
        loadRuntime: function () { return _getFeatureRuntime().loadOrReject('dialogue'); },
        hooks: {
          setTelemetryState: function (state) { _setDeferredUiState('dialogue', state); },
          reportFailure: function (error) { reportDeferredUiFailure('dialogue', error); },
          onCompletedQuest: function () {
            Tutorial.checkTrigger('complete_quest');
            updateUI(DEFAULT_ACTION_DIRTY_REGIONS);
          },
        },
      });
    },

    randomEvent: function () {
      return createRandomEventRuntimeController({
        getState: getState,
        getSessionToken: getSessionToken,
        isSessionTokenCurrent: isSessionTokenCurrent,
        loadRuntime: function () { return _getFeatureRuntime().loadOrReject('randomEvent'); },
        hooks: {
          setTelemetryState: function (state) { _setDeferredUiState('randomEvent', state); },
          reportFailure: function (error) { reportDeferredUiFailure('randomEvent', error); },
          presentEvent: function (event, onChoice) { EventUI.setPendingEvent(event, onChoice); },
          onChoice: function (choiceIndex) { return _getActionRuntime().event.resolveChoice(choiceIndex); },
          emitAudio: emitAudio,
          emitMessage: emitLog,
          captureState: _getPersistenceController().captureState,
          saveAutosave: _getPersistenceController().saveAutosave,
          refreshActionGuide: function () { return _getGuidanceRuntime().refresh(); },
        },
      });
    },

    victory: function () {
      return createVictoryRuntimeController({
        getState: getState,
        getSessionToken: getSessionToken,
        isSessionTokenCurrent: isSessionTokenCurrent,
        systems: {
          Victory: Victory,
          BalanceMetrics: BalanceMetrics,
          Trade: Trade,
          Fleet: Fleet,
          Quest: Quest,
        },
        getLevelTitle: function (experience) { return getLevel(experience).title; },
        loadView: function () { return _getFeatureRuntime().load('victory'); },
        emitMessage: emitLog,
        invalidate: function () { updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
        refreshActionGuide: function () { return _getGuidanceRuntime().refresh(); },
        restartSession: function () { return _getPersistenceController().restart.apply(null, arguments); },
      });
    },

    ui: function () {
      return createGameUiApplicationRuntime({
        getState: getState,
        getRevision: getRevision,
        getSessionToken: getSessionToken,
        isSessionTokenCurrent: isSessionTokenCurrent,
        features: _getFeatureRuntime(),
        events: context.events,
        ui: {
          HUD: HUD,
          ShipUI: ShipUI,
          MapUI: MapUI,
          UIManager: UIManager,
          Modal: Modal,
          Renderer: Renderer3D,
          ContextInspector: ContextInspector,
          DeferredFeatureStatusUI: DeferredFeatureStatusUI,
          WorkspaceDetailSurface: WorkspaceDetailSurface,
        },
        systems: {
          Trade: Trade,
          Dispatch: Dispatch,
          Tutorial: Tutorial,
          systems: SYSTEMS,
        },
        services: {
          getActionRuntime: _getActionRuntime,
          getGuidanceRuntime: _getGuidanceRuntime,
          getPersistenceController: _getPersistenceController,
          getVictoryController: _getVictoryController,
        },
        callbacks: {
          getSettings: getSettings,
          hideSettingsFallback: hideBlockingSurface,
          onDifficultyChanged: function (nextDifficulty) {
            if (!DIFFICULTY_LEVELS[nextDifficulty]) return;
            getState().difficulty = nextDifficulty;
            getSettings().difficulty = nextDifficulty;
            updateUI(DEFAULT_ACTION_DIRTY_REGIONS);
          },
          onRealtimeDayDurationChanged: function (nextDurationMs) {
            _getGameLoopRuntime().handleDayDurationChange(nextDurationMs);
          },
          onResetTutorial: function () {
            _getPersistenceController().restart('settings-tutorial-reset');
          },
          onClearSaves: function () { return _getPersistenceController().clearAllSlots(); },
          emitLog: emitLog,
          invalidate: function () { updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
          setTelemetryState: _setDeferredUiState,
          refuel: function () { return _getActionRuntime().trade.refuel(); },
          travel: function (systemId) { return _getActionRuntime().travel.travel(systemId); },
          galaxyJump: function (systemId) { return _getActionRuntime().travel.travel(systemId); },
          explorePoi: function (systemId, poiId) {
            return _getActionRuntime().exploration.explorePoi(systemId, poiId);
          },
          getPoiStatus: function (systemId, poiId) {
            return _getActionRuntime().exploration.getPoiStatus(systemId, poiId);
          },
          confirmTrade: function () { return _getActionRuntime().trade.confirm.apply(null, arguments); },
        },
      });
    },
  };

  GAME_RUNTIME_NODE_IDS.forEach(function (id) {
    if (typeof factories[id] !== 'function') {
      throw new Error('Missing Runtime Graph factory: ' + id);
    }
  });

  return Object.freeze(factories);
}
