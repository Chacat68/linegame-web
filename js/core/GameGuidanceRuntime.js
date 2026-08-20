// js/core/GameGuidanceRuntime.js — 行动引导、教学与命令落点组合运行时
//
// 该运行时把“派生行动候选 → 执行语义命令 → 落到具体工作区”收束为
// 单一边界。GameManager 只注入 latest-state/session、领域系统与动作端口，
// 不再缓存六个互相引用的 controller 或复制它们之间的胶水。

import { GOODS } from '../data/goods.js';
import { getResearchDispatchBlockerState } from '../ui/ResearchGuidance.js';
import { createActionGuideCoordinator } from '../ui/ActionGuideCoordinator.js';
import { createCommandDestinationController } from './CommandDestinationController.js';
import { createGuidanceExecutionAdapter } from './GuidanceExecutionAdapter.js';
import { createOnboardingPolicyController } from './OnboardingPolicyController.js';
import { createOnboardingUiController } from './OnboardingUiController.js';
import { createTeachingGuidanceController } from './TeachingGuidanceController.js';

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('GameGuidanceRuntime requires ' + label + '.');
  return value;
}

function _featurePort(features, method, feature) {
  if (!features || typeof features[method] !== 'function') {
    return method === 'load' ? Promise.resolve(null) : null;
  }
  return features[method](feature);
}

export function createGameGuidanceRuntime(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var ui = deps.ui || {};
  var navigation = deps.navigation || {};
  var actions = deps.actions || {};
  var callbacks = deps.callbacks || {};
  var selectors = deps.selectors || {};
  var features = deps.features || {};
  var factories = Object.assign({
    createActionGuide: createActionGuideCoordinator,
    createCommandDestinations: createCommandDestinationController,
    createExecutionAdapter: createGuidanceExecutionAdapter,
    createOnboardingPolicy: createOnboardingPolicyController,
    createOnboardingUi: createOnboardingUiController,
    createTeaching: createTeachingGuidanceController,
  }, deps.factories || {});
  var getState = _requiredFunction(deps.getState, 'getState');
  var getSessionToken = typeof deps.getSessionToken === 'function'
    ? deps.getSessionToken
    : function () { return null; };
  var isSessionTokenCurrent = typeof deps.isSessionTokenCurrent === 'function'
    ? deps.isSessionTokenCurrent
    : function () { return true; };
  var emitLog = typeof callbacks.emitLog === 'function' ? callbacks.emitLog : _noop;
  var invalidate = typeof callbacks.invalidate === 'function' ? callbacks.invalidate : _noop;

  var actionGuide = null;
  var execution = null;

  function refresh() {
    return actionGuide && typeof actionGuide.refresh === 'function'
      ? actionGuide.refresh()
      : null;
  }

  function showCompletion(completion, options) {
    if (!completion || !actionGuide || typeof actionGuide.showCompletion !== 'function') return undefined;
    if (typeof completion === 'string') return actionGuide.showCompletion(completion, '', options);
    return actionGuide.showCompletion(completion.message, completion.detail, options);
  }

  function reportTeachingFailure(error) {
    if (typeof callbacks.reportError === 'function') callbacks.reportError('teaching-route', error);
    emitLog({ text: '⚠️ 教程路线辅助暂时不可用，请稍后重试。', type: 'error' });
  }

  function reportExecutionFailure(error) {
    if (typeof callbacks.reportError === 'function') callbacks.reportError('guidance-action', error);
    emitLog({ text: '⚠️ 当前行动执行失败，请重试。', type: 'error' });
  }

  var onboardingPolicy = factories.createOnboardingPolicy({
    Quest: systems.Quest,
    getState: getState,
    emitLog: emitLog,
    refreshActionGuide: refresh,
  });

  var teaching = factories.createTeaching({
    getState: getState,
    getSessionToken: getSessionToken,
    isSessionTokenCurrent: isSessionTokenCurrent,
    loadRouteGuidance: function () { return _featurePort(features, 'load', 'routeGuidance'); },
    systems: {
      Tutorial: systems.Tutorial,
      Trade: systems.Trade,
      MidgameTeachingChain: systems.MidgameTeachingChain,
    },
    ui: { Modal: ui.Modal, MapUI: ui.MapUI },
    data: { goods: GOODS },
    emitLog: emitLog,
    invalidate: invalidate,
    refreshActionGuide: refresh,
    reportFailure: reportTeachingFailure,
  });

  var commandDestinations = factories.createCommandDestinations({
    getState: getState,
    getSessionToken: getSessionToken,
    isSessionTokenCurrent: isSessionTokenCurrent,
    getLoadedArchive: function () { return _featurePort(features, 'get', 'archive'); },
    loadArchive: function () { return _featurePort(features, 'load', 'archive'); },
    loadFleet: function () { return _featurePort(features, 'load', 'fleet'); },
    loadMarket: function () { return _featurePort(features, 'load', 'market'); },
    getFleetActions: _requiredFunction(actions.getFleetActions, 'actions.getFleetActions'),
    renderFleet: _requiredFunction(callbacks.renderFleet, 'callbacks.renderFleet'),
    systems: { Economy: systems.Economy, Fleet: systems.Fleet },
    ui: { Modal: ui.Modal },
    navigation: navigation,
    data: { goods: GOODS },
    emitLog: emitLog,
    refreshActionGuide: refresh,
    showCompletion: showCompletion,
  });

  execution = factories.createExecutionAdapter({
    getState: getState,
    getSessionToken: getSessionToken,
    isSessionTokenCurrent: isSessionTokenCurrent,
    loadController: function () { return _featurePort(features, 'load', 'guidanceAction'); },
    ports: {
      ui: {
        showProcessing: function (suggestion, message) {
          if (actionGuide && typeof actionGuide.showProcessing === 'function') {
            return actionGuide.showProcessing(suggestion, message);
          }
        },
        refreshActionGuide: refresh,
        invalidate: invalidate,
        showCompletion: function (message, detail, options) {
          if (actionGuide && typeof actionGuide.showCompletion === 'function') {
            return actionGuide.showCompletion(message, detail, options);
          }
        },
        emitLog: emitLog,
        reportFailure: reportExecutionFailure,
      },
      navigation: {
        prepareDirectExecution: function () {
          if (typeof navigation.returnToMap === 'function') navigation.returnToMap();
        },
        activateTab: navigation.activateWorkspaceTab,
        focusStarmap: navigation.returnToMap,
        focusNavigationTarget: ui.MapUI && ui.MapUI.focusNavigationTarget,
        openMarketPanel: navigation.openMarketPanel,
        openMarketSystemPanel: navigation.openMarketSystemPanel,
        revealMarketGoodFocus: commandDestinations.revealMarketGoodFocus,
      },
      trade: {
        openConfirmation: commandDestinations.openTradeConfirmation,
        refuel: actions.refuel,
      },
      quest: {
        accept: actions.acceptQuest,
        selectAvailable: commandDestinations.selectAvailableQuest,
      },
      fleet: {
        openRecommendedDispatch: commandDestinations.openRecommendedDispatch,
        openRecommendedMod: commandDestinations.openRecommendedMod,
      },
      events: { forcePending: ui.EventUI && ui.EventUI.forcePendingEvent },
      teaching: { startChain: teaching.startChain },
      exploration: {
        revealArchiveReportFocus: commandDestinations.revealArchiveReportFocus,
        acknowledgeSurveyChainFollowup: function (systemId, chainId) {
          return systems.Exploration && typeof systems.Exploration.acknowledgeChainFollowup === 'function'
            ? systems.Exploration.acknowledgeChainFollowup(getState(), systemId, chainId)
            : false;
        },
        acknowledgeSurveyReport: function (systemId, reportId) {
          return systems.Exploration && typeof systems.Exploration.acknowledgeSurveyReport === 'function'
            ? systems.Exploration.acknowledgeSurveyReport(getState(), systemId, reportId)
            : false;
        },
        explorePoi: actions.explorePoi,
      },
      travel: { execute: actions.travel },
    },
  });

  actionGuide = factories.createActionGuide({
    getState: getState,
    features: features,
    ui: {
      ActionGuideUI: ui.ActionGuideUI,
      Navigation: navigation,
      UIManager: ui.UIManager,
      EventUI: ui.EventUI,
    },
    systems: {
      Guidance: systems.Guidance,
      Tutorial: systems.Tutorial,
      Fleet: systems.Fleet,
      GalaxyData: systems.GalaxyData,
      Exploration: systems.Exploration,
      MidgameTeachingChain: systems.MidgameTeachingChain,
    },
    selectors: {
      getResearchDispatchBlockerState: selectors.getResearchDispatchBlockerState || getResearchDispatchBlockerState,
      getPoiStatus: actions.getPoiStatus,
      hasBlockingSurfaceOpen: selectors.hasBlockingSurfaceOpen,
    },
    hooks: {
      onAction: function (suggestion) { return execution.execute(suggestion); },
    },
  });

  var onboardingUi = factories.createOnboardingUi({
    features: features,
    Tutorial: systems.Tutorial,
    getState: getState,
    getSessionToken: getSessionToken,
    isSessionTokenCurrent: isSessionTokenCurrent,
    callbacks: {
      emitMessage: emitLog,
      invalidate: invalidate,
      onHelperAction: teaching.handleTutorialHelperAction,
      refreshActionGuide: refresh,
      renameCompany: function (state, name) { state.companyName = name; },
      showWelcomeMessages: onboardingPolicy.showWelcomeMessages,
    },
  });

  function reset() {
    if (actionGuide && typeof actionGuide.reset === 'function') actionGuide.reset();
    if (commandDestinations && typeof commandDestinations.reset === 'function') commandDestinations.reset();
  }

  function getDiagnostics() {
    return Object.freeze({
      actionGuide: actionGuide && typeof actionGuide.getDiagnostics === 'function' ? actionGuide.getDiagnostics() : null,
      commands: commandDestinations && typeof commandDestinations.getDiagnostics === 'function'
        ? commandDestinations.getDiagnostics()
        : null,
      execution: execution && typeof execution.getDiagnostics === 'function' ? execution.getDiagnostics() : null,
      onboarding: onboardingUi && typeof onboardingUi.getDiagnostics === 'function' ? onboardingUi.getDiagnostics() : null,
      policy: onboardingPolicy && typeof onboardingPolicy.getDiagnostics === 'function'
        ? onboardingPolicy.getDiagnostics()
        : null,
      teaching: teaching && typeof teaching.getDiagnostics === 'function' ? teaching.getDiagnostics() : null,
    });
  }

  return Object.freeze({
    actionGuide: actionGuide,
    checkTeachingCompletion: teaching.checkCompletion,
    commandDestinations: commandDestinations,
    completeTeachingStep: teaching.completeStep,
    execute: execution.execute,
    getDiagnostics: getDiagnostics,
    getDispatchContext: actionGuide.getDispatchContext,
    handleTutorialHelperAction: teaching.handleTutorialHelperAction,
    onboardingPolicy: onboardingPolicy,
    onboardingUi: onboardingUi,
    openRecommendedDispatch: commandDestinations.openRecommendedDispatch,
    prefetchForState: actionGuide.prefetchForState,
    refresh: refresh,
    reset: reset,
    selectAvailableQuest: commandDestinations.selectAvailableQuest,
    setRecentModInstallContext: actionGuide.setRecentModInstallContext,
    showCompletion: showCompletion,
    startTeachingChain: teaching.startChain,
    syncArchiveView: commandDestinations.syncArchiveView,
    syncTutorialView: onboardingUi.syncTutorialView,
  });
}
