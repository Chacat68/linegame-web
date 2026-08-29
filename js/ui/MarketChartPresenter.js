// js/ui/MarketChartPresenter.js — 市场价格图表与行情快照 presenter
//
// 该模块只负责价格序列归一化、K 线/SVG 生成、行情快照构造与主图 DOM 更新。
// MarketChartController 持有焦点/区间交互；presenter 不修改会话或游戏状态。

import * as Economy from '../systems/economy/Economy.js';

export const MARKET_CHART_RANGE_OPTIONS = Object.freeze([7, 14, 30]);

function _escapeHtmlAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _resolveDocument(documentRef) {
  if (documentRef) return documentRef;
  return typeof document !== 'undefined' ? document : null;
}

export function normalizeMarketChartHistory(data, fallbackPrice, range) {
  var limit = Math.max(2, Math.floor(range || 12));
  var series = Array.isArray(data) ? data.slice(-limit) : [];
  var safeFallback = Math.max(1, Math.round(fallbackPrice || 1));
  if (series.length === 0) series = [safeFallback, safeFallback];
  if (series.length === 1) series.unshift(series[0]);
  while (series.length < Math.min(8, limit)) series.unshift(series[0]);
  return series.map(function (value) {
    return Math.max(1, Math.round(value || safeFallback));
  });
}

export function buildMarketPseudoCandles(history) {
  return history.map(function (close, index) {
    var open = index === 0 ? history[0] : history[index - 1];
    var spread = Math.max(1, Math.round(Math.abs(close - open) * 0.35) + 1);
    return {
      open: open,
      close: close,
      high: Math.max(open, close) + spread,
      low: Math.max(1, Math.min(open, close) - spread),
      volume: Math.max(1, Math.abs(close - open) + spread),
    };
  });
}

export function calculateMarketMovingAverage(values, period) {
  return values.map(function (_, index) {
    var start = Math.max(0, index - period + 1);
    var slice = values.slice(start, index + 1);
    var sum = slice.reduce(function (acc, value) { return acc + value; }, 0);
    return sum / slice.length;
  });
}

export function formatMarketChartDelta(history) {
  if (!history || history.length < 2) return { text: '0.0%', className: 'market-chart-flat' };
  var start = history[0] || 1;
  var end = history[history.length - 1] || start;
  var delta = ((end - start) / Math.max(1, start)) * 100;
  var sign = delta > 0 ? '+' : '';
  var className = delta > 0.5 ? 'market-chart-up' : (delta < -0.5 ? 'market-chart-down' : 'market-chart-flat');
  return {
    text: sign + delta.toFixed(1) + '%',
    className: className,
  };
}

export function renderMarketChart(history, currentPrice, goodLabel, options) {
  var normalized = normalizeMarketChartHistory(history, currentPrice);
  var candles = buildMarketPseudoCandles(normalized);
  var movingAvg = calculateMarketMovingAverage(normalized, 4);
  var minPrice = Math.min.apply(null, candles.map(function (item) { return item.low; }).concat(movingAvg));
  var maxPrice = Math.max.apply(null, candles.map(function (item) { return item.high; }).concat(movingAvg));
  var priceRange = Math.max(1, maxPrice - minPrice);
  var maxVolume = Math.max.apply(null, candles.map(function (item) { return item.volume; }));
  var opts = options || {};
  var width = opts.width || 132;
  var height = opts.height || 58;
  var topPad = opts.topPad || 5;
  var chartBottom = opts.chartBottom || 40;
  var volumeBase = opts.volumeBase || 53;
  var outerClass = opts.className || 'market-mini-chart';
  var slot = (width - 10) / candles.length;
  var bodyWidth = Math.max(4, Math.min(8, slot - 3));

  function scaleY(value) {
    return topPad + ((maxPrice - value) / priceRange) * (chartBottom - topPad);
  }

  function scaleVolume(value) {
    return Math.max(2, (value / Math.max(1, maxVolume)) * 8);
  }

  var volumeBars = candles.map(function (item, index) {
    var x = 5 + index * slot + Math.max(1, (slot - bodyWidth) / 2);
    var barHeight = scaleVolume(item.volume);
    return '<rect x="' + x.toFixed(1) + '" y="' + (volumeBase - barHeight).toFixed(1) + '" width="' + bodyWidth.toFixed(1) + '" height="' + barHeight.toFixed(1) + '" class="market-chart-volume" />';
  }).join('');

  var candleShapes = candles.map(function (item, index) {
    var centerX = 5 + index * slot + (slot / 2);
    var wickTop = scaleY(item.high);
    var wickBottom = scaleY(item.low);
    var openY = scaleY(item.open);
    var closeY = scaleY(item.close);
    var bodyY = Math.min(openY, closeY);
    var bodyHeight = Math.max(2, Math.abs(closeY - openY));
    var bodyX = centerX - (bodyWidth / 2);
    var cls = item.close >= item.open ? 'market-chart-candle up' : 'market-chart-candle down';
    return '<line x1="' + centerX.toFixed(1) + '" y1="' + wickTop.toFixed(1) + '" x2="' + centerX.toFixed(1) + '" y2="' + wickBottom.toFixed(1) + '" class="market-chart-wick ' + (item.close >= item.open ? 'up' : 'down') + '" />' +
      '<rect x="' + bodyX.toFixed(1) + '" y="' + bodyY.toFixed(1) + '" width="' + bodyWidth.toFixed(1) + '" height="' + bodyHeight.toFixed(1) + '" rx="1" class="' + cls + '" />';
  }).join('');

  var maPath = movingAvg.map(function (value, index) {
    var x = 5 + index * slot + (slot / 2);
    var y = scaleY(value);
    return (index === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  var chartRight = Math.max(4, width - 4);

  return '<svg class="' + outerClass + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + _escapeHtmlAttr(goodLabel) + ' 价格走势">' +
    '<rect x="0.5" y="0.5" width="' + (width - 1) + '" height="' + (height - 1) + '" rx="8" class="market-chart-frame" />' +
    '<line x1="4" y1="' + (chartBottom + 0.5) + '" x2="' + chartRight + '" y2="' + (chartBottom + 0.5) + '" class="market-chart-axis" />' +
    '<line x1="4" y1="' + (volumeBase + 0.5) + '" x2="' + chartRight + '" y2="' + (volumeBase + 0.5) + '" class="market-chart-axis market-chart-axis-volume" />' +
    '<path d="' + maPath + '" class="market-chart-ma" />' +
    volumeBars + candleShapes +
  '</svg>';
}

export function renderFullMarketKlineChart(history, currentPrice, goodLabel, range) {
  var normalized = normalizeMarketChartHistory(history, currentPrice, range);
  var candles = buildMarketPseudoCandles(normalized);
  var ma5 = calculateMarketMovingAverage(normalized, 5);
  var ma10 = calculateMarketMovingAverage(normalized, Math.min(10, normalized.length));
  var width = 560;
  var height = 260;
  var marginLeft = 52;
  var marginRight = 10;
  var marginTop = 8;
  var marginBottom = 32;
  var chartLeft = marginLeft;
  var chartRight = width - marginRight;
  var chartTop = marginTop;
  var chartBottom = height - marginBottom - 40;
  var volumeTop = chartBottom + 6;
  var volumeBottom = height - marginBottom;
  var allPrices = candles.reduce(function (arr, candle) {
    return arr.concat([candle.high, candle.low]);
  }, []).concat(ma5).concat(ma10);
  var minPrice = Math.min.apply(null, allPrices);
  var maxPrice = Math.max.apply(null, allPrices);
  var priceRange = Math.max(1, maxPrice - minPrice);
  var maxVolume = Math.max.apply(null, candles.map(function (candle) { return candle.volume; }));
  var chartWidth = chartRight - chartLeft;
  var slot = chartWidth / candles.length;
  var bodyWidth = Math.max(4, Math.min(12, slot - 4));

  function yPrice(value) {
    return chartTop + ((maxPrice - value) / priceRange) * (chartBottom - chartTop);
  }

  function yVolume(value) {
    var barHeight = Math.max(2, (value / Math.max(1, maxVolume)) * (volumeBottom - volumeTop - 2));
    return volumeBottom - barHeight;
  }

  var gridLines = '';
  var priceLabels = '';
  for (var gridIndex = 0; gridIndex <= 4; gridIndex++) {
    var gridValue = minPrice + (priceRange * gridIndex / 4);
    var gridY = yPrice(gridValue);
    gridLines += '<line x1="' + chartLeft + '" y1="' + gridY.toFixed(1) + '" x2="' + chartRight + '" y2="' + gridY.toFixed(1) + '" class="kline-grid" />';
    priceLabels += '<text x="' + (chartLeft - 6) + '" y="' + (gridY + 3).toFixed(1) + '" class="kline-price-label">' + Math.round(gridValue) + '</text>';
  }
  gridLines += '<line x1="' + chartLeft + '" y1="' + volumeTop + '" x2="' + chartRight + '" y2="' + volumeTop + '" class="kline-grid kline-grid-vol" />';

  var volumeBars = candles.map(function (candle, index) {
    var centerX = chartLeft + index * slot + slot / 2;
    var bodyX = centerX - bodyWidth / 2;
    var volumeY = yVolume(candle.volume);
    var cls = candle.close >= candle.open ? 'up' : 'down';
    return '<rect x="' + bodyX.toFixed(1) + '" y="' + volumeY.toFixed(1) + '" width="' + bodyWidth.toFixed(1) + '" height="' + (volumeBottom - volumeY).toFixed(1) + '" class="kline-vol ' + cls + '" />';
  }).join('');

  var candleShapes = candles.map(function (candle, index) {
    var centerX = chartLeft + index * slot + slot / 2;
    var bodyX = centerX - bodyWidth / 2;
    var openY = yPrice(candle.open);
    var closeY = yPrice(candle.close);
    var highY = yPrice(candle.high);
    var lowY = yPrice(candle.low);
    var bodyTop = Math.min(openY, closeY);
    var bodyHeight = Math.max(2, Math.abs(closeY - openY));
    var cls = candle.close >= candle.open ? 'up' : 'down';
    return '<line x1="' + centerX.toFixed(1) + '" y1="' + highY.toFixed(1) + '" x2="' + centerX.toFixed(1) + '" y2="' + lowY.toFixed(1) + '" class="kline-wick ' + cls + '" />' +
      '<rect x="' + bodyX.toFixed(1) + '" y="' + bodyTop.toFixed(1) + '" width="' + bodyWidth.toFixed(1) + '" height="' + bodyHeight.toFixed(1) + '" rx="1" class="kline-candle ' + cls + '" />';
  }).join('');

  function renderAveragePath(values, className) {
    var path = values.map(function (value, index) {
      var x = chartLeft + index * slot + slot / 2;
      var y = yPrice(value);
      return (index === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<path d="' + path + '" class="kline-ma ' + className + '" />';
  }

  var lastClose = candles[candles.length - 1].close;
  var lastY = yPrice(lastClose);
  var priceTagX = chartRight - 48;
  var priceLine = '<line x1="' + chartLeft + '" y1="' + lastY.toFixed(1) + '" x2="' + chartRight + '" y2="' + lastY.toFixed(1) + '" class="kline-current-line" />' +
    '<rect x="' + priceTagX + '" y="' + (lastY - 9).toFixed(1) + '" width="48" height="18" rx="3" class="kline-current-tag-bg" />' +
    '<text x="' + (priceTagX + 24) + '" y="' + (lastY + 4).toFixed(1) + '" class="kline-current-tag">' + lastClose + '</text>';

  var xLabels = '';
  var labelInterval = Math.max(1, Math.floor(candles.length / 6));
  for (var index = 0; index < candles.length; index += labelInterval) {
    var labelX = chartLeft + index * slot + slot / 2;
    xLabels += '<text x="' + labelX.toFixed(1) + '" y="' + (height - 6) + '" class="kline-date-label">D' + (index + 1) + '</text>';
  }

  return '<svg class="market-kline-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + _escapeHtmlAttr(goodLabel) + ' 价格走势图">' +
    '<rect x="' + chartLeft + '" y="' + chartTop + '" width="' + chartWidth + '" height="' + (volumeBottom - chartTop) + '" rx="0" class="kline-border" />' +
    gridLines + priceLabels + volumeBars + candleShapes +
    renderAveragePath(ma5, 'kline-ma5') + renderAveragePath(ma10, 'kline-ma10') +
    priceLine + xLabels +
    '<text x="' + (chartLeft + 4) + '" y="' + (chartTop + 12) + '" class="kline-ma-legend kline-ma5">5日均价</text>' +
    '<text x="' + (chartLeft + 62) + '" y="' + (chartTop + 12) + '" class="kline-ma-legend kline-ma10">10日均价</text>' +
  '</svg>';
}

export function buildMarketSnapshots(state, systemId, goodsList, isBlack, range, economy) {
  var economyPort = economy || Economy;
  return (goodsList || []).map(function (good) {
    var buyPrice = isBlack
      ? economyPort.getBlackMarketBuyPrice(systemId, good.id, state)
      : economyPort.getBuyPrice(systemId, good.id, state);
    var sellPrice = isBlack
      ? economyPort.getBlackMarketSellPrice(systemId, good.id, state)
      : economyPort.getSellPrice(systemId, good.id, state);
    var history = normalizeMarketChartHistory(economyPort.getPriceHistory(systemId, good.id), sellPrice, range);
    var delta = formatMarketChartDelta(history);
    var swing = history.reduce(function (acc, value, index) {
      return index === 0 ? 0 : acc + Math.abs(value - history[index - 1]);
    }, 0);
    return {
      good: good,
      buyPrice: buyPrice,
      sellPrice: sellPrice,
      history: history,
      delta: delta,
      swing: swing,
      spread: Math.max(0, buyPrice - sellPrice),
      supplyDemand: economyPort.getSupplyDemand(systemId, good.id),
    };
  });
}

export function renderMarketChartDashboard(request) {
  var options = request || {};
  var documentRef = _resolveDocument(options.document);
  if (!documentRef || typeof documentRef.getElementById !== 'function') return false;
  var container = documentRef.getElementById('market-terminal-dashboard');
  if (!container) return false;
  var snapshots = Array.isArray(options.snapshots) ? options.snapshots : [];
  if (snapshots.length === 0) {
    container.innerHTML = '';
    return false;
  }

  var selectedRange = MARKET_CHART_RANGE_OPTIONS.indexOf(options.range) !== -1 ? options.range : 14;
  var focused = snapshots.find(function (entry) {
    return entry.good.id === options.focusedGoodId;
  }) || snapshots[0];
  var gainers = snapshots.slice().sort(function (a, b) {
    return parseFloat(b.delta.text) - parseFloat(a.delta.text);
  }).slice(0, 3);
  var losers = snapshots.slice().sort(function (a, b) {
    return parseFloat(a.delta.text) - parseFloat(b.delta.text);
  }).slice(0, 3);
  var hotList = snapshots.slice().sort(function (a, b) {
    return b.swing - a.swing;
  }).slice(0, 3);
  var pressureLabel = focused.supplyDemand.ratio > 1.3
    ? '追涨区'
    : (focused.supplyDemand.ratio < 0.8 ? '承压区' : '盘整区');

  function renderList(title, items, className) {
    return '<div class="market-terminal-side-card">' +
      '<div class="market-terminal-side-title">' + title + '</div>' +
      items.map(function (entry) {
        return '<button class="market-terminal-rank-row" data-focus-good="' + _escapeHtmlAttr(entry.good.id) + '">' +
          '<span class="market-terminal-rank-name">' + entry.good.emoji + ' ' + entry.good.name + '</span>' +
          '<span class="market-terminal-rank-value ' + className + '">' + entry.delta.text + '</span>' +
        '</button>';
      }).join('') +
    '</div>';
  }

  container.innerHTML = '<section class="market-terminal-hero">' +
    '<div class="market-terminal-main">' +
      '<div class="market-terminal-head">' +
        '<div>' +
          '<div class="market-terminal-title">' + focused.good.emoji + ' ' + focused.good.name + '</div>' +
          '<div class="market-terminal-subtitle">' + (options.marketMode === 'black' ? '黑市报价' : '公开市场报价') + ' · ' + pressureLabel + ' · 点选下方商品可切换图表</div>' +
        '</div>' +
        '<div class="market-terminal-price-wrap">' +
          '<div class="market-terminal-price">' + focused.sellPrice.toLocaleString() + '</div>' +
          '<div class="market-terminal-price-delta ' + focused.delta.className + '">' + focused.delta.text + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="market-terminal-toolbar">' +
        '<div class="market-terminal-range-group">' + MARKET_CHART_RANGE_OPTIONS.map(function (days) {
          return '<button class="market-terminal-range-btn' + (days === selectedRange ? ' active' : '') + '" data-range="' + days + '">' + days + '天</button>';
        }).join('') + '</div>' +
        '<div class="market-terminal-toolbar-note">统计窗口：近 ' + selectedRange + ' 天</div>' +
      '</div>' +
      '<div class="market-terminal-chart-wrap">' +
        renderMarketChart(focused.history, focused.sellPrice, focused.good.name, {
          width: 340,
          height: 164,
          topPad: 12,
          chartBottom: 122,
          volumeBase: 154,
          className: 'market-hero-chart',
        }) +
      '</div>' +
      '<div class="market-terminal-metrics">' +
        '<div class="market-terminal-metric"><span>买卖价差</span><strong>' + focused.spread.toLocaleString() + '</strong></div>' +
        '<div class="market-terminal-metric"><span>需求/供给</span><strong>' + focused.supplyDemand.ratio.toFixed(2) + 'x</strong></div>' +
        '<div class="market-terminal-metric"><span>波动热度</span><strong>' + focused.swing.toLocaleString() + '</strong></div>' +
      '</div>' +
    '</div>' +
    '<div class="market-terminal-side">' +
      renderList('📈 涨幅榜', gainers, 'market-chart-up') +
      renderList('📉 跌幅榜', losers, 'market-chart-down') +
      renderList('⚡ 热门波动', hotList, 'market-chart-flat') +
    '</div>' +
  '</section>';

  if (typeof container.querySelectorAll === 'function') {
    container.querySelectorAll('[data-focus-good]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (typeof options.onFocusChange === 'function') options.onFocusChange(button.dataset.focusGood);
        var activeRow = documentRef.querySelector
          ? documentRef.querySelector('[data-market-good="' + button.dataset.focusGood + '"]')
          : null;
        if (activeRow && typeof activeRow.scrollIntoView === 'function') {
          activeRow.scrollIntoView({ block: 'nearest' });
        }
      });
    });
    container.querySelectorAll('[data-range]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (typeof options.onRangeChange === 'function') {
          options.onRangeChange(Math.max(7, Math.min(30, Math.floor(Number(button.dataset.range) || 14))));
        }
      });
    });
  }

  return true;
}

export function updateMainMarketKlineChart(request) {
  var options = request || {};
  var documentRef = _resolveDocument(options.document);
  if (!documentRef || typeof documentRef.getElementById !== 'function') return false;
  var panel = documentRef.getElementById('market-kline-panel');
  if (!panel) return false;
  var snapshots = Array.isArray(options.snapshots) ? options.snapshots : [];
  var focused = snapshots.find(function (snapshot) {
    return snapshot.good.id === options.focusedGoodId;
  }) || snapshots[0];
  if (!focused) return false;

  var range = MARKET_CHART_RANGE_OPTIONS.indexOf(options.range) !== -1 ? options.range : 14;
  var economyPort = options.economy || Economy;
  var history = normalizeMarketChartHistory(
    economyPort.getPriceHistory(options.systemId, focused.good.id),
    focused.sellPrice,
    range
  );
  var candles = buildMarketPseudoCandles(history);
  var latest = candles[candles.length - 1];
  var delta = formatMarketChartDelta(history);
  var isBlack = options.marketMode === 'black';

  var title = documentRef.getElementById('market-kline-title');
  if (title) {
    title.innerHTML = '<span class="kline-title-emoji">' + focused.good.emoji + '</span>' +
      '<span class="kline-title-name">' + focused.good.name + '</span>' +
      '<span class="kline-title-price">' + focused.sellPrice.toLocaleString() + ' CR</span>' +
      '<span class="kline-title-delta ' + delta.className + '">' + delta.text + '</span>';
  }

  var rangeBar = documentRef.getElementById('market-kline-range-bar');
  if (rangeBar) {
    rangeBar.innerHTML = MARKET_CHART_RANGE_OPTIONS.map(function (days) {
      return '<button class="kline-range-btn' + (days === range ? ' active' : '') + '" data-kline-range="' + days + '">' + days + 'D</button>';
    }).join('');
    if (typeof rangeBar.querySelectorAll === 'function') {
      rangeBar.querySelectorAll('[data-kline-range]').forEach(function (button) {
        button.addEventListener('click', function () {
          if (typeof options.onRangeChange === 'function') {
            options.onRangeChange(Number(button.dataset.klineRange));
          }
        });
      });
    }
  }

  var ohlc = documentRef.getElementById('market-kline-ohlc');
  if (ohlc) {
    ohlc.innerHTML =
      '<span class="kline-ohlc-item">开 <em>' + latest.open + '</em></span>' +
      '<span class="kline-ohlc-item">高 <em>' + latest.high + '</em></span>' +
      '<span class="kline-ohlc-item">低 <em>' + latest.low + '</em></span>' +
      '<span class="kline-ohlc-item">收 <em>' + latest.close + '</em></span>' +
      '<span class="kline-ohlc-item">交易量 <em>' + latest.volume + '</em></span>' +
      '<span class="kline-ohlc-item">买卖差 <em>' + focused.spread + '</em></span>';
  }

  var body = documentRef.getElementById('market-kline-body');
  if (body) body.innerHTML = renderFullMarketKlineChart(history, focused.sellPrice, focused.good.name, range);

  var metrics = documentRef.getElementById('market-kline-metrics');
  if (metrics) {
    var supplyDemand = focused.supplyDemand;
    var supplyLabel = supplyDemand.ratio > 1.3 ? '货少需求高' : (supplyDemand.ratio < 0.8 ? '货多需求低' : '供需平稳');
    metrics.innerHTML =
      '<span class="kline-metric">供需 <em>' + supplyLabel + '</em></span>' +
      '<span class="kline-metric">近期变化 <em>' + focused.swing + '</em></span>' +
      '<span class="kline-metric">' + (isBlack ? '黑市加价' : '交易渠道') + ' <em>' + (isBlack ? '约 35%' : '公开市场') + '</em></span>';
  }

  return true;
}
