// js/ui/OnboardingUI.js — 首次进入与公司命名弹窗交互

import { hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js';

export function showTutorialStart(options) {
  var opts = options || {};
  var modal = document.getElementById('tutorial-start-modal');
  var startButton = document.getElementById('tut-start-yes');
  var skipButton = document.getElementById('tut-start-no');
  var settled = false;

  if (!modal || !startButton || !skipButton) return false;

  modal.dataset.tutorialStartState = 'ready';
  modal.setAttribute('aria-busy', 'false');
  _setButtonsDisabled([startButton, skipButton], false);

  function settle(action) {
    if (settled) return;
    settled = true;
    modal.dataset.tutorialStartState = action;
    modal.setAttribute('aria-busy', 'true');
    _setButtonsDisabled([startButton, skipButton], true);
    hideBlockingSurface('tutorial-start-modal');

    if (action === 'starting' && typeof opts.onStart === 'function') opts.onStart();
    if (action === 'skipping' && typeof opts.onSkip === 'function') opts.onSkip();
  }

  startButton.onclick = function () {
    settle('starting');
  };
  skipButton.onclick = function () {
    settle('skipping');
  };

  showBlockingSurface('tutorial-start-modal');
  _focusElement(startButton);
  return true;
}

export function showCompanyRename(options) {
  var opts = options || {};
  var modal = document.getElementById('company-rename-modal');
  var input = document.getElementById('company-name-input');
  var errorElement = document.getElementById('company-name-error');
  var confirmButton = document.getElementById('company-rename-confirm');
  var skipButton = document.getElementById('company-rename-skip');
  var committed = false;

  if (!modal || !input || !confirmButton || !skipButton) return false;

  input.value = opts.currentName || '';
  modal.dataset.companyNameState = 'editing';
  modal.setAttribute('aria-busy', 'false');
  _setButtonsDisabled([confirmButton, skipButton], false);
  _updateCompanyRenameFeedback(input, errorElement, {
    fallbackName: opts.fallbackName || '测试公司',
  });

  function commit() {
    if (committed) return;
    var name = input.value.trim();

    if (!name) {
      modal.dataset.companyNameState = 'invalid';
      _updateCompanyRenameFeedback(input, errorElement, {
        fallbackName: opts.fallbackName || '测试公司',
        validate: true,
      });
      _focusElement(input);
      return;
    }

    committed = true;
    modal.dataset.companyNameState = 'submitting';
    modal.setAttribute('aria-busy', 'true');
    _setButtonsDisabled([confirmButton, skipButton], true);
    hideBlockingSurface('company-rename-modal');
    if (typeof opts.onConfirm === 'function') opts.onConfirm(name);
  }

  input.oninput = function () {
    modal.dataset.companyNameState = 'editing';
    _updateCompanyRenameFeedback(input, errorElement, {
      fallbackName: opts.fallbackName || '测试公司',
    });
  };
  input.onkeydown = function (event) {
    if (!event || event.key !== 'Enter') return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    commit();
  };
  confirmButton.onclick = commit;
  skipButton.onclick = function () {
    if (committed) return;
    committed = true;
    modal.dataset.companyNameState = 'skipping';
    modal.setAttribute('aria-busy', 'true');
    _setButtonsDisabled([confirmButton, skipButton], true);
    hideBlockingSurface('company-rename-modal');
    if (typeof opts.onSkip === 'function') opts.onSkip();
  };

  showBlockingSurface('company-rename-modal');
  _focusElement(input);
  if (typeof input.select === 'function') input.select();
  return true;
}

function _updateCompanyRenameFeedback(input, errorElement, options) {
  if (!input) return;

  var opts = options || {};
  var rawName = String(input.value || '');
  var name = rawName.trim();
  var lengthElement = document.getElementById('company-name-length');
  var statusElement = document.getElementById('company-name-status');
  var previewElement = document.getElementById('company-name-preview');
  var confirmButton = document.getElementById('company-rename-confirm');
  var hasName = name.length > 0;

  if (lengthElement) lengthElement.textContent = rawName.length + '/24';
  if (previewElement) previewElement.textContent = hasName ? name : opts.fallbackName;
  if (statusElement) {
    statusElement.textContent = hasName ? '可写入' : (opts.validate ? '缺少代号' : '待输入');
    _setSignalTone(statusElement, hasName ? 'ready' : (opts.validate ? 'error' : 'pending'));
  }
  _setSignalTone(lengthElement, hasName ? 'ready' : 'neutral');
  _setSignalTone(previewElement, hasName ? 'ready' : 'neutral');

  if (errorElement) {
    var showError = !hasName && !!opts.validate;
    errorElement.classList.toggle('hidden', !showError);
    errorElement.setAttribute('aria-hidden', showError ? 'false' : 'true');
  }

  input.setAttribute('aria-invalid', hasName || !opts.validate ? 'false' : 'true');
  if (confirmButton) {
    confirmButton.disabled = !hasName;
    confirmButton.setAttribute('aria-disabled', hasName ? 'false' : 'true');
  }
}

function _setSignalTone(element, tone) {
  if (!element || !element.parentElement || !element.parentElement.dataset) return;
  element.parentElement.dataset.companyNameTone = tone || 'neutral';
}

function _setButtonsDisabled(buttons, disabled) {
  buttons.forEach(function (button) {
    if (!button) return;
    button.disabled = !!disabled;
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  });
}

function _focusElement(element) {
  if (!element || typeof element.focus !== 'function') return;
  try {
    element.focus({ preventScroll: true });
  } catch (err) {
    element.focus();
  }
}
