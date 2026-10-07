import { isPortOpen } from '../systems/merchant/MerchantAccess.js';

// 按航次实际商路归集留存账目，避免改派后的旧利润计入新线路。
export function buildMerchantRouteReports(merchant) {
  const routes = new Map();
  const ensureRoute = (from, to) => {
    const key = `${from}:${to}`;
    if (!routes.has(key)) routes.set(key, { key, from, to, profit: 0, records: [], stoppedTasks: [] });
    return routes.get(key);
  };
  for (const task of merchant.tasks) ensureRoute(task.from, task.to);
  for (const route of merchant.analytics?.routes || []) ensureRoute(route.from, route.to);
  for (const task of [...merchant.tasks, ...merchant.history]) {
    if (task.stopReason) {
      ensureRoute(task.from, task.to).stoppedTasks.push({
        id: task.id, reason: task.stopReason, closedAt: task.closedAt ?? null,
      });
    }
    for (const record of task.recent) {
      const route = ensureRoute(record.from, record.to);
      route.profit += record.profit;
      route.records.push(record);
    }
  }
  return [...routes.values()].filter(route => isPortOpen(merchant, route.from) && isPortOpen(merchant, route.to))
    .sort((a, b) => a.key.localeCompare(b.key)).map(route => ({
    ...route,
    records: route.records.sort((a, b) => b.completedAt - a.completedAt),
  }));
}
