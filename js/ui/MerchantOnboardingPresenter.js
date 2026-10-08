import { getOnboardingProgress } from '../systems/merchant/MerchantOnboarding.js';
import { buildMerchantEarlyProgress } from './MerchantEarlyProgress.js';
import { buildMerchantOpeningStory, buildMerchantOnboardingStory, renderMerchantStory } from './MerchantStory.js';
import { hasBlockingSurfaceOpen, hideBlockingSurface, isBlockingSurfaceVisible, registerBlockingSurfaceDismiss, showBlockingSurface } from './SurfaceManager.js';

export { MERCHANT_OPENING_STORY } from './MerchantStory.js';
const escape = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const steps = Object.freeze([
  null,
  { title: '安排第一条商路', text: '从「新派遣」开始，选择一条已开放且有净利的商路。首航先用已有轻舟，保留剩余资金。', action: 'dispatch', label: '安排首航' },
  { title: '配船，留出周转货本', text: '货本用于采购和往返费用，只划拨一次。检查飞船、货本和预计净利，点击底部「确认派遣」；剩余资金留给公司成长。', action: 'dispatch', label: '检查周转货本' },
  { title: '让商队完成第一趟', text: '往返自动执行，返港后才结算净利润。货本继续周转；缺货或需求暂满时会停靠等待，市场恢复后自动续跑。', action: 'tasks', label: '查看航运任务' },
  { title: '用利润壮大公司', text: '用已到账利润准备下一次升级。公司等级开放研发资格，船位扩容、购船和货本仍要分别投入。', action: 'finish', label: '继续发展公司' },
]);

export function createMerchantOnboardingPresenter({ doc = document, getState, execute, navigate, openDispatch, openTask = () => {} }) {
  const intro = doc.createElement('div');
  intro.id = 'merchant-onboarding-intro';
  intro.className = 'modal hidden merchant-onboarding-intro';
  intro.inert = true;
  intro.setAttribute('role', 'dialog');
  intro.setAttribute('aria-modal', 'true');
  intro.setAttribute('aria-labelledby', 'merchant-onboarding-title');
  intro.setAttribute('aria-hidden', 'true');
  const handover = '<h2 id="merchant-onboarding-title">从一艘轻舟开始</h2><div class="merchant-onboarding-handover"><strong data-onboarding-company></strong><span data-onboarding-assets></span></div><div class="merchant-onboarding-clue"><small>交接档案 · 一张未签收的货单</small><p>远方的货单上，只写着“航运服务终止”。先让公司活下来，再去找那座失联的港口。</p></div>';
  intro.innerHTML = `<div class="modal-box merchant-onboarding-letter" tabindex="-1">${renderMerchantStory(buildMerchantOpeningStory(), '', handover, 'opening')}<div class="merchant-onboarding-reply"><small>你的回应</small><div class="merchant-onboarding-letter-actions"><button type="button" data-onboarding-action="start" data-button-state="ready">接手公司</button><button type="button" data-onboarding-action="skip">跳过引导</button></div></div></div>`;
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
  function updateHighlights(selector) {
    const next = selector ? Array.from(doc.querySelectorAll(selector)) : [];
    highlighted.filter(node => !next.includes(node)).forEach(node => node.classList.remove('merchant-onboarding-target'));
    next.filter(node => !highlighted.includes(node)).forEach(node => node.classList.add('merchant-onboarding-target'));
    highlighted = next;
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
    if (isIntro) {
      intro.querySelector('[data-onboarding-company]').textContent = state.companyName;
      intro.querySelector('[data-onboarding-assets]').textContent = `${state.merchant.ships.length} 艘飞船 · ${Math.floor(state.credits).toLocaleString('zh-CN')} CR 启动资金`;
    }
    if (isIntro && !doc.hidden && !hasBlockingSurfaceOpen(intro.id) && !isBlockingSurfaceVisible(intro.id)) {
      showBlockingSurface(intro.id, { focusSelector: '[data-onboarding-action="start"]' });
    } else if (!isIntro && isBlockingSurfaceVisible(intro.id)) hideBlockingSurface(intro.id);
    const visible = progress.step > 0 && progress.step < 5 && ['tasks', 'reports'].includes(options.view);
    const host = progress.step === 2 && options.formOpen && options.view === 'tasks' ? doc.getElementById('merchant-form')
      : doc.getElementById(options.view === 'reports' ? 'merchant-report-onboarding-host' : 'merchant-onboarding-host');
    hint.hidden = !visible || !host;
    if (!visible || !host) { clearHighlights(); return; }
    if (hint.parentElement !== host) host.insertBefore(hint, host.firstChild);
    const definition = steps[progress.step];
    const settled = progress.settledTrips > 0;
    const communication = buildMerchantOnboardingStory(state, progress);
    const waiting = communication?.phase === 'first-wait';
    const action = waiting ? 'tasks' : progress.step === 3 && settled ? 'report' : definition.action;
    const label = waiting ? '查看等待原因' : progress.step === 3 && settled ? options.view === 'reports' ? '继续经营' : '查看首笔收入' : definition.label;
    const early = [1, 4].includes(progress.step) ? buildMerchantEarlyProgress(state) : null;
    const profit = progress.latestSettlement?.profit;
    const copy = waiting ? '首航任务已登记，暂在港口等待。查看任务中的原因；供需恢复后会自动出发，货本不足时可调整派遣，无需重复建立任务。'
      : progress.step === 3 && settled ? `${Number.isFinite(profit) ? `最近一趟净赚 ${Math.floor(profit).toLocaleString('zh-CN')} CR，已计入可用资金。` : '首趟净利润已计入可用资金。'}原货本继续经营，在报告中可以查看每趟结算。` : early?.text || definition.text;
    const objective = `<h2 tabindex="-1">${waiting ? '等待首航出发' : progress.step === 3 && settled ? '第一笔收益已结算' : definition.title}</h2><p>${escape(copy)}</p>${progress.step === 3 && !settled && progress.nextReturnAt ? '<p data-onboarding-return></p>' : ''}`;
    const nextMarkup = `<div class="merchant-onboarding-copy">${renderMerchantStory(communication, `经营入门 · ${progress.step + 1} / 5`, objective)}</div><div class="merchant-onboarding-actions"><small class="merchant-onboarding-response-label">你的回应</small><button type="button" data-onboarding-action="${action}" data-button-state="ready">${label}</button><button type="button" class="merchant-onboarding-skip" data-onboarding-action="skip">跳过引导</button></div>`;
    if (markup !== nextMarkup) {
      const hadFocus = hint.contains(doc.activeElement);
      hint.innerHTML = nextMarkup;
      markup = nextMarkup;
      if (hadFocus) hint.querySelector('h2')?.focus({ preventScroll: true });
    }
    const returnNode = hint.querySelector('[data-onboarding-return]');
    if (returnNode) returnNode.textContent = `约 ${Math.max(0, Math.ceil((progress.nextReturnAt - state.merchant.lastTickAt) / 1000))} 秒后返港结算`;
    const selector = waiting ? '' : progress.step === 1 ? '#merchant-task-workspace .merchant-operations-head [data-merchant-action="new"]'
      : progress.step === 2 && options.formOpen ? '#merchant-ship-picks, #merchant-plan-preview'
        : progress.step === 3 && settled ? '#bottom-nav [data-view="reports"]'
          : progress.step === 4 ? options.view === 'tasks' ? '#merchant-company-growth' : '#bottom-nav [data-view="tasks"]' : '';
    updateHighlights(selector);
  }

  function perform(action) {
    if (disposed) return;
    if (action === 'dispatch') {
      if (context().formOpen) {
        navigate('tasks');
        const budget = doc.querySelector('#merchant-form [name="budget"]');
        budget?.focus();
        budget?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else openDispatch(buildMerchantEarlyProgress(getState())?.route || null);
      refresh();
      return;
    }
    if (action === 'tasks') { navigate('tasks'); openTask(getState().merchant.tasks[0]?.id); refresh(); return; }
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
