// js/ui/ArchiveExplorationUI.js — 档案中心探索报告界面
// 依赖：data/systems.js, systems/galaxy/ExplorationSystem.js
// 导出：render, setFocus, revealFocus

import { SYSTEMS, findGalaxy } from '../data/systems.js';
import * as Exploration from '../systems/galaxy/ExplorationSystem.js';

let _pendingFocus = null;

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeHtmlAttr(value) {
  return _escapeHtml(value);
}

function _escapeSelectorValue(value) {
  var text = String(value == null ? '' : value);
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(text);
  if (typeof globalThis !== 'undefined' && globalThis.CSS && globalThis.CSS.escape) {
    return globalThis.CSS.escape(text);
  }
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function _getReportSignalLabels(report) {
  var labels = [];
  var tags = report && Array.isArray(report.signalTags) ? report.signalTags : [];
  if ((report && report.kind === 'market') || tags.indexOf('market') !== -1) labels.push('交易');
  if ((report && report.kind === 'research') || tags.indexOf('research') !== -1) labels.push('科研');
  if ((report && report.kind === 'route') || tags.indexOf('route') !== -1) labels.push('航线');
  if (tags.indexOf('logistics') !== -1) labels.push('补给');
  if (report && report.kind === 'completion') labels.push('区域综述');
  return labels.length > 0 ? labels : ['探索记录'];
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
    return chain.followupAcknowledgedDay
      ? ('已跟进 · 第 ' + chain.followupAcknowledgedDay + ' 天')
      : '已跟进';
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

function _buildArchiveEntries(state) {
  var visitedSystemIds = new Set(Array.isArray(state.visitedSystems) ? state.visitedSystems : []);
  if (state.currentSystem) visitedSystemIds.add(state.currentSystem);
  if (_pendingFocus && _pendingFocus.systemId) visitedSystemIds.add(_pendingFocus.systemId);

  return SYSTEMS.filter(function (system) {
    return visitedSystemIds.has(system.id);
  }).map(function (system) {
    var summary = Exploration.getSurveySummary(state, system.id);
    if (!summary || summary.reportCount <= 0) return null;
    return {
      system: system,
      galaxy: findGalaxy(system.galaxyId),
      summary: summary,
      intel: Exploration.getSurveyDecisionIntel(state, system.id),
      latestDay: _getLatestReportDay(summary),
    };
  }).filter(Boolean).sort(function (left, right) {
    var focusSystemId = _pendingFocus && _pendingFocus.systemId;
    if (focusSystemId) {
      if (left.system.id === focusSystemId && right.system.id !== focusSystemId) return -1;
      if (right.system.id === focusSystemId && left.system.id !== focusSystemId) return 1;
    }
    if (left.system.id === state.currentSystem && right.system.id !== state.currentSystem) return -1;
    if (right.system.id === state.currentSystem && left.system.id !== state.currentSystem) return 1;
    if (right.latestDay !== left.latestDay) return right.latestDay - left.latestDay;
    return left.system.name.localeCompare(right.system.name, 'zh-CN');
  });
}

function _renderReportCard(report, systemId) {
  var reportId = report && report.id ? report.id : (systemId + '-report');
  var labels = _getReportSignalLabels(report);
  return '<article class="archive-exploration-report-card" role="listitem" tabindex="0" data-archive-report-id="' + _escapeHtmlAttr(reportId) + '">' +
    '<div class="archive-exploration-report-head">' +
      '<span class="archive-exploration-report-icon" aria-hidden="true">' + _escapeHtml(report.icon || '📘') + '</span>' +
      '<div>' +
        '<span class="archive-exploration-report-badge">' + _escapeHtml(report.badge || '探索报告') + '</span>' +
        '<h5>' + _escapeHtml(report.title || '未命名报告') + '</h5>' +
      '</div>' +
      '<span class="archive-exploration-report-day">第 ' + Math.max(1, Number(report.day) || 1) + ' 天</span>' +
    '</div>' +
    '<p>' + _escapeHtml(report.detail || '暂无报告详情。') + '</p>' +
    '<div class="archive-exploration-report-tags" aria-label="报告影响">' +
      labels.map(function (label) { return '<span>' + _escapeHtml(label) + '</span>'; }).join('') +
    '</div>' +
  '</article>';
}

function _renderChainRow(chain, systemId) {
  var chainId = chain && chain.id ? chain.id : '';
  var stage = chain && ['archived', 'discovered', 'locked'].indexOf(chain.stage) !== -1
    ? chain.stage
    : 'locked';
  var isFocused = !!(
    _pendingFocus &&
    _pendingFocus.systemId === systemId &&
    _pendingFocus.chainId &&
    _pendingFocus.chainId === chainId
  );
  var classes = [
    'archive-exploration-chain-row',
    'archive-exploration-chain-row--' + stage,
  ];
  if (chain.followupReady) classes.push('is-followup-ready');
  if (chain.followupAcknowledged) classes.push('is-followup-acknowledged');
  if (isFocused) classes.push('is-guide-focus');

  return '<article class="' + classes.join(' ') + '" role="listitem" tabindex="0" data-archive-survey-chain-id="' + _escapeHtmlAttr(chainId) + '" data-archive-survey-system-id="' + _escapeHtmlAttr(systemId) + '"' + (isFocused ? ' data-guide-focus="true"' : '') + '>' +
    '<div class="archive-exploration-chain-main">' +
      '<strong>' + _escapeHtml((chain.badge ? (chain.badge + ' · ') : '') + (chain.label || '探索链')) + '</strong>' +
      '<span>' + _escapeHtml((chain.poiName || '探索点') + ' · ' + (chain.stageLabel || '待调查') + ' · ' + _getChainImpact(chain)) + '</span>' +
    '</div>' +
    '<em>' + _escapeHtml(_getChainNote(chain)) + '</em>' +
  '</article>';
}

function _renderSystemEntry(entry) {
  var system = entry.system;
  var summary = entry.summary;
  var reports = Array.isArray(summary.reports) ? summary.reports : [];
  var chains = Array.isArray(summary.anomalyChains) ? summary.anomalyChains : [];
  var progress = summary.totalPois > 0
    ? Math.round(summary.resolvedCount / summary.totalPois * 100)
    : 0;
  var isFocused = !!(_pendingFocus && _pendingFocus.systemId === system.id);
  var decisionHint = entry.intel
    ? (entry.intel.anomalyHint || entry.intel.marketHint || entry.intel.dispatchHint)
    : '';

  return '<section class="archive-exploration-system' + (isFocused ? ' is-guide-focus' : '') + '" data-archive-survey-system-id="' + _escapeHtmlAttr(system.id) + '">' +
    '<header class="archive-exploration-system-head">' +
      '<div>' +
        '<span class="archive-exploration-system-kicker">' + _escapeHtml((entry.galaxy ? entry.galaxy.name : '未知星系') + ' · ' + (system.typeLabel || '星球')) + '</span>' +
        '<h4>' + _escapeHtml(system.name) + '</h4>' +
      '</div>' +
      '<span class="archive-exploration-system-level">情报 Lv.' + (summary.intelLevel || 0) + '</span>' +
    '</header>' +
    '<div class="archive-exploration-progress" role="progressbar" aria-label="' + _escapeHtmlAttr(system.name + '探索进度') + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + progress + '">' +
      '<span><strong>' + summary.resolvedCount + '/' + summary.totalPois + '</strong> 探索点</span>' +
      '<i><b style="width:' + progress + '%"></b></i>' +
      '<em>' + (summary.completed ? '区域探索完成' : (summary.pendingCount + ' 项待调查')) + '</em>' +
    '</div>' +
    (decisionHint ? '<p class="archive-exploration-decision">' + _escapeHtml(decisionHint) + '</p>' : '') +
    '<div class="archive-exploration-report-list" role="list" aria-label="' + _escapeHtmlAttr(system.name + '探索报告') + '">' +
      reports.map(function (report) { return _renderReportCard(report, system.id); }).join('') +
    '</div>' +
    (chains.length > 0
      ? '<details class="archive-exploration-chain-details"' + (isFocused && _pendingFocus.chainId ? ' open' : '') + '>' +
          '<summary>连续任务记录（' + chains.length + '）</summary>' +
          '<div class="archive-exploration-chain-list" role="list" aria-label="' + _escapeHtmlAttr(system.name + '连续任务记录') + '">' +
            chains.map(function (chain) { return _renderChainRow(chain, system.id); }).join('') +
          '</div>' +
        '</details>'
      : '') +
  '</section>';
}

export function setFocus(systemId, chainId) {
  _pendingFocus = systemId
    ? { systemId: String(systemId), chainId: chainId ? String(chainId) : '' }
    : null;
}

export function revealFocus(systemId, chainId) {
  setFocus(systemId, chainId);
  if (typeof document === 'undefined' || !document.querySelector) return false;

  var selector = chainId
    ? ('[data-archive-survey-chain-id="' + _escapeSelectorValue(chainId) + '"][data-archive-survey-system-id="' + _escapeSelectorValue(systemId) + '"]')
    : ('[data-archive-survey-system-id="' + _escapeSelectorValue(systemId) + '"]');
  var target = document.querySelector(selector);
  if (!target) return false;
  if (target.classList) target.classList.add('is-guide-focus');
  if (target.setAttribute) target.setAttribute('data-guide-focus', 'true');
  if (typeof target.scrollIntoView === 'function') {
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  }
  return true;
}

export function render(state) {
  var container = document.getElementById('exploration-archive-list');
  if (!container) return;

  var entries = _buildArchiveEntries(state || {});
  var reportCount = entries.reduce(function (total, entry) { return total + entry.summary.reportCount; }, 0);
  var intelLevel = entries.reduce(function (total, entry) { return total + (entry.summary.intelLevel || 0); }, 0);
  var completedCount = entries.filter(function (entry) { return entry.summary.completed; }).length;
  var followupCount = entries.reduce(function (total, entry) {
    return total + (entry.intel && entry.intel.readyFollowupCount ? entry.intel.readyFollowupCount : 0);
  }, 0);

  container.innerHTML =
    '<section class="archive-exploration-console" aria-label="探索报告总览">' +
      '<div class="archive-exploration-console-head">' +
        '<div>' +
          '<span class="archive-panel-kicker">SURVEY ARCHIVE</span>' +
          '<h3 class="archive-panel-title">探索报告</h3>' +
        '</div>' +
        '<span class="archive-exploration-console-state">' + (followupCount > 0 ? (followupCount + ' 条待跟进') : '档案已同步') + '</span>' +
      '</div>' +
      '<div class="archive-stat-strip archive-stat-strip--exploration">' +
        '<span><strong>' + reportCount + '</strong><em>已归档报告</em></span>' +
        '<span><strong>' + entries.length + '</strong><em>有记录航点</em></span>' +
        '<span><strong>' + intelLevel + '</strong><em>累计情报等级</em></span>' +
        '<span><strong>' + completedCount + '</strong><em>完成区域探索</em></span>' +
      '</div>' +
      '<p class="archive-exploration-intro">探索点调查结论统一保存在这里；交易、科研、航线与贸易站仍会直接使用这些情报。</p>' +
    '</section>' +
    (entries.length > 0
      ? '<div class="archive-exploration-system-list">' + entries.map(_renderSystemEntry).join('') + '</div>'
      : '<section class="archive-exploration-empty" aria-label="暂无探索报告">' +
          '<span aria-hidden="true">📘</span>' +
          '<h4>还没有探索报告</h4>' +
          '<p>在星图选择当前航点并调查探索点，结论会自动写入档案。</p>' +
        '</section>');
}
