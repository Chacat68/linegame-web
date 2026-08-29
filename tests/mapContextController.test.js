import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createMapContextController } from '../js/ui/MapContextController.js';

function createHarness(overrides) {
  var config = overrides || {};
  var state = config.state || { mapView: 'planets' };
  var selectedSystemId = null;
  var rendererCallback = null;
  var escapeLayer = null;
  var releaseRenderer = vi.fn();
  var releaseEscape = vi.fn();
  var session = {
    clearNavigationGuideFocus: vi.fn(),
    clearSelectedSystem: vi.fn(function () { selectedSystemId = null; }),
    getSelectedSystem: vi.fn(function () { return selectedSystemId; }),
    setSelectedSystem: vi.fn(function (id) { selectedSystemId = id || null; return selectedSystemId; }),
  };
  var contextInspector = {
    clearContext: vi.fn(),
    getCurrentRevision: vi.fn(function () { return 12; }),
    getSnapshot: vi.fn(function () { return { activeWorkspaceId: 'map', initialized: false, open: true }; }),
    registerRenderer: vi.fn(function (workspaceId, callback) {
      rendererCallback = callback;
      return releaseRenderer;
    }),
    render: vi.fn(),
    replaceContext: vi.fn(),
  };
  var ports = {
    contextInspector: contextInspector,
    getState: function () { return state; },
    panelView: { hide: vi.fn() },
    registerEscapeLayer: vi.fn(function (id, layer) {
      escapeLayer = layer;
      return releaseEscape;
    }),
    renderPanel: vi.fn(),
    renderer: { clearSelection: vi.fn() },
    returnToPlanets: vi.fn(),
    session: session,
    viewState: {
      clearHover: vi.fn(),
      setHover: vi.fn(),
      showGalaxies: vi.fn(),
    },
  };
  var controller = createMapContextController(Object.assign(ports, config.ports || {}));
  return {
    contextInspector: contextInspector,
    controller: controller,
    escapeLayer: function () { return escapeLayer; },
    ports: ports,
    releaseEscape: releaseEscape,
    releaseRenderer: releaseRenderer,
    rendererCallback: function () { return rendererCallback; },
    session: session,
    setSelected: function (id) { selectedSystemId = id; },
    state: state,
  };
}

describe('MapContextController', function () {
  it('选择与清理只发布规范 Context key，并在 shell 未初始化时刷新面板', function () {
    var harness = createHarness();

    expect(harness.controller.select('nova_station')).toBe('nova_station');
    expect(harness.contextInspector.replaceContext).toHaveBeenCalledWith({
      type: 'planet',
      id: 'nova_station',
      workspaceId: 'map',
      source: 'map-selection',
      revision: 12,
    }, { render: false });

    expect(harness.controller.clearSelected(true)).toBe(true);
    expect(harness.session.clearNavigationGuideFocus).toHaveBeenCalledOnce();
    expect(harness.contextInspector.clearContext).toHaveBeenCalledWith('map', { render: false });
    expect(harness.contextInspector.render).toHaveBeenCalledOnce();
    expect(harness.ports.renderPanel).toHaveBeenCalledWith(harness.state);
    expect(harness.ports.renderer.clearSelection).toHaveBeenCalledOnce();
  });

  it('统一处理空/星球/星系 renderer，并由 Escape 关闭当前地图对象', function () {
    var harness = createHarness();
    expect(harness.controller.register()).toBe(true);
    expect(harness.controller.register()).toBe(false);
    expect(harness.contextInspector.registerRenderer).toHaveBeenCalledWith('map', expect.any(Function));

    var renderContext = harness.rendererCallback();
    expect(renderContext({ context: null, state: harness.state })).toBe(false);
    expect(harness.ports.panelView.hide).toHaveBeenCalledWith({ preserveMode: true });

    expect(renderContext({ context: { type: 'planet', id: 'sol_prime' }, state: harness.state })).toBe(true);
    expect(harness.session.setSelectedSystem).toHaveBeenCalledWith('sol_prime');
    expect(harness.ports.viewState.setHover).toHaveBeenCalledWith({ type: 'system', id: 'sol_prime' });

    expect(renderContext({ context: { type: 'galaxy', id: 'milky_way' }, state: harness.state })).toBe(true);
    expect(harness.ports.viewState.showGalaxies).toHaveBeenCalledOnce();
    expect(renderContext({ context: { type: 'commodity', id: 'food' }, state: harness.state })).toBe(false);

    harness.setSelected('sol_prime');
    expect(harness.escapeLayer().isActive()).toBe(true);
    harness.escapeLayer().onEscape();
    expect(harness.contextInspector.clearContext).toHaveBeenCalled();
    expect(harness.controller.getDiagnostics()).toMatchObject({
      clearCount: 1,
      registered: true,
      rendererRequestCount: 4,
    });
  });

  it('完整释放 renderer/Escape，并让 MapUI 只保留组合职责', function () {
    var harness = createHarness();
    harness.controller.register();

    expect(harness.controller.dispose()).toBe(true);
    expect(harness.controller.dispose()).toBe(false);
    expect(harness.releaseRenderer).toHaveBeenCalledOnce();
    expect(harness.releaseEscape).toHaveBeenCalledOnce();
    expect(harness.controller.getDiagnostics().registered).toBe(false);

    var mapUi = readFileSync('js/ui/MapUI.js', 'utf8');
    expect(mapUi).toContain("from './MapContextController.js'");
    expect(mapUi).not.toContain("ContextInspector.registerRenderer('map'");
    expect(mapUi).not.toContain("registerEscapeLayer('map-object-detail'");
    expect(mapUi.split('\n').length).toBeLessThan(520);
  });
});
