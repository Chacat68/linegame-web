import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createInitialState, GAME_VERSION } from '../js/data/constants.js';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_TECHS } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { createAnalyticsState } from '../js/systems/merchant/MerchantAnalytics.js';
import { getPendingTechChain } from '../js/systems/merchant/MerchantTechnology.js';

// 受控经营实验：固定公司资格、市场和玩家策略，不读取浏览器或改写玩家存档。
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--write')) throw new Error('仅支持 --write 保存文档中的可复核结果。');
const start = 1_800_000_000_000, horizonMinutes = 60;
const network = [
  { from: 'sol_prime', to: 'mineral_belt', goodId: 'food' },
  { from: 'mineral_belt', to: 'nebula_forge', goodId: 'minerals' },
  { from: 'nebula_forge', to: 'sol_prime', goodId: 'technology' },
];
const rawMaterial = [{ from: 'aurora_depot', to: 'nebula_forge', goodId: 'alloys' }];
function execute(state, action, input = {}) {
  const result = Merchant.command(state, action, input, state.merchant.lastTickAt);
  assert.equal(result.ok, true, `${action}：${result.msg}`); return result;
}
function commonState() {
  const state = createInitialState({ credits: 10_000_000 });
  Merchant.init(state, start); state.merchant.companyLevel = MERCHANT_COMPANY_LEVELS.at(-1).level;
  state.merchant.exploration.rngState = 42;
  for (const techId of ['clipper_design', 'hauler_design', 'fleet_command', 'market_network', 'planet_survey', 'deep_survey']) {
    for (const tech of getPendingTechChain(state.merchant, techId)) execute(state, 'researchTech', { techId: tech.id });
  }
  for (let target = 0; target < 2; target++) {
    Merchant.advance(state, state.merchant.lastTickAt);
    Merchant.advance(state, state.merchant.exploration.nextEventAt);
    const event = state.merchant.exploration.event;
    const input = { eventId: event.id, shipId: 'ship-1', from: target ? 'nebula_forge' : 'sol_prime' };
    const preview = Merchant.getExplorationPreview(state, input);
    execute(state, 'explore', input);
    Merchant.advance(state, state.merchant.lastTickAt + preview.durationMs);
  }
  // 对齐实验起点，使保存的分钟桶覆盖完整的 60 分钟。
  Merchant.advance(state, Math.ceil(state.merchant.lastTickAt / 60_000) * 60_000);
  state.merchant.analytics = createAnalyticsState(state.merchant.lastTickAt);
  assert.equal(Merchant.isValidMerchantState(state.merchant), true);
  return state;
}
const common = commonState();
const workingCapital = (ship, route) => Merchant.getShipRouteComparison(common, route).find(row => row.typeId === ship.typeId).capital;
function fullCapital(ships, routes) {
  return ships.reduce((total, ship, index) => total + workingCapital(ship, routes[index % routes.length]), 0);
}
function prepare({ typeId, count, routes, ceiling }) {
  const state = structuredClone(common), before = state.credits;
  const needed = new Set();
  function research(id) {
    if (!id || needed.has(id) || state.merchant.researchedTechIds.includes(id)) return;
    const tech = MERCHANT_TECHS.find(item => item.id === id);
    for (const prerequisite of tech.requires) research(prerequisite);
    execute(state, 'researchTech', { techId: id }); needed.add(id);
  }
  research(Merchant.getShipType(typeId).techId);
  const researchCost = before - state.credits;
  const purchaseStart = state.credits;
  const shipLimit = Merchant.getCompanyProgress(state.merchant).shipLimit;
  assert.ok(count === undefined || count <= shipLimit, '实验船队不得超过实际船位。');
  while (state.merchant.ships.length < (count ?? shipLimit)) {
    const quote = Merchant.getShipPurchaseQuote(state.merchant, typeId);
    const candidate = [...state.merchant.ships, { typeId }];
    const investment = before - state.credits + quote.total + fullCapital(candidate, routes);
    if (ceiling !== undefined && investment > ceiling) break;
    execute(state, 'buyShip', { typeId });
  }
  const purchaseCost = purchaseStart - state.credits;
  const groups = new Map();
  state.merchant.ships.forEach((ship, index) => {
    const route = routes[index % routes.length], key = JSON.stringify(route);
    if (!groups.has(key)) groups.set(key, { route, ships: [] });
    groups.get(key).ships.push(ship);
  });
  const configurations = [];
  const groupSize = Math.ceil(state.merchant.ships.length / 24);
  for (const { route, ships } of groups.values()) for (let index = 0; index < ships.length; index += groupSize) {
    const group = ships.slice(index, index + groupSize);
    configurations.push({ ...route, shipIds: group.map(ship => ship.id), budget: group.reduce((sum, ship) => sum + workingCapital(ship, route), 0), taskId: null });
  }
  const capital = configurations.reduce((sum, plan) => sum + plan.budget, 0);
  assert.equal(capital, fullCapital(state.merchant.ships, routes));
  return { state, configurations, researchCost, purchaseCost, capital, fixedCost: researchCost + purchaseCost, initialInvestment: researchCost + purchaseCost + capital };
}
function simulate(options) {
  const setup = prepare(options), { state } = setup;
  const labStart = state.merchant.lastTickAt;
  let dispatchCommands = 0, createdTasks = 0, blockedDispatchChecks = 0;
  function inspect() {
    // 固定实验配置只在脚本中保存；每项通过普通派遣提交，共享实时现金与市场。
    for (const plan of setup.configurations) {
      if (state.merchant.tasks.some(task => task.id === plan.taskId)) continue;
      const preview = Merchant.preview(state, plan);
      if (state.credits < plan.budget || preview.quantity <= 0 || preview.profit <= 0 ||
          plan.shipIds.some(id => state.merchant.ships.find(ship => ship.id === id)?.taskId)) {
        blockedDispatchChecks++; continue;
      }
      plan.taskId = execute(state, 'create', plan).taskId;
      dispatchCommands++; createdTasks++;
    }
  }
  const profit = () => state.merchant.analytics.routes.reduce((sum, route) => sum + route.profit, 0);
  const profitsByMinute = [0]; inspect();
  for (let seconds = 10; seconds <= horizonMinutes * 60; seconds += 10) {
    assert.equal(Merchant.advance(state, labStart + seconds * 1000).caughtUp, true);
    if (seconds % options.inspectSeconds === 0 && seconds < horizonMinutes * 60) inspect();
    if (seconds % 60 === 0) profitsByMinute.push(profit());
  }
  assert.equal(Merchant.isValidMerchantState(state.merchant), true);
  if (options.count) assert.equal(state.merchant.ships.length, options.count);
  if (options.ceiling !== undefined) assert.ok(setup.initialInvestment <= options.ceiling);
  const totals = state.merchant.analytics.routes.reduce((sum, route) => ({
    profit: sum.profit + route.profit, trips: sum.trips + route.trips, quantity: sum.quantity + route.quantity,
    capacity: sum.capacity + route.capacity, capitalMs: sum.capitalMs + route.capitalMs,
  }), { profit: 0, trips: 0, quantity: 0, capacity: 0, capitalMs: 0 });
  const fleet = state.merchant.analytics.fleet.reduce((sum, bucket) => ({ owned: sum.owned + bucket.ownedMs, busy: sum.busy + bucket.busyMs }), { owned: 0, busy: 0 });
  const round = value => Number(value.toFixed(2));
  return {
    typeId: options.typeId, ships: state.merchant.ships.length, inspectSeconds: options.inspectSeconds,
    market: options.routes === network ? '三港三线路' : '工业原料单线路',
    researchCost: setup.researchCost, purchaseCost: setup.purchaseCost, workingCapital: setup.capital,
    fixedCost: setup.fixedCost, initialInvestment: setup.initialInvestment,
    netProfit: totals.profit, profitPerMinute: round(totals.profit / horizonMinutes), trips: totals.trips,
    loadPercent: totals.capacity ? round(totals.quantity / totals.capacity * 100) : 0,
    idlePercent: round((1 - fleet.busy / fleet.owned) * 100), averageCapital: round(totals.capitalMs / (horizonMinutes * 60_000)),
    dispatchCommands, createdTasks, blockedDispatchChecks, profitsByMinute,
  };
}
const scale = [];
for (const count of [3, 6, 12]) for (const inspectSeconds of [60, 300]) {
  scale.push(simulate({ typeId: 'clipper', count, inspectSeconds, routes: network }));
}
const investments = [];
for (const count of [3, 6, 12]) for (const inspectSeconds of [60, 300]) {
  for (const [typeId, basicType, routes] of [['swift', 'clipper', network], ['bulk', 'hauler', rawMaterial], ['relay', 'hauler', rawMaterial]]) {
    const advanced = simulate({ typeId, count, inspectSeconds, routes });
    const baseline = simulate({ typeId: basicType, count, inspectSeconds, routes });
    const sameBudget = simulate({ typeId: basicType, ceiling: advanced.initialInvestment, inspectSeconds, routes });
    const extraFixedCost = advanced.fixedCost - baseline.fixedCost;
    const deltaProfit = advanced.netProfit - baseline.netProfit;
    const firstPayback = advanced.profitsByMinute.findIndex((value, minute) => minute > 0 && value - baseline.profitsByMinute[minute] >= extraFixedCost);
    investments.push({
      advanced, sameCountBasic: baseline, sameBudgetBasic: sameBudget,
      comparison: { extraFixedCost, deltaProfit, sameBudgetDeltaProfit: advanced.netProfit - sameBudget.netProfit,
        paybackByMinute: firstPayback > 0 ? firstPayback : null,
        verdict: firstPayback > 0 ? `在实验第 ${firstPayback} 分钟首次覆盖相同规模策略的额外研发与购船支出。` : '60 分钟内未覆盖相同规模策略的额外研发与购船支出。' },
    });
  }
}
const result = {
  gameVersion: GAME_VERSION, experiment: '真实规则的运力投入与集中补派对照', seed: 42, horizonMinutes,
  assumptions: [
    `共同起点固定公司 Lv.${MERCHANT_COMPANY_LEVELS.at(-1).level} 和高额实验现金，隔离公司升级与缺钱因素；不代表新局通关时间。`,
    `两个港口均执行真实付费探索、完整返港；共同基础船型/功能研发支出 ${common.merchant.researchedTechIds.reduce((sum, id) => sum + MERCHANT_TECHS.find(tech => tech.id === id).cost, 0)} CR、探索支出 2160 CR，未重复计入策略比较。`,
    '保留共同赠送的一艘轻舟，其余船只用真实递增报价采购；进阶船实际研发、购买并投入贸易。',
    '固定三港三线路或工业原料单线路，按固定派遣顺序共享供需；不是搜索最优线路或轮换策略。',
    '60/300 秒检查时只逐项派遣至少一航次盈利的商路；不会自动复投利润或增加实验配置以外的船只。',
    `同预算基础船按研发、购船与满载货本总现金上限扩购，最多 ${Merchant.getCompanyProgress(common.merchant).shipLimit} 船；本实验未研发船队扩容，超过 24 船时同路船合并派遣。`,
    '净利仅计完整返港已结算航次，闲置率按全部船只真实时间积分；期末在途航次不提前计利。',
    '回本比较相同船数策略的增量已结算净利与增量研发/购船费；货本单列，未视作永久支出。',
  ],
  scale, investments,
};
if (args.includes('--write')) await writeFile(new URL('../docs/2.1/科技树投资对照.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, scale: scale.map(({ profitsByMinute, ...row }) => row), investments: investments.map(row => ({
  ...row, advanced: { ...row.advanced, profitsByMinute: undefined }, sameCountBasic: { ...row.sameCountBasic, profitsByMinute: undefined }, sameBudgetBasic: { ...row.sameBudgetBasic, profitsByMinute: undefined },
})) }, null, 2));
