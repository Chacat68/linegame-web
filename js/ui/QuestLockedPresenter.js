// js/ui/QuestLockedPresenter.js — 未解锁任务与章节完成状态纯投影

import { QUEST_TYPES } from '../data/quests.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import { escapeQuestHtml, escapeQuestHtmlAttr } from './QuestPresentationSupport.js';

export function buildQuestLockedView(request) {
  var input = request || {};
  var state = input.state;
  if (!state) return null;
  var locked = Array.isArray(input.locked) ? input.locked : Quest.getLockedQuests(state);
  var phase = input.currentPhaseProgress || {};
  var html = '<details class="quest-module quest-module-locked quest-locked-details">';
  if (locked.length > 0) {
    html += '<summary>查看后续任务（' + locked.length + '）</summary>' +
      '<div class="quest-locked-grid" role="list" aria-label="未解锁任务">';
    locked.forEach(function (quest) {
      var typeInfo = QUEST_TYPES[quest.type] || {};
      var reward = Quest.getQuestRewardSummary(state, quest);
      html += '<article class="quest-card locked-quest" role="listitem" tabindex="0" data-quest-id="' + escapeQuestHtmlAttr(quest.id) + '" data-quest-state="locked" aria-label="' + escapeQuestHtmlAttr(quest.name + '，未解锁') + '">' +
        '<div class="quest-card-header"><span class="quest-type-badge" style="background:' + escapeQuestHtmlAttr(typeInfo.color || '#666') + '; opacity:0.6">' +
          escapeQuestHtml(typeInfo.icon || '📋') + ' ' + escapeQuestHtml(typeInfo.name || quest.type) + '</span></div>' +
        '<div class="quest-name" style="opacity:0.7">🔒 ' + escapeQuestHtml(quest.name) + '</div>' +
        '<div class="quest-desc" style="opacity:0.5">' + escapeQuestHtml(quest.description) + '</div>' +
        '<div class="quest-lock-reasons">' + (quest.lockReasons || []).map(function (reason) {
          return '<div class="quest-lock-reason">⚠️ ' + escapeQuestHtml(reason) + '</div>';
        }).join('') + '</div>' +
        '<div class="quest-rewards" style="opacity:0.5">' +
          '<span>🎁</span><span>💰 ' + escapeQuestHtml(reward.credits) + '</span>' +
          '<span>⭐ ' + escapeQuestHtml(reward.exp) + '</span>' +
          '<span>🏅 ' + escapeQuestHtml(reward.reputation) + '</span>' +
          (reward.hasDecisionBonus ? '<span title="' + escapeQuestHtmlAttr(reward.bonusText) + '">🧭 分支加成</span>' : '') +
        '</div>' +
      '</article>';
    });
    html += '</div>';
  } else {
    html += '<summary>后续任务</summary>';
    if (phase.isFinalPhase && phase.isComplete) {
      html += '<div class="quest-empty">🏁 最终章晋升条件已完成，未完成支线仍可继续挑战。</div>';
    } else if (phase.isComplete) {
      html += '<div class="quest-empty">✅ 当前章节的核心任务与支线配额已完成，下一次结算将进入新章节。</div>';
    }
  }
  html += '</details>';
  return Object.freeze({ html: html });
}
