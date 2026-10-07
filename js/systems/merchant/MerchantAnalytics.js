import { MERCHANT_PORTS, MERCHANT_RULES } from '../../data/merchant.js';
import { isPortOpen } from './MerchantAccess.js';

const minute = at => Math.floor(at / 60_000) * 60_000;
const integer = value => Number.isSafeInteger(value) && value >= 0;
const routeKey = (from, to, goodId) => `${from}:${to}:${goodId}`;
const measures = ['trips', 'quantity', 'capacity', 'profit', 'cost', 'fee', 'travelMs', 'capitalMs'];
const emptyMeasures = () => Object.fromEntries(measures.map(key => [key, 0]));
export const createAnalyticsState = since => ({ since, routes: [], fleet: [] });

function routeFor(analytics, from, to, goodId) {
  const key = routeKey(from, to, goodId);
  let route = analytics.routes.find(item => item.key === key);
  if (!route) {
    route = { key, from, to, goodId, ...emptyMeasures(), buckets: [] };
    analytics.routes.push(route);
  }
  return route;
}
function bucketFor(list, at, defaults) {
  let bucket = list.find(item => item.at === at);
  if (!bucket) { bucket = { at, ...defaults() }; list.push(bucket); }
  return bucket;
}
export function pruneAnalytics(merchant, now) {
  const first = minute(now) - MERCHANT_RULES.analyticsMinutes * 60_000;
  const analytics = merchant.analytics;
  analytics.fleet = analytics.fleet.filter(bucket => bucket.at >= first);
  for (const route of analytics.routes) route.buckets = route.buckets.filter(bucket => bucket.at >= first);
}

// 在事件之间按实际持续时间采样，在线逐秒和离线跳时使用同一积分。
export function observeMerchantActivity(merchant, from, to) {
  if (to <= from) return;
  const analytics = merchant.analytics;
  const owned = merchant.ships.length;
  const busy = merchant.ships.filter(ship => ['outbound', 'return', 'exploring', 'explore_return'].includes(ship.phase)).length;
  const allocations = merchant.tasks.map(task => ({ route: routeFor(analytics, task.from, task.to, task.goodId), budget: task.budget }));
  for (let cursor = from; cursor < to;) {
    const at = minute(cursor);
    const end = Math.min(to, at + 60_000);
    const elapsed = end - cursor;
    const fleet = bucketFor(analytics.fleet, at, () => ({ ownedMs: 0, busyMs: 0 }));
    fleet.ownedMs += elapsed * owned; fleet.busyMs += elapsed * busy;
    for (const { route, budget } of allocations) {
      route.capitalMs += elapsed * budget;
      bucketFor(route.buckets, at, emptyMeasures).capitalMs += elapsed * budget;
    }
    cursor = end;
  }
  pruneAnalytics(merchant, to);
}

export function recordMerchantSettlement(merchant, ship, trip, profit, at) {
  const route = routeFor(merchant.analytics, trip.from, trip.to, trip.goodId);
  const bucket = bucketFor(route.buckets, minute(at), emptyMeasures);
  const values = {
    trips: 1, quantity: trip.quantity, capacity: trip.capacity,
    profit, cost: trip.cost, fee: trip.fee, travelMs: at - trip.departedAt, capitalMs: 0,
  };
  for (const key of measures) { route[key] += values[key]; bucket[key] += values[key]; }
}

export function getMerchantAnalytics(merchant, minutes = 15) {
  const size = [5, 15, 60].includes(minutes) ? minutes : 15;
  const analytics = merchant.analytics;
  const to = merchant.lastTickAt;
  const from = Math.min(to, Math.max(analytics.since, minute(to) - (size - 1) * 60_000));
  const elapsedMs = to - from;
  const fleet = analytics.fleet.filter(bucket => bucket.at >= minute(from) && bucket.at <= minute(to))
    .reduce((sum, bucket) => ({ ownedMs: sum.ownedMs + bucket.ownedMs, busyMs: sum.busyMs + bucket.busyMs }), { ownedMs: 0, busyMs: 0 });
  return {
    since: analytics.since, from, to, minutes: size, elapsedMs,
    idleFraction: fleet.ownedMs ? Math.max(0, 1 - fleet.busyMs / fleet.ownedMs) : null,
    routes: analytics.routes.filter(route => isPortOpen(merchant, route.from) && isPortOpen(merchant, route.to)).map(route => {
      const totals = route.buckets.filter(bucket => bucket.at >= minute(from) && bucket.at <= minute(to))
        .reduce((sum, bucket) => { for (const key of measures) sum[key] += bucket[key]; return sum; }, emptyMeasures());
      return {
        key: route.key, from: route.from, to: route.to, goodId: route.goodId, ...totals,
        cumulativeProfit: route.profit, cumulativeTrips: route.trips,
        profitPerMinute: elapsedMs ? totals.profit * 60_000 / elapsedMs : null,
        averageProfit: totals.trips ? totals.profit / totals.trips : null,
        loadFraction: totals.capacity ? totals.quantity / totals.capacity : null,
        averageTravelMs: totals.trips ? totals.travelMs / totals.trips : null,
        averageCapital: elapsedMs ? totals.capitalMs / elapsedMs : null,
      };
    }),
  };
}

export function isValidAnalyticsState(merchant) {
  const analytics = merchant.analytics;
  if (!analytics || !integer(analytics.since) || analytics.since > merchant.lastTickAt ||
      !Array.isArray(analytics.routes) || !Array.isArray(analytics.fleet) || analytics.fleet.length > MERCHANT_RULES.analyticsMinutes + 1) return false;
  const validMeasures = value => measures.every(key => key === 'profit' ? Number.isSafeInteger(value[key]) : integer(value[key])) &&
    value.quantity <= value.capacity && (value.trips > 0 || value.quantity === 0 && value.capacity === 0 && value.profit === 0 && value.cost === 0 && value.fee === 0 && value.travelMs === 0);
  const validTimes = list => new Set(list.map(bucket => bucket?.at)).size === list.length && list.every(bucket =>
    bucket && integer(bucket.at) && bucket.at % 60_000 === 0 && bucket.at <= minute(merchant.lastTickAt) &&
    bucket.at >= minute(analytics.since) && bucket.at >= minute(merchant.lastTickAt) - MERCHANT_RULES.analyticsMinutes * 60_000);
  if (!validTimes(analytics.fleet) || analytics.fleet.some(bucket => !integer(bucket.ownedMs) || !integer(bucket.busyMs) || bucket.busyMs > bucket.ownedMs)) return false;
  const maxRoutes = MERCHANT_PORTS.reduce((sum, from) => sum + MERCHANT_PORTS.reduce((count, to) => count +
    (from.id === to.id ? 0 : Object.keys(from.buy).filter(good => to.sell[good]).length), 0), 0);
  if (analytics.routes.length > maxRoutes || new Set(analytics.routes.map(route => route?.key)).size !== analytics.routes.length) return false;
  return analytics.routes.every(route => {
    const from = MERCHANT_PORTS.find(port => port.id === route?.from);
    const to = MERCHANT_PORTS.find(port => port.id === route?.to);
    if (!from?.buy?.[route.goodId] || !to?.sell?.[route.goodId] || from === to || route.key !== routeKey(route.from, route.to, route.goodId) ||
        !validMeasures(route) || !Array.isArray(route.buckets) || route.buckets.length > MERCHANT_RULES.analyticsMinutes + 1 ||
        !validTimes(route.buckets) || !route.buckets.every(validMeasures)) return false;
    return measures.every(key => key === 'profit' || route.buckets.reduce((sum, bucket) => sum + bucket[key], 0) <= route[key]);
  });
}
