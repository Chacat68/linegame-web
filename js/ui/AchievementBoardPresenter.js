// js/ui/AchievementBoardPresenter.js — 成就总览、分类与卡片纯投影

import * as Achievement from '../systems/achievement/AchievementSystem.js';

const CATEGORY_META = Object.freeze({
  trade: { label: '贸易', code: 'TRD' }, wealth: { label: '财富', code: 'CRD' },
  explore: { label: '探索', code: 'EXP' }, tech: { label: '科技', code: 'TEC' },
  faction: { label: '外交', code: 'DIP' }, level: { label: '等级', code: 'LVL' },
  quest: { label: '任务', code: 'QST' }, fleet: { label: '舰队', code: 'FLT' },
  specialist: { label: '专精', code: 'SPC' }, special: { label: '特殊', code: 'SPL' },
});
const CATEGORY_ORDER = Object.freeze(['trade', 'wealth', 'explore', 'tech', 'faction', 'level', 'quest', 'fleet', 'specialist', 'special']);

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _formatReward(reward) {
  var input = reward || {};
  var parts = [];
  if (input.credits) parts.push('信用积分 +' + Number(input.credits).toLocaleString());
  if (input.exp) parts.push('经验 +' + Number(input.exp).toLocaleString());
  if (input.reputation) parts.push('声望 +' + Number(input.reputation).toLocaleString());
  return parts.length ? parts.join(' / ') : '无即时奖励';
}

function _getCategoryMeta(category) {
  return CATEGORY_META[category] || { label: category, code: String(category || 'ACH').slice(0, 3).toUpperCase() };
}

function _getRewardBacklog(achievements) {
  return achievements.reduce(function (total, achievement) {
    var reward = achievement.reward || {};
    total.credits += Number(reward.credits) || 0;
    total.exp += Number(reward.exp) || 0;
    total.reputation += Number(reward.reputation) || 0;
    return total;
  }, { credits: 0, exp: 0, reputation: 0 });
}

function _formatRewardBacklog(backlog) {
  var parts = [];
  if (backlog.credits) parts.push('信用积分 ' + Number(backlog.credits).toLocaleString());
  if (backlog.exp) parts.push('经验 ' + Number(backlog.exp).toLocaleString());
  if (backlog.reputation) parts.push('声望 ' + Number(backlog.reputation).toLocaleString());
  return parts.length ? parts.join(' / ') : '奖励池已清空';
}

export function getAchievementCategoryStatus(category, achievements) {
  var items = Array.isArray(achievements) ? achievements : [];
  var unlocked = items.filter(function (achievement) { return achievement.unlocked; }).length;
  var total = items.length;
  var meta = _getCategoryMeta(category);
  return Object.freeze({
    category: category,
    label: meta.label,
    code: meta.code,
    unlocked: unlocked,
    total: total,
    pending: Math.max(0, total - unlocked),
    pct: total ? Math.round(unlocked / total * 100) : 0,
    achievements: items,
  });
}

function _renderAchievementDistribution(statuses) {
  if (!statuses.length) return '';
  return '<div class="achievement-distribution-grid" role="list" aria-label="成就分类分布">' + statuses.map(function (status) {
    return '<div class="achievement-distribution-row" role="listitem"><span class="achievement-distribution-code">' + _escapeHtml(status.code) + '</span><strong class="achievement-distribution-label">' + _escapeHtml(status.label) + '</strong><em class="achievement-distribution-count">' + status.unlocked + '/' + status.total + '</em><i class="achievement-distribution-meter" aria-hidden="true"><b style="width:' + status.pct + '%"></b></i></div>';
  }).join('') + '</div>';
}

function _renderAchievementFocus(statuses, lockedAchievements) {
  var focusStatus = statuses.filter(function (status) { return status.pending > 0; }).slice().sort(function (a, b) {
    return b.pct !== a.pct ? b.pct - a.pct : a.pending - b.pending;
  })[0] || null;
  var focusAchievements = focusStatus
    ? focusStatus.achievements.filter(function (achievement) { return !achievement.unlocked; }).slice(0, 3)
    : lockedAchievements.slice(0, 3);
  var backlog = _getRewardBacklog(lockedAchievements);
  var focusTitle = focusStatus ? (focusStatus.label + ' 档案还差 ' + focusStatus.pending + ' 项') : '所有成就均已归档';
  var focusNote = focusStatus ? '这是最接近完成的分类，优先完成这些项目能更快拿到分类进度。' : '成就列表已全部点亮，奖励池没有剩余待领取项。';
  return '<section class="archive-achievement-focus" aria-label="成就完成状态"><div class="achievement-focus-copy"><span class="achievement-focus-kicker">完成进度</span><strong class="achievement-focus-title">' + _escapeHtml(focusTitle) + '</strong><span class="achievement-focus-note">' + _escapeHtml(focusNote) + '</span></div>' +
    '<div class="achievement-focus-list" role="list" aria-label="待完成成就">' + (focusAchievements.length > 0 ? focusAchievements.map(function (achievement) {
      return '<article class="achievement-focus-card" role="listitem"><span class="achievement-focus-icon" aria-hidden="true">' + _escapeHtml(achievement.icon) + '</span><span class="achievement-focus-main"><strong>' + _escapeHtml(achievement.name) + '</strong><em>' + _escapeHtml(_formatReward(achievement.reward)) + '</em></span></article>';
    }).join('') : '<div class="achievement-focus-empty" role="listitem">暂无待完成成就。</div>') + '</div>' +
    '<div class="achievement-reward-backlog" aria-label="未解锁奖励池"><span>未解锁奖励池</span><strong>' + _escapeHtml(_formatRewardBacklog(backlog)) + '</strong><em>' + lockedAchievements.length + ' 项待完成</em></div></section>';
}

function _renderAchievementCategory(category, achievements) {
  var meta = _getCategoryMeta(category);
  var unlocked = achievements.filter(function (achievement) { return achievement.unlocked; }).length;
  var pct = achievements.length ? Math.round(unlocked / achievements.length * 100) : 0;
  return '<section class="ach-category-section" aria-labelledby="ach-category-' + _escapeHtml(category) + '"><div class="ach-category"><div><span class="ach-category-code">' + _escapeHtml(meta.code) + '</span><h4 id="ach-category-' + _escapeHtml(category) + '">' + _escapeHtml(meta.label) + '</h4></div><div class="ach-category-progress" role="progressbar" aria-label="' + _escapeHtml(meta.label) + '分类完成度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span>' + unlocked + '/' + achievements.length + '</span><i style="width:' + pct + '%"></i></div></div><div class="ach-card-grid" role="list">' + achievements.map(function (achievement) {
    var stateLabel = achievement.unlocked ? '已解锁' : '待完成';
    return '<article class="ach-card ' + (achievement.unlocked ? 'ach-unlocked' : 'ach-locked') + '" role="listitem" tabindex="0" data-achievement-id="' + _escapeHtml(achievement.id) + '" data-achievement-state="' + (achievement.unlocked ? 'unlocked' : 'locked') + '" aria-label="' + _escapeHtml(achievement.name + '，' + stateLabel) + '"><span class="ach-icon" aria-hidden="true">' + _escapeHtml(achievement.icon) + '</span><div class="ach-info"><div class="ach-name">' + _escapeHtml(achievement.name) + '</div><div class="ach-desc">' + _escapeHtml(achievement.description) + '</div><div class="ach-reward">' + _escapeHtml(_formatReward(achievement.reward)) + '</div></div><span class="ach-check">' + stateLabel + '</span></article>';
  }).join('') + '</div></section>';
}

export function buildAchievementBoardView(request) {
  var state = request && request.state;
  if (!state) return null;
  var all = Achievement.getAll(state);
  var unlocked = all.filter(function (achievement) { return achievement.unlocked; }).length;
  var pct = all.length ? Math.round(unlocked / all.length * 100) : 0;
  var categories = Object.create(null);
  all.forEach(function (achievement) {
    if (!categories[achievement.category]) categories[achievement.category] = [];
    categories[achievement.category].push(achievement);
  });
  var orderedCategories = CATEGORY_ORDER.filter(function (category) { return categories[category]; }).concat(Object.keys(categories).filter(function (category) { return CATEGORY_ORDER.indexOf(category) === -1; }));
  var statuses = orderedCategories.map(function (category) { return getAchievementCategoryStatus(category, categories[category]); });
  var locked = all.filter(function (achievement) { return !achievement.unlocked; });
  var html = '<section class="archive-achievement-console" aria-label="成就总览"><div class="ach-header"><div><span class="archive-panel-kicker">ACHIEVEMENT LEDGER</span><h3 class="archive-panel-title">成就档案</h3></div><div class="ach-completion-orb" role="progressbar" aria-label="成就完成度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><strong>' + pct + '%</strong><span>' + unlocked + '/' + all.length + '</span></div></div><div class="archive-stat-strip archive-stat-strip--achievement"><span><strong>' + unlocked + '</strong><em>已解锁</em></span><span><strong>' + (all.length - unlocked) + '</strong><em>待完成</em></span><span><strong>' + orderedCategories.length + '</strong><em>分类</em></span></div>' + _renderAchievementDistribution(statuses) + _renderAchievementFocus(statuses, locked) + '</section>' + orderedCategories.map(function (category) { return _renderAchievementCategory(category, categories[category]); }).join('');
  return Object.freeze({ html: html, unlockedCount: unlocked, totalCount: all.length });
}
