// js/core/GameUiLifecycleController.js — eager UI 壳层的绑定、进入与释放
//
// GameUiCoordinator 负责投影与增量刷新；本 controller 只管理静态 UI 模块
// 的初始化接线、教程完成订阅、首次进入呈现和可释放 listener/launcher。

const ARCHIVE_TAB_IDS = Object.freeze([
  'tab-quest',
  'tab-exploration',
  'tab-research',
  'tab-faction',
  'tab-achievement',
]);

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('GameUiLifecycleController requires ' + label + '.');
  return value;
}

function _call(target, methodName, args) {
  if (!target || typeof target[methodName] !== 'function') return undefined;
  return target[methodName].apply(target, args || []);
}

export function createGameUiLifecycleController(dependencies) {
  var deps = dependencies || {};
  var ui = deps.ui || {};
  var systems = deps.systems || {};
  var controllers = deps.controllers || {};
  var ports = deps.ports || {};
  var features = deps.features || {};
  var events = deps.events || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var getRevision = typeof deps.getRevision === 'function'
    ? deps.getRevision
    : function () { return 0; };
  var setTelemetryState = typeof deps.setTelemetryState === 'function'
    ? deps.setTelemetryState
    : _noop;
  var emitLog = typeof deps.emitLog === 'function' ? deps.emitLog : _noop;

  var HUD = ui.HUD || {};
  var MapUI = ui.MapUI || {};
  var UIManager = ui.UIManager || {};
  var WorkspaceDetailSurface = ui.WorkspaceDetailSurface || {};
  var Modal = ui.Modal || {};
  var Renderer = ui.Renderer || {};
  var Tutorial = systems.Tutorial || {};
  var actionGuide = controllers.actionGuide || {};
  var onboardingUi = controllers.onboardingUi || {};
  var onboardingPolicy = controllers.onboardingPolicy || {};
  var settingsUi = controllers.settingsUi || {};

  var initialized = false;
  var disposed = false;
  var initializeCount = 0;
  var entryPresentationCount = 0;
  var tutorialCompleteListener = null;

  function _releaseTutorialCompleteListener() {
    if (tutorialCompleteListener && typeof events.off === 'function') {
      events.off('tutorial:complete', tutorialCompleteListener);
    }
    tutorialCompleteListener = null;
  }

  function _bindTutorialCompleteListener() {
    _releaseTutorialCompleteListener();
    if (typeof events.on !== 'function') return false;
    tutorialCompleteListener = function () {
      _call(onboardingPolicy, 'handleTutorialComplete', []);
    };
    events.on('tutorial:complete', tutorialCompleteListener);
    return true;
  }

  function _handleTabClick(tabId) {
    if (tabId === 'tab-fleet') _call(ports, 'ensureFleet', []);
    if (ARCHIVE_TAB_IDS.indexOf(tabId) !== -1) _call(ports, 'ensureArchive', []);
    _call(Tutorial, 'checkTabClick', [tabId]);
  }

  function _bindWorkspaceNavigation() {
    _call(UIManager, 'init', [getState, {
      onOpenMarket: function (state) { return _call(ports, 'openMarket', [state]); },
      onCloseMarket: function (options) { return _call(ports, 'closeMarket', [options]); },
      onGetMarketOpen: function () { return !!_call(ports, 'isMarketOpen', []); },
      onOpenHangar: function () { return _call(ports, 'ensureFleet', []); },
      onOpenQuests: function (state) {
        _call(ports, 'openQuests', [state]);
        return _call(ports, 'ensureArchive', []);
      },
    }]);
  }

  function initialize() {
    disposed = false;

    _call(HUD, 'init', [{
      stateSource: getState,
      revisionSource: getRevision,
    }]);
    _call(HUD, 'setQuestActions', [{ onAcceptQuest: ports.acceptQuest }]);
    _call(HUD, 'setVictoryActions', [{ onChoosePolicy: ports.chooseVictoryPolicy }]);

    _call(MapUI, 'init', [getState, ports.travel, ports.galaxyJump]);
    _bindWorkspaceNavigation();
    _call(WorkspaceDetailSurface, 'init', [{
      navigation: UIManager,
      stateSource: getState,
      revisionSource: getRevision,
    }]);
    _call(MapUI, 'setExplorationActions', [{
      onExplorePoi: ports.explorePoi,
      getPoiStatus: ports.getPoiStatus,
    }]);
    _call(MapUI, 'initTabs', [_handleTabClick]);
    _call(MapUI, 'setNavigationChangeCallback', [ports.refreshActionGuide]);

    _call(actionGuide, 'init', []);
    setTelemetryState('guidanceAction', _call(features, 'getState', ['guidanceAction']));

    _call(MapUI, 'init3DCallbacks', [getState, ports.travel, ports.galaxyJump]);
    _call(MapUI, 'setRefreshMarket', [function () { return _call(ports, 'refreshMarket', []); }]);
    _call(Modal, 'init', [ports.confirmTrade]);

    _call(features, 'sync', ['tutorial']);
    setTelemetryState('onboarding', _call(features, 'getState', ['onboarding']));
    _bindTutorialCompleteListener();
    _call(onboardingUi, 'bindCompanyLauncher', []);
    _call(settingsUi, 'bindLauncher', []);

    initialized = true;
    initializeCount += 1;
    return true;
  }

  function presentEntry(options) {
    var opts = options || {};
    if (opts.restoredAutosave) {
      emitLog({ text: '📂 已自动恢复最近进度。', type: 'info' });
    }
    if (typeof Tutorial.isCompleted === 'function' && !Tutorial.isCompleted()) {
      _call(onboardingUi, 'showTutorialStart', []);
    } else {
      _call(onboardingPolicy, 'showWelcomeMessages', []);
    }
    entryPresentationCount += 1;
  }

  function whenSceneReady() {
    return Promise.resolve().then(function () {
      if (typeof Renderer.whenSceneReady === 'function') return Renderer.whenSceneReady();
      return {
        renderer: typeof Renderer.getActiveRendererName === 'function'
          ? Renderer.getActiveRendererName()
          : 'unknown',
      };
    });
  }

  function dispose() {
    if (disposed && !initialized) return false;
    _releaseTutorialCompleteListener();
    if (initialized) {
      _call(MapUI, 'setNavigationChangeCallback', [null]);
      _call(MapUI, 'setRefreshMarket', [null]);
      _call(MapUI, 'setExplorationActions', [null]);
      _call(Modal, 'init', [null]);
    }
    _call(onboardingUi, 'dispose', []);
    _call(settingsUi, 'dispose', []);
    _call(actionGuide, 'dispose', []);
    _call(MapUI, 'dispose', []);
    _call(WorkspaceDetailSurface, 'dispose', []);
    _call(UIManager, 'dispose', []);
    initialized = false;
    disposed = true;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      disposed: disposed,
      entryPresentationCount: entryPresentationCount,
      initializeCount: initializeCount,
      initialized: initialized,
      tutorialCompleteListenerBound: !!tutorialCompleteListener,
    });
  }

  return Object.freeze({
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    initialize: initialize,
    presentEntry: presentEntry,
    whenSceneReady: whenSceneReady,
  });
}
