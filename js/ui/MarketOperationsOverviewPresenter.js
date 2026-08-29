// js/ui/MarketOperationsOverviewPresenter.js — 商网指挥台与网络概览投影

import { findSystem } from '../data/systems.js';
import { renderMarketBatchPlanningPanel } from './MarketBatchPlanPresenter.js';
import {
  escapeMarketOperationsHtml,
  escapeMarketOperationsHtmlAttr,
} from './MarketOperationsPresentationSupport.js';

function renderWorkspaceDeckMetric(label, value, note, toneClass) {
  return '<article class="market-workspace-deck-card' + (toneClass ? ' ' + toneClass : '') + '"><span class="market-workspace-deck-card-label">' + label + '</span><strong class="market-workspace-deck-card-value">' + value + '</strong><span class="market-workspace-deck-card-note">' + note + '</span></article>';
}

function renderWorkspaceDeckPill(label, value, toneClass) {
  return '<span class="market-workspace-deck-pill' + (toneClass ? ' ' + toneClass : '') + '">' + label + '<strong>' + value + '</strong></span>';
}

export function renderMarketOperationsCommandDeck(request) {
  var input = request || {};
  var system = findSystem(input.viewingSystem);
  var systemLabel = system ? (system.name + ' · ' + system.typeLabel) : input.viewingSystem;
  var localStatusLabel = input.localStation ? '本地站点在线' : (input.buildCandidate ? '可建站地点' : '等待解锁');
  var localStatusNote = input.localStation
    ? '当前地点已有贸易站，可直接升级、投资或调整经营方式。'
    : (input.buildCandidate ? '当前地点已满足建站条件，可以决定是否投入长期资金。' : '当前地点还不能建站，建议先访问和探索更多地点。');

  return '<section class="market-workspace-deck market-operations-deck">' +
    '<div class="market-workspace-deck-hero"><div class="market-workspace-deck-copy"><div class="market-workspace-deck-kicker">Network Command</div><div class="market-workspace-deck-title">商网指挥台 · ' + localStatusLabel + '</div><div class="market-workspace-deck-summary">经营页分为本地贸易站、批量管理和建站候选。先判断这里是否值得建站，再决定是否批量升级、投资或调整经营方向。</div></div>' +
      '<div class="market-workspace-deck-emphasis"><span class="market-workspace-deck-emphasis-label">本地状态</span><strong>' + localStatusLabel + '</strong><span class="market-workspace-deck-emphasis-note">' + localStatusNote + '</span></div></div>' +
    '<div class="market-workspace-deck-grid">' +
      renderWorkspaceDeckMetric('商网规模', String(input.tradeSummary.count || 0), '已建站点越多，远程指令台的价值越高。') +
      renderWorkspaceDeckMetric('日收益', '+' + Math.floor(input.commerceSnapshot.stationDailyIncome || 0).toLocaleString(), '累计收益 ' + Math.floor(input.tradeSummary.totalIncome || 0).toLocaleString() + '，适合判断扩张节奏。', 'tone-cool') +
      renderWorkspaceDeckMetric('升级批量操作', input.networkUpgradePlan.targetCount > 0 ? (input.networkUpgradePlan.affordableCount + '/' + input.networkUpgradePlan.targetCount) : '0/0', '当前预算可覆盖 ' + Math.floor(input.networkUpgradePlan.affordableCost || 0).toLocaleString() + ' 投资额。', 'tone-warm') +
      renderWorkspaceDeckMetric('可建站地点', String(input.buildCandidates.length), input.buildCandidate ? ('当前地点可直接投资 ' + Math.floor(input.buildCandidate.buildCost || 0).toLocaleString()) : '继续探索可找到新的建站地点。', 'tone-hot') +
    '</div>' +
    '<div class="market-workspace-deck-strip">' +
      renderWorkspaceDeckPill('地点', systemLabel) +
      renderWorkspaceDeckPill('本地状态', localStatusLabel, input.localStation ? 'tone-cool' : (input.buildCandidate ? 'tone-warm' : '')) +
      renderWorkspaceDeckPill('已建站', String(input.ownedStations.length)) +
      renderWorkspaceDeckPill('可建站地点', String(input.buildCandidates.length)) +
      renderWorkspaceDeckPill('可批量投资', input.networkInvestmentPlan.targetCount > 0 ? (input.networkInvestmentPlan.affordableCount + '/' + input.networkInvestmentPlan.targetCount) : '0/0', (input.networkInvestmentPlan.affordableCount || 0) > 0 ? 'tone-cool' : '') +
      renderWorkspaceDeckPill('升级批量操作', input.networkUpgradePlan.targetCount > 0 ? (input.networkUpgradePlan.affordableCount + '/' + input.networkUpgradePlan.targetCount) : '0/0', (input.networkUpgradePlan.affordableCount || 0) > 0 ? 'tone-warm' : '') +
    '</div></section>';
}

function renderNextNetworkAction(action) {
  if (!action) {
    return '<div class="market-finance-card"><div class="market-finance-card-head"><span class="market-finance-card-title">商网待处理项</span><span class="market-finance-chip">暂无待处理</span></div><div class="market-finance-card-meta">当前商网没有明显优先动作，可继续跑贸易、探索情报或积累资金。</div></div>';
  }

  var buttonHtml = '';
  if (action.payload && action.payload.action && !action.disabled) {
    var attrs = ' data-action="' + escapeMarketOperationsHtmlAttr(action.payload.action) + '"';
    if (action.payload.systemId) attrs += ' data-system-id="' + escapeMarketOperationsHtmlAttr(action.payload.systemId) + '"';
    if (action.payload.managerId) attrs += ' data-manager-id="' + escapeMarketOperationsHtmlAttr(action.payload.managerId) + '"';
    if (action.payload.strategyId) attrs += ' data-strategy-id="' + escapeMarketOperationsHtmlAttr(action.payload.strategyId) + '"';
    buttonHtml = '<div class="market-finance-actions"><button class="btn-action market-finance-btn"' + attrs + '>' + escapeMarketOperationsHtml(action.actionLabel || '执行') + '</button></div>';
  }

  var chipLabel = action.disabled ? (action.disabledLabel || '资金准备') : action.actionLabel;
  return '<div class="market-finance-card is-featured"><div class="market-finance-card-head"><span class="market-finance-card-title">商网待处理项</span><span class="market-finance-chip">' + escapeMarketOperationsHtml(chipLabel) + '</span></div><div class="market-finance-card-meta">' + escapeMarketOperationsHtml(action.title) + '</div><div class="market-finance-card-meta">' + escapeMarketOperationsHtml(action.reason) + '</div>' + buttonHtml + '</div>';
}

export function renderMarketOperationsNetwork(request) {
  var input = request || {};
  var html = '<section class="market-finance-section"><div class="trade-station-summary-card"><div class="trade-station-summary-head"><span class="trade-station-summary-title">📡 商业网络总览</span><span class="trade-station-summary-sub">信用评级 ' + input.commerceSnapshot.creditRating + ' · 商网总览现由经营页统一承载</span></div>' +
    '<div class="trade-station-summary-grid"><div class="trade-station-metric"><span class="trade-station-metric-label">站点数量</span><span class="trade-station-metric-value">' + input.commerceSnapshot.ownedStationCount + '</span></div><div class="trade-station-metric"><span class="trade-station-metric-label">预计日收益</span><span class="trade-station-metric-value">+' + Math.floor(input.commerceSnapshot.stationDailyIncome).toLocaleString() + '</span></div><div class="trade-station-metric"><span class="trade-station-metric-label">累计收益</span><span class="trade-station-metric-value">' + Math.floor(input.tradeSummary.totalIncome).toLocaleString() + '</span></div><div class="trade-station-metric"><span class="trade-station-metric-label">站点投资</span><span class="trade-station-metric-value">' + Math.floor(input.commerceSnapshot.tradeInvestmentValue).toLocaleString() + '</span></div><div class="trade-station-metric"><span class="trade-station-metric-label">贷款余额</span><span class="trade-station-metric-value">' + Math.floor(input.commerceSnapshot.totalLoans).toLocaleString() + '</span></div></div>' +
    '<div class="trade-station-summary-tip">这里统一查看远程价格、建站候选和所有贸易站的经营情况。</div></div>' + renderNextNetworkAction(input.nextNetworkAction) + '</section>';

  if (input.ownedStations.length > 0) {
    html += renderMarketBatchPlanningPanel(input.state, input.ownedStations, input.networkInvestmentPlan, input.networkUpgradePlan, input.sortModes);
    html += '<section class="market-finance-section"><div class="trade-station-section-title">⚡ 核心站点快照</div><div class="market-finance-action-list">' + input.ownedStations.slice(0, 6).map(function (entry) {
      return '<div class="market-finance-network-row"><div class="market-finance-network-main"><div class="market-finance-action-title">' + entry.system.name + ' · Lv.' + entry.station.level + '</div><div class="market-finance-action-meta">日收益 +' + Math.floor(entry.projectedIncome).toLocaleString() + ' · ' + (entry.role ? entry.role.name : '未分工') + ' · 经营方式 ' + entry.strategy.name + '</div></div><div class="market-finance-network-note">累计 ' + Math.floor(entry.station.totalIncome || 0).toLocaleString() + '</div></div>';
    }).join('') + '</div></section>';
  }
  return html;
}
