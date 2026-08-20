// js/ui/MarketWorkspaceSession.js — 商业工作区的纯会话状态所有权

export const DEFAULT_MARKET_BATCH_SORT_MODES = Object.freeze({
  investment: 'yield',
  upgrade: 'income',
  strategy: 'income',
});

export const DEFAULT_MARKET_SUBWORKSPACE_TABS = Object.freeze({
  spot: 'trade',
  capital: 'local',
  operations: 'local',
});

function _copyRecord(value, fallback) {
  return Object.assign({}, fallback || {}, value && typeof value === 'object' ? value : {});
}

function _normalizeFocusKey(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _normalizeContext(value) {
  if (!value || typeof value !== 'object') return null;
  var systemId = typeof value.systemId === 'string' ? value.systemId.trim() : '';
  if (!systemId) return null;
  return Object.freeze({
    systemId: systemId,
    mode: value.mode === 'black' ? 'black' : 'open',
  });
}

export function createMarketWorkspaceSession(options) {
  var opts = options || {};
  var defaultWorkspace = typeof opts.defaultWorkspace === 'string' && opts.defaultWorkspace.trim()
    ? opts.defaultWorkspace.trim()
    : 'spot';
  var defaultChartRange = Number.isFinite(opts.defaultChartRange) && opts.defaultChartRange > 0
    ? Math.floor(opts.defaultChartRange)
    : 14;
  var defaultSubworkspaces = _copyRecord(opts.defaultSubworkspaces, DEFAULT_MARKET_SUBWORKSPACE_TABS);
  var defaultSortModes = _copyRecord(opts.defaultSortModes, DEFAULT_MARKET_BATCH_SORT_MODES);

  var focusedGoods;
  var chartRanges;
  var activeContext;
  var activeWorkspace;
  var activeSubworkspaces;
  var progression;
  var overviewPriceMode;
  var operationsSortModes;
  var resetCount = 0;

  function _restoreDefaults() {
    focusedGoods = Object.create(null);
    chartRanges = Object.create(null);
    activeContext = null;
    activeWorkspace = defaultWorkspace;
    activeSubworkspaces = _copyRecord(defaultSubworkspaces);
    progression = null;
    overviewPriceMode = 'buy';
    operationsSortModes = _copyRecord(defaultSortModes);
  }

  function getFocusKey(contextOverride) {
    var context = typeof contextOverride === 'undefined'
      ? activeContext
      : _normalizeContext(contextOverride);
    return context ? context.systemId + ':' + context.mode : '';
  }

  function getDiagnostics() {
    var focusKey = getFocusKey();
    return Object.freeze({
      activeContext: activeContext,
      activeWorkspace: activeWorkspace,
      activeSubworkspace: activeSubworkspaces[activeWorkspace] || '',
      subworkspaces: Object.freeze(_copyRecord(activeSubworkspaces)),
      focusedGoodId: focusKey ? (focusedGoods[focusKey] || null) : null,
      chartRange: focusKey ? (chartRanges[focusKey] || defaultChartRange) : null,
      overviewPriceMode: overviewPriceMode,
      operationsSortModes: Object.freeze(_copyRecord(operationsSortModes)),
      resetCount: resetCount,
    });
  }

  function reset() {
    _restoreDefaults();
    resetCount += 1;
    return getDiagnostics();
  }

  _restoreDefaults();

  return Object.freeze({
    getActiveContext: function () { return activeContext; },
    setActiveContext: function (value) {
      activeContext = _normalizeContext(value);
      return activeContext;
    },
    getWorkspace: function () { return activeWorkspace; },
    setWorkspace: function (workspaceId) {
      var normalized = typeof workspaceId === 'string' ? workspaceId.trim() : '';
      activeWorkspace = normalized || defaultWorkspace;
      return activeWorkspace;
    },
    getSubworkspace: function (workspaceId) {
      return activeSubworkspaces[_normalizeFocusKey(workspaceId)] || '';
    },
    setSubworkspace: function (workspaceId, subworkspaceId) {
      var workspace = _normalizeFocusKey(workspaceId);
      var subworkspace = _normalizeFocusKey(subworkspaceId);
      if (!workspace || !subworkspace) return false;
      activeSubworkspaces[workspace] = subworkspace;
      return true;
    },
    getSubworkspaces: function () { return Object.freeze(_copyRecord(activeSubworkspaces)); },
    getProgression: function () { return progression; },
    setProgression: function (value) {
      progression = value && typeof value === 'object' ? value : null;
      return progression;
    },
    getFocusKey: getFocusKey,
    getFocusedGood: function (focusKey) {
      var key = _normalizeFocusKey(focusKey);
      return key ? (focusedGoods[key] || null) : null;
    },
    setFocusedGood: function (focusKey, goodId) {
      var key = _normalizeFocusKey(focusKey);
      var normalizedGoodId = _normalizeFocusKey(goodId);
      if (!key) return false;
      if (!normalizedGoodId) {
        delete focusedGoods[key];
        return true;
      }
      focusedGoods[key] = normalizedGoodId;
      return true;
    },
    getChartRange: function (focusKey) {
      var key = _normalizeFocusKey(focusKey);
      return key && chartRanges[key] ? chartRanges[key] : defaultChartRange;
    },
    setChartRange: function (focusKey, value) {
      var key = _normalizeFocusKey(focusKey);
      var range = Number(value);
      if (!key || !Number.isFinite(range) || range <= 0) return false;
      chartRanges[key] = Math.floor(range);
      return true;
    },
    getOverviewPriceMode: function () { return overviewPriceMode; },
    setOverviewPriceMode: function (mode) {
      overviewPriceMode = mode === 'sell' ? 'sell' : 'buy';
      return overviewPriceMode;
    },
    getOperationsSortModes: function () { return Object.freeze(_copyRecord(operationsSortModes)); },
    setOperationsSortModes: function (value) {
      operationsSortModes = _copyRecord(value, defaultSortModes);
      return operationsSortModes;
    },
    getDiagnostics: getDiagnostics,
    reset: reset,
  });
}
