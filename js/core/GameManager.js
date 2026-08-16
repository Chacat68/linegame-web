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
import { createGameLoopRuntime } from './GameLoopRuntime.js';
import { createGameApplicationLifecycle } from './GameApplicationLifecycle.js';
import { createGameSessionLifecycle } from './GameSessionLifecycle.js';
import { DEFAULT_ACTION_DIRTY_REGIONS, UI_REGION } from './ActionPresentation.js';
import { createGameActionRuntime } from './GameActionRuntime.js';
import { createDialogueRuntimeController } from './DialogueRuntimeController.js';
import { createRandomEventRuntimeController } from './RandomEventRuntimeController.js';
import { createGameGuidanceRuntime } from './GameGuidanceRuntime.js';
import { createVictoryRuntimeController } from './VictoryRuntimeController.js';
import { createAchievementRuntimeController } from './AchievementRuntimeController.js';
import { createGamePersistenceController } from './GamePersistenceController.js';
import { createGameUiApplicationRuntime } from './GameUiApplicationRuntime.js';
import { hasBlockingSurfaceOpen, hideBlockingSurface, isBlockingSurfaceVisible, showBlockingSurface } from '../ui/SurfaceManager.js';

const _session = createStateSession();
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
let _uiRuntime = null;
let _systemRuntime = null;
let _gameLoopRuntime = null;
let _sessionLifecycle = null;
let _actionRuntime = null;
let _dialogueController = null;
let _randomEventController = null;
let _guidanceRuntime = null;
let _victoryController = null;
let _achievementController = null;
let _persistenceController = null;
let _applicationLifecycle = null;

function _replaceState(nextState, reason) {
  _session.replace(nextState, { reason: reason });
  _state = _session.getState();
  _runtimeRevision = _session.getRevision();
  ContextInspector.reconcileRevision(_runtimeRevision, { render: false });
  return _state;
}

function _resetSessionTransients() {
  if (_achievementController) _achievementController.reset();
  if (_guidanceRuntime) _guidanceRuntime.reset();
  if (_uiRuntime) _uiRuntime.reset();
  if (_victoryController) _victoryController.reset();
}

function _getApplicationLifecycle() {
  if (_applicationLifecycle) return _applicationLifecycle;
  _applicationLifecycle = createGameApplicationLifecycle({
    getRuntime: function (id) {
      if (id === 'sessionLifecycle') return _sessionLifecycle;
      if (id === 'gameLoop') return _gameLoopRuntime;
      if (id === 'dialogue') return _dialogueController;
      if (id === 'randomEvent') return _randomEventController;
      if (id === 'achievement') return _achievementController;
      if (id === 'victory') return _victoryController;
      if (id === 'guidance') return _guidanceRuntime;
      if (id === 'ui') return _uiRuntime;
      if (id === 'features') return _featureRuntime;
      if (id === 'renderer') return Renderer3D;
      if (id === 'eventUi') return EventUI;
      return null;
    },
    release: function (context) {
      GameTime.setAdvancedDayProcessor(null);
      _replaceState(null, context.reason);
      _featureRuntime = null;
      _uiRuntime = null;
      _systemRuntime = null;
      _gameLoopRuntime = null;
      _sessionLifecycle = null;
      _actionRuntime = null;
      _dialogueController = null;
      _randomEventController = null;
      _guidanceRuntime = null;
      _victoryController = null;
      _achievementController = null;
      _persistenceController = null;
    },
    reportError: function (stage, error) {
      console.error('[GameApplicationLifecycle] Failed to shut down ' + stage + '.', error);
    },
  });
  return _applicationLifecycle;
}

function _beginApplicationLifecycle() {
  if (_applicationLifecycle && _applicationLifecycle.getDiagnostics().disposed) {
    _applicationLifecycle = null;
  }
  return _getApplicationLifecycle();
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
        _getGuidanceRuntime().syncArchiveView(ArchiveUI);
      },
      syncVictoryView: function (module) { _getVictoryController().syncView(module); },
      handleVictoryLoadFailure: function () { _getVictoryController().handleLoadFailure(); },
      syncTutorialView: function (module) { _getGuidanceRuntime().syncTutorialView(module); },
      syncSettingsView: function (module) { _getUiRuntime().syncSettings(module); },
    },
  });
  return _featureRuntime;
}

function _syncDeferredFeatures() {
  _getFeatureRuntime().syncAll();
  _getGuidanceRuntime().prefetchForState(_state);
}

function _getGuidanceRuntime() {
  if (_guidanceRuntime) return _guidanceRuntime;
  _guidanceRuntime = createGameGuidanceRuntime({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
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
    selectors: {
      hasBlockingSurfaceOpen: hasBlockingSurfaceOpen,
    },
    callbacks: {
      emitLog: function (message) { EventBus.emit('log:message', message); },
      invalidate: function () { _updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
      renderFleet: function (FleetUI) { return _getUiRuntime().renderFleet(FleetUI); },
      reportError: function (scope, error) {
        console.error('[GameGuidanceRuntime] Failed in ' + scope + '.', error);
      },
    },
  });
  return _guidanceRuntime;
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
    hideSettings: function () { _getUiRuntime().hideSettings(); },
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

function _getGameLoopRuntime() {
  if (_gameLoopRuntime) return _gameLoopRuntime;
  _gameLoopRuntime = createGameLoopRuntime({
    getState: function () { return _state; },
    getSettings: function () { return _settings; },
    getFeatureRuntime: _getFeatureRuntime,
    getGuidanceRuntime: _getGuidanceRuntime,
    getActionRuntime: _getActionRuntime,
    systems: {
      Fleet: Fleet,
      Tutorial: Tutorial,
      GameTime: GameTime,
    },
    ui: {
      MapUI: MapUI,
      Renderer: Renderer3D,
    },
    callbacks: {
      setDayDuration: function (nextDurationMs) {
        _settings.realtimeDayDurationMs = nextDurationMs;
      },
      emitLog: function (message) { EventBus.emit('log:message', message); },
    },
    config: { defaultDayDurationMs: TIME_CONFIG.realtimeDayDurationMs },
  });
  return _gameLoopRuntime;
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
      stop: function () { return _getGameLoopRuntime().stop(); },
      start: function () { return _getGameLoopRuntime().start(); },
    },
    hooks: {
      resetTransients: _resetSessionTransients,
      prepareState: _prepareSessionState,
      syncProjections: _syncSessionProjections,
      render: function () { _updateUI(); },
      resumeRecurring: function (state) { return _getGameLoopRuntime().resumeRecurring(state); },
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
        setRecentModInstallContext: function (context) {
          _getGuidanceRuntime().setRecentModInstallContext(context);
        },
        getDispatchContext: function (state) { return _getGuidanceRuntime().getDispatchContext(state); },
        refresh: function () { return _getGuidanceRuntime().refresh(); },
      },
      story: {
        queueQuestResult: function () {
          return _getDialogueController().queueQuestResult.apply(null, arguments);
        },
        playTrigger: function () {
          return _getDialogueController().playTrigger.apply(null, arguments);
        },
      },
      persistence: {
        captureState: _getPersistenceController().captureState,
        saveAutosave: _getPersistenceController().saveAutosave,
      },
      commands: {
        selectAvailableQuest: function () {
          return _getGuidanceRuntime().selectAvailableQuest.apply(null, arguments);
        },
        openRecommendedDispatch: function () {
          return _getGuidanceRuntime().openRecommendedDispatch.apply(null, arguments);
        },
      },
      navigation: {
        activateArchiveTab: MapUI.activateTab,
        openMarketPanel: MapUI.openMarketPanel,
        openMarketSystemPanel: MapUI.openMarketSystemPanel,
        returnToStarmap: _returnToStarmapAfterTrade,
      },
      randomEvents: {
        schedule: function () {
          return _getRandomEventController().scheduleRoll.apply(null, arguments);
        },
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
      onChoice: function (choiceIndex) { return _getActionRuntime().event.resolveChoice(choiceIndex); },
      emitAudio: function (cue) { EventBus.emit('audio:cue', { cue: cue }); },
      emitMessage: function (message) { EventBus.emit('log:message', message); },
      captureState: _getPersistenceController().captureState,
      saveAutosave: _getPersistenceController().saveAutosave,
      refreshActionGuide: function () { return _getGuidanceRuntime().refresh(); },
    },
  });
  return _randomEventController;
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
      Fleet: Fleet,
      Quest: Quest,
    },
    getLevelTitle: function (experience) { return getLevel(experience).title; },
    loadView: function () { return _getFeatureRuntime().load('victory'); },
    emitMessage: function (message) { EventBus.emit('log:message', message); },
    invalidate: function () { _updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
    refreshActionGuide: function () { return _getGuidanceRuntime().refresh(); },
    restartSession: function () { return _getPersistenceController().restart.apply(null, arguments); },
  });
  return _victoryController;
}

function _getUiRuntime() {
  if (_uiRuntime) return _uiRuntime;
  _uiRuntime = createGameUiApplicationRuntime({
    getState: function () { return _state; },
    getRevision: function () { return _session.getRevision(); },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    features: _getFeatureRuntime(),
    events: EventBus,
    ui: {
      HUD: HUD,
      ShipUI: ShipUI,
      MapUI: MapUI,
      UIManager: UIManager,
      Modal: Modal,
      Renderer: Renderer3D,
      ContextInspector: ContextInspector,
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
      getSettings: function () { return _settings; },
      hideSettingsFallback: hideBlockingSurface,
      onDifficultyChanged: function (nextDifficulty) {
        if (!DIFFICULTY_LEVELS[nextDifficulty]) return;
        _state.difficulty = nextDifficulty;
        _settings.difficulty = nextDifficulty;
        _updateUI(DEFAULT_ACTION_DIRTY_REGIONS);
      },
      onRealtimeDayDurationChanged: function (nextDurationMs) {
        _getGameLoopRuntime().handleDayDurationChange(nextDurationMs);
      },
      onResetTutorial: function () {
        _getPersistenceController().restart('settings-tutorial-reset');
      },
      onClearSaves: function () { return _getPersistenceController().clearAllSlots(); },
      emitLog: function (message) { EventBus.emit('log:message', message); },
      invalidate: function () { _updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
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
  return _uiRuntime;
}

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

export function init(difficulty, options) {
  _beginApplicationLifecycle();
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
  var uiRuntime = _getUiRuntime();
  uiRuntime.initialize();

  // UI 壳完成绑定后，再由生命周期统一同步投影、渲染并恢复计时。
  _getSessionLifecycle().present(sessionTransition);
  const sceneReadyPromise = uiRuntime.whenSceneReady();
  uiRuntime.presentEntry({ restoredAutosave: restoredAutosave });

  return sceneReadyPromise;
}

/** 释放整个应用实例；与读档/重开所用的 session transition 不同。 */
export function shutdown(reason) {
  return _getApplicationLifecycle().shutdown({ reason: reason || 'application-shutdown' });
}

export function _setStateForTest(state) {
  _replaceState(state || null, 'test');
  if (_guidanceRuntime) _guidanceRuntime.reset();
  if (_state) {
    _getDialogueController().reset(_state);
    _getRandomEventController().sync(_state);
  }
}

export function _handleActionGuideActionForTest(suggestion) {
  return _getGuidanceRuntime().execute(suggestion);
}

export function _handleTradeConfirmForTest(action, goodId, quantity, marketType) {
  return _getActionRuntime().trade.confirm(action, goodId, quantity, marketType);
}

export function _handleAssignRouteForTest(shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) {
  return _getActionRuntime().fleet.onAssignRoute(shipIndex, buySystemId, sellSystemId, goodId, tradePolicy);
}

export function _stopActiveDispatchForTest() {
  return _getGameLoopRuntime().stopDispatch();
}

export function _getGameClockSnapshotForTest() {
  return _gameLoopRuntime ? _gameLoopRuntime.getSnapshot() : null;
}

export function _getUiDiagnosticsForTest() {
  return _getUiRuntime().getDiagnostics();
}

function _returnToStarmapAfterTrade() {
  if (MapUI.focusStarmap) {
    MapUI.focusStarmap();
  }
  if (MapUI.closeMarket) {
    MapUI.closeMarket();
  }
}

// ---------------------------------------------------------------------------
// UI 刷新兼容入口；新动作必须传 dirty regions，省略时才全量兜底。
// ---------------------------------------------------------------------------

function _updateUI(regions) {
  if (MapUI.isMarketOpen() && !_getFeatureRuntime().get('market')) _getUiRuntime().ensureMarket();
  if (typeof regions === 'undefined') return _getUiRuntime().renderAll();
  return _getUiRuntime().invalidate(regions);
}
