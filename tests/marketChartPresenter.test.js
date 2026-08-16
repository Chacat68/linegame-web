import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMarketPseudoCandles,
  buildMarketSnapshots,
  calculateMarketMovingAverage,
  formatMarketChartDelta,
  normalizeMarketChartHistory,
  renderFullMarketKlineChart,
  renderMarketChart,
  renderMarketChartDashboard,
  updateMainMarketKlineChart,
} from '../js/ui/MarketChartPresenter.js';

function createButton(dataset) {
  var listeners = {};
  return {
    dataset: dataset || {},
    addEventListener: function (type, listener) { listeners[type] = listener; },
    click: function () { if (listeners.click) listeners.click(); },
  };
}

function createElement(queryMap) {
  return {
    innerHTML: '',
    querySelectorAll: function (selector) {
      return queryMap && queryMap[selector] ? queryMap[selector] : [];
    },
  };
}

function createSnapshot(id, price, delta, ratio, swing) {
  return {
    good: { id: id, emoji: id === 'food' ? '🌾' : '🛠️', name: id === 'food' ? '食物' : '工具' },
    buyPrice: price + 3,
    sellPrice: price,
    history: [price - 2, price - 1, price],
    delta: formatMarketChartDelta([price - 2, price]),
    swing: swing,
    spread: 3,
    supplyDemand: { ratio: ratio },
  };
}

describe('MarketChartPresenter', function () {
  it('归一化价格历史并构造稳定的蜡烛与均线', function () {
    var history = normalizeMarketChartHistory([0, 10.4, 12.6], 9, 7);
    var candles = buildMarketPseudoCandles(history);
    var average = calculateMarketMovingAverage([2, 4, 8], 2);

    expect(history).toHaveLength(7);
    expect(history.slice(-3)).toEqual([9, 10, 13]);
    expect(candles).toHaveLength(7);
    expect(candles[6]).toMatchObject({ open: 10, close: 13 });
    expect(candles[6].high).toBeGreaterThanOrEqual(13);
    expect(candles[6].low).toBeGreaterThanOrEqual(1);
    expect(average).toEqual([2, 3, 6]);
  });

  it('归类涨跌幅并为 SVG 文本做属性转义', function () {
    expect(formatMarketChartDelta([10, 12])).toEqual({ text: '+20.0%', className: 'market-chart-up' });
    expect(formatMarketChartDelta([10, 8])).toEqual({ text: '-20.0%', className: 'market-chart-down' });
    expect(formatMarketChartDelta([10, 10])).toEqual({ text: '0.0%', className: 'market-chart-flat' });

    var svg = renderMarketChart([10, 12, 11], 11, 'A"<B', {
      width: 340,
      height: 164,
      chartBottom: 122,
      volumeBase: 154,
    });
    expect(svg).toContain('viewBox="0 0 340 164"');
    expect(svg).toContain('x2="336"');
    expect(svg).toContain('y1="122.5"');
    expect(svg).toContain('aria-label="A&quot;&lt;B 价格走势"');
  });

  it('主 K 线保留 OHLC、均线与不越界的当前价标签', function () {
    var svg = renderFullMarketKlineChart([8, 9, 10, 12, 11, 13], 13, '食物', 14);

    expect(svg).toContain('class="market-kline-svg"');
    expect(svg).toContain('kline-ma5');
    expect(svg).toContain('kline-ma10');
    expect(svg).toContain('class="kline-current-tag-bg"');
    expect(svg).toContain('<rect x="502"');
    expect(svg).toContain('aria-label="食物 价格走势图"');
  });

  it('通过注入的经济端口构造公开与黑市快照', function () {
    var economy = {
      getBuyPrice: vi.fn(function () { return 15; }),
      getSellPrice: vi.fn(function () { return 10; }),
      getBlackMarketBuyPrice: vi.fn(function () { return 25; }),
      getBlackMarketSellPrice: vi.fn(function () { return 20; }),
      getPriceHistory: vi.fn(function () { return [8, 9, 10]; }),
      getSupplyDemand: vi.fn(function () { return { ratio: 1.4 }; }),
    };
    var good = { id: 'food', name: '食物' };
    var state = { cargo: {} };

    var open = buildMarketSnapshots(state, 'sol', [good], false, 7, economy)[0];
    var black = buildMarketSnapshots(state, 'sol', [good], true, 7, economy)[0];

    expect(open).toMatchObject({ buyPrice: 15, sellPrice: 10, spread: 5, supplyDemand: { ratio: 1.4 } });
    expect(black).toMatchObject({ buyPrice: 25, sellPrice: 20, spread: 5 });
    expect(economy.getBuyPrice).toHaveBeenCalledOnce();
    expect(economy.getBlackMarketBuyPrice).toHaveBeenCalledOnce();
    expect(open.history).toHaveLength(7);
  });

  it('更新主图全部区域并把档期切换作为 command 发布', function () {
    var rangeButtons = [createButton({ klineRange: '7' }), createButton({ klineRange: '14' })];
    var elements = {
      'market-kline-panel': createElement(),
      'market-kline-title': createElement(),
      'market-kline-range-bar': createElement({ '[data-kline-range]': rangeButtons }),
      'market-kline-ohlc': createElement(),
      'market-kline-body': createElement(),
      'market-kline-metrics': createElement(),
    };
    var documentRef = {
      getElementById: function (id) { return elements[id] || null; },
    };
    var onRangeChange = vi.fn();
    var economy = { getPriceHistory: vi.fn(function () { return [8, 9, 10]; }) };
    var snapshots = [createSnapshot('food', 10, '+25%', 1.4, 4)];

    expect(updateMainMarketKlineChart({
      document: documentRef,
      economy: economy,
      systemId: 'sol',
      snapshots: snapshots,
      marketMode: 'open',
      focusedGoodId: 'food',
      range: 14,
      onRangeChange: onRangeChange,
    })).toBe(true);

    expect(elements['market-kline-title'].innerHTML).toContain('食物');
    expect(elements['market-kline-ohlc'].innerHTML).toContain('买卖差');
    expect(elements['market-kline-body'].innerHTML).toContain('market-kline-svg');
    expect(elements['market-kline-metrics'].innerHTML).toContain('货少需求高');
    rangeButtons[0].click();
    expect(onRangeChange).toHaveBeenCalledWith(7);
  });

  it('行情仪表板发布商品焦点与统计窗口 command', function () {
    var focusButton = createButton({ focusGood: 'tools' });
    var rangeButton = createButton({ range: '30' });
    var container = createElement({
      '[data-focus-good]': [focusButton],
      '[data-range]': [rangeButton],
    });
    var scrollIntoView = vi.fn();
    var documentRef = {
      getElementById: function (id) { return id === 'market-terminal-dashboard' ? container : null; },
      querySelector: function (selector) {
        return selector === '[data-market-good="tools"]' ? { scrollIntoView: scrollIntoView } : null;
      },
    };
    var onFocusChange = vi.fn();
    var onRangeChange = vi.fn();
    var snapshots = [
      createSnapshot('food', 10, '+20%', 1.4, 5),
      createSnapshot('tools', 20, '-10%', 0.7, 8),
    ];

    expect(renderMarketChartDashboard({
      document: documentRef,
      snapshots: snapshots,
      marketMode: 'open',
      focusedGoodId: 'food',
      range: 14,
      onFocusChange: onFocusChange,
      onRangeChange: onRangeChange,
    })).toBe(true);
    expect(container.innerHTML).toContain('涨幅榜');
    expect(container.innerHTML).toContain('近 14 天');

    focusButton.click();
    rangeButton.click();
    expect(onFocusChange).toHaveBeenCalledWith('tools');
    expect(onRangeChange).toHaveBeenCalledWith(30);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('MarketUI 只消费 presenter，不再持有 K 线计算和 SVG 实现', function () {
    var marketUi = readFileSync('js/ui/MarketUI.js', 'utf8');
    var presenter = readFileSync('js/ui/MarketChartPresenter.js', 'utf8');

    expect(marketUi).toContain("from './MarketChartPresenter.js'");
    expect(marketUi).not.toContain('function _buildPseudoCandles');
    expect(marketUi).not.toContain('function _movingAverage');
    expect(marketUi).not.toContain('function _renderFullKlineChart');
    expect(marketUi).not.toContain('class="kline-current-tag-bg"');
    expect(presenter).toContain('export function renderFullMarketKlineChart');
    expect(presenter).toContain('export function updateMainMarketKlineChart');
  });
});
