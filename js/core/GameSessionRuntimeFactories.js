// js/core/GameSessionRuntimeFactories.js — 状态、时钟、会话与持久化节点装配

import * as Economy from '../systems/economy/Economy.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Faction from '../systems/faction/FactionSystem.js';
import * as Research from '../systems/research/ResearchSystem.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import * as Tutorial from '../systems/tutorial/TutorialSystem.js';
import * as BalanceMetrics from '../systems/metrics/BalanceMetricsSystem.js';
import * as MidgameTeachingChain from '../systems/guidance/MidgameTeachingChain.js';
import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import * as GameTime from '../systems/time/GameTimeSystem.js';
import * as Renderer3D from '../ui/StarmapRenderer.js';
import * as MapUI from '../ui/MapUI.js';
import * as EventUI from '../ui/EventUI.js';
import * as Settings from './SettingsCore.js';
import { TIME_CONFIG } from '../data/constants.js';
import { UI_REGION } from './ActionPresentation.js';
import { createGameSystemRuntime } from './GameSystemRuntime.js';
import { createGameLoopRuntime } from './GameLoopRuntime.js';
import { createGameSessionLifecycle } from './GameSessionLifecycle.js';
import { createGamePersistenceController } from './GamePersistenceController.js';

export function createGameSessionRuntimeFactories(context) {
  var resolve = context.resolve;
  var getState = context.getState;
  var getSettings = context.getSettings;
  var getSessionToken = context.getSessionToken;
  var isSessionTokenCurrent = context.isSessionTokenCurrent;
  var replaceState = context.replaceState;
  var resetSessionTransients = context.resetSessionTransients;
  var updateUI = context.updateUI;
  var startFreshSession = context.startFreshSession;
  var emitLog = context.emitLog;

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

  return {
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
  };
}
