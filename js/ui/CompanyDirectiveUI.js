import {
  getCompanyDirectiveActionSuggestion,
  getCompanyDirectiveBoard,
  getDirectiveSuggestion,
} from '../systems/company/CompanyDirectiveSystem.js?v=20260531-rewardloop1';
import { bindBlockingSurfaceDismiss, hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js?v=20260621-settingsfallback1';

const MODAL_ID = 'company-directives-modal';
const STORAGE_KEY = 'linegame_company_directive_focus';

let _initialized = false;
let _onAction = null;
let _onClaim = null;
let _onClaimAll = null;
let _onSelectionChange = null;
let _lastState = null;
let _trackedDirectiveId = _readTrackedDirectiveId();
let _activeDirectiveFilter = 'all';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _getElement(id) {
  return typeof document !== 'undefined' ? document.getElementById(id) : null;
}

function _readTrackedDirectiveId() {
  try {
    if (!globalThis.localStorage) return '';
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch (_) {
    return '';
  }
}

function _writeTrackedDirectiveId(directiveId) {
  _trackedDirectiveId = directiveId || '';
  try {
    if (!globalThis.localStorage) return;
    if (_trackedDirectiveId) localStorage.setItem(STORAGE_KEY, _trackedDirectiveId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // localStorage can be unavailable in tests or privacy-restricted contexts.
  }
}

function _getDirective(board, directiveId) {
  return (board.directives || []).find(function (directive) {
    return directive.id === directiveId;
  }) || null;
}

function _renderRequirement(requirement) {
  var width = Math.floor(Math.max(0, Math.min(1, requirement.progressRatio || 0)) * 100);
  var progressLabel = requirement.label + ' ' + requirement.currentLabel + ' / ' + requirement.targetLabel;
  return '<div class="company-directive-requirement' + (requirement.done ? ' is-done' : '') + '">' +
    '<div class="company-directive-requirement-line">' +
      '<span>' + _escapeHtml(requirement.label) + '</span>' +
      '<strong>' + _escapeHtml(requirement.currentLabel) + ' / ' + _escapeHtml(requirement.targetLabel) + '</strong>' +
    '</div>' +
    '<div class="company-directive-mini-track" role="progressbar" aria-label="' + _escapeHtml(progressLabel) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + width + '">' +
      '<div class="company-directive-mini-fill" style="width:' + width + '%"></div>' +
    '</div>' +
  '</div>';
}

function _renderDirectiveCard(directive, board) {
  var tracked = directive.id === _trackedDirectiveId;
  var recommended = directive.id === board.recommendedDirectiveId;
  var classes = [
    'company-directive-card',
    directive.completed ? 'is-complete' : '',
    directive.claimable ? 'is-claimable' : '',
    directive.claimed ? 'is-claimed' : '',
    tracked ? 'is-tracked' : '',
    recommended ? 'is-recommended' : '',
  ].filter(Boolean).join(' ');
  var percent = Math.floor(Math.max(0, Math.min(1, directive.progressRatio || 0)) * 100);
  var reqHtml = (directive.requirements || []).map(_renderRequirement).join('');
  var actionDisabled = directive.completed || !directive.nextAction;
  var statusLabel = directive.claimable
    ? '可领取'
    : (directive.claimed ? '已结算' : (directive.completed ? '完成' : (tracked ? '追踪中' : directive.statusLabel)));
  var primaryButtonLabel = directive.claimable
    ? '领取奖励'
    : (directive.claimed ? '已领取' : (actionDisabled ? '已完成' : (directive.nextAction.actionLabel || '打开入口')));
  var primaryButtonAttrs = directive.claimable
    ? ('data-company-directive-claim="' + _escapeHtml(directive.id) + '"')
    : ('data-company-directive-action="' + _escapeHtml(directive.id) + '"' + (actionDisabled || directive.claimed ? ' disabled' : ''));
  var titleId = 'company-directive-title-' + _escapeHtml(directive.id);
  var descId = 'company-directive-desc-' + _escapeHtml(directive.id);
  return '<article class="' + classes + '" data-company-directive-card="' + _escapeHtml(directive.id) + '" role="group" aria-labelledby="' + titleId + '" aria-describedby="' + descId + '">' +
    '<div class="company-directive-card-head">' +
      '<div>' +
        '<div class="company-directive-code">' + _escapeHtml(directive.code) + ' · ' + _escapeHtml(directive.categoryLabel) + '</div>' +
        '<h4 id="' + titleId + '">' + _escapeHtml(directive.title) + '</h4>' +
      '</div>' +
      '<span class="company-directive-status">' + _escapeHtml(statusLabel) + '</span>' +
    '</div>' +
    '<p id="' + descId + '" class="company-directive-desc">' + _escapeHtml(directive.description) + '</p>' +
    '<div class="company-directive-progress">' +
      '<span>' + percent + '%</span>' +
      '<div class="company-directive-track" role="progressbar" aria-label="' + _escapeHtml(directive.title + ' 进度') + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><div class="company-directive-fill" style="width:' + percent + '%"></div></div>' +
    '</div>' +
    '<div class="company-directive-requirements">' + reqHtml + '</div>' +
    '<div class="company-directive-reward">' + _escapeHtml(directive.rewardLabel) + '</div>' +
    '<div class="company-directive-actions">' +
      '<button class="company-directive-track-btn" type="button" aria-pressed="' + (tracked ? 'true' : 'false') + '" data-company-directive-track="' + _escapeHtml(directive.id) + '">' +
        _escapeHtml(tracked ? '取消追踪' : '追踪') +
      '</button>' +
      '<button class="company-directive-action-btn" type="button" ' + primaryButtonAttrs + '>' +
        _escapeHtml(primaryButtonLabel) +
      '</button>' +
    '</div>' +
  '</article>';
}

function _renderRewardLoop(board) {
  var recent = board.recentClaim || null;
  var recentTitle = recent
    ? ((recent.code ? (recent.code + ' · ') : '') + recent.title)
    : '暂无结算记录';
  var recentMeta = recent
    ? ('第 ' + recent.claimedDay + ' 天 · ' + recent.rewardLabel)
    : '等待首个指令完成';
  var nextLabel = board.rewardLoopLabel || (board.nextDirective ? board.nextDirective.label : '等待公司目标刷新');

  return '<div class="company-directives-loop">' +
    '<div class="company-directives-recent">' +
      '<span>最近结算</span>' +
      '<strong>' + _escapeHtml(recentTitle) + '</strong>' +
      '<em>' + _escapeHtml(recentMeta) + '</em>' +
    '</div>' +
    '<div class="company-directives-next">' +
      '<span>后续行动</span>' +
      '<strong>' + _escapeHtml(nextLabel) + '</strong>' +
    '</div>' +
  '</div>';
}

function _getDirectiveFilterLabel(filter) {
  if (filter === 'tracked') return '追踪中';
  if (filter === 'claimable') return '可领取';
  if (filter === 'active') return '推进中';
  return '全部';
}

function _isKnownDirectiveFilter(filter) {
  return filter === 'all' || filter === 'tracked' || filter === 'claimable' || filter === 'active';
}

function _getDirectiveFilterCounts(board) {
  var directives = board.directives || [];
  return {
    all: directives.length,
    tracked: directives.filter(function (directive) {
      return directive && directive.id === _trackedDirectiveId;
    }).length,
    claimable: directives.filter(function (directive) {
      return directive && directive.claimable;
    }).length,
    active: directives.filter(function (directive) {
      return directive && !directive.completed && !directive.claimable;
    }).length,
  };
}

function _filterDirectives(board) {
  var directives = board.directives || [];
  if (_activeDirectiveFilter === 'tracked') {
    return directives.filter(function (directive) {
      return directive && directive.id === _trackedDirectiveId;
    });
  }
  if (_activeDirectiveFilter === 'claimable') {
    return directives.filter(function (directive) {
      return directive && directive.claimable;
    });
  }
  if (_activeDirectiveFilter === 'active') {
    return directives.filter(function (directive) {
      return directive && !directive.completed && !directive.claimable;
    });
  }
  return directives.slice();
}

function _renderDirectiveFilters(board, visibleCount) {
  var counts = _getDirectiveFilterCounts(board);
  var filters = ['all', 'tracked', 'claimable', 'active'];
  var filterButtons = filters.map(function (filter) {
    var active = filter === _activeDirectiveFilter;
    return '<button class="company-directives-filter-chip' + (active ? ' is-active' : '') + '" type="button" data-company-directive-filter="' + filter + '" aria-pressed="' + (active ? 'true' : 'false') + '" aria-controls="company-directive-grid" tabindex="' + (active ? '0' : '-1') + '">' +
      '<span>' + _escapeHtml(_getDirectiveFilterLabel(filter)) + '</span>' +
      '<strong>' + _escapeHtml(counts[filter] || 0) + '</strong>' +
    '</button>';
  }).join('');
  return '<section class="company-directives-toolbar" aria-label="公司指令筛选">' +
    '<div class="company-directives-filter-group" role="toolbar" aria-label="指令状态筛选" aria-describedby="company-directives-filter-status">' + filterButtons + '</div>' +
    '<div id="company-directives-filter-status" class="company-directives-filter-status" role="status" aria-live="polite">' +
      '显示' + _escapeHtml(_getDirectiveFilterLabel(_activeDirectiveFilter)) + '指令：' + _escapeHtml(visibleCount) + ' 项' +
    '</div>' +
  '</section>';
}

function _renderModal(board) {
  var body = _getElement('company-directives-body');
  if (!body) return;
  var milestone = board.nextMilestone
    ? ('下一权限 Lv.' + board.nextMilestone.level + ' · ' + board.nextMilestone.title)
    : '核心权限已全部开放';
  var trackedDirective = _getDirective(board, _trackedDirectiveId);
  var trackedLabel = trackedDirective
    ? ('追踪：' + trackedDirective.title)
    : '未追踪指令';
  var claimAllButton = (board.claimableCount || 0) > 1
    ? '<button class="company-directives-claim-all-btn" type="button" data-company-directive-claim-all="true">全部领取</button>'
    : '';
  var visibleDirectives = _filterDirectives(board);
  var directiveCards = visibleDirectives.map(function (directive) {
    return _renderDirectiveCard(directive, board);
  }).join('');
  if (!directiveCards) {
    directiveCards = '<div class="company-directives-empty" role="status">' +
      '<strong>没有匹配的' + _escapeHtml(_getDirectiveFilterLabel(_activeDirectiveFilter)) + '指令</strong>' +
      '<span>切换筛选，或继续推进贸易、探索和商网目标后再查看。</span>' +
    '</div>';
  }

  body.innerHTML = '<section class="company-directives-brief" aria-live="polite">' +
    '<div>' +
      '<span class="company-directives-kicker">CORPORATE DIRECTIVES</span>' +
      '<h3>' + _escapeHtml((board.companyIcon ? (board.companyIcon + ' ') : '') + board.companyTitle + ' Lv.' + board.companyLevel) + '</h3>' +
    '</div>' +
    '<div class="company-directives-brief-grid">' +
      '<div><span>执行中</span><strong>' + _escapeHtml(board.activeCount) + '</strong></div>' +
      '<div><span>已完成</span><strong>' + _escapeHtml(board.completedCount) + '</strong></div>' +
      '<div><span>可领取</span><strong>' + _escapeHtml(board.claimableCount || 0) + '</strong></div>' +
      '<div><span>权限</span><strong>' + _escapeHtml(milestone) + '</strong></div>' +
    '</div>' +
    '<div class="company-directives-tracked"><span>' + _escapeHtml(trackedLabel) + '</span>' + claimAllButton + '</div>' +
    _renderRewardLoop(board) +
  '</section>' +
  _renderDirectiveFilters(board, visibleDirectives.length) +
  '<section id="company-directive-grid" class="company-directive-grid" data-company-directives-filter="' + _escapeHtml(_activeDirectiveFilter) + '">' +
    directiveCards +
  '</section>';
}

function _renderHeaderSummary(board) {
  var button = _getElement('company-directives-btn');
  if (!button) return;
  var tracked = _getDirective(board, _trackedDirectiveId);
  var claimableCount = Math.max(0, Number(board.claimableCount) || 0);
  var trackedActive = !!tracked && !tracked.completed;
  var trackedProgress = tracked ? Math.floor(Math.max(0, Math.min(1, tracked.progressRatio || 0)) * 100) : 0;

  button.classList.toggle('is-tracking', trackedActive && claimableCount === 0);
  button.classList.toggle('has-claimable', claimableCount > 0);
  if (claimableCount > 0) {
    button.dataset.companyDirectiveBadge = String(claimableCount);
  } else {
    delete button.dataset.companyDirectiveBadge;
  }

  var title = claimableCount > 0
    ? ('公司指令：' + claimableCount + ' 项奖励可领取')
    : (tracked ? ('公司指令：追踪 ' + tracked.title + ' · ' + trackedProgress + '%') : '公司指令');
  var ariaLabel = claimableCount > 0
    ? ('公司指令，' + claimableCount + ' 项奖励可领取')
    : (tracked ? ('公司指令，正在追踪' + tracked.title + '，进度 ' + trackedProgress + '%') : '公司指令');
  button.setAttribute('title', title);
  button.setAttribute('aria-label', ariaLabel);
}

function _setTrackedDirectiveId(directiveId) {
  _writeTrackedDirectiveId(directiveId);
  if (typeof _onSelectionChange === 'function') _onSelectionChange(_trackedDirectiveId);
  if (_lastState) render(_lastState);
}

function _closeModal() {
  hideBlockingSurface(MODAL_ID);
  if (typeof _onSelectionChange === 'function') _onSelectionChange(_trackedDirectiveId);
}

function _setActiveDirectiveFilter(filter, restoreFocus) {
  _activeDirectiveFilter = _isKnownDirectiveFilter(filter) ? filter : 'all';
  if (_lastState) render(_lastState);
  if (!restoreFocus) return;

  var body = _getElement('company-directives-body');
  if (!body || typeof body.querySelector !== 'function') return;
  var activeButton = body.querySelector('[data-company-directive-filter="' + _activeDirectiveFilter + '"]');
  if (activeButton && typeof activeButton.focus === 'function') activeButton.focus();
}

function _handleBodyClick(event) {
  var target = event && event.target;
  if (!target || typeof target.closest !== 'function') return;

  var filterButton = target.closest('[data-company-directive-filter]');
  if (filterButton) {
    var nextFilter = filterButton.dataset.companyDirectiveFilter || 'all';
    _setActiveDirectiveFilter(nextFilter, true);
    return;
  }

  var trackButton = target.closest('[data-company-directive-track]');
  if (trackButton) {
    var nextId = trackButton.dataset.companyDirectiveTrack || '';
    _setTrackedDirectiveId(_trackedDirectiveId === nextId ? '' : nextId);
    return;
  }

  var actionButton = target.closest('[data-company-directive-action]');
  if (actionButton && !actionButton.disabled) {
    var directiveId = actionButton.dataset.companyDirectiveAction || '';
    var suggestion = getDirectiveSuggestion(_lastState || {}, directiveId);
    hideBlockingSurface(MODAL_ID);
    if (suggestion && typeof _onAction === 'function') _onAction(suggestion);
    return;
  }

  var claimAllButton = target.closest('[data-company-directive-claim-all]');
  if (claimAllButton && !claimAllButton.disabled) {
    if (typeof _onClaimAll === 'function') _onClaimAll();
    return;
  }

  var claimButton = target.closest('[data-company-directive-claim]');
  if (claimButton && !claimButton.disabled) {
    var claimDirectiveId = claimButton.dataset.companyDirectiveClaim || '';
    if (claimDirectiveId && typeof _onClaim === 'function') _onClaim(claimDirectiveId);
  }
}

function _handleBodyKeydown(event) {
  var target = event && event.target;
  if (!target || typeof target.closest !== 'function') return;
  var filterButton = target.closest('[data-company-directive-filter]');
  if (!filterButton) return;

  var filters = ['all', 'tracked', 'claimable', 'active'];
  var currentFilter = filterButton.dataset.companyDirectiveFilter || _activeDirectiveFilter;
  var currentIndex = Math.max(0, filters.indexOf(currentFilter));
  var nextIndex = currentIndex;

  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % filters.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + filters.length) % filters.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = filters.length - 1;
  else return;

  if (typeof event.preventDefault === 'function') event.preventDefault();
  _setActiveDirectiveFilter(filters[nextIndex], true);
}

export function init(actions) {
  var config = actions || {};
  _onAction = typeof config.onAction === 'function' ? config.onAction : null;
  _onClaim = typeof config.onClaim === 'function' ? config.onClaim : null;
  _onClaimAll = typeof config.onClaimAll === 'function' ? config.onClaimAll : null;
  _onSelectionChange = typeof config.onSelectionChange === 'function' ? config.onSelectionChange : null;
  if (_initialized) return;
  _initialized = true;

  var openButton = _getElement('company-directives-btn');
  if (openButton) {
    openButton.addEventListener('click', function () {
      if (_lastState) render(_lastState);
      showBlockingSurface(MODAL_ID, {
        focusSelector: '[data-company-directive-filter][aria-pressed="true"]',
      });
    });
  }

  var closeButton = _getElement('company-directives-modal-close');
  if (closeButton) {
    closeButton.addEventListener('click', function () {
      _closeModal();
    });
  }

  var body = _getElement('company-directives-body');
  if (body) {
    body.addEventListener('click', _handleBodyClick);
    body.addEventListener('keydown', _handleBodyKeydown);
  }
  bindBlockingSurfaceDismiss(MODAL_ID, { onDismiss: _closeModal });
}

export function render(state) {
  _lastState = state || null;
  var board = getCompanyDirectiveBoard(state || {});
  _renderHeaderSummary(board);
  _renderModal(board);
}

export function getTrackedDirectiveId() {
  return _trackedDirectiveId || '';
}

export function getTrackedSuggestion(state) {
  if (!_trackedDirectiveId) return null;
  return getDirectiveSuggestion(state || {}, _trackedDirectiveId);
}

export function getActionSuggestion(state) {
  return getCompanyDirectiveActionSuggestion(state || {}, _trackedDirectiveId);
}

export function _resetForTest() {
  _initialized = false;
  _onAction = null;
  _onClaim = null;
  _onClaimAll = null;
  _onSelectionChange = null;
  _lastState = null;
  _trackedDirectiveId = '';
  _activeDirectiveFilter = 'all';
}
