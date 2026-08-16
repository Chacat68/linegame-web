import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import * as Modal from '../js/ui/Modal.js';
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

  it('MapUI.initTabs 重复调用不会叠加 tab 与底部导航监听', function () {
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

    return import('../js/ui/MapUI.js').then(function (MapUI) {
      MapUI.initTabs(function () {});
      MapUI.initTabs(function () {});

      expect(tabA.listenerCount('click')).toBe(1);
      expect(tabB.listenerCount('click')).toBe(1);
      expect(bottomNav.listenerCount('click')).toBe(1);
      expect(infoPanelToggle.listenerCount('click')).toBe(1);
      expect(tradePanelToggle.listenerCount('click')).toBe(1);
      expect(consolePanelClose.listenerCount('click')).toBe(1);
    });
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
    MapUI.initTabs(function () {});
    MapUI.init3DCallbacks(function () { return null; }, function () {}, function () {});

    expect(tab.listenerCount('click')).toBe(1);
    expect(bottomNav.listenerCount('click')).toBe(1);
    expect(typeof globalThis.window._mapClickCallback).toBe('function');

    expect(MapUI.dispose()).toBe(true);
    expect(MapUI.dispose()).toBe(false);
    expect(tab.listenerCount('click')).toBe(0);
    expect(bottomNav.listenerCount('click')).toBe(0);
    expect(globalThis.window._mapClickCallback).toBe(null);
    expect(globalThis.window._galaxyClickCallback).toBe(null);

    MapUI.initTabs(function () {});
    expect(tab.listenerCount('click')).toBe(1);
    expect(bottomNav.listenerCount('click')).toBe(1);
    MapUI.dispose();
  });

  it('MapUI 二级终端 tab 支持方向键切换并同步面板状态', function () {
    vi.resetModules();

    var tabQuest = createFakeElement(['tab-btn', 'active']);
    tabQuest.dataset.tab = 'tab-quest';
    tabQuest.dataset.tabGroup = 'info';
    var tabResearch = createFakeElement(['tab-btn']);
    tabResearch.dataset.tab = 'tab-research';
    tabResearch.dataset.tabGroup = 'info';
    var tabs = [tabQuest, tabResearch];

    var paneQuest = createFakeElement(['tab-pane', 'active']);
    paneQuest.dataset.tabGroup = 'info';
    var paneResearch = createFakeElement(['tab-pane']);
    paneResearch.dataset.tabGroup = 'info';
    var panes = [paneQuest, paneResearch];

    var bottomNav = createFakeElement();
    var infoPanel = createFakeElement();
    var tradePanel = createFakeElement();
    var consolePanel = createFakeElement();
    var marketOverlay = createFakeElement(['hidden']);
    var prevented = false;

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

    return import('../js/ui/MapUI.js').then(function (MapUI) {
      MapUI.initTabs(function () {});

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
      expect(infoPanel.classList.contains('panel-open')).toBe(true);
      expect(tradePanel.classList.contains('panel-open')).toBe(false);
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

  it('MapUI fallback 底部日志入口打开终端，再次点击返回星图', function () {
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
    var marketOverlay = createFakeElement(['hidden']);

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
      MapUI.initTabs(function () {});

      clickBottomButton(logsBtn);
      expect(starmapBtn.classList.contains('active')).toBe(false);
      expect(logsBtn.classList.contains('active')).toBe(true);
      expect(tradePanel.classList.contains('panel-open')).toBe(false);
      expect(infoPanel.classList.contains('panel-open')).toBe(false);
      expect(consolePanel.classList.contains('panel-open')).toBe(true);

      clickBottomButton(logsBtn);
      expect(starmapBtn.classList.contains('active')).toBe(true);
      expect(logsBtn.classList.contains('active')).toBe(false);
      expect(consolePanel.classList.contains('panel-open')).toBe(false);
    });
  });

  it('MapUI fallback 会把没有 DOM 的旧 console 入口转成日志角标清理', function () {
    vi.resetModules();

    var starmapBtn = createFakeElement(['bottom-nav-btn', 'active']);
    starmapBtn.dataset.view = 'starmap';
    var consoleBtn = createFakeElement(['bottom-nav-btn']);
    consoleBtn.dataset.view = 'console';
    var bottomButtons = [starmapBtn, consoleBtn];

    var bottomNav = createFakeElement();
    var tradePanel = createFakeElement();
    var infoPanel = createFakeElement();
    var marketOverlay = createFakeElement(['hidden']);

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
      MapUI.initTabs(function () {});

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

  it('阻塞弹窗打开时底部导航不会切换底层面板', function () {
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
    var marketOverlay = createFakeElement(['hidden']);
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
      MapUI.initTabs(function () {});

      bottomNav.dispatchEvent('click', {
        target: {
          closest: function (selector) {
            return selector === '.bottom-nav-btn' ? questsBtn : null;
          },
        },
        preventDefault: function () { prevented = true; },
        stopPropagation: function () { stopped = true; },
      });

      expect(prevented).toBe(true);
      expect(stopped).toBe(true);
      expect(infoPanel.classList.contains('panel-open')).toBe(false);
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

    globalThis.__linegameUIManager = {
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
      setBottomNavActiveDirectly: setActive,
      getCurrentView: function () { return this.currentView; },
    };

    bottomNav.addEventListener('click', function (event) {
      var btn = event.target.closest('.bottom-nav-btn');
      if (btn) globalThis.__linegameUIManager.switchView(btn.dataset.view);
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
      MapUI.initTabs(function () {});

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

  it('UIManager 会同步由 MapUI 直接切开的底栏视图状态', function () {
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

    var infoPanel = createFakeElement(['panel-open']);
    var tradePanel = createFakeElement();
    var consolePanel = createFakeElement();
    var marketOverlay = createFakeElement(['hidden']);
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

      globalThis.__linegameUIManager.setBottomNavActiveDirectly('quests');
      expect(UIManager.getCurrentView()).toBe('quests');
      expect(questsBtn.classList.contains('active')).toBe(true);
      expect(canvas.classList.contains('starmap-blur-active')).toBe(true);

      UIManager.switchView('quests');

      expect(UIManager.getCurrentView()).toBe('quests');
      expect(starmapBtn.classList.contains('active')).toBe(false);
      expect(questsBtn.classList.contains('active')).toBe(true);
      expect(infoPanel.classList.contains('panel-open')).toBe(true);
      expect(canvas.classList.contains('starmap-blur-active')).toBe(true);
      expect(closeOptions).toBe(null);
    });
  });

  it('UIManager 切换工作区时从 provider 读取最新状态', function () {
    vi.resetModules();

    var bottomNav = createFakeElement();
    var clonedBottomNav = createFakeElement();
    bottomNav.cloneNode = function () { return clonedBottomNav; };
    bottomNav.parentNode = { replaceChild: function () {} };
    var marketOverlay = createFakeElement(['hidden']);
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

  it('UIManager.dispose 释放底栏绑定和导航 facade', async function () {
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
    expect(globalThis.__linegameUIManager).toBeTruthy();

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
