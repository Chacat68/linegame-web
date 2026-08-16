// js/core/GameManager.js — 游戏主控制器
// 依赖：所有 systems/、ui/ 模块
// 导出：init
//
// 职责：迁移期组合根与兼容门面。StateSession、各 ActionController、
//       Runtime 与 UI Coordinator 分别持有会话、动作和视图职责。

import * as EventBus   from './EventBus.js';
import * as Economy    from '../systems/economy/Economy.js';
import * as Trade      from '../systems/trade/TradeSystem.js';
import * as Faction    from '../systems/faction/FactionSystem.js';
import * as Research   from '../systems/research/ResearchSystem.js';
import { getResearchDispatchBlockerState } from '../ui/ResearchGuidance.js';
import * as Renderer3D from '../ui/StarmapRenderer.js';
import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import * as HUD        from '../ui/HUD.js';
import * as ShipUI     from '../ui/ShipUI.js';
import * as MapUI      from '../ui/MapUI.js';
import * as Modal      from '../ui/Modal.js';
import * as EventUI    from '../ui/EventUI.js';
import * as ActionGuideUI from '../ui/ActionGuideUI.js';
import * as ContextInspector from '../ui/ContextInspector.js';
import * as UIManager  from '../ui/UIManager.js';
import * as Fleet      from '../systems/fleet/FleetSystem.js';
import * as Crew       from '../systems/fleet/CrewSystem.js';
import * as Quest      from '../systems/quest/QuestSystem.js';
import * as Tutorial   from '../systems/tutorial/TutorialSystem.js';
import * as GameTime from '../systems/time/GameTimeSystem.js';
import { DIFFICULTY_LEVELS, EVENT_CONFIG, TIME_CONFIG } from '../data/constants.js';
import { resolveStartupState } from './StartupState.js';
import * as Victory from '../systems/victory/VictorySystem.js';
import * as BalanceMetrics from '../systems/metrics/BalanceMetricsSystem.js';
import { getLevel } from '../data/playerLevels.js';
import { SYSTEMS } from '../data/systems.js';
import { GOODS } from '../data/goods.js';
import * as Settings from './SettingsCore.js';
import * as Audio from './AudioManager.js';
import * as Progression from '../systems/progression/ProgressionSystem.js';
import * as Guidance from '../systems/guidance/GuidanceSystem.js';
import * as MidgameTeachingChain from '../systems/guidance/MidgameTeachingChain.js';
import * as Dispatch from './DispatchController.js';
import { createGameFeatureFailureReporter } from './GameFeatureManifest.js';
import { createGameFeatureRuntime } from './GameFeatureRuntime.js';
import { createStateSession } from './StateSession.js';
import { createGameSystemRuntime } from './GameSystemRuntime.js';
import { createGameClockController } from './GameClockController.js';
import { createGameSessionLifecycle } from './GameSessionLifecycle.js';
import { DEFAULT_ACTION_DIRTY_REGIONS, UI_REGION } from './ActionPresentation.js';
import { createGameActionRuntime } from './GameActionRuntime.js';
import { createDialogueRuntimeController } from './DialogueRuntimeController.js';
import { createRandomEventRuntimeController } from './RandomEventRuntimeController.js';
import { createCommandDestinationController } from './CommandDestinationController.js';
import { createGuidanceExecutionAdapter } from './GuidanceExecutionAdapter.js';
import { createMarketWorkspaceController } from './MarketWorkspaceController.js';
import { createOnboardingUiController } from './OnboardingUiController.js';
import { createOnboardingPolicyController } from './OnboardingPolicyController.js';
import { createTeachingGuidanceController } from './TeachingGuidanceController.js';
import { createGameUiLifecycleController } from './GameUiLifecycleController.js';
import { createSettingsUiController } from './SettingsUiController.js';
import { createVictoryRuntimeController } from './VictoryRuntimeController.js';
import { createAchievementRuntimeController } from './AchievementRuntimeController.js';
import { createGamePersistenceController } from './GamePersistenceController.js';
import { createGameUiCoordinator } from '../ui/GameUiCoordinator.js';
import {
  createActionGuideCoordinator,
  shouldLoadAdvancedCommerce,
} from '../ui/ActionGuideCoordinator.js';
import { createWorkspaceContextAdapters } from '../ui/WorkspaceContextAdapters.js';
import { hasBlockingSurfaceOpen, hideBlockingSurface, isBlockingSurfaceVisible, showBlockingSurface } from '../ui/SurfaceManager.js';

const _session = createStateSession();
const ACTIVE_DISPATCH_CLOCK_ID = 'active-dispatch';
const _reportDeferredUiFailure = createGameFeatureFailureReporter({
  emitLog: function (message) { EventBus.emit('log:message', message); },
  reportError: function (feature, error) {
    console.error('[GameManager] Failed to load deferred ' + feature + ' feature.', error);
  },
});
let _state     = null;
let _settings  = {
  motionLevel: 'full',
  difficulty: 'normal',
  secretRoutesVisible: true,
  realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
};
let _runtimeRevision = 0;
let _featureRuntime = null;
let _uiCoordinator = null;
let _uiLifecycleController = null;
let _systemRuntime = null;
let _gameClock = null;
let _sessionLifecycle = null;
let _actionRuntime = null;
let _dialogueController = null;
let _randomEventController = null;
let _commandDestinationController = null;
let _guidanceExecutionAdapter = null;
let _marketWorkspaceController = null;
let _onboardingUiController = null;
let _onboardingPolicyController = null;
let _teachingGuidanceController = null;
let _settingsUiController = null;
let _victoryController = null;
let _achievementController = null;
let _persistenceController = null;
let _contextAdapters = null;
let _actionGuideCoordinator = null;

function _replaceState(nextState, reason) {
  _session.replace(nextState, { reason: reason });
  _state = _session.getState();
  _runtimeRevision = _session.getRevision();
  ContextInspector.reconcileRevision(_runtimeRevision, { render: false });
  return _state;
}

function _resetSessionTransients() {
  if (_achievementController) _achievementController.reset();
  if (_actionGuideCoordinator) _actionGuideCoordinator.reset();
  if (_commandDestinationController) _commandDestinationController.reset();
  if (_marketWorkspaceController) _marketWorkspaceController.reset();
  if (_victoryController) _victoryController.reset();
}

function _getSessionToken() {
  return _session.getToken();
}

function _isSessionTokenCurrent(token) {
  return _session.isCurrent(token);
}

function _setDeferredUiState(surface, state) {
  if (typeof document === 'undefined' || !document.body || !document.body.dataset) return;
  document.body.dataset[surface + 'UiState'] = state;
}

function _initializeCommerceRuntime(CommerceRuntime, state) {
  var targetState = state || _state;
  if (!CommerceRuntime || !targetState) return;
  CommerceRuntime.init(targetState);
  GameTime.setAdvancedDayProcessor(CommerceRuntime.advanceDay);
}

function _getFeatureRuntime() {
  if (_featureRuntime) return _featureRuntime;
  _featureRuntime = createGameFeatureRuntime({
    getContext: function () {
      return {
        state: _state,
        revision: _runtimeRevision,
        sessionToken: _getSessionToken(),
        settings: _settings,
      };
    },
    reportFailure: _reportDeferredUiFailure,
    hooks: {
      initializeCommerceRuntime: _initializeCommerceRuntime,
      setAdvancedGuidanceProvider: Guidance.setAdvancedGuidanceProvider,
      setQuestRouteResolver: Dispatch.setQuestRouteResolver,
      resetAchievementRuntime: function () { _getAchievementController().reset(); },
      syncArchiveView: function (ArchiveUI) {
        _getCommandDestinationController().syncArchiveView(ArchiveUI);
      },
      syncVictoryView: function (module) { _getVictoryController().syncView(module); },
      handleVictoryLoadFailure: function () { _getVictoryController().handleLoadFailure(); },
      syncTutorialView: function (module) { _getOnboardingUiController().syncTutorialView(module); },
      syncSettingsView: function (module) { _getSettingsUiController().sync(module); },
    },
  });
  return _featureRuntime;
}

function _syncDeferredFeatures() {
  _getFeatureRuntime().syncAll();
  _getActionGuideCoordinator().prefetchForState(_state);
}

function _getAchievementController() {
  if (_achievementController) return _achievementController;
  _achievementController = createAchievementRuntimeController({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    loadRuntime: function () { return _getFeatureRuntime().load('achievement'); },
    emitMessage: function (message) { EventBus.emit('log:message', message); },
    invalidate: function () { _updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
    checkVictory: function () { _getVictoryController().check(); },
    reportFailure: function (error) { _reportDeferredUiFailure('achievement', error); },
  });
  return _achievementController;
}

function _getPersistenceController() {
  if (_persistenceController) return _persistenceController;
  _persistenceController = createGamePersistenceController({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    captureRuntime: function (state, options) { return _getSystemRuntime().capture(state, options); },
    transitionState: function (state, options) { return _getSessionLifecycle().transition(state, options); },
    startFreshSession: function (reason) {
      return init(null, { restoreAutosave: false, reason: reason });
    },
    resetTutorial: Tutorial.reset,
    hideSettings: function () { _getSettingsUiController().hide(); },
    emitMessage: function (message) { EventBus.emit('log:message', message); },
    invalidateSaveUi: function () { _updateUI([UI_REGION.SAVE, UI_REGION.GUIDE]); },
  });
  return _persistenceController;
}

function _getSystemRuntime() {
  if (_systemRuntime) return _systemRuntime;
  _systemRuntime = createGameSystemRuntime({
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
      syncFeatureRegistry: function () {
        _syncDeferredFeatures();
      },
    },
  });
  return _systemRuntime;
}

function _getGameClock() {
  if (_gameClock) return _gameClock;
  _gameClock = createGameClockController({
    getState: function () { return _state; },
    getDayDurationMs: _getRealtimeDayDurationMs,
    getHullSnapshot: function (state) {
      return state && Number.isFinite(state.shipHull) ? state.shipHull : 100;
    },
    isPaused: function (state) {
      var features = _getFeatureRuntime();
      if (shouldLoadAdvancedCommerce(state) && !features.get('commerceRuntime') && features.getState('commerceRuntime') !== 'error') {
        _getActionGuideCoordinator().prefetchForState(state);
        return true;
      }
      return _isRealtimeClockPaused();
    },
    onElapsedDays: _applyRealtimeDayProgress,
    renderFrame: function (state) {
      if (!state) return;
      var mapView = MapUI.getMapView ? MapUI.getMapView() : 'planets';
      var galaxyId = MapUI.getCurrentGalaxyId ? MapUI.getCurrentGalaxyId() : 'milky_way';
      Renderer3D.render(state, mapView, galaxyId);
    },
    clockMath: GameTime,
  });
  return _gameClock;
}

function _prepareSessionState(state, context) {
  _getVictoryController().reset();
  _getDialogueController().reset(state);
  if (context.restoreRandomRuntime) _getRandomEventController().sync(state);
  else _getRandomEventController().reset(state);
  EventUI.clearPendingEvent();

  if (context.syncDifficulty) {
    _settings.difficulty = state.difficulty;
    Settings.saveSettings(_settings);
  }
}

function _syncSessionProjections(state) {
  MapUI.syncState(function () { return _state; });
  Renderer3D.resetRuntimeState(state.currentSystem);
  MapUI.refreshGalaxyBtn(state);
}

function _resumeSessionRecurring(state) {
  if (Fleet.isActiveDispatched(state)) _startActiveDispatchClock();
}

function _getSessionLifecycle() {
  if (_sessionLifecycle) return _sessionLifecycle;
  _sessionLifecycle = createGameSessionLifecycle({
    replaceState: _replaceState,
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    runtime: {
      restore: function (state, options) {
        return _getSystemRuntime().restore(state, options);
      },
    },
    clock: {
      stop: _stopGameLoop,
      start: _startGameLoop,
    },
    hooks: {
      resetTransients: _resetSessionTransients,
      prepareState: _prepareSessionState,
      syncProjections: _syncSessionProjections,
      render: function () { _updateUI(); },
      resumeRecurring: _resumeSessionRecurring,
      restorePendingEvent: function (state) { return _getRandomEventController().restorePending(state); },
    },
  });
  return _sessionLifecycle;
}

function _getActionRuntime() {
  if (_actionRuntime) return _actionRuntime;
  _actionRuntime = createGameActionRuntime({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
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
        invalidate: _updateUI,
        showCompletion: function (completion) { _showActionGuideCompletion(completion); },
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
        startDispatch: _startActiveDispatchClock,
        stopDispatch: _stopActiveDispatchClock,
        resetRealtime: function (timestamp) { _getGameClock().reset(timestamp); },
      },
      features: {
        get: function (feature) { return _getFeatureRuntime().get(feature); },
        load: function (feature) { return _getFeatureRuntime().load(feature); },
      },
      teaching: {
        checkCompletion: function () { return _getTeachingGuidanceController().checkCompletion(); },
        completeStep: function (chainId, stepId) {
          return _getTeachingGuidanceController().completeStep(chainId, stepId);
        },
      },
      guidance: {
        setRecentModInstallContext: function (context) {
          _getActionGuideCoordinator().setRecentModInstallContext(context);
        },
        getDispatchContext: function (state) { return _getActionGuideCoordinator().getDispatchContext(state); },
        refresh: _refreshActionGuide,
      },
      story: {
        queueQuestResult: _queueQuestDialogueResult,
        playTrigger: _playTriggerDialogue,
      },
      persistence: {
        captureState: _getPersistenceController().captureState,
        saveAutosave: _getPersistenceController().saveAutosave,
      },
      commands: {
        selectAvailableQuest: function () {
          return _getCommandDestinationController().selectAvailableQuest.apply(null, arguments);
        },
        openRecommendedDispatch: function () {
          return _getCommandDestinationController().openRecommendedDispatch.apply(null, arguments);
        },
      },
      navigation: {
        activateArchiveTab: MapUI.activateTab,
        openMarketPanel: MapUI.openMarketPanel,
        openMarketSystemPanel: MapUI.openMarketSystemPanel,
        returnToStarmap: _returnToStarmapAfterTrade,
      },
      randomEvents: {
        schedule: _scheduleRandomEventRoll,
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
          EventBus.emit('log:message', { text: message.text, type: message.type });
        },
        emitAudio: function (cue) { EventBus.emit('audio:cue', { cue: cue }); },
      },
      achievements: {
        queueCheck: function () { return _getAchievementController().queueCheck(); },
      },
      victory: {
        check: function () { return _getVictoryController().check(); },
      },
      runtime: {
        advanceDays: function () { return _getSystemRuntime().advanceDays.apply(null, arguments); },
      },
    },
  });
  return _actionRuntime;
}

function _getDialogueController() {
  if (_dialogueController) return _dialogueController;
  _dialogueController = createDialogueRuntimeController({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    loadRuntime: function () { return _getFeatureRuntime().loadOrReject('dialogue'); },
    hooks: {
      setTelemetryState: function (state) { _setDeferredUiState('dialogue', state); },
      reportFailure: function (error) { _reportDeferredUiFailure('dialogue', error); },
      onCompletedQuest: function () {
        Tutorial.checkTrigger('complete_quest');
        _updateUI(DEFAULT_ACTION_DIRTY_REGIONS);
      },
    },
  });
  return _dialogueController;
}

function _getRandomEventController() {
  if (_randomEventController) return _randomEventController;
  _randomEventController = createRandomEventRuntimeController({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    loadRuntime: function () { return _getFeatureRuntime().loadOrReject('randomEvent'); },
    hooks: {
      setTelemetryState: function (state) { _setDeferredUiState('randomEvent', state); },
      reportFailure: function (error) { _reportDeferredUiFailure('randomEvent', error); },
      presentEvent: function (event, onChoice) { EventUI.setPendingEvent(event, onChoice); },
      onChoice: function (choiceIndex) { _handleEventChoice(choiceIndex); },
      emitAudio: function (cue) { EventBus.emit('audio:cue', { cue: cue }); },
      emitMessage: function (message) { EventBus.emit('log:message', message); },
      captureState: _getPersistenceController().captureState,
      saveAutosave: _getPersistenceController().saveAutosave,
      refreshActionGuide: _refreshActionGuide,
    },
  });
  return _randomEventController;
}

function _getOnboardingUiController() {
  if (_onboardingUiController) return _onboardingUiController;
  _onboardingUiController = createOnboardingUiController({
    features: _getFeatureRuntime(),
    Tutorial: Tutorial,
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    callbacks: {
      emitMessage: function (message) { EventBus.emit('log:message', message); },
      invalidate: function () { _updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
      onHelperAction: function (actionId) {
        return _getTeachingGuidanceController().handleTutorialHelperAction(actionId);
      },
      refreshActionGuide: _refreshActionGuide,
      renameCompany: function (state, name) { state.companyName = name; },
      showWelcomeMessages: function () { _getOnboardingPolicyController().showWelcomeMessages(); },
    },
  });
  return _onboardingUiController;
}

function _getOnboardingPolicyController() {
  if (_onboardingPolicyController) return _onboardingPolicyController;
  _onboardingPolicyController = createOnboardingPolicyController({
    Quest: Quest,
    getState: function () { return _state; },
    emitLog: function (message) { EventBus.emit('log:message', message); },
    invalidate: function () { _updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
    refreshActionGuide: _refreshActionGuide,
  });
  return _onboardingPolicyController;
}

function _getTeachingGuidanceController() {
  if (_teachingGuidanceController) return _teachingGuidanceController;
  _teachingGuidanceController = createTeachingGuidanceController({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    loadRouteGuidance: function () { return _getFeatureRuntime().load('routeGuidance'); },
    systems: {
      Tutorial: Tutorial,
      Trade: Trade,
      MidgameTeachingChain: MidgameTeachingChain,
    },
    ui: { Modal: Modal, MapUI: MapUI },
    data: { goods: GOODS },
    emitLog: function (message) { EventBus.emit('log:message', message); },
    invalidate: function () { _updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
    refreshActionGuide: _refreshActionGuide,
    reportFailure: function (error) {
      console.error('[GameManager] Failed to execute tutorial route helper.', error);
      EventBus.emit('log:message', { text: '⚠️ 教程路线辅助暂时不可用，请稍后重试。', type: 'error' });
    },
  });
  return _teachingGuidanceController;
}

function _getSettingsUiController() {
  if (_settingsUiController) return _settingsUiController;
  _settingsUiController = createSettingsUiController({
    features: _getFeatureRuntime(),
    getSettings: function () { return _settings; },
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    Renderer: Renderer3D,
    hideFallback: hideBlockingSurface,
    callbacks: {
      onOpen: _ensureSaveUiRendered,
      onDifficultyChanged: function (nextDifficulty) {
        if (!DIFFICULTY_LEVELS[nextDifficulty]) return;
        _state.difficulty = nextDifficulty;
        _settings.difficulty = nextDifficulty;
        _updateUI(DEFAULT_ACTION_DIRTY_REGIONS);
      },
      onRealtimeDayDurationChanged: function (nextDurationMs) {
        _settings.realtimeDayDurationMs = nextDurationMs;
        _getGameClock().reset(performance.now());
        if (_gameClock && _gameClock.isRecurring(ACTIVE_DISPATCH_CLOCK_ID)) _startActiveDispatchClock();
      },
      onResetTutorial: function () {
        _getSettingsUiController().hide();
        _getPersistenceController().restart('settings-tutorial-reset');
      },
      onClearSaves: _getPersistenceController().clearAllSlots,
    },
  });
  return _settingsUiController;
}

function _getVictoryController() {
  if (_victoryController) return _victoryController;
  _victoryController = createVictoryRuntimeController({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    systems: {
      Victory: Victory,
      BalanceMetrics: BalanceMetrics,
      Trade: Trade,
    },
    getLevelTitle: function (experience) { return getLevel(experience).title; },
    loadView: function () { return _getFeatureRuntime().load('victory'); },
    emitMessage: function (message) { EventBus.emit('log:message', message); },
    refreshActionGuide: _refreshActionGuide,
    restartSession: _getPersistenceController().restart,
  });
  return _victoryController;
}

function _getActionGuideCoordinator() {
  if (_actionGuideCoordinator) return _actionGuideCoordinator;
  _actionGuideCoordinator = createActionGuideCoordinator({
    getState: function () { return _state; },
    features: _getFeatureRuntime(),
    ui: {
      ActionGuideUI: ActionGuideUI,
      MapUI: MapUI,
      UIManager: UIManager,
      EventUI: EventUI,
    },
    systems: {
      Guidance: Guidance,
      Tutorial: Tutorial,
      Fleet: Fleet,
      GalaxyData: GalaxyData,
      Exploration: Exploration,
      MidgameTeachingChain: MidgameTeachingChain,
    },
    selectors: {
      getResearchDispatchBlockerState: getResearchDispatchBlockerState,
      getPoiStatus: _getPoiStatus,
      hasBlockingSurfaceOpen: hasBlockingSurfaceOpen,
    },
    hooks: {
      onAction: _handleActionGuideAction,
    },
  });
  return _actionGuideCoordinator;
}

function _getCommandDestinationController() {
  if (_commandDestinationController) return _commandDestinationController;
  _commandDestinationController = createCommandDestinationController({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    getLoadedArchive: function () { return _getFeatureRuntime().get('archive'); },
    loadArchive: function () { return _getFeatureRuntime().load('archive'); },
    loadFleet: function () { return _getFeatureRuntime().load('fleet'); },
    loadMarket: function () { return _getFeatureRuntime().load('market'); },
    getFleetActions: function () { return _getActionRuntime().fleet; },
    renderFleet: function (FleetUI) { return _getUiCoordinator().renderFleet(FleetUI); },
    systems: { Economy: Economy, Fleet: Fleet },
    ui: { MapUI: MapUI, Modal: Modal },
    data: { goods: GOODS },
    emitLog: function (message) { EventBus.emit('log:message', message); },
    invalidate: function () { _updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
    refreshActionGuide: _refreshActionGuide,
    showCompletion: function (completion) { _showActionGuideCompletion(completion); },
  });
  return _commandDestinationController;
}

function _getGuidanceExecutionAdapter() {
  if (_guidanceExecutionAdapter) return _guidanceExecutionAdapter;
  _guidanceExecutionAdapter = createGuidanceExecutionAdapter({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    loadController: function () { return _getFeatureRuntime().load('guidanceAction'); },
    ports: {
      ui: {
        showProcessing: function (suggestion, message) {
          _getActionGuideCoordinator().showProcessing(suggestion, message);
        },
        refreshActionGuide: _refreshActionGuide,
        invalidate: function () { _updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
        showCompletion: function (message, detail, options) {
          _getActionGuideCoordinator().showCompletion(message, detail, options);
        },
        emitLog: function (message) { EventBus.emit('log:message', message); },
        reportFailure: function (error) {
          console.error('[GameManager] Failed to execute guidance action.', error);
          EventBus.emit('log:message', { text: '⚠️ 当前行动执行失败，请重试。', type: 'error' });
        },
      },
      navigation: {
        prepareDirectExecution: function () { if (MapUI.focusStarmap) MapUI.focusStarmap(); },
        activateTab: MapUI.activateTab,
        focusStarmap: MapUI.focusStarmap,
        focusNavigationTarget: MapUI.focusNavigationTarget,
        openMarketPanel: MapUI.openMarketPanel,
        openMarketSystemPanel: MapUI.openMarketSystemPanel,
        revealMarketGoodFocus: _getCommandDestinationController().revealMarketGoodFocus,
      },
      trade: { openConfirmation: _getCommandDestinationController().openTradeConfirmation, refuel: _handleRefuel },
      quest: {
        accept: _getActionRuntime().archive.onAcceptQuest,
        selectAvailable: _getCommandDestinationController().selectAvailableQuest,
      },
      fleet: {
        openRecommendedDispatch: _getCommandDestinationController().openRecommendedDispatch,
        openRecommendedMod: _getCommandDestinationController().openRecommendedMod,
      },
      events: { forcePending: EventUI.forcePendingEvent },
      teaching: {
        startChain: function (chainId) { return _getTeachingGuidanceController().startChain(chainId); },
      },
      exploration: {
        revealArchiveReportFocus: _getCommandDestinationController().revealArchiveReportFocus,
        acknowledgeSurveyChainFollowup: function (systemId, chainId) {
          return Exploration.acknowledgeChainFollowup(_state, systemId, chainId);
        },
        acknowledgeSurveyReport: function (systemId, reportId) {
          return Exploration.acknowledgeSurveyReport(_state, systemId, reportId);
        },
        explorePoi: _handleExplorePoi,
      },
      travel: { execute: _handleTravel },
    },
  });
  return _guidanceExecutionAdapter;
}

function _getMarketWorkspaceController() {
  if (_marketWorkspaceController) return _marketWorkspaceController;
  _marketWorkspaceController = createMarketWorkspaceController({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    loadMarket: function () { return _getFeatureRuntime().load('market'); },
    renderMarket: function (MarketUI, state) { return _getUiCoordinator().renderMarket(MarketUI, state); },
    MapUI: MapUI,
    Modal: Modal,
    Tutorial: Tutorial,
    systems: SYSTEMS,
    emitLog: function (message) { EventBus.emit('log:message', message); },
    invalidate: function () { _updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
    showCompletion: function (completion) { _showActionGuideCompletion(completion); },
  });
  return _marketWorkspaceController;
}

function _getUiCoordinator() {
  if (_uiCoordinator) return _uiCoordinator;
  var actionRuntime = _getActionRuntime();
  var fleetActions = actionRuntime.fleet;
  var archiveActions = actionRuntime.archive;
  var marketWorkspace = _getMarketWorkspaceController();
  if (!_contextAdapters) {
    _contextAdapters = createWorkspaceContextAdapters({
      inspector: ContextInspector,
      getRevision: function () { return _session.getRevision(); },
    });
  }
  _uiCoordinator = createGameUiCoordinator({
    getState: function () { return _state; },
    features: _getFeatureRuntime(),
    ui: {
      HUD: HUD,
      ShipUI: ShipUI,
      MapUI: MapUI,
      UIManager: UIManager,
      Renderer3D: Renderer3D,
      ContextAdapters: _contextAdapters,
    },
    systems: {
      Trade: Trade,
      Dispatch: Dispatch,
    },
    actions: {
      market: {
        getMode: marketWorkspace.getMode,
        onOpenBuy: marketWorkspace.openBuy,
        onOpenSell: marketWorkspace.openSell,
        onRefuel: _handleRefuel,
        onBlackMarketBuy: marketWorkspace.openBlackMarketBuy,
        onBlackMarketSell: marketWorkspace.openBlackMarketSell,
        getFinanceActions: function () { return marketWorkspace.createFinanceActions(_getActionRuntime().commerce); },
        onAfterRender: marketWorkspace.syncAfterRender,
      },
      fleet: fleetActions,
      archive: Object.assign({
        getDispatchContext: function (state) { return _getActionGuideCoordinator().getDispatchContext(state); },
      }, archiveActions),
      save: {
        onSaveGame: _getPersistenceController().saveSlot,
        onLoadGame: _getPersistenceController().loadSlot,
      },
      global: {
        refreshActionGuide: _refreshActionGuide,
      },
    },
  });
  return _uiCoordinator;
}

function _getUiLifecycleController() {
  if (_uiLifecycleController) return _uiLifecycleController;
  _uiLifecycleController = createGameUiLifecycleController({
    getState: function () { return _state; },
    getRevision: function () { return _session.getRevision(); },
    features: _getFeatureRuntime(),
    events: EventBus,
    ui: {
      HUD: HUD,
      MapUI: MapUI,
      UIManager: UIManager,
      Modal: Modal,
      Renderer: Renderer3D,
    },
    systems: { Tutorial: Tutorial },
    controllers: {
      actionGuide: _getActionGuideCoordinator(),
      onboardingUi: _getOnboardingUiController(),
      onboardingPolicy: _getOnboardingPolicyController(),
      settingsUi: _getSettingsUiController(),
    },
    ports: {
      acceptQuest: _getActionRuntime().archive.onAcceptQuest,
      travel: _handleTravel,
      galaxyJump: _handleGalaxyJump,
      openMarket: MapUI.openMarket,
      closeMarket: MapUI.closeMarket,
      isMarketOpen: MapUI.isMarketOpen,
      ensureFleet: _ensureFleetUiRendered,
      openQuests: MapUI.openQuestsPanel,
      ensureArchive: _ensureArchiveUiRendered,
      explorePoi: _handleExplorePoi,
      getPoiStatus: _getPoiStatus,
      refreshActionGuide: _refreshActionGuide,
      refreshMarket: function () { return _getMarketWorkspaceController().refresh(); },
      confirmTrade: _handleTradeConfirm,
    },
    setTelemetryState: _setDeferredUiState,
    emitLog: function (message) { EventBus.emit('log:message', message); },
  });
  return _uiLifecycleController;
}

function _ensureMarketUiRendered() {
  return _getUiCoordinator().ensureMarket();
}

function _ensureFleetUiRendered() {
  return _getUiCoordinator().ensureFleet();
}

function _ensureArchiveUiRendered() {
  return _getUiCoordinator().ensureArchive();
}

function _ensureSaveUiRendered() {
  return _getUiCoordinator().ensureSave();
}

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

export function init(difficulty, options) {
  _settings = Settings.loadSettings();
  var startup = resolveStartupState(difficulty, _settings, options);
  var restoredAutosave = startup.restoredAutosave;
  var sessionReason = options && options.reason
    ? options.reason
    : (restoredAutosave ? 'restore-autosave' : 'new-game');
  Audio.init(_settings);
  var sessionTransition = _getSessionLifecycle().begin(startup.state, {
    reason: sessionReason,
    mode: restoredAutosave ? 'restore-autosave' : 'new-game',
    restoreEconomy: restoredAutosave,
    restoreGalaxy: restoredAutosave,
    restoreRandomRuntime: restoredAutosave,
    syncDifficulty: restoredAutosave,
    restorePendingEvent: restoredAutosave,
  });
  Renderer3D.init();
  Settings.applySettings(_settings, Renderer3D);
  var uiLifecycle = _getUiLifecycleController();
  uiLifecycle.initialize();

  // UI 壳完成绑定后，再由生命周期统一同步投影、渲染并恢复计时。
  _getSessionLifecycle().present(sessionTransition);
  const sceneReadyPromise = uiLifecycle.whenSceneReady();
  uiLifecycle.presentEntry({ restoredAutosave: restoredAutosave });

  return sceneReadyPromise;
}

export function _setStateForTest(state) {
  _replaceState(state || null, 'test');
  if (_actionGuideCoordinator) _actionGuideCoordinator.reset();
  if (_commandDestinationController) _commandDestinationController.reset();
  if (_state) {
    _getDialogueController().reset(_state);
    _getRandomEventController().sync(_state);
  }
}

export function _handleActionGuideActionForTest(suggestion) {
  return _handleActionGuideAction(suggestion);
}

export function _handleTradeConfirmForTest(action, goodId, quantity, marketType) {
  _handleTradeConfirm(action, goodId, quantity, marketType);
}

export function _handleAssignRouteForTest(shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) {
  return _getActionRuntime().fleet.onAssignRoute(shipIndex, buySystemId, sellSystemId, goodId, tradePolicy);
}

export function _stopActiveDispatchForTest() {
  _stopActiveDispatchClock();
}

export function _getGameClockSnapshotForTest() {
  return _gameClock ? _gameClock.getSnapshot() : null;
}

export function _getUiDiagnosticsForTest() {
  return _getUiCoordinator().getDiagnostics();
}

function _showActionGuideCompletion(completion, options) {
  if (completion) _getActionGuideCoordinator().showCompletion(completion.message, completion.detail, options);
}

function _playTriggerDialogue(triggerType, context, onFinished) {
  return _getDialogueController().playTrigger(triggerType, context, onFinished);
}

function _queueQuestDialogueResult(result, onFinished) {
  return _getDialogueController().queueQuestResult(result, onFinished);
}

function _scheduleRandomEventRoll(state, baseChance) {
  return _getRandomEventController().scheduleRoll(state, baseChance);
}

// ---------------------------------------------------------------------------
// 动作处理（所有状态变更入口）
// ---------------------------------------------------------------------------

function _refreshActionGuide() {
  return _getActionGuideCoordinator().refresh();
}

function _handleActionGuideAction(suggestion) {
  return _getGuidanceExecutionAdapter().execute(suggestion);
}

function _getPoiStatus(systemId, poiId) {
  return _getActionRuntime().exploration.getPoiStatus(systemId, poiId);
}

function _handleExplorePoi(systemId, poiId) {
  return _getActionRuntime().exploration.explorePoi(systemId, poiId);
}

function _handleTravel(systemId) {
  return _getActionRuntime().travel.travel(systemId);
}

function _handleEventChoice(choiceIndex) {
  return _getActionRuntime().event.resolveChoice(choiceIndex);
}

/**
 * 跨星系跳转（点击其他星系星球时触发）
 */
function _handleGalaxyJump(systemId) {
  // 直接调用 travelTo，它会自动处理跨星系逻辑
  _handleTravel(systemId);
}

function _handleTradeConfirm(action, goodId, quantity, marketType) {
  return _getActionRuntime().trade.confirm(action, goodId, quantity, marketType);
}

function _returnToStarmapAfterTrade() {
  if (MapUI.focusStarmap) {
    MapUI.focusStarmap();
  }
  if (MapUI.closeMarket) {
    MapUI.closeMarket();
  }
}

function _handleRefuel() {
  return _getActionRuntime().trade.refuel();
}

// 等级进阶逻辑已提取到 js/systems/progression/ProgressionSystem.js

// ---------------------------------------------------------------------------
// 激活船只自动派遣 — 逻辑已提取到 js/core/DispatchController.js
// GameManager 仅保留 tick 回调的胶水逻辑
// ---------------------------------------------------------------------------

function _boundDispatchTick() {
  return _getActionRuntime().dispatch.tick();
}

function _startActiveDispatchClock() {
  // 两次自动操作约等于一个游戏日：四步买卖循环约耗时两天，
  // 与远程船队的日结算速度保持同一量级。
  _getGameClock().startRecurring(
    ACTIVE_DISPATCH_CLOCK_ID,
    _boundDispatchTick,
    Math.max(1000, Math.floor(_getRealtimeDayDurationMs() / 2))
  );
  EventBus.emit('log:message', { text: '📡 自动跑商已启动，将按游戏时间自动执行下一步。', type: 'info' });
}

function _stopActiveDispatchClock() {
  if (_gameClock) _gameClock.stopRecurring(ACTIVE_DISPATCH_CLOCK_ID);
}

// ---------------------------------------------------------------------------
// UI 刷新兼容入口；新动作必须传 dirty regions，省略时才全量兜底。
// ---------------------------------------------------------------------------

function _updateUI(regions) {
  if (MapUI.isMarketOpen() && !_getFeatureRuntime().get('market')) _ensureMarketUiRendered();
  if (typeof regions === 'undefined') return _getUiCoordinator().renderAll();
  return _getUiCoordinator().invalidate(regions);
}

function _isRealtimeClockPaused() {
  return !!(document.hidden || Tutorial.isActive() || document.querySelector('.modal:not(.hidden)'));
}

function _applyRealtimeDayProgress(days, clockContext) {
  return _getActionRuntime().day.advance(days, clockContext);
}

function _getRealtimeDayDurationMs() {
  return Number.isFinite(_settings && _settings.realtimeDayDurationMs)
    ? _settings.realtimeDayDurationMs
    : TIME_CONFIG.realtimeDayDurationMs;
}

function _stopGameLoop() {
  if (_gameClock) _gameClock.stop();
}

// ---------------------------------------------------------------------------
// 游戏主循环
// ---------------------------------------------------------------------------

function _startGameLoop() {
  _getGameClock().start();
}
