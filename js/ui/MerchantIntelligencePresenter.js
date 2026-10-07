import { MERCHANT_INTELLIGENCE, MERCHANT_EXPLORATION_TARGETS } from '../data/merchant.js';
import { getIntelligenceOffer, getPort, getTech } from '../systems/merchant/MerchantSystem.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const money = value => value.toLocaleString('zh-CN');

function nextStep(offer, merchant, rule) {
  if (offer.opened) return '探索已完成，新港与商路已开放。';
  const event = merchant.exploration.event;
  if (event?.portId === offer.targetPortId) return event.status === 'available'
    ? '坐标已标记，可安排空闲船探索；探索费用另付。'
    : '探索正在进行，完整返港后开放商路。';
  if (merchant.companyLevel < rule.companyLevel) return `公司 Lv.${rule.companyLevel} 开放${getTech(rule.techId).name}研发。`;
  if (!merchant.researchedTechIds.includes(rule.techId)) return `请先研发${getTech(rule.techId).name}。`;
  if (rule.requiresPorts.some(id => !merchant.unlockedPorts.includes(id))) return `需先探索并开放${rule.requiresPorts.map(id => getPort(id).name).join('、')}。`;
  return '请先完成当前探索，已购坐标会自动标记下一个信号。';
}

function card(offer, merchant) {
  const rule = MERCHANT_EXPLORATION_TARGETS.find(item => item.targetPortId === offer.targetPortId);
  const event = merchant.exploration.event;
  const exploring = event?.portId === offer.targetPortId && event.status !== 'completed';
  const title = offer.known ? getPort(offer.targetPortId).name : offer.title;
  const state = offer.known ? 'complete' : offer.ok ? 'ready' : 'blocked';
  const action = offer.opened ? 'port' : offer.known && exploring ? 'explore' : 'buy';
  const enabled = action !== 'buy' || offer.ok;
  const label = action === 'port' ? '查看港口商路' : action === 'explore' ? event.status === 'available' ? '前往探索' : '查看探索'
    : offer.known ? offer.purchased ? '情报已收藏' : '勘察已获取' : `购买情报 · ${money(offer.cost)} CR`;
  return `<article class="merchant-intel-card" data-intel="${escape(offer.id)}" data-intel-known="${offer.known}">
    <div class="merchant-intel-heading"><span class="merchant-intel-symbol" aria-hidden="true">◇</span><div><small>星球情报 · ${offer.known ? offer.purchased ? '已收藏' : '勘察已获取' : `Lv.${offer.companyLevel} 开放交易`}</small><h3 tabindex="-1">${escape(title)}</h3></div></div>
    <p class="merchant-intel-description">${escape(offer.known ? offer.detail : offer.summary)}</p>
    <dl class="merchant-intel-ledger"><div><dt>${offer.known ? '情报来源' : '情报费用'}</dt><dd>${offer.known ? offer.purchased ? '市场购买 · 永久保留' : '探索勘察' : `${money(offer.cost)} CR · 一次购买`}</dd></div>${offer.known ? `<div><dt>探索另需</dt><dd>${money(rule.cost)} CR</dd></div><div><dt>勘察条件</dt><dd>Lv.${rule.companyLevel} · ${escape(getTech(rule.techId).name)}</dd></div>` : ''}</dl>
    <p class="merchant-intel-hint" data-intel-hint>${escape(offer.known ? nextStep(offer, merchant, rule) : offer.reason || '购买后获取身份与资源线索，商路仍需完成探索。')}</p>
    <button type="button" data-intel-action="${action}" data-intel-id="${escape(offer.id)}" data-button-state="${enabled && action !== 'buy' ? 'ready' : state}" ${enabled ? '' : 'disabled'}>${escape(label)}</button>
  </article>`;
}

// 情报属于市场玩法，购买与探索仍经统一经营命令执行。
export function createMerchantIntelligencePresenter({ doc = document, getState, buy, openExploration, openPort }) {
  const host = doc.getElementById('merchant-intelligence');
  const list = doc.getElementById('merchant-intelligence-list');
  const status = doc.getElementById('merchant-intelligence-status');
  let markup = '';
  function render(state = getState()) {
    const offers = MERCHANT_INTELLIGENCE.map(item => getIntelligenceOffer(state, item.id));
    doc.getElementById('merchant-intelligence-count').textContent = `已获取 ${offers.filter(item => item.known).length} / ${offers.length}`;
    const next = offers.map(offer => card(offer, state.merchant)).join('');
    if (markup === next) return;
    const active = doc.activeElement;
    const focusedId = list.contains(active) ? active.closest('[data-intel]')?.dataset.intel : null;
    const focusedAction = focusedId ? active.dataset.intelAction : null;
    list.innerHTML = next; markup = next;
    if (focusedId) {
      const current = list.querySelector(`[data-intel="${focusedId}"]`);
      const button = current.querySelector(`[data-intel-action="${focusedAction}"]`);
      (button && !button.disabled ? button : current.querySelector('h3')).focus({ preventScroll: true });
    }
  }
  function click(event) {
    const button = event.target.closest?.('[data-intel-action]');
    if (!button || button.disabled) return;
    const offer = getIntelligenceOffer(getState(), button.dataset.intelId);
    if (!offer) return;
    if (button.dataset.intelAction === 'buy') {
      const result = buy({ intelId: offer.id });
      status.textContent = result?.msg || '';
      if (result?.ok) list.querySelector(`[data-intel="${offer.id}"] h3`)?.focus({ preventScroll: true });
    } else if (button.dataset.intelAction === 'port' && offer.opened) {
      openPort(offer.targetPortId);
    } else if (button.dataset.intelAction === 'explore' && getState().merchant.exploration.event?.portId === offer.targetPortId) {
      openExploration();
    }
  }
  host.addEventListener('click', click);
  return { render, dispose() { host.removeEventListener('click', click); } };
}
