import { MERCHANT_RULES, MERCHANT_GOODS, MERCHANT_PORTS, MERCHANT_SHIPS, MERCHANT_TECHS, MERCHANT_TECH_CATEGORIES, MERCHANT_COMPANY_LEVELS, MERCHANT_EXPLORATION_RULES, isMerchantViewUnlocked } from '../data/merchant.js';
import * as Merchant from '../systems/merchant/MerchantSystem.js';
import { renderMerchantHeader } from './MerchantHeaderPresenter.js';
import { createMerchantStarmapController } from './MerchantStarmapController.js';
import { createMerchantOnboardingPresenter } from './MerchantOnboardingPresenter.js';
import { buildMerchantRouteReports } from './MerchantReportProjection.js';
import { applyMerchantTheme } from './MerchantTheme.js';
import { createMerchantOperationsPresenter } from './MerchantOperationsPresenter.js';
import { createMerchantPortPanel } from './MerchantPortPanel.js';
import { createMerchantIntelligencePresenter } from './MerchantIntelligencePresenter.js';
import { getPlanetIntelligence } from '../systems/merchant/MerchantIntelligence.js';
import { getMerchantAnalytics } from '../systems/merchant/MerchantAnalytics.js';
import { buildMerchantEarlyProgress, getMerchantBudgetRecommendation } from './MerchantEarlyProgress.js';
import { createMerchantTechTreePresenter, merchantTechTreeShell } from './MerchantTechTreePresenter.js';
import shuttleArt from '../../assets/scene/ships/shuttle.webp';
import clipperArt from '../../assets/scene/ships/clipper.webp';
import freighterArt from '../../assets/scene/ships/freighter.webp';
import galleonArt from '../../assets/scene/ships/galleon.webp';
import solArt from '../../assets/scene/ports/sol.webp';
import miningArt from '../../assets/scene/ports/mining.webp';
import industrialArt from '../../assets/scene/ports/industrial.webp';

const portArt = { sol_prime: solArt, mineral_belt: miningArt, nebula_forge: industrialArt, aurora_depot: miningArt };
const shipArt = { shuttle: shuttleArt, clipper: clipperArt, freighter: freighterArt, galleon: galleonArt };
const shipImage = typeId => shipArt[Merchant.getShipType(typeId)?.sceneType] || shuttleArt;

const money = value => Math.floor(value || 0).toLocaleString('zh-CN');
const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const portName = id => Merchant.getPort(id)?.name || id;
const goodName = id => Merchant.getGood(id)?.name || id;
const phaseName = phase => ({ idle: '待命', waiting: '港口等待', outbound: '载货去程', return: '空载返程', exploring: '探索中', explore_return: '探索返港' })[phase] || phase;

let root = null;
let getState = null;
let execute = null;
let navigate = null;
let clickListener = null;
let submitListener = null;
let changeListener = null;
let starmap = null;
let onboarding = null;
let operations = null;
let techTree = null;
let ports = null;
let intelligence = null;
let formTaskId = null;
let reportWindow = 15;
let investmentRouteKey = '';
let researchCategory = 'all';
let selectedTaskId = null;
let taskDetailsOpen = true;
let taskMarkup = null;
let feedback = '';
let feedbackUntil = 0;
let reportMarkup = null;
const reportFragments = new WeakMap();
const progressFragments = new WeakMap();
const expandedReportRoutes = new Set();
const purchaseQuantities = Object.fromEntries(MERCHANT_SHIPS.map(type => [type.id, 1]));

const screens = [
  ['merchant-task-workspace', 'tasks', '经营任务'],
  ['merchant-market-workspace', 'market', '商路市场'],
  ['merchant-ship-workspace', 'ships', '商队船只'],
  ['merchant-report-workspace', 'reports', '经营报告'],
];

function shell(title, body, art = solArt) {
  return `<div class="merchant-page merchant-page--station"><div class="merchant-station-heading"><h1 tabindex="-1" data-workspace-initial-focus>${title}</h1><img src="${art}" alt="" aria-hidden="true"></div>${body}</div>`;
}

export function init(options) {
  dispose();
  getState = options.getState;
  execute = options.execute;
  navigate = options.navigate;
  root = document.getElementById('game-main');
  if (!root) return;
  document.body.dataset.gameplay = 'merchant';
  document.body.dataset.merchant = 'true';
  const html = {
    tasks: `<div class="merchant-page merchant-page--command">
      <header class="merchant-command-heading"><h1 tabindex="-1" data-workspace-initial-focus>商队指挥台</h1><div class="merchant-command-heading-actions"><span class="merchant-live-tag"><i></i> 航运网络在线</span></div></header>
      <div id="merchant-onboarding-host"></div>
      <section id="merchant-early-progress" class="merchant-onboarding-hint" aria-label="下一步经营" hidden></section>
      <section id="merchant-discovery-notice" class="merchant-discovery-notice" aria-label="探索与新港动态" hidden></section>
      <section id="merchant-company-growth" class="merchant-company-growth" aria-label="公司等级与船位"></section>
      <p id="merchant-catchup" class="merchant-catchup" role="status" hidden></p><div id="merchant-feedback" class="merchant-feedback" aria-live="polite"></div>
      <section id="merchant-dispatch" class="merchant-dispatch" aria-label="经营调度">
      <div class="merchant-operations-head"><h2>经营调度</h2><button type="button" class="merchant-primary" data-merchant-action="new">＋ 新派遣</button></div>
      <div class="merchant-dispatch-tabs" role="tablist" aria-label="调度内容">
        <button type="button" id="merchant-dispatch-tab-tasks" role="tab" data-operation="tab" data-tab="tasks" aria-selected="true" aria-controls="merchant-dispatch-tasks">航运任务 <span id="merchant-task-count"></span></button>
        <button type="button" id="merchant-dispatch-tab-research" role="tab" data-operation="tab" data-tab="research" aria-selected="false" aria-controls="merchant-research" tabindex="-1">科技研发 <span id="merchant-research-count"></span></button>
      </div>
      <div id="merchant-dispatch-tasks" role="tabpanel" aria-labelledby="merchant-dispatch-tab-tasks">
      <section class="merchant-command-stage" aria-label="探索航行状态" hidden>
        <div class="merchant-stage-flight" aria-hidden="true"><div class="merchant-stage-streams"><i></i><i></i><i></i><i></i><i></i><i></i></div><img class="merchant-stage-ship" src="${shuttleArt}" alt=""></div>
        <div class="merchant-stage-telemetry"><small>探索航线</small><span id="merchant-stage-route-name" class="merchant-stage-route-name"></span><strong id="merchant-stage-status"></strong><span id="merchant-stage-subline"></span><div class="merchant-stage-progress"><i id="merchant-stage-progress"></i></div></div>
      </section>
      <section class="merchant-operations" aria-label="经营派遣任务"><div id="merchant-task-list" class="merchant-task-list"></div></section></div>
      <section id="merchant-research" class="merchant-research-panel" role="tabpanel" aria-labelledby="merchant-dispatch-tab-research" hidden><div class="merchant-section-head"><h2 tabindex="-1">科技研发</h2><span id="merchant-research-progress"></span></div><p class="merchant-research-note">满足公司等级和全部前置后可研发；金色为核心科技。研发、购船各自付费。</p><div id="merchant-research-bonuses" class="merchant-research-bonuses"></div><div id="merchant-tech-categories" class="merchant-research-filters" role="group" aria-label="科技类型">${techCategoryControls()}</div><p id="merchant-tech-filter-status" class="merchant-research-filter-status" role="status" aria-live="polite"></p>${merchantTechTreeShell()}</section>
      <section id="merchant-form-panel" class="merchant-form-panel" hidden></section></section></div>`,
    market: shell('商路情报', `
      <section id="merchant-intelligence" class="merchant-intelligence" aria-labelledby="merchant-intelligence-title"><div class="merchant-section-head"><h2 id="merchant-intelligence-title">情报交易</h2><span id="merchant-intelligence-count"></span></div><p class="merchant-intelligence-note">花费 CR 获取新星球情报，购买后永久保留。情报费与探索费分开支付，完成探索并返港后才开放商路。</p><div id="merchant-intelligence-list" class="merchant-intelligence-grid"></div><p id="merchant-intelligence-status" role="status" aria-live="polite"></p></section>
      <div class="merchant-section-head"><h2>港口与供需</h2><span id="merchant-next-restock"></span></div><div id="merchant-market-list" class="merchant-market-grid"></div>
      <div class="merchant-section-head"><h2>商路列表</h2></div><div id="merchant-route-list" class="merchant-route-grid"></div>`),
    ships: shell('船坞', `
      <div class="merchant-section-head"><h2>已拥有的飞船</h2></div><div id="merchant-ship-list" class="merchant-ship-grid merchant-owned-grid"></div>
      <div class="merchant-section-head"><h2>购入运力</h2><span id="merchant-reserve-note"></span></div><div id="merchant-ship-shop" class="merchant-ship-grid"></div>
      <section id="merchant-investment-panel" class="merchant-investment-panel" aria-label="船型投资比较"><div class="merchant-section-head"><h2>船型与投入比较</h2></div><label>参考商路<select data-investment-route aria-label="投资比较参考商路"></select></label><p>同一市场快照的单航次预估；满载货本、研发和购船分别投入。</p><div id="merchant-investment-list" class="merchant-investment-grid"></div></section>
`, shuttleArt),
    reports: shell('航运账本', `
      <div id="merchant-report-onboarding-host"></div>
      <p id="merchant-report-summary-note"></p>
      <div class="merchant-section-head"><h2>线路盈利</h2></div><div id="merchant-report-list" class="merchant-report-list"></div>`, miningArt),
  };
  for (const [id, screen, label] of screens) {
    const container = document.getElementById(id);
    if (!container) continue;
    container.className = `workspace-surface merchant-workspace-base merchant-workspace${container.dataset.workspaceActive === 'true' ? ' is-active' : ''}`;
    container.dataset.merchantScreen = screen;
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', label);
    container.removeAttribute('aria-labelledby');
    container.removeAttribute('aria-describedby');
    container.innerHTML = html[screen];
  }
  clickListener = onClick;
  submitListener = onSubmit;
  changeListener = onChange;
  root.addEventListener('click', clickListener);
  root.addEventListener('submit', submitListener);
  root.addEventListener('input', changeListener);
  root.addEventListener('change', changeListener);
  ports = createMerchantPortPanel({ doc: document, map: document.getElementById('merchant-task-workspace'), getState, onRoute: openRoute, onOpen: () => closeForm() });
  starmap = createMerchantStarmapController({ onReturn: () => navigate?.('tasks'), getState, execute,
    onPort: openPort, onFleet: () => navigate?.('ships') });
  techTree = createMerchantTechTreePresenter({ getState, showAll: () => { researchCategory = 'all'; render(getState()); } });
  operations = createMerchantOperationsPresenter({ getState, execute: act, onResearchShown: () => techTree.enter(),
    openExploration: () => { navigate?.('starmap'); starmap.showExploration(); },
    openPort });
  intelligence = createMerchantIntelligencePresenter({ getState, buy: input => act('buyIntel', input),
    openExploration: () => { navigate?.('starmap'); starmap.showExploration(); }, openPort });
  onboarding = createMerchantOnboardingPresenter({ getState, execute, navigate, openDispatch: () => { navigate?.('tasks'); openForm(); } });
  render(getState());
}

function setHtml(id, content) {
  const element = document.getElementById(id);
  if (element && element.innerHTML !== content) element.innerHTML = content;
}

// 比较原始模板，避免浏览器规范化属性后，每个时钟更新都重建操作按钮。
function updateProgressFragment(id, content) {
  const node = document.getElementById(id);
  if (!node || progressFragments.get(node) === content) return;
  node.innerHTML = content;
  progressFragments.set(node, content);
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function shipLabel(ship) { return `${Merchant.getShipType(ship.typeId)?.name || ship.typeId} · ${ship.id.replace('ship-', '#')}`; }

function taskCard(task, merchant) {
  const ships = merchant.ships.filter(ship => ship.taskId === task.id);
  const status = Merchant.getTaskStatus(merchant, task).replace(/^运行中 ·.*$/, '运行中');
  const selected = task.id === selectedTaskId;
  const expanded = selected && taskDetailsOpen;
  const traveling = ships.filter(ship => ship.phase === 'outbound' || ship.phase === 'return').length;
  const detailsId = `merchant-task-details-${task.id}`;
  return `<article class="merchant-task-card${selected ? ' is-selected' : ''}" data-merchant-task="${escape(task.id)}"><button type="button" class="merchant-task-select" data-merchant-action="select-task" data-id="${escape(task.id)}" aria-pressed="${selected}" aria-expanded="${expanded}" aria-controls="${escape(detailsId)}">
    <span class="merchant-task-symbol" aria-hidden="true">${traveling ? '↗' : '◇'}</span><span class="merchant-task-main"><strong>${escape(portName(task.from))} <i>→</i> ${escape(portName(task.to))}</strong><small>${escape(goodName(task.goodId))} · ${ships.length} 艘船 · 已完成 ${task.rounds} 趟</small><em>${escape(status)}</em></span><span class="merchant-task-profit"><small>任务净利</small><strong>${task.profit >= 0 ? '+' : ''}${money(task.profit)} CR</strong></span><span class="merchant-task-chevron" aria-hidden="true">⌄</span></button>
    <div id="${escape(detailsId)}" class="merchant-task-body" ${expanded ? '' : 'hidden'}>${expanded ? taskDetail(task, ships) : ''}</div></article>`;
}

function taskDetail(task, ships) {
  const recent = task.recent[0];
  const notice = task.stopReason ? `解除原因：${escape(task.stopReason)}` : task.stopping ? '返港后归还货本并释放飞船。' : task.pending ? '相关飞船返港后应用新的派遣配置。' : '';
  return `${notice ? `<p class="merchant-task-notice merchant-wait-note">${notice}</p>` : ''}<div class="merchant-task-body-grid">
    <section class="merchant-task-ships" aria-label="船只进度"><h3>船只进度</h3>${ships.map(ship => {
      const traveling = ship.phase === 'outbound' || ship.phase === 'return';
      return `<div class="merchant-task-ship" data-task-ship="${escape(ship.id)}"><img src="${shipImage(ship.typeId)}" alt="" aria-hidden="true"><div class="merchant-task-ship-info"><div class="merchant-task-ship-heading"><strong>${escape(shipLabel(ship))}</strong><span>${escape(task.stopping && ship.phase === 'waiting' ? '港口停靠' : phaseName(ship.phase))}</span></div><div class="merchant-task-flight" ${traveling ? '' : 'hidden'}><div class="merchant-task-progress" role="progressbar" aria-label="${escape(shipLabel(ship))} · ${escape(phaseName(ship.phase))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i data-trip-progress></i></div><small data-trip-eta></small></div>${ship.waitReason && !task.stopping ? `<p class="merchant-wait-note">${escape(ship.waitReason)}</p>` : ''}<small data-market-retry hidden></small></div></div>`;
    }).join('')}</section>
    <div class="merchant-task-finance"><dl class="merchant-task-capital"><div><dt>任务货本</dt><dd>${money(task.budget)} <small>CR</small></dd></div><div><dt>待用货本</dt><dd>${money(task.available)} <small>CR</small></dd></div></dl>
    ${recent ? `<div class="merchant-detail-last"><small>最近结算 · ${new Date(recent.completedAt).toLocaleTimeString('zh-CN')}</small><strong>${recent.profit >= 0 ? '+' : ''}${money(recent.profit)} CR</strong><span>${recent.quantity} 单位 · 往返费用 ${money(recent.fee)} CR</span></div>` : '<p class="merchant-detail-hint">首趟尚未结算</p>'}
    <div class="merchant-detail-actions"><button type="button" data-merchant-action="edit" data-button-state="${task.pending || task.stopping ? 'pending' : 'ready'}" data-id="${escape(task.id)}" ${task.pending || task.stopping ? 'disabled' : ''}>调整派遣</button><button type="button" data-merchant-action="stop" data-button-state="${task.stopping ? 'pending' : 'danger'}" data-id="${escape(task.id)}" ${task.stopping ? 'disabled' : ''}>${task.stopping ? '返港后结束' : '结束任务'}</button></div></div></div>`;
}

function renderTasks(merchant, readyCount) {
  const list = document.getElementById('merchant-task-list');
  if (!list) return;
  const markup = merchant.tasks.length ? merchant.tasks.map(task => taskCard(task, merchant)).join('') : emptyTasks(merchant, readyCount);
  // 倒计时只更新进度节点，任务变更时保留操作焦点和页面位置。
  if (markup !== taskMarkup) {
    const focused = list.contains(document.activeElement) ? document.activeElement.closest?.('[data-merchant-action]') : null;
    const focusedAction = focused?.dataset.merchantAction, focusedId = focused?.dataset.id;
    const workspace = list.closest('.workspace-surface'), scrollTop = workspace?.scrollTop;
    list.innerHTML = markup;
    taskMarkup = markup;
    if (focusedAction) {
      const controls = Array.from(list.querySelectorAll('[data-merchant-action]'));
      const same = controls.find(button => button.dataset.merchantAction === focusedAction && button.dataset.id === focusedId && !button.disabled);
      const fallback = controls.find(button => button.dataset.merchantAction === 'select-task' && button.dataset.id === focusedId) || controls[0] || document.getElementById('merchant-dispatch-tab-tasks');
      (same || fallback)?.focus({ preventScroll: true });
    }
    if (workspace) workspace.scrollTop = scrollTop;
  }
  for (const row of list.querySelectorAll('[data-task-ship]')) {
    const ship = merchant.ships.find(item => item.id === row.dataset.taskShip);
    const retry = row.querySelector('[data-market-retry]');
    if (retry && ship) {
      const task = merchant.tasks.find(item => item.id === ship.taskId);
      retry.hidden = ship.phase !== 'waiting' || task?.stopping || Boolean(task?.pending) || !ship.waitReason?.includes('自动续跑');
      if (!retry.hidden) retry.textContent = `下次供需刷新：${formatDuration(Math.max(0, merchant.nextRestockAt - merchant.lastTickAt))}`;
    }
    if (!ship || !['outbound', 'return'].includes(ship.phase)) continue;
    const progress = Math.floor(Math.max(0, Math.min(1, (Date.now() - ship.departAt) / Math.max(1, ship.arriveAt - ship.departAt))) * 100);
    row.querySelector('[data-trip-progress]').style.width = `${progress}%`;
    row.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(progress));
    row.querySelector('[data-trip-eta]').textContent = `约 ${formatDuration(ship.arriveAt - Date.now())}${ship.phase === 'return' ? '返港' : '抵达'}`;
  }
}

function emptyTasks(merchant) {
  const experienced = merchant.history.length || merchant.analytics.routes.some(route => route.trips);
  const free = merchant.ships.some(ship => !ship.taskId);
  const title = experienced || !free ? '暂无运行任务' : '等待第一条商路';
  const text = free ? '从上方「新派遣」选择商路，安排空闲运力。' : '现有飞船正在探索，返港后可安排商路。';
  return `<div class="merchant-empty merchant-empty--command"><strong>${title}</strong><p>${text}</p></div>`;
}

function marketCard(port, state) {
  const merchant = state.merchant;
  if (!Merchant.isPortOpen(merchant, port.id)) return '';
  const market = merchant.markets[port.id];
  const known = entries => entries.filter(([good]) => Merchant.isMerchantGoodKnown(merchant, good));
  const lines = [...known(Object.entries(port.supply)).map(([good, max]) => `供给 ${goodName(good)} <strong>${market.supply[good]}/${max}</strong>`), ...known(Object.entries(port.demand)).map(([good, max]) => `需求 ${goodName(good)} <strong>${market.demand[good]}/${max}</strong>`)];
  return `<article class="merchant-port-card"><img class="merchant-port-art" src="${portArt[port.id] || solArt}" alt="" aria-hidden="true"><small>${escape(port.role)} / 已开放</small><h3>${escape(port.name)}</h3><div>${lines.map(line => `<p>${line}</p>`).join('')}</div></article>`;
}

function routeCards(state) {
  const merchant = state.merchant;
  const cards = Merchant.listRouteOpportunities(state).map(route => {
    const from = Merchant.getPort(route.from);
    const to = Merchant.getPort(route.to);
    const good = Merchant.getGood(route.goodId);
    const opportunity = route.opportunity;
    const unit = to.sell[good.id] - from.buy[good.id];
    const shipName = opportunity ? Merchant.getShipType(opportunity.typeId).name : '';
    const status = opportunity
      ? `<p>${opportunity.purchaseCost ? `需添购${escape(shipName)}；` : `${escape(shipName)}可出发；`}预计 ${opportunity.quantity} 单位，净利 +${money(opportunity.profit)} CR。</p>`
      : '';
    return `<article class="merchant-route-card${opportunity ? '' : ' is-unavailable'}" data-merchant-route-available="${Boolean(opportunity)}"><div><div class="merchant-route-card-head"><small>${escape(good.name)} / 每单位差价 ${unit} CR</small>${opportunity ? '' : '<span class="merchant-route-unavailable">暂时无法完成</span>'}</div><h3>${escape(from.name)} → ${escape(to.name)}</h3><p>买入 ${from.buy[good.id]} CR · 卖出 ${to.sell[good.id]} CR；可用供应 ${merchant.markets[from.id].supply[good.id]} / 需求 ${merchant.markets[to.id].demand[good.id]}。</p>${status}</div><button type="button" data-merchant-action="route" data-from="${from.id}" data-to="${to.id}" data-good="${good.id}">${opportunity?.purchaseCost ? '添购并安排' : opportunity ? '安排此商路' : '查看派遣条件'} ↗</button></article>`;
  });
  return cards.join('') || '<p class="merchant-empty">暂时没有商路。</p>';
}

function shipCard(ship, merchant) {
  const task = merchant.tasks.find(item => item.id === ship.taskId);
  const event = merchant.exploration?.event;
  const assignment = task ? `${portName(task.from)} → ${portName(task.to)} · ${phaseName(ship.phase)}`
    : event?.id === ship.taskId ? `${portName(event.from)} → 未知信号 · ${phaseName(ship.phase)}` : '空闲';
  return `<div class="merchant-owned-ship"><span>${escape(ship.id)} · ${escape(assignment)}${ship.waitReason ? ` · ${escape(ship.waitReason)}` : ''}</span>${ship.taskId ? '' : '<button type="button" data-merchant-action="new">派遣 ↗</button>'}</div>`;
}

function companyGrowth(state) {
  const company = Merchant.getCompanyProgress(state.merchant);
  const reserve = Merchant.getOperatingReserve(state);
  const hint = company.upgradeCost === null ? '' : state.credits < company.upgradeCost ? '可用 CR 不足'
    : state.credits - company.upgradeCost < reserve ? `需保留 ${money(reserve)} CR 首航货本` : '';
  const pathOpen = document.querySelector('.merchant-company-roadmap')?.open;
  const tierLevels = MERCHANT_COMPANY_LEVELS.filter(stage => stage.level >= company.tierStartLevel && stage.level <= company.tierEndLevel);
  const path = tierLevels.map(stage => {
    const benefits = [stage.unlock, stage.description].filter(Boolean).map(escape).join('<br>');
    const current = stage.level === company.level;
    const complete = stage.level < company.level;
    const status = current ? '当前' : complete ? '已达成' : '未达成';
    return `<li data-company-level="${stage.level}" class="${current ? 'is-current' : complete ? 'is-complete' : 'is-upcoming'}" ${current ? 'aria-current="step"' : ''}>
      <div class="merchant-company-roadmap-head"><strong class="merchant-company-roadmap-level">Lv.${stage.level}</strong><span class="merchant-company-roadmap-status">${status}</span></div>
      <div class="merchant-company-roadmap-effects"><span>基础 ${stage.shipLimit} 艘${stage.researchShipSlots ? `<br>全部扩容后 ${stage.shipLimit + stage.researchShipSlots} 艘` : ''}</span>${benefits ? `<span>${benefits}</span>` : ''}${stage.isBreakthrough ? '<span class="merchant-company-roadmap-gate">突破关卡</span>' : ''}</div>
      ${stage.level > company.level ? `<div class="merchant-company-roadmap-cost"><span>升至此级</span><strong>${money(MERCHANT_COMPANY_LEVELS[stage.level - 2].upgradeCost)} CR</strong></div>` : ''}
    </li>`;
  }).join('');
  const nextStage = MERCHANT_COMPANY_LEVELS.find(stage => stage.level === company.level + 1);
  const capacityIncrease = nextStage ? nextStage.shipLimit - company.baseShipLimit : 0;
  const remainingResearchSlots = MERCHANT_COMPANY_LEVELS[company.level - 1].researchShipSlots - company.researchShipSlots;
  const nextDetails = nextStage?.description || (nextStage?.isBreakthrough ? `达到 Lv.${nextStage.level} 后可突破至 Lv.${nextStage.level + 1}` : '');
  const goal = nextStage && nextDetails
    ? `<div class="merchant-company-goal"><small>${company.isBreakthrough ? '突破下一阶' : '下一级'} · Lv.${nextStage.level}${nextStage.isBreakthrough ? ' · 突破关卡' : ''}</small><strong>${capacityIncrease ? `${company.nextShipLimit} 艘船位` : escape(nextStage.unlock || '突破关卡')}</strong><span>${escape(nextDetails)}</span></div>`
    : !nextStage && remainingResearchSlots ? `<div class="merchant-company-goal"><small>船队扩容</small><strong>仍可增加 ${remainingResearchSlots} 个船位</strong><span>完成扩容研发后生效</span></div>` : '';
  const companyAction = company.isBreakthrough ? 'breakthrough-company' : 'upgrade-company';
  const buttonLabel = company.upgradeCost === null ? '最高等级' : `${company.isBreakthrough ? '突破' : '升级'}公司至 Lv.${company.nextLevel}`;
  const breakthroughCost = company.isBreakthrough ? `<small class="merchant-company-breakthrough-cost">升至 Lv.${company.level} 的费用 ${money(company.breakthroughBaseCost)} CR × ${company.breakthroughFactor}</small>` : '';
  return `<div class="merchant-company-identity"><small>公司 · 第 ${company.tier} / 20 阶</small><button type="button" id="company-name-display" aria-label="修改公司名称" title="修改公司名称">${escape(state.companyName)} <span aria-hidden="true">✎</span></button><span class="merchant-company-level" tabindex="-1">Lv.${company.level}</span></div>
    <div class="merchant-company-capacity"><small>持有船只 / 总上限</small><strong>${company.ownedShips} <span>/ ${company.shipLimit} 艘</span></strong><small>基础 ${company.baseShipLimit} · 研发 +${company.researchShipSlots}</small><small>${company.ownedShips > company.shipLimit ? `超出上限 ${company.ownedShips - company.shipLimit} 艘 · 现有船只保留` : company.remaining ? `空余 ${company.remaining} 个船位` : '船位已满'}</small></div>
    ${goal}
    <div class="merchant-company-upgrade">${company.upgradeCost === null ? '' : `<small>Lv.${company.level} → Lv.${company.nextLevel} · ${company.isBreakthrough ? `第 ${company.tier} 阶突破` : '每次提升 1 级'}</small><strong class="merchant-company-cost">${money(company.upgradeCost)} <span>CR</span></strong>`}<button type="button" data-merchant-action="${companyAction}" data-from-level="${company.level}" data-target-level="${company.nextLevel ?? ''}" data-button-state="${company.upgradeCost === null ? 'complete' : hint ? 'blocked' : 'ready'}" ${company.upgradeCost === null || hint ? 'disabled' : ''}>${buttonLabel}</button>${breakthroughCost}${company.level < MERCHANT_EXPLORATION_RULES.companyLevel && nextDetails ? `<small class="merchant-company-next-unlock">${escape(nextDetails)}</small>` : ''}${hint ? `<small role="status">${hint}</small>` : ''}</div>
    <details class="merchant-company-roadmap" data-company-tier="${company.tier}" ${pathOpen ? 'open' : ''}><summary>公司发展路线 · 第 ${company.tier} 阶 · Lv.${company.tierStartLevel}–${company.tierEndLevel}</summary><ol>${path}</ol></details>`;
}

function renderEarlyProgress(state) {
  const node = document.getElementById('merchant-early-progress');
  const progress = state.merchant.onboarding.step === 5 && formTaskId === null ? buildMerchantEarlyProgress(state) : null;
  const focused = node.contains(document.activeElement);
  const focusedAction = focused ? document.activeElement?.dataset.merchantAction : null;
  node.hidden = !progress;
  if (!progress) {
    if (focused) document.querySelector('#merchant-task-workspace [data-workspace-initial-focus]')?.focus({ preventScroll: true });
    return;
  }
  node.dataset.stage = progress.stage;
  const action = progress.research ? 'early-research' : progress.route ? 'route' : progress.taskId ? 'early-task' : progress.readyToUpgrade ? Merchant.getCompanyProgress(state.merchant).isBreakthrough ? 'breakthrough-company' : 'upgrade-company' : 'early-reports';
  const upgrade = ['upgrade-company', 'breakthrough-company'].includes(action) ? `data-from-level="${state.merchant.companyLevel}" data-target-level="${state.merchant.companyLevel + 1}"` : '';
  const route = progress.route;
  updateProgressFragment(node.id, `<div class="merchant-onboarding-copy"><small>下一步经营</small><h2 tabindex="-1">${escape(progress.title)}</h2><p>${escape(progress.text)}</p>${progress.target ? `<div class="merchant-early-capital"><span>可用 ${money(progress.cash)} / ${money(progress.target)} CR</span><progress aria-label="下一次成长资金" max="${progress.target}" value="${Math.min(progress.cash, progress.target)}"></progress></div>` : ''}${progress.returnAt ? '<p data-early-return></p>' : ''}</div>${progress.label ? `<div class="merchant-onboarding-actions"><button type="button" data-merchant-action="${action}" ${upgrade} ${route ? `data-from="${route.from}" data-to="${route.to}" data-good="${route.goodId}"` : ''} ${progress.taskId ? `data-id="${escape(progress.taskId)}"` : ''} data-button-state="ready">${escape(progress.label)}</button></div>` : ''}`);
  const eta = node.querySelector('[data-early-return]');
  if (eta) eta.textContent = `约 ${formatDuration(progress.returnAt - state.merchant.lastTickAt)} 后返港结算`;
  if (focused && !node.contains(document.activeElement)) (Array.from(node.querySelectorAll('button')).find(button => button.dataset.merchantAction === focusedAction) || node.querySelector('h2'))?.focus({ preventScroll: true });
}

function ownedShipGroups(merchant) {
  return MERCHANT_SHIPS.map(base => {
    const type = Merchant.getShipStats(merchant, base.id);
    const ships = merchant.ships.filter(ship => ship.typeId === type.id);
    if (!ships.length) return '';
    const free = ships.filter(ship => !ship.taskId).length;
    return `<details class="merchant-ship-card merchant-owned-group" data-merchant-owned-type="${type.id}"><summary><img class="merchant-ship-art" src="${shipImage(type.id)}" alt="" aria-hidden="true"><span><small>拥有 ${ships.length} 艘 · 空闲 ${free} 艘</small><strong>${escape(type.name)}</strong><em>载量 ${type.capacity} · ${type.speed.toFixed(2)}× 航速</em></span></summary><div class="merchant-owned-list">${ships.map(ship => shipCard(ship, merchant)).join('')}</div></details>`;
  }).join('');
}

function procurementControls(type, merchant, inline = false) {
  const quantity = purchaseQuantities[type.id];
  const purchase = Merchant.getShipPurchaseQuote(merchant, type.id, quantity);
  return `<div class="merchant-procurement" data-merchant-procurement="${type.id}"><label>数量<input type="number" min="1" max="20" step="1" value="${quantity}" data-merchant-quantity="${type.id}" aria-label="${escape(type.name)}购船数量"></label><button type="button" data-merchant-action="${inline ? 'buy-in-form' : 'buy'}" data-type="${type.id}"><span data-merchant-buy-label>购入 ${quantity} 艘</span> · <span data-merchant-total>${purchase ? `${money(purchase.total)} CR` : '—'}</span></button><small data-merchant-buy-hint></small></div>`;
}

function availableShipTypes(merchant) {
  return MERCHANT_SHIPS.filter(type => Merchant.isShipTypeUnlocked(merchant, type.id)).map(type => Merchant.getShipStats(merchant, type.id));
}

function shipShopCard(type, merchant) {
  type = Merchant.getShipStats(merchant, type.id);
  const owned = merchant.ships.filter(ship => ship.typeId === type.id).length;
  const purchase = Merchant.getShipPurchaseQuote(merchant, type.id);
  return `<article class="merchant-ship-card merchant-shop-card" data-merchant-shop-type="${type.id}"><img class="merchant-ship-art" src="${shipImage(type.id)}" alt="" aria-hidden="true"><small>可购买 · 已有 ${owned} 艘</small><h3>${escape(type.name)}</h3><div class="merchant-ship-spec"><span>载量 ${type.capacity}</span><span>航速 ${type.speed.toFixed(2)}×</span><span>往返基础费 ${type.fee} CR</span><span>下一艘 ${purchase ? `${money(purchase.nextPrice)} CR` : '—'}</span></div>${procurementControls(type, merchant)}</article>`;
}

function inlineShipShop(type, merchant) {
  return `<div class="merchant-inline-ship-row"><span>${escape(type.name)} · 载量 ${type.capacity} · ${type.speed.toFixed(2)}×</span>${procurementControls(type, merchant, true)}</div>`;
}

function unresearchedTechs(merchant) {
  return MERCHANT_TECHS.filter(tech => !merchant.researchedTechIds.includes(tech.id));
}

function techCategoryControls() {
  return ['all', ...MERCHANT_TECH_CATEGORIES].map(category => {
    const count = MERCHANT_TECHS.filter(tech => category === 'all' || tech.category === category).length;
    return `<button type="button" data-merchant-action="filter-tech" data-category="${escape(category)}" aria-pressed="${category === researchCategory}" aria-controls="merchant-tech-list">${category === 'all' ? '全部' : escape(category)} <span aria-hidden="true">${count}</span></button>`;
  }).join('');
}

function renderResearch(state) {
  const merchant = state.merchant, bonuses = Merchant.getTechBonuses(merchant);
  const remaining = unresearchedTechs(merchant);
  const visible = MERCHANT_TECHS.filter(tech => researchCategory === 'all' || tech.category === researchCategory);
  const done = visible.filter(tech => merchant.researchedTechIds.includes(tech.id)).length;
  const ready = remaining.filter(tech => merchant.companyLevel >= tech.companyLevel && tech.requires.every(id => merchant.researchedTechIds.includes(id))).length;
  document.getElementById('merchant-research-count').textContent = `${ready} 项可研发`;
  document.getElementById('merchant-research-progress').textContent = `${merchant.researchedTechIds.length} / ${MERCHANT_TECHS.length} 已完成`;
  // 分类数量包含已研发科技，保留原控件和键盘焦点。
  document.querySelectorAll('#merchant-tech-categories button').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.category === researchCategory));
    const count = MERCHANT_TECHS.filter(tech => button.dataset.category === 'all' || tech.category === button.dataset.category).length;
    const badge = button.querySelector('span');
    if (badge.textContent !== String(count)) badge.textContent = String(count);
  });
  document.getElementById('merchant-tech-filter-status').textContent = `${researchCategory === 'all' ? '全部科技' : researchCategory} · ${visible.length} 项 · ${done} 已研发 · ${visible.length - done} 待研发`;
  updateProgressFragment('merchant-research-bonuses', `<span>航速 +${Math.round(bonuses.speed * 100)}%</span><span>载量 +${Math.round(bonuses.capacity * 100)}%</span><span>商路净利 +${Math.round(bonuses.profit * 100)}%</span><span>船位 +${Merchant.getCompanyProgress(merchant).researchShipSlots}</span>`);
  const focused = document.activeElement;
  techTree?.render(state, researchCategory);
  if (focused?.dataset.tech && !focused.isConnected) {
    const replacement = document.querySelector(`[data-merchant-action="research"][data-tech="${focused.dataset.tech}"]`);
    (replacement && !replacement.disabled ? replacement : document.querySelector(`[data-research-tech="${focused.dataset.tech}"] [data-tree-action="inspect"]`) || document.querySelector('#merchant-research h2'))?.focus({ preventScroll: true });
  }
}

function renderInvestment(state) {
  const selector = document.querySelector('[data-investment-route]');
  if (!selector) return;
  const routes = Merchant.listRouteOpportunities(state);
  const keyOf = route => `${route.from}:${route.to}:${route.goodId}`;
  const keys = routes.map(keyOf);
  if (!keys.includes(investmentRouteKey)) investmentRouteKey = keys[0] || '';
  const signature = keys.slice().sort().join('|');
  if (selector.dataset.routes !== signature) {
    selector.innerHTML = routes.map(route => `<option value="${keyOf(route)}">${escape(goodName(route.goodId))} · ${escape(portName(route.from))} → ${escape(portName(route.to))}</option>`).join('');
    selector.dataset.routes = signature;
  }
  selector.value = investmentRouteKey;
  const route = routes.find(item => keyOf(item) === investmentRouteKey);
  const rows = Merchant.getShipRouteComparison(state, route);
  setHtml('merchant-investment-list', rows.map(row => {
    const type = Merchant.getShipType(row.typeId);
    const qualification = row.unlocked ? '可购买' : type.techId ? '研发后可购买' : `公司 Lv.${type.companyLevel} 开放采购`;
    return `<article class="merchant-investment-card" data-investment-type="${row.typeId}"><small>${qualification}</small><h3>${escape(type.name)}</h3><p>载量 ${row.capacity} · 往返 ${formatDuration(row.durationMs)}</p><p>当前装载 ${row.quantity} 单位 · 净利 ${row.profit > 0 ? '+' : ''}${money(row.profit)} CR</p>${row.reason ? `<p class="merchant-preview-warning">${escape(row.reason)}</p>` : ''}<dl><div><dt>尚需研发</dt><dd>${money(row.researchCost)} CR</dd></div><div><dt>下一艘购价</dt><dd>${row.purchaseCost === null ? '—' : `${money(row.purchaseCost)} CR`}</dd></div><div><dt>满载参考货本</dt><dd>${money(row.capital)} CR</dd></div><div><dt>完整投入</dt><dd>${row.totalInvestment === null ? '—' : `${money(row.totalInvestment)} CR`}</dd></div></dl></article>`;
  }).join(''));
}

function shipShopSignature(merchant, types = availableShipTypes(merchant)) {
  return `${types.map(type => `${type.id}:${type.capacity}:${type.speed}`).join(',')}:${MERCHANT_SHIPS.map(type => merchant.ships.filter(ship => ship.typeId === type.id).length).join(',')}`;
}

function renderShipShop(merchant) {
  const types = availableShipTypes(merchant);
  const signature = shipShopSignature(merchant, types);
  for (const node of document.querySelectorAll('#merchant-ship-shop,.merchant-inline-ship-list')) {
    if (node.dataset.merchantShopSignature === signature) continue;
    const inline = node.classList.contains('merchant-inline-ship-list');
    node.innerHTML = types.map(type => inline ? inlineShipShop(type, merchant) : shipShopCard(type, merchant)).join('');
    node.dataset.merchantShopSignature = signature;
  }
}

function refreshPurchaseControls(state) {
  const company = Merchant.getCompanyProgress(state.merchant);
  const reserveNote = document.getElementById('merchant-reserve-note');
  const reserve = Merchant.getOperatingReserve(state);
  if (reserveNote) reserveNote.textContent = reserve ? `保留首航货本 ${money(reserve)} CR` : '已有经营货本';
  document.querySelectorAll('[data-merchant-procurement]').forEach(card => {
    const type = Merchant.getShipType(card.dataset.merchantProcurement);
    const input = card.querySelector('[data-merchant-quantity]');
    const button = card.querySelector('button[data-merchant-action]');
    if (!type || !input || !button) return;
    const quantity = Number(input.value);
    input.max = String(Math.max(1, Math.min(20, company.remaining)));
    input.disabled = company.remaining === 0;
    const valid = Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 20;
    const purchase = valid ? Merchant.getShipPurchaseQuote(state.merchant, type.id, quantity) : null;
    const total = purchase?.total ?? 0;
    const requiredReserve = Merchant.getOperatingReserve(state, type.id);
    const hint = !valid ? '数量应为 1–20 艘'
      : !Merchant.isShipTypeUnlocked(state.merchant, type.id) ? type.techId ? `需研发${Merchant.getTech(type.techId).name}` : `公司 Lv.${type.companyLevel} 开放采购`
        : quantity > company.remaining ? company.remaining ? `仅剩 ${company.remaining} 个船位` : '船位已满，可升级公司或研发船队扩容'
          : !purchase ? '船价超出可购买范围'
          : state.credits < total ? '可用 CR 不足'
          : state.credits - total < requiredReserve ? `需保留 ${money(requiredReserve)} CR 首航货本` : '';
    button.disabled = Boolean(hint);
    button.dataset.buttonState = hint ? 'blocked' : 'ready';
    const hintNode = card.querySelector('[data-merchant-buy-hint]');
    if (hintNode) hintNode.textContent = hint || (purchase && quantity > 1 ? `${money(purchase.nextPrice)} → ${money(purchase.lastPrice)} CR / 艘` : '');
    const label = card.querySelector('[data-merchant-buy-label]');
    const totalLabel = card.querySelector('[data-merchant-total]');
    if (label) label.textContent = valid ? `购入 ${quantity} 艘` : '请输入 1–20 艘';
    if (totalLabel) totalLabel.textContent = purchase ? `${money(total)} CR` : '—';
  });
  document.querySelectorAll('[data-merchant-action="research"]').forEach(button => {
    const tech = Merchant.getTech(button.dataset.tech);
    if (!tech) return;
    const done = state.merchant.researchedTechIds.includes(tech.id);
    const missing = tech.requires.some(id => !state.merchant.researchedTechIds.includes(id));
    const hint = done || missing ? '' : state.merchant.companyLevel < tech.companyLevel ? `公司 Lv.${tech.companyLevel} 开放`
      : state.credits < tech.cost ? '可用 CR 不足'
        : state.credits - tech.cost < reserve ? `需保留 ${money(reserve)} CR 首航货本` : '';
    button.disabled = done || missing || Boolean(hint);
    button.dataset.buttonState = done ? 'complete' : button.disabled ? 'blocked' : 'ready';
    button.closest('[data-research-tech]')?.classList.toggle('is-ready', !button.disabled);
    const hintNode = button.parentElement.querySelector('[data-merchant-tech-hint]');
    if (hintNode) hintNode.textContent = hint;
  });
}

function reportRow(record) {
  return `<article class="merchant-report-row"><div><small>${new Date(record.completedAt).toLocaleString('zh-CN')} · ${escape(record.shipId)}</small><strong>${escape(goodName(record.goodId))} · ${record.quantity} 单位</strong></div><div class="merchant-report-income"><span>收入 <strong>${money(record.revenue)} CR</strong></span><small>采购 ${money(record.cost)} CR · 往返费用 ${money(record.fee)} CR</small></div><div class="merchant-report-net"><small>净利</small><b>${record.profit >= 0 ? '+' : ''}${money(record.profit)} CR</b></div></article>`;
}

function routeReportCard(route) {
  const expanded = expandedReportRoutes.has(route.key);
  const label = `${portName(route.from)} → ${portName(route.to)}`;
  const detailId = `merchant-report-details-${route.from}-${route.to}`;
  return `<article class="merchant-report-card" data-report-card-route="${escape(route.key)}"><div class="merchant-report-route"><strong>${escape(label)}</strong><div class="merchant-report-profit"><small>累计净利</small><b data-report-cumulative></b></div><button type="button" class="merchant-report-toggle" data-merchant-action="report-details" data-route="${escape(route.key)}" aria-label="${escape(label)}：经营详情" aria-expanded="${expanded}" aria-controls="${escape(detailId)}" title="${expanded ? '收起' : '查看'}经营详情"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h2"/><path class="merchant-report-toggle-chevron" d="m14 15 2 2 2-2"/></svg></button></div><div class="merchant-report-metrics" data-report-summary></div><div id="${escape(detailId)}" class="merchant-report-details" ${expanded ? '' : 'hidden'}><div class="merchant-section-head"><h3>近期效率详情</h3></div><label class="merchant-report-window">比较时段<select data-report-window data-report-route="${escape(route.key)}" aria-label="${escape(label)}效率比较时段">${[5,15,60].map(minutes => `<option value="${minutes}" ${minutes === reportWindow ? 'selected' : ''}>最近 ${minutes} 分钟</option>`).join('')}</select></label><p class="merchant-report-period-note" data-report-period-note></p><div class="merchant-report-metrics merchant-report-detail-metrics" data-report-detail-metrics></div><div class="merchant-section-head"><h3>逐笔收入 · 全部留存</h3><span data-report-retained-count></span></div><div class="merchant-report-transactions"></div></div></article>`;
}

function reportStats(route, analytics) {
  const samples = analytics.routes.filter(item => item.from === route.from && item.to === route.to);
  return samples.reduce((sum, item) => { for (const key of ['trips','profit','quantity','capacity','capitalMs','cumulativeProfit']) sum[key] += item[key]; return sum; }, { trips: 0, profit: 0, quantity: 0, capacity: 0, capitalMs: 0, cumulativeProfit: 0 });
}

function reportEfficiency(stats, analytics) {
  return `<span>${stats.trips} 趟 · 均利 ${stats.trips ? money(stats.profit / stats.trips) : '—'} CR</span><span>装载率 ${stats.capacity ? `${Math.round(stats.quantity / stats.capacity * 100)}%` : '—'}</span><span>净利/分钟 ${analytics.elapsedMs ? (stats.profit * 60_000 / analytics.elapsedMs).toFixed(1) : '—'} CR</span>`;
}

function updateReportFragment(node, content) {
  if (!node || reportFragments.get(node) === content) return;
  const scrollTop = node.scrollTop;
  node.innerHTML = content; reportFragments.set(node, content);
  node.scrollTop = scrollTop;
}

function renderReports(merchant) {
  const routes = buildMerchantRouteReports(merchant);
  const summary = getMerchantAnalytics(merchant, 15);
  const detail = reportWindow === 15 ? summary : getMerchantAnalytics(merchant, reportWindow);
  const note = document.getElementById('merchant-report-summary-note');
  if (note) note.textContent = `近期效率默认看最近 15 分钟；全队闲置率 ${summary.idleFraction === null ? '—' : `${Math.round(summary.idleFraction * 100)}%`}。累计净利从 ${new Date(summary.since).toLocaleString('zh-CN')} 开始统计。`;
  const routeKeys = new Set(routes.map(route => route.key));
  for (const key of expandedReportRoutes) if (!routeKeys.has(key)) expandedReportRoutes.delete(key);
  const markup = routes.length ? routes.map(routeReportCard).join('') : '<p class="merchant-empty">暂无线路账目</p>';
  const reportRoot = document.getElementById('merchant-report-list');
  if (!reportRoot) return;
  let scrollPositions = null;
  // 统计数据与时长变化只更新数字，避免比较时段的控件在定时刷新中失去焦点。
  if (reportMarkup !== markup) {
    const active = document.activeElement;
    const focusedRoute = active?.dataset.merchantAction === 'report-details' ? active.dataset.route : null;
    const focusedWindow = active?.matches?.('[data-report-window]') ? active.dataset.reportRoute : null;
    scrollPositions = new Map(Array.from(reportRoot.querySelectorAll('.merchant-report-card'), card => [
      card.dataset.reportCardRoute, card.querySelector('.merchant-report-transactions')?.scrollTop || 0,
    ]));
    reportRoot.innerHTML = markup; reportMarkup = markup;
    if (focusedRoute) Array.from(reportRoot.querySelectorAll('[data-merchant-action="report-details"]')).find(button => button.dataset.route === focusedRoute)?.focus({ preventScroll: true });
    if (focusedWindow) Array.from(reportRoot.querySelectorAll('[data-report-window]')).find(select => select.dataset.reportRoute === focusedWindow)?.focus({ preventScroll: true });
  }
  const cards = new Map(Array.from(reportRoot.querySelectorAll('.merchant-report-card'), card => [card.dataset.reportCardRoute, card]));
  for (const route of routes) {
    const card = cards.get(route.key), stats = reportStats(route, summary), detailed = reportStats(route, detail);
    card.querySelector('[data-report-cumulative]').textContent = `${stats.cumulativeProfit >= 0 ? '+' : ''}${money(stats.cumulativeProfit)} CR`;
    updateReportFragment(card.querySelector('[data-report-summary]'), `<span class="merchant-report-period-label">最近 15 分钟</span>${reportEfficiency(stats, summary)}${route.stoppedTasks[0] ? `<span>最近解除：${escape(route.stoppedTasks[0].reason)}</span>` : ''}`);
    card.querySelector('[data-report-period-note]').textContent = `本分钟及此前 ${reportWindow - 1} 分钟；实际覆盖 ${new Date(detail.from).toLocaleString('zh-CN')} 至 ${new Date(detail.to).toLocaleTimeString('zh-CN')}。各线路详情使用同一比较时段。`;
    updateReportFragment(card.querySelector('[data-report-detail-metrics]'), `<span>时段净利 ${detailed.profit >= 0 ? '+' : ''}${money(detailed.profit)} CR</span>${reportEfficiency(detailed, detail)}<span>平均占用货本 ${detail.elapsedMs ? money(detailed.capitalMs / detail.elapsedMs) : '—'} CR</span>`);
    card.querySelector('[data-report-retained-count]').textContent = `${route.records.length} 笔`;
    const stopped = route.stoppedTasks.map(task => `<p class="merchant-wait-note">${escape(task.id)} · 自动解除 · ${task.closedAt ? '已返港' : '返港中'}：${escape(task.reason)}</p>`).join('');
    const transactions = card.querySelector('.merchant-report-transactions');
    updateReportFragment(transactions, `${stopped}${route.records.length ? route.records.map(reportRow).join('') : '<p class="merchant-empty">暂无已结算收入</p>'}`);
    if (scrollPositions) transactions.scrollTop = scrollPositions.get(route.key) || 0;
  }
}

export function render(state) {
  if (!root || !state?.merchant) return;
  applyMerchantTheme(state);
  renderMerchantHeader(state);
  const merchant = state.merchant;
  if (!merchant.tasks.some(task => task.id === selectedTaskId)) {
    selectedTaskId = merchant.tasks[0]?.id || null;
    taskDetailsOpen = true;
  }
  const exploration = merchant.exploration?.event;
  const explorer = !merchant.tasks.length && merchant.ships.find(ship => ship.taskId === exploration?.id && ['exploring', 'explore_return'].includes(ship.phase));
  const exploring = Boolean(explorer);
  const explorationStage = explorer?.phase === 'explore_return' ? '探索返港' : Date.now() < exploration?.startedAt + exploration?.legMs ? '探索去程' : '勘察中';
  const traveling = exploring && explorationStage !== '勘察中';
  const returnAt = exploring ? exploration.arriveAt + (exploration.status === 'exploring' ? exploration.legMs : 0) : 0;
  const progress = exploring ? Math.max(0, Math.min(1, (Date.now() - exploration.startedAt) / (returnAt - exploration.startedAt))) : 0;
  const stageText = (id, value) => { const node = document.getElementById(id); if (node && node.textContent !== value) node.textContent = value; };
  document.querySelector('.merchant-command-stage').hidden = !exploring;
  stageText('merchant-stage-route-name', exploring ? `${portName(exploration.from)} → ${getPlanetIntelligence(merchant, exploration.portId) ? portName(exploration.portId) : '未知信号'}` : '');
  stageText('merchant-stage-status', exploring ? explorationStage : '');
  stageText('merchant-stage-subline', exploring ? `${shipLabel(explorer)} · 约 ${formatDuration(returnAt - Date.now())} 返港` : '');
  const stageImage = (selector, src) => { const node = document.querySelector(selector); if (node && node.getAttribute('src') !== src) node.src = src; };
  const stageFlight = document.querySelector('.merchant-stage-flight');
  if (stageFlight) {
    if (explorer) stageImage('.merchant-stage-ship', shipImage(explorer.typeId));
    stageFlight.classList.toggle('is-traveling', traveling);
    stageFlight.hidden = !explorer;
  }
  const stageProgress = document.getElementById('merchant-stage-progress');
  if (stageProgress) stageProgress.style.width = `${Math.floor(progress * 100)}%`;
  const catchup = document.getElementById('merchant-catchup');
  if (catchup) {
    const pendingMs = Math.max(0, Date.now() - merchant.lastTickAt);
    catchup.hidden = pendingMs < 60_000;
    if (!catchup.hidden) catchup.textContent = `正在补算离线航次，还剩约 ${formatDuration(pendingMs)}；账目会持续更新。`;
  }
  operations?.render(state);
  renderTasks(merchant);
  const restockEta = Math.max(0, merchant.nextRestockAt - Date.now());
  stageText('merchant-next-restock', `下次供需恢复约 ${formatDuration(restockEta)}`);
  const count = document.getElementById('merchant-task-count');
  if (count) count.textContent = `${merchant.tasks.length}`;
  setHtml('merchant-feedback', feedback && Date.now() < feedbackUntil ? `<span>${escape(feedback)}</span>` : '');
  setHtml('merchant-market-list', MERCHANT_PORTS.map(port => marketCard(port, state)).join(''));
  setHtml('merchant-route-list', routeCards(state));
  intelligence?.render(state);
  const ownedRoot = document.getElementById('merchant-ship-list');
  const openTypes = new Set(Array.from(ownedRoot?.querySelectorAll('details[open]') || [], node => node.dataset.merchantOwnedType));
  setHtml('merchant-ship-list', ownedShipGroups(merchant));
  ownedRoot?.querySelectorAll('details').forEach(node => { if (openTypes.has(node.dataset.merchantOwnedType)) node.open = true; });
  renderShipShop(merchant);
  updateProgressFragment('merchant-company-growth', companyGrowth(state));
  document.getElementById('merchant-company-growth').classList.toggle('is-early', merchant.companyLevel <= MERCHANT_EXPLORATION_RULES.companyLevel && !merchant.unlockedPorts.includes('nebula_forge') && !merchant.researchedTechIds.includes(MERCHANT_EXPLORATION_RULES.techId));
  renderEarlyProgress(state);
  renderInvestment(state);
  document.querySelectorAll('#bottom-nav [data-view]').forEach(button => {
    button.hidden = !isMerchantViewUnlocked(merchant, button.dataset.view);
  });
  renderResearch(state);
  renderReports(merchant);
  if (formTaskId !== null) {
    const budgetInput = document.getElementById('merchant-form')?.elements.budget;
    if (budgetInput) budgetInput.max = String(state.credits + (merchant.tasks.find(task => task.id === formTaskId)?.budget || 0));
    refreshFormShipChoices(); refreshFormRoutes(state); renderPreview();
  }
  refreshPurchaseControls(state);
  onboarding?.refresh(state, { view: document.body.dataset.activeView || 'tasks', formOpen: formTaskId !== null });
  ports?.refresh(state, document.body.dataset.activeView === 'tasks');
}

function formPlan() {
  const form = document.getElementById('merchant-form');
  if (!form) return null;
  return {
    taskId: formTaskId || undefined,
    from: form.elements.from.value,
    to: form.elements.to.value,
    goodId: form.elements.goodId.value,
    budget: Number(form.elements.budget.value),
    shipIds: [...form.querySelectorAll('input[name="shipIds"]:checked')].map(input => input.value),
  };
}

function renderPreview() {
  const plan = formPlan();
  const node = document.getElementById('merchant-plan-preview');
  if (!node || !plan) return;
  const state = getState();
  const merchant = state.merchant;
  const result = Merchant.preview(state, plan);
  const recommended = getMerchantBudgetRecommendation(state, plan);
  const hadBudgetFocus = document.activeElement?.dataset.merchantAction === 'use-budget';
  updateProgressFragment('merchant-budget-recommendation', recommended ? `<span>满载货本 ${money(recommended.budget)} CR · 预计 ${formatDuration(recommended.durationMs)} 完整往返</span><button type="button" data-merchant-action="use-budget" data-button-state="${recommended.affordable ? 'ready' : 'blocked'}" ${recommended.affordable ? '' : 'disabled'}>${recommended.affordable ? '使用推荐货本' : '满载货本暂不足'}</button>` : '选定可交易商路和船只后，可查看满载货本建议。');
  if (hadBudgetFocus) document.querySelector('[data-merchant-action="use-budget"]')?.focus({ preventScroll: true });
  const lines = result.rows.map(row => `<p>${escape(Merchant.getShipType(row.typeId)?.name)}：${row.profit > 0 ? `${row.quantity} 单位 · 往返费用 ${money(row.fee)} CR · 预计净赚 ${money(row.profit)} CR` : escape(row.reason)}</p>`).join('');
  node.innerHTML = `<small>当前市场预估 · 出发时复核</small><strong>预计可成交 ${result.quantity} 单位 · 完整往返净利润 +${money(result.profit)} CR</strong>${lines}${result.reason ? `<p class="merchant-preview-warning">${escape(result.reason)}</p>` : ''}`;
  const existing = plan.taskId ? merchant.tasks.find(task => task.id === plan.taskId) : null;
  const pending = Boolean(existing?.pending || existing?.stopping);
  const invalidRoute = !Merchant.isPortOpen(merchant, plan.from) || !Merchant.isPortOpen(merchant, plan.to) ||
    plan.from === plan.to || !Merchant.getPort(plan.from)?.buy?.[plan.goodId] || !Merchant.getPort(plan.to)?.sell?.[plan.goodId];
  const invalidShips = !plan.shipIds.length || plan.shipIds.some(id => {
    const ship = merchant.ships.find(item => item.id === id);
    return !ship || ship.taskId && ship.taskId !== existing?.id;
  });
  const hint = plan.taskId && !existing ? '经营任务已结束'
    : pending ? existing.stopping ? '正在等待返港结束' : '上一项调整正在等待返港生效'
      : invalidRoute ? '请选择可交易的已开放商路'
        : !Number.isSafeInteger(plan.budget) || plan.budget <= 0 ? '请输入大于零的整数货本'
          : plan.budget - (existing?.budget || 0) > state.credits ? '可用 CR 不足'
            : invalidShips ? '请至少分配一艘可用飞船' : '';
  const submit = document.querySelector('#merchant-form button[type="submit"]');
  if (submit) {
    submit.disabled = Boolean(hint);
    submit.dataset.buttonState = pending ? 'pending' : hint ? 'blocked' : 'ready';
  }
  const hintNode = document.querySelector('[data-merchant-submit-hint]');
  if (hintNode) { hintNode.textContent = hint; hintNode.hidden = !hint; }
  document.querySelectorAll('#merchant-form [data-merchant-action="select-route"]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.from === plan.from && button.dataset.to === plan.to && button.dataset.good === plan.goodId));
  });
}

function refreshFormShipChoices(newShipIds = []) {
  const fieldset = document.getElementById('merchant-ship-picks');
  if (!fieldset || formTaskId === null) return;
  const state = getState();
  const selectable = state.merchant.ships.filter(ship => !ship.taskId || ship.taskId === formTaskId);
  const currentIds = [...fieldset.querySelectorAll('input[name="shipIds"]')].map(input => input.value);
  if (currentIds.join('|') === selectable.map(ship => ship.id).join('|')) {
    fieldset.querySelectorAll('input[name="shipIds"]').forEach(input => {
      if (newShipIds.includes(input.value)) input.checked = true;
      const ship = selectable.find(item => item.id === input.value), stats = Merchant.getShipStats(state.merchant, ship.typeId);
      input.closest('label').querySelector('small').textContent = `载量 ${stats.capacity} · ${stats.speed.toFixed(2)}×`;
    });
    return;
  }
  const focusedId = fieldset.contains(document.activeElement) ? document.activeElement.value : null;
  const checked = [...fieldset.querySelectorAll('input[name="shipIds"]:checked')].map(input => input.value);
  const selected = [...new Set([...checked, ...newShipIds])];
  fieldset.innerHTML = `<legend>分配飞船</legend>${selectable.map(ship => `<label><input type="checkbox" name="shipIds" value="${escape(ship.id)}" ${selected.includes(ship.id) ? 'checked' : ''}><span>${escape(shipLabel(ship))}</span><small>载量 ${Merchant.getShipStats(getState().merchant, ship.typeId).capacity} · ${Merchant.getShipStats(getState().merchant, ship.typeId).speed.toFixed(2)}×</small></label>`).join('') || '<p>暂无空闲飞船</p>'}`;
  if (focusedId) [...fieldset.querySelectorAll('input[name="shipIds"]')].find(input => input.value === focusedId)?.focus({ preventScroll: true });
}

function formRoutes(routes) {
  return routes.map(route => `<button type="button" data-merchant-action="select-route" data-from="${route.from}" data-to="${route.to}" data-good="${route.goodId}" data-merchant-route-available="${Boolean(route.opportunity)}" aria-pressed="false"><span>${escape(goodName(route.goodId))}</span><strong>${escape(portName(route.from))} → ${escape(portName(route.to))}</strong></button>`).join('');
}

function refreshFormMarkets(state) {
  const form = document.getElementById('merchant-form');
  if (!form) return;
  const portIds = Merchant.getOpenPortIds(state.merchant);
  const goodIds = MERCHANT_GOODS.filter(good => Merchant.isMerchantGoodKnown(state.merchant, good.id)).map(good => good.id);
  const signature = JSON.stringify([portIds, goodIds]);
  if (form.dataset.marketSignature === signature) return;
  // 开港时同步补全下拉选项，保留配置与控件焦点，不重建整张派遣表单。
  for (const [name, ids, label] of [['from', portIds, portName], ['to', portIds, portName], ['goodId', goodIds, goodName]]) {
    const selector = form.elements[name];
    const selected = selector.value;
    selector.innerHTML = ids.map(id => `<option value="${escape(id)}">${escape(label(id))}</option>`).join('');
    selector.value = ids.includes(selected) ? selected : '';
  }
  form.dataset.marketSignature = signature;
}

function refreshFormRoutes(state) {
  const list = document.getElementById('merchant-form-route-list');
  if (!list) return;
  refreshFormMarkets(state);
  // 与市场共用供需、资金、运力和利润判断；只更新按钮，不覆盖玩家配置。
  const routes = Merchant.listRouteOpportunities(state);
  const signature = routes.map(route => `${route.from}:${route.to}:${route.goodId}:${Boolean(route.opportunity)}`).join('|');
  if (list.dataset.routeSignature === signature) return;
  const focused = list.contains(document.activeElement) ? document.activeElement.closest?.('[data-merchant-action="select-route"]') : null;
  const focusedKey = focused ? [focused.dataset.from, focused.dataset.to, focused.dataset.good].join(':') : null;
  list.innerHTML = formRoutes(routes);
  list.dataset.routeSignature = signature;
  if (focusedKey) {
    Array.from(list.querySelectorAll('button')).find(button =>
      [button.dataset.from, button.dataset.to, button.dataset.good].join(':') === focusedKey)?.focus({ preventScroll: true });
  }
}

function openForm(task = null, suggestion = null) {
  ports?.close(false);
  const state = getState();
  const merchant = state.merchant;
  formTaskId = task?.id || '';
  operations?.showTasks();
  const plan = task || suggestion || { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', budget: Math.min(220, state.credits), shipIds: [] };
  const options = Merchant.getOpenPortIds(merchant).map(id => `<option value="${id}">${escape(portName(id))}</option>`).join('');
  const selectable = merchant.ships.filter(ship => !ship.taskId || ship.taskId === task?.id);
  const selectedShipIds = plan.shipIds.length ? plan.shipIds : task || suggestion?.purchaseTypeId ? [] : selectable.slice(0, 1).map(ship => ship.id);
  const recommendation = !task && !suggestion ? getMerchantBudgetRecommendation(state, { ...plan, shipIds: selectedShipIds }) : null;
  const initialBudget = recommendation ? Math.min(recommendation.budget, state.credits) : plan.budget;
  const node = document.getElementById('merchant-form-panel');
  node.innerHTML = `<div class="merchant-form-head"><h2 tabindex="-1">${task ? '调整派遣' : '新派遣'}</h2><button type="button" class="ui-close-button" data-merchant-action="close-form" aria-label="关闭派遣配置">×</button></div>
    <form id="merchant-form"><div class="merchant-form-step"><small>商路</small><div id="merchant-form-route-list" class="merchant-route-picks"></div></div>
    <div class="merchant-form-grid"><label>出发港<select name="from">${options}</select></label><label>目的港<select name="to">${options}</select></label><label>去程货物<select name="goodId">${MERCHANT_GOODS.filter(good => Merchant.isMerchantGoodKnown(merchant, good.id)).map(good => `<option value="${good.id}">${escape(good.name)}</option>`).join('')}</select></label></div>
    <div class="merchant-form-step"><small>飞船与货本</small></div><fieldset id="merchant-ship-picks" class="merchant-ship-picks"><legend>分配飞船</legend>${selectable.map(ship => `<label><input type="checkbox" name="shipIds" value="${escape(ship.id)}" ${selectedShipIds.includes(ship.id) ? 'checked' : ''}><span>${escape(shipLabel(ship))}</span><small>载量 ${Merchant.getShipStats(getState().merchant, ship.typeId).capacity} · ${Merchant.getShipStats(getState().merchant, ship.typeId).speed.toFixed(2)}×</small></label>`).join('') || '<p>暂无空闲飞船</p>'}</fieldset>
    <details class="merchant-inline-shipyard" ${suggestion?.purchaseTypeId ? 'open' : ''}><summary>${suggestion?.purchaseTypeId ? `先添购${escape(Merchant.getShipType(suggestion.purchaseTypeId).name)}` : '添购飞船'}</summary><div class="merchant-inline-ship-list">${availableShipTypes(merchant).map(type => inlineShipShop(type, merchant)).join('')}</div></details>
    <label class="merchant-budget-field">周转货本 · CR<input name="budget" type="number" min="1" step="1" max="${state.credits + (task?.budget || 0)}" value="${initialBudget}" required></label><div id="merchant-budget-recommendation" class="merchant-budget-recommendation"></div><p class="merchant-detail-hint">货本包含采购与往返费用，只划拨一次，返港后继续周转。缺货或需求暂满时会等待恢复，也可随时结束任务。</p>
    <div id="merchant-plan-preview" class="merchant-plan-preview"></div><p class="merchant-preview-warning" data-merchant-submit-hint role="status" hidden></p><div class="merchant-form-actions"><button type="button" data-merchant-action="close-form">返回</button><button type="submit" class="merchant-primary">${task ? '提交调整' : '确认派遣'} ↗</button></div></form>`;
  node.hidden = false;
  node.querySelector('.merchant-inline-ship-list').dataset.merchantShopSignature = shipShopSignature(merchant);
  const form = document.getElementById('merchant-form');
  form.elements.from.value = plan.from;
  form.elements.to.value = plan.to;
  form.elements.goodId.value = plan.goodId;
  refreshFormRoutes(state);
  renderPreview();
  refreshPurchaseControls(state);
  node.scrollTop = 0;
  if (!task && state.merchant.onboarding?.step === 1) execute?.('onboarding', { action: 'opened-dispatch' });
  onboarding?.refresh(state, { view: 'tasks', formOpen: true });
  renderEarlyProgress(state);
  node.querySelector('h2')?.focus({ preventScroll: true });
}

function closeForm() {
  formTaskId = null;
  const node = document.getElementById('merchant-form-panel');
  if (node) node.hidden = true;
  render(getState());
}

function act(action, payload) {
  const result = execute?.(action, payload);
  feedback = result?.msg || '';
  feedbackUntil = feedback ? Date.now() + 8000 : 0;
  if (result?.taskId) { selectedTaskId = result.taskId; taskDetailsOpen = true; starmap?.focusTask(result.taskId); }
  render(getState());
  return result;
}

export function notify(message) {
  feedback = message || '';
  feedbackUntil = feedback ? Date.now() + 8000 : 0;
}

function openRoute(route) {
  ports?.close(false);
  const opportunity = Merchant.findRouteOpportunity(getState(), route.from, route.to, route.goodId);
  navigate?.('tasks');
  openForm(null, { ...route, budget: opportunity?.budget ?? Math.min(220, getState().credits),
    shipIds: opportunity?.shipId ? [opportunity.shipId] : [], purchaseTypeId: opportunity?.purchaseCost ? opportunity.typeId : null });
}

function openPort(id) {
  navigate?.('tasks');
  ports?.show(id);
}

function selectTask(id, toggle = false) {
  taskDetailsOpen = toggle && selectedTaskId === id ? !taskDetailsOpen : true;
  selectedTaskId = id; operations?.showTasks(); starmap?.focusTask(id); closeForm();
  Array.from(document.querySelectorAll('[data-merchant-action="select-task"]')).find(button => button.dataset.id === id)?.focus({ preventScroll: true });
}

function onClick(event) {
  const button = event.target.closest?.('[data-merchant-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.merchantAction;
  if (action === 'filter-tech') {
    if (!['all', ...MERCHANT_TECH_CATEGORIES].includes(button.dataset.category)) return;
    researchCategory = button.dataset.category;
    render(getState());
    button.focus({ preventScroll: true });
    return;
  }
  if (action === 'report-details') {
    const key = button.dataset.route;
    const expanded = !expandedReportRoutes.has(key);
    if (expanded) expandedReportRoutes.add(key); else expandedReportRoutes.delete(key);
    button.setAttribute('aria-expanded', String(expanded));
    button.title = `${expanded ? '收起' : '查看'}经营详情`;
    const details = document.getElementById(button.getAttribute('aria-controls'));
    if (details) details.hidden = !expanded;
    return;
  }
  if (action === 'market') { navigate?.('market'); return; }
  if (action === 'early-reports') { navigate?.('reports'); return; }
  if (action === 'early-research') {
    operations?.showResearch();
    const next = buildMerchantEarlyProgress(getState());
    if (next?.techId) techTree?.locate(next.techId);
    document.querySelector('#merchant-research h2')?.focus({ preventScroll: true }); return;
  }
  if (action === 'early-task') { selectTask(button.dataset.id); document.getElementById('merchant-task-list')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
  if (action === 'use-budget') {
    const recommended = getMerchantBudgetRecommendation(getState(), formPlan());
    if (recommended?.affordable) { document.getElementById('merchant-form').elements.budget.value = String(recommended.budget); renderPreview(); }
    return;
  }
  if (action === 'new') { navigate?.('tasks'); openForm(); return; }
  if (action === 'close-form') { closeForm(); document.querySelector('[data-merchant-action="new"]')?.focus(); return; }
  if (action === 'select-task') { selectTask(button.dataset.id, true); return; }
  if (action === 'select-route') {
    const form = document.getElementById('merchant-form');
    if (!form) return;
    form.elements.from.value = button.dataset.from;
    form.elements.to.value = button.dataset.to;
    form.elements.goodId.value = button.dataset.good;
    renderPreview(); return;
  }
  if (action === 'buy-in-form') {
    const quantity = Number(button.closest('[data-merchant-procurement]')?.querySelector('[data-merchant-quantity]')?.value);
    const result = act('buyShip', { typeId: button.dataset.type, quantity });
    if (result?.ok) { refreshFormShipChoices(result.shipIds); renderPreview(); }
    return;
  }
  if (action === 'route') {
    openRoute({ from: button.dataset.from, to: button.dataset.to, goodId: button.dataset.good });
    return;
  }
  if (action === 'edit') {
    const task = getState().merchant.tasks.find(item => item.id === button.dataset.id);
    if (task) openForm(task);
    return;
  }
  if (action === 'stop') act('stop', { taskId: button.dataset.id });
  if (action === 'buy') {
    const quantity = Number(button.closest('[data-merchant-procurement]')?.querySelector('[data-merchant-quantity]')?.value);
    act('buyShip', { typeId: button.dataset.type, quantity });
  }
  if (action === 'research') {
    const techId = button.dataset.tech;
    const result = act('researchTech', { techId });
    if (result?.ok) document.querySelector(`[data-research-tech="${techId}"] [data-tree-action="inspect"]`)?.focus({ preventScroll: true });
    return;
  }
  if (action === 'upgrade-company' || action === 'breakthrough-company') {
    const result = act(action === 'breakthrough-company' ? 'breakthroughCompany' : 'upgradeCompany', { fromLevel: Number(button.dataset.fromLevel), targetLevel: Number(button.dataset.targetLevel) });
    if (result?.ok && button.closest('.merchant-company-upgrade')) {
      const next = document.querySelector('.merchant-company-upgrade button');
      (next && !next.disabled ? next : document.querySelector('.merchant-company-level'))?.focus({ preventScroll: true });
    }
  }
}

function onSubmit(event) {
  if (event.target.id !== 'merchant-form') return;
  event.preventDefault();
  const plan = formPlan();
  const result = act(formTaskId ? 'update' : 'create', plan);
  if (result?.ok) { closeForm(); operations?.showTasks(); render(getState()); }
}

function onChange(event) {
  if (event.target.matches?.('[data-investment-route]')) { investmentRouteKey = event.target.value; renderInvestment(getState()); }
  if (event.target.matches?.('[data-report-window]')) {
    const minutes = Number(event.target.value);
    if ([5,15,60].includes(minutes)) { reportWindow = minutes; renderReports(getState().merchant); }
  }
  if (event.target.matches?.('[data-merchant-quantity]')) {
    const typeId = event.target.dataset.merchantQuantity;
    const quantity = Number(event.target.value);
    if (Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 20) purchaseQuantities[typeId] = quantity;
    refreshPurchaseControls(getState());
  }
  if (event.target.closest?.('#merchant-form')) renderPreview();
}

export function renderScene(state) { starmap?.renderFrame(state); }

export function enterView(view) {
  if (view !== 'tasks') ports?.close(false);
  if (view === 'tasks' && formTaskId === null) operations?.enter();
  onboarding?.refresh();
}

export function dispose() {
  techTree?.dispose(); techTree = null;
  intelligence?.dispose(); intelligence = null;
  ports?.dispose(); ports = null;
  operations?.dispose(); operations = null;
  onboarding?.dispose(); onboarding = null;
  starmap?.dispose(); starmap = null;
  if (root && clickListener) root.removeEventListener('click', clickListener);
  if (root && submitListener) root.removeEventListener('submit', submitListener);
  if (root && changeListener) { root.removeEventListener('input', changeListener); root.removeEventListener('change', changeListener); }
  root = getState = execute = navigate = clickListener = submitListener = changeListener = null;
  formTaskId = null; selectedTaskId = null; feedback = ''; feedbackUntil = 0;
  taskDetailsOpen = true; taskMarkup = null;
  reportWindow = 15; investmentRouteKey = ''; researchCategory = 'all';
  reportMarkup = null;
  expandedReportRoutes.clear();
}
