import * as Merchant from '../systems/merchant/MerchantSystem.js';
import { getPlanetIntelligence } from '../systems/merchant/MerchantIntelligence.js';

const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function createMerchantOperationsPresenter({ doc = document, getState, openExploration, openPort, onResearchShown = () => {} }) {
  const host = doc.getElementById('merchant-research');
  const taskPanel = doc.getElementById('merchant-dispatch-tasks');
  const tabs = [...doc.querySelectorAll('[data-operation="tab"]')];
  const discovery = doc.getElementById('merchant-discovery-notice');
  let activeTab = 'tasks', dismissedDiscoveryId = '', discoveryMarkup = '';
  function replace(node, html) {
    if (discoveryMarkup === html) return;
    node.innerHTML = html; discoveryMarkup = html;
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
      const text = complete ? `${Merchant.getPort(event.portId).name}已开放，探索船已返港。`
        : event.status === 'available' ? intel ? `${Merchant.getPort(event.portId).name}坐标已标记，可以安排空闲船探索。` : `${event.portId === 'nebula_forge' ? '探索已解锁，' : ''}发现未知星球信号，可以安排空闲船探索。`
          : event.status === 'returning' ? `${Merchant.getPort(event.portId).name}已发现，探索船正在返港，返港后开放商路。`
            : '探索正在进行，完整返港后开放商路。';
      replace(discovery, `<p>${escape(text)}</p><div class="merchant-discovery-actions"><button type="button" data-operation="${complete ? 'port' : 'explore'}" data-port="${escape(event.portId)}">${complete ? '查看新港商路' : event.status === 'available' ? '前往探索' : '查看探索'}</button>${event.status === 'available' ? '<button type="button" data-operation="dismiss-exploration">稍后</button>' : ''}</div>`);
    }
  }
  function click(event) {
    const button = event.target.closest?.('button[data-operation]');
    if (!button || button.disabled) return;
    const action = button.dataset.operation;
    if (action === 'tab') { showTab(button.dataset.tab); return; }
    if (action === 'show-research') { showTab('research', true); return; }
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
  const parent = doc.getElementById('merchant-task-workspace');
  parent.addEventListener('click', click); parent.addEventListener('keydown', keydown);
  return { render, enter, showTasks: () => showTab('tasks'), showResearch: () => showTab('research', true), dispose() { parent.removeEventListener('click', click); parent.removeEventListener('keydown', keydown); } };
}
