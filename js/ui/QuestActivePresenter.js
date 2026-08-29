// js/ui/QuestActivePresenter.js — 进行中任务进度、路线与操作纯投影

import { QUEST_TYPES } from '../data/quests.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import { getQuestObjectiveText } from './QuestObjectivePresenter.js';
import {
  getQuestTargetSystems,
  renderQuestDispatchBlocker,
  renderQuestDispatchRecommendation,
  renderQuestRoutePreview,
  renderQuestTargetSystems,
} from './QuestRoutePresenter.js';
import { escapeQuestHtml, escapeQuestHtmlAttr } from './QuestPresentationSupport.js';

function _renderActiveQuestDetails(request) {
  var input = request || {};
  var state = input.state;
  var quest = input.quest;
  var routePreview = input.routePreview;
  var html = renderQuestTargetSystems(getQuestTargetSystems(quest), state.currentSystem);
  html += renderQuestRoutePreview(routePreview, {
    compact: true,
    title: '当前航线',
    caption: '按现状继续推进',
  });
  if (input.activeQuestRecommendation && input.activeQuestRecommendation.questId === quest.id) {
    html += renderQuestDispatchRecommendation(input.activeQuestRecommendation, !!input.canApplyQuestDispatch);
  } else {
    html += renderQuestDispatchBlocker(
      quest,
      routePreview,
      !!input.canResolveQuestBlocker,
      input.fallbackQuest || null,
      state
    );
  }
  var reward = Quest.getQuestRewardSummary(state, quest);
  html += '<div class="quest-rewards">' +
    '<span>🎁 奖励:</span>' +
    '<span>💰 ' + escapeQuestHtml(reward.credits) + '</span>' +
    '<span>⭐ ' + escapeQuestHtml(reward.exp) + ' 经验</span>' +
    '<span>🏅 ' + escapeQuestHtml(reward.reputation) + ' 声望</span>' +
    (reward.hasDecisionBonus ? '<span title="' + escapeQuestHtmlAttr(reward.bonusText) + '">🧭 分支加成</span>' : '') +
    '</div>';
  html += '<button type="button" class="btn-action quest-abandon-btn" data-id="' + escapeQuestHtmlAttr(quest.id) + '" data-name="' + escapeQuestHtmlAttr(quest.name) + '">放弃</button>';
  return html;
}

export function buildQuestActiveView(request) {
  var input = request || {};
  var state = input.state;
  if (!state) return null;
  var active = Array.isArray(input.active) ? input.active : Quest.getActiveQuests(state);
  var activeQuestRecommendation = input.activeQuestRecommendation || null;
  var recommendedActiveQuest = input.recommendedActiveQuest || (activeQuestRecommendation
    ? active.find(function (quest) { return quest.id === activeQuestRecommendation.questId; }) || null
    : null);
  if (active.length === 0) {
    return Object.freeze({ html: '', recommendedActiveQuest: recommendedActiveQuest });
  }

  var html = '<section class="quest-module quest-module-active">' +
    '<div class="quest-section-title">📋 进行中 (' + active.length + '/5)</div>' +
    '<div class="quest-active-grid" role="list" aria-label="进行中任务">';
  active.forEach(function (quest) {
    var typeInfo = QUEST_TYPES[quest.type] || {};
    var timeLeft = quest.timeLimit > 0
      ? '⏰ 剩余 ' + Math.max(0, quest.timeLimit - (state.day - quest.startDay)) + ' 天'
      : '';
    var routePreview = Quest.getQuestRoutePreview(state, quest, 2);
    var isFocusedQuest = recommendedActiveQuest
      ? recommendedActiveQuest.id === quest.id
      : active[0].id === quest.id;
    var detailsHtml = _renderActiveQuestDetails({
      activeQuestRecommendation: activeQuestRecommendation,
      canApplyQuestDispatch: input.canApplyQuestDispatch,
      canResolveQuestBlocker: input.canResolveQuestBlocker,
      fallbackQuest: input.fallbackQuest,
      quest: quest,
      routePreview: routePreview,
      state: state,
    });

    html += '<article class="quest-card active-quest" role="listitem" tabindex="0" data-quest-id="' + escapeQuestHtmlAttr(quest.id) + '" data-quest-state="active" aria-label="' + escapeQuestHtmlAttr(quest.name + '，进行中') + '">' +
      '<div class="quest-card-header">' +
        '<span class="quest-type-badge" style="background:' + escapeQuestHtmlAttr(typeInfo.color || '#666') + '">' +
          escapeQuestHtml(typeInfo.icon || '📋') + ' ' + escapeQuestHtml(typeInfo.name || quest.type) + '</span>' +
        '<span class="quest-time">' + escapeQuestHtml(timeLeft) + '</span>' +
      '</div>' +
      '<div class="quest-name">' + escapeQuestHtml(quest.name) + '</div>' +
      '<div class="quest-desc">' + escapeQuestHtml(quest.description) + '</div>';
    (quest.objectives || []).forEach(function (objective) {
      var objectiveText = getQuestObjectiveText(objective);
      var pct = Math.min(100, Math.round((objective.current / (objective.amount || 1)) * 100));
      html += '<div class="quest-objective">' +
        '<div class="quest-obj-text">' + escapeQuestHtml(objectiveText) + '</div>' +
        '<div class="quest-progress-track" role="progressbar" aria-label="' + escapeQuestHtmlAttr(objectiveText) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '">' +
          '<div class="quest-progress-fill" style="width:' + pct + '%"></div>' +
        '</div>' +
        '<span class="quest-obj-count">' + escapeQuestHtml(objective.current) + '/' + escapeQuestHtml(objective.amount || 1) + '</span>' +
      '</div>';
    });
    html += isFocusedQuest
      ? '<div class="quest-active-focus-details">' + detailsHtml + '</div>'
      : '<details class="quest-active-details"><summary>查看路线、奖励与操作</summary>' +
          '<div class="quest-active-details-body">' + detailsHtml + '</div></details>';
    html += '</article>';
  });
  html += '</div></section>';
  return Object.freeze({ html: html, recommendedActiveQuest: recommendedActiveQuest });
}
