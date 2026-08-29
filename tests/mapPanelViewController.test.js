import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import { createMapPanelViewController } from '../js/ui/MapPanelViewController.js';
import { createTestState } from './helpers.js';

function createClassList(initial) {
  var values = new Set(initial || []);
  return {
    add: function () { Array.from(arguments).forEach(function (value) { values.add(value); }); },
    contains: function (value) { return values.has(value); },
    remove: function () { Array.from(arguments).forEach(function (value) { values.delete(value); }); },
    toggle: function (value, force) {
      var active = typeof force === 'boolean' ? force : !values.has(value);
      if (active) values.add(value);
      else values.delete(value);
      return active;
    },
  };
}

function createElement(classes) {
  var attributes = Object.create(null);
  return {
    classList: createClassList(classes),
    clientHeight: 720,
    clientWidth: 390,
    closest: function () { return null; },
    getAttribute: function (name) { return attributes[name] || null; },
    getBoundingClientRect: function () { return { top: 0, width: 390, height: 720 }; },
    hidden: false,
    innerHTML: '',
    offsetHeight: 240,
    removeAttribute: function (name) { delete attributes[name]; },
    scrollTop: 0,
    setAttribute: function (name, value) { attributes[name] = String(value); },
    style: {},
  };
}

function createDocument(elements) {
  return {
    body: { classList: createClassList() },
    getElementById: function (id) { return elements[id] || null; },
  };
}

describe('MapPanelViewController', function () {
  it('星系总览保留滚动、清理星球选择并统一写入 ARIA', function () {
    var panel = createElement(['planet-detail-panel--galaxy-hub']);
    panel.scrollTop = 143;
    var mapContainer = createElement();
    var clearSelectedSystem = vi.fn();
    var documentRef = createDocument({
      'planet-detail-panel': panel,
      'map-container': mapContainer,
    });
    var controller = createMapPanelViewController({
      clearSelectedSystem: clearSelectedSystem,
      getDocument: function () { return documentRef; },
      session: { getSelectedSystem: function () { return 'sol_prime'; } },
      viewState: { getHoveredGalaxyId: function () { return 'andromeda'; } },
    });
    var state = {
      currentGalaxy: 'milky_way',
      mapView: 'galaxies',
      playerLevel: 1,
      researchedTechs: [],
      visitedGalaxies: ['milky_way'],
    };

    expect(controller.render(state)).toBe(true);
    expect(clearSelectedSystem).toHaveBeenCalledWith(false);
    expect(panel.scrollTop).toBe(143);
    expect(panel.classList.contains('visible')).toBe(true);
    expect(panel.getAttribute('aria-labelledby')).toBe('galaxy-hub-title');
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(panel.innerHTML).toContain('data-galaxy-action="return-planets"');
    expect(documentRef.body.classList.contains('starmap-galaxy-mode')).toBe(true);
    expect(controller.getDiagnostics()).toEqual({
      galaxyRenderCount: 1,
      hiddenRenderCount: 0,
      lastDisplayId: null,
      lastMode: 'galaxy',
      planetRenderCount: 0,
      renderCount: 1,
    });
  });

  it('星球详情组合纯 Presenter、Renderer 锚点和命令区净空', function () {
    var state = createTestState({
      currentGalaxy: 'milky_way',
      currentSystem: 'sol_prime',
      hoveredSystem: 'nova_station',
      mapView: 'planets',
      playerLevel: 10,
      researchedTechs: [],
    });
    GalaxyData.init(state);
    var panel = createElement();
    var mapContainer = createElement();
    mapContainer.clientWidth = 1200;
    mapContainer.clientHeight = 760;
    mapContainer.getBoundingClientRect = function () { return { top: 20, width: 1200, height: 760 }; };
    var bottomNav = createElement();
    bottomNav.getBoundingClientRect = function () { return { top: 700, width: 1200, height: 60 }; };
    var actionGuide = createElement();
    actionGuide.getBoundingClientRect = function () { return { top: 640, width: 420, height: 48 }; };
    var documentRef = createDocument({
      'action-guide': actionGuide,
      'bottom-nav': bottomNav,
      'map-container': mapContainer,
      'planet-detail-panel': panel,
    });
    var controller = createMapPanelViewController({
      getDocument: function () { return documentRef; },
      renderer: { getPlanetScreenPosition: function () { return { x: 620, y: 300 }; } },
      session: {
        getNavigationGuideFocus: function () { return null; },
        getSelectedSystem: function () { return 'nova_station'; },
      },
    });

    expect(controller.render(state)).toBe(true);
    expect(panel.classList.contains('planet-detail-panel--pinned')).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('false');
    expect(panel.getAttribute('tabindex')).toBe('-1');
    expect(panel.innerHTML).toContain('class="planet-detail-shell"');
    expect(panel.style.width).not.toBe('');
    expect(controller.getDiagnostics()).toMatchObject({
      lastDisplayId: 'nova_station',
      lastMode: 'planet',
      planetRenderCount: 1,
      renderCount: 1,
    });
  });

  it('无可展示对象时隐藏面板，MapUI 只保留组合调用', function () {
    var panel = createElement(['visible', 'planet-detail-panel--guide-target']);
    var documentRef = createDocument({
      'map-container': createElement(),
      'planet-detail-panel': panel,
    });
    var controller = createMapPanelViewController({ getDocument: function () { return documentRef; } });

    expect(controller.render({ mapView: 'planets', currentSystem: null, hoveredSystem: null })).toBe(false);
    expect(panel.classList.contains('visible')).toBe(false);
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(Object.isFrozen(controller.getDiagnostics())).toBe(true);

    panel.classList.add('planet-detail-panel--galaxy-hub', 'visible');
    controller.hide({ preserveMode: true });
    expect(panel.classList.contains('visible')).toBe(false);
    expect(panel.classList.contains('planet-detail-panel--galaxy-hub')).toBe(true);

    var mapUi = readFileSync('js/ui/MapUI.js', 'utf8');
    expect(mapUi).toContain("from './MapPanelViewController.js'");
    expect(mapUi).not.toContain("from './MapPanelLayout.js'");
    expect(mapUi).not.toContain('panel.innerHTML = buildGalaxyHubPanel');
    expect(mapUi.split('\n').length).toBeLessThan(600);
  });
});
