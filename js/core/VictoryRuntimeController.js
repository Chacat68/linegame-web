// js/core/VictoryRuntimeController.js — 胜利检测、报告构造与异步呈现生命周期
//
// Controller 持有“本会话已确认路线”和待呈现报告，GameManager 只注入
// 系统与会话端口。延迟 UI 到达时必须再次校验 session token/state。

import { ARCHIVE_QUEST_ACTION_PRESENTATION } from './ActionPresentation.js';

function _noop() {}

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('VictoryRuntimeController requires ' + label + '.');
  return value;
}

function _count(value) {
  return Array.isArray(value) ? value.length : 0;
}

export function buildVictoryStats(state, options) {
  var currentState = state || {};
  var config = options || {};
  var netWorth = Number.isFinite(config.netWorth) ? config.netWorth : 0;
  var levelTitle = config.levelTitle || '未知等级';
  var routeTimeline = config.routeTimeline || null;
  var stats = [
    { label: '银河历', value: '第 ' + (currentState.day || 1) + ' 天' },
    { label: '玩家等级', value: levelTitle },
    { label: '净资产', value: Math.floor(netWorth).toLocaleString() + ' 信用积分' },
    { label: '贸易次数', value: (currentState.tradeCount || 0).toLocaleString() + ' 次' },
    { label: '已研究科技', value: _count(currentState.researchedTechs) + ' / 16 项' },
    { label: '完成任务', value: _count(currentState.completedQuests) + ' 个' },
    { label: '解锁成就', value: _count(currentState.achievements) + ' 个' },
    { label: '探索星球', value: _count(currentState.visitedSystems) + ' 颗' },
    { label: '探索星系', value: _count(currentState.visitedGalaxies) + ' / 8 个' },
  ];

  if (routeTimeline && routeTimeline.selectedDay) {
    stats.splice(1, 0, {
      label: '路线用时',
      value: '第 ' + routeTimeline.selectedDay + ' 天选择 · ' + routeTimeline.daysToComplete + ' 天达成',
    });
  }
  return stats;
}

export function createVictoryRuntimeController(dependencies) {
  var deps = dependencies || {};
  var systems = deps.systems || {};
  var Victory = systems.Victory || {};
  var BalanceMetrics = systems.BalanceMetrics || {};
  var Trade = systems.Trade || {};
  var Fleet = systems.Fleet || {};
  var Quest = systems.Quest || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var getSessionToken = typeof deps.getSessionToken === 'function'
    ? deps.getSessionToken
    : function () { return null; };
  var isSessionTokenCurrent = typeof deps.isSessionTokenCurrent === 'function'
    ? deps.isSessionTokenCurrent
    : function () { return true; };
  var getLevelTitle = typeof deps.getLevelTitle === 'function'
    ? deps.getLevelTitle
    : function () { return '未知等级'; };
  var loadView = _requiredFunction(deps.loadView, 'loadView');
  var emitMessage = typeof deps.emitMessage === 'function' ? deps.emitMessage : _noop;
  var invalidate = typeof deps.invalidate === 'function' ? deps.invalidate : _noop;
  var refreshActionGuide = typeof deps.refreshActionGuide === 'function' ? deps.refreshActionGuide : _noop;
  var restartSession = typeof deps.restartSession === 'function' ? deps.restartSession : _noop;

  var acknowledgedPathIds = new Set();
  var pendingReportPathId = null;
  var boundView = null;
  var reportCount = 0;

  function syncView(VictoryResultUI) {
    if (!VictoryResultUI || typeof VictoryResultUI.init !== 'function') return false;
    boundView = VictoryResultUI;
    VictoryResultUI.init({
      onContinue: function (pathId) {
        if (pathId) acknowledgedPathIds.add(pathId);
        pendingReportPathId = null;
        emitMessage({ text: '胜利结算已归档，当前公司继续经营。', type: 'info' });
        refreshActionGuide();
      },
      onRestart: function () { restartSession('victory-restart'); },
    });
    return true;
  }

  function handleLoadFailure() {
    pendingReportPathId = null;
  }

  function reset() {
    acknowledgedPathIds = new Set();
    pendingReportPathId = null;
  }

  function check() {
    var state = getState();
    if (!state || typeof Victory.checkVictory !== 'function') return null;
    var result = Victory.checkVictory(state, acknowledgedPathIds);
    if (!result || !result.won || !result.path) return null;

    var path = result.path;
    var reportPathId = path.id || 'victory';
    if (pendingReportPathId === reportPathId) return null;
    pendingReportPathId = reportPathId;

    var netWorth = typeof Trade.getNetWorth === 'function' ? Trade.getNetWorth(state) : 0;
    var routeTimeline = typeof BalanceMetrics.recordRouteCompletion === 'function'
      ? BalanceMetrics.recordRouteCompletion(state, reportPathId, { netWorth: netWorth })
      : null;
    var payload = {
      path: path,
      stats: buildVictoryStats(state, {
        netWorth: netWorth,
        levelTitle: getLevelTitle(state.experience || 0),
        routeTimeline: routeTimeline,
      }),
      progress: typeof Victory.getProgress === 'function' ? Victory.getProgress(state) : [],
    };
    var requestedState = state;
    var requestedToken = getSessionToken();

    return Promise.resolve(loadView()).then(function (VictoryResultUI) {
      if (!VictoryResultUI || requestedState !== getState() || !isSessionTokenCurrent(requestedToken)) {
        if (pendingReportPathId === reportPathId) pendingReportPathId = null;
        return false;
      }
      syncView(VictoryResultUI);
      if (typeof VictoryResultUI.showVictoryReport !== 'function') {
        pendingReportPathId = null;
        return false;
      }
      var shown = VictoryResultUI.showVictoryReport(payload);
      if (shown === false) pendingReportPathId = null;
      else reportCount += 1;
      return shown !== false;
    });
  }

  function choosePolicy(pathId) {
    var state = getState();
    if (!state || typeof Victory.choosePolicy !== 'function') {
      return { ok: false, progress: [] };
    }

    var result = Victory.choosePolicy(state, pathId) || { ok: false, msgs: [] };
    (result.msgs || []).forEach(emitMessage);

    var questResult = null;
    if (result.ok) {
      if (Array.isArray(state.fleet) && state.fleet.length > 0 && typeof Fleet.syncStateFromShip === 'function') {
        Fleet.syncStateFromShip(state);
      }
      if (typeof Quest.checkProgress === 'function') {
        questResult = Quest.checkProgress(state, { action: 'victory_policy', pathId: pathId });
        ((questResult && questResult.msgs) || []).forEach(emitMessage);
      }
      invalidate(ARCHIVE_QUEST_ACTION_PRESENTATION.dirtyRegions);
      refreshActionGuide();
    }

    return Object.assign({}, result, {
      progress: typeof Victory.getProgress === 'function' ? Victory.getProgress(state) : [],
      questResult: questResult,
    });
  }

  function getDiagnostics() {
    return Object.freeze({
      acknowledgedPathIds: Object.freeze(Array.from(acknowledgedPathIds)),
      bound: !!boundView,
      pendingReportPathId: pendingReportPathId,
      reportCount: reportCount,
    });
  }

  return Object.freeze({
    check: check,
    choosePolicy: choosePolicy,
    getDiagnostics: getDiagnostics,
    handleLoadFailure: handleLoadFailure,
    reset: reset,
    syncView: syncView,
  });
}
