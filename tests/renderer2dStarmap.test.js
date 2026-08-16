import { afterEach, describe, expect, it, vi } from 'vitest';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import { createTestState } from './helpers.js';

function createGradient() {
  return {
    addColorStop: function () {},
  };
}

function createFakeContext() {
  return {
    arc: function () {},
    beginPath: function () {},
    clearRect: function () {},
    closePath: function () {},
    createLinearGradient: createGradient,
    createRadialGradient: createGradient,
    ellipse: function () {},
    fill: function () {},
    fillRect: function () {},
    fillText: function () {},
    lineTo: function () {},
    measureText: function (text) {
      return { width: String(text || '').length * 8 };
    },
    moveTo: function () {},
    quadraticCurveTo: function () {},
    restore: function () {},
    rotate: function () {},
    save: function () {},
    scale: function () {},
    setLineDash: function () {},
    setTransform: function () {},
    stroke: function () {},
    strokeRect: function () {},
    translate: function () {},
  };
}

function createFakeCanvas(ctx) {
  var listeners = {};
  return {
    width: 0,
    height: 0,
    clientWidth: 960,
    clientHeight: 620,
    style: {},
    classList: {
      add: function () {},
    },
    addEventListener: function (event, handler) {
      listeners[event] = handler;
    },
    removeEventListener: function (event, handler) {
      if (listeners[event] === handler) delete listeners[event];
    },
    listenerCount: function (event) {
      return listeners[event] ? 1 : 0;
    },
    dispatchPointer: function (event, payload) {
      if (listeners[event]) listeners[event](payload);
    },
    getBoundingClientRect: function () {
      return { left: 0, top: 0, width: 960, height: 620 };
    },
    getContext: function (type) {
      return type === '2d' ? ctx : null;
    },
    setAttribute: function () {},
  };
}

describe('Renderer2DStarmap', function () {
  var originalDocument = globalThis.document;
  var originalWindow = globalThis.window;

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    vi.resetModules();
  });

  it('不依赖 Babylon 即可初始化并提供星球屏幕坐标与命中', async function () {
    var ctx = createFakeContext();
    var canvas = createFakeCanvas(ctx);
    globalThis.window = {
      devicePixelRatio: 1,
      addEventListener: function () {},
    };
    globalThis.document = {
      getElementById: function (id) {
        return id === 'map-3d-canvas' ? canvas : null;
      },
    };

    var Renderer = await import('../js/ui/Renderer2DStarmap.js?contract=' + Date.now());
    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      mapView: 'planets',
      playerLevel: 1,
      researchedTechs: [],
    });

    GalaxyData.init(state);
    expect(Renderer.init()).toBe(true);
    expect(Renderer.isActive()).toBe(true);

    Renderer.render(state, 'planets', 'milky_way');
    var pos = Renderer.getPlanetScreenPosition('sol_prime');

    expect(pos).toBeTruthy();
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
    expect(Renderer.getSystemAtPoint(pos.x, pos.y)).toBe('sol_prime');
    expect(Renderer.selectPlanet('sol_prime')).toBe(true);
  });

  it('dispose 释放 canvas/window listener 并允许同一实例重新初始化', async function () {
    var ctx = createFakeContext();
    var canvas = createFakeCanvas(ctx);
    var windowListeners = {};
    globalThis.window = {
      devicePixelRatio: 1,
      addEventListener: function (event, handler) { windowListeners[event] = handler; },
      removeEventListener: function (event, handler) {
        if (windowListeners[event] === handler) delete windowListeners[event];
      },
    };
    globalThis.document = {
      getElementById: function (id) { return id === 'map-3d-canvas' ? canvas : null; },
    };

    var Renderer = await import('../js/ui/Renderer2DStarmap.js?dispose=' + Date.now());
    expect(Renderer.init()).toBe(true);
    expect(canvas.listenerCount('pointermove')).toBe(1);
    expect(typeof windowListeners.resize).toBe('function');

    expect(Renderer.dispose()).toBe(true);
    expect(Renderer.dispose()).toBe(false);
    expect(canvas.listenerCount('pointermove')).toBe(0);
    expect(windowListeners.resize).toBeUndefined();
    expect(canvas.style.display).toBe('none');

    expect(Renderer.init()).toBe(true);
    expect(canvas.listenerCount('pointermove')).toBe(1);
    expect(typeof windowListeners.resize).toBe('function');
    Renderer.dispose();
  });
});
