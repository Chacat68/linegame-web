import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createMapWorkspaceSession } from '../js/ui/MapWorkspaceSession.js';

describe('MapWorkspaceSession', function () {
  it('MapUI 只通过地图会话端口读写星图选择，市场入口由独立 controller 委派', function () {
    var source = readFileSync('js/ui/MapUI.js', 'utf8');
    var sessionSource = readFileSync('js/ui/MapWorkspaceSession.js', 'utf8');
    expect(source).toContain("from './MapWorkspaceSession.js'");
    expect(source).toContain('setMarketWorkspaceActions');
    [
      '_selectedPlanetDetailSystem',
      '_navigationGuideFocus',
      '_planetDetailDisclosureState',
      '_marketViewGalaxy',
      '_marketViewSystem',
      '_marketMode',
      '_pendingMarketPanelFocus',
      '_marketOpen',
      '_explorationTerminalPanelOpen',
    ].forEach(function (legacyOwner) {
      expect(source).not.toContain(legacyOwner);
    });
    expect(sessionSource).not.toContain('marketOpen');
    expect(sessionSource).not.toContain('pendingMarketFocus');
  });

  it('统一持有星球、披露区与行动聚焦，不再混入市场暂态', function () {
    var session = createMapWorkspaceSession();
    var guide = { systemId: 'nova_station', goodId: 'medicine' };

    session.setSelectedSystem('nova_station');
    session.setNavigationGuideFocus(guide);
    session.setDisclosure('survey', true);
    session.toggleDisclosure('economy', true);

    var diagnostics = session.getDiagnostics();
    expect(diagnostics).toEqual({
      disclosureBySection: { survey: true, economy: false },
      navigationGuideFocus: guide,
      resetCount: 0,
      selectedSystemId: 'nova_station',
    });
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.disclosureBySection)).toBe(true);
    expect(Object.isFrozen(diagnostics.navigationGuideFocus)).toBe(true);
  });

  it('reset 清空全部局部选择并保留稳定默认值', function () {
    var session = createMapWorkspaceSession();
    session.setSelectedSystem('nova_station');
    session.setDisclosure('survey', true);

    expect(session.reset()).toEqual({
      disclosureBySection: {},
      navigationGuideFocus: null,
      resetCount: 1,
      selectedSystemId: null,
    });
  });

  it('MapUI reset 清理星图局部选择与运行时 hover，不改写存档视图', async function () {
    vi.resetModules();
    var originalDocument = globalThis.document;
    delete globalThis.document;
    try {
      var MapUI = await import('../js/ui/MapUI.js?map-session-lifecycle');
      var state = {
        currentGalaxy: 'milky_way',
        currentSystem: 'sol_prime',
        hoveredSystem: 'nova_station',
        mapView: 'galaxies',
        viewingGalaxy: 'andromeda',
      };
      MapUI.syncState(function () { return state; });
      expect(MapUI.getDiagnostics()).toMatchObject({
        viewState: { mapView: 'galaxies', currentGalaxyId: 'andromeda' },
      });

      var diagnostics = MapUI.resetRuntimeState();

      expect(diagnostics).toMatchObject({
        resetCount: 1,
        selectedSystemId: null,
        viewState: { mapView: 'galaxies', currentGalaxyId: 'andromeda' },
      });
      expect(state.hoveredSystem).toBeNull();
      expect(state.mapView).toBe('galaxies');
      expect(state.viewingGalaxy).toBe('andromeda');
    } finally {
      globalThis.document = originalDocument;
    }
  });
});
