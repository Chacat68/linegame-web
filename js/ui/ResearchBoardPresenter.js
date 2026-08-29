// js/ui/ResearchBoardPresenter.js — 科技首页、队列与完成状态纯投影

import { TECHNOLOGIES, TECH_CATEGORIES } from '../data/technologies.js';
import { buildResearchDispatchView } from './ResearchDispatchPresenter.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getTechnology(techId) {
  return TECHNOLOGIES.find(function (tech) { return tech.id === techId; }) || null;
}

function _getCategory(categoryId) {
  return TECH_CATEGORIES.find(function (category) { return category.id === categoryId; }) || null;
}

export function getResearchCategoryStatuses(state) {
  var input = state || {};
  var completedSet = new Set(input.researchedTechs || []);
  var optionSet = new Set(input.researchOptions || []);
  var queueSet = new Set((input.researchQueue || []).map(function (item) { return item.techId; }));
  var currentTechId = input.currentResearch && input.currentResearch.techId;
  return TECH_CATEGORIES.map(function (category) {
    var categoryTechs = TECHNOLOGIES.filter(function (tech) { return tech.category === category.id; });
    var completed = categoryTechs.filter(function (tech) { return completedSet.has(tech.id); }).length;
    var options = categoryTechs.filter(function (tech) { return optionSet.has(tech.id); }).length;
    var queued = categoryTechs.filter(function (tech) { return queueSet.has(tech.id); }).length;
    return Object.freeze({
      category: category,
      total: categoryTechs.length,
      completed: completed,
      options: options,
      queued: queued,
      active: categoryTechs.some(function (tech) { return tech.id === currentTechId; }),
      pct: categoryTechs.length ? Math.round(completed / categoryTechs.length * 100) : 0,
    });
  });
}

function _renderResearchCategoryMatrix(statuses) {
  return '<div class="research-category-matrix" role="list" aria-label="科技分类状态">' +
    statuses.map(function (status) {
      var color = _escapeHtml(status.category.color || '#6ce7ff');
      return '<div class="research-category-cell' + (status.active ? ' is-active' : '') + '" role="listitem" style="border-color:' + color + '44">' +
        '<span class="research-category-cell-kicker" style="color:' + color + '">' + _escapeHtml((status.category.icon || '') + ' ' + (status.category.name || status.category.id)) + '</span>' +
        '<strong>' + status.completed + '/' + status.total + '</strong>' +
        '<em>' + (status.active ? '当前研究' : ('候选 ' + status.options + ' · 队列 ' + status.queued)) + '</em>' +
        '<i class="research-category-cell-meter" aria-hidden="true"><b style="width:' + status.pct + '%;background:' + color + '"></b></i>' +
      '</div>';
    }).join('') +
  '</div>';
}

function _renderResearchFocusPanel(state, categoryStatuses, currentTech) {
  var queue = state.researchQueue || [];
  var optionTechs = (state.researchOptions || []).map(_getTechnology).filter(Boolean);
  var affordableOptions = optionTechs.filter(function (tech) { return Number(state.credits || 0) >= Number(tech.cost || 0); });
  var focusCategory = categoryStatuses.slice().sort(function (a, b) {
    if (b.active !== a.active) return b.active ? 1 : -1;
    if (b.options !== a.options) return b.options - a.options;
    if (a.pct !== b.pct) return a.pct - b.pct;
    return String(a.category.name).localeCompare(String(b.category.name));
  })[0];
  var signalTitle = currentTech
    ? ('正在研究：' + currentTech.name)
    : queue.length > 0
      ? ('队列待启动：' + queue.length + ' 项')
      : affordableOptions.length > 0 ? ('可立即启动：' + affordableOptions[0].name) : '等待研究预算';
  var signalNote = currentTech && state.currentResearch
    ? ('剩余 ' + Math.max(0, Number(state.currentResearch.daysLeft) || 0) + ' 天，完成后会自动接力队列中的下一项。')
    : queue.length > 0
      ? '当前没有进行中研究，队列会在下一次启动条件满足后接力。'
      : affordableOptions.length > 0
        ? '候选池中有可负担项目，可先从成本、天数和分类收益判断方向。'
        : '候选项目暂时超过预算，先通过市场或任务补足研究资金。';
  var focusItems = (currentTech ? [currentTech] : []).concat(
    queue.map(function (item) { return _getTechnology(item.techId); }).filter(Boolean),
    affordableOptions
  ).filter(function (tech, index, list) {
    return tech && list.findIndex(function (item) { return item.id === tech.id; }) === index;
  }).slice(0, 3);
  return '<section class="research-focus-panel" aria-label="研究队列状态">' +
    '<div class="research-focus-copy"><span class="research-focus-kicker">研究状态</span><strong class="research-focus-title">' + _escapeHtml(signalTitle) + '</strong><span class="research-focus-note">' + _escapeHtml(signalNote) + '</span></div>' +
    '<div class="research-focus-list" role="list" aria-label="优先研究项目">' +
      (focusItems.length > 0 ? focusItems.map(function (tech) {
        var category = _getCategory(tech.category);
        var color = _escapeHtml((category && category.color) || '#6ce7ff');
        return '<article class="research-focus-card" role="listitem" style="border-color:' + color + '33"><span class="research-focus-icon" aria-hidden="true">' + _escapeHtml(tech.icon) + '</span><span class="research-focus-main"><strong>' + _escapeHtml(tech.name) + '</strong><em>' + _escapeHtml(((category && category.name) || tech.category) + ' · ' + Number(tech.cost || 0).toLocaleString() + ' / ' + Number(tech.researchDays || 0) + ' 天') + '</em></span></article>';
      }).join('') : '<div class="research-focus-empty" role="listitem">暂无推荐研究。</div>') +
    '</div>' +
    '<div class="research-budget-signal" aria-label="研究预算情况"><span>候选预算</span><strong>' + affordableOptions.length + '/' + optionTechs.length + '</strong><em>' + _escapeHtml(focusCategory ? ((focusCategory.category.name || focusCategory.category.id) + ' 进度 ' + focusCategory.completed + '/' + focusCategory.total) : '分类数据待生成') + '</em></div>' +
  '</section>';
}

export function renderResearchStatus(state) {
  var completed = state.researchedTechs || [];
  var queue = state.researchQueue || [];
  var total = TECHNOLOGIES.length;
  var completePct = total > 0 ? Math.round(completed.length / total * 100) : 0;
  var currentTech = state.currentResearch ? _getTechnology(state.currentResearch.techId) : null;
  var currentCategory = currentTech ? _getCategory(currentTech.category) : null;
  var totalDays = currentTech ? Math.max(1, Number(currentTech.researchDays) || 1) : 1;
  var currentProgress = currentTech && state.currentResearch
    ? Math.max(0, Math.min(100, Math.round((totalDays - (Number(state.currentResearch.daysLeft) || 0)) / totalDays * 100)))
    : 0;
  var categoryStatuses = getResearchCategoryStatuses(state);
  return '<section class="archive-research-console" aria-label="科技研究总览">' +
    '<div class="research-console-head"><div><span class="archive-panel-kicker">RESEARCH MATRIX</span><h3 class="archive-panel-title">科技研究</h3></div><div class="research-completion-meter" role="progressbar" aria-label="科技完成度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + completePct + '"><strong>' + completePct + '%</strong><span>' + completed.length + '/' + total + '</span></div></div>' +
    '<div class="archive-stat-strip archive-stat-strip--research"><span><strong>' + completed.length + '</strong><em>已完成</em></span><span><strong>' + (state.researchOptions || []).length + '</strong><em>候选方向</em></span><span><strong>' + queue.length + '</strong><em>队列项目</em></span><span><strong>' + (state.currentResearch ? Math.max(0, Number(state.currentResearch.daysLeft) || 0) : 0) + '</strong><em>剩余天数</em></span></div>' +
    '<div class="research-current-strip' + (currentTech ? '' : ' is-idle') + '"><div><span class="research-current-kicker">' + _escapeHtml(currentCategory ? currentCategory.name : '待启动') + '</span><strong>' + _escapeHtml(currentTech ? currentTech.name : '选择一项科技开始研究') + '</strong></div><div class="research-current-bar" role="progressbar" aria-label="当前研究进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + currentProgress + '"><i style="width:' + currentProgress + '%"></i></div></div>' +
    _renderResearchCategoryMatrix(categoryStatuses) +
    _renderResearchFocusPanel(state, categoryStatuses, currentTech) +
  '</section>';
}

export function renderResearchQueue(queue, title) {
  var items = Array.isArray(queue) ? queue : [];
  var html = '<div class="research-queue"><div class="research-queue-head"><div class="research-queue-title">' + _escapeHtml(title) + '</div><button type="button" class="btn-queue-action queue-clear-btn" data-queued-count="' + items.length + '">清空队列</button></div><div class="research-queue-list" role="list">';
  items.forEach(function (item, index) {
    var tech = _getTechnology(item.techId);
    if (!tech) return;
    var isLast = index === items.length - 1;
    html += '<div class="research-queue-item" role="listitem"><span class="queue-index">#' + (index + 1) + '</span><span class="queue-name">' + _escapeHtml(tech.icon + ' ' + tech.name) + '</span><span class="queue-days">' + Math.max(0, Number(item.daysLeft) || 0) + ' 天</span>' +
      '<button type="button" class="btn-queue-action queue-up-btn' + (index === 0 ? ' disabled' : '') + '" data-tech="' + _escapeHtml(item.techId) + '"' + (index === 0 ? ' disabled aria-disabled="true"' : '') + '>上移</button>' +
      '<button type="button" class="btn-queue-action queue-down-btn' + (isLast ? ' disabled' : '') + '" data-tech="' + _escapeHtml(item.techId) + '"' + (isLast ? ' disabled aria-disabled="true"' : '') + '>下移</button>' +
      '<button type="button" class="btn-queue-action queue-cancel-btn" data-tech="' + _escapeHtml(item.techId) + '">取消</button></div>';
  });
  return html + '</div></div>';
}

function _renderResearchOverview(state, dispatchView) {
  var dispatchHtml = dispatchView.html;
  if (!state.currentResearch) {
    var idleQueue = state.researchQueue || [];
    return idleQueue.length === 0
      ? dispatchHtml + '<p class="research-hint">🔬 选择一项科技开始研究</p>'
      : dispatchHtml + renderResearchQueue(idleQueue, '🗂️ 研究队列（待启动）');
  }
  var tech = _getTechnology(state.currentResearch.techId);
  if (!tech) return dispatchHtml;
  var category = _getCategory(tech.category) || {};
  var totalDays = Math.max(1, Number(tech.researchDays) || 1);
  var progress = Math.max(0, Math.min(100, Math.round((totalDays - (Number(state.currentResearch.daysLeft) || 0)) / totalDays * 100)));
  var color = _escapeHtml(category.color || '#6ce7ff');
  var html = '<div class="research-active" role="region" aria-label="当前研究项目"><div class="research-active-header"><span class="research-cat-badge" style="background:' + color + '22;color:' + color + '">' + _escapeHtml((category.icon || '') + ' ' + (category.name || tech.category)) + '</span><span class="research-days">剩余 ' + Math.max(0, Number(state.currentResearch.daysLeft) || 0) + ' 天</span></div><div class="research-active-name">' + _escapeHtml(tech.icon + ' ' + tech.name) + '</div><div class="mini-bar-track" role="progressbar" aria-label="当前研究进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '" style="margin-top:6px"><div class="mini-bar-fill research-fill" style="width:' + progress + '%"></div></div><div class="research-effect-text">' + _escapeHtml(tech.effectText) + '</div></div>' + dispatchHtml;
  var queue = state.researchQueue || [];
  return queue.length > 0 ? html + renderResearchQueue(queue, '🗂️ 研究队列（' + queue.length + '）') : html;
}

export function renderResearchOptions(state, dispatchView) {
  var html = _renderResearchOverview(state, dispatchView);
  var optionTechs = (state.researchOptions || []).map(_getTechnology).filter(Boolean);
  if (optionTechs.length === 0) return html + '<p class="research-hint">所有可用科技已研究完毕！🎉</p>';
  var queueMode = !!state.currentResearch;
  var queueLength = (state.researchQueue || []).length;
  html += '<section class="research-option-console" aria-label="研究候选"><div class="research-label">' + (queueMode ? '可加入研究队列（当前排队 ' + queueLength + ' 项）' : '选择研究方向（三选一）') + '</div><div class="research-cards" role="list" aria-label="可研究科技">';
  optionTechs.forEach(function (tech) {
    var category = _getCategory(tech.category) || {};
    var canAfford = Number(state.credits || 0) >= Number(tech.cost || 0);
    var color = _escapeHtml(category.color || '#6ce7ff');
    html += '<article class="research-card' + (canAfford ? '' : ' unaffordable') + '" role="listitem" tabindex="0" data-tech="' + _escapeHtml(tech.id) + '" data-research-affordable="' + (canAfford ? 'true' : 'false') + '" aria-label="' + _escapeHtml(tech.name + '，' + (canAfford ? '可研究' : '资金不足')) + '">' +
      '<div class="research-card-header" style="border-left:3px solid ' + color + '"><span class="research-cat-badge" style="background:' + color + '22;color:' + color + '">' + _escapeHtml((category.icon || '') + ' ' + (category.name || tech.category)) + '</span><span class="research-tier">T' + Number(tech.tier || 1) + '</span></div>' +
      '<div class="research-card-icon">' + _escapeHtml(tech.icon) + '</div><div class="research-card-name">' + _escapeHtml(tech.name) + '</div><div class="research-card-desc">' + _escapeHtml(tech.description) + '</div><div class="research-card-effect">✨ ' + _escapeHtml(tech.effectText) + '</div>' +
      '<div class="research-card-footer"><span class="research-cost">💰 ' + Number(tech.cost || 0) + '</span><span class="research-time">⏱️ ' + Number(tech.researchDays || 0) + ' 天</span></div>' +
      '<button type="button" class="btn-research" data-tech="' + _escapeHtml(tech.id) + '" aria-label="' + _escapeHtml((queueMode ? '加入研究队列：' : '开始研究：') + tech.name) + '">' + (queueMode ? '加入队列' : '开始研究') + '</button></article>';
  });
  return html + '</div></section>';
}

export function renderResearchCompleted(state) {
  var completedTechs = (state.researchedTechs || []).map(_getTechnology).filter(Boolean);
  if (completedTechs.length === 0) return '';
  return '<section class="research-completed-console" aria-label="已完成研究"><div class="research-label">已完成研究 (' + completedTechs.length + '/' + TECHNOLOGIES.length + ')</div><div class="completed-techs" role="list">' + completedTechs.map(function (tech) {
    var category = _getCategory(tech.category) || {};
    return '<button class="completed-tech-badge" type="button" role="listitem" data-completed-tech="' + _escapeHtml(tech.id) + '" style="border-color:' + _escapeHtml(category.color || '#6ce7ff') + '" title="' + _escapeHtml(tech.effectText) + '">' + _escapeHtml(tech.icon + ' ' + tech.name) + '</button>';
  }).join('') + '</div></section>';
}

export function buildResearchBoardView(request) {
  var input = request || {};
  if (!input.state) return null;
  var dispatchView = buildResearchDispatchView(input);
  return Object.freeze({
    statusHtml: renderResearchStatus(input.state),
    optionsHtml: renderResearchOptions(input.state, dispatchView),
    completedHtml: renderResearchCompleted(input.state),
    researchRecommendation: dispatchView.recommendation,
    researchBlocker: dispatchView.blocker,
  });
}
