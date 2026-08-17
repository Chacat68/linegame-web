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
    querySelectorAll: function () {
      return [];
    },
    appendChild: function (child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    },
    replaceChildren: function () {
      this.children = [];
    },
    contains: function (candidate) {
      while (candidate) {
        if (candidate === this) return true;
        candidate = candidate.parentElement;
      }
      return false;
    },
    closest: function (selector) {
      if (selector === '[data-log-entry-id]' && this.dataset && this.dataset.logEntryId) return this;
      return this.parentElement && typeof this.parentElement.closest === 'function'
        ? this.parentElement.closest(selector)
        : null;
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

  it('通讯日志只在底部日志入口显示未读数量', async function () {
    var logsBadge = createFakeElement('logs-nav-badge');
    var logsButton = createFakeElement('logs-button', ['bottom-nav-btn']);
    logsButton.dataset.view = 'logs';
    var elements = {
      'victory-modal': createFakeElement('victory-modal', ['hidden']),
      'logs-nav-badge': logsBadge,
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelector: function (selector) {
        if (selector === '.bottom-nav-btn[data-view="logs"]') return logsButton;
        return null;
      },
      querySelectorAll: function () { return []; },
    };

    var HUD = await import('../js/ui/HUD.js?v=20260605-victorysummary1');
    var EventBus = await import('../js/core/EventBus.js');

    HUD.init();
    HUD.addMessage('完成一笔交易', 'buy');
    HUD.addMessage('燃料补给完成', 'travel');
    HUD.addMessage('护盾受到冲击', 'error');

    expect(logsBadge.hidden).toBe(false);
    expect(logsBadge.textContent).toBe('3');
    expect(logsBadge.title).toBe('未读通讯：3');
    expect(logsButton.getAttribute('aria-label')).toBe('通讯日志，3 条新消息');

    EventBus.emit('logs:badge:clear');

    expect(logsBadge.hidden).toBe(true);
    expect(logsBadge.textContent).toBe('0');
    expect(logsBadge.title).toBe('未读通讯：0');
    expect(logsButton.getAttribute('aria-label')).toBe('通讯日志');
  });

  it('通讯日志打开时会从历史恢复被清空的记录列表', async function () {
    function createLogNode(tagName) {
      var node = createFakeElement('');
      node.tagName = String(tagName || 'div').toUpperCase();
      node.appendChild = function (child) {
        this.children.push(child);
        child.parentElement = this;
        return child;
      };
      node.replaceChildren = function () {
        this.children = [];
      };
      return node;
    }

    var messageLog = createLogNode('div');
    var logsBadge = createFakeElement('logs-nav-badge');
    var logsButton = createFakeElement('logs-button', ['bottom-nav-btn']);
    logsButton.dataset.view = 'logs';
    var elements = {
      'victory-modal': createFakeElement('victory-modal', ['hidden']),
      'message-log': messageLog,
      'logs-nav-badge': logsBadge,
    };

    globalThis.document = {
      createElement: createLogNode,
      getElementById: function (id) { return elements[id] || null; },
      querySelector: function (selector) {
        return selector === '.bottom-nav-btn[data-view="logs"]' ? logsButton : null;
      },
      querySelectorAll: function () { return []; },
    };

    var HUD = await import('../js/ui/HUD.js?v=20260717-loghistory1');
    var EventBus = await import('../js/core/EventBus.js');
    HUD.init();
    HUD.addMessage('完成一笔交易', 'buy');
    HUD.addMessage('抵达太阳主星', 'travel');

    expect(messageLog.children).toHaveLength(2);
    expect(messageLog.children[0].children[1].textContent).toBe('抵达太阳主星');
    expect(messageLog.children[0].children[0].children[1].textContent).toBe('航行');

    messageLog.replaceChildren();
    expect(messageLog.children).toHaveLength(0);

    EventBus.emit('logs:badge:clear');

    expect(messageLog.children).toHaveLength(2);
    expect(messageLog.children[0].children[1].textContent).toBe('抵达太阳主星');
    expect(messageLog.children[1].children[1].textContent).toBe('完成一笔交易');
  });

  it('没有历史记录时显示可理解的空状态', async function () {
    var messageLog = createFakeElement('message-log');
    messageLog.appendChild = function (child) {
      this.children.push(child);
      return child;
    };
    messageLog.replaceChildren = function () {
      this.children = [];
    };

    globalThis.document = {
      createElement: function () { return createFakeElement(''); },
      getElementById: function (id) {
        if (id === 'message-log') return messageLog;
        if (id === 'victory-modal') return createFakeElement('victory-modal', ['hidden']);
        return null;
      },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
    };

    var HUD = await import('../js/ui/HUD.js?v=20260717-logempty1');
    HUD.init();

    expect(messageLog.children).toHaveLength(1);
    expect(messageLog.children[0].className).toContain('log-empty-state');
    expect(messageLog.children[0].textContent).toContain('暂无通讯记录');
  });

  it('选择日志消息会打开只读 Inspector，并把 Escape 焦点返回所选记录', async function () {
    var messageLog = createFakeElement('message-log');
    var inspectorRoot = createFakeElement('context-inspector');
    inspectorRoot.hidden = true;
    inspectorRoot.setAttribute('aria-hidden', 'true');
    var inspectorContent = createFakeElement('context-inspector-content');
    var inspectorEmpty = createFakeElement('context-inspector-empty');
    var inspectorHost = createFakeElement('context-inspector-render-host');
    var inspectorTitle = createFakeElement('context-inspector-title');
    var inspectorClose = createFakeElement('context-inspector-close');
    inspectorRoot.querySelector = function (selector) {
      return selector === '[data-context-inspector-close]' ? inspectorClose : null;
    };
    inspectorHost.querySelector = function () { return null; };
    inspectorHost.querySelectorAll = function (selector) {
      return selector === '[data-context-workspace-view]'
        ? this.children.filter(function (child) { return child.dataset.contextWorkspaceView; })
        : [];
    };
    var documentListeners = Object.create(null);
    var elements = {
      'victory-modal': createFakeElement('victory-modal', ['hidden']),
      'message-log': messageLog,
      'context-inspector': inspectorRoot,
      'context-inspector-content': inspectorContent,
      'context-inspector-empty': inspectorEmpty,
      'context-inspector-render-host': inspectorHost,
      'context-inspector-title': inspectorTitle,
    };
    globalThis.document = {
      createElement: function (tagName) {
        var element = createFakeElement('');
        element.tagName = String(tagName).toUpperCase();
        return element;
      },
      getElementById: function (id) { return elements[id] || null; },
      querySelector: function () { return null; },
      querySelectorAll: function (selector) {
        if (selector === '#message-log [data-log-entry-id]') return messageLog.children;
        return [];
      },
      addEventListener: function (type, handler) {
        (documentListeners[type] || (documentListeners[type] = [])).push(handler);
      },
      removeEventListener: function () {},
    };

    var HUD = await import('../js/ui/HUD.js?v=20260813-logs-context');
    var Inspector = await import('../js/ui/ContextInspector.js');
    HUD.init({ revisionSource: function () { return 4; } });
    Inspector.registerRenderer('logs', HUD.renderContextInspector);
    Inspector.activateWorkspace('logs');
    HUD.addMessage('跃迁航线已归档', 'travel');
    var messageButton = messageLog.children[0];

    messageLog.dispatchEvent('click', { target: messageButton.children[1] });

    expect(Inspector.getContext('logs')).toEqual({
      workspaceId: 'logs',
      type: 'message',
      id: messageButton.dataset.logEntryId,
      source: 'logs-feed',
      revision: 4,
    });
    expect(Inspector.getSnapshot().open).toBe(true);
    expect(inspectorTitle.textContent).toBe('消息检查');
    expect(inspectorHost.children[0].innerHTML).toContain('跃迁航线已归档');
    expect(messageButton.getAttribute('aria-pressed')).toBe('true');

    documentListeners.keydown[0]({
      key: 'Escape',
      preventDefault: function () {},
      stopPropagation: function () {},
      stopImmediatePropagation: function () {},
    });
    expect(Inspector.getSnapshot().open).toBe(false);
    expect(messageButton.focused).toBe(true);
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

  it('通讯日志入口清除未读数量并打开可聚焦的二级终端', async function () {
    var starmapButton = createFakeElement('starmap-button', ['bottom-nav-btn', 'active']);
    starmapButton.dataset.view = 'starmap';
    var logsButton = createFakeElement('logs-button', ['bottom-nav-btn']);
    logsButton.dataset.view = 'logs';
    var consolePanel = createFakeElement('console-panel');
    var badgeClearCount = 0;

    globalThis.document = {
      body: createFakeElement('body'),
      activeElement: null,
      getElementById: function (id) {
        return id === 'console-panel' ? consolePanel : null;
      },
      querySelectorAll: function (selector) {
        if (selector === '.bottom-nav-btn') return [starmapButton, logsButton];
        return [];
      },
      addEventListener: function () {},
    };

    var UIManager = await import('../js/ui/UIManager.js?v=20260619-onboardingflow1');
    var EventBus = await import('../js/core/EventBus.js');
    EventBus.on('logs:badge:clear', function () {
      badgeClearCount += 1;
    });

    UIManager.init({}, {});
    UIManager.switchView('logs');

    expect(UIManager.getCurrentView()).toBe('logs');
    expect(starmapButton.getAttribute('aria-current')).toBe(null);
    expect(logsButton.getAttribute('aria-current')).toBe('page');
    expect(logsButton.getAttribute('aria-pressed')).toBe('true');
    expect(consolePanel.classList.contains('panel-open')).toBe(true);
    expect(consolePanel.getAttribute('aria-hidden')).toBe('false');
    expect(consolePanel.focused).toBe(true);
    expect(badgeClearCount).toBe(1);
  });

  it('公司命名与教程启动弹窗具备说明、列表和移动端覆盖样式', function () {
    var html = readFileSync('index.html', 'utf8');
    var css = readFileSync('css/interstellar-trader.css', 'utf8');
    var gameManager = readFileSync('js/core/GameApplication.js', 'utf8');
    var guidanceRuntime = readFileSync('js/core/GameGuidanceRuntime.js', 'utf8');
    var onboardingController = readFileSync('js/core/OnboardingUiController.js', 'utf8');
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
    expect(html).not.toContain('id="logs-modal"');
    expect(html).not.toContain('id="mini-console-broadcast"');
    expect(html).toContain('id="console-panel"');
    expect(html).toContain('id="message-log"');
    expect(html).toContain('id="logs-nav-badge" class="bottom-nav-badge" hidden');
    expect(css).toContain('Onboarding setup modals');
    expect(css).toContain('.company-rename-signal');
    expect(css).toContain('.company-rename-decision-card');
    expect(css).toContain('.company-name-hint');
    expect(css).toContain('[data-company-name-tone="error"]');
    expect(css).toContain('.tut-start-modules');
    expect(css).toContain('.tut-start-decision-card');
    expect(css).toContain('.tutorial-tooltip:focus-visible');
    expect(css).toContain('.tutorial-tooltip[data-trigger="action"]');
    expect(gameManager).toContain("from './GameGuidanceRuntime.js'");
    expect(gameManager).not.toContain("from './OnboardingUiController.js'");
    expect(guidanceRuntime).toContain("from './OnboardingUiController.js'");
    expect(gameManager).not.toContain("document.getElementById('company-name-display')");
    expect(onboardingController).toContain('OnboardingUI.showCompanyRename');
    expect(onboardingController).toContain('OnboardingUI.showTutorialStart');
    expect(onboardingUI).toContain('function _updateCompanyRenameFeedback');
    expect(onboardingUI).toContain("event.key !== 'Enter'");
    expect(onboardingUI).toContain("confirmButton.disabled = !hasName");
    expect(uiManager).toContain("EventBus.emit('logs:badge:clear')");
    expect(css).toContain('@media (max-width: 420px)');
  });
});
