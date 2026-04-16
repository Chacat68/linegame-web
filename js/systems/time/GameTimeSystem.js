// js/systems/time/GameTimeSystem.js — 游戏时间系统
// 依赖：economy/trade/finance/fleet/research/quest 子系统
// 导出：createRealtimeClockState, resetRealtimeClock, consumeElapsedDays, advanceDays

import * as Economy from '../economy/Economy.js';
import * as TradeStation from '../trade/TradeStationSystem.js';
import * as Finance from '../finance/FinanceSystem.js';
import * as Crew from '../fleet/CrewSystem.js';
import * as Research from '../research/ResearchSystem.js';
import * as Quest from '../quest/QuestSystem.js';
import * as Fleet from '../fleet/FleetSystem.js';

export function createRealtimeClockState(nowMs, hullSnapshot) {
  return {
    lastUpdatedAtMs: _sanitizeNow(nowMs, 0),
    accumulatedMs: 0,
    lastHullSnapshot: _sanitizeHull(hullSnapshot, 100),
  };
}

export function resetRealtimeClock(clockState, nowMs, hullSnapshot) {
  var next = clockState && typeof clockState === 'object'
    ? clockState
    : createRealtimeClockState(nowMs, hullSnapshot);

  next.lastUpdatedAtMs = _sanitizeNow(nowMs, next.lastUpdatedAtMs || 0);
  next.lastHullSnapshot = _sanitizeHull(hullSnapshot, next.lastHullSnapshot);
  return next;
}

export function consumeElapsedDays(clockState, nowMs, dayDurationMs) {
  if (!clockState || typeof clockState !== 'object') {
    return { elapsedDays: 0, remainderMs: 0 };
  }

  var safeDurationMs = Math.max(1, Number.isFinite(dayDurationMs) ? Math.floor(dayDurationMs) : 1);
  var previousNowMs = Number.isFinite(clockState.lastUpdatedAtMs) ? clockState.lastUpdatedAtMs : 0;
  var safeNowMs = _sanitizeNow(nowMs, previousNowMs);
  var deltaMs = Math.max(0, safeNowMs - previousNowMs);

  clockState.lastUpdatedAtMs = safeNowMs;
  clockState.accumulatedMs = Math.max(0, (clockState.accumulatedMs || 0) + deltaMs);

  var elapsedDays = Math.floor(clockState.accumulatedMs / safeDurationMs);
  if (elapsedDays > 0) {
    clockState.accumulatedMs = clockState.accumulatedMs % safeDurationMs;
  }

  return {
    elapsedDays: elapsedDays,
    remainderMs: clockState.accumulatedMs,
  };
}

export function advanceDays(state, days) {
  var totalDays = Math.max(0, Number.isFinite(days) ? Math.floor(days) : 0);
  if (totalDays <= 0) {
    return { ok: true, msgs: [], questResults: [], meta: { days: 0, currentDay: state.day || 1 } };
  }

  var msgs = [];
  var questResults = [];

  for (var index = 0; index < totalDays; index++) {
    state.day = Math.max(1, Math.floor(state.day || 1) + 1);

    var cycleResult = Economy.advanceDay();
    if (cycleResult && cycleResult.cycleChanged && cycleResult.cycle) {
      msgs.push({
        text: cycleResult.cycle.icon + ' 经济周期转入「' + cycleResult.cycle.name + '」——市场价格将受到影响！',
        type: 'info',
      });
    }

    _appendMessages(msgs, TradeStation.advanceDay(state));
    _appendMessages(msgs, Finance.advanceDay(state));
    _appendMessages(msgs, Crew.payDailyWages(state, 1));
    _appendMessages(msgs, Fleet.advanceFleetDay(state));
    _appendMessages(msgs, Research.advanceResearch(state));

    var questResult = Quest.checkProgress(state, { action: 'advance_day', days: 1, day: state.day });
    _appendMessages(msgs, questResult);
    if (questResult && (questResult.completedQuests.length > 0 || questResult.phaseAdvanced)) {
      questResults.push(questResult);
    }

    _appendMessages(msgs, Fleet.tickFleetRoutes(state));
  }

  msgs.unshift({
    text: totalDays === 1
      ? '🕒 银河历进入第 ' + state.day + ' 天。'
      : '🕒 真实时间流逝，已推进 ' + totalDays + ' 天，当前为第 ' + state.day + ' 天。',
    type: 'info',
  });

  return {
    ok: true,
    msgs: msgs,
    questResults: questResults,
    meta: { days: totalDays, currentDay: state.day },
  };
}

function _appendMessages(target, result) {
  if (result && Array.isArray(result.msgs) && result.msgs.length > 0) {
    target.push.apply(target, result.msgs);
  }
}

function _sanitizeNow(nowMs, fallback) {
  if (Number.isFinite(nowMs)) return nowMs;
  if (Number.isFinite(fallback)) return fallback;
  return 0;
}

function _sanitizeHull(hullValue, fallback) {
  if (Number.isFinite(hullValue)) return hullValue;
  if (Number.isFinite(fallback)) return fallback;
  return 100;
}