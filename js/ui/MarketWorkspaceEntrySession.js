// js/ui/MarketWorkspaceEntrySession.js — 商业工作区入口与浏览位置的纯会话状态

function _string(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _copyFocus(value) {
  if (!value || typeof value !== 'object') return null;
  var workspaceId = _string(value.workspaceId);
  if (!workspaceId) return null;
  return Object.freeze({
    workspaceId: workspaceId,
    subworkspaceId: _string(value.subworkspaceId),
    marketMode: _string(value.marketMode),
    goodId: _string(value.goodId),
    tradeAction: _string(value.tradeAction),
  });
}

export function createMarketWorkspaceEntrySession() {
  var open;
  var viewGalaxyId;
  var viewSystemId;
  var viewMode;
  var pendingFocus;
  var resetCount = 0;

  function _restoreDefaults() {
    open = false;
    viewGalaxyId = null;
    viewSystemId = null;
    viewMode = 'detail';
    pendingFocus = null;
  }

  function getDiagnostics() {
    return Object.freeze({
      mode: viewMode,
      open: open,
      pendingFocus: pendingFocus,
      resetCount: resetCount,
      viewingGalaxyId: viewGalaxyId,
      viewingSystemId: viewSystemId,
    });
  }

  function reset() {
    _restoreDefaults();
    resetCount += 1;
    return getDiagnostics();
  }

  _restoreDefaults();

  return Object.freeze({
    close: function () {
      open = false;
      return open;
    },
    getDiagnostics: getDiagnostics,
    getMode: function () { return viewMode; },
    getPendingFocus: function () { return pendingFocus; },
    getViewGalaxy: function () { return viewGalaxyId; },
    getViewSystem: function () { return viewSystemId; },
    isOpen: function () { return open; },
    open: function () {
      open = true;
      return open;
    },
    reset: reset,
    setMode: function (mode) {
      viewMode = mode === 'overview' ? 'overview' : 'detail';
      return viewMode;
    },
    setPendingFocus: function (focus) {
      pendingFocus = _copyFocus(focus);
      return pendingFocus;
    },
    setViewGalaxy: function (galaxyId) {
      viewGalaxyId = _string(galaxyId) || null;
      return viewGalaxyId;
    },
    setViewSystem: function (systemId) {
      viewSystemId = _string(systemId) || null;
      return viewSystemId;
    },
    takePendingFocus: function () {
      var focus = pendingFocus;
      pendingFocus = null;
      return focus;
    },
  });
}
