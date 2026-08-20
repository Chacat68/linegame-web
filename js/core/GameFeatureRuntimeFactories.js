// js/core/GameFeatureRuntimeFactories.js — 延迟功能与按需控制器节点装配

import * as BalanceMetrics from '../systems/metrics/BalanceMetricsSystem.js';
import * as Trade from '../systems/trade/TradeSystem.js';
import * as Fleet from '../systems/fleet/FleetSystem.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import * as Tutorial from '../systems/tutorial/TutorialSystem.js';
import * as GameTime from '../systems/time/GameTimeSystem.js';
import * as Victory from '../systems/victory/VictorySystem.js';
import * as Guidance from '../systems/guidance/GuidanceSystem.js';
import * as EventUI from '../ui/EventUI.js';
import * as Dispatch from './DispatchController.js';
import { getLevel } from '../data/playerLevels.js';
import { DEFAULT_ACTION_DIRTY_REGIONS } from './ActionPresentation.js';
import { createGameFeatureRuntime } from './GameFeatureRuntime.js';
import { createDialogueRuntimeController } from './DialogueRuntimeController.js';
import { createRandomEventRuntimeController } from './RandomEventRuntimeController.js';
import { createVictoryRuntimeController } from './VictoryRuntimeController.js';
import { createAchievementRuntimeController } from './AchievementRuntimeController.js';

export function createGameFeatureRuntimeFactories(context) {
  var resolve = context.resolve;
  var getState = context.getState;
  var getSettings = context.getSettings;
  var getRevision = context.getRevision;
  var getSessionToken = context.getSessionToken;
  var isSessionTokenCurrent = context.isSessionTokenCurrent;
  var updateUI = context.updateUI;
  var emitLog = context.emitLog;
  var emitAudio = context.emitAudio;
  var reportDeferredUiFailure = context.reportDeferredUiFailure;

  function _getFeatureRuntime() { return resolve('features'); }
  function _getUiRuntime() { return resolve('ui'); }
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

  return {
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
  };
}
