import { getPort, getGood, listRouteOpportunities, isMerchantGoodKnown, isPortOpen } from '../systems/merchant/MerchantSystem.js';

const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function createMerchantPortPanel({ doc, map, getState, onRoute, onOpen = () => {} }) {
  const panel = doc.createElement('section');
  panel.className = 'merchant-form-panel merchant-port-panel';
  panel.setAttribute('aria-label', '港口经营信息');
  panel.hidden = true;
  map.appendChild(panel);
  let selected = '', stateRef = null, visible = false, panelContent = '';
  function refresh(state, ready) {
    stateRef = state; visible = ready;
    panel.hidden = !ready || !selected || !isPortOpen(state?.merchant, selected);
    if (panel.hidden) return;
    const port = getPort(selected), market = state.merchant.markets[selected];
    const rows = ['supply', 'demand'].flatMap(side => Object.entries(port[side]).filter(([good]) => isMerchantGoodKnown(state.merchant, good))
      .map(([good, max]) => `<p>${side === 'supply' ? '供给' : '需求'} ${escape(getGood(good).name)}：${market[side][good]} / ${max}</p>`));
    const routes = listRouteOpportunities(state).filter(route => route.from === selected || route.to === selected);
    const content = `<header class="merchant-form-head"><h2 tabindex="-1">${escape(port.name)}</h2><button type="button" class="ui-close-button" data-port-close aria-label="关闭港口详情">×</button></header><small>${escape(port.role)}</small><div class="merchant-exploration-ledger">${rows.join('')}</div><h3>可用商路</h3>${routes.map(route => `<div class="merchant-port-route"><strong>${escape(getPort(route.from).name)} → ${escape(getPort(route.to).name)}</strong><p>${escape(getGood(route.goodId).name)} · ${route.opportunity ? `预计净利 +${route.opportunity.profit} CR` : '查看资金、供需与运力条件'}</p><button type="button" data-port-route data-from="${route.from}" data-to="${route.to}" data-good="${route.goodId}">配置此商路</button></div>`).join('')}`;
    if (panelContent !== content) {
      const active = doc.activeElement, focused = panel.contains?.(active);
      const key = focused && active?.getAttribute?.('data-from') ? [active.dataset.from, active.dataset.to, active.dataset.good].join(':') : null;
      panel.innerHTML = content; panelContent = content;
      if (focused) ([...panel.querySelectorAll('[data-port-route]')].find(button => [button.dataset.from, button.dataset.to, button.dataset.good].join(':') === key) || panel.querySelector('[data-port-close]'))?.focus();
    }
  }
  function show(id) { selected = id; onOpen(); refresh(getState?.() || stateRef, visible); panel.querySelector('h2')?.focus(); }
  function close(focus = true) { selected = ''; refresh(getState?.() || stateRef, visible); if (focus) map.focus?.(); }
  const click = event => {
    if (event.target.closest?.('[data-port-close]')) { close(); return; }
    const route = event.target.closest?.('[data-port-route]');
    if (route) { close(false); onRoute?.({ from: route.dataset.from, to: route.dataset.to, goodId: route.dataset.good }); }
  };
  const keydown = event => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
  panel.addEventListener('click', click); panel.addEventListener('keydown', keydown);
  return { refresh, show, close, dispose() { panel.removeEventListener('click', click); panel.removeEventListener('keydown', keydown); panel.remove(); } };
}
