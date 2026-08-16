// js/core/GuidanceExecutionAdapter.js — 当前行动执行器的异步与端口适配边界
//
// GuidanceActionController 保持 actionType 分发纯度；本 adapter 将分域 ports
// 映射为兼容 context，并统一 processing、延迟加载与 stale-session 丢弃。

import { getProcessingMessage } from './GuidanceActionFeedback.js';

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('GuidanceExecutionAdapter requires ' + label + '.');
  return value;
}

function _port(group, name) {
  return group && typeof group[name] === 'function' ? group[name] : undefined;
}

export function createGuidanceExecutionAdapter(dependencies) {
  var deps = dependencies || {};
  var ports = deps.ports || {};
  var ui = ports.ui || {};
  var navigation = ports.navigation || {};
  var trade = ports.trade || {};
  var quest = ports.quest || {};
  var fleet = ports.fleet || {};
  var events = ports.events || {};
  var teaching = ports.teaching || {};
  var exploration = ports.exploration || {};
  var travel = ports.travel || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var loadController = _requiredFunction(deps.loadController, 'loadController');
  var getSessionToken = typeof deps.getSessionToken === 'function'
    ? deps.getSessionToken
    : function () { return null; };
  var isSessionTokenCurrent = typeof deps.isSessionTokenCurrent === 'function'
    ? deps.isSessionTokenCurrent
    : function () { return true; };

  var executionCount = 0;
  var staleDropCount = 0;

  function _refreshActionGuide() {
    var refresh = _port(ui, 'refreshActionGuide');
    if (refresh) refresh();
  }

  function _isCurrent(state, token) {
    return state === getState() && isSessionTokenCurrent(token);
  }

  function _createContext() {
    return {
      getState: getState,
      prepareDirectExecution: _port(navigation, 'prepareDirectExecution'),
      acceptQuest: _port(quest, 'accept'),
      selectAvailableQuest: _port(quest, 'selectAvailable'),
      activateTab: _port(navigation, 'activateTab'),
      updateUI: _port(ui, 'invalidate'),
      openTradeConfirmation: _port(trade, 'openConfirmation'),
      refuel: _port(trade, 'refuel'),
      forcePendingEvent: _port(events, 'forcePending'),
      refreshActionGuide: _port(ui, 'refreshActionGuide'),
      startTeachingChain: _port(teaching, 'startChain'),
      openRecommendedDispatch: _port(fleet, 'openRecommendedDispatch'),
      openRecommendedMod: _port(fleet, 'openRecommendedMod'),
      showCompletion: _port(ui, 'showCompletion'),
      emitLog: _port(ui, 'emitLog'),
      openMarketPanel: _port(navigation, 'openMarketPanel'),
      openMarketSystemPanel: _port(navigation, 'openMarketSystemPanel'),
      revealMarketGoodFocus: _port(navigation, 'revealMarketGoodFocus'),
      revealArchiveReportFocus: _port(exploration, 'revealArchiveReportFocus'),
      acknowledgeSurveyChainFollowup: _port(exploration, 'acknowledgeSurveyChainFollowup'),
      acknowledgeSurveyReport: _port(exploration, 'acknowledgeSurveyReport'),
      travel: _port(travel, 'execute'),
      focusStarmap: _port(navigation, 'focusStarmap'),
      focusNavigationTarget: _port(navigation, 'focusNavigationTarget'),
      explorePoi: _port(exploration, 'explorePoi'),
    };
  }

  function execute(suggestion) {
    if (!suggestion || !suggestion.actionType) return Promise.resolve(false);
    var requestedState = getState();
    var requestedToken = getSessionToken();
    var showProcessing = _port(ui, 'showProcessing');
    if (showProcessing) showProcessing(suggestion, getProcessingMessage(suggestion));

    return Promise.resolve(loadController())
      .then(function (GuidanceAction) {
        if (!_isCurrent(requestedState, requestedToken)) {
          staleDropCount += 1;
          _refreshActionGuide();
          return false;
        }
        if (!GuidanceAction || typeof GuidanceAction.handleGuidanceAction !== 'function') {
          _refreshActionGuide();
          return false;
        }
        executionCount += 1;
        GuidanceAction.handleGuidanceAction(suggestion, _createContext());
        return true;
      })
      .catch(function (error) {
        var reportFailure = _port(ui, 'reportFailure');
        if (reportFailure) reportFailure(error);
        _refreshActionGuide();
        return false;
      });
  }

  function getDiagnostics() {
    return Object.freeze({
      executionCount: executionCount,
      staleDropCount: staleDropCount,
    });
  }

  return Object.freeze({
    execute: execute,
    getDiagnostics: getDiagnostics,
  });
}
