// js/ui/QuestAvailablePresenter.js — 可接任务选择、简报与候选列表纯投影

import { QUEST_TYPES } from '../data/quests.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import { getQuestObjectivePlanText } from './QuestObjectivePresenter.js';
import {
  getQuestActionContext,
  getQuestTargetSystems,
  renderQuestRoutePreview,
  renderQuestTargetSystems,
} from './QuestRoutePresenter.js';
import { escapeQuestHtml, escapeQuestHtmlAttr } from './QuestPresentationSupport.js';

function _getAvailableQuestPriority(quest, state, recommendedIds) {
  var score = 0;
  if (recommendedIds.includes(quest.id)) score += 100;
  var context = getQuestActionContext(quest, state);
  if (context.tone === 'current') score += 60;
  else if (context.tone === 'ready') score += 40;
  if ((quest.timeLimit || 0) > 0) score += 5;
  return score;
}

function _sortAvailableQuests(state, available, recommendedIds) {
  return available.slice().sort(function (left, right) {
    var scoreDiff = _getAvailableQuestPriority(right, state, recommendedIds)
      - _getAvailableQuestPriority(left, state, recommendedIds);
    if (scoreDiff !== 0) return scoreDiff;
    return (left.name || '').localeCompare((right.name || ''), 'zh-CN');
  });
}

function _pickSelectedAvailableQuest(state, available, recommendedIds, selectedAvailableQuestId) {
  var sorted = _sortAvailableQuests(state, available, recommendedIds);
  if (sorted.length === 0) {
    return { sorted: sorted, selected: null, selectedAvailableQuestId: null };
  }
  var selected = sorted.find(function (quest) {
    return quest.id === selectedAvailableQuestId;
  }) || sorted[0];
  return { sorted: sorted, selected: selected, selectedAvailableQuestId: selected.id };
}

export function getPreferredAvailableQuest(state) {
  var recommendedIds = Quest.getStarterRecommendations(state, 3).map(function (quest) {
    return quest.id;
  });
  return _sortAvailableQuests(state, Quest.getAvailableQuests(state), recommendedIds)[0] || null;
}

function _renderQuestBriefObjectives(quest) {
  if (!quest || !quest.objectives || quest.objectives.length === 0) return '';
  return '<div class="quest-brief-objectives">' + quest.objectives.map(function (objective, index) {
    return '<div class="quest-brief-objective-row">' +
      '<span class="quest-brief-objective-index">' + String(index + 1).padStart(2, '0') + '</span>' +
      '<span class="quest-brief-objective-text">' + escapeQuestHtml(getQuestObjectivePlanText(objective)) + '</span>' +
      '</div>';
  }).join('') + '</div>';
}

function _renderQuestAcceptHub(state, available, selectedQuest, recommendedIds, storyRoute, activeCount) {
  if (!selectedQuest) return '';
  var typeInfo = QUEST_TYPES[selectedQuest.type] || {};
  var isRecommended = recommendedIds.includes(selectedQuest.id);
  var rewardSummary = Quest.getQuestRewardSummary(state, selectedQuest);
  var actionContext = getQuestActionContext(selectedQuest, state);
  var targets = getQuestTargetSystems(selectedQuest);
  var routePreview = Quest.getQuestRoutePreview(state, selectedQuest, 3);
  var limitReached = activeCount >= 5;
  var flags = [
    '<span class="quest-brief-flag quest-brief-flag-' + escapeQuestHtmlAttr(actionContext.tone) + '">' + escapeQuestHtml(actionContext.label) + '</span>',
    isRecommended ? '<span class="quest-brief-flag quest-brief-flag-recommended">⭐ 推荐</span>' : '',
    selectedQuest.timeLimit > 0 ? '<span class="quest-brief-flag quest-brief-flag-timed">⏰ ' + selectedQuest.timeLimit + ' 天限制</span>' : '',
    storyRoute && rewardSummary.hasDecisionBonus ? '<span class="quest-brief-flag quest-brief-flag-route">🧭 ' + escapeQuestHtml(storyRoute.label) + '</span>' : '',
  ].filter(Boolean).join('');

  return '<section class="quest-accept-hub" data-quest-accept-hub="true" aria-label="任务接取简报">' +
    '<div class="quest-accept-hub-head">' +
      '<div><div class="quest-accept-kicker">任务简报</div><div class="quest-accept-title">先确认目标，再决定是否接取</div></div>' +
      '<div class="quest-accept-count">待选 ' + available.length + ' 项</div>' +
    '</div>' +
    '<article class="quest-card available-quest quest-accept-featured" role="group" aria-label="' + escapeQuestHtmlAttr(selectedQuest.name) + '任务简报">' +
      '<div class="quest-card-header">' +
        '<span class="quest-type-badge" style="background:' + escapeQuestHtmlAttr(typeInfo.color || '#666') + '">' +
          escapeQuestHtml(typeInfo.icon || '📋') + ' ' + escapeQuestHtml(typeInfo.name || selectedQuest.type) + '</span>' +
        '<span class="quest-time">' + (isRecommended ? '优先接取' : '待命委托') + '</span>' +
      '</div>' +
      '<div class="quest-name">' + escapeQuestHtml(selectedQuest.name) + '</div>' +
      '<div class="quest-desc">' + escapeQuestHtml(selectedQuest.description) + '</div>' +
      '<div class="quest-brief-flags">' + flags + '</div>' +
      _renderQuestBriefObjectives(selectedQuest) +
      renderQuestTargetSystems(targets, state.currentSystem) +
      (targets.length > 0
        ? renderQuestRoutePreview(routePreview)
        : '<div class="quest-brief-note">无需旅行，接取后在当前玩法中就能推进。</div>') +
      (targets.length > 0 ? '<div class="quest-brief-note">' + escapeQuestHtml(actionContext.detail) + '</div>' : '') +
      (rewardSummary.hasDecisionBonus
        ? '<div class="quest-brief-bonus">🧭 分支加成：' + escapeQuestHtml(rewardSummary.bonusText) + '</div>'
        : '') +
      '<div class="quest-rewards quest-brief-rewards">' +
        '<span>🎁 奖励:</span><span>💰 ' + escapeQuestHtml(rewardSummary.credits) + '</span>' +
        '<span>⭐ ' + escapeQuestHtml(rewardSummary.exp) + '</span>' +
        '<span>🏅 ' + escapeQuestHtml(rewardSummary.reputation) + '</span>' +
      '</div>' +
      '<div class="quest-brief-actions"><button type="button" class="btn-action quest-accept-btn" data-id="' + escapeQuestHtmlAttr(selectedQuest.id) + '"' +
        (limitReached ? ' disabled title="当前最多同时进行 5 个任务"' : '') + '>接取任务</button></div>' +
    '</article>' +
  '</section>';
}

function _renderAvailableQuestPicker(state, available, selectedQuest, recommendedIds) {
  if (!selectedQuest || available.length === 0) return '';
  return '<div class="quest-pick-list" role="list" aria-label="可接任务列表">' + available.map(function (quest) {
    var typeInfo = QUEST_TYPES[quest.type] || {};
    var rewardSummary = Quest.getQuestRewardSummary(state, quest);
    var actionContext = getQuestActionContext(quest, state);
    var isSelected = selectedQuest.id === quest.id;
    var primaryObjective = quest.objectives && quest.objectives.length > 0 ? quest.objectives[0] : null;
    return '<button type="button" role="listitem" class="quest-pick-card' + (isSelected ? ' is-selected' : '') + '" data-quest-select-id="' + escapeQuestHtmlAttr(quest.id) + '" aria-pressed="' + (isSelected ? 'true' : 'false') + '">' +
      '<div class="quest-pick-card-head">' +
        '<span class="quest-type-badge" style="background:' + escapeQuestHtmlAttr(typeInfo.color || '#666') + '">' +
          escapeQuestHtml(typeInfo.icon || '📋') + ' ' + escapeQuestHtml(typeInfo.name || quest.type) + '</span>' +
        '<span class="quest-pick-state quest-pick-state-' + escapeQuestHtmlAttr(actionContext.tone) + '">' + escapeQuestHtml(actionContext.label) + '</span>' +
      '</div>' +
      '<div class="quest-pick-name-row"><span class="quest-pick-name">' + escapeQuestHtml(quest.name) + '</span>' +
        (recommendedIds.includes(quest.id) ? '<span class="quest-pick-recommended">⭐ 推荐</span>' : '') + '</div>' +
      '<div class="quest-pick-desc">' + escapeQuestHtml(getQuestObjectivePlanText(primaryObjective)) + '</div>' +
      '<div class="quest-pick-meta"><span>💰 ' + escapeQuestHtml(rewardSummary.credits) + '</span>' +
        '<span>⭐ ' + escapeQuestHtml(rewardSummary.exp) + '</span>' +
        (quest.timeLimit > 0 ? '<span>⏰ ' + quest.timeLimit + ' 天</span>' : '<span>不限时</span>') + '</div>' +
    '</button>';
  }).join('') + '</div>';
}

export function buildQuestAvailableView(request) {
  var input = request || {};
  var state = input.state;
  if (!state) return null;
  var recommended = Array.isArray(input.recommended)
    ? input.recommended.slice()
    : Quest.getStarterRecommendations(state, 3);
  var recommendedIds = recommended.map(function (quest) { return quest.id; });
  var available = Array.isArray(input.available)
    ? input.available.slice()
    : Quest.getAvailableQuests(state);
  var selection = _pickSelectedAvailableQuest(state, available, recommendedIds, input.selectedAvailableQuestId);
  var sortedAvailable = selection.sorted;
  var selectedQuest = selection.selected;
  var storyRoute = input.storyRoute || null;
  var activeCount = Number.isFinite(input.activeCount) ? input.activeCount : 0;
  var html = '<section class="quest-module quest-module-available">' +
    '<div class="quest-section-title">📜 可接取 (' + available.length + ')</div>';

  if (recommended.length > 0 && (state.quests || []).length === 0) {
    html += '<div class="quest-empty" style="margin-bottom:10px">' +
      '💡 推荐先做' + (storyRoute ? '（' + escapeQuestHtml(storyRoute.label) + '）' : '') + '：' +
      recommended.map(function (quest) { return '「' + escapeQuestHtml(quest.name) + '」'; }).join('、') +
      (storyRoute && storyRoute.rewardHint ? '。当前分支效果：' + escapeQuestHtml(storyRoute.rewardHint) : '。') +
      '</div>';
  }
  if (available.length === 0) {
    html += '<div class="quest-empty">当前章节暂无可接任务。请先推进进行中任务。</div>';
  } else {
    html += _renderQuestAcceptHub(state, sortedAvailable, selectedQuest, recommendedIds, storyRoute, activeCount);
    html += _renderAvailableQuestPicker(state, sortedAvailable, selectedQuest, recommendedIds);
  }
  html += '</section>';

  return Object.freeze({
    html: html,
    recommended: Object.freeze(recommended),
    recommendedIds: Object.freeze(recommendedIds),
    selectedAvailableQuestId: selection.selectedAvailableQuestId,
    selectedQuest: selectedQuest,
    sortedAvailable: Object.freeze(sortedAvailable),
  });
}
