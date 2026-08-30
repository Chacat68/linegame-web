import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createMapNavigationController } from '../js/ui/MapNavigationController.js';

function createHarness(overrides) {
  var config = overrides || {};
  var state = Object.assign({
    currentGalaxy: 'milky_way',
    mapView: 'planets',
    playerLevel: 2,
    researchedTechs: [],
    viewingGalaxy: 'milky_way',
  }, config.state || {});
  var systems = {
    local: { id: 'local', galaxyId: 'milky_way' },
    locked: { id: 'locked', galaxyId: 'andromeda' },
    remote: { id: 'remote', galaxyId: 'andromeda' },
  };
  var contextInspector = {
    activateWorkspace: vi.fn(),
    getCurrentRevision: vi.fn(function () { return 14; }),
    getSnapshot: vi.fn(function () { return { initialized: false }; }),
    render: vi.fn(),
    replaceContext: vi.fn(),
  };
  var mapContext = {
    clearSelected: vi.fn(function () { return true; }),
    select: vi.fn(function (id) { return id; }),
  };
  var panelView = { setGalaxyImmersionMode: vi.fn() };
  var renderer = { focusPlanet: vi.fn(), selectPlanet: vi.fn() };
  var session = { setNavigationGuideFocus: vi.fn() };
  var viewState = {
    canViewGalaxy: vi.fn(function (id) { return id !== 'locked'; }),
    clearHover: vi.fn(),
    focusSystem: vi.fn(function (id, galaxyId) {
      state.mapView = 'planets';
      state.viewingGalaxy = galaxyId;
      state.hoveredSystem = id;
      return true;
    }),
    showCurrentGalaxyPlanets: vi.fn(function () {
      state.mapView = 'planets';
      state.viewingGalaxy = state.currentGalaxy;
      return true;
    }),
    showGalaxies: vi.fn(function () {
      state.mapView = 'galaxies';
      return true;
    }),
    showGalaxyPlanets: vi.fn(function (id) {
      state.mapView = 'planets';
      state.viewingGalaxy = id;
      return true;
    }),
  };
  var ports = {
    buildTravelAction: vi.fn(function (_state, system) {
      return system ? { disabled: system.id === 'locked' } : null;
    }),
    contextInspector: contextInspector,
    ensurePanelBindings: vi.fn(),
    findSystem: vi.fn(function (id) { return systems[id] || null; }),
    getState: function () { return state; },
    getSystemAccessState: vi.fn(function (id) { return { unlocked: id !== 'locked' }; }),
    mapContext: mapContext,
    panelView: panelView,
    rememberState: vi.fn(function (nextState) { state = nextState; return state; }),
    renderPanel: vi.fn(),
    renderer: renderer,
    session: session,
    viewState: viewState,
  };
  var controller = createMapNavigationController(Object.assign(ports, config.ports || {}));
  return {
    contextInspector: contextInspector,
    controller: controller,
    mapContext: mapContext,
    panelView: panelView,
    ports: ports,
    renderer: renderer,
    session: session,
    state: function () { return state; },
    viewState: viewState,
  };
}

describe('MapNavigationController', function () {
  it('独占导航用例与 Renderer 聚焦，MapUI 只保留组合和公开转发', function () {
    var controllerSource = readFileSync('js/ui/MapNavigationController.js', 'utf8');
    var mapSource = readFileSync('js/ui/MapUI.js', 'utf8');

    expect(mapSource).toContain("from './MapNavigationController.js'");
    expect(mapSource).not.toContain('buildMapPlanetTravelAction');
    expect(mapSource).not.toContain('getSystemAccessState');
    expect(mapSource).not.toMatch(/Renderer3D\.(selectPlanet|focusPlanet)/);
    expect(mapSource).not.toMatch(/_navigationActions|_travelActionHandler|_galaxyJumpActionHandler/);
    expect(controllerSource).toContain("from './MapPlanetDetailPresenter.js'");
    expect(controllerSource).toContain("from '../data/systems.js'");
    expect(mapSource.split('\n').length).toBeLessThan(360);
  });

  it('校验系统访问后原子聚焦工作区、Context、引导信息和 Renderer', function () {
    var harness = createHarness();
    var navigate = vi.fn(function () { return true; });
    var onNavigationChange = vi.fn();
    harness.controller.setNavigationActions({ navigate: navigate });
    harness.controller.setNavigationChangeCallback(onNavigationChange);

    expect(harness.controller.focusNavigationTarget(harness.state(), 'locked')).toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    expect(harness.controller.focusNavigationTarget(harness.state(), 'local', {
      goodId: 'food',
      title: '前往本地市场',
    })).toBe(true);
    expect(navigate).toHaveBeenCalledWith('map');
    expect(onNavigationChange).toHaveBeenCalledWith('map');
    expect(harness.viewState.focusSystem).toHaveBeenCalledWith('local', 'milky_way');
    expect(harness.mapContext.select).toHaveBeenCalledWith('local');
    expect(harness.session.setNavigationGuideFocus).toHaveBeenCalledWith({
      systemId: 'local',
      goodId: 'food',
      title: '前往本地市场',
    });
    expect(harness.ports.ensurePanelBindings).toHaveBeenCalledOnce();
    expect(harness.contextInspector.activateWorkspace).toHaveBeenCalledWith('map');
    expect(harness.ports.renderPanel).toHaveBeenCalledWith(harness.state());
    expect(harness.renderer.selectPlanet).toHaveBeenCalledWith('local', { focus: true, smooth: true });
    expect(harness.controller.getDiagnostics()).toMatchObject({
      focusCount: 1,
      workspaceRequestCount: 1,
      lastAction: { type: 'focus-system', systemId: 'local' },
    });
  });

  it('按本星系旅行与跨星系跳转分发到不同动作端口', function () {
    var harness = createHarness();
    var travel = vi.fn();
    var galaxyJump = vi.fn();
    harness.controller.setTravelHandlers(travel, galaxyJump);

    expect(harness.controller.travelToPlanet('local')).toBe(true);
    expect(travel).toHaveBeenCalledWith('local');
    expect(galaxyJump).not.toHaveBeenCalled();

    expect(harness.controller.travelToPlanet('remote')).toBe(true);
    expect(galaxyJump).toHaveBeenCalledWith('remote');
    expect(harness.controller.travelToPlanet('locked')).toBe(false);
    expect(harness.mapContext.clearSelected).toHaveBeenCalledTimes(2);
    expect(harness.viewState.clearHover).toHaveBeenCalledTimes(2);
    expect(harness.controller.getDiagnostics()).toMatchObject({
      travelCount: 2,
      lastAction: { type: 'galaxy-jump', systemId: 'remote' },
    });
  });

  it('统一星系切换、市场关闭与 wiring reset/dispose 生命周期', function () {
    var harness = createHarness();
    var closeMarket = vi.fn(function () { return true; });
    var navigate = vi.fn(function () { return true; });
    var travel = vi.fn();
    harness.controller.setNavigationActions({ closeMarket: closeMarket, navigate: navigate });
    harness.controller.setTravelHandlers(travel, null);

    expect(harness.controller.toggleGalaxyView()).toBe(true);
    expect(closeMarket).toHaveBeenCalledOnce();
    expect(harness.state().mapView).toBe('galaxies');
    expect(harness.panelView.setGalaxyImmersionMode).toHaveBeenCalledWith(true);
    expect(harness.contextInspector.replaceContext).toHaveBeenCalledWith({
      type: 'galaxy',
      id: 'milky_way',
      workspaceId: 'map',
      source: 'map-view',
      revision: 14,
    });

    expect(harness.controller.toggleGalaxyView()).toBe(true);
    expect(harness.state().mapView).toBe('planets');
    expect(harness.controller.switchToGalaxy('locked')).toBe(false);
    expect(harness.controller.switchToGalaxy('andromeda')).toBe(true);
    expect(harness.state().viewingGalaxy).toBe('andromeda');

    expect(harness.controller.focusStarmap()).toBe(true);
    var reset = harness.controller.reset();
    expect(reset).toMatchObject({
      actionCount: 0,
      hasNavigationActions: true,
      hasTravelHandler: true,
      resetCount: 1,
    });
    expect(harness.controller.dispose()).toBe(true);
    expect(harness.controller.getDiagnostics()).toMatchObject({
      hasGalaxyJumpHandler: false,
      hasNavigationActions: false,
      hasTravelHandler: false,
    });
  });
});
