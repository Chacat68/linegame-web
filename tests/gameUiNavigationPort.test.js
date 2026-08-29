import { describe, expect, it, vi } from 'vitest';
import { createGameUiNavigationPort } from '../js/core/GameUiNavigationPort.js';

describe('GameUiNavigationPort', function () {
  it('通过惰性 owner 转发市场、档案 Tab 与返回地图导航', function () {
    var marketEntry = {
      close: vi.fn(),
      getViewSystem: vi.fn(function (state) { return state.currentSystem; }),
      isOpen: vi.fn(function () { return true; }),
      openPanel: vi.fn(function () { return 'panel'; }),
      openSystemPanel: vi.fn(function () { return 'system'; }),
      refreshLocation: vi.fn(function () { return 'location'; }),
    };
    var workspaceTabs = {
      activate: vi.fn(function () { return true; }),
      getActive: vi.fn(function () { return 'tab-research'; }),
    };
    var uiManager = { switchView: vi.fn(function () { return 'map'; }) };
    var navigation = createGameUiNavigationPort({
      getMarketWorkspaceEntry: function () { return marketEntry; },
      getWorkspaceTabs: function () { return workspaceTabs; },
      uiManager: uiManager,
    });
    var state = { currentSystem: 'sol_prime' };
    var focus = { panel: 'spot' };

    expect(navigation.activateWorkspaceTab('tab-research', focus)).toBe(true);
    expect(navigation.getActiveArchiveTab()).toBe('tab-research');
    expect(navigation.getMarketViewSystem(state)).toBe('sol_prime');
    expect(navigation.isMarketOpen()).toBe(true);
    expect(navigation.openMarketPanel(state, focus)).toBe('panel');
    expect(navigation.openMarketSystemPanel(state, 'nova_station', focus)).toBe('system');
    expect(navigation.refreshMarketLocation(state)).toBe('location');
    expect(navigation.returnToMap()).toBe('map');
    expect(marketEntry.close).toHaveBeenCalledOnce();
    expect(uiManager.switchView).toHaveBeenCalledWith('map');
    expect(Object.isFrozen(navigation)).toBe(true);
  });

  it('每次动作读取最新 owner，并在缺失可选端口时稳定降级', function () {
    var marketEntry = null;
    var navigation = createGameUiNavigationPort({
      getMarketWorkspaceEntry: function () { return marketEntry; },
      getWorkspaceTabs: function () { return null; },
      getUiManager: function () { return null; },
    });

    expect(navigation.isMarketOpen()).toBe(false);
    expect(navigation.openMarketPanel({}, {})).toBeUndefined();
    expect(navigation.activateWorkspaceTab('tab-quest')).toBeUndefined();
    expect(navigation.returnToMap()).toBeUndefined();

    marketEntry = { isOpen: function () { return true; } };
    expect(navigation.isMarketOpen()).toBe(true);
  });
});
