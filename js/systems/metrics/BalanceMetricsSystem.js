// js/systems/metrics/BalanceMetricsSystem.js — 本地设计验收统计
//
// 这些数据只随存档保存在玩家本地，不上传。它们用于核对首单承接、
// 商品利润集中度，以及长期路线选择后 30 天和完成时的资产变化。

const TEN_MINUTES_MS = 10 * 60 * 1000;

function _finite(value, fallback) {
  return Number.isFinite(Number(value)) ? Number(value) : (fallback || 0);
}

function _ensureObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function init(state) {
  if (!state || typeof state !== 'object') return null;

  state.balanceMetrics = _ensureObject(state.balanceMetrics);
  const metrics = state.balanceMetrics;
  if (metrics.firstTrade && typeof metrics.firstTrade !== 'object') metrics.firstTrade = null;
  metrics.continuedAfterTenMinutes = !!metrics.continuedAfterTenMinutes;
  if (!('continuationDay' in metrics)) metrics.continuationDay = null;
  if (!('lastActivity' in metrics)) metrics.lastActivity = null;

  metrics.trade = _ensureObject(metrics.trade);
  metrics.trade.actions = Math.max(0, Math.floor(_finite(metrics.trade.actions, 0)));
  metrics.trade.buyActions = Math.max(0, Math.floor(_finite(metrics.trade.buyActions, 0)));
  metrics.trade.sellActions = Math.max(0, Math.floor(_finite(metrics.trade.sellActions, 0)));
  metrics.trade.realizedProfit = _finite(metrics.trade.realizedProfit, 0);
  metrics.trade.realizedProfitByGood = _ensureObject(metrics.trade.realizedProfitByGood);
  metrics.routes = _ensureObject(metrics.routes);
  return metrics;
}

function _nowMs(nowMs) {
  return Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
}

function _captureAssets(state, extra) {
  const snapshot = {
    day: Math.max(1, Math.floor(_finite(state && state.day, 1))),
    credits: Math.round(_finite(state && state.credits, 0)),
    totalProfit: Math.round(_finite(state && state.totalProfit, 0)),
    tradeCount: Math.max(0, Math.floor(_finite(state && state.tradeCount, 0))),
    researchedTechs: state && Array.isArray(state.researchedTechs) ? state.researchedTechs.length : 0,
    tradeStations: state && state.tradeStations && typeof state.tradeStations === 'object'
      ? Object.keys(state.tradeStations).length
      : 0,
    fleetSize: state && Array.isArray(state.fleet) ? state.fleet.length : 0,
    visitedSystems: state && Array.isArray(state.visitedSystems) ? state.visitedSystems.length : 0,
  };
  if (extra && Number.isFinite(Number(extra.netWorth))) snapshot.netWorth = Math.round(Number(extra.netWorth));
  return snapshot;
}

export function recordActivity(state, activity, nowMs) {
  const metrics = init(state);
  if (!metrics) return null;
  const timestampMs = _nowMs(nowMs);

  metrics.lastActivity = {
    type: activity || 'activity',
    day: Math.max(1, Math.floor(_finite(state.day, 1))),
    timestampMs: timestampMs,
  };

  if (metrics.firstTrade && !metrics.continuedAfterTenMinutes &&
      timestampMs - _finite(metrics.firstTrade.timestampMs, timestampMs) >= TEN_MINUTES_MS) {
    metrics.continuedAfterTenMinutes = true;
    metrics.continuationDay = Math.max(1, Math.floor(_finite(state.day, 1)));
  }
  return metrics;
}

export function recordTrade(state, action, goodId, marketType, meta, nowMs) {
  const metrics = init(state);
  if (!metrics) return null;
  const timestampMs = _nowMs(nowMs);

  if (!metrics.firstTrade) {
    metrics.firstTrade = {
      day: Math.max(1, Math.floor(_finite(state.day, 1))),
      timestampMs: timestampMs,
      action: action === 'sell' ? 'sell' : 'buy',
      marketType: marketType === 'black' ? 'black' : 'open',
      goodId: goodId || null,
    };
  } else {
    recordActivity(state, 'trade', timestampMs);
  }

  metrics.trade.actions += 1;
  if (action === 'sell') {
    metrics.trade.sellActions += 1;
    const profit = _finite(meta && meta.profit, 0);
    metrics.trade.realizedProfit += profit;
    if (goodId) {
      metrics.trade.realizedProfitByGood[goodId] = _finite(metrics.trade.realizedProfitByGood[goodId], 0) + profit;
    }
  } else {
    metrics.trade.buyActions += 1;
  }
  return metrics;
}

export function recordRouteSelection(state, pathId, extra, nowMs) {
  const metrics = init(state);
  if (!metrics || !pathId) return null;
  const existing = _ensureObject(metrics.routes[pathId]);
  if (!existing.selectedDay) {
    existing.selectedDay = Math.max(1, Math.floor(_finite(state.day, 1)));
    existing.selectedTimestampMs = _nowMs(nowMs);
    existing.selectedAssets = _captureAssets(state, extra);
  }
  metrics.routes[pathId] = existing;
  recordActivity(state, 'route_selection', nowMs);
  return existing;
}

export function advanceDay(state) {
  const metrics = init(state);
  if (!metrics) return null;
  const currentDay = Math.max(1, Math.floor(_finite(state.day, 1)));
  Object.keys(metrics.routes).forEach(function (pathId) {
    const route = _ensureObject(metrics.routes[pathId]);
    if (route.selectedDay && !route.day30Assets && currentDay >= route.selectedDay + 30) {
      route.day30Assets = _captureAssets(state);
    }
    metrics.routes[pathId] = route;
  });
  return metrics;
}

export function recordRouteCompletion(state, pathId, extra, nowMs) {
  const metrics = init(state);
  if (!metrics || !pathId) return null;
  const route = metrics.routes[pathId] || recordRouteSelection(state, pathId, extra, nowMs);
  if (!route.completedDay) {
    route.completedDay = Math.max(1, Math.floor(_finite(state.day, 1)));
    route.completedTimestampMs = _nowMs(nowMs);
    route.daysToComplete = Math.max(0, route.completedDay - (route.selectedDay || route.completedDay));
    route.completedAssets = _captureAssets(state, extra);
  }
  metrics.routes[pathId] = route;
  return route;
}

export function getRouteTimeline(state, pathId) {
  const metrics = init(state);
  if (!metrics || !pathId || !metrics.routes[pathId]) return null;
  const route = metrics.routes[pathId];
  return {
    selectedDay: route.selectedDay || null,
    completedDay: route.completedDay || null,
    daysToComplete: Number.isFinite(Number(route.daysToComplete)) ? Number(route.daysToComplete) : null,
    selectedAssets: route.selectedAssets || null,
    day30Assets: route.day30Assets || null,
    completedAssets: route.completedAssets || null,
  };
}

export function getAcceptanceSnapshot(state) {
  const metrics = init(state);
  if (!metrics) return null;
  const positiveProfit = Object.keys(metrics.trade.realizedProfitByGood).reduce(function (sum, goodId) {
    return sum + Math.max(0, _finite(metrics.trade.realizedProfitByGood[goodId], 0));
  }, 0);
  const largestGoodProfit = Object.keys(metrics.trade.realizedProfitByGood).reduce(function (largest, goodId) {
    return Math.max(largest, Math.max(0, _finite(metrics.trade.realizedProfitByGood[goodId], 0)));
  }, 0);
  return {
    firstTrade: metrics.firstTrade,
    continuedAfterTenMinutes: metrics.continuedAfterTenMinutes,
    tradeActions: metrics.trade.actions,
    realizedProfit: metrics.trade.realizedProfit,
    largestGoodProfitShare: positiveProfit > 0 ? largestGoodProfit / positiveProfit : 0,
    routes: metrics.routes,
  };
}
