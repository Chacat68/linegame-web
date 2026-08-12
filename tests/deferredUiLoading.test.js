import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('deferred terminal UI loading', function () {
  it('市场、舰队和档案界面不再进入首屏静态依赖图', function () {
    var source = readFileSync('js/core/GameManager.js', 'utf8');
    var featureLoader = readFileSync('js/core/DeferredFeatureLoader.js', 'utf8');

    expect(source).not.toMatch(/import\s+\*\s+as\s+MarketUI\s+from/);
    expect(source).not.toMatch(/import\s+\*\s+as\s+FleetUI\s+from/);
    expect(source).not.toMatch(/import\s+\*\s+as\s+(QuestUI|ArchiveExplorationUI|ResearchUI|FactionUI|AchievementUI)\s+from/);
    expect(source).not.toMatch(/import\s+\*\s+as\s+(SaveUI|VictoryResultUI)\s+from/);
    expect(source).toContain("import('../ui/MarketUI.js')");
    expect(source).toContain("import('../ui/FleetUI.js')");
    expect(source).toContain("import('../ui/QuestUI.js')");
    expect(source).toContain("import('../ui/ArchiveExplorationUI.js')");
    expect(source).toContain("import('../ui/ResearchUI.js')");
    expect(source).toContain("import('../ui/FactionUI.js')");
    expect(source).toContain("import('../ui/AchievementUI.js')");
    expect(source).toContain("import('../ui/SaveUI.js')");
    expect(source).toContain("import('../ui/VictoryResultUI.js')");
    expect(source).toContain(".define('market'");
    expect(source).toContain(".define('fleet'");
    expect(source).toContain(".define('archive'");
    expect(source).toContain(".define('save'");
    expect(featureLoader).toContain("_setTelemetryState(feature, 'loading')");
  });

  it('首次打开终端会触发加载，后续全量刷新只更新已加载模块', function () {
    var gameManager = readFileSync('js/core/GameManager.js', 'utf8');
    var uiManager = readFileSync('js/ui/UIManager.js', 'utf8');
    var uiCoordinator = readFileSync('js/ui/GameUiCoordinator.js', 'utf8');

    expect(gameManager).toContain('onOpenHangar: function ()');
    expect(gameManager).toContain("if (tabId === 'tab-fleet') _ensureFleetUiRendered()");
    expect(gameManager).toContain("['tab-quest', 'tab-exploration', 'tab-research', 'tab-faction', 'tab-achievement']");
    expect(gameManager).toContain("var FleetUI = _getDeferredFeature('fleet')");
    expect(gameManager).toContain("var ArchiveUI = _getDeferredFeature('archive')");
    expect(gameManager).toContain("if (MapUI.isMarketOpen() && !_getDeferredFeature('market'))");
    expect(gameManager).toContain('_ensureMarketUiRendered()');
    expect(gameManager).toContain('_getUiCoordinator().renderAll()');
    expect(uiCoordinator).toContain("if (_call(MapUI, 'isMarketOpen', []))");
    expect(uiCoordinator).toContain("var ArchiveUI = _getLoadedFeature('archive')");
    expect(uiCoordinator).toContain("var FleetUI = _getLoadedFeature('fleet')");
    expect(uiCoordinator).toContain("var SaveUI = _getLoadedFeature('save')");
    expect(uiManager).toContain('onOpenHangar: null');
    expect(uiManager).toContain('_handlers.onOpenHangar(state)');
  });

  it('终端样式与对应模块一起按需加载', function () {
    var gameManager = readFileSync('js/core/GameManager.js', 'utf8');
    var featureLoader = readFileSync('js/core/DeferredFeatureLoader.js', 'utf8');
    var styleEntry = readFileSync('css/style.css', 'utf8');
    var sharedCss = readFileSync('css/interstellar-trader.css', 'utf8');

    expect(styleEntry).not.toContain('@import url("fleet.css")');
    expect(gameManager).toContain("new URL('../../css/fleet.css', import.meta.url).href");
    expect(gameManager).toContain("new URL('../../css/hangar-terminal.css', import.meta.url).href");
    expect(gameManager).toContain("new URL('../../css/archive-terminal.css', import.meta.url).href");
    expect(gameManager).toContain("new URL('../../css/market-terminal.css?v=20260717-marketchart1', import.meta.url).href");
    expect(gameManager).toContain("loadDeferredStylesheet('fleet-base', _fleetStylesUrl)");
    expect(gameManager).toContain("loadDeferredStylesheet('hangar-terminal', _hangarTerminalStylesUrl)");
    expect(gameManager).toContain("loadDeferredStylesheet('archive-terminal', _archiveTerminalStylesUrl)");
    expect(gameManager).toContain("loadDeferredStylesheet('market-terminal', _marketTerminalStylesUrl)");
    expect(featureLoader).toContain('link.dataset.deferredUiStyle = feature');
    expect(featureLoader).toContain("document.getElementById('app-styles')");
    expect(featureLoader).toContain('document.head.insertBefore(link, appStyles)');
    expect(featureLoader).toContain("link.dataset.loaded = 'false'");
    expect(featureLoader).toContain('link.parentNode.removeChild(link)');
    expect(sharedCss).toMatch(/#market-overlay\.hidden\s*\{[^}]*display:\s*none\s*!important;/);
    expect(sharedCss).not.toContain('Hangar detail modal shell refinements');
    expect(sharedCss).not.toContain('Archive terminal: quests + research');
    expect(sharedCss).not.toContain('Market matrix controls');
  });

  it('科研阻塞状态使用无 DOM 的轻量引导模块', function () {
    var gameManager = readFileSync('js/core/GameManager.js', 'utf8');
    var guidance = readFileSync('js/ui/ResearchGuidance.js', 'utf8');

    expect(gameManager).toContain("from '../ui/ResearchGuidance.js'");
    expect(guidance).not.toContain('document.');
    expect(guidance).toContain('export function getResearchDispatchBlockerState');
  });

  it('存档和胜利结果只在对应入口触发加载', function () {
    var gameManager = readFileSync('js/core/GameManager.js', 'utf8');
    var settingsManager = readFileSync('js/core/SettingsManager.js', 'utf8');
    var uiCoordinator = readFileSync('js/ui/GameUiCoordinator.js', 'utf8');

    expect(gameManager).toContain('onOpen: function ()');
    expect(gameManager).toContain('_ensureSaveUiRendered()');
    expect(gameManager).toContain('return _getUiCoordinator().ensureSave()');
    expect(uiCoordinator).toContain("return _ensure('save', function (module) { renderSave(module); })");
    expect(gameManager).toContain('_loadVictoryResultUI().then(function (VictoryResultUI)');
    expect(gameManager).toContain('_pendingVictoryReportPathId === reportPathId');
    expect(settingsManager).toContain('if (activeCallbacks.onOpen) activeCallbacks.onOpen()');
  });

  it('剧情与随机事件数据只在首次触发时进入依赖图', function () {
    var gameManager = readFileSync('js/core/GameManager.js', 'utf8');

    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+RandomEvent\s+from/);
    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+Dialogue(UI)?\s+from/);
    expect(gameManager).toContain("import('../systems/story/DialogueSystem.js')");
    expect(gameManager).toContain("import('../ui/DialogueUI.js')");
    expect(gameManager).toContain("import('../systems/event/RandomEvent.js')");
    expect(gameManager).toContain("_setDeferredUiState('dialogue', 'loading')");
    expect(gameManager).toContain("_setDeferredUiState('randomEvent', 'loading')");
    expect(gameManager).toContain('requestedRevision !== _runtimeRevision');
    expect(gameManager).toContain('Save.saveGame(0, requestedState, { isAutosave: true })');
  });

  it('首次进入和教程界面只在对应流程触发时加载', function () {
    var gameManager = readFileSync('js/core/GameManager.js', 'utf8');

    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+(OnboardingUI|TutorialUI)\s+from/);
    expect(gameManager).toContain("import('../ui/OnboardingUI.js')");
    expect(gameManager).toContain("import('../ui/TutorialUI.js')");
    expect(gameManager).toContain("_setDeferredUiState('onboarding', 'loading')");
    expect(gameManager).toContain("_setDeferredUiState('tutorial', 'loading')");
    expect(gameManager).toContain('_loadTutorialUI().then(function (TutorialUI)');
    expect(gameManager).toContain('requestedRevision !== _runtimeRevision');
  });

  it('设置与行动执行器不再进入首屏静态依赖图', function () {
    var gameManager = readFileSync('js/core/GameManager.js', 'utf8');
    var settingsCore = readFileSync('js/core/SettingsCore.js', 'utf8');
    var settingsManager = readFileSync('js/core/SettingsManager.js', 'utf8');
    var main = readFileSync('js/main.js', 'utf8');

    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+Settings\s+from\s+'\.\/SettingsManager\.js'/);
    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+CompanyDirectiveUI\s+from/);
    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+GuidanceAction\s+from/);
    expect(gameManager).toContain("import('./SettingsManager.js')");
    expect(gameManager).not.toContain('CompanyDirectiveUI');
    expect(gameManager).toContain("import('./GuidanceActionController.js')");
    expect(gameManager).toContain("_setDeferredUiState('settings', 'loading')");
    expect(gameManager).toContain("_setDeferredUiState('guidanceAction', 'loading')");
    expect(gameManager).toContain('requestedRevision !== _runtimeRevision');
    expect(settingsCore).not.toContain('ActionConfirmUI');
    expect(settingsCore).not.toContain('settings-modal');
    expect(settingsManager).toContain("from './SettingsCore.js'");
    expect(main).toContain("settingsBtn.dataset.settingsLoaderBound === 'true'");
  });

  it('高级经营、路线搜索和成就定义只在实际需要时加载', function () {
    var gameManager = readFileSync('js/core/GameManager.js', 'utf8');
    var gameTime = readFileSync('js/systems/time/GameTimeSystem.js', 'utf8');
    var tradeSystem = readFileSync('js/systems/trade/TradeSystem.js', 'utf8');
    var fleetSystem = readFileSync('js/systems/fleet/FleetSystem.js', 'utf8');
    var dispatchController = readFileSync('js/core/DispatchController.js', 'utf8');
    var guidanceSystem = readFileSync('js/systems/guidance/GuidanceSystem.js', 'utf8');
    var hud = readFileSync('js/ui/HUD.js', 'utf8');

    expect(gameManager).not.toMatch(/import\s+\*\s+as\s+(Commerce|AutoTrade|Achievement|Finance|TradeStation)\s+from/);
    expect(gameManager).toContain("import('../systems/commerce/CommerceFacade.js')");
    expect(gameManager).toContain("import('../systems/guidance/AdvancedGuidanceSystem.js')");
    expect(gameManager).toContain("import('../systems/trade/AutoTradeSystem.js')");
    expect(gameManager).toContain("import('../systems/achievement/AchievementSystem.js')");
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
});
