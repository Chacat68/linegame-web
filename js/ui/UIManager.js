// js/ui/UIManager.js — canonical workspace 导航与 DOM Surface 协调器
//
// NavigationController 是唯一导航状态源；本模块只负责把 canonical workspace
// 映射到统一 WorkspaceSurfaceController，并保留旧 view 名称 facade。

import * as EventBus from '../core/EventBus.js';
import { createNavigationController, normalizeWorkspace } from './NavigationController.js';
import { hasBlockingSurfaceOpen, registerEscapeLayer } from './SurfaceManager.js';
import { loadSettings } from '../core/SettingsCore.js';
import * as ContextInspector from './ContextInspector.js';
import { createWorkspaceSurfaceController } from './WorkspaceSurfaceController.js';

const LEGACY_VIEW_BY_WORKSPACE = Object.freeze({
  map: 'starmap',
  trade: 'market',
  fleet: 'hangar',
  archive: 'quests',
  logs: 'logs',
});

let _getState = function () { return null; };
let _navigation = null;
let _workspaceSurfaces = null;
let _handlers = {
  onOpenMarket: null,
  onCloseMarket: null,
  onGetMarketOpen: null,
  onOpenHangar: null,
  onOpenQuests: null,
};
let _viewSwitchListener = null;
let _terminalBlurListener = null;
let _releaseNavigationEscape = null;
let _bottomNavElement = null;
let _bottomNavClickListener = null;
let _workspaceEntryGeneration = 0;
let _initialized = false;

export function init(stateSource, handlers) {
  if (_initialized) dispose();
  _getState = typeof stateSource === 'function'
    ? stateSource
    : function () { return stateSource || null; };
  if (handlers) _handlers = Object.assign({}, _handlers, handlers);

  _workspaceSurfaces = createWorkspaceSurfaceController();

  _releaseEventBusListeners();
  _navigation = createNavigationController({
    initialWorkspace: 'map',
    getState: _getState,
    onLeave: _leaveWorkspace,
    onEnter: _enterWorkspace,
    onChange: _handleNavigationChange,
  });
  if (_releaseNavigationEscape) _releaseNavigationEscape();
  _releaseNavigationEscape = registerEscapeLayer('workspace-detail', {
    priority: 40,
    isActive: function () {
      return !!(_navigation && _navigation.getSnapshot().activeDetail);
    },
    onEscape: function () {
      if (_navigation) _navigation.handleEscape();
    },
  });

  _bindBottomNavigation();
  _viewSwitchListener = function (view) { switchView(view); };
  _terminalBlurListener = function () {
    _getStarmapCanvases().forEach(function (canvas) {
      _applyBlurStyle(canvas, getCurrentView());
    });
  };
  EventBus.on('view:switch', _viewSwitchListener);
  EventBus.on('settings:terminalBlur:changed', _terminalBlurListener);

  _workspaceSurfaces.activate('map', { focus: false });
  _syncWorkspaceVisualState('map');
  _initialized = true;
}

export function openDetail(detail, workspace) {
  return _navigation ? _navigation.openDetail(detail, workspace) : false;
}

export function closeDetail(workspace) {
  return _navigation ? _navigation.closeDetail(workspace) : null;
}

export function subscribeNavigation(listener) {
  return _navigation ? _navigation.subscribe(listener) : function () {};
}

export function getCurrentView() {
  var workspace = _navigation ? _navigation.getSnapshot().activeWorkspace : 'map';
  return LEGACY_VIEW_BY_WORKSPACE[workspace] || 'starmap';
}

export function getNavigationSnapshot() {
  return _navigation ? _navigation.getSnapshot() : null;
}

export function getWorkspaceSurfaceSnapshot() {
  return _workspaceSurfaces ? _workspaceSurfaces.getSnapshot() : null;
}

export function resetRuntimeState() {
  _workspaceEntryGeneration += 1;
  return _navigation ? _navigation.reset({ reason: 'session-reset' }) : 0;
}

export function switchView(view, options) {
  var workspace = normalizeWorkspace(view);
  if (!_navigation || !workspace) return false;
  var navigationOptions = options || {};
  return _navigation.navigate(workspace, {
    reason: navigationOptions.reason || 'workspace-navigation',
    focusEntry: navigationOptions.focusEntry !== false,
  });
}

function _bindBottomNavigation() {
  var bottomNav = document.getElementById('bottom-nav');
  if (!bottomNav) return;

  var newBottomNav = bottomNav.cloneNode(true);
  bottomNav.parentNode.replaceChild(newBottomNav, bottomNav);
  _bottomNavElement = newBottomNav;
  _bottomNavClickListener = function (event) {
    var button = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('.bottom-nav-btn')
      : null;
    if (!button) return;
    if (hasBlockingSurfaceOpen()) {
      if (typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      return;
    }
    switchView(button.dataset.view, {
      reason: 'bottom-navigation',
      focusEntry: false,
    });
  };
  newBottomNav.addEventListener('click', _bottomNavClickListener);
  newBottomNav.addEventListener('keydown', _handleBottomNavKeydown);
}

function _leaveWorkspace(change) {
  if (change.from === 'trade' && _handlers.onCloseMarket) {
    _handlers.onCloseMarket({ restoreFocus: false });
  }
}

function _enterWorkspace(change) {
  var state = change.state;
  var entryResult = null;
  if (change.to === 'trade') {
    if (_handlers.onOpenMarket && state) entryResult = _handlers.onOpenMarket(state);
  } else if (change.to === 'fleet') {
    if (_handlers.onOpenHangar && state) entryResult = _handlers.onOpenHangar(state);
  } else if (change.to === 'archive') {
    if (_handlers.onOpenQuests && state) entryResult = _handlers.onOpenQuests(state);
  } else if (change.to === 'logs') {
    EventBus.emit('logs:badge:clear');
  }
  if (change.focusEntry !== false) _scheduleWorkspaceEntryFocus(change.to, entryResult);
}

function _scheduleWorkspaceEntryFocus(workspace, entryResult) {
  var generation = ++_workspaceEntryGeneration;
  Promise.resolve(entryResult).catch(function () {
    return false;
  }).then(function () {
    if (generation !== _workspaceEntryGeneration || !_navigation || !_workspaceSurfaces) return;
    if (_navigation.getSnapshot().activeWorkspace !== workspace) return;
    _workspaceSurfaces.activate(workspace, { focus: true, forceFocus: true });
  });
}

function _handleNavigationChange(change) {
  if (_workspaceSurfaces) {
    _workspaceSurfaces.activate(change.to, { focus: false });
  }
  _syncWorkspaceVisualState(change.to);
  EventBus.emit('navigation:changed', LEGACY_VIEW_BY_WORKSPACE[change.to]);
}

function _syncWorkspaceVisualState(workspace) {
  var legacyView = LEGACY_VIEW_BY_WORKSPACE[workspace] || 'starmap';
  ContextInspector.activateWorkspace(workspace);
  document.querySelectorAll('.bottom-nav-btn').forEach(function (button) {
    var isActive = normalizeWorkspace(button.dataset.view) === workspace;
    button.classList.toggle('active', isActive);
    _syncBottomNavButtonState(button, isActive);
  });
  _getStarmapCanvases().forEach(function (canvas) {
    _applyBlurStyle(canvas, legacyView);
  });
}

function _syncBottomNavButtonState(button, isActive) {
  if (!button || typeof button.setAttribute !== 'function') return;
  button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  if (isActive) button.setAttribute('aria-current', 'page');
  else if (typeof button.removeAttribute === 'function') button.removeAttribute('aria-current');
}

function _handleBottomNavKeydown(event) {
  if (!event || !event.target || typeof event.target.closest !== 'function') return;
  var button = event.target.closest('.bottom-nav-btn');
  if (!button) return;
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) === -1) return;

  var buttons = Array.prototype.slice.call(document.querySelectorAll('.bottom-nav-btn'));
  var currentIndex = buttons.indexOf(button);
  if (currentIndex < 0 || buttons.length === 0) return;
  var nextIndex = currentIndex;
  if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = buttons.length - 1;
  else if (event.key === 'ArrowLeft') nextIndex = (currentIndex + buttons.length - 1) % buttons.length;
  else nextIndex = (currentIndex + 1) % buttons.length;

  if (typeof event.preventDefault === 'function') event.preventDefault();
  if (buttons[nextIndex] && typeof buttons[nextIndex].focus === 'function') buttons[nextIndex].focus();
}

function _getStarmapCanvases() {
  if (typeof document === 'undefined') return [];
  if (typeof document.querySelectorAll === 'function') {
    var canvases = Array.prototype.slice.call(document.querySelectorAll('.starmap-canvas'));
    if (canvases.length > 0) return canvases;
  }
  var legacyCanvas = document.getElementById && document.getElementById('map-3d-canvas');
  return legacyCanvas ? [legacyCanvas] : [];
}

function _applyBlurStyle(canvas, view) {
  if (!canvas) return;
  var useBlur = loadSettings().terminalBlur !== false;
  canvas.classList.remove('starmap-blur-active');
  canvas.classList.remove('starmap-blur-active-lowperf');
  if (view === 'starmap') return;
  canvas.classList.add(useBlur ? 'starmap-blur-active' : 'starmap-blur-active-lowperf');
}

function _releaseEventBusListeners() {
  if (_viewSwitchListener) EventBus.off('view:switch', _viewSwitchListener);
  if (_terminalBlurListener) EventBus.off('settings:terminalBlur:changed', _terminalBlurListener);
  _viewSwitchListener = null;
  _terminalBlurListener = null;
}

export function dispose() {
  if (!_initialized && !_navigation && !_viewSwitchListener && !_terminalBlurListener) return false;
  _releaseEventBusListeners();
  if (_releaseNavigationEscape) _releaseNavigationEscape();
  _releaseNavigationEscape = null;
  if (_bottomNavElement && typeof _bottomNavElement.removeEventListener === 'function') {
    if (_bottomNavClickListener) _bottomNavElement.removeEventListener('click', _bottomNavClickListener);
    _bottomNavElement.removeEventListener('keydown', _handleBottomNavKeydown);
  }
  _bottomNavElement = null;
  _bottomNavClickListener = null;
  _workspaceEntryGeneration += 1;
  if (_workspaceSurfaces) _workspaceSurfaces.dispose();
  _workspaceSurfaces = null;
  _navigation = null;
  _getState = function () { return null; };
  _handlers = {
    onOpenMarket: null,
    onCloseMarket: null,
    onGetMarketOpen: null,
    onOpenHangar: null,
    onOpenQuests: null,
  };
  _initialized = false;
  return true;
}
