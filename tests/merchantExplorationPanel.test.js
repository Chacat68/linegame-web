import { restoreLegacyMerchantAccess } from '../js/systems/merchant/MerchantTechnology.js';
import { expect, it, vi } from 'vitest';
import { createInitialState } from '../js/data/constants.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { createMerchantExplorationPanel } from '../js/ui/MerchantExplorationPanel.js';

import { documentFixture } from './helpers/merchantDom.js';

function harness() {
  let now = 1_800_000_000_000;
  const state = createInitialState({ credits: 5000 });
  state.merchant.companyLevel = 29; state.merchant.exploration.rngState = 42;
  restoreLegacyMerchantAccess(state.merchant);
  Merchant.init(state, now); Merchant.advance(state, now);
  now = state.merchant.exploration.event.appearedAt; Merchant.advance(state, now);
  const purchased = Merchant.command(state, 'buyShip', { typeId: 'clipper' }, now);
  expect(purchased.ok).toBe(true);
  const doc = documentFixture(), map = doc.createElement('div'); doc.body.appendChild(map);
  const renderer = { getExplorationScreenPosition: vi.fn() };
  const execute = vi.fn((action, input) => Merchant.command(state, action, input, now));
  const onPort = vi.fn(), onFleet = vi.fn();
  const api = createMerchantExplorationPanel({ doc, map, renderer, getState: () => state, execute, onPort, onFleet });
  const [signal, panel] = map.children;
  const refresh = () => api.refresh(state, true, now);
  refresh(); signal.fire('click');
  return { state, doc, map, signal, panel, api, renderer, execute, onPort, onFleet, shipId: purchased.shipIds[0], refresh,
    buy: typeId => Merchant.command(state, 'buyShip', { typeId }, now),
    advance: at => { now = at; Merchant.advance(state, now); refresh(); },
  };
}

it('可用船变化重绘表单仍保留选择，并将焦点恢复到新选择控件', () => {
  const h = harness();
  const from = h.panel.querySelector('[data-exploration-field="from"]');
  from.value = 'mineral_belt'; from.fire('change');
  const ship = h.panel.querySelector('[data-exploration-field="ship"]');
  ship.value = h.shipId; ship.fire('change'); ship.focus();
  expect(h.buy('hauler').ok).toBe(true); h.refresh();
  const restored = h.panel.querySelector('[data-exploration-field="ship"]');
  expect(restored).not.toBe(ship);
  expect(restored.value).toBe(h.shipId);
  expect(h.panel.querySelector('[data-exploration-field="from"]').value).toBe('mineral_belt');
  expect(h.doc.activeElement).toBe(restored);
  expect(h.execute).not.toHaveBeenCalled(); h.api.dispose();
});

it('派船与后续阶段重绘将面板内焦点交给新关闭按钮', () => {
  const h = harness();
  const ship = h.panel.querySelector('[data-exploration-field="ship"]');
  ship.value = h.shipId; ship.fire('change'); ship.focus();
  const eventId = h.state.merchant.exploration.event.id, preventDefault = vi.fn();
  h.panel.querySelector('[data-exploration-form]').fire('submit', { preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(h.execute).toHaveBeenCalledExactlyOnceWith('explore', { eventId, shipId: h.shipId, from: 'sol_prime' });
  const dispatchClose = h.panel.querySelector('[data-exploration-close]');
  expect(h.doc.activeElement).toBe(dispatchClose);
  expect(h.state.merchant.exploration.event.status).toBe('exploring');
  h.advance(h.state.merchant.exploration.event.arriveAt);
  const returningClose = h.panel.querySelector('[data-exploration-close]');
  expect(returningClose).not.toBe(dispatchClose);
  expect(h.doc.activeElement).toBe(returningClose);
  expect(h.state.merchant.exploration.event.status).toBe('returning');
  h.advance(h.state.merchant.exploration.event.arriveAt);
  const completedClose = h.panel.querySelector('[data-exploration-close]');
  expect(completedClose).not.toBe(returningClose);
  expect(h.doc.activeElement).toBe(completedClose);
  expect(h.state.merchant.exploration.event.status).toBe('completed'); h.api.dispose();
});

it('后台重绘不抢面板外焦点，销毁后释放节点与交互监听', () => {
  const h = harness(), outside = h.doc.createElement('button'); h.doc.body.appendChild(outside); outside.focus();
  expect(h.buy('hauler').ok).toBe(true); h.refresh();
  expect(h.doc.activeElement).toBe(outside);
  const event = h.state.merchant.exploration.event, form = h.panel.querySelector('[data-exploration-form]');
  expect(Merchant.command(h.state, 'explore', { eventId: event.id, shipId: h.shipId }, h.state.merchant.lastTickAt).ok).toBe(true);
  h.refresh(); expect(h.doc.activeElement).toBe(outside);
  h.advance(event.arriveAt); expect(h.doc.activeElement).toBe(outside);
  h.api.dispose(); expect(h.map.children).toEqual([]); expect(h.doc.activeElement).toBe(outside);
  const before = structuredClone(h.state);
  h.signal.fire('click'); h.panel.fire('submit', { target: form, preventDefault: vi.fn() });
  expect(h.execute).not.toHaveBeenCalled(); expect(h.state).toEqual(before);
});

it('信号贴近资源栏或底部导航时保留固定入口，空间足够才贴在场景位置', () => {
  const h = harness();
  h.panel.querySelector('[data-exploration-close]').fire('click');
  h.map.getBoundingClientRect = () => ({ top: 0, width: 1280, height: 720 });
  h.doc.getElementById = id => id === 'merchant-resource-bar' ? { getBoundingClientRect: () => ({ bottom: 44 }) } : null;
  h.doc.querySelector = () => ({ getBoundingClientRect: () => ({ top: 650 }) });
  h.signal.offsetWidth = 150; h.signal.offsetHeight = 54;
  for (const y of [105, 640]) {
    h.renderer.getExplorationScreenPosition.mockReturnValue({ x: 300, y, onScreen: true }); h.refresh();
    expect(h.signal.hidden).toBe(false);
    expect(h.signal.classList.contains('is-on-signal')).toBe(false);
    expect(h.signal.style.left).toBe(''); expect(h.signal.style.top).toBe('');
  }
  h.renderer.getExplorationScreenPosition.mockReturnValue({ x: 300, y: 160, onScreen: true }); h.refresh();
  expect(h.signal.classList.contains('is-on-signal')).toBe(true);
  expect(h.signal.style.left).toBe('300px'); expect(h.signal.style.top).toBe('160px');
  h.api.dispose();
});

it('探索展示扣费后余额，完整返港只提供经营入口，不在星图铺开商路列表', () => {
  const h = harness();
  expect(h.panel.querySelector('[data-exploration-balance]').textContent).toBe(`${(h.state.credits - 360).toLocaleString('zh-CN')} CR`);
  const ship = h.panel.querySelector('[data-exploration-field="ship"]');
  ship.value = h.shipId; ship.fire('change');
  h.panel.querySelector('[data-exploration-form]').fire('submit', { preventDefault: vi.fn() });
  const event = h.state.merchant.exploration.event;
  h.advance(event.arriveAt + event.legMs);
  expect(h.panel.querySelectorAll('[data-exploration-route]')).toHaveLength(0);
  expect(h.panel.querySelectorAll('.merchant-new-port-routes')).toHaveLength(0);
  h.panel.querySelector('[data-exploration-port]').fire('click');
  expect(h.onPort).toHaveBeenCalledExactlyOnceWith('nebula_forge');
  expect(h.panel.hidden).toBe(true);
  h.api.dispose();
});
