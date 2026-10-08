import { beforeEach, expect, it, vi } from 'vitest';
import { createInitialState } from '../js/data/constants.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { documentFixture } from './helpers/merchantDom.js';

const surfaces = vi.hoisted(() => ({ visible: new Set(), owner: null, release: vi.fn() }));
vi.mock('../js/ui/SurfaceManager.js', () => ({
  hasBlockingSurfaceOpen: except => [...surfaces.visible].some(id => id !== except),
  isBlockingSurfaceVisible: id => surfaces.visible.has(id),
  showBlockingSurface: vi.fn(id => surfaces.visible.add(id)),
  hideBlockingSurface: vi.fn(id => surfaces.visible.delete(id)),
  registerBlockingSurfaceDismiss: (_id, owner) => { surfaces.owner = owner; return surfaces.release; },
}));
import { createMerchantOnboardingPresenter } from '../js/ui/MerchantOnboardingPresenter.js';

const start = 1_800_000_000_000;
const plan = { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 220 };
beforeEach(() => { surfaces.visible.clear(); surfaces.owner = null; vi.clearAllMocks(); });

function harness({ story = false } = {}) {
  const state = createInitialState(); Merchant.init(state, start);
  if (!story) expect(Merchant.command(state, 'onboarding', { action: 'start' }, start).ok).toBe(true);
  const doc = documentFixture(); doc.body.dataset.activeView = 'tasks';
  const add = (parent, tag, attributes = {}) => { const node = doc.createElement(tag, attributes); parent.appendChild(node); return node; };
  const tasks = add(doc.body, 'section', { id: 'merchant-task-workspace', 'data-workspace-active': 'true' });
  const title = add(tasks, 'h2', { 'data-workspace-initial-focus': '' });
  const head = add(tasks, 'div', { class: 'merchant-operations-head' });
  const newButton = add(head, 'button', { 'data-merchant-action': 'new' });
  const taskHost = add(tasks, 'div', { id: 'merchant-onboarding-host' });
  add(tasks, 'div', { id: 'merchant-company-growth' });
  const reports = add(doc.body, 'section', { id: 'merchant-report-workspace', 'data-workspace-active': 'false' });
  const reportHost = add(reports, 'div', { id: 'merchant-report-onboarding-host' });
  const starmap = add(doc.body, 'section', { id: 'map-section', 'data-workspace-active': 'false' });
  const formPanel = add(tasks, 'div', { id: 'merchant-form-panel' }); formPanel.hidden = true;
  const form = add(formPanel, 'form', { id: 'merchant-form' });
  const budget = add(form, 'input', { name: 'budget', value: '220' }); budget.scrollIntoView = vi.fn();
  add(form, 'div', { id: 'merchant-ship-picks' }); add(form, 'div', { id: 'merchant-plan-preview' });
  const nav = add(doc.body, 'nav', { id: 'bottom-nav' });
  const navButtons = Object.fromEntries(['tasks', 'reports', 'starmap'].map(view => [view, add(nav, 'button', { 'data-view': view })]));
  const navigate = vi.fn(view => {
    doc.body.dataset.activeView = view;
    for (const [name, node] of Object.entries({ tasks, reports, starmap })) node.setAttribute('data-workspace-active', String(name === view));
  });
  nav.addEventListener('click', event => navigate(event.target.dataset.view));
  const execute = vi.fn((action, input) => Merchant.command(state, action, input, state.merchant.lastTickAt));
  const openDispatch = vi.fn(() => { formPanel.hidden = false; });
  const presenter = createMerchantOnboardingPresenter({ doc, getState: () => state, execute, navigate, openDispatch });
  const refresh = () => presenter.refresh(state);
  refresh();
  return { state, doc, title, taskHost, reportHost, starmap, newButton, formPanel, form, budget,
    navigate, execute, openDispatch, presenter, refresh, nav: navButtons,
    hint: doc.getElementById('merchant-onboarding-hint'), intro: doc.getElementById('merchant-onboarding-intro'),
    guide: action => Merchant.command(state, 'onboarding', { action }, state.merchant.lastTickAt),
    dispatch() {
      expect(Merchant.command(state, 'onboarding', { action: 'opened-dispatch' }, start).ok).toBe(true);
      const created = Merchant.command(state, 'create', plan, start); expect(created.ok).toBe(true);
      const finalAt = start + 2 * state.merchant.ships[0].trip.legMs;
      expect(Merchant.command(state, 'stop', { taskId: created.taskId }, start).ok).toBe(true);
      refresh(); return finalAt;
    },
    advance(at) { Merchant.advance(state, at); refresh(); },
  };
}

it('报告已打开时首笔真实返港自动推进一次，完成后导航不会再发送引导命令', async () => {
  const h = harness(), finalAt = h.dispatch();
  h.nav.reports.fire('click');
  expect(h.state.merchant.onboarding.step).toBe(3); expect(h.execute).not.toHaveBeenCalled();
  h.advance(finalAt); h.refresh(); h.refresh();
  expect(h.state.credits).toBe(1042);
  expect(h.state.merchant.onboarding.step).toBe(3);
  const assets = structuredClone(h.state); delete assets.merchant.onboarding;
  await Promise.resolve();
  expect(h.execute).toHaveBeenCalledExactlyOnceWith('onboarding', { action: 'viewed-report' });
  expect(h.state.merchant.onboarding.step).toBe(4);
  const after = structuredClone(h.state); delete after.merchant.onboarding;
  expect(after).toEqual(assets);
  expect(h.guide('finish').ok).toBe(true); h.refresh();
  h.nav.tasks.fire('click'); h.nav.reports.fire('click'); await Promise.resolve();
  expect(h.state.merchant.history[0].rounds).toBe(1);
  expect(h.state.merchant.onboarding).toEqual({ step: 5, skipped: false });
  expect(h.execute).toHaveBeenCalledTimes(1); expect(h.hint.hidden).toBe(true); h.presenter.dispose();
});

it('配船提示继续配置只聚焦现有货本，不重开抽屉或清空草稿', () => {
  const h = harness(); expect(h.guide('opened-dispatch').ok).toBe(true);
  h.formPanel.hidden = false; h.budget.value = '137'; h.refresh();
  expect(h.hint.parentElement).toBe(h.form);
  h.hint.querySelector('[data-onboarding-action="dispatch"]').fire('click');
  expect(h.openDispatch).not.toHaveBeenCalled();
  expect(h.budget.value).toBe('137'); expect(h.doc.activeElement).toBe(h.budget);
  expect(h.budget.scrollIntoView).toHaveBeenCalledOnce();
  expect(h.state.credits).toBe(1000); expect(h.execute).not.toHaveBeenCalled(); h.presenter.dispose();
});

it('首单入口传递当前真实报价和空闲轻舟，只打开配置而不花费资金', () => {
  const h = harness(), before = structuredClone(h.state);
  h.hint.querySelector('[data-onboarding-action="dispatch"]').fire('click');
  expect(h.openDispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    from: 'sol_prime', to: 'mineral_belt', goodId: 'food', opportunity: expect.objectContaining({ shipId: 'ship-1', budget: 126, purchaseCost: 0 }),
  }));
  expect(h.state).toEqual(before); h.presenter.dispose();
});

it('已登记但等待补货的首单不要求重复派遣，实际出发后切换在途通讯', () => {
  const h = harness(); h.guide('opened-dispatch');
  h.state.merchant.markets.sol_prime.supply.food = 0;
  Merchant.command(h.state, 'create', plan, start); h.refresh();
  expect(h.hint.innerHTML).toContain('等待首航出发');
  expect(h.hint.querySelector('[data-story-phase="first-wait"]')).not.toBeNull();
  expect(h.hint.querySelector('[data-onboarding-action="dispatch"]')).toBeNull();
  expect(h.hint.querySelector('[data-onboarding-return]')).toBeNull();
  expect(h.state.merchant.onboarding.step).toBe(2);
  h.advance(start + 60000);
  expect(h.state.merchant.onboarding.step).toBe(3);
  expect(h.hint.querySelector('[data-story-phase="first-voyage"]')).not.toBeNull();
  expect(h.hint.querySelector('[data-onboarding-return]').textContent).toBe('约 18 秒后返港结算');
  h.presenter.dispose();
});

it('首航倒计时读取真实返港时间，到账提示读取真实净利，等待不误报收益', () => {
  const h = harness(), returnAt = h.dispatch();
  expect(h.hint.querySelector('[data-onboarding-return]').textContent).toBe('约 18 秒后返港结算');
  h.advance(returnAt - 1);
  expect(h.hint.querySelector('[data-onboarding-return]').textContent).toBe('约 1 秒后返港结算');
  expect(h.hint.innerHTML).not.toContain('已计入可用资金');
  h.advance(returnAt);
  expect(h.hint.querySelector('[data-onboarding-return]')).toBeNull();
  expect(h.hint.innerHTML).toContain('最近一趟净赚 42 CR，已计入可用资金');
  expect(h.state.credits).toBe(1042);
  expect(h.state.merchant.onboarding.step).toBe(3);
  h.presenter.dispose();
});

it('切到星图隐藏提示并取消待推进，销毁后清理节点、高亮、监听和排队回调', async () => {
  const h = harness();
  expect(h.hint.hidden).toBe(false); expect(h.newButton.classList.contains('merchant-onboarding-target')).toBe(true);
  h.nav.starmap.fire('click');
  expect(h.hint.hidden).toBe(true); expect(h.starmap.contains(h.hint)).toBe(false);
  expect(h.newButton.classList.contains('merchant-onboarding-target')).toBe(false);
  h.nav.tasks.fire('click'); const finalAt = h.dispatch(); h.advance(finalAt);
  h.navigate('reports'); h.refresh(); h.navigate('starmap'); h.refresh(); await Promise.resolve();
  expect(h.execute).not.toHaveBeenCalled(); expect(h.state.merchant.onboarding.step).toBe(3);
  h.navigate('reports'); h.refresh();
  const staleAction = h.hint.querySelector('[data-onboarding-action="report"]');
  h.presenter.dispose(); await Promise.resolve();
  expect(h.doc.getElementById('merchant-onboarding-intro')).toBeNull();
  expect(h.doc.getElementById('merchant-onboarding-hint')).toBeNull();
  expect(h.doc.querySelectorAll('.merchant-onboarding-target')).toEqual([]);
  expect(surfaces.release).toHaveBeenCalledOnce();
  const state = structuredClone(h.state);
  h.doc.body.fire('click', { target: staleAction }); surfaces.owner.onDismiss(); h.refresh();
  expect(h.execute).not.toHaveBeenCalled(); expect(h.state).toEqual(state);
});

it('开场 Escape 所有者执行跳过，保留资产并将焦点交回可见标题', () => {
  const h = harness({ story: true });
  expect(surfaces.visible.has(h.intro.id)).toBe(true);
  expect(surfaces.owner.closeOnEscape).toBe(true);
  const before = structuredClone(h.state); delete before.merchant.onboarding;
  surfaces.owner.onDismiss();
  expect(h.execute).toHaveBeenCalledExactlyOnceWith('onboarding', { action: 'skip' });
  expect(h.state.merchant.onboarding).toEqual({ step: 5, skipped: true });
  const after = structuredClone(h.state); delete after.merchant.onboarding;
  expect(after).toEqual(before); expect(surfaces.visible.has(h.intro.id)).toBe(false);
  expect(h.hint.hidden).toBe(true); expect(h.doc.activeElement).toBe(h.title); h.presenter.dispose();
});
