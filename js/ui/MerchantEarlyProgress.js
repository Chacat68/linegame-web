import { MERCHANT_EXPLORATION_RULES, MERCHANT_TECHS, MERCHANT_VIEW_LEVELS } from '../data/merchant.js';
import { getOnboardingProgress } from '../systems/merchant/MerchantOnboarding.js';
import * as Merchant from '../systems/merchant/MerchantSystem.js';
import { getPendingTechChain } from '../systems/merchant/MerchantTechnology.js';

const money = value => Math.floor(value).toLocaleString('zh-CN');
const keyOf = route => `${route.from}:${route.to}:${route.goodId}`;

// 目标从真实任务和资产推导，跳过引导与读档都不另建一套成长进度。
export function buildMerchantEarlyProgress(state) {
  const merchant = state.merchant;
  const company = Merchant.getCompanyProgress(merchant);
  const firstPortOpen = merchant.unlockedPorts.includes(MERCHANT_EXPLORATION_RULES.targetPortId);
  // 研发完成后由同一张探索通讯卡承接添船、派船和进度；开港后继续衔接初期经营。
  if (firstPortOpen ? company.level >= MERCHANT_VIEW_LEVELS.market : merchant.researchedTechIds.includes(MERCHANT_EXPLORATION_RULES.techId)) return null;
  const tasks = merchant.tasks.filter(task => !task.stopping);
  const running = new Set(tasks.map(keyOf));
  const progress = getOnboardingProgress(merchant);
  const settled = progress.settledTrips > 0;
  if (tasks.length && !settled) {
    if (!progress.hasRealTrade && !progress.nextReturnAt) return { stage: 'first-wait', title: '等待首航出发',
      text: '首航任务已登记，暂在港口等待。查看任务中的原因；供需恢复后会自动出发，货本不足时可调整派遣，无需重复建立任务。',
      route: null, taskId: tasks[0].id, label: '查看等待原因' };
    return { stage: 'first-return', title: '先看第一趟的收益', text: '商队自动完成去程和返程，净利润在返港时到账。首趟之后，再决定是否增加运力。', route: null,
      returnAt: progress.nextReturnAt, taskId: tasks[0].id, label: '查看首航进度' };
  }
  if (merchant.tasks.length && !tasks.length) {
    return { stage: 'returning', title: '先等商队返港', text: '在途航次完整结算后，船只和货本会释放。返港后可以重新派遣，也可以安排另一条商路。', route: null,
      returnAt: progress.nextReturnAt, taskId: merchant.tasks[0].id, label: '查看返港进度' };
  }
  const reserve = Merchant.getOperatingReserve(state);
  const surveyTech = MERCHANT_TECHS.find(tech => tech.id === MERCHANT_EXPLORATION_RULES.techId);
  const surveyChain = getPendingTechChain(merchant, surveyTech.id);
  const surveyResearchCost = surveyChain.reduce((sum, tech) => sum + tech.cost, 0);
  const capacityTech = MERCHANT_TECHS.find(tech => tech.shipSlotBonus && tech.companyLevel <= company.level
    && !merchant.researchedTechIds.includes(tech.id));
  const needsExplorerBerth = !firstPortOpen && company.level >= MERCHANT_EXPLORATION_RULES.companyLevel && !company.remaining
    && !merchant.ships.some(ship => !ship.taskId && ship.phase === 'idle');
  if (capacityTech && (needsExplorerBerth || firstPortOpen && tasks.length && running.size < 2 && !company.remaining)) {
    const chain = getPendingTechChain(merchant, capacityTech.id);
    const researchCost = chain.reduce((sum, tech) => sum + tech.cost, 0);
    return { stage: 'fleet-research', title: needsExplorerBerth ? '为探索船增加船位' : '为第二条商路增加船位',
      text: `当前船位已满。${chain.length > 1 ? `先研发${chain.slice(0, -1).map(tech => tech.name).join('、')}，再完成` : '研发'}${capacityTech.name}，尚需 ${money(researchCost)} CR；完成后增加 ${capacityTech.shipSlotBonus} 个船位。${needsExplorerBerth ? '原船继续经营，再添购一艘空闲轻舟用于探索。' : '新飞船和周转货本另行投入。'}`,
      route: null, target: researchCost + reserve, cash: state.credits, techId: chain[0].id,
      research: true, label: '研发船队扩容' };
  }
  if (!firstPortOpen && company.level >= MERCHANT_EXPLORATION_RULES.companyLevel) {
    const target = surveyChain[0].cost + reserve;
    const nextTech = surveyChain[0];
    return { stage: 'research', title: nextTech.id === surveyTech.id ? '研发新港勘察' : `先研发${nextTech.name}`,
      text: `${nextTech.name}研发需 ${money(nextTech.cost)} CR。${surveyChain.length > 1 ? `首次勘察的研发链尚需 ${money(surveyResearchCost)} CR，须依次完成${surveyChain.map(tech => tech.name).join('、')}。` : ''}派船探索另需 ${money(MERCHANT_EXPLORATION_RULES.cost)} CR；去程飞行后现场勘察4分钟，再飞回出发港，完整返港后开放商路。`,
      route: null, target, cash: state.credits, label: '前往科技研发', research: true, techId: nextTech.id };
  }
  const target = company.upgradeCost + reserve;
  const readyToUpgrade = state.credits >= target;
  if (tasks.length && (running.size >= 2 || !company.remaining && !merchant.ships.some(ship => !ship.taskId && ship.phase === 'idle'))) {
    const shortfall = Math.max(0, target - state.credits);
    const investment = `${company.isBreakthrough ? '突破' : '升级'}至 Lv.${company.nextLevel} 需 ${money(company.upgradeCost)} CR${company.isBreakthrough ? `（升至 Lv.${company.level} 的费用 × ${company.breakthroughFactor}）` : ''}${company.nextDescription ? `，${company.nextDescription}` : ''}。`;
    const funds = shortfall ? `还差 ${money(shortfall)} CR，让现有商路继续积累。` : `本次投入已备齐，可以${company.isBreakthrough ? '突破' : '升级'}。`;
    return { stage: company.isBreakthrough ? 'breakthrough' : 'growth', title: company.isBreakthrough ? '准备公司突破' : '准备公司升级',
      text: `${investment}${funds}`, route: null, target, cash: state.credits, readyToUpgrade,
      label: readyToUpgrade ? `${company.isBreakthrough ? '突破' : '升级'}至 Lv.${company.nextLevel}` : '查看经营收益' };
  }
  const routes = Merchant.listRouteOpportunities(state).filter(route => !running.has(keyOf(route)));
  const route = routes.find(item => item.opportunity);
  if (!route) {
    return { stage: 'wait', title: '等下一次经营机会', text: '当前供需、船位或可用 CR 尚不足以安排新商路。运行中的商路会在市场恢复后自动续跑。', route: null };
  }
  const offer = route.opportunity;
  const type = Merchant.getShipType(offer.typeId);
  const line = `${Merchant.getPort(route.from).name} → ${Merchant.getPort(route.to).name}`;
  const purchase = offer.purchaseCost ? `添购${type.name} ${money(offer.purchaseCost)} CR，` : `使用空闲${type.name}，`;
  const expansion = tasks.length > 0;
  const fullBudget = Merchant.fullLoadBudget(offer.typeId, route.from, route.to, route.goodId, merchant);
  if (expansion && offer.purchaseCost && state.credits < offer.purchaseCost + fullBudget) {
    return { stage: 'wait', title: '备齐第二条商路的投入',
      text: `添购${type.name}需 ${money(offer.purchaseCost)} CR，满载周转货本另需 ${money(fullBudget)} CR。让现有商路继续积累，备齐后再添船。`,
      route: null, target: offer.purchaseCost + fullBudget, cash: state.credits, label: '查看经营收益' };
  }
  return { stage: expansion ? 'second-route' : 'first-route',
    title: expansion ? '再开一条商路' : settled ? '让商路重新跑起来' : '先让一条商路跑起来',
    text: `${line}：${purchase}货本 ${money(offer.budget)} CR；当前每趟预计净赚 ${money(offer.profit)} CR。${expansion ? '两条商路一起积累，再准备下一次升级。' : '货本只划拨一次，返港后会继续周转。'}`,
    route, label: offer.purchaseCost ? '添船并安排商路' : '安排这条商路' };
}

export function getMerchantBudgetRecommendation(state, plan) {
  const merchant = state.merchant;
  if (!Merchant.isPortOpen(merchant, plan.from) || !Merchant.isPortOpen(merchant, plan.to) || !plan.shipIds?.length) return null;
  const ids = new Set(plan.shipIds);
  if (ids.size !== plan.shipIds.length) return null;
  const ships = plan.shipIds.map(id => merchant.ships.find(ship => ship.id === id));
  if (ships.some(ship => !ship || ship.taskId && ship.taskId !== plan.taskId)) return null;
  const budgets = ships.map(ship => Merchant.fullLoadBudget(ship.typeId, plan.from, plan.to, plan.goodId, merchant));
  if (budgets.some(budget => !budget)) return null;
  const budget = budgets.reduce((sum, value) => sum + value, 0);
  const existing = merchant.tasks.find(task => task.id === plan.taskId);
  const available = state.credits + (existing?.budget || 0);
  return { budget, affordable: budget <= available,
    durationMs: Math.max(...ships.map(ship => 2 * Merchant.legDuration(ship.typeId, plan.from, plan.to, merchant))) };
}
