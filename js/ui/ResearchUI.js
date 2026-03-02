// js/ui/ResearchUI.js — 科技研究界面渲染
// 依赖：data/technologies.js, systems/research/ResearchSystem.js
// 导出：render

import { TECHNOLOGIES, TECH_CATEGORIES } from '../data/technologies.js';
import * as Research from '../systems/research/ResearchSystem.js';

/**
 * 渲染科技研究标签页
 * @param {object}   state
 * @param {Function} onStartResearch (techId) => void
 * @param {Function} onCancelQueuedResearch (techId) => void
 * @param {Function} onMoveQueuedResearchUp (techId) => void
 * @param {Function} onMoveQueuedResearchDown (techId) => void
 * @param {Function} onClearResearchQueue () => void
 */
export function render(state, onStartResearch, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue) {
  _renderStatus();
  _renderOptions(state, onStartResearch, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue);
  _renderCompleted(state);
}

function _renderStatus() {
  const container = document.getElementById('research-status');
  if (!container) return;
  container.innerHTML = '';
}

function _renderOptions(state, onStartResearch, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue) {
  const container = document.getElementById('research-options');

  let html = _renderResearchOverview(state);
  const options = state.researchOptions || [];
  if (options.length === 0) {
    html += '<p class="research-hint">所有可用科技已研究完毕！🎉</p>';
    container.innerHTML = html;
    _bindQueueActions(container, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue);
    return;
  }

  const queueMode = !!state.currentResearch;
  const queueLen = (state.researchQueue || []).length;
  html += '<div class="research-label">' + (queueMode ? '可加入研究队列（当前排队 ' + queueLen + ' 项）' : '选择研究方向（三选一）') + '</div><div class="research-cards">';
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
        '<button class="btn-research">' + (queueMode ? '加入队列' : '开始研究') + '</button>' +
      '</div>';
  });
  html += '</div>';

  container.innerHTML = html;
  _bindQueueActions(container, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue);

  // 绑定按钮事件
  container.querySelectorAll('.btn-research').forEach(function (btn) {
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

function _renderResearchOverview(state) {
  if (!state.currentResearch) {
    const queueWhenIdle = state.researchQueue || [];
    if (queueWhenIdle.length === 0) {
      return '<p class="research-hint">🔬 选择一项科技开始研究</p>';
    }
    return _renderQueueHtml(queueWhenIdle, '🗂️ 研究队列（待启动）');
  }

  const tech = TECHNOLOGIES.find(function (t) { return t.id === state.currentResearch.techId; });
  const cat = TECH_CATEGORIES.find(function (c) { return c.id === tech.category; });
  const totalDays = tech.researchDays;
  const progress = ((totalDays - state.currentResearch.daysLeft) / totalDays * 100).toFixed(0);

  let html =
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

  const queue = state.researchQueue || [];
  if (queue.length > 0) {
    html += _renderQueueHtml(queue, '🗂️ 研究队列（' + queue.length + '）');
  }

  return html;
}

function _renderQueueHtml(queue, title) {
  let html = '<div class="research-queue">' +
    '<div class="research-queue-head">' +
      '<div class="research-queue-title">' + title + '</div>' +
      '<button class="btn-queue-action queue-clear-btn">清空队列</button>' +
    '</div>';
  queue.forEach(function (item, idx) {
    const queueTech = TECHNOLOGIES.find(function (t) { return t.id === item.techId; });
    if (!queueTech) return;
    const isLast = idx === queue.length - 1;
    html += '<div class="research-queue-item">' +
      '<span class="queue-index">#' + (idx + 1) + '</span>' +
      '<span class="queue-name">' + queueTech.icon + ' ' + queueTech.name + '</span>' +
      '<span class="queue-days">' + item.daysLeft + ' 天</span>' +
      '<button class="btn-queue-action queue-up-btn' + (idx === 0 ? ' disabled' : '') + '" data-tech="' + item.techId + '">上移</button>' +
      '<button class="btn-queue-action queue-down-btn' + (isLast ? ' disabled' : '') + '" data-tech="' + item.techId + '">下移</button>' +
      '<button class="btn-queue-action queue-cancel-btn" data-tech="' + item.techId + '">取消</button>' +
      '</div>';
  });
  html += '</div>';
  return html;
}

function _bindQueueActions(container, onCancelQueuedResearch, onMoveQueuedResearchUp, onMoveQueuedResearchDown, onClearResearchQueue) {
  if (!container) return;

  container.querySelectorAll('.queue-cancel-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (onCancelQueuedResearch) onCancelQueuedResearch(btn.dataset.tech);
    });
  });

  container.querySelectorAll('.queue-up-btn:not(.disabled)').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (onMoveQueuedResearchUp) onMoveQueuedResearchUp(btn.dataset.tech);
    });
  });

  container.querySelectorAll('.queue-down-btn:not(.disabled)').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (onMoveQueuedResearchDown) onMoveQueuedResearchDown(btn.dataset.tech);
    });
  });

  container.querySelectorAll('.queue-clear-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (!onClearResearchQueue) return;
      if (confirm('确定要清空整个研究队列吗？未开始项目将返还积分。')) {
        onClearResearchQueue();
      }
    });
  });
}
