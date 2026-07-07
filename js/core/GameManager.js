// js/core/GameManager.js — 游戏主控制器
// 依赖：所有 systems/、ui/ 模块
// 导出：init
//
// 职责：持有唯一 _state，编排各子系统，处理所有玩家动作，
//       每次状态变更后调用 _updateUI 同步视图。

import * as EventBus   from './EventBus.js';
import * as Economy    from '../systems/economy/Economy.js?v=20260531-chainfollow1';
import * as Trade      from '../systems/trade/TradeSystem.js?v=20260531-chainfollow1';
import * as Commerce   from '../systems/commerce/CommerceFacade.js?v=20260531-chainfollow1';
import * as RandomEvent from '../systems/event/RandomEvent.js';
import * as Faction    from '../systems/faction/FactionSystem.js';
import * as Research   from '../systems/research/ResearchSystem.js';
import * as Renderer3D from '../ui/Renderer3DAdvanced.js?v=20260707-galaxymap1';
import * as GalaxyData from '../systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js?v=20260531-chainfollow1';
import * as HUD        from '../ui/HUD.js?v=20260621-settingsfallback1';
import * as MarketUI   from '../ui/MarketUI.js?v=20260619-marketcontrols1';
import * as ShipUI     from '../ui/ShipUI.js';
import * as MapUI      from '../ui/MapUI.js?v=20260707-galaxymap1';
import * as Modal      from '../ui/Modal.js?v=20260621-settingsfallback1';
import * as VictoryResultUI from '../ui/VictoryResultUI.js?v=20260621-settingsfallback1';
import * as EventUI    from '../ui/EventUI.js?v=20260621-settingsfallback1';
import * as DialogueUI from '../ui/DialogueUI.js?v=20260621-settingsfallback1';
import * as OnboardingUI from '../ui/OnboardingUI.js?v=20260621-settingsfallback1';
import * as ActionGuideUI from '../ui/ActionGuideUI.js?v=20260531-topicchain1';
import * as CompanyDirectiveUI from '../ui/CompanyDirectiveUI.js?v=20260621-settingsfallback1';
import * as ResearchUI from '../ui/ResearchUI.js?v=20260621-settingsfallback1';
import * as FactionUI  from '../ui/FactionUI.js?v=20260609-factionfocus1';
import * as SaveUI     from '../ui/SaveUI.js?v=20260621-settingsfallback1';
import * as UIManager  from '../ui/UIManager.js?v=20260621-settingsfallback1';
import * as QuestUI    from '../ui/QuestUI.js?v=20260621-settingsfallback1';
import { buildCommandFeedback } from '../ui/CommandAction.js?v=20260510-command1';
import * as AchievementUI from '../ui/AchievementUI.js?v=20260609-achfocus1';
import * as Fleet      from '../systems/fleet/FleetSystem.js?v=20260526-modfocus1';
import * as Crew       from '../systems/fleet/CrewSystem.js';
import * as AutoTrade  from '../systems/trade/AutoTradeSystem.js?v=20260531-chainfollow1';
import * as TradeStation from '../systems/trade/TradeStationSystem.js?v=20260531-chainfollow1';
import * as Finance from '../systems/finance/FinanceSystem.js';
import * as Futures from '../systems/finance/FuturesSystem.js';
import * as FleetUI    from '../ui/FleetUI.js?v=20260621-settingsfallback1';
import * as Save       from '../systems/save/SaveSystem.js';
import * as Quest      from '../systems/quest/QuestSystem.js?v=20260531-chainfollow1';
import * as Achievement from '../systems/achievement/AchievementSystem.js';
import * as Tutorial   from '../systems/tutorial/TutorialSystem.js?v=20260518-ux2';
import * as TutorialUI from '../ui/TutorialUI.js?v=20260621-tutorialviewport2';
import * as Dialogue   from '../systems/story/DialogueSystem.js';
import * as GameTime from '../systems/time/GameTimeSystem.js?v=20260531-chainfollow1';
import { INITIAL_STATE, DIFFICULTY_LEVELS, EVENT_CONFIG, TIME_CONFIG } from '../data/constants.js';
import * as Victory from '../systems/victory/VictorySystem.js?v=20260619-endingresult1';
import { getLevel } from '../data/playerLevels.js';
import { SYSTEMS } from '../data/systems.js';
import { GOODS } from '../data/goods.js';
import { SHIP_MODS } from '../data/ships.js';
import {
  getDispatchConfirmedCompletion,
  getDispatchDraftCompletion,
  getModInstalledCompletion,
  getRefuelCompletion,
  getRemoteMarketFocusCompletion,
  getServiceScheduledCompletion,
} from './ActionGuideCompletion.js?v=20260526-helper1';
import * as Settings from './SettingsManager.js?v=20260621-settingsfallback1';
import * as Audio from './AudioManager.js';
import * as Progression from '../systems/progression/ProgressionSystem.js?v=20260518-ux2';
import * as Guidance from '../systems/guidance/GuidanceSystem.js?v=20260531-chainfollow1';
import * as CompanyDirective from '../systems/company/CompanyDirectiveSystem.js?v=20260531-rewardloop1';
import * as GuidanceAction from './GuidanceActionController.js?v=20260531-chainfollow1';
import * as Dispatch from './DispatchController.js?v=20260505-surface1';
import { hasBlockingSurfaceOpen, hideBlockingSurface, showBlockingSurface } from '../ui/SurfaceManager.js?v=20260621-settingsfallback1';

let _state     = null;
let _startTime = null;
let _settings  = {
  motionLevel: 'full',
  difficulty: 'normal',
  secretRoutesVisible: true,
  realtimeDayDurationMs: TIME_CONFIG.realtimeDayDurationMs,
};
let _blackMarketMode = false; // 当前是否处于黑市交易模式
let _dialogueQueue = [];
let _dialoguePlaying = false;
let _realtimeClock = null;
let _recentModInstallContext = null;
let _gameLoopFrameId = null;
let _acknowledgedVictoryPathIds = new Set();

function _getMarketFinanceActions() {
  return {
    onTakeLoan: _handleTakeLoan,
    onRepayLoan: _handleRepayLoan,
    onBuyStock: _handleBuyStock,
    onSellStock: _handleSellStock,
    onInvestTradeStation: _handleInvestTradeStation,
    onBatchInvestTradeStations: _handleBatchInvestTradeStations,
    onPurchaseInsurance: _handlePurchaseInsurance,
    onSubmitInsuranceClaim: _handleSubmitInsuranceClaim,
    onBuildTradeStation: _handleBuildTradeStation,
    onUpgradeTradeStation: _handleUpgradeTradeStation,
    onHireTradeStationManager: _handleHireTradeStationManager,
    onSetTradeStationStrategy: _handleSetTradeStationStrategy,
    onBatchUpgradeTradeStations: _handleBatchUpgradeTradeStations,
    onBatchHireTradeStationManager: _handleBatchHireTradeStationManager,
    onBatchSetTradeStationStrategy: _handleBatchSetTradeStationStrategy,
    onFuturesLong: _handleFuturesLong,
    onFuturesShort: _handleFuturesShort,
    onFuturesClose: _handleFuturesClose,
    onFocusRemoteSystem: _handleFocusRemoteMarketSystem,
  };
}

// 教程完成回调引用（用于防止重复注册）
let _onTutorialComplete = null;

// ---------------------------------------------------------------------------
// 对外 API
// ---------------------------------------------------------------------------

export function init(difficulty) {
  _stopGameLoop();
  Dispatch.stopActiveDispatch();   // 重启时停止派遣
  _state = _deepClone(INITIAL_STATE);
  _settings = Settings.loadSettings();
  Audio.init(_settings);
  _dialogueQueue = [];
  _dialoguePlaying = false;
  _realtimeClock = null;
  _acknowledgedVictoryPathIds = new Set();

  // 应用难度设定
  var effectiveDifficulty = difficulty || _settings.difficulty || 'normal';
  var diff = DIFFICULTY_LEVELS[effectiveDifficulty] || DIFFICULTY_LEVELS['normal'];
  _state.difficulty = diff.id;
  _state.credits = diff.startCredits;
  RandomEvent.resetRuntimeState(_state);

  Economy.init();
  Fleet.init(_state);
  Faction.init(_state);
  Research.init(_state);
  Quest.init(_state);
  Achievement.init(_state);
  TradeStation.init(_state);
  Finance.init(_state);
  GalaxyData.init(_state); // Initialize galaxy data layer
  Renderer3D.init();
  Renderer3D.resetRuntimeState(_state.currentSystem);
  Settings.applySettings(_settings, Renderer3D);
  HUD.init();
  HUD.setQuestActions({
    onAcceptQuest: _handleAcceptQuest,
  });
  Dialogue.init(_state);
  DialogueUI.init();
  DialogueUI.hideScene();

  // 注入回调给各 UI 模块
  MapUI.init(_state, _handleTravel, _handleGalaxyJump);

  // 初始化全局视图管理器 UIManager
  UIManager.init(_state, {
    onOpenMarket: function (state) {
      MapUI.openMarket(state);
    },
    onCloseMarket: function () {
      MapUI.closeMarket();
    },
    onGetMarketOpen: function () {
      return MapUI.isMarketOpen();
    },
    onOpenQuests: function (state) {
      MapUI.openQuestsPanel(state);
    }
  });
  MapUI.setExplorationActions({
    onScan: _handleScanSystem,
    onLand: _handleLandOnSystem,
    onExplorePoi: _handleExplorePoi,
    getScanStatus: _getScanStatus,
    getLandingStatus: _getLandingStatus,
    getPoiStatus: _getPoiStatus,
  });
  MapUI.initTabs(function (tabId) {
    Tutorial.checkTabClick(tabId);
  });
  MapUI.setNavigationChangeCallback(function () {
    _refreshActionGuide();
  });
  ActionGuideUI.init(_handleActionGuideAction);
  CompanyDirectiveUI.init({
    onAction: _handleCompanyDirectiveAction,
    onClaim: _handleCompanyDirectiveClaim,
    onClaimAll: _handleCompanyDirectiveClaimAll,
    onSelectionChange: function () {
      _refreshActionGuide();
    },
  });

  // 3D视角默认启用，确保回调已绑定
  MapUI.init3DCallbacks(_state, _handleTravel, _handleGalaxyJump);


  // 注入市场刷新回调（让 MapUI 可以触发市场表格重绘）
  MapUI.setRefreshMarket(function (mode) {
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
    MarketUI.render(_state, _handleOpenBuy, _handleOpenSell, _handleRefuel, sysId, bmMode, MapUI.getMarketViewGalaxy(_state), _handleBlackMarketBuy, _handleBlackMarketSell, _getMarketFinanceActions());
    if (pendingMarketFocus) {
      MarketUI.setMarketWorkspaceFocus(pendingMarketFocus);
    }
    _bindMarketModeButtons();
  });
  Modal.init(_handleTradeConfirm);
  VictoryResultUI.init({
    onContinue: function (pathId) {
      if (pathId) _acknowledgedVictoryPathIds.add(pathId);
      EventBus.emit('log:message', {
        text: '胜利结算已归档，当前公司继续经营。',
        type: 'info',
      });
      _refreshActionGuide();
    },
    onRestart: function () {
      Tutorial.reset();
      init();
    },
  });

  // 新手引导系统
  Tutorial.init(_state);
  TutorialUI.init(
    function () { Tutorial.advance(); _updateUI(); },
    function () { Tutorial.skip(); _updateUI(); }
  );

  // 教程完成后推荐首批任务，并把后续节奏交给底部当前行动条。
  if (_onTutorialComplete) EventBus.off('tutorial:complete', _onTutorialComplete);
  _onTutorialComplete = function () {
    var recommendations = Quest.getStarterRecommendations(_state, 3);
    var activeQuest = Quest.getActiveQuests(_state)[0] || null;
    _playTriggerDialogue('tutorial_complete', {
      recommendations: recommendations,
      activeQuest: activeQuest,
    }, function () {
      _recommendStarterQuests();
      _refreshActionGuide();
    });
  };
  EventBus.on('tutorial:complete', _onTutorialComplete);

  // 点击 header 公司名按鈕随时重命名
  var companyBtn = document.getElementById('company-name-display');
  if (companyBtn) {
    companyBtn.onclick = _showCompanyRenameModal;
  }

  Settings.initSettingsModal({
    settings: _settings,
    Renderer: Renderer3D,
    onDifficultyChanged: function (nextDifficulty) {
      if (!DIFFICULTY_LEVELS[nextDifficulty]) return;
      _state.difficulty = nextDifficulty;
      _settings.difficulty = nextDifficulty;
      _updateUI();
    },
    onRealtimeDayDurationChanged: function (nextDurationMs) {
      _settings.realtimeDayDurationMs = nextDurationMs;
      _resetRealtimeClock(performance.now());
    },
    onResetTutorial: function () {
      Tutorial.reset();
      Settings.hideSettingsModal();
      init();
    },
    onClearSaves: function () {
      for (var slotId = 0; slotId < 4; slotId++) Save.deleteSlot(slotId);
      EventBus.emit('log:message', { text: '🗑 本地存档已全部清空。', type: 'info' });
      _updateUI();
    },
  });

  _updateUI();
  _resetRealtimeClock(performance.now());
  _startGameLoop();

  if (!Tutorial.isCompleted()) {
    _showTutorialStartModal();
  } else {
    _showWelcomeMessages();
  }
}

export function _setStateForTest(state) {
  _state = state || null;
  _recentModInstallContext = null;
}

export function _handleActionGuideActionForTest(suggestion) {
  _handleActionGuideAction(suggestion);
}

export function _handleTradeConfirmForTest(action, goodId, quantity, marketType) {
  _handleTradeConfirm(action, goodId, quantity, marketType);
}

function _showWelcomeMessages() {
  EventBus.emit('log:message', { text: '🚀 欢迎来到银河历 3045 年！您的星际贸易之旅由此开始……', type: 'info' });
  EventBus.emit('log:message', {
    text: '💡 提示：点击星图上的星系前往贸易，买低卖高赚取差价。多条胜利路径等你探索——查看顶部进度了解详情！',
    type: 'tip',
  });
  EventBus.emit('log:message', {
    text: '🔬 新功能：查看【科技】标签研究群星科技，【派系】标签管理外交关系！',
    type: 'tip',
  });
  EventBus.emit('log:message', {
    text: '📋 新功能：【档案】入口可接取任务、研究科技、查看派系与成就，右上角【设置】可管理存档！',
    type: 'tip',
  });
}

function _showActionGuideCompletion(completion, options) {
  if (completion && ActionGuideUI.showCompletion) {
    ActionGuideUI.showCompletion(completion.message, completion.detail, options);
  }
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
    text: '📋 下一步建议：接取 ' + recommendations.map(function (quest) { return '「' + quest.name + '」'; }).join('、') + '。',
    type: 'tip',
  });
  EventBus.emit('log:message', {
    text: '🧭 底部当前行动会直接接取并推进适合作为教程后第一阶段目标的任务。',
    type: 'info',
  });
}

function _playTriggerDialogue(triggerType, context, onFinished) {
  var scenes = Dialogue.getScenesForTrigger(_state, triggerType, context || {});
  _queueDialogueScenes(scenes, onFinished);
}

function _queueDialogueScenes(scenes, onFinished) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    if (typeof onFinished === 'function') onFinished();
    return;
  }

  scenes.forEach(function (scene, index) {
    _dialogueQueue.push({
      scene: scene,
      onAfter: index === scenes.length - 1 ? onFinished : null,
    });
  });

  _drainDialogueQueue();
}

function _drainDialogueQueue() {
  if (_dialoguePlaying || _dialogueQueue.length === 0) return;

  var next = _dialogueQueue.shift();
  _dialoguePlaying = true;
  DialogueUI.showScene(next.scene, function (result) {
    Dialogue.finalizeScene(_state, next.scene && next.scene.id, result || {});
    _dialoguePlaying = false;
    if (typeof next.onAfter === 'function') next.onAfter();
    _drainDialogueQueue();
  });
}

function _queueQuestDialogueResult(result, onFinished) {
  if (!result) return;

  var scenes = [];
  var hasCompletedQuest = false;

  if (Array.isArray(result.completedQuests)) {
    result.completedQuests.forEach(function (entry) {
      if (!entry || entry.failed) return;
      hasCompletedQuest = true;
      scenes = scenes.concat(Dialogue.getScenesForTrigger(_state, 'quest_complete', {
        questId: entry.id,
        quest: entry.quest || null,
      }));
    });
  }

  if (result.phaseAdvanced && result.newPhase) {
    scenes = scenes.concat(Dialogue.getScenesForTrigger(_state, 'phase_unlock', {
      phaseId: result.newPhase.id,
      phase: result.newPhase,
    }));
  }

  _queueDialogueScenes(scenes, function () {
    if (hasCompletedQuest) {
      Tutorial.checkTrigger('complete_quest');
      _updateUI();
    }
    if (typeof onFinished === 'function') onFinished();
  });
}

// 设置管理已提取到 js/core/SettingsManager.js

function _showTutorialStartModal() {
  OnboardingUI.showTutorialStart({
    onStart: function () {
      Tutorial.start();
      _refreshActionGuide();
    },
    onSkip: function () {
      Tutorial.skip();
      _showWelcomeMessages();
      _updateUI();
    },
  });
  _refreshActionGuide();
}

function _showCompanyRenameModal() {
  OnboardingUI.showCompanyRename({
    currentName: _state.companyName || '',
    fallbackName: _state.companyName || '测试公司',
    onConfirm: function (name) {
      _state.companyName = name;
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
}



// ---------------------------------------------------------------------------
// 动作处理（所有状态变更入口）
// ---------------------------------------------------------------------------

function _dispatch(result) {
  // result = { ok, msgs, meta? }（TradeSystem 各函数的返回值）
  if (result && result.msgs) {
    result.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
  }
  if (result && result.ok === false) {
    EventBus.emit('audio:cue', { cue: 'error' });
  }
  // 成就检查（每次状态变更后）
  const achResult = Achievement.checkAll(_state);
  achResult.msgs.forEach(function (m) {
    EventBus.emit('log:message', { text: m.text, type: m.type });
  });
  _updateUI();
  if (result && result.ok) _checkVictory();
}

function _getNextGuidancePoi(systemId) {
  var planetData = systemId ? GalaxyData.getPlanetData(systemId) : null;
  var exploration = planetData && planetData.exploration;
  if (!exploration || !exploration.landed || !Array.isArray(exploration.pois)) return null;

  var priorityPoiId = exploration.scanPriorityPoiId || '';
  return exploration.pois.filter(function (poi) {
    return poi && poi.discovered && !poi.resolved;
  }).sort(function (left, right) {
    if (priorityPoiId) {
      if (left.id === priorityPoiId && right.id !== priorityPoiId) return -1;
      if (right.id === priorityPoiId && left.id !== priorityPoiId) return 1;
    }
    return 0;
  }).map(function (poi) {
    return {
      id: poi.id,
      poiId: poi.id,
      icon: poi.icon || '',
      name: poi.name || '探索点',
      chainKind: poi.chain && poi.chain.kind ? poi.chain.kind : '',
      chainLabel: poi.chain && poi.chain.label ? poi.chain.label : '',
    };
  })[0] || null;
}

function _getActiveShipDispatchContext() {
  var activeShip = Fleet.getActiveShip(_state);
  var activeShipStats = Fleet.getEffectiveShipStats(_state, activeShip);
  return {
    currentSystem: _state.currentSystem,
    currentGalaxy: _state.currentGalaxy || 'milky_way',
    fuelEfficiency: activeShipStats.fuelEff,
    cargoFree: Math.max(0, activeShipStats.maxCargo - Object.values((activeShip && activeShip.cargo) || {}).reduce(function (sum, qty) {
      return sum + qty;
    }, 0)),
    credits: _state.credits,
    playerLevel: _state.playerLevel || 1,
    dispatchProfile: activeShipStats.dispatchProfile || null,
  };
}

function _getActiveShipServiceStatus() {
  var activeShipIndex = _state && Number.isInteger(_state.activeShipIndex) ? _state.activeShipIndex : 0;
  var activeShip = Fleet.getActiveShip(_state);
  if (!activeShip) return null;
  var repairQuote = typeof Fleet.getShipRepairQuote === 'function'
    ? Fleet.getShipRepairQuote(_state, activeShipIndex)
    : null;
  var maintenance = typeof Fleet.getShipMaintenanceSummary === 'function'
    ? Fleet.getShipMaintenanceSummary(_state, activeShip)
    : null;
  var maxHull = Number(activeShip.maxHull || activeShip.hull || 0);
  var hull = Number(activeShip.hull || maxHull || 0);

  return {
    shipIndex: activeShipIndex,
    repairQuote: repairQuote,
    hullRatio: maxHull > 0 ? Math.max(0, Math.min(1, hull / maxHull)) : 1,
    maintenance: maintenance,
    maintenanceValue: maintenance ? maintenance.value : 100,
    maintenanceBand: maintenance ? maintenance.band : 'pristine',
  };
}

function _getActionGuideMarketFocus() {
  if (!MapUI.isMarketOpen()) return null;
  var focus = MarketUI.getActiveMarketWorkspaceFocus
    ? MarketUI.getActiveMarketWorkspaceFocus()
    : {};
  return Object.assign({}, focus || {}, {
    systemId: MapUI.getMarketViewSystem(_state) || (_state && _state.currentSystem) || '',
  });
}

function _refreshActionGuide() {
  if (!_state) return;
  var scanStatus = null;
  var landingStatus = null;
  var nextPoi = null;
  var nextPoiStatus = null;
  var tutorialActive = Tutorial.isActive();
  var blockingModalOpen = hasBlockingSurfaceOpen();
  var eventPending = EventUI.hasPendingEvent();
  var researchSupplyRoute = null;
  var researchBlocker = null;
  var dispatchRouteRecommendation = null;
  var serviceStatus = null;
  var modRecommendation = null;
  var recentModInstallContext = _recentModInstallContext;
  var surveyIntel = null;
  if (_state.currentSystem) {
    scanStatus = _getScanStatus(_state.currentSystem);
    landingStatus = _getLandingStatus(_state.currentSystem);
    nextPoi = _getNextGuidancePoi(_state.currentSystem);
    if (nextPoi) {
      nextPoiStatus = _getPoiStatus(_state.currentSystem, nextPoi.poiId);
    }
    surveyIntel = Exploration.getSurveyDecisionIntel(_state, _state.currentSystem);
  }
  if (!tutorialActive && !blockingModalOpen) {
    var dispatchContext = _getActiveShipDispatchContext();
    researchSupplyRoute = AutoTrade.findResearchSupplyRoute(_state, dispatchContext);
    if (!researchSupplyRoute && ResearchUI.getResearchDispatchBlockerState) {
      researchBlocker = ResearchUI.getResearchDispatchBlockerState(_state, dispatchContext);
    }
    if (!researchSupplyRoute) {
      dispatchRouteRecommendation = AutoTrade.findBestDispatchRoute(_state, dispatchContext);
    }
    serviceStatus = _getActiveShipServiceStatus();
    if (Fleet.getShipModRecommendation) {
      modRecommendation = Fleet.getShipModRecommendation(_state, _state.activeShipIndex || 0);
    }
  }
  ActionGuideUI.render(Guidance.getCurrentSuggestion(_state, {
    marketOpen: MapUI.isMarketOpen(),
    marketFocus: _getActionGuideMarketFocus(),
    scanStatus: scanStatus,
    landingStatus: landingStatus,
    nextPoi: nextPoi,
    nextPoiStatus: nextPoiStatus,
    researchSupplyRoute: researchSupplyRoute,
    researchBlocker: researchBlocker,
    dispatchRouteRecommendation: dispatchRouteRecommendation,
    serviceStatus: serviceStatus,
    modRecommendation: modRecommendation,
    modModalContext: FleetUI.getActiveModModalContext ? FleetUI.getActiveModModalContext() : null,
    dispatchModalContext: FleetUI.getActiveDispatchModalContext ? FleetUI.getActiveDispatchModalContext() : null,
    recentModInstallContext: recentModInstallContext,
    surveyIntel: surveyIntel,
    directiveSuggestion: CompanyDirectiveUI.getActionSuggestion
      ? CompanyDirectiveUI.getActionSuggestion(_state)
      : null,
    tutorialActive: tutorialActive,
    blockingModalOpen: blockingModalOpen,
    eventPending: eventPending,
  }));
  if (recentModInstallContext && _recentModInstallContext === recentModInstallContext) {
    _recentModInstallContext = null;
  }
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

  ActionGuideUI.showProcessing(suggestion, GuidanceAction.getProcessingMessage(suggestion));
  GuidanceAction.handleGuidanceAction(suggestion, {
    getState: function () { return _state; },
    prepareDirectExecution: _prepareDirectGuidanceExecution,
    acceptQuest: _handleAcceptQuest,
    selectAvailableQuest: QuestUI.setSelectedAvailableQuest,
    activateTab: MapUI.activateTab,
    updateUI: _updateUI,
    openTradeConfirmation: _openGuidanceTradeConfirmation,
    refuel: _handleRefuel,
    forcePendingEvent: EventUI.forcePendingEvent,
    refreshActionGuide: _refreshActionGuide,
    openRecommendedDispatch: _openRecommendedDispatch,
    openRecommendedMod: _openRecommendedMod,
    showCompletion: function (message, detail, options) {
      if (ActionGuideUI.showCompletion) ActionGuideUI.showCompletion(message, detail, options);
    },
    emitLog: function (message) {
      EventBus.emit('log:message', message);
    },
    openMarketPanel: MapUI.openMarketPanel,
    openMarketSystemPanel: MapUI.openMarketSystemPanel,
    revealMarketGoodFocus: MarketUI.revealMarketGoodFocus,
    revealSurveyChainFocus: MarketUI.revealSurveyChainFocus,
    acknowledgeSurveyChainFollowup: function (systemId, chainId) {
      return Exploration.acknowledgeChainFollowup(_state, systemId, chainId);
    },
    travel: _handleTravel,
    focusStarmap: MapUI.focusStarmap,
    focusNavigationTarget: MapUI.focusNavigationTarget,
    scanSystem: _handleScanSystem,
    landOnSystem: _handleLandOnSystem,
    explorePoi: _handleExplorePoi,
    claimCompanyDirectiveRewards: _handleCompanyDirectiveClaimAll,
  });
}

function _handleCompanyDirectiveAction(suggestion) {
  _handleActionGuideAction(suggestion);
}

function _handleCompanyDirectiveClaim(directiveId) {
  var result = CompanyDirective.claimCompanyDirectiveReward(_state, directiveId);
  _dispatch(result);
}

function _handleCompanyDirectiveClaimAll() {
  var result = CompanyDirective.claimAllCompanyDirectiveRewards(_state);
  _dispatch(result);
  return result;
}

function _getScanStatus(systemId) {
  var shipStats = Fleet.getEffectiveShipStats(_state, Fleet.getActiveShip(_state));
  return Exploration.getScanStatus(_state, systemId, {
    scanFuelDiscount: shipStats.scanFuelDiscount,
    forceDeepScan: shipStats.forceDeepScan,
  });
}

function _getLandingStatus(systemId) {
  var shipStats = Fleet.getEffectiveShipStats(_state, Fleet.getActiveShip(_state));
  return Exploration.getLandingStatus(_state, systemId, {
    landingFeeDiscount: shipStats.landingFeeDiscount,
  });
}

function _getPoiStatus(systemId, poiId) {
  var shipStats = Fleet.getEffectiveShipStats(_state, Fleet.getActiveShip(_state));
  return Exploration.getPoiStatus(_state, systemId, poiId, {
    poiRewardMultiplier: shipStats.poiRewardMultiplier,
  });
}

function _handleScanSystem(systemId, options) {
  var opts = options || {};
  Fleet.syncStateFromShip(_state);
  var shipStats = Fleet.getEffectiveShipStats(_state, Fleet.getActiveShip(_state));
  const result = Exploration.scanSystem(_state, systemId, {
    scanFuelDiscount: shipStats.scanFuelDiscount,
    forceDeepScan: shipStats.forceDeepScan,
  });
  if (result && result.ok) {
    Fleet.recordShipActivity(_state, 'scan', {}, _state.activeShipIndex).msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    Fleet.consumeShipProtocol(_state, _state.activeShipIndex, 'exploration').msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    Fleet.commitActiveShipState(_state);
    _state.galaxyStates = GalaxyData.getAllPlanetStates();
  }
  _dispatch(result);
  if (!opts.suppressReveal && result && result.ok && systemId === _state.currentSystem && MapUI.showCurrentSystemScanReveal) {
    MapUI.showCurrentSystemScanReveal(_state, systemId, result);
  }
  return result;
}

function _handleLandOnSystem(systemId) {
  Fleet.syncStateFromShip(_state);
  var shipStats = Fleet.getEffectiveShipStats(_state, Fleet.getActiveShip(_state));
  const result = Exploration.landOnSystem(_state, systemId, {
    landingFeeDiscount: shipStats.landingFeeDiscount,
  });
  if (result && result.ok) {
    Fleet.recordShipActivity(_state, 'land', {}, _state.activeShipIndex).msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    Fleet.consumeShipProtocol(_state, _state.activeShipIndex, 'exploration').msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    Fleet.commitActiveShipState(_state);
    _state.galaxyStates = GalaxyData.getAllPlanetStates();
  }
  _dispatch(result);
}

function _handleExplorePoi(systemId, poiId) {
  Fleet.syncStateFromShip(_state);
  var shipStats = Fleet.getEffectiveShipStats(_state, Fleet.getActiveShip(_state));
  const result = Exploration.explorePoi(_state, systemId, poiId, {
    poiRewardMultiplier: shipStats.poiRewardMultiplier,
  });
  if (result && result.ok) {
    Fleet.recordShipActivity(_state, 'poi', {}, _state.activeShipIndex).msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    Fleet.consumeShipProtocol(_state, _state.activeShipIndex, 'exploration').msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    Fleet.commitActiveShipState(_state);
    _state.galaxyStates = GalaxyData.getAllPlanetStates();
  }
  _dispatch(result);
}

function _handleTravel(systemId) {
  Fleet.syncStateFromShip(_state);
  var activeShip = Fleet.getActiveShip(_state);

  if (activeShip && activeShip.repairJob && activeShip.repairJob.remainingDays > 0) {
    EventBus.emit('log:message', {
      text: '🔧 当前飞船仍在维修中，剩余 ' + activeShip.repairJob.remainingDays + ' 天，完成前无法出航。',
      type: 'error',
    });
    return;
  }

  // 旅行前：如有待处理事件，强制弹出，阻止本次旅行
  if (EventUI.hasPendingEvent()) {
    EventUI.forcePendingEvent();
    EventBus.emit('log:message', { text: '⚠️ 请先处理当前事件再继续航行。', type: 'error' });
    return;
  }

  // 飞船飞行中不允许再次发起旅行，避免出现跳星球起飞
  if (Renderer3D.isActive() && Renderer3D.isShipFlying && Renderer3D.isShipFlying()) {
    EventBus.emit('log:message', { text: '🛰️ 飞船正在飞行中，请等待抵达后再发起下一次航行。', type: 'info' });
    return;
  }

  const previousSystem = _state.currentSystem;
  const result = Trade.travelTo(_state, systemId);
  _dispatch(result);

  if (result && result.ok) {
    EventBus.emit('audio:cue', { cue: 'travel' });
    Fleet.applyTravelWear(_state, _state.activeShipIndex, result.meta).msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });

    // 3D 飞船飞行动画（传入当前飞船类型）
    if (Renderer3D.isActive() && previousSystem) {
      var activeShipForFlight = Fleet.getActiveShip(_state);
      var shipTypeId = activeShipForFlight ? activeShipForFlight.typeId : 'shuttle';
      Renderer3D.flyShipTo(previousSystem, systemId, null, shipTypeId, {
        shipIndex: _state.activeShipIndex || 0,
        routeRevision: activeShipForFlight && activeShipForFlight.route
          ? (activeShipForFlight.routeRevision || 0)
          : null,
      });
    }

    // 跨星系旅行后刷新地图按钮
    if (result.meta && result.meta.crossGalaxy) {
      MapUI.refreshGalaxyBtn(_state);
    }
    // 刷新市场位置信息
    MapUI.refreshMarketLocation(_state);

    // 走私检查（入港时）
    var activeShipStats = Fleet.getEffectiveShipStats(_state, Fleet.getActiveShip(_state));
    var smuggleResult = Economy.checkSmugglingCargo(_state, _state.currentSystem, _state.cargo, {
      cargoCost: _state.cargoCost,
      applyHullDamage: function (damage) {
        _state.shipHull = Math.max(1, (_state.shipHull || 100) - damage);
      },
      checkChanceMultiplier: activeShipStats.smugglingCheckMultiplier || 1,
      fineMultiplier: activeShipStats.smugglingFineMultiplier || 1,
      hullDamageMultiplier: activeShipStats.smugglingHullMultiplier || 1,
    });
    smuggleResult.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    if (smuggleResult.caught) {
      var activeShipAfterCheck = Fleet.getActiveShip(_state);
      if (activeShipAfterCheck && activeShipAfterCheck.route && activeShipAfterCheck.route.marketMode === 'black') {
        Fleet.cancelActiveDispatch(_state);
        Dispatch.stopActiveDispatch();
        EventBus.emit('log:message', { text: '⏹️ 黑市自动派遣因走私被查获而中止。', type: 'error' });
      }
    }
    if (!smuggleResult.caught && smuggleResult.msgs.length === 0) {
      // 携带违禁品且未被检查 → 记录走私成功
      var hasContraband = Object.keys(_state.cargo).some(function (gid) {
        var g = GOODS.find(function (x) { return x.id === gid; });
        return g && g.legality === 'illegal' && _state.cargo[gid] > 0;
      });
      if (hasContraband) {
        Economy.recordSmugglingEvaded(_state);
        Fleet.recordShipActivity(_state, 'smuggling_evaded', {}, _state.activeShipIndex).msgs.forEach(function (m) {
          EventBus.emit('log:message', { text: m.text, type: m.type });
        });
      }
    }

    Fleet.recordShipActivity(_state, 'travel', {
      crossGalaxy: !!(result.meta && result.meta.crossGalaxy),
      secretRoute: !!(result.meta && result.meta.secretRoute),
    }, _state.activeShipIndex).msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });

    // 探索追踪：记录已访问的星球和星系
    if (!_state.visitedSystems) _state.visitedSystems = [];
    if (!_state.visitedGalaxies) _state.visitedGalaxies = [];
    if (_state.visitedSystems.indexOf(_state.currentSystem) === -1) {
      _state.visitedSystems.push(_state.currentSystem);
    }
    if (_state.visitedGalaxies.indexOf(_state.currentGalaxy) === -1) {
      _state.visitedGalaxies.push(_state.currentGalaxy);
    }
    if (!Tutorial.isActive()) {
      MapUI.triggerArrivalScanPanel(_state);
    }
    // 新手引导：旅行触发
    Tutorial.checkTrigger('travel');
    // 旅行经验 + 声望
    var expResult = Progression.gainExperience(_state, 5);
    expResult.msgs.forEach(function (m) { EventBus.emit('log:message', { text: m.text, type: m.type }); });
    var compExpResult = Progression.gainCompanyExperience(_state, 2);
    compExpResult.msgs.forEach(function (m) { EventBus.emit('log:message', { text: m.text, type: m.type }); });
    _state.reputation = (_state.reputation || 0) + 1;

    // 任务进度：旅行
    const travelFaction = Faction.getFactionForSystem(_state.currentSystem);
    const questResult = Quest.checkProgress(_state, {
      action: 'travel',
      systemId: _state.currentSystem,
      factionId: travelFaction ? travelFaction.id : null,
    });
    questResult.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    _queueQuestDialogueResult(questResult);

    // 自动修复（如果有科技）
    var totalAutoRepair = (_state.autoRepair || 0) + (activeShipStats.autoRepair || 0);
    if (totalAutoRepair > 0) {
      _state.shipHull = Math.min(_state.maxHull || 100, (_state.shipHull || 100) + totalAutoRepair);
    }

    // 随机事件触发（群星风格）——教程期间不触发
    // 使用非阻塞通知条代替立即弹窗，让玩家可以延后处理
    const baseEventChance = EVENT_CONFIG.baseChance * (activeShipStats.eventChanceMultiplier || 1);
    const event = Tutorial.isActive() ? null : RandomEvent.rollEvent(_state, baseEventChance);
    if (event) {
      EventBus.emit('audio:cue', { cue: 'event.alert' });
      EventUI.showEventNotification(event, function (choiceIndex) {
        _handleEventChoice(choiceIndex);
      });
      EventBus.emit('log:message', { text: '📢 遭遇事件：' + event.title + '！查看底部通知处理。', type: 'info' });
    }

    Fleet.consumeShipProtocol(_state, _state.activeShipIndex, 'travel').msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });

    // 自动存档
    Fleet.commitActiveShipState(_state);

    // 船队派遣贸易结算（每天一次）
    const fleetResult = Fleet.tickFleetRoutes(_state);
    fleetResult.msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });

    _state.galaxyStates = GalaxyData.getAllPlanetStates(); // 保存星系数据层状态
    Save.saveGame(0, _state, { isAutosave: true });

    _updateUI();
  }
}

function _handleEventChoice(choiceIndex) {
  const result = RandomEvent.resolveChoice(_state, choiceIndex);
  _dispatch(result);
}

/**
 * 跨星系跳转（点击其他星系星球时触发）
 */
function _handleGalaxyJump(systemId) {
  // 直接调用 travelTo，它会自动处理跨星系逻辑
  _handleTravel(systemId);
}

function _handleTradeConfirm(action, goodId, quantity, marketType) {
  Fleet.syncStateFromShip(_state);

  // 统一通过 CommerceFacade 处理公开市场与黑市交易
  const effectiveMarket = marketType === 'black' ? 'black' : 'open';
  const result = action === 'buy'
    ? Commerce.buyGood(_state, goodId, quantity, effectiveMarket)
    : Commerce.sellGood(_state, goodId, quantity, effectiveMarket);
  if (result && result.ok) {
    _returnToStarmapAfterTrade();
  }
  _dispatch(result);

  if (result && result.ok) {
    EventBus.emit('audio:cue', { cue: action === 'buy' ? 'trade.buy' : 'trade.sell' });
    Fleet.recordShipActivity(_state, action === 'buy' ? 'trade_buy' : 'trade_sell', {
      quantity: quantity,
      profit: result.meta && typeof result.meta.profit === 'number' ? result.meta.profit : 0,
    }, _state.activeShipIndex).msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    Fleet.consumeShipProtocol(_state, _state.activeShipIndex, 'trade').msgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    Fleet.commitActiveShipState(_state);
    var activeRoute = Fleet.getActiveShip(_state) ? Fleet.getActiveShip(_state).route : null;
    if (activeRoute && activeRoute.goodId === goodId) {
      if (action === 'buy') {
        activeRoute.lastBuyPrice = effectiveMarket === 'black'
          ? Economy.getBlackMarketBuyPrice(_state.currentSystem, goodId, _state)
          : Economy.getBuyPrice(_state.currentSystem, goodId, _state);
      } else if (action === 'sell') {
        activeRoute.lastBuyPrice = null;
      }
      activeRoute.lastPolicyMessage = null;
    }
    Tutorial.checkTrigger(action);

    const factionMsgs = Faction.onTrade(_state, _state.currentSystem, goodId, action, quantity);
    factionMsgs.forEach(function (m) {
      EventBus.emit('log:message', { text: m.text, type: m.type });
    });
    _state.tradeCount = (_state.tradeCount || 0) + 1;

    // 经验值 & 声望（黑市交易经验更高）
    const isBlack = effectiveMarket === 'black';
    const expGain = Math.max(1, Math.ceil(quantity * (isBlack ? 3 : 2)));
    const repGain = Math.max(1, Math.ceil(quantity * 0.5));
    var tradeExpResult = Progression.gainExperience(_state, expGain);
    tradeExpResult.msgs.forEach(function (m) { EventBus.emit('log:message', { text: m.text, type: m.type }); });
    if (!isBlack) {
      const profit = (result.meta && typeof result.meta.profit === 'number') ? result.meta.profit : 0;
      const companyExpGain = action === 'sell'
        ? Math.max(2, Math.ceil(quantity * 0.8) + Math.ceil(Math.max(0, profit) / 120))
        : Math.max(1, Math.ceil(quantity * 0.8));
      var tradeCompExpResult = Progression.gainCompanyExperience(_state, companyExpGain);
      tradeCompExpResult.msgs.forEach(function (m) { EventBus.emit('log:message', { text: m.text, type: m.type }); });

      // 任务进度：仅公开市场交易触发任务检查
      const tradeFaction = Faction.getFactionForSystem(_state.currentSystem);
      const tradeQuestResult = Quest.checkProgress(_state, {
        action: action,
        goodId: goodId,
        quantity: quantity,
        systemId: _state.currentSystem,
        factionId: tradeFaction ? tradeFaction.id : null,
        totalEarned: action === 'sell' ? (Economy.getSellPrice(_state.currentSystem, goodId, _state) * quantity) : 0,
      });
      tradeQuestResult.msgs.forEach(function (m) {
        EventBus.emit('log:message', { text: m.text, type: m.type });
      });
      _queueQuestDialogueResult(tradeQuestResult);
    }
    _state.reputation = (_state.reputation || 0) + repGain;

    _updateUI();
  }
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
  var result = Commerce.refuel(_state);
  _dispatch(result);
  if (result && result.ok) {
    _showActionGuideCompletion(getRefuelCompletion());
  }
}

function _handleOpenBuy(good) {
  Modal.openTradeModal('buy', good, _state);
}

function _handleOpenSell(good) {
  Modal.openTradeModal('sell', good, _state);
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
      MarketUI.showDetail(sysId, bmMode);
      MarketUI.render(_state, _handleOpenBuy, _handleOpenSell, _handleRefuel, sysId, bmMode, MapUI.getMarketViewGalaxy(_state), _handleBlackMarketBuy, _handleBlackMarketSell, _getMarketFinanceActions());
      _bindMarketModeButtons();
    });
  });
}

function _handleStartResearch(techId) {
  const result = Research.startResearch(_state, techId);
  _dispatch(result);
}

function _handleCancelQueuedResearch(techId) {
  const result = Research.cancelQueuedResearch(_state, techId);
  _dispatch(result);
}

function _handleMoveQueuedResearchUp(techId) {
  const result = Research.moveQueuedResearchUp(_state, techId);
  _dispatch(result);
}

function _handleMoveQueuedResearchDown(techId) {
  const result = Research.moveQueuedResearchDown(_state, techId);
  _dispatch(result);
}

function _handleClearResearchQueue() {
  const result = Research.clearResearchQueue(_state);
  _dispatch(result);
}

function _handleApplyResearchDispatch(recommendation) {
  _openRecommendedDispatch(recommendation, '科研补给建议', '🛰️');
}

function _handleOpenFactionMarket(action) {
  if (!action || action.actionId !== 'market') return;

  MapUI.openMarketSystemPanel(_state, action.systemId, {
    workspaceId: action.marketWorkspaceId,
    subworkspaceId: action.marketSubworkspaceId,
    marketMode: action.marketMode || '',
  });

  var factionName = action.factionName || '该派系';
  var factionNextStep = action.label === '查看黑市条件'
    ? '查看准入门槛与公开情报'
    : action.marketMode === 'black'
      ? '沿着' + factionName + '的地下通路继续找机会'
      : '观察' + factionName + '代表节点行情';

  EventBus.emit('log:message', {
    text: buildCommandFeedback(action, {
      icon: action.label === '查看黑市条件' ? '🔒' : (action.marketMode === 'black' ? '🕶' : '🏛'),
      destination: (action.systemName || '代表节点') + ' · ' + (action.marketFocusLabel || '市场页'),
      nextStep: factionNextStep,
      returnTo: '派系页继续调整关系策略',
    }),
    type: 'tip',
  });
}

function _handleResolveResearchBlocker(action) {
  if (!action || !action.actionId) return;

  if (action.actionId === 'quest-focus') {
    QuestUI.setSelectedAvailableQuest(action.targetQuestId);
    MapUI.activateTab('tab-quest');
    _updateUI();
    EventBus.emit('log:message', {
      text: buildCommandFeedback(action, {
        openedVerb: '已切到',
        destination: '任务页 · 替代任务',
        nextStep: '先推进「' + (action.targetQuestName || '推荐任务') + '」',
        returnTo: '科研页继续规划补给',
      }),
      type: 'tip',
    });
    return;
  }

  if (action.actionId === 'market') {
    MapUI.openMarketPanel(_state, {
      workspaceId: action.marketWorkspaceId,
      subworkspaceId: action.marketSubworkspaceId,
    });
    var researchMarketNextStep = action.reasonId === 'cargo'
      ? '清理货舱腾出科研补给舱位'
      : action.reasonId === 'credits'
        ? '做一笔周转补足科研资金'
        : action.reasonId === 'level'
          ? '补一轮升级节奏，扩大可达补给池'
          : '观察本地行情，等待稳定科研补给线';
    EventBus.emit('log:message', {
      text: buildCommandFeedback(action, {
        icon: action.reasonId === 'cargo' ? '📦' : (action.reasonId === 'credits' ? '💰' : (action.reasonId === 'level' ? '📈' : '📊')),
        destination: '当前市场 · ' + (action.marketFocusLabel || '市场页'),
        nextStep: researchMarketNextStep,
        returnTo: '科研页继续规划补给',
      }),
      type: 'tip',
    });
  }
}

function _handleApplyQuestDispatch(recommendation) {
  _openRecommendedDispatch(recommendation, '任务派遣建议', '📋');
}

function _handleResolveQuestBlocker(action) {
  if (!action || !action.actionId) return;

  if (action.actionId === 'quest-focus') {
    EventBus.emit('log:message', {
      text: buildCommandFeedback(action, {
        openedVerb: '已定位到',
        destination: '任务页 · 替代任务',
        nextStep: '先推进「' + (action.targetQuestName || '推荐任务') + '」补成长',
        returnTo: '任务页继续处理「' + (action.questName || '当前任务') + '」',
      }),
      type: 'tip',
    });
    return;
  }

  if (action.actionId === 'research') {
    MapUI.activateTab('tab-research');
    EventBus.emit('log:message', {
      text: buildCommandFeedback(action, {
        openedVerb: '已切到',
        destination: '科技页 · 跃迁科技',
        nextStep: '优先补出关键跃迁科技',
        returnTo: '任务页继续推进「' + (action.questName || '当前任务') + '」',
      }),
      type: 'tip',
    });
    return;
  }

  if (action.actionId === 'market') {
    MapUI.openMarketPanel(_state, {
      workspaceId: action.marketWorkspaceId,
      subworkspaceId: action.marketSubworkspaceId,
    });
    var questMarketNextStep = action.reasonId === 'fuel'
      ? '补足燃料或调整补给'
      : '跑几笔交易抬升等级';
    EventBus.emit('log:message', {
      text: buildCommandFeedback(action, {
        icon: action.reasonId === 'fuel' ? '⛽' : '💰',
        destination: '当前市场 · ' + (action.marketFocusLabel || '现货交易区'),
        nextStep: questMarketNextStep,
        returnTo: '任务页继续推进「' + (action.questName || '当前任务') + '」',
      }),
      type: 'tip',
    });
  }
}

function _openRecommendedDispatch(recommendation, sourceLabel, icon) {
  var activeShip = Fleet.getActiveShip(_state);
  var activeShipIndex = _state.activeShipIndex || 0;
  if (!activeShip || !recommendation) return;

  MapUI.activateTab('tab-fleet');
  FleetUI.openDispatchModal(_state, activeShipIndex, _handleAssignRoute, _handleCancelRoute, {
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
      returnTo: '确认“一键派遣”后执行路线',
    }),
    type: 'info',
  });
  _refreshActionGuide();
  _showActionGuideCompletion(getDispatchDraftCompletion());
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
  FleetUI.openModModal(
    _state,
    shipIndex,
    _handleInstallMod,
    _handleUninstallMod,
    _handleUpgradeShip,
    _handleServiceShip,
    _handleSellShip,
    { focusModId: data.modId || '' },
  );
  _refreshActionGuide();
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

function _handleBuildTradeStation(systemId) {
  const result = Commerce.buildTradeStation(_state, systemId);
  _dispatch(result);
}

function _handleUpgradeTradeStation(systemId) {
  const result = Commerce.upgradeTradeStation(_state, systemId);
  _dispatch(result);
}

function _handleHireTradeStationManager(systemId, managerId) {
  const result = Commerce.hireTradeStationManager(_state, systemId, managerId);
  _dispatch(result);
}

function _handleSetTradeStationStrategy(systemId, strategyId) {
  const result = Commerce.setTradeStationStrategy(_state, systemId, strategyId);
  _dispatch(result);
}

function _normalizeBatchSystemIds(systemIds) {
  if (Array.isArray(systemIds)) {
    return systemIds.filter(Boolean);
  }
  if (typeof systemIds === 'string') {
    return systemIds.split(',').map(function (entry) {
      return entry.trim();
    }).filter(Boolean);
  }
  return null;
}

function _handleBatchUpgradeTradeStations(systemIds) {
  const normalizedSystemIds = _normalizeBatchSystemIds(systemIds);
  const result = Commerce.batchUpgradeTradeStations(_state, normalizedSystemIds);
  _dispatch(result);
}

function _handleBatchHireTradeStationManager(managerId, systemIds) {
  const normalizedSystemIds = _normalizeBatchSystemIds(systemIds);
  const result = Commerce.batchHireTradeStationManager(_state, managerId, normalizedSystemIds);
  _dispatch(result);
}

function _handleBatchSetTradeStationStrategy(strategyId, systemIds) {
  const normalizedSystemIds = _normalizeBatchSystemIds(systemIds);
  const result = Commerce.batchSetTradeStationStrategy(_state, strategyId, normalizedSystemIds);
  _dispatch(result);
}

function _handleTakeLoan(offerId) {
  const result = Commerce.takeLoan(_state, offerId);
  _dispatch(result);
}

function _handleRepayLoan(loanId) {
  const result = Commerce.repayLoan(_state, loanId);
  _dispatch(result);
}

function _handleBuyStock(stockId) {
  const result = Commerce.buyStock(_state, stockId);
  _dispatch(result);
}

function _handleSellStock(stockId) {
  const result = Commerce.sellStock(_state, stockId);
  _dispatch(result);
}

function _handleInvestTradeStation(systemId) {
  const result = Commerce.investInTradeStation(_state, systemId);
  _dispatch(result);
}

function _handleBatchInvestTradeStations(systemIds, amount) {
  const normalizedSystemIds = _normalizeBatchSystemIds(systemIds);
  const targetSystemIds = normalizedSystemIds && normalizedSystemIds.length > 0
    ? normalizedSystemIds
    : Object.keys(_state.tradeStations || {});
  const result = Commerce.batchInvestInTradeStations(_state, targetSystemIds, amount);
  _dispatch(result);
}

function _handlePurchaseInsurance(policyType) {
  const result = Commerce.purchaseInsurance(_state, policyType);
  _dispatch(result);
}

function _handleSubmitInsuranceClaim(policyType) {
  const result = Commerce.submitInsuranceClaim(_state, policyType);
  _dispatch(result);
}

function _handleFuturesLong(goodId) {
  const result = Commerce.openFuturesLong(_state, goodId);
  _dispatch(result);
}

function _handleFuturesShort(goodId) {
  const result = Commerce.openFuturesShort(_state, goodId);
  _dispatch(result);
}

function _handleFuturesClose(contractId) {
  const result = Commerce.closeFutures(_state, contractId);
  _dispatch(result);
}

function _handleAcceptQuest(questId) {
  const result = Quest.acceptQuest(_state, questId);
  _dispatch(result);
  if (!result || !result.ok) return;

  const advanceTutorialQuestStep = function () {
    Tutorial.checkTrigger('accept_quest');
    _updateUI();
  };

  if (result.completedImmediately && result.completedQuest) {
    _queueQuestDialogueResult({
      completedQuests: [{ id: result.completedQuest.id, failed: false, quest: result.completedQuest }],
      phaseAdvanced: result.phaseAdvanced,
      newPhase: result.newPhase,
    }, advanceTutorialQuestStep);
    return;
  }

  if (result.quest) {
    _playTriggerDialogue('quest_accept', {
      questId: result.quest.id,
      quest: result.quest,
    }, advanceTutorialQuestStep);
    return;
  }

  advanceTutorialQuestStep();
}

function _handleAbandonQuest(questId) {
  const result = Quest.abandonQuest(_state, questId);
  _dispatch(result);
}

function _handleSaveGame(slotId) {
  Fleet.syncShipFromState(_state); // 保存前同步船只状态
  _state.economyCycle = Economy.getCycleState();
  _state.galaxyStates = GalaxyData.getAllPlanetStates(); // 保存星系数据层状态
  const result = Save.saveGame(slotId, _state);
  EventBus.emit('log:message', { text: result.msg, type: result.ok ? 'info' : 'error' });
  _updateUI();
}

function _handleLoadGame(slotId) {
  const result = Save.loadGame(slotId);
  if (result.ok) {
    Settings.hideSettingsModal();
    _state = result.state;
    _acknowledgedVictoryPathIds = new Set();
    _dialogueQueue = [];
    _dialoguePlaying = false;
    Dialogue.init(_state);
    DialogueUI.hideScene();
    RandomEvent.syncRuntimeState(_state);
    _settings.difficulty = _state.difficulty;
    Settings.saveSettings(_settings);
    // 重新初始化依赖状态的子系统
    Fleet.init(_state);
    Faction.init(_state);
    Research.init(_state);
    Quest.init(_state);
    Achievement.init(_state);
    TradeStation.init(_state);
    Finance.init(_state);
    GalaxyData.init(_state); // 重新初始化星系数据层
    if (_state.galaxyStates && Object.keys(_state.galaxyStates).length > 0) {
      GalaxyData.restorePlanetStates(_state.galaxyStates); // 恢复星系状态
    }
    Economy.init();
    Economy.setCycleState(_state.economyCycle);
    Renderer3D.resetRuntimeState(_state.currentSystem);
    MapUI.refreshGalaxyBtn(_state);
    // 恢复派遣状态
    Dispatch.stopActiveDispatch();
    if (Fleet.isActiveDispatched(_state)) {
      Dispatch.startActiveDispatch(_boundDispatchTick);
    }
    _resetRealtimeClock(performance.now());
    _updateUI();
    EventBus.emit('log:message', { text: result.msg, type: 'info' });
  } else {
    EventBus.emit('log:message', { text: result.msg, type: 'error' });
  }
}

// 等级进阶逻辑已提取到 js/systems/progression/ProgressionSystem.js

// ---------------------------------------------------------------------------
// 船队管理
// ---------------------------------------------------------------------------

function _handleBuyShip(shipTypeId) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.buyShip(_state, shipTypeId);
  _dispatch(result);
}

function _handleSwitchShip(shipIndex) {
  // 切换前停止激活船只的自动派遣
  Dispatch.stopActiveDispatch();
  Fleet.syncShipFromState(_state);
  const result = Fleet.switchShip(_state, shipIndex);
  if (result && result.ok) {
    _state.lastSwitchedShipIndex = shipIndex;
    _state.lastShipSwitchAt = Date.now();
  }
  _dispatch(result);
  // 如果新激活的船只已有路线，重新启动派遣
  if (result && result.ok && Fleet.isActiveDispatched(_state)) {
    Dispatch.startActiveDispatch(_boundDispatchTick);
  }
  if (result && result.ok) {
    _resetRealtimeClock(performance.now());
  }
}

function _handleUpgradeShip(shipIndex, upgradeId) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.upgradeShip(_state, upgradeId, shipIndex);
  _dispatch(result);
}

function _handleSetShipDoctrine(shipIndex, doctrineId) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.setShipDoctrine(_state, shipIndex, doctrineId);
  if (result && result.ok && shipIndex === (_state.activeShipIndex || 0)) {
    Fleet.syncStateFromShip(_state);
  }
  _dispatch(result);
}

function _handleActivateShipProtocol(shipIndex) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.activateShipProtocol(_state, shipIndex);
  if (result && result.ok && shipIndex === (_state.activeShipIndex || 0)) {
    Fleet.syncStateFromShip(_state);
  }
  _dispatch(result);
}

function _handleAssignRoute(shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) {
  Fleet.syncShipFromState(_state);
  var isActive = shipIndex === (_state.activeShipIndex || 0);
  const result = Fleet.assignRoute(_state, shipIndex, buySystemId, sellSystemId, goodId, tradePolicy);
  if (result && result.ok && isActive && Renderer3D.cancelShipFlight) {
    Renderer3D.cancelShipFlight();
  }
  _dispatch(result);
  // 如果是激活船只被派遣，启动自动派遣定时器
  if (result && result.ok && isActive) {
    Dispatch.startActiveDispatch(_boundDispatchTick);
  }
  if (result && result.ok) {
    var good = GOODS.find(function (item) { return item.id === goodId; });
    _showActionGuideCompletion(getDispatchConfirmedCompletion(good ? good.name : ''));
  }
  return result;
}

function _handleCancelRoute(shipIndex) {
  var isActive = shipIndex === (_state.activeShipIndex || 0);
  const result = Fleet.cancelRoute(_state, shipIndex);
  if (result && result.ok && isActive && Renderer3D.cancelShipFlight) {
    Renderer3D.cancelShipFlight();
  }
  _dispatch(result);
  // 如果是激活船只被召回，停止定时器
  if (isActive) {
    Dispatch.stopActiveDispatch();
  }
  return result;
}

function _handleBuySlot() {
  const result = Fleet.buySlot(_state);
  _dispatch(result);
}

function _handleSellShip(shipIndex) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.sellShip(_state, shipIndex);
  _dispatch(result);
}

function _handleInstallMod(shipIndex, modId) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.installMod(_state, modId, shipIndex);
  var installedMod = SHIP_MODS.find(function (mod) { return mod.id === modId; });
  if (result && result.ok) {
    _recentModInstallContext = {
      shipIndex: shipIndex != null ? shipIndex : (_state.activeShipIndex || 0),
      modId: modId,
    };
  }
  _dispatch(result);
  if (result && result.ok) {
    _showActionGuideCompletion(getModInstalledCompletion(installedMod ? installedMod.name : ''));
  }
}

function _handleUninstallMod(shipIndex, modId) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.uninstallMod(_state, modId, shipIndex);
  _dispatch(result);
}

function _handleServiceShip(shipIndex, tierId) {
  Fleet.syncShipFromState(_state);
  const result = Fleet.serviceShip(_state, shipIndex, tierId);
  _dispatch(result);
  if (result && result.ok) {
    _showActionGuideCompletion(getServiceScheduledCompletion());
  }
}

function _handleRecruitCrew(offerId) {
  const result = Crew.recruitCrew(_state, offerId, _state.currentSystem);
  _dispatch(result);
}

function _handleAssignCrew(shipIndex, crewId) {
  const result = Crew.assignCrewToShip(_state, crewId, shipIndex);
  if (result && result.ok && shipIndex === (_state.activeShipIndex || 0)) {
    Fleet.syncStateFromShip(_state);
  }
  _dispatch(result);
}

function _handleUnassignCrew(shipIndex, crewId) {
  const result = Crew.unassignCrewFromShip(_state, crewId, shipIndex);
  if (result && result.ok && shipIndex === (_state.activeShipIndex || 0)) {
    Fleet.syncStateFromShip(_state);
  }
  _dispatch(result);
}

function _handleDismissCrew(crewId) {
  var existingCrew = Crew.getCrewById(_state, crewId);
  var affectedShipIndex = existingCrew ? existingCrew.assignedShipIndex : null;
  const result = Crew.dismissCrew(_state, crewId);
  if (result && result.ok && affectedShipIndex === (_state.activeShipIndex || 0)) {
    Fleet.syncStateFromShip(_state);
  }
  _dispatch(result);
}

// ---------------------------------------------------------------------------
// 激活船只自动派遣 — 逻辑已提取到 js/core/DispatchController.js
// GameManager 仅保留 tick 回调的胶水逻辑
// ---------------------------------------------------------------------------

function _boundDispatchTick() {
  var tickResult = Dispatch.runActiveDispatchTick(_state, {
    isModalVisible: function (id) {
      var el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    },
    hasBlockingSurfaceOpen: function () {
      return hasBlockingSurfaceOpen('gameover-modal');
    },
  });

  // 处理日志
  tickResult.msgs.forEach(function (m) {
    EventBus.emit('log:message', { text: m.text, type: m.type });
  });

  switch (tickResult.action) {
    case 'stopped':
      Dispatch.stopActiveDispatch();
      _updateUI();
      break;
    case 'travel_need_refuel': {
      var refuelResult = Trade.refuel(_state);
      _dispatch(refuelResult);
      if (_state.fuel < tickResult.payload.fuelCost) {
        EventBus.emit('log:message', { text: '📡 派遣船只燃料不足，已召回。', type: 'error' });
        Fleet.cancelActiveDispatch(_state);
        Dispatch.stopActiveDispatch();
        _updateUI();
      } else {
        _handleTravel(tickResult.payload.systemId);
      }
      break;
    }
    case 'buy_need_refuel': {
      var preBuyRefuelResult = Trade.refuel(_state);
      _dispatch(preBuyRefuelResult);
      if (_state.fuel < tickResult.payload.fuelCost) {
        EventBus.emit('log:message', { text: '📡 派遣船只补给后仍无法完成下一段航程，已召回。', type: 'error' });
        Fleet.cancelActiveDispatch(_state);
        Dispatch.stopActiveDispatch();
        _updateUI();
      } else {
        _handleTradeConfirm('buy', tickResult.payload.goodId, tickResult.payload.quantity, tickResult.payload.marketType);
        var shipRefueled = Fleet.getActiveShip(_state);
        if (shipRefueled && shipRefueled.route) shipRefueled.route.status = 'traveling_sell';
        _updateUI();
      }
      break;
    }
    case 'travel':
      _handleTravel(tickResult.payload.systemId);
      break;
    case 'buy':
      _handleTradeConfirm('buy', tickResult.payload.goodId, tickResult.payload.quantity, tickResult.payload.marketType);
      // 转入前往卖出地状态
      var shipB = Fleet.getActiveShip(_state);
      if (shipB && shipB.route) shipB.route.status = 'traveling_sell';
      _updateUI();
      break;
    case 'sell':
      _handleTradeConfirm('sell', tickResult.payload.goodId, tickResult.payload.quantity, tickResult.payload.marketType);
      // 循环：重新前往买入地
      var shipS = Fleet.getActiveShip(_state);
      if (shipS && shipS.route) shipS.route.status = 'traveling_buy';
      _updateUI();
      break;
    // 'noop' — do nothing
  }
}

// ---------------------------------------------------------------------------
// UI 全量刷新
// ---------------------------------------------------------------------------

function _updateUI() {
  const netWorth = Trade.getNetWorth(_state);
  const activeShipDispatchContext = _getActiveShipDispatchContext();
  HUD.updateStats(_state, netWorth);
  HUD.updateCompanyName(_state);
  HUD.updateArchiveBadges(_state);
  CompanyDirectiveUI.render(_state);
  // 市场：根据当前模式刷新
  if (MapUI.isMarketOpen()) {
    var bmMode = _blackMarketMode ? 'black' : 'open';
    MarketUI.render(_state, _handleOpenBuy, _handleOpenSell, _handleRefuel, MapUI.getMarketViewSystem(_state), bmMode, MapUI.getMarketViewGalaxy(_state), _handleBlackMarketBuy, _handleBlackMarketSell, _getMarketFinanceActions());
    _bindMarketModeButtons();
  }
  ShipUI.renderShipStats(_state);
  ResearchUI.render(
    _state,
    _handleStartResearch,
    _handleCancelQueuedResearch,
    _handleMoveQueuedResearchUp,
    _handleMoveQueuedResearchDown,
    _handleClearResearchQueue,
    activeShipDispatchContext,
    _handleApplyResearchDispatch,
    _handleResolveResearchBlocker
  );
  FactionUI.render(_state, _handleOpenFactionMarket);
  QuestUI.render(_state, _handleAcceptQuest, _handleAbandonQuest, activeShipDispatchContext, _handleApplyQuestDispatch, _handleResolveQuestBlocker);
  AchievementUI.render(_state);
  FleetUI.render(_state, _handleBuyShip, _handleSwitchShip, _handleUpgradeShip, _handleAssignRoute, _handleCancelRoute, _handleBuySlot, _handleSellShip, _handleInstallMod, _handleUninstallMod, _handleServiceShip, _handleRecruitCrew, _handleAssignCrew, _handleUnassignCrew, _handleDismissCrew, _handleSetShipDoctrine, _handleActivateShipProtocol);
  FleetUI.renderShop(_state, _handleBuyShip);
  SaveUI.render(_handleSaveGame, _handleLoadGame);
  Renderer3D.invalidateScene();
  MapUI.refreshPlanetDetail(_state);
  Dispatch.updateActiveDispatchUI();
  _refreshActionGuide();


}

// ---------------------------------------------------------------------------
// 胜利检测
// ---------------------------------------------------------------------------

function _checkVictory() {
  const result = Victory.checkVictory(_state, _acknowledgedVictoryPathIds);
  if (!result.won) return;

  const path = result.path;
  const allProgress = Victory.getProgress(_state);

  const levelTitle = getLevel(_state.experience || 0).title;
  const stats = [
    { label: '银河历', value: '第 ' + _state.day + ' 天' },
    { label: '玩家等级', value: levelTitle },
    { label: '净资产', value: Math.floor(Trade.getNetWorth(_state)).toLocaleString() + ' 信用积分' },
    { label: '贸易次数', value: (_state.tradeCount || 0).toLocaleString() + ' 次' },
    { label: '已研究科技', value: (_state.researchedTechs || []).length + ' / 16 项' },
    { label: '完成任务', value: (_state.completedQuests || []).length + ' 个' },
    { label: '解锁成就', value: (_state.achievements || []).length + ' 个' },
    { label: '探索星球', value: (_state.visitedSystems || []).length + ' 颗' },
    { label: '探索星系', value: (_state.visitedGalaxies || []).length + ' / 8 个' },
  ];

  VictoryResultUI.showVictoryReport({
    path: path,
    stats: stats,
    progress: allProgress,
  });
}

function _resetRealtimeClock(nowMs) {
  _realtimeClock = GameTime.resetRealtimeClock(_realtimeClock, nowMs, _state ? _state.shipHull : 100);
}

function _isRealtimeClockPaused() {
  return !!(document.hidden || document.querySelector('.modal:not(.hidden)'));
}

function _applyRealtimeDayProgress(days) {
  var elapsedDays = Math.max(0, Number.isFinite(days) ? Math.floor(days) : 0);
  if (elapsedDays <= 0) return;

  var previousHull = _realtimeClock && Number.isFinite(_realtimeClock.lastHullSnapshot)
    ? _realtimeClock.lastHullSnapshot
    : (_state.shipHull || 100);
  var result = GameTime.advanceDays(_state, elapsedDays);

  result.questResults.forEach(function (questResult) {
    _queueQuestDialogueResult(questResult);
  });

  if ((_state.shipHull || 100) >= previousHull) {
    _state.daysWithoutDamage = (_state.daysWithoutDamage || 0) + elapsedDays;
  } else {
    _state.daysWithoutDamage = 0;
  }

  if (_realtimeClock) {
    _realtimeClock.lastHullSnapshot = _state.shipHull || 100;
  }

  _state.galaxyStates = GalaxyData.getAllPlanetStates();
  Save.saveGame(0, _state, { isAutosave: true });
  _dispatch(result);
}

function _updateRealtimeClock(ts) {
  if (!_state) return;
  if (_isRealtimeClockPaused()) {
    _resetRealtimeClock(ts);
    return;
  }

  if (!_realtimeClock) {
    _resetRealtimeClock(ts);
  }

  var tickResult = GameTime.consumeElapsedDays(_realtimeClock, ts, _getRealtimeDayDurationMs());
  if (tickResult.elapsedDays > 0) {
    _applyRealtimeDayProgress(tickResult.elapsedDays);
  }
}

function _getRealtimeDayDurationMs() {
  return Number.isFinite(_settings && _settings.realtimeDayDurationMs)
    ? _settings.realtimeDayDurationMs
    : TIME_CONFIG.realtimeDayDurationMs;
}

function _stopGameLoop() {
  if (_gameLoopFrameId == null) return;
  cancelAnimationFrame(_gameLoopFrameId);
  _gameLoopFrameId = null;
}

// ---------------------------------------------------------------------------
// 游戏主循环
// ---------------------------------------------------------------------------

function _startGameLoop() {
  _stopGameLoop();
  _startTime = performance.now();
  _resetRealtimeClock(_startTime);

  function loop(ts) {
    _updateRealtimeClock(ts);
    const mapView = MapUI.getMapView ? MapUI.getMapView() : 'planets';
    const galaxyId = MapUI.getCurrentGalaxyId ? MapUI.getCurrentGalaxyId() : 'milky_way';
    Renderer3D.render(_state, mapView, galaxyId);
    _gameLoopFrameId = requestAnimationFrame(loop);
  }

  loop(_startTime);
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function _deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
