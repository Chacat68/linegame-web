// js/core/GameFeatureRecoveryDiagnostics.js — 延迟功能恢复状态的只读快照

const FEATURE_STATES = Object.freeze(['idle', 'loading', 'ready', 'error']);

function _count(value) {
  var number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function _state(value) {
  return FEATURE_STATES.indexOf(value) === -1 ? 'idle' : value;
}

function _featureSnapshot(entry) {
  var source = entry || {};
  var errorMessage = source.error && typeof source.error.message === 'string'
    ? source.error.message
    : null;
  return Object.freeze({
    dependencies: Object.freeze(Array.isArray(source.dependencies)
      ? source.dependencies.filter(function (value) { return typeof value === 'string'; })
      : []),
    errorMessage: errorMessage,
    generation: _count(source.generation),
    loadCount: _count(source.loadCount),
    state: _state(source.state),
    syncCount: _count(source.syncCount),
  });
}

function _presentationSnapshot(source) {
  var input = source || {};
  var activeFeatures = Array.isArray(input.activeFeatures)
    ? Array.from(new Set(input.activeFeatures.filter(function (value) {
        return typeof value === 'string' && value.length > 0;
      }))).sort()
    : [];
  return Object.freeze({
    activeFeatures: Object.freeze(activeFeatures),
    errorCount: _count(input.errorCount),
    loadingCount: _count(input.loadingCount),
    retryCount: _count(input.retryCount),
  });
}

function _settingsSnapshot(source) {
  if (!source) return null;
  return Object.freeze({
    bound: source.bound === true,
    disposed: source.disposed === true,
    launcherBound: source.launcherBound === true,
    loadAttempts: _count(source.loadAttempts),
    loadFailures: _count(source.loadFailures),
    loadState: _state(source.loadState),
    openCount: _count(source.openCount),
    pending: source.pending === true,
    syncCount: _count(source.syncCount),
  });
}

export function buildGameFeatureRecoveryDiagnostics(input) {
  var source = input || {};
  var registrySource = source.registryDiagnostics || {};
  var features = Object.create(null);
  var counts = { error: 0, idle: 0, loading: 0, ready: 0 };
  var totalLoadCount = 0;
  var totalSyncCount = 0;

  Object.keys(registrySource).sort().forEach(function (feature) {
    var snapshot = _featureSnapshot(registrySource[feature]);
    features[feature] = snapshot;
    counts[snapshot.state] += 1;
    totalLoadCount += snapshot.loadCount;
    totalSyncCount += snapshot.syncCount;
  });

  return Object.freeze({
    presentation: _presentationSnapshot(source.presentationDiagnostics),
    registry: Object.freeze({
      counts: Object.freeze(counts),
      features: Object.freeze(features),
      registeredCount: Object.keys(features).length,
      totalLoadCount: totalLoadCount,
      totalSyncCount: totalSyncCount,
    }),
    settings: _settingsSnapshot(source.settingsDiagnostics),
  });
}
