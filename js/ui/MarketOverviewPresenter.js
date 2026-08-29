// js/ui/MarketOverviewPresenter.js — 各地价格总览的纯模型与 HTML 投影
// 不访问 DOM、不持有会话；价格口径由调用方显式传入。

import { GOODS } from '../data/goods.js';
import { getSystemsByGalaxy, isSystemAccessible } from '../data/systems.js';
import * as Economy from '../systems/economy/Economy.js';
import { formatMarketHeatDelta, getMarketHeatMeta } from './MarketSpotPresenter.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getOpenMarketGoods() {
  return GOODS.filter(function (good) {
    return good.marketAccess && good.marketAccess.indexOf('open') !== -1;
  });
}

function _getSystemPriority(system, state, visited) {
  return (system.id === state.currentSystem ? -2 : 0) + (visited.indexOf(system.id) !== -1 ? -1 : 0);
}

export function buildMarketOverviewView(request) {
  var input = request || {};
  var state = input.state || {};
  var galaxyId = input.galaxyId || state.currentGalaxy;
  var priceMode = input.priceMode === 'sell' ? 'sell' : 'buy';
  var isSell = priceMode === 'sell';
  var goods = _getOpenMarketGoods();
  var researchedTechs = Array.isArray(state.researchedTechs) ? state.researchedTechs : [];
  var visited = Array.isArray(state.visitedSystems) ? state.visitedSystems : [];
  var hasRemotePriceIntel = researchedTechs.indexOf('trade_network') !== -1;
  var playerLevel = state.playerLevel || 1;
  var systems = getSystemsByGalaxy(galaxyId).filter(function (system) {
    return isSystemAccessible(system.id, playerLevel, researchedTechs);
  });

  systems.sort(function (a, b) {
    var priorityDelta = _getSystemPriority(a, state, visited) - _getSystemPriority(b, state, visited);
    if (priorityDelta !== 0) return priorityDelta;
    return (a.minLevel || 1) - (b.minLevel || 1);
  });

  var rows = systems.map(function (system) {
    var isCurrent = system.id === state.currentSystem;
    var isVisited = visited.indexOf(system.id) !== -1;
    var canViewPrices = isCurrent || isVisited || hasRemotePriceIntel;
    var cells = goods.map(function (good) {
      if (!canViewPrices) {
        return {
          goodId: good.id,
          goodName: good.name,
          unknown: true,
        };
      }

      var price = isSell
        ? Economy.getSellPrice(system.id, good.id, state)
        : Economy.getBuyPrice(system.id, good.id, state);
      var multiplier = Economy.getSystemMultiplier(system.id, good.id);
      var heatMeta = getMarketHeatMeta(multiplier);
      var heatDelta = formatMarketHeatDelta(multiplier);
      return {
        goodId: good.id,
        goodName: good.name,
        unknown: false,
        price: price,
        heatClass: heatMeta.className,
        heatLabel: heatMeta.label,
        heatNote: heatMeta.note,
        rangeClass: multiplier < 0.7 ? 'price-low' : (multiplier > 1.4 ? 'price-high' : ''),
        deltaClass: heatDelta.className,
        deltaText: heatDelta.text,
      };
    });

    return {
      systemId: system.id,
      systemName: system.name,
      typeLabel: system.typeLabel,
      color: system.color,
      isCurrent: isCurrent,
      isVisited: isVisited,
      canViewPrices: canViewPrices,
      className: 'mkt-ov-row' +
        (isCurrent ? ' mkt-ov-current' : '') +
        (isVisited ? ' mkt-ov-visited' : ' mkt-ov-unvisited'),
      cells: cells,
    };
  });

  return {
    galaxyId: galaxyId,
    priceMode: priceMode,
    ariaLabel: isSell ? '各地商品卖出价格表' : '各地商品买入价格表',
    statusText: '表格显示各地的' + (isSell ? '卖出价。' : '买入价。'),
    headers: goods.map(function (good) {
      return { id: good.id, name: good.name, emoji: good.emoji };
    }),
    rows: rows,
  };
}

export function renderMarketOverviewHead(view) {
  var headers = view && Array.isArray(view.headers) ? view.headers : [];
  return '<th class="mkt-ov-planet-th" scope="col">星球</th>' + headers.map(function (good) {
    return '<th class="mkt-ov-good-th" scope="col" title="' + _escapeHtml(good.name) + '">' + _escapeHtml(good.emoji) + '</th>';
  }).join('');
}

export function renderMarketOverviewRow(row) {
  if (!row) return '';
  var planetCell = '<td class="mkt-ov-planet">' +
    '<button class="mkt-ov-planet-action" type="button" aria-label="' +
      (row.canViewPrices ? '查看' : '尚未掌握') + _escapeHtml(row.systemName) + '市场详情"' +
      (row.canViewPrices ? '' : ' disabled aria-disabled="true"') + '>' +
      '<span class="mkt-ov-dot" style="background:' + _escapeHtml(row.color) + '"></span>' +
      (row.isCurrent ? '📍 ' : '') +
      '<span class="mkt-ov-name">' + _escapeHtml(row.systemName) + '</span>' +
      '<span class="mkt-ov-type">' + _escapeHtml(row.typeLabel) + '</span>' +
    '</button>' +
    '</td>';

  var priceCells = (Array.isArray(row.cells) ? row.cells : []).map(function (cell) {
    if (cell.unknown) {
      return '<td class="mkt-ov-price-cell price-unknown" title="访问该地点或研究贸易情报网络后解锁精确报价">' +
        '<span class="mkt-ov-price-chip"><span class="mkt-ov-price-value">—</span></span>' +
      '</td>';
    }
    return '<td class="mkt-ov-price-cell ' + _escapeHtml(cell.heatClass) + ' ' + _escapeHtml(cell.rangeClass) + '" title="' +
      _escapeHtml(cell.goodName) + ' · ' + _escapeHtml(cell.heatLabel) + ' · ' + _escapeHtml(cell.heatNote) + '">' +
      '<span class="mkt-ov-price-chip">' +
        '<span class="mkt-ov-price-value">' + _escapeHtml(cell.price) + '</span>' +
        '<span class="mkt-ov-price-delta ' + _escapeHtml(cell.deltaClass) + '">' + _escapeHtml(cell.deltaText) + '</span>' +
      '</span>' +
    '</td>';
  }).join('');

  return planetCell + priceCells;
}
