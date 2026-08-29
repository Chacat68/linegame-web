import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as Quest from '../js/systems/quest/QuestSystem.js';
import { buildQuestBoardView } from '../js/ui/QuestBoardPresenter.js';
import { buildQuestContextView, buildQuestWorkspaceDetailView } from '../js/ui/QuestDetailPresenter.js';
import { getQuestObjectivePlanText, getQuestObjectiveText } from '../js/ui/QuestObjectivePresenter.js';
import {
  getQuestActionContext,
  getQuestTargetSystems,
  renderQuestDispatchBlocker,
  renderQuestRoutePreview,
} from '../js/ui/QuestRoutePresenter.js';
import { createTestState } from './helpers.js';

function createQuestState() {
  var state = createTestState({
    credits: 12000,
    currentSystem: 'sol_prime',
    currentGalaxy: 'milky_way',
    viewingGalaxy: 'milky_way',
    quests: [],
    completedQuests: [],
  });
  Fleet.init(state);
  Quest.init(state);
  return state;
}

describe('Quest presenters', function () {
  it('QuestBoardPresenter 纯生成首页并稳定回退候选焦点', function () {
    var state = createQuestState();
    var first = buildQuestBoardView({ state: state, selectedAvailableQuestId: 'missing' });
    expect(first).not.toBeNull();
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.selectedAvailableQuestId).toBeTruthy();
    expect(first.html).toContain('class="quest-command-deck"');
    expect(first.html).toContain('data-quest-select-id="' + first.selectedAvailableQuestId + '"');

    var second = buildQuestBoardView({ state: state, selectedAvailableQuestId: first.selectedAvailableQuestId });
    expect(second.selectedAvailableQuestId).toBe(first.selectedAvailableQuestId);
    expect(second.html).toContain('aria-pressed="true"');
  });

  it('首页、路线和阻塞投影会转义动态任务与航线字段', function () {
    var state = createQuestState();
    expect(Quest.acceptQuest(state, 'starter_first_trade').ok).toBe(true);
    state.quests[0].name = '<img src=x onerror=alert(1)>';
    state.quests[0].description = '<script>alert(2)</script>';
    var board = buildQuestBoardView({ state: state });
    expect(board.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(board.html).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(board.html).not.toContain('<img src=x');
    expect(board.html).not.toContain('<script>');

    var routeHtml = renderQuestRoutePreview({
      summaryText: '<summary>',
      items: [{
        systemName: '<星球>',
        purposeLabel: '<目标>',
        galaxyName: '<银河>',
        routeModeLabel: '<航线>',
        distanceLabel: '距离',
        distanceText: '<1>',
        fuelCost: 2,
        etaDays: 1,
        note: '<note>',
      }],
    });
    expect(routeHtml).toContain('&lt;星球&gt;');
    expect(routeHtml).toContain('&lt;summary&gt;');
    expect(routeHtml).not.toContain('<note>');

    var blockerHtml = renderQuestDispatchBlocker({ id: 'q', name: '<阻塞任务>' }, {
      summaryText: '<路线摘要>',
      items: [{
        systemId: 'war_front',
        systemName: '<战争前线>',
        purposeLabel: '<交付>',
        blockedReason: '燃料不足 <危险>',
        isCurrentSystem: false,
      }],
    }, true, null, state);
    expect(blockerHtml).toContain('&lt;阻塞任务&gt;');
    expect(blockerHtml).toContain('data-action-id="market"');
    expect(blockerHtml).not.toContain('<危险>');
  });

  it('目标与地点 selector 无 DOM 地生成计量文案和本地状态', function () {
    var objective = { type: 'deliver', goodId: 'food', targetSystem: 'war_front', amount: 5 };
    expect(getQuestObjectiveText(objective)).toContain('战争前线');
    expect(getQuestObjectivePlanText(objective)).toContain('5 单位');
    var quest = { objectives: [objective, { type: 'visit_system', targetSystem: 'war_front' }] };
    expect(getQuestTargetSystems(quest)).toHaveLength(1);
    expect(getQuestActionContext(quest, { currentSystem: 'sol_prime' })).toMatchObject({
      tone: 'travel',
      label: expect.stringContaining('战争前线'),
    });
  });

  it('Context 与 L4 Presenter 返回冻结 view，并拒绝错误类型和失效任务', function () {
    var state = createQuestState();
    expect(Quest.acceptQuest(state, 'starter_first_trade').ok).toBe(true);
    var contextView = buildQuestContextView({
      context: { type: 'quest', id: 'starter_first_trade' },
      state: state,
    });
    var detailView = buildQuestWorkspaceDetailView({
      detail: { type: 'archive-quest', id: 'starter_first_trade' },
      state: state,
    });
    expect(Object.isFrozen(contextView)).toBe(true);
    expect(Object.isFrozen(detailView)).toBe(true);
    expect(contextView.html).toContain('data-context-action="open-detail"');
    expect(detailView.html).toContain('目标 01');
    expect(buildQuestContextView({ context: { type: 'technology', id: 'starter_first_trade' }, state: state })).toBeNull();
    expect(buildQuestWorkspaceDetailView({ detail: { type: 'archive-quest', id: 'missing' }, state: state })).toBeNull();
  });

  it('QuestUI 只组合 Session、Presenter 与 Controller，不回流领域投影或逐节点绑定', function () {
    var uiSource = readFileSync('js/ui/QuestUI.js', 'utf8');
    var boardSource = readFileSync('js/ui/QuestBoardPresenter.js', 'utf8');
    var controllerSource = readFileSync('js/ui/QuestBoardController.js', 'utf8');
    expect(uiSource).toContain('createQuestWorkspaceSession()');
    expect(uiSource).toContain('createQuestBoardController({');
    expect(uiSource).toContain('buildQuestBoardView({');
    expect(uiSource).not.toContain('AutoTrade.findQuestRoute');
    expect(uiSource).not.toContain('Quest.getAvailableQuests');
    expect(uiSource).not.toContain('querySelectorAll');
    expect(uiSource).not.toContain('addEventListener');
    expect(boardSource).not.toContain('document.');
    expect(boardSource).not.toContain('.onclick');
    expect(controllerSource).not.toContain('.innerHTML');
  });
});
