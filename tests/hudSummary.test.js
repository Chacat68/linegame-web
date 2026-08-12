import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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
    hidden: false,
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

  it('档案入口会显示任务、探索、科技、派系和成就角标', async function () {
    vi.resetModules();

    var elements = {
      'archive-tab-quest-badge': createFakeElement(),
      'archive-tab-exploration-badge': createFakeElement(),
      'archive-tab-research-badge': createFakeElement(),
      'archive-tab-faction-badge': createFakeElement(),
      'archive-tab-achievement-badge': createFakeElement(),
      'archive-nav-badge': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
    };

    var HUD = await import('../js/ui/HUD.js');
    var state = createTestState({
      quests: [{ id: 'active_quest' }],
      researchOptions: ['cargo_optimization'],
      achievements: ['first_trade'],
      factionRelations: {
        federation: 35,
      },
    });

    HUD.updateArchiveBadges(state);

    expect(elements['archive-tab-quest-badge'].hidden).toBe(false);
    expect(Number(elements['archive-tab-quest-badge'].textContent)).toBeGreaterThan(0);
    expect(elements['archive-tab-exploration-badge'].hidden).toBe(true);
    expect(elements['archive-tab-research-badge'].textContent).toBe('1');
    expect(elements['archive-tab-faction-badge'].textContent).toBe('1');
    expect(elements['archive-tab-achievement-badge'].textContent).toBe('1');
    expect(Number(elements['archive-nav-badge'].textContent)).toBeGreaterThan(0);
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
    var galaxyViewRequests = 0;

    var elements = {
      'hud-galactic-map-view': galaxyViewEl,
      'hud-galactic-map-focus': galaxyFocusEl,
      'hud-galactic-map-caption': galaxyCaptionEl,
      'hud-galactic-map-toggle': galaxyToggleBtn,
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
    var EventBus = await import('../js/core/EventBus.js');
    EventBus.on('starmap:galaxy-view-toggle', function () {
      galaxyViewRequests += 1;
      state.mapView = state.mapView === 'galaxies' ? 'planets' : 'galaxies';
    });
    HUD.updateStats(state, 1000);
    HUD.updateStats(state, 1000);

    expect(galaxyViewEl.textContent).toBe('星球视图');
    expect(galaxyFocusEl.textContent).toBe('银河系 · 太阳主星');
    expect(galaxyCaptionEl.textContent).toBe('切换到跨星系跃迁总览');
    expect(galaxyToggleBtn.textContent).toBe('星系总览');
    expect(galaxyToggleBtn.listenerCount('click')).toBe(1);

    galaxyToggleBtn.dispatchEvent('click');
    expect(galaxyViewRequests).toBe(1);
    expect(galaxyViewEl.textContent).toBe('星系总览');
    expect(galaxyCaptionEl.textContent).toBe('返回当前星系局部视图');
    expect(galaxyToggleBtn.textContent).toBe('回到当前星系');

    galaxyToggleBtn.dispatchEvent('click');
    expect(galaxyViewRequests).toBe(2);
    expect(galaxyViewEl.textContent).toBe('星球视图');
    expect(galaxyToggleBtn.textContent).toBe('星系总览');
  });

  it('已删除任务追踪、市场、网络与航点固定 dashboard DOM', function () {
    var html = readFileSync('index.html', 'utf8');
    var hud = readFileSync('js/ui/HUD.js', 'utf8');
    expect(html).not.toContain('id="quest-tracker"');
    expect(html).not.toContain('id="hud-market-overview-body"');
    expect(html).not.toContain('id="hud-network-signal"');
    expect(html).not.toContain('id="hud-target-name"');
    expect(hud).not.toContain('_renderQuestTracker');
    expect(hud).not.toContain('_renderHudMarketOverview');
    expect(hud).not.toContain('_renderHudNetworkStatus');
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

  it('顶部资源仪表会同步读屏数值和风险状态', async function () {
    vi.resetModules();

    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      credits: 1000,
      day: 1,
      fuel: 22,
      maxFuel: 100,
      shipHull: 18,
      maxHull: 100,
      cargo: { food: 40, electronics: 50 },
      maxCargo: 100,
      reputation: 350,
    });

    Economy.init();
    Faction.init(state);
    Quest.init(state);

    var elements = {
      'status-fuel-fill': createFakeElement(),
      'status-fuel-pct': createFakeElement(),
      'status-fuel-meter': createFakeElement(),
      'status-shield-fill': createFakeElement(),
      'status-shield-pct': createFakeElement(),
      'status-shield-meter': createFakeElement(),
      'status-cargo-fill': createFakeElement(),
      'status-cargo-pct': createFakeElement(),
      'status-cargo-meter': createFakeElement(),
      'hdr-reputation-fill': createFakeElement(),
      'hdr-reputation-value': createFakeElement(),
      'hdr-reputation-meter': createFakeElement(),
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

    expect(elements['status-fuel-meter'].getAttribute('aria-valuenow')).toBe('22');
    expect(elements['status-fuel-meter'].getAttribute('aria-valuetext')).toBe('燃料 22/100（22%）');
    expect(elements['status-fuel-meter'].dataset.meterState).toBe('warning');
    expect(elements['status-fuel-pct'].getAttribute('title')).toBe('燃料 22/100（22%）');

    expect(elements['status-shield-meter'].getAttribute('aria-valuenow')).toBe('18');
    expect(elements['status-shield-meter'].getAttribute('aria-valuetext')).toBe('护盾 18/100（18%）');
    expect(elements['status-shield-meter'].dataset.meterState).toBe('critical');

    expect(elements['status-cargo-meter'].getAttribute('aria-valuenow')).toBe('90');
    expect(elements['status-cargo-meter'].getAttribute('aria-valuetext')).toBe('货舱 90/100（90%）');
    expect(elements['status-cargo-meter'].dataset.meterState).toBe('warning');

    expect(elements['hdr-reputation-meter'].getAttribute('aria-valuemin')).toBe('-100');
    expect(elements['hdr-reputation-meter'].getAttribute('aria-valuemax')).toBe('900');
    expect(elements['hdr-reputation-meter'].getAttribute('aria-valuenow')).toBe('350');
    expect(elements['hdr-reputation-meter'].getAttribute('aria-valuetext')).toContain('350');
    expect(elements['hdr-reputation-meter'].dataset.meterState).toBe('nominal');
  });

  it('公司侧栏会呈现权限容量、下一开放项和等级进度语义', async function () {
    vi.resetModules();

    var state = createTestState({
      companyName: '远航联合体',
      companyLevel: 2,
      companyExperience: 280,
      fleetSlots: 2,
      tradeStations: {
        sol_prime: { systemId: 'sol_prime', level: 1 },
      },
    });
    var roadmapEl = createHtmlElement();
    var levelTrackEl = createFakeElement();
    var elements = {
      'company-name-text': createFakeElement(),
      'company-unlock-roadmap': roadmapEl,
      'company-level-line': createFakeElement(),
      'company-level-fill': createFakeElement(),
      'company-level-track': levelTrackEl,
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
    };

    var HUD = await import('../js/ui/HUD.js');
    HUD.updateCompanyName(state);

    expect(elements['company-name-text'].textContent).toBe('远航联合体');
    expect(roadmapEl.innerHTML).toContain('等级开放功能');
    expect(roadmapEl.innerHTML).toContain('aria-label="公司功能容量"');
    expect(roadmapEl.innerHTML).toContain('舰船位置');
    expect(roadmapEl.innerHTML).toContain('贸易站');
    expect(roadmapEl.innerHTML).toContain('贸易站等级');
    expect(roadmapEl.innerHTML).toContain('下一级开放');
    expect(roadmapEl.innerHTML).toContain('Lv.3 · 更多舰船');
    expect(roadmapEl.innerHTML).toContain('还需 20 公司经验');
    expect(roadmapEl.innerHTML).toContain('role="status"');
    expect(levelTrackEl.getAttribute('aria-valuemax')).toBe('180');
    expect(levelTrackEl.getAttribute('aria-valuenow')).toBe('160');
    expect(levelTrackEl.getAttribute('aria-valuetext')).toBe('公司等级 2，160/180');
    expect(parseFloat(elements['company-level-fill'].style.width)).toBeCloseTo(88.89, 2);
  });
});
