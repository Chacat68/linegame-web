// js/ui/ResearchDetailPresenter.js — 科技 Context 与共享 L4 详情纯投影

import { TECHNOLOGIES, TECH_CATEGORIES } from '../data/technologies.js';
import * as Research from '../systems/research/ResearchSystem.js';
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

function _getTechnologyStatus(state, tech) {
  var researchState = Research.getResearchState(state);
  var status = Research.isResearched(state, tech.id)
    ? '已完成'
    : researchState.current && researchState.current.techId === tech.id
      ? '研究中'
      : researchState.queue.some(function (entry) { return entry.techId === tech.id; })
        ? '队列中'
        : researchState.options.indexOf(tech.id) !== -1 ? '可研究' : '未出现';
  return { researchState: researchState, status: status };
}

function _getTechnology(techId) {
  return TECHNOLOGIES.find(function (entry) { return entry.id === techId; }) || null;
}

function _getCategory(tech) {
  return TECH_CATEGORIES.find(function (entry) { return entry.id === tech.category; }) || {};
}

export function buildResearchContextView(request) {
  var context = request && request.context;
  var state = request && request.state;
  if (!context || context.type !== 'technology' || !state) return null;
  var tech = _getTechnology(context.id);
  if (!tech) return null;
  var category = _getCategory(tech);
  var status = _getTechnologyStatus(state, tech).status;
  var html =
    '<article class="workspace-context-card workspace-context-card--technology">' +
      '<div class="workspace-context-hero"><span aria-hidden="true">' + _escapeHtml(tech.icon) + '</span><div><small>' + _escapeHtml(category.name || tech.category) + ' · T' + Number(tech.tier || 1) + '</small><h3>' + _escapeHtml(tech.name) + '</h3></div></div>' +
      '<p>' + _escapeHtml(tech.description) + '</p>' +
      '<div class="workspace-context-metrics" role="list">' +
        '<span role="listitem"><small>状态</small><strong>' + _escapeHtml(status) + '</strong></span>' +
        '<span role="listitem"><small>成本</small><strong>' + Number(tech.cost || 0).toLocaleString() + '</strong></span>' +
        '<span role="listitem"><small>周期</small><strong>' + Number(tech.researchDays || 0) + ' 天</strong></span>' +
        '<span role="listitem"><small>前置</small><strong>' + (tech.requires || []).length + ' 项</strong></span>' +
      '</div>' +
      '<div class="workspace-context-callout">' + _escapeHtml(tech.effectText || '无额外效果说明') + '</div>' +
      buildWorkspaceOpenDetailSlot({
        workspaceId: 'archive',
        contextType: 'technology',
        contextId: tech.id,
        label: '查看完整科技详情',
        attributes: { 'data-context-id': tech.id },
      }) +
    '</article>';
  return Object.freeze({ title: '科技检查', html: html });
}

export function buildResearchWorkspaceDetailView(request) {
  var detail = request && request.detail;
  var state = request && request.state;
  if (!detail || detail.type !== 'archive-technology' || !state) return null;
  var tech = _getTechnology(detail.id);
  if (!tech) return null;
  var category = _getCategory(tech);
  var statusInfo = _getTechnologyStatus(state, tech);
  var prerequisites = (Array.isArray(tech.requires) ? tech.requires : []).map(function (techId) {
    var prerequisite = _getTechnology(techId);
    return prerequisite ? prerequisite.name : techId;
  });
  var queueIndex = statusInfo.researchState.queue.findIndex(function (entry) { return entry.techId === tech.id; });
  var view = buildWorkspaceObjectDetailView({
    id: tech.id,
    kind: 'technology',
    kindLabel: '科技',
    detailLabel: '科技详情',
    icon: tech.icon || category.icon || '🔬',
    eyebrow: (category.name || tech.category || '科技') + ' · T' + Number(tech.tier || 1),
    title: tech.name,
    description: tech.description || '暂无科技说明。',
    metrics: [
      { label: '状态', value: statusInfo.status },
      { label: '成本', value: Number(tech.cost || 0).toLocaleString() },
      { label: '周期', value: Number(tech.researchDays || 0) + ' 天' },
      { label: '前置', value: prerequisites.length + ' 项' },
    ],
    facts: [
      { label: '研究效果', value: tech.effectText || '无额外效果说明', detail: '完成后永久生效' },
      { label: '前置科技', value: prerequisites.length ? prerequisites.join(' / ') : '无前置要求', detail: prerequisites.length ? '需先完成全部前置研究' : '基础研究方向' },
      { label: '研究位置', value: queueIndex >= 0 ? ('队列第 ' + (queueIndex + 1) + ' 位') : statusInfo.status, detail: statusInfo.status === '研究中' ? '当前研究项目' : '以最新存档状态为准' },
      { label: '领域等级', value: (category.name || tech.category || '科技') + ' T' + Number(tech.tier || 1), detail: '领域分类与科技层级' },
    ],
    tags: [statusInfo.status, category.name || tech.category, 'T' + Number(tech.tier || 1)],
    note: '该详情汇总科技成本、前置与效果；开始、排队和取消研究仍在科技页确认。',
  });
  return view ? Object.freeze({ title: view.title, html: view.html }) : null;
}
