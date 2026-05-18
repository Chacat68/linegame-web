// js/ui/FactionUI.js — 派系外交界面渲染
// 依赖：systems/faction/FactionSystem.js
// 导出：render

import * as Faction from '../systems/faction/FactionSystem.js';
import { FACTIONS, FACTION_LEVELS } from '../data/factions.js';
import { findSystem } from '../data/systems.js';
import {
  buildContextualMarketAction,
  getMarketFocusCtaLabel,
} from './MarketFocus.js?v=20260419-marketcta2';
import { getCommandActionAttributes, renderCommandActionContent } from './CommandAction.js?v=20260510-command1';

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
    action.contextHint = '辛迪加黑市尚未开放，先看公开情报与准入门槛。';
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
  const relations = Faction.getAllRelations(state);

  let html = '';
  relations.forEach(function (r) {
    const f = r.faction;
    const rel = r.relation;
    const level = r.level;

    // 关系进度条颜色
    const barColor = rel >= 30 ? 'var(--accent-green)' :
                     rel >= -10 ? 'var(--accent-blue)' :
                     rel >= -50 ? '#FF9800' : 'var(--accent-red)';

    // 关系百分比 (映射 -100~100 到 0~100%)
    const barPct = ((rel + 100) / 200 * 100).toFixed(0);

    const marketAction = getFactionMarketAction(state, f);

    html +=
      '<div class="faction-card" style="border-left: 3px solid ' + f.color + '">' +
        '<div class="faction-header">' +
          '<span class="faction-icon" style="color:' + f.color + '">' + f.icon + '</span>' +
          '<div class="faction-info">' +
            '<span class="faction-name">' + f.name + '</span>' +
            '<span class="faction-ideology">' + f.ideology + '</span>' +
          '</div>' +
          '<span class="faction-level" style="color:' + f.color + '">' + level.emoji + ' ' + level.name + '</span>' +
        '</div>' +
        '<p class="faction-desc">' + f.description + '</p>' +
        '<div class="faction-relation-bar">' +
          '<span class="faction-rel-label">关系</span>' +
          '<div class="mini-bar-track" style="flex:1">' +
            '<div class="mini-bar-fill" style="width:' + barPct + '%;background:' + barColor + '"></div>' +
          '</div>' +
          '<span class="faction-rel-val" style="color:' + barColor + '">' + (rel >= 0 ? '+' : '') + rel + '</span>' +
        '</div>' +
        '<div class="faction-details">' +
          '<div class="faction-pref">' +
            '<span class="faction-pref-label">偏好商品：</span>' +
            '<span class="faction-pref-liked">' + f.tradePreference.liked.map(_goodEmoji).join(' ') + '</span>' +
            '<span class="faction-pref-label" style="margin-left:8px">厌恶：</span>' +
            '<span class="faction-pref-disliked">' + f.tradePreference.disliked.map(_goodEmoji).join(' ') + '</span>' +
          '</div>' +
          '<div class="faction-tax">' +
            '贸易税修正：<span style="color:' + (level.taxMod <= 1 ? 'var(--accent-green)' : 'var(--accent-red)') + '">' +
            (level.taxMod <= 1 ? '-' : '+') + Math.abs(Math.round((level.taxMod - 1) * 100)) + '%</span>' +
          '</div>' +
          '<div class="faction-bonus">' +
            (level.id === 'friendly' || level.id === 'allied'
              ? '🎁 ' + (f.bonuses[level.id] || '')
              : '<span style="color:var(--text-dim)">提升关系以解锁派系奖励</span>') +
          '</div>' +
          '<div class="faction-bonus">' +
            (f.marketAccess && f.marketAccess.blackMarket
              ? (Faction.canAccessBlackMarket(state, f.controlledSystems[0])
                ? '🕶 黑市资格：已解锁'
                : '🔒 黑市资格：需达到友好')
              : '<span style="color:var(--text-dim)">该派系不提供黑市访问</span>') +
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
      '</div>';
  });

  container.innerHTML = html;

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
