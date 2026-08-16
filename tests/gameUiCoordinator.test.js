import { describe, expect, it, vi } from 'vitest';
import { createGameUiCoordinator } from '../js/ui/GameUiCoordinator.js';
import { DEFAULT_ACTION_DIRTY_REGIONS, UI_REGION } from '../js/core/ActionPresentation.js';

function createFeatureHarness(initialModules) {
  var modules = Object.assign({}, initialModules || {});
  var loadCalls = [];
  return {
    modules: modules,
    loadCalls: loadCalls,
    get: function (name) { return modules[name] || null; },
    load: function (name) {
      loadCalls.push(name);
      return Promise.resolve(modules[name] || null);
    },
  };
}

describe('GameUiCoordinator', function () {
  it('全量刷新只更新已加载终端，不会隐式加载其他模块', async function () {
    var state = { id: 'current', currentSystem: 'sol_prime' };
    var fleetRender = vi.fn();
    var features = createFeatureHarness({
      fleet: { render: fleetRender },
    });
    var coordinator = createGameUiCoordinator({
      getState: function () { return state; },
      features: features,
      ui: {
        // 即使工作区标记为打开，renderAll 也只刷新已加载模块；
        // 首次打开必须由 ensureMarket 等明确入口触发。
        MapUI: { isMarketOpen: function () { return true; } },
      },
    });

    await coordinator.renderAll();

    expect(fleetRender).toHaveBeenCalledWith(
      state,
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined
    );
    expect(features.loadCalls).toEqual([]);
    expect(coordinator.getLoaded('fleet')).toBe(features.modules.fleet);
    expect(coordinator.getLoaded()).toEqual({
      market: null,
      fleet: features.modules.fleet,
      archive: null,
      save: null,
    });
  });

  it('四类终端均可按需加载并由命名 actions 接线', async function () {
    var state = { id: 'state', currentSystem: 'sol_prime', currentGalaxy: 'milky_way' };
    var callbacks = {
      marketCommand: function () {},
      buyShip: function () {},
      startResearch: function () {},
      save: function () {},
      load: function () {},
    };
    var marketRender = vi.fn();
    var fleetRender = vi.fn();
    var researchRender = vi.fn();
    var saveRender = vi.fn();
    var contextAdapters = {
      connectMarket: vi.fn(),
      connectFleet: vi.fn(),
      connectArchive: vi.fn(),
      connectLogs: vi.fn(),
    };
    var hud = { renderContextInspector: vi.fn() };
    var features = createFeatureHarness({
      market: { render: marketRender },
      fleet: { render: fleetRender, renderShop: vi.fn() },
      archive: { ResearchUI: { render: researchRender } },
      save: { render: saveRender },
    });
    var coordinator = createGameUiCoordinator({
      getState: function () { return state; },
      features: features,
      ui: {
        MapUI: {
          getMarketViewSystem: function () { return 'nova_station'; },
          getMarketViewGalaxy: function () { return 'milky_way'; },
        },
        ContextAdapters: contextAdapters,
        HUD: hud,
      },
      actions: {
        market: { onCommand: callbacks.marketCommand, getMode: function () { return 'black'; } },
        fleet: { onBuyShip: callbacks.buyShip },
        archive: { onStartResearch: callbacks.startResearch },
        save: { onSaveGame: callbacks.save, onLoadGame: callbacks.load },
      },
    });

    await coordinator.ensureMarket();
    await coordinator.ensureFleet();
    await coordinator.ensureArchive();
    await coordinator.ensureSave();

    expect(features.loadCalls).toEqual(['market', 'fleet', 'archive', 'save']);
    expect(marketRender).toHaveBeenCalledWith({
      state: state,
      systemId: 'nova_station',
      marketMode: 'black',
      galaxyId: 'milky_way',
      onCommand: callbacks.marketCommand,
    });
    expect(fleetRender.mock.calls[0][0]).toBe(state);
    expect(fleetRender.mock.calls[0][1]).toBe(callbacks.buyShip);
    expect(researchRender.mock.calls[0][0]).toBe(state);
    expect(researchRender.mock.calls[0][1]).toBe(callbacks.startResearch);
    expect(saveRender).toHaveBeenCalledWith(callbacks.save, callbacks.load);
    expect(contextAdapters.connectMarket).toHaveBeenCalledWith(features.modules.market);
    expect(contextAdapters.connectFleet).toHaveBeenCalledWith(features.modules.fleet);
    expect(contextAdapters.connectArchive).toHaveBeenCalledWith(features.modules.archive);
    expect(contextAdapters.connectLogs).toHaveBeenCalledOnce();
    expect(contextAdapters.connectLogs).toHaveBeenCalledWith(hud);
  });

  it('异步加载期间切换状态后渲染最新状态', async function () {
    var resolveFleet;
    var stateA = { id: 'A' };
    var stateB = { id: 'B' };
    var currentState = stateA;
    var render = vi.fn();
    var fleetModule = { render: render };
    var features = {
      get: function () { return null; },
      load: function () {
        return new Promise(function (resolve) { resolveFleet = resolve; });
      },
    };
    var coordinator = createGameUiCoordinator({
      getState: function () { return currentState; },
      features: features,
    });

    var pending = coordinator.ensureFleet();
    await Promise.resolve();
    currentState = stateB;
    resolveFleet(fleetModule);
    await pending;

    expect(render.mock.calls[0][0]).toBe(stateB);
    expect(render.mock.calls[0][0]).not.toBe(stateA);
  });

  it('向 FleetUI 注入 latest-state 重绘命令，不允许 UI 反向访问全局主控', function () {
    var state = { id: 'fleet-a' };
    var render = vi.fn();
    var setLifecycleActions = vi.fn();
    var fleetModule = {
      render: render,
      setLifecycleActions: setLifecycleActions,
    };
    var coordinator = createGameUiCoordinator({
      getState: function () { return state; },
      features: createFeatureHarness({ fleet: fleetModule }),
    });

    expect(coordinator.renderFleet()).toBe(true);
    var lifecycleActions = setLifecycleActions.mock.calls[0][0];
    state = { id: 'fleet-b' };
    expect(lifecycleActions.requestRender()).toBe(true);

    expect(render.mock.calls.map(function (call) { return call[0].id; })).toEqual([
      'fleet-a',
      'fleet-b',
    ]);
  });

  it('renderAll 保持主刷新顺序', async function () {
    var calls = [];
    var state = { id: 'ordered' };
    var features = createFeatureHarness({
      archive: { ResearchUI: { render: function () { calls.push('archive'); } } },
      fleet: { render: function () { calls.push('fleet'); } },
      save: { render: function () { calls.push('save'); } },
    });
    var coordinator = createGameUiCoordinator({
      getState: function () { return state; },
      features: features,
      ui: {
        HUD: {
          updateStats: function () { calls.push('hud.stats'); },
          updateCompanyName: function () { calls.push('hud.company'); },
          updateArchiveBadges: function () { calls.push('hud.badges'); },
        },
        ShipUI: { renderShipStats: function () { calls.push('ship'); } },
        MapUI: {
          isMarketOpen: function () { calls.push('market.check'); return false; },
          refreshPlanetDetail: function () { calls.push('map.detail'); },
        },
        Renderer3D: { invalidateScene: function () { calls.push('renderer.invalidate'); } },
      },
      systems: {
        Trade: { getNetWorth: function () { calls.push('netWorth'); return 500; } },
        Dispatch: { updateActiveDispatchUI: function () { calls.push('dispatch'); } },
      },
      actions: {
        global: { refreshActionGuide: function () { calls.push('guide'); } },
      },
    });

    await coordinator.renderAll();

    expect(calls).toEqual([
      'netWorth',
      'hud.stats',
      'hud.company',
      'hud.badges',
      'market.check',
      'ship',
      'archive',
      'fleet',
      'save',
      'renderer.invalidate',
      'map.detail',
      'dispatch',
      'guide',
    ]);
  });

  it('动作失效只重绘当前工作区和声明的全局投影', async function () {
    var calls = [];
    var state = { id: 'fleet-active' };
    var features = createFeatureHarness({
      market: { render: function () { calls.push('market'); } },
      fleet: { render: function () { calls.push('fleet'); } },
      archive: { ResearchUI: { render: function () { calls.push('archive'); } } },
      save: { render: function () { calls.push('save'); } },
    });
    var coordinator = createGameUiCoordinator({
      getState: function () { return state; },
      features: features,
      ui: {
        UIManager: {
          getNavigationSnapshot: function () { return { activeWorkspace: 'fleet' }; },
        },
        HUD: {
          updateStats: function () { calls.push('hud.stats'); },
          updateCompanyName: function () { calls.push('hud.company'); },
          updateArchiveBadges: function () { calls.push('hud.badges'); },
        },
        ShipUI: { renderShipStats: function () { calls.push('ship'); } },
        MapUI: { refreshPlanetDetail: function () { calls.push('context'); } },
        Renderer3D: { invalidateScene: function () { calls.push('scene'); } },
      },
      systems: {
        Trade: { getNetWorth: function () { return 900; } },
        Dispatch: { updateActiveDispatchUI: function () { calls.push('dispatch'); } },
      },
      actions: {
        global: { refreshActionGuide: function () { calls.push('guide'); } },
      },
    });

    await coordinator.invalidate(DEFAULT_ACTION_DIRTY_REGIONS);

    expect(calls).toEqual([
      'hud.stats', 'hud.company', 'hud.badges', 'ship', 'fleet',
      'scene', 'context', 'dispatch', 'guide',
    ]);
    expect(calls).not.toContain('market');
    expect(calls).not.toContain('archive');
    expect(calls).not.toContain('save');
    expect(features.loadCalls).toEqual([]);
    expect(coordinator.getDiagnostics()).toEqual({
      renderAllCount: 0,
      invalidationCount: 1,
      lastInvalidationRegions: DEFAULT_ACTION_DIRTY_REGIONS,
    });
  });

  it('连续失效会重新读取最新 session state 与 active workspace', async function () {
    var state = { id: 'A' };
    var activeWorkspace = 'fleet';
    var seen = [];
    var coordinator = createGameUiCoordinator({
      getState: function () { return state; },
      features: createFeatureHarness({
        fleet: { render: function (currentState) { seen.push('fleet:' + currentState.id); } },
        archive: {
          ResearchUI: { render: function (currentState) { seen.push('archive:' + currentState.id); } },
        },
      }),
      ui: {
        UIManager: {
          getNavigationSnapshot: function () { return { activeWorkspace: activeWorkspace }; },
        },
      },
    });

    await coordinator.invalidate(UI_REGION.ACTIVE_WORKSPACE);
    state = { id: 'B' };
    activeWorkspace = 'archive';
    await coordinator.invalidate(UI_REGION.ACTIVE_WORKSPACE);

    expect(seen).toEqual(['fleet:A', 'archive:B']);
  });

  it('显式终端失效会去重且不会刷新未声明区域', async function () {
    var calls = [];
    var coordinator = createGameUiCoordinator({
      getState: function () { return { id: 'targeted' }; },
      features: createFeatureHarness({
        archive: { ResearchUI: { render: function () { calls.push('archive'); } } },
        fleet: { render: function () { calls.push('fleet'); } },
        save: { render: function () { calls.push('save'); } },
      }),
    });

    await coordinator.invalidate([UI_REGION.ARCHIVE, UI_REGION.ARCHIVE, UI_REGION.SAVE]);

    expect(calls).toEqual(['archive', 'save']);
  });

  it('空依赖与空状态不会抛出异常', async function () {
    var coordinator = createGameUiCoordinator({});

    await expect(coordinator.renderAll()).resolves.toBe(null);
    await expect(coordinator.invalidate(DEFAULT_ACTION_DIRTY_REGIONS)).resolves.toBe(null);
    await expect(coordinator.ensureMarket()).resolves.toBe(null);
    expect(coordinator.renderFleet()).toBe(false);
    expect(coordinator.renderArchive()).toBe(false);
    expect(coordinator.renderSave()).toBe(false);
  });
});
