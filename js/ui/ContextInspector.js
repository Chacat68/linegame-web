// js/ui/ContextInspector.js — 星图上下文检查器控制器
// 职责：管理检查器的开合、切片互斥、键盘导航与焦点恢复。

import * as EventBus from '../core/EventBus.js';

const ROOT_ID = 'context-inspector';
const TOGGLE_SELECTOR = '[data-context-inspector-toggle]';
const CLOSE_SELECTOR = '[data-context-inspector-close]';
const TAB_SELECTOR = '[data-context-inspector-tab]';
const PANE_SELECTOR = '[data-context-inspector-pane]';
const DEFAULT_TAB_ID = 'target';
const RAIL_EVENT = 'starmap-rail:panel-open';
const RAIL_SOURCE = 'context-inspector';

let _root = null;
let _toggle = null;
let _closeButton = null;
let _tabs = [];
let _panes = [];
let _activeTab = null;
let _isOpen = false;
let _railListenerBound = false;

function _getDocument(options) {
  if (options && options.document) return options.document;
  return typeof document !== 'undefined' ? document : null;
}

function _toArray(value) {
  return value ? Array.prototype.slice.call(value) : [];
}

function _getTabId(tab) {
  return tab && tab.dataset ? tab.dataset.contextInspectorTab || null : null;
}

function _getPaneId(pane) {
  return pane && pane.dataset ? pane.dataset.contextInspectorPane || null : null;
}

function _findTab(tabId) {
  return _tabs.find(function (tab) { return _getTabId(tab) === tabId; }) || null;
}

function _findPaneForTab(tab, tabId) {
  if (!tab) return null;
  var controlledId = typeof tab.getAttribute === 'function'
    ? tab.getAttribute('aria-controls')
    : null;

  return _panes.find(function (pane) {
    if (controlledId && pane.id === controlledId) return true;
    return _getPaneId(pane) === tabId;
  }) || null;
}

function _setAttribute(element, name, value) {
  if (element && typeof element.setAttribute === 'function') {
    element.setAttribute(name, String(value));
  }
}

function _setPanelVisible(visible) {
  if (!_root) return;

  _isOpen = !!visible;
  _root.hidden = !_isOpen;
  _setAttribute(_root, 'aria-hidden', _isOpen ? 'false' : 'true');
  _setAttribute(_toggle, 'aria-expanded', _isOpen ? 'true' : 'false');

  if (_root.dataset) {
    _root.dataset.state = _isOpen ? 'open' : 'closed';
  }
}

function _focusElement(element) {
  if (!element || typeof element.focus !== 'function') return;
  try {
    element.focus({ preventScroll: true });
  } catch (err) {
    element.focus();
  }
}

function _handleToggleClick(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  if (_isOpen) {
    close({ restoreFocus: false });
  } else {
    open(_activeTab);
  }
}

function _handleCloseClick(event) {
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  close({ restoreFocus: true });
}

function _handleTabClick(event) {
  var tab = event && (event.currentTarget || event.target);
  var tabId = _getTabId(tab);
  if (!tabId) return;
  if (event && typeof event.preventDefault === 'function') event.preventDefault();
  select(tabId, { focus: false });
}

function _handleTabKeydown(event) {
  if (!event) return;
  var currentTab = event.currentTarget || event.target;
  var currentIndex = _tabs.indexOf(currentTab);

  if (event.key === 'Escape') {
    event.__contextInspectorHandled = true;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    close({ restoreFocus: true });
    return;
  }

  if (currentIndex < 0 || _tabs.length === 0) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' &&
      event.key !== 'Home' && event.key !== 'End') return;

  var nextIndex = currentIndex;
  if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = _tabs.length - 1;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex + _tabs.length - 1) % _tabs.length;
  else nextIndex = (currentIndex + 1) % _tabs.length;

  event.__contextInspectorHandled = true;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  var nextTab = _tabs[nextIndex];
  select(_getTabId(nextTab), { focus: true });
}

function _handleRootKeydown(event) {
  if (!event || event.key !== 'Escape' || event.__contextInspectorHandled) return;
  if (typeof event.preventDefault === 'function') event.preventDefault();
  close({ restoreFocus: true });
}

function _bindElement(element, datasetKey, eventName, handler) {
  if (!element || typeof element.addEventListener !== 'function') return;
  if (element.dataset && element.dataset[datasetKey] === 'true') return;
  element.addEventListener(eventName, handler);
  if (element.dataset) element.dataset[datasetKey] = 'true';
}

function _bindRailListener() {
  if (_railListenerBound) return;
  EventBus.on(RAIL_EVENT, function (data) {
    if (data && data.source === RAIL_SOURCE) return;
    close({ restoreFocus: false });
  });
  _railListenerBound = true;
}

/**
 * 初始化单例检查器。重复调用只会刷新 DOM 引用和视觉状态，不会叠加监听。
 * @param {{document?: Document, open?: boolean}} options
 * @returns {ReturnType<typeof getSnapshot>}
 */
export function init(options) {
  var doc = _getDocument(options);
  if (!doc || typeof doc.getElementById !== 'function') {
    _root = null;
    _toggle = null;
    _closeButton = null;
    _tabs = [];
    _panes = [];
    _activeTab = null;
    _isOpen = false;
    return getSnapshot();
  }

  var nextRoot = doc.getElementById(ROOT_ID);
  if (!nextRoot) {
    _root = null;
    _toggle = null;
    _closeButton = null;
    _tabs = [];
    _panes = [];
    _activeTab = null;
    _isOpen = false;
    return getSnapshot();
  }

  var isSameRoot = nextRoot === _root;
  _root = nextRoot;
  _toggle = typeof doc.querySelector === 'function' ? doc.querySelector(TOGGLE_SELECTOR) : null;
  _closeButton = typeof _root.querySelector === 'function' ? _root.querySelector(CLOSE_SELECTOR) : null;
  _tabs = typeof _root.querySelectorAll === 'function' ? _toArray(_root.querySelectorAll(TAB_SELECTOR)) : [];
  _panes = typeof _root.querySelectorAll === 'function' ? _toArray(_root.querySelectorAll(PANE_SELECTOR)) : [];

  _bindElement(_toggle, 'contextInspectorToggleBound', 'click', _handleToggleClick);
  _bindElement(_closeButton, 'contextInspectorCloseBound', 'click', _handleCloseClick);
  _bindElement(_root, 'contextInspectorKeyboardBound', 'keydown', _handleRootKeydown);
  _tabs.forEach(function (tab) {
    _bindElement(tab, 'contextInspectorClickBound', 'click', _handleTabClick);
    _bindElement(tab, 'contextInspectorKeyboardBound', 'keydown', _handleTabKeydown);
  });
  _bindRailListener();

  var requestedDefault = _root.dataset && _root.dataset.defaultTab
    ? _root.dataset.defaultTab
    : DEFAULT_TAB_ID;
  var nextTabId = isSameRoot && _findTab(_activeTab)
    ? _activeTab
    : requestedDefault;
  if (!_findTab(nextTabId)) nextTabId = _findTab(DEFAULT_TAB_ID) ? DEFAULT_TAB_ID : _getTabId(_tabs[0]);
  select(nextTabId, { focus: false });

  var shouldOpen = options && typeof options.open === 'boolean'
    ? options.open
    : !(Boolean(_root.hidden) || (
      typeof _root.getAttribute === 'function' && _root.getAttribute('aria-hidden') === 'true'
    ));
  _setPanelVisible(shouldOpen);
  return getSnapshot();
}

/** 打开检查器，可同时选择指定切片。 */
export function open(tabId, options) {
  if (!_root) return getSnapshot();
  if (tabId) select(tabId, { focus: !!(options && options.focusTab) });
  _setPanelVisible(true);

  if (!options || options.notifyRail !== false) {
    EventBus.emit(RAIL_EVENT, { source: RAIL_SOURCE, panelId: ROOT_ID });
  }
  return getSnapshot();
}

/** 关闭检查器；默认把焦点还给入口按钮。 */
export function close(options) {
  if (!_root) return getSnapshot();
  _setPanelVisible(false);
  if (!options || options.restoreFocus !== false) _focusElement(_toggle);
  return getSnapshot();
}

/** 选择一个切片，不改变检查器的开合状态。 */
export function select(tabId, options) {
  var nextTab = _findTab(tabId);
  if (!nextTab) return getSnapshot();

  var nextPane = _findPaneForTab(nextTab, tabId);
  if (!nextPane) return getSnapshot();
  _activeTab = tabId;

  _tabs.forEach(function (tab) {
    var isActive = tab === nextTab;
    _setAttribute(tab, 'aria-selected', isActive ? 'true' : 'false');
    _setAttribute(tab, 'tabindex', isActive ? '0' : '-1');
    tab.tabIndex = isActive ? 0 : -1;
  });

  _panes.forEach(function (pane) {
    var isActive = pane === nextPane;
    pane.hidden = !isActive;
    _setAttribute(pane, 'aria-hidden', isActive ? 'false' : 'true');
    if (isActive && typeof pane.removeAttribute === 'function') pane.removeAttribute('hidden');
    else if (!isActive) _setAttribute(pane, 'hidden', '');
  });

  if (_root && _root.dataset) _root.dataset.activeTab = _activeTab;
  if (options && options.focus) _focusElement(nextTab);
  return getSnapshot();
}

/** 返回只读状态快照，供 UI 协调器和测试使用。 */
export function getSnapshot() {
  return {
    initialized: !!_root,
    open: !!(_root && _isOpen),
    activeTab: _activeTab,
    tabs: _tabs.map(_getTabId).filter(Boolean),
  };
}
