// js/ui/ResearchUI.js — 科技研究界面渲染
// 依赖：data/technologies.js, systems/research/ResearchSystem.js
// 导出：render

import { TECHNOLOGIES, TECH_CATEGORIES } from '../data/technologies.js';
import { getSystemsByGalaxy } from '../data/systems.js';
import { buildMarketFocusAction, MARKET_FOCUS_PRESET_IDS } from './MarketFocus.js?v=20260419-marketcta2';
import { getCommandActionAttributes, normalizeCommandAction, renderCommandActionContent } from './CommandAction.js?v=20260510-command1';
import * as Research from '../systems/research/ResearchSystem.js';
import * as AutoTrade from '../systems/trade/AutoTradeSystem.js?v=20260420-balance5';
import * as Quest from '../systems/quest/QuestSystem.js?v=20260412-questroute2';
import { getQuestBlockerActions, getPreferredAvailableQuest } from './QuestUI.js?v=20260420-balance5';

const RESEARCH_BLOCKER_MARKET_PRESETS = {
  cargo: MARKET_FOCUS_PRESET_IDS.SPOT_TRADE,
  credits: MARKET_FOCUS_PRESET_IDS.CAPITAL_LOCAL,
  level: MARKET_FOCUS_PRESET_IDS.OPERATIONS_LOCAL,
  generic: MARKET_FOCUS_PRESET_IDS.SPOT_INTEL,
};

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

function _getResearchSupplyFocus(state) {
  var techId = state.currentResearch && state.currentResearch.techId
    ? state.currentResearch.techId
    : (((state.researchOptions || [])[0]) || null);

  if (!techId) return null;

  var tech = TECHNOLOGIES.find(function (item) { return item.id === techId; });
  if (!tech) return null;

  var category = TECH_CATEGORIES.find(function (item) { return item.id === tech.category; });
  return {
    techId: tech.id,
    techName: tech.name,
    categoryId: tech.category,
    categoryLabel: category ? category.name : tech.category,
    sourceLabel: state.currentResearch && state.currentResearch.techId ? '当前研究' : '候选方向',
  };
}

function _getResearchDispatchBlockerState(state, researchDispatchContext) {
  var focus = _getResearchSupplyFocus(state);
  if (!focus) return null;

  researchDispatchContext = researchDispatchContext || {};
  var currentGalaxy = researchDispatchContext.currentGalaxy || state.currentGalaxy || 'milky_way';
  var playerLevel = Number.isFinite(researchDispatchContext.playerLevel)
    ? researchDispatchContext.playerLevel
    : (state.playerLevel || 1);
  var cargoFree = Number.isFinite(researchDispatchContext.cargoFree)
    ? researchDispatchContext.cargoFree
    : Math.max(0, (state.maxCargo || 0) - Object.values(state.cargo || {}).reduce(function (sum, qty) {
      return sum + qty;
    }, 0));
  var credits = Number.isFinite(researchDispatchContext.credits)
    ? researchDispatchContext.credits
    : (state.credits || 0);
  var accessibleSystems = getSystemsByGalaxy(currentGalaxy).filter(function (sys) {
    return playerLevel >= (sys.minLevel || 1);
  });

  if (cargoFree <= 0) {
    return Object.assign({}, focus, {
      reasonId: 'cargo',
      blockedReason: '当前货舱已满，暂时没有空位执行科研补给。',
      summaryText: '先清出部分舱位后，科研补给建议会自动恢复。',
    });
  }

  if (credits <= 0) {
    return Object.assign({}, focus, {
      reasonId: 'credits',
      blockedReason: '当前资金不足，暂时无法为科研补给垫付进货成本。',
      summaryText: '先做一笔周转或卖货回款，再回来安排这条科研补给线。',
    });
  }

  if (accessibleSystems.length < 2) {
    return Object.assign({}, focus, {
      reasonId: 'level',
      blockedReason: '当前可达科研补给点不足，先提升等级解锁更多星球。',
      summaryText: '先把可达星球池拉开，再回来规划更稳的科研补给循环。',
    });
  }

  return Object.assign({}, focus, {
    reasonId: 'generic',
    blockedReason: '当前没有匹配这项研究方向的稳定补给线。',
    summaryText: '先推进市场或任务节奏，等补给条件稳定后会再出现科研建议。',
  });
}

function _getResearchBlockerCopySeed(blocker) {
  if (!blocker) return [];

  if (blocker.reasonId === 'level') {
    return [{ blockedReason: '需要达到 Lv.4 才能前往。' }];
  }

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
    return _buildResearchMarketAction(
      'cargo',
      '前往市场清货',
      '先卖掉一部分货物，腾出舱位后再回来规划科研补给。'
    );
  }

  if (blocker.reasonId === 'credits') {
    return _buildResearchMarketAction(
      'credits',
      '前往市场周转',
      '先做一笔回款或卖货，补足进货资金后再回来。'
    );
  }

  if (blocker.reasonId === 'level') {
    return _buildResearchMarketAction(
      'level',
      '去市场跑单升级',
      '先提升等级，解锁更多科研相关补给点。'
    );
  }

  return _buildResearchMarketAction(
    'generic',
    '前往市场看看',
    '先看看本地行情和库存，再回来等待更稳的科研补给线。'
  );
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

export function getResearchDispatchBlockerState(state, researchDispatchContext) {
  return _getResearchDispatchBlockerState(state, researchDispatchContext);
}

export function getResearchDispatchBlockerActions(state, blocker) {
  if (!blocker) return [];

  var actions = [];
  var primaryAction = _buildResearchPrimaryAction(blocker);
  if (primaryAction) actions.push(primaryAction);

  var fallbackQuest = getPreferredAvailableQuest(state) || (Quest.getAvailableQuests(state)[0] || null);
  if (!fallbackQuest) return actions;

  var sharedQuestActions = getQuestBlockerActions(_getResearchBlockerCopySeed(blocker), fallbackQuest, state);
  var sharedFallbackAction = sharedQuestActions.find(function (action) {
    return action.actionId === 'quest-focus';
  });

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

function _renderResearchDispatchBlocker(blocker, canResolveResearchBlocker, state) {
  if (!blocker) return '';

  var actions = getResearchDispatchBlockerActions(state, blocker);

  return (
    '<div class="research-route-card is-blocked">' +
      '<div class="research-route-head">' +
        '<div class="research-route-title">⛔ 暂不生成科研补给建议</div>' +
        '<div class="research-route-caption">' + blocker.sourceLabel + ' · ' + blocker.categoryLabel + '</div>' +
      '</div>' +
      '<div class="research-route-main">' + blocker.techName + ' 当前缺少可执行的补给条件，补足后会自动恢复科研补给建议。</div>' +
      '<div class="research-route-blocker-list">' +
        '<div class="research-route-blocker-item">' +
          '<div class="research-route-blocker-system">' + blocker.techName + ' · ' + blocker.categoryLabel + '</div>' +
          '<div class="research-route-blocker-reason">' + blocker.blockedReason + '</div>' +
        '</div>' +
      '</div>' +
      (canResolveResearchBlocker && actions.length > 0
        ? '<div class="research-route-actions is-blocked">' + actions.map(function (action) {
            var commandAction = normalizeCommandAction(action);
            return '<div class="research-route-action-item' + (action.variant === 'secondary' ? ' is-secondary' : '') + '">' +
              '<button class="research-route-blocker-btn command-action-btn' + (commandAction.variant === 'secondary' ? ' is-secondary' : '') + '" data-action-id="' + _escapeHtmlAttr(action.actionId || '') + '" data-reason-id="' + _escapeHtmlAttr(action.reasonId || '') + '" data-target-quest-id="' + _escapeHtmlAttr(action.targetQuestId || '') + '" data-target-quest-name="' + _escapeHtmlAttr(action.targetQuestName || '') + '" data-market-workspace-id="' + _escapeHtmlAttr(action.marketWorkspaceId || '') + '" data-market-subworkspace-id="' + _escapeHtmlAttr(action.marketSubworkspaceId || '') + '" data-market-focus-label="' + _escapeHtmlAttr(action.marketFocusLabel || '') + '" data-focus-tech-id="' + _escapeHtmlAttr(blocker.techId || '') + '" data-focus-tech-name="' + _escapeHtmlAttr(blocker.techName || '') + '"' + getCommandActionAttributes(commandAction, _escapeHtmlAttr) + '>' + renderCommandActionContent(commandAction, _escapeHtml) + '</button>' +
              '<span class="research-route-action-hint">' + _escapeHtml(action.hint || '') + '</span>' +
            '</div>';
          }).join('') + '</div>'
        : '') +
      '<div class="research-route-note is-blocked">' + blocker.summaryText + '</div>' +
    '</div>'
  );
}

/**
 * 渲染科技研究标签页
 * @param {object}   state
 * @param {Function} onStartResearch (techId) => void
 * @param {Function} onCancelQueuedResearch (techId) => void
 * @param {Function} onMoveQueuedResearchUp (techId) => void
 * @param {Function} onMoveQueuedResearchDown (techId) => void
 * @param {Function} onClearResearchQueue () => void
 * @param {object}   researchDispatchContext
 * @param {Function} onApplyResearchDispatch (recommendation) => void
 * @param {Function} onResolveResearchBlocker (action) => void
 */
export function render(state, onStartResearch, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue, researchDispatchContext, onApplyResearchDispatch, onResolveResearchBlocker) {
  _renderStatus();
  _renderOptions(state, onStartResearch, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue, researchDispatchContext, onApplyResearchDispatch, onResolveResearchBlocker);
  _renderCompleted(state);
}

function _renderStatus() {
  const container = document.getElementById('research-status');
  if (!container) return;
  container.innerHTML = '';
}

function _renderOptions(state, onStartResearch, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue, researchDispatchContext, onApplyResearchDispatch, onResolveResearchBlocker) {
  const container = document.getElementById('research-options');
  const researchRecommendation = AutoTrade.findResearchSupplyRoute(state, researchDispatchContext);
  const researchBlocker = !researchRecommendation
    ? getResearchDispatchBlockerState(state, researchDispatchContext)
    : null;

  let html = _renderResearchOverview(state, researchRecommendation, researchBlocker, !!onApplyResearchDispatch, !!onResolveResearchBlocker, state);
  const options = state.researchOptions || [];
  if (options.length === 0) {
    html += '<p class="research-hint">所有可用科技已研究完毕！🎉</p>';
  } else {
    const queueMode = !!state.currentResearch;
    const queueLen = (state.researchQueue || []).length;
    html += '<div class="research-label">' + (queueMode ? '可加入研究队列（当前排队 ' + queueLen + ' 项）' : '选择研究方向（三选一）') + '</div><div class="research-cards">';
    options.forEach(function (techId) {
      const tech = TECHNOLOGIES.find(function (t) { return t.id === techId; });
      const cat = TECH_CATEGORIES.find(function (c) { return c.id === tech.category; });
      const canAfford = state.credits >= tech.cost;

      html +=
        '<div class="research-card' + (canAfford ? '' : ' unaffordable') + '" data-tech="' + tech.id + '">' +
          '<div class="research-card-header" style="border-left: 3px solid ' + cat.color + '">' +
            '<span class="research-cat-badge" style="background:' + cat.color + '22;color:' + cat.color + '">' + cat.icon + ' ' + cat.name + '</span>' +
            '<span class="research-tier">T' + tech.tier + '</span>' +
          '</div>' +
          '<div class="research-card-icon">' + tech.icon + '</div>' +
          '<div class="research-card-name">' + tech.name + '</div>' +
          '<div class="research-card-desc">' + tech.description + '</div>' +
          '<div class="research-card-effect">✨ ' + tech.effectText + '</div>' +
          '<div class="research-card-footer">' +
            '<span class="research-cost">💰 ' + tech.cost + '</span>' +
            '<span class="research-time">⏱️ ' + tech.researchDays + ' 天</span>' +
          '</div>' +
          '<button class="btn-research">' + (queueMode ? '加入队列' : '开始研究') + '</button>' +
        '</div>';
    });
    html += '</div>';
  }

  container.innerHTML = html;
  _bindQueueActions(container, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue);
  _bindResearchActions(container, onStartResearch, onApplyResearchDispatch, researchRecommendation, onResolveResearchBlocker);
}

function _renderCompleted(state) {
  const container = document.getElementById('research-completed');
  const completed = state.researchedTechs || [];
  if (completed.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="research-label" style="margin-top:12px">已完成研究 (' + completed.length + '/' + TECHNOLOGIES.length + ')</div>';
  html += '<div class="completed-techs">';
  completed.forEach(function (techId) {
    const tech = TECHNOLOGIES.find(function (t) { return t.id === techId; });
    const cat = TECH_CATEGORIES.find(function (c) { return c.id === tech.category; });
    html += '<span class="completed-tech-badge" style="border-color:' + cat.color + '" title="' + tech.effectText + '">' + tech.icon + ' ' + tech.name + '</span>';
  });
  html += '</div>';
  container.innerHTML = html;
}

function _renderResearchOverview(state, researchRecommendation, researchBlocker, canApplyResearchDispatch, canResolveResearchBlocker) {
  const dispatchRecommendationHtml = researchRecommendation
    ? _renderResearchDispatchRecommendation(researchRecommendation, canApplyResearchDispatch)
    : _renderResearchDispatchBlocker(researchBlocker, canResolveResearchBlocker, state);

  if (!state.currentResearch) {
    const queueWhenIdle = state.researchQueue || [];
    if (queueWhenIdle.length === 0) {
      return dispatchRecommendationHtml + '<p class="research-hint">🔬 选择一项科技开始研究</p>';
    }
    return dispatchRecommendationHtml + _renderQueueHtml(queueWhenIdle, '🗂️ 研究队列（待启动）');
  }

  const tech = TECHNOLOGIES.find(function (t) { return t.id === state.currentResearch.techId; });
  const cat = TECH_CATEGORIES.find(function (c) { return c.id === tech.category; });
  const totalDays = tech.researchDays;
  const progress = ((totalDays - state.currentResearch.daysLeft) / totalDays * 100).toFixed(0);

  let html =
    '<div class="research-active">' +
      '<div class="research-active-header">' +
        '<span class="research-cat-badge" style="background:' + cat.color + '22;color:' + cat.color + '">' + cat.icon + ' ' + cat.name + '</span>' +
        '<span class="research-days">剩余 ' + state.currentResearch.daysLeft + ' 天</span>' +
      '</div>' +
      '<div class="research-active-name">' + tech.icon + ' ' + tech.name + '</div>' +
      '<div class="mini-bar-track" style="margin-top:6px">' +
        '<div class="mini-bar-fill research-fill" style="width:' + progress + '%"></div>' +
      '</div>' +
      '<div class="research-effect-text">' + tech.effectText + '</div>' +
    '</div>';

  html += dispatchRecommendationHtml;

  const queue = state.researchQueue || [];
  if (queue.length > 0) {
    html += _renderQueueHtml(queue, '🗂️ 研究队列（' + queue.length + '）');
  }

  return html;
}

function _renderResearchDispatchRecommendation(recommendation, canApplyResearchDispatch) {
  if (!recommendation) return '';

  const riskLabel = recommendation.inspectionRisk && recommendation.inspectionRisk.protectedByBlackMarket
    ? '0%（辛迪加庇护）'
    : ((recommendation.inspectionRisk && recommendation.inspectionRisk.checkChancePercent) || 0) + '%';
  const roleLabel = recommendation.dispatchProfile && recommendation.dispatchProfile.roleLabel
    ? recommendation.dispatchProfile.roleLabel
    : '标准派遣';
  const surveyIntelNote = recommendation.surveyIntelSummary
    ? '<div class="research-route-note">' + _escapeHtml(recommendation.surveyIntelSummary) + '</div>'
    : '';

  return (
    '<div class="research-route-card">' +
      '<div class="research-route-head">' +
        '<div class="research-route-title">🛰️ 科研补给建议</div>' +
        '<div class="research-route-caption">' + recommendation.focusTypeLabel + ' · ' + recommendation.focusCategoryLabel + '</div>' +
      '</div>' +
      '<div class="research-route-main">' + recommendation.focusTechName + ' · ' + recommendation.buySystemName + ' → ' + recommendation.sellSystemName + ' · ' + recommendation.goodEmoji + ' ' + recommendation.goodName + '</div>' +
      '<div class="research-route-meta">' +
        '<span>预计利润 ' + Math.floor(recommendation.profit) + '</span>' +
        '<span>装载 ' + recommendation.quantity + '</span>' +
        '<span>' + (recommendation.routeModeLabel || '星系内中转') + '</span>' +
        '<span>查获 ' + riskLabel + '</span>' +
      '</div>' +
      '<div class="research-route-note">' + roleLabel + ' · ' + recommendation.strategySummary + (recommendation.tradeThemeSummary ? ' · ' + recommendation.tradeThemeSummary : '') + '</div>' +
      surveyIntelNote +
      (canApplyResearchDispatch
        ? '<div class="research-route-actions">' +
            '<button class="research-route-apply-btn command-action-btn" data-command-surface="fleet" data-command-intent="科研补给" data-command-verb="带入机库派遣">' +
              renderCommandActionContent({
                actionId: 'dispatch',
                label: '带入机库派遣',
                commandSurface: 'fleet',
                commandIntent: '科研补给',
              }, _escapeHtml) +
            '</button>' +
            '<span class="research-route-action-hint">切到机库并预填这条补给线</span>' +
          '</div>'
        : '') +
    '</div>'
  );
}

function _renderQueueHtml(queue, title) {
  let html = '<div class="research-queue">' +
    '<div class="research-queue-head">' +
      '<div class="research-queue-title">' + title + '</div>' +
      '<button class="btn-queue-action queue-clear-btn">清空队列</button>' +
    '</div>';
  queue.forEach(function (item, idx) {
    const queueTech = TECHNOLOGIES.find(function (t) { return t.id === item.techId; });
    if (!queueTech) return;
    const isLast = idx === queue.length - 1;
    html += '<div class="research-queue-item">' +
      '<span class="queue-index">#' + (idx + 1) + '</span>' +
      '<span class="queue-name">' + queueTech.icon + ' ' + queueTech.name + '</span>' +
      '<span class="queue-days">' + item.daysLeft + ' 天</span>' +
      '<button class="btn-queue-action queue-up-btn' + (idx === 0 ? ' disabled' : '') + '" data-tech="' + item.techId + '">上移</button>' +
      '<button class="btn-queue-action queue-down-btn' + (isLast ? ' disabled' : '') + '" data-tech="' + item.techId + '">下移</button>' +
      '<button class="btn-queue-action queue-cancel-btn" data-tech="' + item.techId + '">取消</button>' +
      '</div>';
  });
  html += '</div>';
  return html;
}

function _bindQueueActions(container, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue) {
  if (!container) return;

  container.querySelectorAll('.queue-cancel-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (onCancelQueuedResearch) onCancelQueuedResearch(btn.dataset.tech);
    });
  });

  container.querySelectorAll('.queue-up-btn:not(.disabled)').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (onMoveQueuedResearchUp) onMoveQueuedResearchUp(btn.dataset.tech);
    });
  });

  container.querySelectorAll('.queue-down-btn:not(.disabled)').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (onMoveQueuedResearchDown) onMoveQueuedResearchDown(btn.dataset.tech);
    });
  });

  container.querySelectorAll('.queue-clear-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!onClearResearchQueue) return;
      if (confirm('确定要清空整个研究队列吗？未开始项目将返还积分。')) {
        onClearResearchQueue();
      }
    });
  });
}

function _bindResearchActions(container, onStartResearch, onApplyResearchDispatch, researchRecommendation, onResolveResearchBlocker) {
  container.querySelectorAll('.btn-research').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const card = btn.closest('.research-card');
      onStartResearch(card.dataset.tech);
    });
  });

  var applyBtn = container.querySelector('.research-route-apply-btn');
  if (applyBtn && typeof onApplyResearchDispatch === 'function' && researchRecommendation) {
    applyBtn.addEventListener('click', function () {
      onApplyResearchDispatch(researchRecommendation);
    });
  }

  container.querySelectorAll('.research-route-blocker-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (typeof onResolveResearchBlocker !== 'function') return;
      onResolveResearchBlocker({
        actionId: btn.dataset.actionId,
        reasonId: btn.dataset.reasonId,
        targetQuestId: btn.dataset.targetQuestId,
        targetQuestName: btn.dataset.targetQuestName,
        marketWorkspaceId: btn.dataset.marketWorkspaceId,
        marketSubworkspaceId: btn.dataset.marketSubworkspaceId,
        marketFocusLabel: btn.dataset.marketFocusLabel,
        focusTechId: btn.dataset.focusTechId,
        focusTechName: btn.dataset.focusTechName,
      });
    });
  });
}
