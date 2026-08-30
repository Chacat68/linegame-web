// js/ui/EventSurfaceController.js — 随机事件 Blocking Surface、DOM 与选择交互 owner

import {
  hideBlockingSurface,
  registerBlockingSurfaceDismiss,
  showBlockingSurface,
} from './SurfaceManager.js';
import { buildEventView } from './EventPresenter.js';

const SURFACE_ID = 'event-modal';

function _optionalFunction(value, fallback) {
  return typeof value === 'function' ? value : fallback;
}

function _focusElement(element) {
  if (!element || typeof element.focus !== 'function') return;
  try {
    element.focus({ preventScroll: true });
  } catch (err) {
    element.focus();
  }
  if (typeof element.closest !== 'function' || typeof element.getBoundingClientRect !== 'function') return;
  var scrollContainer = element.closest('.stack-modal-scroll');
  if (!scrollContainer || typeof scrollContainer.getBoundingClientRect !== 'function') return;
  var elementRect = element.getBoundingClientRect();
  var containerRect = scrollContainer.getBoundingClientRect();
  if (elementRect.top >= containerRect.top && elementRect.bottom <= containerRect.bottom) return;
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function _clearElement(element) {
  if (!element) return;
  element.innerHTML = '';
  if (Array.isArray(element.children)) element.children.length = 0;
}

export function createEventSurfaceController(options) {
  var config = options || {};
  var getDocument = _optionalFunction(config.getDocument, function () {
    return typeof globalThis !== 'undefined' ? globalThis.document : null;
  });
  var buildView = _optionalFunction(config.buildView, buildEventView);
  var bindDismiss = _optionalFunction(config.bindDismiss, registerBlockingSurfaceDismiss);
  var showSurface = _optionalFunction(config.showSurface, showBlockingSurface);
  var hideSurface = _optionalFunction(config.hideSurface, hideBlockingSurface);
  var nodes = null;
  var bindings = [];
  var choiceButtons = [];
  var onCommit = null;
  var releaseDismiss = null;
  var active = false;
  var choiceCommitted = false;
  var choiceCommitCount = 0;
  var disposeCount = 0;
  var hideCount = 0;
  var lastChoiceIndex = null;
  var lastEventId = null;
  var lastRisk = null;
  var lastStage = null;
  var renderCount = 0;
  var showCount = 0;

  function _document() {
    return getDocument() || null;
  }

  function _element(doc, id) {
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function _resolveNodes() {
    var doc = _document();
    if (!doc || typeof doc.createElement !== 'function') return null;
    var modal = _element(doc, SURFACE_ID);
    var choices = _element(doc, 'event-choices');
    if (!modal || !choices) return null;
    return {
      choices: choices,
      description: _element(doc, 'event-desc'),
      icon: _element(doc, 'event-icon'),
      impact: _element(doc, 'event-impact'),
      meta: _element(doc, 'event-meta'),
      modal: modal,
      summary: _element(doc, 'event-summary'),
      title: _element(doc, 'event-title'),
    };
  }

  function _bind(element, type, handler) {
    if (!element || typeof element.addEventListener !== 'function') return;
    element.addEventListener(type, handler);
    bindings.push({ element: element, handler: handler, type: type });
  }

  function _releaseBindings() {
    bindings.forEach(function (binding) {
      if (binding.element && typeof binding.element.removeEventListener === 'function') {
        binding.element.removeEventListener(binding.type, binding.handler);
      }
    });
    bindings = [];
    choiceButtons = [];
    if (releaseDismiss) releaseDismiss();
    releaseDismiss = null;
  }

  function _renderFactList(element, items, className, includeNote) {
    if (!element) return;
    var doc = _document();
    _clearElement(element);
    element.setAttribute('role', 'list');
    (items || []).forEach(function (item) {
      var card = doc.createElement(includeNote ? 'article' : 'span');
      var label = doc.createElement('span');
      var value = doc.createElement('strong');
      card.className = className;
      card.setAttribute('role', 'listitem');
      label.textContent = item.label;
      value.textContent = item.value;
      card.appendChild(label);
      card.appendChild(value);
      if (includeNote) {
        var note = doc.createElement('small');
        note.textContent = item.note;
        card.appendChild(note);
      }
      element.appendChild(card);
    });
  }

  function _renderMeta(view) {
    if (!nodes.meta) return;
    _clearElement(nodes.meta);
    nodes.meta.hidden = view.meta.hidden;
    nodes.meta.setAttribute('aria-hidden', view.meta.hidden ? 'true' : 'false');
    if (view.meta.hidden) return;
    nodes.meta.setAttribute('role', 'list');
    nodes.meta.setAttribute('aria-label', '事件标签');
    var doc = _document();
    view.meta.tags.forEach(function (tag) {
      var badge = doc.createElement('span');
      badge.className = tag.className;
      badge.textContent = tag.text;
      badge.setAttribute('role', 'listitem');
      nodes.meta.appendChild(badge);
    });
  }

  function _bindChoiceNavigation(button, index) {
    _bind(button, 'keydown', function (event) {
      var key = event && event.key;
      var targetIndex = index;
      if (key === 'ArrowRight' || key === 'ArrowDown') targetIndex = Math.min(choiceButtons.length - 1, index + 1);
      else if (key === 'ArrowLeft' || key === 'ArrowUp') targetIndex = Math.max(0, index - 1);
      else if (key === 'Home') targetIndex = 0;
      else if (key === 'End') targetIndex = choiceButtons.length - 1;
      else return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      _focusElement(choiceButtons[targetIndex]);
    });
  }

  function _closeSurface() {
    var hadActiveTransaction = active || bindings.length > 0 || !!releaseDismiss;
    hideSurface(SURFACE_ID);
    active = false;
    onCommit = null;
    _releaseBindings();
    if (hadActiveTransaction) hideCount += 1;
    return true;
  }

  function _commitChoice(choice) {
    if (choiceCommitted) return false;
    choiceCommitted = true;
    var callback = onCommit;
    if (nodes && nodes.choices) nodes.choices.setAttribute('aria-busy', 'true');
    if (nodes && nodes.modal) nodes.modal.dataset.eventState = 'resolving';
    choiceButtons.forEach(function (button) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
    });
    lastChoiceIndex = choice.index;
    choiceCommitCount += 1;
    _closeSurface();
    if (typeof callback === 'function') callback(choice.index, choice);
    return true;
  }

  function _renderChoices(view) {
    var doc = _document();
    _clearElement(nodes.choices);
    nodes.choices.setAttribute('role', 'list');
    nodes.choices.setAttribute('aria-label', '事件处置选项');
    nodes.choices.setAttribute('aria-busy', 'false');
    choiceButtons = [];
    view.choices.forEach(function (choice) {
      var item = doc.createElement('article');
      var button = doc.createElement('button');
      var text = doc.createElement('span');
      item.className = 'event-choice-item';
      item.setAttribute('role', 'listitem');
      button.type = 'button';
      button.className = 'event-choice-btn';
      button.dataset.eventChoiceIndex = String(choice.index);
      button.setAttribute('aria-label', choice.ariaLabel);
      button.setAttribute('aria-labelledby', choice.labelId);
      button.setAttribute('data-event-choice-card', 'true');
      text.className = 'choice-text';
      text.id = choice.labelId;
      text.textContent = choice.text;
      button.appendChild(text);
      if (choice.tooltip) {
        var tooltip = doc.createElement('span');
        tooltip.className = 'choice-tooltip';
        tooltip.id = choice.hintId;
        tooltip.textContent = choice.tooltip;
        button.appendChild(tooltip);
        button.setAttribute('aria-describedby', choice.hintId);
      }
      choiceButtons.push(button);
      _bindChoiceNavigation(button, choice.index);
      _bind(button, 'click', function () { _commitChoice(choice); });
      item.appendChild(button);
      nodes.choices.appendChild(item);
    });
  }

  function _render(view) {
    nodes.modal.dataset.eventRisk = view.risk;
    nodes.modal.dataset.eventStage = view.stage;
    nodes.modal.dataset.eventState = 'ready';
    if (nodes.icon) nodes.icon.textContent = view.icon;
    if (nodes.title) nodes.title.textContent = view.title;
    if (nodes.description) nodes.description.textContent = view.description;
    _renderMeta(view);
    if (nodes.summary) nodes.summary.setAttribute('aria-label', '事件状态摘要');
    if (nodes.impact) nodes.impact.setAttribute('aria-label', '事件影响预览');
    _renderFactList(nodes.summary, view.summaryItems, 'event-summary-item', false);
    _renderFactList(nodes.impact, view.impactItems, 'event-impact-item', true);
    _renderChoices(view);
    renderCount += 1;
    return true;
  }

  function show(event, callback) {
    var view = buildView(event);
    if (!view) return false;
    if (active) _closeSurface();
    else _releaseBindings();
    nodes = _resolveNodes();
    if (!nodes) return false;
    choiceCommitted = false;
    onCommit = typeof callback === 'function' ? callback : null;
    _render(view);
    var release = bindDismiss(SURFACE_ID, {
      closeOnBackdrop: false,
      closeOnEscape: false,
    });
    releaseDismiss = typeof release === 'function' ? release : null;
    showSurface(SURFACE_ID);
    active = true;
    lastEventId = view.id;
    lastRisk = view.risk;
    lastStage = view.stage;
    showCount += 1;
    _focusElement(choiceButtons[0]);
    return true;
  }

  function hide() {
    choiceCommitted = false;
    return _closeSurface();
  }

  function dispose() {
    var currentNodes = nodes;
    hide();
    if (currentNodes && currentNodes.choices) _clearElement(currentNodes.choices);
    nodes = null;
    disposeCount += 1;
    return getDiagnostics();
  }

  function getDiagnostics() {
    return Object.freeze({
      active: active,
      bindingCount: bindings.length,
      choiceCommitCount: choiceCommitCount,
      dismissBound: !!releaseDismiss,
      disposeCount: disposeCount,
      domResolved: !!nodes,
      hideCount: hideCount,
      lastChoiceIndex: lastChoiceIndex,
      lastEventId: lastEventId,
      lastRisk: lastRisk,
      lastStage: lastStage,
      renderCount: renderCount,
      showCount: showCount,
    });
  }

  return Object.freeze({
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    hide: hide,
    show: show,
  });
}
