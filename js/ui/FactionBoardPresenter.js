// js/ui/FactionBoardPresenter.js — 派系总览、关系卡与市场 CTA 纯投影

import * as Faction from '../systems/faction/FactionSystem.js';
import { FACTIONS, FACTION_LEVELS } from '../data/factions.js';
import { findSystem } from '../data/systems.js';
import { buildContextualMarketAction, getMarketFocusCtaLabel } from './MarketFocus.js';
import { getCommandActionAttributes, renderCommandActionContent } from './CommandAction.js';

const GOOD_EMOJIS = Object.freeze({
  food: '🌾', water: '💧', minerals: '⛏', technology: '🔬',
  luxury: '💎', weapons: '⚔', medicine: '💊', fuel: '⚡',
});

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getRelationTone(relation) {
  if (relation >= 70) return 'allied';
  if (relation >= 30) return 'friendly';
  if (relation >= -10) return 'neutral';
  if (relation >= -50) return 'unfriendly';
  return 'hostile';
}

function _formatSigned(value) {
  var number = Number(value) || 0;
  return (number >= 0 ? '+' : '') + number;
}

function _formatTaxMod(taxMod) {
  var pct = Math.round(((Number(taxMod) || 1) - 1) * 100);
  if (pct === 0) return '0%';
  return (pct > 0 ? '+' : '') + pct + '%';
}

function _formatGoods(goodIds, className) {
  return (Array.isArray(goodIds) ? goodIds : []).map(function (goodId) {
    return '<span class="' + className + '">' + _escapeHtml(GOOD_EMOJIS[goodId] || goodId) + '</span>';
  }).join('');
}

function _getFactionMarketAccessLabel(state, faction) {
  if (!faction || !faction.marketAccess || !faction.marketAccess.blackMarket) return '公开市场';
  var systemId = faction.controlledSystems && faction.controlledSystems[0];
  return Faction.canAccessBlackMarket(state, systemId) ? '黑市已开放' : '黑市待解锁';
}

function _renderFactionRelationDistribution(relations) {
  var counts = FACTION_LEVELS.reduce(function (acc, level) {
    acc[level.id] = 0;
    return acc;
  }, {});
  relations.forEach(function (entry) { counts[entry.level.id] = (counts[entry.level.id] || 0) + 1; });
  return '<div class="faction-relation-distribution" role="list" aria-label="派系关系分布">' +
    FACTION_LEVELS.slice().reverse().map(function (level) {
      var count = counts[level.id] || 0;
      return '<div class="faction-relation-distribution-row faction-relation-distribution-row--' + _escapeHtml(level.id) + '" role="listitem"><span class="faction-relation-distribution-emoji" aria-hidden="true">' + _escapeHtml(level.emoji) + '</span><strong>' + _escapeHtml(level.name) + '</strong><em>' + count + ' 派系</em></div>';
    }).join('') +
  '</div>';
}

function _getFactionFocusPriority(entry, state) {
  var faction = entry.faction;
  var hasLockedBlackMarket = faction.marketAccess && faction.marketAccess.blackMarket && !Faction.canAccessBlackMarket(state, faction.controlledSystems[0]);
  if (entry.level.id === 'hostile') return 0;
  if (entry.level.id === 'unfriendly') return 1;
  if (hasLockedBlackMarket) return 2;
  if (entry.level.id === 'allied') return 3;
  if (entry.level.id === 'friendly') return 4;
  return 5;
}

function _renderFactionFocusPanel(relations, state) {
  var focusRelations = relations.slice().sort(function (a, b) {
    var priorityDelta = _getFactionFocusPriority(a, state) - _getFactionFocusPriority(b, state);
    return priorityDelta !== 0 ? priorityDelta : Math.abs(b.relation) - Math.abs(a.relation);
  }).slice(0, 3);
  var mostTense = relations.slice().sort(function (a, b) { return a.relation - b.relation; })[0] || null;
  var lockedBlackMarket = relations.find(function (entry) {
    return entry.faction.marketAccess && entry.faction.marketAccess.blackMarket && !Faction.canAccessBlackMarket(state, entry.faction.controlledSystems[0]);
  });
  var allied = relations.find(function (entry) { return entry.level.id === 'allied' || entry.level.id === 'friendly'; });
  var signalTitle = mostTense && mostTense.relation < -10
    ? ('紧张关系：' + mostTense.faction.name)
    : lockedBlackMarket ? ('通路待解锁：' + lockedBlackMarket.faction.name) : allied ? ('友好通路：' + allied.faction.name) : '外交关系稳定';
  var signalNote = mostTense && mostTense.relation < -10
    ? ('关系 ' + _formatSigned(mostTense.relation) + '，贸易税 ' + _formatTaxMod(mostTense.level.taxMod) + '，先复核偏好货物和代表市场。')
    : lockedBlackMarket
      ? ('当前关系 ' + _formatSigned(lockedBlackMarket.relation) + '，到友好后可开放特殊通路。')
      : allied ? ('关系 ' + _formatSigned(allied.relation) + '，可优先利用税率和市场入口。') : '没有明显紧张关系，可按控制地点和偏好货物查看各派系。';
  return '<section class="faction-focus-panel" aria-label="外交关系信号"><div class="faction-focus-copy"><span class="faction-focus-kicker">关系信号</span><strong class="faction-focus-title">' + _escapeHtml(signalTitle) + '</strong><span class="faction-focus-note">' + _escapeHtml(signalNote) + '</span></div><div class="faction-focus-list" role="list" aria-label="重点派系">' +
    focusRelations.map(function (entry) {
      var faction = entry.faction;
      return '<article class="faction-focus-card faction-focus-card--' + _escapeHtml(entry.level.id) + '" role="listitem"><span class="faction-focus-icon" style="color:' + _escapeHtml(faction.color) + '" aria-hidden="true">' + _escapeHtml(faction.icon) + '</span><span class="faction-focus-main"><strong>' + _escapeHtml(faction.name) + '</strong><em>' + _escapeHtml(entry.level.name + ' · 关系 ' + _formatSigned(entry.relation) + ' · ' + _getFactionMarketAccessLabel(state, faction)) + '</em></span></article>';
    }).join('') +
  '</div></section>';
}

function _renderFactionSummary(relations, state) {
  var allied = relations.filter(function (entry) { return entry.level.id === 'allied' || entry.level.id === 'friendly'; }).length;
  var hostile = relations.filter(function (entry) { return entry.level.id === 'hostile' || entry.level.id === 'unfriendly'; }).length;
  var avgRelation = relations.length ? Math.round(relations.reduce(function (sum, entry) { return sum + entry.relation; }, 0) / relations.length) : 0;
  var blackAccess = relations.filter(function (entry) {
    return entry.faction.marketAccess && entry.faction.marketAccess.blackMarket && Faction.canAccessBlackMarket(state, entry.faction.controlledSystems[0]);
  }).length;
  return '<section class="archive-faction-console" aria-label="派系外交总览"><div class="faction-console-head"><div><span class="archive-panel-kicker">DIPLOMATIC GRID</span><h3 class="archive-panel-title">派系关系</h3></div><span class="faction-console-score">' + _formatSigned(avgRelation) + '</span></div><div class="archive-stat-strip archive-stat-strip--faction"><span><strong>' + allied + '</strong><em>友好以上</em></span><span><strong>' + hostile + '</strong><em>紧张关系</em></span><span><strong>' + blackAccess + '</strong><em>黑市通路</em></span><span><strong>' + relations.length + '</strong><em>派系档案</em></span></div>' + _renderFactionRelationDistribution(relations) + _renderFactionFocusPanel(relations, state) + '</section>';
}

export function getFactionMarketAction(state, faction) {
  var factionData = typeof faction === 'string' ? FACTIONS.find(function (entry) { return entry.id === faction; }) : faction;
  if (!factionData || !Array.isArray(factionData.controlledSystems) || factionData.controlledSystems.length === 0) return null;
  var representativeSystemId = factionData.controlledSystems[0];
  var representativeSystem = findSystem(representativeSystemId);
  var canAccessBlackMarket = !!(factionData.marketAccess && factionData.marketAccess.blackMarket && Faction.canAccessBlackMarket(state, representativeSystemId));
  var baseAction = buildContextualMarketAction(state, representativeSystemId, { context: 'faction' });
  var action = Object.assign({}, baseAction, {
    factionId: factionData.id,
    factionName: factionData.name,
    systemId: representativeSystemId,
    systemName: representativeSystem ? representativeSystem.name : representativeSystemId,
  });
  if (factionData.marketAccess && factionData.marketAccess.blackMarket && !canAccessBlackMarket) {
    return Object.assign(action, {
      label: '查看黑市条件',
      commandVerb: '查看黑市条件',
      contextHint: '辛迪加黑市尚未开放，先看公开情报与开放条件。',
      hint: action.systemName + ' · 辛迪加黑市尚未开放，先看公开情报与开放条件。',
    });
  }
  var label = getMarketFocusCtaLabel({
    workspaceId: action.marketWorkspaceId,
    subworkspaceId: action.marketSubworkspaceId,
    marketMode: action.marketMode,
  }, 'faction');
  return Object.assign(action, {
    label: label,
    commandVerb: label,
    hint: action.systemName + ' · ' + (action.contextHint || action.marketFocusLabel || '市场页'),
  });
}

function _renderFactionCard(state, entry) {
  var faction = entry.faction;
  var relation = Number(entry.relation) || 0;
  var level = entry.level;
  var relationTone = _getRelationTone(relation);
  var controlledCount = Array.isArray(faction.controlledSystems) ? faction.controlledSystems.length : 0;
  var representativeSystemId = faction.controlledSystems && faction.controlledSystems[0];
  var blackMarketText = faction.marketAccess && faction.marketAccess.blackMarket
    ? (Faction.canAccessBlackMarket(state, representativeSystemId) ? '黑市已开放' : '友好后开放')
    : '无黑市通路';
  var barColor = relation >= 30 ? 'var(--accent-green)' : relation >= -10 ? 'var(--accent-blue)' : relation >= -50 ? '#FF9800' : 'var(--accent-red)';
  var barPct = Math.max(0, Math.min(100, Math.round((relation + 100) / 2)));
  var marketAction = getFactionMarketAction(state, faction);
  var preference = faction.tradePreference || {};
  return '<article class="faction-card faction-card--' + relationTone + '" role="listitem" tabindex="0" data-faction-id="' + _escapeHtml(faction.id) + '" data-faction-level="' + _escapeHtml(level.id) + '" style="border-left:3px solid ' + _escapeHtml(faction.color) + '" aria-label="' + _escapeHtml(faction.name + '，关系 ' + _formatSigned(relation) + '，' + level.name) + '">' +
    '<div class="faction-header"><span class="faction-icon" style="color:' + _escapeHtml(faction.color) + '" aria-hidden="true">' + _escapeHtml(faction.icon) + '</span><div class="faction-info"><span class="faction-kicker">' + _escapeHtml(String(faction.id).toUpperCase()) + '</span><span class="faction-name">' + _escapeHtml(faction.name) + '</span><span class="faction-ideology">' + _escapeHtml(faction.ideology) + '</span></div><span class="faction-level" style="color:' + _escapeHtml(faction.color) + '">' + _escapeHtml(level.name) + '</span></div>' +
    '<p class="faction-desc">' + _escapeHtml(faction.description) + '</p>' +
    '<div class="faction-relation-bar"><span class="faction-rel-label">关系</span><div class="mini-bar-track faction-card-meter" role="progressbar" aria-label="' + _escapeHtml(faction.name) + '关系值" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="' + relation + '" style="flex:1"><div class="mini-bar-fill" style="width:' + barPct + '%;background:' + barColor + '"></div></div><span class="faction-rel-val" style="color:' + barColor + '">' + _formatSigned(relation) + '</span></div>' +
    '<div class="faction-details"><div class="faction-metric-grid"><span><strong>' + controlledCount + '</strong><em>控制地点</em></span><span><strong>' + _escapeHtml(_formatTaxMod(level.taxMod)) + '</strong><em>贸易税</em></span><span><strong>' + _escapeHtml(blackMarketText) + '</strong><em>特殊通路</em></span></div>' +
    '<div class="faction-pref"><span class="faction-pref-label">偏好</span><span class="faction-pref-liked">' + _formatGoods(preference.liked, 'faction-good-token faction-good-token--liked') + '</span><span class="faction-pref-label">规避</span><span class="faction-pref-disliked">' + _formatGoods(preference.disliked, 'faction-good-token faction-good-token--disliked') + '</span></div>' +
    '<div class="faction-bonus">' + (level.id === 'friendly' || level.id === 'allied' ? _escapeHtml(faction.bonuses[level.id] || '') : '<span>提升关系以解锁派系奖励</span>') + '</div>' +
    (marketAction ? '<div class="faction-actions"><button class="planet-detail-action planet-detail-action--command command-action-btn faction-market-btn" type="button" data-faction-market="true" data-faction-id="' + _escapeHtml(marketAction.factionId) + '" data-faction-name="' + _escapeHtml(marketAction.factionName) + '" data-system-id="' + _escapeHtml(marketAction.systemId) + '" data-system-name="' + _escapeHtml(marketAction.systemName) + '" data-market-workspace-id="' + _escapeHtml(marketAction.marketWorkspaceId) + '" data-market-subworkspace-id="' + _escapeHtml(marketAction.marketSubworkspaceId) + '" data-market-focus-label="' + _escapeHtml(marketAction.marketFocusLabel) + '" data-market-mode="' + _escapeHtml(marketAction.marketMode || '') + '" data-market-hint="' + _escapeHtml(marketAction.hint || '') + '" title="' + _escapeHtml(marketAction.hint || '') + '"' + getCommandActionAttributes(marketAction, _escapeHtml) + '>' + renderCommandActionContent(marketAction, _escapeHtml) + '</button><div class="faction-action-note">' + _escapeHtml(marketAction.hint) + '</div></div>' : '') +
    '</div></article>';
}

export function buildFactionBoardView(request) {
  var state = request && request.state;
  if (!state) return null;
  var relations = Faction.getAllRelations(state);
  var html = _renderFactionSummary(relations, state) + '<div class="faction-card-grid" role="list" aria-label="派系关系列表">' + relations.map(function (entry) { return _renderFactionCard(state, entry); }).join('') + '</div>';
  return Object.freeze({ html: html, relationCount: relations.length });
}
