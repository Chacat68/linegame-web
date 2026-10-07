import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createInitialState } from '../js/data/constants.js';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_EXPLORATION_TARGETS, MERCHANT_TECHS, MERCHANT_TECH_PRICING_RULES, getMerchantTechPricing } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { createAnalyticsState } from '../js/systems/merchant/MerchantAnalytics.js';
import { chooseAllocation, dispatchPlans, execute, routeProfiles } from './merchant-fleet-model.mjs';
import { getPendingTechChain } from '../js/systems/merchant/MerchantTechnology.js';

const start = 1_800_000_000_000;
const round = value => Number(value.toFixed(2));

export function measureFleet({ level, expansion = true, policy = 'investment', horizonMinutes = 60, deferredTechId = null }) {
  const state = createInitialState({ credits: 10_000_000 });
  Merchant.init(state, start);
  state.merchant.companyLevel = level;
  state.merchant.exploration.rngState = 42;
  const selected = new Set(MERCHANT_TECHS.filter(tech => tech.companyLevel <= level && tech.id !== deferredTechId
    && (expansion || !tech.shipSlotBonus)).flatMap(tech => getPendingTechChain(state.merchant, tech.id).map(item => item.id)));
  assert.ok(!selected.has(deferredTechId), '推迟的核心不得被实验中的后置科技间接完成。');
  const techs = MERCHANT_TECHS.filter(tech => selected.has(tech.id));
  for (const tech of techs) execute(state, 'researchTech', { techId: tech.id });
  const researchCost = techs.reduce((sum, tech) => sum + tech.cost, 0);
  let explorationCost = 0;
  const portCount = 2 + MERCHANT_EXPLORATION_TARGETS.filter(target => state.merchant.researchedTechIds.includes(target.techId)).length;
  for (let target = 0; target < portCount - 2; target++) {
    Merchant.advance(state, state.merchant.lastTickAt);
    Merchant.advance(state, state.merchant.exploration.nextEventAt || state.merchant.lastTickAt);
    const event = state.merchant.exploration.event;
    const input = { eventId: event.id, shipId: 'ship-1', from: target ? 'nebula_forge' : 'sol_prime' };
    const preview = Merchant.getExplorationPreview(state, input);
    explorationCost += preview.cost;
    execute(state, 'explore', input);
    Merchant.advance(state, state.merchant.lastTickAt + preview.durationMs);
  }
  const company = Merchant.getCompanyProgress(state.merchant);
  const fleetSize = expansion ? company.shipLimit : company.baseShipLimit;
  const profiles = routeProfiles(state);
  const plans = [{ ...chooseAllocation(state, [], profiles, { typeId: 'courier', policy }), shipId: 'ship-1', taskId: null }];
  let purchaseCost = 0;
  while (state.merchant.ships.length < fleetSize) {
    const next = chooseAllocation(state, plans, profiles, { policy });
    purchaseCost += next.purchaseCost;
    const bought = execute(state, 'buyShip', { typeId: next.typeId });
    plans.push({ ...next, shipId: bought.shipIds[0], taskId: null });
  }
  const workingCapital = plans.reduce((sum, plan) => sum + plan.budget, 0);
  assert.equal(state.credits, 10_000_000 - researchCost - explorationCost - purchaseCost);
  assert.equal(state.merchant.ships.length, fleetSize);
  Merchant.advance(state, Math.ceil(state.merchant.lastTickAt / 60_000) * 60_000);
  const labStart = state.merchant.lastTickAt;
  state.merchant.analytics = createAnalyticsState(labStart);
  let dispatches = dispatchPlans(state, plans), peakActiveShips = 0;
  assert.equal(state.merchant.tasks.reduce((sum, task) => sum + task.budget, 0), workingCapital);
  assert.equal(state.merchant.ships.filter(ship => ship.taskId).length, fleetSize);
  const participatingShips = new Set();
  for (let seconds = 10; seconds <= horizonMinutes * 60; seconds += 10) {
    assert.equal(Merchant.advance(state, labStart + seconds * 1000).caughtUp, true);
    const active = state.merchant.ships.filter(ship => ['outbound', 'return'].includes(ship.phase));
    peakActiveShips = Math.max(peakActiveShips, active.length);
    for (const ship of active) participatingShips.add(ship.id);
    if (seconds % 60 === 0 && seconds < horizonMinutes * 60) dispatches += dispatchPlans(state, plans);
  }
  assert.equal(Merchant.isValidMerchantState(state.merchant), true);
  const totals = state.merchant.analytics.routes.reduce((sum, route) => ({ profit: sum.profit + route.profit,
    quantity: sum.quantity + route.quantity, capacity: sum.capacity + route.capacity, trips: sum.trips + route.trips }),
  { profit: 0, quantity: 0, capacity: 0, trips: 0 });
  const fleet = state.merchant.analytics.fleet.reduce((sum, bucket) => ({ owned: sum.owned + bucket.ownedMs,
    busy: sum.busy + bucket.busyMs }), { owned: 0, busy: 0 });
  const profitPerMinute = totals.profit / horizonMinutes;
  // 自由现金、任务货本、在途采购与费用合计必须只增加已结算净利。
  const committed = state.merchant.tasks.reduce((sum, task) => sum + task.available, 0)
    + state.merchant.ships.reduce((sum, ship) => sum + (ship.trip ? ship.trip.cost + ship.trip.fee : 0), 0);
  assert.equal(state.credits + committed, 10_000_000 - researchCost - explorationCost - purchaseCost + totals.profit);
  return { level, policy, expansion, deferredTechId, baseShipLimit: company.baseShipLimit, researchShipSlots: company.researchShipSlots,
    ships: state.merchant.ships.length, ports: portCount, fleet: Object.fromEntries([...new Set(plans.map(plan => plan.typeId))]
      .map(typeId => [typeId, plans.filter(plan => plan.typeId === typeId).length])),
    researchCost, purchaseCost, explorationCost, workingCapital,
    fleetExpansionCost: techs.reduce((sum, tech) => sum + (tech.shipSlotBonus ? tech.cost : 0), 0),
    initialInvestment: researchCost + purchaseCost + explorationCost + workingCapital,
    profitPerMinute: round(profitPerMinute), netProfit: totals.profit, trips: totals.trips,
    loadPercent: round(totals.quantity / totals.capacity * 100), idlePercent: round((1 - fleet.busy / fleet.owned) * 100),
    allocatedShips: plans.length, participatingShips: participatingShips.size, peakObservedActiveShips: peakActiveShips, dispatches,
    nextUpgradeCost: company.upgradeCost,
    upgradeIncomeMinutes: company.upgradeCost === null ? null : round(company.upgradeCost / profitPerMinute),
    routes: state.merchant.analytics.routes.map(route => ({ from: route.from, to: route.to, goodId: route.goodId,
      profitPerMinute: round(route.profit / horizonMinutes), quantity: route.quantity, trips: route.trips })),
  };
}

export function calibrateCompanyPrices() {
  const stages = MERCHANT_COMPANY_LEVELS.map(stage => {
    const baseFleet = measureFleet({ level: stage.level, expansion: false });
    const candidates = ['investment', 'throughput'].map(policy => measureFleet({ level: stage.level, policy }));
    const fullFleet = candidates.reduce((best, item) => item.netProfit > best.netProfit ? item : best);
    const companyInvestment = MERCHANT_COMPANY_LEVELS.filter(item => item.level < stage.level)
      .reduce((sum, item) => sum + item.upgradeCost, 0);
    return { level: stage.level, tier: stage.tier, isBreakthrough: stage.isBreakthrough,
      breakthroughFactor: stage.breakthroughFactor, breakthroughBaseCost: stage.breakthroughBaseCost, companyInvestment,
      newlyUnlockedResearchCost: MERCHANT_TECHS.filter(tech => tech.companyLevel === stage.level).reduce((sum, tech) => sum + tech.cost, 0),
      totalStageInvestment: companyInvestment + fullFleet.initialInvestment, baseFleet, fullFleet, candidates };
  });
  return { assumptions: '覆盖全部 100 级、20 阶。基础规模与全部当级扩容后的满编船队分别实测；基础规模仍支付船型、功能所需的扩容前置，但只采购基础数量。实际支付科技完整依赖链、逐艘递增采购报价、探索和全船队货本。一艘初始轻舟保留；使用投资效率、吞吐两种混编策略的较高实测净利。60 分钟共享真实港口供需，任务持续经营，每分钟仅补派已解除的空闲船。实验现金只用于隔离阶段收入，不读取或改写玩家存档。',
    horizonMinutes: 60, formula: '普通升级费用按原成长价格锚点分散到百级；每阶第五级突破费用 = 升至该级的普通费用 × N，N = 2 + 0.5 × (阶数 - 1)。购船、科技、探索和周转货本另行支付；实际积累分钟按当前费用 / 实测满编净利计算。',
    technologyPricing: { rules: MERCHANT_TECH_PRICING_RULES, formula: '研发费用 = 所属等级公司普通费用 × N × 效果权重 × 核心系数，向上取整到 100 CR；普通科技核心系数为1，不重复计入突破金额。',
      totalResearchCost: MERCHANT_TECHS.reduce((sum, tech) => sum + tech.cost, 0),
      technologies: MERCHANT_TECHS.map(tech => ({ id: tech.id, level: tech.companyLevel, category: tech.category, ...getMerchantTechPricing(tech) })) },
    stages, totalUpgradeCost: MERCHANT_COMPANY_LEVELS.reduce((sum, stage) => sum + (stage.upgradeCost ?? 0), 0) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  assert.ok(args.every(arg => arg === '--write'), '仅支持 --write 保存完整实验结果。');
  const result = calibrateCompanyPrices();
  if (args.includes('--write')) await writeFile(new URL('../docs/2.1/科技树满编测算.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
