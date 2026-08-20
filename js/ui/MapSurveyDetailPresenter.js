// js/ui/MapSurveyDetailPresenter.js — 地图探索档案与报告的纯视图投影

import {
  getCommandActionAttributes,
  normalizeCommandAction,
  renderCommandActionContent,
} from './CommandAction.js';

export const MAP_SURVEY_INTENT = Object.freeze({
  OPEN_MARKET: 'open-market',
  OPEN_REPORT: 'open-report',
});

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
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;');
}

function _trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _buildReportMeta(report) {
  var parts = [];
  if (report && report.chainLabel) parts.push(report.chainLabel);
  if (report && report.badge) parts.push(report.badge);
  if (report && report.day) parts.push('D' + report.day);
  return parts.join(' · ') || '探索报告';
}

function _buildSurveyMetricCard(label, value, note, extraClass) {
  var className = 'planet-detail-survey-card' + (extraClass ? (' ' + extraClass) : '');
  var noteHtml = note
    ? '<div class="planet-detail-survey-note">' + _escapeHtml(note) + '</div>'
    : '';
  return '<div class="' + className + '">' +
    '<div class="planet-detail-survey-label">' + _escapeHtml(label) + '</div>' +
    '<div class="planet-detail-survey-value">' + _escapeHtml(value) + '</div>' +
    noteHtml +
  '</div>';
}

function _buildMarketActionButton(action) {
  if (!action) return '';
  var commandAction = normalizeCommandAction(action);
  var disabledAttr = commandAction.disabled ? ' disabled aria-disabled="true"' : '';
  var titleAttr = commandAction.title ? ' title="' + _escapeHtmlAttr(commandAction.title) + '"' : '';
  var commandAttrs = getCommandActionAttributes(commandAction, _escapeHtmlAttr);
  var marketDataset = '';

  if (commandAction.marketWorkspaceId) {
    marketDataset += ' data-market-workspace-id="' + _escapeHtmlAttr(commandAction.marketWorkspaceId) + '"';
  }
  if (commandAction.marketSubworkspaceId) {
    marketDataset += ' data-market-subworkspace-id="' + _escapeHtmlAttr(commandAction.marketSubworkspaceId) + '"';
  }
  if (commandAction.marketFocusLabel) {
    marketDataset += ' data-market-focus-label="' + _escapeHtmlAttr(commandAction.marketFocusLabel) + '"';
  }
  if (commandAction.marketMode) {
    marketDataset += ' data-market-mode="' + _escapeHtmlAttr(commandAction.marketMode) + '"';
  }

  return '<button class="planet-detail-action planet-detail-action--command command-action-btn"' +
    ' data-exploration-action="' + _escapeHtmlAttr(commandAction.type || '') + '"' +
    ' data-system-id="' + _escapeHtmlAttr(commandAction.systemId || '') + '"' +
    marketDataset + commandAttrs + disabledAttr + titleAttr + '>' +
    renderCommandActionContent(commandAction, _escapeHtml) +
  '</button>';
}

function _buildSurveySummaryBlock(summary, marketAction) {
  if (!summary) return '';

  var threatClass = summary.threatLevel === 'high'
    ? 'planet-detail-survey-card--danger'
    : (summary.threatLevel === 'medium' ? 'planet-detail-survey-card--warning' : 'planet-detail-survey-card--stable');
  var rewardValue = summary.completionBonusClaimed ? '已领取' : summary.completionRewardLabel;
  var rewardNote = summary.completionBonusClaimed
    ? '本地完探奖励已结算'
    : '调查全部探索点后自动发放';
  var marketActionHtml = marketAction
    ? '<div class="planet-detail-actions planet-detail-survey-actions">' +
        _buildMarketActionButton(marketAction) +
        (marketAction.contextHint ? '<div class="planet-detail-note">' + _escapeHtml(marketAction.contextHint) + '</div>' : '') +
      '</div>'
    : '';

  return '<div class="planet-detail-subsection">' +
    '<div class="planet-detail-subtitle">探索简报</div>' +
    '<div class="planet-detail-survey-grid">' +
      _buildSurveyMetricCard('威胁评级', summary.threatLabel, '决定行动节奏', threatClass) +
      _buildSurveyMetricCard('主要机会', summary.opportunityLabel, '决定优先获取的收益') +
      _buildSurveyMetricCard('情报等级', 'Lv.' + summary.intelLevel, '已归档 ' + summary.reportCount + ' 份') +
      _buildSurveyMetricCard('完探奖励', rewardValue, rewardNote) +
    '</div>' +
    marketActionHtml +
  '</div>';
}

function _getChainStageClass(chain) {
  var stage = chain && chain.stage ? String(chain.stage) : 'locked';
  if (stage === 'archived' || stage === 'discovered' || stage === 'locked') return stage;
  return 'locked';
}

function _getChainSignalText(chain) {
  var signal = chain && chain.signal ? chain.signal : '';
  if (signal === 'route') return '航线';
  if (signal === 'research') return '科研';
  if (signal === 'logistics') return '补给';
  if (signal === 'market') return '贸易';
  return chain && chain.badge ? chain.badge : '探索';
}

function _getChainNote(chain) {
  if (!chain) return '';
  if (chain.followupReady && chain.followupLabel) return chain.followupLabel;
  if (chain.resolved) return '报告已归档，可在【行情与路线】查看它有什么用。';
  return '调查探索点后，结论会写入探索报告。';
}

export function buildMapSurveyChainCards(summary, options) {
  if (!summary || !Array.isArray(summary.anomalyChains) || summary.anomalyChains.length === 0) return '';

  var opts = options || {};
  var compactClass = opts.compact ? ' planet-detail-chain-grid--compact' : '';
  var chainHtml = summary.anomalyChains.map(function (chain) {
    var stageClass = _getChainStageClass(chain);
    return '<div class="planet-detail-chain-card planet-detail-chain-card--' + _escapeHtmlAttr(stageClass) + '">' +
      '<div class="planet-detail-chain-head">' +
        '<span class="planet-detail-chain-title">' + _escapeHtml((chain.badge ? (chain.badge + ' · ') : '') + (chain.label || '探索链')) + '</span>' +
        '<span class="planet-detail-chain-stage">' + _escapeHtml(chain.stageLabel || '待调查') + '</span>' +
      '</div>' +
      '<div class="planet-detail-chain-meta">' + _escapeHtml((chain.poiName || '探索点') + ' · ' + _getChainSignalText(chain)) + '</div>' +
      '<div class="planet-detail-chain-track" aria-hidden="true"><span></span></div>' +
      '<div class="planet-detail-chain-note">' + _escapeHtml(_getChainNote(chain)) + '</div>' +
    '</div>';
  }).join('');

  return '<div class="planet-detail-chain-grid' + compactClass + '">' + chainHtml + '</div>';
}

function _buildSurveyChainBlock(summary) {
  var cards = buildMapSurveyChainCards(summary);
  if (!cards) return '';
  return '<div class="planet-detail-subsection">' +
    '<div class="planet-detail-subtitle">遗迹 / 异常链</div>' +
    cards +
  '</div>';
}

function _buildSurveyReportButtons(summary) {
  if (!summary || !Array.isArray(summary.reports) || summary.reports.length === 0) {
    return '<div class="workspace-detail-intro"><p>尚未生成探索报告。完成本地探索点后，调查结论会归档到这里。</p></div>';
  }
  return '<div class="workspace-detail-report-list" aria-label="探索报告列表">' + summary.reports.map(function (report) {
    var reportId = String(report.id || '');
    return '<button class="workspace-detail-report-button" type="button"' +
      ' data-workspace-detail-action="open-report"' +
      ' data-workspace-detail-report-id="' + _escapeHtmlAttr(reportId) + '">' +
      '<span><strong>' + _escapeHtml((report.icon || '📘') + ' ' + (report.title || '探索报告')) + '</strong>' +
      '<small>' + _escapeHtml(_buildReportMeta(report)) + '</small></span>' +
      '<span class="workspace-detail-report-arrow" aria-hidden="true">›</span>' +
    '</button>';
  }).join('') + '</div>';
}

export function buildMapSurveyArchiveView(input) {
  var request = input || {};
  var system = request.system;
  var summary = request.summary;
  if (!system || !summary) return null;

  return Object.freeze({
    title: (system.name || '未知航点') + ' · 探索档案',
    html: '<section class="workspace-detail-section" data-map-survey-detail="' + _escapeHtmlAttr(system.id || '') + '">' +
      '<div class="workspace-detail-intro"><p>这里集中保存该航点的风险、机会、异常链与调查结论。Context Inspector 只保留当前选择的行动摘要。</p></div>' +
      _buildSurveySummaryBlock(summary, request.marketAction) +
      _buildSurveyChainBlock(summary) +
      '<div class="planet-detail-subsection"><div class="planet-detail-subtitle">调查结论</div>' +
        _buildSurveyReportButtons(summary) +
      '</div>' +
    '</section>',
  });
}

export function buildMapSurveyReportView(input) {
  var request = input || {};
  var system = request.system;
  var summary = request.summary;
  var reportId = _trim(request.reportId);
  var report = summary && Array.isArray(summary.reports)
    ? summary.reports.find(function (entry) { return String(entry.id) === reportId; })
    : null;
  if (!system || !report) return null;

  var tags = Array.isArray(report.signalTags) && report.signalTags.length > 0
    ? report.signalTags.join(' · ')
    : '本地情报';
  return Object.freeze({
    title: (system.name || '未知航点') + ' · 单份报告',
    html: '<article class="workspace-detail-section" data-map-report-detail="' + _escapeHtmlAttr(report.id) + '">' +
      '<div class="workspace-detail-intro"><div>' +
        '<strong class="workspace-detail-report-title">' + _escapeHtml((report.icon || '📘') + ' ' + (report.title || '探索报告')) + '</strong>' +
        '<span class="workspace-detail-report-meta">' + _escapeHtml(_buildReportMeta(report)) + '</span>' +
      '</div><span class="planet-detail-chip">情报 +' + _escapeHtml(report.intelValue || 1) + '</span></div>' +
      '<div class="workspace-detail-report-body">' + _escapeHtml(report.detail || '该报告没有附加说明。') + '</div>' +
      '<div class="workspace-context-tags" aria-label="报告信号"><span>' + _escapeHtml(tags) + '</span></div>' +
    '</article>',
  });
}

export function buildMapSurveyLauncher(summary, system) {
  if (!summary || !system) return '';
  var reportText = summary.reportCount > 0 ? (summary.reportCount + ' 份报告') : '暂无报告';
  var chainText = summary.anomalyChainCount > 0
    ? ((summary.resolvedAnomalyChainCount || 0) + '/' + summary.anomalyChainCount + ' 条异常链')
    : '暂无异常链';
  return '<div class="planet-detail-archive-launcher">' +
    '<div class="planet-detail-archive-launcher-meta"><span>' + _escapeHtml(summary.threatLabel) + '</span>' +
      '<span>' + _escapeHtml(summary.opportunityLabel) + '</span><span>' + _escapeHtml(reportText) + '</span>' +
      '<span>' + _escapeHtml(chainText) + '</span></div>' +
    '<button class="planet-detail-action planet-detail-action--quiet" type="button"' +
      ' data-planet-detail-action="open-survey" data-system-id="' + _escapeHtmlAttr(system.id) + '">' +
      '打开探索档案' +
    '</button>' +
  '</div>';
}

export function createMapSurveyReportDetailId(systemId, reportId) {
  return encodeURIComponent(_trim(systemId)) + '::' + encodeURIComponent(_trim(reportId));
}

export function parseMapSurveyReportDetailId(detailId) {
  var separatorIndex = typeof detailId === 'string' ? detailId.indexOf('::') : -1;
  if (separatorIndex === -1) return null;
  try {
    var systemId = decodeURIComponent(detailId.slice(0, separatorIndex));
    var reportId = decodeURIComponent(detailId.slice(separatorIndex + 2));
    if (!systemId || !reportId) return null;
    return Object.freeze({ systemId: systemId, reportId: reportId });
  } catch (error) {
    return null;
  }
}

function _escapeSelectorAttributeValue(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function getMapSurveyReportReturnSelector(reportId) {
  return '[data-workspace-detail-report-id="' + _escapeSelectorAttributeValue(reportId) + '"]';
}

export function getMapSurveyLauncherReturnSelector(systemId) {
  return '[data-planet-detail-action="open-survey"][data-system-id="' +
    _escapeSelectorAttributeValue(systemId) + '"]';
}

export function normalizeMapSurveyIntent(action, fallbackSystemId) {
  if (!action || typeof action !== 'object') return null;
  var dataset = action.dataset || {};
  if (action.action === 'open-report') {
    var reportId = _trim(dataset.workspaceDetailReportId);
    return reportId
      ? Object.freeze({ type: MAP_SURVEY_INTENT.OPEN_REPORT, reportId: reportId })
      : null;
  }
  if (action.action !== 'market') return null;

  var systemId = _trim(dataset.systemId) || _trim(fallbackSystemId);
  if (!systemId) return null;
  return Object.freeze({
    type: MAP_SURVEY_INTENT.OPEN_MARKET,
    systemId: systemId,
    workspaceId: _trim(dataset.marketWorkspaceId),
    subworkspaceId: _trim(dataset.marketSubworkspaceId),
    marketMode: _trim(dataset.marketMode),
  });
}
