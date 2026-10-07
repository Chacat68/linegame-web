import assert from 'node:assert/strict';
import { MERCHANT_PORTS, MERCHANT_RULES } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';

// 仅供离线数值实验使用；购船、投入货本与补派仍提交普通经营命令。
export function execute(state, action, input = {}) {
  const result = Merchant.command(state, action, input, state.merchant.lastTickAt);
  assert.equal(result.ok, true, `${action}：${result.msg}`);
  return result;
}

export function routeProfiles(state) {
  // 规划看完整港口的长期供需；发车报价始终使用真实共享市场。
  const reference = { ...state, merchant: { ...state.merchant, markets: Object.fromEntries(MERCHANT_PORTS.map(port =>
    [port.id, { supply: { ...port.supply }, demand: { ...port.demand } }])) } };
  const routes = [];
  const ports = Merchant.getOpenPortIds(state.merchant);
  for (const from of ports) for (const to of ports) {
    if (from === to) continue;
    for (const goodId of Object.keys(Merchant.getPort(from).buy)) {
      if (!Merchant.getPort(to).sell[goodId]) continue;
      const route = { from, to, goodId };
      routes.push({ ...route, types: Merchant.getShipRouteComparison(reference, route).filter(row => row.unlocked && row.profit > 0) });
    }
  }
  return routes;
}

const sourceKey = route => `${route.from}:${route.goodId}`;
const destinationKey = route => `${route.to}:${route.goodId}`;
const replenishment = (route, side) => Math.ceil(Merchant.getPort(side === 'supply' ? route.from : route.to)[side][route.goodId]
  * MERCHANT_RULES.restockFraction) * 60_000 / MERCHANT_RULES.restockMs;

export function chooseAllocation(state, plans, profiles, { typeId, policy = 'investment' } = {}) {
  const supply = new Map(), demand = new Map();
  for (const plan of plans) {
    const profile = profiles.find(route => route.from === plan.from && route.to === plan.to && route.goodId === plan.goodId);
    const row = profile?.types.find(type => type.typeId === plan.typeId);
    if (!row) continue;
    const rate = row.capacity * 60_000 / row.durationMs;
    supply.set(sourceKey(plan), (supply.get(sourceKey(plan)) || 0) + rate);
    demand.set(destinationKey(plan), (demand.get(destinationKey(plan)) || 0) + rate);
  }
  const candidates = [];
  for (const route of profiles) for (const row of route.types) {
    if (typeId && row.typeId !== typeId) continue;
    const rate = row.capacity * 60_000 / row.durationMs;
    const sourceRate = replenishment(route, 'supply'), destinationRate = replenishment(route, 'demand');
    const remaining = Math.max(0, Math.min(sourceRate - (supply.get(sourceKey(route)) || 0),
      destinationRate - (demand.get(destinationKey(route)) || 0)));
    const profitPerMinute = row.profit * 60_000 / row.durationMs * Math.min(1, remaining / rate);
    const purchaseCost = typeId ? 0 : Merchant.getShipPurchaseQuote(state.merchant, row.typeId).total;
    const investment = purchaseCost + row.capital;
    candidates.push({ from: route.from, to: route.to, goodId: route.goodId, typeId: row.typeId,
      budget: row.capital, purchaseCost, profitPerMinute, investment,
      score: policy === 'throughput' || typeId ? profitPerMinute : profitPerMinute / investment,
      congestion: Math.max((supply.get(sourceKey(route)) || 0) / sourceRate,
        (demand.get(destinationKey(route)) || 0) / destinationRate) });
  }
  assert.ok(candidates.length, '需要至少一条已开放、可盈利的商路。');
  candidates.sort((a, b) => b.score - a.score || a.investment - b.investment || a.congestion - b.congestion);
  if (candidates[0].profitPerMinute > 0) return candidates[0];
  // 满编超过港口吞吐后，以低投入船型填余下船位，分散排队；不虚构无限供需。
  candidates.sort((a, b) => a.investment - b.investment || a.congestion - b.congestion);
  return candidates[0];
}

export function dispatchPlans(state, plans) {
  let created = 0;
  for (const plan of plans) {
    if (state.merchant.tasks.some(task => task.id === plan.taskId)) continue;
    const ship = state.merchant.ships.find(item => item.id === plan.shipId);
    if (!ship || ship.taskId || ship.phase !== 'idle' || state.credits < plan.budget) continue;
    const input = { from: plan.from, to: plan.to, goodId: plan.goodId, budget: plan.budget, shipIds: [ship.id] };
    // 为整个满编船队划拨货本；暂缺供需的船按正常规则等待，而非漏算其投入。
    plan.taskId = execute(state, 'create', input).taskId;
    created++;
  }
  return created;
}
