import { afterEach, describe, expect, it, vi } from 'vitest';
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
    addEventListener: function () {},
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
      'galaxy-view-btn': createFakeElement('galaxy-view-btn'),
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
    expect(panel.innerHTML).toContain('当前指引');
    expect(panel.innerHTML).toContain('食物');
    expect(panel.innerHTML).toContain('前往卖货点');
    expect(panel.innerHTML).toContain('data-planet-guide-route');
    expect(panel.innerHTML).toContain('燃料');
    expect(panel.innerHTML).toContain('预计');
    expect(panel.innerHTML).toContain('风险');
    expect(panel.innerHTML).toContain('确认卖出');
  });
});
