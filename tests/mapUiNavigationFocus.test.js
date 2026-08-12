import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
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
      var shouldAdd = typeof force === 'boolean' ? force : !values.has(value);
      if (shouldAdd) values.add(value);
      else values.delete(value);
      return shouldAdd;
    },
  };
}

function createFakeElement(id, initialClasses) {
  var attributes = Object.create(null);
  var listeners = Object.create(null);
  return {
    id: id || '',
    dataset: {},
    hidden: false,
    disabled: false,
    innerHTML: '',
    textContent: '',
    style: {},
    clientWidth: 1200,
    clientHeight: 760,
    offsetHeight: 220,
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
    addEventListener: function (name, listener) {
      if (!listeners[name]) listeners[name] = [];
      listeners[name].push(listener);
    },
    dispatchEvent: function (event) {
      (listeners[event.type] || []).forEach(function (listener) {
        listener(event);
      });
    },
    contains: function () {
      return true;
    },
    querySelectorAll: function () {
      return [];
    },
  };
}

describe('MapUI navigation target focus', function () {
  var originalDocument = globalThis.document;
  var originalWindow = globalThis.window;
  var originalBabylon = globalThis.BABYLON;

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.BABYLON = originalBabylon;
  });

  it('会把卖货目的地锁定到星图详情面板', async function () {
    vi.resetModules();

    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      mapView: 'planets',
      playerLevel: 1,
      researchedTechs: [],
    });

    globalThis.window = {};
    globalThis.BABYLON = {
      Color3: function () {},
      Color4: function () {},
    };

    var starmapBtn = createFakeElement('nav-starmap', ['bottom-nav-btn']);
    starmapBtn.dataset.view = 'starmap';
    var marketBtn = createFakeElement('nav-market', ['bottom-nav-btn', 'active']);
    marketBtn.dataset.view = 'market';
    var panel = createFakeElement('planet-detail-panel');
    var elements = {
      'planet-detail-panel': panel,
      'map-canvas': createFakeElement('map-canvas'),
      'map-container': createFakeElement('map-container'),
      'market-overlay': createFakeElement('market-overlay'),
      'market-view-btn': createFakeElement('market-view-btn'),
      'info-panel': createFakeElement('info-panel'),
      'trade-panel': createFakeElement('trade-panel'),
      'console-panel': createFakeElement('console-panel'),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelector: function (selector) {
        if (selector === '.bottom-nav-btn.active') return marketBtn;
        return null;
      },
      querySelectorAll: function (selector) {
        if (selector === '.bottom-nav-btn') return [starmapBtn, marketBtn];
        if (selector === '.modal') return [];
        return [];
      },
    };

    var GalaxyData = await import('../js/systems/galaxy/GalaxyDataLayer.js');
    GalaxyData.init(state);
    var MapUI = await import('../js/ui/MapUI.js');

    expect(MapUI.focusNavigationTarget(state, 'nova_station', {
      goodId: 'food',
      title: '前往「新星站」卖货',
    })).toBe(true);

    expect(state.hoveredSystem).toBe('nova_station');
    expect(starmapBtn.classList.contains('active')).toBe(true);
    expect(marketBtn.classList.contains('active')).toBe(false);
    expect(panel.classList.contains('visible')).toBe(true);
    expect(panel.classList.contains('planet-detail-panel--guide-target')).toBe(true);
    expect(panel.getAttribute('role')).toBe('region');
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(panel.getAttribute('aria-labelledby')).toContain('planet-detail-title-nova_station');
    expect(panel.innerHTML).toContain('class="planet-detail-shell"');
    expect(panel.innerHTML).toContain('class="planet-detail-scroll-body"');
    expect(panel.innerHTML).toContain('class="planet-detail-title-row"');
    expect(panel.innerHTML).toContain('class="planet-detail-action-shelf"');
    expect(panel.innerHTML).toContain('</div><section class="planet-detail-action-shelf"');
    expect(panel.innerHTML).toContain('type="button" data-planet-detail-action="travel"');
    expect(panel.innerHTML).toContain('type="button" data-planet-detail-action="close-detail"');
    expect(panel.getAttribute('tabindex')).toBe('-1');
    expect(panel.innerHTML).toContain('role="list" aria-label="航点状态"');
    expect(panel.innerHTML).toContain('当前指引');
    expect(panel.innerHTML).toContain('食物');
    expect(panel.innerHTML).toContain('前往卖货点');
    expect(panel.innerHTML).toContain('data-planet-guide-route');
    expect(panel.innerHTML).toContain('燃料');
    expect(panel.innerHTML).toContain('预计');
    expect(panel.innerHTML).toContain('风险');
    expect(panel.innerHTML).toContain('卖价');
    expect(panel.innerHTML).toContain('预计净利');
    expect(panel.innerHTML).toContain('确认卖出');
    expect(panel.innerHTML).toContain('核对结算');

    var prevented = false;
    var stopped = false;
    panel.dispatchEvent({
      type: 'keydown',
      key: 'Escape',
      preventDefault: function () { prevented = true; },
      stopPropagation: function () { stopped = true; },
    });

    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
    expect(panel.classList.contains('planet-detail-panel--pinned')).toBe(false);
    expect(panel.classList.contains('planet-detail-panel--summary')).toBe(true);
    expect(panel.getAttribute('tabindex')).toBe(null);
  });

  it('窄屏详情会固定在控制轨与命令区之间', function () {
    var css = readFileSync(new URL('../css/interstellar-trader.css', import.meta.url), 'utf8');

    expect(css).toContain('.planet-detail-panel--pinned {');
    expect(css).toContain('grid-template-rows: minmax(0, 1fr) auto');
    expect(css).toContain('.planet-detail-panel.visible:not(.planet-detail-panel--galaxy-hub) {');
    expect(css).toContain('max-height: min(560px, calc(100dvh - var(--starmap-rail-edge-y) - var(--starmap-command-clearance)));');
    expect(css).toContain('.planet-detail-panel.visible:not(.planet-detail-panel--galaxy-hub)');
    expect(css).toContain('bottom: var(--starmap-command-clearance)');
    expect(css).toContain('body:has(#action-guide:not([hidden])) .planet-detail-panel.visible:not(.planet-detail-panel--galaxy-hub)');
    expect(css).toContain('.planet-detail-panel--galaxy-hub.visible');
    expect(css).toContain('body:has(#planet-detail-panel.planet-detail-panel--galaxy-hub.visible) .map-btn-group');
    expect(css).toContain('--starmap-rail-edge-x: max(8px, var(--safe-left));');
    expect(css).toContain('--starmap-rail-safe-right: max(8px, var(--safe-right));');

    var mapUiSource = readFileSync(new URL('../js/ui/MapUI.js', import.meta.url), 'utf8');
    expect(mapUiSource).toContain("['bottom-nav', 'action-guide'].forEach");
    expect(mapUiSource).toContain('commandSurfaceTop - panelH - 12');
  });

  it('会话替换后旧 3D 回调只更新 provider 返回的新 state', async function () {
    vi.resetModules();
    var first = createTestState({ hoveredSystem: null, mapView: 'planets' });
    var loaded = createTestState({ hoveredSystem: null, mapView: 'planets' });
    var current = first;

    globalThis.window = {};
    globalThis.document = {
      body: { classList: createFakeClassList() },
      getElementById: function () { return null; },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
    };

    var MapUI = await import('../js/ui/MapUI.js');
    MapUI.init3DCallbacks(function () { return current; }, function () {}, function () {});
    current = loaded;

    globalThis.window._mapHoverCallback({ type: 'system', id: 'nova_station' });

    expect(first.hoveredSystem).toBe(null);
    expect(loaded.hoveredSystem).toBe('nova_station');
  });

  it('星系总览使用固定返回入口、紧凑目录并保持滚动位置', async function () {
    vi.resetModules();

    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      mapView: 'galaxies',
      playerLevel: 1,
      researchedTechs: [],
    });

    globalThis.window = {};
    globalThis.BABYLON = {
      Color3: function () {},
      Color4: function () {},
    };

    var panel = createFakeElement('planet-detail-panel', ['planet-detail-panel--galaxy-hub']);
    panel.scrollTop = 143;
    var mapContainer = createFakeElement('map-container');
    mapContainer.clientWidth = 390;
    mapContainer.clientHeight = 720;
    var elements = {
      'planet-detail-panel': panel,
      'map-canvas': createFakeElement('map-canvas'),
      'map-container': mapContainer,
      'current-system-exploration-card': createFakeElement('current-system-exploration-card'),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelector: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      },
    };

    var GalaxyData = await import('../js/systems/galaxy/GalaxyDataLayer.js');
    GalaxyData.init(state);
    var MapUI = await import('../js/ui/MapUI.js');
    MapUI.init(state, function () {}, function () {});

    expect(panel.classList.contains('planet-detail-panel--galaxy-hub')).toBe(true);
    expect(panel.getAttribute('aria-labelledby')).toBe('galaxy-hub-title');
    expect(panel.getAttribute('tabindex')).toBe('-1');
    expect(panel.scrollTop).toBe(143);
    expect(panel.innerHTML).toContain('class="galaxy-hub-toolbar"');
    expect(panel.innerHTML).toContain('data-galaxy-action="return-planets"');
    expect(panel.innerHTML).toContain('class="galaxy-switcher-card-status"');
    expect(panel.innerHTML).toContain('class="galaxy-switcher-signal"');
    expect(panel.innerHTML).toContain('type="button" data-galaxy-action="open"');
    expect(panel.innerHTML).not.toContain('galaxy-switcher-desc');
    expect(panel.innerHTML).not.toContain('planet-detail-list-row');

    var returnButton = { dataset: { galaxyAction: 'return-planets', galaxyId: '' } };
    panel.dispatchEvent({
      type: 'click',
      target: {
        closest: function (selector) {
          return selector === '[data-galaxy-action]' ? returnButton : null;
        },
      },
      preventDefault: function () {},
      stopPropagation: function () {},
    });

    expect(state.mapView).toBe('planets');
    expect(panel.classList.contains('visible')).toBe(true);
    expect(panel.classList.contains('planet-detail-panel--galaxy-hub')).toBe(false);

    state.mapView = 'galaxies';
    panel.classList.add('planet-detail-panel--galaxy-hub');
    MapUI.refreshPlanetDetail(state);

    var prevented = false;
    panel.dispatchEvent({
      type: 'keydown',
      key: 'Escape',
      preventDefault: function () { prevented = true; },
      stopPropagation: function () {},
    });

    expect(prevented).toBe(true);
    expect(state.mapView).toBe('planets');

    var EventBus = await import('../js/core/EventBus.js');
    EventBus.emit('starmap:galaxy-view-toggle');
    expect(state.mapView).toBe('galaxies');

    EventBus.emit('starmap:galaxy-view-toggle');
    expect(state.mapView).toBe('planets');
  });
});
