import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readApplicationComposition } from './runtimeCompositionSource.js';

describe('deferred terminal UI loading', function () {
  it('市场、舰队和档案界面不再进入首屏静态依赖图', function () {
    var source = readApplicationComposition();
    var featureManifest = readFileSync('js/core/GameFeatureManifest.js', 'utf8');
    var featureRuntime = readFileSync('js/core/GameFeatureRuntime.js', 'utf8');
    var featureRegistry = readFileSync('js/core/FeatureRegistry.js', 'utf8');

    expect(source).not.toMatch(/import\s+\*\s+as\s+MarketUI\s+from/);
    expect(source).not.toMatch(/import\s+\*\s+as\s+FleetUI\s+from/);
    expect(source).not.toMatch(/import\s+\*\s+as\s+(QuestUI|ArchiveExplorationUI|ResearchUI|FactionUI|AchievementUI)\s+from/);
    expect(source).not.toMatch(/import\s+\*\s+as\s+(SaveUI|VictoryResultUI)\s+from/);
    expect(source).toContain("from './GameFeatureRuntime.js'");
    expect(featureRuntime).toContain("from './GameFeatureManifest.js'");
    expect(featureRuntime).toContain('registry.registerManifest(manifest)');
    expect(source).not.toContain("import('../ui/MarketUI.js')");
    expect(featureManifest).toContain("import('../ui/MarketUI.js')");
    expect(featureManifest).toContain("import('../ui/FleetUI.js')");
    expect(featureManifest).toContain("import('../ui/ArchiveUI.js')");
    expect(featureManifest).toContain("import('../ui/SaveUI.js')");
    expect(featureManifest).toContain("import('../ui/VictoryResultUI.js')");
    expect(featureRegistry).toContain("_notify(feature, 'loading')");
  });

  it('首次打开终端会触发加载，会话全量同步显式声明 all 区域', function () {
    var gameManager = readApplicationComposition();
    var guidanceRuntime = readFileSync('js/core/GameGuidanceRuntime.js', 'utf8');
    var commandDestinations = readFileSync('js/core/CommandDestinationController.js', 'utf8');
    var marketController = readFileSync('js/core/MarketWorkspaceController.js', 'utf8');
    var uiLifecycle = readFileSync('js/core/GameUiLifecycleController.js', 'utf8');
    var uiManager = readFileSync('js/ui/UIManager.js', 'utf8');
    var uiCoordinator = readFileSync('js/ui/GameUiCoordinator.js', 'utf8');
    var uiApplication = readFileSync('js/core/GameUiApplicationRuntime.js', 'utf8');

    expect(uiLifecycle).toContain('onOpenHangar: function ()');
    expect(uiLifecycle).toContain("if (tabId === 'tab-fleet') _call(ports, 'ensureFleet'");
    expect(uiLifecycle).toContain('ARCHIVE_TAB_IDS.indexOf(tabId)');
    expect(gameManager).toContain("var FleetUI = _getFeatureRuntime().get('fleet')");
    expect(guidanceRuntime).toContain("getLoadedArchive: function () { return _featurePort(features, 'get', 'archive'); }");
    expect(commandDestinations).toContain('var loaded = getLoadedArchive()');
    expect(commandDestinations).toContain('Promise.resolve().then(loadArchive)');
    expect(gameManager).toContain("if (MapUI.isMarketOpen() && !_getFeatureRuntime().get('market'))");
    expect(gameManager).toContain('_getUiRuntime().ensureMarket()');
    expect(gameManager).toContain('render: function () { updateUI(UI_REGION.ALL); }');
    expect(gameManager).toContain('_getUiRuntime().invalidate(resolveDirtyRegions(regions))');
    expect(gameManager).not.toContain("typeof regions === 'undefined'");
    expect(gameManager).toContain("from './GameUiApplicationRuntime.js'");
    expect(uiApplication).toContain("from './MarketWorkspaceController.js'");
    expect(gameManager).not.toContain('_blackMarketMode');
    expect(gameManager).not.toContain('_bindMarketModeButtons');
    expect(gameManager).not.toContain('function _getMarketFinanceActions');
    expect(gameManager).not.toContain('function _handleOpenBuy');
    expect(gameManager).not.toContain('function _handleBlackMarketBuy');
    expect(gameManager).not.toContain('function _handleFocusRemoteMarketSystem');
    expect(marketController).toContain("root.addEventListener('click', eventHandler)");
    expect(marketController).not.toContain('cloneNode');
    expect(marketController).toContain('function handleCommand(input)');
    expect(marketController).toContain("from './MarketCommand.js'");
    expect(marketController).toContain('function focusRemoteSystem(systemId)');
    expect(marketController).toContain('function openBuy(good)');
    expect(uiCoordinator).toContain("if (_call(MapUI, 'isMarketOpen', []))");
    expect(uiCoordinator).toContain("var ArchiveUI = _getLoadedFeature('archive')");
    expect(uiCoordinator).toContain("var FleetUI = _getLoadedFeature('fleet')");
    expect(uiCoordinator).toContain("var SaveUI = _getLoadedFeature('save')");
    expect(uiManager).toContain('onOpenHangar: null');
    expect(uiManager).toContain('_handlers.onOpenHangar(state)');
  });

  it('终端样式与对应模块一起按需加载', function () {
    var gameManager = readApplicationComposition();
    var featureManifest = readFileSync('js/core/GameFeatureManifest.js', 'utf8');
    var featureRegistry = readFileSync('js/core/FeatureRegistry.js', 'utf8');
    var styleEntry = readFileSync('css/style.css', 'utf8');
    var sharedCss = readFileSync('css/interstellar-trader.css', 'utf8');
    var surfacesCss = readFileSync('css/surfaces.css', 'utf8');

    expect(styleEntry).not.toContain('@import url("fleet.css")');
    expect(gameManager).not.toContain('loadDeferredStylesheet');
    expect(featureManifest).toContain("new URL('../../css/fleet.css', import.meta.url).href");
    expect(featureManifest).toContain("new URL('../../css/hangar-terminal.css', import.meta.url).href");
    expect(featureManifest).toContain("new URL('../../css/archive-terminal.css', import.meta.url).href");
    expect(featureManifest).toContain("new URL('../../css/market-terminal.css?v=20260717-marketchart1', import.meta.url).href");
    expect(featureManifest).toContain("loadStylesheet('fleet-base', FLEET_STYLES_URL)");
    expect(featureManifest).toContain("loadStylesheet('hangar-terminal', HANGAR_TERMINAL_STYLES_URL)");
    expect(featureManifest).toContain("loadStylesheet('archive-terminal', ARCHIVE_TERMINAL_STYLES_URL)");
    expect(featureManifest).toContain("import('../ui/ArchiveUI.js')");
    expect(featureManifest).not.toContain("import('../ui/QuestUI.js')");
    expect(featureManifest).toContain("loadStylesheet('market-terminal', MARKET_TERMINAL_STYLES_URL)");
    expect(featureRegistry).toContain('link.dataset.deferredUiStyle = feature');
    expect(featureRegistry).toContain("document.getElementById('app-styles')");
    expect(featureRegistry).toContain('document.head.insertBefore(link, appStyles)');
    expect(featureRegistry).toContain("link.dataset.loaded = 'false'");
    expect(featureRegistry).toContain('link.parentNode.removeChild(link)');
    expect(surfacesCss).toContain('.workspace-surface:not(.is-active)');
    expect(surfacesCss).toContain('#market-overlay.workspace-surface--trade');
    expect(sharedCss).not.toContain('Hangar detail modal shell refinements');
    expect(sharedCss).not.toContain('Archive terminal: quests + research');
    expect(sharedCss).not.toContain('Market matrix controls');
  });

  it('科研阻塞状态使用无 DOM 的轻量引导模块', function () {
    var gameManager = readApplicationComposition();
    var guidanceRuntime = readFileSync('js/core/GameGuidanceRuntime.js', 'utf8');
    var guidance = readFileSync('js/ui/ResearchGuidance.js', 'utf8');

    expect(gameManager).toContain("from './GameGuidanceRuntime.js'");
    expect(gameManager).not.toContain("from '../ui/ResearchGuidance.js'");
    expect(guidanceRuntime).toContain("from '../ui/ResearchGuidance.js'");
    expect(guidance).not.toContain('document.');
    expect(guidance).toContain('export function getResearchDispatchBlockerState');
  });

  it('存档和胜利结果只在对应入口触发加载', function () {
    var gameManager = readApplicationComposition();
    var featureManifest = readFileSync('js/core/GameFeatureManifest.js', 'utf8');
    var settingsController = readFileSync('js/core/SettingsUiController.js', 'utf8');
    var victoryController = readFileSync('js/core/VictoryRuntimeController.js', 'utf8');
    var settingsManager = readFileSync('js/core/SettingsManager.js', 'utf8');
    var uiCoordinator = readFileSync('js/ui/GameUiCoordinator.js', 'utf8');
    var uiApplication = readFileSync('js/core/GameUiApplicationRuntime.js', 'utf8');

    expect(gameManager).not.toContain('_ensureMarketUiRendered');
    expect(gameManager).not.toContain('_ensureFleetUiRendered');
    expect(gameManager).not.toContain('_ensureArchiveUiRendered');
    expect(gameManager).not.toContain('_ensureSaveUiRendered');
    expect(uiApplication).toContain('function ensureSave() { return getCoordinator().ensureSave(); }');
    expect(uiCoordinator).toContain("return _ensure('save', function (module) { renderSave(module); })");
    expect(featureManifest).toContain("import('../ui/VictoryResultUI.js')");
    expect(gameManager).toContain("from './VictoryRuntimeController.js'");
    expect(victoryController).toContain('Promise.resolve(loadView()).then(function (VictoryResultUI)');
    expect(victoryController).toContain('pendingReportPathId === reportPathId');
    expect(settingsController).toContain('onOpen: callbacks.onOpen');
    expect(settingsController).toContain("features.load('settings')");
    expect(settingsManager).toContain('if (activeCallbacks.onOpen) activeCallbacks.onOpen()');
  });

  it('剧情与随机事件数据只在首次触发时进入依赖图', function () {
    var gameManager = readApplicationComposition();
    var featureManifest = readFileSync('js/core/GameFeatureManifest.js', 'utf8');
    var dialogueRuntime = readFileSync('js/core/DialogueRuntimeController.js', 'utf8');
    var randomEventRuntime = readFileSync('js/core/RandomEventRuntimeController.js', 'utf8');
    var achievementRuntime = readFileSync('js/core/AchievementRuntimeController.js', 'utf8');
    var persistenceRuntime = readFileSync('js/core/GamePersistenceController.js', 'utf8');

    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+RandomEvent\s+from/);
    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+Dialogue(UI)?\s+from/);
    expect(gameManager).toContain("from './DialogueRuntimeController.js'");
    expect(featureManifest).toContain("import('../systems/story/DialogueSystem.js')");
    expect(featureManifest).toContain("import('../ui/DialogueUI.js')");
    expect(dialogueRuntime).toContain("import('../systems/story/DialogueSystem.js')");
    expect(dialogueRuntime).toContain("import('../ui/DialogueUI.js')");
    expect(gameManager).toContain("from './RandomEventRuntimeController.js'");
    expect(featureManifest).toContain("import('../systems/event/RandomEvent.js')");
    expect(randomEventRuntime).toContain("import('../systems/event/RandomEvent.js')");
    expect(gameManager).toContain("loadRuntime: function () { return _getFeatureRuntime().loadOrReject('dialogue'); }");
    expect(gameManager).toContain("loadRuntime: function () { return _getFeatureRuntime().loadOrReject('randomEvent'); }");
    expect(gameManager).toContain("_setDeferredUiState('dialogue', state)");
    expect(dialogueRuntime).toContain("setTelemetryState('loading')");
    expect(gameManager).toContain("_setDeferredUiState('randomEvent', state)");
    expect(randomEventRuntime).toContain("setTelemetryState('loading')");
    expect(gameManager).toContain("from './AchievementRuntimeController.js'");
    expect(gameManager).not.toContain('_achievementCheckQueued');
    expect(achievementRuntime).toContain('isSessionTokenCurrent(token)');
    expect(randomEventRuntime).toContain('isSessionTokenCurrent(token)');
    expect(randomEventRuntime).toContain("reason: 'random-event-roll', sessionToken: token");
    expect(gameManager).toContain("from './GamePersistenceController.js'");
    expect(gameManager).not.toContain("from '../systems/save/SaveSystem.js'");
    expect(persistenceRuntime).toContain('store.saveGame(0, request.state, saveOptions)');
  });

  it('首次进入和教程界面只在对应流程触发时加载', function () {
    var gameManager = readApplicationComposition();
    var guidanceRuntime = readFileSync('js/core/GameGuidanceRuntime.js', 'utf8');
    var featureManifest = readFileSync('js/core/GameFeatureManifest.js', 'utf8');
    var featureRegistry = readFileSync('js/core/FeatureRegistry.js', 'utf8');
    var onboardingController = readFileSync('js/core/OnboardingUiController.js', 'utf8');

    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+(OnboardingUI|TutorialUI)\s+from/);
    expect(featureManifest).toContain("import('../ui/OnboardingUI.js')");
    expect(featureManifest).toContain("import('../ui/TutorialUI.js')");
    expect(featureManifest).toMatch(/\bonboarding:\s*\{/);
    expect(featureManifest).toMatch(/\btutorial:\s*\{/);
    expect(featureRegistry).toContain("_notify(feature, 'loading')");
    expect(gameManager).toContain("from './GameGuidanceRuntime.js'");
    expect(gameManager).not.toContain("from './OnboardingUiController.js'");
    expect(guidanceRuntime).toContain("from './OnboardingUiController.js'");
    expect(gameManager).not.toContain("document.getElementById('company-name-display')");
    expect(onboardingController).toContain("_loadFeature('tutorial').then(function (TutorialUI)");
    expect(onboardingController).toContain("_loadFeature('onboarding').then(function (OnboardingUI)");
    expect(onboardingController).toContain('isSessionTokenCurrent(token)');
  });

  it('教程辅助与首次进入内容策略不再由 GameManager 直接实现', function () {
    var gameManager = readApplicationComposition();
    var guidanceRuntime = readFileSync('js/core/GameGuidanceRuntime.js', 'utf8');
    var teachingController = readFileSync('js/core/TeachingGuidanceController.js', 'utf8');
    var onboardingPolicy = readFileSync('js/core/OnboardingPolicyController.js', 'utf8');

    expect(gameManager).not.toContain("from './TeachingGuidanceController.js'");
    expect(gameManager).not.toContain("from './OnboardingPolicyController.js'");
    expect(guidanceRuntime).toContain("from './TeachingGuidanceController.js'");
    expect(guidanceRuntime).toContain("from './OnboardingPolicyController.js'");
    expect(gameManager).not.toContain('function _handleTutorialHelperAction');
    expect(gameManager).not.toContain('function _startMidgameTeachingChain');
    expect(gameManager).not.toContain('function _completeMidgameTeachingStep');
    expect(gameManager).not.toContain('function _checkMidgameTeachingCompletion');
    expect(gameManager).not.toContain('function _showWelcomeMessages');
    expect(gameManager).not.toContain('function _recommendStarterQuests');
    expect(teachingController).toContain('isSessionTokenCurrent(token)');
    expect(teachingController).toContain('function handleTutorialHelperAction(actionId)');
    expect(teachingController).toContain('function startChain(chainId)');
    expect(onboardingPolicy).toContain('function handleTutorialComplete()');
    expect(onboardingPolicy).toContain('function recommendStarterQuests()');
  });

  it('eager UI 壳绑定与教程完成订阅由统一生命周期控制器持有', function () {
    var gameManager = readApplicationComposition();
    var uiLifecycle = readFileSync('js/core/GameUiLifecycleController.js', 'utf8');
    var uiApplication = readFileSync('js/core/GameUiApplicationRuntime.js', 'utf8');

    expect(gameManager).toContain("from './GameUiApplicationRuntime.js'");
    expect(gameManager).toContain('uiRuntime.initialize()');
    expect(uiApplication).toContain("from './GameUiLifecycleController.js'");
    expect(gameManager).not.toContain('HUD.init({');
    expect(gameManager).not.toContain('UIManager.init(function');
    expect(gameManager).not.toContain("EventBus.on('tutorial:complete'");
    expect(gameManager).not.toContain('MapUI.init3DCallbacks(function');
    expect(uiLifecycle).toContain("events.on('tutorial:complete', tutorialCompleteListener)");
    expect(uiLifecycle).toContain("events.off('tutorial:complete', tutorialCompleteListener)");
    expect(uiLifecycle).toContain("_call(MapUI, 'init3DCallbacks'");
    expect(uiLifecycle).toContain("_call(onboardingUi, 'dispose'");
    expect(uiLifecycle).toContain("_call(settingsUi, 'dispose'");
    expect(uiLifecycle).toContain("_call(actionGuide, 'dispose'");
  });

  it('设置、行动执行器与命令落点不再由 GameManager 持有 UI 生命周期', function () {
    var gameManager = readApplicationComposition();
    var guidanceRuntime = readFileSync('js/core/GameGuidanceRuntime.js', 'utf8');
    var featureManifest = readFileSync('js/core/GameFeatureManifest.js', 'utf8');
    var commandDestinations = readFileSync('js/core/CommandDestinationController.js', 'utf8');
    var guidanceAdapter = readFileSync('js/core/GuidanceExecutionAdapter.js', 'utf8');
    var settingsController = readFileSync('js/core/SettingsUiController.js', 'utf8');
    var settingsCore = readFileSync('js/core/SettingsCore.js', 'utf8');
    var settingsManager = readFileSync('js/core/SettingsManager.js', 'utf8');
    var main = readFileSync('js/main.js', 'utf8');
    var uiApplication = readFileSync('js/core/GameUiApplicationRuntime.js', 'utf8');

    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+Settings\s+from\s+'\.\/SettingsManager\.js'/);
    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+CompanyDirectiveUI\s+from/);
    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+GuidanceAction\s+from/);
    expect(featureManifest).toContain("import('./SettingsManager.js')");
    expect(gameManager).toContain("from './GameUiApplicationRuntime.js'");
    expect(uiApplication).toContain("from './SettingsUiController.js'");
    expect(gameManager).not.toContain("document.getElementById('settings-btn')");
    expect(gameManager).not.toContain('CompanyDirectiveUI');
    expect(featureManifest).toContain("import('./GuidanceActionController.js')");
    expect(gameManager).not.toContain("from './GuidanceExecutionAdapter.js'");
    expect(gameManager).not.toContain("from './CommandDestinationController.js'");
    expect(guidanceRuntime).toContain("from './GuidanceExecutionAdapter.js'");
    expect(guidanceRuntime).toContain("from './CommandDestinationController.js'");
    expect(gameManager).not.toContain('GuidanceAction.handleGuidanceAction(suggestion, {');
    expect(gameManager).not.toContain('let _pendingQuestSelectionId');
    expect(gameManager).not.toContain('function _openGuidanceTradeConfirmation');
    expect(gameManager).not.toContain('function _openRecommendedDispatch');
    expect(gameManager).not.toContain('function _openRecommendedMod');
    expect(featureManifest).toMatch(/\bsettings:\s*\{/);
    expect(featureManifest).toMatch(/\bguidanceAction:\s*\{/);
    expect(settingsController).toContain('isSessionTokenCurrent(requestedToken)');
    expect(settingsController).toContain('settingsLoaderBound');
    expect(guidanceAdapter).toContain('isSessionTokenCurrent(token)');
    expect(guidanceAdapter).toContain('GuidanceAction.handleGuidanceAction(suggestion, _createContext())');
    expect(guidanceAdapter).toContain('var navigation = ports.navigation || {}');
    expect(guidanceAdapter).toContain('var exploration = ports.exploration || {}');
    expect(commandDestinations).toContain('function openTradeConfirmation(action, payload)');
    expect(commandDestinations).toContain('function openRecommendedDispatch(recommendation, sourceLabel, icon)');
    expect(commandDestinations).toContain('function openRecommendedMod(payload)');
    expect(commandDestinations).toContain('isSessionTokenCurrent(snapshot.token)');
    expect(settingsCore).not.toContain('ActionConfirmUI');
    expect(settingsCore).not.toContain('settings-modal');
    expect(settingsManager).toContain("from './SettingsCore.js'");
    expect(main).toContain("settingsBtn.dataset.settingsLoaderBound === 'true'");
  });

  it('高级经营、路线搜索和成就定义只在实际需要时加载', function () {
    var gameManager = readApplicationComposition();
    var featureManifest = readFileSync('js/core/GameFeatureManifest.js', 'utf8');
    var gameTime = readFileSync('js/systems/time/GameTimeSystem.js', 'utf8');
    var tradeSystem = readFileSync('js/systems/trade/TradeSystem.js', 'utf8');
    var fleetSystem = readFileSync('js/systems/fleet/FleetSystem.js', 'utf8');
    var dispatchController = readFileSync('js/core/DispatchController.js', 'utf8');
    var guidanceSystem = readFileSync('js/systems/guidance/GuidanceSystem.js', 'utf8');
    var hud = readFileSync('js/ui/HUD.js', 'utf8');

    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+(Commerce|AutoTrade|Achievement|Finance|TradeStation)\s+from/);
    expect(featureManifest).toContain("import('../systems/commerce/CommerceFacade.js')");
    expect(featureManifest).toContain("import('../systems/guidance/AdvancedGuidanceSystem.js')");
    expect(featureManifest).toContain("import('../systems/trade/AutoTradeSystem.js')");
    expect(featureManifest).toContain("import('../systems/achievement/AchievementSystem.js')");
    expect(gameTime).not.toMatch(/from\s+'\.\.\/(finance\/FinanceSystem|trade\/TradeStationSystem)\.js'/);
    expect(gameTime).toContain('setAdvancedDayProcessor');
    expect(tradeSystem).not.toContain("from '../finance/FinanceSystem.js'");
    expect(fleetSystem).toContain("from '../trade/TradePolicy.js'");
    expect(fleetSystem).not.toContain("from '../trade/AutoTradeSystem.js'");
    expect(dispatchController).toContain('setQuestRouteResolver');
    expect(dispatchController).not.toContain("from '../systems/trade/AutoTradeSystem.js'");
    expect(guidanceSystem).toContain('setAdvancedGuidanceProvider');
    expect(guidanceSystem).not.toMatch(/from\s+'\.\.\/(finance|trade)\/(FinanceSystem|FuturesSystem|TradeStationSystem)\.js'/);
    expect(hud).not.toContain("from '../systems/achievement/AchievementSystem.js'");
  });

  it('所有通用延迟功能由 manifest 持有，不再复制 module/promise/error 三元状态', function () {
    var gameManager = readApplicationComposition();
    var featureManifest = readFileSync('js/core/GameFeatureManifest.js', 'utf8');
    var featureRuntime = readFileSync('js/core/GameFeatureRuntime.js', 'utf8');
    var manifestFeatures = [
      'market', 'fleet', 'archive', 'save', 'victory', 'onboarding', 'tutorial',
      'settings', 'guidanceAction', 'commerceRuntime', 'advancedGuidance',
      'routeGuidance', 'achievement', 'dialogue', 'randomEvent',
    ];

    expect(gameManager).toContain('createGameFeatureRuntime({');
    expect(featureRuntime).toContain("import { createFeatureRegistry } from './FeatureRegistry.js'");
    expect(featureRuntime).toContain('var registry = createRegistry({');
    expect(featureRuntime).toContain('createGameFeatureManifest({');
    expect(featureRuntime).toContain('registry.registerManifest(manifest)');
    manifestFeatures.forEach(function (feature) {
      expect(featureManifest).toMatch(new RegExp('\\b' + feature + ':\\s*\\{'));
    });
    expect(gameManager).not.toMatch(/let\s+_[A-Za-z0-9]+(?:Module|Promise|Error|Initialized)\s*=/);
    expect(featureManifest).toContain("dependencies: ['commerceRuntime']");
    expect(featureManifest).toContain("dependencies: ['achievement']");
    expect(gameManager).not.toContain("import('../ui/MarketUI.js')");
    expect(gameManager).not.toContain('new URL(\'../../css/fleet.css\'');
  });
});
