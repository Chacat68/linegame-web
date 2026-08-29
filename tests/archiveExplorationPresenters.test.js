import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import * as Exploration from '../js/systems/galaxy/ExplorationSystem.js';
import {
  buildArchiveExplorationEntries,
  buildArchiveExplorationView,
} from '../js/ui/ArchiveExplorationPresenter.js';
import {
  buildArchiveReportContextView,
  buildArchiveReportWorkspaceDetailView,
  findArchiveReport,
  getArchiveReportSignalLabels,
} from '../js/ui/ArchiveReportDetailPresenter.js';
import { createTestState } from './helpers.js';

function createSurveyState() {
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
  var poi = GalaxyData.getPlanetData('sol_prime').exploration.pois.find(function (entry) {
    return entry.kind === 'resource_cache';
  });
  expect(Exploration.explorePoi(state, 'sol_prime', poi.id).ok).toBe(true);
  return state;
}

describe('Archive exploration presenters', function () {
  it('纯投影探索总览、报告、航点进度与焦点链', function () {
    var state = createSurveyState();
    var focus = { systemId: 'sol_prime', chainId: 'sol_prime_chain_derelict_depot' };
    var view = buildArchiveExplorationView({ state: state, focus: focus });
    expect(Object.isFrozen(view)).toBe(true);
    expect(view.entryCount).toBe(1);
    expect(view.reportCount).toBeGreaterThan(0);
    expect(view.html).toContain('archive-exploration-console');
    expect(view.html).toContain('data-archive-report-id=');
    expect(view.html).toContain('data-archive-survey-chain-id="sol_prime_chain_derelict_depot"');
    expect(view.html).toContain('data-guide-focus="true"');
    expect(view.html).toContain('商网 / 整备');
  });

  it('焦点航点优先排序，条目数组和条目模型被冻结', function () {
    var state = createSurveyState();
    var entries = buildArchiveExplorationEntries(state, { systemId: 'sol_prime', chainId: '' });
    expect(entries[0].system.id).toBe('sol_prime');
    expect(Object.isFrozen(entries)).toBe(true);
    expect(Object.isFrozen(entries[0])).toBe(true);
  });

  it('Context 与 L4 详情由独立 Presenter 生成并拒绝错误类型', function () {
    var state = createSurveyState();
    var summary = Exploration.getSurveySummary(state, 'sol_prime');
    var report = summary.reports[0];
    expect(findArchiveReport(state, report.id).report.id).toBe(report.id);
    var contextView = buildArchiveReportContextView({ context: { type: 'report', id: report.id }, state: state });
    var detailView = buildArchiveReportWorkspaceDetailView({ detail: { type: 'archive-report', id: report.id }, state: state });
    expect(contextView.html).toContain('workspace-context-card--report');
    expect(contextView.html).toContain('查看完整报告详情');
    expect(detailView.html).toContain('所属区域');
    expect(Object.isFrozen(contextView)).toBe(true);
    expect(Object.isFrozen(detailView)).toBe(true);
    expect(buildArchiveReportContextView({ context: { type: 'quest', id: report.id }, state: state })).toBeNull();
  });

  it('报告信号标签稳定去重并提供默认分类', function () {
    expect(getArchiveReportSignalLabels({ kind: 'market', signalTags: ['market', 'logistics'] })).toEqual(['交易', '补给']);
    expect(getArchiveReportSignalLabels({})).toEqual(['探索记录']);
    expect(Object.isFrozen(getArchiveReportSignalLabels({}))).toBe(true);
  });

  it('源码所有权阻止 DOM、listener、焦点会话与领域 selector 回流兼容门面', function () {
    var facade = readFileSync('js/ui/ArchiveExplorationUI.js', 'utf8');
    var board = readFileSync('js/ui/ArchiveExplorationPresenter.js', 'utf8');
    var detail = readFileSync('js/ui/ArchiveReportDetailPresenter.js', 'utf8');
    var controller = readFileSync('js/ui/ArchiveExplorationController.js', 'utf8');
    expect(facade).toContain("from './ArchiveExplorationSession.js'");
    expect(facade).toContain("from './ArchiveExplorationController.js'");
    expect(facade).toContain("from './ArchiveExplorationPresenter.js'");
    expect(facade).toContain("from './ArchiveReportDetailPresenter.js'");
    expect(facade).not.toContain('querySelectorAll');
    expect(facade).not.toContain('addEventListener');
    expect(facade).not.toContain('ExplorationSystem');
    expect(board).not.toContain('document.');
    expect(detail).not.toContain('document.');
    expect(controller).not.toContain('innerHTML');
  });
});
