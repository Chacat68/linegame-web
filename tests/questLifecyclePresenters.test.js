import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as Quest from '../js/systems/quest/QuestSystem.js';
import { buildQuestActiveView } from '../js/ui/QuestActivePresenter.js';
import { buildQuestAvailableView, getPreferredAvailableQuest } from '../js/ui/QuestAvailablePresenter.js';
import { buildQuestLockedView } from '../js/ui/QuestLockedPresenter.js';
import { createTestState } from './helpers.js';

function createQuestState() {
  var state = createTestState({
    credits: 12000,
    currentGalaxy: 'milky_way',
    currentSystem: 'sol_prime',
    quests: [],
    completedQuests: [],
  });
  Fleet.init(state);
  Quest.init(state);
  return state;
}

describe('Quest lifecycle presenters', function () {
  it('Available Presenter 独占稳定候选回退、接取简报和冻结选择投影', function () {
    var state = createQuestState();
    var baseQuest = getPreferredAvailableQuest(state);
    var unsafeQuest = Object.assign({}, baseQuest, {
      name: '<候选任务>',
      description: '<候选说明>',
      objectives: (baseQuest.objectives || []).map(function (objective) { return Object.assign({}, objective); }),
    });
    var view = buildQuestAvailableView({
      activeCount: 0,
      available: [unsafeQuest],
      recommended: [unsafeQuest],
      selectedAvailableQuestId: 'missing',
      state: state,
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.sortedAvailable)).toBe(true);
    expect(Object.isFrozen(view.recommendedIds)).toBe(true);
    expect(view.selectedAvailableQuestId).toBe(unsafeQuest.id);
    expect(view.html).toContain('class="quest-accept-hub"');
    expect(view.html).toContain('aria-pressed="true"');
    expect(view.html).toContain('&lt;候选任务&gt;');
    expect(view.html).not.toContain('<候选任务>');
  });

  it('Active Presenter 独占进度、路线、奖励和操作，并转义活动任务字段', function () {
    var state = createQuestState();
    expect(Quest.acceptQuest(state, 'starter_first_trade').ok).toBe(true);
    state.quests[0].name = '<进行中任务>';
    state.quests[0].description = '<活动说明>';
    var view = buildQuestActiveView({
      active: Quest.getActiveQuests(state),
      canApplyQuestDispatch: true,
      canResolveQuestBlocker: true,
      state: state,
    });
    expect(Object.isFrozen(view)).toBe(true);
    expect(view.html).toContain('class="quest-module quest-module-active"');
    expect(view.html).toContain('class="quest-progress-track"');
    expect(view.html).toContain('class="btn-action quest-abandon-btn"');
    expect(view.html).toContain('&lt;进行中任务&gt;');
    expect(view.html).not.toContain('<活动说明>');
  });

  it('Locked Presenter 独占锁因与章节完成空态，并安全处理动态字段', function () {
    var state = createQuestState();
    var baseQuest = Quest.getLockedQuests(state)[0];
    var lockedQuest = Object.assign({}, baseQuest, {
      id: 'locked-unsafe',
      name: '<未解锁任务>',
      description: '<锁定说明>',
      lockReasons: ['需要 <危险条件>'],
      rewards: Object.assign({}, baseQuest.rewards || { credits: 1, exp: 1, reputation: 1 }),
    });
    var view = buildQuestLockedView({ locked: [lockedQuest], state: state });
    expect(Object.isFrozen(view)).toBe(true);
    expect(view.html).toContain('class="quest-locked-grid"');
    expect(view.html).toContain('&lt;未解锁任务&gt;');
    expect(view.html).toContain('&lt;危险条件&gt;');
    expect(view.html).not.toContain('<锁定说明>');

    var completeView = buildQuestLockedView({
      currentPhaseProgress: { isComplete: true, isFinalPhase: false },
      locked: [],
      state: state,
    });
    expect(completeView.html).toContain('下一次结算将进入新章节');
  });

  it('Board 只组合生命周期子投影，不再内嵌三套任务卡实现', function () {
    var boardSource = readFileSync('js/ui/QuestBoardPresenter.js', 'utf8');
    var availableSource = readFileSync('js/ui/QuestAvailablePresenter.js', 'utf8');
    var activeSource = readFileSync('js/ui/QuestActivePresenter.js', 'utf8');
    var lockedSource = readFileSync('js/ui/QuestLockedPresenter.js', 'utf8');
    expect(boardSource).toContain("from './QuestAvailablePresenter.js'");
    expect(boardSource).toContain("from './QuestActivePresenter.js'");
    expect(boardSource).toContain("from './QuestLockedPresenter.js'");
    expect(boardSource).not.toContain('QUEST_TYPES');
    expect(boardSource).not.toContain('quest-accept-hub');
    expect(boardSource).not.toContain('quest-active-grid');
    expect(boardSource).not.toContain('quest-locked-grid');
    [availableSource, activeSource, lockedSource].forEach(function (source) {
      expect(source).not.toContain('document.');
      expect(source).not.toContain('.onclick');
      expect(source).not.toContain('addEventListener');
    });
  });
});
