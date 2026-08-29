// js/ui/GameUiRenderSession.js — UI 区域刷新计数、事务追踪与失效诊断会话

function _createCounts(regionNames) {
  return regionNames.reduce(function (counts, region) {
    counts[region] = 0;
    return counts;
  }, {});
}

function _trackedRegions(regionNames, regions) {
  var requested = new Set(regions || []);
  return regionNames.filter(function (region) { return requested.has(region); });
}

export function createGameUiRenderSession(options) {
  var config = options || {};
  var regionNames = Object.freeze(Array.from(new Set(config.regionNames || [])));
  var renderAllCount = 0;
  var invalidationCount = 0;
  var lastInvalidationRegions = Object.freeze([]);
  var renderCounts = _createCounts(regionNames);
  var lastRenderedRegions = Object.freeze([]);
  var activeTrace = null;

  function record(regions) {
    var tracked = _trackedRegions(regionNames, regions);
    if (tracked.length === 0) return Object.freeze([]);
    tracked.forEach(function (region) {
      renderCounts[region] += 1;
      if (activeTrace && activeTrace.indexOf(region) === -1) activeTrace.push(region);
    });
    if (!activeTrace) lastRenderedRegions = Object.freeze(tracked);
    return Object.freeze(tracked);
  }

  function trace(callback) {
    if (activeTrace) return callback();
    activeTrace = [];
    try {
      return callback();
    } finally {
      lastRenderedRegions = Object.freeze(_trackedRegions(regionNames, activeTrace));
      activeTrace = null;
    }
  }

  function recordRenderAll() {
    renderAllCount += 1;
    return renderAllCount;
  }

  function recordInvalidation(regions) {
    invalidationCount += 1;
    lastInvalidationRegions = Object.freeze(Array.from(regions || []));
    return lastInvalidationRegions;
  }

  function resetWorkspaceTracking() {
    lastInvalidationRegions = Object.freeze([]);
    renderCounts = _createCounts(regionNames);
    lastRenderedRegions = Object.freeze([]);
    activeTrace = null;
    return getSnapshot();
  }

  function getSnapshot(activeWorkspace) {
    return Object.freeze({
      renderAllCount: renderAllCount,
      invalidationCount: invalidationCount,
      lastInvalidationRegions: lastInvalidationRegions,
      workspaceRenders: Object.freeze({
        activeWorkspace: activeWorkspace || null,
        renderCounts: Object.freeze(Object.assign({}, renderCounts)),
        lastRenderedRegions: lastRenderedRegions,
      }),
    });
  }

  return Object.freeze({
    getSnapshot: getSnapshot,
    record: record,
    recordInvalidation: recordInvalidation,
    recordRenderAll: recordRenderAll,
    resetWorkspaceTracking: resetWorkspaceTracking,
    trace: trace,
  });
}
