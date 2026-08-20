import { describe, expect, it, vi } from 'vitest';
import {
  createCommerceOperationsController,
  normalizeBatchSystemIds,
} from '../js/core/CommerceOperationsController.js';
import {
  MARKET_ECONOMY_ACTION_PRESENTATION,
  MARKET_OPERATIONS_ACTION_PRESENTATION,
} from '../js/core/ActionPresentation.js';

function createHarness(options) {
  var config = options || {};
  var trace = [];
  var presentations = [];
  var state = config.state || { tradeStations: { sol_prime: {}, vega_port: {} } };
  var result = typeof config.result === 'undefined' ? { ok: true } : config.result;
  var runtime = config.runtime === null ? null : {};
  [
    'buildTradeStation',
    'upgradeTradeStation',
    'setTradeStationStrategy',
    'batchUpgradeTradeStations',
    'batchSetTradeStationStrategy',
    'takeLoan',
    'repayLoan',
    'investInTradeStation',
    'redeemTradeStationInvestment',
    'batchInvestInTradeStations',
  ].forEach(function (methodName) {
    if (!runtime) return;
    runtime[methodName] = function () {
      trace.push([methodName].concat(Array.prototype.slice.call(arguments)));
      return result;
    };
  });
  var controller = createCommerceOperationsController({
    getState: function () { trace.push(['getState']); return state; },
    getRuntime: function () { trace.push(['getRuntime']); return runtime; },
    requestRuntime: function () { trace.push(['requestRuntime']); },
    dispatch: function (nextResult, presentation) {
      trace.push(['dispatch', nextResult]);
      presentations.push(presentation);
    },
    recordQuestProgress: function (payload) { trace.push(['quest', payload]); },
    completeTeachingStep: function (chainId, stepId) { trace.push(['teach', chainId, stepId]); },
  });
  return {
    controller: controller,
    trace: trace,
    state: state,
    result: result,
    runtime: runtime,
    presentations: presentations,
  };
}

describe('CommerceOperationsController', function () {
  it('规范化批量系统输入并保留 null 语义', function () {
    expect(normalizeBatchSystemIds(['sol', '', 'vega'])).toEqual(['sol', 'vega']);
    expect(normalizeBatchSystemIds(' sol, ,vega ')).toEqual(['sol', 'vega']);
    expect(normalizeBatchSystemIds(null)).toBeNull();
  });

  it('runtime 未就绪时请求加载，并 dispatch 统一的可重试结果', function () {
    var harness = createHarness({ runtime: null });

    var result = harness.controller.onTakeLoan('starter-loan');

    expect(result).toEqual({
      ok: false,
      msgs: [{ text: '⚠️ 高级经营运行时正在加载，请稍后重试。', type: 'error' }],
    });
    expect(harness.trace.map(function (entry) { return entry[0]; })).toEqual([
      'getState', 'getRuntime', 'requestRuntime', 'dispatch',
    ]);
  });

  it('建站成功后先记录任务和教学，再统一 dispatch', function () {
    var harness = createHarness();

    harness.controller.onBuildTradeStation('sol_prime');

    expect(harness.trace).toEqual([
      ['getState'],
      ['getRuntime'],
      ['buildTradeStation', harness.state, 'sol_prime'],
      ['quest', { action: 'build_trade_station', systemId: 'sol_prime' }],
      ['teach', 'trade-station-basics', 'build-trade-station'],
      ['dispatch', harness.result],
    ]);
  });

  it('失败经营动作不推进任务或教学进度', function () {
    var harness = createHarness({ result: { ok: false } });

    harness.controller.onRepayLoan('loan-1');

    expect(harness.trace.map(function (entry) { return entry[0]; })).toEqual([
      'getState', 'getRuntime', 'repayLoan', 'dispatch',
    ]);
  });

  it('还款成功记录 finance quest 并完成资金教学步骤', function () {
    var harness = createHarness();

    harness.controller.onRepayLoan('loan-1');

    expect(harness.trace.slice(3)).toEqual([
      ['quest', { action: 'finance_action', financeType: 'repay' }],
      ['teach', 'capital-risk', 'review-loan-obligation'],
      ['dispatch', harness.result],
    ]);
  });

  it('批量动作把字符串转换成系统 id 列表', function () {
    var harness = createHarness();

    harness.controller.onBatchSetTradeStationStrategy('growth', ' sol_prime, vega_port ');

    expect(harness.trace[2]).toEqual([
      'batchSetTradeStationStrategy',
      harness.state,
      'growth',
      ['sol_prime', 'vega_port'],
    ]);
  });

  it('批量投资无显式目标时使用当前 state 的全部贸易站', function () {
    var harness = createHarness();

    harness.controller.onBatchInvestTradeStations([], 500);

    expect(harness.trace[2]).toEqual([
      'batchInvestInTradeStations',
      harness.state,
      ['sol_prime', 'vega_port'],
      500,
    ]);
    expect(harness.trace.filter(function (entry) { return entry[0] === 'getState'; })).toHaveLength(1);
  });

  it('资金与有成本经营动作刷新全部市场端口，纯策略动作只刷新经营端口', function () {
    var economyHarness = createHarness();
    var strategyHarness = createHarness();

    economyHarness.controller.onTakeLoan('growth');
    strategyHarness.controller.onSetTradeStationStrategy('sol_prime', 'growth');

    expect(economyHarness.presentations).toEqual([MARKET_ECONOMY_ACTION_PRESENTATION]);
    expect(strategyHarness.presentations).toEqual([MARKET_OPERATIONS_ACTION_PRESENTATION]);
  });

  it('每次动作重新读取最新 state provider', function () {
    var currentState = { id: 'first' };
    var seen = [];
    var runtime = {
      takeLoan: vi.fn(function (state) { seen.push(state.id); return { ok: true }; }),
    };
    var controller = createCommerceOperationsController({
      getState: function () { return currentState; },
      getRuntime: function () { return runtime; },
      dispatch: function () {},
    });

    controller.onTakeLoan('one');
    currentState = { id: 'second' };
    controller.onTakeLoan('two');

    expect(seen).toEqual(['first', 'second']);
  });
});
