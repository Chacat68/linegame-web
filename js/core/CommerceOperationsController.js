// js/core/CommerceOperationsController.js — 贸易站经营与金融动作编排
//
// 高级经营模块仍可延迟加载；controller 对 UI 暴露稳定同步动作契约，
// runtime 未就绪时返回统一可展示结果，避免 GameManager 重复加载判断。

import {
  MARKET_ECONOMY_ACTION_PRESENTATION,
  MARKET_OPERATIONS_ACTION_PRESENTATION,
} from './ActionPresentation.js';

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('CommerceOperationsController requires ' + label + '.');
  return value;
}

function _isOk(result) {
  return !!(result && result.ok);
}

export function normalizeBatchSystemIds(systemIds) {
  if (Array.isArray(systemIds)) return systemIds.filter(Boolean);
  if (typeof systemIds === 'string') {
    return systemIds.split(',').map(function (entry) { return entry.trim(); }).filter(Boolean);
  }
  return null;
}

export function createCommerceOperationsController(dependencies) {
  var deps = dependencies || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var getRuntime = _requiredFunction(deps.getRuntime, 'getRuntime');
  var requestRuntime = typeof deps.requestRuntime === 'function' ? deps.requestRuntime : _noop;
  var dispatch = _requiredFunction(deps.dispatch, 'dispatch');
  var recordQuestProgress = typeof deps.recordQuestProgress === 'function' ? deps.recordQuestProgress : _noop;
  var completeTeachingStep = typeof deps.completeTeachingStep === 'function' ? deps.completeTeachingStep : _noop;

  function _run(methodName, args, stateOverride) {
    var state = stateOverride || getState();
    if (!state || typeof state !== 'object') throw new Error('CommerceOperationsController requires an active state.');
    var runtime = getRuntime();
    if (runtime && typeof runtime[methodName] === 'function') {
      return runtime[methodName].apply(null, [state].concat(args || []));
    }
    requestRuntime();
    return {
      ok: false,
      msgs: [{ text: '⚠️ 高级经营运行时正在加载，请稍后重试。', type: 'error' }],
    };
  }

  function _commit(result, presentation) {
    dispatch(result, presentation || MARKET_ECONOMY_ACTION_PRESENTATION);
    return result;
  }

  function onBuildTradeStation(systemId) {
    var result = _run('buildTradeStation', [systemId]);
    if (_isOk(result)) {
      recordQuestProgress({ action: 'build_trade_station', systemId: systemId });
      completeTeachingStep('trade-station-basics', 'build-trade-station');
    }
    return _commit(result);
  }

  function onUpgradeTradeStation(systemId) {
    var result = _run('upgradeTradeStation', [systemId]);
    if (_isOk(result)) completeTeachingStep('trade-station-basics', 'upgrade-trade-station');
    return _commit(result);
  }

  function onSetTradeStationStrategy(systemId, strategyId) {
    return _commit(
      _run('setTradeStationStrategy', [systemId, strategyId]),
      MARKET_OPERATIONS_ACTION_PRESENTATION
    );
  }

  function onBatchUpgradeTradeStations(systemIds) {
    return _commit(_run('batchUpgradeTradeStations', [normalizeBatchSystemIds(systemIds)]));
  }

  function onBatchSetTradeStationStrategy(strategyId, systemIds) {
    return _commit(
      _run('batchSetTradeStationStrategy', [strategyId, normalizeBatchSystemIds(systemIds)]),
      MARKET_OPERATIONS_ACTION_PRESENTATION
    );
  }

  function onTakeLoan(offerId) {
    var result = _run('takeLoan', [offerId]);
    if (_isOk(result)) recordQuestProgress({ action: 'finance_action', financeType: 'loan' });
    return _commit(result);
  }

  function onRepayLoan(loanId) {
    var result = _run('repayLoan', [loanId]);
    if (_isOk(result)) {
      recordQuestProgress({ action: 'finance_action', financeType: 'repay' });
      completeTeachingStep('capital-risk', 'review-loan-obligation');
    }
    return _commit(result);
  }

  function onInvestTradeStation(systemId) {
    var result = _run('investInTradeStation', [systemId]);
    if (_isOk(result)) recordQuestProgress({ action: 'finance_action', financeType: 'investment' });
    return _commit(result);
  }

  function onRedeemTradeStationInvestment(systemId) {
    var result = _run('redeemTradeStationInvestment', [systemId]);
    if (_isOk(result)) recordQuestProgress({ action: 'finance_action', financeType: 'investment_exit' });
    return _commit(result);
  }

  function onBatchInvestTradeStations(systemIds, amount) {
    var state = getState();
    if (!state || typeof state !== 'object') throw new Error('CommerceOperationsController requires an active state.');
    var normalizedSystemIds = normalizeBatchSystemIds(systemIds);
    var targetSystemIds = normalizedSystemIds && normalizedSystemIds.length > 0
      ? normalizedSystemIds
      : Object.keys(state.tradeStations || {});
    return _commit(_run('batchInvestInTradeStations', [targetSystemIds, amount], state));
  }

  return Object.freeze({
    onBuildTradeStation: onBuildTradeStation,
    onUpgradeTradeStation: onUpgradeTradeStation,
    onSetTradeStationStrategy: onSetTradeStationStrategy,
    onBatchUpgradeTradeStations: onBatchUpgradeTradeStations,
    onBatchSetTradeStationStrategy: onBatchSetTradeStationStrategy,
    onTakeLoan: onTakeLoan,
    onRepayLoan: onRepayLoan,
    onInvestTradeStation: onInvestTradeStation,
    onRedeemTradeStationInvestment: onRedeemTradeStationInvestment,
    onBatchInvestTradeStations: onBatchInvestTradeStations,
  });
}
