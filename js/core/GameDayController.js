// js/core/GameDayController.js — 多日领域推进与最终提交编排

import { DEFAULT_ACTION_DIRTY_REGIONS } from './ActionPresentation.js';

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('GameDayController requires ' + label + '.');
  return value;
}

export function createGameDayController(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var Fleet = systems.Fleet || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var advanceDays = _requiredFunction(deps.runtime && deps.runtime.advanceDays, 'runtime.advanceDays');
  var execute = _requiredFunction(deps.pipeline && deps.pipeline.execute, 'pipeline.execute');
  var getSessionToken = typeof deps.getSessionToken === 'function' ? deps.getSessionToken : function () { return null; };
  var queueQuestDialogueResult = typeof deps.queueQuestDialogueResult === 'function'
    ? deps.queueQuestDialogueResult
    : _noop;
  var captureState = typeof deps.captureState === 'function' ? deps.captureState : _noop;
  var saveAutosave = typeof deps.saveAutosave === 'function' ? deps.saveAutosave : _noop;

  function _state() {
    var state = getState();
    if (!state || typeof state !== 'object') throw new Error('GameDayController requires an active state.');
    return state;
  }

  function advance(days, clockContext) {
    var totalDays = Math.max(0, Number.isFinite(days) ? Math.floor(days) : 0);
    if (totalDays <= 0) return null;

    var state = _state();
    // 旧 RAF 回调即使抵达，也不得把旧 session 的 clock context 提交到新 state。
    if (clockContext && clockContext.state && clockContext.state !== state) return null;

    var realtimeClock = clockContext && clockContext.clock;
    var previousHull = realtimeClock && Number.isFinite(realtimeClock.lastHullSnapshot)
      ? realtimeClock.lastHullSnapshot
      : (state.shipHull || 100);
    var sessionToken = getSessionToken();

    return execute({
      label: 'time.advance-days',
      dirtyRegions: DEFAULT_ACTION_DIRTY_REGIONS,
      mutate: function () {
        return advanceDays(state, totalDays, {
          reason: 'realtime-clock',
          sessionToken: sessionToken,
        });
      },
      postEffects: function (result) {
        // 科研等永久加成在领域推进中完成后，刷新当前飞船投影再提交。
        Fleet.syncStateFromShip(state);

        var questResults = result && Array.isArray(result.questResults) ? result.questResults : [];
        questResults.forEach(queueQuestDialogueResult);

        if ((state.shipHull || 100) >= previousHull) {
          state.daysWithoutDamage = (state.daysWithoutDamage || 0) + totalDays;
        } else {
          state.daysWithoutDamage = 0;
        }
        if (realtimeClock) realtimeClock.lastHullSnapshot = state.shipHull || 100;

        captureState(state, { reason: 'realtime-day', sessionToken: sessionToken });
        saveAutosave(state, { reason: 'realtime-day', sessionToken: sessionToken });
      },
    });
  }

  return Object.freeze({ advance: advance });
}
