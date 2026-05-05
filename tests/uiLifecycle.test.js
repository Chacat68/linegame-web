import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as Modal from '../js/ui/Modal.js';

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
  var listeners = Object.create(null);
  return {
    dataset: {},
    value: '',
    max: '',
    style: {},
    hidden: false,
    onclick: null,
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatchEvent: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || { target: this, preventDefault: function () {} });
      }, this);
    },
    listenerCount: function (type) {
      return (listeners[type] || []).length;
    },
    classList: createFakeClassList(initialClasses),
    setAttribute: function () {},
    removeAttribute: function () {},
    querySelectorAll: function () { return []; },
  };
}

describe('UI lifecycle idempotency', function () {
  var originalDocument;
  var originalWindow;

  beforeEach(function () {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  it('Modal.init 重复调用不会叠加按钮监听', function () {
    var elements = {
      'modal-decrease': createFakeElement(),
      'modal-increase': createFakeElement(),
      'modal-all': createFakeElement(),
      'modal-amount': createFakeElement(),
      'modal-cancel': createFakeElement(),
      'trade-modal': createFakeElement(),
      'modal-total': createFakeElement(),
    };

    elements['modal-amount'].value = '1';
    elements['modal-amount'].max = '5';

    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
    };

    Modal.init(function () {});
    Modal.init(function () {});

    expect(elements['modal-increase'].listenerCount('click')).toBe(1);
    elements['modal-increase'].dispatchEvent('click');
    expect(elements['modal-amount'].value).toBe(2);
  });

  it('MapUI.initTabs 重复调用不会叠加 tab 与底部导航监听', function () {
    var tabA = createFakeElement();
    tabA.dataset.tab = 'market';
    var tabB = createFakeElement();
    tabB.dataset.tab = 'hangar';
    var bottomNav = createFakeElement();
    var infoPanelToggle = createFakeElement();
    var consolePanelClose = createFakeElement();

    globalThis.window = {};
    globalThis.BABYLON = {
      Color3: function () {},
      Color4: function () {},
    };
    globalThis.document = {
      querySelectorAll: function (selector) {
        if (selector === '.tab-btn') return [tabA, tabB];
        return [];
      },
      getElementById: function (id) {
        if (id === 'bottom-nav') return bottomNav;
        if (id === 'info-panel-toggle') return infoPanelToggle;
        if (id === 'console-panel-close') return consolePanelClose;
        return createFakeElement();
      },
      querySelector: function () { return null; },
    };

    return import('../js/ui/MapUI.js').then(function (MapUI) {
      MapUI.initTabs(function () {});
      MapUI.initTabs(function () {});

      expect(tabA.listenerCount('click')).toBe(1);
      expect(tabB.listenerCount('click')).toBe(1);
      expect(bottomNav.listenerCount('click')).toBe(1);
      expect(infoPanelToggle.listenerCount('click')).toBe(1);
      expect(consolePanelClose.listenerCount('click')).toBe(1);
    });
  });

  it('MapUI 底部导航切换时会保持 overlay 互斥并允许回到星图', function () {
    vi.resetModules();

    var starmapBtn = createFakeElement(['bottom-nav-btn', 'active']);
    starmapBtn.dataset.view = 'starmap';
    var marketBtn = createFakeElement(['bottom-nav-btn']);
    marketBtn.dataset.view = 'market';
    var hangarBtn = createFakeElement(['bottom-nav-btn']);
    hangarBtn.dataset.view = 'hangar';
    var questsBtn = createFakeElement(['bottom-nav-btn']);
    questsBtn.dataset.view = 'quests';
    var consoleBtn = createFakeElement(['bottom-nav-btn']);
    consoleBtn.dataset.view = 'console';
    var bottomButtons = [starmapBtn, marketBtn, hangarBtn, questsBtn, consoleBtn];

    var bottomNav = createFakeElement();
    var tradePanel = createFakeElement();
    var infoPanel = createFakeElement();
    var consolePanel = createFakeElement();
    var marketOverlay = createFakeElement(['hidden']);
    var marketViewBtn = createFakeElement();

    function findActiveBottomButton() {
      return bottomButtons.find(function (button) {
        return button.classList.contains('active');
      }) || null;
    }

    function clickBottomButton(button) {
      bottomNav.dispatchEvent('click', {
        target: {
          closest: function (selector) {
            return selector === '.bottom-nav-btn' ? button : null;
          },
        },
      });
    }

    globalThis.window = {};
    globalThis.BABYLON = {
      Color3: function () {},
      Color4: function () {},
    };
    globalThis.document = {
      querySelectorAll: function (selector) {
        if (selector === '.tab-btn') return [];
        if (selector === '.bottom-nav-btn') return bottomButtons;
        return [];
      },
      querySelector: function (selector) {
        if (selector === '.bottom-nav-btn.active') return findActiveBottomButton();
        return null;
      },
      getElementById: function (id) {
        if (id === 'bottom-nav') return bottomNav;
        if (id === 'trade-panel') return tradePanel;
        if (id === 'info-panel') return infoPanel;
        if (id === 'console-panel') return consolePanel;
        if (id === 'market-overlay') return marketOverlay;
        if (id === 'market-view-btn') return marketViewBtn;
        return null;
      },
    };

    return import('../js/ui/MapUI.js').then(function (MapUI) {
      MapUI.initTabs(function () {});

      clickBottomButton(hangarBtn);
      expect(tradePanel.classList.contains('panel-open')).toBe(true);
      expect(infoPanel.classList.contains('panel-open')).toBe(false);
      expect(consolePanel.classList.contains('panel-open')).toBe(false);
      expect(hangarBtn.classList.contains('active')).toBe(true);
      expect(starmapBtn.classList.contains('active')).toBe(false);

      clickBottomButton(questsBtn);
      expect(tradePanel.classList.contains('panel-open')).toBe(false);
      expect(infoPanel.classList.contains('panel-open')).toBe(true);
      expect(consolePanel.classList.contains('panel-open')).toBe(false);
      expect(questsBtn.classList.contains('active')).toBe(true);

      clickBottomButton(consoleBtn);
      expect(tradePanel.classList.contains('panel-open')).toBe(false);
      expect(infoPanel.classList.contains('panel-open')).toBe(false);
      expect(consolePanel.classList.contains('panel-open')).toBe(true);
      expect(consoleBtn.classList.contains('active')).toBe(true);

      clickBottomButton(starmapBtn);
      expect(tradePanel.classList.contains('panel-open')).toBe(false);
      expect(infoPanel.classList.contains('panel-open')).toBe(false);
      expect(consolePanel.classList.contains('panel-open')).toBe(false);
      expect(starmapBtn.classList.contains('active')).toBe(true);
      expect(marketOverlay.classList.contains('hidden')).toBe(true);
    });
  });
});