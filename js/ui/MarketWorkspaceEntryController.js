// js/ui/MarketWorkspaceEntryController.js — 商业工作区入口、浏览位置与导航 DOM owner

import { GALAXIES } from '../data/systems.js';
import { getContextualMarketFocus } from './MarketFocus.js';
import { createMarketWorkspaceEntrySession } from './MarketWorkspaceEntrySession.js';

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('MarketWorkspaceEntryController requires ' + label + '.');
  return value;
}

function _call(callback, args) {
  return typeof callback === 'function' ? callback.apply(null, args || []) : false;
}

export function createMarketWorkspaceEntryController(dependencies) {
  var deps = dependencies || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var navigate = typeof deps.navigate === 'function' ? deps.navigate : function () { return false; };
  var refresh = typeof deps.refresh === 'function' ? deps.refresh : function () { return false; };
  var getDocument = typeof deps.getDocument === 'function'
    ? deps.getDocument
    : function () { return typeof document === 'undefined' ? null : document; };
  var galaxies = Array.isArray(deps.galaxies) ? deps.galaxies : GALAXIES;
  var contextualFocus = typeof deps.getContextualMarketFocus === 'function'
    ? deps.getContextualMarketFocus
    : getContextualMarketFocus;
  var session = deps.session || createMarketWorkspaceEntrySession();
  var bindings = [];
  var initialized = false;
  var disposed = false;

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

  function _element(id) {
    var doc = getDocument();
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function _syncButton() {
    var button = _element('market-view-btn');
    if (!button || !button.classList) return;
    button.classList.toggle('active', session.isOpen());
    if (typeof button.setAttribute === 'function') {
      button.setAttribute('aria-pressed', session.isOpen() ? 'true' : 'false');
    }
  }

  function _renderGalaxyNavigation(stateOverride) {
    var state = stateOverride || getState();
    var nav = _element('market-galaxy-nav');
    if (!nav || !state) return false;
    nav.innerHTML = '';
    var visited = Array.isArray(state.visitedGalaxies) && state.visitedGalaxies.length > 0
      ? state.visitedGalaxies
      : [state.currentGalaxy];
    galaxies.forEach(function (galaxy) {
      if (!galaxy || visited.indexOf(galaxy.id) === -1) return;
      var selected = galaxy.id === session.getViewGalaxy();
      var button = nav.ownerDocument.createElement('button');
      button.className = 'market-galaxy-btn' + (selected ? ' active' : '');
      button.type = 'button';
      button.dataset.marketGalaxyId = galaxy.id;
      button.setAttribute('aria-label', '查看' + galaxy.name + '市场');
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      var icon = nav.ownerDocument.createElement('span');
      icon.className = 'market-galaxy-btn-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = galaxy.icon;
      var label = nav.ownerDocument.createElement('span');
      label.className = 'market-galaxy-btn-label';
      label.textContent = galaxy.name;
      button.appendChild(icon);
      button.appendChild(label);
      nav.appendChild(button);
    });
    return true;
  }

  function _requestRefresh() {
    return _call(refresh, [session.getMode()]);
  }

  function setRefresh(callback) {
    refresh = typeof callback === 'function' ? callback : function () { return false; };
    return true;
  }

  function init() {
    if (initialized) return false;
    disposed = false;
    initialized = true;

    _bind(_element('market-view-btn'), 'click', function () {
      if (session.isOpen()) navigate('map');
      else openPanel(getState());
    });
    _bind(_element('market-close-btn'), 'click', function () {
      navigate('map');
    });
    _bind(_element('market-show-sell'), 'change', function () {
      if (session.isOpen()) _requestRefresh();
    });
    _bind(_element('market-galaxy-nav'), 'click', function (event) {
      var target = event && event.target;
      var button = target && typeof target.closest === 'function'
        ? target.closest('[data-market-galaxy-id]')
        : null;
      if (!button || !button.dataset || !button.dataset.marketGalaxyId) return;
      session.setViewGalaxy(button.dataset.marketGalaxyId);
      _renderGalaxyNavigation(getState());
      _requestRefresh();
    });
    _syncButton();
    return true;
  }

  function open(stateOverride, focus) {
    var state = stateOverride || getState();
    if (!state) return false;
    session.setPendingFocus(focus || session.getPendingFocus() || contextualFocus(state));
    session.setViewGalaxy(state.currentGalaxy);
    session.setViewSystem(state.currentSystem);
    session.setMode('detail');
    session.open();
    _syncButton();
    _renderGalaxyNavigation(state);
    _requestRefresh();
    return true;
  }

  function openPanel(stateOverride, focus) {
    var state = stateOverride || getState();
    if (!state) return false;
    session.setPendingFocus(focus || contextualFocus(state));
    var changed = !!navigate('trade');
    if (!changed) open(state, session.getPendingFocus());
    return changed || session.isOpen();
  }

  function openSystemPanel(stateOverride, systemId, focus) {
    var state = stateOverride || getState();
    if (!state) return false;
    var opened = openPanel(state, focus);
    if (systemId && systemId !== state.currentSystem) showDetail(systemId);
    return opened;
  }

  function close() {
    session.close();
    _syncButton();
    return true;
  }

  function showOverview() {
    session.setMode('overview');
    session.setViewSystem(null);
    _requestRefresh();
    return true;
  }

  function showDetail(systemId) {
    session.setMode('detail');
    session.setViewSystem(systemId);
    _requestRefresh();
    return true;
  }

  function refreshLocation(stateOverride) {
    var state = stateOverride || getState();
    if (!session.isOpen() || !state) return false;
    session.setViewGalaxy(state.currentGalaxy);
    session.setViewSystem(state.currentSystem);
    session.setMode('detail');
    _renderGalaxyNavigation(state);
    _requestRefresh();
    return true;
  }

  function reset() {
    session.reset();
    _syncButton();
    return getDiagnostics();
  }

  function dispose() {
    if (disposed) return false;
    _releaseBindings();
    initialized = false;
    disposed = true;
    session.close();
    _syncButton();
    return true;
  }

  function getDiagnostics() {
    return Object.freeze(Object.assign({}, session.getDiagnostics(), {
      disposed: disposed,
      initialized: initialized,
      listenerCount: bindings.length,
    }));
  }

  return Object.freeze({
    close: close,
    consumePendingFocus: session.takePendingFocus,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    getMode: session.getMode,
    getViewGalaxy: function (state) { return session.getViewGalaxy() || (state && state.currentGalaxy) || null; },
    getViewSystem: function (state) { return session.getViewSystem() || (state && state.currentSystem) || null; },
    init: init,
    isOpen: session.isOpen,
    open: open,
    openPanel: openPanel,
    openSystemPanel: openSystemPanel,
    refreshLocation: refreshLocation,
    reset: reset,
    setRefresh: setRefresh,
    showDetail: showDetail,
    showOverview: showOverview,
  });
}
