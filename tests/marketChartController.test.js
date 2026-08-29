import { describe, expect, it, vi } from 'vitest';
import { createMarketChartController } from '../js/ui/MarketChartController.js';
import { createMarketWorkspaceSession } from '../js/ui/MarketWorkspaceSession.js';

function createHarness() {
  var session = createMarketWorkspaceSession();
  session.setChartRange('sol_prime:open', 14);
  var selection = {
    getFocusedGood: vi.fn(function () { return 'food'; }),
    focus: vi.fn(function () { return true; }),
  };
  var renderDashboard = vi.fn(function () { return true; });
  var updateKline = vi.fn(function () { return true; });
  var updatedSnapshots = [{ good: { id: 'food' }, history: [1, 2, 3] }];
  var buildSnapshots = vi.fn(function () { return updatedSnapshots; });
  var controller = createMarketChartController({
    session: session,
    selection: selection,
    buildSnapshots: buildSnapshots,
    renderDashboard: renderDashboard,
    updateKline: updateKline,
  });
  var goods = [{ id: 'food' }, { id: 'water' }];
  var snapshots = [{ good: goods[0] }, { good: goods[1] }];
  var rerenderSpot = vi.fn();
  var request = {
    state: { currentSystem: 'sol_prime' },
    systemId: 'sol_prime',
    marketMode: 'open',
    focusKey: 'sol_prime:open',
    focusedGoodId: 'food',
    goodsList: goods,
    snapshots: snapshots,
    rerenderSpot: rerenderSpot,
  };
  return {
    buildSnapshots: buildSnapshots,
    controller: controller,
    goods: goods,
    renderDashboard: renderDashboard,
    request: request,
    rerenderSpot: rerenderSpot,
    selection: selection,
    session: session,
    snapshots: snapshots,
    updateKline: updateKline,
    updatedSnapshots: updatedSnapshots,
  };
}

describe('MarketChartController', function () {
  it('用共享选择与图表区间渲染仪表板和主 K 线', function () {
    var harness = createHarness();

    expect(harness.controller.render(harness.request)).toEqual({
      dashboardRendered: true,
      focusedGoodId: 'food',
      klineRendered: true,
    });

    expect(harness.renderDashboard).toHaveBeenCalledWith(expect.objectContaining({
      focusedGoodId: 'food',
      range: 14,
      snapshots: harness.snapshots,
    }));
    expect(harness.updateKline).toHaveBeenCalledWith(expect.objectContaining({
      focusedGoodId: 'food',
      range: 14,
      snapshots: harness.snapshots,
    }));
    expect(harness.controller.getDiagnostics()).toEqual({
      renderCount: 1,
      dashboardRenderCount: 1,
      klineRenderCount: 1,
      focusIntentCount: 0,
      rangeChangeCount: 0,
      lastFocusedGoodId: 'food',
      lastRange: 14,
      lastSystemId: 'sol_prime',
      lastMarketMode: 'open',
      lastSnapshotCount: 2,
    });
  });

  it('行情榜焦点通过共享 selection 触发交易区局部重绘', function () {
    var harness = createHarness();
    harness.controller.render(harness.request);
    var dashboardRequest = harness.renderDashboard.mock.calls[0][0];

    dashboardRequest.onFocusChange('water');

    expect(harness.selection.focus).toHaveBeenCalledWith({
      focusKey: 'sol_prime:open',
      goodId: 'water',
      goodsList: harness.goods,
      source: 'market-chart-rank',
      rerenderSpot: harness.rerenderSpot,
    });
    expect(harness.controller.getDiagnostics().focusIntentCount).toBe(1);
  });

  it('统计窗口变化只重绘两个图表视图并可重置 diagnostics', function () {
    var harness = createHarness();
    harness.controller.render(harness.request);
    var dashboardRequest = harness.renderDashboard.mock.calls[0][0];

    expect(dashboardRequest.onRangeChange(30)).toBe(true);

    expect(harness.session.getChartRange('sol_prime:open')).toBe(30);
    expect(harness.buildSnapshots).toHaveBeenCalledWith(
      harness.request.state,
      'sol_prime',
      harness.goods,
      false,
      30
    );
    expect(harness.renderDashboard).toHaveBeenCalledTimes(2);
    expect(harness.updateKline).toHaveBeenCalledTimes(2);
    expect(harness.renderDashboard.mock.calls[1][0].snapshots).toBe(harness.updatedSnapshots);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      renderCount: 1,
      dashboardRenderCount: 2,
      klineRenderCount: 2,
      rangeChangeCount: 1,
      lastRange: 30,
      lastSnapshotCount: 1,
    }));
    expect(harness.controller.reset()).toEqual({
      renderCount: 0,
      dashboardRenderCount: 0,
      klineRenderCount: 0,
      focusIntentCount: 0,
      rangeChangeCount: 0,
      lastFocusedGoodId: null,
      lastRange: null,
      lastSystemId: null,
      lastMarketMode: null,
      lastSnapshotCount: 0,
    });
  });
});
