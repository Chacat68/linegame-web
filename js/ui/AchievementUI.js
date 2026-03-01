// js/ui/AchievementUI.js — 成就界面
// 依赖：systems/achievement/AchievementSystem.js
// 导出：render

import * as Achievement from '../systems/achievement/AchievementSystem.js';

/**
 * 渲染成就面板
 * @param {object} state
 */
export function render(state) {
  const container = document.getElementById('achievement-list');
  if (!container) return;

  const all = Achievement.getAll(state);
  const unlocked = all.filter(function (a) { return a.unlocked; }).length;

  let html = '<div class="ach-header">🏆 成就 (' + unlocked + '/' + all.length + ')</div>';

  // 按类别分组
  const categories = {};
  all.forEach(function (ach) {
    if (!categories[ach.category]) categories[ach.category] = [];
    categories[ach.category].push(ach);
  });

  const catNames = {
    trade: '💰 贸易', wealth: '💎 财富', explore: '🚀 探索',
    tech: '🔬 科技', faction: '🏛️ 外交', level: '⭐ 等级', quest: '📋 任务',
  };

  Object.keys(categories).forEach(function (cat) {
    const achs = categories[cat];
    html += '<div class="ach-category">' + (catNames[cat] || cat) + '</div>';

    achs.forEach(function (ach) {
      html += '<div class="ach-card ' + (ach.unlocked ? 'ach-unlocked' : 'ach-locked') + '">' +
        '<span class="ach-icon">' + ach.icon + '</span>' +
        '<div class="ach-info">' +
          '<div class="ach-name">' + ach.name + '</div>' +
          '<div class="ach-desc">' + ach.description + '</div>' +
        '</div>' +
        (ach.unlocked ? '<span class="ach-check">✅</span>' : '<span class="ach-check">🔒</span>') +
        '</div>';
    });
  });

  container.innerHTML = html;
}
