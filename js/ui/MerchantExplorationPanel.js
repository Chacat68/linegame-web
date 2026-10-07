import { getExplorationPreview, getPort, getShipType, getGood, getOpenPortIds } from '../systems/merchant/MerchantSystem.js';
import { getExplorationStage } from '../systems/merchant/MerchantExploration.js';
import { getPlanetIntelligence } from '../systems/merchant/MerchantIntelligence.js';

const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const duration = ms => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};

// 只展示与提交玩家的探索安排；信号的产生、船只占用与开港均由经营系统负责。
export function createMerchantExplorationPanel({ doc, map, renderer, getState, execute, onPort = () => {}, onFleet = () => {}, onOpen = () => {} }) {
  const signal = doc.createElement('button');
  signal.type = 'button';
  signal.className = 'merchant-exploration-signal';
  signal.hidden = true;
  signal.setAttribute('aria-expanded', 'false');
  signal.setAttribute('aria-controls', 'merchant-exploration-panel');
  const panel = doc.createElement('section');
  panel.id = 'merchant-exploration-panel';
  panel.className = 'merchant-form-panel merchant-exploration-panel';
  panel.setAttribute('aria-label', '星图探索事件');
  panel.hidden = true;
  map.appendChild(signal);
  map.appendChild(panel);
  let stateRef = null;
  let visible = false;
  let open = false;
  let signature = '';
  let selectedShip = '';
  let selectedFrom = '';
  let feedback = '';
  let lastEventId = '';

  function refreshPreview() {
    const state = getState?.() || stateRef;
    if (!state || state.merchant.exploration?.event?.status !== 'available') return;
    const preview = getExplorationPreview(state, { shipId: selectedShip, from: selectedFrom });
    const fee = panel.querySelector('[data-exploration-cost]');
    const eta = panel.querySelector('[data-exploration-eta]');
    const balance = panel.querySelector('[data-exploration-balance]');
    const hint = panel.querySelector('[data-exploration-feedback]');
    const submit = panel.querySelector('[data-exploration-dispatch]');
    fee.textContent = `${preview.cost.toLocaleString('zh-CN')} CR`;
    eta.textContent = preview.durationMs ? duration(preview.durationMs) : '—';
    balance.textContent = state.credits >= preview.cost ? `${(state.credits - preview.cost).toLocaleString('zh-CN')} CR` : '—';
    hint.textContent = feedback || (preview.ok ? '' : preview.reason);
    submit.disabled = !preview.ok;
    submit.dataset.buttonState = preview.ok ? 'ready' : 'blocked';
  }

  function renderDetails(state, event, now) {
    const free = state.merchant.ships.filter(ship => !ship.taskId && ship.phase === 'idle');
    const opened = getOpenPortIds(state.merchant);
    const intel = getPlanetIntelligence(state.merchant, event.portId);
    const nextSignature = JSON.stringify([event, free.map(ship => [ship.id, ship.typeId]), opened, Boolean(intel)]);
    if (signature !== nextSignature) {
      const active = doc.activeElement;
      const hadFocus = Boolean(panel.contains?.(active));
      const focused = hadFocus ? active?.getAttribute('data-exploration-field') : null;
      signature = nextSignature;
      if (!free.some(ship => ship.id === selectedShip)) selectedShip = free[0]?.id || '';
      if (!opened.includes(selectedFrom)) selectedFrom = opened[0] || '';
      const discovered = event.status === 'returning' || event.status === 'completed';
      const port = discovered || intel ? getPort(event.portId) : null;
      const title = port?.name || '未知星球';
      const description = intel && !discovered ? `情报线索 · ${intel.detail}` : port ? `${port.role} · 产出${Object.keys(port.supply).map(id => getGood(id)?.name || id).join('、')}` : '派船勘察，寻找新的星球与商路';
      const head = `<header class="merchant-form-head"><div><small>探索${event.status === 'completed' ? '完成' : discovered ? '发现' : '任务'}</small><h2>${escape(title)}</h2></div><button type="button" class="ui-close-button" data-exploration-close aria-label="关闭探索详情" title="关闭">×</button></header><p class="merchant-exploration-note">${escape(description)}</p>`;
      if (event.status === 'available') {
        panel.innerHTML = `${head}<form data-exploration-form>
          <label class="merchant-exploration-field">出发港口<select name="from" data-exploration-field="from" aria-label="探索出发港口">${opened.map(id => `<option value="${escape(id)}" ${id === selectedFrom ? 'selected' : ''}>${escape(getPort(id)?.name || id)}</option>`).join('')}</select></label>
          <label class="merchant-exploration-field">探索船只<select name="shipId" data-exploration-field="ship" aria-label="探索船只" ${free.length ? '' : 'disabled'}>${free.length ? free.map(ship => `<option value="${escape(ship.id)}" ${ship.id === selectedShip ? 'selected' : ''}>${escape(getShipType(ship.typeId)?.name || ship.typeId)} · ${escape(ship.id.replace('ship-', '#'))}</option>`).join('') : '<option value="">暂无空闲船只</option>'}</select></label>
          <div class="merchant-exploration-ledger"><p><span>探索费用</span><strong data-exploration-cost></strong></p><p><span>预计往返</span><strong data-exploration-eta></strong></p><p><span>扣费后可用 CR</span><strong data-exploration-balance></strong></p><p><span>返港后开放</span><strong>新港与商路</strong></p></div>
          <p class="merchant-exploration-note">探索期间占用所选船只，完成后自动返港待命。</p>
          <p class="merchant-exploration-feedback" data-exploration-feedback role="status"></p><button type="submit" data-exploration-dispatch>派船探索</button>${free.length ? '' : '<button type="button" data-exploration-fleet>查看船队</button>'}</form>`;
      } else if (event.status === 'completed') {
        panel.innerHTML = `${head}<div class="merchant-exploration-result"><span aria-hidden="true">✦</span><p>新港与商路已开放</p><p>探索船已返港待命</p></div><button type="button" data-exploration-port>查看新港商路 ↗</button>`;
      } else {
        const ship = state.merchant.ships.find(item => item.id === event.shipId);
        panel.innerHTML = `${head}<div class="merchant-exploration-ledger"><p><span>探索船只</span><strong>${escape(getShipType(ship?.typeId)?.name || event.shipId)}</strong></p><p><span>出发港口</span><strong>${escape(getPort(event.from)?.name || event.from)}</strong></p><p><span>当前状态</span><strong data-exploration-stage></strong></p><p><span>预计返港</span><strong data-exploration-remaining></strong></p></div><div class="merchant-exploration-progress" role="progressbar" aria-label="探索往返进度" aria-valuemin="0" aria-valuemax="100"><i></i></div>`;
      }
      const restoreField = focused && panel.querySelector(`[data-exploration-field="${focused}"]`);
      if (hadFocus) (restoreField || panel.querySelector('[data-exploration-close]'))?.focus();
    }
    if (event.status === 'available') refreshPreview();
    if (event.status === 'exploring' || event.status === 'returning') {
      const returning = event.status === 'returning';
      const endsAt = returning ? event.arriveAt : event.arriveAt + event.legMs;
      const stage = { returning: '探索返港', outbound: '探索去程', surveying: '勘察中' }[getExplorationStage(event, now)];
      const progress = Math.round(Math.max(0, Math.min(1, (now - event.startedAt) / (endsAt - event.startedAt))) * 100);
      panel.querySelector('[data-exploration-stage]').textContent = stage;
      panel.querySelector('[data-exploration-remaining]').textContent = duration(endsAt - now);
      const bar = panel.querySelector('[role="progressbar"]');
      bar.setAttribute('aria-valuenow', String(progress));
      bar.querySelector('i').style.width = `${progress}%`;
    }
  }

  function refresh(state, ready, now = Date.now()) {
    stateRef = state;
    const event = state?.merchant?.exploration?.event;
    visible = ready && Boolean(event);
    if (lastEventId !== event?.id) {
      lastEventId = event?.id || '';
      signature = '';
      feedback = '';
      open = false;
    }
    panel.hidden = !visible || !open;
    signal.hidden = !visible || open;
    signal.setAttribute('aria-expanded', String(open));
    if (!visible) return;
    const stage = getExplorationStage(event, now);
    const label = { available: '待探索', outbound: '探索去程', surveying: '勘察中', returning: '返港后开放', completed: '查看新港商路 ↗' }[stage];
    const title = event.status === 'completed' ? '新港已开放' : event.status === 'returning' || getPlanetIntelligence(state.merchant, event.portId) ? getPort(event.portId)?.name : '未知星球';
    const markup = `<span class="merchant-exploration-symbol" aria-hidden="true">◇</span><span class="merchant-exploration-caption"><strong>${escape(title)}</strong><small>${escape(label)}</small></span>`;
    if (signal.innerHTML !== markup) signal.innerHTML = markup;
    signal.setAttribute('aria-label', `探索事件：${label}`);
    // 标记随场景平移；移出取景时保留紧凑入口，避免玩家找不到已出现的事件。
    const point = renderer.getExplorationScreenPosition?.(event.portId);
    const bounds = map.getBoundingClientRect?.();
    const resource = doc.getElementById?.('merchant-resource-bar')?.getBoundingClientRect?.();
    const navigation = doc.querySelector?.('.bottom-nav')?.getBoundingClientRect?.();
    const radius = point?.radius || 0;
    const halfWidth = Math.max(78, radius);
    const safeTop = resource && bounds ? resource.bottom - bounds.top + 8 : 52;
    const fits = point?.onScreen && (!bounds || point.x > halfWidth + 8 && point.x < bounds.width - halfWidth - 8) &&
      point.y - radius - 54 - 12 > safeTop &&
      (!navigation || !bounds || point.y + radius + (event.status === 'completed' ? 54 : 14) < navigation.top - bounds.top - 8);
    signal.classList.toggle('is-on-signal', Boolean(fits));
    signal.classList.toggle('is-completed', event.status === 'completed');
    signal.style.setProperty?.('--exploration-diameter', `${Math.max(44, radius * 2)}px`);
    if (fits) { signal.style.left = `${point.x}px`; signal.style.top = `${point.y}px`; }
    else { signal.style.left = ''; signal.style.top = ''; }
    if (open) renderDetails(state, event, now);
  }

  function show() {
    onOpen();
    open = true;
    refresh(getState?.() || stateRef, visible);
    panel.querySelector('[data-exploration-field]')?.focus();
    if (!panel.querySelector('[data-exploration-field]')) panel.querySelector('[data-exploration-close]')?.focus();
  }
  function close(focus = true) {
    open = false;
    refresh(getState?.() || stateRef, visible);
    if (focus) signal.focus();
  }
  const click = event => {
    if (event.target.closest?.('[data-exploration-close]')) { close(); return; }
    if (event.target.closest?.('[data-exploration-port]')) {
      const portId = stateRef?.merchant.exploration.event?.portId;
      close(false); onPort(portId);
    }
    if (event.target.closest?.('[data-exploration-fleet]')) { close(false); onFleet(); }
  };
  const change = event => {
    const field = event.target.getAttribute('data-exploration-field');
    if (field === 'from') selectedFrom = event.target.value;
    if (field === 'ship') selectedShip = event.target.value;
    feedback = '';
    refreshPreview();
  };
  const submit = event => {
    if (!event.target.matches?.('[data-exploration-form]')) return;
    event.preventDefault();
    const current = getState?.() || stateRef;
    const result = execute?.('explore', { eventId: current.merchant.exploration.event.id, shipId: selectedShip, from: selectedFrom });
    feedback = result?.msg || '';
    refresh(getState?.() || stateRef, visible);
  };
  const keydown = event => { if (event.key === 'Escape') { event.preventDefault(); close(); } };
  const signalClick = () => {
    const event = stateRef?.merchant.exploration.event;
    if (event?.status === 'completed') { close(false); onPort(event.portId); }
    else show();
  };
  signal.addEventListener('click', signalClick);
  panel.addEventListener('click', click);
  panel.addEventListener('change', change);
  panel.addEventListener('submit', submit);
  panel.addEventListener('keydown', keydown);

  return {
    refresh, show, close,
    dispose() {
      signal.removeEventListener('click', signalClick);
      panel.removeEventListener('click', click);
      panel.removeEventListener('change', change);
      panel.removeEventListener('submit', submit);
      panel.removeEventListener('keydown', keydown);
      signal.remove();
      panel.remove();
    },
  };
}
