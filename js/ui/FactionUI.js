// js/ui/FactionUI.js — 派系外交界面渲染
// 依赖：systems/faction/FactionSystem.js
// 导出：render

import * as Faction from '../systems/faction/FactionSystem.js';
import { FACTIONS, FACTION_LEVELS } from '../data/factions.js';
import { GOODS } from '../data/goods.js';
import { findSystem } from '../data/systems.js';
import {
  buildContextualMarketAction,
  getMarketFocusCtaLabel,
} from './MarketFocus.js';
import { getCommandActionAttributes, renderCommandActionContent } from './CommandAction.js';
import * as ContextInspector from './ContextInspector.js';
import { buildWorkspaceObjectDetailView } from './WorkspaceObjectDetailPresenter.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeHtmlAttr(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

export function renderContextInspector(request) {
  var context = request && request.context;
  var state = request && request.state;
  var container = request && request.container;
  if (!context || context.type !== 'faction' || !state || !container) return false;
  var faction = FACTIONS.find(function (entry) { return entry.id === context.id; });
  if (!faction) return false;
  var relation = Faction.getRelation(state, faction.id);
  var level = Faction.getLevel(state, faction.id);
  container.innerHTML =
    '<article class="workspace-context-card workspace-context-card--faction">' +
      '<div class="workspace-context-hero"><span aria-hidden="true">' + _escapeHtml(faction.icon) + '</span><div><small>' + _escapeHtml(faction.ideology) + '</small><h3>' + _escapeHtml(faction.name) + '</h3></div></div>' +
      '<p>' + _escapeHtml(faction.description) + '</p>' +
      '<div class="workspace-context-metrics" role="list">' +
        '<span role="listitem"><small>关系</small><strong>' + _formatSigned(relation) + '</strong></span>' +
        '<span role="listitem"><small>等级</small><strong>' + _escapeHtml(level.name) + '</strong></span>' +
        '<span role="listitem"><small>税率</small><strong>' + _escapeHtml(_formatTaxMod(level.taxMod)) + '</strong></span>' +
        '<span role="listitem"><small>控制</small><strong>' + (faction.controlledSystems || []).length + ' 地点</strong></span>' +
      '</div>' +
      '<div class="workspace-context-callout">' + _escapeHtml(faction.bonuses[level.id] || '提升关系以解锁派系奖励。') + '</div>' +
      '<button class="workspace-context-action" type="button" data-context-action="open-detail" data-context-id="' +
        _escapeHtmlAttr(faction.id) + '">查看完整派系详情</button>' +
    '</article>';
  return { title: '派系检查' };
}

function _formatGoodNames(goodIds) {
  return (Array.isArray(goodIds) ? goodIds : []).map(function (goodId) {
    var good = GOODS.find(function (entry) { return entry.id === goodId; });
    return _goodEmoji(goodId) + ' ' + (good ? good.name : goodId);
  }).join(' / ');
}

export function renderWorkspaceDetail(request) {
  var detail = request && request.detail;
  var state = request && request.state;
  var container = request && request.container;
  if (!detail || detail.type !== 'archive-faction' || !state || !container) return false;
  var faction = FACTIONS.find(function (entry) { return entry.id === detail.id; });
  if (!faction) return false;
  var relation = Faction.getRelation(state, faction.id);
  var level = Faction.getLevel(state, faction.id);
  var controlledSystems = (faction.controlledSystems || []).map(function (systemId) {
    var system = findSystem(systemId);
    return system ? system.name : systemId;
  });
  var levelIndex = FACTION_LEVELS.findIndex(function (entry) { return entry.id === level.id; });
  var nextLevel = levelIndex >= 0 && levelIndex < FACTION_LEVELS.length - 1
    ? FACTION_LEVELS[levelIndex + 1]
    : null;
  var marketLabel = faction.marketAccess && faction.marketAccess.blackMarket
    ? (Faction.canAccessBlackMarket(state, faction.controlledSystems[0]) ? '黑市已开放' : '黑市待解锁')
    : '公开市场';
  var view = buildWorkspaceObjectDetailView({
    id: faction.id,
    kind: 'faction',
    kindLabel: '派系',
    detailLabel: '派系详情',
    icon: faction.icon || '🏛️',
    eyebrow: faction.ideology || '派系档案',
    title: faction.name,
    description: faction.description || '暂无派系说明。',
    metrics: [
      { label: '关系', value: _formatSigned(relation) },
      { label: '等级', value: level.name },
      { label: '税率', value: _formatTaxMod(level.taxMod) },
      { label: '控制', value: controlledSystems.length + ' 地点' },
    ],
    facts: [
      { label: '当前关系效果', value: faction.bonuses[level.id] || '尚未解锁关系奖励', detail: nextLevel ? ('下一等级：' + nextLevel.name) : '已达到最高关系等级' },
      { label: '控制地点', value: controlledSystems.length ? controlledSystems.join(' / ') : '无登记地点', detail: '派系税率与市场规则在这些地点生效' },
      { label: '偏好商品', value: _formatGoodNames(faction.tradePreference && faction.tradePreference.liked) || '无登记偏好', detail: '交易这些商品通常有利于关系' },
      { label: '敏感商品', value: _formatGoodNames(faction.tradePreference && faction.tradePreference.disliked) || '无登记敏感品', detail: '交易这些商品可能影响关系' },
    ],
    tags: [level.name, marketLabel, faction.ideology || ''],
    note: '该详情汇总关系、控制区与贸易偏好；市场跳转和其它外交动作仍在派系页确认。',
  });
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}

function _getRelationTone(rel) {
  if (rel >= 70) return 'allied';
  if (rel >= 30) return 'friendly';
  if (rel >= -10) return 'neutral';
  if (rel >= -50) return 'unfriendly';
  return 'hostile';
}

function _formatSigned(value) {
  return (value >= 0 ? '+' : '') + value;
}

function _formatTaxMod(taxMod) {
  const pct = Math.round((taxMod - 1) * 100);
  if (pct === 0) return '0%';
  return (pct > 0 ? '+' : '') + pct + '%';
}

function _formatGoods(goodIds, className) {
  return (goodIds || []).map(function (goodId) {
    return '<span class="' + className + '">' + _escapeHtml(_goodEmoji(goodId)) + '</span>';
  }).join('');
}

function _getFactionMarketAccessLabel(state, faction) {
  if (!faction || !faction.marketAccess || !faction.marketAccess.blackMarket) return '公开市场';
  const systemId = faction.controlledSystems && faction.controlledSystems[0];
  return Faction.canAccessBlackMarket(state, systemId) ? '黑市已开放' : '黑市待解锁';
}

function _renderFactionRelationDistribution(relations) {
  const counts = FACTION_LEVELS.reduce(function (acc, level) {
    acc[level.id] = 0;
    return acc;
  }, {});
  relations.forEach(function (entry) {
    counts[entry.level.id] = (counts[entry.level.id] || 0) + 1;
  });

  return '<div class="faction-relation-distribution" role="list" aria-label="派系关系分布">' +
    FACTION_LEVELS.slice().reverse().map(function (level) {
      const count = counts[level.id] || 0;
      return '<div class="faction-relation-distribution-row faction-relation-distribution-row--' + _escapeHtmlAttr(level.id) + '" role="listitem">' +
        '<span class="faction-relation-distribution-emoji" aria-hidden="true">' + _escapeHtml(level.emoji) + '</span>' +
        '<strong>' + _escapeHtml(level.name) + '</strong>' +
        '<em>' + count + ' 派系</em>' +
      '</div>';
    }).join('') +
  '</div>';
}

function _getFactionFocusPriority(entry, state) {
  const faction = entry.faction;
  const hasLockedBlackMarket = faction.marketAccess &&
    faction.marketAccess.blackMarket &&
    !Faction.canAccessBlackMarket(state, faction.controlledSystems[0]);
  if (entry.level.id === 'hostile') return 0;
  if (entry.level.id === 'unfriendly') return 1;
  if (hasLockedBlackMarket) return 2;
  if (entry.level.id === 'allied') return 3;
  if (entry.level.id === 'friendly') return 4;
  return 5;
}

function _renderFactionFocusPanel(relations, state) {
  const focusRelations = relations.slice().sort(function (a, b) {
    const priorityDelta = _getFactionFocusPriority(a, state) - _getFactionFocusPriority(b, state);
    if (priorityDelta !== 0) return priorityDelta;
    return Math.abs(b.relation) - Math.abs(a.relation);
  }).slice(0, 3);
  const mostTense = relations.slice().sort(function (a, b) { return a.relation - b.relation; })[0] || null;
  const lockedBlackMarket = relations.find(function (entry) {
    return entry.faction.marketAccess &&
      entry.faction.marketAccess.blackMarket &&
      !Faction.canAccessBlackMarket(state, entry.faction.controlledSystems[0]);
  });
  const allied = relations.find(function (entry) {
    return entry.level.id === 'allied' || entry.level.id === 'friendly';
  });
  const signalTitle = mostTense && mostTense.relation < -10
    ? ('紧张关系：' + mostTense.faction.name)
    : (lockedBlackMarket
        ? ('通路待解锁：' + lockedBlackMarket.faction.name)
        : (allied ? ('友好通路：' + allied.faction.name) : '外交关系稳定'));
  const signalNote = mostTense && mostTense.relation < -10
    ? ('关系 ' + _formatSigned(mostTense.relation) + '，贸易税 ' + _formatTaxMod(mostTense.level.taxMod) + '，先复核偏好货物和代表市场。')
    : (lockedBlackMarket
        ? ('当前关系 ' + _formatSigned(lockedBlackMarket.relation) + '，到友好后可开放特殊通路。')
        : (allied
            ? ('关系 ' + _formatSigned(allied.relation) + '，可优先利用税率和市场入口。')
            : '没有明显紧张关系，可按控制地点和偏好货物查看各派系。'));

  return '<section class="faction-focus-panel" aria-label="外交关系信号">' +
    '<div class="faction-focus-copy">' +
      '<span class="faction-focus-kicker">关系信号</span>' +
      '<strong class="faction-focus-title">' + _escapeHtml(signalTitle) + '</strong>' +
      '<span class="faction-focus-note">' + _escapeHtml(signalNote) + '</span>' +
    '</div>' +
    '<div class="faction-focus-list" role="list" aria-label="重点派系">' +
      focusRelations.map(function (entry) {
        const faction = entry.faction;
        return '<article class="faction-focus-card faction-focus-card--' + _escapeHtmlAttr(entry.level.id) + '" role="listitem">' +
          '<span class="faction-focus-icon" style="color:' + _escapeHtmlAttr(faction.color) + '" aria-hidden="true">' + _escapeHtml(faction.icon) + '</span>' +
          '<span class="faction-focus-main">' +
            '<strong>' + _escapeHtml(faction.name) + '</strong>' +
            '<em>' + _escapeHtml(entry.level.name + ' · 关系 ' + _formatSigned(entry.relation) + ' · ' + _getFactionMarketAccessLabel(state, faction)) + '</em>' +
          '</span>' +
        '</article>';
      }).join('') +
    '</div>' +
  '</section>';
}

function _renderFactionSummary(relations, state) {
  const allied = relations.filter(function (entry) {
    return entry.level.id === 'allied' || entry.level.id === 'friendly';
  }).length;
  const hostile = relations.filter(function (entry) {
    return entry.level.id === 'hostile' || entry.level.id === 'unfriendly';
  }).length;
  const avgRelation = relations.length
    ? Math.round(relations.reduce(function (sum, entry) { return sum + entry.relation; }, 0) / relations.length)
    : 0;
  const blackAccess = relations.filter(function (entry) {
    return entry.faction.marketAccess &&
      entry.faction.marketAccess.blackMarket &&
      Faction.canAccessBlackMarket(state, entry.faction.controlledSystems[0]);
  }).length;

  return '<section class="archive-faction-console" aria-label="派系外交总览">' +
    '<div class="faction-console-head">' +
      '<div>' +
        '<span class="archive-panel-kicker">DIPLOMATIC GRID</span>' +
        '<h3 class="archive-panel-title">派系关系</h3>' +
      '</div>' +
      '<span class="faction-console-score">' + _formatSigned(avgRelation) + '</span>' +
    '</div>' +
    '<div class="archive-stat-strip archive-stat-strip--faction">' +
      '<span><strong>' + allied + '</strong><em>友好以上</em></span>' +
      '<span><strong>' + hostile + '</strong><em>紧张关系</em></span>' +
      '<span><strong>' + blackAccess + '</strong><em>黑市通路</em></span>' +
      '<span><strong>' + relations.length + '</strong><em>派系档案</em></span>' +
    '</div>' +
    _renderFactionRelationDistribution(relations) +
    _renderFactionFocusPanel(relations, state) +
  '</section>';
}

export function getFactionMarketAction(state, faction) {
  const factionData = typeof faction === 'string'
    ? FACTIONS.find(function (entry) { return entry.id === faction; })
    : faction;
  if (!factionData || !Array.isArray(factionData.controlledSystems) || factionData.controlledSystems.length === 0) {
    return null;
  }

  const representativeSystemId = factionData.controlledSystems[0];
  const representativeSystem = findSystem(representativeSystemId);
  const canAccessBlackMarket = !!(factionData.marketAccess && factionData.marketAccess.blackMarket && Faction.canAccessBlackMarket(state, representativeSystemId));
  const action = buildContextualMarketAction(state, representativeSystemId, {
    context: 'faction',
  });

  action.factionId = factionData.id;
  action.factionName = factionData.name;
  action.systemId = representativeSystemId;
  action.systemName = representativeSystem ? representativeSystem.name : representativeSystemId;

  if (factionData.marketAccess && factionData.marketAccess.blackMarket && !canAccessBlackMarket) {
    action.label = '查看黑市条件';
    action.commandVerb = action.label;
    action.contextHint = '辛迪加黑市尚未开放，先看公开情报与开放条件。';
    action.hint = action.systemName + ' · ' + action.contextHint;
    return action;
  }

  action.label = getMarketFocusCtaLabel({
    workspaceId: action.marketWorkspaceId,
    subworkspaceId: action.marketSubworkspaceId,
    marketMode: action.marketMode,
  }, 'faction');
  action.commandVerb = action.label;
  action.hint = action.systemName + ' · ' + (action.contextHint || action.marketFocusLabel || '市场页');
  return action;
}

/**
 * 渲染派系关系标签页
 * @param {object} state
 */
export function render(state, onOpenFactionMarket) {
  const container = document.getElementById('faction-list');
  if (!container) return;
  const relations = Faction.getAllRelations(state);

  let html = _renderFactionSummary(relations, state) +
    '<div class="faction-card-grid" role="list" aria-label="派系关系列表">';
  relations.forEach(function (r) {
    const f = r.faction;
    const rel = r.relation;
    const level = r.level;
    const relationTone = _getRelationTone(rel);
    const controlledCount = Array.isArray(f.controlledSystems) ? f.controlledSystems.length : 0;
    const blackMarketText = f.marketAccess && f.marketAccess.blackMarket
      ? (Faction.canAccessBlackMarket(state, f.controlledSystems[0]) ? '黑市已开放' : '友好后开放')
      : '无黑市通路';

    // 关系进度条颜色
    const barColor = rel >= 30 ? 'var(--accent-green)' :
                     rel >= -10 ? 'var(--accent-blue)' :
                     rel >= -50 ? '#FF9800' : 'var(--accent-red)';

    // 关系百分比 (映射 -100~100 到 0~100%)
    const barPct = ((rel + 100) / 200 * 100).toFixed(0);

    const marketAction = getFactionMarketAction(state, f);

    html +=
      '<article class="faction-card faction-card--' + relationTone + '" role="listitem" tabindex="0" data-faction-id="' + _escapeHtmlAttr(f.id) + '" data-faction-level="' + _escapeHtmlAttr(level.id) + '" style="border-left: 3px solid ' + _escapeHtmlAttr(f.color) + '" aria-label="' + _escapeHtmlAttr(f.name + '，关系 ' + _formatSigned(rel) + '，' + level.name) + '">' +
        '<div class="faction-header">' +
          '<span class="faction-icon" style="color:' + _escapeHtmlAttr(f.color) + '" aria-hidden="true">' + _escapeHtml(f.icon) + '</span>' +
          '<div class="faction-info">' +
            '<span class="faction-kicker">' + _escapeHtml(f.id.toUpperCase()) + '</span>' +
            '<span class="faction-name">' + _escapeHtml(f.name) + '</span>' +
            '<span class="faction-ideology">' + _escapeHtml(f.ideology) + '</span>' +
          '</div>' +
          '<span class="faction-level" style="color:' + _escapeHtmlAttr(f.color) + '">' + _escapeHtml(level.name) + '</span>' +
        '</div>' +
        '<p class="faction-desc">' + _escapeHtml(f.description) + '</p>' +
        '<div class="faction-relation-bar">' +
          '<span class="faction-rel-label">关系</span>' +
          '<div class="mini-bar-track faction-card-meter" role="progressbar" aria-label="' + _escapeHtmlAttr(f.name) + '关系值" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="' + rel + '" style="flex:1">' +
            '<div class="mini-bar-fill" style="width:' + barPct + '%;background:' + barColor + '"></div>' +
          '</div>' +
          '<span class="faction-rel-val" style="color:' + barColor + '">' + _formatSigned(rel) + '</span>' +
        '</div>' +
        '<div class="faction-details">' +
          '<div class="faction-metric-grid">' +
            '<span><strong>' + controlledCount + '</strong><em>控制地点</em></span>' +
            '<span><strong>' + _escapeHtml(_formatTaxMod(level.taxMod)) + '</strong><em>贸易税</em></span>' +
            '<span><strong>' + _escapeHtml(blackMarketText) + '</strong><em>特殊通路</em></span>' +
          '</div>' +
          '<div class="faction-pref">' +
            '<span class="faction-pref-label">偏好</span>' +
            '<span class="faction-pref-liked">' + _formatGoods(f.tradePreference.liked, 'faction-good-token faction-good-token--liked') + '</span>' +
            '<span class="faction-pref-label">规避</span>' +
            '<span class="faction-pref-disliked">' + _formatGoods(f.tradePreference.disliked, 'faction-good-token faction-good-token--disliked') + '</span>' +
          '</div>' +
          '<div class="faction-bonus">' +
            (level.id === 'friendly' || level.id === 'allied'
              ? _escapeHtml(f.bonuses[level.id] || '')
              : '<span>提升关系以解锁派系奖励</span>') +
          '</div>' +
          (marketAction
            ? '<div class="faction-actions">' +
                '<button class="planet-detail-action planet-detail-action--command command-action-btn faction-market-btn" type="button"' +
                  ' data-faction-market="true"' +
                  ' data-faction-id="' + _escapeHtmlAttr(marketAction.factionId) + '"' +
                  ' data-faction-name="' + _escapeHtmlAttr(marketAction.factionName) + '"' +
                  ' data-system-id="' + _escapeHtmlAttr(marketAction.systemId) + '"' +
                  ' data-system-name="' + _escapeHtmlAttr(marketAction.systemName) + '"' +
                  ' data-market-workspace-id="' + _escapeHtmlAttr(marketAction.marketWorkspaceId) + '"' +
                  ' data-market-subworkspace-id="' + _escapeHtmlAttr(marketAction.marketSubworkspaceId) + '"' +
                  ' data-market-focus-label="' + _escapeHtmlAttr(marketAction.marketFocusLabel) + '"' +
                  (marketAction.marketMode ? ' data-market-mode="' + _escapeHtmlAttr(marketAction.marketMode) + '"' : '') +
                  (marketAction.hint ? ' data-market-hint="' + _escapeHtmlAttr(marketAction.hint) + '" title="' + _escapeHtmlAttr(marketAction.hint) + '"' : '') +
                  getCommandActionAttributes(marketAction, _escapeHtmlAttr) +
                '>' + renderCommandActionContent(marketAction, _escapeHtml) + '</button>' +
                '<div class="faction-action-note">' + _escapeHtml(marketAction.hint) + '</div>' +
              '</div>'
            : '') +
        '</div>' +
      '</article>';
  });
  html += '</div>';

  container.innerHTML = html;

  container.querySelectorAll('.faction-card[data-faction-id]').forEach(function (card) {
    function inspect(event) {
      if (event && event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event && event.type === 'keydown') event.preventDefault();
      ContextInspector.replaceContext({
        type: 'faction',
        id: card.dataset.factionId,
        workspaceId: 'archive',
        source: 'archive-faction-card',
        revision: ContextInspector.getCurrentRevision(),
      });
    }
    card.addEventListener('click', inspect);
    card.addEventListener('keydown', inspect);
  });

  if (typeof onOpenFactionMarket === 'function') {
    container.querySelectorAll('[data-faction-market="true"]').forEach(function (button) {
      button.addEventListener('click', function () {
        onOpenFactionMarket({
          actionId: 'market',
          factionId: button.dataset.factionId,
          factionName: button.dataset.factionName,
          systemId: button.dataset.systemId,
          systemName: button.dataset.systemName,
          marketWorkspaceId: button.dataset.marketWorkspaceId,
          marketSubworkspaceId: button.dataset.marketSubworkspaceId,
          marketFocusLabel: button.dataset.marketFocusLabel,
          marketMode: button.dataset.marketMode || '',
          hint: button.dataset.marketHint || '',
          contextHint: button.dataset.marketHint || '',
          label: button.dataset.commandVerb || button.textContent.trim(),
          commandSurface: button.dataset.commandSurface || 'market',
          commandIntent: button.dataset.commandIntent || '',
          commandVerb: button.dataset.commandVerb || '',
        });
      });
    });
  }
}

const _GOOD_EMOJIS = {
  food: '🌾', water: '💧', minerals: '⛏', technology: '🔬',
  luxury: '💎', weapons: '⚔', medicine: '💊', fuel: '⚡',
};

function _goodEmoji(goodId) {
  return (_GOOD_EMOJIS[goodId] || goodId);
}
