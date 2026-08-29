// js/ui/GameShellProjection.js — 全局 Shell 信息的单一投影边界
//
// Header、公司经营摘要、Archive 角标和长期路线摘要都属于全局 Shell，
// 不属于 HUD 日志/弹层生命周期。GameUiCoordinator 只依赖本端口完成刷新。

import * as Victory from '../systems/victory/VictorySystem.js';
import { renderHeaderStatus } from './HeaderStatusPresenter.js';
import { renderCompanyNetWorth, renderCompanyOverview } from './CompanyOverviewPresenter.js';
import { renderArchiveBadges } from './ArchiveBadgePresenter.js';

function _call(target, methodName, args) {
  if (!target || typeof target[methodName] !== 'function') return undefined;
  return target[methodName].apply(target, args || []);
}

export function createGameShellProjection(options) {
  var opts = options || {};
  var interactions = opts.interactions || {};
  var victory = opts.victory || Victory;
  var documentSource = opts.documentSource || null;
  var presenters = Object.assign({
    renderArchiveBadges: renderArchiveBadges,
    renderCompanyNetWorth: renderCompanyNetWorth,
    renderCompanyOverview: renderCompanyOverview,
    renderHeaderStatus: renderHeaderStatus,
  }, opts.presenters || {});
  var renderCount = 0;
  var lastSnapshot = null;

  function render(state, netWorth) {
    if (!state) return null;
    var normalizedNetWorth = Number.isFinite(Number(netWorth)) ? Number(netWorth) : 0;
    var header = presenters.renderHeaderStatus(state, documentSource, function () {
      _call(interactions, 'ensureGalaxyToggle', []);
    });
    var companyNetWorthRendered = presenters.renderCompanyNetWorth(normalizedNetWorth, documentSource);
    var companyOverviewRendered = presenters.renderCompanyOverview(state, documentSource);
    var archiveBadges = presenters.renderArchiveBadges(state, documentSource);
    var progressResult = typeof victory.getProgress === 'function' ? victory.getProgress(state) : [];
    var progress = Array.isArray(progressResult) ? progressResult : [];
    var unlockedPaths = typeof victory.getUnlockedPaths === 'function'
      ? victory.getUnlockedPaths(state)
      : progress;
    var unlockedPathCount = Array.isArray(unlockedPaths) ? unlockedPaths.length : progress.length;

    _call(interactions, 'syncVictoryProgress', [progress, unlockedPathCount]);
    renderCount += 1;
    lastSnapshot = Object.freeze({
      archiveBadges: archiveBadges || null,
      companyNetWorthRendered: companyNetWorthRendered === true,
      companyOverviewRendered: companyOverviewRendered === true,
      header: header || null,
      netWorth: normalizedNetWorth,
      victoryPathCount: progress.length,
    });
    return lastSnapshot;
  }

  function getDiagnostics() {
    return Object.freeze({
      lastSnapshot: lastSnapshot,
      renderCount: renderCount,
    });
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    render: render,
  });
}
