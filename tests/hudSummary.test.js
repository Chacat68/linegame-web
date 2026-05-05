import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestState } from './helpers.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Quest from '../js/systems/quest/QuestSystem.js';

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
    textContent: '',
    innerHTML: '',
    style: {},
    classList: createFakeClassList(initialClasses),
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    listenerCount: function (type) {
      return (listeners[type] || []).length;
    },
    dispatchEvent: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || {
          preventDefault: function () {},
          stopPropagation: function () {},
          target: this,
        });
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
    querySelectorAll: function () {
      return [];
    },
  };
}

function createQuestTrackerElement() {
  var element = createFakeElement();
  var html = '';
  Object.defineProperty(element, 'innerHTML', {
    get: function () {
      return html;
    },
    set: function (value) {
      html = String(value);
    },
  });
  element.querySelectorAll = function (selector) {
    if (selector !== '[data-quest-tracker-accept]') return [];
    return Array.from(html.matchAll(/data-quest-tracker-accept="([^"]+)"/g)).map(function (match) {
      var button = createFakeElement();
      button.dataset.questTrackerAccept = match[1];
      return button;
    });
  };
  return element;
}

function createHtmlElement() {
  var element = createFakeElement();
  var html = '';
  Object.defineProperty(element, 'innerHTML', {
    get: function () {
      return html;
    },
    set: function (value) {
      html = String(value);
    },
  });
  return element;
}

describe('HUD summary cards', function () {
  var originalDocument;

  beforeEach(function () {
    originalDocument = globalThis.document;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('银河地图 HUD 会显示当前星图摘要并绑定视图切换入口一次', async function () {
    vi.resetModules();

    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      mapView: 'planets',
      credits: 1000,
      day: 1,
    });
    Economy.init();
    Faction.init(state);
    Quest.init(state);

    var galaxyViewEl = createFakeElement();
    var galaxyFocusEl = createFakeElement();
    var galaxyCaptionEl = createFakeElement();
    var galaxyToggleBtn = createFakeElement();
    var galaxyViewBtn = createFakeElement();
    var galaxyViewClicks = 0;
    galaxyViewBtn.click = function () {
      galaxyViewClicks += 1;
    };

    var elements = {
      'hud-galactic-map-view': galaxyViewEl,
      'hud-galactic-map-focus': galaxyFocusEl,
      'hud-galactic-map-caption': galaxyCaptionEl,
      'hud-galactic-map-toggle': galaxyToggleBtn,
      'galaxy-view-btn': galaxyViewBtn,
      'victory-modal': createFakeElement(['hidden']),
    };

    globalThis.document = {
      getElementById: function (id) {
        if (!elements[id]) elements[id] = createFakeElement();
        return elements[id];
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
    };

    var HUD = await import('../js/ui/HUD.js');
    HUD.updateStats(state, 1000);
    HUD.updateStats(state, 1000);

    expect(galaxyViewEl.textContent).toBe('星球视图');
    expect(galaxyFocusEl.textContent).toBe('银河系 · 太阳主星');
    expect(galaxyCaptionEl.textContent).toBe('切换到跨星系跃迁总览');
    expect(galaxyToggleBtn.textContent).toBe('星系总览');
    expect(galaxyToggleBtn.listenerCount('click')).toBe(1);

    galaxyToggleBtn.dispatchEvent('click');
    expect(galaxyViewClicks).toBe(1);

    state.mapView = 'galaxies';
    HUD.updateStats(state, 1000);
    expect(galaxyViewEl.textContent).toBe('星系总览');
    expect(galaxyCaptionEl.textContent).toBe('返回当前星系局部视图');
    expect(galaxyToggleBtn.textContent).toBe('回到当前星系');
  });

  it('任务追踪 HUD 只显示首要任务摘要并移除接取按钮', async function () {
    vi.resetModules();

    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      credits: 1000,
      day: 1,
    });
    Economy.init();
    Faction.init(state);
    Quest.init(state);

    var trackerEl = createQuestTrackerElement();
    var trackerOpenBtn = createFakeElement();
    var victoryModal = createFakeElement(['hidden']);
    var elements = {
      'quest-tracker': trackerEl,
      'quest-tracker-open': trackerOpenBtn,
      'victory-modal': victoryModal,
    };

    globalThis.document = {
      getElementById: function (id) {
        if (!elements[id]) elements[id] = createFakeElement();
        return elements[id];
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
    };

    var HUD = await import('../js/ui/HUD.js');
    HUD.updateStats(state, 1000);

    var tracker = Quest.getQuestTracker(state, 2);
    var itemCount = (trackerEl.innerHTML.match(/quest-tracker-item /g) || []).length;

    expect(tracker.mode).toBe('recommended');
    expect(tracker.items.length).toBe(2);
    expect(itemCount).toBe(1);
    expect(trackerEl.innerHTML).toContain(tracker.items[0].name);
    expect(trackerEl.innerHTML).not.toContain(tracker.items[1].name);
    expect(trackerEl.innerHTML).toContain('另 1 项');
    expect(trackerEl.innerHTML).not.toContain('立即接取');
    expect(trackerEl.querySelectorAll('[data-quest-tracker-accept]').length).toBe(0);
    expect(trackerOpenBtn.listenerCount('click')).toBe(1);
  });

  it('市场概览 HUD 只渲染 3 条波动摘要并绑定市场页入口一次', async function () {
    vi.resetModules();

    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      credits: 1000,
      day: 1,
    });
    Economy.init();
    Faction.init(state);
    Quest.init(state);

    var marketBodyEl = createHtmlElement();
    var marketUpdatedEl = createFakeElement();
    var marketOpenBtn = createFakeElement();
    var marketNavBtn = createFakeElement();
    var marketNavClicks = 0;
    marketNavBtn.click = function () {
      marketNavClicks += 1;
    };

    var victoryModal = createFakeElement(['hidden']);
    var elements = {
      'hud-market-overview-body': marketBodyEl,
      'hud-market-updated': marketUpdatedEl,
      'hud-market-open': marketOpenBtn,
      'victory-modal': victoryModal,
    };

    globalThis.document = {
      getElementById: function (id) {
        if (!elements[id]) elements[id] = createFakeElement();
        return elements[id];
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function (selector) {
        if (selector === '.bottom-nav-btn[data-view="market"]') return marketNavBtn;
        return null;
      },
    };

    var HUD = await import('../js/ui/HUD.js');
    HUD.updateStats(state, 1000);
    HUD.updateStats(state, 1000);

    var rowCount = (marketBodyEl.innerHTML.match(/<tr>/g) || []).length;

    expect(rowCount).toBe(3);
    expect(marketUpdatedEl.textContent).toBe('DAY 1');
    expect(marketOpenBtn.listenerCount('click')).toBe(1);

    marketOpenBtn.dispatchEvent('click');
    expect(marketNavClicks).toBe(1);
  });

  it('当前航点 HUD 只保留位置摘要和扫描终端入口', async function () {
    vi.resetModules();

    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      credits: 1000,
      day: 1,
    });
    Economy.init();
    Faction.init(state);
    Quest.init(state);

    var orbitScanBtn = createFakeElement();
    var orbitScanClicks = 0;
    orbitScanBtn.hidden = false;
    orbitScanBtn.disabled = false;
    orbitScanBtn.textContent = '📡 扫描终端';
    orbitScanBtn.click = function () {
      orbitScanClicks += 1;
      orbitScanBtn.setAttribute('aria-expanded', 'true');
    };

    var targetDetailOpenBtn = createFakeElement();
    var elements = {
      'hud-target-name': createFakeElement(),
      'hud-target-type': createFakeElement(),
      'hud-target-galaxy': createFakeElement(),
      'hud-target-faction': createFakeElement(),
      'hud-target-detail-open': targetDetailOpenBtn,
      'hud-market-overview-body': createHtmlElement(),
      'hud-market-updated': createFakeElement(),
      'hud-market-open': createFakeElement(),
      'orbit-scan-btn': orbitScanBtn,
      'victory-modal': createFakeElement(['hidden']),
    };

    globalThis.document = {
      getElementById: function (id) {
        if (!elements[id]) elements[id] = createFakeElement();
        return elements[id];
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
    };

    var HUD = await import('../js/ui/HUD.js');
    HUD.updateStats(state, 1000);
    HUD.updateStats(state, 1000);

    expect(elements['hud-target-name'].textContent).toBe('太阳主星');
    expect(elements['hud-target-galaxy'].textContent).toBe('银河系');
    expect(targetDetailOpenBtn.textContent).toBe('📡 扫描终端');
    expect(targetDetailOpenBtn.hidden).toBe(false);
    expect(targetDetailOpenBtn.listenerCount('click')).toBe(1);

    targetDetailOpenBtn.dispatchEvent('click');
    expect(orbitScanClicks).toBe(1);
    expect(targetDetailOpenBtn.hidden).toBe(true);
  });

  it('顶部被截断的信息会保留完整 title', async function () {
    vi.resetModules();

    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      credits: 1000,
      day: 1,
      activeShipIndex: 0,
      fleet: [{ emoji: '🚀', name: 'Wayfarer Prototype LX-77 Long Range Interstellar Courier' }],
    });

    Economy.init();
    Faction.init(state);
    Quest.init(state);

    var locationEl = createFakeElement();
    var shipNameEl = createFakeElement();
    var elements = {
      'current-location': locationEl,
      'hdr-ship-name': shipNameEl,
      'victory-modal': createFakeElement(['hidden']),
    };

    globalThis.document = {
      getElementById: function (id) {
        if (!elements[id]) elements[id] = createFakeElement();
        return elements[id];
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
    };

    var HUD = await import('../js/ui/HUD.js');
    HUD.updateStats(state, 1000);

    expect(locationEl.textContent).toContain('太阳主星');
    expect(locationEl.getAttribute('title')).toBe(locationEl.textContent);
    expect(shipNameEl.textContent).toContain('Wayfarer Prototype LX-77');
    expect(shipNameEl.getAttribute('title')).toBe(shipNameEl.textContent);
  });
});