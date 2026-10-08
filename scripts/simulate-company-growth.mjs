import { createInitialState } from '../js/data/constants.js';
import { MERCHANT_COMPANY_LEVELS, MERCHANT_EXPLORATION_RULES, MERCHANT_TECHS } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { getPendingTechChain } from '../js/systems/merchant/MerchantTechnology.js';

// 只推进经营规则的虚拟时间；不启动浏览器、不读取或改写玩家存档。
const start = 1_800_000_000_000;
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--with-research' && !/^--seed=\d+$/.test(arg))) {
  throw new Error('仅支持 --with-research 与 --seed=<非零32位整数> 参数。');
}
const withResearch = args.includes('--with-research');
const seedArgs = args.filter(arg => arg.startsWith('--seed='));
const seed = Number(seedArgs[0]?.slice(7) ?? 42);
if (seedArgs.length > 1 || !Number.isSafeInteger(seed) || seed < 1 || seed > 0xffff_ffff) {
  throw new Error('探索随机种子必须是非零32位整数，且只能指定一次。');
}
const state = createInitialState();
Merchant.init(state, start);
// 固定输入种子；后续信号延迟仍由真实升级/事件规则抽取并持久保存。
state.merchant.exploration.rngState = seed;
function command(action, input, now = start) {
  const result = Merchant.command(state, action, input, now);
  if (!result.ok) throw new Error(`${action}：${result.msg}`);
  return result;
}
const plan = (shipId, from, to, goodId, budget) => ({shipIds:[shipId],from,to,goodId,budget});
// 起步用原轻舟积累升级与探索费用，新增船位和船只分别支付；不预支资金。
const research = [];
const routes = [
  {shipId:'ship-1',from:'mineral_belt',to:'sol_prime',goodId:'minerals',budget:162,taskId:null,dispatches:0},
];
let explorerId = null;
let expanded = false;
const exploration = { seed, shipId:null, from:'sol_prime', cost:MERCHANT_EXPLORATION_RULES.cost };
function currentTask(route) {
  const ship = state.merchant.ships.find(item => item.id === route.shipId);
  const task = state.merchant.tasks.find(item => item.id === ship?.taskId);
  route.taskId = task?.id ?? null;
  return task;
}
function dispatchAvailableRoutes(now) {
  for (const route of routes) {
    const ship = state.merchant.ships.find(item => item.id === route.shipId);
    // 这是模拟玩家的主动补派，不是经营系统恢复已经结束的任务。
    if (currentTask(route) || !ship || ship.taskId || ship.phase !== 'idle' || state.credits < route.budget) continue;
    const input = plan(route.shipId, route.from, route.to, route.goodId, route.budget);
    const offer = Merchant.preview(state, input);
    if (offer.quantity <= 0 || offer.profit <= 0) continue;
    route.taskId = command('create', input, now).taskId;
    route.dispatches += 1;
    currentTask(route);
  }
}
function idleWorkingCapital(except) {
  return routes.reduce((sum, route) => sum + (route !== except && !currentTask(route) ? route.budget : 0), 0);
}
function spendingReserve() {
  // 解除派遣后返还的货本仍留作同一艘船补派，避免研发或升级把经营本金花光。
  return Math.max(idleWorkingCapital(), Merchant.getOperatingReserve(state));
}
dispatchAvailableRoutes(start);
const stages = [{level:1,minutes:0,cash:state.credits}];
// 此脚本保留三船低投入对照；当前费用按满编校准，对照需要更长积累窗口。
const horizonSeconds = 30 * 24 * 60 * 60;
let elapsedSeconds = 0;
let lastUpgradeAt = 0;
const cashBuffer = 100;
for (let second = 1; second <= horizonSeconds; second++) {
  elapsedSeconds = second;
  const now = start + second * 1000;
  Merchant.advance(state, now);
  if (state.merchant.companyLevel === 1) {
    dispatchAvailableRoutes(now);
    const company = Merchant.getCompanyProgress(state.merchant);
    if (state.credits >= company.upgradeCost + spendingReserve()) {
      command(company.action, {}, now);
      stages.push({level:2,upgradeCost:company.upgradeCost,minutes:Number((second/60).toFixed(2)),
        stageMinutes:Number((second/60).toFixed(2)),cash:state.credits});
      lastUpgradeAt = second;
    }
    continue;
  }
  if (!expanded) {
    dispatchAvailableRoutes(now);
    for (const id of ['berth_planning', MERCHANT_EXPLORATION_RULES.techId]) {
      for (const tech of getPendingTechChain(state.merchant, id)) {
        if (state.merchant.companyLevel < tech.companyLevel || state.credits < tech.cost + spendingReserve()) break;
        command('researchTech', {techId:tech.id}, now);
        research.push({techId:tech.id,cost:tech.cost,companyLevel:state.merchant.companyLevel,minutes:Number((second/60).toFixed(2)),cash:state.credits});
      }
    }
    const event = state.merchant.exploration.event;
    const purchase = Merchant.getShipPurchaseQuote(state.merchant, 'courier');
    if (!explorerId && event?.status === 'available' && Merchant.getCompanyProgress(state.merchant).remaining
      && state.credits >= purchase.total + MERCHANT_EXPLORATION_RULES.cost + spendingReserve() + cashBuffer) {
      explorerId = command('buyShip', {typeId:'courier'}, now).shipIds[0];
      exploration.shipId = explorerId;
      exploration.eventId = event.id;
      exploration.appearedMinutes = Number(((event.appearedAt - start) / 60_000).toFixed(2));
      exploration.purchasedMinutes = Number((second / 60).toFixed(2));
    }
    if (explorerId && event?.status === 'available') {
      const input = {eventId:event.id, shipId:explorerId, from:exploration.from};
      const offer = Merchant.getExplorationPreview(state, input);
      if (offer.ok) {
        command('explore', input, now);
        exploration.startedMinutes = Number((second / 60).toFixed(2));
        exploration.durationSeconds = offer.durationMs / 1000;
        exploration.surveySeconds = offer.surveyMs / 1000;
      }
    }
    if (event?.status === 'completed' && state.merchant.unlockedPorts.includes(MERCHANT_EXPLORATION_RULES.targetPortId)) {
      const budget = Merchant.fullLoadBudget('courier', 'mineral_belt', 'nebula_forge', 'minerals', state.merchant);
      routes.push({shipId:explorerId,from:'mineral_belt',to:'nebula_forge',goodId:'minerals',budget,taskId:null,dispatches:0});
      expanded = true;
      exploration.completedMinutes = Number(((event.completedAt - start) / 60_000).toFixed(2));
      exploration.expandedMinutes = Number((second / 60).toFixed(2));
    }
    continue;
  }
  // 后续有基础船位时采购第三艘常规船；探索船返港后先投入第二条商路。
  const blueprint = Merchant.getTech('clipper_design');
  if (state.merchant.companyLevel >= blueprint.companyLevel && !state.merchant.researchedTechIds.includes(blueprint.id)
    && state.credits >= blueprint.cost + spendingReserve()) {
    command('researchTech', {techId:blueprint.id}, now);
    research.push({techId:blueprint.id,cost:blueprint.cost,companyLevel:state.merchant.companyLevel,minutes:Number((second/60).toFixed(2)),cash:state.credits});
  }
  const purchase = Merchant.getShipPurchaseQuote(state.merchant, 'clipper');
  const thirdBudget = Merchant.fullLoadBudget('clipper', 'nebula_forge', 'sol_prime', 'technology', state.merchant);
  if (routes.length < 3 && Merchant.getCompanyProgress(state.merchant).remaining
    && state.merchant.researchedTechIds.includes(blueprint.id) && state.credits >= purchase.total + thirdBudget + spendingReserve()) {
    const shipId = command('buyShip', {typeId:'clipper'}, now).shipIds[0];
    routes.push({shipId,from:'nebula_forge',to:'sol_prime',goodId:'technology',budget:thirdBudget,taskId:null,dispatches:0});
  }
  // 每秒检查一次：仅在供需和完整货本能盈利时，用空闲原船重新创建已结束商路。
  dispatchAvailableRoutes(now);
  // 对照路线先支付当级研发费用；维持同样的三船经营，单独比较现金取舍。
  const pendingTech = withResearch && MERCHANT_TECHS.find(tech =>
    tech.companyLevel <= state.merchant.companyLevel && !state.merchant.researchedTechIds.includes(tech.id) && tech.requires.every(id => state.merchant.researchedTechIds.includes(id)));
  if (pendingTech && state.credits >= pendingTech.cost + spendingReserve()) {
    command('researchTech', {techId:pendingTech.id}, now);
    research.push({
      techId:pendingTech.id, cost:pendingTech.cost, unlockShipId:pendingTech.unlockShipId,
      companyLevel:state.merchant.companyLevel, minutes:Number((second/60).toFixed(2)), cash:state.credits,
    });
  }
  const awaitingResearch = withResearch && MERCHANT_TECHS.some(tech =>
    tech.companyLevel <= state.merchant.companyLevel && !state.merchant.researchedTechIds.includes(tech.id));
  const company = Merchant.getCompanyProgress(state.merchant);
  if (!awaitingResearch && company.upgradeCost !== null && (company.shipLimit < 3 || routes.length >= 3)
    && state.credits >= company.upgradeCost + spendingReserve()) {
    command(company.action, {}, now);
    stages.push({
      level:state.merchant.companyLevel,
      upgradeCost:company.upgradeCost,
      minutes:Number((second/60).toFixed(2)),
      stageMinutes:Number(((second - lastUpgradeAt)/60).toFixed(2)),
      cash:state.credits,
    });
    lastUpgradeAt = second;
  }
  if (state.merchant.companyLevel === MERCHANT_COMPANY_LEVELS.at(-1).level && (!withResearch || state.merchant.researchedTechIds.length === MERCHANT_TECHS.length)) break;
}
if (!Merchant.isValidMerchantState(state.merchant)) throw new Error('模拟结束时经营账本或船只占用状态无效。');
const completed = state.merchant.companyLevel === MERCHANT_COMPANY_LEVELS.at(-1).level
  && (!withResearch || state.merchant.researchedTechIds.length === MERCHANT_TECHS.length);
console.log(JSON.stringify({
  strategy:'主动补派策略：单船起步，Lv.2分别研发船位规划与新港勘察、采购空闲轻舟，原商路持续经营。新船完成飞行、4分钟勘察及返港后投入第二条商路；后续有基础船位时研究并采购第三艘常规船。每秒检查共享供需，保留货本，每五级突破，不采购进阶船、不赠资源。' + (withResearch ? '具备资格的全部65项科技逐项付费研发。' : '只研发船位规划、新港勘察和翻身船体。'),
  completed,
  horizonMinutes:horizonSeconds/60,
  simulatedMinutes:Number((elapsedSeconds/60).toFixed(2)),
  stages,
  exploration,
  research,
  routes:routes.map(({shipId,from,to,goodId,budget,dispatches}) => ({shipId,from,to,goodId,budget,dispatches})),
},null,2));
if (!completed) process.exitCode = 1;
