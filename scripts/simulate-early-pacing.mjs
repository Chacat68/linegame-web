import { writeFileSync } from 'node:fs';
import { createInitialState } from '../js/data/constants.js';
import { MERCHANT_EXPLORATION_RULES, MERCHANT_TECHS } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { buildMerchantEarlyProgress } from '../js/ui/MerchantEarlyProgress.js';

// 从真实新局跟随界面建议，验证首航、第二商路、升级及首次开港，不读写玩家存档。
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--write')) throw new Error('仅支持 --write 参数。');
const start = 1_800_000_000_000;
const state = createInitialState();
Merchant.init(state, start);
state.merchant.exploration.rngState = 42;
const timeline = [];
const spent = { ship: 0, company: 0, research: 0, exploration: 0 };
const command = (action, input = {}) => {
  const result = Merchant.command(state, action, input, state.merchant.lastTickAt);
  if (!result.ok) throw new Error(`${action}：${result.msg}`);
  return result;
};
const record = milestone => timeline.push({ milestone, seconds: (state.merchant.lastTickAt - start) / 1000,
  cash: state.credits, level: state.merchant.companyLevel, ships: state.merchant.ships.length, tasks: state.merchant.tasks.length });
const dispatch = route => {
  const offer = route.opportunity;
  const cash = state.credits;
  const shipIds = offer.purchaseCost ? command('buyShip', { typeId: offer.typeId }).shipIds : [offer.shipId];
  spent.ship += cash - state.credits;
  return command('create', { ...route, shipIds, budget: offer.budget });
};
command('onboarding', { action: 'skip' });
dispatch(buildMerchantEarlyProgress(state).route);
record('首航出发');
let firstSettled = false, secondOpened = false, opened = false, exploring = false;
for (let second = 1; second <= 24 * 60 * 60; second++) {
  Merchant.advance(state, start + second * 1000);
  if (!firstSettled && state.merchant.tasks[0]?.rounds) {
    record('首笔净利到账');
    firstSettled = true;
  }
  if (!opened && state.merchant.unlockedPorts.includes(MERCHANT_EXPLORATION_RULES.targetPortId)) {
    opened = true; record('探索返港，新港开放');
  }
  const next = buildMerchantEarlyProgress(state);
  if (next?.research && state.credits >= next.target) {
    command('researchTech', { techId: next.techId });
    spent.research += MERCHANT_TECHS.find(tech => tech.id === next.techId).cost;
    record(`${MERCHANT_TECHS.find(tech => tech.id === next.techId).name}研发完成`);
  }
  if (!secondOpened && buildMerchantEarlyProgress(state)?.stage === 'second-route') {
    dispatch(buildMerchantEarlyProgress(state).route);
    secondOpened = true; record('第二条商路出发');
  }
  if (!opened && buildMerchantEarlyProgress(state)?.readyToUpgrade) {
    const cash = state.credits;
    const company = Merchant.getCompanyProgress(state.merchant);
    command(company.action);
    spent.company += cash - state.credits;
    record(`${company.isBreakthrough ? '突破' : '升级'}至 Lv.${state.merchant.companyLevel}`);
  }
  const event = state.merchant.exploration.event;
  let free = state.merchant.ships.find(ship => !ship.taskId && ship.phase === 'idle');
  if (event?.status === 'available' && !free && Merchant.getCompanyProgress(state.merchant).remaining) {
    const purchase = Merchant.getShipPurchaseQuote(state.merchant, 'courier');
    if (state.credits >= purchase.total + MERCHANT_EXPLORATION_RULES.cost + Merchant.getOperatingReserve(state)) {
      command('buyShip', { typeId: 'courier' }); spent.ship += purchase.total;
      record('添购空闲探索船，原商路继续经营');
      free = state.merchant.ships.find(ship => !ship.taskId && ship.phase === 'idle');
    }
  }
  if (event?.status === 'available' && !exploring && free) {
    const cash = state.credits;
    command('explore', { eventId: event.id, shipId: free.id, from: 'sol_prime' });
    spent.exploration += cash - state.credits;
    exploring = true; record('首次探索出发');
  }
  if (state.merchant.unlockedPorts.includes(MERCHANT_EXPLORATION_RULES.targetPortId)) {
    const route = buildMerchantEarlyProgress(state)?.route;
    if (!secondOpened && route) { dispatch(route); secondOpened = true; record('第二条商路出发'); }
    break;
  }
}
const result = { strategy: '新局单船首航并积累升级费用；Lv.2 依次付费研发船位规划与新港勘察，备齐购船款和探索费用后添购空闲轻舟，原贸易持续经营。新船完成去程、4分钟现场勘察及返程后开放工业星，并以返港船开启第二条商路。每秒查看，不赠资源、不改航速。',
  completed: state.merchant.unlockedPorts.includes('nebula_forge'), timeline,
  netProfit: state.merchant.analytics.routes.reduce((sum, route) => sum + route.profit, 0),
  spent,
  operatingCapital: state.merchant.tasks.reduce((sum, task) => sum + task.budget, 0) };
if (!result.completed || !Merchant.isValidMerchantState(state.merchant)) throw new Error('前期节奏未完成或账本无效。');
const json = JSON.stringify(result, null, 2) + '\n';
if (args.includes('--write')) writeFileSync(new URL('../docs/2.1/科技树前期节奏.json', import.meta.url), json);
process.stdout.write(json);
