// js/ui/ArchiveExplorationSession.js — 探索档案焦点会话

export function createArchiveExplorationSession() {
  var focus = null;
  var setCount = 0;
  var resetCount = 0;

  function _snapshotFocus() {
    return focus
      ? Object.freeze({ systemId: focus.systemId, chainId: focus.chainId })
      : null;
  }

  function setFocus(systemId, chainId) {
    focus = systemId
      ? { systemId: String(systemId), chainId: chainId ? String(chainId) : '' }
      : null;
    setCount += 1;
    return _snapshotFocus();
  }

  function getFocus() {
    return _snapshotFocus();
  }

  function getDiagnostics() {
    return Object.freeze({
      focus: _snapshotFocus(),
      setCount: setCount,
      resetCount: resetCount,
    });
  }

  function reset() {
    focus = null;
    setCount = 0;
    resetCount += 1;
    return getDiagnostics();
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    getFocus: getFocus,
    reset: reset,
    setFocus: setFocus,
  });
}
