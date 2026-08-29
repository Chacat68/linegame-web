// js/ui/HudInteractionController.js — HUD 事件、弹层与星图工具生命周期

import {
  renderVictoryProgressModal,
  renderVictoryProgressSummary,
} from './VictoryProgressPresenter.js';

function _call(target, methodName, args) {
  if (!target || typeof target[methodName] !== 'function') return undefined;
  return target[methodName].apply(target, args || []);
}

export function createHudInteractionController(options) {
  var opts = options || {};
  var events = opts.events || {};
  var surfaces = opts.surfaces || {};
  var contextInspector = opts.contextInspector || {};
  var logsController = opts.logsController || {};
  var victory = opts.victory || {};
  var renderGalaxySummary = typeof opts.renderGalaxySummary === 'function'
    ? opts.renderGalaxySummary
    : function () {};
  var getDocument = typeof opts.getDocument === 'function'
    ? opts.getDocument
    : function () { return typeof document === 'undefined' ? null : document; };
  var getWindow = typeof opts.getWindow === 'function'
    ? opts.getWindow
    : function () { return typeof window === 'undefined' ? null : window; };

  var stateSource = typeof opts.getState === 'function' ? opts.getState : function () { return null; };
  var revisionSource = null;
  var victoryActions = null;
  var progressList = [];
  var initialized = false;
  var disposed = false;
  var domListeners = [];
  var eventListenersBound = false;
  var galaxyToggleElement = null;

  function _state() {
    return typeof stateSource === 'function' ? stateSource() : null;
  }

  function _bindDom(target, eventName, listener) {
    if (!target || typeof target.addEventListener !== 'function') return false;
    target.addEventListener(eventName, listener);
    domListeners.push({ target: target, eventName: eventName, listener: listener });
    return true;
  }

  function _removeDomListeners() {
    domListeners.forEach(function (record) {
      if (record.target && typeof record.target.removeEventListener === 'function') {
        record.target.removeEventListener(record.eventName, record.listener);
      }
    });
    domListeners = [];
    galaxyToggleElement = null;
  }

  function _handleLogMessage(data) {
    var payload = data || {};
    _call(logsController, 'addMessage', [payload]);
  }

  function _handleLogBadgeClear() {
    _call(logsController, 'clearUnreadCount', []);
    _call(logsController, 'refresh', []);
  }

  function _bindEvents() {
    if (eventListenersBound || typeof events.on !== 'function') return false;
    events.on('log:message', _handleLogMessage);
    events.on('logs:badge:clear', _handleLogBadgeClear);
    eventListenersBound = true;
    return true;
  }

  function _releaseEvents() {
    if (!eventListenersBound) return;
    if (typeof events.off === 'function') {
      events.off('log:message', _handleLogMessage);
      events.off('logs:badge:clear', _handleLogBadgeClear);
    }
    eventListenersBound = false;
  }

  function _handleVictoryOpen() {
    renderVictoryProgressModal(progressList, getDocument());
    _call(surfaces, 'show', ['victory-modal', { focusSelector: '#victory-modal-close' }]);
  }

  function _handleVictoryClose() {
    _call(surfaces, 'hide', ['victory-modal']);
  }

  function _handleVictoryPolicy(event) {
    var target = event && event.target;
    var button = target && typeof target.closest === 'function'
      ? target.closest('[data-victory-policy-id]')
      : null;
    var state = _state();
    if (!button || !state || button.disabled) return false;
    var pathId = button.dataset && button.dataset.victoryPolicyId;
    var win = getWindow();
    if (win && typeof win.confirm === 'function'
        && !win.confirm('长期路线会写入存档且不可更改。确认选择？')) return false;
    if (!victoryActions || typeof victoryActions.onChoosePolicy !== 'function') return false;
    var result = victoryActions.onChoosePolicy(pathId) || {};
    progressList = Array.isArray(result.progress)
      ? result.progress
      : (typeof victory.getProgress === 'function' ? victory.getProgress(state) : []);
    renderVictoryProgressModal(progressList, getDocument());
    return true;
  }

  function _handleGalaxyToggle() {
    if (typeof events.emit === 'function') events.emit('starmap:galaxy-view-toggle');
    var state = _state();
    if (state) renderGalaxySummary(state);
  }

  function ensureGalaxyToggle() {
    var doc = getDocument();
    var next = doc && typeof doc.getElementById === 'function'
      ? doc.getElementById('hud-galactic-map-toggle')
      : null;
    if (next === galaxyToggleElement) return !!next;
    if (galaxyToggleElement && typeof galaxyToggleElement.removeEventListener === 'function') {
      galaxyToggleElement.removeEventListener('click', _handleGalaxyToggle);
    }
    domListeners = domListeners.filter(function (record) {
      return record.target !== galaxyToggleElement || record.listener !== _handleGalaxyToggle;
    });
    galaxyToggleElement = next;
    if (!next) return false;
    _bindDom(next, 'click', _handleGalaxyToggle);
    return true;
  }

  function initialize(runtimeOptions) {
    var runtime = runtimeOptions || {};
    if (typeof runtime.stateSource === 'function') stateSource = runtime.stateSource;
    if (typeof runtime.revisionSource === 'function') revisionSource = runtime.revisionSource;
    if (initialized) return false;
    disposed = false;
    _bindEvents();

    var doc = getDocument();
    var modal = doc && typeof doc.getElementById === 'function' ? doc.getElementById('victory-modal') : null;
    var openButton = doc && doc.getElementById('victory-progress-btn');
    var closeButton = doc && doc.getElementById('victory-modal-close');
    var body = doc && doc.getElementById('victory-modal-body');
    _bindDom(openButton, 'click', _handleVictoryOpen);
    _bindDom(closeButton, 'click', _handleVictoryClose);
    _bindDom(body, 'click', _handleVictoryPolicy);
    if (modal) _call(surfaces, 'bindDismiss', ['victory-modal']);
    ensureGalaxyToggle();

    var win = getWindow();
    var compact = !!(win && typeof win.matchMedia === 'function'
      && win.matchMedia('(max-width: 900px)').matches);
    _call(contextInspector, 'init', [{
      open: !compact,
      compact: compact,
      stateSource: stateSource,
      revisionSource: revisionSource,
    }]);
    _call(logsController, 'initialize', []);
    initialized = true;
    return true;
  }

  function setVictoryActions(actions) {
    victoryActions = actions || null;
  }

  function syncVictory(nextProgressList, unlockedPathCount) {
    if (disposed) return false;
    progressList = Array.isArray(nextProgressList) ? nextProgressList : [];
    var doc = getDocument();
    renderVictoryProgressSummary(progressList, unlockedPathCount, doc);
    var modal = doc && typeof doc.getElementById === 'function' ? doc.getElementById('victory-modal') : null;
    if (modal && modal.classList && !modal.classList.contains('hidden')) {
      renderVictoryProgressModal(progressList, doc);
    }
    return true;
  }

  function dispose() {
    if (disposed && !initialized) return false;
    _releaseEvents();
    _removeDomListeners();
    _call(logsController, 'dispose', []);
    victoryActions = null;
    progressList = [];
    initialized = false;
    disposed = true;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      disposed: disposed,
      domListenerCount: domListeners.length,
      eventListenersBound: eventListenersBound,
      initialized: initialized,
      progressPathCount: progressList.length,
      victoryActionsBound: !!victoryActions,
    });
  }

  return Object.freeze({
    dispose: dispose,
    ensureGalaxyToggle: ensureGalaxyToggle,
    getDiagnostics: getDiagnostics,
    initialize: initialize,
    setVictoryActions: setVictoryActions,
    syncVictory: syncVictory,
  });
}
