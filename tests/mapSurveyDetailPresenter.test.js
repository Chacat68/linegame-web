import { describe, expect, it } from 'vitest';
import {
  MAP_SURVEY_INTENT,
  buildMapSurveyArchiveView,
  buildMapSurveyChainCards,
  buildMapSurveyLauncher,
  buildMapSurveyReportView,
  createMapSurveyReportDetailId,
  getMapSurveyLauncherReturnSelector,
  getMapSurveyReportReturnSelector,
  normalizeMapSurveyIntent,
  parseMapSurveyReportDetailId,
} from '../js/ui/MapSurveyDetailPresenter.js';

function createSummary() {
  return {
    threatLevel: 'medium',
    threatLabel: '中等风险',
    opportunityLabel: '科研补给',
    intelLevel: 3,
    reportCount: 1,
    completionBonusClaimed: false,
    completionRewardLabel: '情报 +2',
    anomalyChainCount: 1,
    resolvedAnomalyChainCount: 1,
    anomalyChains: [{
      badge: '遗迹',
      label: '失落阵列',
      stage: 'archived',
      stageLabel: '已归档',
      poiName: '远古信标',
      signal: 'research',
      resolved: true,
    }],
    reports: [{
      id: 'report-1',
      icon: '📘',
      title: '阵列调查',
      chainLabel: '失落阵列',
      badge: '结论',
      day: 7,
      intelValue: 2,
      detail: '发现一条稳定的科研补给线。',
      signalTags: ['科研', '补给'],
    }],
  };
}

describe('MapSurveyDetailPresenter', function () {
  it('生成完整探索档案并保留统一市场与报告 intent', function () {
    var view = buildMapSurveyArchiveView({
      system: { id: 'sol_prime', name: '太阳主星' },
      summary: createSummary(),
      marketAction: {
        type: 'market',
        systemId: 'sol_prime',
        label: '查看科研补给',
        marketWorkspaceId: 'market-intel',
        marketSubworkspaceId: 'routes',
        marketMode: 'detail',
        marketFocusLabel: '行情与路线',
        contextHint: '比较本地供需与航线。',
      },
    });

    expect(Object.isFrozen(view)).toBe(true);
    expect(view.title).toBe('太阳主星 · 探索档案');
    expect(view.html).toContain('data-map-survey-detail="sol_prime"');
    expect(view.html).toContain('中等风险');
    expect(view.html).toContain('失落阵列');
    expect(view.html).toContain('data-exploration-action="market"');
    expect(view.html).toContain('data-market-workspace-id="market-intel"');
    expect(view.html).toContain('data-workspace-detail-action="open-report"');
    expect(view.html).toContain('data-workspace-detail-report-id="report-1"');
  });

  it('安全转义档案和报告中的动态内容', function () {
    var summary = createSummary();
    summary.threatLabel = '<script>threat</script>';
    summary.reports[0].id = 'report"><img src=x>';
    summary.reports[0].title = '<script>title</script>';
    summary.reports[0].detail = '<img src=x onerror=alert(1)>';
    summary.reports[0].signalTags = ['<route>', '补给'];

    var archive = buildMapSurveyArchiveView({
      system: { id: 'sol"><bad', name: '<太阳>' },
      summary: summary,
    });
    var report = buildMapSurveyReportView({
      system: { id: 'sol', name: '<太阳>' },
      summary: summary,
      reportId: 'report"><img src=x>',
    });

    expect(archive.html).not.toContain('<script>');
    expect(archive.html).not.toContain('<img');
    expect(archive.html).toContain('&lt;script&gt;threat&lt;/script&gt;');
    expect(report.html).not.toContain('<script>');
    expect(report.html).not.toContain('<img');
    expect(report.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(report.html).toContain('&lt;route&gt;');
  });

  it('为空报告和缺失报告返回稳定空态', function () {
    var summary = createSummary();
    summary.reports = [];
    summary.reportCount = 0;
    var archive = buildMapSurveyArchiveView({
      system: { id: 'sol', name: '太阳主星' },
      summary: summary,
    });

    expect(archive.html).toContain('尚未生成探索报告');
    expect(buildMapSurveyReportView({
      system: { id: 'sol', name: '太阳主星' },
      summary: summary,
      reportId: 'missing',
    })).toBeNull();
  });

  it('复合报告 key 可逆且焦点返回选择器会转义引号与反斜线', function () {
    var detailId = createMapSurveyReportDetailId('milky::way', 'report / 1');

    expect(parseMapSurveyReportDetailId(detailId)).toEqual({
      systemId: 'milky::way',
      reportId: 'report / 1',
    });
    expect(parseMapSurveyReportDetailId('invalid')).toBeNull();
    expect(parseMapSurveyReportDetailId('%E0%A4%A::report')).toBeNull();
    expect(getMapSurveyReportReturnSelector('r"\\1')).toBe(
      '[data-workspace-detail-report-id="r\\"\\\\1"]',
    );
    expect(getMapSurveyLauncherReturnSelector('s"\\1')).toBe(
      '[data-planet-detail-action="open-survey"][data-system-id="s\\"\\\\1"]',
    );
  });

  it('把详情动作规范化为纯导航 intent，并复用紧凑异常链与入口摘要', function () {
    expect(normalizeMapSurveyIntent({
      action: 'open-report',
      dataset: { workspaceDetailReportId: ' report-1 ' },
    })).toEqual({ type: MAP_SURVEY_INTENT.OPEN_REPORT, reportId: 'report-1' });
    expect(normalizeMapSurveyIntent({
      action: 'market',
      dataset: {
        marketWorkspaceId: ' intel ',
        marketSubworkspaceId: ' routes ',
        marketMode: ' detail ',
      },
    }, 'sol_prime')).toEqual({
      type: MAP_SURVEY_INTENT.OPEN_MARKET,
      systemId: 'sol_prime',
      workspaceId: 'intel',
      subworkspaceId: 'routes',
      marketMode: 'detail',
    });
    expect(normalizeMapSurveyIntent({ action: 'unknown', dataset: {} }, 'sol')).toBeNull();

    var summary = createSummary();
    expect(buildMapSurveyChainCards(summary, { compact: true })).toContain('planet-detail-chain-grid--compact');
    expect(buildMapSurveyLauncher(summary, { id: 'sol_prime' })).toContain('1/1 条异常链');
    expect(buildMapSurveyLauncher(summary, { id: 'sol_prime' })).toContain('data-planet-detail-action="open-survey"');
  });
});
