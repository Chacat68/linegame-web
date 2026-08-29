// js/ui/ArchiveReportDetailPresenter.js — 探索报告 Context 与 L4 纯投影

import { SYSTEMS, findGalaxy } from '../data/systems.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
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

export function getArchiveReportSignalLabels(report) {
  var labels = [];
  var tags = report && Array.isArray(report.signalTags) ? report.signalTags : [];
  if ((report && report.kind === 'market') || tags.indexOf('market') !== -1) labels.push('交易');
  if ((report && report.kind === 'research') || tags.indexOf('research') !== -1) labels.push('科研');
  if ((report && report.kind === 'route') || tags.indexOf('route') !== -1) labels.push('航线');
  if (tags.indexOf('logistics') !== -1) labels.push('补给');
  if (report && report.kind === 'completion') labels.push('区域综述');
  return Object.freeze(labels.length > 0 ? labels : ['探索记录']);
}

export function findArchiveReport(state, reportId) {
  if (!state || !reportId) return null;
  for (var index = 0; index < SYSTEMS.length; index += 1) {
    var system = SYSTEMS[index];
    var summary = Exploration.getSurveySummary(state, system.id);
    var report = summary && Array.isArray(summary.reports)
      ? summary.reports.find(function (entry) { return entry.id === reportId; })
      : null;
    if (report) return Object.freeze({ report: report, system: system, summary: summary });
  }
  return null;
}

export function buildArchiveReportContextView(request) {
  var context = request && request.context;
  var state = request && request.state;
  if (!context || context.type !== 'report' || !state) return null;
  var match = findArchiveReport(state, context.id);
  if (!match) return null;
  var report = match.report;
  var labels = getArchiveReportSignalLabels(report);
  var html = '<article class="workspace-context-card workspace-context-card--report">' +
    '<div class="workspace-context-hero"><span aria-hidden="true">' + _escapeHtml(report.icon || '📘') + '</span><div><small>' + _escapeHtml(match.system.name) + ' · 第 ' + Math.max(1, Number(report.day) || 1) + ' 天</small><h3>' + _escapeHtml(report.title || '探索报告') + '</h3></div></div>' +
    '<p>' + _escapeHtml(report.detail || '暂无报告详情。') + '</p>' +
    '<div class="workspace-context-tags">' + labels.map(function (label) { return '<span>' + _escapeHtml(label) + '</span>'; }).join('') + '</div>' +
    buildWorkspaceOpenDetailSlot({ workspaceId: 'archive', contextType: 'report', contextId: report.id, label: '查看完整报告详情', attributes: { 'data-context-id': report.id } }) +
  '</article>';
  return Object.freeze({ html: html, title: '报告检查' });
}

export function buildArchiveReportWorkspaceDetailView(request) {
  var detail = request && request.detail;
  var state = request && request.state;
  if (!detail || detail.type !== 'archive-report' || !state) return null;
  var match = findArchiveReport(state, detail.id);
  if (!match) return null;
  var report = match.report;
  var summary = match.summary || {};
  var labels = getArchiveReportSignalLabels(report);
  var galaxy = findGalaxy(match.system.galaxyId);
  var progress = Number(summary.totalPois) > 0
    ? Math.round(Number(summary.resolvedCount || 0) / Number(summary.totalPois) * 100)
    : 0;
  var view = buildWorkspaceObjectDetailView({
    id: report.id,
    kind: 'report',
    kindLabel: '探索报告',
    detailLabel: '报告详情',
    icon: report.icon || '📘',
    eyebrow: (match.system.name || '未知地点') + ' · 第 ' + Math.max(1, Number(report.day) || 1) + ' 天',
    title: report.title || '探索报告',
    description: report.detail || '暂无报告详情。',
    metrics: [
      { label: '归档日', value: '第 ' + Math.max(1, Number(report.day) || 1) + ' 天' },
      { label: '地点', value: match.system.name || match.system.id },
      { label: '区域进度', value: progress + '%' },
      { label: '情报等级', value: 'Lv.' + Number(summary.intelLevel || 0) },
    ],
    facts: [
      { label: '报告类型', value: report.badge || '探索报告', detail: labels.join(' / ') },
      { label: '所属区域', value: match.system.name || match.system.id, detail: (galaxy ? galaxy.name : '未知星系') + ' · ' + (match.system.typeLabel || '星球') },
      { label: '探索链', value: report.chainLabel || '独立探索记录', detail: report.chainKind ? ('信号 ' + report.chainKind) : '无连续探索链标记' },
      { label: '区域状态', value: Number(summary.resolvedCount || 0) + '/' + Number(summary.totalPois || 0) + ' 探索点', detail: summary.completed ? '区域探索完成' : (Number(summary.pendingCount || 0) + ' 项待调查') },
    ],
    tags: labels.concat(report.chainLabel ? [report.chainLabel] : []),
    note: '该详情保留报告原文和归档事实；交易、科研、航线与商网会在各自工作区使用这些情报。',
  });
  return view ? Object.freeze({ html: view.html, title: view.title }) : null;
}
