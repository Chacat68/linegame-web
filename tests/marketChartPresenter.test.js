import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMainMarketKlineView,
  buildMarketChartDashboardView,
  buildMarketPseudoCandles,
  buildMarketSnapshots,
  calculateMarketMovingAverage,
  formatMarketChartDelta,
  normalizeMarketChartHistory,
  renderFullMarketKlineChart,
  renderMarketChart,
} from '../js/ui/MarketChartPresenter.js';

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

  it('主 K 线 view model 纯生成全部区域并冻结结果', function () {
    var economy = { getPriceHistory: vi.fn(function () { return [8, 9, 10]; }) };
    var snapshots = [createSnapshot('food', 10, '+25%', 1.4, 4)];

    var view = buildMainMarketKlineView({
      economy: economy,
      systemId: 'sol',
      snapshots: snapshots,
      marketMode: 'open',
      focusedGoodId: 'food',
      range: 14,
    });

    expect(view.titleHtml).toContain('食物');
    expect(view.ohlcHtml).toContain('买卖差');
    expect(view.bodyHtml).toContain('market-kline-svg');
    expect(view.metricsHtml).toContain('货少需求高');
    expect(view.rangeHtml).toContain('aria-pressed="true"');
    expect(view).toMatchObject({ focusedGoodId: 'food', range: 14 });
    expect(Object.isFrozen(view)).toBe(true);
    expect(buildMainMarketKlineView({ snapshots: [] })).toBeNull();
  });

  it('行情仪表板 view model 生成榜单、统计窗口与安全文本', function () {
    var snapshots = [
      createSnapshot('food', 10, '+20%', 1.4, 5),
      createSnapshot('tools', 20, '-10%', 0.7, 8),
    ];
    snapshots[1].good.name = '工具<script>';

    var view = buildMarketChartDashboardView({
      snapshots: snapshots,
      marketMode: 'open',
      focusedGoodId: 'food',
      range: 14,
    });

    expect(view.html).toContain('涨幅榜');
    expect(view.html).toContain('近 14 天');
    expect(view.html).toContain('工具&lt;script&gt;');
    expect(view.html).not.toContain('工具<script>');
    expect(view).toMatchObject({ focusedGoodId: 'food', range: 14 });
    expect(Object.isFrozen(view)).toBe(true);
    expect(buildMarketChartDashboardView({ snapshots: [] })).toBeNull();
  });

  it('MarketUI 只组合图表 Controller，Presenter 保持无 DOM', function () {
    var marketUi = readFileSync('js/ui/MarketUI.js', 'utf8');
    var presenter = readFileSync('js/ui/MarketChartPresenter.js', 'utf8');
    var controller = readFileSync('js/ui/MarketChartController.js', 'utf8');
    var adapter = readFileSync('js/ui/MarketChartViewAdapter.js', 'utf8');

    expect(marketUi).toContain("from './MarketChartController.js'");
    expect(marketUi).not.toContain('function _renderMarketDashboard');
    expect(marketUi).not.toContain('function _updateMainKlineChart');
    expect(marketUi).not.toContain('function _buildPseudoCandles');
    expect(marketUi).not.toContain('function _movingAverage');
    expect(marketUi).not.toContain('function _renderFullKlineChart');
    expect(marketUi).not.toContain('class="kline-current-tag-bg"');
    expect(controller).toContain("from './MarketChartPresenter.js'");
    expect(controller).toContain("from './MarketChartViewAdapter.js'");
    expect(controller).toContain('selection.focus({');
    expect(presenter).toContain('export function renderFullMarketKlineChart');
    expect(presenter).toContain('export function buildMainMarketKlineView');
    expect(presenter).not.toContain('getElementById');
    expect(presenter).not.toContain('querySelector');
    expect(presenter).not.toContain('.innerHTML');
    expect(presenter).not.toContain('addEventListener');
    expect(adapter).toContain('buildMarketChartDashboardView');
    expect(adapter).toContain('container.onclick = _handleDashboardClick');
  });
});
