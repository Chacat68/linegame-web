// js/core/GameUiNavigationPort.js — UI Runtime 对领域/引导公开的冻结导航端口

function _resolve(source) {
  return typeof source === 'function' ? source() : source;
}

function _call(source, methodName, args) {
  var target = _resolve(source);
  if (!target || typeof target[methodName] !== 'function') return undefined;
  return target[methodName].apply(target, args || []);
}

export function createGameUiNavigationPort(options) {
  var ports = options || {};
  var marketWorkspaceEntry = ports.getMarketWorkspaceEntry || ports.marketWorkspaceEntry;
  var workspaceTabs = ports.getWorkspaceTabs || ports.workspaceTabs;
  var uiManager = ports.getUiManager || ports.uiManager;

  return Object.freeze({
    activateWorkspaceTab: function (tabId, config) {
      return _call(workspaceTabs, 'activate', [tabId, config]);
    },
    closeMarket: function () {
      return _call(marketWorkspaceEntry, 'close', []);
    },
    getActiveArchiveTab: function () {
      return _call(workspaceTabs, 'getActive', ['info']);
    },
    getMarketViewSystem: function (state) {
      return _call(marketWorkspaceEntry, 'getViewSystem', [state]);
    },
    isMarketOpen: function () {
      return _call(marketWorkspaceEntry, 'isOpen', []) === true;
    },
    openMarketPanel: function (state, focus) {
      return _call(marketWorkspaceEntry, 'openPanel', [state, focus]);
    },
    openMarketSystemPanel: function (state, systemId, focus) {
      return _call(marketWorkspaceEntry, 'openSystemPanel', [state, systemId, focus]);
    },
    refreshMarketLocation: function (state) {
      return _call(marketWorkspaceEntry, 'refreshLocation', [state]);
    },
    returnToMap: function () {
      _call(marketWorkspaceEntry, 'close', []);
      return _call(uiManager, 'switchView', ['map']);
    },
  });
}
