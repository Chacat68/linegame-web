import { describe, expect, it } from 'vitest';
import { createActionExecutionPipeline } from '../js/core/ActionExecutionPipeline.js';
import { createTradeActionController } from '../js/core/TradeActionController.js';

function createHarness(options) {
  var config = options || {};
  var trace = [];
  var ship = {
    route: config.route || null,
    operatingStats: {},
  };
  var state = {
    currentSystem: 'sol_prime',
    tradeCount: 0,
    reputation: 0,
  };
  var result = config.result || {
    ok: true,
    msgs: [{ text: 'trade result', type: 'info' }],
    meta: { totalCost: 40, totalEarned: 55, unitBuyPrice: 8, profit: 15 },
  };
  var pipeline = createActionExecutionPipeline({
    emitMessage: function (message) { trace.push('result-message:' + message.text); },
    emitErrorCue: function () { trace.push('error-cue'); },
    queueAchievementCheck: function () { trace.push('achievement:' + state.tradeCount); },
    render: function () { trace.push('render:' + state.tradeCount); },
    checkVictory: function () { trace.push('victory:' + state.tradeCount); },
  });
  var controller = createTradeActionController({
    getState: function () { trace.push('get-state'); return state; },
    systems: {
      Trade: {
        buyGoodOnMarket: function () { trace.push('buy'); return result; },
        sellGoodOnMarket: function () { trace.push('sell'); return result; },
      },
      Economy: {
        recordBlackMarketTrade: function () { trace.push('black-record'); },
      },
      Fleet: {
        syncStateFromShip: function () { trace.push('sync-state'); },
        getActiveShip: function () { return ship; },
        commitActiveShipState: function () { trace.push('commit-ship'); },
      },
      Faction: {
        onTrade: function () { trace.push('faction'); return [{ text: 'faction-msg', type: 'info' }]; },
        getFactionForSystem: function () { return { id: 'federation' }; },
      },
      Quest: {
        checkProgress: function (nextState, payload) {
          trace.push('quest:' + payload.profit);
          return { msgs: [{ text: 'quest-msg', type: 'info' }], completedQuests: [] };
        },
      },
      Tutorial: {
        checkTrigger: function (action) { trace.push('tutorial:' + action); },
      },
      Progression: {
        gainExperience: function () { trace.push('experience'); return { msgs: [] }; },
        gainCompanyExperience: function () { trace.push('company-exp'); return { msgs: [] }; },
      },
    },
    pipeline: pipeline,
    returnToStarmap: function () { trace.push('return-starmap'); },
    emitAudio: function (cue) { trace.push('audio:' + cue); },
    emitMessage: function (message) { trace.push('side-message:' + message.text); },
    queueQuestDialogueResult: function () { trace.push('quest-dialogue'); },
  });
  return { controller: controller, trace: trace, state: state, ship: ship, result: result };
}

describe('TradeActionController', function () {
  it('公开买入在完整统计与任务更新后才提交渲染/成就/胜利', function () {
    var harness = createHarness();

    harness.controller.confirm('buy', 'food', 2, 'open');

    expect(harness.trace).toEqual([
      'get-state', 'sync-state', 'buy', 'return-starmap', 'audio:trade.buy', 'commit-ship',
      'tutorial:buy', 'faction', 'side-message:faction-msg', 'experience', 'company-exp',
      'quest:0', 'side-message:quest-msg', 'quest-dialogue',
      'result-message:trade result', 'achievement:1', 'render:1', 'victory:1',
    ]);
    expect(harness.state.tradeCount).toBe(1);
    expect(harness.state.reputation).toBe(1);
  });

  it('自动派遣卖出成功在提交前累计收入与循环数', function () {
    var harness = createHarness({ route: { goodId: 'food', status: 'selling' } });

    harness.controller.confirm('sell', 'food', 2, 'open');

    expect(harness.ship.operatingStats.revenue).toBe(55);
    expect(harness.ship.operatingStats.tradeCycles).toBe(1);
    expect(harness.ship.route.lastBuyPrice).toBeNull();
    expect(harness.trace.indexOf('quest:15')).toBeLessThan(harness.trace.indexOf('render:1'));
  });

  it('自动派遣买入记录货物成本和成交价', function () {
    var harness = createHarness({ route: { goodId: 'food', status: 'buying' } });

    harness.controller.confirm('buy', 'food', 2, 'open');

    expect(harness.ship.operatingStats.cargoCost).toBe(40);
    expect(harness.ship.route.lastBuyPrice).toBe(8);
  });

  it('黑市交易记录风险数据但不推进公开市场任务和公司经验', function () {
    var harness = createHarness();

    harness.controller.confirm('buy', 'weapons', 1, 'black');

    expect(harness.trace).toContain('black-record');
    expect(harness.trace).not.toContain('company-exp');
    expect(harness.trace.some(function (entry) { return entry.indexOf('quest:') === 0; })).toBe(false);
    expect(harness.trace).not.toContain('quest-dialogue');
  });

  it('失败交易不关闭市场、不写统计，并只走失败提交', function () {
    var harness = createHarness({ result: { ok: false, msgs: [{ text: 'no', type: 'error' }] } });

    harness.controller.confirm('buy', 'food', 99, 'open');

    expect(harness.trace).toEqual([
      'get-state', 'sync-state', 'buy', 'result-message:no', 'error-cue', 'achievement:0', 'render:0',
    ]);
    expect(harness.state.tradeCount).toBe(0);
  });
});
