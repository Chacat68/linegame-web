import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createMapWorkspaceSession } from '../js/ui/MapWorkspaceSession.js';

describe('MapWorkspaceSession', function () {
  it('MapUI 只通过会话端口读写跨存档选择与面板状态', function () {
    var source = readFileSync('js/ui/MapUI.js', 'utf8');
    expect(source).toContain("from './MapWorkspaceSession.js'");
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
  });

  it('统一持有星球、披露区、行动聚焦与市场暂态', function () {
    var session = createMapWorkspaceSession();
    var guide = { systemId: 'nova_station', goodId: 'medicine' };
    var pending = { workspaceId: 'spot', goodId: 'water' };

    session.setSelectedSystem('nova_station');
    session.setNavigationGuideFocus(guide);
    session.setDisclosure('survey', true);
    session.toggleDisclosure('economy', true);
    session.setMarketOpen(true);
    session.setMarketMode('overview');
    session.setMarketViewGalaxy('andromeda');
    session.setMarketViewSystem('nova_station');
    session.setPendingMarketFocus(pending);

    var diagnostics = session.getDiagnostics();
    expect(diagnostics).toEqual({
      disclosureBySection: { survey: true, economy: false },
      market: {
        mode: 'overview',
        open: true,
        pendingFocus: pending,
        viewingGalaxyId: 'andromeda',
        viewingSystemId: 'nova_station',
      },
      navigationGuideFocus: guide,
      resetCount: 0,
      selectedSystemId: 'nova_station',
    });
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.market)).toBe(true);
    expect(Object.isFrozen(diagnostics.disclosureBySection)).toBe(true);
    expect(Object.isFrozen(diagnostics.navigationGuideFocus)).toBe(true);
    expect(Object.isFrozen(diagnostics.market.pendingFocus)).toBe(true);
    expect(session.takePendingMarketFocus()).toEqual(pending);
    expect(session.getPendingMarketFocus()).toBeNull();
  });

  it('reset 清空全部局部选择并保留稳定默认值', function () {
    var session = createMapWorkspaceSession();
    session.setSelectedSystem('nova_station');
    session.setDisclosure('survey', true);
    session.setMarketOpen(true);
    session.setMarketMode('overview');
    session.setPendingMarketFocus({ goodId: 'water' });

    expect(session.reset()).toEqual({
      disclosureBySection: {},
      market: {
        mode: 'detail',
        open: false,
        pendingFocus: null,
        viewingGalaxyId: null,
        viewingSystemId: null,
      },
      navigationGuideFocus: null,
      resetCount: 1,
      selectedSystemId: null,
    });
  });

  it('MapUI reset 清理市场浏览暂态与运行时 hover，不改写存档视图', async function () {
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
      MapUI.showMarketDetail('nova_station');

      expect(MapUI.getDiagnostics()).toMatchObject({
        market: { mode: 'detail', viewingSystemId: 'nova_station' },
        viewState: { mapView: 'galaxies', currentGalaxyId: 'andromeda' },
      });

      var diagnostics = MapUI.resetRuntimeState();

      expect(diagnostics).toMatchObject({
        market: {
          mode: 'detail',
          open: false,
          pendingFocus: null,
          viewingGalaxyId: null,
          viewingSystemId: null,
        },
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
