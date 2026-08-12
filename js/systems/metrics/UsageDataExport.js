// js/systems/metrics/UsageDataExport.js — 本地平衡统计导出契约

import { GAME_VERSION } from '../../data/constants.js';

export const USAGE_DATA_EXPORT_SCHEMA_VERSION = 1;

function _finiteOrNull(value) {
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function _nonNegativeInteger(value) {
  var numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(0, Math.floor(numericValue)) : 0;
}

function _buildRouteSummary(routes) {
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) return [];

  return Object.keys(routes).sort().map(function (pathId) {
    var route = routes[pathId];
    route = route && typeof route === 'object' && !Array.isArray(route) ? route : {};
    return {
      pathId: pathId,
      selectedDay: _finiteOrNull(route.selectedDay),
      completedDay: _finiteOrNull(route.completedDay),
      daysToComplete: _finiteOrNull(route.daysToComplete),
    };
  });
}

function _buildSummary(state) {
  var metrics = state && state.balanceMetrics;
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return { empty: true, reason: '尚无可导出的本地平衡统计' };
  }

  var firstTrade = metrics.firstTrade && typeof metrics.firstTrade === 'object'
    ? metrics.firstTrade
    : null;
  var trade = metrics.trade && typeof metrics.trade === 'object' ? metrics.trade : {};

  return {
    firstTradeDay: firstTrade ? _finiteOrNull(firstTrade.day) : null,
    firstTradeAction: firstTrade && (firstTrade.action === 'buy' || firstTrade.action === 'sell')
      ? firstTrade.action
      : null,
    continuedAfterTenMinutes: metrics.continuedAfterTenMinutes === true,
    continuationDay: _finiteOrNull(metrics.continuationDay),
    tradeActions: _nonNegativeInteger(trade.actions),
    realizedProfit: _finiteOrNull(trade.realizedProfit) || 0,
    routes: _buildRouteSummary(metrics.routes),
  };
}

/**
 * 构造可由玩家审查和主动分享的本地平衡统计导出数据。
 * 只读取明确列出的验收指标，不携带公司名称、存档名称或完整游戏状态。
 */
export function buildUsageDataExport(state, options) {
  options = options || {};
  var exportedAt = typeof options.exportedAt === 'string' && options.exportedAt
    ? options.exportedAt
    : new Date().toISOString();

  return {
    exportedAt: exportedAt,
    gameVersion: GAME_VERSION,
    exportSchemaVersion: USAGE_DATA_EXPORT_SCHEMA_VERSION,
    summary: _buildSummary(state),
    note: '这些统计随存档仅保存在本设备，不会自动上传。导出 JSON 后是否分享由你决定。',
  };
}
