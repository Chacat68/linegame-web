import { createInitialState } from '../js/data/constants.js';
import { MERCHANT_EXPLORATION_RULES, MERCHANT_TECHS } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';

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
const bought = command('buyShip', {typeId:'clipper'});
const routes = [
  {shipId:'ship-1',from:'mineral_belt',to:'sol_prime',goodId:'minerals',budget:162,taskId:null,dispatches:0},
  {shipId:bought.shipIds[0],from:'sol_prime',to:'mineral_belt',goodId:'food',budget:178,taskId:null,dispatches:0},
];
let preparingExploration = false;
let expanded = false;
const exploration = { seed, shipId:routes[0].shipId, from:'sol_prime', cost:MERCHANT_EXPLORATION_RULES.cost };
function currentTask(route) {
  const ship = state.merchant.ships.find(item => item.id === route.shipId);
  const task = state.merchant.tasks.find(item => item.id === ship?.taskId);
  route.taskId = task?.id ?? null;
  return task;
}
function dispatchAvailableRoutes(now) {
  for (const route of routes) {
    const ship = state.merchant.ships.find(item => item.id === route.shipId);
    // 玩家已决定让原轻舟探索，停用后不重新抢占它的空闲窗口。
    if (route === routes[0] && preparingExploration && !expanded) continue;
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
const research = [];
const horizonSeconds = 12 * 60 * 60;
let elapsedSeconds = 0;
let lastUpgradeAt = 0;
const expansion = { newTaskBudget:238, updatedTaskBudget:260, cashBuffer:100 };
for (let second = 1; second <= horizonSeconds; second++) {
  elapsedSeconds = second;
  const now = start + second * 1000;
  Merchant.advance(state, now);
  // 二级后先等待真实信号，停止原贸易并等返港，再派该船探索新港。
  if (state.merchant.companyLevel >= 2 && !expanded) {
    const mineral = routes[0];
    const task = currentTask(mineral);
    const ship = state.merchant.ships.find(item => item.id === mineral.shipId);
    const event = state.merchant.exploration.event;
    const purchase = Merchant.getShipPurchaseQuote(state.merchant, 'clipper');
    const investment = MERCHANT_EXPLORATION_RULES.cost + (purchase?.total ?? Infinity) + expansion.newTaskBudget
      + Math.max(0, expansion.updatedTaskBudget - (task?.budget ?? 0))
      + idleWorkingCapital(mineral) + expansion.cashBuffer;
    if (!preparingExploration && event?.status === 'available' && task && !task.stopping
      && ['outbound', 'return'].includes(ship?.phase) && state.credits >= investment) {
      preparingExploration = true;
      exploration.eventId = event.id;
      exploration.appearedMinutes = Number(((event.appearedAt - start) / 60_000).toFixed(2));
      exploration.stoppedTaskMinutes = Number((second / 60).toFixed(2));
      exploration.stoppedTaskId = task.id;
      command('stop', {taskId:task.id}, now);
    }
    if (preparingExploration && event?.status === 'available' && ship && !ship.taskId && ship.phase === 'idle') {
      const input = {eventId:event.id, shipId:ship.id, from:exploration.from};
      const offer = Merchant.getExplorationPreview(state, input);
      if (offer.ok) {
        command('explore', input, now);
        exploration.startedMinutes = Number((second / 60).toFixed(2));
        exploration.returnWaitSeconds = Math.round((now - start) / 1000 - exploration.stoppedTaskMinutes * 60);
        exploration.durationSeconds = offer.durationMs / 1000;
      }
    }
    // 探索全返港才开放港口；购船和新贸易是之后的独立玩家操作。
    const completedEvent = state.merchant.exploration.event;
    const remainingInvestment = (purchase?.total ?? Infinity) + expansion.newTaskBudget
      + expansion.updatedTaskBudget + idleWorkingCapital(mineral) + expansion.cashBuffer;
    if (completedEvent?.status === 'completed' && state.merchant.unlockedPorts.includes(MERCHANT_EXPLORATION_RULES.targetPortId)
      && ship && !ship.taskId && ship.phase === 'idle' && state.credits >= remainingInvestment) {
      exploration.completedMinutes = Number(((completedEvent.completedAt - start) / 60_000).toFixed(2));
      const bought = command('buyShip', {typeId:'clipper'}, now);
      routes.push({shipId:bought.shipIds[0],from:'mineral_belt',to:'nebula_forge',goodId:'minerals',
        budget:expansion.newTaskBudget,taskId:null,dispatches:0});
      Object.assign(mineral, {from:'nebula_forge',to:'sol_prime',goodId:'technology',budget:expansion.updatedTaskBudget});
      expanded = true;
      exploration.expandedMinutes = Number((second / 60).toFixed(2));
    }
  }
  // 每秒检查一次：仅在供需和完整货本能盈利时，用空闲原船重新创建已结束商路。
  dispatchAvailableRoutes(now);
  // 对照路线先支付当级研发费用；维持同样的三船经营，单独比较现金取舍。
  const pendingTech = withResearch && MERCHANT_TECHS.find(tech =>
    tech.companyLevel <= state.merchant.companyLevel && !state.merchant.researchedTechIds.includes(tech.id));
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
  if (!awaitingResearch && company.upgradeCost !== null && (company.level === 1 || expanded)
    && state.credits >= company.upgradeCost + spendingReserve()) {
    command('upgradeCompany', {}, now);
    stages.push({
      level:state.merchant.companyLevel,
      upgradeCost:company.upgradeCost,
      minutes:Number((second/60).toFixed(2)),
      stageMinutes:Number(((second - lastUpgradeAt)/60).toFixed(2)),
      cash:state.credits,
    });
    lastUpgradeAt = second;
  }
  if (state.merchant.companyLevel === 6) break;
}
if (!Merchant.isValidMerchantState(state.merchant)) throw new Error('模拟结束时经营账本或船只占用状态无效。');
const completed = state.merchant.companyLevel === 6;
console.log(JSON.stringify({
  strategy:withResearch ? '主动补派策略：双港双船起步，二级等待信号、停用原船贸易并返港探索，完成后投资三港三船；每秒检查供需，盈利时用空闲原船补派并保留货本；每级先研发当级科技，不采购进阶船、不计额外奖励'
    : '主动补派策略：双港双船起步，二级等待信号、停用原船贸易并返港探索，完成后投资三港三船；每秒检查供需，盈利时用空闲原船补派并保留货本；不研发或采购进阶船、不计额外奖励',
  completed,
  horizonMinutes:horizonSeconds/60,
  simulatedMinutes:Number((elapsedSeconds/60).toFixed(2)),
  stages,
  exploration,
  research,
  routes:routes.map(({shipId,from,to,goodId,budget,dispatches}) => ({shipId,from,to,goodId,budget,dispatches})),
},null,2));
if (!completed) process.exitCode = 1;
