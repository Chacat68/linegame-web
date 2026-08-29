import { describe, expect, it, vi } from 'vitest';
import { createMarketChartViewAdapter } from '../js/ui/MarketChartViewAdapter.js';

function createElement() {
  return { innerHTML: '', onclick: null };
}

function createTarget(dataset) {
  var target = { dataset: dataset || {} };
  target.closest = function (selector) {
    if (selector === '[data-focus-good]' && target.dataset.focusGood) return target;
    if (selector === '[data-range]' && target.dataset.range) return target;
    if (selector === '[data-kline-range]' && target.dataset.klineRange) return target;
    return null;
  };
  return target;
}

function createDocument() {
  var elements = {
    'market-terminal-dashboard': createElement(),
    'market-kline-panel': createElement(),
    'market-kline-title': createElement(),
    'market-kline-range-bar': createElement(),
    'market-kline-ohlc': createElement(),
    'market-kline-body': createElement(),
    'market-kline-metrics': createElement(),
  };
  var scrollIntoView = vi.fn();
  return {
    elements: elements,
    scrollIntoView: scrollIntoView,
    document: {
      getElementById: function (id) { return elements[id] || null; },
      querySelector: function (selector) {
        return selector === '[data-market-good="tools"]'
          ? { scrollIntoView: scrollIntoView }
          : null;
      },
    },
  };
}

describe('MarketChartViewAdapter', function () {
  it('以单一根委托发布行情榜焦点与统计窗口 intent', function () {
    var harness = createDocument();
    var onFocusChange = vi.fn();
    var onRangeChange = vi.fn();
    var adapter = createMarketChartViewAdapter({
      document: harness.document,
      buildDashboardView: function () {
        return Object.freeze({ html: '<section>dashboard</section>' });
      },
    });

    expect(adapter.renderDashboard({
      onFocusChange: onFocusChange,
      onRangeChange: onRangeChange,
    })).toBe(true);
    var container = harness.elements['market-terminal-dashboard'];
    expect(container.innerHTML).toContain('dashboard');
    container.onclick({ target: createTarget({ focusGood: 'tools' }) });
    container.onclick({ target: createTarget({ range: '30' }) });
    container.onclick({ target: createTarget({ range: '29' }) });

    expect(onFocusChange).toHaveBeenCalledWith('tools');
    expect(onRangeChange).toHaveBeenCalledTimes(1);
    expect(onRangeChange).toHaveBeenCalledWith(30);
    expect(harness.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(adapter.getDiagnostics()).toMatchObject({ dashboardActive: true, dashboardBindCount: 1 });
  });

  it('把主 K 线 view model 投影到五个区域并委托区间 intent', function () {
    var harness = createDocument();
    var onRangeChange = vi.fn();
    var adapter = createMarketChartViewAdapter({
      document: harness.document,
      buildKlineView: function () {
        return Object.freeze({
          titleHtml: 'title',
          rangeHtml: 'range',
          ohlcHtml: 'ohlc',
          bodyHtml: 'body',
          metricsHtml: 'metrics',
        });
      },
    });

    expect(adapter.renderKline({ onRangeChange: onRangeChange })).toBe(true);
    expect(harness.elements['market-kline-title'].innerHTML).toBe('title');
    expect(harness.elements['market-kline-range-bar'].innerHTML).toBe('range');
    expect(harness.elements['market-kline-ohlc'].innerHTML).toBe('ohlc');
    expect(harness.elements['market-kline-body'].innerHTML).toBe('body');
    expect(harness.elements['market-kline-metrics'].innerHTML).toBe('metrics');

    harness.elements['market-kline-range-bar'].onclick({
      target: createTarget({ klineRange: '7' }),
    });
    expect(onRangeChange).toHaveBeenCalledWith(7);
    expect(adapter.getDiagnostics()).toMatchObject({ klineActive: true, klineBindCount: 1 });
  });

  it('重绘与 reset 会释放旧根处理器，空 view 会清理陈旧内容', function () {
    var harness = createDocument();
    var hasView = true;
    var adapter = createMarketChartViewAdapter({
      document: harness.document,
      buildDashboardView: function () { return hasView ? { html: 'dashboard' } : null; },
      buildKlineView: function () {
        return hasView ? {
          titleHtml: 'title', rangeHtml: 'range', ohlcHtml: 'ohlc', bodyHtml: 'body', metricsHtml: 'metrics',
        } : null;
      },
    });

    adapter.renderDashboard({});
    adapter.renderKline({});
    hasView = false;
    expect(adapter.renderDashboard({})).toBe(false);
    expect(adapter.renderKline({})).toBe(false);
    expect(harness.elements['market-terminal-dashboard'].innerHTML).toBe('');
    expect(harness.elements['market-kline-title'].innerHTML).toBe('');
    expect(harness.elements['market-kline-range-bar'].onclick).toBeNull();

    hasView = true;
    adapter.renderDashboard({});
    adapter.renderKline({});
    expect(adapter.reset()).toMatchObject({
      dashboardActive: false,
      dashboardBindCount: 0,
      klineActive: false,
      klineBindCount: 0,
      resetCount: 1,
    });
    expect(harness.elements['market-terminal-dashboard'].onclick).toBeNull();
    expect(harness.elements['market-kline-range-bar'].onclick).toBeNull();
  });
});
