// js/ui/QuestDetailPresenter.js — 任务 Context 与共享 L4 详情纯投影

import { QUEST_TYPES } from '../data/quests.js';
import * as Quest from '../systems/quest/QuestSystem.js';
import { getQuestObjectivePlanText } from './QuestObjectivePresenter.js';
import { getQuestTargetSystems } from './QuestRoutePresenter.js';
import { buildWorkspaceObjectDetailView } from './WorkspaceObjectDetailPresenter.js';
import { buildWorkspaceOpenDetailSlot } from './WorkspaceActionSlot.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _findQuest(state, questId) {
  if (!state || !questId) return null;
  var active = Quest.getActiveQuests(state);
  var available = Quest.getAvailableQuests(state);
  var locked = Quest.getLockedQuests(state);
  var quest = active.concat(available, locked).find(function (entry) { return entry.id === questId; });
  if (!quest) return null;
  var mode = active.some(function (entry) { return entry.id === quest.id; })
    ? 'active'
    : available.some(function (entry) { return entry.id === quest.id; }) ? 'available' : 'locked';
  return {
    quest: quest,
    mode: mode,
    status: mode === 'active' ? '进行中' : mode === 'available' ? '可接取' : '未解锁',
  };
}

export function buildQuestContextView(request) {
  var context = request && request.context;
  var state = request && request.state;
  if (!context || context.type !== 'quest' || !state) return null;
  var match = _findQuest(state, context.id);
  if (!match) return null;
  var quest = match.quest;
  var type = QUEST_TYPES[quest.type] || { icon: '📋', name: '任务' };
  var reward = Quest.getQuestRewardSummary(state, quest);
  var objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
  var completedObjectives = objectives.filter(function (objective) {
    return Number(objective.current) >= Number(objective.amount || 1);
  }).length;
  return Object.freeze({
    title: '任务检查',
    html: '<article class="workspace-context-card workspace-context-card--quest">' +
      '<div class="workspace-context-hero"><span aria-hidden="true">' + _escapeHtml(type.icon) + '</span><div><small>' + _escapeHtml(type.name) + '</small><h3>' + _escapeHtml(quest.name) + '</h3></div></div>' +
      '<p>' + _escapeHtml(quest.description || '暂无任务说明。') + '</p>' +
      '<div class="workspace-context-metrics" role="list">' +
        '<span role="listitem"><small>状态</small><strong>' + match.status + '</strong></span>' +
        '<span role="listitem"><small>目标</small><strong>' + completedObjectives + '/' + objectives.length + '</strong></span>' +
        '<span role="listitem"><small>积分</small><strong>' + Number(reward.credits || 0).toLocaleString() + '</strong></span>' +
        '<span role="listitem"><small>经验</small><strong>' + Number(reward.exp || 0).toLocaleString() + '</strong></span>' +
      '</div>' +
      '<div class="workspace-context-tags"><span>声望 +' + Number(reward.reputation || 0).toLocaleString() + '</span><span>' + (quest.timeLimit > 0 ? '限时 ' + quest.timeLimit + ' 天' : '不限时') + '</span></div>' +
      buildWorkspaceOpenDetailSlot({
        workspaceId: 'archive', contextType: 'quest', contextId: quest.id,
        label: '查看完整任务详情', attributes: { 'data-context-id': quest.id },
      }) +
    '</article>',
  });
}

export function buildQuestWorkspaceDetailView(request) {
  var detail = request && request.detail;
  var state = request && request.state;
  if (!detail || detail.type !== 'archive-quest' || !state) return null;
  var match = _findQuest(state, detail.id);
  if (!match) return null;
  var quest = match.quest;
  var type = QUEST_TYPES[quest.type] || { icon: '📋', name: '任务' };
  var reward = Quest.getQuestRewardSummary(state, quest);
  var objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
  var facts = objectives.map(function (objective, index) {
    var amount = Math.max(1, Number(objective.amount) || 1);
    var current = Math.max(0, Number(objective.current) || 0);
    return {
      label: '目标 ' + String(index + 1).padStart(2, '0'),
      value: getQuestObjectivePlanText(objective),
      detail: Math.min(current, amount) + '/' + amount + (current >= amount ? ' · 已完成' : ' · 待推进'),
    };
  });
  if (!facts.length && Array.isArray(quest.lockReasons)) {
    facts = quest.lockReasons.map(function (reason, index) {
      return { label: '解锁条件 ' + (index + 1), value: reason, detail: '满足后可接取' };
    });
  }
  var targets = getQuestTargetSystems(quest);
  facts.push({
    label: '目标地点',
    value: targets.length ? targets.map(function (system) { return system.name; }).join(' / ') : '无指定地点',
    detail: targets.length ? '按目标顺序规划航线' : '可在现有经营过程中推进',
  });
  facts.push({
    label: '奖励构成',
    value: Number(reward.credits || 0).toLocaleString() + ' 积分 · ' + Number(reward.exp || 0).toLocaleString() + ' 经验',
    detail: '声望 +' + Number(reward.reputation || 0).toLocaleString() + (reward.bonusText ? ' · ' + reward.bonusText : ''),
  });
  var view = buildWorkspaceObjectDetailView({
    id: quest.id,
    kind: 'quest',
    kindLabel: '任务',
    detailLabel: '任务详情',
    icon: type.icon || '📋',
    eyebrow: (type.name || quest.type || '任务') + ' · 第 ' + Number(quest.phase || 1) + ' 章',
    title: quest.name,
    description: quest.description || '暂无任务说明。',
    metrics: [
      { label: '状态', value: match.status },
      { label: '目标', value: objectives.filter(function (objective) { return Number(objective.current) >= Number(objective.amount || 1); }).length + '/' + objectives.length },
      { label: '积分', value: Number(reward.credits || 0).toLocaleString() },
      { label: '时限', value: quest.timeLimit > 0 ? quest.timeLimit + ' 天' : '不限时' },
    ],
    facts: facts,
    tags: [match.status, reward.routeLabel || '', quest.timeLimit > 0 ? '限时任务' : '常规任务'],
    note: '该详情汇总任务目标、奖励和地点事实；接取、放弃及路线操作仍在任务页确认。',
  });
  return view ? Object.freeze({ title: view.title, html: view.html }) : null;
}
