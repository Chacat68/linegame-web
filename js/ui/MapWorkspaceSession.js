// js/ui/MapWorkspaceSession.js — 星图工作区的纯 UI 会话状态

function _string(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _copyObject(value) {
  return value && typeof value === 'object'
    ? Object.freeze(Object.assign({}, value))
    : null;
}

function _copyRecord(value) {
  return Object.assign(Object.create(null), value && typeof value === 'object' ? value : {});
}

export function createMapWorkspaceSession() {
  var selectedSystemId;
  var navigationGuideFocus;
  var disclosureBySection;
  var marketOpen;
  var marketViewGalaxyId;
  var marketViewSystemId;
  var marketMode;
  var pendingMarketFocus;
  var resetCount = 0;

  function _restoreDefaults() {
    selectedSystemId = null;
    navigationGuideFocus = null;
    disclosureBySection = Object.create(null);
    marketOpen = false;
    marketViewGalaxyId = null;
    marketViewSystemId = null;
    marketMode = 'detail';
    pendingMarketFocus = null;
  }

  function getDiagnostics() {
    return Object.freeze({
      disclosureBySection: Object.freeze(_copyRecord(disclosureBySection)),
      market: Object.freeze({
        mode: marketMode,
        open: marketOpen,
        pendingFocus: pendingMarketFocus,
        viewingGalaxyId: marketViewGalaxyId,
        viewingSystemId: marketViewSystemId,
      }),
      navigationGuideFocus: navigationGuideFocus,
      resetCount: resetCount,
      selectedSystemId: selectedSystemId,
    });
  }

  function reset() {
    _restoreDefaults();
    resetCount += 1;
    return getDiagnostics();
  }

  _restoreDefaults();

  return Object.freeze({
    clearNavigationGuideFocus: function () {
      navigationGuideFocus = null;
      return null;
    },
    clearSelectedSystem: function () {
      selectedSystemId = null;
      return null;
    },
    getDiagnostics: getDiagnostics,
    getDisclosure: function (sectionId) {
      var id = _string(sectionId);
      return id && Object.prototype.hasOwnProperty.call(disclosureBySection, id)
        ? disclosureBySection[id]
        : undefined;
    },
    getMarketMode: function () { return marketMode; },
    getMarketViewGalaxy: function () { return marketViewGalaxyId; },
    getMarketViewSystem: function () { return marketViewSystemId; },
    getNavigationGuideFocus: function () { return navigationGuideFocus; },
    getPendingMarketFocus: function () { return pendingMarketFocus; },
    getSelectedSystem: function () { return selectedSystemId; },
    isMarketOpen: function () { return marketOpen; },
    reset: reset,
    setDisclosure: function (sectionId, open) {
      var id = _string(sectionId);
      if (!id) return false;
      disclosureBySection[id] = !!open;
      return disclosureBySection[id];
    },
    setMarketMode: function (mode) {
      marketMode = mode === 'overview' ? 'overview' : 'detail';
      return marketMode;
    },
    setMarketOpen: function (open) {
      marketOpen = !!open;
      return marketOpen;
    },
    setMarketViewGalaxy: function (galaxyId) {
      marketViewGalaxyId = _string(galaxyId) || null;
      return marketViewGalaxyId;
    },
    setMarketViewSystem: function (systemId) {
      marketViewSystemId = _string(systemId) || null;
      return marketViewSystemId;
    },
    setNavigationGuideFocus: function (focus) {
      navigationGuideFocus = _copyObject(focus);
      return navigationGuideFocus;
    },
    setPendingMarketFocus: function (focus) {
      pendingMarketFocus = _copyObject(focus);
      return pendingMarketFocus;
    },
    setSelectedSystem: function (systemId) {
      selectedSystemId = _string(systemId) || null;
      return selectedSystemId;
    },
    takePendingMarketFocus: function () {
      var focus = pendingMarketFocus;
      pendingMarketFocus = null;
      return focus;
    },
    toggleDisclosure: function (sectionId, fallback) {
      var id = _string(sectionId);
      if (!id) return false;
      var current = Object.prototype.hasOwnProperty.call(disclosureBySection, id)
        ? disclosureBySection[id]
        : !!fallback;
      disclosureBySection[id] = !current;
      return disclosureBySection[id];
    },
  });
}
