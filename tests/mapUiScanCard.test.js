import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Exploration from '../js/systems/galaxy/ExplorationSystem.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
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
  var attributes = Object.create(null);
  return {
    dataset: {},
    hidden: false,
    disabled: false,
    textContent: '',
    innerHTML: '',
    style: {},
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
    querySelectorAll: function () { return []; },
  };
}

describe('MapUI current system scan card', function () {
  var originalDocument;
  var originalWindow;
  var originalBabylon;

  beforeEach(function () {
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    originalBabylon = globalThis.BABYLON;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.BABYLON = originalBabylon;
  });

  it('会显示当前星系扫描入口，并在扫描成功后渲染 reveal 卡', async function () {
    vi.resetModules();

    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      mapView: 'planets',
      fuel: 100,
      maxFuel: 100,
      credits: 2000,
      shipHull: 100,
      maxHull: 100,
      researchedTechs: [],
    });

    var EconomyModule = await import('../js/systems/economy/Economy.js');
    var GalaxyDataModule = await import('../js/systems/galaxy/GalaxyDataLayer.js');
    var ExplorationModule = await import('../js/systems/galaxy/ExplorationSystem.js');

    EconomyModule.init();
    GalaxyDataModule.init(state);

    var orbitScanBtn = createFakeElement();
    var scanCard = createFakeElement();
    var elements = {
      'orbit-scan-btn': orbitScanBtn,
      'current-system-exploration-card': scanCard,
    };

    globalThis.window = {};
    globalThis.BABYLON = {
      Color3: function () {},
      Color4: function () {},
    };
    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
    };

    var MapUI = await import('../js/ui/MapUI.js');

    MapUI.refreshGalaxyBtn(state);

    expect(orbitScanBtn.hidden).toBe(false);
    expect(orbitScanBtn.textContent).toContain('扫描');
    expect(orbitScanBtn.getAttribute('aria-expanded')).toBe('false');

    var scanResult = ExplorationModule.scanSystem(state, 'sol_prime');
    MapUI.showCurrentSystemScanReveal(state, 'sol_prime', scanResult);

    expect(scanCard.classList.contains('visible')).toBe(true);
    expect(scanCard.innerHTML).toContain('轨道扫描完成');
    expect(scanCard.innerHTML).toContain('评级');
    expect(scanCard.innerHTML).toContain('优先');
    expect(scanCard.innerHTML).toContain('太阳主星');
    expect(orbitScanBtn.hidden).toBe(false);
    expect(orbitScanBtn.getAttribute('aria-expanded')).toBe('true');
  });

  it('扫描完成后仍保留当前航点探索终端入口', async function () {
    vi.resetModules();

    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      mapView: 'planets',
      fuel: 100,
      maxFuel: 100,
      credits: 2000,
      shipHull: 100,
      maxHull: 100,
      researchedTechs: [],
    });

    var EconomyModule = await import('../js/systems/economy/Economy.js');
    var GalaxyDataModule = await import('../js/systems/galaxy/GalaxyDataLayer.js');
    var ExplorationModule = await import('../js/systems/galaxy/ExplorationSystem.js');

    EconomyModule.init();
    GalaxyDataModule.init(state);

    var orbitScanBtn = createFakeElement();
    var scanCard = createFakeElement();
    var elements = {
      'orbit-scan-btn': orbitScanBtn,
      'current-system-exploration-card': scanCard,
    };

    globalThis.window = {};
    globalThis.BABYLON = {
      Color3: function () {},
      Color4: function () {},
    };
    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
    };

    var MapUI = await import('../js/ui/MapUI.js');

    expect(ExplorationModule.scanSystem(state, 'sol_prime').ok).toBe(true);
    MapUI.refreshGalaxyBtn(state);

    expect(orbitScanBtn.hidden).toBe(false);
    expect(orbitScanBtn.disabled).toBe(false);
    expect(orbitScanBtn.textContent).toContain('着陆终端');

    expect(ExplorationModule.landOnSystem(state, 'sol_prime').ok).toBe(true);
    MapUI.refreshGalaxyBtn(state);

    expect(orbitScanBtn.hidden).toBe(false);
    expect(orbitScanBtn.disabled).toBe(false);
    expect(orbitScanBtn.textContent).toContain('探索终端');
  });
});
