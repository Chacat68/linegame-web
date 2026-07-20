// js/ui/QuestUI.js — 任务面板 UI（支持进度阶段与解锁条件）
// 依赖：systems/quest/QuestSystem.js, data/quests.js
// 导出：render

import { QUEST_TYPES } from '../data/quests.js';
import { GOODS } from '../data/goods.js';
import { findSystem } from '../data/systems.js';
import { buildMarketFocusAction, MARKET_FOCUS_PRESET_IDS } from './MarketFocus.js';
import { getCommandActionAttributes, normalizeCommandAction, renderCommandActionContent } from './CommandAction.js';
import * as AutoTrade  from '../systems/trade/AutoTradeSystem.js';
import * as Quest      from '../systems/quest/QuestSystem.js';
import * as ActionConfirmUI from './ActionConfirmUI.js';

const _goodNameById = GOODS.reduce(function (acc, good) {
  acc[good.id] = good.name;
  return acc;
}, Object.create(null));

let _selectedAvailableQuestId = null;

const QUEST_BLOCKER_MARKET_PRESETS = {
  fuel: MARKET_FOCUS_PRESET_IDS.SPOT_TRADE,
  level: MARKET_FOCUS_PRESET_IDS.SPOT_TRADE,
  general: MARKET_FOCUS_PRESET_IDS.SPOT_INTEL,
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

// ---------------------------------------------------------------------------
// 提取任务的目标星球列表（去重）
// ---------------------------------------------------------------------------
function _questTargetSystems(quest) {
  if (!quest || !quest.objectives) return [];
  var seen = Object.create(null);
  var result = [];
  quest.objectives.forEach(function (obj) {
    if (obj.targetSystem && !seen[obj.targetSystem]) {
      seen[obj.targetSystem] = true;
      var sys = findSystem(obj.targetSystem);
      if (sys) {
        result.push(sys);
      }
    }
  });
  return result;
}

function _renderTargetSystems(targets, currentSystemId) {
  if (targets.length === 0) return '';
  var chips = targets.map(function (sys) {
    return '<span class="quest-target-chip' + (sys.id === currentSystemId ? ' is-current' : '') + '">' +
      '<span class="quest-target-dot" style="background:' + sys.color + '"></span>' +
      sys.name +
      '<span class="quest-target-type">' + sys.typeLabel + '</span>' +
      '</span>';
  }).join('');
  return '<div class="quest-target-row">📍 目标：' + chips + '</div>';
}

function _questHasCurrentSystemTarget(quest, state) {
  if (!quest || !state || !quest.objectives) return false;
  return quest.objectives.some(function (obj) {
    return obj.targetSystem && obj.targetSystem === state.currentSystem;
  });
}

function _getQuestActionContext(quest, state) {
  var targets = _questTargetSystems(quest);
  if (targets.length === 0) {
    return {
      label: '现在就能做',
      tone: 'ready',
      detail: '无需指定目的地，接取后在现有贸易或航行中就会开始累计进度。',
    };
  }

  if (_questHasCurrentSystemTarget(quest, state)) {
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

function _getAvailableQuestPriority(quest, state, recommendedIds) {
  var score = 0;
  if (recommendedIds.includes(quest.id)) score += 100;

  var context = _getQuestActionContext(quest, state);
  if (context.tone === 'current') score += 60;
  else if (context.tone === 'ready') score += 40;

  if ((quest.timeLimit || 0) > 0) score += 5;
  return score;
}

function _sortAvailableQuests(state, available, recommendedIds) {
  return available.slice().sort(function (left, right) {
    var scoreDiff = _getAvailableQuestPriority(right, state, recommendedIds) - _getAvailableQuestPriority(left, state, recommendedIds);
    if (scoreDiff !== 0) return scoreDiff;
    return (left.name || '').localeCompare((right.name || ''), 'zh-CN');
  });
}

function _pickSelectedAvailableQuest(state, available, recommendedIds) {
  var sorted = _sortAvailableQuests(state, available, recommendedIds);
  if (sorted.length === 0) {
    _selectedAvailableQuestId = null;
    return { sorted: sorted, selected: null };
  }

  var selected = sorted.find(function (quest) {
    return quest.id === _selectedAvailableQuestId;
  }) || sorted[0];

  _selectedAvailableQuestId = selected.id;
  return { sorted: sorted, selected: selected };
}

export function getPreferredAvailableQuest(state) {
  var recommendedIds = Quest.getStarterRecommendations(state, 3).map(function (quest) {
    return quest.id;
  });
  return _sortAvailableQuests(state, Quest.getAvailableQuests(state), recommendedIds)[0] || null;
}

export function setSelectedAvailableQuest(questId) {
  _selectedAvailableQuestId = questId || null;
}

function _focusQuestFallbackAction(action, state, onAccept, onAbandon, questDispatchContext, onApplyQuestDispatch, onResolveQuestBlocker) {
  if (!action || !action.targetQuestId) return;

  _selectedAvailableQuestId = action.targetQuestId;
  render(state, onAccept, onAbandon, questDispatchContext, onApplyQuestDispatch, onResolveQuestBlocker);

  var container = document.getElementById('quest-list');
  if (!container) return;

  var acceptHub = container.querySelector('[data-quest-accept-hub]');
  if (acceptHub && typeof acceptHub.scrollIntoView === 'function') {
    acceptHub.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  var selectedCard = container.querySelector('[data-quest-select-id="' + action.targetQuestId + '"]');
  if (!selectedCard) return;

  if (typeof selectedCard.scrollIntoView === 'function') {
    selectedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  if (typeof selectedCard.focus === 'function') {
    selectedCard.focus();
  }
}

function _objectivePlanText(obj) {
  if (!obj) return '查看任务详情';

  var base = _objectiveText(obj);
  var amount = obj.amount || 1;

  switch (obj.type) {
    case 'deliver':
    case 'buy_at':
    case 'sell_at':
    case 'trade_good':
    case 'sell_in_faction':
      return base + ' · ' + amount + ' 单位';
    case 'earn_profit':
      return base + ' · ' + amount.toLocaleString() + ' 积分';
    case 'trade_count':
    case 'faction_trade':
    case 'galaxy_jump':
      return base + ' · ' + amount + ' 次';
    case 'visit_systems':
      return base + ' · ' + amount + ' 个星球';
    case 'visit_system':
      return amount > 1 ? (base + ' · ' + amount + ' 次') : base;
    case 'faction_relation':
      return base + ' · 关系值 ' + amount;
    case 'survive_days':
      return base + ' · ' + amount + ' 天';
    case 'research_count':
      return base + ' · ' + amount + ' 项';
    case 'explore_pois':
      return base + ' · ' + amount + ' 个探索点';
    case 'fleet_size':
      return base + ' · ' + amount + ' 艘';
    case 'crew_count':
      return base + ' · ' + amount + ' 名';
    case 'dispatch_routes':
    case 'finance_actions':
      return base + ' · ' + amount + ' 次';
    case 'trade_stations':
      return base + ' · ' + amount + ' 座';
    case 'visited_galaxies':
      return base + ' · ' + amount + ' 个星系';
    default:
      return amount > 1 ? (base + ' · x' + amount) : base;
  }
}

function _renderQuestBriefObjectives(quest) {
  if (!quest || !quest.objectives || quest.objectives.length === 0) return '';

  return '<div class="quest-brief-objectives">' + quest.objectives.map(function (obj, index) {
    return '<div class="quest-brief-objective-row">' +
      '<span class="quest-brief-objective-index">' + String(index + 1).padStart(2, '0') + '</span>' +
      '<span class="quest-brief-objective-text">' + _objectivePlanText(obj) + '</span>' +
      '</div>';
  }).join('') + '</div>';
}

function _renderQuestRoutePreview(routePreview, options) {
  if (!routePreview || !routePreview.items || routePreview.items.length === 0) return '';

  options = options || {};
  var compact = !!options.compact;
  var title = options.title || '路程与燃料';
  var caption = options.caption || '从当前位置计算';
  var items = routePreview.items.slice(0, compact ? 2 : routePreview.items.length);
  var containerClass = 'quest-route-preview' + (compact ? ' is-compact' : '');

  return '<div class="' + containerClass + '">' +
    '<div class="quest-route-preview-head">' +
      '<span class="quest-route-preview-title">' + title + '</span>' +
      '<span class="quest-route-preview-caption">' + caption + '</span>' +
    '</div>' +
    '<div class="quest-route-preview-list">' + items.map(function (item) {
      var tags = [
        item.isPrimary ? '<span class="quest-route-tag quest-route-tag-primary">当前步骤</span>' : '',
        item.isCurrentSystem ? '<span class="quest-route-tag quest-route-tag-current">当前停靠</span>' : '',
        item.hasSecretRoute ? '<span class="quest-route-tag quest-route-tag-secret">隐藏航线 -' + item.discountPercent + '%</span>' : '',
      ].filter(Boolean).join('');

      return '<div class="quest-route-stop' +
        (item.isPrimary ? ' is-primary' : '') +
        (item.blockedReason ? ' is-blocked' : '') +
        (item.isCurrentSystem ? ' is-current' : '') +
      '">' +
        '<div class="quest-route-stop-head">' +
          '<div class="quest-route-stop-main">' +
            '<div class="quest-route-stop-name-row">' +
              '<span class="quest-route-stop-name">' + item.systemName + '</span>' +
              '<span class="quest-route-stop-purpose">' + item.purposeLabel + '</span>' +
            '</div>' +
            '<div class="quest-route-stop-galaxy">' + item.galaxyName + '</div>' +
          '</div>' +
          '<div class="quest-route-stop-tags">' + tags + '</div>' +
        '</div>' +
        '<div class="quest-route-metrics">' +
          '<span>' + item.routeModeLabel + '</span>' +
          '<span>' + item.distanceLabel + ' ' + item.distanceText + '</span>' +
          '<span>' + item.fuelCost + ' 燃料</span>' +
          '<span>' + item.etaDays + ' 天</span>' +
        '</div>' +
        (item.note
          ? '<div class="quest-route-note' + (item.blockedReason ? ' is-warning' : '') + '">' + item.note + '</div>'
          : '') +
      '</div>';
    }).join('') + '</div>' +
    (routePreview.summaryText ? '<div class="quest-route-summary' + (compact ? ' is-compact' : '') + '">' + routePreview.summaryText + '</div>' : '') +
  '</div>';
}

function _renderQuestDispatchRecommendation(recommendation, canApplyQuestDispatch) {
  if (!recommendation) return '';

  var riskLabel = recommendation.inspectionRisk && recommendation.inspectionRisk.protectedByBlackMarket
    ? '0%（辛迪加庇护）'
    : ((recommendation.inspectionRisk && recommendation.inspectionRisk.checkChancePercent) || 0) + '%';
  var riskLevelLabel = recommendation.riskLevel === 'high'
    ? '高'
    : recommendation.riskLevel === 'medium'
      ? '中'
      : '低';
  var roleLabel = recommendation.dispatchProfile && recommendation.dispatchProfile.roleLabel
    ? recommendation.dispatchProfile.roleLabel
    : '默认跑商';

  return '<div class="quest-dispatch-card">' +
    '<div class="quest-dispatch-head">' +
      '<div class="quest-dispatch-title">📡 任务路线建议</div>' +
      '<div class="quest-dispatch-caption">当前优先目标 · ' + recommendation.questName + '</div>' +
    '</div>' +
    '<div class="quest-dispatch-main">' + _systemName(recommendation.buySystemId) + ' → ' + _systemName(recommendation.sellSystemId) + ' · ' + _goodName(recommendation.goodId) + '</div>' +
    '<div class="quest-dispatch-meta">' +
      '<span>预计燃料 ' + Math.max(0, recommendation.estimatedFuelCost || 0) + '</span>' +
      (Number.isFinite(recommendation.estimatedTradeProfit)
        ? '<span>预计贸易收益 ' + (recommendation.estimatedTradeProfit >= 0 ? '+' : '') + Math.floor(recommendation.estimatedTradeProfit) + '</span>'
        : '') +
      '<span>' + (recommendation.routeModeLabel || '星系内中转') + '</span>' +
      '<span>风险 ' + riskLevelLabel + '</span>' +
      '<span>查获 ' + riskLabel + '</span>' +
    '</div>' +
    '<div class="quest-dispatch-note">' + roleLabel + ' · ' + recommendation.strategySummary + (recommendation.tradeThemeSummary ? ' · ' + recommendation.tradeThemeSummary : '') + '</div>' +
    (canApplyQuestDispatch
      ? '<div class="quest-dispatch-actions">' +
          '<button type="button" class="quest-dispatch-apply-btn command-action-btn" data-command-surface="fleet" data-command-intent="任务路线" data-command-verb="带入机库">' +
            renderCommandActionContent({
              actionId: 'dispatch',
              label: '带入机库',
              commandSurface: 'fleet',
              commandIntent: '任务路线',
            }, _escapeHtml) +
          '</button>' +
          '<span class="quest-dispatch-action-hint">切到机库并预填当前任务路线</span>' +
        '</div>'
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
    return {
      systemName: item.systemName,
      purposeLabel: item.purposeLabel,
      blockedReason: item.blockedReason,
    };
  }).filter(Boolean);
}

function _isTradeRouteObjective(obj) {
  if (!obj || !obj.type) return false;
  return ['deliver', 'buy_at', 'sell_at', 'trade_good', 'sell_in_faction'].includes(obj.type);
}

function _getQuestBlockerReasonId(blockers) {
  if (!Array.isArray(blockers) || blockers.length === 0) return 'general';

  if (blockers.some(function (blocker) {
    return blocker.blockedReason && blocker.blockedReason.indexOf('超空间跃迁引擎') !== -1;
  })) {
    return 'hyperspace';
  }

  if (blockers.some(function (blocker) {
    return blocker.blockedReason && blocker.blockedReason.indexOf('燃料不足') !== -1;
  })) {
    return 'fuel';
  }

  if (blockers.some(function (blocker) {
    return blocker.blockedReason && blocker.blockedReason.indexOf('需要达到 Lv.') !== -1;
  })) {
    return 'level';
  }

  return 'general';
}

function _getQuestFallbackCopy(fallbackQuest, state, primaryReasonId) {
  var questName = fallbackQuest.name;
  var context = _getQuestActionContext(fallbackQuest, state || {});
  var primaryObjective = fallbackQuest.objectives && fallbackQuest.objectives.length > 0 ? fallbackQuest.objectives[0] : null;
  var targets = _questTargetSystems(fallbackQuest);
  var hasSingleTarget = targets.length === 1;
  var isTradeLine = _isTradeRouteObjective(primaryObjective);
  var staysInCurrentGalaxy = !state || !state.currentGalaxy || targets.length === 0 || targets.every(function (sys) {
    return sys.galaxyId === state.currentGalaxy;
  });

  if (primaryReasonId === 'level') {
    return {
      label: '先补等级',
      hint: (context.tone === 'current' || context.tone === 'ready')
        ? '「' + questName + '」当前就能推进，先补等级和基础收益，再回来冲更高门槛。'
        : (hasSingleTarget && isTradeLine)
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
    return {
      label: '先做银河内任务',
      hint: '「' + questName + '」不需要跨星系，先推进这条银河内任务，等跃迁科技补齐。',
    };
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

function _buildQuestMarketAction(reasonId, label, hint) {
  return buildMarketFocusAction(
    reasonId,
    label,
    hint,
    QUEST_BLOCKER_MARKET_PRESETS[reasonId] || QUEST_BLOCKER_MARKET_PRESETS.general,
    'primary'
  );
}

export function getQuestBlockerActions(blockers, fallbackQuest, state) {
  if (!Array.isArray(blockers) || blockers.length === 0) return [];

  var actions = [];
  var primaryReasonId = _getQuestBlockerReasonId(blockers);

  if (primaryReasonId === 'hyperspace') {
    actions.push({
      actionId: 'research',
      reasonId: 'hyperspace',
      label: '前往科技页研究',
      hint: '优先补出超空间跃迁引擎，再回来规划这条跨区航线。',
      variant: 'primary',
      commandSurface: 'research',
      commandIntent: '跃迁科技',
      commandVerb: '前往科技页研究',
    });
  }

  else if (primaryReasonId === 'fuel') {
    actions.push(_buildQuestMarketAction(
      'fuel',
      '打开市场补燃料',
      '会进入市场中心的交易页，先补充燃料或调整货舱，再回来恢复自动跑商建议。'
    ));
  }

  else if (primaryReasonId === 'level') {
    actions.push(_buildQuestMarketAction(
      'level',
      '打开市场跑单',
      '会进入市场中心的交易页，先做几笔交易把等级提上来再接这条线。'
    ));
  }

  var fallbackAction = _buildQuestFallbackAction(fallbackQuest, state, primaryReasonId);
  if (fallbackAction) {
    actions.push(fallbackAction);
  }

  return actions;
}

function _renderQuestBlockerActions(actions, quest) {
  if (!Array.isArray(actions) || actions.length === 0) return '';

  return '<div class="quest-dispatch-actions is-blocked">' + actions.map(function (action) {
    var commandAction = normalizeCommandAction(action);
    var btnClass = 'quest-dispatch-blocker-btn command-action-btn' + (commandAction.variant === 'secondary' ? ' is-secondary' : '');
    var commandAttrs = getCommandActionAttributes(commandAction, _escapeHtmlAttr);
    return '<div class="quest-dispatch-action-item' + (action.variant === 'secondary' ? ' is-secondary' : '') + '">' +
      '<button type="button" class="' + btnClass + '" data-action-id="' + _escapeHtmlAttr(action.actionId || '') + '" data-reason-id="' + _escapeHtmlAttr(action.reasonId || '') + '" data-quest-id="' + _escapeHtmlAttr(quest.id || '') + '" data-quest-name="' + _escapeHtmlAttr(quest.name || '') + '" data-target-quest-id="' + _escapeHtmlAttr(action.targetQuestId || '') + '" data-target-quest-name="' + _escapeHtmlAttr(action.targetQuestName || '') + '" data-market-workspace-id="' + _escapeHtmlAttr(action.marketWorkspaceId || '') + '" data-market-subworkspace-id="' + _escapeHtmlAttr(action.marketSubworkspaceId || '') + '" data-market-focus-label="' + _escapeHtmlAttr(action.marketFocusLabel || '') + '"' + commandAttrs + '>' + renderCommandActionContent(commandAction, _escapeHtml) + '</button>' +
      '<span class="quest-dispatch-action-hint">' + _escapeHtml(action.hint || '') + '</span>' +
    '</div>';
  }).join('') + '</div>';
}

function _renderQuestDispatchBlocker(quest, routePreview, canResolveQuestBlocker, fallbackQuest, state) {
  var blockers = _collectQuestDispatchBlockers(routePreview);
  var actions = getQuestBlockerActions(blockers, fallbackQuest, state);
  if (blockers.length === 0) return '';

  return '<div class="quest-dispatch-card is-blocked">' +
    '<div class="quest-dispatch-head">' +
      '<div class="quest-dispatch-title">⛔ 暂无可用路线建议</div>' +
      '<div class="quest-dispatch-caption">当前目标 · ' + quest.name + '</div>' +
    '</div>' +
    '<div class="quest-dispatch-main">当前航点还有未满足的条件，补足后会自动恢复机库路线建议。</div>' +
    '<div class="quest-dispatch-blocker-list">' + blockers.map(function (blocker) {
      return '<div class="quest-dispatch-blocker-item">' +
        '<div class="quest-dispatch-blocker-system">' + blocker.systemName + ' · ' + blocker.purposeLabel + '</div>' +
        '<div class="quest-dispatch-blocker-reason">' + blocker.blockedReason + '</div>' +
      '</div>';
    }).join('') + '</div>' +
    (canResolveQuestBlocker && actions.length > 0
      ? _renderQuestBlockerActions(actions, quest)
      : '') +
    (routePreview && routePreview.summaryText
      ? '<div class="quest-dispatch-note is-blocked">' + routePreview.summaryText + '</div>'
      : '') +
  '</div>';
}

function _renderQuestAcceptHub(state, available, selectedQuest, recommendedIds, storyRoute, activeCount) {
  if (!selectedQuest) return '';

  var typeInfo = QUEST_TYPES[selectedQuest.type] || {};
  var isRecommended = recommendedIds.includes(selectedQuest.id);
  var rewardSummary = Quest.getQuestRewardSummary(state, selectedQuest);
  var actionContext = _getQuestActionContext(selectedQuest, state);
  var targets = _questTargetSystems(selectedQuest);
  var routePreview = Quest.getQuestRoutePreview(state, selectedQuest, 3);
  var limitReached = activeCount >= 5;

  var flags = [
    '<span class="quest-brief-flag quest-brief-flag-' + actionContext.tone + '">' + actionContext.label + '</span>',
    isRecommended ? '<span class="quest-brief-flag quest-brief-flag-recommended">⭐ 推荐</span>' : '',
    selectedQuest.timeLimit > 0 ? '<span class="quest-brief-flag quest-brief-flag-timed">⏰ ' + selectedQuest.timeLimit + ' 天限制</span>' : '',
    storyRoute && rewardSummary.hasDecisionBonus ? '<span class="quest-brief-flag quest-brief-flag-route">🧭 ' + storyRoute.label + '</span>' : '',
  ].filter(Boolean).join('');

  return '<section class="quest-accept-hub" data-quest-accept-hub="true" aria-label="任务接取简报">' +
    '<div class="quest-accept-hub-head">' +
      '<div>' +
        '<div class="quest-accept-kicker">任务简报</div>' +
        '<div class="quest-accept-title">先确认目标，再决定是否接取</div>' +
      '</div>' +
      '<div class="quest-accept-count">待选 ' + available.length + ' 项</div>' +
    '</div>' +
    '<article class="quest-card available-quest quest-accept-featured" role="group" aria-label="' + _escapeHtmlAttr(selectedQuest.name) + '任务简报">' +
      '<div class="quest-card-header">' +
        '<span class="quest-type-badge" style="background:' + (typeInfo.color || '#666') + '">' +
          (typeInfo.icon || '📋') + ' ' + (typeInfo.name || selectedQuest.type) + '</span>' +
        '<span class="quest-time">' + (isRecommended ? '优先接取' : '待命委托') + '</span>' +
      '</div>' +
      '<div class="quest-name">' + selectedQuest.name + '</div>' +
      '<div class="quest-desc">' + selectedQuest.description + '</div>' +
      '<div class="quest-brief-flags">' + flags + '</div>' +
      _renderQuestBriefObjectives(selectedQuest) +
      _renderTargetSystems(targets, state.currentSystem) +
      (targets.length > 0
        ? _renderQuestRoutePreview(routePreview)
        : '<div class="quest-brief-note">无需旅行，接取后在当前玩法中就能推进。</div>') +
      (targets.length > 0 ? '<div class="quest-brief-note">' + actionContext.detail + '</div>' : '') +
      (rewardSummary.hasDecisionBonus
        ? '<div class="quest-brief-bonus">🧭 分支加成：' + rewardSummary.bonusText + '</div>'
        : '') +
      '<div class="quest-rewards quest-brief-rewards">' +
        '<span>🎁 奖励:</span>' +
        '<span>💰 ' + rewardSummary.credits + '</span>' +
        '<span>⭐ ' + rewardSummary.exp + '</span>' +
        '<span>🏅 ' + rewardSummary.reputation + '</span>' +
      '</div>' +
      '<div class="quest-brief-actions">' +
        '<button type="button" class="btn-action quest-accept-btn" data-id="' + selectedQuest.id + '"' +
          (limitReached ? ' disabled title="当前最多同时进行 5 个任务"' : '') + '>接取任务</button>' +
      '</div>' +
    '</article>' +
  '</section>';
}

function _renderAvailableQuestPicker(state, available, selectedQuest, recommendedIds) {
  if (!selectedQuest || available.length === 0) return '';

  return '<div class="quest-pick-list" role="list" aria-label="可接任务列表">' + available.map(function (quest) {
    var typeInfo = QUEST_TYPES[quest.type] || {};
    var rewardSummary = Quest.getQuestRewardSummary(state, quest);
    var actionContext = _getQuestActionContext(quest, state);
    var isSelected = selectedQuest.id === quest.id;
    var primaryObjective = quest.objectives && quest.objectives.length > 0 ? quest.objectives[0] : null;

    return '<button type="button" role="listitem" class="quest-pick-card' + (isSelected ? ' is-selected' : '') + '" data-quest-select-id="' + quest.id + '" aria-pressed="' + (isSelected ? 'true' : 'false') + '">' +
      '<div class="quest-pick-card-head">' +
        '<span class="quest-type-badge" style="background:' + (typeInfo.color || '#666') + '">' +
          (typeInfo.icon || '📋') + ' ' + (typeInfo.name || quest.type) + '</span>' +
        '<span class="quest-pick-state quest-pick-state-' + actionContext.tone + '">' + actionContext.label + '</span>' +
      '</div>' +
      '<div class="quest-pick-name-row">' +
        '<span class="quest-pick-name">' + quest.name + '</span>' +
        (recommendedIds.includes(quest.id) ? '<span class="quest-pick-recommended">⭐ 推荐</span>' : '') +
      '</div>' +
      '<div class="quest-pick-desc">' + _objectivePlanText(primaryObjective) + '</div>' +
      '<div class="quest-pick-meta">' +
        '<span>💰 ' + rewardSummary.credits + '</span>' +
        '<span>⭐ ' + rewardSummary.exp + '</span>' +
        (quest.timeLimit > 0 ? '<span>⏰ ' + quest.timeLimit + ' 天</span>' : '<span>不限时</span>') +
      '</div>' +
    '</button>';
  }).join('') + '</div>';
}

function _getQuestLocalStatus(quest, state) {
  if (!quest) {
    return {
      label: '待选择',
      tone: 'idle',
      detail: '当前没有可展示任务。',
    };
  }

  var targets = _questTargetSystems(quest);
  if (targets.length === 0) {
    return {
      label: '现在就能做',
      tone: 'ready',
      detail: '不需要指定目的地，可在现有贸易或航行节奏中累计进度。',
    };
  }

  if (_questHasCurrentSystemTarget(quest, state)) {
    return {
      label: '当前航点命中',
      tone: 'current',
      detail: '当前停靠点就是任务目标，可优先查看这条线。',
    };
  }

  if (targets.length === 1) {
    return {
      label: targets[0].name,
      tone: 'travel',
      detail: '目标星球为 ' + targets[0].name + '，适合在航线规划前先确认燃料与距离。',
    };
  }

  return {
    label: '多目标路线',
    tone: 'travel',
    detail: '包含多个目的地，适合先看路程和燃料，再决定推进顺序。',
  };
}

function _getQuestTriageItems(state, active, sortedAvailable, selectedAvailableQuest) {
  var seen = Object.create(null);
  var candidates = [];
  var pushQuest = function (quest, sourceLabel, stateLabel) {
    if (!quest || seen[quest.id]) return;
    seen[quest.id] = true;
    candidates.push({
      quest: quest,
      sourceLabel: sourceLabel,
      stateLabel: stateLabel,
      localStatus: _getQuestLocalStatus(quest, state),
    });
  };

  active.filter(function (quest) {
    var status = _getQuestLocalStatus(quest, state);
    return status.tone === 'current' || status.tone === 'ready';
  }).forEach(function (quest) {
    pushQuest(quest, '进行中', '可推进');
  });

  active.forEach(function (quest) {
    pushQuest(quest, '进行中', '追踪中');
  });

  pushQuest(selectedAvailableQuest, '可接取', '待确认');
  sortedAvailable.slice(0, 3).forEach(function (quest) {
    pushQuest(quest, '可接取', '待接取');
  });

  return candidates.slice(0, 3);
}

function _renderQuestTriagePanel(state, active, sortedAvailable, locked, selectedAvailableQuest, currentPhaseProgress, storyRoute) {
  var currentLocalActive = active.filter(function (quest) {
    var status = _getQuestLocalStatus(quest, state);
    return status.tone === 'current' || status.tone === 'ready';
  });
  var availableLocal = sortedAvailable.filter(function (quest) {
    var status = _getQuestLocalStatus(quest, state);
    return status.tone === 'current' || status.tone === 'ready';
  });
  var timedCount = active.concat(sortedAvailable).filter(function (quest) {
    return (quest.timeLimit || 0) > 0;
  }).length;
  var phaseProgressLabel = currentPhaseProgress.total > 0
    ? (currentPhaseProgress.completed + '/' + currentPhaseProgress.total)
    : '0/0';
  var focusQuest = currentLocalActive[0] || active[0] || selectedAvailableQuest || sortedAvailable[0] || null;
  var focusStatus = _getQuestLocalStatus(focusQuest, state);
  var signalTitle = focusQuest
    ? (focusStatus.label + ' · ' + focusQuest.name)
    : '等待新委托';
  var signalNote = focusQuest
    ? focusStatus.detail
    : '当前没有可追踪任务，等待章节推进或新委托解锁。';
  var triageItems = _getQuestTriageItems(state, active, sortedAvailable, selectedAvailableQuest);

  return '<section class="quest-triage-panel" aria-label="详细任务状态">' +
    '<div class="quest-triage-grid" role="list" aria-label="任务状态概览">' +
      '<div class="quest-triage-cell quest-triage-cell--active" role="listitem"><span>当前航点</span><strong>' + currentLocalActive.length + '</strong><em>进行中可推进</em></div>' +
      '<div class="quest-triage-cell quest-triage-cell--available" role="listitem"><span>可接取</span><strong>' + availableLocal.length + '/' + sortedAvailable.length + '</strong><em>本地或无目标</em></div>' +
      '<div class="quest-triage-cell quest-triage-cell--timed" role="listitem"><span>限时任务</span><strong>' + timedCount + '</strong><em>注意剩余天数</em></div>' +
      '<div class="quest-triage-cell quest-triage-cell--locked" role="listitem"><span>未解锁</span><strong>' + locked.length + '</strong><em>章节 ' + phaseProgressLabel + '</em></div>' +
    '</div>' +
    '<div class="quest-focus-panel" aria-label="当前任务建议">' +
      '<div class="quest-focus-copy">' +
        '<span class="quest-focus-kicker">当前建议</span>' +
        '<strong class="quest-focus-title">' + _escapeHtml(signalTitle) + '</strong>' +
        '<span class="quest-focus-note">' + _escapeHtml(signalNote) + '</span>' +
      '</div>' +
      '<div class="quest-focus-list" role="list" aria-label="重点任务">' +
        (triageItems.length > 0
          ? triageItems.map(function (item) {
              var reward = Quest.getQuestRewardSummary(state, item.quest);
              return '<article class="quest-focus-card quest-focus-card--' + _escapeHtmlAttr(item.localStatus.tone) + '" role="listitem">' +
                '<span class="quest-focus-state">' + _escapeHtml(item.stateLabel) + '</span>' +
                '<span class="quest-focus-main">' +
                  '<strong>' + _escapeHtml(item.quest.name) + '</strong>' +
                  '<em>' + _escapeHtml(item.sourceLabel + ' · ' + item.localStatus.label + ' · ' + reward.credits.toLocaleString() + ' 积分') + '</em>' +
                '</span>' +
              '</article>';
            }).join('')
          : '<div class="quest-focus-empty" role="listitem">暂无重点任务。</div>') +
      '</div>' +
      '<div class="quest-route-signal" aria-label="长期方向">' +
        '<span>长期方向</span>' +
        '<strong>' + _escapeHtml(storyRoute ? storyRoute.label : '自由贸易路线') + '</strong>' +
        '<em>' + _escapeHtml(storyRoute && storyRoute.rewardHint ? storyRoute.rewardHint : '按当前任务池自由推进') + '</em>' +
      '</div>' +
    '</div>' +
  '</section>';
}

/**
 * 渲染任务面板
 * @param {object}   state
 * @param {Function} onAccept   (questId) => void
 * @param {Function} onAbandon  (questId) => void
 * @param {object}   questDispatchContext
 * @param {Function} onApplyQuestDispatch (recommendation) => void
 * @param {Function} onResolveQuestBlocker (action) => void
 */
export function render(state, onAccept, onAbandon, questDispatchContext, onApplyQuestDispatch, onResolveQuestBlocker) {
  const container = document.getElementById('quest-list');
  if (!container) return;

  let html = '';
  const recommended = Quest.getStarterRecommendations(state, 3);
  const recommendedIds = recommended.map(function (quest) { return quest.id; });
  const storyRoute = Quest.getStoryRouteProfile(state);
  const available = Quest.getAvailableQuests(state);
  const availableSelection = _pickSelectedAvailableQuest(state, available, recommendedIds);
  const sortedAvailable = availableSelection.sorted;
  const selectedAvailableQuest = availableSelection.selected;
  const fallbackQuest = sortedAvailable[0] || null;
  const active = Quest.getActiveQuests(state);
  const locked = Quest.getLockedQuests(state);
  const activeQuestRecommendation = active.length > 0
    ? AutoTrade.findQuestRoute(state, Object.assign({
        cargo: state.cargo || {},
      }, questDispatchContext || {}))
    : null;

  // ---- 当前章节 ----
  const currentPhaseProgress = Quest.getCurrentQuestPhaseProgress(state);
  const currentPhase = currentPhaseProgress.phase;
  const phaseProgressPct = currentPhaseProgress.total > 0
    ? Math.min(100, currentPhaseProgress.percent || 0)
    : 0;
  const phaseName = currentPhase ? currentPhase.name : '未知章节';
  const phaseDesc = currentPhase ? currentPhase.description : '正在等待新的星际任务。';
  const commandFocusQuest = selectedAvailableQuest || active[0] || fallbackQuest;
  const commandFocusLabel = commandFocusQuest
    ? (selectedAvailableQuest ? '建议接取：' : '当前目标：') + commandFocusQuest.name
    : '等待新委托';
  const commandRouteLabel = storyRoute ? storyRoute.label : '自由贸易路线';

  html += '<section class="quest-command-deck" role="region" aria-label="任务首页">' +
    '<div class="quest-command-visual" aria-hidden="true">' +
      '<span class="quest-command-orbit quest-command-orbit-a"></span>' +
      '<span class="quest-command-orbit quest-command-orbit-b"></span>' +
      '<span class="quest-command-pulse"></span>' +
      '<span class="quest-command-icon">' + (currentPhase ? currentPhase.icon : '📖') + '</span>' +
    '</div>' +
    '<div class="quest-command-copy">' +
      '<div class="quest-command-kicker">当前章节</div>' +
      '<h2>' + phaseName + '</h2>' +
      '<p>' + phaseDesc + '</p>' +
      '<div class="quest-command-tags">' +
        (storyRoute ? '<span>长期方向 · ' + commandRouteLabel + '</span>' : '') +
        '<span>' + commandFocusLabel + '</span>' +
      '</div>' +
    '</div>' +
  '</section>';

  html += '<details class="quest-secondary-details">' +
    '<summary>查看章节进度与全部任务状态</summary>' +
    '<div class="quest-secondary-details-body">' +
      _renderQuestTriagePanel(state, active, sortedAvailable, locked, selectedAvailableQuest, currentPhaseProgress, storyRoute) +
      '<div class="quest-phase-overview" aria-label="当前章节进度">' +
    '<div class="quest-phase-chip active" title="' + (currentPhase ? currentPhase.description : '') + '">' +
    '<span class="phase-icon">' + (currentPhase ? currentPhase.icon : '📖') + '</span>' +
    '<span class="phase-name">当前章节：' + phaseName + '</span>' +
    '<span class="phase-bar" role="progressbar" aria-label="章节进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + phaseProgressPct + '"><span class="phase-bar-fill" style="width:' + phaseProgressPct + '%"></span></span>' +
    '<span class="phase-progress">主线 ' + currentPhaseProgress.coreCompleted + '/' + currentPhaseProgress.coreTotal +
      ' · 支线 ' + Math.min(currentPhaseProgress.optionalCompleted, currentPhaseProgress.optionalRequired) + '/' + currentPhaseProgress.optionalRequired + '</span>' +
    '</div>' +
      '</div>' +
    '</div>' +
  '</details>';

  // ---- 当前任务 ----
  if (active.length > 0) {
  html += '<section class="quest-module quest-module-active">';
  html += '<div class="quest-section-title">📋 进行中 (' + active.length + '/5)</div>';

  html += '<div class="quest-active-grid" role="list" aria-label="进行中任务">';
  active.forEach(function (quest) {
      const typeInfo = QUEST_TYPES[quest.type] || {};
      const timeleft = quest.timeLimit > 0
        ? '⏰ 剩余 ' + Math.max(0, quest.timeLimit - (state.day - quest.startDay)) + ' 天'
        : '';
      const routePreview = Quest.getQuestRoutePreview(state, quest, 2);

      html += '<article class="quest-card active-quest" role="listitem" data-quest-state="active" aria-label="' + _escapeHtmlAttr(quest.name + '，进行中') + '">' +
        '<div class="quest-card-header">' +
          '<span class="quest-type-badge" style="background:' + (typeInfo.color || '#666') + '">' +
            (typeInfo.icon || '📋') + ' ' + (typeInfo.name || quest.type) + '</span>' +
          '<span class="quest-time">' + timeleft + '</span>' +
        '</div>' +
        '<div class="quest-name">' + quest.name + '</div>' +
        '<div class="quest-desc">' + quest.description + '</div>';

      // 目标进度
      quest.objectives.forEach(function (obj) {
        const pct = Math.min(100, Math.round((obj.current / (obj.amount || 1)) * 100));
        html += '<div class="quest-objective">' +
          '<div class="quest-obj-text">' + _objectiveText(obj) + '</div>' +
          '<div class="quest-progress-track" role="progressbar" aria-label="' + _escapeHtmlAttr(_objectiveText(obj)) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '">' +
            '<div class="quest-progress-fill" style="width:' + pct + '%"></div>' +
          '</div>' +
          '<span class="quest-obj-count">' + obj.current + '/' + (obj.amount || 1) + '</span>' +
          '</div>';
      });

      // 目标星球
      var targets = _questTargetSystems(quest);
      html += _renderTargetSystems(targets, state.currentSystem);
      html += _renderQuestRoutePreview(routePreview, {
        compact: true,
        title: '当前航线',
        caption: '按现状继续推进',
      });
      if (activeQuestRecommendation && activeQuestRecommendation.questId === quest.id) {
        html += _renderQuestDispatchRecommendation(activeQuestRecommendation, !!onApplyQuestDispatch);
      } else {
        html += _renderQuestDispatchBlocker(quest, routePreview, !!onResolveQuestBlocker, fallbackQuest, state);
      }

      // 奖励
      const activeRewardSummary = Quest.getQuestRewardSummary(state, quest);
      html += '<div class="quest-rewards">' +
        '<span>🎁 奖励:</span>' +
        '<span>💰 ' + activeRewardSummary.credits + '</span>' +
        '<span>⭐ ' + activeRewardSummary.exp + ' 经验</span>' +
        '<span>🏅 ' + activeRewardSummary.reputation + ' 声望</span>' +
        (activeRewardSummary.hasDecisionBonus ? '<span title="' + activeRewardSummary.bonusText + '">🧭 分支加成</span>' : '') +
        '</div>';

      html += '<button type="button" class="btn-action quest-abandon-btn" data-id="' + quest.id + '" data-name="' + _escapeHtmlAttr(quest.name) + '">放弃</button>';
      html += '</article>';
  });
  html += '</div>';
  html += '</section>';
  }

  // ---- 可接取任务 ----
  html += '<section class="quest-module quest-module-available">';
  html += '<div class="quest-section-title">📜 可接取 (' + available.length + ')</div>';

  if (recommended.length > 0 && (state.quests || []).length === 0) {
    html += '<div class="quest-empty" style="margin-bottom:10px">' +
      '💡 推荐先做' + (storyRoute ? '（' + storyRoute.label + '）' : '') + '：' + recommended.map(function (quest) { return '「' + quest.name + '」'; }).join('、') +
      (storyRoute && storyRoute.rewardHint ? '。当前分支效果：' + storyRoute.rewardHint : '。') +
      '</div>';
  }

  if (available.length === 0) {
    html += '<div class="quest-empty">当前章节暂无可接任务。请先推进进行中任务。</div>';
  } else {
    html += _renderQuestAcceptHub(state, sortedAvailable, selectedAvailableQuest, recommendedIds, storyRoute, active.length);
    html += _renderAvailableQuestPicker(state, sortedAvailable, selectedAvailableQuest, recommendedIds);
  }
  html += '</section>';

  // ---- 未解锁任务 ----
  html += '<details class="quest-module quest-module-locked quest-locked-details">';
  if (locked.length > 0) {
    html += '<summary>查看后续任务（' + locked.length + '）</summary>';
    html += '<div class="quest-locked-grid" role="list" aria-label="未解锁任务">';
    locked.forEach(function (quest) {
      const typeInfo = QUEST_TYPES[quest.type] || {};
      const rewardSummary = Quest.getQuestRewardSummary(state, quest);
      html += '<article class="quest-card locked-quest" role="listitem" data-quest-state="locked" aria-label="' + _escapeHtmlAttr(quest.name + '，未解锁') + '">' +
        '<div class="quest-card-header">' +
          '<span class="quest-type-badge" style="background:' + (typeInfo.color || '#666') + '; opacity:0.6">' +
            (typeInfo.icon || '📋') + ' ' + (typeInfo.name || quest.type) + '</span>' +
        '</div>' +
        '<div class="quest-name" style="opacity:0.7">🔒 ' + quest.name + '</div>' +
        '<div class="quest-desc" style="opacity:0.5">' + quest.description + '</div>' +
        '<div class="quest-lock-reasons">';
      quest.lockReasons.forEach(function (reason) {
        html += '<div class="quest-lock-reason">⚠️ ' + reason + '</div>';
      });
      html += '</div>' +
        '<div class="quest-rewards" style="opacity:0.5">' +
          '<span>🎁</span>' +
          '<span>💰 ' + rewardSummary.credits + '</span>' +
          '<span>⭐ ' + rewardSummary.exp + '</span>' +
          '<span>🏅 ' + rewardSummary.reputation + '</span>' +
          (rewardSummary.hasDecisionBonus ? '<span title="' + rewardSummary.bonusText + '">🧭 分支加成</span>' : '') +
        '</div>' +
        '</article>';
    });
    html += '</div>';
  } else {
    html += '<summary>后续任务</summary>';
    if (currentPhaseProgress.isFinalPhase && currentPhaseProgress.isComplete) {
      html += '<div class="quest-empty">🏁 最终章晋升条件已完成，未完成支线仍可继续挑战。</div>';
    } else if (currentPhaseProgress.isComplete) {
      html += '<div class="quest-empty">✅ 当前章节的核心任务与支线配额已完成，下一次结算将进入新章节。</div>';
    }
  }
  html += '</details>';

  container.innerHTML = html;

  // 绑定事件
  container.querySelectorAll('[data-quest-select-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _selectedAvailableQuestId = btn.dataset.questSelectId;
      render(state, onAccept, onAbandon, questDispatchContext, onApplyQuestDispatch, onResolveQuestBlocker);
    });
  });
  container.querySelectorAll('.quest-accept-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      onAccept(btn.dataset.id);
    });
  });
  container.querySelectorAll('.quest-abandon-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      ActionConfirmUI.open({
        kicker: '任务终止',
        title: '放弃「' + (btn.dataset.name || '当前任务') + '」？',
        message: '当前任务进度会被移除，需要重新接取后才能继续推进。',
        confirmLabel: '确认放弃任务',
        details: [
          { label: '当前进度', value: '全部丢失', tone: 'danger' },
          { label: '后续处理', value: '可在条件允许时重新接取' },
        ],
        onConfirm: function () { onAbandon(btn.dataset.id); },
      });
    });
  });
  var questDispatchBtn = container.querySelector('.quest-dispatch-apply-btn');
  if (questDispatchBtn && typeof onApplyQuestDispatch === 'function' && activeQuestRecommendation) {
    questDispatchBtn.addEventListener('click', function () {
      onApplyQuestDispatch(activeQuestRecommendation);
    });
  }
  container.querySelectorAll('.quest-dispatch-blocker-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var action = {
        actionId: btn.dataset.actionId,
        reasonId: btn.dataset.reasonId,
        questId: btn.dataset.questId,
        questName: btn.dataset.questName,
        targetQuestId: btn.dataset.targetQuestId,
        targetQuestName: btn.dataset.targetQuestName,
        marketWorkspaceId: btn.dataset.marketWorkspaceId,
        marketSubworkspaceId: btn.dataset.marketSubworkspaceId,
        marketFocusLabel: btn.dataset.marketFocusLabel,
      };

      if (action.actionId === 'quest-focus') {
        _focusQuestFallbackAction(action, state, onAccept, onAbandon, questDispatchContext, onApplyQuestDispatch, onResolveQuestBlocker);
      }

      if (typeof onResolveQuestBlocker === 'function') {
        onResolveQuestBlocker(action);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// 生成目标描述文本
// ---------------------------------------------------------------------------
function _objectiveText(obj) {
  const targetSystemName = _systemName(obj.targetSystem);
  const goodName = _goodName(obj.goodId);

  switch (obj.type) {
    case 'deliver':
      return '运送 ' + goodName + ' 到 ' + targetSystemName;
    case 'buy_at':
      return '在 ' + targetSystemName + ' 购买 ' + goodName;
    case 'sell_at':
      return '在 ' + targetSystemName + ' 卖出 ' + goodName;
    case 'earn_profit':
      return '累计赚取利润';
    case 'trade_count':
      return '完成交易次数';
    case 'trade_good':
      return '交易 ' + goodName;
    case 'visit_systems':
      return '造访不同星系';
    case 'visit_system':
      return '前往 ' + targetSystemName;
    case 'faction_trade':
      return '在派系区域交易';
    case 'sell_in_faction':
      return '在派系区域卖出 ' + goodName;
    case 'faction_relation':
      return '提升与派系关系';
    case 'survive_days':
      return '星际航行天数';
    case 'galaxy_jump':
      return '跨星系跃迁';
    case 'research_count':
      return '完成科技研究';
    case 'explore_pois':
      return '完成探索点调查';
    case 'fleet_size':
      return '扩充舰队规模';
    case 'crew_count':
      return '雇佣专业船员';
    case 'dispatch_routes':
      return '确认自动跑商路线';
    case 'finance_actions':
      return '申请贷款或投资';
    case 'trade_stations':
      return '建设贸易站';
    case 'visited_galaxies':
      return '探索不同星系';
    case 'victory_policy':
      return '选择长期经营路线';
    default:
      return '完成目标';
  }
}

function _systemName(systemId) {
  if (!systemId) return '未知地点';
  const system = findSystem(systemId);
  return system ? system.name : systemId;
}

function _goodName(goodId) {
  if (!goodId) return '货物';
  return _goodNameById[goodId] || goodId;
}
