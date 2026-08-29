// js/ui/MarketChartController.js — 行情仪表板、主 K 线与统计窗口交互生命周期
// 商品选择通过共享 MarketSelectionController 提交，不直接写 Context 或领域状态。

import {
  buildMarketSnapshots,
  renderMarketChartDashboard,
  updateMainMarketKlineChart,
} from './MarketChartPresenter.js';

export function createMarketChartController(options) {
  var opts = options || {};
  var session = opts.session;
  var selection = opts.selection;
  var buildSnapshots = typeof opts.buildSnapshots === 'function'
    ? opts.buildSnapshots
    : buildMarketSnapshots;
  var renderDashboard = typeof opts.renderDashboard === 'function'
    ? opts.renderDashboard
    : renderMarketChartDashboard;
  var updateKline = typeof opts.updateKline === 'function'
    ? opts.updateKline
    : updateMainMarketKlineChart;
  var renderCount = 0;
  var dashboardRenderCount = 0;
  var klineRenderCount = 0;
  var focusIntentCount = 0;
  var rangeChangeCount = 0;
  var lastFocusedGoodId = null;
  var lastRange = null;
  var lastSystemId = null;
  var lastMarketMode = null;
  var lastSnapshotCount = 0;

  function renderViews(request) {
    var input = request || {};
    var snapshots = Array.isArray(input.snapshots) ? input.snapshots : [];
    var goodsList = Array.isArray(input.goodsList) ? input.goodsList : [];
    var focusKey = input.focusKey || '';
    var marketMode = input.marketMode === 'black' ? 'black' : 'open';
    var focusedGoodId = selection.getFocusedGood(focusKey) ||
      input.focusedGoodId ||
      (snapshots[0] && snapshots[0].good.id) ||
      null;
    var range = session.getChartRange(focusKey);

    function handleFocusChange(goodId) {
      var accepted = selection.focus({
        focusKey: focusKey,
        goodId: goodId,
        goodsList: goodsList,
        source: 'market-chart-rank',
        rerenderSpot: input.rerenderSpot,
      });
      if (accepted) focusIntentCount += 1;
    }

    function handleRangeChange(nextRange) {
      var previousRange = session.getChartRange(focusKey);
      if (!session.setChartRange(focusKey, nextRange)) return false;
      var normalizedRange = session.getChartRange(focusKey);
      if (normalizedRange === previousRange) return false;
      rangeChangeCount += 1;
      var updatedSnapshots = buildSnapshots(
        input.state,
        input.systemId,
        goodsList,
        marketMode === 'black',
        normalizedRange
      );
      renderViews(Object.assign({}, input, {
        snapshots: updatedSnapshots,
        focusedGoodId: selection.getFocusedGood(focusKey),
      }));
      return true;
    }

    var dashboardRendered = renderDashboard({
      state: input.state,
      systemId: input.systemId,
      snapshots: snapshots,
      marketMode: marketMode,
      focusedGoodId: focusedGoodId,
      range: range,
      onFocusChange: handleFocusChange,
      onRangeChange: handleRangeChange,
    }) === true;
    var klineRendered = updateKline({
      state: input.state,
      systemId: input.systemId,
      snapshots: snapshots,
      marketMode: marketMode,
      focusedGoodId: focusedGoodId,
      range: range,
      onRangeChange: handleRangeChange,
    }) === true;

    if (dashboardRendered) dashboardRenderCount += 1;
    if (klineRendered) klineRenderCount += 1;
    lastFocusedGoodId = focusedGoodId;
    lastRange = range;
    lastSystemId = input.systemId || null;
    lastMarketMode = marketMode;
    lastSnapshotCount = snapshots.length;
    return Object.freeze({
      dashboardRendered: dashboardRendered,
      focusedGoodId: focusedGoodId,
      klineRendered: klineRendered,
    });
  }

  function render(request) {
    renderCount += 1;
    return renderViews(request);
  }

  function getDiagnostics() {
    return Object.freeze({
      renderCount: renderCount,
      dashboardRenderCount: dashboardRenderCount,
      klineRenderCount: klineRenderCount,
      focusIntentCount: focusIntentCount,
      rangeChangeCount: rangeChangeCount,
      lastFocusedGoodId: lastFocusedGoodId,
      lastRange: lastRange,
      lastSystemId: lastSystemId,
      lastMarketMode: lastMarketMode,
      lastSnapshotCount: lastSnapshotCount,
    });
  }

  function reset() {
    renderCount = 0;
    dashboardRenderCount = 0;
    klineRenderCount = 0;
    focusIntentCount = 0;
    rangeChangeCount = 0;
    lastFocusedGoodId = null;
    lastRange = null;
    lastSystemId = null;
    lastMarketMode = null;
    lastSnapshotCount = 0;
    return getDiagnostics();
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    render: render,
    reset: reset,
  });
}
