import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  bindBlockingSurfaceDismiss,
  closeAllNonBlockingSurfaces,
  closePrimarySurface,
  closeSecondarySurface,
  hasBlockingSurfaceOpen,
  hideBlockingSurface,
  isBlockingSurfaceVisible,
  openPrimarySurface,
  openSecondarySurface,
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

  it('showBlockingSurface 会关闭其他 modal 并收起事件通知条', function () {
    var tradeModal = createFakeElement(['modal']);
    tradeModal.id = 'trade-modal';
    var eventModal = createFakeElement(['modal', 'hidden']);
    eventModal.id = 'event-modal';
    var settingsModal = createFakeElement(['modal']);
    settingsModal.id = 'settings-modal';
    var notification = createFakeElement();
    notification.id = 'event-notification';
    notification.onclick = function () {};

    var elements = {
      'trade-modal': tradeModal,
      'event-modal': eventModal,
      'settings-modal': settingsModal,
      'event-notification': notification,
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
    expect(notification.classList.contains('hidden')).toBe(true);
    expect(notification.onclick).toBe(null);
    expect(eventModal.getAttribute('aria-hidden')).toBe('false');
    expect(tradeModal.getAttribute('aria-hidden')).toBe('true');
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
    documentListeners.keydown[0]({ key: 'Escape' });
    expect(tradeModal.classList.contains('hidden')).toBe(true);
    expect(dismissCount).toBe(2);
  });

  it('openPrimarySurface 会打开唯一 primary workspace 并关闭 secondary overlays', function () {
    var marketOverlay = createFakeElement(['hidden']);
    marketOverlay.id = 'market-overlay';
    var infoPanel = createFakeElement(['panel-open']);
    infoPanel.id = 'info-panel';
    var tradePanel = createFakeElement(['panel-open']);
    tradePanel.id = 'trade-panel';
    var consolePanel = createFakeElement(['panel-open']);
    consolePanel.id = 'console-panel';

    var elements = {
      'market-overlay': marketOverlay,
      'info-panel': infoPanel,
      'trade-panel': tradePanel,
      'console-panel': consolePanel,
    };

    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [];
        return [];
      },
    };

    openPrimarySurface('market-overlay');

    expect(marketOverlay.classList.contains('hidden')).toBe(false);
    expect(infoPanel.classList.contains('panel-open')).toBe(false);
    expect(tradePanel.classList.contains('panel-open')).toBe(false);
    expect(consolePanel.classList.contains('panel-open')).toBe(false);
    expect(marketOverlay.getAttribute('aria-hidden')).toBe('false');
    expect(infoPanel.getAttribute('aria-hidden')).toBe('true');
  });

  it('primary workspace 会聚焦选中页签并在关闭后恢复入口', function () {
    var marketOverlay = createFakeElement(['hidden']);
    var activeTab = createFakeElement();
    var trigger = createFakeElement();
    var activeTabFocusCount = 0;
    var triggerFocusCount = 0;
    marketOverlay.id = 'market-overlay';
    marketOverlay.contains = function (target) { return target === activeTab; };
    marketOverlay.querySelector = function (selector) {
      return selector === '[data-primary-initial-focus], [role="tab"][aria-selected="true"], [role="tab"][tabindex="0"]' ? activeTab : null;
    };
    activeTab.focus = function () {
      activeTabFocusCount += 1;
      globalThis.document.activeElement = activeTab;
    };
    activeTab.closest = function () { return null; };
    trigger.focus = function () {
      triggerFocusCount += 1;
      globalThis.document.activeElement = trigger;
    };
    trigger.closest = function () { return null; };

    globalThis.document = {
      body: createFakeElement(),
      activeElement: trigger,
      getElementById: function (id) {
        return id === 'market-overlay' ? marketOverlay : null;
      },
      querySelector: function () { return trigger; },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [] : [];
      },
    };

    openPrimarySurface('market-overlay');
    expect(activeTabFocusCount).toBe(1);
    expect(globalThis.document.activeElement).toBe(activeTab);

    closePrimarySurface('market-overlay');
    expect(triggerFocusCount).toBe(1);
    expect(globalThis.document.activeElement).toBe(trigger);
    expect(marketOverlay.getAttribute('aria-hidden')).toBe('true');

    openPrimarySurface('market-overlay');
    closePrimarySurface('market-overlay', { restoreFocus: false });
    expect(triggerFocusCount).toBe(1);
    expect(marketOverlay.getAttribute('aria-hidden')).toBe('true');
  });

  it('openSecondarySurface 会保持 secondary 互斥并关闭 primary workspace', function () {
    var marketOverlay = createFakeElement();
    marketOverlay.id = 'market-overlay';
    var infoPanel = createFakeElement(['panel-open']);
    infoPanel.id = 'info-panel';
    var tradePanel = createFakeElement();
    tradePanel.id = 'trade-panel';
    var consolePanel = createFakeElement(['panel-open']);
    consolePanel.id = 'console-panel';

    var elements = {
      'market-overlay': marketOverlay,
      'info-panel': infoPanel,
      'trade-panel': tradePanel,
      'console-panel': consolePanel,
    };

    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [];
        return [];
      },
    };

    openSecondarySurface('trade-panel');

    expect(marketOverlay.classList.contains('hidden')).toBe(true);
    expect(infoPanel.classList.contains('panel-open')).toBe(false);
    expect(tradePanel.classList.contains('panel-open')).toBe(true);
    expect(consolePanel.classList.contains('panel-open')).toBe(false);
    expect(tradePanel.getAttribute('aria-hidden')).toBe('false');

    closeAllNonBlockingSurfaces();

    expect(marketOverlay.classList.contains('hidden')).toBe(true);
    expect(tradePanel.classList.contains('panel-open')).toBe(false);
    expect(tradePanel.getAttribute('aria-hidden')).toBe('true');
  });

  it('secondary surface 首次打开会聚焦当前页签，关闭后恢复原入口', function () {
    var infoPanel = createFakeElement();
    var activeTab = createFakeElement();
    var trigger = createFakeElement();
    var activeTabFocusCount = 0;
    var triggerFocusCount = 0;
    infoPanel.id = 'info-panel';
    infoPanel.contains = function (target) { return target === activeTab; };
    infoPanel.querySelector = function (selector) {
      return selector === '[data-secondary-initial-focus], [role="tab"][aria-selected="true"]' ? activeTab : null;
    };
    activeTab.focus = function () {
      activeTabFocusCount += 1;
      globalThis.document.activeElement = activeTab;
    };
    activeTab.closest = function () { return null; };
    trigger.focus = function () {
      triggerFocusCount += 1;
      globalThis.document.activeElement = trigger;
    };
    trigger.closest = function () { return null; };

    globalThis.document = {
      body: createFakeElement(),
      activeElement: trigger,
      getElementById: function (id) {
        return id === 'info-panel' ? infoPanel : null;
      },
      querySelector: function () { return trigger; },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [] : [];
      },
    };

    openSecondarySurface('info-panel');
    expect(activeTabFocusCount).toBe(1);
    expect(globalThis.document.activeElement).toBe(activeTab);

    openSecondarySurface('info-panel');
    expect(activeTabFocusCount).toBe(1);

    closeSecondarySurface('info-panel');
    expect(triggerFocusCount).toBe(1);
    expect(globalThis.document.activeElement).toBe(trigger);
    expect(infoPanel.getAttribute('aria-hidden')).toBe('true');
  });
});
