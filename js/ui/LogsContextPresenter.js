// js/ui/LogsContextPresenter.js — 通讯日志的只读 Context / L4 presenter

import { buildWorkspaceObjectDetailView } from './WorkspaceObjectDetailPresenter.js';

const SIGNAL_BY_TYPE = {
  tip: '可选机会',
  danger: '风险警报',
  error: '风险警报',
};

const ICON_BY_TYPE = {
  danger: '⚠️',
  error: '⚠️',
  tip: '◇',
  trade: '⇄',
  buy: '↓',
  sell: '↑',
  travel: '✦',
  upgrade: '◆',
};

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _pad(value) {
  return String(value).padStart(2, '0');
}

function _formatDateTime(value) {
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return _pad(date.getMonth() + 1) + '-' + _pad(date.getDate()) + ' ' +
    _pad(date.getHours()) + ':' + _pad(date.getMinutes()) + ':' + _pad(date.getSeconds());
}

function _findEntry(entries, entryId) {
  var history = Array.isArray(entries) ? entries : [];
  var index = history.findIndex(function (candidate) {
    return candidate && String(candidate.id) === String(entryId);
  });
  return index < 0 ? null : { entry: history[index], index: index, total: history.length };
}

/**
 * 日志不是领域 action 入口；presenter 只解释一条已经发生的记录。
 * entries 由 HUD 的内存历史提供，context 只携带稳定 message id。
 */
export function renderLogContext(request, entries, typeLabels) {
  var context = request && request.context;
  var container = request && request.container;
  if (!context || context.type !== 'message' || !container) return false;

  var match = _findEntry(entries, context.id);
  if (!match) return false;
  var entry = match.entry;

  var labels = typeLabels || {};
  var category = labels[entry.type] || labels.info || '系统';
  var signal = SIGNAL_BY_TYPE[entry.type] || '常规记录';
  container.innerHTML =
    '<article class="workspace-context-card workspace-context-card--message">' +
      '<div class="workspace-context-hero"><span aria-hidden="true">◉</span><div><small>' +
        _escapeHtml(category) + ' · ' + _escapeHtml(_formatDateTime(entry.time)) +
        '</small><h3>通讯记录</h3></div></div>' +
      '<p>' + _escapeHtml(entry.text) + '</p>' +
      '<div class="workspace-context-metrics" role="list">' +
        '<span role="listitem"><small>分类</small><strong>' + _escapeHtml(category) + '</strong></span>' +
        '<span role="listitem"><small>信号</small><strong>' + _escapeHtml(signal) + '</strong></span>' +
      '</div>' +
      '<div class="workspace-context-callout">只读历史记录。后续行动统一由行动引导发布。</div>' +
      '<button class="workspace-context-action" type="button" data-context-action="open-detail" data-context-id="' +
        _escapeHtml(entry.id) + '">查看完整消息详情</button>' +
    '</article>';
  return { title: '消息检查' };
}

export function renderLogDetail(request, entries, typeLabels) {
  var detail = request && request.detail;
  var container = request && request.container;
  if (!detail || detail.type !== 'logs-message' || !container) return false;
  var match = _findEntry(entries, detail.id);
  if (!match) return false;
  var entry = match.entry;
  var labels = typeLabels || {};
  var category = labels[entry.type] || labels.info || '系统';
  var signal = SIGNAL_BY_TYPE[entry.type] || '常规记录';
  var receivedAt = _formatDateTime(entry.time);
  var view = buildWorkspaceObjectDetailView({
    id: entry.id,
    kind: 'message',
    kindLabel: '通讯记录',
    detailLabel: '消息详情',
    icon: ICON_BY_TYPE[entry.type] || '◉',
    eyebrow: category + ' · ' + receivedAt,
    title: '通讯记录',
    description: entry.text || '空消息记录。',
    metrics: [
      { label: '分类', value: category },
      { label: '信号', value: signal },
      { label: '接收时间', value: receivedAt },
      { label: '位置', value: (match.index + 1) + '/' + match.total },
    ],
    facts: [
      { label: '记录类型', value: category, detail: '内部类型：' + String(entry.type || 'info') },
      { label: '信号解释', value: signal, detail: signal === '风险警报' ? '需结合当前状态自行判断' : '不直接发布全局行动' },
      { label: '历史位置', value: '倒序第 ' + (match.index + 1) + ' 条', detail: '当前共有 ' + match.total + ' 条会话记录' },
      { label: '保存范围', value: '当前运行会话', detail: '日志不是存档资产，不参与存档导入导出' },
    ],
    tags: [category, signal, '只读记录'],
    note: '该详情只解释已经发生的记录；后续行动、风险处理和全局下一步仍由行动引导统一发布。',
  });
  if (!view) return false;
  container.innerHTML = view.html;
  return { title: view.title };
}
