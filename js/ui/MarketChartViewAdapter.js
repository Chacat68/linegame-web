// js/ui/MarketChartViewAdapter.js — 行情 view model 到 DOM 与 delegated intent 的唯一适配边界

import {
  MARKET_CHART_RANGE_OPTIONS,
  buildMainMarketKlineView,
  buildMarketChartDashboardView,
} from './MarketChartPresenter.js';

function _findTarget(event, selector) {
  var target = event && event.target;
  return target && typeof target.closest === 'function' ? target.closest(selector) : null;
}

function _normalizeRange(value) {
  var range = Number(value);
  return MARKET_CHART_RANGE_OPTIONS.indexOf(range) !== -1 ? range : null;
}

function _selectorValue(value) {
  return String(value == null ? '' : value).replace(/[\\"]/g, '\\$&');
}

export function createMarketChartViewAdapter(options) {
  var config = options || {};
  var buildDashboardView = typeof config.buildDashboardView === 'function'
    ? config.buildDashboardView
    : buildMarketChartDashboardView;
  var buildKlineView = typeof config.buildKlineView === 'function'
    ? config.buildKlineView
    : buildMainMarketKlineView;
  var activeDashboard = null;
  var activeRangeBar = null;
  var dashboardRequest = null;
  var klineRequest = null;
  var dashboardBindCount = 0;
  var klineBindCount = 0;
  var resetCount = 0;

  function _getDocument(request) {
    return request && request.document
      ? request.document
      : (config.document || globalThis.document || null);
  }

  function _releaseDashboard() {
    if (activeDashboard && activeDashboard.onclick === _handleDashboardClick) activeDashboard.onclick = null;
    activeDashboard = null;
    dashboardRequest = null;
  }

  function _releaseKline() {
    if (activeRangeBar && activeRangeBar.onclick === _handleKlineRangeClick) activeRangeBar.onclick = null;
    activeRangeBar = null;
    klineRequest = null;
  }

  function _scrollToMarketGood(documentRef, goodId) {
    if (!documentRef || typeof documentRef.querySelector !== 'function') return false;
    var row = documentRef.querySelector('[data-market-good="' + _selectorValue(goodId) + '"]');
    if (!row || typeof row.scrollIntoView !== 'function') return false;
    row.scrollIntoView({ block: 'nearest' });
    return true;
  }

  function _handleDashboardClick(event) {
    var focusButton = _findTarget(event, '[data-focus-good]');
    if (focusButton) {
      var goodId = focusButton.dataset && focusButton.dataset.focusGood;
      if (!goodId) return;
      if (dashboardRequest && typeof dashboardRequest.onFocusChange === 'function') {
        dashboardRequest.onFocusChange(goodId);
      }
      _scrollToMarketGood(_getDocument(dashboardRequest), goodId);
      return;
    }
    var rangeButton = _findTarget(event, '[data-range]');
    if (!rangeButton) return;
    var range = _normalizeRange(rangeButton.dataset && rangeButton.dataset.range);
    if (range !== null && dashboardRequest && typeof dashboardRequest.onRangeChange === 'function') {
      dashboardRequest.onRangeChange(range);
    }
  }

  function _handleKlineRangeClick(event) {
    var rangeButton = _findTarget(event, '[data-kline-range]');
    if (!rangeButton) return;
    var range = _normalizeRange(rangeButton.dataset && rangeButton.dataset.klineRange);
    if (range !== null && klineRequest && typeof klineRequest.onRangeChange === 'function') {
      klineRequest.onRangeChange(range);
    }
  }

  function renderDashboard(request) {
    var input = request || {};
    var documentRef = _getDocument(input);
    _releaseDashboard();
    if (!documentRef || typeof documentRef.getElementById !== 'function') return false;
    var container = documentRef.getElementById('market-terminal-dashboard');
    if (!container) return false;
    var view = buildDashboardView(input);
    container.innerHTML = view ? view.html : '';
    if (!view) return false;
    activeDashboard = container;
    dashboardRequest = input;
    container.onclick = _handleDashboardClick;
    dashboardBindCount += 1;
    return true;
  }

  function renderKline(request) {
    var input = request || {};
    var documentRef = _getDocument(input);
    _releaseKline();
    if (!documentRef || typeof documentRef.getElementById !== 'function') return false;
    var panel = documentRef.getElementById('market-kline-panel');
    if (!panel) return false;
    var view = buildKlineView(input);
    var title = documentRef.getElementById('market-kline-title');
    var rangeBar = documentRef.getElementById('market-kline-range-bar');
    var ohlc = documentRef.getElementById('market-kline-ohlc');
    var body = documentRef.getElementById('market-kline-body');
    var metrics = documentRef.getElementById('market-kline-metrics');
    if (title) title.innerHTML = view ? view.titleHtml : '';
    if (rangeBar) rangeBar.innerHTML = view ? view.rangeHtml : '';
    if (ohlc) ohlc.innerHTML = view ? view.ohlcHtml : '';
    if (body) body.innerHTML = view ? view.bodyHtml : '';
    if (metrics) metrics.innerHTML = view ? view.metricsHtml : '';
    if (!view || !rangeBar) return !!view;
    activeRangeBar = rangeBar;
    klineRequest = input;
    rangeBar.onclick = _handleKlineRangeClick;
    klineBindCount += 1;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      dashboardActive: !!activeDashboard,
      dashboardBindCount: dashboardBindCount,
      klineActive: !!activeRangeBar,
      klineBindCount: klineBindCount,
      resetCount: resetCount,
    });
  }

  function reset() {
    _releaseDashboard();
    _releaseKline();
    dashboardBindCount = 0;
    klineBindCount = 0;
    resetCount += 1;
    return getDiagnostics();
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    renderDashboard: renderDashboard,
    renderKline: renderKline,
    reset: reset,
  });
}
