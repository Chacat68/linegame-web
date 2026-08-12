// js/core/GameManager.js — 游戏主控制器
// 依赖：所有 systems/、ui/ 模块
// 导出：init
//
// 职责：持有唯一 _state，编排各子系统，处理所有玩家动作，
//       每次状态变更后调用 _updateUI 同步视图。

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
import { SHIP_MODS } from '../data/ships.js';
import {
  getDispatchConfirmedCompletion,
  getDispatchDraftCompletion,
  getModInstalledCompletion,
  getRefuelCompletion,
  getRemoteMarketFocusCompletion,
  getServiceScheduledCompletion,
} from './ActionGuideCompletion.js';
import * as Settings from './SettingsCore.js';
import * as Audio from './AudioManager.js';
import * as Progression from '../systems/progression/ProgressionSystem.js';
import * as Guidance from '../systems/guidance/GuidanceSystem.js';
import * as MidgameTeachingChain from '../systems/guidance/MidgameTeachingChain.js';
import { getProcessingMessage as getGuidanceActionProcessingMessage } from './GuidanceActionFeedback.js';
import * as Dispatch from './DispatchController.js';
import { createDeferredFeatureLoader, loadDeferredStylesheet } from './DeferredFeatureLoader.js';
import { createStateSession } from './StateSession.js';
import { createGameSystemRuntime } from './GameSystemRuntime.js';
import { createGameUiCoordinator } from '../ui/GameUiCoordinator.js';
import { hasBlockingSurfaceOpen, hideBlockingSurface, showBlockingSurface } from '../ui/SurfaceManager.js';

const _session = createStateSession();
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
let _runtimeRevision = 0;
let _realtimeClock = null;
let _recentModInstallContext = null;
let _gameLoopFrameId = null;
let _acknowledgedVictoryPathIds = new Set();
let _pendingQuestSelectionId = null;
let _victoryResultUiModule = null;
let _victoryResultUiPromise = null;
let _victoryResultUiInitialized = false;
let _pendingVictoryReportPathId = null;
let _dialogueRuntime = null;
let _dialogueRuntimePromise = null;
let _randomEventModule = null;
let _randomEventPromise = null;
let _randomEventRollQueue = Promise.resolve();
let _onboardingUiModule = null;
let _onboardingUiPromise = null;
let _tutorialUiModule = null;
let _tutorialUiPromise = null;
let _settingsUiModule = null;
let _settingsUiPromise = null;
let _settingsLauncherButton = null;
let _settingsLauncherHandler = null;
let _guidanceActionModule = null;
let _guidanceActionPromise = null;
let _commerceRuntimeModule = null;
let _commerceRuntimePromise = null;
let _commerceRuntimeError = false;
let _advancedGuidanceModule = null;
let _advancedGuidancePromise = null;
let _routeGuidanceModule = null;
let _routeGuidancePromise = null;
let _achievementModule = null;
let _achievementPromise = null;
let _achievementCheckQueued = false;
const _fleetStylesUrl = new URL('../../css/fleet.css', import.meta.url).href;
const _hangarTerminalStylesUrl = new URL('../../css/hangar-terminal.css', import.meta.url).href;
const _archiveTerminalStylesUrl = new URL('../../css/archive-terminal.css', import.meta.url).href;
const _marketTerminalStylesUrl = new URL('../../css/market-terminal.css?v=20260717-marketchart1', import.meta.url).href;
const _deferredFeatures = createDeferredFeatureLoader();
let _deferredFeaturesConfigured = false;
let _uiCoordinator = null;
let _systemRuntime = null;

function _replaceState(nextState, reason) {
  _session.replace(nextState, { reason: reason });
  _state = _session.getState();
  _runtimeRevision = _session.getRevision();
  return _state;
}

function _resetSessionTransients() {
  _blackMarketMode = false;
  _pendingQuestSelectionId = null;
  _recentModInstallContext = null;
  _pendingVictoryReportPathId = null;
  _achievementCheckQueued = false;
  _realtimeClock = null;
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

function _hasOwnEntries(value) {
  return !!(value && typeof value === 'object' && Object.keys(value).length > 0);
}

function _shouldLoadAdvancedCommerce(state) {
  if (!state) return false;
  if (Number(state.companyLevel || 1) >= 2) return true;
  if (_hasOwnEntries(state.tradeStations) || _hasOwnEntries(state.stockPortfolio) || _hasOwnEntries(state.tradeInvestments)) return true;
  if (Array.isArray(state.loans) && state.loans.length > 0) return true;
  if (Array.isArray(state.futuresContracts) && state.futuresContracts.length > 0) return true;
  if (_hasOwnEntries(state.insurancePolicies)) return true;
  return Array.isArray(state.insuranceClaims) && state.insuranceClaims.length > 0;
}

function _shouldLoadRouteGuidance(state) {
  if (!state) return false;
  if (Number(state.companyLevel || 1) >= 2 || Number(state.playerLevel || 1) >= 2) return true;
  if (Array.isArray(state.completedQuests) && state.completedQuests.indexOf('starter_first_trade') !== -1) return true;
  if (Array.isArray(state.researchQueue) && state.researchQueue.length > 0) return true;
  return !!(state.activeResearch || state.currentResearch);
}

function _initializeCommerceRuntime(CommerceRuntime) {
  if (!CommerceRuntime || !_state) return;
  CommerceRuntime.init(_state);
  GameTime.setAdvancedDayProcessor(CommerceRuntime.advanceDay);
}

function _loadCommerceRuntime() {
  if (_commerceRuntimeModule) {
    _initializeCommerceRuntime(_commerceRuntimeModule);
    return Promise.resolve(_commerceRuntimeModule);
  }
  if (_commerceRuntimeError) return Promise.resolve(null);
  if (!_commerceRuntimePromise) {
    _setDeferredUiState('commerceRuntime', 'loading');
    _commerceRuntimePromise = import('../systems/commerce/CommerceFacade.js')
      .then(function (module) {
        _commerceRuntimeModule = module;
        _commerceRuntimeError = false;
        _initializeCommerceRuntime(module);
        _setDeferredUiState('commerceRuntime', 'ready');
        return module;
      })
      .catch(function (error) {
        _commerceRuntimePromise = null;
        _commerceRuntimeError = true;
        _setDeferredUiState('commerceRuntime', 'error');
        _reportDeferredUiFailure('commerceRuntime', error);
        return null;
      });
  }
  return _commerceRuntimePromise;
}

function _loadAdvancedGuidance() {
  if (_advancedGuidanceModule) return Promise.resolve(_advancedGuidanceModule);
  if (!_advancedGuidancePromise) {
    _setDeferredUiState('advancedGuidance', 'loading');
    _advancedGuidancePromise = Promise.all([
      import('../systems/guidance/AdvancedGuidanceSystem.js'),
      _loadCommerceRuntime(),
    ])
      .then(function (modules) {
        _advancedGuidanceModule = modules[0];
        Guidance.setAdvancedGuidanceProvider(_advancedGuidanceModule.getAdvancedGuidanceSuggestions);
        _setDeferredUiState('advancedGuidance', 'ready');
        return _advancedGuidanceModule;
      })
      .catch(function (error) {
        _advancedGuidancePromise = null;
        _setDeferredUiState('advancedGuidance', 'error');
        _reportDeferredUiFailure('advancedGuidance', error);
        return null;
      });
  }
  return _advancedGuidancePromise;
}

function _loadRouteGuidance() {
  if (_routeGuidanceModule) return Promise.resolve(_routeGuidanceModule);
  if (!_routeGuidancePromise) {
    _setDeferredUiState('routeGuidance', 'loading');
    _routeGuidancePromise = import('../systems/trade/AutoTradeSystem.js')
      .then(function (module) {
        _routeGuidanceModule = module;
        Dispatch.setQuestRouteResolver(module.findQuestRoute);
        _setDeferredUiState('routeGuidance', 'ready');
        return module;
      })
      .catch(function (error) {
        _routeGuidancePromise = null;
        _setDeferredUiState('routeGuidance', 'error');
        _reportDeferredUiFailure('routeGuidance', error);
        return null;
      });
  }
  return _routeGuidancePromise;
}

function _syncDeferredBusinessRuntimes() {
  _setDeferredUiState('commerceRuntime', _commerceRuntimeModule ? 'ready' : (_commerceRuntimePromise ? 'loading' : (_commerceRuntimeError ? 'error' : 'idle')));
  _setDeferredUiState('advancedGuidance', _advancedGuidanceModule ? 'ready' : (_advancedGuidancePromise ? 'loading' : 'idle'));
  _setDeferredUiState('routeGuidance', _routeGuidanceModule ? 'ready' : (_routeGuidancePromise ? 'loading' : 'idle'));
  if (_commerceRuntimeModule) _initializeCommerceRuntime(_commerceRuntimeModule);
  if (_advancedGuidanceModule) {
    Guidance.setAdvancedGuidanceProvider(_advancedGuidanceModule.getAdvancedGuidanceSuggestions);
  }
  if (_routeGuidanceModule) Dispatch.setQuestRouteResolver(_routeGuidanceModule.findQuestRoute);
  if (_shouldLoadAdvancedCommerce(_state) && !_advancedGuidanceModule) _loadAdvancedGuidance();
  if (_shouldLoadRouteGuidance(_state) && !_routeGuidanceModule) _loadRouteGuidance();
}

function _configureDeferredFeatures() {
  if (_deferredFeaturesConfigured) return;
  _deferredFeaturesConfigured = true;

  _deferredFeatures
    .define('market', {
      load: function () {
        return Promise.all([
          import('../ui/MarketUI.js'),
          _loadCommerceRuntime(),
          loadDeferredStylesheet('market-terminal', _marketTerminalStylesUrl),
        ]).then(function (results) { return results[0]; });
      },
      onError: function (error) { _reportDeferredUiFailure('market', error); },
    })
    .define('fleet', {
      load: function () {
        return Promise.all([
          import('../ui/FleetUI.js'),
          loadDeferredStylesheet('fleet-base', _fleetStylesUrl),
          loadDeferredStylesheet('hangar-terminal', _hangarTerminalStylesUrl),
        ]).then(function (results) { return results[0]; });
      },
      onError: function (error) { _reportDeferredUiFailure('fleet', error); },
    })
    .define('archive', {
      load: function () {
        return Promise.all([
          import('../ui/QuestUI.js'),
          import('../ui/ArchiveExplorationUI.js'),
          import('../ui/ResearchUI.js'),
          import('../ui/FactionUI.js'),
          import('../ui/AchievementUI.js'),
          _loadAchievementSystem(),
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
    })
    .define('save', {
      load: function () { return import('../ui/SaveUI.js'); },
      onError: function (error) { _reportDeferredUiFailure('save', error); },
    });
}

function _getDeferredFeature(feature) {
  _configureDeferredFeatures();
  return _deferredFeatures.get(feature);
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
  if (_achievementModule) return Promise.resolve(_achievementModule);
  if (!_achievementPromise) {
    var sessionToken = _getSessionToken();
    _setDeferredUiState('achievement', 'loading');
    _achievementPromise = import('../systems/achievement/AchievementSystem.js')
      .then(function (module) {
        _achievementModule = module;
        if (_isSessionTokenCurrent(sessionToken) && _state) _achievementModule.init(_state);
        _setDeferredUiState('achievement', 'ready');
        return module;
      })
      .catch(function (error) {
        _achievementPromise = null;
        _achievementCheckQueued = false;
        _setDeferredUiState('achievement', 'error');
        _reportDeferredUiFailure('achievement', error);
        return null;
      });
  }
  return _achievementPromise;
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
      _checkVictory();
    }
  });
}

function _loadArchiveUI() {
  _configureDeferredFeatures();
  return _deferredFeatures.load('archive');
}

function _loadVictoryResultUI() {
  if (_victoryResultUiModule) return Promise.resolve(_victoryResultUiModule);
  if (!_victoryResultUiPromise) {
    _victoryResultUiPromise = import('../ui/VictoryResultUI.js')
      .then(function (module) {
        _victoryResultUiModule = module;
        return module;
      })
      .catch(function (error) {
        _victoryResultUiPromise = null;
        _pendingVictoryReportPathId = null;
        _reportDeferredUiFailure('victory', error);
        return null;
      });
  }
  return _victoryResultUiPromise;
}

function _ensureStoryState(state) {
  if (!state || typeof state !== 'object') return;
  if (!state.storyFlags || typeof state.storyFlags !== 'object' || Array.isArray(state.storyFlags)) {
    state.storyFlags = {};
  }
  if (!state.storyDecisions || typeof state.storyDecisions !== 'object' || Array.isArray(state.storyDecisions)) {
    state.storyDecisions = {};
  }
}

function _initializeDialogueRuntime(runtime, state, hideScene) {
  if (!runtime || !state) return;
  runtime.Dialogue.init(state);
  runtime.DialogueUI.init();
  if (hideScene) runtime.DialogueUI.hideScene();
}

function _loadDialogueRuntime() {
  if (_dialogueRuntime) return Promise.resolve(_dialogueRuntime);
  if (!_dialogueRuntimePromise) {
    _setDeferredUiState('dialogue', 'loading');
    _dialogueRuntimePromise = Promise.all([
      import('../systems/story/DialogueSystem.js'),
      import('../ui/DialogueUI.js'),
    ])
      .then(function (modules) {
        _dialogueRuntime = {
          Dialogue: modules[0],
          DialogueUI: modules[1],
        };
        if (_state) _initializeDialogueRuntime(_dialogueRuntime, _state, false);
        _setDeferredUiState('dialogue', 'ready');
        return _dialogueRuntime;
      })
      .catch(function (error) {
        _dialogueRuntimePromise = null;
        _setDeferredUiState('dialogue', 'error');
        _reportDeferredUiFailure('dialogue', error);
        return null;
      });
  }
  return _dialogueRuntimePromise;
}

function _resetDialogueRuntime(state) {
  _dialogueQueue = [];
  _dialoguePlaying = false;
  _ensureStoryState(state);
  if (_dialogueRuntime) _initializeDialogueRuntime(_dialogueRuntime, state, true);
  _setDeferredUiState('dialogue', _dialogueRuntime ? 'ready' : (_dialogueRuntimePromise ? 'loading' : 'idle'));
}

function _resetRandomEventState(state) {
  if (!state || typeof state !== 'object') return;
  state._eventCooldowns = {};
  state._eventHistory = [];
  state._activeEventId = '';
  state._tripsSinceLastEvent = 999;
}

function _loadRandomEventSystem() {
  if (_randomEventModule) return Promise.resolve(_randomEventModule);
  if (!_randomEventPromise) {
    _setDeferredUiState('randomEvent', 'loading');
    _randomEventPromise = import('../systems/event/RandomEvent.js')
      .then(function (module) {
        _randomEventModule = module;
        if (_state) _randomEventModule.syncRuntimeState(_state);
        _setDeferredUiState('randomEvent', 'ready');
        return _randomEventModule;
      })
      .catch(function (error) {
        _randomEventPromise = null;
        _setDeferredUiState('randomEvent', 'error');
        _reportDeferredUiFailure('randomEvent', error);
        return null;
      });
  }
  return _randomEventPromise;
}

function _resetRandomEventRuntime(state) {
  if (_randomEventModule) _randomEventModule.resetRuntimeState(state);
  else _resetRandomEventState(state);
  _randomEventRollQueue = Promise.resolve();
  _setDeferredUiState('randomEvent', _randomEventModule ? 'ready' : (_randomEventPromise ? 'loading' : 'idle'));
}

function _syncRandomEventRuntime(state) {
  if (_randomEventModule) _randomEventModule.syncRuntimeState(state);
  _setDeferredUiState('randomEvent', _randomEventModule ? 'ready' : (_randomEventPromise ? 'loading' : 'idle'));
}

function _restorePendingEventNotification(state) {
  if (!state || !state._activeEventId) return Promise.resolve(null);
  var requestedState = state;
  var requestedRevision = _runtimeRevision;
  return _loadRandomEventSystem().then(function (RandomEvent) {
    if (!RandomEvent || requestedState !== _state || requestedRevision !== _runtimeRevision) return null;
    RandomEvent.syncRuntimeState(requestedState);
    var event = RandomEvent.getActiveEvent();
    if (!event) return null;
    EventUI.showEventNotification(event, function (choiceIndex) {
      _handleEventChoice(choiceIndex);
    });
    return event;
  });
}

function _loadOnboardingUI() {
  if (_onboardingUiModule) return Promise.resolve(_onboardingUiModule);
  if (!_onboardingUiPromise) {
    _setDeferredUiState('onboarding', 'loading');
    _onboardingUiPromise = import('../ui/OnboardingUI.js')
      .then(function (module) {
        _onboardingUiModule = module;
        _setDeferredUiState('onboarding', 'ready');
        return module;
      })
      .catch(function (error) {
        _onboardingUiPromise = null;
        _setDeferredUiState('onboarding', 'error');
        _reportDeferredUiFailure('onboarding', error);
        return null;
      });
  }
  return _onboardingUiPromise;
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
  if (_tutorialUiModule) {
    _initializeTutorialUI(_tutorialUiModule);
    return Promise.resolve(_tutorialUiModule);
  }
  if (!_tutorialUiPromise) {
    _setDeferredUiState('tutorial', 'loading');
    _tutorialUiPromise = import('../ui/TutorialUI.js')
      .then(function (module) {
        _tutorialUiModule = module;
        _initializeTutorialUI(_tutorialUiModule);
        _setDeferredUiState('tutorial', 'ready');
        return module;
      })
      .catch(function (error) {
        _tutorialUiPromise = null;
        _setDeferredUiState('tutorial', 'error');
        _reportDeferredUiFailure('tutorial', error);
        return null;
      });
  }
  return _tutorialUiPromise;
}

function _releaseSettingsLauncher() {
  if (_settingsLauncherButton && _settingsLauncherHandler && _settingsLauncherButton.removeEventListener) {
    _settingsLauncherButton.removeEventListener('click', _settingsLauncherHandler);
  }
  if (_settingsLauncherButton && _settingsLauncherButton.dataset) {
    delete _settingsLauncherButton.dataset.settingsLoaderBound;
  }
  _settingsLauncherButton = null;
  _settingsLauncherHandler = null;
}

function _initializeSettingsUI(SettingsUI) {
  if (!SettingsUI) return;
  _releaseSettingsLauncher();
  SettingsUI.initSettingsModal({
    settings: _settings,
    Renderer: Renderer3D,
    getState: function () { return _state; },
    onOpen: function () {
      _ensureSaveUiRendered();
    },
    onDifficultyChanged: function (nextDifficulty) {
      if (!DIFFICULTY_LEVELS[nextDifficulty]) return;
      _state.difficulty = nextDifficulty;
      _settings.difficulty = nextDifficulty;
      _updateUI();
    },
    onRealtimeDayDurationChanged: function (nextDurationMs) {
      _settings.realtimeDayDurationMs = nextDurationMs;
      _resetRealtimeClock(performance.now());
      if (Dispatch.isRunning()) _startActiveDispatchClock();
    },
    onResetTutorial: function () {
      _hideSettingsModal();
      _restartSession('settings-tutorial-reset');
    },
    onClearSaves: function () {
      for (var slotId = 0; slotId < 4; slotId++) Save.deleteSlot(slotId);
      EventBus.emit('log:message', { text: '🗑 本地存档已全部清空。', type: 'info' });
      _updateUI();
    },
  });
}

function _loadSettingsUI() {
  if (_settingsUiModule) return Promise.resolve(_settingsUiModule);
  if (!_settingsUiPromise) {
    _setDeferredUiState('settings', 'loading');
    _settingsUiPromise = import('./SettingsManager.js')
      .then(function (module) {
        _settingsUiModule = module;
        _setDeferredUiState('settings', 'ready');
        return module;
      })
      .catch(function (error) {
        _settingsUiPromise = null;
        _setDeferredUiState('settings', 'error');
        _reportDeferredUiFailure('settings', error);
        return null;
      });
  }
  return _settingsUiPromise;
}

function _hideSettingsModal() {
  if (_settingsUiModule && _settingsUiModule.hideSettingsModal) {
    _settingsUiModule.hideSettingsModal();
    return;
  }
  hideBlockingSurface('settings-modal');
}

function _bindSettingsLauncher() {
  _setDeferredUiState('settings', _settingsUiModule ? 'ready' : (_settingsUiPromise ? 'loading' : 'idle'));
  if (_settingsUiModule) {
    _initializeSettingsUI(_settingsUiModule);
    return;
  }
  var button = document.getElementById('settings-btn');
  if (!button || !button.addEventListener || button.dataset.settingsLoaderBound === 'true') return;

  _settingsLauncherButton = button;
  _settingsLauncherHandler = function (event) {
    if (event && event.preventDefault) event.preventDefault();
    var requestedRevision = _runtimeRevision;
    _loadSettingsUI().then(function (SettingsUI) {
      if (!SettingsUI || requestedRevision !== _runtimeRevision) return;
      _initializeSettingsUI(SettingsUI);
      _ensureSaveUiRendered();
      SettingsUI.showSettingsModal();
    });
  };
  button.dataset.settingsLoaderBound = 'true';
  button.addEventListener('click', _settingsLauncherHandler);
}

function _loadGuidanceActionController() {
  if (_guidanceActionModule) return Promise.resolve(_guidanceActionModule);
  if (!_guidanceActionPromise) {
    _setDeferredUiState('guidanceAction', 'loading');
    _guidanceActionPromise = import('./GuidanceActionController.js')
      .then(function (module) {
        _guidanceActionModule = module;
        _setDeferredUiState('guidanceAction', 'ready');
        return module;
      })
      .catch(function (error) {
        _guidanceActionPromise = null;
        _setDeferredUiState('guidanceAction', 'error');
        _reportDeferredUiFailure('guidanceAction', error);
        return null;
      });
  }
  return _guidanceActionPromise;
}

function _getMarketFinanceActions() {
  return {
    onTakeLoan: _handleTakeLoan,
    onRepayLoan: _handleRepayLoan,
    onInvestTradeStation: _handleInvestTradeStation,
    onRedeemTradeStationInvestment: _handleRedeemTradeStationInvestment,
    onBatchInvestTradeStations: _handleBatchInvestTradeStations,
    onBuildTradeStation: _handleBuildTradeStation,
    onUpgradeTradeStation: _handleUpgradeTradeStation,
    onSetTradeStationStrategy: _handleSetTradeStationStrategy,
    onBatchUpgradeTradeStations: _handleBatchUpgradeTradeStations,
    onBatchSetTradeStationStrategy: _handleBatchSetTradeStationStrategy,
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
    },
    hooks: {
      ensureAchievementState: _ensureAchievementState,
      initializeAchievement: function (state) {
        if (_achievementModule) _achievementModule.init(state);
        _setDeferredUiState('achievement', _achievementModule ? 'ready' : (_achievementPromise ? 'loading' : 'idle'));
      },
      syncDeferredBusiness: function () {
        _syncDeferredBusinessRuntimes();
      },
    },
  });
  return _systemRuntime;
}

function _getUiCoordinator() {
  if (_uiCoordinator) return _uiCoordinator;
  _configureDeferredFeatures();
  _uiCoordinator = createGameUiCoordinator({
    getState: function () { return _state; },
    features: _deferredFeatures,
    ui: {
      HUD: HUD,
      ShipUI: ShipUI,
      MapUI: MapUI,
      Renderer3D: Renderer3D,
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
      fleet: {
        onBuyShip: _handleBuyShip,
        onSwitchShip: _handleSwitchShip,
        onUpgradeShip: _handleUpgradeShip,
        onAssignRoute: _handleAssignRoute,
        onCancelRoute: _handleCancelRoute,
        onBuySlot: _handleBuySlot,
        onSellShip: _handleSellShip,
        onInstallMod: _handleInstallMod,
        onUninstallMod: _handleUninstallMod,
        onServiceShip: _handleServiceShip,
        onRecruitCrew: _handleRecruitCrew,
        onAssignCrew: _handleAssignCrew,
        onUnassignCrew: _handleUnassignCrew,
        onDismissCrew: _handleDismissCrew,
      },
      archive: {
        getDispatchContext: _getActiveShipDispatchContext,
        onStartResearch: _handleStartResearch,
        onCancelQueuedResearch: _handleCancelQueuedResearch,
        onMoveQueuedResearchUp: _handleMoveQueuedResearchUp,
        onMoveQueuedResearchDown: _handleMoveQueuedResearchDown,
        onClearResearchQueue: _handleClearResearchQueue,
        onApplyResearchDispatch: _handleApplyResearchDispatch,
        onResolveResearchBlocker: _handleResolveResearchBlocker,
        onOpenFactionMarket: _handleOpenFactionMarket,
        onAcceptQuest: _handleAcceptQuest,
        onAbandonQuest: _handleAbandonQuest,
        onApplyQuestDispatch: _handleApplyQuestDispatch,
        onResolveQuestBlocker: _handleResolveQuestBlocker,
      },
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

function _initializeVictoryResultUI(VictoryResultUI) {
  if (!VictoryResultUI || _victoryResultUiInitialized) return;
  VictoryResultUI.init({
    onContinue: function (pathId) {
      if (pathId) _acknowledgedVictoryPathIds.add(pathId);
      _pendingVictoryReportPathId = null;
      EventBus.emit('log:message', {
        text: '胜利结算已归档，当前公司继续经营。',
        type: 'info',
      });
      _refreshActionGuide();
    },
    onRestart: function () {
      _restartSession('victory-restart');
    },
  });
  _victoryResultUiInitialized = true;
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
  _stopGameLoop();
  Dispatch.stopActiveDispatch();   // 重启时停止派遣
  _settings = Settings.loadSettings();
  var startup = resolveStartupState(difficulty, _settings, options);
  var restoredAutosave = startup.restoredAutosave;
  _resetSessionTransients();
  _replaceState(startup.state, restoredAutosave ? 'restore-autosave' : 'new-game');
  Audio.init(_settings);
  _acknowledgedVictoryPathIds = new Set();
  _pendingVictoryReportPathId = null;
  _resetDialogueRuntime(_state);
  if (restoredAutosave) _syncRandomEventRuntime(_state);
  else _resetRandomEventRuntime(_state);
  EventUI.hidePendingNotification();

  if (restoredAutosave) {
    _settings.difficulty = _state.difficulty;
    Settings.saveSettings(_settings);
  }

  _getSystemRuntime().restore(_state, {
    reason: restoredAutosave ? 'restore-autosave' : 'new-game',
    sessionToken: _getSessionToken(),
    restoreEconomy: restoredAutosave,
    restoreGalaxy: restoredAutosave,
  });
  Renderer3D.init();
  Renderer3D.resetRuntimeState(_state.currentSystem);
  Settings.applySettings(_settings, Renderer3D);
  HUD.init();
  HUD.setQuestActions({
    onAcceptQuest: _handleAcceptQuest,
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
  ActionGuideUI.init(_handleActionGuideAction);
  _setDeferredUiState('guidanceAction', _guidanceActionModule ? 'ready' : (_guidanceActionPromise ? 'loading' : 'idle'));

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
      MarketUI.render(_state, _handleOpenBuy, _handleOpenSell, _handleRefuel, sysId, bmMode, MapUI.getMarketViewGalaxy(_state), _handleBlackMarketBuy, _handleBlackMarketSell, _getMarketFinanceActions());
      if (pendingMarketFocus) {
        MarketUI.setMarketWorkspaceFocus(pendingMarketFocus);
      }
      _bindMarketModeButtons();
    });
  });
  Modal.init(_handleTradeConfirm);

  // 新手引导系统已由 GameSystemRuntime 与其他状态系统统一恢复。
  if (_tutorialUiModule) _initializeTutorialUI(_tutorialUiModule);
  _setDeferredUiState('tutorial', _tutorialUiModule ? 'ready' : (_tutorialUiPromise ? 'loading' : 'idle'));
  _setDeferredUiState('onboarding', _onboardingUiModule ? 'ready' : (_onboardingUiPromise ? 'loading' : 'idle'));

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

  _bindSettingsLauncher();

  _updateUI();
  _resetRealtimeClock(performance.now());
  _startGameLoop();

  if (restoredAutosave) {
    _restorePendingEventNotification(_state);
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
  _recentModInstallContext = null;
  if (_state) {
    _resetDialogueRuntime(_state);
    _syncRandomEventRuntime(_state);
  }
}

export function _handleActionGuideActionForTest(suggestion) {
  return _handleActionGuideAction(suggestion);
}

export function _handleTradeConfirmForTest(action, goodId, quantity, marketType) {
  _handleTradeConfirm(action, goodId, quantity, marketType);
}

export function _handleAssignRouteForTest(shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) {
  return _handleAssignRoute(shipIndex, buySystemId, sellSystemId, goodId, tradePolicy);
}

export function _stopActiveDispatchForTest() {
  Dispatch.stopActiveDispatch();
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
  _queueDialogueTriggers([{
    triggerType: triggerType,
    context: context || {},
  }], onFinished);
}

function _queueDialogueTriggers(triggers, onFinished) {
  var requests = Array.isArray(triggers) ? triggers.filter(Boolean) : [];
  var requestedState = _state;
  var requestedRevision = _runtimeRevision;
  if (requests.length === 0) {
    if (typeof onFinished === 'function') onFinished();
    return;
  }

  _loadDialogueRuntime().then(function (runtime) {
    if (!runtime) {
      if (requestedState === _state && requestedRevision === _runtimeRevision && typeof onFinished === 'function') {
        onFinished();
      }
      return;
    }
    if (requestedState !== _state || requestedRevision !== _runtimeRevision) return;

    _initializeDialogueRuntime(runtime, requestedState, false);
    var scenes = [];
    requests.forEach(function (request) {
      scenes = scenes.concat(runtime.Dialogue.getScenesForTrigger(
        requestedState,
        request.triggerType,
        request.context || {}
      ));
    });
    _queueDialogueScenes(scenes, onFinished, runtime, requestedState, requestedRevision);
  });
}

function _queueDialogueScenes(scenes, onFinished, runtime, state, revision) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    if (typeof onFinished === 'function') onFinished();
    return;
  }

  scenes.forEach(function (scene, index) {
    _dialogueQueue.push({
      scene: scene,
      onAfter: index === scenes.length - 1 ? onFinished : null,
      runtime: runtime,
      state: state,
      revision: revision,
    });
  });

  _drainDialogueQueue();
}

function _drainDialogueQueue() {
  if (_dialoguePlaying || _dialogueQueue.length === 0) return;

  var next = _dialogueQueue.shift();
  if (!next || !next.runtime || next.state !== _state || next.revision !== _runtimeRevision) {
    _drainDialogueQueue();
    return;
  }
  _dialoguePlaying = true;
  next.runtime.DialogueUI.showScene(next.scene, function (result) {
    if (next.state === _state && next.revision === _runtimeRevision) {
      next.runtime.Dialogue.finalizeScene(next.state, next.scene && next.scene.id, result || {});
      if (typeof next.onAfter === 'function') next.onAfter();
    }
    _dialoguePlaying = false;
    _drainDialogueQueue();
  });
}

function _queueQuestDialogueResult(result, onFinished) {
  if (!result) return;

  var triggers = [];
  var hasCompletedQuest = false;

  if (Array.isArray(result.completedQuests)) {
    result.completedQuests.forEach(function (entry) {
      if (!entry || entry.failed) return;
      hasCompletedQuest = true;
      triggers.push({
        triggerType: 'quest_complete',
        context: {
          questId: entry.id,
          quest: entry.quest || null,
        },
      });
    });
  }

  if (result.phaseAdvanced && result.newPhase) {
    triggers.push({
      triggerType: 'phase_unlock',
      context: {
        phaseId: result.newPhase.id,
        phase: result.newPhase,
      },
    });
  }

  _queueDialogueTriggers(triggers, function () {
    if (hasCompletedQuest) {
      Tutorial.checkTrigger('complete_quest');
      _updateUI();
    }
    if (typeof onFinished === 'function') onFinished();
  });
}

function _scheduleRandomEventRoll(state, baseChance) {
  var requestedState = state;
  var requestedRevision = _runtimeRevision;

  _randomEventRollQueue = _randomEventRollQueue
    .catch(function () { return null; })
    .then(function () {
      return _loadRandomEventSystem();
    })
    .then(function (RandomEvent) {
      if (!RandomEvent || requestedState !== _state || requestedRevision !== _runtimeRevision) return null;

      RandomEvent.syncRuntimeState(requestedState);
      var event = RandomEvent.rollEvent(requestedState, baseChance);
      if (event) {
        EventBus.emit('audio:cue', { cue: 'event.alert' });
        EventUI.showEventNotification(event, function (choiceIndex) {
          _handleEventChoice(choiceIndex);
        });
        EventBus.emit('log:message', { text: '📢 遭遇事件：' + event.title + '！查看底部通知处理。', type: 'info' });
      }

      _captureRuntimeStateForSave(requestedState);
      Save.saveGame(0, requestedState, { isAutosave: true });
      _refreshActionGuide();
      return event;
    });

  return _randomEventRollQueue;
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
  _queueAchievementCheck();
  _updateUI();
  if (result && result.ok) _checkVictory();
}

function _recordQuestProgress(context) {
  var questResult = Quest.checkProgress(_state, context || { action: 'state_sync' });
  questResult.msgs.forEach(function (message) {
    EventBus.emit('log:message', { text: message.text, type: message.type });
  });
  _queueQuestDialogueResult(questResult);
  return questResult;
}

function _getNextGuidancePoi(systemId) {
  var planetData = systemId ? GalaxyData.getPlanetData(systemId) : null;
  var exploration = planetData && planetData.exploration;
  if (!exploration || !Array.isArray(exploration.pois)) return null;

  return exploration.pois.filter(function (poi) {
    return poi && !poi.resolved;
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
  var MarketUI = _getDeferredFeature('market');
  var focus = MarketUI && MarketUI.getActiveMarketWorkspaceFocus
    ? MarketUI.getActiveMarketWorkspaceFocus()
    : {};
  return Object.assign({}, focus || {}, {
    systemId: MapUI.getMarketViewSystem(_state) || (_state && _state.currentSystem) || '',
  });
}

function _refreshActionGuide() {
  if (!_state) return;
  var nextPoi = null;
  var nextPoiStatus = null;
  var tutorialActive = Tutorial.isActive();
  var blockingModalOpen = hasBlockingSurfaceOpen();
  var eventPending = EventUI.hasPendingEvent();
  var researchSupplyRoute = null;
  var questRouteRecommendation = null;
  var researchBlocker = null;
  var dispatchRouteRecommendation = null;
  var activeTeachingChain = MidgameTeachingChain.getActiveChain(_state);
  var dispatchTeachingActive = !!(
    activeTeachingChain &&
    activeTeachingChain.chain &&
    activeTeachingChain.chain.id === 'dispatch-ops'
  );
  var serviceStatus = null;
  var modRecommendation = null;
  var recentModInstallContext = _recentModInstallContext;
  var surveyIntel = null;
  if (_state.currentSystem) {
    nextPoi = _getNextGuidancePoi(_state.currentSystem);
    if (nextPoi) {
      nextPoiStatus = _getPoiStatus(_state.currentSystem, nextPoi.poiId);
    }
    surveyIntel = Exploration.getSurveyDecisionIntel(_state, _state.currentSystem);
  }
  if (!tutorialActive && !blockingModalOpen) {
    var dispatchContext = _getActiveShipDispatchContext();
    if (_shouldLoadAdvancedCommerce(_state) && !_advancedGuidanceModule) _loadAdvancedGuidance();
    if (_shouldLoadRouteGuidance(_state) && !_routeGuidanceModule) _loadRouteGuidance();
    if (_routeGuidanceModule) {
      questRouteRecommendation = _routeGuidanceModule.findQuestRoute(_state, dispatchContext);
      if (!questRouteRecommendation) {
        researchSupplyRoute = _routeGuidanceModule.findResearchSupplyRoute(_state, dispatchContext);
      }
    }
    if (!questRouteRecommendation && !researchSupplyRoute) {
      researchBlocker = getResearchDispatchBlockerState(_state, dispatchContext);
    }
    if (!questRouteRecommendation && (!researchSupplyRoute || dispatchTeachingActive) && _routeGuidanceModule) {
      dispatchRouteRecommendation = _routeGuidanceModule.findBestDispatchRoute(_state, dispatchContext);
    }
    serviceStatus = _getActiveShipServiceStatus();
    if (Fleet.getShipModRecommendation) {
      modRecommendation = Fleet.getShipModRecommendation(_state, _state.activeShipIndex || 0);
    }
  }
  var FleetUI = _getDeferredFeature('fleet');
  ActionGuideUI.render(Guidance.getCurrentSuggestion(_state, {
    marketOpen: MapUI.isMarketOpen(),
    marketFocus: _getActionGuideMarketFocus(),
    archiveOpen: UIManager.getCurrentView() === 'quests',
    archiveTab: MapUI.getActiveArchiveTab(),
    nextPoi: nextPoi,
    nextPoiStatus: nextPoiStatus,
    researchSupplyRoute: researchSupplyRoute,
    questRouteRecommendation: questRouteRecommendation,
    researchBlocker: researchBlocker,
    dispatchRouteRecommendation: dispatchRouteRecommendation,
    serviceStatus: serviceStatus,
    modRecommendation: modRecommendation,
    modModalContext: FleetUI && FleetUI.getActiveModModalContext ? FleetUI.getActiveModModalContext() : null,
    dispatchModalContext: FleetUI && FleetUI.getActiveDispatchModalContext ? FleetUI.getActiveDispatchModalContext() : null,
    recentModInstallContext: recentModInstallContext,
    surveyIntel: surveyIntel,
    tutorialActive: tutorialActive,
    blockingModalOpen: blockingModalOpen,
    eventPending: eventPending,
  }));

  // 中期教学链：检查是否有链已自然满足完成条件
  var completedChains = MidgameTeachingChain.checkChainCompletion(_state);
  completedChains.forEach(function (chainResult) {
    EventBus.emit('log:message', { text: chainResult.message, type: 'upgrade' });
  });

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

  var requestedRevision = _runtimeRevision;
  ActionGuideUI.showProcessing(suggestion, getGuidanceActionProcessingMessage(suggestion));
  return _loadGuidanceActionController().then(function (GuidanceAction) {
    if (!GuidanceAction || requestedRevision !== _runtimeRevision) {
      _refreshActionGuide();
      return;
    }
    GuidanceAction.handleGuidanceAction(suggestion, {
      getState: function () { return _state; },
      prepareDirectExecution: _prepareDirectGuidanceExecution,
      acceptQuest: _handleAcceptQuest,
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
        if (ActionGuideUI.showCompletion) ActionGuideUI.showCompletion(message, detail, options);
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
  var shipStats = Fleet.getEffectiveShipStats(_state, Fleet.getActiveShip(_state));
  return Exploration.getPoiStatus(_state, systemId, poiId, {
    poiRewardMultiplier: shipStats.poiRewardMultiplier,
  });
}

function _handleExplorePoi(systemId, poiId) {
  Fleet.syncStateFromShip(_state);
  var shipStats = Fleet.getEffectiveShipStats(_state, Fleet.getActiveShip(_state));
  const result = Exploration.explorePoi(_state, systemId, poiId, {
    poiRewardMultiplier: shipStats.poiRewardMultiplier,
  });
  if (result && result.ok) {
    Fleet.commitActiveShipState(_state);
    _state.galaxyStates = GalaxyData.getAllPlanetStates();
  }
  _dispatch(result);
}

function _handleTravel(systemId) {
  Fleet.syncStateFromShip(_state);
  var activeShip = Fleet.getActiveShip(_state);

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
        EventBus.emit('log:message', { text: '⏹️ 黑市自动跑商因走私被查获而中止。', type: 'error' });
      }
    }
    if (smuggleResult.evaded) Economy.recordSmugglingEvaded(_state);

    // 探索追踪：记录已访问的星球和星系
    if (!_state.visitedSystems) _state.visitedSystems = [];
    if (!_state.visitedGalaxies) _state.visitedGalaxies = [];
    if (_state.visitedSystems.indexOf(_state.currentSystem) === -1) {
      _state.visitedSystems.push(_state.currentSystem);
    }
    if (_state.visitedGalaxies.indexOf(_state.currentGalaxy) === -1) {
      _state.visitedGalaxies.push(_state.currentGalaxy);
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
      crossGalaxy: !!(result.meta && result.meta.crossGalaxy),
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
    if (!Tutorial.isActive()) {
      _scheduleRandomEventRoll(_state, baseEventChance);
    }

    // 自动存档
    Fleet.commitActiveShipState(_state);

    // 船队推进统一由游戏日时钟结算，手动旅行不再额外推进远程船只。
    _captureRuntimeStateForSave(_state);
    Save.saveGame(0, _state, { isAutosave: true });

    _updateUI();
  }
}

function _handleEventChoice(choiceIndex) {
  if (!_randomEventModule) {
    EventBus.emit('log:message', { text: '⚠️ 事件运行时尚未就绪，请重新打开事件。', type: 'error' });
    return;
  }
  const previousShipState = {
    maxCargo: _state.maxCargo,
    maxFuel: _state.maxFuel,
    maxHull: _state.maxHull,
    fuelEfficiency: _state.fuelEfficiency,
    cargo: Object.assign({}, _state.cargo || {}),
    cargoCost: Object.assign({}, _state.cargoCost || {}),
  };
  const result = _randomEventModule.resolveChoice(_state, choiceIndex);
  if (result && result.resolved) {
    Fleet.commitActiveShipState(_state, previousShipState);
    _captureRuntimeStateForSave(_state);
    Save.saveGame(0, _state, { isAutosave: true });
  }
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

  var dispatchedShip = Fleet.getActiveShip(_state);
  var dispatchedRoute = dispatchedShip && dispatchedShip.route ? dispatchedShip.route : null;
  var completesDispatchCycle = action === 'sell' && dispatchedRoute &&
    dispatchedRoute.goodId === goodId && dispatchedRoute.status === 'selling';
  var recordsDispatchPurchase = action === 'buy' && dispatchedRoute &&
    dispatchedRoute.goodId === goodId && dispatchedRoute.status === 'buying';

  const effectiveMarket = marketType === 'black' ? 'black' : 'open';
  const result = action === 'buy'
    ? Trade.buyGoodOnMarket(_state, goodId, quantity, effectiveMarket)
    : Trade.sellGoodOnMarket(_state, goodId, quantity, effectiveMarket);
  if (result && result.ok && effectiveMarket === 'black') {
    Economy.recordBlackMarketTrade(_state, { action: action, meta: result.meta });
  }
  if (result && result.ok) {
    _returnToStarmapAfterTrade();
  }
  _dispatch(result);

  if (result && result.ok) {
    EventBus.emit('audio:cue', { cue: action === 'buy' ? 'trade.buy' : 'trade.sell' });
    Fleet.commitActiveShipState(_state);
    if (completesDispatchCycle && dispatchedShip) {
      if (!dispatchedShip.operatingStats || typeof dispatchedShip.operatingStats !== 'object') {
        dispatchedShip.operatingStats = {};
      }
      dispatchedShip.operatingStats.revenue = Math.max(0, Number(dispatchedShip.operatingStats.revenue) || 0) +
        Math.max(0, Number(result.meta && result.meta.totalEarned) || 0);
      dispatchedShip.operatingStats.tradeCycles = Math.max(0, Number(dispatchedShip.operatingStats.tradeCycles) || 0) + 1;
    } else if (recordsDispatchPurchase) {
      if (!dispatchedShip.operatingStats || typeof dispatchedShip.operatingStats !== 'object') {
        dispatchedShip.operatingStats = {};
      }
      dispatchedShip.operatingStats.cargoCost = Math.max(0, Number(dispatchedShip.operatingStats.cargoCost) || 0) +
        Math.max(0, Number(result.meta && result.meta.totalCost) || 0);
    }
    var activeRoute = Fleet.getActiveShip(_state) ? Fleet.getActiveShip(_state).route : null;
    if (activeRoute && activeRoute.goodId === goodId) {
      if (action === 'buy') {
        activeRoute.lastBuyPrice = result.meta && Number.isFinite(result.meta.unitBuyPrice)
          ? result.meta.unitBuyPrice
          : null;
      } else if (action === 'sell') {
        activeRoute.lastBuyPrice = null;
      }
      activeRoute.lastPolicyMessage = null;
    }
    Tutorial.checkTrigger(action);

    const factionMsgs = Faction.onTrade(_state, _state.currentSystem, goodId, action, quantity, effectiveMarket);
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
        profit: action === 'sell' ? profit : 0,
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
  var result = Trade.refuel(_state);
  _dispatch(result);
  if (result && result.ok) {
    _showActionGuideCompletion(getRefuelCompletion());
  }
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
    ? '查看开放条件与公开情报'
    : action.marketMode === 'black'
      ? '沿着' + factionName + '的地下通路继续找机会'
      : '观察' + factionName + '代表地点行情';

  EventBus.emit('log:message', {
    text: buildCommandFeedback(action, {
      icon: action.label === '查看黑市条件' ? '🔒' : (action.marketMode === 'black' ? '🕶' : '🏛'),
      destination: (action.systemName || '代表地点') + ' · ' + (action.marketFocusLabel || '市场页'),
      nextStep: factionNextStep,
      returnTo: '派系页继续调整关系方向',
    }),
    type: 'tip',
  });
}

function _handleResolveResearchBlocker(action) {
  if (!action || !action.actionId) return;

  if (action.actionId === 'quest-focus') {
    _selectAvailableQuest(action.targetQuestId);
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
  _openRecommendedDispatch(recommendation, '任务路线建议', '📋');
}

function _handleResolveQuestBlocker(action) {
  if (!action || !action.actionId) return;

  if (action.actionId === 'quest-focus') {
    EventBus.emit('log:message', {
      text: buildCommandFeedback(action, {
        openedVerb: '已找到',
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
        destination: '当前市场 · ' + (action.marketFocusLabel || '买卖货物'),
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
  _loadFleetUI().then(function (FleetUI) {
    if (!FleetUI) return;
    _getUiCoordinator().renderFleet(FleetUI);
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
    _getUiCoordinator().renderFleet(FleetUI);
    FleetUI.openModModal(
      _state,
      shipIndex,
      _handleInstallMod,
      _handleUninstallMod,
      _handleUpgradeShip,
      _handleServiceShip,
      _handleSellShip,
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

function _runCommerceAction(methodName, args) {
  if (_commerceRuntimeModule && typeof _commerceRuntimeModule[methodName] === 'function') {
    return _commerceRuntimeModule[methodName].apply(null, [_state].concat(args || []));
  }
  _loadCommerceRuntime();
  return {
    ok: false,
    msgs: [{ text: '⚠️ 高级经营运行时正在加载，请稍后重试。', type: 'error' }],
  };
}

function _handleBuildTradeStation(systemId) {
  const result = _runCommerceAction('buildTradeStation', [systemId]);
  if (result && result.ok) {
    _recordQuestProgress({ action: 'build_trade_station', systemId: systemId });
    _completeMidgameTeachingStep('trade-station-basics', 'build-trade-station');
  }
  _dispatch(result);
}

function _handleUpgradeTradeStation(systemId) {
  const result = _runCommerceAction('upgradeTradeStation', [systemId]);
  if (result && result.ok) {
    _completeMidgameTeachingStep('trade-station-basics', 'upgrade-trade-station');
  }
  _dispatch(result);
}

function _handleSetTradeStationStrategy(systemId, strategyId) {
  const result = _runCommerceAction('setTradeStationStrategy', [systemId, strategyId]);
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
  const result = _runCommerceAction('batchUpgradeTradeStations', [normalizedSystemIds]);
  _dispatch(result);
}

function _handleBatchSetTradeStationStrategy(strategyId, systemIds) {
  const normalizedSystemIds = _normalizeBatchSystemIds(systemIds);
  const result = _runCommerceAction('batchSetTradeStationStrategy', [strategyId, normalizedSystemIds]);
  _dispatch(result);
}

function _handleTakeLoan(offerId) {
  const result = _runCommerceAction('takeLoan', [offerId]);
  if (result && result.ok) _recordQuestProgress({ action: 'finance_action', financeType: 'loan' });
  _dispatch(result);
}

function _handleRepayLoan(loanId) {
  const result = _runCommerceAction('repayLoan', [loanId]);
  if (result && result.ok) {
    _recordQuestProgress({ action: 'finance_action', financeType: 'repay' });
    _completeMidgameTeachingStep('capital-risk', 'review-loan-obligation');
  }
  _dispatch(result);
}

function _handleInvestTradeStation(systemId) {
  const result = _runCommerceAction('investInTradeStation', [systemId]);
  if (result && result.ok) _recordQuestProgress({ action: 'finance_action', financeType: 'investment' });
  _dispatch(result);
}

function _handleRedeemTradeStationInvestment(systemId) {
  const result = _runCommerceAction('redeemTradeStationInvestment', [systemId]);
  if (result && result.ok) _recordQuestProgress({ action: 'finance_action', financeType: 'investment_exit' });
  _dispatch(result);
}

function _handleBatchInvestTradeStations(systemIds, amount) {
  const normalizedSystemIds = _normalizeBatchSystemIds(systemIds);
  const targetSystemIds = normalizedSystemIds && normalizedSystemIds.length > 0
    ? normalizedSystemIds
    : Object.keys(_state.tradeStations || {});
  const result = _runCommerceAction('batchInvestInTradeStations', [targetSystemIds, amount]);
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
  _captureRuntimeStateForSave(_state, { reason: 'manual-save' });
  const result = Save.saveGame(slotId, _state);
  EventBus.emit('log:message', { text: result.msg, type: result.ok ? 'info' : 'error' });
  _updateUI();
}

function _handleLoadGame(slotId) {
  const result = Save.loadGame(slotId);
  if (result.ok) {
    _hideSettingsModal();
    Dispatch.stopActiveDispatch();
    _resetSessionTransients();
    _replaceState(result.state, 'manual-load');
    _acknowledgedVictoryPathIds = new Set();
    _resetDialogueRuntime(_state);
    _syncRandomEventRuntime(_state);
    EventUI.hidePendingNotification();
    _settings.difficulty = _state.difficulty;
    Settings.saveSettings(_settings);
    _getSystemRuntime().restore(_state, {
      reason: 'manual-load',
      sessionToken: _getSessionToken(),
      restoreEconomy: true,
      restoreGalaxy: true,
    });
    MapUI.syncState(function () { return _state; });
    Renderer3D.resetRuntimeState(_state.currentSystem);
    MapUI.refreshGalaxyBtn(_state);
    // 恢复派遣状态（旧时钟已在 state replace 前停止）
    if (Fleet.isActiveDispatched(_state)) {
      _startActiveDispatchClock();
    }
    _resetRealtimeClock(performance.now());
    _updateUI();
    _restorePendingEventNotification(_state);
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
  if (result && result.ok) _recordQuestProgress({ action: 'buy_ship', shipTypeId: shipTypeId });
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
    _startActiveDispatchClock();
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
    _startActiveDispatchClock();
  }
  if (result && result.ok) {
    _recordQuestProgress({ action: 'dispatch_route', shipIndex: shipIndex, goodId: goodId });
    var activeTeachingChain = MidgameTeachingChain.getActiveChain(_state);
    if (activeTeachingChain && activeTeachingChain.chain.id === 'research-supply') {
      var researchRecommendation = _routeGuidanceModule && _routeGuidanceModule.findResearchSupplyRoute
        ? _routeGuidanceModule.findResearchSupplyRoute(_state, _getActiveShipDispatchContext())
        : null;
      if (researchRecommendation && researchRecommendation.goodId === goodId &&
          researchRecommendation.buySystemId === buySystemId &&
          researchRecommendation.sellSystemId === sellSystemId) {
        _completeMidgameTeachingStep('research-supply', 'prefill-research-supply-dispatch');
      }
    } else if (activeTeachingChain && activeTeachingChain.chain.id === 'dispatch-ops') {
      _completeMidgameTeachingStep('dispatch-ops', 'prefill-profitable-dispatch');
    }
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
  if (result && result.ok) _recordQuestProgress({ action: 'recruit_crew', offerId: offerId });
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
        EventBus.emit('log:message', { text: '📡 自动跑商的船只燃料不足，已召回。', type: 'error' });
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
        EventBus.emit('log:message', { text: '📡 自动跑商的船只补给后仍无法完成下一段航程，已召回。', type: 'error' });
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

function _startActiveDispatchClock() {
  // 两次自动操作约等于一个游戏日：四步买卖循环约耗时两天，
  // 与远程船队的日结算速度保持同一量级。
  Dispatch.startActiveDispatch(_boundDispatchTick, Math.floor(_getRealtimeDayDurationMs() / 2));
}

// ---------------------------------------------------------------------------
// UI 全量刷新
// ---------------------------------------------------------------------------

function _updateUI() {
  if (MapUI.isMarketOpen() && !_getDeferredFeature('market')) _ensureMarketUiRendered();
  _getUiCoordinator().renderAll();
}

// ---------------------------------------------------------------------------
// 胜利检测
// ---------------------------------------------------------------------------

function _checkVictory() {
  const result = Victory.checkVictory(_state, _acknowledgedVictoryPathIds);
  if (!result.won) return;

  const path = result.path;
  const reportPathId = path && path.id ? path.id : 'victory';
  if (_pendingVictoryReportPathId === reportPathId) return;
  _pendingVictoryReportPathId = reportPathId;
  const routeTimeline = BalanceMetrics.recordRouteCompletion(_state, reportPathId, {
    netWorth: Trade.getNetWorth(_state),
  });
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
  if (routeTimeline && routeTimeline.selectedDay) {
    stats.splice(1, 0, {
      label: '路线用时',
      value: '第 ' + routeTimeline.selectedDay + ' 天选择 · ' + routeTimeline.daysToComplete + ' 天达成',
    });
  }

  _loadVictoryResultUI().then(function (VictoryResultUI) {
    if (!VictoryResultUI) return;
    _initializeVictoryResultUI(VictoryResultUI);
    VictoryResultUI.showVictoryReport({
      path: path,
      stats: stats,
      progress: allProgress,
    });
  });
}

function _resetRealtimeClock(nowMs) {
  _realtimeClock = GameTime.resetRealtimeClock(_realtimeClock, nowMs, _state ? _state.shipHull : 100);
}

function _isRealtimeClockPaused() {
  return !!(document.hidden || Tutorial.isActive() || document.querySelector('.modal:not(.hidden)'));
}

function _applyRealtimeDayProgress(days) {
  var elapsedDays = Math.max(0, Number.isFinite(days) ? Math.floor(days) : 0);
  if (elapsedDays <= 0) return;

  var previousHull = _realtimeClock && Number.isFinite(_realtimeClock.lastHullSnapshot)
    ? _realtimeClock.lastHullSnapshot
    : (_state.shipHull || 100);
  var result = GameTime.advanceDays(_state, elapsedDays);
  // 科研等全舰队永久加成在日结算中完成后，立即刷新当前飞船投影再存档。
  Fleet.syncStateFromShip(_state);
  var completedTeachingChains = MidgameTeachingChain.checkChainCompletion(_state);
  completedTeachingChains.forEach(function (chainResult) {
    EventBus.emit('log:message', { text: chainResult.message, type: 'upgrade' });
  });

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

  _captureRuntimeStateForSave(_state);
  Save.saveGame(0, _state, { isAutosave: true });
  _dispatch(result);
}

function _updateRealtimeClock(ts) {
  if (!_state) return;
  if (_shouldLoadAdvancedCommerce(_state) && !_commerceRuntimeModule && !_commerceRuntimeError) {
    _loadAdvancedGuidance();
    _resetRealtimeClock(ts);
    return;
  }
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

function _captureRuntimeStateForSave(state, options) {
  return _getSystemRuntime().capture(state, Object.assign({ sessionToken: _getSessionToken() }, options));
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
