// js/ui/QuestUI.js — 任务面板 UI（支持进度阶段与解锁条件）
// 依赖：systems/quest/QuestSystem.js, data/quests.js
// 导出：render

import { QUEST_TYPES } from '../data/quests.js';
import { GOODS } from '../data/goods.js';
import { findSystem } from '../data/systems.js';
import * as AutoTrade  from '../systems/trade/AutoTradeSystem.js?v=20260418-questblocker1';
import * as Quest      from '../systems/quest/QuestSystem.js?v=20260412-questroute2';

const _goodNameById = GOODS.reduce(function (acc, good) {
  acc[good.id] = good.name;
  return acc;
}, Object.create(null));

let _selectedAvailableQuestId = null;

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
      label: '当前航线可推进',
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
  var title = options.title || '航线预估';
  var caption = options.caption || '基于当前停靠点测算';
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
        item.hasSecretRoute ? '<span class="quest-route-tag quest-route-tag-secret">暗线 -' + item.discountPercent + '%</span>' : '',
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
    : '标准派遣';

  return '<div class="quest-dispatch-card">' +
    '<div class="quest-dispatch-head">' +
      '<div class="quest-dispatch-title">📡 任务派遣建议</div>' +
      '<div class="quest-dispatch-caption">当前优先目标 · ' + recommendation.questName + '</div>' +
    '</div>' +
    '<div class="quest-dispatch-main">' + _systemName(recommendation.buySystemId) + ' → ' + _systemName(recommendation.sellSystemId) + ' · ' + _goodName(recommendation.goodId) + '</div>' +
    '<div class="quest-dispatch-meta">' +
      '<span>预计燃料 ' + Math.max(0, recommendation.estimatedFuelCost || 0) + '</span>' +
      '<span>风险 ' + riskLevelLabel + '</span>' +
      '<span>查获 ' + riskLabel + '</span>' +
    '</div>' +
    '<div class="quest-dispatch-note">' + roleLabel + ' · ' + recommendation.strategySummary + '</div>' +
    (canApplyQuestDispatch
      ? '<div class="quest-dispatch-actions">' +
          '<button class="quest-dispatch-apply-btn">带入机库派遣</button>' +
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

function _renderQuestDispatchBlocker(quest, routePreview) {
  var blockers = _collectQuestDispatchBlockers(routePreview);
  if (blockers.length === 0) return '';

  return '<div class="quest-dispatch-card is-blocked">' +
    '<div class="quest-dispatch-head">' +
      '<div class="quest-dispatch-title">⛔ 暂不生成派遣建议</div>' +
      '<div class="quest-dispatch-caption">当前目标 · ' + quest.name + '</div>' +
    '</div>' +
    '<div class="quest-dispatch-main">当前航点仍有阻塞条件，补足后会自动恢复机库派遣建议。</div>' +
    '<div class="quest-dispatch-blocker-list">' + blockers.map(function (blocker) {
      return '<div class="quest-dispatch-blocker-item">' +
        '<div class="quest-dispatch-blocker-system">' + blocker.systemName + ' · ' + blocker.purposeLabel + '</div>' +
        '<div class="quest-dispatch-blocker-reason">' + blocker.blockedReason + '</div>' +
      '</div>';
    }).join('') + '</div>' +
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
    isRecommended ? '<span class="quest-brief-flag quest-brief-flag-recommended">⭐ 推荐路线</span>' : '',
    selectedQuest.timeLimit > 0 ? '<span class="quest-brief-flag quest-brief-flag-timed">⏰ ' + selectedQuest.timeLimit + ' 天限制</span>' : '',
    storyRoute && rewardSummary.hasDecisionBonus ? '<span class="quest-brief-flag quest-brief-flag-route">🧭 ' + storyRoute.label + '</span>' : '',
  ].filter(Boolean).join('');

  return '<div class="quest-accept-hub">' +
    '<div class="quest-accept-hub-head">' +
      '<div>' +
        '<div class="quest-accept-kicker">任务简报</div>' +
        '<div class="quest-accept-title">先确认目标，再决定是否接取</div>' +
      '</div>' +
      '<div class="quest-accept-count">待选 ' + available.length + ' 项</div>' +
    '</div>' +
    '<div class="quest-card available-quest quest-accept-featured">' +
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
      _renderQuestRoutePreview(routePreview) +
      '<div class="quest-brief-note">' + actionContext.detail + '</div>' +
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
        '<button class="btn-action quest-accept-btn" data-id="' + selectedQuest.id + '"' +
          (limitReached ? ' disabled title="当前最多同时进行 5 个任务"' : '') + '>接取任务</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function _renderAvailableQuestPicker(state, available, selectedQuest, recommendedIds) {
  if (!selectedQuest || available.length === 0) return '';

  return '<div class="quest-pick-list">' + available.map(function (quest) {
    var typeInfo = QUEST_TYPES[quest.type] || {};
    var rewardSummary = Quest.getQuestRewardSummary(state, quest);
    var actionContext = _getQuestActionContext(quest, state);
    var isSelected = selectedQuest.id === quest.id;
    var primaryObjective = quest.objectives && quest.objectives.length > 0 ? quest.objectives[0] : null;

    return '<button type="button" class="quest-pick-card' + (isSelected ? ' is-selected' : '') + '" data-quest-select-id="' + quest.id + '" aria-pressed="' + (isSelected ? 'true' : 'false') + '">' +
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
        (quest.timeLimit > 0 ? '<span>⏰ ' + quest.timeLimit + ' 天</span>' : '<span>🧭 可长期推进</span>') +
      '</div>' +
    '</button>';
  }).join('') + '</div>';
}

/**
 * 渲染任务面板
 * @param {object}   state
 * @param {Function} onAccept   (questId) => void
 * @param {Function} onAbandon  (questId) => void
 * @param {object}   questDispatchContext
 * @param {Function} onApplyQuestDispatch (recommendation) => void
 */
export function render(state, onAccept, onAbandon, questDispatchContext, onApplyQuestDispatch) {
  const container = document.getElementById('quest-list');
  if (!container) return;

  let html = '';
  const recommended = Quest.getStarterRecommendations(state, 3);
  const recommendedIds = recommended.map(function (quest) { return quest.id; });
  const storyRoute = Quest.getStoryRouteProfile(state);

  // ---- 当前章节 ----
  const currentPhaseProgress = Quest.getCurrentQuestPhaseProgress(state);
  const currentPhase = currentPhaseProgress.phase;
  html += '<div class="quest-phase-overview">' +
    '<div class="quest-phase-chip active" title="' + (currentPhase ? currentPhase.description : '') + '">' +
    '<span class="phase-icon">' + (currentPhase ? currentPhase.icon : '📖') + '</span>' +
    '<span class="phase-name">当前章节：' + (currentPhase ? currentPhase.name : '未知章节') + '</span>' +
    '<span class="phase-progress">' + currentPhaseProgress.completed + '/' + currentPhaseProgress.total + '</span>' +
    '</div>' +
    '</div>';

  // ---- 当前任务 ----
  const active = Quest.getActiveQuests(state);
  const activeQuestRecommendation = active.length > 0
    ? AutoTrade.findQuestRoute(state, Object.assign({
        cargo: state.cargo || {},
      }, questDispatchContext || {}))
    : null;
  html += '<div class="quest-section-title">📋 进行中 (' + active.length + '/5)</div>';

  if (active.length === 0) {
    html += '<div class="quest-empty">暂无进行中的任务。请从下方任务简报里挑选一项开始推进。</div>';
  } else {
    active.forEach(function (quest) {
      const typeInfo = QUEST_TYPES[quest.type] || {};
      const timeleft = quest.timeLimit > 0
        ? '⏰ 剩余 ' + Math.max(0, quest.timeLimit - (state.day - quest.startDay)) + ' 天'
        : '';
      const routePreview = Quest.getQuestRoutePreview(state, quest, 2);

      html += '<div class="quest-card active-quest">' +
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
          '<div class="quest-progress-track">' +
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
        html += _renderQuestDispatchBlocker(quest, routePreview);
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

      html += '<button class="btn-action quest-abandon-btn" data-id="' + quest.id + '">放弃</button>';
      html += '</div>';
    });
  }

  // ---- 可接取任务 ----
  const available = Quest.getAvailableQuests(state);
  const availableSelection = _pickSelectedAvailableQuest(state, available, recommendedIds);
  const sortedAvailable = availableSelection.sorted;
  const selectedAvailableQuest = availableSelection.selected;
  html += '<div class="quest-section-title" style="margin-top:12px">📜 可接取 (' + available.length + ')</div>';

  if (recommended.length > 0 && (state.quests || []).length === 0) {
    html += '<div class="quest-empty" style="margin-bottom:10px">' +
      '💡 教程后的推荐路线' + (storyRoute ? '（' + storyRoute.label + '）' : '') + '：' + recommended.map(function (quest) { return '「' + quest.name + '」'; }).join('、') +
      (storyRoute && storyRoute.rewardHint ? '。当前分支效果：' + storyRoute.rewardHint : '。') +
      '</div>';
  }

  if (available.length === 0) {
    html += '<div class="quest-empty">当前章节暂无可接任务。请先推进进行中任务。</div>';
  } else {
    html += _renderQuestAcceptHub(state, sortedAvailable, selectedAvailableQuest, recommendedIds, storyRoute, active.length);
    html += _renderAvailableQuestPicker(state, sortedAvailable, selectedAvailableQuest, recommendedIds);
  }

  // ---- 未解锁任务 ----
  const locked = Quest.getLockedQuests(state);
  if (locked.length > 0) {
    html += '<div class="quest-section-title" style="margin-top:12px">🔒 未解锁 (' + locked.length + ')</div>';
    locked.forEach(function (quest) {
      const typeInfo = QUEST_TYPES[quest.type] || {};
      const rewardSummary = Quest.getQuestRewardSummary(state, quest);
      html += '<div class="quest-card locked-quest">' +
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
        '</div>';
    });
  } else {
    if (currentPhaseProgress.isFinalPhase && currentPhaseProgress.completed === currentPhaseProgress.total && currentPhaseProgress.total > 0) {
      html += '<div class="quest-empty" style="margin-top:12px">🏁 所有章节任务已完成，全部胜利条件已开放。</div>';
    } else if (currentPhaseProgress.completed === currentPhaseProgress.total && currentPhaseProgress.total > 0) {
      html += '<div class="quest-empty" style="margin-top:12px">✅ 当前章节任务已全部完成，下一次任务结算后将进入新章节。</div>';
    }
  }

  container.innerHTML = html;

  // 绑定事件
  container.querySelectorAll('[data-quest-select-id]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      _selectedAvailableQuestId = btn.dataset.questSelectId;
      render(state, onAccept, onAbandon, questDispatchContext, onApplyQuestDispatch);
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
      if (confirm('确定放弃此任务？')) onAbandon(btn.dataset.id);
    });
  });
  var questDispatchBtn = container.querySelector('.quest-dispatch-apply-btn');
  if (questDispatchBtn && typeof onApplyQuestDispatch === 'function' && activeQuestRecommendation) {
    questDispatchBtn.addEventListener('click', function () {
      onApplyQuestDispatch(activeQuestRecommendation);
    });
  }
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
