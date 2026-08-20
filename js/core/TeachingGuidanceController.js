// js/core/TeachingGuidanceController.js — 教程辅助路线与中期专题教学策略
//
// 教程视图只发布意图；本 controller 读取 latest session，延迟加载路线
// 算法并提交专题教学进度。GameManager 仅负责注入领域与 UI 端口。

import {
  GUIDANCE_ONLY_PRESENTATION,
  NAVIGATION_FOCUS_PRESENTATION,
} from './ActionPresentation.js';

const TUTORIAL_HELPER_ACTIONS = Object.freeze([
  'recommend_first_trade',
  'recommend_sell_route',
]);

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('TeachingGuidanceController requires ' + label + '.');
  return value;
}

export function createTeachingGuidanceController(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var ui = deps.ui || {};
  var data = deps.data || {};
  var Tutorial = systems.Tutorial || {};
  var Trade = systems.Trade || {};
  var MidgameTeachingChain = systems.MidgameTeachingChain || {};
  var Modal = ui.Modal || {};
  var MapUI = ui.MapUI || {};
  var goods = Array.isArray(data.goods) ? data.goods : [];
  var getState = _requiredFunction(deps.getState, 'getState');
  var loadRouteGuidance = _requiredFunction(deps.loadRouteGuidance, 'loadRouteGuidance');
  var getSessionToken = typeof deps.getSessionToken === 'function'
    ? deps.getSessionToken
    : function () { return null; };
  var isSessionTokenCurrent = typeof deps.isSessionTokenCurrent === 'function'
    ? deps.isSessionTokenCurrent
    : function () { return true; };
  var emitLog = typeof deps.emitLog === 'function' ? deps.emitLog : _noop;
  var invalidate = typeof deps.invalidate === 'function' ? deps.invalidate : _noop;
  var refreshActionGuide = typeof deps.refreshActionGuide === 'function' ? deps.refreshActionGuide : _noop;
  var reportFailure = typeof deps.reportFailure === 'function' ? deps.reportFailure : _noop;

  var helperRequestCount = 0;
  var helperPresentationCount = 0;
  var staleDropCount = 0;
  var startedChainCount = 0;
  var completedStepCount = 0;

  function _isCurrent(state, token) {
    return state === getState() && isSessionTokenCurrent(token);
  }

  function _findGood(goodId) {
    return goods.find(function (good) { return good.id === goodId; }) || null;
  }

  function _presentFirstTrade(AutoTrade, state) {
    if (typeof AutoTrade.findBestTrade !== 'function') return false;
    var tradeRecommendation = AutoTrade.findBestTrade(state);
    var recommendedGood = tradeRecommendation ? _findGood(tradeRecommendation.goodId) : null;
    if (!recommendedGood) {
      emitLog({
        text: '⚠️ 当前没有满足资金、货舱与风险条件的首单商品。',
        type: 'error',
      });
      return false;
    }

    var totalCargo = typeof Trade.getTotalCargo === 'function' ? Trade.getTotalCargo(state) : 0;
    var cargoFree = Math.max(0, (state.maxCargo || 0) - totalCargo);
    var suggestedQuantity = Math.max(1, Math.min(
      10,
      cargoFree,
      Math.floor((state.credits || 0) / Math.max(1, tradeRecommendation.buyPrice))
    ));
    if (typeof Modal.openTradeModal !== 'function') return false;
    Modal.openTradeModal('buy', recommendedGood, state, 'open', {
      initialQuantity: suggestedQuantity,
    });
    emitLog({
      text: '🧭 首单建议：买入 ' + recommendedGood.name + '，卖往 ' + tradeRecommendation.sellSystemName + '。确认数量后，下一步会重新核算实际净利。',
      type: 'tip',
    });
    helperPresentationCount += 1;
    return true;
  }

  function _presentSellRoute(AutoTrade, state) {
    var recommendation = typeof AutoTrade.findBestSellSystem === 'function'
      ? AutoTrade.findBestSellSystem(state)
      : null;
    var goodId = Object.keys(state.cargo || {}).find(function (id) {
      return (state.cargo[id] || 0) > 0;
    }) || '';
    var focused = recommendation && typeof MapUI.focusNavigationTarget === 'function'
      ? MapUI.focusNavigationTarget(state, recommendation.systemId, {
          goodId: goodId,
          title: '教程推荐卖货路线',
        })
      : false;

    emitLog({
      text: focused
        ? ('🧭 已标出 ' + recommendation.systemName + '：请核对卖价、燃料与预计净利，再确认出航。')
        : '⚠️ 暂时找不到可达的盈利卖货点，请检查燃料与已开放星球。',
      type: focused ? 'tip' : 'error',
    });
    invalidate(NAVIGATION_FOCUS_PRESENTATION.dirtyRegions);
    if (focused) helperPresentationCount += 1;
    return !!focused;
  }

  function handleTutorialHelperAction(actionId) {
    if (TUTORIAL_HELPER_ACTIONS.indexOf(actionId) === -1) return Promise.resolve(false);
    if (typeof Tutorial.isActive !== 'function' || !Tutorial.isActive()) return Promise.resolve(false);

    var requestedState = getState();
    if (!requestedState || typeof requestedState !== 'object') return Promise.resolve(false);
    var requestedToken = getSessionToken();
    helperRequestCount += 1;

    return Promise.resolve()
      .then(loadRouteGuidance)
      .then(function (AutoTrade) {
        if (!_isCurrent(requestedState, requestedToken)) {
          staleDropCount += 1;
          return false;
        }
        if (!AutoTrade || typeof Tutorial.getStep !== 'function') return false;
        var currentStep = Tutorial.getStep();
        if (!currentStep) return false;

        if (actionId === 'recommend_first_trade') {
          return currentStep.id === 'buy_goods'
            ? _presentFirstTrade(AutoTrade, requestedState)
            : false;
        }
        return currentStep.id === 'travel_hint'
          ? _presentSellRoute(AutoTrade, requestedState)
          : false;
      })
      .catch(function (error) {
        reportFailure(error);
        refreshActionGuide();
        return false;
      });
  }

  function startChain(chainId) {
    var state = getState();
    var chainDefinitions = MidgameTeachingChain.TEACHING_CHAINS || {};
    var chain = Object.values(chainDefinitions).find(function (candidate) {
      return candidate.id === chainId;
    });
    var started = !!(
      state &&
      chain &&
      typeof MidgameTeachingChain.startChain === 'function' &&
      MidgameTeachingChain.startChain(state, chainId)
    );
    if (!started) {
      emitLog({ text: '⚠️ 当前无法启动该专题，请先完成已有专题或解锁对应系统。', type: 'error' });
      refreshActionGuide();
      return false;
    }

    emitLog({
      text: '🧭 已开始专题「' + chain.title + '」：' + chain.description,
      type: 'tip',
    });
    startedChainCount += 1;
    invalidate(GUIDANCE_ONLY_PRESENTATION.dirtyRegions);
    return true;
  }

  function completeStep(chainId, stepId) {
    var state = getState();
    if (!state || typeof MidgameTeachingChain.completeChainStep !== 'function') return null;
    var result = MidgameTeachingChain.completeChainStep(state, chainId, stepId);
    if (result && result.completed) {
      completedStepCount += 1;
      emitLog({ text: result.message, type: 'upgrade' });
    }
    return result;
  }

  function checkCompletion() {
    var state = getState();
    if (!state || typeof MidgameTeachingChain.checkChainCompletion !== 'function') return [];
    var completedChains = MidgameTeachingChain.checkChainCompletion(state) || [];
    completedChains.forEach(function (chainResult) {
      if (!chainResult || !chainResult.message) return;
      emitLog({ text: chainResult.message, type: 'upgrade' });
    });
    return completedChains;
  }

  function getDiagnostics() {
    return Object.freeze({
      completedStepCount: completedStepCount,
      helperPresentationCount: helperPresentationCount,
      helperRequestCount: helperRequestCount,
      staleDropCount: staleDropCount,
      startedChainCount: startedChainCount,
    });
  }

  return Object.freeze({
    checkCompletion: checkCompletion,
    completeStep: completeStep,
    getDiagnostics: getDiagnostics,
    handleTutorialHelperAction: handleTutorialHelperAction,
    startChain: startChain,
  });
}
