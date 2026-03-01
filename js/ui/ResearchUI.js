// js/ui/ResearchUI.js — 科技研究界面渲染
// 依赖：data/technologies.js, systems/research/ResearchSystem.js
// 导出：render

import { TECHNOLOGIES, TECH_CATEGORIES } from '../data/technologies.js';
import * as Research from '../systems/research/ResearchSystem.js';

/**
 * 渲染科技研究标签页
 * @param {object}   state
 * @param {Function} onStartResearch (techId) => void
 */
export function render(state, onStartResearch) {
  _renderStatus(state);
  _renderOptions(state, onStartResearch);
  _renderCompleted(state);
}

function _renderStatus(state) {
  const container = document.getElementById('research-status');
  if (!state.currentResearch) {
    container.innerHTML = '<p class="research-hint">🔬 选择一项科技开始研究</p>';
    return;
  }

  const tech = TECHNOLOGIES.find(function (t) { return t.id === state.currentResearch.techId; });
  const cat = TECH_CATEGORIES.find(function (c) { return c.id === tech.category; });
  const totalDays = tech.researchDays;
  const progress = ((totalDays - state.currentResearch.daysLeft) / totalDays * 100).toFixed(0);

  container.innerHTML =
    '<div class="research-active">' +
      '<div class="research-active-header">' +
        '<span class="research-cat-badge" style="background:' + cat.color + '22;color:' + cat.color + '">' + cat.icon + ' ' + cat.name + '</span>' +
        '<span class="research-days">剩余 ' + state.currentResearch.daysLeft + ' 天</span>' +
      '</div>' +
      '<div class="research-active-name">' + tech.icon + ' ' + tech.name + '</div>' +
      '<div class="mini-bar-track" style="margin-top:6px">' +
        '<div class="mini-bar-fill research-fill" style="width:' + progress + '%"></div>' +
      '</div>' +
      '<div class="research-effect-text">' + tech.effectText + '</div>' +
    '</div>';
}

function _renderOptions(state, onStartResearch) {
  const container = document.getElementById('research-options');

  if (state.currentResearch) {
    container.innerHTML = '<p class="research-hint" style="font-size:11px;color:var(--text-dim)">研究进行中……完成后将抽取新的科技选项</p>';
    return;
  }

  const options = state.researchOptions || [];
  if (options.length === 0) {
    container.innerHTML = '<p class="research-hint">所有可用科技已研究完毕！🎉</p>';
    return;
  }

  let html = '<div class="research-label">选择研究方向（三选一）</div><div class="research-cards">';
  options.forEach(function (techId) {
    const tech = TECHNOLOGIES.find(function (t) { return t.id === techId; });
    const cat = TECH_CATEGORIES.find(function (c) { return c.id === tech.category; });
    const canAfford = state.credits >= tech.cost;

    html +=
      '<div class="research-card' + (canAfford ? '' : ' unaffordable') + '" data-tech="' + tech.id + '">' +
        '<div class="research-card-header" style="border-left: 3px solid ' + cat.color + '">' +
          '<span class="research-cat-badge" style="background:' + cat.color + '22;color:' + cat.color + '">' + cat.icon + ' ' + cat.name + '</span>' +
          '<span class="research-tier">T' + tech.tier + '</span>' +
        '</div>' +
        '<div class="research-card-icon">' + tech.icon + '</div>' +
        '<div class="research-card-name">' + tech.name + '</div>' +
        '<div class="research-card-desc">' + tech.description + '</div>' +
        '<div class="research-card-effect">✨ ' + tech.effectText + '</div>' +
        '<div class="research-card-footer">' +
          '<span class="research-cost">💰 ' + tech.cost + '</span>' +
          '<span class="research-time">⏱️ ' + tech.researchDays + ' 天</span>' +
        '</div>' +
        '<button class="btn-research' + (canAfford ? '' : ' disabled') + '">开始研究</button>' +
      '</div>';
  });
  html += '</div>';

  container.innerHTML = html;

  // 绑定按钮事件
  container.querySelectorAll('.btn-research:not(.disabled)').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const card = btn.closest('.research-card');
      onStartResearch(card.dataset.tech);
    });
  });
}

function _renderCompleted(state) {
  const container = document.getElementById('research-completed');
  const completed = state.researchedTechs || [];
  if (completed.length === 0) {
    container.innerHTML = '';
    return;
  }

  let html = '<div class="research-label" style="margin-top:12px">已完成研究 (' + completed.length + '/' + TECHNOLOGIES.length + ')</div>';
  html += '<div class="completed-techs">';
  completed.forEach(function (techId) {
    const tech = TECHNOLOGIES.find(function (t) { return t.id === techId; });
    const cat = TECH_CATEGORIES.find(function (c) { return c.id === tech.category; });
    html += '<span class="completed-tech-badge" style="border-color:' + cat.color + '" title="' + tech.effectText + '">' + tech.icon + ' ' + tech.name + '</span>';
  });
  html += '</div>';
  container.innerHTML = html;
}
