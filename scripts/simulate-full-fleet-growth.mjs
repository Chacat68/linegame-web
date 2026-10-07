import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createInitialState } from '../js/data/constants.js';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_EXPLORATION_TARGETS, MERCHANT_TECHS } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { chooseAllocation, dispatchPlans, execute, routeProfiles } from './merchant-fleet-model.mjs';

const args = process.argv.slice(2);
assert.ok(args.every(arg => arg === '--write'), '仅支持 --write 保存完整成长结果。');
const start = 1_800_000_000_000, horizonMinutes = 14 * 24 * 60;
const state = createInitialState();
Merchant.init(state, start);
state.merchant.exploration.rngState = 42;
let profiles = routeProfiles(state);
const plans = [{ ...chooseAllocation(state, [], profiles, { typeId: 'courier' }), shipId: 'ship-1', taskId: null }];
const spending = { upgrades: 0, research: 0, ships: 0, exploration: 0 };
const stages = [], exploration = [], research = [];
let surveyShipId = null, lastUpgradeAt = start, elapsedSeconds = 0, dispatches = 0;
let fleetReadyAt = null;
const minute = () => Number(((state.merchant.lastTickAt - start) / 60_000).toFixed(2));
const activeTask = plan => state.merchant.tasks.find(task => task.id === plan.taskId);
function idleCapital() {
  return plans.reduce((sum, plan) => sum + (!activeTask(plan) ? plan.budget : 0), 0);
}
function reserve() { return Math.max(idleCapital(), Merchant.getOperatingReserve(state)); }
function dispatch() { dispatches += dispatchPlans(state, plans.filter(plan => plan.shipId !== surveyShipId)); }
function updateCapital() {
  for (const plan of plans) {
    const route = profiles.find(item => item.from === plan.from && item.to === plan.to && item.goodId === plan.goodId);
    const budget = route.types.find(row => row.typeId === plan.typeId).capital;
    const task = activeTask(plan);
    if (!task) { plan.budget = budget; continue; }
    if (task.pending || budget <= task.budget || state.credits < budget - task.budget + reserve()) continue;
    execute(state, 'update', { from: plan.from, to: plan.to, goodId: plan.goodId, shipIds: [plan.shipId], taskId: task.id, budget });
    plan.budget = budget;
  }
}
function exploreNewPort() {
  const merchant = state.merchant;
  const target = MERCHANT_EXPLORATION_TARGETS.find(item => item.companyLevel <= merchant.companyLevel
    && !merchant.unlockedPorts.includes(item.targetPortId))?.targetPortId;
  if (!target) return false;
  const event = merchant.exploration.event;
  if (event?.portId !== target || event.status === 'completed') return true;
  if (event.status === 'available' && !surveyShipId) {
    const candidate = merchant.ships.find(ship => !['outbound', 'return'].includes(ship.phase)) || merchant.ships[0];
    const preview = Merchant.getExplorationPreview(state, { eventId: event.id, shipId: candidate.id,
      from: target === 'aurora_depot' ? 'nebula_forge' : 'sol_prime' });
    if (state.credits < preview.cost + reserve()) return true;
    surveyShipId = candidate.id;
    const plan = plans.find(item => item.shipId === candidate.id);
    if (activeTask(plan)) execute(state, 'stop', { taskId: plan.taskId });
  }
  const ship = merchant.ships.find(item => item.id === surveyShipId);
  if (event.status === 'available' && ship && !ship.taskId && ship.phase === 'idle') {
    const input = { eventId: event.id, shipId: ship.id, from: target === 'aurora_depot' ? 'nebula_forge' : 'sol_prime' };
    const preview = Merchant.getExplorationPreview(state, input);
    if (preview.ok && state.credits >= preview.cost + reserve()) {
      spending.exploration += preview.cost;
      execute(state, 'explore', input);
      exploration.push({ portId: target, startedMinutes: minute(), durationSeconds: preview.durationMs / 1000, cost: preview.cost });
    }
  }
  return true;
}
function resumeSurveyShip() {
  if (!surveyShipId) return;
  const ship = state.merchant.ships.find(item => item.id === surveyShipId);
  const event = state.merchant.exploration.event;
  if (event?.status !== 'completed' || ship.taskId || ship.phase !== 'idle') return;
  profiles = routeProfiles(state);
  const plan = plans.find(item => item.shipId === surveyShipId);
  Object.assign(plan, chooseAllocation(state, plans.filter(item => item !== plan), profiles, { typeId: ship.typeId }), { taskId: null });
  exploration.at(-1).completedMinutes = minute();
  surveyShipId = null;
}
dispatch();
for (let seconds = 10; seconds <= horizonMinutes * 60; seconds += 10) {
  elapsedSeconds = seconds;
  assert.equal(Merchant.advance(state, start + seconds * 1000).caughtUp, true);
  resumeSurveyShip();
  dispatch();
  let pending = MERCHANT_TECHS.find(tech => tech.companyLevel <= state.merchant.companyLevel
    && !state.merchant.researchedTechIds.includes(tech.id) && tech.requires.every(id => state.merchant.researchedTechIds.includes(id)));
  while (pending && state.credits >= pending.cost + reserve()) {
    execute(state, 'researchTech', { techId: pending.id });
    spending.research += pending.cost;
    research.push({ techId: pending.id, cost: pending.cost, level: state.merchant.companyLevel, minutes: minute() });
    profiles = routeProfiles(state);
    updateCapital();
    pending = MERCHANT_TECHS.find(tech => tech.companyLevel <= state.merchant.companyLevel
      && !state.merchant.researchedTechIds.includes(tech.id) && tech.requires.every(id => state.merchant.researchedTechIds.includes(id)));
  }
  const exploring = exploreNewPort();
  updateCapital();
  const company = Merchant.getCompanyProgress(state.merchant);
  // 先研究当级科技并投资满编，再积累下一级费用；所有支出来自真实贸易回款。
  while (!pending && !exploring && state.merchant.ships.length < company.shipLimit) {
    const next = chooseAllocation(state, plans, profiles);
    if (state.credits < next.investment + reserve()) break;
    const bought = execute(state, 'buyShip', { typeId: next.typeId });
    spending.ships += next.purchaseCost;
    plans.push({ ...next, shipId: bought.shipIds[0], taskId: null });
    dispatch();
  }
  dispatch();
  const fullCapital = plans.every(plan => {
    const route = profiles.find(item => item.from === plan.from && item.to === plan.to && item.goodId === plan.goodId);
    return activeTask(plan)?.budget >= route.types.find(row => row.typeId === plan.typeId).capital;
  });
  const ready = !pending && !exploring && state.merchant.ships.length === company.shipLimit && fullCapital;
  if (ready && fleetReadyAt === null) fleetReadyAt = state.merchant.lastTickAt;
  if (ready && (company.upgradeCost === null || state.credits >= company.upgradeCost + reserve())) {
    stages.push({ level: company.level, ships: state.merchant.ships.length, baseShipLimit: company.baseShipLimit,
      researchShipSlots: company.researchShipSlots, fleetReadyMinutes: Number(((fleetReadyAt - start) / 60_000).toFixed(2)),
      minutes: minute(), stageMinutes: Number(((state.merchant.lastTickAt - lastUpgradeAt) / 60_000).toFixed(2)),
      upgradeCost: company.upgradeCost, isBreakthrough: company.isBreakthrough, breakthroughFactor: company.breakthroughFactor,
      workingCapital: plans.reduce((sum, plan) => sum + activeTask(plan).budget, 0),
      cumulativeSpending: { ...spending }, cash: state.credits });
    if (company.upgradeCost === null) break;
    execute(state, company.action);
    spending.upgrades += company.upgradeCost;
    lastUpgradeAt = state.merchant.lastTickAt;
    fleetReadyAt = null;
    profiles = routeProfiles(state);
  }
}
assert.equal(Merchant.isValidMerchantState(state.merchant), true);
const profit = state.merchant.analytics.routes.reduce((sum, route) => sum + route.profit, 0);
const committed = state.merchant.tasks.reduce((sum, task) => sum + task.available, 0)
  + state.merchant.ships.reduce((sum, ship) => sum + (ship.trip ? ship.trip.cost + ship.trip.fee : 0), 0);
assert.equal(state.credits + committed, 1000 + profit - Object.values(spending).reduce((sum, cost) => sum + cost, 0));
const completed = stages.length === MERCHANT_COMPANY_LEVELS.length && state.merchant.researchedTechIds.length === MERCHANT_TECHS.length;
for (const stage of stages) assert.equal(stage.ships, stage.baseShipLimit + stage.researchShipSlots);
const result = { strategy: '从真实初始 1,000 CR 和一艘轻舟起步，每 10 秒主动查看；当级科技全部付费研发，按共享供需与购船投入效率混编，先补满当级基础及研发船位、划拨全船队货本再升级；探索使用原船停派并完整返港，开放新港后才安排新商路。保留已购船与在途快照，不赠送或外加资金。',
  completed, horizonMinutes, simulatedMinutes: Number((elapsedSeconds / 60).toFixed(2)), stages, exploration,
  researchedTechs: state.merchant.researchedTechIds.length, ships: state.merchant.ships.length, spending,
  netProfit: profit, finalCash: state.credits, committedCapital: committed, dispatches, research };
if (args.includes('--write')) await writeFile(new URL('../docs/2.1/科技树满编成长.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!completed) process.exitCode = 1;
