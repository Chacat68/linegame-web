// js/ui/LogsContextPresenter.js — 通讯日志的只读 Context Inspector presenter

const SIGNAL_BY_TYPE = {
  tip: '可选机会',
  danger: '风险警报',
  error: '风险警报',
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

/**
 * 日志不是领域 action 入口；presenter 只解释一条已经发生的记录。
 * entries 由 HUD 的内存历史提供，context 只携带稳定 message id。
 */
export function renderLogContext(request, entries, typeLabels) {
  var context = request && request.context;
  var container = request && request.container;
  if (!context || context.type !== 'message' || !container) return false;

  var history = Array.isArray(entries) ? entries : [];
  var entry = history.find(function (candidate) {
    return candidate && String(candidate.id) === String(context.id);
  });
  if (!entry) return false;

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
    '</article>';
  return { title: '消息检查' };
}
