import { getOnboardingProgress } from '../systems/merchant/MerchantOnboarding.js';
import { hasBlockingSurfaceOpen, hideBlockingSurface, isBlockingSurfaceVisible, registerBlockingSurfaceDismiss, showBlockingSurface } from './SurfaceManager.js';

export const MERCHANT_OPENING_STORY = '旧航路重新开放，太阳主星需要矿石，矿石带等待粮食。你接手了一家小运输公司，只有一艘轻舟和一笔启动资金。让第一条生意跑起来，用利润壮大商队，探索更多星球。蓝脉航路，等你重新连接。';

const steps = Object.freeze([
  null,
  { title: '安排第一条商路', text: '从「新派遣」开始，选择一条已开放的商路。粮食和矿石，都有需要它们的港口。', action: 'dispatch', label: '新派遣' },
  { title: '配船，留出周转货本', text: '选一艘空闲船，填入货本，确认预计净利。货本用于采购和往返费用，初始轻舟就能接下第一笔生意。', action: 'dispatch', label: '继续配置' },
  { title: '让商队完成第一趟', text: '往返自动执行，返港后才结算净利润。你可以切到后台；无货或无法盈利时，任务会自动结束。', action: 'tasks', label: '查看航运任务' },
  { title: '用利润壮大公司', text: '积累 CR 升级公司，再决定购船扩张、研发新船或探索新港。更多功能会随公司等级开放，接下来由你安排。', action: 'finish', label: '开始自主经营' },
]);

export function createMerchantOnboardingPresenter({ doc = document, getState, execute, navigate, openDispatch }) {
  const intro = doc.createElement('div');
  intro.id = 'merchant-onboarding-intro';
  intro.className = 'modal hidden merchant-onboarding-intro';
  intro.inert = true;
  intro.setAttribute('role', 'dialog');
  intro.setAttribute('aria-modal', 'true');
  intro.setAttribute('aria-labelledby', 'merchant-onboarding-title');
  intro.setAttribute('aria-hidden', 'true');
  intro.innerHTML = `<div class="modal-box merchant-onboarding-letter" tabindex="-1"><div class="merchant-onboarding-seal" aria-hidden="true">✦</div><small>港务局来信 · 1 / 5</small><h2 id="merchant-onboarding-title">从一艘轻舟开始</h2><p>${MERCHANT_OPENING_STORY}</p><div class="merchant-onboarding-letter-actions"><button type="button" data-onboarding-action="start" data-button-state="ready">开始经营</button><button type="button" data-onboarding-action="skip">跳过引导</button></div></div>`;
  const hint = doc.createElement('section');
  hint.id = 'merchant-onboarding-hint';
  hint.className = 'merchant-onboarding-hint';
  hint.setAttribute('aria-label', '经营入门');
  hint.hidden = true;
  doc.body.appendChild(intro);
  doc.body.appendChild(hint);
  let markup = '';
  let highlighted = [];
  let disposed = false;
  let reportAdvancePending = false;

  function clearHighlights() {
    highlighted.forEach(node => node.classList.remove('merchant-onboarding-target'));
    highlighted = [];
  }
  function context() {
    return { view: doc.body.dataset.activeView || 'tasks', formOpen: Boolean(doc.getElementById('merchant-form') && !doc.getElementById('merchant-form-panel')?.hidden) };
  }

  function refresh(state = getState(), options = context()) {
    if (disposed) return;
    const progress = getOnboardingProgress(state.merchant);
    if (!reportAdvancePending && progress.step === 3 && progress.canViewReport && options.view === 'reports' && !doc.hidden && !hasBlockingSurfaceOpen()) {
      reportAdvancePending = true;
      queueMicrotask(() => {
        reportAdvancePending = false;
        if (disposed || doc.hidden || context().view !== 'reports' || hasBlockingSurfaceOpen()) return;
        const current = getOnboardingProgress(getState().merchant);
        if (current.step === 3 && current.canViewReport) {
          execute('onboarding', { action: 'viewed-report' });
          refresh();
        }
      });
    }
    const isIntro = progress.step === 0;
    if (isIntro && !doc.hidden && !hasBlockingSurfaceOpen(intro.id) && !isBlockingSurfaceVisible(intro.id)) {
      showBlockingSurface(intro.id, { focusSelector: '[data-onboarding-action="start"]' });
    } else if (!isIntro && isBlockingSurfaceVisible(intro.id)) hideBlockingSurface(intro.id);
    clearHighlights();
    const visible = progress.step > 0 && progress.step < 5 && ['tasks', 'reports'].includes(options.view);
    const host = progress.step === 2 && options.formOpen && options.view === 'tasks' ? doc.getElementById('merchant-form')
      : doc.getElementById(options.view === 'reports' ? 'merchant-report-onboarding-host' : 'merchant-onboarding-host');
    hint.hidden = !visible || !host;
    if (!visible || !host) return;
    if (hint.parentElement !== host) host.insertBefore(hint, host.firstChild);
    const definition = steps[progress.step];
    const settled = progress.settledTrips > 0;
    const action = progress.step === 3 && settled ? 'report' : definition.action;
    const label = progress.step === 3 && settled ? options.view === 'reports' ? '继续经营' : '查看首笔收入' : definition.label;
    const nextMarkup = `<div class="merchant-onboarding-copy"><small>经营入门 · ${progress.step + 1} / 5</small><h2 tabindex="-1">${progress.step === 3 && settled ? '第一笔收益已结算' : definition.title}</h2><p>${progress.step === 3 && settled ? '在报告中查看线路净利；收入、收回的本金和净利润会分别记账。' : definition.text}</p></div><div class="merchant-onboarding-actions"><button type="button" data-onboarding-action="${action}" data-button-state="ready">${label}</button><button type="button" class="merchant-onboarding-skip" data-onboarding-action="skip">跳过引导</button></div>`;
    if (markup !== nextMarkup) {
      const hadFocus = hint.contains(doc.activeElement);
      hint.innerHTML = nextMarkup;
      markup = nextMarkup;
      if (hadFocus) hint.querySelector('h2')?.focus({ preventScroll: true });
    }
    const selector = progress.step === 1 ? '#merchant-task-workspace .merchant-operations-head [data-merchant-action="new"]'
      : progress.step === 2 && options.formOpen ? '#merchant-ship-picks, #merchant-plan-preview'
        : progress.step === 3 && settled ? '#bottom-nav [data-view="reports"]'
          : progress.step === 4 ? options.view === 'tasks' ? '#merchant-company-growth' : '#bottom-nav [data-view="tasks"]' : '';
    if (selector) {
      highlighted = Array.from(doc.querySelectorAll(selector));
      highlighted.forEach(node => node.classList.add('merchant-onboarding-target'));
    }
  }

  function perform(action) {
    if (disposed) return;
    if (action === 'dispatch') {
      if (context().formOpen) {
        navigate('tasks');
        const budget = doc.querySelector('#merchant-form [name="budget"]');
        budget?.focus();
        budget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else openDispatch();
      refresh();
      return;
    }
    if (action === 'tasks') { navigate('tasks'); refresh(); return; }
    if (action === 'report') {
      navigate('reports');
      const progress = getOnboardingProgress(getState().merchant);
      if (progress.step === 3 && progress.canViewReport && context().view === 'reports') execute('onboarding', { action: 'viewed-report' });
      refresh();
      return;
    }
    const result = execute('onboarding', { action });
    if (result?.ok && (action === 'start' || action === 'finish')) navigate('tasks');
    refresh();
    if (result?.ok && action === 'skip') {
      const target = context().formOpen && context().view === 'tasks' ? doc.querySelector('#merchant-form [name="budget"]') : doc.querySelector('[data-workspace-active="true"] [data-workspace-initial-focus]');
      target?.focus({ preventScroll: true });
    }
  }
  const click = event => {
    const button = event.target.closest?.('[data-onboarding-action]');
    if (button && !button.disabled) { perform(button.dataset.onboardingAction); return; }
    const nav = event.target.closest?.('#bottom-nav [data-view]');
    const progress = getOnboardingProgress(getState().merchant);
    if (nav?.dataset.view === 'reports' && progress.step === 3 && progress.canViewReport && context().view === 'reports') {
      execute('onboarding', { action: 'viewed-report' });
    }
    if (nav) refresh();
  };
  const releaseDismiss = registerBlockingSurfaceDismiss(intro.id, { closeOnBackdrop: false, closeOnEscape: true, onDismiss: () => perform('skip') });
  doc.body.addEventListener('click', click);

  return {
    refresh,
    dispose() {
      disposed = true;
      clearHighlights();
      doc.body.removeEventListener('click', click);
      hideBlockingSurface(intro.id);
      releaseDismiss();
      intro.remove();
      hint.remove();
    },
  };
}
