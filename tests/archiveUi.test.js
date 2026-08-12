import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../js/data/achievements.js';
import * as AchievementUI from '../js/ui/AchievementUI.js?v=20260609-achfocus1';
import * as ArchiveExplorationUI from '../js/ui/ArchiveExplorationUI.js?v=20260720-archive-survey1';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as FactionUI from '../js/ui/FactionUI.js?v=20260609-factionfocus1';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../js/systems/galaxy/ExplorationSystem.js';
import * as Quest from '../js/systems/quest/QuestSystem.js?v=20260531-chainfollow1';
import * as QuestUI from '../js/ui/QuestUI.js?v=20260609-questfocus1';
import * as Research from '../js/systems/research/ResearchSystem.js';
import * as ResearchUI from '../js/ui/ResearchUI.js?v=20260609-researchfocus1';
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
    globalThis.document = originalDocument;
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

    FactionUI.render(state);

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
      QuestUI.render(state, function () {}, function () {}, {}, function () {});
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

    QuestUI.render(state, function () {}, function () {}, {}, function () {});

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

    QuestUI.render(state, function () {}, function () {}, {}, function () {});

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

    ResearchUI.render(state, function () {});

    expect(status.innerHTML).toContain('archive-research-console');
    expect(status.innerHTML).toContain('role="progressbar" aria-label="科技完成度"');
    expect(status.innerHTML).toContain('research-current-strip');
    expect(status.innerHTML).toContain('class="research-category-matrix" role="list" aria-label="科技分类状态"');
    expect(status.innerHTML).toContain('class="research-focus-panel" aria-label="研究队列状态"');
    expect(status.innerHTML).toContain('研究状态');
    expect(status.innerHTML).toContain('候选预算');
    expect(options.innerHTML).toContain('research-option-console');
    expect(options.innerHTML).toContain('class="research-cards" role="list" aria-label="可研究科技"');
    expect(options.innerHTML).toContain('role="listitem" data-tech=');
    expect(options.innerHTML).toContain('type="button" class="btn-research"');
    expect(completed.innerHTML).toContain('research-completed-console');
    expect(completed.innerHTML).toContain('class="completed-techs" role="list"');
  });
});
