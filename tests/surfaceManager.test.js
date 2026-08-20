import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bindBlockingSurfaceDismiss,
  hasBlockingSurfaceOpen,
  hideBlockingSurface,
  isBlockingSurfaceVisible,
  registerEscapeLayer,
  showBlockingSurface,
} from '../js/ui/SurfaceManager.js';

function createFakeClassList(initialValues) {
  var values = new Set(initialValues || []);
  return {
    add: function (value) {
      values.add(value);
    },
    remove: function (value) {
      values.delete(value);
    },
    contains: function (value) {
      return values.has(value);
    },
    toggle: function (value, force) {
      if (force === true) {
        values.add(value);
        return true;
      }
      if (force === false) {
        values.delete(value);
        return false;
      }
      if (values.has(value)) {
        values.delete(value);
        return false;
      }
      values.add(value);
      return true;
    },
  };
}

function createFakeElement(initialClasses) {
  var attributes = Object.create(null);
  var listeners = Object.create(null);
  return {
    id: '',
    dataset: {},
    onclick: null,
    classList: createFakeClassList(initialClasses),
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatchEvent: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || { target: this, key: '', preventDefault: function () {} });
      }, this);
    },
    listenerCount: function (type) {
      return (listeners[type] || []).length;
    },
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  };
}

describe('SurfaceManager', function () {
  var originalDocument;

  beforeEach(function () {
    originalDocument = globalThis.document;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('document 级 Escape 只由 SurfaceManager 命名 dispatcher 拥有', function () {
    var surfaceSource = readFileSync(new URL('../js/ui/SurfaceManager.js', import.meta.url), 'utf8');
    var mapSource = readFileSync(new URL('../js/ui/MapUI.js', import.meta.url), 'utf8');
    var fleetSource = readFileSync(new URL('../js/ui/FleetUI.js', import.meta.url), 'utf8');
    var dialogueSource = readFileSync(new URL('../js/ui/DialogueUI.js', import.meta.url), 'utf8');

    expect(surfaceSource).toContain("document.addEventListener('keydown', _handleSurfaceDocumentKeydown)");
    expect(surfaceSource.match(/document\.addEventListener\('keydown'/g)).toHaveLength(1);
    expect(mapSource).not.toContain('_handleSecondaryPanelKeydown');
    expect(fleetSource).not.toContain("document.addEventListener('keydown', handlePortalKeydown)");
    expect(dialogueSource).not.toContain("document.addEventListener('keydown'");
    expect(dialogueSource).toContain("modal.addEventListener('keydown'");
  });

  it('showBlockingSurface 会关闭其他 modal 并只显示目标阻塞层', function () {
    var tradeModal = createFakeElement(['modal']);
    tradeModal.id = 'trade-modal';
    var eventModal = createFakeElement(['modal', 'hidden']);
    eventModal.id = 'event-modal';
    var settingsModal = createFakeElement(['modal']);
    settingsModal.id = 'settings-modal';
    var elements = {
      'trade-modal': tradeModal,
      'event-modal': eventModal,
      'settings-modal': settingsModal,
    };

    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [tradeModal, eventModal, settingsModal];
        return [];
      },
    };

    showBlockingSurface('event-modal');

    expect(eventModal.classList.contains('hidden')).toBe(false);
    expect(tradeModal.classList.contains('hidden')).toBe(true);
    expect(settingsModal.classList.contains('hidden')).toBe(true);
    expect(eventModal.getAttribute('aria-hidden')).toBe('false');
    expect(tradeModal.getAttribute('aria-hidden')).toBe('true');
    expect(eventModal.inert).toBe(false);
    expect(tradeModal.inert).toBe(true);
  });

  it('showBlockingSurface 会把焦点移到弹窗容器', function () {
    var modal = createFakeElement(['modal', 'hidden']);
    var modalBox = createFakeElement();
    var focused = false;
    modal.id = 'trade-modal';
    modal.querySelector = function (selector) {
      if (selector === '[autofocus]') return null;
      if (selector === '.modal-box, [tabindex="-1"]') return modalBox;
      return null;
    };
    modalBox.focus = function () {
      focused = true;
    };

    globalThis.document = {
      getElementById: function (id) {
        return id === 'trade-modal' ? modal : null;
      },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [modal];
        return [];
      },
    };

    showBlockingSurface('trade-modal');

    expect(focused).toBe(true);
  });

  it('showBlockingSurface 支持为特定弹窗指定初始焦点', function () {
    var modal = createFakeElement(['modal', 'hidden']);
    var activeTab = createFakeElement();
    var modalBox = createFakeElement();
    var activeTabFocusCount = 0;
    var modalBoxFocusCount = 0;
    modal.id = 'settings-modal';
    activeTab.focus = function () { activeTabFocusCount += 1; };
    modalBox.focus = function () { modalBoxFocusCount += 1; };
    modal.querySelector = function (selector) {
      if (selector === '[autofocus]') return null;
      if (selector === '[data-settings-panel-target][aria-selected="true"]') return activeTab;
      if (selector === '.modal-box, [tabindex="-1"]') return modalBox;
      return null;
    };

    globalThis.document = {
      getElementById: function (id) { return id === 'settings-modal' ? modal : null; },
      querySelectorAll: function (selector) { return selector === '.modal' ? [modal] : []; },
    };

    showBlockingSurface('settings-modal', {
      focusSelector: '[data-settings-panel-target][aria-selected="true"]',
    });

    expect(activeTabFocusCount).toBe(1);
    expect(modalBoxFocusCount).toBe(0);
  });

  it('阻塞式弹窗会循环 Tab 焦点并跳过不可用控件', function () {
    var modal = createFakeElement(['modal', 'hidden']);
    var modalBox = createFakeElement();
    var hiddenButton = createFakeElement();
    var firstButton = createFakeElement();
    var disabledButton = createFakeElement();
    var lastButton = createFakeElement();
    var outsideButton = createFakeElement();
    var documentListeners = Object.create(null);
    var focusCounts = new Map();
    modal.id = 'settings-modal';
    hiddenButton.hidden = true;
    disabledButton.disabled = true;

    [modalBox, firstButton, lastButton].forEach(function (element) {
      element.focus = function () {
        focusCounts.set(element, (focusCounts.get(element) || 0) + 1);
        globalThis.document.activeElement = element;
      };
    });
    modal.querySelector = function (selector) {
      if (selector === '[autofocus]') return null;
      if (selector === '.modal-box, [tabindex="-1"]') return modalBox;
      return null;
    };
    modal.querySelectorAll = function () {
      return [hiddenButton, firstButton, disabledButton, lastButton];
    };

    globalThis.document = {
      activeElement: outsideButton,
      getElementById: function (id) {
        return id === 'settings-modal' ? modal : null;
      },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [modal] : [];
      },
      addEventListener: function (type, handler) {
        if (!documentListeners[type]) documentListeners[type] = [];
        documentListeners[type].push(handler);
      },
      removeEventListener: function (type, handler) {
        if (!documentListeners[type]) return;
        documentListeners[type] = documentListeners[type].filter(function (item) { return item !== handler; });
      },
    };

    showBlockingSurface('settings-modal');
    expect((documentListeners.keydown || []).length).toBe(1);

    var preventCount = 0;
    globalThis.document.activeElement = lastButton;
    documentListeners.keydown[0]({
      key: 'Tab',
      shiftKey: false,
      preventDefault: function () { preventCount += 1; },
    });
    expect(globalThis.document.activeElement).toBe(firstButton);

    globalThis.document.activeElement = firstButton;
    documentListeners.keydown[0]({
      key: 'Tab',
      shiftKey: true,
      preventDefault: function () { preventCount += 1; },
    });
    expect(globalThis.document.activeElement).toBe(lastButton);

    globalThis.document.activeElement = outsideButton;
    documentListeners.keydown[0]({
      key: 'Tab',
      shiftKey: false,
      preventDefault: function () { preventCount += 1; },
    });
    expect(globalThis.document.activeElement).toBe(firstButton);
    expect(preventCount).toBe(3);
    expect(focusCounts.get(hiddenButton)).toBeUndefined();
    expect(focusCounts.get(disabledButton)).toBeUndefined();
  });

  it('hideBlockingSurface 会把焦点安全恢复到弹窗触发控件', function () {
    var modal = createFakeElement(['modal', 'hidden']);
    var trigger = createFakeElement();
    var focusCount = 0;
    modal.id = 'trade-modal';
    modal.contains = function () { return false; };
    trigger.focus = function () { focusCount += 1; };
    trigger.closest = function () { return null; };

    globalThis.document = {
      body: createFakeElement(),
      activeElement: trigger,
      getElementById: function (id) {
        return id === 'trade-modal' ? modal : null;
      },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [modal];
        return [];
      },
    };

    showBlockingSurface('trade-modal');
    hideBlockingSurface('trade-modal');

    expect(focusCount).toBe(1);
  });

  it('hideBlockingSurface 与 hasBlockingSurfaceOpen 会同步可见状态', function () {
    var dialogueModal = createFakeElement(['modal']);
    dialogueModal.id = 'dialogue-modal';

    globalThis.document = {
      getElementById: function (id) {
        return id === 'dialogue-modal' ? dialogueModal : null;
      },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [dialogueModal];
        return [];
      },
    };

    expect(isBlockingSurfaceVisible('dialogue-modal')).toBe(true);
    expect(hasBlockingSurfaceOpen()).toBe(true);
    expect(hasBlockingSurfaceOpen('dialogue-modal')).toBe(false);

    hideBlockingSurface('dialogue-modal');

    expect(isBlockingSurfaceVisible('dialogue-modal')).toBe(false);
    expect(hasBlockingSurfaceOpen()).toBe(false);
    expect(dialogueModal.getAttribute('aria-hidden')).toBe('true');
    expect(dialogueModal.inert).toBe(true);
  });

  it('bindBlockingSurfaceDismiss 会支持统一 dismiss 与自定义 onDismiss', function () {
    var tradeModal = createFakeElement(['modal']);
    tradeModal.id = 'trade-modal';
    var documentListeners = Object.create(null);
    var dismissCount = 0;

    globalThis.document = {
      getElementById: function (id) {
        return id === 'trade-modal' ? tradeModal : null;
      },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [tradeModal];
        return [];
      },
      addEventListener: function (type, handler) {
        if (!documentListeners[type]) documentListeners[type] = [];
        documentListeners[type].push(handler);
      },
    };

    bindBlockingSurfaceDismiss('trade-modal', {
      onDismiss: function () {
        dismissCount += 1;
        tradeModal.classList.add('hidden');
      },
    });
    bindBlockingSurfaceDismiss('trade-modal', {
      onDismiss: function () {
        dismissCount += 10;
      },
    });

    expect(tradeModal.listenerCount('click')).toBe(1);
    expect((documentListeners.keydown || []).length).toBe(1);

    tradeModal.dispatchEvent('click', { target: tradeModal });
    expect(tradeModal.classList.contains('hidden')).toBe(true);
    expect(dismissCount).toBe(1);

    tradeModal.classList.remove('hidden');
    var prevented = false;
    var stopped = false;
    documentListeners.keydown[0]({
      key: 'Escape',
      preventDefault: function () { prevented = true; },
      stopPropagation: function () { stopped = true; },
    });
    expect(tradeModal.classList.contains('hidden')).toBe(true);
    expect(dismissCount).toBe(2);
    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
  });

  it('多个 modal 只注册一个命名 dispatcher，Escape 只关闭最顶层一个', function () {
    var firstModal = createFakeElement(['modal']);
    var topModal = createFakeElement(['modal']);
    var documentListeners = Object.create(null);
    var dismissed = [];
    firstModal.id = 'first-modal';
    topModal.id = 'top-modal';
    var elements = { 'first-modal': firstModal, 'top-modal': topModal };

    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [firstModal, topModal] : [];
      },
      addEventListener: function (type, handler) {
        if (!documentListeners[type]) documentListeners[type] = [];
        documentListeners[type].push(handler);
      },
      removeEventListener: function (type, handler) {
        if (!documentListeners[type]) return;
        documentListeners[type] = documentListeners[type].filter(function (item) { return item !== handler; });
      },
    };

    bindBlockingSurfaceDismiss('first-modal', {
      onDismiss: function () {
        dismissed.push('first');
        firstModal.classList.add('hidden');
      },
    });
    bindBlockingSurfaceDismiss('top-modal', {
      onDismiss: function () {
        dismissed.push('top');
        topModal.classList.add('hidden');
      },
    });

    expect(documentListeners.keydown).toHaveLength(1);
    expect(documentListeners.keydown[0].name).toBe('_handleSurfaceDocumentKeydown');
    documentListeners.keydown[0]({ key: 'Escape', preventDefault: function () {}, stopPropagation: function () {} });

    expect(dismissed).toEqual(['top']);
    expect(topModal.classList.contains('hidden')).toBe(true);
    expect(firstModal.classList.contains('hidden')).toBe(false);
  });

  it('不可 dismiss 的 blocking modal 消费 Escape 且不下穿到详情层', function () {
    var modal = createFakeElement(['modal']);
    var documentListeners = Object.create(null);
    var detailEscapeCount = 0;
    var prevented = false;
    var stopped = false;
    modal.id = 'event-modal';

    globalThis.document = {
      getElementById: function (id) { return id === 'event-modal' ? modal : null; },
      querySelectorAll: function (selector) { return selector === '.modal' ? [modal] : []; },
      addEventListener: function (type, handler) {
        if (!documentListeners[type]) documentListeners[type] = [];
        documentListeners[type].push(handler);
      },
      removeEventListener: function () {},
    };

    bindBlockingSurfaceDismiss('event-modal', {
      closeOnEscape: false,
      closeOnBackdrop: false,
    });
    var unregister = registerEscapeLayer('test-detail', {
      priority: 40,
      isActive: function () { return true; },
      onEscape: function () { detailEscapeCount += 1; },
    });

    documentListeners.keydown[0]({
      key: 'Escape',
      preventDefault: function () { prevented = true; },
      stopPropagation: function () { stopped = true; },
    });
    unregister();

    expect(modal.classList.contains('hidden')).toBe(false);
    expect(detailEscapeCount).toBe(0);
    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
  });

  it('非阻塞 Escape layer 按优先级只执行一个并支持注销', function () {
    var documentListeners = Object.create(null);
    var actions = [];
    globalThis.document = {
      getElementById: function () { return null; },
      querySelectorAll: function () { return []; },
      addEventListener: function (type, handler) {
        if (!documentListeners[type]) documentListeners[type] = [];
        documentListeners[type].push(handler);
      },
      removeEventListener: function () {},
    };

    var unregisterLow = registerEscapeLayer('low-detail', {
      priority: 10,
      isActive: function () { return true; },
      onEscape: function () { actions.push('low'); },
    });
    var unregisterTop = registerEscapeLayer('top-detail', {
      priority: 50,
      isActive: function () { return true; },
      onEscape: function () { actions.push('top'); },
    });

    expect(documentListeners.keydown).toHaveLength(1);
    documentListeners.keydown[0]({ key: 'Escape', preventDefault: function () {}, stopPropagation: function () {} });
    expect(actions).toEqual(['top']);

    unregisterTop();
    documentListeners.keydown[0]({ key: 'Escape', preventDefault: function () {}, stopPropagation: function () {} });
    unregisterLow();
    expect(actions).toEqual(['top', 'low']);
  });

  it('不再持有 canonical workspace 的 primary/secondary 兼容协议', function () {
    var source = readFileSync(new URL('../js/ui/SurfaceManager.js', import.meta.url), 'utf8');
    expect(source).not.toContain('PRIMARY_SURFACE_IDS');
    expect(source).not.toContain('SECONDARY_SURFACE_IDS');
    expect(source).not.toContain('openPrimarySurface');
    expect(source).not.toContain('openSecondarySurface');
    expect(source).not.toContain('market-overlay');
  });
});
