// js/ui/QuestRoutePresenter.js — 任务路线、派遣建议与阻塞恢复纯投影

import { GOODS } from '../data/goods.js';
import { findSystem } from '../data/systems.js';
import { buildMarketFocusAction, MARKET_FOCUS_PRESET_IDS } from './MarketFocus.js';
import {
  getCommandActionAttributes,
  normalizeCommandAction,
  renderCommandActionContent,
} from './CommandAction.js';

const QUEST_BLOCKER_MARKET_PRESETS = Object.freeze({
  fuel: MARKET_FOCUS_PRESET_IDS.SPOT_TRADE,
  level: MARKET_FOCUS_PRESET_IDS.SPOT_TRADE,
  general: MARKET_FOCUS_PRESET_IDS.SPOT_INTEL,
});

const _goodNameById = GOODS.reduce(function (acc, good) {
  acc[good.id] = good.name;
  return acc;
}, Object.create(null));

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getQuestSystemName(systemId) {
  if (!systemId) return '未知地点';
  var system = findSystem(systemId);
  return system ? system.name : systemId;
}

export function getQuestGoodName(goodId) {
  if (!goodId) return '货物';
  return _goodNameById[goodId] || goodId;
}

export function getQuestTargetSystems(quest) {
  if (!quest || !Array.isArray(quest.objectives)) return [];
  var seen = Object.create(null);
  var result = [];
  quest.objectives.forEach(function (objective) {
    if (!objective.targetSystem || seen[objective.targetSystem]) return;
    seen[objective.targetSystem] = true;
    var system = findSystem(objective.targetSystem);
    if (system) result.push(system);
  });
  return result;
}

export function renderQuestTargetSystems(targets, currentSystemId) {
  if (!Array.isArray(targets) || targets.length === 0) return '';
  var chips = targets.map(function (system) {
    return '<span class="quest-target-chip' + (system.id === currentSystemId ? ' is-current' : '') + '">' +
      '<span class="quest-target-dot" style="background:' + _escapeHtml(system.color) + '"></span>' +
      _escapeHtml(system.name) +
      '<span class="quest-target-type">' + _escapeHtml(system.typeLabel) + '</span>' +
      '</span>';
  }).join('');
  return '<div class="quest-target-row">📍 目标：' + chips + '</div>';
}

export function questHasCurrentSystemTarget(quest, state) {
  if (!quest || !state || !Array.isArray(quest.objectives)) return false;
  return quest.objectives.some(function (objective) {
    return objective.targetSystem && objective.targetSystem === state.currentSystem;
  });
}

export function getQuestActionContext(quest, state) {
  var targets = getQuestTargetSystems(quest);
  if (targets.length === 0) {
    return {
      label: '现在就能做',
      tone: 'ready',
      detail: '无需指定目的地，接取后在现有贸易或航行中就会开始累计进度。',
    };
  }
  if (questHasCurrentSystemTarget(quest, state)) {
    return {
      label: '当前星球可推进',
      tone: 'current',
      detail: '当前停靠星球就是目标地点，接取后可以立刻处理对应目标。',
    };
  }
  if (targets.length === 1) {
    return {
      label: '下一站前往 ' + targets[0].name,
      tone: 'travel',
      detail: '接取后建议优先前往 ' + targets[0].name + '，避免路线来回折返。',
    };
  }
  return {
    label: '多站路线',
    tone: 'travel',
    detail: '任务涉及多个目标地点，先接取再按目标星球规划顺路航线会更省成本。',
  };
}

export function renderQuestRoutePreview(routePreview, options) {
  if (!routePreview || !Array.isArray(routePreview.items) || routePreview.items.length === 0) return '';
  var opts = options || {};
  var compact = !!opts.compact;
  var title = opts.title || '路程与燃料';
  var caption = opts.caption || '从当前位置计算';
  var items = routePreview.items.slice(0, compact ? 2 : routePreview.items.length);
  return '<div class="quest-route-preview' + (compact ? ' is-compact' : '') + '">' +
    '<div class="quest-route-preview-head">' +
      '<span class="quest-route-preview-title">' + _escapeHtml(title) + '</span>' +
      '<span class="quest-route-preview-caption">' + _escapeHtml(caption) + '</span>' +
    '</div>' +
    '<div class="quest-route-preview-list">' + items.map(function (item) {
      var tags = [
        item.isPrimary ? '<span class="quest-route-tag quest-route-tag-primary">当前步骤</span>' : '',
        item.isCurrentSystem ? '<span class="quest-route-tag quest-route-tag-current">当前停靠</span>' : '',
        item.hasSecretRoute ? '<span class="quest-route-tag quest-route-tag-secret">隐藏航线 -' + Number(item.discountPercent || 0) + '%</span>' : '',
      ].filter(Boolean).join('');
      return '<div class="quest-route-stop' +
        (item.isPrimary ? ' is-primary' : '') +
        (item.blockedReason ? ' is-blocked' : '') +
        (item.isCurrentSystem ? ' is-current' : '') + '">' +
        '<div class="quest-route-stop-head"><div class="quest-route-stop-main">' +
          '<div class="quest-route-stop-name-row">' +
            '<span class="quest-route-stop-name">' + _escapeHtml(item.systemName) + '</span>' +
            '<span class="quest-route-stop-purpose">' + _escapeHtml(item.purposeLabel) + '</span>' +
          '</div>' +
          '<div class="quest-route-stop-galaxy">' + _escapeHtml(item.galaxyName) + '</div>' +
        '</div><div class="quest-route-stop-tags">' + tags + '</div></div>' +
        '<div class="quest-route-metrics">' +
          '<span>' + _escapeHtml(item.routeModeLabel) + '</span>' +
          '<span>' + _escapeHtml(item.distanceLabel) + ' ' + _escapeHtml(item.distanceText) + '</span>' +
          '<span>' + Number(item.fuelCost || 0) + ' 燃料</span>' +
          '<span>' + Number(item.etaDays || 0) + ' 天</span>' +
        '</div>' +
        (item.note ? '<div class="quest-route-note' + (item.blockedReason ? ' is-warning' : '') + '">' + _escapeHtml(item.note) + '</div>' : '') +
      '</div>';
    }).join('') + '</div>' +
    (routePreview.summaryText ? '<div class="quest-route-summary' + (compact ? ' is-compact' : '') + '">' + _escapeHtml(routePreview.summaryText) + '</div>' : '') +
  '</div>';
}

export function renderQuestDispatchRecommendation(recommendation, canApplyQuestDispatch) {
  if (!recommendation) return '';
  var riskLabel = recommendation.inspectionRisk && recommendation.inspectionRisk.protectedByBlackMarket
    ? '0%（辛迪加庇护）'
    : ((recommendation.inspectionRisk && recommendation.inspectionRisk.checkChancePercent) || 0) + '%';
  var riskLevelLabel = recommendation.riskLevel === 'high' ? '高' : recommendation.riskLevel === 'medium' ? '中' : '低';
  var roleLabel = recommendation.dispatchProfile && recommendation.dispatchProfile.roleLabel
    ? recommendation.dispatchProfile.roleLabel
    : '默认跑商';
  return '<div class="quest-dispatch-card">' +
    '<div class="quest-dispatch-head">' +
      '<div class="quest-dispatch-title">任务路线建议</div>' +
      '<div class="quest-dispatch-caption">当前优先目标 · ' + _escapeHtml(recommendation.questName) + '</div>' +
    '</div>' +
    '<div class="quest-dispatch-main">' + _escapeHtml(getQuestSystemName(recommendation.buySystemId)) + ' → ' + _escapeHtml(getQuestSystemName(recommendation.sellSystemId)) + ' · ' + _escapeHtml(getQuestGoodName(recommendation.goodId)) + '</div>' +
    '<div class="quest-dispatch-meta">' +
      '<span>预计燃料 ' + Math.max(0, recommendation.estimatedFuelCost || 0) + '</span>' +
      (Number.isFinite(recommendation.estimatedTradeProfit)
        ? '<span>预计贸易收益 ' + (recommendation.estimatedTradeProfit >= 0 ? '+' : '') + Math.floor(recommendation.estimatedTradeProfit) + '</span>'
        : '') +
      '<span>' + _escapeHtml(recommendation.routeModeLabel || '星系内中转') + '</span>' +
      '<span>风险 ' + riskLevelLabel + '</span><span>查获 ' + riskLabel + '</span>' +
    '</div>' +
    '<div class="quest-dispatch-note">' + _escapeHtml(roleLabel) + ' · ' + _escapeHtml(recommendation.strategySummary) + (recommendation.tradeThemeSummary ? ' · ' + _escapeHtml(recommendation.tradeThemeSummary) : '') + '</div>' +
    (canApplyQuestDispatch
      ? '<div class="quest-dispatch-actions"><button type="button" class="quest-dispatch-apply-btn command-action-btn" data-command-surface="fleet" data-command-intent="任务路线" data-command-verb="带入机库">' +
          renderCommandActionContent({ actionId: 'dispatch', label: '带入机库', commandSurface: 'fleet', commandIntent: '任务路线' }, _escapeHtml) +
        '</button><span class="quest-dispatch-action-hint">切到机库并预填当前任务路线</span></div>'
      : '') +
  '</div>';
}

function _collectQuestDispatchBlockers(routePreview) {
  if (!routePreview || !Array.isArray(routePreview.items)) return [];
  var seen = Object.create(null);
  return routePreview.items.filter(function (item) {
    return item && !item.isCurrentSystem && item.blockedReason;
  }).map(function (item) {
    var key = item.systemId + '::' + item.blockedReason;
    if (seen[key]) return null;
    seen[key] = true;
    return { systemName: item.systemName, purposeLabel: item.purposeLabel, blockedReason: item.blockedReason };
  }).filter(Boolean);
}

function _getQuestBlockerReasonId(blockers) {
  if (!Array.isArray(blockers) || blockers.length === 0) return 'general';
  if (blockers.some(function (blocker) { return blocker.blockedReason && blocker.blockedReason.includes('超空间跃迁引擎'); })) return 'hyperspace';
  if (blockers.some(function (blocker) { return blocker.blockedReason && blocker.blockedReason.includes('燃料不足'); })) return 'fuel';
  if (blockers.some(function (blocker) { return blocker.blockedReason && blocker.blockedReason.includes('需要达到 Lv.'); })) return 'level';
  return 'general';
}

function _getQuestFallbackCopy(fallbackQuest, state, primaryReasonId) {
  var questName = fallbackQuest.name;
  var context = getQuestActionContext(fallbackQuest, state || {});
  var primaryObjective = fallbackQuest.objectives && fallbackQuest.objectives[0];
  var targets = getQuestTargetSystems(fallbackQuest);
  var hasSingleTarget = targets.length === 1;
  var isTradeLine = primaryObjective && ['deliver', 'buy_at', 'sell_at', 'trade_good', 'sell_in_faction'].includes(primaryObjective.type);
  var staysInCurrentGalaxy = !state || !state.currentGalaxy || targets.length === 0 || targets.every(function (system) {
    return system.galaxyId === state.currentGalaxy;
  });
  if (primaryReasonId === 'level') {
    return {
      label: '先补等级',
      hint: (context.tone === 'current' || context.tone === 'ready')
        ? '「' + questName + '」当前就能推进，先补等级和基础收益，再回来冲更高门槛。'
        : hasSingleTarget && isTradeLine
          ? '「' + questName + '」门槛更低，先跑这条短线把等级和现金流抬起来。'
          : '已为你找到「' + questName + '」，先用这条简单任务提升等级，再回来继续。',
    };
  }
  if (context.tone === 'current' || context.tone === 'ready') {
    return {
      label: '先做本地任务',
      hint: primaryReasonId === 'fuel'
        ? '「' + questName + '」不用额外跑图，先做一单回点现金，再回来补燃料。'
        : primaryReasonId === 'hyperspace'
          ? '「' + questName + '」不需要跨星系，先把银河内进度往前推一格。'
          : '已为你找到「' + questName + '」，当前就能开始推进。',
    };
  }
  if (hasSingleTarget && isTradeLine) {
    return {
      label: '先跑短线补给',
      hint: primaryReasonId === 'fuel'
        ? '「' + questName + '」航程更短，先跑这条线回补燃料和现金流。'
        : primaryReasonId === 'hyperspace'
          ? '「' + questName + '」仍在当前银河内，先跑这条短线，等跃迁科技完成。'
          : '已为你找到「' + questName + '」，先用这条短线把节奏稳住。',
    };
  }
  if (primaryReasonId === 'hyperspace' && staysInCurrentGalaxy) {
    return { label: '先做银河内任务', hint: '「' + questName + '」不需要跨星系，先推进这条银河内任务，等跃迁科技补齐。' };
  }
  if (hasSingleTarget) {
    return {
      label: '先接近线任务',
      hint: primaryReasonId === 'fuel'
        ? '「' + questName + '」航程更近，先跑这条近线把燃料和节奏稳住。'
        : '已为你找到「' + questName + '」，先推进这条附近任务。',
    };
  }
  return {
    label: primaryReasonId === 'fuel' ? '先做近程任务' : '先看推荐任务',
    hint: primaryReasonId === 'hyperspace'
      ? '已为你找到「' + questName + '」，先推进当前星域内的可接任务。'
      : '已为你找到「' + questName + '」，先用这条可接任务继续成长。',
  };
}

function _buildQuestFallbackAction(fallbackQuest, state, primaryReasonId) {
  if (!fallbackQuest || !fallbackQuest.id) return null;
  var copy = _getQuestFallbackCopy(fallbackQuest, state, primaryReasonId);
  return {
    actionId: 'quest-focus',
    reasonId: 'fallback',
    label: copy.label,
    hint: copy.hint,
    commandSurface: 'quest',
    commandIntent: '替代任务',
    commandVerb: copy.label,
    targetQuestId: fallbackQuest.id,
    targetQuestName: fallbackQuest.name,
    variant: 'secondary',
  };
}

export function getQuestBlockerActions(blockers, fallbackQuest, state) {
  if (!Array.isArray(blockers) || blockers.length === 0) return [];
  var actions = [];
  var primaryReasonId = _getQuestBlockerReasonId(blockers);
  if (primaryReasonId === 'hyperspace') {
    actions.push({
      actionId: 'research', reasonId: 'hyperspace', label: '前往科技页研究',
      hint: '优先补出超空间跃迁引擎，再回来规划这条跨区航线。', variant: 'primary',
      commandSurface: 'research', commandIntent: '跃迁科技', commandVerb: '前往科技页研究',
    });
  } else if (primaryReasonId === 'fuel') {
    actions.push(buildMarketFocusAction('fuel', '打开市场补燃料', '会进入市场中心的交易页，先补充燃料或调整货舱，再回来恢复自动跑商建议。', QUEST_BLOCKER_MARKET_PRESETS.fuel, 'primary'));
  } else if (primaryReasonId === 'level') {
    actions.push(buildMarketFocusAction('level', '打开市场跑单', '会进入市场中心的交易页，先做几笔交易把等级提上来再接这条线。', QUEST_BLOCKER_MARKET_PRESETS.level, 'primary'));
  }
  var fallbackAction = _buildQuestFallbackAction(fallbackQuest, state, primaryReasonId);
  if (fallbackAction) actions.push(fallbackAction);
  return actions;
}

function _renderQuestBlockerActions(actions, quest) {
  if (!Array.isArray(actions) || actions.length === 0) return '';
  return '<div class="quest-dispatch-actions is-blocked">' + actions.map(function (action) {
    var commandAction = normalizeCommandAction(action);
    var buttonClass = 'quest-dispatch-blocker-btn command-action-btn' + (commandAction.variant === 'secondary' ? ' is-secondary' : '');
    return '<div class="quest-dispatch-action-item' + (action.variant === 'secondary' ? ' is-secondary' : '') + '">' +
      '<button type="button" class="' + buttonClass + '" data-action-id="' + _escapeHtml(action.actionId || '') + '" data-reason-id="' + _escapeHtml(action.reasonId || '') + '" data-quest-id="' + _escapeHtml(quest.id || '') + '" data-quest-name="' + _escapeHtml(quest.name || '') + '" data-target-quest-id="' + _escapeHtml(action.targetQuestId || '') + '" data-target-quest-name="' + _escapeHtml(action.targetQuestName || '') + '" data-market-workspace-id="' + _escapeHtml(action.marketWorkspaceId || '') + '" data-market-subworkspace-id="' + _escapeHtml(action.marketSubworkspaceId || '') + '" data-market-focus-label="' + _escapeHtml(action.marketFocusLabel || '') + '"' + getCommandActionAttributes(commandAction, _escapeHtml) + '>' + renderCommandActionContent(commandAction, _escapeHtml) + '</button>' +
      '<span class="quest-dispatch-action-hint">' + _escapeHtml(action.hint || '') + '</span></div>';
  }).join('') + '</div>';
}

export function renderQuestDispatchBlocker(quest, routePreview, canResolveQuestBlocker, fallbackQuest, state) {
  var blockers = _collectQuestDispatchBlockers(routePreview);
  if (blockers.length === 0) return '';
  var actions = getQuestBlockerActions(blockers, fallbackQuest, state);
  return '<div class="quest-dispatch-card is-blocked">' +
    '<div class="quest-dispatch-head"><div class="quest-dispatch-title">⛔ 暂无可用路线建议</div><div class="quest-dispatch-caption">当前目标 · ' + _escapeHtml(quest.name) + '</div></div>' +
    '<div class="quest-dispatch-main">当前航点还有未满足的条件，补足后会自动恢复机库路线建议。</div>' +
    '<div class="quest-dispatch-blocker-list">' + blockers.map(function (blocker) {
      return '<div class="quest-dispatch-blocker-item"><div class="quest-dispatch-blocker-system">' + _escapeHtml(blocker.systemName) + ' · ' + _escapeHtml(blocker.purposeLabel) + '</div><div class="quest-dispatch-blocker-reason">' + _escapeHtml(blocker.blockedReason) + '</div></div>';
    }).join('') + '</div>' +
    (canResolveQuestBlocker && actions.length ? _renderQuestBlockerActions(actions, quest) : '') +
    (routePreview && routePreview.summaryText ? '<div class="quest-dispatch-note is-blocked">' + _escapeHtml(routePreview.summaryText) + '</div>' : '') +
  '</div>';
}
