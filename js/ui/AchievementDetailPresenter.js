// js/ui/AchievementDetailPresenter.js — 成就 Context 与共享 L4 详情纯投影

import * as Achievement from '../systems/achievement/AchievementSystem.js';
import { buildWorkspaceObjectDetailView } from './WorkspaceObjectDetailPresenter.js';
import { buildWorkspaceOpenDetailSlot } from './WorkspaceActionSlot.js';

const CATEGORY_META = Object.freeze({
  trade: { label: '贸易', code: 'TRD' }, wealth: { label: '财富', code: 'CRD' },
  explore: { label: '探索', code: 'EXP' }, tech: { label: '科技', code: 'TEC' },
  faction: { label: '外交', code: 'DIP' }, level: { label: '等级', code: 'LVL' },
  quest: { label: '任务', code: 'QST' }, fleet: { label: '舰队', code: 'FLT' },
  specialist: { label: '专精', code: 'SPC' }, special: { label: '特殊', code: 'SPL' },
});

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getCategoryMeta(category) {
  return CATEGORY_META[category] || { label: category, code: String(category || 'ACH').slice(0, 3).toUpperCase() };
}

function _formatReward(reward) {
  var input = reward || {};
  var parts = [];
  if (input.credits) parts.push('信用积分 +' + Number(input.credits).toLocaleString());
  if (input.exp) parts.push('经验 +' + Number(input.exp).toLocaleString());
  if (input.reputation) parts.push('声望 +' + Number(input.reputation).toLocaleString());
  return parts.length ? parts.join(' / ') : '无即时奖励';
}

function _findAchievement(state, achievementId) {
  return Achievement.getAll(state).find(function (entry) { return entry.id === achievementId; }) || null;
}

export function buildAchievementContextView(request) {
  var context = request && request.context;
  var state = request && request.state;
  if (!context || context.type !== 'achievement' || !state) return null;
  var achievement = _findAchievement(state, context.id);
  if (!achievement) return null;
  var category = _getCategoryMeta(achievement.category);
  var html = '<article class="workspace-context-card workspace-context-card--achievement">' +
    '<div class="workspace-context-hero"><span aria-hidden="true">' + _escapeHtml(achievement.icon) + '</span><div><small>' + _escapeHtml(category.label) + '</small><h3>' + _escapeHtml(achievement.name) + '</h3></div></div>' +
    '<p>' + _escapeHtml(achievement.description) + '</p>' +
    '<div class="workspace-context-metrics" role="list"><span role="listitem"><small>状态</small><strong>' + (achievement.unlocked ? '已解锁' : '待完成') + '</strong></span><span role="listitem"><small>奖励</small><strong>' + _escapeHtml(_formatReward(achievement.reward)) + '</strong></span></div>' +
    buildWorkspaceOpenDetailSlot({
      workspaceId: 'archive',
      contextType: 'achievement',
      contextId: achievement.id,
      label: '查看完整成就详情',
      attributes: { 'data-context-id': achievement.id },
    }) +
  '</article>';
  return Object.freeze({ title: '成就检查', html: html });
}

export function buildAchievementWorkspaceDetailView(request) {
  var detail = request && request.detail;
  var state = request && request.state;
  if (!detail || detail.type !== 'archive-achievement' || !state) return null;
  var achievements = Achievement.getAll(state);
  var achievement = achievements.find(function (entry) { return entry.id === detail.id; });
  if (!achievement) return null;
  var category = _getCategoryMeta(achievement.category);
  var categoryAchievements = achievements.filter(function (entry) { return entry.category === achievement.category; });
  var categoryUnlocked = categoryAchievements.filter(function (entry) { return entry.unlocked; }).length;
  var totalUnlocked = achievements.filter(function (entry) { return entry.unlocked; }).length;
  var reward = achievement.reward || {};
  var view = buildWorkspaceObjectDetailView({
    id: achievement.id,
    kind: 'achievement',
    kindLabel: '成就',
    detailLabel: '成就详情',
    icon: achievement.icon || '🏆',
    eyebrow: category.label + ' · ' + category.code,
    title: achievement.name,
    description: achievement.description || '暂无成就说明。',
    metrics: [
      { label: '状态', value: achievement.unlocked ? '已解锁' : '待完成' },
      { label: '分类', value: category.label },
      { label: '分类进度', value: categoryUnlocked + '/' + categoryAchievements.length },
      { label: '总进度', value: totalUnlocked + '/' + achievements.length },
    ],
    facts: [
      { label: '解锁目标', value: achievement.description || '完成登记条件', detail: achievement.unlocked ? '当前存档已完成' : '尚未满足条件' },
      { label: '奖励总览', value: _formatReward(reward), detail: achievement.unlocked ? '奖励已在解锁时结算' : '达成后自动结算' },
      { label: '积分奖励', value: Number(reward.credits || 0).toLocaleString(), detail: '信用积分' },
      { label: '成长奖励', value: Number(reward.exp || 0).toLocaleString() + ' 经验 · ' + Number(reward.reputation || 0).toLocaleString() + ' 声望', detail: '未登记的奖励项按 0 计' },
    ],
    tags: [achievement.unlocked ? '已解锁' : '待完成', category.label, category.code],
    note: '该详情只陈述成就条件、分类与奖励；成就由真实游戏行为自动检查和结算。',
  });
  return view ? Object.freeze({ title: view.title, html: view.html }) : null;
}
