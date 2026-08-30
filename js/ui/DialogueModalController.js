// js/ui/DialogueModalController.js — 剧情 Modal DOM、Surface、键盘与焦点生命周期

import {
  hideBlockingSurface,
  registerBlockingSurfaceDismiss,
  showBlockingSurface,
} from './SurfaceManager.js';
import { createDialogueSession } from './DialogueSession.js';
import { buildDialogueView } from './DialoguePresenter.js';

const SURFACE_ID = 'dialogue-modal';

function _focusElement(element) {
  if (!element || typeof element.focus !== 'function') return;
  try {
    element.focus({ preventScroll: true });
  } catch (err) {
    element.focus();
  }
}

export function createDialogueModalController(options) {
  var config = options || {};
  var session = config.session || createDialogueSession();
  var buildView = config.buildView || buildDialogueView;
  var bindDismiss = config.bindDismiss || registerBlockingSurfaceDismiss;
  var showSurface = config.showSurface || showBlockingSurface;
  var hideSurface = config.hideSurface || hideBlockingSurface;
  var nodes = null;
  var onComplete = null;
  var nextHandler = null;
  var skipHandler = null;
  var keydownHandler = null;
  var releaseDismiss = null;
  var initCount = 0;
  var renderCount = 0;
  var finishCount = 0;
  var choiceRenderCount = 0;
  var destroyCount = 0;

  function _getDocument() {
    return config.document || globalThis.document || null;
  }

  function _getElement(doc, id) {
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function _resolveNodes() {
    var doc = _getDocument();
    var modal = _getElement(doc, SURFACE_ID);
    if (!modal) return null;
    return {
      branchPanel: _getElement(doc, 'dialogue-branch-panel'),
      choiceBox: _getElement(doc, 'dialogue-choices'),
      content: _getElement(doc, 'dialogue-text'),
      footer: _getElement(doc, 'dialogue-footer'),
      modal: modal,
      modalBox: typeof modal.querySelector === 'function' ? modal.querySelector('.dialogue-modal-box') : null,
      nextButton: _getElement(doc, 'dialogue-next-btn'),
      progress: _getElement(doc, 'dialogue-progress'),
      sceneLabel: _getElement(doc, 'dialogue-scene-label'),
      sceneTitle: _getElement(doc, 'dialogue-scene-title'),
      skipButton: _getElement(doc, 'dialogue-skip-btn'),
      speakerIcon: _getElement(doc, 'dialogue-speaker-icon'),
      speakerName: _getElement(doc, 'dialogue-speaker-name'),
      summary: _getElement(doc, 'dialogue-summary'),
    };
  }

  function _releaseBindings() {
    if (releaseDismiss) releaseDismiss();
    releaseDismiss = null;
    if (!nodes) return;
    if (nodes.nextButton && nextHandler && typeof nodes.nextButton.removeEventListener === 'function') {
      nodes.nextButton.removeEventListener('click', nextHandler);
    }
    if (nodes.skipButton && skipHandler && typeof nodes.skipButton.removeEventListener === 'function') {
      nodes.skipButton.removeEventListener('click', skipHandler);
    }
    if (nodes.modal && keydownHandler && typeof nodes.modal.removeEventListener === 'function') {
      nodes.modal.removeEventListener('keydown', keydownHandler);
    }
    nextHandler = null;
    skipHandler = null;
    keydownHandler = null;
    nodes = null;
  }

  function _renderFactList(element, items, cardTag, className, includeNote) {
    if (!element) return;
    var doc = _getDocument();
    element.innerHTML = '';
    if (Array.isArray(element.children)) element.children.length = 0;
    element.setAttribute('role', 'list');
    (items || []).forEach(function (item) {
      var card = doc.createElement(cardTag);
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

  function _bindChoiceNavigation(button, index, buttons) {
    button.addEventListener('keydown', function (event) {
      var key = event && event.key;
      var targetIndex = index;
      if (key === 'ArrowRight' || key === 'ArrowDown') targetIndex = Math.min(buttons.length - 1, index + 1);
      else if (key === 'ArrowLeft' || key === 'ArrowUp') targetIndex = Math.max(0, index - 1);
      else if (key === 'Home') targetIndex = 0;
      else if (key === 'End') targetIndex = buttons.length - 1;
      else return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      _focusElement(buttons[targetIndex]);
    });
  }

  function _selectChoice(choiceIndex, choiceButtons) {
    var snapshot = session.getSnapshot();
    if (!snapshot.choiceMode) return;
    if (nodes && nodes.choiceBox) nodes.choiceBox.setAttribute('aria-busy', 'true');
    choiceButtons.forEach(function (button) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
    });
    var result = session.selectChoice(choiceIndex);
    if (result.type === 'complete') {
      _finish(false);
      return;
    }
    if (result.changed) {
      _render();
      _focusElement(nodes && nodes.nextButton);
    }
  }

  function _renderChoices(view) {
    var choiceBox = nodes && nodes.choiceBox;
    if (!choiceBox) return;
    var doc = _getDocument();
    choiceBox.setAttribute('role', 'list');
    choiceBox.setAttribute('aria-label', '剧情分支选项');
    choiceBox.setAttribute('aria-busy', 'false');
    choiceBox.innerHTML = '';
    if (Array.isArray(choiceBox.children)) choiceBox.children.length = 0;
    if (!view.choiceMode || view.choices.length === 0) {
      choiceBox.classList.add('hidden');
      choiceBox.setAttribute('aria-hidden', 'true');
      return;
    }

    var choiceButtons = [];
    view.choices.forEach(function (choice) {
      var item = doc.createElement('div');
      var button = doc.createElement('button');
      var text = doc.createElement('span');
      item.className = 'dialogue-choice-item';
      item.setAttribute('role', 'listitem');
      button.type = 'button';
      button.className = 'dialogue-choice-btn';
      button.dataset.dialogueChoiceIndex = String(choice.index);
      button.setAttribute('aria-label', choice.ariaLabel);
      button.setAttribute('aria-labelledby', choice.labelId);
      button.setAttribute('data-dialogue-choice-card', 'true');
      text.className = 'dialogue-choice-text';
      text.id = choice.labelId;
      text.textContent = choice.text;
      button.appendChild(text);
      if (choice.hint) {
        var hint = doc.createElement('span');
        hint.className = 'dialogue-choice-hint';
        hint.id = choice.hintId;
        hint.textContent = choice.hint;
        button.appendChild(hint);
        button.setAttribute('aria-describedby', choice.hintId);
      }
      _bindChoiceNavigation(button, choice.index, choiceButtons);
      button.addEventListener('click', function () { _selectChoice(choice.index, choiceButtons); });
      choiceButtons.push(button);
      item.appendChild(button);
      choiceBox.appendChild(item);
    });
    choiceBox.classList.remove('hidden');
    choiceBox.setAttribute('aria-hidden', 'false');
    choiceRenderCount += 1;
    _focusElement(choiceButtons[0]);
  }

  function _render() {
    if (!nodes) return false;
    var view = buildView(session.getSnapshot());
    if (!view) return false;
    nodes.modal.dataset.dialogueMode = view.mode;
    nodes.modal.dataset.dialogueStep = String(view.step);
    if (nodes.modalBox) {
      nodes.modalBox.dataset.dialogueMode = view.mode;
      nodes.modalBox.dataset.dialogueStep = String(view.step);
    }
    if (nodes.sceneLabel) nodes.sceneLabel.textContent = view.sceneLabel;
    if (nodes.sceneTitle) nodes.sceneTitle.textContent = view.sceneTitle;
    if (nodes.speakerIcon) nodes.speakerIcon.textContent = view.speakerIcon;
    if (nodes.speakerName) nodes.speakerName.textContent = view.speakerName;
    if (nodes.content) nodes.content.textContent = view.text;
    if (nodes.footer) {
      nodes.footer.textContent = view.footerText;
      nodes.footer.classList.toggle('hidden', !view.footerVisible);
      nodes.footer.setAttribute('aria-hidden', view.footerVisible ? 'false' : 'true');
    }
    if (nodes.progress) {
      nodes.progress.setAttribute('role', 'progressbar');
      nodes.progress.setAttribute('aria-label', '剧情进度');
      nodes.progress.setAttribute('aria-valuemin', '1');
      nodes.progress.setAttribute('aria-valuemax', String(view.totalSteps));
      nodes.progress.setAttribute('aria-valuenow', String(view.currentStep));
      nodes.progress.setAttribute('aria-valuetext', '第 ' + view.currentStep + ' / ' + view.totalSteps + ' 段');
      nodes.progress.innerHTML = view.progressHtml;
    }
    if (nodes.summary) nodes.summary.setAttribute('aria-label', '剧情状态摘要');
    if (nodes.branchPanel) nodes.branchPanel.setAttribute('aria-label', '剧情分支状态');
    _renderFactList(nodes.summary, view.summaryItems, 'span', 'dialogue-summary-item', false);
    _renderFactList(nodes.branchPanel, view.branchItems, 'article', 'dialogue-branch-item', true);
    if (nodes.nextButton) {
      nodes.nextButton.textContent = view.nextButton.label;
      nodes.nextButton.setAttribute('aria-label', view.nextButton.ariaLabel);
      nodes.nextButton.classList.toggle('hidden', view.nextButton.hidden);
      nodes.nextButton.disabled = view.nextButton.disabled;
      nodes.nextButton.setAttribute('aria-hidden', view.nextButton.hidden ? 'true' : 'false');
    }
    _renderChoices(view);
    renderCount += 1;
    return true;
  }

  function _advance() {
    var result = session.advance();
    if (result.type === 'complete') {
      _finish(false);
      return;
    }
    if (result.changed) _render();
  }

  function _finish(skipped) {
    var callback = onComplete;
    var snapshot = session.getSnapshot();
    var choiceId = snapshot.selectedChoice ? snapshot.selectedChoice.id : null;
    hideScene();
    finishCount += 1;
    if (typeof callback === 'function') callback({ skipped: !!skipped, choiceId: choiceId });
  }

  function init() {
    var resolved = _resolveNodes();
    if (!resolved) return false;
    if (nodes && nodes.modal === resolved.modal && nextHandler && skipHandler && keydownHandler) return true;
    _releaseBindings();
    nodes = resolved;
    nextHandler = _advance;
    skipHandler = function () { _finish(true); };
    keydownHandler = function (event) {
      if (!isOpen()) return;
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (session.getSnapshot().choiceMode) return;
      var targetTag = event.target && event.target.tagName ? String(event.target.tagName).toUpperCase() : '';
      if (targetTag === 'BUTTON' || targetTag === 'INPUT' || targetTag === 'SELECT' || targetTag === 'TEXTAREA') return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      _advance();
    };
    if (nodes.nextButton && typeof nodes.nextButton.addEventListener === 'function') nodes.nextButton.addEventListener('click', nextHandler);
    if (nodes.skipButton && typeof nodes.skipButton.addEventListener === 'function') nodes.skipButton.addEventListener('click', skipHandler);
    if (typeof nodes.modal.addEventListener === 'function') nodes.modal.addEventListener('keydown', keydownHandler);
    var release = bindDismiss(SURFACE_ID, { onDismiss: function () { _finish(true); } });
    releaseDismiss = typeof release === 'function' ? release : null;
    initCount += 1;
    return true;
  }

  function showScene(scene, callback) {
    if (!scene || !Array.isArray(scene.lines) || scene.lines.length === 0) {
      if (typeof callback === 'function') callback({ skipped: false, empty: true });
      return false;
    }
    if (!nodes && !init()) {
      if (typeof callback === 'function') callback({ skipped: true, unavailable: true });
      return false;
    }
    if (!session.start(scene)) return false;
    onComplete = typeof callback === 'function' ? callback : null;
    _render();
    showSurface(SURFACE_ID);
    _focusElement(nodes && nodes.nextButton);
    return true;
  }

  function hideScene() {
    hideSurface(SURFACE_ID);
    session.reset();
    onComplete = null;
    return true;
  }

  function isOpen() {
    return !!(nodes && nodes.modal && nodes.modal.classList && !nodes.modal.classList.contains('hidden') && session.getSnapshot().active);
  }

  function destroy() {
    hideScene();
    _releaseBindings();
    destroyCount += 1;
    return getDiagnostics();
  }

  function getDiagnostics() {
    return Object.freeze({
      bound: !!nodes,
      choiceRenderCount: choiceRenderCount,
      dismissBound: !!releaseDismiss,
      destroyCount: destroyCount,
      finishCount: finishCount,
      initCount: initCount,
      renderCount: renderCount,
      session: session.getDiagnostics(),
    });
  }

  return Object.freeze({
    destroy: destroy,
    getDiagnostics: getDiagnostics,
    hideScene: hideScene,
    init: init,
    isOpen: isOpen,
    showScene: showScene,
  });
}
