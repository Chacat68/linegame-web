import { describe, expect, it, vi } from 'vitest';
import { createMapSurveyDetailController } from '../js/ui/MapSurveyDetailController.js';

function createSummary(marker) {
  return {
    threatLevel: 'low',
    threatLabel: '低风险',
    opportunityLabel: '贸易窗口',
    intelLevel: 2,
    reportCount: 1,
    completionBonusClaimed: true,
    completionRewardLabel: '已结算',
    anomalyChainCount: 0,
    resolvedAnomalyChainCount: 0,
    anomalyChains: [],
    reports: [{
      id: 'report-1',
      title: '补给报告',
      detail: '来自 ' + marker,
      signalTags: ['补给'],
    }],
  };
}

function createHarness() {
  var renderers = new Map();
  var releases = [];
  var state = { marker: 'state-a' };
  var revision = 4;
  var surface = {
    registerRenderer: vi.fn(function (type, renderer) {
      renderers.set(type, renderer);
      var release = vi.fn(function () { renderers.delete(type); });
      releases.push(release);
      return release;
    }),
    open: vi.fn(function () { return true; }),
    close: vi.fn(),
  };
  var openMarket = vi.fn();
  var controller = createMapSurveyDetailController({
    surface: surface,
    getState: function () { return state; },
    getRevision: function () { return revision; },
    findSystem: function (systemId) {
      return systemId === 'sol_prime' ? { id: systemId, name: '太阳主星' } : null;
    },
    getSurveySummary: function (currentState) { return createSummary(currentState.marker); },
    getMarketAction: function (_state, systemId) {
      return {
        type: 'market',
        systemId: systemId,
        label: '打开市场',
        marketWorkspaceId: 'intel',
        marketSubworkspaceId: 'routes',
      };
    },
    openMarket: openMarket,
  });
  return {
    controller: controller,
    openMarket: openMarket,
    releases: releases,
    renderers: renderers,
    setRevision: function (value) { revision = value; },
    setState: function (value) { state = value; },
    surface: surface,
  };
}

describe('MapSurveyDetailController', function () {
  it('注册两层 renderer，并始终使用最新 state 与 revision 打开报告', function () {
    var harness = createHarness();
    expect(harness.controller.register()).toBe(true);
    expect(harness.controller.register()).toBe(false);
    expect(Array.from(harness.renderers.keys()).sort()).toEqual(['map-report', 'map-survey']);

    var archiveContainer = { innerHTML: '' };
    var archiveResult = harness.renderers.get('map-survey')({
      detail: { id: 'sol_prime' },
      container: archiveContainer,
    });
    expect(archiveResult.title).toBe('太阳主星 · 探索档案');
    expect(archiveContainer.innerHTML).toContain('data-workspace-detail-report-id="report-1"');

    harness.setState({ marker: 'state-b' });
    harness.setRevision(9);
    var trigger = { id: 'report-trigger' };
    expect(archiveResult.onAction({
      action: 'open-report',
      dataset: { workspaceDetailReportId: 'report-1' },
      target: trigger,
    })).toBe(true);
    expect(harness.surface.open).toHaveBeenCalledWith({
      type: 'map-report',
      id: 'sol_prime::report-1',
      workspaceId: 'map',
      source: 'survey-archive',
      revision: 9,
    }, {
      triggerElement: trigger,
      returnFocusSelector: '[data-workspace-detail-report-id="report-1"]',
    });

    var reportContainer = { innerHTML: '' };
    var reportResult = harness.renderers.get('map-report')({
      detail: { id: 'sol_prime::report-1' },
      container: reportContainer,
    });
    expect(reportResult.title).toBe('太阳主星 · 单份报告');
    expect(reportContainer.innerHTML).toContain('来自 state-b');
  });

  it('把市场 intent 交给注入端口，并在导航前关闭详情层', function () {
    var harness = createHarness();
    harness.controller.register();
    var archiveResult = harness.renderers.get('map-survey')({
      detail: { id: 'sol_prime' },
      state: { marker: 'render-state' },
      container: { innerHTML: '' },
    });
    var actionState = { marker: 'action-state' };

    expect(archiveResult.onAction({
      action: 'market',
      state: actionState,
      dataset: {
        systemId: 'sol_prime',
        marketWorkspaceId: 'intel',
        marketSubworkspaceId: 'routes',
        marketMode: 'detail',
      },
    })).toBe(true);
    expect(harness.surface.close).toHaveBeenCalledOnce();
    expect(harness.openMarket).toHaveBeenCalledWith(actionState, 'sol_prime', {
      workspaceId: 'intel',
      subworkspaceId: 'routes',
      marketMode: 'detail',
    });
    expect(archiveResult.onAction({ action: 'unknown', dataset: {} })).toBe(false);
  });

  it('统一打开档案、释放 renderer 并暴露只读诊断', function () {
    var harness = createHarness();
    var launcher = { id: 'launcher' };
    harness.controller.register();

    expect(harness.controller.open('sol_prime', launcher)).toBe(true);
    expect(harness.surface.open).toHaveBeenCalledWith({
      type: 'map-survey',
      id: 'sol_prime',
      workspaceId: 'map',
      source: 'map-context',
      revision: 4,
    }, {
      triggerElement: launcher,
      returnFocusSelector: '[data-planet-detail-action="open-survey"][data-system-id="sol_prime"]',
    });
    expect(Object.isFrozen(harness.controller.getDiagnostics())).toBe(true);
    expect(harness.controller.getDiagnostics().registered).toBe(true);
    expect(harness.controller.dispose()).toBe(true);
    expect(harness.controller.dispose()).toBe(false);
    expect(harness.releases.every(function (release) { return release.mock.calls.length === 1; })).toBe(true);
    expect(harness.renderers.size).toBe(0);
    expect(harness.controller.getDiagnostics().registered).toBe(false);
  });
});
