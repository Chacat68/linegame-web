import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TECHNOLOGIES } from '../js/data/technologies.js';
import {
  buildResearchBoardView,
  getResearchCategoryStatuses,
  renderResearchCompleted,
  renderResearchOptions,
  renderResearchStatus,
} from '../js/ui/ResearchBoardPresenter.js';
import {
  buildResearchContextView,
  buildResearchWorkspaceDetailView,
} from '../js/ui/ResearchDetailPresenter.js';
import { renderResearchDispatchRecommendation } from '../js/ui/ResearchDispatchPresenter.js';
import { createTestState } from './helpers.js';

describe('Research presenters', function () {
  it('纯投影总览、候选、队列和完成科技', function () {
    var first = TECHNOLOGIES[0];
    var second = TECHNOLOGIES[1];
    var state = createTestState({
      credits: 5000,
      currentResearch: { techId: first.id, daysLeft: 2 },
      researchOptions: [second.id],
      researchQueue: [{ techId: second.id, daysLeft: second.researchDays }],
      researchedTechs: [first.id],
    });
    var statuses = getResearchCategoryStatuses(state);
    var dispatchView = { html: '<div data-test-dispatch></div>', recommendation: null, blocker: null };

    expect(renderResearchStatus(state)).toContain('研究状态');
    expect(renderResearchStatus(state)).toContain('科技完成度');
    expect(renderResearchOptions(state, dispatchView)).toContain('data-queued-count="1"');
    expect(renderResearchOptions(state, dispatchView)).toContain('data-tech="' + second.id + '"');
    expect(renderResearchCompleted(state)).toContain('data-completed-tech="' + first.id + '"');
    expect(statuses.some(function (status) { return status.active; })).toBe(true);
    expect(Object.isFrozen(statuses[0])).toBe(true);
  });

  it('Context 与 L4 详情来自纯 Presenter，并拒绝不匹配类型', function () {
    var tech = TECHNOLOGIES[0];
    var state = createTestState({ researchOptions: [tech.id] });
    var contextView = buildResearchContextView({ context: { type: 'technology', id: tech.id }, state: state });
    var detailView = buildResearchWorkspaceDetailView({ detail: { type: 'archive-technology', id: tech.id }, state: state });

    expect(contextView.html).toContain('workspace-context-card--technology');
    expect(contextView.html).toContain('查看完整科技详情');
    expect(detailView.html).toContain(tech.name);
    expect(Object.isFrozen(contextView)).toBe(true);
    expect(Object.isFrozen(detailView)).toBe(true);
    expect(buildResearchContextView({ context: { type: 'quest', id: tech.id }, state: state })).toBeNull();
  });

  it('科研补给建议统一转义动态领域字段', function () {
    var html = renderResearchDispatchRecommendation({
      focusTypeLabel: '<img src=x onerror=1>',
      focusCategoryLabel: '工程<script>',
      focusTechName: '危险<科技>',
      buySystemName: 'A&站',
      sellSystemName: 'B"站',
      goodEmoji: '📦',
      goodName: '<货物>',
      profit: 10,
      quantity: 2,
      routeModeLabel: '<路线>',
      strategySummary: '<策略>',
      inspectionRisk: { checkChancePercent: 5 },
    }, true);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;科技&gt;');
    expect(html).toContain('A&amp;站');
    expect(html).toContain('&lt;策略&gt;');
  });

  it('完整 Board view 公开冻结三容器投影和派遣快照', function () {
    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      researchOptions: [],
      researchedTechs: [],
    });
    var view = buildResearchBoardView({ state: state, researchDispatchContext: {} });
    expect(Object.isFrozen(view)).toBe(true);
    expect(view.statusHtml).toContain('archive-research-console');
    expect(view.optionsHtml).toContain('research-hint');
    expect(view.completedHtml).toBe('');
  });

  it('源码所有权阻止 DOM、listener 和领域 selector 回流到兼容门面', function () {
    var facade = readFileSync('js/ui/ResearchUI.js', 'utf8');
    var board = readFileSync('js/ui/ResearchBoardPresenter.js', 'utf8');
    var dispatch = readFileSync('js/ui/ResearchDispatchPresenter.js', 'utf8');
    var detail = readFileSync('js/ui/ResearchDetailPresenter.js', 'utf8');
    var controller = readFileSync('js/ui/ResearchBoardController.js', 'utf8');

    expect(facade).toContain("from './ResearchBoardController.js'");
    expect(facade).toContain("from './ResearchBoardPresenter.js'");
    expect(facade).toContain("from './ResearchDetailPresenter.js'");
    expect(facade).not.toContain('querySelectorAll');
    expect(facade).not.toContain('addEventListener');
    expect(facade).not.toContain('AutoTradeSystem');
    expect(facade).not.toContain('ResearchSystem');
    expect(facade).not.toContain('QuestSystem');
    expect(board).not.toContain('document.');
    expect(board).not.toContain('onclick');
    expect(dispatch).not.toContain('document.');
    expect(detail).not.toContain('document.');
    expect(controller).not.toContain('innerHTML');
  });
});
