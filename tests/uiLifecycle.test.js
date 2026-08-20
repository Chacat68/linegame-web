import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as Modal from '../js/ui/Modal.js';
import { createWorkspaceTabController } from '../js/ui/WorkspaceTabController.js';
import { createTestState } from './helpers.js';

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
  var attributes = Object.create(null);
  return {
    dataset: {},
    value: '',
    max: '',
    style: {},
    hidden: false,
    onclick: null,
    disabled: false,
    focused: false,
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: function (type, handler) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(function (candidate) {
        return candidate !== handler;
      });
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
    querySelectorAll: function () { return []; },
  };
}

describe('UI lifecycle idempotency', function () {
  var originalDocument;
  var originalWindow;
  var originalUIManager;

  beforeEach(function () {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    originalUIManager = globalThis.__linegameUIManager;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    if (typeof originalUIManager === 'undefined') {
      delete globalThis.__linegameUIManager;
    } else {
      globalThis.__linegameUIManager = originalUIManager;
    }
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

  it('WorkspaceTabController 重复初始化只绑定工作区内部 tab，不接管底部导航', function () {
    var tabA = createFakeElement();
    tabA.dataset.tab = 'market';
    var tabB = createFakeElement();
    tabB.dataset.tab = 'hangar';
    var bottomNav = createFakeElement();
    var infoPanelToggle = createFakeElement();
    var tradePanelToggle = createFakeElement();
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
        if (id === 'trade-panel-toggle') return tradePanelToggle;
        if (id === 'console-panel-close') return consolePanelClose;
        return createFakeElement();
      },
      querySelector: function () { return null; },
    };

    var controller = createWorkspaceTabController({
      getState: function () { return {}; },
      getDocument: function () { return globalThis.document; },
    });
    controller.init();
    controller.init();

    expect(tabA.listenerCount('click')).toBe(1);
    expect(tabB.listenerCount('click')).toBe(1);
    expect(bottomNav.listenerCount('click')).toBe(0);
    expect(infoPanelToggle.listenerCount('click')).toBe(1);
    expect(tradePanelToggle.listenerCount('click')).toBe(1);
    expect(consolePanelClose.listenerCount('click')).toBe(1);
    controller.dispose();
  });

  it('MapUI.dispose 释放监听与全局回调，并允许重新初始化', async function () {
    vi.resetModules();

    var tab = createFakeElement();
    tab.dataset.tab = 'market';
    var bottomNav = createFakeElement();
    var infoPanel = createFakeElement();
    var tradePanel = createFakeElement();
    var body = createFakeElement();

    globalThis.window = {};
    globalThis.document = {
      body: body,
      querySelectorAll: function (selector) {
        if (selector === '.tab-btn') return [tab];
        return [];
      },
      getElementById: function (id) {
        if (id === 'bottom-nav') return bottomNav;
        if (id === 'info-panel') return infoPanel;
        if (id === 'trade-panel') return tradePanel;
        return null;
      },
      querySelector: function () { return null; },
    };

    var MapUI = await import('../js/ui/MapUI.js');
    MapUI.init3DCallbacks(function () { return null; }, function () {}, function () {});

    expect(bottomNav.listenerCount('click')).toBe(0);
    expect(typeof globalThis.window._mapClickCallback).toBe('function');

    expect(MapUI.dispose()).toBe(true);
    expect(MapUI.dispose()).toBe(false);
    expect(bottomNav.listenerCount('click')).toBe(0);
    expect(globalThis.window._mapClickCallback).toBe(null);
    expect(globalThis.window._galaxyClickCallback).toBe(null);

    MapUI.init3DCallbacks(function () { return null; }, function () {}, function () {});
    expect(typeof globalThis.window._mapClickCallback).toBe('function');
    expect(bottomNav.listenerCount('click')).toBe(0);
    MapUI.dispose();
  });

  it('WorkspaceTabController 支持方向键切换并只请求 canonical workspace', function () {
    vi.resetModules();

    var tabQuest = createFakeElement(['tab-btn', 'active']);
    tabQuest.dataset.tab = 'tab-quest';
    tabQuest.dataset.tabGroup = 'info';
    var tabResearch = createFakeElement(['tab-btn']);
    tabResearch.dataset.tab = 'tab-research';
    tabResearch.dataset.tabGroup = 'info';
    var tabs = [tabQuest, tabResearch];

    var paneQuest = createFakeElement(['tab-pane', 'active']);
    paneQuest.id = 'tab-quest';
    paneQuest.dataset.tabGroup = 'info';
    var paneResearch = createFakeElement(['tab-pane']);
    paneResearch.id = 'tab-research';
    paneResearch.dataset.tabGroup = 'info';
    var panes = [paneQuest, paneResearch];

    var bottomNav = createFakeElement();
    var infoPanel = createFakeElement();
    var tradePanel = createFakeElement();
    var consolePanel = createFakeElement();
    var marketOverlay = createFakeElement();
    var prevented = false;
    var tabChanges = [];
    var navigationRequests = [];
    var navigationActions = {
      navigate: function (workspace) {
        navigationRequests.push(workspace);
        return true;
      },
    };

    globalThis.window = {};
    globalThis.BABYLON = {
      Color3: function () {},
      Color4: function () {},
    };
    globalThis.document = {
      querySelectorAll: function (selector) {
        if (selector === '.tab-btn') return tabs;
        if (selector === '.tab-btn[data-tab-group="info"]') return tabs;
        if (selector === '.tab-pane[data-tab-group="info"]') return panes;
        if (selector === '.bottom-nav-btn') return [];
        if (selector === '.modal') return [];
        return [];
      },
      querySelector: function (selector) {
        if (selector === '.tab-btn[data-tab="tab-quest"]') return tabQuest;
        if (selector === '.tab-btn[data-tab="tab-research"]') return tabResearch;
        if (selector === '.tab-btn[data-tab-group="info"].active') {
          return tabs.find(function (tab) { return tab.classList.contains('active'); }) || null;
        }
        return null;
      },
      getElementById: function (id) {
        if (id === 'bottom-nav') return bottomNav;
        if (id === 'info-panel') return infoPanel;
        if (id === 'trade-panel') return tradePanel;
        if (id === 'console-panel') return consolePanel;
        if (id === 'market-overlay') return marketOverlay;
        if (id === 'tab-quest') return paneQuest;
        if (id === 'tab-research') return paneResearch;
        return null;
      },
    };

    var controller = createWorkspaceTabController({
      getState: function () { return {}; },
      getDocument: function () { return globalThis.document; },
      navigate: navigationActions.navigate,
      onChange: function (tabId, metadata) { tabChanges.push([tabId, metadata]); },
    });
    controller.init();

    tabQuest.dispatchEvent('keydown', {
      key: 'ArrowRight',
      currentTarget: tabQuest,
      preventDefault: function () {
        prevented = true;
      },
    });

    expect(prevented).toBe(true);
    expect(tabResearch.focused).toBe(true);
    expect(tabQuest.classList.contains('active')).toBe(false);
    expect(tabResearch.classList.contains('active')).toBe(true);
    expect(tabQuest.getAttribute('aria-selected')).toBe('false');
    expect(tabResearch.getAttribute('aria-selected')).toBe('true');
    expect(paneQuest.classList.contains('active')).toBe(false);
    expect(paneResearch.classList.contains('active')).toBe(true);
    expect(paneQuest.getAttribute('aria-hidden')).toBe('true');
    expect(paneResearch.getAttribute('aria-hidden')).toBe('false');
    expect(infoPanel.classList.contains('is-active')).toBe(false);
    expect(tradePanel.classList.contains('is-active')).toBe(false);
    expect(navigationRequests).toEqual(['archive']);
    expect(tabChanges).toEqual([['tab-research', {
      changed: true,
      group: 'info',
      previousTabId: 'tab-quest',
      source: 'keyboard',
    }]]);
    controller.dispose();
  });

  it('MapUI 不再监听底部导航或直接改变任何 L3 workspace surface', function () {
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
    var marketOverlay = createFakeElement();
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
      expect(MapUI.initTabs).toBeUndefined();
      expect(bottomNav.listenerCount('click')).toBe(0);

      clickBottomButton(hangarBtn);
      expect(tradePanel.classList.contains('is-active')).toBe(false);
      expect(infoPanel.classList.contains('is-active')).toBe(false);
      expect(consolePanel.classList.contains('is-active')).toBe(false);
      expect(hangarBtn.classList.contains('active')).toBe(false);
      expect(starmapBtn.classList.contains('active')).toBe(true);

      clickBottomButton(questsBtn);
      expect(tradePanel.classList.contains('is-active')).toBe(false);
      expect(infoPanel.classList.contains('is-active')).toBe(false);
      expect(consolePanel.classList.contains('is-active')).toBe(false);
      expect(questsBtn.classList.contains('active')).toBe(false);

      clickBottomButton(consoleBtn);
      expect(tradePanel.classList.contains('is-active')).toBe(false);
      expect(infoPanel.classList.contains('is-active')).toBe(false);
      expect(consolePanel.classList.contains('is-active')).toBe(false);
      expect(consoleBtn.classList.contains('active')).toBe(false);

      clickBottomButton(starmapBtn);
      expect(tradePanel.classList.contains('is-active')).toBe(false);
      expect(infoPanel.classList.contains('is-active')).toBe(false);
      expect(consolePanel.classList.contains('is-active')).toBe(false);
      expect(starmapBtn.classList.contains('active')).toBe(true);
      expect(marketOverlay.classList.contains('is-active')).toBe(false);
    });
  });

  it('MapUI 不提供日志 workspace 的 fallback 导航状态机', function () {
    vi.resetModules();

    var starmapBtn = createFakeElement(['bottom-nav-btn', 'active']);
    starmapBtn.dataset.view = 'starmap';
    var logsBtn = createFakeElement(['bottom-nav-btn']);
    logsBtn.dataset.view = 'logs';
    var bottomButtons = [starmapBtn, logsBtn];

    var bottomNav = createFakeElement();
    var tradePanel = createFakeElement();
    var infoPanel = createFakeElement();
    var consolePanel = createFakeElement();
    var marketOverlay = createFakeElement();

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
        if (selector === '.modal') return [];
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
        return null;
      },
    };

    return import('../js/ui/MapUI.js').then(function (MapUI) {
      expect(bottomNav.listenerCount('click')).toBe(0);

      clickBottomButton(logsBtn);
      expect(starmapBtn.classList.contains('active')).toBe(true);
      expect(logsBtn.classList.contains('active')).toBe(false);
      expect(tradePanel.classList.contains('is-active')).toBe(false);
      expect(infoPanel.classList.contains('is-active')).toBe(false);
      expect(consolePanel.classList.contains('is-active')).toBe(false);

      clickBottomButton(logsBtn);
      expect(starmapBtn.classList.contains('active')).toBe(true);
      expect(logsBtn.classList.contains('active')).toBe(false);
      expect(consolePanel.classList.contains('is-active')).toBe(false);
    });
  });

  it('MapUI 不再解释旧 console 底栏别名', function () {
    vi.resetModules();

    var starmapBtn = createFakeElement(['bottom-nav-btn', 'active']);
    starmapBtn.dataset.view = 'starmap';
    var consoleBtn = createFakeElement(['bottom-nav-btn']);
    consoleBtn.dataset.view = 'console';
    var bottomButtons = [starmapBtn, consoleBtn];

    var bottomNav = createFakeElement();
    var tradePanel = createFakeElement();
    var infoPanel = createFakeElement();
    var marketOverlay = createFakeElement();

    function findActiveBottomButton() {
      return bottomButtons.find(function (button) {
        return button.classList.contains('active');
      }) || null;
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
        if (selector === '.modal') return [];
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
        if (id === 'market-overlay') return marketOverlay;
        return null;
      },
    };

    return import('../js/ui/MapUI.js').then(function (MapUI) {

      bottomNav.dispatchEvent('click', {
        target: {
          closest: function (selector) {
            return selector === '.bottom-nav-btn' ? consoleBtn : null;
          },
        },
      });

      expect(consoleBtn.classList.contains('active')).toBe(false);
      expect(starmapBtn.classList.contains('active')).toBe(true);
    });
  });

  it('MapUI 不拦截 blocking modal 下的底栏事件，统一交由 UIManager', function () {
    vi.resetModules();

    var starmapBtn = createFakeElement(['bottom-nav-btn', 'active']);
    starmapBtn.dataset.view = 'starmap';
    var questsBtn = createFakeElement(['bottom-nav-btn']);
    questsBtn.dataset.view = 'quests';
    var bottomButtons = [starmapBtn, questsBtn];

    var bottomNav = createFakeElement();
    var infoPanel = createFakeElement();
    var tradePanel = createFakeElement();
    var consolePanel = createFakeElement();
    var marketOverlay = createFakeElement();
    var tutorialModal = createFakeElement(['modal']);
    tutorialModal.id = 'tutorial-start-modal';

    var prevented = false;
    var stopped = false;

    function findActiveBottomButton() {
      return bottomButtons.find(function (button) {
        return button.classList.contains('active');
      }) || null;
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
        if (selector === '.modal') return [tutorialModal];
        return [];
      },
      querySelector: function (selector) {
        if (selector === '.bottom-nav-btn.active') return findActiveBottomButton();
        return null;
      },
      getElementById: function (id) {
        if (id === 'bottom-nav') return bottomNav;
        if (id === 'info-panel') return infoPanel;
        if (id === 'trade-panel') return tradePanel;
        if (id === 'console-panel') return consolePanel;
        if (id === 'market-overlay') return marketOverlay;
        return null;
      },
    };

    return import('../js/ui/MapUI.js').then(function (MapUI) {
      expect(bottomNav.listenerCount('click')).toBe(0);

      bottomNav.dispatchEvent('click', {
        target: {
          closest: function (selector) {
            return selector === '.bottom-nav-btn' ? questsBtn : null;
          },
        },
        preventDefault: function () { prevented = true; },
        stopPropagation: function () { stopped = true; },
      });

      expect(prevented).toBe(false);
      expect(stopped).toBe(false);
      expect(infoPanel.classList.contains('is-active')).toBe(false);
      expect(questsBtn.classList.contains('active')).toBe(false);
      expect(starmapBtn.classList.contains('active')).toBe(true);
    });
  });

  it('UIManager 接管底部导航时 MapUI 不会二次切换', function () {
    vi.resetModules();

    var starmapBtn = createFakeElement(['bottom-nav-btn', 'active']);
    starmapBtn.dataset.view = 'starmap';
    var marketBtn = createFakeElement(['bottom-nav-btn']);
    marketBtn.dataset.view = 'market';
    var bottomButtons = [starmapBtn, marketBtn];
    var bottomNav = createFakeElement();
    var calls = [];

    function setActive(view) {
      bottomButtons.forEach(function (button) {
        button.classList.toggle('active', button.dataset.view === view);
      });
    }

    var navigationManager = {
      currentView: 'starmap',
      switchView: function (view) {
        var nextView = view;
        if (nextView !== 'starmap' && nextView === this.currentView) {
          nextView = 'starmap';
        }
        this.currentView = nextView;
        setActive(nextView);
        calls.push(nextView);
      },
      getCurrentView: function () { return this.currentView; },
    };

    bottomNav.addEventListener('click', function (event) {
      var btn = event.target.closest('.bottom-nav-btn');
      if (btn) navigationManager.switchView(btn.dataset.view);
    });

    globalThis.window = {};
    globalThis.BABYLON = {
      Color3: function () {},
      Color4: function () {},
    };
    globalThis.document = {
      querySelectorAll: function (selector) {
        if (selector === '.tab-btn') return [];
        if (selector === '.bottom-nav-btn') return bottomButtons;
        if (selector === '.modal') return [];
        return [];
      },
      querySelector: function (selector) {
        if (selector === '.bottom-nav-btn.active') {
          return bottomButtons.find(function (button) {
            return button.classList.contains('active');
          }) || null;
        }
        return null;
      },
      getElementById: function (id) {
        if (id === 'bottom-nav') return bottomNav;
        return null;
      },
    };

    return import('../js/ui/MapUI.js').then(function (MapUI) {

      bottomNav.dispatchEvent('click', {
        target: {
          closest: function (selector) {
            return selector === '.bottom-nav-btn' ? marketBtn : null;
          },
        },
      });

      expect(calls).toEqual(['market']);
      expect(marketBtn.classList.contains('active')).toBe(true);
      expect(starmapBtn.classList.contains('active')).toBe(false);
    });
  });

  it('UIManager 独占底栏导航，并在直接底栏切换时保留触发按钮焦点', function () {
    vi.resetModules();

    var starmapBtn = createFakeElement(['bottom-nav-btn', 'active']);
    starmapBtn.dataset.view = 'starmap';
    var questsBtn = createFakeElement(['bottom-nav-btn']);
    questsBtn.dataset.view = 'quests';
    var bottomButtons = [starmapBtn, questsBtn];

    var bottomNav = createFakeElement();
    var clonedBottomNav = createFakeElement();
    bottomNav.cloneNode = function () { return clonedBottomNav; };
    bottomNav.parentNode = {
      replaceChild: function () {},
    };

    var infoPanel = createFakeElement(['is-active']);
    var tradePanel = createFakeElement();
    var consolePanel = createFakeElement();
    var marketOverlay = createFakeElement();
    var canvas = createFakeElement();

    globalThis.window = {};
    globalThis.document = {
      querySelectorAll: function (selector) {
        if (selector === '.bottom-nav-btn') return bottomButtons;
        if (selector === '.modal') return [];
        return [];
      },
      getElementById: function (id) {
        if (id === 'bottom-nav') return bottomNav;
        if (id === 'info-panel') return infoPanel;
        if (id === 'trade-panel') return tradePanel;
        if (id === 'console-panel') return consolePanel;
        if (id === 'market-overlay') return marketOverlay;
        if (id === 'map-3d-canvas') return canvas;
        return null;
      },
    };

    var closeOptions = null;
    return import('../js/ui/UIManager.js').then(function (UIManager) {
      UIManager.init({}, {
        onCloseMarket: function (options) { closeOptions = options; },
      });

      questsBtn.focus();
      clonedBottomNav.dispatchEvent('click', {
        target: { closest: function () { return questsBtn; } },
      });

      expect(UIManager.getCurrentView()).toBe('quests');
      expect(starmapBtn.classList.contains('active')).toBe(false);
      expect(questsBtn.classList.contains('active')).toBe(true);
      expect(infoPanel.classList.contains('is-active')).toBe(true);
      expect(infoPanel.focused).toBe(false);
      expect(questsBtn.focused).toBe(true);
      expect(canvas.classList.contains('starmap-blur-active')).toBe(true);
      expect(closeOptions).toBe(null);
      expect(globalThis.__linegameUIManager).toBeUndefined();
    });
  });

  it('UIManager 在 blocking surface 打开时消费底栏请求且不切换 L3', async function () {
    vi.resetModules();

    var bottomNav = createFakeElement();
    var clonedBottomNav = createFakeElement();
    bottomNav.cloneNode = function () { return clonedBottomNav; };
    bottomNav.parentNode = { replaceChild: function () {} };
    var marketButton = createFakeElement(['bottom-nav-btn']);
    marketButton.dataset.view = 'market';
    var blockingModal = createFakeElement(['modal']);
    blockingModal.id = 'event-modal';

    globalThis.document = {
      addEventListener: function () {},
      removeEventListener: function () {},
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [blockingModal];
        if (selector === '.bottom-nav-btn') return [marketButton];
        return [];
      },
      getElementById: function (id) { return id === 'bottom-nav' ? bottomNav : null; },
    };

    var UIManager = await import('../js/ui/UIManager.js');
    UIManager.init({}, {});
    var prevented = false;
    var stopped = false;
    clonedBottomNav.dispatchEvent('click', {
      target: { closest: function () { return marketButton; } },
      preventDefault: function () { prevented = true; },
      stopPropagation: function () { stopped = true; },
    });

    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
    expect(UIManager.getCurrentView()).toBe('starmap');
  });

  it('UIManager 切换工作区时从 provider 读取最新状态', function () {
    vi.resetModules();

    var bottomNav = createFakeElement();
    var clonedBottomNav = createFakeElement();
    bottomNav.cloneNode = function () { return clonedBottomNav; };
    bottomNav.parentNode = { replaceChild: function () {} };
    var marketOverlay = createFakeElement();
    var firstState = { id: 'before-load' };
    var loadedState = { id: 'after-load' };
    var currentState = firstState;
    var observedState = null;

    globalThis.document = {
      querySelectorAll: function () { return []; },
      getElementById: function (id) {
        if (id === 'bottom-nav') return bottomNav;
        if (id === 'market-overlay') return marketOverlay;
        return null;
      },
    };

    return import('../js/ui/UIManager.js').then(function (UIManager) {
      UIManager.init(function () { return currentState; }, {
        onOpenMarket: function (state) { observedState = state; },
      });

      currentState = loadedState;
      UIManager.switchView('market');

      expect(observedState).toBe(loadedState);
    });
  });

  it('UIManager 等待延迟工作区进入完成后提交焦点，并丢弃旧工作区迟到结果', async function () {
    vi.resetModules();

    var starmapBtn = createFakeElement(['bottom-nav-btn', 'active']);
    starmapBtn.dataset.view = 'starmap';
    var fleetBtn = createFakeElement(['bottom-nav-btn']);
    fleetBtn.dataset.view = 'hangar';
    var archiveBtn = createFakeElement(['bottom-nav-btn']);
    archiveBtn.dataset.view = 'quests';
    var bottomButtons = [starmapBtn, fleetBtn, archiveBtn];
    var bottomNav = createFakeElement();
    var clonedBottomNav = createFakeElement();
    bottomNav.cloneNode = function () { return clonedBottomNav; };
    bottomNav.parentNode = { replaceChild: function () {} };
    var main = createFakeElement();
    var map = createFakeElement();
    var mapContainer = createFakeElement();
    mapContainer.children = [];
    var market = createFakeElement();
    var fleet = createFakeElement();
    var archive = createFakeElement();
    var logs = createFakeElement();
    var resolveFleet;
    var fleetReady = new Promise(function (resolve) { resolveFleet = resolve; });

    globalThis.document = {
      addEventListener: function () {},
      removeEventListener: function () {},
      querySelectorAll: function (selector) {
        if (selector === '.bottom-nav-btn') return bottomButtons;
        return [];
      },
      getElementById: function (id) {
        if (id === 'bottom-nav') return bottomNav;
        if (id === 'game-main') return main;
        if (id === 'map-section') return map;
        if (id === 'map-container') return mapContainer;
        if (id === 'market-overlay') return market;
        if (id === 'trade-panel') return fleet;
        if (id === 'info-panel') return archive;
        if (id === 'console-panel') return logs;
        return null;
      },
    };

    var UIManager = await import('../js/ui/UIManager.js');
    UIManager.init({}, {
      onOpenHangar: function () { return fleetReady; },
      onOpenQuests: function () { return Promise.resolve(true); },
    });

    UIManager.switchView('fleet');
    expect(fleet.classList.contains('is-active')).toBe(true);
    expect(fleet.focused).toBe(false);

    UIManager.switchView('archive');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(archive.focused).toBe(true);
    expect(fleet.focused).toBe(false);

    resolveFleet(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(fleet.focused).toBe(false);
    expect(UIManager.getWorkspaceSurfaceSnapshot()).toMatchObject({
      activeWorkspace: 'archive',
      consistent: true,
    });
  });

  it('UIManager.dispose 释放底栏绑定且不会发布全局导航 facade', async function () {
    vi.resetModules();

    var bottomNav = createFakeElement();
    var clonedBottomNav = createFakeElement();
    bottomNav.cloneNode = function () { return clonedBottomNav; };
    bottomNav.parentNode = { replaceChild: function () {} };

    globalThis.document = {
      querySelectorAll: function () { return []; },
      getElementById: function (id) { return id === 'bottom-nav' ? bottomNav : null; },
    };

    var UIManager = await import('../js/ui/UIManager.js');
    UIManager.init({}, {});
    expect(clonedBottomNav.listenerCount('click')).toBe(1);
    expect(clonedBottomNav.listenerCount('keydown')).toBe(1);
    expect(globalThis.__linegameUIManager).toBeUndefined();

    expect(UIManager.dispose()).toBe(true);
    expect(UIManager.dispose()).toBe(false);
    expect(clonedBottomNav.listenerCount('click')).toBe(0);
    expect(clonedBottomNav.listenerCount('keydown')).toBe(0);
    expect(globalThis.__linegameUIManager).toBeUndefined();
    expect(UIManager.getNavigationSnapshot()).toBe(null);
    expect(UIManager.switchView('market')).toBe(false);
  });

  it('UIManager 把详情 Escape 接入统一 dispatcher 且不退出当前工作区', async function () {
    vi.resetModules();

    var starmapBtn = createFakeElement(['bottom-nav-btn', 'active']);
    starmapBtn.dataset.view = 'starmap';
    var marketBtn = createFakeElement(['bottom-nav-btn']);
    marketBtn.dataset.view = 'market';
    var bottomNav = createFakeElement();
    var clonedBottomNav = createFakeElement();
    var documentListeners = Object.create(null);
    bottomNav.cloneNode = function () { return clonedBottomNav; };
    bottomNav.parentNode = { replaceChild: function () {} };

    globalThis.document = {
      getElementById: function (id) { return id === 'bottom-nav' ? bottomNav : null; },
      querySelectorAll: function (selector) {
        if (selector === '.bottom-nav-btn') return [starmapBtn, marketBtn];
        return [];
      },
      addEventListener: function (type, handler) {
        if (!documentListeners[type]) documentListeners[type] = [];
        documentListeners[type].push(handler);
      },
      removeEventListener: function () {},
    };

    var UIManager = await import('../js/ui/UIManager.js');
    UIManager.init({}, {});
    UIManager.switchView('market');
    UIManager.openDetail('commodity:medicine');
    expect(UIManager.getCurrentView()).toBe('market');
    expect(UIManager.getNavigationSnapshot().activeDetail).toBe('commodity:medicine');
    expect(documentListeners.keydown).toHaveLength(1);

    var prevented = false;
    documentListeners.keydown[0]({
      key: 'Escape',
      preventDefault: function () { prevented = true; },
      stopPropagation: function () {},
    });

    expect(prevented).toBe(true);
    expect(UIManager.getCurrentView()).toBe('market');
    expect(UIManager.getNavigationSnapshot().activeDetail).toBe(null);
  });

  it('交易确认会先关闭阻塞弹窗再执行成交回调', function () {
    var observedHiddenDuringConfirm = null;
    var elements = {
      'modal-decrease': createFakeElement(),
      'modal-increase': createFakeElement(),
      'modal-all': createFakeElement(),
      'modal-amount': createFakeElement(),
      'modal-cancel': createFakeElement(),
      'modal-confirm': createFakeElement(),
      'modal-title': createFakeElement(),
      'modal-desc': createFakeElement(),
      'modal-total': createFakeElement(),
      'trade-modal': createFakeElement(['hidden', 'modal']),
    };

    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [elements['trade-modal']] : [];
      },
      addEventListener: function () {},
    };

    Modal.init(function () {
      observedHiddenDuringConfirm = elements['trade-modal'].classList.contains('hidden');
    });

    Modal.openTradeModal('buy', {
      id: 'food',
      emoji: '🌾',
      name: '食物',
    }, createTestState({
      credits: 5000,
      maxCargo: 20,
      cargo: {},
      currentSystem: 'sol_prime',
    }), 'open', {
      initialQuantity: 1,
    });

    expect(elements['trade-modal'].classList.contains('hidden')).toBe(false);
    elements['modal-confirm'].onclick();

    expect(observedHiddenDuringConfirm).toBe(true);
  });
});
