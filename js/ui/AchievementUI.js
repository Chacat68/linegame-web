// js/ui/AchievementUI.js — 成就界面
// 依赖：systems/achievement/AchievementSystem.js
// 导出：render

import * as Achievement from '../systems/achievement/AchievementSystem.js';

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

const CATEGORY_META = {
  trade: { label: '贸易', code: 'TRD' },
  wealth: { label: '财富', code: 'CRD' },
  explore: { label: '探索', code: 'EXP' },
  tech: { label: '科技', code: 'TEC' },
  faction: { label: '外交', code: 'DIP' },
  level: { label: '等级', code: 'LVL' },
  quest: { label: '任务', code: 'QST' },
  fleet: { label: '舰队', code: 'FLT' },
  specialist: { label: '专精', code: 'SPC' },
  special: { label: '特殊', code: 'SPL' },
};

const CATEGORY_ORDER = ['trade', 'wealth', 'explore', 'tech', 'faction', 'level', 'quest', 'fleet', 'specialist', 'special'];

function _formatReward(reward) {
  reward = reward || {};
  const parts = [];
  if (reward.credits) parts.push('信用积分 +' + Number(reward.credits).toLocaleString());
  if (reward.exp) parts.push('经验 +' + Number(reward.exp).toLocaleString());
  if (reward.reputation) parts.push('声望 +' + Number(reward.reputation).toLocaleString());
  return parts.length ? parts.join(' / ') : '无即时奖励';
}

function _getCategoryMeta(category) {
  return CATEGORY_META[category] || { label: category, code: String(category || 'ACH').slice(0, 3).toUpperCase() };
}

function _getRewardBacklog(achievements) {
  return achievements.reduce(function (total, ach) {
    const reward = ach.reward || {};
    total.credits += reward.credits || 0;
    total.exp += reward.exp || 0;
    total.reputation += reward.reputation || 0;
    return total;
  }, { credits: 0, exp: 0, reputation: 0 });
}

function _formatRewardBacklog(backlog) {
  const parts = [];
  if (backlog.credits) parts.push('信用积分 ' + Number(backlog.credits).toLocaleString());
  if (backlog.exp) parts.push('经验 ' + Number(backlog.exp).toLocaleString());
  if (backlog.reputation) parts.push('声望 ' + Number(backlog.reputation).toLocaleString());
  return parts.length ? parts.join(' / ') : '奖励池已清空';
}

function _getAchievementCategoryStatus(category, achievements) {
  const unlocked = achievements.filter(function (ach) { return ach.unlocked; }).length;
  const total = achievements.length;
  const pct = total ? Math.round(unlocked / total * 100) : 0;
  const meta = _getCategoryMeta(category);
  return {
    category: category,
    label: meta.label,
    code: meta.code,
    unlocked: unlocked,
    total: total,
    pending: Math.max(0, total - unlocked),
    pct: pct,
    achievements: achievements,
  };
}

function _renderAchievementDistribution(statuses) {
  if (!statuses.length) return '';

  return '<div class="achievement-distribution-grid" role="list" aria-label="成就分类分布">' +
    statuses.map(function (status) {
      return '<div class="achievement-distribution-row" role="listitem">' +
        '<span class="achievement-distribution-code">' + _escapeHtml(status.code) + '</span>' +
        '<strong class="achievement-distribution-label">' + _escapeHtml(status.label) + '</strong>' +
        '<em class="achievement-distribution-count">' + status.unlocked + '/' + status.total + '</em>' +
        '<i class="achievement-distribution-meter" aria-hidden="true"><b style="width:' + status.pct + '%"></b></i>' +
      '</div>';
    }).join('') +
  '</div>';
}

function _renderAchievementFocus(statuses, lockedAchievements) {
  const incompleteStatuses = statuses.filter(function (status) { return status.pending > 0; });
  const focusStatus = incompleteStatuses.slice().sort(function (a, b) {
    if (b.pct !== a.pct) return b.pct - a.pct;
    return a.pending - b.pending;
  })[0] || null;
  const focusAchievements = focusStatus
    ? focusStatus.achievements.filter(function (ach) { return !ach.unlocked; }).slice(0, 3)
    : lockedAchievements.slice(0, 3);
  const backlog = _getRewardBacklog(lockedAchievements);
  const focusTitle = focusStatus
    ? (focusStatus.label + ' 档案还差 ' + focusStatus.pending + ' 项')
    : '所有成就均已归档';
  const focusNote = focusStatus
    ? ('这是当前最接近补齐的分类，先扫这些待完成项能最快收拢分类进度。')
    : '成就列表已全部点亮，奖励池没有剩余待领取项。';

  return '<section class="archive-achievement-focus" aria-label="成就局部焦点">' +
    '<div class="achievement-focus-copy">' +
      '<span class="achievement-focus-kicker">局部信号</span>' +
      '<strong class="achievement-focus-title">' + _escapeHtml(focusTitle) + '</strong>' +
      '<span class="achievement-focus-note">' + _escapeHtml(focusNote) + '</span>' +
    '</div>' +
    '<div class="achievement-focus-list" role="list" aria-label="待完成成就焦点">' +
      (focusAchievements.length > 0
        ? focusAchievements.map(function (ach) {
            return '<article class="achievement-focus-card" role="listitem">' +
              '<span class="achievement-focus-icon" aria-hidden="true">' + _escapeHtml(ach.icon) + '</span>' +
              '<span class="achievement-focus-main">' +
                '<strong>' + _escapeHtml(ach.name) + '</strong>' +
                '<em>' + _escapeHtml(_formatReward(ach.reward)) + '</em>' +
              '</span>' +
            '</article>';
          }).join('')
        : '<div class="achievement-focus-empty" role="listitem">暂无待完成焦点。</div>') +
    '</div>' +
    '<div class="achievement-reward-backlog" aria-label="未解锁奖励池">' +
      '<span>未解锁奖励池</span>' +
      '<strong>' + _escapeHtml(_formatRewardBacklog(backlog)) + '</strong>' +
      '<em>' + lockedAchievements.length + ' 项待完成</em>' +
    '</div>' +
  '</section>';
}

/**
 * 渲染成就面板
 * @param {object} state
 */
export function render(state) {
  const container = document.getElementById('achievement-list');
  if (!container) return;

  const all = Achievement.getAll(state);
  const unlocked = all.filter(function (a) { return a.unlocked; }).length;
  const pct = all.length ? Math.round(unlocked / all.length * 100) : 0;

  const categories = {};
  all.forEach(function (ach) {
    if (!categories[ach.category]) categories[ach.category] = [];
    categories[ach.category].push(ach);
  });

  const orderedCategories = CATEGORY_ORDER.filter(function (category) {
    return categories[category];
  }).concat(Object.keys(categories).filter(function (category) {
    return CATEGORY_ORDER.indexOf(category) === -1;
  }));
  const categoryStatuses = orderedCategories.map(function (category) {
    return _getAchievementCategoryStatus(category, categories[category]);
  });
  const lockedAchievements = all.filter(function (ach) { return !ach.unlocked; });

  let html =
    '<section class="archive-achievement-console" aria-label="成就总览">' +
      '<div class="ach-header">' +
        '<div>' +
          '<span class="archive-panel-kicker">ACHIEVEMENT LEDGER</span>' +
          '<h3 class="archive-panel-title">成就档案</h3>' +
        '</div>' +
        '<div class="ach-completion-orb" role="progressbar" aria-label="成就完成度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '">' +
          '<strong>' + pct + '%</strong><span>' + unlocked + '/' + all.length + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="archive-stat-strip archive-stat-strip--achievement">' +
        '<span><strong>' + unlocked + '</strong><em>已解锁</em></span>' +
        '<span><strong>' + (all.length - unlocked) + '</strong><em>待完成</em></span>' +
        '<span><strong>' + orderedCategories.length + '</strong><em>分类</em></span>' +
      '</div>' +
      _renderAchievementDistribution(categoryStatuses) +
      _renderAchievementFocus(categoryStatuses, lockedAchievements) +
    '</section>';

  orderedCategories.forEach(function (cat) {
    const achs = categories[cat];
    const meta = _getCategoryMeta(cat);
    const catUnlocked = achs.filter(function (ach) { return ach.unlocked; }).length;
    const catPct = achs.length ? Math.round(catUnlocked / achs.length * 100) : 0;

    html +=
      '<section class="ach-category-section" aria-labelledby="ach-category-' + _escapeHtmlAttr(cat) + '">' +
        '<div class="ach-category">' +
          '<div>' +
            '<span class="ach-category-code">' + _escapeHtml(meta.code) + '</span>' +
            '<h4 id="ach-category-' + _escapeHtmlAttr(cat) + '">' + _escapeHtml(meta.label) + '</h4>' +
          '</div>' +
          '<div class="ach-category-progress" role="progressbar" aria-label="' + _escapeHtmlAttr(meta.label) + '分类完成度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + catPct + '">' +
            '<span>' + catUnlocked + '/' + achs.length + '</span>' +
            '<i style="width:' + catPct + '%"></i>' +
          '</div>' +
        '</div>' +
        '<div class="ach-card-grid" role="list">';

    achs.forEach(function (ach) {
      const stateLabel = ach.unlocked ? '已解锁' : '待完成';
      html += '<article class="ach-card ' + (ach.unlocked ? 'ach-unlocked' : 'ach-locked') + '" role="listitem" data-achievement-state="' + (ach.unlocked ? 'unlocked' : 'locked') + '" aria-label="' + _escapeHtmlAttr(ach.name + '，' + stateLabel) + '">' +
          '<span class="ach-icon" aria-hidden="true">' + _escapeHtml(ach.icon) + '</span>' +
          '<div class="ach-info">' +
            '<div class="ach-name">' + _escapeHtml(ach.name) + '</div>' +
            '<div class="ach-desc">' + _escapeHtml(ach.description) + '</div>' +
            '<div class="ach-reward">' + _escapeHtml(_formatReward(ach.reward)) + '</div>' +
          '</div>' +
          '<span class="ach-check">' + stateLabel + '</span>' +
        '</article>';
    });

    html += '</div></section>';
  });

  container.innerHTML = html;
}
