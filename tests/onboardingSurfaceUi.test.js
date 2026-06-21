import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createClassList(initialValues) {
  var values = new Set(initialValues || []);
  return {
    add: function (value) { values.add(value); },
    remove: function (value) { values.delete(value); },
    contains: function (value) { return values.has(value); },
    toggle: function (value, force) {
      var shouldAdd = typeof force === 'boolean' ? force : !values.has(value);
      if (shouldAdd) values.add(value);
      else values.delete(value);
      return shouldAdd;
    },
  };
}

function createFakeElement(id, initialClasses) {
  var listeners = Object.create(null);
  var attributes = Object.create(null);
  var element = {
    id: id || '',
    value: '',
    hidden: false,
    disabled: false,
    title: '',
    textContent: '',
    innerHTML: '',
    scrollTop: 0,
    scrollHeight: 0,
    focused: false,
    selected: false,
    parentElement: null,
    dataset: {},
    classList: createClassList(initialClasses),
    children: [],
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatchEvent: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || { target: this, preventDefault: function () {} });
      }, this);
    },
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute: function (name) {
      delete attributes[name];
    },
    focus: function () {
      this.focused = true;
    },
    select: function () {
      this.selected = true;
    },
    querySelector: function () {
      return null;
    },
    insertBefore: function () {},
    removeChild: function () {},
  };
  return element;
}

describe('Onboarding and log surfaces', function () {
  var originalDocument;

  beforeEach(function () {
    vi.resetModules();
    originalDocument = globalThis.document;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('通讯历史弹窗会渲染语义化日志列表', async function () {
    var logsList = createFakeElement('logs-modal-list');
    var allFilter = createFakeElement('logs-filter-all');
    allFilter.dataset.logsFilter = 'all';
    var riskFilter = createFakeElement('logs-filter-risk');
    riskFilter.dataset.logsFilter = 'risk';
    var filters = [allFilter, riskFilter];
    var elements = {
      'logs-modal-list': logsList,
      'logs-modal-feed-status': createFakeElement('logs-modal-feed-status'),
      'logs-summary-total': createFakeElement('logs-summary-total'),
      'logs-summary-trade': createFakeElement('logs-summary-trade'),
      'logs-summary-risk': createFakeElement('logs-summary-risk'),
      'logs-summary-latest': createFakeElement('logs-summary-latest'),
      'logs-modal': createFakeElement('logs-modal'),
      'victory-modal': createFakeElement('victory-modal', ['hidden']),
      'mini-console-broadcast': createFakeElement('mini-console-broadcast'),
      'broadcast-content': createFakeElement('broadcast-content'),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelector: function () {
        return null;
      },
      querySelectorAll: function (selector) {
        if (selector === '[data-logs-filter]') return filters;
        return [];
      },
    };

    var HUD = await import('../js/ui/HUD.js?v=20260605-victorysummary1');
    var EventBus = await import('../js/core/EventBus.js');

    HUD.init();
    HUD.addMessage('完成一笔交易', 'buy');
    HUD.addMessage('燃料补给完成', 'travel');
    HUD.addMessage('护盾受到冲击', 'error');
    EventBus.emit('logs:modal:opened');

    expect(elements['logs-summary-total'].textContent).toBe('3');
    expect(elements['logs-summary-trade'].textContent).toBe('1');
    expect(elements['logs-summary-risk'].textContent).toBe('1');
    expect(elements['logs-summary-latest'].textContent).toBe('错误');
    expect(elements['logs-modal-feed-status'].textContent).toBe('显示全部通讯记录：3 条');
    expect(logsList.innerHTML).toContain('logs-modal-entry');
    expect(logsList.innerHTML).toContain('role="listitem"');
    expect(logsList.innerHTML).toContain('log-time');
    expect(logsList.innerHTML).toContain('log-label');
    expect(logsList.innerHTML).toContain('完成一笔交易');
    expect(logsList.innerHTML).toContain('燃料补给完成');
    expect(logsList.innerHTML).toContain('护盾受到冲击');
    expect(logsList.innerHTML).not.toContain('style=');
    expect(allFilter.getAttribute('tabindex')).toBe('0');
    expect(riskFilter.getAttribute('tabindex')).toBe('-1');
    expect(elements['mini-console-broadcast'].getAttribute('aria-label')).toBe('打开通讯历史。最新消息：护盾受到冲击');
    expect(allFilter.focused).toBe(true);

    var arrowPrevented = false;
    allFilter.dispatchEvent('keydown', {
      key: 'ArrowRight',
      preventDefault: function () { arrowPrevented = true; },
    });
    expect(arrowPrevented).toBe(true);
    expect(riskFilter.focused).toBe(true);
    expect(allFilter.getAttribute('aria-pressed')).toBe('false');
    expect(riskFilter.getAttribute('aria-pressed')).toBe('true');
    expect(elements['logs-modal-feed-status'].textContent).toBe('显示风险通讯记录：1 条');

    logsList.scrollTop = 72;
    logsList.scrollHeight = 300;
    HUD.addMessage('自动巡航完成', 'travel');
    expect(logsList.scrollTop).toBe(72);
    expect(elements['logs-summary-total'].textContent).toBe('4');

    riskFilter.dispatchEvent('click');
    expect(elements['logs-modal-feed-status'].textContent).toBe('显示风险通讯记录：1 条');
    expect(logsList.innerHTML).toContain('护盾受到冲击');
    expect(logsList.innerHTML).not.toContain('完成一笔交易');
    expect(logsList.innerHTML).not.toContain('燃料补给完成');
    expect(allFilter.getAttribute('tabindex')).toBe('-1');
    expect(riskFilter.getAttribute('tabindex')).toBe('0');
  });

  it('公司命名会即时校验、支持回车并阻止重复提交', async function () {
    var modal = createFakeElement('company-rename-modal', ['modal', 'hidden']);
    var input = createFakeElement('company-name-input');
    var error = createFakeElement('company-name-error', ['hidden']);
    var confirm = createFakeElement('company-rename-confirm');
    var skip = createFakeElement('company-rename-skip');
    var length = createFakeElement('company-name-length');
    var status = createFakeElement('company-name-status');
    var preview = createFakeElement('company-name-preview');
    length.parentElement = createFakeElement('company-name-length-card');
    status.parentElement = createFakeElement('company-name-status-card');
    preview.parentElement = createFakeElement('company-name-preview-card');

    var elements = {
      'company-rename-modal': modal,
      'company-name-input': input,
      'company-name-error': error,
      'company-rename-confirm': confirm,
      'company-rename-skip': skip,
      'company-name-length': length,
      'company-name-status': status,
      'company-name-preview': preview,
    };
    globalThis.document = {
      body: createFakeElement('body'),
      activeElement: null,
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) { return selector === '.modal' ? [modal] : []; },
      addEventListener: function () {},
    };

    var confirmedNames = [];
    var OnboardingUI = await import('../js/ui/OnboardingUI.js?v=20260619-onboardingflow1');
    OnboardingUI.showCompanyRename({
      currentName: '',
      fallbackName: '测试公司',
      onConfirm: function (name) { confirmedNames.push(name); },
    });

    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.dataset.companyNameState).toBe('editing');
    expect(input.focused).toBe(true);
    expect(input.selected).toBe(true);
    expect(length.textContent).toBe('0/24');
    expect(status.textContent).toBe('待输入');
    expect(preview.textContent).toBe('测试公司');
    expect(confirm.disabled).toBe(true);
    expect(confirm.getAttribute('aria-disabled')).toBe('true');

    var enterPrevented = false;
    input.value = '   ';
    input.onkeydown({
      key: 'Enter',
      preventDefault: function () { enterPrevented = true; },
    });
    expect(enterPrevented).toBe(true);
    expect(modal.dataset.companyNameState).toBe('invalid');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(error.classList.contains('hidden')).toBe(false);
    expect(error.getAttribute('aria-hidden')).toBe('false');

    input.value = ' 北冕物流 ';
    input.oninput();
    expect(length.textContent).toBe('6/24');
    expect(status.textContent).toBe('可写入');
    expect(preview.textContent).toBe('北冕物流');
    expect(confirm.disabled).toBe(false);
    expect(error.classList.contains('hidden')).toBe(true);

    confirm.onclick();
    confirm.onclick();
    expect(confirmedNames).toEqual(['北冕物流']);
    expect(modal.dataset.companyNameState).toBe('submitting');
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(skip.disabled).toBe(true);
  });

  it('教程启动会聚焦主操作并保证一次选择只执行一次', async function () {
    var modal = createFakeElement('tutorial-start-modal', ['modal', 'hidden']);
    var start = createFakeElement('tut-start-yes');
    var skip = createFakeElement('tut-start-no');
    var elements = {
      'tutorial-start-modal': modal,
      'tut-start-yes': start,
      'tut-start-no': skip,
    };
    globalThis.document = {
      body: createFakeElement('body'),
      activeElement: null,
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) { return selector === '.modal' ? [modal] : []; },
      addEventListener: function () {},
    };

    var startCount = 0;
    var skipCount = 0;
    var OnboardingUI = await import('../js/ui/OnboardingUI.js?v=20260619-onboardingflow1');
    OnboardingUI.showTutorialStart({
      onStart: function () { startCount += 1; },
      onSkip: function () { skipCount += 1; },
    });

    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.dataset.tutorialStartState).toBe('ready');
    expect(start.focused).toBe(true);

    start.onclick();
    start.onclick();
    expect(startCount).toBe(1);
    expect(skipCount).toBe(0);
    expect(modal.dataset.tutorialStartState).toBe('starting');
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(start.disabled).toBe(true);
    expect(skip.disabled).toBe(true);
  });

  it('通讯日志支持 Escape 关闭并同步返回星图导航态', async function () {
    var logsModal = createFakeElement('logs-modal', ['modal', 'hidden']);
    var starmapButton = createFakeElement('starmap-button', ['bottom-nav-btn', 'active']);
    starmapButton.dataset.view = 'starmap';
    var logsButton = createFakeElement('logs-button', ['bottom-nav-btn']);
    logsButton.dataset.view = 'logs';
    var documentListeners = Object.create(null);
    var elements = {
      'logs-modal': logsModal,
    };

    globalThis.document = {
      body: createFakeElement('body'),
      activeElement: null,
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [logsModal];
        if (selector === '.bottom-nav-btn') return [starmapButton, logsButton];
        return [];
      },
      addEventListener: function (type, handler) {
        if (!documentListeners[type]) documentListeners[type] = [];
        documentListeners[type].push(handler);
      },
    };

    var UIManager = await import('../js/ui/UIManager.js?v=20260619-onboardingflow1');
    UIManager.init({}, {});
    UIManager.switchView('logs');

    expect(logsModal.classList.contains('hidden')).toBe(false);
    expect(logsButton.getAttribute('aria-current')).toBe('page');

    documentListeners.keydown[0]({ key: 'Escape' });

    expect(logsModal.classList.contains('hidden')).toBe(true);
    expect(UIManager.getCurrentView()).toBe('starmap');
    expect(starmapButton.getAttribute('aria-current')).toBe('page');
    expect(logsButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('公司命名与教程启动弹窗具备说明、列表和移动端覆盖样式', function () {
    var html = readFileSync('index.html', 'utf8');
    var css = readFileSync('css/interstellar-trader.css', 'utf8');
    var gameManager = readFileSync('js/core/GameManager.js', 'utf8');
    var onboardingUI = readFileSync('js/ui/OnboardingUI.js', 'utf8');
    var uiManager = readFileSync('js/ui/UIManager.js', 'utf8');

    expect(html).toContain('aria-describedby="company-rename-desc company-rename-decision company-name-error"');
    expect(html).toContain('class="company-rename-signal" role="list"');
    expect(html).toContain('id="company-name-length"');
    expect(html).toContain('id="company-name-status"');
    expect(html).toContain('id="company-name-preview"');
    expect(html).toContain('class="company-name-label"');
    expect(html).toContain('id="company-name-hint" class="company-name-hint"');
    expect(html).toContain('id="company-rename-decision" class="company-rename-decision" role="list"');
    expect(html).toContain('id="tutorial-tooltip"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-describedby="tutorial-start-desc tutorial-start-decision tutorial-start-hint"');
    expect(html).toContain('class="tut-start-modules" role="list"');
    expect(html).toContain('id="tutorial-start-decision" class="tut-start-decision" role="list"');
    expect(html).toContain('aria-describedby="tutorial-start-guided-note"');
    expect(html).toContain('aria-describedby="company-rename-write-note"');
    expect(html).toContain('aria-describedby="logs-modal-desc logs-modal-summary logs-modal-feed-status"');
    expect(html).toContain('id="logs-modal-summary" class="logs-modal-summary" role="list" aria-label="通讯日志摘要"');
    expect(html).toContain('id="mini-console-broadcast"');
    expect(html).toContain('class="mini-console-broadcast"');
    expect(html).toContain('role="toolbar" aria-label="日志类型筛选"');
    expect(html).toContain('aria-controls="logs-modal-list"');
    expect(html).toContain('aria-describedby="logs-modal-feed-status"');
    expect(html).toContain('data-logs-filter="risk"');
    expect(css).toContain('Logs archive and onboarding setup modals');
    expect(css).toContain('.logs-modal-summary-item');
    expect(css).toContain('.logs-filter-chip.is-active');
    expect(css).toContain('.logs-modal-entry');
    expect(css).toContain('.mini-console-broadcast:focus-visible');
    expect(css).toContain('.console-message-log-detailed:focus-visible');
    expect(css).toContain('.company-rename-signal');
    expect(css).toContain('.company-rename-decision-card');
    expect(css).toContain('.company-name-hint');
    expect(css).toContain('[data-company-name-tone="error"]');
    expect(css).toContain('.tut-start-modules');
    expect(css).toContain('.tut-start-decision-card');
    expect(css).toContain('.tutorial-tooltip:focus-visible');
    expect(css).toContain('.tutorial-tooltip[data-trigger="action"]');
    expect(gameManager).toContain('OnboardingUI.showCompanyRename');
    expect(gameManager).toContain('OnboardingUI.showTutorialStart');
    expect(onboardingUI).toContain('function _updateCompanyRenameFeedback');
    expect(onboardingUI).toContain("event.key !== 'Enter'");
    expect(onboardingUI).toContain("confirmButton.disabled = !hasName");
    expect(uiManager).toContain("bindBlockingSurfaceDismiss('logs-modal'");
    expect(css).toContain('grid-template-columns: repeat(5, minmax(0, 1fr))');
    expect(css).toContain('@media (max-width: 420px)');
  });
});
