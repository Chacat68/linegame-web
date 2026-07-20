import { getCommandActionAttributes, renderCommandActionContent } from './CommandAction.js';

let _onAction = null;
let _suggestion = null;
let _boundRoot = null;
let _completionTimer = null;
let _completionToken = 0;

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getCommandIntent(suggestion) {
  if (!suggestion) return '';
  if (suggestion.commandIntent) return suggestion.commandIntent;
  switch (suggestion.actionType) {
    case 'quest.accept':
      return '任务接取';
    case 'quest.open':
      return '任务列表';
    case 'market.open':
    case 'market.focus':
      return '买卖货物';
    case 'trade.buy':
    case 'trade.sell':
      return '交易确认';
    case 'map.focus':
      return '航线选择';
    case 'travel.execute':
      return '自动航行';
    case 'trade.refuel':
      return '燃料补给';
    case 'event.open':
      return '事件处理';
    case 'fleet.dispatch.prefill':
      return '设置跑商路线';
    case 'fleet.mod.open':
      return '模块改装';
    case 'fleet.service.open':
      return '维修船坞';
    case 'exploration.poi':
      return '调查探索点';
    default:
      return '';
  }
}

function _getSuggestionCommandAction(suggestion) {
  return {
    commandSurface: suggestion.surface || 'system',
    commandIntent: _getCommandIntent(suggestion),
    commandVerb: suggestion.actionLabel || '执行',
    label: suggestion.actionLabel || '执行',
  };
}

function _getGuidanceTopic(suggestion) {
  return suggestion && suggestion.guidanceTopic && suggestion.guidanceTopic.id
    ? suggestion.guidanceTopic
    : null;
}

function _renderKicker(suggestion) {
  var topic = _getGuidanceTopic(suggestion);
  var label = '当前行动';
  var contextLabel = topic && (topic.stepLabel || topic.label);
  if (contextLabel) label += ' · ' + contextLabel;
  return _escapeHtml(label);
}

function _getRoot() {
  return typeof document !== 'undefined'
    ? document.getElementById('action-guide')
    : null;
}

function _bind(root) {
  if (!root || _boundRoot === root) return;
  root.addEventListener('click', function (event) {
    var actionBtn = event.target.closest('[data-action-guide-action]');
    if (actionBtn && _suggestion && typeof _onAction === 'function') {
      _onAction(_suggestion);
    }
  });
  _boundRoot = root;
}

function _clearCompletion(root) {
  if (_completionTimer) {
    clearTimeout(_completionTimer);
    _completionTimer = null;
  }
  _completionToken += 1;
  if (root && root.classList) {
    root.classList.remove('is-complete');
  }
}

function _renderExpanded(suggestion) {
  var commandAction = _getSuggestionCommandAction(suggestion);
  var topic = _getGuidanceTopic(suggestion);
  var topicAttr = topic ? (' data-guide-topic="' + _escapeHtml(topic.id) + '"') : '';
  var purpose = suggestion.purpose || suggestion.reason || '完成当前步骤。';
  var outcome = suggestion.outcome || '完成后会自动刷新下一条建议。';
  return '<div class="action-guide-shell" data-guide-surface="' + _escapeHtml(suggestion.surface || 'system') + '"' + topicAttr + '>' +
    '<div class="action-guide-status" aria-hidden="true"></div>' +
    '<div class="action-guide-copy">' +
      '<div class="action-guide-kicker">' + _renderKicker(suggestion) + '</div>' +
      '<div class="action-guide-main">' +
        '<strong class="action-guide-title">' + _escapeHtml(suggestion.title) + '</strong>' +
        '<span class="action-guide-reason"><b class="action-guide-flow-label">目的</b>' + _escapeHtml(purpose) + '</span>' +
        '<span class="action-guide-outcome"><b class="action-guide-flow-label">完成后</b>' + _escapeHtml(outcome) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="action-guide-actions">' +
      '<button class="action-guide-primary command-action-btn" type="button" data-action-guide-action' + getCommandActionAttributes(commandAction, _escapeHtml) + '>' +
        renderCommandActionContent(commandAction, _escapeHtml) +
      '</button>' +
    '</div>' +
  '</div>';
}

export function init(onAction) {
  _onAction = typeof onAction === 'function' ? onAction : null;
  var root = _getRoot();
  _bind(root);
}

export function render(suggestion) {
  _suggestion = suggestion || null;
  var root = _getRoot();
  if (!root) return;
  _bind(root);
  _clearCompletion(root);

  if (!_suggestion) {
    root.hidden = true;
    root.innerHTML = '';
    if (typeof root.removeAttribute === 'function') {
      root.removeAttribute('data-guide-id');
    } else if (root.dataset) {
      delete root.dataset.guideId;
    }
    root.classList.remove('is-processing');
    return;
  }

  root.hidden = false;
  root.dataset.guideId = _suggestion.id || '';
  root.classList.remove('is-collapsed');
  root.classList.remove('is-processing');
  root.innerHTML = _renderExpanded(_suggestion);
}

export function showProcessing(suggestion, message) {
  _suggestion = suggestion || _suggestion;
  var root = _getRoot();
  if (!root || !_suggestion) return;
  _clearCompletion(root);
  root.hidden = false;
  root.classList.remove('is-collapsed');
  root.classList.add('is-processing');
  root.dataset.guideId = _suggestion.id || '';
  var topic = _getGuidanceTopic(_suggestion);
  var topicAttr = topic ? (' data-guide-topic="' + _escapeHtml(topic.id) + '"') : '';
  root.innerHTML = '<div class="action-guide-shell action-guide-shell--processing" data-guide-surface="' + _escapeHtml(_suggestion.surface || 'system') + '"' + topicAttr + '>' +
    '<div class="action-guide-status" aria-hidden="true"></div>' +
    '<div class="action-guide-copy">' +
      '<div class="action-guide-kicker">' + _renderKicker(_suggestion) + '</div>' +
      '<div class="action-guide-main">' +
        '<strong class="action-guide-title">' + _escapeHtml(message || '已执行，正在生成下一条建议') + '</strong>' +
        '<span class="action-guide-reason">' + _escapeHtml(_suggestion.title || '') + '</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

export function showCompletion(message, detail, options) {
  var opts = options || {};
  var root = _getRoot();
  if (!root) return;
  _bind(root);
  _clearCompletion(root);

  var token = _completionToken;
  var durationMs = Number.isFinite(opts.durationMs) ? opts.durationMs : 1600;
  root.hidden = false;
  root.classList.remove('is-collapsed');
  root.classList.remove('is-processing');
  root.classList.add('is-complete');
  root.dataset.guideId = _suggestion ? (_suggestion.id || '') : '';
  root.innerHTML = '<div class="action-guide-shell action-guide-shell--complete" data-guide-surface="system">' +
    '<div class="action-guide-status" aria-hidden="true"></div>' +
    '<div class="action-guide-copy">' +
      '<div class="action-guide-kicker">行动完成</div>' +
      '<div class="action-guide-main">' +
        '<strong class="action-guide-title">' + _escapeHtml(message || '已完成，下一步建议已刷新') + '</strong>' +
        '<span class="action-guide-reason">' + _escapeHtml(detail || (_suggestion ? _suggestion.title : '')) + '</span>' +
      '</div>' +
    '</div>' +
  '</div>';

  if (durationMs > 0) {
    _completionTimer = setTimeout(function () {
      if (token !== _completionToken) return;
      _completionTimer = null;
      root.classList.remove('is-complete');
      render(_suggestion);
    }, durationMs);
  }
}
