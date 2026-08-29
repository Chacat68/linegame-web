// js/ui/ArchiveExplorationPresenter.js — 探索报告总览、航点与连续任务纯投影

import { SYSTEMS, findGalaxy } from '../data/systems.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';
import { getArchiveReportSignalLabels } from './ArchiveReportDetailPresenter.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getChainImpact(chain) {
  if (!chain) return '经营影响';
  if (chain.kind === 'lost_beacon') return '航线 / 自动跑商';
  if (chain.kind === 'ancient_relic') return '科研 / 风险';
  if (chain.kind === 'derelict_depot') return '商网 / 整备';
  if (chain.signal === 'market') return '贸易 / 价格';
  return '经营影响';
}

function _getChainNote(chain) {
  if (!chain) return '待调查';
  if (chain.followupAcknowledged) {
    return chain.followupAcknowledgedDay ? ('已跟进 · 第 ' + chain.followupAcknowledgedDay + ' 天') : '已跟进';
  }
  if (chain.followupReady) return chain.followupLabel || '有后续线索待查看';
  if (chain.resolved) return '报告已归档';
  if (chain.discovered) return '待调查';
  return '尚未发现';
}

function _getLatestReportDay(summary) {
  var reports = summary && Array.isArray(summary.reports) ? summary.reports : [];
  return reports.reduce(function (latest, report) {
    return Math.max(latest, Number(report && report.day) || 0);
  }, 0);
}

export function buildArchiveExplorationEntries(state, focus) {
  var source = state || {};
  var visitedSystemIds = new Set(Array.isArray(source.visitedSystems) ? source.visitedSystems : []);
  if (source.currentSystem) visitedSystemIds.add(source.currentSystem);
  if (focus && focus.systemId) visitedSystemIds.add(focus.systemId);
  var entries = SYSTEMS.filter(function (system) {
    return visitedSystemIds.has(system.id);
  }).map(function (system) {
    var summary = Exploration.getSurveySummary(source, system.id);
    if (!summary || summary.reportCount <= 0) return null;
    return Object.freeze({
      system: system,
      galaxy: findGalaxy(system.galaxyId),
      summary: summary,
      intel: Exploration.getSurveyDecisionIntel(source, system.id),
      latestDay: _getLatestReportDay(summary),
    });
  }).filter(Boolean).sort(function (left, right) {
    var focusSystemId = focus && focus.systemId;
    if (focusSystemId) {
      if (left.system.id === focusSystemId && right.system.id !== focusSystemId) return -1;
      if (right.system.id === focusSystemId && left.system.id !== focusSystemId) return 1;
    }
    if (left.system.id === source.currentSystem && right.system.id !== source.currentSystem) return -1;
    if (right.system.id === source.currentSystem && left.system.id !== source.currentSystem) return 1;
    if (right.latestDay !== left.latestDay) return right.latestDay - left.latestDay;
    return left.system.name.localeCompare(right.system.name, 'zh-CN');
  });
  return Object.freeze(entries);
}

function _renderReportCard(report, systemId) {
  var reportId = report && report.id ? report.id : (systemId + '-report');
  var labels = getArchiveReportSignalLabels(report);
  return '<article class="archive-exploration-report-card" role="listitem" tabindex="0" data-archive-report-id="' + _escapeHtml(reportId) + '" data-archive-report-system-id="' + _escapeHtml(systemId) + '">' +
    '<div class="archive-exploration-report-head"><span class="archive-exploration-report-icon" aria-hidden="true">' + _escapeHtml(report.icon || '📘') + '</span><div><span class="archive-exploration-report-badge">' + _escapeHtml(report.badge || '探索报告') + '</span><h5>' + _escapeHtml(report.title || '未命名报告') + '</h5></div><span class="archive-exploration-report-day">第 ' + Math.max(1, Number(report.day) || 1) + ' 天</span></div>' +
    '<p>' + _escapeHtml(report.detail || '暂无报告详情。') + '</p>' +
    '<div class="archive-exploration-report-tags" aria-label="报告影响">' + labels.map(function (label) { return '<span>' + _escapeHtml(label) + '</span>'; }).join('') + '</div>' +
  '</article>';
}

function _renderChainRow(chain, systemId, focus) {
  var chainId = chain && chain.id ? chain.id : '';
  var stage = chain && ['archived', 'discovered', 'locked'].indexOf(chain.stage) !== -1 ? chain.stage : 'locked';
  var isFocused = !!(focus && focus.systemId === systemId && focus.chainId && focus.chainId === chainId);
  var classes = ['archive-exploration-chain-row', 'archive-exploration-chain-row--' + stage];
  if (chain.followupReady) classes.push('is-followup-ready');
  if (chain.followupAcknowledged) classes.push('is-followup-acknowledged');
  if (isFocused) classes.push('is-guide-focus');
  return '<article class="' + classes.join(' ') + '" role="listitem" tabindex="0" data-archive-survey-chain-id="' + _escapeHtml(chainId) + '" data-archive-survey-system-id="' + _escapeHtml(systemId) + '"' + (isFocused ? ' data-guide-focus="true"' : '') + '>' +
    '<div class="archive-exploration-chain-main"><strong>' + _escapeHtml((chain.badge ? (chain.badge + ' · ') : '') + (chain.label || '探索链')) + '</strong><span>' + _escapeHtml((chain.poiName || '探索点') + ' · ' + (chain.stageLabel || '待调查') + ' · ' + _getChainImpact(chain)) + '</span></div><em>' + _escapeHtml(_getChainNote(chain)) + '</em></article>';
}

function _renderSystemEntry(entry, focus) {
  var system = entry.system;
  var summary = entry.summary;
  var reports = Array.isArray(summary.reports) ? summary.reports : [];
  var chains = Array.isArray(summary.anomalyChains) ? summary.anomalyChains : [];
  var progress = summary.totalPois > 0 ? Math.round(summary.resolvedCount / summary.totalPois * 100) : 0;
  var isFocused = !!(focus && focus.systemId === system.id);
  var decisionHint = entry.intel ? (entry.intel.anomalyHint || entry.intel.marketHint || entry.intel.dispatchHint) : '';
  return '<section class="archive-exploration-system' + (isFocused ? ' is-guide-focus' : '') + '" data-archive-survey-system-id="' + _escapeHtml(system.id) + '">' +
    '<header class="archive-exploration-system-head"><div><span class="archive-exploration-system-kicker">' + _escapeHtml((entry.galaxy ? entry.galaxy.name : '未知星系') + ' · ' + (system.typeLabel || '星球')) + '</span><h4>' + _escapeHtml(system.name) + '</h4></div><span class="archive-exploration-system-level">情报 Lv.' + (summary.intelLevel || 0) + '</span></header>' +
    '<div class="archive-exploration-progress" role="progressbar" aria-label="' + _escapeHtml(system.name + '探索进度') + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '"><span><strong>' + summary.resolvedCount + '/' + summary.totalPois + '</strong> 探索点</span><i><b style="width:' + progress + '%"></b></i><em>' + (summary.completed ? '区域探索完成' : (summary.pendingCount + ' 项待调查')) + '</em></div>' +
    (decisionHint ? '<p class="archive-exploration-decision">' + _escapeHtml(decisionHint) + '</p>' : '') +
    '<div class="archive-exploration-report-list" role="list" aria-label="' + _escapeHtml(system.name + '探索报告') + '">' + reports.map(function (report) { return _renderReportCard(report, system.id); }).join('') + '</div>' +
    (chains.length > 0 ? '<details class="archive-exploration-chain-details"' + (isFocused && focus.chainId ? ' open' : '') + '><summary>连续任务记录（' + chains.length + '）</summary><div class="archive-exploration-chain-list" role="list" aria-label="' + _escapeHtml(system.name + '连续任务记录') + '">' + chains.map(function (chain) { return _renderChainRow(chain, system.id, focus); }).join('') + '</div></details>' : '') +
  '</section>';
}

export function buildArchiveExplorationView(request) {
  var state = request && request.state;
  if (!state) return null;
  var focus = request && request.focus;
  var entries = buildArchiveExplorationEntries(state, focus);
  var reportCount = entries.reduce(function (total, entry) { return total + entry.summary.reportCount; }, 0);
  var intelLevel = entries.reduce(function (total, entry) { return total + (entry.summary.intelLevel || 0); }, 0);
  var completedCount = entries.filter(function (entry) { return entry.summary.completed; }).length;
  var followupCount = entries.reduce(function (total, entry) { return total + (entry.intel && entry.intel.readyFollowupCount ? entry.intel.readyFollowupCount : 0); }, 0);
  var html = '<section class="archive-exploration-console" aria-label="探索报告总览"><div class="archive-exploration-console-head"><div><span class="archive-panel-kicker">SURVEY ARCHIVE</span><h3 class="archive-panel-title">探索报告</h3></div><span class="archive-exploration-console-state">' + (followupCount > 0 ? (followupCount + ' 条待跟进') : '档案已同步') + '</span></div>' +
    '<div class="archive-stat-strip archive-stat-strip--exploration"><span><strong>' + reportCount + '</strong><em>已归档报告</em></span><span><strong>' + entries.length + '</strong><em>有记录航点</em></span><span><strong>' + intelLevel + '</strong><em>累计情报等级</em></span><span><strong>' + completedCount + '</strong><em>完成区域探索</em></span></div>' +
    '<p class="archive-exploration-intro">探索点调查结论统一保存在这里；交易、科研、航线与贸易站仍会直接使用这些情报。</p></section>' +
    (entries.length > 0
      ? '<div class="archive-exploration-system-list">' + entries.map(function (entry) { return _renderSystemEntry(entry, focus); }).join('') + '</div>'
      : '<section class="archive-exploration-empty" aria-label="暂无探索报告"><span aria-hidden="true">📘</span><h4>还没有探索报告</h4><p>在星图选择当前航点并调查探索点，结论会自动写入档案。</p></section>');
  return Object.freeze({
    completedCount: completedCount,
    entryCount: entries.length,
    followupCount: followupCount,
    html: html,
    intelLevel: intelLevel,
    reportCount: reportCount,
  });
}
