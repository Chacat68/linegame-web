import { describe, expect, it } from 'vitest';
import { createMapViewStateController } from '../js/ui/MapViewStateController.js';
import { getGalaxyAccessState } from '../js/data/systems.js';

function createState(overrides) {
  return Object.assign({
    currentGalaxy: 'milky_way',
    viewingGalaxy: 'milky_way',
    mapView: 'planets',
    hoveredSystem: null,
    playerLevel: 1,
    researchedTechs: [],
  }, overrides || {});
}

function createHarness(initialState) {
  var current = initialState || createState();
  var controller = createMapViewStateController({
    getState: function () { return current; },
    getGalaxyAccessState: getGalaxyAccessState,
  });
  return {
    controller: controller,
    getState: function () { return current; },
    replaceState: function (nextState) { current = nextState; },
  };
}

describe('MapViewStateController', function () {
  it('每次从 provider 读取最新会话，不修改旧 state', function () {
    var first = createState();
    var loaded = createState({ currentGalaxy: 'andromeda', viewingGalaxy: 'andromeda', playerLevel: 2 });
    var harness = createHarness(first);
    harness.replaceState(loaded);

    expect(harness.controller.showGalaxies()).toBe(true);
    expect(first.mapView).toBe('planets');
    expect(loaded.mapView).toBe('galaxies');
    expect(harness.controller.getCurrentGalaxyId()).toBe('andromeda');
  });

  it('区分星球/星系悬停，重复目标是无副作用 no-op', function () {
    var harness = createHarness();

    expect(harness.controller.setHover({ type: 'system', id: 'nova_station' })).toBe(true);
    expect(harness.getState().hoveredSystem).toBe('nova_station');
    expect(harness.controller.getHoveredGalaxyId()).toBeNull();
    expect(harness.controller.setHover({ type: 'system', id: 'nova_station' })).toBe(false);

    expect(harness.controller.setHover({ type: 'galaxy', id: 'andromeda' })).toBe(true);
    expect(harness.getState().hoveredSystem).toBeNull();
    expect(harness.controller.getHoveredGalaxyId()).toBe('andromeda');
    expect(harness.controller.clearHoveredGalaxy()).toBe(true);
    expect(harness.controller.clearHoveredGalaxy()).toBe(false);
  });

  it('在单一边界内校验解锁并完成星系→星球视图迁移', function () {
    var harness = createHarness();

    expect(harness.controller.canViewGalaxy('andromeda')).toBe(false);
    expect(harness.controller.showGalaxyPlanets('andromeda')).toBe(false);
    expect(harness.getState().viewingGalaxy).toBe('milky_way');

    harness.getState().researchedTechs.push('hyperspace_jump');
    expect(harness.controller.canViewGalaxy('andromeda')).toBe(true);
    expect(harness.controller.showGalaxyPlanets('andromeda')).toBe(true);
    expect(harness.getState()).toMatchObject({ mapView: 'planets', viewingGalaxy: 'andromeda' });

    harness.controller.showGalaxies();
    harness.controller.showCurrentGalaxyPlanets();
    expect(harness.getState()).toMatchObject({ mapView: 'planets', viewingGalaxy: 'milky_way' });
    expect(harness.controller.getDiagnostics().transitionCount).toBe(3);
  });

  it('导航聚焦会原子设置星系、星球和视图，reset 仅清理运行时诊断', function () {
    var harness = createHarness();
    expect(harness.controller.focusSystem('citadel_prime', 'andromeda')).toBe(true);
    expect(harness.getState()).toMatchObject({
      mapView: 'planets',
      viewingGalaxy: 'andromeda',
      hoveredSystem: 'citadel_prime',
    });
    expect(harness.controller.getDiagnostics().lastTransition.type).toBe('focus-system');

    harness.controller.reset();
    expect(harness.controller.getDiagnostics()).toMatchObject({
      transitionCount: 0,
      hoverChangeCount: 0,
      hoveredGalaxyId: null,
    });
    expect(harness.getState().hoveredSystem).toBe('citadel_prime');
  });
});
