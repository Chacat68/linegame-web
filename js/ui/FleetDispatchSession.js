// js/ui/FleetDispatchSession.js — 自动跑商草案与生命周期诊断的无 DOM 会话

function _copyContext(context, freeze) {
  if (!context) return null;
  var copy = Object.assign({}, context);
  if (copy.tradePolicy && typeof copy.tradePolicy === 'object') {
    copy.tradePolicy = Object.assign({}, copy.tradePolicy);
    if (freeze) Object.freeze(copy.tradePolicy);
  }
  return freeze ? Object.freeze(copy) : copy;
}

function _normalizeStatus(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function createFleetDispatchSession() {
  var activeContext = null;
  var openCount = 0;
  var closeCount = 0;
  var estimateUpdateCount = 0;
  var commandSubmitCount = 0;
  var resetCount = 0;
  var lastOpenStatus = 'idle';
  var lastCloseReason = null;

  function getActiveContext() {
    return _copyContext(activeContext, false);
  }

  function getDiagnostics() {
    return Object.freeze({
      openCount: openCount,
      closeCount: closeCount,
      estimateUpdateCount: estimateUpdateCount,
      commandSubmitCount: commandSubmitCount,
      resetCount: resetCount,
      lastOpenStatus: lastOpenStatus,
      lastCloseReason: lastCloseReason,
      activeContext: _copyContext(activeContext, true),
    });
  }

  function close(reason) {
    var hadContext = !!activeContext;
    activeContext = null;
    if (hadContext) closeCount += 1;
    if (reason) lastCloseReason = _normalizeStatus(reason, lastCloseReason);
    return hadContext;
  }

  function open(context, status) {
    if (!context || !Number.isInteger(context.shipIndex)) return false;
    activeContext = _copyContext(context, false);
    openCount += 1;
    lastOpenStatus = _normalizeStatus(status, 'open');
    lastCloseReason = null;
    return true;
  }

  function update(patch) {
    if (!activeContext || !patch || typeof patch !== 'object') return getActiveContext();
    Object.keys(patch).forEach(function (key) {
      activeContext[key] = key === 'tradePolicy' && patch[key] && typeof patch[key] === 'object'
        ? Object.assign({}, patch[key])
        : patch[key];
    });
    return getActiveContext();
  }

  function reset() {
    activeContext = null;
    openCount = 0;
    closeCount = 0;
    estimateUpdateCount = 0;
    commandSubmitCount = 0;
    lastOpenStatus = 'idle';
    lastCloseReason = null;
    resetCount += 1;
    return getDiagnostics();
  }

  return Object.freeze({
    close: close,
    getActiveContext: getActiveContext,
    getDiagnostics: getDiagnostics,
    markCommandSubmitted: function () {
      commandSubmitCount += 1;
      return commandSubmitCount;
    },
    markEstimateUpdated: function () {
      estimateUpdateCount += 1;
      return estimateUpdateCount;
    },
    noteOpenStatus: function (status) {
      lastOpenStatus = _normalizeStatus(status, lastOpenStatus);
      return lastOpenStatus;
    },
    open: open,
    reset: reset,
    update: update,
  });
}
