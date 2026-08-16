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
import { buildCommandFeedback } from '../ui/CommandAction.js';
import * as Fleet      from '../systems/fleet/FleetSystem.js';
import * as Crew       from '../systems/fleet/CrewSystem.js';
import * as Save       from '../systems/save/SaveSystem.js';
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
import {
  getDispatchDraftCompletion,
  getRemoteMarketFocusCompletion,
} from './ActionGuideCompletion.js';
import * as Settings from './SettingsCore.js';
import * as Audio from './AudioManager.js';
import * as Progression from '../systems/progression/ProgressionSystem.js';
import * as Guidance from '../systems/guidance/GuidanceSystem.js';
import * as MidgameTeachingChain from '../systems/guidance/MidgameTeachingChain.js';
import { getProcessingMessage as getGuidanceActionProcessingMessage } from './GuidanceActionFeedback.js';
import * as Dispatch from './DispatchController.js';
import { createFeatureRegistry, loadDeferredStylesheet } from './FeatureRegistry.js';
import { createStateSession } from './StateSession.js';
import { createGameSystemRuntime } from './GameSystemRuntime.js';
import { createGameClockController } from './GameClockController.js';
import { createGameSessionLifecycle } from './GameSessionLifecycle.js';
import { createFleetActionController } from './FleetActionController.js';
import { createCommerceOperationsController } from './CommerceOperationsController.js';
import { createArchiveActionController } from './ArchiveActionController.js';
import { createActionExecutionPipeline } from './ActionExecutionPipeline.js';
import { DEFAULT_ACTION_DIRTY_REGIONS, UI_REGION, normalizeDirtyRegions } from './ActionPresentation.js';
import { createTradeActionController } from './TradeActionController.js';
import { createTravelActionController } from './TravelActionController.js';
import { createExplorationOperationsController } from './ExplorationOperationsController.js';
import { createEventActionController } from './EventActionController.js';
import { createDispatchActionController } from './DispatchActionController.js';
import { createGameDayController } from './GameDayController.js';
import { createDialogueRuntimeController } from './DialogueRuntimeController.js';
import { createRandomEventRuntimeController } from './RandomEventRuntimeController.js';
import { createSettingsUiController } from './SettingsUiController.js';
import { createVictoryRuntimeController } from './VictoryRuntimeController.js';
import { createGameUiCoordinator } from '../ui/GameUiCoordinator.js';
import {
  createActionGuideCoordinator,
  shouldLoadAdvancedCommerce,
} from '../ui/ActionGuideCoordinator.js';
import { createWorkspaceContextAdapters } from '../ui/WorkspaceContextAdapters.js';
import { hasBlockingSurfaceOpen, hideBlockingSurface, isBlockingSurfaceVisible, showBlockingSurface } from '../ui/SurfaceManager.js';

const _session = createStateSession();
const ACTIVE_DISPATCH_CLOCK_ID = 'active-dispatch';
let _state     = null;
let _settings  = {
  motionLevel: 'full',
  difficulty: 'normal',
  secretRoutesVisible: true,
  realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
};
let _blackMarketMode = false; // 当前是否处于黑市交易模式
let _runtimeRevision = 0;
let _pendingQuestSelectionId = null;
let _achievementCheckQueued = false;
const _fleetStylesUrl = new URL('../../css/fleet.css', import.meta.url).href;
const _hangarTerminalStylesUrl = new URL('../../css/hangar-terminal.css', import.meta.url).href;
const _archiveTerminalStylesUrl = new URL('../../css/archive-terminal.css', import.meta.url).href;
const _marketTerminalStylesUrl = new URL('../../css/market-terminal.css?v=20260717-marketchart1', import.meta.url).href;
const _deferredFeatures = createFeatureRegistry({
  getContext: function () {
    return {
      state: _state,
      revision: _runtimeRevision,
      sessionToken: _getSessionToken(),
      settings: _settings,
    };
  },
});
let _deferredFeaturesConfigured = false;
let _uiCoordinator = null;
let _systemRuntime = null;
let _gameClock = null;
let _sessionLifecycle = null;
let _fleetActions = null;
let _commerceActions = null;
let _archiveActions = null;
let _actionPipeline = null;
let _tradeActions = null;
let _travelActions = null;
let _explorationActions = null;
let _eventActions = null;
let _dispatchActions = null;
let _gameDayActions = null;
let _dialogueController = null;
let _randomEventController = null;
let _settingsUiController = null;
let _victoryController = null;
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
  _blackMarketMode = false;
  _pendingQuestSelectionId = null;
  _achievementCheckQueued = false;
  if (_actionGuideCoordinator) _actionGuideCoordinator.reset();
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

function _reportDeferredUiFailure(surface, error) {
  console.error('[GameManager] Failed to load deferred ' + surface + ' feature.', error);
  var labels = {
    market: '商业终端',
    fleet: '机库',
    archive: '档案中心',
    save: '存档终端',
    victory: '结算终端',
    dialogue: '剧情演出',
    randomEvent: '随机事件',
    onboarding: '首次进入引导',
    tutorial: '操作教程',
    settings: '设置终端',
    guidanceAction: '行动执行器',
    commerceRuntime: '高级经营运行时',
    advancedGuidance: '高级经营建议',
    routeGuidance: '自动跑商建议',
    achievement: '成就检查',
  };
  var label = labels[surface] || '功能模块';
  EventBus.emit('log:message', {
    text: '⚠️ ' + label + '加载失败，请稍后重试。',
    type: 'error',
  });
}

function _initializeCommerceRuntime(CommerceRuntime, state) {
  var targetState = state || _state;
  if (!CommerceRuntime || !targetState) return;
  CommerceRuntime.init(targetState);
  GameTime.setAdvancedDayProcessor(CommerceRuntime.advanceDay);
}

function _loadCommerceRuntime() {
  _configureDeferredFeatures();
  return _deferredFeatures.load('commerceRuntime');
}

function _loadRouteGuidance() {
  _configureDeferredFeatures();
  return _deferredFeatures.load('routeGuidance');
}

function _syncDeferredFeatures() {
  _configureDeferredFeatures();
  _deferredFeatures.syncAll();
  _getActionGuideCoordinator().prefetchForState(_state);
}

function _configureDeferredFeatures() {
  if (_deferredFeaturesConfigured) return;
  _deferredFeaturesConfigured = true;

  _deferredFeatures.registerManifest({
    commerceRuntime: {
      load: function () { return import('../systems/commerce/CommerceFacade.js'); },
      sync: function (module, lifecycle) {
        _initializeCommerceRuntime(module, lifecycle.context && lifecycle.context.state);
      },
      onError: function (error) { _reportDeferredUiFailure('commerceRuntime', error); },
    },
    advancedGuidance: {
      dependencies: ['commerceRuntime'],
      load: function () { return import('../systems/guidance/AdvancedGuidanceSystem.js'); },
      sync: function (module) {
        Guidance.setAdvancedGuidanceProvider(module.getAdvancedGuidanceSuggestions);
      },
      onError: function (error) { _reportDeferredUiFailure('advancedGuidance', error); },
    },
    routeGuidance: {
      load: function () { return import('../systems/trade/AutoTradeSystem.js'); },
      sync: function (module) { Dispatch.setQuestRouteResolver(module.findQuestRoute); },
      onError: function (error) { _reportDeferredUiFailure('routeGuidance', error); },
    },
    achievement: {
      load: function () { return import('../systems/achievement/AchievementSystem.js'); },
      sync: function (module, lifecycle) {
        var context = lifecycle.context;
        if (context && context.state) module.init(context.state);
      },
      onError: function (error) {
        _achievementCheckQueued = false;
        _reportDeferredUiFailure('achievement', error);
      },
    },
    dialogue: {
      load: function () {
        return Promise.all([
          import('../systems/story/DialogueSystem.js'),
          import('../ui/DialogueUI.js'),
        ]).then(function (modules) {
          return { Dialogue: modules[0], DialogueUI: modules[1] };
        });
      },
    },
    randomEvent: {
      load: function () { return import('../systems/event/RandomEvent.js'); },
    },
    market: {
      dependencies: ['commerceRuntime'],
      load: function () {
        return Promise.all([
          import('../ui/MarketUI.js'),
          loadDeferredStylesheet('market-terminal', _marketTerminalStylesUrl),
        ]).then(function (results) { return results[0]; });
      },
      onError: function (error) { _reportDeferredUiFailure('market', error); },
    },
    fleet: {
      load: function () {
        return Promise.all([
          import('../ui/FleetUI.js'),
          loadDeferredStylesheet('fleet-base', _fleetStylesUrl),
          loadDeferredStylesheet('hangar-terminal', _hangarTerminalStylesUrl),
        ]).then(function (results) { return results[0]; });
      },
      onError: function (error) { _reportDeferredUiFailure('fleet', error); },
    },
    archive: {
      dependencies: ['achievement'],
      load: function () {
        return Promise.all([
          import('../ui/QuestUI.js'),
          import('../ui/ArchiveExplorationUI.js'),
          import('../ui/ResearchUI.js'),
          import('../ui/FactionUI.js'),
          import('../ui/AchievementUI.js'),
          loadDeferredStylesheet('archive-terminal', _archiveTerminalStylesUrl),
        ]).then(function (modules) {
          return {
            QuestUI: modules[0],
            ArchiveExplorationUI: modules[1],
            ResearchUI: modules[2],
            FactionUI: modules[3],
            AchievementUI: modules[4],
          };
        });
      },
      initialize: function (ArchiveUI) {
        if (_pendingQuestSelectionId && ArchiveUI.QuestUI.setSelectedAvailableQuest) {
          ArchiveUI.QuestUI.setSelectedAvailableQuest(_pendingQuestSelectionId);
          _pendingQuestSelectionId = null;
        }
      },
      onError: function (error) { _reportDeferredUiFailure('archive', error); },
    },
    save: {
      load: function () { return import('../ui/SaveUI.js'); },
      onError: function (error) { _reportDeferredUiFailure('save', error); },
    },
    victory: {
      load: function () { return import('../ui/VictoryResultUI.js'); },
      sync: function (module) { _getVictoryController().syncView(module); },
      onError: function (error) {
        _getVictoryController().handleLoadFailure();
        _reportDeferredUiFailure('victory', error);
      },
    },
    onboarding: {
      load: function () { return import('../ui/OnboardingUI.js'); },
      onError: function (error) { _reportDeferredUiFailure('onboarding', error); },
    },
    tutorial: {
      load: function () { return import('../ui/TutorialUI.js'); },
      sync: function (module) { _initializeTutorialUI(module); },
      dispose: function (module) { if (module.destroy) module.destroy(); },
      onError: function (error) { _reportDeferredUiFailure('tutorial', error); },
    },
    settings: {
      load: function () { return import('./SettingsManager.js'); },
      sync: function (module) { _getSettingsUiController().sync(module); },
      onError: function (error) { _reportDeferredUiFailure('settings', error); },
    },
    guidanceAction: {
      load: function () { return import('./GuidanceActionController.js'); },
      onError: function (error) { _reportDeferredUiFailure('guidanceAction', error); },
    },
  });
}

function _getDeferredFeature(feature) {
  _configureDeferredFeatures();
  return _deferredFeatures.get(feature);
}

function _loadDeferredFeatureOrReject(feature) {
  _configureDeferredFeatures();
  return _deferredFeatures.load(feature).then(function (module) {
    if (module) return module;
    throw _deferredFeatures.getError(feature) || new Error('Deferred feature unavailable: ' + feature);
  });
}

function _loadMarketUI() {
  _configureDeferredFeatures();
  return _deferredFeatures.load('market');
}

function _loadFleetUI() {
  _configureDeferredFeatures();
  return _deferredFeatures.load('fleet');
}

function _ensureAchievementState(state) {
  if (!state || typeof state !== 'object') return;
  if (!Array.isArray(state.achievements)) state.achievements = [];
}

function _loadAchievementSystem() {
  _configureDeferredFeatures();
  return _deferredFeatures.load('achievement');
}

function _queueAchievementCheck() {
  if (!_state || _achievementCheckQueued) return;
  _achievementCheckQueued = true;
  var requestedState = _state;
  var requestedRevision = _runtimeRevision;
  _loadAchievementSystem().then(function (Achievement) {
    _achievementCheckQueued = false;
    if (!Achievement || requestedState !== _state || requestedRevision !== _runtimeRevision) return;
    Achievement.init(requestedState);
    var achievementResult = Achievement.checkAll(requestedState);
    achievementResult.msgs.forEach(function (message) {
      EventBus.emit('log:message', { text: message.text, type: message.type });
    });
    if (achievementResult.newlyUnlocked.length > 0) {
      _updateUI();
      _getVictoryController().check();
    }
  });
}

function _loadArchiveUI() {
  _configureDeferredFeatures();
  return _deferredFeatures.load('archive');
}

function _loadOnboardingUI() {
  _configureDeferredFeatures();
  return _deferredFeatures.load('onboarding');
}

function _initializeTutorialUI(TutorialUI) {
  if (!TutorialUI) return;
  TutorialUI.init(
    function () { Tutorial.advance(); _updateUI(); },
    function () { Tutorial.skip(); _updateUI(); },
    _handleTutorialHelperAction
  );
}

function _handleTutorialHelperAction(actionId) {
  if (['recommend_first_trade', 'recommend_sell_route'].indexOf(actionId) === -1 || !Tutorial.isActive()) return;

  var requestedState = _state;
  var requestedRevision = _runtimeRevision;
  _loadRouteGuidance().then(function (AutoTrade) {
    if (!AutoTrade || requestedState !== _state || requestedRevision !== _runtimeRevision) return;
    var currentStep = Tutorial.getStep();
    if (!currentStep) return;

    if (actionId === 'recommend_first_trade') {
      if (currentStep.id !== 'buy_goods') return;
      var tradeRecommendation = AutoTrade.findBestTrade(_state);
      var recommendedGood = tradeRecommendation
        ? GOODS.find(function (good) { return good.id === tradeRecommendation.goodId; })
        : null;
      if (recommendedGood) {
        var cargoFree = Math.max(0, (_state.maxCargo || 0) - Trade.getTotalCargo(_state));
        var suggestedQuantity = Math.max(1, Math.min(
          10,
          cargoFree,
          Math.floor((_state.credits || 0) / Math.max(1, tradeRecommendation.buyPrice))
        ));
        Modal.openTradeModal('buy', recommendedGood, _state, 'open', {
          initialQuantity: suggestedQuantity,
        });
        EventBus.emit('log:message', {
          text: '🧭 首单建议：买入 ' + recommendedGood.name + '，卖往 ' + tradeRecommendation.sellSystemName + '。确认数量后，下一步会重新核算实际净利。',
          type: 'tip',
        });
        return;
      }
      EventBus.emit('log:message', {
        text: '⚠️ 当前没有满足资金、货舱与风险条件的首单商品。',
        type: 'error',
      });
      return;
    }

    if (currentStep.id !== 'travel_hint') return;

    var recommendation = AutoTrade.findBestSellSystem(_state);
    var goodId = Object.keys(_state.cargo || {}).find(function (id) {
      return (_state.cargo[id] || 0) > 0;
    }) || '';
    var focused = recommendation && MapUI.focusNavigationTarget
      ? MapUI.focusNavigationTarget(_state, recommendation.systemId, {
          goodId: goodId,
          title: '教程推荐卖货路线',
        })
      : false;

    EventBus.emit('log:message', {
      text: focused
        ? ('🧭 已标出 ' + recommendation.systemName + '：请核对卖价、燃料与预计净利，再确认出航。')
        : '⚠️ 暂时找不到可达的盈利卖货点，请检查燃料与已开放星球。',
      type: focused ? 'tip' : 'error',
    });
    _updateUI();
  });
}

function _loadTutorialUI() {
  _configureDeferredFeatures();
  return _deferredFeatures.load('tutorial');
}

function _loadGuidanceActionController() {
  _configureDeferredFeatures();
  return _deferredFeatures.load('guidanceAction');
}

function _getMarketFinanceActions() {
  var actions = _getCommerceActions();
  return {
    onTakeLoan: actions.onTakeLoan,
    onRepayLoan: actions.onRepayLoan,
    onInvestTradeStation: actions.onInvestTradeStation,
    onRedeemTradeStationInvestment: actions.onRedeemTradeStationInvestment,
    onBatchInvestTradeStations: actions.onBatchInvestTradeStations,
    onBuildTradeStation: actions.onBuildTradeStation,
    onUpgradeTradeStation: actions.onUpgradeTradeStation,
    onSetTradeStationStrategy: actions.onSetTradeStationStrategy,
    onBatchUpgradeTradeStations: actions.onBatchUpgradeTradeStations,
    onBatchSetTradeStationStrategy: actions.onBatchSetTradeStationStrategy,
    onFocusRemoteSystem: _handleFocusRemoteMarketSystem,
  };
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
      ensureAchievementState: _ensureAchievementState,
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
      if (shouldLoadAdvancedCommerce(state) && !_getDeferredFeature('commerceRuntime') && _deferredFeatures.getState('commerceRuntime') !== 'error') {
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

function _getFleetActions() {
  if (_fleetActions) return _fleetActions;
  _fleetActions = createFleetActionController({
    getState: function () { return _state; },
    systems: {
      Fleet: Fleet,
      Crew: Crew,
      MidgameTeachingChain: MidgameTeachingChain,
    },
    dispatch: _dispatch,
    recordQuestProgress: _recordQuestProgress,
    completeTeachingStep: _completeMidgameTeachingStep,
    startDispatchClock: _startActiveDispatchClock,
    stopDispatchClock: _stopActiveDispatchClock,
    resetRealtimeClock: function (timestamp) { _getGameClock().reset(timestamp); },
    cancelShipFlight: function () {
      if (Renderer3D.cancelShipFlight) Renderer3D.cancelShipFlight();
    },
    setRecentModInstallContext: function (context) {
      _getActionGuideCoordinator().setRecentModInstallContext(context);
    },
    showCompletion: function (completion) { _showActionGuideCompletion(completion); },
    getRouteGuidance: function () { return _getDeferredFeature('routeGuidance'); },
    getDispatchContext: function (state) { return _getActionGuideCoordinator().getDispatchContext(state); },
  });
  return _fleetActions;
}

function _getCommerceActions() {
  if (_commerceActions) return _commerceActions;
  _commerceActions = createCommerceOperationsController({
    getState: function () { return _state; },
    getRuntime: function () { return _getDeferredFeature('commerceRuntime'); },
    requestRuntime: _loadCommerceRuntime,
    dispatch: _dispatch,
    recordQuestProgress: _recordQuestProgress,
    completeTeachingStep: _completeMidgameTeachingStep,
  });
  return _commerceActions;
}

function _getArchiveActions() {
  if (_archiveActions) return _archiveActions;
  _archiveActions = createArchiveActionController({
    getState: function () { return _state; },
    systems: { Research: Research, Quest: Quest, Tutorial: Tutorial },
    dispatch: _dispatch,
    updateUI: function () { _updateUI(DEFAULT_ACTION_DIRTY_REGIONS); },
    emitLog: function (message) { EventBus.emit('log:message', message); },
    activateArchiveTab: function (tabId) { MapUI.activateTab(tabId); },
    openMarketPanel: function (state, options) { MapUI.openMarketPanel(state, options); },
    openMarketSystemPanel: function (state, systemId, options) {
      MapUI.openMarketSystemPanel(state, systemId, options);
    },
    selectAvailableQuest: _selectAvailableQuest,
    openRecommendedDispatch: _openRecommendedDispatch,
    queueQuestDialogueResult: _queueQuestDialogueResult,
    playTriggerDialogue: _playTriggerDialogue,
  });
  return _archiveActions;
}

function _getActionPipeline() {
  if (_actionPipeline) return _actionPipeline;
  _actionPipeline = createActionExecutionPipeline({
    emitMessage: function (message) {
      EventBus.emit('log:message', { text: message.text, type: message.type });
    },
    emitErrorCue: function () { EventBus.emit('audio:cue', { cue: 'error' }); },
    finalizeState: _checkMidgameTeachingCompletion,
    queueAchievementCheck: _queueAchievementCheck,
    render: function (result, specification) {
      var dirtyRegions = specification && specification.dirtyRegions;
      if (dirtyRegions) _updateUI(dirtyRegions);
      else _updateUI();
    },
    checkVictory: function () { _getVictoryController().check(); },
  });
  return _actionPipeline;
}

function _getTradeActions() {
  if (_tradeActions) return _tradeActions;
  _tradeActions = createTradeActionController({
    getState: function () { return _state; },
    systems: {
      Trade: Trade,
      Economy: Economy,
      Fleet: Fleet,
      Faction: Faction,
      Quest: Quest,
      Tutorial: Tutorial,
      Progression: Progression,
    },
    pipeline: _getActionPipeline(),
    returnToStarmap: _returnToStarmapAfterTrade,
    emitAudio: function (cue) { EventBus.emit('audio:cue', { cue: cue }); },
    emitMessage: function (message) {
      EventBus.emit('log:message', { text: message.text, type: message.type });
    },
    queueQuestDialogueResult: _queueQuestDialogueResult,
    showCompletion: function (completion) { _showActionGuideCompletion(completion); },
  });
  return _tradeActions;
}

function _getTravelActions() {
  if (_travelActions) return _travelActions;
  _travelActions = createTravelActionController({
    getState: function () { return _state; },
    systems: {
      Trade: Trade,
      Economy: Economy,
      Fleet: Fleet,
      Faction: Faction,
      Quest: Quest,
      Tutorial: Tutorial,
      Progression: Progression,
    },
    pipeline: _getActionPipeline(),
    hasPendingEvent: EventUI.hasPendingEvent,
    forcePendingEvent: EventUI.forcePendingEvent,
    isShipFlying: function () {
      return !!(Renderer3D.isActive() && Renderer3D.isShipFlying && Renderer3D.isShipFlying());
    },
    emitMessage: function (message) {
      EventBus.emit('log:message', { text: message.text, type: message.type });
    },
    emitAudio: function (cue) { EventBus.emit('audio:cue', { cue: cue }); },
    flyShip: function (previousSystem, systemId, flight) {
      if (!Renderer3D.isActive() || !previousSystem) return;
      Renderer3D.flyShipTo(previousSystem, systemId, null, flight.shipTypeId, {
        shipIndex: flight.shipIndex,
        routeRevision: flight.routeRevision,
      });
    },
    refreshGalaxy: MapUI.refreshGalaxyBtn,
    refreshMarketLocation: MapUI.refreshMarketLocation,
    stopDispatchClock: _stopActiveDispatchClock,
    queueQuestDialogueResult: _queueQuestDialogueResult,
    scheduleRandomEvent: _scheduleRandomEventRoll,
    captureState: _captureRuntimeStateForSave,
    saveAutosave: function (state) { Save.saveGame(0, state, { isAutosave: true }); },
    eventBaseChance: EVENT_CONFIG.baseChance,
  });
  return _travelActions;
}

function _getExplorationActions() {
  if (_explorationActions) return _explorationActions;
  _explorationActions = createExplorationOperationsController({
    getState: function () { return _state; },
    systems: {
      Exploration: Exploration,
      Fleet: Fleet,
      GalaxyData: GalaxyData,
    },
    pipeline: _getActionPipeline(),
  });
  return _explorationActions;
}

function _getEventActions() {
  if (_eventActions) return _eventActions;
  _eventActions = createEventActionController({
    getState: function () { return _state; },
    systems: { Fleet: Fleet },
    pipeline: _getActionPipeline(),
    getRuntime: function () { return _getRandomEventController().getRuntime(); },
    emitMessage: function (message) { EventBus.emit('log:message', message); },
    refreshActionGuide: _refreshActionGuide,
    captureState: _captureRuntimeStateForSave,
    saveAutosave: function (state) { Save.saveGame(0, state, { isAutosave: true }); },
  });
  return _eventActions;
}

function _getDispatchActions() {
  if (_dispatchActions) return _dispatchActions;
  _dispatchActions = createDispatchActionController({
    getState: function () { return _state; },
    systems: { Dispatch: Dispatch, Fleet: Fleet },
    refuel: function (options) { return _getTradeActions().refuel(options); },
    travel: function (systemId) { return _getTravelActions().travel(systemId); },
    confirmTrade: function () { return _getTradeActions().confirm.apply(null, arguments); },
    isGameOver: function () { return isBlockingSurfaceVisible('gameover-modal'); },
    hasBlockingSurfaceOpen: function () {
      if (hasBlockingSurfaceOpen()) return true;
      var FleetUI = _getDeferredFeature('fleet');
      return !!(
        FleetUI &&
        typeof FleetUI.getActiveDispatchModalContext === 'function' &&
        FleetUI.getActiveDispatchModalContext()
      );
    },
    emitMessage: function (message) { EventBus.emit('log:message', message); },
    stopClock: _stopActiveDispatchClock,
    render: _updateUI,
  });
  return _dispatchActions;
}

function _getGameDayActions() {
  if (_gameDayActions) return _gameDayActions;
  _gameDayActions = createGameDayController({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    systems: {
      Fleet: Fleet,
    },
    runtime: { advanceDays: function () { return _getSystemRuntime().advanceDays.apply(null, arguments); } },
    pipeline: _getActionPipeline(),
    queueQuestDialogueResult: _queueQuestDialogueResult,
    captureState: _captureRuntimeStateForSave,
    saveAutosave: function (state) { Save.saveGame(0, state, { isAutosave: true }); },
  });
  return _gameDayActions;
}

function _getDialogueController() {
  if (_dialogueController) return _dialogueController;
  _dialogueController = createDialogueRuntimeController({
    getState: function () { return _state; },
    getSessionToken: _getSessionToken,
    isSessionTokenCurrent: _isSessionTokenCurrent,
    loadRuntime: function () { return _loadDeferredFeatureOrReject('dialogue'); },
    hooks: {
      setTelemetryState: function (state) { _setDeferredUiState('dialogue', state); },
      reportFailure: function (error) { _reportDeferredUiFailure('dialogue', error); },
      onCompletedQuest: function () {
        Tutorial.checkTrigger('complete_quest');
        _updateUI();
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
    loadRuntime: function () { return _loadDeferredFeatureOrReject('randomEvent'); },
    hooks: {
      setTelemetryState: function (state) { _setDeferredUiState('randomEvent', state); },
      reportFailure: function (error) { _reportDeferredUiFailure('randomEvent', error); },
      presentEvent: function (event, onChoice) { EventUI.setPendingEvent(event, onChoice); },
      onChoice: function (choiceIndex) { _handleEventChoice(choiceIndex); },
      emitAudio: function (cue) { EventBus.emit('audio:cue', { cue: cue }); },
      emitMessage: function (message) { EventBus.emit('log:message', message); },
      captureState: _captureRuntimeStateForSave,
      saveAutosave: function (state) { Save.saveGame(0, state, { isAutosave: true }); },
      refreshActionGuide: _refreshActionGuide,
    },
  });
  return _randomEventController;
}

function _getSettingsUiController() {
  if (_settingsUiController) return _settingsUiController;
  _configureDeferredFeatures();
  _settingsUiController = createSettingsUiController({
    features: _deferredFeatures,
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
        _restartSession('settings-tutorial-reset');
      },
      onClearSaves: function () {
        for (var slotId = 0; slotId < 4; slotId++) Save.deleteSlot(slotId);
        EventBus.emit('log:message', { text: '🗑 本地存档已全部清空。', type: 'info' });
        _updateUI([UI_REGION.SAVE, UI_REGION.GUIDE]);
      },
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
    loadView: function () {
      _configureDeferredFeatures();
      return _deferredFeatures.load('victory');
    },
    emitMessage: function (message) { EventBus.emit('log:message', message); },
    refreshActionGuide: _refreshActionGuide,
    restartSession: _restartSession,
  });
  return _victoryController;
}

function _getActionGuideCoordinator() {
  if (_actionGuideCoordinator) return _actionGuideCoordinator;
  _configureDeferredFeatures();
  _actionGuideCoordinator = createActionGuideCoordinator({
    getState: function () { return _state; },
    features: _deferredFeatures,
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

function _getUiCoordinator() {
  if (_uiCoordinator) return _uiCoordinator;
  _configureDeferredFeatures();
  var fleetActions = _getFleetActions();
  var archiveActions = _getArchiveActions();
  if (!_contextAdapters) {
    _contextAdapters = createWorkspaceContextAdapters({
      inspector: ContextInspector,
      getRevision: function () { return _session.getRevision(); },
    });
  }
  _uiCoordinator = createGameUiCoordinator({
    getState: function () { return _state; },
    features: _deferredFeatures,
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
        getMode: function () { return _blackMarketMode ? 'black' : 'open'; },
        onOpenBuy: _handleOpenBuy,
        onOpenSell: _handleOpenSell,
        onRefuel: _handleRefuel,
        onBlackMarketBuy: _handleBlackMarketBuy,
        onBlackMarketSell: _handleBlackMarketSell,
        getFinanceActions: _getMarketFinanceActions,
        onAfterRender: _bindMarketModeButtons,
      },
      fleet: fleetActions,
      archive: Object.assign({
        getDispatchContext: function (state) { return _getActionGuideCoordinator().getDispatchContext(state); },
      }, archiveActions),
      save: {
        onSaveGame: _handleSaveGame,
        onLoadGame: _handleLoadGame,
      },
      global: {
        refreshActionGuide: _refreshActionGuide,
      },
    },
  });
  return _uiCoordinator;
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

function _selectAvailableQuest(questId) {
  _pendingQuestSelectionId = questId || null;
  var ArchiveUI = _getDeferredFeature('archive');
  if (ArchiveUI && ArchiveUI.QuestUI.setSelectedAvailableQuest) {
    ArchiveUI.QuestUI.setSelectedAvailableQuest(_pendingQuestSelectionId);
    _pendingQuestSelectionId = null;
    return;
  }
  _loadArchiveUI();
}

function _ensureSaveUiRendered() {
  return _getUiCoordinator().ensureSave();
}

function _restartSession(reason) {
  Tutorial.reset();
  Save.deleteSlot(0);
  return init(null, { restoreAutosave: false, reason: reason || 'restart' });
}

function _revealMarketGoodFocus(goodId, options) {
  _loadMarketUI().then(function (MarketUI) {
    if (MarketUI && MarketUI.revealMarketGoodFocus) {
      MarketUI.revealMarketGoodFocus(goodId, options);
    }
  });
}

function _revealArchiveReportFocus(systemId, chainId) {
  _loadArchiveUI().then(function (ArchiveUI) {
    if (!ArchiveUI || !ArchiveUI.ArchiveExplorationUI) return;
    ArchiveUI.ArchiveExplorationUI.setFocus(systemId, chainId);
    ArchiveUI.ArchiveExplorationUI.render(_state);
    ArchiveUI.ArchiveExplorationUI.revealFocus(systemId, chainId);
  });
}

// 教程完成回调引用（用于防止重复注册）
let _onTutorialComplete = null;

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
  HUD.init({
    stateSource: function () { return _session.getState(); },
    revisionSource: function () { return _session.getRevision(); },
  });
  HUD.setQuestActions({
    onAcceptQuest: _getArchiveActions().onAcceptQuest,
  });

  // 注入回调给各 UI 模块
  MapUI.init(function () { return _state; }, _handleTravel, _handleGalaxyJump);

  // 初始化全局视图管理器 UIManager
  UIManager.init(function () { return _state; }, {
    onOpenMarket: function (state) {
      MapUI.openMarket(state);
    },
    onCloseMarket: function (options) {
      MapUI.closeMarket(options);
    },
    onGetMarketOpen: function () {
      return MapUI.isMarketOpen();
    },
    onOpenHangar: function () {
      _ensureFleetUiRendered();
    },
    onOpenQuests: function (state) {
      MapUI.openQuestsPanel(state);
      _ensureArchiveUiRendered();
    }
  });
  MapUI.setExplorationActions({
    onExplorePoi: _handleExplorePoi,
    getPoiStatus: _getPoiStatus,
  });
  MapUI.initTabs(function (tabId) {
    if (tabId === 'tab-fleet') _ensureFleetUiRendered();
    if (['tab-quest', 'tab-exploration', 'tab-research', 'tab-faction', 'tab-achievement'].indexOf(tabId) !== -1) {
      _ensureArchiveUiRendered();
    }
    Tutorial.checkTabClick(tabId);
  });
  MapUI.setNavigationChangeCallback(function () {
    _refreshActionGuide();
  });
  _getActionGuideCoordinator().init();
  _configureDeferredFeatures();
  _setDeferredUiState('guidanceAction', _deferredFeatures.getState('guidanceAction'));

  // 星图视角默认启用，确保回调已绑定
  MapUI.init3DCallbacks(function () { return _state; }, _handleTravel, _handleGalaxyJump);


  // 注入市场刷新回调（让 MapUI 可以触发市场表格重绘）
  MapUI.setRefreshMarket(function (mode) {
    return _loadMarketUI().then(function (MarketUI) {
      if (!MarketUI) return;
      const sysId = MapUI.getMarketViewSystem(_state);
      var pendingMarketFocus = MapUI.consumePendingMarketPanelFocus();
      var bmMode = pendingMarketFocus
        ? ((pendingMarketFocus.marketMode || 'open') === 'black' ? 'black' : 'open')
        : (_blackMarketMode ? 'black' : 'open');
      _blackMarketMode = bmMode === 'black';
      if (pendingMarketFocus && pendingMarketFocus.goodId) {
        MarketUI.setFocusedMarketGood(sysId, bmMode, pendingMarketFocus.goodId);
      }
      MarketUI.showDetail(sysId, bmMode);
      _getUiCoordinator().renderMarket(MarketUI, _state);
      if (pendingMarketFocus) {
        MarketUI.setMarketWorkspaceFocus(pendingMarketFocus);
      }
      _bindMarketModeButtons();
    });
  });
  Modal.init(_handleTradeConfirm);

  // 新手引导系统已由 GameSystemRuntime 与其他状态系统统一恢复。
  _deferredFeatures.sync('tutorial');
  _setDeferredUiState('onboarding', _deferredFeatures.getState('onboarding'));

  // 教程完成后推荐首批任务，并把后续节奏交给底部当前行动条。
  if (_onTutorialComplete) EventBus.off('tutorial:complete', _onTutorialComplete);
  _onTutorialComplete = function () {
    EventBus.emit('log:message', {
      text: '🧭 操作教程完成。底部当前行动会继续引导你登记首轮交易并进入正式委托。',
      type: 'tip',
    });
    _recommendStarterQuests();
    _refreshActionGuide();
  };
  EventBus.on('tutorial:complete', _onTutorialComplete);

  // 点击 header 公司名按鈕随时重命名
  var companyBtn = document.getElementById('company-name-display');
  if (companyBtn) {
    companyBtn.onclick = _showCompanyRenameModal;
  }

  _getSettingsUiController().bindLauncher();

  // UI 壳完成绑定后，再由生命周期统一同步投影、渲染并恢复计时。
  _getSessionLifecycle().present(sessionTransition);

  if (restoredAutosave) {
    EventBus.emit('log:message', { text: '📂 已自动恢复最近进度。', type: 'info' });
  }

  const sceneReadyPromise = Renderer3D.whenSceneReady
    ? Renderer3D.whenSceneReady()
    : Promise.resolve({ renderer: Renderer3D.getActiveRendererName ? Renderer3D.getActiveRendererName() : 'unknown' });

  if (!Tutorial.isCompleted()) {
    _showTutorialStartModal();
  } else {
    _showWelcomeMessages();
  }

  return sceneReadyPromise;
}

export function _setStateForTest(state) {
  _replaceState(state || null, 'test');
  if (_actionGuideCoordinator) _actionGuideCoordinator.reset();
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
  return _getFleetActions().onAssignRoute(shipIndex, buySystemId, sellSystemId, goodId, tradePolicy);
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

function _showWelcomeMessages() {
  EventBus.emit('log:message', { text: '🚀 欢迎来到银河历 3045 年！您的星际贸易之旅由此开始……', type: 'info' });
  EventBus.emit('log:message', {
    text: '💡 提示：点击星图上的星系前往贸易，买低卖高赚取差价。多条长期路线等待推进——查看顶部进度了解详情！',
    type: 'tip',
  });
  EventBus.emit('log:message', {
    text: '🔬 新功能：查看【科技】标签研究群星科技，【派系】标签管理外交关系！',
    type: 'tip',
  });
  EventBus.emit('log:message', {
    text: '📋 新功能：【档案】入口可接取任务、查看探索报告、研究科技、查看派系与成就，右上角【设置】可管理存档！',
    type: 'tip',
  });
}

function _showActionGuideCompletion(completion, options) {
  if (completion) _getActionGuideCoordinator().showCompletion(completion.message, completion.detail, options);
}

function _recommendStarterQuests() {
  var recommendations = Quest.getStarterRecommendations(_state, 3);
  var activeQuests = Quest.getActiveQuests(_state);
  var activeQuest = activeQuests.length > 0 ? activeQuests[0] : null;

  _updateUI();

  if (activeQuest) {
    EventBus.emit('log:message', {
      text: '📋 当前正在推进「' + activeQuest.name + '」，底部当前行动会继续给出可直接执行的下一步。',
      type: 'info',
    });

    if (recommendations.length > 0) {
      EventBus.emit('log:message', {
        text: '🧭 跑完手头这单后，还可以继续接 ' + recommendations.map(function (quest) { return '「' + quest.name + '」'; }).join('、') + '。',
        type: 'tip',
      });
    }
    return;
  }

  if (recommendations.length === 0) {
    EventBus.emit('log:message', {
      text: '📋 教程结束后可前往任务页查看当前章节任务，继续推进你的贸易生涯。',
      type: 'tip',
    });
    return;
  }

  EventBus.emit('log:message', {
    text: '📋 可接取任务：' + recommendations.map(function (quest) { return '「' + quest.name + '」'; }).join('、') + '。',
    type: 'tip',
  });
  EventBus.emit('log:message', {
    text: '🧭 底部当前行动会直接接取并推进适合作为教程后第一阶段目标的任务。',
    type: 'info',
  });
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

// 设置管理已提取到 js/core/SettingsManager.js

function _showTutorialStartModal() {
  var requestedState = _state;
  var requestedRevision = _runtimeRevision;
  _loadOnboardingUI().then(function (OnboardingUI) {
    if (!OnboardingUI || requestedState !== _state || requestedRevision !== _runtimeRevision) return;
    OnboardingUI.showTutorialStart({
      onStart: function () {
        _loadTutorialUI().then(function (TutorialUI) {
          if (!TutorialUI || requestedState !== _state || requestedRevision !== _runtimeRevision) return;
          Tutorial.start();
          _refreshActionGuide();
        });
      },
      onSkip: function () {
        Tutorial.skip();
        _showWelcomeMessages();
        _updateUI();
      },
    });
    _refreshActionGuide();
  });
  _refreshActionGuide();
}

function _showCompanyRenameModal() {
  var requestedState = _state;
  var requestedRevision = _runtimeRevision;
  _loadOnboardingUI().then(function (OnboardingUI) {
    if (!OnboardingUI || requestedState !== _state || requestedRevision !== _runtimeRevision) return;
    OnboardingUI.showCompanyRename({
      currentName: requestedState.companyName || '',
      fallbackName: requestedState.companyName || '测试公司',
      onConfirm: function (name) {
        if (requestedState !== _state || requestedRevision !== _runtimeRevision) return;
        requestedState.companyName = name;
        _updateUI();
        EventBus.emit('log:message', {
          text: '🏢 公司已正式更名为「' + name + '」！愿财富与你同行！',
          type: 'upgrade',
        });
      },
      onSkip: function () {
        _refreshActionGuide();
      },
    });
    _refreshActionGuide();
  });
  _refreshActionGuide();
}



// ---------------------------------------------------------------------------
// 动作处理（所有状态变更入口）
// ---------------------------------------------------------------------------

function _dispatch(result, presentation) {
  // result = { ok, msgs, meta? }（TradeSystem 各函数的返回值）
  if (result && result.ok) _checkMidgameTeachingCompletion();
  if (result && result.msgs) {
    result.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
  }
  if (result && result.ok === false) {
    EventBus.emit('audio:cue', { cue: 'error' });
  }
  _queueAchievementCheck();
  var dirtyRegions = normalizeDirtyRegions(presentation);
  if (dirtyRegions.length > 0) _updateUI(dirtyRegions);
  else _updateUI();
  if (result && result.ok) _getVictoryController().check();
}

function _checkMidgameTeachingCompletion() {
  if (!_state) return [];
  var completedChains = MidgameTeachingChain.checkChainCompletion(_state) || [];
  completedChains.forEach(function (chainResult) {
    if (!chainResult || !chainResult.message) return;
    EventBus.emit('log:message', { text: chainResult.message, type: 'upgrade' });
  });
  return completedChains;
}

function _recordQuestProgress(context) {
  var questResult = Quest.checkProgress(_state, context || { action: 'state_sync' });
  questResult.msgs.forEach(function (message) {
    EventBus.emit('log:message', { text: message.text, type: message.type });
  });
  _queueQuestDialogueResult(questResult);
  return questResult;
}

function _refreshActionGuide() {
  return _getActionGuideCoordinator().refresh();
}

function _getGoodDisplayName(goodId) {
  var good = GOODS.find(function (item) { return item.id === goodId; });
  return good ? good.name : (goodId || '商品');
}

function _getGuidanceTradeQuantity(action, goodId, marketType) {
  Fleet.syncStateFromShip(_state);
  if (action === 'sell') {
    return Math.max(0, Number((_state.cargo || {})[goodId] || 0));
  }

  var price = marketType === 'black'
    ? Economy.getBlackMarketBuyPrice(_state.currentSystem, goodId, _state)
    : Economy.getBuyPrice(_state.currentSystem, goodId, _state);
  if (!Number.isFinite(price) || price <= 0) return 0;

  var cargoUsed = Object.values(_state.cargo || {}).reduce(function (sum, qty) {
    return sum + Number(qty || 0);
  }, 0);
  var cargoSpace = Math.max(0, (_state.maxCargo || 0) - cargoUsed);
  var canAfford = Math.floor((_state.credits || 0) / price);
  return Math.max(0, Math.min(cargoSpace, canAfford));
}

function _openGuidanceTradeConfirmation(action, payload) {
  var goodId = payload && payload.goodId ? payload.goodId : '';
  var marketType = payload && payload.marketType === 'black' ? 'black' : 'open';
  if (!goodId) {
    EventBus.emit('log:message', { text: '⚠️ 当前行动缺少商品目标，无法自动交易。', type: 'error' });
    _refreshActionGuide();
    return;
  }

  var good = GOODS.find(function (item) {
    return item.id === goodId;
  });
  if (!good) {
    EventBus.emit('log:message', { text: '⚠️ 当前行动指向的商品不存在，无法打开交易确认。', type: 'error' });
    _refreshActionGuide();
    return;
  }

  var quantity = _getGuidanceTradeQuantity(action, goodId, marketType);
  if (quantity <= 0) {
    EventBus.emit('log:message', {
      text: action === 'sell'
        ? '⚠️ 货舱中没有可卖出的「' + _getGoodDisplayName(goodId) + '」。'
        : '⚠️ 当前积分或货舱空间不足，无法打开「' + _getGoodDisplayName(goodId) + '」买入确认。',
      type: 'error',
    });
    _refreshActionGuide();
    return;
  }

  EventBus.emit('log:message', {
    text: buildCommandFeedback({
      actionId: 'market',
      commandSurface: 'market',
      commandIntent: action === 'buy' ? '买入确认' : '卖出确认',
      label: action === 'buy' ? '确认买入' : '确认卖出',
    }, {
      icon: '📊',
      destination: '当前市场 · ' + (action === 'buy' ? '买入确认' : '卖出确认'),
      nextStep: payload && payload.questName
        ? '检查数量并确认成交，完成后将推进「' + payload.questName + '」'
        : '检查数量后确认成交',
      returnTo: '关闭弹窗可继续查看行情',
    }),
    type: 'tip',
  });
  Modal.openTradeModal(action, good, _state, marketType, {
    initialQuantity: quantity,
  });
  _refreshActionGuide();
}

function _prepareDirectGuidanceExecution() {
  if (MapUI.focusStarmap) {
    MapUI.focusStarmap();
  }
}

function _handleActionGuideAction(suggestion) {
  if (!suggestion || !suggestion.actionType) return;

  var requestedRevision = _runtimeRevision;
  _getActionGuideCoordinator().showProcessing(suggestion, getGuidanceActionProcessingMessage(suggestion));
  return _loadGuidanceActionController().then(function (GuidanceAction) {
    if (!GuidanceAction || requestedRevision !== _runtimeRevision) {
      _refreshActionGuide();
      return;
    }
    GuidanceAction.handleGuidanceAction(suggestion, {
      getState: function () { return _state; },
      prepareDirectExecution: _prepareDirectGuidanceExecution,
      acceptQuest: _getArchiveActions().onAcceptQuest,
      selectAvailableQuest: _selectAvailableQuest,
      activateTab: MapUI.activateTab,
      updateUI: _updateUI,
      openTradeConfirmation: _openGuidanceTradeConfirmation,
      refuel: _handleRefuel,
      forcePendingEvent: EventUI.forcePendingEvent,
      refreshActionGuide: _refreshActionGuide,
      startTeachingChain: _startMidgameTeachingChain,
      openRecommendedDispatch: _openRecommendedDispatch,
      openRecommendedMod: _openRecommendedMod,
      showCompletion: function (message, detail, options) {
        _getActionGuideCoordinator().showCompletion(message, detail, options);
      },
      emitLog: function (message) {
        EventBus.emit('log:message', message);
      },
      openMarketPanel: MapUI.openMarketPanel,
      openMarketSystemPanel: MapUI.openMarketSystemPanel,
      revealMarketGoodFocus: _revealMarketGoodFocus,
      revealArchiveReportFocus: _revealArchiveReportFocus,
      acknowledgeSurveyChainFollowup: function (systemId, chainId) {
        return Exploration.acknowledgeChainFollowup(_state, systemId, chainId);
      },
      acknowledgeSurveyReport: function (systemId, reportId) {
        return Exploration.acknowledgeSurveyReport(_state, systemId, reportId);
      },
      travel: _handleTravel,
      focusStarmap: MapUI.focusStarmap,
      focusNavigationTarget: MapUI.focusNavigationTarget,
      explorePoi: _handleExplorePoi,
    });

  });
}

function _startMidgameTeachingChain(chainId) {
  var chain = Object.values(MidgameTeachingChain.TEACHING_CHAINS).find(function (candidate) {
    return candidate.id === chainId;
  });
  if (!chain || !MidgameTeachingChain.startChain(_state, chainId)) {
    EventBus.emit('log:message', { text: '⚠️ 当前无法启动该专题，请先完成已有专题或解锁对应系统。', type: 'error' });
    _refreshActionGuide();
    return false;
  }
  EventBus.emit('log:message', {
    text: '🧭 已开始专题「' + chain.title + '」：' + chain.description,
    type: 'tip',
  });
  _updateUI();
  return true;
}

function _completeMidgameTeachingStep(chainId, stepId) {
  var result = MidgameTeachingChain.completeChainStep(_state, chainId, stepId);
  if (result && result.completed) {
    EventBus.emit('log:message', { text: result.message, type: 'upgrade' });
  }
  return result;
}

function _getPoiStatus(systemId, poiId) {
  return _getExplorationActions().getPoiStatus(systemId, poiId);
}

function _handleExplorePoi(systemId, poiId) {
  return _getExplorationActions().explorePoi(systemId, poiId);
}

function _handleTravel(systemId) {
  return _getTravelActions().travel(systemId);
}

function _handleEventChoice(choiceIndex) {
  return _getEventActions().resolveChoice(choiceIndex);
}

/**
 * 跨星系跳转（点击其他星系星球时触发）
 */
function _handleGalaxyJump(systemId) {
  // 直接调用 travelTo，它会自动处理跨星系逻辑
  _handleTravel(systemId);
}

function _handleTradeConfirm(action, goodId, quantity, marketType) {
  return _getTradeActions().confirm(action, goodId, quantity, marketType);
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
  return _getTradeActions().refuel();
}

function _handleOpenBuy(good) {
  Modal.openTradeModal('buy', good, _state, 'open', Tutorial.isActive()
    ? { initialQuantity: 10 }
    : undefined);
}

function _handleOpenSell(good) {
  Modal.openTradeModal('sell', good, _state, 'open', Tutorial.isActive()
    ? { initialQuantity: Math.max(1, (_state.cargo && _state.cargo[good.id]) || 1) }
    : undefined);
}

// ---------------------------------------------------------------------------
// 黑市交易（UI 入口：打开确认弹窗）
// ---------------------------------------------------------------------------

function _handleBlackMarketBuy(good) {
  Modal.openTradeModal('buy', good, _state, 'black');
}

function _handleBlackMarketSell(good) {
  Modal.openTradeModal('sell', good, _state, 'black');
}

/**
 * 绑定市场模式切换按钮（公开市场 ↔ 黑市）
 * 在每次渲染 market detail 后调用
 */
function _bindMarketModeButtons() {
  var btns = document.querySelectorAll('.market-mode-btn:not(.disabled)');
  btns.forEach(function (btn) {
    // 用 cloneNode 替换旧节点，避免重复绑定 listener
    var fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', function () {
      var mode = fresh.dataset.mode;
      _blackMarketMode = mode === 'black';
      // 重新渲染详情
      var sysId = MapUI.getMarketViewSystem(_state);
      var bmMode = _blackMarketMode ? 'black' : 'open';
      _loadMarketUI().then(function (MarketUI) {
        if (!MarketUI) return;
        MarketUI.showDetail(sysId, bmMode);
        MarketUI.render(_state, _handleOpenBuy, _handleOpenSell, _handleRefuel, sysId, bmMode, MapUI.getMarketViewGalaxy(_state), _handleBlackMarketBuy, _handleBlackMarketSell, _getMarketFinanceActions());
        _bindMarketModeButtons();
      });
    });
  });
}

function _openRecommendedDispatch(recommendation, sourceLabel, icon) {
  var activeShip = Fleet.getActiveShip(_state);
  var activeShipIndex = _state.activeShipIndex || 0;
  if (!activeShip || !recommendation) return;

  MapUI.activateTab('tab-fleet');
  _loadFleetUI().then(function (FleetUI) {
    if (!FleetUI) return;
    var fleetActions = _getFleetActions();
    _getUiCoordinator().renderFleet(FleetUI);
    FleetUI.openDispatchModal(_state, activeShipIndex, fleetActions.onAssignRoute, fleetActions.onCancelRoute, {
      buySystemId: recommendation.buySystemId,
      sellSystemId: recommendation.sellSystemId,
      goodId: recommendation.goodId,
      tradePolicy: recommendation.recommendedTradePolicy || {
        maxBuyPrice: null,
        minSellPrice: null,
        minProfitRate: null,
        riskMode: 'balanced',
        marketMode: 'open',
      },
      recommendation: recommendation,
    });

    EventBus.emit('log:message', {
      text: buildCommandFeedback({
        actionId: 'dispatch',
        commandSurface: 'fleet',
        commandIntent: sourceLabel,
        label: '载入推荐路线',
      }, {
        icon: icon,
        destination: '「' + activeShip.emoji + ' ' + activeShip.name + '」 · ' + sourceLabel,
        nextStep: '检查 ' + (recommendation.buySystemName || recommendation.buySystemId) + ' → ' + (recommendation.sellSystemName || recommendation.sellSystemId) + ' · ' + (recommendation.goodName || recommendation.goodId),
        returnTo: '确认“开始跑商”后执行路线',
      }),
      type: 'info',
    });
    _refreshActionGuide();
    _showActionGuideCompletion(getDispatchDraftCompletion());
  });
}

function _openRecommendedMod(payload) {
  var data = payload || {};
  var shipIndex = Number.isFinite(Number(data.shipIndex))
    ? Number(data.shipIndex)
    : (_state.activeShipIndex || 0);

  if (!_state.fleet || !_state.fleet[shipIndex]) {
    shipIndex = _state.activeShipIndex || 0;
  }
  if (!_state.fleet || !_state.fleet[shipIndex]) return;

  _updateUI();
  _loadFleetUI().then(function (FleetUI) {
    if (!FleetUI) return;
    var fleetActions = _getFleetActions();
    _getUiCoordinator().renderFleet(FleetUI);
    FleetUI.openModModal(
      _state,
      shipIndex,
      fleetActions.onInstallMod,
      fleetActions.onUninstallMod,
      fleetActions.onUpgradeShip,
      fleetActions.onServiceShip,
      fleetActions.onSellShip,
      { focusModId: data.modId || '', focusService: !!data.focusService },
    );
    _refreshActionGuide();
  });
}

function _handleFocusRemoteMarketSystem(systemId) {
  var system = SYSTEMS.find(function (entry) { return entry.id === systemId; });
  var focused = system && MapUI.focusNavigationTarget
    ? MapUI.focusNavigationTarget(_state, systemId, {
        title: '前往「' + system.name + '」处理市场操作',
      })
    : false;

  EventBus.emit('log:message', {
    text: buildCommandFeedback({
      actionId: 'navigation',
      commandSurface: 'navigation',
      commandIntent: focused ? '远程市场航点' : '星图',
      label: focused ? '设为航点' : '查看星图',
    }, {
      icon: '🧭',
      destination: focused && system ? ('星图 · ' + system.name) : '星图 · 航线判断',
      nextStep: focused ? '在目标详情面板确认航行条件' : '手动选择可达目的地',
      returnTo: '抵达后回到市场执行交易、补给或本地经营',
    }),
    type: focused ? 'tip' : 'error',
  });

  _updateUI();
  if (focused) {
    _showActionGuideCompletion(getRemoteMarketFocusCompletion());
  }
}

function _handleSaveGame(slotId) {
  _captureRuntimeStateForSave(_state, { reason: 'manual-save' });
  const result = Save.saveGame(slotId, _state);
  EventBus.emit('log:message', { text: result.msg, type: result.ok ? 'info' : 'error' });
  _updateUI([UI_REGION.SAVE, UI_REGION.GUIDE]);
}

function _handleLoadGame(slotId) {
  const result = Save.loadGame(slotId);
  if (result.ok) {
    _getSettingsUiController().hide();
    _getSessionLifecycle().transition(result.state, {
      reason: 'manual-load',
      mode: 'manual-load',
      restoreEconomy: true,
      restoreGalaxy: true,
      restoreRandomRuntime: true,
      syncDifficulty: true,
      restorePendingEvent: true,
    });
    EventBus.emit('log:message', { text: result.msg, type: 'info' });
  } else {
    EventBus.emit('log:message', { text: result.msg, type: 'error' });
  }
}

// 等级进阶逻辑已提取到 js/systems/progression/ProgressionSystem.js

// ---------------------------------------------------------------------------
// 激活船只自动派遣 — 逻辑已提取到 js/core/DispatchController.js
// GameManager 仅保留 tick 回调的胶水逻辑
// ---------------------------------------------------------------------------

function _boundDispatchTick() {
  return _getDispatchActions().tick();
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
  if (MapUI.isMarketOpen() && !_getDeferredFeature('market')) _ensureMarketUiRendered();
  if (typeof regions === 'undefined') return _getUiCoordinator().renderAll();
  return _getUiCoordinator().invalidate(regions);
}

function _isRealtimeClockPaused() {
  return !!(document.hidden || Tutorial.isActive() || document.querySelector('.modal:not(.hidden)'));
}

function _applyRealtimeDayProgress(days, clockContext) {
  return _getGameDayActions().advance(days, clockContext);
}

function _getRealtimeDayDurationMs() {
  return Number.isFinite(_settings && _settings.realtimeDayDurationMs)
    ? _settings.realtimeDayDurationMs
    : TIME_CONFIG.realtimeDayDurationMs;
}

function _captureRuntimeStateForSave(state, options) {
  return _getSystemRuntime().capture(state, Object.assign({ sessionToken: _getSessionToken() }, options));
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

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function _deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
