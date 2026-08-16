import { describe, expect, it, vi } from 'vitest';
import {
  buildVictoryStats,
  createVictoryRuntimeController,
} from '../js/core/VictoryRuntimeController.js';

function createHarness(options) {
  var config = options || {};
  var state = config.state || {
    day: 42,
    experience: 100,
    tradeCount: 8,
    researchedTechs: ['a'],
    completedQuests: ['q'],
    achievements: ['x'],
    visitedSystems: ['sol'],
    visitedGalaxies: ['milky_way'],
  };
  var token = { id: 'session-a' };
  var activeToken = token;
  var callbacks = null;
  var shownPayloads = [];
  var view = {
    init: vi.fn(function (nextCallbacks) { callbacks = nextCallbacks; }),
    showVictoryReport: vi.fn(function (payload) { shownPayloads.push(payload); return true; }),
  };
  var victoryResult = config.victoryResult || {
    won: true,
    path: { id: 'trade_baron', victoryTitle: '贸易霸权' },
  };
  var seenAcknowledged = [];
  var controller = createVictoryRuntimeController({
    getState: function () { return state; },
    getSessionToken: function () { return token; },
    isSessionTokenCurrent: function (requested) { return requested === activeToken; },
    systems: {
      Victory: {
        checkVictory: function (currentState, acknowledged) {
          seenAcknowledged.push(Array.from(acknowledged));
          return victoryResult;
        },
        getProgress: function () { return [{ pathId: 'trade_baron', progress: 1 }]; },
      },
      BalanceMetrics: {
        recordRouteCompletion: vi.fn(function () {
          return { selectedDay: 10, daysToComplete: 32 };
        }),
      },
      Trade: { getNetWorth: function () { return 123456; } },
    },
    getLevelTitle: function () { return '星际商人'; },
    loadView: config.loadView || function () { return Promise.resolve(view); },
    emitMessage: config.emitMessage,
    refreshActionGuide: config.refreshActionGuide,
    restartSession: config.restartSession,
  });
  return {
    controller: controller,
    view: view,
    shownPayloads: shownPayloads,
    seenAcknowledged: seenAcknowledged,
    getCallbacks: function () { return callbacks; },
    replaceState: function (nextState) { state = nextState; },
    invalidateToken: function () { activeToken = { id: 'session-b' }; },
    setVictoryResult: function (next) { victoryResult = next; },
  };
}

describe('VictoryRuntimeController', function () {
  it('构造结算数据、绑定视图并只呈现一次待处理路线', async function () {
    var resolveView;
    var loadCalls = 0;
    var harness = createHarness({
      loadView: function () {
        loadCalls += 1;
        return new Promise(function (resolve) { resolveView = resolve; });
      },
    });

    var pending = harness.controller.check();
    expect(harness.controller.check()).toBeNull();
    resolveView(harness.view);
    await expect(pending).resolves.toBe(true);

    expect(loadCalls).toBe(1);
    expect(harness.view.init).toHaveBeenCalledOnce();
    expect(harness.shownPayloads).toHaveLength(1);
    expect(harness.shownPayloads[0].path.id).toBe('trade_baron');
    expect(harness.shownPayloads[0].stats).toEqual(expect.arrayContaining([
      { label: '玩家等级', value: '星际商人' },
      { label: '净资产', value: '123,456 信用积分' },
      { label: '路线用时', value: '第 10 天选择 · 32 天达成' },
    ]));
    expect(harness.controller.getDiagnostics()).toMatchObject({
      pendingReportPathId: 'trade_baron',
      reportCount: 1,
    });
  });

  it('延迟视图在 session 替换后不得呈现旧胜利报告', async function () {
    var resolveView;
    var harness = createHarness({
      loadView: function () { return new Promise(function (resolve) { resolveView = resolve; }); },
    });

    var pending = harness.controller.check();
    harness.replaceState({ day: 1 });
    harness.invalidateToken();
    resolveView(harness.view);

    await expect(pending).resolves.toBe(false);
    expect(harness.view.showVictoryReport).not.toHaveBeenCalled();
    expect(harness.controller.getDiagnostics().pendingReportPathId).toBeNull();
  });

  it('继续经营会记录本会话已确认路线并恢复行动引导', async function () {
    var emitted = [];
    var refresh = vi.fn();
    var harness = createHarness({
      emitMessage: function (message) { emitted.push(message); },
      refreshActionGuide: refresh,
    });
    await harness.controller.check();

    harness.getCallbacks().onContinue('trade_baron');
    await harness.controller.check();

    expect(emitted).toEqual([{ text: '胜利结算已归档，当前公司继续经营。', type: 'info' }]);
    expect(refresh).toHaveBeenCalledOnce();
    expect(harness.seenAcknowledged.at(-1)).toEqual(['trade_baron']);
    expect(harness.controller.getDiagnostics().pendingReportPathId).toBe('trade_baron');
  });

  it('重开回调与 reset 均由 controller 生命周期持有', async function () {
    var restart = vi.fn();
    var harness = createHarness({ restartSession: restart });
    await harness.controller.check();
    harness.getCallbacks().onContinue('trade_baron');
    harness.getCallbacks().onRestart();
    harness.controller.reset();

    expect(restart).toHaveBeenCalledWith('victory-restart');
    expect(harness.controller.getDiagnostics()).toMatchObject({
      acknowledgedPathIds: [],
      pendingReportPathId: null,
    });
  });

  it('未达成路线时不请求延迟视图', function () {
    var loadView = vi.fn();
    var harness = createHarness({
      victoryResult: { won: false, path: null },
      loadView: loadView,
    });

    expect(harness.controller.check()).toBeNull();
    expect(loadView).not.toHaveBeenCalled();
  });
});

describe('buildVictoryStats', function () {
  it('对缺失数组与数值使用稳定默认值', function () {
    expect(buildVictoryStats({ day: 3 }, { levelTitle: '新手' })).toEqual(expect.arrayContaining([
      { label: '银河历', value: '第 3 天' },
      { label: '已研究科技', value: '0 / 16 项' },
      { label: '探索星系', value: '0 / 8 个' },
    ]));
  });
});
