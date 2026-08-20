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
  var resetCount = 0;

  function _restoreDefaults() {
    selectedSystemId = null;
    navigationGuideFocus = null;
    disclosureBySection = Object.create(null);
  }

  function getDiagnostics() {
    return Object.freeze({
      disclosureBySection: Object.freeze(_copyRecord(disclosureBySection)),
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
    getNavigationGuideFocus: function () { return navigationGuideFocus; },
    getSelectedSystem: function () { return selectedSystemId; },
    reset: reset,
    setDisclosure: function (sectionId, open) {
      var id = _string(sectionId);
      if (!id) return false;
      disclosureBySection[id] = !!open;
      return disclosureBySection[id];
    },
    setNavigationGuideFocus: function (focus) {
      navigationGuideFocus = _copyObject(focus);
      return navigationGuideFocus;
    },
    setSelectedSystem: function (systemId) {
      selectedSystemId = _string(systemId) || null;
      return selectedSystemId;
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
