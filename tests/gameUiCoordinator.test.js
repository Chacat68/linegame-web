import { describe, expect, it, vi } from 'vitest';
import { createGameUiCoordinator } from '../js/ui/GameUiCoordinator.js';

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
      buy: function () {},
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
    };
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
      },
      actions: {
        market: { onOpenBuy: callbacks.buy, getMode: function () { return 'black'; } },
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
    expect(marketRender.mock.calls[0][0]).toBe(state);
    expect(marketRender.mock.calls[0][1]).toBe(callbacks.buy);
    expect(marketRender.mock.calls[0][4]).toBe('nova_station');
    expect(marketRender.mock.calls[0][5]).toBe('black');
    expect(fleetRender.mock.calls[0][0]).toBe(state);
    expect(fleetRender.mock.calls[0][1]).toBe(callbacks.buyShip);
    expect(researchRender.mock.calls[0][0]).toBe(state);
    expect(researchRender.mock.calls[0][1]).toBe(callbacks.startResearch);
    expect(saveRender).toHaveBeenCalledWith(callbacks.save, callbacks.load);
    expect(contextAdapters.connectMarket).toHaveBeenCalledWith(features.modules.market);
    expect(contextAdapters.connectFleet).toHaveBeenCalledWith(features.modules.fleet);
    expect(contextAdapters.connectArchive).toHaveBeenCalledWith(features.modules.archive);
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

  it('空依赖与空状态不会抛出异常', async function () {
    var coordinator = createGameUiCoordinator({});

    await expect(coordinator.renderAll()).resolves.toBe(null);
    await expect(coordinator.ensureMarket()).resolves.toBe(null);
    expect(coordinator.renderFleet()).toBe(false);
    expect(coordinator.renderArchive()).toBe(false);
    expect(coordinator.renderSave()).toBe(false);
  });
});
