import { getCommandActionAttributes, renderCommandActionContent } from './CommandAction.js?v=20260510-command1';

let _onAction = null;
let _suggestion = null;
let _collapsed = false;
let _boundRoot = null;

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
      return '现货交易区';
    case 'map.focus':
      return '航线定位';
    case 'exploration.scan':
      return '轨道测绘';
    case 'exploration.land':
      return '首次着陆';
    case 'exploration.poi':
      return 'POI 调查';
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

function _getRoot() {
  return typeof document !== 'undefined'
    ? document.getElementById('action-guide')
    : null;
}

function _bind(root) {
  if (!root || _boundRoot === root) return;
  root.addEventListener('click', function (event) {
    var toggle = event.target.closest('[data-action-guide-toggle]');
    if (toggle) {
      _collapsed = !_collapsed;
      render(_suggestion);
      return;
    }

    var actionBtn = event.target.closest('[data-action-guide-action]');
    if (actionBtn && _suggestion && typeof _onAction === 'function') {
      _onAction(_suggestion);
    }
  });
  _boundRoot = root;
}

function _renderExpanded(suggestion) {
  var commandAction = _getSuggestionCommandAction(suggestion);
  return '<div class="action-guide-shell" data-guide-surface="' + _escapeHtml(suggestion.surface || 'system') + '">' +
    '<div class="action-guide-status" aria-hidden="true"></div>' +
    '<div class="action-guide-copy">' +
      '<div class="action-guide-kicker">当前行动</div>' +
      '<div class="action-guide-main">' +
        '<strong class="action-guide-title">' + _escapeHtml(suggestion.title) + '</strong>' +
        '<span class="action-guide-reason">' + _escapeHtml(suggestion.reason) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="action-guide-actions">' +
      '<button class="action-guide-primary command-action-btn" type="button" data-action-guide-action' + getCommandActionAttributes(commandAction, _escapeHtml) + '>' +
        renderCommandActionContent(commandAction, _escapeHtml) +
      '</button>' +
      '<button class="action-guide-toggle" type="button" data-action-guide-toggle aria-label="折叠当前行动" aria-expanded="true">⌄</button>' +
    '</div>' +
  '</div>';
}

function _renderCollapsed(suggestion) {
  return '<button class="action-guide-mini" type="button" data-action-guide-toggle aria-label="展开当前行动" aria-expanded="false">' +
    '<span class="action-guide-mini-kicker">当前行动</span>' +
    '<span class="action-guide-mini-title">' + _escapeHtml(suggestion.title) + '</span>' +
  '</button>';
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

  if (!_suggestion) {
    root.hidden = true;
    root.innerHTML = '';
    root.removeAttribute('data-guide-id');
    return;
  }

  root.hidden = false;
  root.dataset.guideId = _suggestion.id || '';
  root.classList.toggle('is-collapsed', _collapsed);
  root.classList.remove('is-processing');
  root.innerHTML = _collapsed
    ? _renderCollapsed(_suggestion)
    : _renderExpanded(_suggestion);
}

export function showProcessing(suggestion, message) {
  _suggestion = suggestion || _suggestion;
  var root = _getRoot();
  if (!root || !_suggestion) return;
  root.hidden = false;
  root.classList.remove('is-collapsed');
  root.classList.add('is-processing');
  root.dataset.guideId = _suggestion.id || '';
  root.innerHTML = '<div class="action-guide-shell action-guide-shell--processing" data-guide-surface="' + _escapeHtml(_suggestion.surface || 'system') + '">' +
    '<div class="action-guide-status" aria-hidden="true"></div>' +
    '<div class="action-guide-copy">' +
      '<div class="action-guide-kicker">当前行动</div>' +
      '<div class="action-guide-main">' +
        '<strong class="action-guide-title">' + _escapeHtml(message || '已执行，正在生成下一条建议') + '</strong>' +
        '<span class="action-guide-reason">' + _escapeHtml(_suggestion.title || '') + '</span>' +
      '</div>' +
    '</div>' +
  '</div>';
}

export function isCollapsed() {
  return _collapsed;
}

export function setCollapsed(collapsed) {
  _collapsed = !!collapsed;
  render(_suggestion);
}
