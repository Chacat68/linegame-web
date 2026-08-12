import { describe, expect, it, vi } from 'vitest';
import { createArchiveActionController } from '../js/core/ArchiveActionController.js';

function createHarness(options) {
  var config = options || {};
  var trace = [];
  var state = config.state || { id: 'state-1' };
  var researchResult = config.researchResult || { ok: true };
  var questResult = typeof config.questResult === 'undefined' ? { ok: true } : config.questResult;
  var Research = {};
  ['startResearch', 'cancelQueuedResearch', 'moveQueuedResearchUp', 'moveQueuedResearchDown', 'clearResearchQueue']
    .forEach(function (methodName) {
      Research[methodName] = function () {
        trace.push([methodName].concat(Array.prototype.slice.call(arguments)));
        return researchResult;
      };
    });
  var Quest = {
    acceptQuest: function () { trace.push(['acceptQuest'].concat(Array.prototype.slice.call(arguments))); return questResult; },
    abandonQuest: function () { trace.push(['abandonQuest'].concat(Array.prototype.slice.call(arguments))); return questResult; },
  };
  var Tutorial = {
    checkTrigger: function (trigger) { trace.push(['tutorial', trigger]); },
  };
  var controller = createArchiveActionController({
    getState: function () { trace.push(['getState']); return state; },
    systems: { Research: Research, Quest: Quest, Tutorial: Tutorial },
    dispatch: function (result) { trace.push(['dispatch', result]); },
    updateUI: function () { trace.push(['updateUI']); },
    emitLog: function (message) { trace.push(['log', message]); },
    activateArchiveTab: function (tabId) { trace.push(['tab', tabId]); },
    openMarketPanel: function (nextState, opts) { trace.push(['market', nextState, opts]); },
    openMarketSystemPanel: function (nextState, systemId, opts) { trace.push(['marketSystem', nextState, systemId, opts]); },
    selectAvailableQuest: function (questId) { trace.push(['selectQuest', questId]); },
    openRecommendedDispatch: function () { trace.push(['recommendedDispatch'].concat(Array.prototype.slice.call(arguments))); },
    queueQuestDialogueResult: function (result, done) { trace.push(['questDialogue', result]); if (config.autoFinishDialogue !== false) done(); },
    playTriggerDialogue: function (trigger, payload, done) { trace.push(['triggerDialogue', trigger, payload]); if (config.autoFinishDialogue !== false) done(); },
  });
  return { controller: controller, trace: trace, state: state, researchResult: researchResult, questResult: questResult };
}

describe('ArchiveActionController', function () {
  it('科研队列动作统一使用最新 state 并 dispatch 结果', function () {
    var harness = createHarness();

    harness.controller.onStartResearch('warp-tech');
    harness.controller.onMoveQueuedResearchUp('warp-tech');
    harness.controller.onClearResearchQueue();

    expect(harness.trace).toEqual([
      ['getState'],
      ['startResearch', harness.state, 'warp-tech'],
      ['dispatch', harness.researchResult],
      ['getState'],
      ['moveQueuedResearchUp', harness.state, 'warp-tech'],
      ['dispatch', harness.researchResult],
      ['getState'],
      ['clearResearchQueue', harness.state],
      ['dispatch', harness.researchResult],
    ]);
  });

  it('科研与任务派遣复用同一推荐路线入口但保留来源文案', function () {
    var harness = createHarness();
    var recommendation = { goodId: 'technology' };

    harness.controller.onApplyResearchDispatch(recommendation);
    harness.controller.onApplyQuestDispatch(recommendation);

    expect(harness.trace).toEqual([
      ['recommendedDispatch', recommendation, '科研补给建议', '🛰️'],
      ['recommendedDispatch', recommendation, '任务路线建议', '📋'],
    ]);
  });

  it('派系市场动作打开指定系统与 workspace 后发布局部反馈', function () {
    var harness = createHarness();
    var handled = harness.controller.onOpenFactionMarket({
      actionId: 'market',
      label: '查看黑市条件',
      systemId: 'vega_port',
      systemName: '维加港',
      marketWorkspaceId: 'spot',
      marketSubworkspaceId: 'black',
    });

    expect(handled).toBe(true);
    expect(harness.trace[1]).toEqual([
      'marketSystem',
      harness.state,
      'vega_port',
      { workspaceId: 'spot', subworkspaceId: 'black', marketMode: '' },
    ]);
    expect(harness.trace[2][0]).toBe('log');
    expect(harness.trace[2][1].text).toContain('维加港');
  });

  it('科研 quest-focus 阻塞按 select → tab → render → log 顺序处理', function () {
    var harness = createHarness();

    harness.controller.onResolveResearchBlocker({
      actionId: 'quest-focus',
      targetQuestId: 'starter',
      targetQuestName: '初次交易',
    });

    expect(harness.trace.map(function (entry) { return entry[0]; })).toEqual([
      'selectQuest', 'tab', 'updateUI', 'log',
    ]);
  });

  it('任务 research 阻塞切换科技页并发布可返回任务页的反馈', function () {
    var harness = createHarness();

    harness.controller.onResolveQuestBlocker({ actionId: 'research', questName: '远方航线' });

    expect(harness.trace[0]).toEqual(['tab', 'tab-research']);
    expect(harness.trace[1][1].text).toContain('科技页');
    expect(harness.trace[1][1].text).toContain('远方航线');
  });

  it('市场阻塞动作始终以最新 state 打开目标市场', function () {
    var currentState = { id: 'first' };
    var seen = [];
    var controller = createArchiveActionController({
      getState: function () { return currentState; },
      systems: {},
      dispatch: function () {},
      openMarketPanel: function (state) { seen.push(state.id); },
    });

    controller.onResolveResearchBlocker({ actionId: 'market' });
    currentState = { id: 'second' };
    controller.onResolveQuestBlocker({ actionId: 'market' });

    expect(seen).toEqual(['first', 'second']);
  });

  it('任务接取先 dispatch，完成接取对话后才推进教程并刷新 UI', function () {
    var quest = { id: 'starter' };
    var harness = createHarness({ questResult: { ok: true, quest: quest } });

    harness.controller.onAcceptQuest('starter');

    expect(harness.trace.map(function (entry) { return entry[0]; })).toEqual([
      'getState', 'acceptQuest', 'dispatch', 'triggerDialogue', 'tutorial', 'updateUI',
    ]);
    expect(harness.trace[3]).toEqual(['triggerDialogue', 'quest_accept', { questId: 'starter', quest: quest }]);
  });

  it('立即完成的任务走完成对话队列并保留 phase 元数据', function () {
    var quest = { id: 'instant' };
    var harness = createHarness({
      questResult: {
        ok: true,
        completedImmediately: true,
        completedQuest: quest,
        phaseAdvanced: true,
        newPhase: 'expansion',
      },
    });

    harness.controller.onAcceptQuest('instant');

    expect(harness.trace[3]).toEqual(['questDialogue', {
      completedQuests: [{ id: 'instant', failed: false, quest: quest }],
      phaseAdvanced: true,
      newPhase: 'expansion',
    }]);
  });

  it('接取失败不触发教程、对话或额外 render', function () {
    var harness = createHarness({ questResult: { ok: false } });

    harness.controller.onAcceptQuest('locked');

    expect(harness.trace.map(function (entry) { return entry[0]; })).toEqual([
      'getState', 'acceptQuest', 'dispatch',
    ]);
  });

  it('放弃任务使用当前 state 并 dispatch 原始结果', function () {
    var harness = createHarness();

    expect(harness.controller.onAbandonQuest('quest-a')).toBe(harness.questResult);
    expect(harness.trace).toEqual([
      ['getState'],
      ['abandonQuest', harness.state, 'quest-a'],
      ['dispatch', harness.questResult],
    ]);
  });
});
