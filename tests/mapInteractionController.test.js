import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createMapInteractionController } from '../js/ui/MapInteractionController.js';

function createHarness() {
  var state = { mapView: 'planets', name: 'first' };
  var selectedSystemId = null;
  var eventHandler = null;
  var windowRef = {};
  var eventBus = {
    off: vi.fn(),
    on: vi.fn(function (eventName, handler) { eventHandler = handler; }),
  };
  var mapContext = {
    clearSelected: vi.fn(function () { selectedSystemId = null; }),
    select: vi.fn(function (systemId) { selectedSystemId = systemId; return systemId; }),
  };
  var ports = {
    eventBus: eventBus,
    findSystem: vi.fn(function (systemId) {
      return systemId === 'nova_station' ? { id: systemId } : null;
    }),
    getState: function () { return state; },
    getWindow: function () { return windowRef; },
    mapContext: mapContext,
    refreshPanel: vi.fn(),
    renderContext: vi.fn(),
    renderer: {
      isActive: vi.fn(function () { return false; }),
      toggleView: vi.fn(),
    },
    session: {
      getSelectedSystem: vi.fn(function () { return selectedSystemId; }),
    },
    switchToGalaxy: vi.fn(),
    toggleGalaxyView: vi.fn(),
    travelToPlanet: vi.fn(),
    viewState: {
      clearHoveredGalaxy: vi.fn(),
      setHover: vi.fn(function () { return true; }),
    },
  };
  return {
    controller: createMapInteractionController(ports),
    eventHandler: function () { return eventHandler; },
    mapContext: mapContext,
    ports: ports,
    select: function (systemId) { selectedSystemId = systemId; },
    setState: function (nextState) { state = nextState; },
    windowRef: windowRef,
  };
}

describe('MapInteractionController', function () {
  it('只注册一次星系切换事件，并在释放后允许重绑', function () {
    var harness = createHarness();

    expect(harness.controller.bind()).toBe(true);
    expect(harness.controller.bind()).toBe(false);
    expect(harness.ports.eventBus.on).toHaveBeenCalledOnce();
    expect(harness.ports.eventBus.on).toHaveBeenCalledWith(
      'starmap:galaxy-view-toggle',
      harness.ports.toggleGalaxyView,
    );

    harness.eventHandler()();
    expect(harness.ports.toggleGalaxyView).toHaveBeenCalledOnce();
    expect(harness.controller.dispose()).toBe(true);
    expect(harness.controller.dispose()).toBe(false);
    expect(harness.ports.eventBus.off).toHaveBeenCalledWith(
      'starmap:galaxy-view-toggle',
      harness.ports.toggleGalaxyView,
    );
    expect(harness.controller.bind()).toBe(true);
  });

  it('Renderer 全局回调始终读取最新 state，并区分选择、旅行与背景清理', function () {
    var harness = createHarness();
    expect(harness.controller.initRendererCallbacks()).toBe(true);
    expect(harness.ports.renderer.toggleView).toHaveBeenCalledOnce();

    var loadedState = { mapView: 'planets', name: 'loaded' };
    harness.setState(loadedState);
    harness.windowRef._mapHoverCallback({ type: 'system', id: 'nova_station' });
    expect(harness.ports.refreshPanel).toHaveBeenCalledWith(loadedState);

    harness.windowRef._mapClickCallback('missing');
    expect(harness.mapContext.select).not.toHaveBeenCalled();
    harness.windowRef._mapClickCallback('nova_station');
    expect(harness.mapContext.select).toHaveBeenCalledWith('nova_station');
    expect(harness.ports.renderContext).toHaveBeenCalledOnce();
    expect(harness.ports.travelToPlanet).not.toHaveBeenCalled();

    harness.windowRef._mapClickCallback('nova_station');
    expect(harness.ports.travelToPlanet).toHaveBeenCalledWith('nova_station');
    harness.windowRef._mapBackgroundClickCallback();
    expect(harness.mapContext.clearSelected).toHaveBeenCalledWith(true);

    harness.windowRef._galaxyClickCallback('andromeda');
    expect(harness.ports.switchToGalaxy).toHaveBeenCalledWith('andromeda');
    harness.windowRef._switchToGalaxyView();
    expect(harness.ports.toggleGalaxyView).toHaveBeenCalledOnce();
    loadedState.mapView = 'galaxies';
    harness.windowRef._switchToGalaxyView();
    expect(harness.ports.toggleGalaxyView).toHaveBeenCalledOnce();
  });

  it('逆序释放 DOM listener 与全局回调，MapUI 不再持有绑定实现', function () {
    var harness = createHarness();
    var releases = [];
    var target = {
      addEventListener: vi.fn(),
      dataset: { mapPanelControllerBound: 'true' },
      removeEventListener: vi.fn(function (eventName) { releases.push(eventName); }),
    };
    harness.controller.bindDomListener(target, 'click', function () {});
    harness.controller.bindDomListener(target, 'keydown', function () {}, true);
    harness.controller.initRendererCallbacks();

    expect(harness.controller.getDiagnostics()).toMatchObject({
      callbacksBound: true,
      domListenerCount: 2,
      rendererCallbackBindCount: 1,
    });
    harness.controller.dispose();
    expect(releases).toEqual(['keydown', 'click']);
    expect(target.dataset.mapPanelControllerBound).toBeUndefined();
    expect(harness.windowRef._mapClickCallback).toBeNull();
    expect(harness.windowRef._galaxyClickCallback).toBeNull();

    var mapUi = readFileSync('js/ui/MapUI.js', 'utf8');
    expect(mapUi).toContain("from './MapInteractionController.js'");
    expect(mapUi).not.toContain('EventBus.');
    expect(mapUi).not.toContain('window._mapClickCallback');
    expect(mapUi).not.toContain('.addEventListener(');
    expect(mapUi.split('\n').length).toBeLessThan(450);
  });
});
