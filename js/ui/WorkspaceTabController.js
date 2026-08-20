// js/ui/WorkspaceTabController.js — Archive/Fleet 工作区的统一 Tab DOM 与键盘 owner

import { resolveDefaultArchiveTab } from './ArchiveWorkspaceRoute.js';

const DEFAULT_GROUP_WORKSPACES = Object.freeze({
  info: 'archive',
  trade: 'fleet',
});

const NAVIGATION_KEYS = Object.freeze([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
]);

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('WorkspaceTabController requires ' + label + '.');
  return value;
}

export function createWorkspaceTabController(dependencies) {
  var deps = dependencies || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var navigate = typeof deps.navigate === 'function' ? deps.navigate : function () { return false; };
  var onChange = typeof deps.onChange === 'function' ? deps.onChange : function () {};
  var getDocument = typeof deps.getDocument === 'function'
    ? deps.getDocument
    : function () { return typeof document === 'undefined' ? null : document; };
  var resolveArchiveTab = typeof deps.resolveArchiveTab === 'function'
    ? deps.resolveArchiveTab
    : resolveDefaultArchiveTab;
  var groupWorkspaces = Object.assign({}, DEFAULT_GROUP_WORKSPACES, deps.groupWorkspaces || {});
  var bindings = [];
  var initialized = false;
  var disposed = false;
  var activationCount = 0;

  function _document() {
    return getDocument();
  }

  function _bind(target, eventName, handler) {
    if (!target || typeof target.addEventListener !== 'function') return false;
    target.addEventListener(eventName, handler);
    bindings.push({ target: target, eventName: eventName, handler: handler });
    return true;
  }

  function _releaseBindings() {
    bindings.splice(0).reverse().forEach(function (binding) {
      if (binding.target && typeof binding.target.removeEventListener === 'function') {
        binding.target.removeEventListener(binding.eventName, binding.handler);
      }
    });
  }

  function _buttons(group) {
    var doc = _document();
    if (!doc || typeof doc.querySelectorAll !== 'function') return [];
    return Array.prototype.slice.call(doc.querySelectorAll('.tab-btn[data-tab-group="' + group + '"]'));
  }

  function _enabledButtons(group) {
    return _buttons(group).filter(function (button) {
      return button && !button.disabled
        && !(button.getAttribute && button.getAttribute('aria-disabled') === 'true');
    });
  }

  function getActive(group) {
    var doc = _document();
    if (!doc || typeof doc.querySelector !== 'function') return '';
    var active = doc.querySelector('.tab-btn[data-tab-group="' + group + '"].active');
    return active && active.dataset ? (active.dataset.tab || '') : '';
  }

  function _projectGroup(group, activeButton) {
    var doc = _document();
    if (!doc || !activeButton) return false;
    var tabId = activeButton.dataset ? activeButton.dataset.tab : '';
    _buttons(group).forEach(function (candidate) {
      var active = candidate === activeButton;
      if (candidate.classList) candidate.classList.toggle('active', active);
      if (typeof candidate.setAttribute === 'function') {
        candidate.setAttribute('aria-selected', active ? 'true' : 'false');
      }
      candidate.tabIndex = active ? 0 : -1;
    });
    if (typeof doc.querySelectorAll === 'function') {
      Array.prototype.slice.call(doc.querySelectorAll('.tab-pane[data-tab-group="' + group + '"]')).forEach(function (pane) {
        var active = pane.id === tabId;
        if (pane.classList) pane.classList.toggle('active', active);
        if (typeof pane.setAttribute === 'function') pane.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
    }
    return true;
  }

  function activate(tabId, options) {
    var doc = _document();
    if (!doc || typeof doc.querySelector !== 'function' || !tabId) return false;
    var button = doc.querySelector('.tab-btn[data-tab="' + tabId + '"]');
    if (!button || button.disabled || (button.getAttribute && button.getAttribute('aria-disabled') === 'true')) {
      return false;
    }

    var group = button.dataset ? (button.dataset.tabGroup || '') : '';
    var previousTabId = getActive(group);
    var changed = previousTabId !== tabId;
    _projectGroup(group, button);

    var workspace = groupWorkspaces[group];
    if (workspace) navigate(workspace);
    if (changed && typeof button.scrollIntoView === 'function') {
      button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    activationCount += 1;
    onChange(tabId, {
      changed: changed,
      group: group,
      previousTabId: previousTabId,
      source: options && options.source ? options.source : 'programmatic',
    });
    return true;
  }

  function _handleKeydown(event) {
    if (!event || NAVIGATION_KEYS.indexOf(event.key) === -1) return;
    var button = event.currentTarget || event.target;
    if (!button || !button.dataset) return;
    var buttons = _enabledButtons(button.dataset.tabGroup || '');
    var currentIndex = buttons.indexOf(button);
    if (currentIndex < 0 || buttons.length === 0) return;
    var nextIndex = currentIndex;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = buttons.length - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex + buttons.length - 1) % buttons.length;
    } else {
      nextIndex = (currentIndex + 1) % buttons.length;
    }
    if (typeof event.preventDefault === 'function') event.preventDefault();
    var nextButton = buttons[nextIndex];
    if (nextButton && typeof nextButton.focus === 'function') nextButton.focus();
    if (nextButton && nextButton.dataset && nextButton.dataset.tab) {
      activate(nextButton.dataset.tab, { source: 'keyboard' });
    }
  }

  function _bindClose(id) {
    var doc = _document();
    var element = doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
    _bind(element, 'click', function () { navigate('map'); });
  }

  function _bindPanelDismiss(id) {
    var doc = _document();
    var panel = doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
    _bind(panel, 'click', function (event) {
      if (event && event.target === panel) navigate('map');
    });
  }

  function init() {
    if (initialized) return false;
    var doc = _document();
    if (!doc || typeof doc.querySelectorAll !== 'function') return false;
    disposed = false;
    initialized = true;
    Array.prototype.slice.call(doc.querySelectorAll('.tab-btn')).forEach(function (button) {
      _bind(button, 'click', function () {
        activate(button.dataset && button.dataset.tab, { source: 'pointer' });
      });
      _bind(button, 'keydown', _handleKeydown);
    });
    Object.keys(groupWorkspaces).forEach(function (group) {
      var buttons = _enabledButtons(group);
      if (buttons.length === 0) return;
      var activeTabId = getActive(group);
      var activeButton = buttons.find(function (button) {
        return button.dataset && button.dataset.tab === activeTabId;
      }) || buttons[0];
      _projectGroup(group, activeButton);
    });
    _bindClose('info-panel-toggle');
    _bindClose('trade-panel-toggle');
    _bindClose('console-panel-close');
    _bindPanelDismiss('info-panel');
    _bindPanelDismiss('trade-panel');
    return true;
  }

  function openArchive(stateOverride, tabId) {
    var resolvedTab = tabId || resolveArchiveTab(stateOverride || getState());
    if (activate(resolvedTab, { source: 'archive-entry' })) return true;
    return !!navigate('archive');
  }

  function setOnChange(callback) {
    onChange = typeof callback === 'function' ? callback : function () {};
    return true;
  }

  function dispose() {
    if (disposed) return false;
    _releaseBindings();
    initialized = false;
    disposed = true;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      activationCount: activationCount,
      activeArchiveTab: getActive('info') || null,
      activeFleetTab: getActive('trade') || null,
      disposed: disposed,
      initialized: initialized,
      listenerCount: bindings.length,
    });
  }

  return Object.freeze({
    activate: activate,
    dispose: dispose,
    getActive: getActive,
    getDiagnostics: getDiagnostics,
    init: init,
    openArchive: openArchive,
    setOnChange: setOnChange,
  });
}
