// js/ui/TutorialOverlayController.js — 教程事件、交互、高亮与焦点生命周期

import * as EventBus from '../core/EventBus.js';
import { buildTutorialStepView } from './TutorialStepPresenter.js';
import { createTutorialTooltipLayout } from './TutorialTooltipLayout.js';

export function createTutorialOverlayController(options) {
  var config = options || {};
  var eventBus = config.eventBus || EventBus;
  var layoutOptions = Object.assign({}, config.layoutOptions || {});
  if (config.document && !layoutOptions.document) layoutOptions.document = config.document;
  if (config.window && !layoutOptions.window) layoutOptions.window = config.window;
  var layout = config.layout || createTutorialTooltipLayout(layoutOptions);
  var overlay = null;
  var tooltip = null;
  var highlightedElement = null;
  var returnFocusTarget = null;
  var onAdvance = null;
  var onSkip = null;
  var onHelperAction = null;
  var stepHandler = null;
  var completeHandler = null;
  var initialized = false;
  var initCount = 0;
  var renderCount = 0;
  var showCount = 0;
  var hideCount = 0;
  var destroyCount = 0;
  var lastStepNumber = null;

  function _getDocument() {
    return config.document || globalThis.document || null;
  }

  function _clearHighlight() {
    if (highlightedElement && highlightedElement.classList) {
      highlightedElement.classList.remove('tut-highlight');
      highlightedElement = null;
    }
    var doc = _getDocument();
    if (!doc || typeof doc.querySelectorAll !== 'function') return;
    Array.from(doc.querySelectorAll('.tut-highlight')).forEach(function (element) {
      if (element && element.classList) element.classList.remove('tut-highlight');
    });
  }

  function _rememberTrigger() {
    var doc = _getDocument();
    if (returnFocusTarget || !doc) return;
    var activeElement = doc.activeElement;
    if (!activeElement || activeElement === tooltip || typeof activeElement.focus !== 'function') return;
    if (tooltip && typeof tooltip.contains === 'function' && tooltip.contains(activeElement)) return;
    returnFocusTarget = activeElement;
  }

  function _restoreTrigger() {
    var target = returnFocusTarget;
    returnFocusTarget = null;
    if (!target || target.disabled || target.hidden || typeof target.focus !== 'function') return;
    if (typeof target.getAttribute === 'function' && target.getAttribute('aria-hidden') === 'true') return;
    try {
      target.focus({ preventScroll: true });
    } catch (err) {
      target.focus();
    }
  }

  function _bindStepButtons(step) {
    var doc = _getDocument();
    if (!doc || typeof doc.getElementById !== 'function') return;
    var nextButton = doc.getElementById('tut-next-btn');
    if (nextButton && typeof nextButton.addEventListener === 'function') {
      nextButton.addEventListener('click', function () {
        if (typeof onAdvance === 'function') onAdvance();
      });
    }
    var helperButton = doc.getElementById('tut-helper-action-btn');
    if (helperButton && typeof helperButton.addEventListener === 'function') {
      helperButton.addEventListener('click', function () {
        if (typeof onHelperAction === 'function') onHelperAction(helperButton.dataset.tutorialAction, step);
      });
    }
    var skipButton = doc.getElementById('tut-skip-btn');
    if (skipButton && typeof skipButton.addEventListener === 'function') {
      skipButton.addEventListener('click', function () {
        if (typeof onSkip === 'function') onSkip();
      });
    }
  }

  function _renderStep(step, index, total) {
    if (!overlay || !tooltip) return false;
    var safeStep = step || {};
    var view = buildTutorialStepView({ step: safeStep, index: index, total: total });
    _rememberTrigger();
    tooltip.innerHTML = view.html;
    tooltip.dataset.step = String(view.stepNumber);
    tooltip.dataset.totalSteps = String(view.totalSteps);
    tooltip.dataset.trigger = view.trigger;
    tooltip.setAttribute('aria-describedby', view.ariaDescribedBy);
    tooltip.setAttribute('aria-label', view.ariaLabel);
    _bindStepButtons(safeStep);

    _clearHighlight();
    var doc = _getDocument();
    if (view.highlight && doc && typeof doc.querySelector === 'function') {
      highlightedElement = doc.querySelector(view.highlight);
      if (highlightedElement && highlightedElement.classList) highlightedElement.classList.add('tut-highlight');
    }
    layout.position(view.position, highlightedElement);
    renderCount += 1;
    lastStepNumber = view.stepNumber;
    show();
    return true;
  }

  function _releaseEventHandlers() {
    if (stepHandler && eventBus && typeof eventBus.off === 'function') eventBus.off('tutorial:step', stepHandler);
    if (completeHandler && eventBus && typeof eventBus.off === 'function') eventBus.off('tutorial:complete', completeHandler);
    stepHandler = null;
    completeHandler = null;
  }

  function init(onAdvanceCallback, onSkipCallback, onHelperActionCallback) {
    onAdvance = typeof onAdvanceCallback === 'function' ? onAdvanceCallback : null;
    onSkip = typeof onSkipCallback === 'function' ? onSkipCallback : null;
    onHelperAction = typeof onHelperActionCallback === 'function' ? onHelperActionCallback : null;
    var doc = _getDocument();
    overlay = doc && typeof doc.getElementById === 'function' ? doc.getElementById('tutorial-overlay') : null;
    tooltip = doc && typeof doc.getElementById === 'function' ? doc.getElementById('tutorial-tooltip') : null;
    if (!overlay || !tooltip) {
      _releaseEventHandlers();
      layout.dispose();
      initialized = false;
      return false;
    }
    layout.bind(tooltip);
    _releaseEventHandlers();
    stepHandler = function (data) {
      var request = data || {};
      _renderStep(request.step, request.index, request.total);
    };
    completeHandler = hide;
    if (eventBus && typeof eventBus.on === 'function') {
      eventBus.on('tutorial:step', stepHandler);
      eventBus.on('tutorial:complete', completeHandler);
    }
    initialized = true;
    initCount += 1;
    return true;
  }

  function show() {
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.setAttribute('aria-hidden', 'false');
    }
    if (tooltip) {
      tooltip.classList.remove('hidden');
      tooltip.setAttribute('aria-hidden', 'false');
      tooltip.setAttribute('tabindex', '-1');
      if (typeof tooltip.focus === 'function') {
        try {
          tooltip.focus({ preventScroll: true });
        } catch (err) {
          tooltip.focus();
        }
      }
    }
    showCount += 1;
    return !!overlay && !!tooltip;
  }

  function hide() {
    layout.cancelScheduled();
    var doc = _getDocument();
    var activeElement = doc ? doc.activeElement : null;
    var shouldRestoreFocus = !!(tooltip && (
      activeElement === tooltip ||
      (typeof tooltip.contains === 'function' && tooltip.contains(activeElement))
    ));
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (tooltip) {
      tooltip.classList.add('hidden');
      tooltip.setAttribute('aria-hidden', 'true');
      tooltip.removeAttribute('aria-label');
    }
    _clearHighlight();
    if (shouldRestoreFocus) _restoreTrigger();
    else returnFocusTarget = null;
    hideCount += 1;
    return true;
  }

  function destroy() {
    hide();
    layout.dispose();
    _releaseEventHandlers();
    overlay = null;
    tooltip = null;
    highlightedElement = null;
    returnFocusTarget = null;
    onAdvance = null;
    onSkip = null;
    onHelperAction = null;
    initialized = false;
    destroyCount += 1;
    return getDiagnostics();
  }

  function getDiagnostics() {
    return Object.freeze({
      destroyCount: destroyCount,
      hideCount: hideCount,
      initCount: initCount,
      initialized: initialized,
      lastStepNumber: lastStepNumber,
      layout: layout.getDiagnostics(),
      renderCount: renderCount,
      showCount: showCount,
    });
  }

  return Object.freeze({
    destroy: destroy,
    getDiagnostics: getDiagnostics,
    hide: hide,
    init: init,
    show: show,
  });
}
