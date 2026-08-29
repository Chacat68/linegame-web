// js/ui/ResearchDispatchPresenter.js — 科研补给路线与阻塞恢复纯投影

import * as AutoTrade from '../systems/trade/AutoTradeSystem.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import { buildMarketFocusAction, MARKET_FOCUS_PRESET_IDS } from './MarketFocus.js';
import {
  getCommandActionAttributes,
  normalizeCommandAction,
  renderCommandActionContent,
} from './CommandAction.js';
import { getPreferredAvailableQuest } from './QuestAvailablePresenter.js';
import { getQuestBlockerActions } from './QuestRoutePresenter.js';
import { getResearchDispatchBlockerState } from './ResearchGuidance.js';

const RESEARCH_BLOCKER_MARKET_PRESETS = Object.freeze({
  cargo: MARKET_FOCUS_PRESET_IDS.SPOT_TRADE,
  credits: MARKET_FOCUS_PRESET_IDS.CAPITAL_LOCAL,
  level: MARKET_FOCUS_PRESET_IDS.OPERATIONS_LOCAL,
  generic: MARKET_FOCUS_PRESET_IDS.SPOT_INTEL,
});

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getResearchBlockerCopySeed(blocker) {
  if (!blocker) return [];
  if (blocker.reasonId === 'level') return [{ blockedReason: '需要达到 Lv.4 才能前往。' }];
  return [{ blockedReason: '当前燃料不足，需要 8 燃料，现有 2。' }];
}

function _buildResearchMarketAction(reasonId, label, hint) {
  return buildMarketFocusAction(
    reasonId,
    label,
    hint,
    RESEARCH_BLOCKER_MARKET_PRESETS[reasonId] || RESEARCH_BLOCKER_MARKET_PRESETS.generic,
    'primary'
  );
}

function _buildResearchPrimaryAction(blocker) {
  if (!blocker) return null;
  if (blocker.reasonId === 'cargo') {
    return _buildResearchMarketAction('cargo', '打开市场清货', '会进入市场中心的交易页，先卖掉一部分货物，腾出舱位后再回来规划科研补给。');
  }
  if (blocker.reasonId === 'credits') {
    return _buildResearchMarketAction('credits', '打开资金管理', '会进入市场中心的资金页，先收回一笔投资或卖货，补足进货资金后再回来。');
  }
  if (blocker.reasonId === 'level') {
    return _buildResearchMarketAction('level', '打开市场跑单', '会进入市场中心，先提升等级，解锁更多科研相关补给点。');
  }
  return _buildResearchMarketAction('generic', '打开市场查看', '会进入市场中心，先看看本地价格和库存，再回来等待更稳的科研补给线。');
}

function _adaptResearchFallbackHint(hint, blocker) {
  if (!hint || !blocker) return hint;
  if (blocker.reasonId === 'credits') {
    return hint
      .replace('回补燃料和现金流', '补回现金流和科研进货资金')
      .replace('把燃料和节奏稳住', '把现金流和节奏稳住')
      .replace('再回来补燃料', '再回来补科研周转资金')
      .replace('先做一单回点现金，再回来补燃料。', '先做一单回点现金，再回来补科研周转资金。');
  }
  if (blocker.reasonId === 'cargo') {
    return hint
      .replace('回补燃料和现金流', '清掉一部分库存并腾出舱位')
      .replace('把燃料和节奏稳住', '把舱位和节奏稳住')
      .replace('再回来补燃料', '再回来腾出舱位')
      .replace('先做一单回点现金，再回来补燃料。', '先做一单顺手清一点库存，再回来腾出舱位。');
  }
  return hint;
}

export function getResearchDispatchBlockerActions(state, blocker) {
  if (!blocker) return [];
  var actions = [];
  var primaryAction = _buildResearchPrimaryAction(blocker);
  if (primaryAction) actions.push(primaryAction);
  var fallbackQuest = getPreferredAvailableQuest(state) || (Quest.getAvailableQuests(state)[0] || null);
  if (!fallbackQuest) return actions;
  var sharedQuestActions = getQuestBlockerActions(_getResearchBlockerCopySeed(blocker), fallbackQuest, state);
  var sharedFallbackAction = sharedQuestActions.find(function (action) { return action.actionId === 'quest-focus'; });
  if (sharedFallbackAction) {
    actions.push({
      actionId: 'quest-focus',
      reasonId: blocker.reasonId,
      label: sharedFallbackAction.label,
      hint: _adaptResearchFallbackHint(sharedFallbackAction.hint, blocker),
      commandSurface: sharedFallbackAction.commandSurface,
      commandIntent: sharedFallbackAction.commandIntent,
      commandVerb: sharedFallbackAction.commandVerb || sharedFallbackAction.label,
      targetQuestId: sharedFallbackAction.targetQuestId,
      targetQuestName: sharedFallbackAction.targetQuestName,
      variant: 'secondary',
    });
  }
  return actions;
}

export function selectResearchDispatch(state, researchDispatchContext) {
  if (!state) return Object.freeze({ recommendation: null, blocker: null });
  var recommendation = AutoTrade.findResearchSupplyRoute(state, researchDispatchContext);
  var blocker = recommendation ? null : getResearchDispatchBlockerState(state, researchDispatchContext);
  return Object.freeze({ recommendation: recommendation || null, blocker: blocker || null });
}

export function renderResearchDispatchRecommendation(recommendation, canApplyResearchDispatch) {
  if (!recommendation) return '';
  var riskLabel = recommendation.inspectionRisk && recommendation.inspectionRisk.protectedByBlackMarket
    ? '0%（辛迪加庇护）'
    : ((recommendation.inspectionRisk && recommendation.inspectionRisk.checkChancePercent) || 0) + '%';
  var roleLabel = recommendation.dispatchProfile && recommendation.dispatchProfile.roleLabel
    ? recommendation.dispatchProfile.roleLabel
    : '默认跑商';
  var surveyIntelNote = recommendation.surveyIntelSummary
    ? '<div class="research-route-note">' + _escapeHtml(recommendation.surveyIntelSummary) + '</div>'
    : '';
  return '<div class="research-route-card">' +
    '<div class="research-route-head"><div class="research-route-title">🛰️ 科研补给建议</div><div class="research-route-caption">' + _escapeHtml(recommendation.focusTypeLabel) + ' · ' + _escapeHtml(recommendation.focusCategoryLabel) + '</div></div>' +
    '<div class="research-route-main">' + _escapeHtml(recommendation.focusTechName) + ' · ' + _escapeHtml(recommendation.buySystemName) + ' → ' + _escapeHtml(recommendation.sellSystemName) + ' · ' + _escapeHtml(recommendation.goodEmoji) + ' ' + _escapeHtml(recommendation.goodName) + '</div>' +
    '<div class="research-route-meta"><span>预计利润 ' + Math.floor(Number(recommendation.profit) || 0) + '</span><span>装载 ' + Math.max(0, Number(recommendation.quantity) || 0) + '</span><span>' + _escapeHtml(recommendation.routeModeLabel || '星系内中转') + '</span><span>查获 ' + _escapeHtml(riskLabel) + '</span></div>' +
    '<div class="research-route-note">' + _escapeHtml(roleLabel) + ' · ' + _escapeHtml(recommendation.strategySummary) + (recommendation.tradeThemeSummary ? ' · ' + _escapeHtml(recommendation.tradeThemeSummary) : '') + '</div>' +
    surveyIntelNote +
    (canApplyResearchDispatch
      ? '<div class="research-route-actions"><button type="button" class="research-route-apply-btn command-action-btn" data-command-surface="fleet" data-command-intent="科研补给" data-command-verb="带入机库">' +
          renderCommandActionContent({ actionId: 'dispatch', label: '带入机库', commandSurface: 'fleet', commandIntent: '科研补给' }, _escapeHtml) +
        '</button><span class="research-route-action-hint">切到机库并预填这条补给线</span></div>'
      : '') +
  '</div>';
}

export function renderResearchDispatchBlocker(state, blocker, canResolveResearchBlocker) {
  if (!blocker) return '';
  var actions = getResearchDispatchBlockerActions(state, blocker);
  return '<div class="research-route-card is-blocked">' +
    '<div class="research-route-head"><div class="research-route-title">⛔ 暂不生成科研补给建议</div><div class="research-route-caption">' + _escapeHtml(blocker.sourceLabel) + ' · ' + _escapeHtml(blocker.categoryLabel) + '</div></div>' +
    '<div class="research-route-main">' + _escapeHtml(blocker.techName) + ' 当前缺少可执行的补给条件，补足后会自动恢复科研补给建议。</div>' +
    '<div class="research-route-blocker-list"><div class="research-route-blocker-item"><div class="research-route-blocker-system">' + _escapeHtml(blocker.techName) + ' · ' + _escapeHtml(blocker.categoryLabel) + '</div><div class="research-route-blocker-reason">' + _escapeHtml(blocker.blockedReason) + '</div></div></div>' +
    (canResolveResearchBlocker && actions.length > 0
      ? '<div class="research-route-actions is-blocked">' + actions.map(function (action) {
          var commandAction = normalizeCommandAction(action);
          return '<div class="research-route-action-item' + (action.variant === 'secondary' ? ' is-secondary' : '') + '">' +
            '<button type="button" class="research-route-blocker-btn command-action-btn' + (commandAction.variant === 'secondary' ? ' is-secondary' : '') + '" data-action-id="' + _escapeHtml(action.actionId || '') + '" data-reason-id="' + _escapeHtml(action.reasonId || '') + '" data-target-quest-id="' + _escapeHtml(action.targetQuestId || '') + '" data-target-quest-name="' + _escapeHtml(action.targetQuestName || '') + '" data-market-workspace-id="' + _escapeHtml(action.marketWorkspaceId || '') + '" data-market-subworkspace-id="' + _escapeHtml(action.marketSubworkspaceId || '') + '" data-market-focus-label="' + _escapeHtml(action.marketFocusLabel || '') + '" data-focus-tech-id="' + _escapeHtml(blocker.techId || '') + '" data-focus-tech-name="' + _escapeHtml(blocker.techName || '') + '"' + getCommandActionAttributes(commandAction, _escapeHtml) + '>' + renderCommandActionContent(commandAction, _escapeHtml) + '</button>' +
            '<span class="research-route-action-hint">' + _escapeHtml(action.hint || '') + '</span></div>';
        }).join('') + '</div>'
      : '') +
    '<div class="research-route-note is-blocked">' + _escapeHtml(blocker.summaryText) + '</div>' +
  '</div>';
}

export function buildResearchDispatchView(request) {
  var input = request || {};
  var selected = selectResearchDispatch(input.state, input.researchDispatchContext);
  var html = selected.recommendation
    ? renderResearchDispatchRecommendation(selected.recommendation, !!input.canApplyResearchDispatch)
    : renderResearchDispatchBlocker(input.state, selected.blocker, !!input.canResolveResearchBlocker);
  return Object.freeze({
    recommendation: selected.recommendation,
    blocker: selected.blocker,
    html: html,
  });
}
