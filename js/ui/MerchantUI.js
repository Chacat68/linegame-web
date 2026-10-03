import { MERCHANT_RULES, MERCHANT_GOODS, MERCHANT_PORTS, MERCHANT_SHIPS, MERCHANT_TECHS, MERCHANT_COMPANY_LEVELS, isMerchantViewUnlocked } from '../data/merchant.js';
import * as Merchant from '../systems/merchant/MerchantSystem.js';
import { renderMerchantHeader } from './MerchantHeaderPresenter.js';
import { createMerchantStarmapController } from './MerchantStarmapController.js';
import { createMerchantOnboardingPresenter } from './MerchantOnboardingPresenter.js';
import { buildMerchantRouteReports } from './MerchantReportProjection.js';
import { applyMerchantTheme } from './MerchantTheme.js';
import shuttleArt from '../../assets/scene/ships/shuttle.webp';
import clipperArt from '../../assets/scene/ships/clipper.webp';
import freighterArt from '../../assets/scene/ships/freighter.webp';
import galleonArt from '../../assets/scene/ships/galleon.webp';
import solArt from '../../assets/scene/ports/sol.webp';
import miningArt from '../../assets/scene/ports/mining.webp';
import industrialArt from '../../assets/scene/ports/industrial.webp';

const portArt = { sol_prime: solArt, mineral_belt: miningArt, nebula_forge: industrialArt };
const shipArt = { shuttle: shuttleArt, clipper: clipperArt, freighter: freighterArt, galleon: galleonArt };
const shipImage = typeId => shipArt[Merchant.getShipType(typeId)?.sceneType] || shuttleArt;

const money = value => Math.floor(value || 0).toLocaleString('zh-CN');
const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const portName = id => Merchant.getPort(id)?.name || id;
const goodName = id => Merchant.getGood(id)?.name || id;
const phaseName = phase => ({ idle: '待命', waiting: '等待回款', outbound: '载货去程', return: '空载返程', exploring: '探索中', explore_return: '探索返港' })[phase] || phase;

let root = null;
let getState = null;
let execute = null;
let navigate = null;
let clickListener = null;
let submitListener = null;
let changeListener = null;
let starmap = null;
let onboarding = null;
let formTaskId = null;
let selectedTaskId = null;
let feedback = '';
let feedbackUntil = 0;
let reportMarkup = null;
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
      <section id="merchant-company-growth" class="merchant-company-growth" aria-label="公司等级与船位"></section>
      <section class="merchant-command-stage" aria-label="商队航路状态">
        <div class="merchant-stage-flight" aria-hidden="true"><div class="merchant-stage-streams"><i></i><i></i><i></i><i></i><i></i><i></i></div><img class="merchant-stage-ship" src="${shuttleArt}" alt=""></div>
        <div class="merchant-stage-telemetry"><small>当前航线</small><span id="merchant-stage-route-name" class="merchant-stage-route-name">尚未安排航线</span><strong id="merchant-stage-status">等待首项派遣</strong><span id="merchant-stage-subline"></span><div class="merchant-stage-progress"><i id="merchant-stage-progress"></i></div></div>
      </section>
      <div class="merchant-route-status" id="merchant-route-status" aria-label="航路运行概况"></div>
      <p id="merchant-catchup" class="merchant-catchup" role="status" hidden></p><div id="merchant-feedback" class="merchant-feedback" aria-live="polite"></div>
      <div class="merchant-command-grid"><section class="merchant-operations" aria-label="经营派遣任务"><div class="merchant-operations-head"><h2>航运任务 <span id="merchant-task-count"></span></h2><button type="button" class="merchant-primary" data-merchant-action="new">＋ 新派遣</button></div><div id="merchant-task-list" class="merchant-task-list"></div></section>
      <aside class="merchant-detail-bay" aria-label="调度与任务详情"><div id="merchant-detail-panel"></div><section id="merchant-form-panel" class="merchant-form-panel" hidden></section></aside></div></div>`,
    market: shell('商路情报', `
      <div class="merchant-section-head"><h2>港口与供需</h2><span id="merchant-next-restock"></span></div><div id="merchant-market-list" class="merchant-market-grid"></div>
      <div class="merchant-section-head"><h2>商路列表</h2></div><div id="merchant-route-list" class="merchant-route-grid"></div>`),
    ships: shell('船坞', `
      <div class="merchant-section-head"><h2>已拥有的飞船</h2></div><div id="merchant-ship-list" class="merchant-ship-grid merchant-owned-grid"></div>
      <div class="merchant-section-head"><h2>购入运力</h2><span id="merchant-reserve-note"></span></div><div id="merchant-ship-shop" class="merchant-ship-grid"></div>
      <section id="merchant-tech-section"><div class="merchant-section-head"><h2>航运科技</h2></div><div id="merchant-tech-list" class="merchant-tech-grid"></div></section>`, shuttleArt),
    reports: shell('航运账本', `
      <div id="merchant-report-onboarding-host"></div>
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
  starmap = createMerchantStarmapController({ onReturn: () => navigate?.('tasks'), getState, execute });
  onboarding = createMerchantOnboardingPresenter({ getState, execute, navigate, openDispatch: () => { navigate?.('tasks'); openForm(); } });
  render(getState());
}

function setHtml(id, content) {
  const element = document.getElementById(id);
  if (element && element.innerHTML !== content) element.innerHTML = content;
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function shipLabel(ship) { return `${Merchant.getShipType(ship.typeId)?.name || ship.typeId} · ${ship.id.replace('ship-', '#')}`; }

function taskCard(task, merchant) {
  const ships = merchant.ships.filter(ship => ship.taskId === task.id);
  const status = Merchant.getTaskStatus(merchant, task);
  const selected = task.id === selectedTaskId;
  const traveling = ships.filter(ship => ship.phase === 'outbound' || ship.phase === 'return').length;
  return `<article class="merchant-task-card${selected ? ' is-selected' : ''}"><button type="button" class="merchant-task-select" data-merchant-action="select-task" data-id="${escape(task.id)}" aria-pressed="${selected}">
    <span class="merchant-task-symbol" aria-hidden="true">${traveling ? '↗' : '◇'}</span><span class="merchant-task-main"><small>${escape(goodName(task.goodId))} · ${ships.length} 艘船 · ${task.rounds} 趟</small><strong>${escape(portName(task.from))} <i>→</i> ${escape(portName(task.to))}</strong><em>${escape(status)}</em></span><span class="merchant-task-profit"><small>累计净利</small><strong>+${money(task.profit)} CR</strong></span></button></article>`;
}

function taskDetail(task, merchant) {
  const ships = merchant.ships.filter(ship => ship.taskId === task.id);
  const recent = task.recent[0];
  return `<div class="merchant-detail-head"><div><small>MISSION / ${escape(task.id.toUpperCase())}</small><h2>${escape(portName(task.from))} <span>→</span> ${escape(portName(task.to))}</h2><p>${escape(goodName(task.goodId))} · ${escape(Merchant.getTaskStatus(merchant, task))}</p>${task.stopReason ? `<p class="merchant-wait-note">解除原因：${escape(task.stopReason)}</p>` : ''}</div></div>
    <div class="merchant-detail-ledger"><div><small>任务货本</small><strong>${money(task.budget)} <em>CR</em></strong></div><div><small>待用货本</small><strong>${money(task.available)} <em>CR</em></strong></div><div><small>净利润</small><strong class="merchant-positive">+${money(task.profit)} <em>CR</em></strong></div></div>
    <div class="merchant-detail-section"><small>ASSIGNED SHIPS</small>${ships.map(ship => `<p><span>${escape(shipLabel(ship))}</span><b>${escape(task.stopping && ship.phase === 'waiting' ? '港口停靠' : phaseName(ship.phase))}</b></p>${ship.waitReason && !task.stopping ? `<small class="merchant-wait-note">${escape(ship.waitReason)}</small>` : ''}`).join('')}</div>
    ${recent ? `<div class="merchant-detail-last"><small>最近结算 / ${new Date(recent.completedAt).toLocaleTimeString('zh-CN')}</small><strong>+${money(recent.profit)} CR</strong><span>${recent.quantity} 单位 · 往返费用 ${money(recent.fee)} CR</span></div>` : '<p class="merchant-detail-hint">暂无结算记录</p>'}
    <div class="merchant-detail-actions"><button type="button" data-merchant-action="edit" data-button-state="${task.pending || task.stopping ? 'pending' : 'ready'}" data-id="${escape(task.id)}" ${task.pending || task.stopping ? 'disabled' : ''}>调整派遣</button><button type="button" data-merchant-action="stop" data-button-state="${task.stopping ? 'pending' : 'danger'}" data-id="${escape(task.id)}" ${task.stopping ? 'disabled' : ''}>${task.stopping ? '返港后结束' : '结束任务'}</button></div>`;
}

function emptyDetail(state) {
  const free = state.merchant.ships.filter(ship => !ship.taskId).length;
  return `<div class="merchant-detail-head"><div><h2>下一条商路</h2><p>${free} 艘空闲飞船</p></div></div>
    <div class="merchant-detail-shortcuts"><button type="button" data-merchant-action="route" data-from="sol_prime" data-to="mineral_belt" data-good="food"><span>粮食航线</span><strong>太阳主星 → 矿石带</strong></button><button type="button" data-merchant-action="route" data-from="mineral_belt" data-to="sol_prime" data-good="minerals"><span>矿石航线</span><strong>矿石带 → 太阳主星</strong></button></div>
    ${isMerchantViewUnlocked(state.merchant, 'market') ? '<div class="merchant-detail-hint"><button type="button" data-merchant-action="market">查看市场情报 ↗</button></div>' : ''}`;
}

function marketCard(port, state) {
  const merchant = state.merchant;
  if (!merchant.unlockedPorts.includes(port.id)) return '';
  const market = merchant.markets[port.id];
  const lines = [...Object.entries(port.supply).map(([good, max]) => `供给 ${goodName(good)} <strong>${market.supply[good]}/${max}</strong>`), ...Object.entries(port.demand).map(([good, max]) => `需求 ${goodName(good)} <strong>${market.demand[good]}/${max}</strong>`)];
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
  const path = MERCHANT_COMPANY_LEVELS.map((stage,index) => `<li class="${stage.level === company.level ? 'is-current' : stage.level < company.level ? 'is-complete' : ''}" ${stage.level === company.level ? 'aria-current="step"' : ''}><strong>Lv.${stage.level}</strong><span>${stage.shipLimit} 艘</span><span>${stage.unlock}</span><small>${stage.level <= company.level ? stage.level === company.level ? '当前' : '已达成' : `${money(MERCHANT_COMPANY_LEVELS[index-1].upgradeCost)} CR`}</small></li>`).join('');
  const nextStage = MERCHANT_COMPANY_LEVELS.find(stage => stage.level === company.level + 1);
  return `<div class="merchant-company-identity"><small>公司</small><button type="button" id="company-name-display" aria-label="修改公司名称" title="修改公司名称">${escape(state.companyName)} <span aria-hidden="true">✎</span></button><span class="merchant-company-level">Lv.${company.level}</span></div>
    <div class="merchant-company-capacity"><small>持有船只 / 总上限</small><strong>${company.ownedShips} <span>/ ${company.shipLimit} 艘</span></strong><small>${company.remaining ? `空余 ${company.remaining} 个船位` : '船位已满'}</small></div>
    <div class="merchant-company-goal"><small>${nextStage ? `下一级 · Lv.${nextStage.level}` : '最大经营规模'}</small><strong>${company.nextShipLimit || company.shipLimit} 艘船位</strong><span>${nextStage ? escape(nextStage.unlock) : '公司发展已完成'}</span></div>
    <div class="merchant-company-upgrade">${company.upgradeCost === null ? '' : `<strong class="merchant-company-cost">${money(company.upgradeCost)} <span>CR</span></strong>`}<button type="button" data-merchant-action="upgrade-company" data-button-state="${company.upgradeCost === null ? 'complete' : hint ? 'blocked' : 'ready'}" ${company.upgradeCost === null || hint ? 'disabled' : ''}>${company.upgradeCost === null ? '最高等级' : `升级公司至 Lv.${company.level + 1}`}</button>${hint ? `<small role="status">${hint}</small>` : ''}</div>
    <details class="merchant-company-roadmap" ${pathOpen ? 'open' : ''}><summary>公司发展路线</summary><ol>${path}</ol></details>`;
}

function ownedShipGroups(merchant) {
  return MERCHANT_SHIPS.map(type => {
    const ships = merchant.ships.filter(ship => ship.typeId === type.id);
    if (!ships.length) return '';
    const free = ships.filter(ship => !ship.taskId).length;
    return `<details class="merchant-ship-card merchant-owned-group" data-merchant-owned-type="${type.id}"><summary><img class="merchant-ship-art" src="${shipImage(type.id)}" alt="" aria-hidden="true"><span><small>拥有 ${ships.length} 艘 · 空闲 ${free} 艘</small><strong>${escape(type.name)}</strong><em>载量 ${type.capacity} · ${type.speed}× 航速</em></span></summary><div class="merchant-owned-list">${ships.map(ship => shipCard(ship, merchant)).join('')}</div></details>`;
  }).join('');
}

function procurementControls(type, merchant, inline = false) {
  const quantity = purchaseQuantities[type.id];
  const purchase = Merchant.getShipPurchaseQuote(merchant, type.id, quantity);
  return `<div class="merchant-procurement" data-merchant-procurement="${type.id}"><label>数量<input type="number" min="1" max="20" step="1" value="${quantity}" data-merchant-quantity="${type.id}" aria-label="${escape(type.name)}购船数量"></label><button type="button" data-merchant-action="${inline ? 'buy-in-form' : 'buy'}" data-type="${type.id}"><span data-merchant-buy-label>购入 ${quantity} 艘</span> · <span data-merchant-total>${purchase ? `${money(purchase.total)} CR` : '—'}</span></button><small data-merchant-buy-hint></small></div>`;
}

function availableShipTypes(merchant) {
  return MERCHANT_SHIPS.filter(type => Merchant.isShipTypeUnlocked(merchant, type.id));
}

function shipShopCard(type, merchant) {
  const owned = merchant.ships.filter(ship => ship.typeId === type.id).length;
  const purchase = Merchant.getShipPurchaseQuote(merchant, type.id);
  return `<article class="merchant-ship-card merchant-shop-card" data-merchant-shop-type="${type.id}"><img class="merchant-ship-art" src="${shipImage(type.id)}" alt="" aria-hidden="true"><small>可购买 · 已有 ${owned} 艘</small><h3>${escape(type.name)}</h3><div class="merchant-ship-spec"><span>载量 ${type.capacity}</span><span>航速 ${type.speed}×</span><span>往返基础费 ${type.fee} CR</span><span>下一艘 ${purchase ? `${money(purchase.nextPrice)} CR` : '—'}</span></div>${procurementControls(type, merchant)}</article>`;
}

function techCards(merchant) {
  return MERCHANT_TECHS.filter(tech => merchant.companyLevel >= tech.companyLevel || merchant.researchedTechIds.includes(tech.id)).map(tech => {
    const done = merchant.researchedTechIds.includes(tech.id);
    const missing = tech.requires.filter(id => !merchant.researchedTechIds.includes(id));
    const status = done ? '已完成' : missing.length ? `前置：${missing.map(id => Merchant.getTech(id).name).join('、')}` : '可研发';
    return `<article class="merchant-tech-card"><div><small>${escape(status)}</small><h3>${escape(tech.name)}</h3><p>解锁购买 ${escape(Merchant.getShipType(tech.unlockShipId).name)}</p></div><button type="button" data-merchant-action="research" data-button-state="${done ? 'complete' : missing.length ? 'blocked' : 'ready'}" data-tech="${tech.id}" ${done || missing.length ? 'disabled' : ''}>${done ? '已研发' : `研发 · ${money(tech.cost)} CR`}</button><small data-merchant-tech-hint></small></article>`;
  }).join('');
}

function renderShipShop(merchant) {
  const node = document.getElementById('merchant-ship-shop');
  if (!node) return;
  const signature = `${merchant.researchedTechIds.join(',')}:${MERCHANT_SHIPS.map(type => merchant.ships.filter(ship => ship.typeId === type.id).length).join(',')}`;
  if (node.dataset.merchantShopSignature === signature) return;
  node.innerHTML = availableShipTypes(merchant).map(type => shipShopCard(type, merchant)).join('');
  node.dataset.merchantShopSignature = signature;
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
      : !Merchant.isShipTypeUnlocked(state.merchant, type.id) ? `需研发${Merchant.getTech(type.techId).name}`
        : quantity > company.remaining ? company.remaining ? `仅剩 ${company.remaining} 个船位` : '船位已满'
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
  const stopped = route.stoppedTasks.map(task => `<p class="merchant-wait-note">${escape(task.id)} · 自动解除 · ${task.closedAt ? '已返港' : '返港中'}：${escape(task.reason)}</p>`).join('');
  return `<article class="merchant-report-card"><div class="merchant-report-route"><strong>${escape(label)}</strong><div class="merchant-report-profit"><small>近期净利</small><b>${route.profit >= 0 ? '+' : ''}${money(route.profit)} CR</b></div><button type="button" class="merchant-report-toggle" data-merchant-action="report-details" data-route="${escape(route.key)}" aria-label="${escape(label)}：逐笔收入" aria-expanded="${expanded}" aria-controls="${escape(detailId)}" title="${expanded ? '收起' : '查看'}逐笔收入"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h2"/><path class="merchant-report-toggle-chevron" d="m14 15 2 2 2-2"/></svg></button></div><div id="${escape(detailId)}" class="merchant-report-details" ${expanded ? '' : 'hidden'}><div class="merchant-section-head"><h3>逐笔收入</h3><span>${route.records.length} 笔</span></div><div class="merchant-report-transactions">${stopped}${route.records.length ? route.records.map(reportRow).join('') : '<p class="merchant-empty">暂无已结算收入</p>'}</div></div></article>`;
}

function renderReports(merchant) {
  const routes = buildMerchantRouteReports(merchant);
  const routeKeys = new Set(routes.map(route => route.key));
  for (const key of expandedReportRoutes) if (!routeKeys.has(key)) expandedReportRoutes.delete(key);
  const markup = routes.length ? routes.map(routeReportCard).join('') : '<p class="merchant-empty">暂无线路账目</p>';
  const reportRoot = document.getElementById('merchant-report-list');
  if (!reportRoot || reportMarkup === markup) return;
  const focusedRoute = document.activeElement?.dataset.merchantAction === 'report-details' ? document.activeElement.dataset.route : null;
  const scrollPositions = new Map(Array.from(document.querySelectorAll('.merchant-report-card'), card => [
    card.querySelector('[data-route]')?.dataset.route, card.querySelector('.merchant-report-transactions')?.scrollTop || 0,
  ]));
  reportRoot.innerHTML = markup;
  reportMarkup = markup;
  document.querySelectorAll('.merchant-report-card').forEach(card => {
    const list = card.querySelector('.merchant-report-transactions');
    if (list) list.scrollTop = scrollPositions.get(card.querySelector('[data-route]')?.dataset.route) || 0;
  });
  if (focusedRoute) {
    Array.from(document.querySelectorAll('[data-merchant-action="report-details"]')).find(button => button.dataset.route === focusedRoute)?.focus({ preventScroll: true });
  }
}

export function render(state) {
  if (!root || !state?.merchant) return;
  applyMerchantTheme(state);
  renderMerchantHeader(state);
  const merchant = state.merchant;
  const summary = Merchant.getMerchantSummary(state);
  const selectedTask = merchant.tasks.find(task => task.id === selectedTaskId) || merchant.tasks[0] || null;
  selectedTaskId = selectedTask?.id || null;
  const focusShip = merchant.ships.find(ship => ship.taskId === selectedTaskId && (ship.phase === 'outbound' || ship.phase === 'return'))
    || merchant.ships.find(ship => ship.taskId === selectedTaskId);
  const exploration = merchant.exploration?.event;
  const explorer = !selectedTask && merchant.ships.find(ship => ship.taskId === exploration?.id && ['exploring', 'explore_return'].includes(ship.phase));
  const displayShip = explorer || focusShip || (!selectedTask ? merchant.ships[0] : null);
  const exploring = Boolean(explorer);
  const explorationStage = explorer?.phase === 'explore_return' ? '探索返港' : Date.now() < exploration?.startedAt + exploration?.legMs ? '探索去程' : '勘察中';
  const traveling = exploring ? explorationStage !== '勘察中' : focusShip?.phase === 'outbound' || focusShip?.phase === 'return';
  const returnAt = exploring ? exploration.arriveAt + (exploration.status === 'exploring' ? exploration.legMs : 0) : 0;
  const progress = exploring ? Math.max(0, Math.min(1, (Date.now() - exploration.startedAt) / (returnAt - exploration.startedAt)))
    : traveling ? Math.max(0, Math.min(1, (Date.now() - focusShip.departAt) / Math.max(1, focusShip.arriveAt - focusShip.departAt))) : 0;
  const stageText = (id, value) => { const node = document.getElementById(id); if (node && node.textContent !== value) node.textContent = value; };
  stageText('merchant-stage-route-name', selectedTask ? `${portName(selectedTask.from)} → ${portName(selectedTask.to)}` : exploring ? `${portName(exploration.from)} → 未知信号` : '尚未安排航线');
  stageText('merchant-stage-status', selectedTask ? Merchant.getTaskStatus(merchant, selectedTask) : exploring ? explorationStage : '等待首项派遣');
  stageText('merchant-stage-subline', selectedTask ? `${goodName(selectedTask.goodId)} · ${selectedTask.rounds} 趟已完成 · ${focusShip ? shipLabel(focusShip) : '暂无飞船'}` : displayShip ? `${shipLabel(displayShip)} · ${exploring ? `约 ${formatDuration(returnAt - Date.now())} 返港` : '待命'}` : '暂无飞船');
  const stageImage = (selector, src) => { const node = document.querySelector(selector); if (node && node.getAttribute('src') !== src) node.src = src; };
  const stageFlight = document.querySelector('.merchant-stage-flight');
  if (stageFlight) {
    if (displayShip) stageImage('.merchant-stage-ship', shipImage(displayShip.typeId));
    stageFlight.classList.toggle('is-traveling', traveling);
    stageFlight.hidden = !displayShip;
  }
  const stageProgress = document.getElementById('merchant-stage-progress');
  if (stageProgress) stageProgress.style.width = `${Math.floor(progress * 100)}%`;
  const catchup = document.getElementById('merchant-catchup');
  if (catchup) {
    const pendingMs = Math.max(0, Date.now() - merchant.lastTickAt);
    catchup.hidden = pendingMs < 60_000;
    if (!catchup.hidden) catchup.textContent = `正在补算离线航次，还剩约 ${formatDuration(pendingMs)}；账目会持续更新。`;
  }
  const travelingCount = merchant.ships.filter(ship => ['outbound', 'return', 'exploring', 'explore_return'].includes(ship.phase)).length;
  const waitingCount = merchant.ships.filter(ship => ship.taskId && (ship.phase === 'waiting' || ship.phase === 'idle')).length;
  const currentTrip = exploring ? explorationStage : traveling && focusShip?.arriveAt ? `约${formatDuration(focusShip.arriveAt - Date.now()).replaceAll(' ', '')}抵达` : selectedTask ? `已完成${selectedTask.rounds}趟` : '等待首项派遣';
  setHtml('merchant-route-status', `<span><small>航行中</small><strong>${travelingCount} 艘</strong></span><span><small>港口停靠</small><strong>${waitingCount} 艘</strong></span><span><small>当前航次</small><strong>${currentTrip}</strong></span>`);
  setHtml('merchant-task-list', merchant.tasks.length ? merchant.tasks.map(task => taskCard(task, merchant)).join('') : '<div class="merchant-empty merchant-empty--command"><strong>暂无经营任务</strong><button type="button" class="merchant-primary" data-merchant-action="new">设置首条航线 ↗</button></div>');
  if (formTaskId === null) setHtml('merchant-detail-panel', selectedTask ? taskDetail(selectedTask, merchant) : emptyDetail(state));
  const restockEta = Math.max(0, merchant.nextRestockAt - Date.now());
  stageText('merchant-next-restock', `下次供需恢复约 ${formatDuration(restockEta)}`);
  const count = document.getElementById('merchant-task-count');
  if (count) count.textContent = `${merchant.tasks.length} 项 · ${summary.activeShips} 艘在途`;
  setHtml('merchant-feedback', feedback && Date.now() < feedbackUntil ? `<span>${escape(feedback)}</span>` : '');
  setHtml('merchant-market-list', MERCHANT_PORTS.map(port => marketCard(port, state)).join(''));
  setHtml('merchant-route-list', routeCards(state));
  const ownedRoot = document.getElementById('merchant-ship-list');
  const openTypes = new Set(Array.from(ownedRoot?.querySelectorAll('details[open]') || [], node => node.dataset.merchantOwnedType));
  setHtml('merchant-ship-list', ownedShipGroups(merchant));
  ownedRoot?.querySelectorAll('details').forEach(node => { if (openTypes.has(node.dataset.merchantOwnedType)) node.open = true; });
  renderShipShop(merchant);
  setHtml('merchant-company-growth', companyGrowth(state));
  document.querySelectorAll('#bottom-nav [data-view]').forEach(button => {
    button.hidden = !isMerchantViewUnlocked(merchant, button.dataset.view);
  });
  setHtml('merchant-tech-list', techCards(merchant));
  const techSection = document.getElementById('merchant-tech-section');
  if (techSection) techSection.hidden = !document.getElementById('merchant-tech-list')?.childElementCount;
  renderReports(merchant);
  if (formTaskId !== null) {
    const budgetInput = document.getElementById('merchant-form')?.elements.budget;
    if (budgetInput) budgetInput.max = String(state.credits + (merchant.tasks.find(task => task.id === formTaskId)?.budget || 0));
    refreshFormShipChoices(); refreshFormRoutes(state); renderPreview();
  }
  refreshPurchaseControls(state);
  onboarding?.refresh(state, { view: document.body.dataset.activeView || 'tasks', formOpen: formTaskId !== null });
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
  const lines = result.rows.map(row => `<p>${escape(Merchant.getShipType(row.typeId)?.name)}：${row.profit > 0 ? `${row.quantity} 单位 · 往返费用 ${money(row.fee)} CR · 预计净赚 ${money(row.profit)} CR` : escape(row.reason)}</p>`).join('');
  node.innerHTML = `<small>当前市场预估 · 出发时复核</small><strong>预计可成交 ${result.quantity} 单位 · 完整往返净利润 +${money(result.profit)} CR</strong>${lines}${result.reason ? `<p class="merchant-preview-warning">${escape(result.reason)}</p>` : ''}`;
  const existing = plan.taskId ? merchant.tasks.find(task => task.id === plan.taskId) : null;
  const pending = Boolean(existing?.pending || existing?.stopping);
  const invalidRoute = !merchant.unlockedPorts.includes(plan.from) || !merchant.unlockedPorts.includes(plan.to) ||
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
    fieldset.querySelectorAll('input[name="shipIds"]').forEach(input => { if (newShipIds.includes(input.value)) input.checked = true; });
    return;
  }
  const checked = [...fieldset.querySelectorAll('input[name="shipIds"]:checked')].map(input => input.value);
  const selected = [...new Set([...checked, ...newShipIds])];
  fieldset.innerHTML = `<legend>分配飞船</legend>${selectable.map(ship => `<label><input type="checkbox" name="shipIds" value="${escape(ship.id)}" ${selected.includes(ship.id) ? 'checked' : ''}><span>${escape(shipLabel(ship))}</span><small>载量 ${Merchant.getShipType(ship.typeId).capacity} · ${Merchant.getShipType(ship.typeId).speed}×</small></label>`).join('') || '<p>暂无空闲飞船</p>'}`;
}

function formRoutes(routes) {
  return routes.map(route => `<button type="button" data-merchant-action="select-route" data-from="${route.from}" data-to="${route.to}" data-good="${route.goodId}" data-merchant-route-available="${Boolean(route.opportunity)}" aria-pressed="false"><span>${escape(goodName(route.goodId))}</span><strong>${escape(portName(route.from))} → ${escape(portName(route.to))}</strong></button>`).join('');
}

function refreshFormRoutes(state) {
  const list = document.getElementById('merchant-form-route-list');
  if (!list) return;
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
  const state = getState();
  const merchant = state.merchant;
  formTaskId = task?.id || '';
  const plan = task || suggestion || { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', budget: Math.min(220, state.credits), shipIds: [] };
  const options = merchant.unlockedPorts.map(id => `<option value="${id}">${escape(portName(id))}</option>`).join('');
  const selectable = merchant.ships.filter(ship => !ship.taskId || ship.taskId === task?.id);
  const selectedShipIds = plan.shipIds.length ? plan.shipIds : task || suggestion?.purchaseTypeId ? [] : selectable.slice(0, 1).map(ship => ship.id);
  const node = document.getElementById('merchant-form-panel');
  document.getElementById('merchant-detail-panel').hidden = true;
  node.innerHTML = `<div class="merchant-form-head"><h2 tabindex="-1">${task ? '调整派遣' : '新派遣'}</h2><button type="button" data-merchant-action="close-form" aria-label="关闭派遣配置">×</button></div>
    <form id="merchant-form"><div class="merchant-form-step"><small>商路</small><div id="merchant-form-route-list" class="merchant-route-picks"></div></div>
    <div class="merchant-form-grid"><label>出发港<select name="from">${options}</select></label><label>目的港<select name="to">${options}</select></label><label>去程货物<select name="goodId">${MERCHANT_GOODS.map(good => `<option value="${good.id}">${escape(good.name)}</option>`).join('')}</select></label></div>
    <div class="merchant-form-step"><small>飞船与货本</small></div><fieldset id="merchant-ship-picks" class="merchant-ship-picks"><legend>分配飞船</legend>${selectable.map(ship => `<label><input type="checkbox" name="shipIds" value="${escape(ship.id)}" ${selectedShipIds.includes(ship.id) ? 'checked' : ''}><span>${escape(shipLabel(ship))}</span><small>载量 ${Merchant.getShipType(ship.typeId).capacity} · ${Merchant.getShipType(ship.typeId).speed}×</small></label>`).join('') || '<p>暂无空闲飞船</p>'}</fieldset>
    <details class="merchant-inline-shipyard" ${suggestion?.purchaseTypeId ? 'open' : ''}><summary>${suggestion?.purchaseTypeId ? `先添购${escape(Merchant.getShipType(suggestion.purchaseTypeId).name)}` : '添购飞船'}</summary><div class="merchant-inline-ship-list">${availableShipTypes(merchant).map(type => `<div class="merchant-inline-ship-row"><span>${escape(type.name)} · 载量 ${type.capacity} · ${type.speed}×</span>${procurementControls(type, merchant, true)}</div>`).join('')}</div></details>
    <label class="merchant-budget-field">周转货本 · CR<input name="budget" type="number" min="1" step="1" max="${state.credits + (task?.budget || 0)}" value="${plan.budget}" required></label>
    <div id="merchant-plan-preview" class="merchant-plan-preview"></div><p class="merchant-preview-warning" data-merchant-submit-hint role="status" hidden></p><div class="merchant-form-actions"><button type="button" data-merchant-action="close-form">返回</button><button type="submit" class="merchant-primary">${task ? '提交调整' : '确认派遣'} ↗</button></div></form>`;
  node.hidden = false;
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
  node.querySelector('h2')?.focus({ preventScroll: true });
}

function closeForm() {
  formTaskId = null;
  const node = document.getElementById('merchant-form-panel');
  if (node) node.hidden = true;
  const detail = document.getElementById('merchant-detail-panel');
  if (detail) detail.hidden = false;
  render(getState());
}

function act(action, payload) {
  const result = execute?.(action, payload);
  feedback = result?.msg || '';
  feedbackUntil = feedback ? Date.now() + 8000 : 0;
  if (result?.taskId) { selectedTaskId = result.taskId; starmap?.focusTask(result.taskId); }
  render(getState());
  return result;
}

export function notify(message) {
  feedback = message || '';
  feedbackUntil = feedback ? Date.now() + 8000 : 0;
}

function onClick(event) {
  const button = event.target.closest?.('[data-merchant-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.merchantAction;
  if (action === 'report-details') {
    const key = button.dataset.route;
    const expanded = !expandedReportRoutes.has(key);
    if (expanded) expandedReportRoutes.add(key); else expandedReportRoutes.delete(key);
    button.setAttribute('aria-expanded', String(expanded));
    button.title = `${expanded ? '收起' : '查看'}逐笔收入`;
    const details = document.getElementById(button.getAttribute('aria-controls'));
    if (details) details.hidden = !expanded;
    return;
  }
  if (action === 'market') { navigate?.('market'); return; }
  if (action === 'new') { navigate?.('tasks'); openForm(); return; }
  if (action === 'close-form') { closeForm(); document.querySelector('[data-merchant-action="new"]')?.focus(); return; }
  if (action === 'select-task') { selectedTaskId = button.dataset.id; starmap?.focusTask(selectedTaskId); closeForm(); return; }
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
    const opportunity = Merchant.findRouteOpportunity(getState(), button.dataset.from, button.dataset.to, button.dataset.good);
    navigate?.('tasks');
    openForm(null, {
      from: button.dataset.from, to: button.dataset.to, goodId: button.dataset.good,
      budget: opportunity?.budget ?? Math.min(220, getState().credits),
      shipIds: opportunity?.shipId ? [opportunity.shipId] : [],
      purchaseTypeId: opportunity?.purchaseCost ? opportunity.typeId : null,
    });
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
  if (action === 'research') act('researchTech', { techId: button.dataset.tech });
  if (action === 'upgrade-company') act('upgradeCompany', {});
}

function onSubmit(event) {
  if (event.target.id !== 'merchant-form') return;
  event.preventDefault();
  const plan = formPlan();
  const result = act(formTaskId ? 'update' : 'create', plan);
  if (result?.ok) closeForm();
}

function onChange(event) {
  if (event.target.matches?.('[data-merchant-quantity]')) {
    const typeId = event.target.dataset.merchantQuantity;
    const quantity = Number(event.target.value);
    if (Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 20) purchaseQuantities[typeId] = quantity;
    refreshPurchaseControls(getState());
  }
  if (event.target.closest?.('#merchant-form')) renderPreview();
}

export function renderScene(state) { starmap?.renderFrame(state); }

export function dispose() {
  onboarding?.dispose(); onboarding = null;
  starmap?.dispose(); starmap = null;
  if (root && clickListener) root.removeEventListener('click', clickListener);
  if (root && submitListener) root.removeEventListener('submit', submitListener);
  if (root && changeListener) { root.removeEventListener('input', changeListener); root.removeEventListener('change', changeListener); }
  root = getState = execute = navigate = clickListener = submitListener = changeListener = null;
  formTaskId = null; selectedTaskId = null; feedback = ''; feedbackUntil = 0;
  reportMarkup = null;
  expandedReportRoutes.clear();
}
