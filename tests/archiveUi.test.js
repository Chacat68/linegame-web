import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../js/data/achievements.js';
import { ARCHIVE_COMMAND } from '../js/core/ArchiveCommand.js';
import {
  AchievementUI,
  ArchiveExplorationUI,
  FactionUI,
  QuestUI,
  ResearchUI,
  getDiagnostics as getArchiveDiagnostics,
  resetRuntimeState as resetArchiveRuntimeState,
} from '../js/ui/ArchiveUI.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../js/systems/galaxy/ExplorationSystem.js';
import * as Quest from '../js/systems/quest/QuestSystem.js?v=20260531-chainfollow1';
import * as Research from '../js/systems/research/ResearchSystem.js';
import { createTestState } from './helpers.js';

function createHtmlContainer() {
  var html = '';
  return {
    get innerHTML() {
      return html;
    },
    set innerHTML(value) {
      html = String(value);
    },
    querySelector: function () {
      return null;
    },
    querySelectorAll: function () {
      return [];
    },
  };
}

describe('Archive terminal UI', function () {
  var originalDocument;

  beforeEach(function () {
    originalDocument = globalThis.document;
  });

  afterEach(function () {
    resetArchiveRuntimeState();
    globalThis.document = originalDocument;
  });

  it('组合边界公开冻结会话快照，并在 reset 时清理任务与探索焦点', function () {
    QuestUI.setSelectedAvailableQuest('starter_first_trade');
    ArchiveExplorationUI.setFocus('sol_prime', 'sol_prime_chain_derelict_depot');

    var diagnostics = getArchiveDiagnostics();
    expect(diagnostics).toEqual({
      quest: {
        selectedAvailableQuestId: 'starter_first_trade',
        session: {
          selectedAvailableQuestId: 'starter_first_trade',
          selectionCount: 1,
          resetCount: 0,
        },
        controller: expect.objectContaining({
          activeContext: null,
          bindCount: 0,
          resetCount: 0,
        }),
      },
      research: {
        controller: expect.objectContaining({
          activeContext: null,
          bindCount: 0,
          resetCount: 0,
        }),
      },
      faction: {
        controller: expect.objectContaining({
          activeContext: null,
          bindCount: 0,
          resetCount: 0,
        }),
      },
      achievement: {
        controller: expect.objectContaining({
          active: false,
          bindCount: 0,
          resetCount: 0,
        }),
      },
      exploration: {
        focus: { systemId: 'sol_prime', chainId: 'sol_prime_chain_derelict_depot' },
        session: {
          focus: { systemId: 'sol_prime', chainId: 'sol_prime_chain_derelict_depot' },
          setCount: 1,
          resetCount: 0,
        },
        controller: expect.objectContaining({
          active: false,
          bindCount: 0,
          resetCount: 0,
        }),
      },
      resetCount: expect.any(Number),
    });
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.quest)).toBe(true);
    expect(Object.isFrozen(diagnostics.quest.session)).toBe(true);
    expect(Object.isFrozen(diagnostics.quest.controller)).toBe(true);
    expect(Object.isFrozen(diagnostics.research)).toBe(true);
    expect(Object.isFrozen(diagnostics.research.controller)).toBe(true);
    expect(Object.isFrozen(diagnostics.faction)).toBe(true);
    expect(Object.isFrozen(diagnostics.faction.controller)).toBe(true);
    expect(Object.isFrozen(diagnostics.achievement)).toBe(true);
    expect(Object.isFrozen(diagnostics.achievement.controller)).toBe(true);
    expect(Object.isFrozen(diagnostics.exploration.focus)).toBe(true);
    expect(Object.isFrozen(diagnostics.exploration.session)).toBe(true);
    expect(Object.isFrozen(diagnostics.exploration.session.focus)).toBe(true);
    expect(Object.isFrozen(diagnostics.exploration.controller)).toBe(true);

    var beforeResetCount = diagnostics.resetCount;
    var reset = resetArchiveRuntimeState();
    expect(reset).toEqual({
      quest: {
        selectedAvailableQuestId: null,
        session: {
          selectedAvailableQuestId: null,
          selectionCount: 0,
          resetCount: 1,
        },
        controller: expect.objectContaining({
          activeContext: null,
          bindCount: 0,
          resetCount: 1,
        }),
      },
      research: {
        controller: expect.objectContaining({
          activeContext: null,
          bindCount: 0,
          resetCount: 1,
        }),
      },
      faction: {
        controller: expect.objectContaining({
          activeContext: null,
          bindCount: 0,
          resetCount: 1,
        }),
      },
      achievement: {
        controller: expect.objectContaining({
          active: false,
          bindCount: 0,
          resetCount: 1,
        }),
      },
      exploration: {
        focus: null,
        session: {
          focus: null,
          setCount: 0,
          resetCount: 1,
        },
        controller: expect.objectContaining({
          active: false,
          bindCount: 0,
          resetCount: 1,
        }),
      },
      resetCount: beforeResetCount + 1,
    });
  });

  it('成就页会渲染完成度总览、分组进度和语义卡片', function () {
    var container = createHtmlContainer();
    var firstAchievementId = ACHIEVEMENTS[0] ? ACHIEVEMENTS[0].id : '';
    var state = createTestState({
      achievements: firstAchievementId ? [firstAchievementId] : [],
    });

    globalThis.document = {
      getElementById: function (id) {
        return id === 'achievement-list' ? container : null;
      },
    };

    AchievementUI.render(state);

    expect(container.innerHTML).toContain('archive-achievement-console');
    expect(container.innerHTML).toContain('role="progressbar" aria-label="成就完成度"');
    expect(container.innerHTML).toContain('achievement-distribution-grid');
    expect(container.innerHTML).toContain('role="list" aria-label="成就分类分布"');
    expect(container.innerHTML).toContain('class="archive-achievement-focus" aria-label="成就完成状态"');
    expect(container.innerHTML).toContain('完成进度');
    expect(container.innerHTML).toContain('未解锁奖励池');
    expect(container.innerHTML).toContain('class="ach-card-grid" role="list"');
    expect(container.innerHTML).toContain('role="listitem"');
    expect(container.innerHTML).toContain('data-achievement-state="unlocked"');
    expect(container.innerHTML).toContain('data-achievement-state="locked"');
    expect(container.innerHTML).toContain('ach-reward');
    expect(container.innerHTML).toContain('>舰队</h4>');
    expect(container.innerHTML).toContain('>专精</h4>');
    expect(container.innerHTML).toContain('>特殊</h4>');
    expect(container.innerHTML).not.toContain('>fleet</h4>');
    expect(container.innerHTML).not.toContain('>specialist</h4>');
  });

  it('探索页会集中渲染报告详情、航点进度和连续任务记录', function () {
    var container = createHtmlContainer();
    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      visitedSystems: ['sol_prime'],
      fuel: 100,
      maxFuel: 100,
      credits: 2000,
    });

    GalaxyData.init(state);
    var resourcePoi = GalaxyData.getPlanetData('sol_prime').exploration.pois.find(function (poi) {
      return poi.kind === 'resource_cache';
    });
    expect(Exploration.explorePoi(state, 'sol_prime', resourcePoi.id).ok).toBe(true);

    globalThis.document = {
      getElementById: function (id) {
        return id === 'exploration-archive-list' ? container : null;
      },
    };

    ArchiveExplorationUI.setFocus('sol_prime', 'sol_prime_chain_derelict_depot');
    ArchiveExplorationUI.render(state);

    expect(container.innerHTML).toContain('class="archive-exploration-console" aria-label="探索报告总览"');
    expect(container.innerHTML).toContain('已归档报告');
    expect(container.innerHTML).toContain('太阳主星');
    expect(container.innerHTML).toContain('class="archive-exploration-report-list" role="list"');
    expect(container.innerHTML).toContain('archive-exploration-report-card');
    expect(container.innerHTML).toContain('遗忘补给库');
    expect(container.innerHTML).toContain('data-archive-survey-chain-id="sol_prime_chain_derelict_depot"');
    expect(container.innerHTML).toContain('archive-exploration-chain-row--archived');
    expect(container.innerHTML).toContain('is-guide-focus');

    ArchiveExplorationUI.setFocus(null);
  });

  it('派系页会渲染外交总览、关系列表和市场行动协议', function () {
    var container = createHtmlContainer();
    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      factionRelations: {
        federation: 42,
        syndicate: -20,
        technocracy: 0,
      },
    });

    Faction.init(state);
    GalaxyData.init(state);

    globalThis.document = {
      getElementById: function (id) {
        return id === 'faction-list' ? container : null;
      },
    };

    FactionUI.render({ state: state });

    expect(container.innerHTML).toContain('archive-faction-console');
    expect(container.innerHTML).toContain('class="faction-relation-distribution" role="list" aria-label="派系关系分布"');
    expect(container.innerHTML).toContain('class="faction-focus-panel" aria-label="外交关系信号"');
    expect(container.innerHTML).toContain('关系信号');
    expect(container.innerHTML).toContain('重点派系');
    expect(container.innerHTML).toContain('class="faction-card-grid" role="list"');
    expect(container.innerHTML).toContain('role="listitem"');
    expect(container.innerHTML).toContain('data-faction-level="friendly"');
    expect(container.innerHTML).toContain('class="mini-bar-track faction-card-meter" role="progressbar"');
    expect(container.innerHTML).toContain('data-faction-market="true"');
    expect(container.innerHTML).toContain('faction-metric-grid');
  });

  it('任务页会渲染控制总览、章节进度和语义任务列表', function () {
    var container = createHtmlContainer();
    var dispatchListenerCount = 0;
    container.querySelector = function (selector) {
      if (selector !== '.quest-dispatch-apply-btn') return null;
      return {
        addEventListener: function () { dispatchListenerCount += 1; },
      };
    };
    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      quests: [],
      completedQuests: [],
    });

    Quest.init(state);
    GalaxyData.init(state);

    globalThis.document = {
      getElementById: function (id) {
        return id === 'quest-list' ? container : null;
      },
    };

    expect(function () {
      QuestUI.render({ state: state, dispatchContext: {}, onCommand: function () {} });
    }).not.toThrow();
    expect(dispatchListenerCount).toBe(0);

    expect(container.innerHTML).toContain('class="quest-command-deck" role="region" aria-label="任务首页"');
    expect(container.innerHTML).not.toContain('class="quest-command-metrics"');
    expect(container.innerHTML).toContain('<details class="quest-secondary-details"><summary>查看章节进度与全部任务状态</summary>');
    expect(container.innerHTML).toContain('class="quest-triage-panel" aria-label="详细任务状态"');
    expect(container.innerHTML).toContain('class="quest-triage-grid" role="list" aria-label="任务状态概览"');
    expect(container.innerHTML).toContain('class="quest-focus-panel" aria-label="任务处理状态"');
    expect(container.innerHTML).toContain('任务状态');
    expect(container.innerHTML).toContain('class="phase-bar" role="progressbar"');
    expect(container.innerHTML).toContain('data-quest-accept-hub="true" aria-label="任务接取简报"');
    expect(container.innerHTML).toContain('class="quest-pick-list" role="list" aria-label="可接任务列表"');
    expect(container.innerHTML).toContain('<details class="quest-module quest-module-locked quest-locked-details"><summary>查看后续任务（5）</summary>');
    expect(container.innerHTML).toContain('type="button" class="btn-action quest-accept-btn"');
  });

  it('任务页真实点击只向 Archive typed command 端口发布请求', function () {
    var container = createHtmlContainer();
    var commands = [];
    var state = createTestState({ quests: [], completedQuests: [] });
    Quest.init(state);
    GalaxyData.init(state);
    globalThis.document = {
      getElementById: function (id) { return id === 'quest-list' ? container : null; },
    };
    QuestUI.render({
      state: state,
      onCommand: function (command) { commands.push(command); },
    });
    var acceptButton = { disabled: false, dataset: { id: 'starter_first_trade' } };

    container.onclick({
      target: {
        closest: function (selector) {
          return selector === '.quest-accept-btn' ? acceptButton : null;
        },
      },
    });

    expect(commands).toEqual([{
      type: ARCHIVE_COMMAND.ACCEPT_QUEST,
      questId: 'starter_first_trade',
    }]);
    expect(Object.isFrozen(commands[0])).toBe(true);
  });

  it('任务页只展开当前焦点任务，并折叠其余路线和奖励详情', function () {
    var container = createHtmlContainer();
    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      quests: [],
      completedQuests: [],
    });

    Quest.init(state);
    GalaxyData.init(state);
    expect(Quest.acceptQuest(state, 'starter_first_trade').ok).toBe(true);
    expect(Quest.acceptQuest(state, 'starter_visit_2').ok).toBe(true);

    globalThis.document = {
      getElementById: function (id) {
        return id === 'quest-list' ? container : null;
      },
    };

    QuestUI.render({ state: state, dispatchContext: {}, onCommand: function () {} });

    expect(container.innerHTML.match(/class="quest-active-focus-details"/g)).toHaveLength(1);
    expect(container.innerHTML.match(/<details class="quest-active-details">/g)).toHaveLength(1);
    expect(container.innerHTML).toContain('<summary>查看路线、奖励与操作</summary>');
    expect(container.innerHTML).not.toContain('📡 任务路线建议');
  });

  it('任务页会转义存档中的任务名称与描述', function () {
    var container = createHtmlContainer();
    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      quests: [],
      completedQuests: [],
    });
    Quest.init(state);
    GalaxyData.init(state);
    expect(Quest.acceptQuest(state, 'starter_first_trade').ok).toBe(true);
    state.quests[0].name = '<img src=x onerror=alert(1)>';
    state.quests[0].description = '<script>alert(2)</script>';
    state.quests[0].objectives = [{
      type: 'deliver',
      goodId: 'food',
      targetSystem: 'nova_station',
      amount: 1,
      current: 0,
    }];
    state.quests[0].rewards.credits = '<svg onload=alert(3)>';
    state.cargo.food = 1;

    globalThis.document = {
      getElementById: function (id) {
        return id === 'quest-list' ? container : null;
      },
    };

    QuestUI.render({ state: state, dispatchContext: {}, onCommand: function () {} });

    expect(container.innerHTML).not.toContain('<img src=x');
    expect(container.innerHTML).not.toContain('<script>');
    expect(container.innerHTML).not.toContain('<svg onload');
    expect(container.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(container.innerHTML).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(container.innerHTML).toContain('&lt;svg onload=alert(3)&gt;');
  });

  it('科技页会渲染研究总览、候选列表和已完成研究列表', function () {
    var status = createHtmlContainer();
    var options = createHtmlContainer();
    var completed = createHtmlContainer();
    var state = createTestState({
      credits: 50000,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      researchedTechs: ['reinforced_hull'],
    });

    Research.init(state);
    GalaxyData.init(state);

    globalThis.document = {
      getElementById: function (id) {
        if (id === 'research-status') return status;
        if (id === 'research-options') return options;
        if (id === 'research-completed') return completed;
        return null;
      },
    };

    ResearchUI.render({ state: state, onCommand: function () {} });

    expect(status.innerHTML).toContain('archive-research-console');
    expect(status.innerHTML).toContain('role="progressbar" aria-label="科技完成度"');
    expect(status.innerHTML).toContain('research-current-strip');
    expect(status.innerHTML).toContain('class="research-category-matrix" role="list" aria-label="科技分类状态"');
    expect(status.innerHTML).toContain('class="research-focus-panel" aria-label="研究队列状态"');
    expect(status.innerHTML).toContain('研究状态');
    expect(status.innerHTML).toContain('候选预算');
    expect(options.innerHTML).toContain('research-option-console');
    expect(options.innerHTML).toContain('class="research-cards" role="list" aria-label="可研究科技"');
    expect(options.innerHTML).toContain('role="listitem" tabindex="0" data-tech=');
    expect(options.innerHTML).toContain('type="button" class="btn-research"');
    expect(completed.innerHTML).toContain('research-completed-console');
    expect(completed.innerHTML).toContain('class="completed-techs" role="list"');
  });

  it('五类档案对象都能向 Inspector presenter 投影最新状态', function () {
    var state = createTestState({
      credits: 50000,
      achievements: ACHIEVEMENTS[0] ? [ACHIEVEMENTS[0].id] : [],
      factionRelations: { federation: 42, syndicate: 0, technocracy: 0 },
      researchedTechs: ['reinforced_hull'],
      visitedSystems: ['sol_prime'],
    });
    Quest.init(state);
    Research.init(state);
    Faction.init(state);
    GalaxyData.init(state);
    expect(Quest.acceptQuest(state, 'starter_first_trade').ok).toBe(true);
    var resourcePoi = GalaxyData.getPlanetData('sol_prime').exploration.pois.find(function (poi) {
      return poi.kind === 'resource_cache';
    });
    expect(Exploration.explorePoi(state, 'sol_prime', resourcePoi.id).ok).toBe(true);
    var report = Exploration.getSurveySummary(state, 'sol_prime').reports[0];

    var questHost = createHtmlContainer();
    var researchHost = createHtmlContainer();
    var factionHost = createHtmlContainer();
    var achievementHost = createHtmlContainer();
    var reportHost = createHtmlContainer();

    expect(QuestUI.renderContextInspector({ context: { type: 'quest', id: 'starter_first_trade' }, state: state, container: questHost })).toEqual({ title: '任务检查' });
    expect(ResearchUI.renderContextInspector({ context: { type: 'technology', id: 'reinforced_hull' }, state: state, container: researchHost })).toEqual({ title: '科技检查' });
    expect(FactionUI.renderContextInspector({ context: { type: 'faction', id: 'federation' }, state: state, container: factionHost })).toEqual({ title: '派系检查' });
    expect(AchievementUI.renderContextInspector({ context: { type: 'achievement', id: ACHIEVEMENTS[0].id }, state: state, container: achievementHost })).toEqual({ title: '成就检查' });
    expect(ArchiveExplorationUI.renderContextInspector({ context: { type: 'report', id: report.id }, state: state, container: reportHost })).toEqual({ title: '报告检查' });

    expect(questHost.innerHTML).toContain('进行中');
    expect(researchHost.innerHTML).toContain('已完成');
    expect(factionHost.innerHTML).toContain('友好');
    expect(achievementHost.innerHTML).toContain('已解锁');
    expect(reportHost.innerHTML).toContain(report.title);
    [questHost, researchHost, factionHost, achievementHost, reportHost].forEach(function (host) {
      expect(host.innerHTML).toContain('data-context-action="open-detail"');
      expect(host.innerHTML).toContain('data-context-id=');
      expect(host.innerHTML).toContain('data-workspace-action-slot');
      expect(host.innerHTML).toContain('data-action-scope="local"');
      expect(host.innerHTML).toContain('data-workspace-id="archive"');
    });

    var questDetailHost = createHtmlContainer();
    var technologyDetailHost = createHtmlContainer();
    var factionDetailHost = createHtmlContainer();
    var achievementDetailHost = createHtmlContainer();
    var reportDetailHost = createHtmlContainer();
    expect(QuestUI.renderWorkspaceDetail({ detail: { type: 'archive-quest', id: 'starter_first_trade' }, state: state, container: questDetailHost })).toEqual({ title: expect.stringContaining('任务详情') });
    expect(ResearchUI.renderWorkspaceDetail({ detail: { type: 'archive-technology', id: 'reinforced_hull' }, state: state, container: technologyDetailHost })).toEqual({ title: expect.stringContaining('科技详情') });
    expect(FactionUI.renderWorkspaceDetail({ detail: { type: 'archive-faction', id: 'federation' }, state: state, container: factionDetailHost })).toEqual({ title: expect.stringContaining('派系详情') });
    expect(AchievementUI.renderWorkspaceDetail({ detail: { type: 'archive-achievement', id: ACHIEVEMENTS[0].id }, state: state, container: achievementDetailHost })).toEqual({ title: expect.stringContaining('成就详情') });
    expect(ArchiveExplorationUI.renderWorkspaceDetail({ detail: { type: 'archive-report', id: report.id }, state: state, container: reportDetailHost })).toEqual({ title: expect.stringContaining('报告详情') });

    expect(questDetailHost.innerHTML).toContain('目标 01');
    expect(technologyDetailHost.innerHTML).toContain('研究效果');
    expect(factionDetailHost.innerHTML).toContain('控制地点');
    expect(achievementDetailHost.innerHTML).toContain('奖励总览');
    expect(reportDetailHost.innerHTML).toContain('所属区域');
    [questDetailHost, technologyDetailHost, factionDetailHost, achievementDetailHost, reportDetailHost].forEach(function (host) {
      expect(host.innerHTML).toContain('workspace-detail-section--object');
      expect(host.innerHTML).toContain('workspace-detail-object-grid');
    });
    expect(QuestUI.renderWorkspaceDetail({ detail: { type: 'archive-quest', id: 'missing' }, state: state, container: createHtmlContainer() })).toBe(false);
    expect(ResearchUI.renderWorkspaceDetail({ detail: { type: 'archive-technology', id: 'missing' }, state: state, container: createHtmlContainer() })).toBe(false);
    expect(FactionUI.renderWorkspaceDetail({ detail: { type: 'archive-faction', id: 'missing' }, state: state, container: createHtmlContainer() })).toBe(false);
    expect(AchievementUI.renderWorkspaceDetail({ detail: { type: 'archive-achievement', id: 'missing' }, state: state, container: createHtmlContainer() })).toBe(false);
    expect(ArchiveExplorationUI.renderWorkspaceDetail({ detail: { type: 'archive-report', id: 'missing' }, state: state, container: createHtmlContainer() })).toBe(false);
  });
});
