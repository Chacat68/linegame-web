// js/core/GameSystemRuntime.js — 游戏状态相关系统的统一 restore/capture 运行时
//
// 冷启动、新局、重开和手动读档遍历同一份 manifest。调用方传入
// session token，同一 revision 的重复 restore 是无副作用 no-op。

const RESTORE_ORDER = Object.freeze([
  'economy',
  'fleet',
  'faction',
  'research',
  'quest',
  'tutorial',
  'balanceMetrics',
  'midgameTeachingChain',
  'achievementState',
  'galaxyData',
  'featureRegistry',
]);

const CAPTURE_ORDER = Object.freeze(['fleet', 'economy', 'galaxyData']);
const ADVANCE_ORDER = Object.freeze(['gameTime']);

function _call(target, methodName, args) {
  if (!target || typeof target[methodName] !== 'function') return undefined;
  return target[methodName].apply(target, args || []);
}

function _getRevision(options) {
  var token = options && options.sessionToken;
  return token && Number.isInteger(token.revision) ? token.revision : null;
}

export function createGameSystemRuntime(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var hooks = deps.hooks || {};
  var lastRestore = null;
  var lastCapture = null;
  var lastAdvance = null;
  var restoredRevision = null;
  var restoredState = null;

  var manifest = [
    {
      id: 'economy',
      restore: function (state, options) {
        _call(systems.Economy, 'init', [options.restoreEconomy === false ? null : state.economyMarketState]);
        if (options.restoreEconomy !== false && !state.economyMarketState) {
          _call(systems.Economy, 'setCycleState', [state.economyCycle]);
        }
      },
      capture: function (state) {
        state.economyCycle = _call(systems.Economy, 'getCycleState', []);
        state.economyMarketState = _call(systems.Economy, 'getMarketState', []);
      },
    },
    { id: 'fleet', restore: function (state) { _call(systems.Fleet, 'init', [state]); }, capture: function (state, options) {
      if (options.syncFleet !== false) _call(systems.Fleet, 'syncShipFromState', [state]);
    } },
    { id: 'faction', restore: function (state) { _call(systems.Faction, 'init', [state]); } },
    { id: 'research', restore: function (state) { _call(systems.Research, 'init', [state]); } },
    { id: 'quest', restore: function (state) { _call(systems.Quest, 'init', [state]); } },
    { id: 'tutorial', restore: function (state) { _call(systems.Tutorial, 'init', [state]); } },
    { id: 'balanceMetrics', restore: function (state) { _call(systems.BalanceMetrics, 'init', [state]); } },
    { id: 'midgameTeachingChain', restore: function (state) { _call(systems.MidgameTeachingChain, 'init', [state]); } },
    { id: 'achievementState', restore: function (state) {
      if (typeof hooks.ensureAchievementState === 'function') hooks.ensureAchievementState(state);
    } },
    {
      id: 'galaxyData',
      restore: function (state, options) {
        _call(systems.GalaxyData, 'init', [state]);
        if (options.restoreGalaxy !== false && state.galaxyStates && Object.keys(state.galaxyStates).length > 0) {
          _call(systems.GalaxyData, 'restorePlanetStates', [state.galaxyStates]);
        }
      },
      capture: function (state) {
        state.galaxyStates = _call(systems.GalaxyData, 'getAllPlanetStates', []);
      },
    },
    { id: 'featureRegistry', restore: function (state) {
      if (typeof hooks.syncFeatureRegistry === 'function') hooks.syncFeatureRegistry(state);
    } },
    { id: 'gameTime', advance: function (state, options) {
      return _call(systems.GameTime, 'advanceDays', [state, options.days]);
    } },
  ];

  function restore(state, options) {
    if (!state || typeof state !== 'object') return null;
    var restoreOptions = options || {};
    var revision = _getRevision(restoreOptions);
    if (revision !== null && revision === restoredRevision && state === restoredState) return lastRestore;

    var trace = [];
    manifest.forEach(function (entry) {
      if (typeof entry.restore !== 'function') return;
      trace.push(entry.id);
      entry.restore(state, restoreOptions);
    });

    restoredRevision = revision;
    restoredState = state;
    lastRestore = Object.freeze({
      state: state,
      revision: revision,
      reason: restoreOptions.reason || 'restore',
      order: Object.freeze(trace),
    });
    return lastRestore;
  }

  function capture(state, options) {
    if (!state || typeof state !== 'object') return null;
    var captureOptions = options || {};
    var trace = [];
    CAPTURE_ORDER.forEach(function (id) {
      var entry = manifest.find(function (item) { return item.id === id; });
      if (!entry || typeof entry.capture !== 'function') return;
      if (id === 'fleet' && captureOptions.syncFleet === false) return;
      trace.push(id);
      entry.capture(state, captureOptions);
    });

    lastCapture = Object.freeze({
      state: state,
      revision: _getRevision(captureOptions),
      reason: captureOptions.reason || 'capture',
      order: Object.freeze(trace),
    });
    return lastCapture;
  }

  function advanceDays(state, days, options) {
    if (!state || typeof state !== 'object') return null;
    var totalDays = Math.max(0, Number.isFinite(days) ? Math.floor(days) : 0);
    var advanceOptions = Object.assign({}, options || {}, { days: totalDays });
    var trace = [];
    var result = null;

    ADVANCE_ORDER.forEach(function (id) {
      var entry = manifest.find(function (item) { return item.id === id; });
      if (!entry || typeof entry.advance !== 'function') return;
      trace.push(id);
      result = entry.advance(state, advanceOptions);
    });

    lastAdvance = Object.freeze({
      state: state,
      revision: _getRevision(advanceOptions),
      days: totalDays,
      reason: advanceOptions.reason || 'advance-days',
      order: Object.freeze(trace),
      result: result,
    });
    return result;
  }

  function getDiagnostics() {
    return Object.freeze({
      restoreOrder: RESTORE_ORDER.slice(),
      captureOrder: CAPTURE_ORDER.slice(),
      restoredRevision: restoredRevision,
      lastRestore: lastRestore,
      lastCapture: lastCapture,
      advanceOrder: ADVANCE_ORDER.slice(),
      lastAdvance: lastAdvance,
    });
  }

  return Object.freeze({
    restore: restore,
    capture: capture,
    advanceDays: advanceDays,
    getDiagnostics: getDiagnostics,
  });
}

export { RESTORE_ORDER, CAPTURE_ORDER, ADVANCE_ORDER };
