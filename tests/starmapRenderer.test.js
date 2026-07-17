import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTestState } from './helpers.js';

function createGradient() {
  return { addColorStop: function () {} };
}

function create2DContext() {
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
    measureText: function () { return { width: 40 }; },
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

function createCanvas(contextFactory) {
  const listeners = {};
  return {
    width: 0,
    height: 0,
    clientWidth: 960,
    clientHeight: 620,
    dataset: {},
    style: {},
    classList: { add: function () {}, remove: function () {} },
    addEventListener: function (event, handler) { listeners[event] = handler; },
    getBoundingClientRect: function () { return { left: 0, top: 0, width: 960, height: 620 }; },
    getContext: contextFactory,
    setAttribute: function () {},
  };
}

describe('StarmapRenderer facade', function () {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    delete globalThis.__linegameStarmapRenderer;
    vi.resetModules();
  });

  it('WebGL2 不可用时星系总览安全降级到 2D', async function () {
    const context2d = create2DContext();
    const canvas2d = createCanvas(function (type) { return type === '2d' ? context2d : null; });
    const canvasThree = createCanvas(function () { return null; });
    const container = { dataset: {} };
    globalThis.window = { devicePixelRatio: 1, addEventListener: function () {} };
    globalThis.document = {
      getElementById: function (id) {
        if (id === 'map-3d-canvas') return canvas2d;
        if (id === 'starmap-three-canvas') return canvasThree;
        if (id === 'map-container') return container;
        return null;
      },
    };

    const Renderer = await import('../js/ui/StarmapRenderer.js?fallback=' + Date.now());
    const state = createTestState({ mapView: 'galaxies', currentGalaxy: 'milky_way', viewingGalaxy: 'milky_way' });

    expect(Renderer.init()).toBe(true);
    Renderer.render(state, 'galaxies', 'milky_way');

    expect(await Renderer.whenThreeReady()).toBe(false);
    expect(Renderer.getActiveRendererName()).toBe('2d');
    expect(container.dataset.starmapRenderer).toBe('2d');
    expect(canvas2d.style.display).toBe('block');
    expect(canvasThree.style.display).toBe('none');
  });

  it('默认行星视图会尝试启用 Three，WebGL2 不可用时仍安全降级', async function () {
    const context2d = create2DContext();
    const canvas2d = createCanvas(function (type) { return type === '2d' ? context2d : null; });
    let webglProbeCount = 0;
    const canvasThree = createCanvas(function (type) {
      if (type === 'webgl2') webglProbeCount += 1;
      return null;
    });
    const container = { dataset: {} };
    globalThis.window = { devicePixelRatio: 1, addEventListener: function () {} };
    globalThis.document = {
      getElementById: function (id) {
        if (id === 'map-3d-canvas') return canvas2d;
        if (id === 'starmap-three-canvas') return canvasThree;
        if (id === 'map-container') return container;
        return null;
      },
    };

    const Renderer = await import('../js/ui/StarmapRenderer.js?deferred-three=' + Date.now());
    const state = createTestState({ mapView: 'planets', currentGalaxy: 'milky_way', viewingGalaxy: 'milky_way' });

    expect(Renderer.init()).toBe(true);
    Renderer.render(state, 'planets', 'milky_way');

    expect(await Renderer.whenThreeReady()).toBe(false);
    expect(Renderer.getActiveRendererName()).toBe('2d');
    expect(webglProbeCount).toBe(1);
    expect(globalThis.__linegameStarmapRenderer.threeLoading).toBe(false);
  });

  it('对外保留现有星图渲染器契约', async function () {
    const Renderer = await import('../js/ui/StarmapRenderer.js?contract=' + Date.now());
    [
      'init', 'render', 'focusPlanet', 'selectPlanet', 'setQuality', 'setMotionLevel',
      'isActive', 'toggleView', 'getSystemAtPoint', 'getPlanetScreenPosition',
      'invalidateScene', 'resetRuntimeState', 'setSecretRoutesVisible',
      'isSecretRoutesVisible', 'resetCamera', 'flyShipTo', 'isShipFlying',
      'cancelShipFlight', 'clearSelection',
    ].forEach(function (method) {
      expect(typeof Renderer[method]).toBe('function');
    });
  });
});

describe('RendererThreeStarmap dependency handling', function () {
  const originalDocument = globalThis.document;

  afterEach(function () {
    globalThis.document = originalDocument;
    vi.resetModules();
  });

  it('无法取得 WebGL2 context 时保持可导入且不抢占 canvas', async function () {
    const canvas = createCanvas(function () { return null; });
    globalThis.document = {
      getElementById: function (id) { return id === 'starmap-three-canvas' ? canvas : null; },
    };
    const Renderer = await import('../js/ui/RendererThreeStarmap.js?no-webgl2=' + Date.now());

    expect(Renderer.init()).toBe(false);
    expect(Renderer.isAvailable()).toBe(false);
    expect(Renderer.setVisible(true)).toBe(false);
    expect(function () { Renderer.resetCamera(); }).not.toThrow();
    expect(canvas.style.display).toBe('none');
  });
});

describe('Starmap canvas integration', function () {
  it('为 2D 与 Three 使用独立画布并共享视觉状态类', function () {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../css/interstellar-trader.css', import.meta.url), 'utf8');
    const facade = readFileSync(new URL('../js/ui/StarmapRenderer.js', import.meta.url), 'utf8');
    const fallbackRenderer = readFileSync(new URL('../js/ui/Renderer2DStarmap.js', import.meta.url), 'utf8');
    const renderer = readFileSync(new URL('../js/ui/RendererThreeStarmap.js', import.meta.url), 'utf8');

    expect(html).toContain('id="map-3d-canvas" class="starmap-canvas"');
    expect(html).toContain('id="starmap-three-canvas" class="starmap-canvas starmap-three-canvas"');
    expect(html).toContain('aria-label="Three.js 3D 星图"');
    expect(css).toContain('.starmap-canvas.starmap-blur-active');
    expect(css).toContain('max-height: min(40dvh, 360px)');
    expect(css).toMatch(/\.map-btn-group\s*\{[^}]*position:\s*absolute;/s);
    expect(facade).toContain('_loadThreeRenderer();');
    expect(facade).not.toContain("mapView === 'galaxies' && _rendererThree");
    expect(renderer).toContain('function _buildPlanetScene');
    expect(renderer).toContain('PLANET_MIN_SEPARATION');
    expect(renderer).toContain('const PLANET_SPAN_X = 420;');
    expect(renderer).toContain('const PLANET_SPAN_Z = 294;');
    expect(renderer).toContain('const PLANET_MIN_SEPARATION = 29;');
    expect(renderer).toContain('const PLANET_CONNECTION_DISTANCE = 66;');
    expect(renderer).toContain('_controls.maxDistance = 640;');
    expect(renderer).toContain('new FogExp2(0x071624, 0.00105)');
    expect(renderer).toContain('function _buildPlanetEnvironment');
    expect(renderer).toContain('function _createPlanetSurfaceMaps');
    expect(renderer).toContain('createPlanetSurfaceData');
    expect(renderer).toContain('texture.wrapS = RepeatWrapping');
    expect(renderer).toContain('cloudShell');
    expect(renderer).toContain('bumpMap');
    expect(renderer).toContain('emissiveMap');
    expect(renderer).not.toContain('function _createVolumetricBeacon');
    expect(renderer).not.toContain('PlanetBeacon3d');
    expect(renderer).toContain('selected || focused ? 1.03');
    expect(renderer).not.toContain('function _createBeaconTexture');
    expect(renderer).not.toContain('function _buildPlanetAmbientHalos');
    expect(renderer).not.toContain("halos.name = 'planetAmbientHalos'");
    expect(renderer).toContain('const PLANET_VISUAL_PROFILES');
    expect(renderer).toContain('physicalRing: true');
    expect(renderer).toContain('function _createPlanetDebrisBelt');
    expect(renderer).toContain('function _createPlanetOrbitAccents');
    expect(renderer).not.toContain('blending: additive ? AdditiveBlending : undefined');
    expect(renderer).toContain('if (additive) material.blending = AdditiveBlending;');
    expect(renderer).toContain('function _buildGalaxyAmbientHalos');
    expect(renderer).toContain("halos.name = 'galaxyAmbientHalos'");
    expect(renderer).toContain('function _createGalaxyLabelSprite');
    expect(renderer).toContain('const lines = new LineSegments(geometry, material)');
    expect(renderer).toContain('function _getSharedPlanetSphereGeometry');
    expect(renderer).toContain('function _getSharedHaloTexture');
    expect(renderer).toContain('const PLANET_VISUAL_SCALE = 0.68');
    expect(renderer).toContain("1.12) * PLANET_VISUAL_SCALE");
    expect(renderer).toContain("detailed ? 'detail' : 'base'");
    expect(renderer).toContain("if (_mapView === 'planets') _planetEntries.forEach");
    expect(renderer).toContain('visual.positionScratch');
    expect(facade).toContain('now - _lastInfoWriteAt < 500');
    expect(facade).toContain('container.dataset.starmapFps');
    expect(renderer).toContain('getSystemsByGalaxy(galaxyId)');
    expect(renderer).toContain('new MeshStandardMaterial');
    expect(renderer).toContain('function _buildOperationalRoutes');
    expect(renderer).toContain('function _getRouteWorldPoints');
    expect(renderer).toContain('function _applyShipTravelVisual');
    expect(renderer).toContain('new BoxGeometry');
    expect(renderer).toContain('getShipTravelVisualState');
    expect(fallbackRenderer).toContain('function _getRouteSceneGeometry');
    expect(fallbackRenderer).toContain('function _drawShipGlyph');
    expect(fallbackRenderer).toContain('getShipTravelVisualState');
    expect(renderer).toContain('if (_pendingCameraFocusPlanetId)');
    expect(renderer).toContain('&& _framedPlanetGalaxyId !== galaxyId');
    expect(renderer).not.toContain('_framedPlanetSystemId !== state.currentSystem');
  });
});
