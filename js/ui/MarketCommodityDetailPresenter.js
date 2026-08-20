// js/ui/MarketCommodityDetailPresenter.js — 市场商品 Context / L4 纯视图投影

import { buildWorkspaceOpenDetailSlot } from './WorkspaceActionSlot.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _number(value) {
  var result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function _formatNumber(value) {
  return Math.round(_number(value)).toLocaleString();
}

function _legalityLabel(legality) {
  if (legality === 'illegal') return '违禁品';
  if (legality === 'restricted') return '受监管';
  return '合法商品';
}

function _marketLabel(mode) {
  return mode === 'black' ? '黑市' : '公开市场';
}

function _normalizeModel(input) {
  var model = input || {};
  if (!model.good || !model.system) return null;
  var ratio = _number(model.supplyDemand && model.supplyDemand.ratio);
  return {
    good: model.good,
    system: model.system,
    marketMode: model.marketMode === 'black' ? 'black' : 'open',
    buyPrice: Math.max(0, _number(model.buyPrice)),
    sellPrice: Math.max(0, _number(model.sellPrice)),
    held: Math.max(0, _number(model.held)),
    credits: Math.max(0, _number(model.credits)),
    supplyRatio: ratio > 0 ? ratio : 1,
  };
}

function _hero(model) {
  return '<div class="workspace-context-hero"><span aria-hidden="true">' +
    _escapeHtml(model.good.emoji) + '</span><div><small>' +
    _escapeHtml(model.system.name) + ' · ' + _marketLabel(model.marketMode) +
    '</small><h3>' + _escapeHtml(model.good.name) + '</h3></div></div>';
}

function _metrics(model) {
  return '<div class="workspace-context-metrics" role="list">' +
    '<span role="listitem"><small>买入</small><strong>' + _formatNumber(model.buyPrice) + '</strong></span>' +
    '<span role="listitem"><small>卖出</small><strong>' + _formatNumber(model.sellPrice) + '</strong></span>' +
    '<span role="listitem"><small>货舱</small><strong>' + _formatNumber(model.held) + '</strong></span>' +
    '<span role="listitem"><small>供需</small><strong>' + model.supplyRatio.toFixed(2) + '×</strong></span>' +
  '</div>';
}

export function buildMarketCommodityContextView(input) {
  var model = _normalizeModel(input);
  if (!model) return null;
  return {
    title: '商品检查',
    html: '<article class="workspace-context-card workspace-context-card--commodity">' +
      _hero(model) +
      '<p>' + _escapeHtml(model.good.desc) + '</p>' +
      _metrics(model) +
      '<div class="workspace-context-tags"><span>' + _legalityLabel(model.good.legality) +
        '</span><span>即时价差 ' + _formatNumber(Math.max(0, model.buyPrice - model.sellPrice)) + '</span></div>' +
      buildWorkspaceOpenDetailSlot({
        workspaceId: 'trade',
        contextType: 'commodity',
        contextId: model.good.id,
        label: '查看完整商品详情',
        attributes: { 'data-good-id': model.good.id },
      }) +
    '</article>',
  };
}

export function buildMarketCommodityDetailView(input) {
  var model = _normalizeModel(input);
  if (!model) return null;
  var basePrice = Math.max(0, _number(model.good.basePrice));
  var buyDelta = basePrice > 0 ? Math.round(((model.buyPrice / basePrice) - 1) * 100) : 0;
  var affordable = model.buyPrice > 0 ? Math.floor(model.credits / model.buyPrice) : 0;
  var upstream = Array.isArray(model.good.upstream) ? model.good.upstream.length : 0;
  var access = Array.isArray(model.good.marketAccess)
    ? model.good.marketAccess.map(_marketLabel).join(' / ')
    : _marketLabel(model.marketMode);

  return {
    title: model.good.name + ' · 商品详情',
    html: '<section class="workspace-detail-section workspace-detail-section--commodity" data-market-commodity-detail="' +
      _escapeHtml(model.good.id) + '">' +
      '<div class="workspace-detail-intro">' + _hero(model) +
        '<p>' + _escapeHtml(model.good.desc) + '</p></div>' +
      _metrics(model) +
      '<div class="workspace-detail-entity-grid workspace-detail-commodity-grid" role="list" aria-label="商品交易判断">' +
        '<article role="listitem"><small>基础价格</small><strong>' + _formatNumber(basePrice) + '</strong><span>当前买价 ' +
          (buyDelta >= 0 ? '+' : '') + buyDelta + '%</span></article>' +
        '<article role="listitem"><small>现金承载</small><strong>' + _formatNumber(affordable) + ' 单位</strong><span>按现有 ' +
          _formatNumber(model.credits) + ' 积分估算</span></article>' +
        '<article role="listitem"><small>市场准入</small><strong>' + _escapeHtml(access) + '</strong><span>' +
          _legalityLabel(model.good.legality) + '</span></article>' +
        '<article role="listitem"><small>生产关联</small><strong>' + upstream + ' 项</strong><span>' +
          (upstream > 0 ? '受上游商品成本影响' : '无登记上游依赖') + '</span></article>' +
      '</div>' +
      '<p class="workspace-detail-note">该详情只说明当前地点与当前市场模式的事实；买卖仍在商业工作区内确认。</p>' +
    '</section>',
  };
}
