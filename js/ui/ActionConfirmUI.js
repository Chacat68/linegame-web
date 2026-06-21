// js/ui/ActionConfirmUI.js - 应用内危险操作确认弹窗

import {
  bindBlockingSurfaceDismiss,
  hideBlockingSurface,
  showBlockingSurface,
} from './SurfaceManager.js?v=20260621-settingsfallback1';

const SURFACE_ID = 'action-confirm-modal';
let _initialized = false;
let _activeRequest = null;
let _parentSurfaceId = null;
let _triggerElement = null;

export function init() {
  if (_initialized) return;
  var cancelBtn = document.getElementById('action-confirm-cancel');
  var acceptBtn = document.getElementById('action-confirm-accept');
  var modal = document.getElementById(SURFACE_ID);
  if (!modal || !cancelBtn || !acceptBtn) return;

  cancelBtn.addEventListener('click', function () {
    _close(false);
  });
  acceptBtn.addEventListener('click', function () {
    _close(true);
  });
  bindBlockingSurfaceDismiss(SURFACE_ID, {
    onDismiss: function () {
      _close(false);
    },
  });
  _initialized = true;
}

export function open(options) {
  init();
  var modal = document.getElementById(SURFACE_ID);
  var titleEl = document.getElementById('action-confirm-title');
  var messageEl = document.getElementById('action-confirm-message');
  var impactEl = document.getElementById('action-confirm-impact');
  var kickerEl = document.getElementById('action-confirm-kicker');
  var acceptBtn = document.getElementById('action-confirm-accept');
  if (!modal || !titleEl || !messageEl || !impactEl || !acceptBtn) return false;

  var request = options || {};
  var tone = request.tone === 'warning' ? 'warning' : 'danger';
  _activeRequest = request;
  _parentSurfaceId = _getVisibleParentSurfaceId();
  _triggerElement = globalThis.document ? document.activeElement : null;

  modal.dataset.confirmTone = tone;
  titleEl.textContent = request.title || '确认此操作？';
  messageEl.textContent = request.message || '请核对影响后再继续。';
  if (kickerEl) kickerEl.textContent = request.kicker || (tone === 'danger' ? '危险操作' : '操作确认');
  acceptBtn.textContent = request.confirmLabel || '确认执行';
  acceptBtn.dataset.tone = tone;
  acceptBtn.setAttribute('aria-label', request.confirmAriaLabel || request.confirmLabel || '确认执行');
  impactEl.innerHTML = _renderImpact(request.details);
  impactEl.setAttribute('aria-hidden', impactEl.innerHTML ? 'false' : 'true');

  showBlockingSurface(SURFACE_ID, { focusSelector: '#action-confirm-cancel' });
  return true;
}

export function cancel() {
  _close(false);
}

function _close(confirmed) {
  if (!_activeRequest) {
    hideBlockingSurface(SURFACE_ID);
    return;
  }

  var request = _activeRequest;
  var parentSurfaceId = _parentSurfaceId;
  var triggerElement = _triggerElement;
  _activeRequest = null;
  _parentSurfaceId = null;
  _triggerElement = null;

  hideBlockingSurface(SURFACE_ID);
  if (parentSurfaceId) {
    showBlockingSurface(parentSurfaceId, { rememberTrigger: false });
    _focusTrigger(triggerElement);
  }

  if (confirmed) {
    if (typeof request.onConfirm === 'function') request.onConfirm();
  } else if (typeof request.onCancel === 'function') {
    request.onCancel();
  }
}

function _getVisibleParentSurfaceId() {
  if (!globalThis.document || typeof document.querySelectorAll !== 'function') return null;
  var surfaces = Array.from(document.querySelectorAll('.modal'));
  var visible = surfaces.find(function (surface) {
    return surface && surface.id && surface.id !== SURFACE_ID && surface.classList && !surface.classList.contains('hidden');
  });
  return visible ? visible.id : null;
}

function _focusTrigger(target) {
  if (!target || typeof target.focus !== 'function' || target.disabled) return;
  if (target.isConnected === false) return;
  if (typeof target.closest === 'function' && target.closest('[hidden], .hidden, [aria-hidden="true"]')) return;
  try {
    target.focus({ preventScroll: true });
  } catch (err) {
    target.focus();
  }
}

function _renderImpact(details) {
  if (!Array.isArray(details) || details.length === 0) return '';
  return details.map(function (detail) {
    var item = typeof detail === 'string' ? { label: '影响', value: detail } : (detail || {});
    var tone = item.tone === 'danger' || item.tone === 'safe' ? item.tone : 'neutral';
    return '<div class="action-confirm-impact-item" role="listitem" data-tone="' + tone + '">' +
      '<span>' + _escapeHtml(item.label || '影响') + '</span>' +
      '<strong>' + _escapeHtml(item.value || '请确认') + '</strong>' +
    '</div>';
  }).join('');
}

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
