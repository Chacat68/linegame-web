// js/ui/MarketGoodsPresenter.js — 市场商品列表 view model、HTML 与 command 协议
// 不绑定 DOM 事件、不修改焦点或游戏状态；MarketUI 负责解释 command。

import { findSystem } from '../data/systems.js';
import * as Economy from '../systems/economy/Economy.js';
import { renderMarketChart } from './MarketChartPresenter.js';
import { describeTradeOpportunity, getMarketHeatMeta } from './MarketSpotPresenter.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeHtmlAttr(value) {
  return _escapeHtml(value).replace(/`/g, '&#96;');
}

function _getDepthLabel(depth) {
  if (depth >= 350) return '大型';
  if (depth >= 200) return '中型';
  return '小型';
}

function _getDepthNote(depth) {
  if (depth >= 350) return '一次买卖较多货物，价格也不容易被推高或压低';
  if (depth >= 200) return '普通数量的买卖对价格影响适中';
  return '一次买卖太多，会明显改变当地价格';
}

function _getSupplyLabel(ratio) {
  if (ratio > 1.3) return '供货紧张';
  if (ratio < 0.7) return '供货充足';
  return '供货平稳';
}

function _getLegalityTag(good, supplyDemand) {
  if (good.legality === 'illegal') {
    return { label: '违禁', className: 'tag-illegal' };
  }
  if (good.legality === 'restricted') {
    return { label: '受监管', className: 'tag-restricted' };
  }
  if (supplyDemand.ratio > 1.3) {
    return { label: '高需求', className: 'tag-hot' };
  }
  if (supplyDemand.ratio < 0.7) {
    return { label: '充足', className: 'tag-cold' };
  }
  return null;
}

function _buildGoodCardModel(snapshot, request, ports) {
  var state = request.state;
  var good = snapshot.good;
  var cargo = state.cargo || {};
  var inCargo = Math.max(0, Number(cargo[good.id]) || 0);
  var multiplier = ports.economy.getSystemMultiplier(request.systemId, good.id);
  var supplyDemand = snapshot.supplyDemand || ports.economy.getSupplyDemand(request.systemId, good.id);
  var spread = Math.max(0, Number(snapshot.spread) || (snapshot.buyPrice - snapshot.sellPrice));
  var opportunity = ports.describeOpportunity(request.systemId, {
    good: good,
    buyPrice: snapshot.buyPrice,
    sellPrice: snapshot.sellPrice,
    spread: spread,
    supplyDemand: supplyDemand,
  }, inCargo, ports.economy);
  var heat = ports.getHeatMeta(multiplier);
  var delta = snapshot.delta || { text: '0.0%', className: 'market-chart-flat' };

  return {
    id: good.id,
    name: good.name,
    emoji: good.emoji,
    description: good.desc,
    legality: good.legality || 'legal',
    buyPrice: snapshot.buyPrice,
    sellPrice: snapshot.sellPrice,
    spread: spread,
    inCargo: inCargo,
    supplyDemand: supplyDemand,
    supplyLabel: _getSupplyLabel(supplyDemand.ratio),
    opportunity: opportunity,
    heat: heat,
    delta: delta,
    tag: _getLegalityTag(good, supplyDemand),
    isCheap: multiplier < 0.7,
    isExpensive: multiplier > 1.4,
    isActive: request.focusedGoodId === good.id,
    canBuy: request.isCurrentSystem,
    canSell: request.isCurrentSystem && inCargo > 0,
    chartHtml: ports.renderChart(snapshot.history, snapshot.sellPrice, good.name, {
      width: 72,
      height: 40,
      topPad: 4,
      chartBottom: 28,
      volumeBase: 36,
      className: 'market-good-card-chart',
    }),
  };
}

export function buildMarketGoodsModel(request) {
  var input = request || {};
  var state = input.state || {};
  var economy = input.economy || Economy;
  var findSystemPort = input.findSystem || findSystem;
  var systemId = input.systemId || state.currentSystem;
  var marketMode = input.marketMode === 'black' ? 'black' : 'open';
  var isBlack = marketMode === 'black';
  var isCurrentSystem = !!input.isCurrentSystem;
  var depth = Math.max(0, Number(economy.getMarketDepth(systemId)) || 0);
  var currentSystem = findSystemPort(state.currentSystem);
  var viewedSystem = findSystemPort(systemId);
  var systemFaction = input.systemFaction || null;
  var ports = {
    economy: economy,
    describeOpportunity: input.describeOpportunity || describeTradeOpportunity,
    getHeatMeta: input.getHeatMeta || getMarketHeatMeta,
    renderChart: input.renderChart || renderMarketChart,
  };
  var cards = (input.snapshots || []).map(function (snapshot) {
    return _buildGoodCardModel(snapshot, {
      state: state,
      systemId: systemId,
      focusedGoodId: input.focusedGoodId,
      isCurrentSystem: isCurrentSystem,
    }, ports);
  });

  return {
    systemId: systemId,
    marketMode: marketMode,
    isBlack: isBlack,
    isCurrentSystem: isCurrentSystem,
    depth: depth,
    depthLabel: _getDepthLabel(depth),
    depthNote: _getDepthNote(depth),
    blackMarketState: systemFaction && systemFaction.marketAccess && systemFaction.marketAccess.blackMarket
      ? (input.blackMarketUnlocked ? 'open' : 'locked')
      : 'unavailable',
    currentSystemName: currentSystem ? currentSystem.name : '当前停靠点',
    viewedSystemName: viewedSystem ? viewedSystem.name : '该地点',
    canFocusRemote: !isCurrentSystem && !!input.canFocusRemote,
    fuelNeeded: isCurrentSystem
      ? Math.max(0, Math.ceil((Number(state.maxFuel) || 0) - (Number(state.fuel) || 0)))
      : 0,
    cards: cards,
  };
}

function _renderDepth(model) {
  if (model.isBlack) {
    return '<div class="market-goods-depth-info black-banner" role="listitem">' +
      '🕶 黑市交易 —— 高风险高回报，违禁品不受监管' +
      '<span class="bm-warning">⚠ 携带违禁品前往联邦区域将触发执法检查</span>' +
    '</div>';
  }

  var accessNote = model.blackMarketState === 'open'
    ? ' · 🕶 黑市资格已解锁'
    : (model.blackMarketState === 'locked' ? ' · 🔒 黑市需与辛迪加达到友好关系' : '');
  return '<div class="market-goods-depth-info" role="listitem">' +
    '📊 可交易规模：<strong>' + model.depthLabel + '</strong> —— ' + model.depthNote + accessNote +
  '</div>';
}

function _renderRemoteNote(model) {
  if (model.isCurrentSystem) return '';
  return '<div class="market-goods-readonly-note" role="listitem">' +
    '<span class="readonly-icon">📡</span>' +
    '<span class="market-goods-readonly-copy"><strong>远程只读</strong> · 当前停靠「' + _escapeHtml(model.currentSystemName) + '」，前往「' + _escapeHtml(model.viewedSystemName) + '」后可交易、补给和本地经营。</span>' +
    (model.canFocusRemote
      ? '<button class="market-goods-readonly-action command-action-btn" type="button" data-market-command="focus-remote-system" data-system-id="' + _escapeHtmlAttr(model.systemId) + '">设为航点</button>'
      : '') +
  '</div>';
}

function _renderGoodCard(card, model) {
  var tag = card.tag
    ? '<span class="market-good-tag ' + card.tag.className + '">' + _escapeHtml(card.tag.label) + '</span>'
    : '';
  var iconColorClass = card.heat.className.replace('mkt-ov-', 'icon-');
  var cardClass = 'market-good-card' +
    (card.isActive ? ' is-active' : '') +
    (card.isCheap ? ' price-low-card' : '') +
    (card.isExpensive ? ' price-high-card' : '');

  return '<div class="' + cardClass + '" data-market-good="' + _escapeHtmlAttr(card.id) + '" data-good-id="' + _escapeHtmlAttr(card.id) + '" data-market-command="focus-good" data-legality="' + _escapeHtmlAttr(card.legality) + '" data-signal="' + _escapeHtmlAttr(card.opportunity.className) + '" role="listitem" tabindex="0" aria-label="' + _escapeHtmlAttr(card.name + '，买入 ' + card.buyPrice + '，卖出 ' + card.sellPrice + '，' + card.opportunity.label) + '">' +
    '<div class="market-good-card-icon ' + iconColorClass + '">' + _escapeHtml(card.emoji) + '</div>' +
    '<div class="market-good-card-info">' +
      '<div class="market-good-card-name">' + _escapeHtml(card.name) + tag + '</div>' +
      '<div class="market-good-card-desc">' + _escapeHtml(card.description) +
        (card.inCargo > 0 ? ' · <span class="market-good-card-held">×' + card.inCargo + '</span>' : '') +
      '</div>' +
      '<div class="market-good-card-meta-row">' +
        '<span class="market-good-card-signal ' + _escapeHtmlAttr(card.opportunity.className) + '">' + _escapeHtml(card.opportunity.label) + '</span>' +
        '<span class="market-good-card-stat">' + card.supplyLabel + '</span>' +
        '<span class="market-good-card-stat">买卖相差 ' + card.spread.toLocaleString() + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="market-good-card-chart-col">' +
      '<div class="market-good-card-chart-label">最近价格</div>' + card.chartHtml +
    '</div>' +
    '<div class="market-good-card-price-block">' +
      '<div class="market-good-card-price-row"><span class="market-good-card-price">' + card.buyPrice.toLocaleString() + '</span><span class="market-good-card-unit">CR</span></div>' +
      '<div class="market-good-card-secondary">卖出 ' + card.sellPrice.toLocaleString() + ' · ' + _escapeHtml(card.heat.label) + '</div>' +
      '<div class="market-good-card-delta ' + _escapeHtmlAttr(card.delta.className.replace('market-chart-', '')) + '">' + _escapeHtml(card.delta.text) + ' △</div>' +
    '</div>' +
    '<div class="market-good-card-actions">' +
      (card.canSell
        ? '<button class="market-card-btn sell-card-btn' + (model.isBlack ? ' bm-card-btn' : '') + '" type="button" data-id="' + _escapeHtmlAttr(card.id) + '" data-good-id="' + _escapeHtmlAttr(card.id) + '" data-market-command="sell-good">' + (model.isBlack ? '🕶 卖' : '出售') + '</button>'
        : '') +
      (card.canBuy
        ? '<button class="market-card-btn buy-card-btn' + (model.isBlack ? ' bm-card-btn' : '') + '" type="button" data-id="' + _escapeHtmlAttr(card.id) + '" data-good-id="' + _escapeHtmlAttr(card.id) + '" data-market-command="buy-good">' + (model.isBlack ? '🕶 买' : '买入') + '</button>'
        : '') +
    '</div>' +
  '</div>';
}

export function renderMarketGoodsWorkspace(request) {
  var model = buildMarketGoodsModel(request);
  var html = _renderDepth(model) + _renderRemoteNote(model) + model.cards.map(function (card) {
    return _renderGoodCard(card, model);
  }).join('');

  if (model.fuelNeeded > 0) {
    html += '<div class="market-goods-refuel" role="listitem">' +
      '<button id="refuel-btn" class="btn-refuel" type="button" data-market-command="refuel">⚡ 补充燃料（' + model.fuelNeeded + ' 单位）</button>' +
    '</div>';
  }

  return { model: model, html: html };
}

export function resolveMarketGoodsCommand(target, root) {
  var node = target || null;
  var command = null;
  while (node) {
    if (!command && node.dataset && node.dataset.marketCommand) {
      command = {
        type: node.dataset.marketCommand,
        goodId: node.dataset.goodId || node.dataset.id || '',
        systemId: node.dataset.systemId || '',
      };
    }
    if (node === root) return command;
    node = node.parentElement || node.parentNode || null;
  }
  return null;
}
