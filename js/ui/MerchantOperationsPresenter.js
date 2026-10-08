import * as Merchant from '../systems/merchant/MerchantSystem.js';
import { getPlanetIntelligence } from '../systems/merchant/MerchantIntelligence.js';
import { getExplorationRules, getExplorationStage } from '../systems/merchant/MerchantExploration.js';
import { buildMerchantDiscoveryStory, renderMerchantStory } from './MerchantStory.js';

const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const duration = ms => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};

export function createMerchantOperationsPresenter({ doc = document, getState, execute, openExploration, openPort, onResearchShown = () => {}, onResearchRequested = () => {} }) {
  const host = doc.getElementById('merchant-research');
  const taskPanel = doc.getElementById('merchant-dispatch-tasks');
  const tabs = [...doc.querySelectorAll('[data-operation="tab"]')];
  const discovery = doc.getElementById('merchant-discovery-notice');
  let activeTab = 'tasks', dismissedDiscoveryId = '', discoveryMarkup = '';
  function replace(node, html) {
    if (discoveryMarkup === html) return;
    const focusedAction = node.contains(doc.activeElement) ? doc.activeElement?.dataset.operation : null;
    node.innerHTML = html; discoveryMarkup = html;
    if (focusedAction) (Array.from(node.querySelectorAll('button')).find(button => button.dataset.operation === focusedAction)
      || node.querySelector('[data-operation="explore"]'))?.focus({ preventScroll: true });
  }
  function showTab(name, focus = false) {
    if (!['tasks', 'research'].includes(name)) return;
    const changed = activeTab !== name;
    activeTab = name;
    doc.getElementById('merchant-dispatch').dataset.tab = name;
    taskPanel.hidden = name !== 'tasks'; host.hidden = name !== 'research';
    for (const tab of tabs) {
      const current = tab.dataset.tab === name;
      tab.setAttribute('aria-selected', String(current)); tab.tabIndex = current ? 0 : -1;
      if (current && focus) tab.focus({ preventScroll: true });
    }
    if (changed && name === 'research') onResearchShown();
  }
  function render(state = getState()) {
    const merchant = state.merchant;
    showTab(activeTab);
    const event = merchant.exploration?.event;
    discovery.hidden = !event || event.status === 'available' && event.id === dismissedDiscoveryId;
    if (event) {
      const complete = event.status === 'completed';
      const intel = getPlanetIntelligence(merchant, event.portId);
      const rule = getExplorationRules(event.portId);
      const stage = getExplorationStage(event, merchant.lastTickAt);
      const needsShip = event.status === 'available' && !merchant.ships.some(ship => !ship.taskId && ship.phase === 'idle');
      const company = Merchant.getCompanyProgress(merchant);
      const needsBerth = needsShip && !company.remaining && !merchant.researchedTechIds.includes('berth_planning');
      const purchase = needsShip && company.remaining ? Merchant.getShipPurchaseQuote(merchant, 'courier') : null;
      const preparationTarget = purchase ? purchase.total + rule.cost + Merchant.getOperatingReserve(state) : 0;
      const canBuy = Boolean(purchase && state.credits >= preparationTarget);
      const preparation = needsBerth ? '当前船位已满，先研发船位规划增加1个船位，让原船继续经营，再为探索添购空闲轻舟。'
        : purchase ? `添购起家轻舟需 ${purchase.total.toLocaleString('zh-CN')} CR，探索另需 ${rule.cost.toLocaleString('zh-CN')} CR。可用 ${Math.floor(state.credits).toLocaleString('zh-CN')} / ${preparationTarget.toLocaleString('zh-CN')} CR；备齐后添船，原商路继续经营。`
          : needsShip ? '目前没有空闲船，请调整或结束一项航运任务，等船完整返港后再安排探索。' : '';
      const text = complete ? `${Merchant.getPort(event.portId).name}已开放，探索船已返港。`
        : event.status === 'available' ? intel ? `${Merchant.getPort(event.portId).name}坐标已标记，可以安排空闲船探索。` : `${event.portId === 'nebula_forge' ? '探索已解锁，' : ''}发现未知星球信号，可以安排空闲船探索。`
          : event.status === 'returning' ? `${Merchant.getPort(event.portId).name}已发现，探索船正在返港，返港后开放商路。`
            : stage === 'surveying' ? '探索船已抵达，正在现场勘察；勘察结束后返航，完整返港后开放商路。' : '探索船正在去程飞行，抵达后开始现场勘察。';
      const communication = buildMerchantDiscoveryStory(event, state);
      const timing = event.status === 'available' ? `<p>去程飞行 → 现场勘察${duration(rule.surveyMs)} → 返程飞行，完整返港后开放商路。</p>` : !complete ? '<p data-discovery-timing></p>' : '';
      const preparationButton = needsBerth ? '<button type="button" data-operation="research-berth">研发船位规划</button>'
        : purchase ? `<button type="button" data-operation="buy-explorer" data-button-state="${canBuy ? 'ready' : 'blocked'}" ${canBuy ? '' : 'disabled'}>添购探索轻舟 · ${purchase.total.toLocaleString('zh-CN')} CR</button>` : '';
      replace(discovery, `<div class="merchant-discovery-copy">${renderMerchantStory(communication, '', `<p>${escape(text)}</p>${preparation ? `<p>${escape(preparation)}</p>` : ''}${timing}`)}</div><div class="merchant-discovery-actions">${communication ? '<small class="merchant-onboarding-response-label">你的回应</small>' : ''}${preparationButton}<button type="button" data-operation="${complete ? 'port' : 'explore'}" data-port="${escape(event.portId)}">${complete ? '查看新港商路' : event.status === 'available' ? '前往探索' : '查看探索'}</button>${event.status === 'available' ? '<button type="button" data-operation="dismiss-exploration">稍后</button>' : ''}</div>`);
      const timer = discovery.querySelector('[data-discovery-timing]');
      if (timer) timer.textContent = stage === 'surveying' ? `现场勘察剩余 ${duration(event.arriveAt - merchant.lastTickAt)}`
        : `约 ${duration(event.arriveAt + (event.status === 'exploring' ? event.legMs : 0) - merchant.lastTickAt)} 后返港`;
    }
  }
  function click(event) {
    const button = event.target.closest?.('button[data-operation]');
    if (!button || button.disabled) return;
    const action = button.dataset.operation;
    if (action === 'tab') { showTab(button.dataset.tab); return; }
    if (action === 'show-research') { showTab('research', true); return; }
    if (action === 'research-berth') { showTab('research', true); onResearchRequested('berth_planning'); return; }
    if (action === 'buy-explorer') {
      const state = getState();
      if (state.merchant.exploration.event?.status === 'available'
        && !state.merchant.ships.some(ship => !ship.taskId && ship.phase === 'idle')) execute?.('buyShip', { typeId: 'courier', quantity: 1 });
      render(); return;
    }
    if (action === 'explore') { openExploration(); return; }
    if (action === 'dismiss-exploration') dismissedDiscoveryId = getState().merchant.exploration.event?.id || '';
    if (action === 'port') { openPort(button.dataset.port); return; }
    render();
  }
  function keydown(event) {
    const tab = event.target.closest?.('[data-operation="tab"]');
    if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    showTab(tabs[next].dataset.tab, true);
  }
  function enter() { showTab('tasks'); render(); }
  function showExplorerPreparation() {
    dismissedDiscoveryId = ''; enter();
    discovery.tabIndex = -1;
    discovery.focus({ preventScroll: true });
    discovery.scrollIntoView({ block: 'start' });
  }
  const parent = doc.getElementById('merchant-task-workspace');
  parent.addEventListener('click', click); parent.addEventListener('keydown', keydown);
  return { render, enter, showExplorerPreparation, showTasks: () => showTab('tasks'), showResearch: () => showTab('research', true), dispose() { parent.removeEventListener('click', click); parent.removeEventListener('keydown', keydown); } };
}
