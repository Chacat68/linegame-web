import { describe, expect, it, vi } from 'vitest';
import { createGameUiCoordinator } from '../js/ui/GameUiCoordinator.js';
import {
  DEFAULT_ACTION_DIRTY_REGIONS,
  ARCHIVE_QUEST_ACTION_PRESENTATION,
  ARCHIVE_RESEARCH_ACTION_PRESENTATION,
  FLEET_HANGAR_ACTION_PRESENTATION,
  FLEET_HANGAR_SHOP_ACTION_PRESENTATION,
  UI_REGION,
} from '../js/core/ActionPresentation.js';

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

    expect(fleetRender).toHaveBeenCalledWith({ state: state, onCommand: undefined });
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
        fleet: { handleCommand: callbacks.buyShip },
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
    expect(fleetRender).toHaveBeenCalledWith({ state: state, onCommand: callbacks.buyShip });
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

    expect(render.mock.calls[0][0].state).toBe(stateB);
    expect(render.mock.calls[0][0].state).not.toBe(stateA);
  });

  it('加载失败保留工作区并通过局部重试使用最新会话状态', async function () {
    var currentState = { id: 'A' };
    var attempts = 0;
    var render = vi.fn();
    var fleetModule = { render: render };
    var featureStatus = {
      showLoading: vi.fn(),
      showError: vi.fn(),
      clear: vi.fn(),
      getDiagnostics: function () { return { activeFeatures: ['fleet'] }; },
    };
    var coordinator = createGameUiCoordinator({
      getState: function () { return currentState; },
      features: {
        get: function () { return null; },
        load: function () {
          attempts += 1;
          return Promise.resolve(attempts === 1 ? null : fleetModule);
        },
      },
      ui: { DeferredFeatureStatusUI: featureStatus },
    });

    await expect(coordinator.ensureFleet()).resolves.toBe(null);
    expect(render).not.toHaveBeenCalled();
    expect(featureStatus.showLoading).toHaveBeenCalledWith('fleet');
    expect(featureStatus.showError).toHaveBeenCalledWith('fleet', expect.any(Function));

    currentState = { id: 'B' };
    var retry = featureStatus.showError.mock.calls[0][1];
    await expect(retry()).resolves.toBe(fleetModule);

    expect(attempts).toBe(2);
    expect(featureStatus.showLoading).toHaveBeenCalledTimes(2);
    expect(featureStatus.clear).toHaveBeenCalledWith('fleet');
    expect(render.mock.calls[0][0].state).toBe(currentState);
    expect(coordinator.getDiagnostics()).not.toHaveProperty('featureStatus');
  });

  it('向 FleetUI 注入 latest-state 重绘命令，不允许 UI 反向访问全局主控', function () {
    var state = { id: 'fleet-a' };
    var render = vi.fn();
    var renderShop = vi.fn();
    var setLifecycleActions = vi.fn();
    var fleetModule = {
      render: render,
      renderShop: renderShop,
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

    expect(render.mock.calls.map(function (call) { return call[0].state.id; })).toEqual([
      'fleet-a',
      'fleet-b',
    ]);
    expect(renderShop.mock.calls.map(function (call) { return call[0].state.id; })).toEqual(['fleet-a']);
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
      marketUi: null,
      marketEntry: null,
      fleetUi: null,
      archiveUi: null,
      mapUi: null,
      logsUi: null,
      renderAllCount: 0,
      invalidationCount: 1,
      lastInvalidationRegions: DEFAULT_ACTION_DIRTY_REGIONS,
      workspaceSessions: {
        map: null,
        trade: { entry: null, content: null },
        fleet: null,
        archive: null,
        logs: null,
      },
      workspaceRenders: {
        activeWorkspace: 'fleet',
        renderCounts: {
          [UI_REGION.MARKET_CHROME]: 0,
          [UI_REGION.MARKET_SPOT]: 0,
          [UI_REGION.MARKET_CAPITAL]: 0,
          [UI_REGION.MARKET_OPERATIONS]: 0,
          [UI_REGION.FLEET_HANGAR]: 1,
          [UI_REGION.FLEET_SHOP]: 0,
          [UI_REGION.ARCHIVE_QUEST]: 0,
          [UI_REGION.ARCHIVE_EXPLORATION]: 0,
          [UI_REGION.ARCHIVE_RESEARCH]: 0,
          [UI_REGION.ARCHIVE_FACTION]: 0,
          [UI_REGION.ARCHIVE_ACHIEVEMENT]: 0,
          [UI_REGION.SAVE]: 0,
        },
        lastRenderedRegions: [UI_REGION.FLEET_HANGAR],
      },
    });
  });

  it('缺失或空区域只使用默认可见投影，不再隐式 renderAll', async function () {
    var calls = [];
    var coordinator = createGameUiCoordinator({
      getState: function () { return { currentSystem: 'sol_prime' }; },
      features: createFeatureHarness(),
      ui: {
        UIManager: { getNavigationSnapshot: function () { return { activeWorkspace: 'map' }; } },
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
        Trade: { getNetWorth: function () { return 0; } },
        Dispatch: { updateActiveDispatchUI: function () { calls.push('dispatch'); } },
      },
      actions: { global: { refreshActionGuide: function () { calls.push('guide'); } } },
    });

    await coordinator.invalidate();
    await coordinator.invalidate([]);

    expect(calls).toEqual([
      'hud.stats', 'hud.company', 'hud.badges', 'ship', 'scene', 'context', 'dispatch', 'guide',
      'hud.stats', 'hud.company', 'hud.badges', 'ship', 'scene', 'context', 'dispatch', 'guide',
    ]);
    expect(coordinator.getDiagnostics()).toEqual(expect.objectContaining({
      renderAllCount: 0,
      invalidationCount: 2,
      lastInvalidationRegions: DEFAULT_ACTION_DIRTY_REGIONS,
    }));
  });

  it('公开已加载工作区的会话诊断，并在会话重置时清理 UI 运行态', async function () {
    var mapDiagnostics = { selectedSystemId: 'nova_station', resetCount: 0 };
    var logsDiagnostics = { entryCount: 2, selectedMessageId: 'message-2', resetCount: 0 };
    var marketDiagnostics = { activeWorkspace: 'capital', focusedGoodId: 'water' };
    var fleetDiagnostics = { activeSurface: 'dispatch', surfaceMode: 'inline' };
    var archiveDiagnostics = {
      quest: { selectedAvailableQuestId: 'starter_first_trade' },
      exploration: { focus: { systemId: 'sol_prime', chainId: '' } },
      resetCount: 0,
    };
    var resetMarketRuntimeState = vi.fn(function () {
      marketDiagnostics = { activeWorkspace: 'spot', focusedGoodId: null };
      return marketDiagnostics;
    });
    var resetFleetRuntimeState = vi.fn(function () {
      fleetDiagnostics = { activeSurface: null, surfaceMode: null };
      return fleetDiagnostics;
    });
    var resetArchiveRuntimeState = vi.fn(function () {
      archiveDiagnostics = {
        quest: { selectedAvailableQuestId: null },
        exploration: { focus: null },
        resetCount: 1,
      };
      return archiveDiagnostics;
    });
    var resetMapRuntimeState = vi.fn(function () {
      mapDiagnostics = { selectedSystemId: null, resetCount: 1 };
      return mapDiagnostics;
    });
    var resetLogsRuntimeState = vi.fn(function () {
      logsDiagnostics = { entryCount: 0, selectedMessageId: null, resetCount: 1 };
      return logsDiagnostics;
    });
    var resetNavigationRuntimeState = vi.fn(function () { return 2; });
    var features = createFeatureHarness({
      market: {
        getDiagnostics: function () { return marketDiagnostics; },
        resetRuntimeState: resetMarketRuntimeState,
      },
      fleet: {
        getDiagnostics: function () { return fleetDiagnostics; },
        resetRuntimeState: resetFleetRuntimeState,
      },
      archive: {
        getDiagnostics: function () { return archiveDiagnostics; },
        resetRuntimeState: resetArchiveRuntimeState,
      },
    });
    var coordinator = createGameUiCoordinator({
      getState: function () { return { currentSystem: 'sol_prime' }; },
      features: features,
      ui: {
        MapUI: {
          getActiveArchiveTab: function () { return 'tab-exploration'; },
          getDiagnostics: function () { return mapDiagnostics; },
          resetRuntimeState: resetMapRuntimeState,
        },
        HUD: {
          getDiagnostics: function () { return logsDiagnostics; },
          resetRuntimeState: resetLogsRuntimeState,
        },
        UIManager: { resetRuntimeState: resetNavigationRuntimeState },
      },
    });

    await coordinator.invalidate(['hud']);
    expect(coordinator.getDiagnostics().marketUi).toEqual({
      activeWorkspace: 'capital',
      focusedGoodId: 'water',
    });
    expect(coordinator.getDiagnostics().fleetUi).toEqual({ activeSurface: 'dispatch', surfaceMode: 'inline' });
    expect(coordinator.getDiagnostics().archiveUi).toEqual(Object.assign({
      activeTab: 'tab-exploration',
    }, archiveDiagnostics));
    expect(coordinator.getDiagnostics().mapUi).toEqual(mapDiagnostics);
    expect(coordinator.getDiagnostics().logsUi).toEqual(logsDiagnostics);
    expect(coordinator.getDiagnostics().workspaceSessions).toEqual({
      map: mapDiagnostics,
      trade: { entry: null, content: marketDiagnostics },
      fleet: fleetDiagnostics,
      archive: Object.assign({ activeTab: 'tab-exploration' }, archiveDiagnostics),
      logs: logsDiagnostics,
    });

    var diagnostics = coordinator.reset();

    expect(resetMarketRuntimeState).toHaveBeenCalledOnce();
    expect(resetFleetRuntimeState).toHaveBeenCalledOnce();
    expect(resetArchiveRuntimeState).toHaveBeenCalledOnce();
    expect(resetMapRuntimeState).toHaveBeenCalledOnce();
    expect(resetLogsRuntimeState).toHaveBeenCalledOnce();
    expect(resetNavigationRuntimeState).toHaveBeenCalledOnce();
    expect(diagnostics.mapUi).toEqual({ selectedSystemId: null, resetCount: 1 });
    expect(diagnostics.logsUi).toEqual({ entryCount: 0, selectedMessageId: null, resetCount: 1 });
    expect(diagnostics.marketUi).toEqual({ activeWorkspace: 'spot', focusedGoodId: null });
    expect(diagnostics.fleetUi).toEqual({ activeSurface: null, surfaceMode: null });
    expect(diagnostics.archiveUi).toEqual(Object.assign({ activeTab: 'tab-exploration' }, archiveDiagnostics));
    expect(Object.isFrozen(diagnostics.workspaceSessions)).toBe(true);
    expect(diagnostics.lastInvalidationRegions).toEqual([]);
    expect(diagnostics.workspaceRenders.lastRenderedRegions).toEqual([]);
    expect(Object.values(diagnostics.workspaceRenders.renderCounts).every(function (count) {
      return count === 0;
    })).toBe(true);
  });

  it('连续失效会重新读取最新 session state 与 active workspace', async function () {
    var state = { id: 'A' };
    var activeWorkspace = 'fleet';
    var seen = [];
    var coordinator = createGameUiCoordinator({
      getState: function () { return state; },
      features: createFeatureHarness({
        fleet: { render: function (request) { seen.push('fleet:' + request.state.id); } },
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

  it('Market 内部失效只重绘声明区域，并使用最新查看上下文', async function () {
    var state = { id: 'A', currentSystem: 'sol_prime', currentGalaxy: 'milky_way' };
    var render = vi.fn();
    var renderRegions = vi.fn();
    var connectMarket = vi.fn();
    var module = { render: render, renderRegions: renderRegions };
    var coordinator = createGameUiCoordinator({
      getState: function () { return state; },
      features: createFeatureHarness({ market: module }),
      ui: {
        UIManager: {
          getNavigationSnapshot: function () { return { activeWorkspace: 'trade' }; },
        },
        MapUI: {
          getMarketViewSystem: function (nextState) { return nextState.id === 'A' ? 'sol_prime' : 'nova_station'; },
          getMarketViewGalaxy: function () { return 'milky_way'; },
        },
        ContextAdapters: { connectMarket: connectMarket },
      },
      actions: {
        market: { getMode: function () { return 'black'; } },
      },
    });

    await coordinator.invalidate(UI_REGION.MARKET_SPOT);
    state = { id: 'B', currentSystem: 'sol_prime', currentGalaxy: 'milky_way' };
    await coordinator.invalidate(UI_REGION.MARKET_OPERATIONS);

    expect(render).not.toHaveBeenCalled();
    expect(renderRegions.mock.calls[0]).toEqual([
      expect.objectContaining({ state: expect.objectContaining({ id: 'A' }), systemId: 'sol_prime', marketMode: 'black' }),
      [UI_REGION.MARKET_SPOT],
    ]);
    expect(renderRegions.mock.calls[1]).toEqual([
      expect.objectContaining({ state: state, systemId: 'nova_station', marketMode: 'black' }),
      [UI_REGION.MARKET_OPERATIONS],
    ]);
    expect(connectMarket).toHaveBeenCalledTimes(2);
    var workspaceRenders = coordinator.getDiagnostics().workspaceRenders;
    expect(workspaceRenders).toEqual(expect.objectContaining({
      activeWorkspace: 'trade',
      lastRenderedRegions: [UI_REGION.MARKET_OPERATIONS],
      renderCounts: expect.objectContaining({
        [UI_REGION.MARKET_SPOT]: 1,
        [UI_REGION.MARKET_OPERATIONS]: 1,
        [UI_REGION.MARKET_CAPITAL]: 0,
      }),
    }));
    expect(Object.isFrozen(workspaceRenders)).toBe(true);
    expect(Object.isFrozen(workspaceRenders.renderCounts)).toBe(true);
    expect(Object.isFrozen(workspaceRenders.lastRenderedRegions)).toBe(true);
  });

  it('Market 内部失效不后台重绘隐藏市场，但仍刷新实际活动工作区', async function () {
    var marketRegions = vi.fn();
    var calls = [];
    var coordinator = createGameUiCoordinator({
      getState: function () { return { id: 'fleet-active' }; },
      features: createFeatureHarness({
        market: { render: vi.fn(), renderRegions: marketRegions },
        fleet: {
          render: function () { calls.push('hangar'); },
          renderShop: function () { calls.push('shop'); },
        },
      }),
      ui: {
        UIManager: {
          getNavigationSnapshot: function () { return { activeWorkspace: 'fleet' }; },
        },
      },
    });

    await coordinator.invalidate([UI_REGION.ACTIVE_WORKSPACE, UI_REGION.MARKET_SPOT]);

    expect(marketRegions).not.toHaveBeenCalled();
    expect(calls).toEqual(['hangar', 'shop']);
    expect(coordinator.getDiagnostics().workspaceRenders).toEqual(expect.objectContaining({
      activeWorkspace: 'fleet',
      lastRenderedRegions: [UI_REGION.FLEET_HANGAR, UI_REGION.FLEET_SHOP],
      renderCounts: expect.objectContaining({
        [UI_REGION.MARKET_SPOT]: 0,
        [UI_REGION.FLEET_HANGAR]: 1,
        [UI_REGION.FLEET_SHOP]: 1,
      }),
    }));
  });

  it('显式 Market 整体失效覆盖内部区域且不会重复渲染', async function () {
    var render = vi.fn();
    var renderRegions = vi.fn();
    var coordinator = createGameUiCoordinator({
      getState: function () { return { id: 'market-full', currentSystem: 'sol_prime' }; },
      features: createFeatureHarness({
        market: { render: render, renderRegions: renderRegions },
      }),
      ui: {
        UIManager: {
          getNavigationSnapshot: function () { return { activeWorkspace: 'trade' }; },
        },
      },
    });

    await coordinator.invalidate([
      UI_REGION.MARKET,
      UI_REGION.MARKET_SPOT,
      UI_REGION.MARKET_CAPITAL,
    ]);

    expect(render).toHaveBeenCalledOnce();
    expect(renderRegions).not.toHaveBeenCalled();
  });

  it('Fleet 内部失效只重绘声明区域，并使用每次失效时的最新 state', async function () {
    var state = { id: 'A' };
    var hangarRender = vi.fn();
    var shopRender = vi.fn();
    var connectFleet = vi.fn();
    var coordinator = createGameUiCoordinator({
      getState: function () { return state; },
      features: createFeatureHarness({
        fleet: { render: hangarRender, renderShop: shopRender },
      }),
      ui: {
        UIManager: {
          getNavigationSnapshot: function () { return { activeWorkspace: 'fleet' }; },
        },
        ContextAdapters: { connectFleet: connectFleet },
      },
    });

    await coordinator.invalidate(FLEET_HANGAR_ACTION_PRESENTATION);
    state = { id: 'B' };
    await coordinator.invalidate(UI_REGION.FLEET_SHOP);

    expect(hangarRender.mock.calls.map(function (call) { return call[0].state.id; })).toEqual(['A']);
    expect(shopRender.mock.calls.map(function (call) { return call[0].state.id; })).toEqual(['B']);
    expect(connectFleet).toHaveBeenCalledTimes(2);
  });

  it('Fleet 内部失效不后台重绘隐藏工作区，但仍刷新实际活动工作区', async function () {
    var calls = [];
    var coordinator = createGameUiCoordinator({
      getState: function () { return { id: 'archive-active' }; },
      features: createFeatureHarness({
        fleet: {
          render: function () { calls.push('hangar'); },
          renderShop: function () { calls.push('shop'); },
        },
        archive: {
          ResearchUI: { render: function () { calls.push('archive'); } },
        },
      }),
      ui: {
        UIManager: {
          getNavigationSnapshot: function () { return { activeWorkspace: 'archive' }; },
        },
      },
    });

    await coordinator.invalidate(FLEET_HANGAR_SHOP_ACTION_PRESENTATION);

    expect(calls).toEqual(['archive']);
  });

  it('显式 Fleet 整体失效覆盖内部区域且不会重复渲染', async function () {
    var hangarRender = vi.fn();
    var shopRender = vi.fn();
    var coordinator = createGameUiCoordinator({
      getState: function () { return { id: 'fleet-full' }; },
      features: createFeatureHarness({
        fleet: { render: hangarRender, renderShop: shopRender },
      }),
      ui: {
        UIManager: {
          getNavigationSnapshot: function () { return { activeWorkspace: 'fleet' }; },
        },
      },
    });

    await coordinator.invalidate([
      UI_REGION.FLEET,
      UI_REGION.FLEET_HANGAR,
      UI_REGION.FLEET_SHOP,
    ]);

    expect(hangarRender).toHaveBeenCalledOnce();
    expect(shopRender).toHaveBeenCalledOnce();
  });

  it('Archive 内部失效只渲染声明模块，并使用每次失效时的最新 state', async function () {
    var state = { id: 'A' };
    var seen = [];
    var coordinator = createGameUiCoordinator({
      getState: function () { return state; },
      features: createFeatureHarness({
        archive: {
          ResearchUI: { render: function (nextState) { seen.push('research:' + nextState.id); } },
          FactionUI: { render: function (nextState) { seen.push('faction:' + nextState.id); } },
          QuestUI: { render: function (nextState) { seen.push('quest:' + nextState.id); } },
          ArchiveExplorationUI: { render: function (nextState) { seen.push('exploration:' + nextState.id); } },
          AchievementUI: { render: function (nextState) { seen.push('achievement:' + nextState.id); } },
        },
      }),
      ui: {
        UIManager: {
          getNavigationSnapshot: function () { return { activeWorkspace: 'archive' }; },
        },
      },
    });

    await coordinator.invalidate(ARCHIVE_RESEARCH_ACTION_PRESENTATION);
    state = { id: 'B' };
    await coordinator.invalidate(ARCHIVE_QUEST_ACTION_PRESENTATION);

    expect(seen).toEqual(['research:A', 'quest:B']);
    expect(coordinator.getDiagnostics().workspaceRenders).toEqual(expect.objectContaining({
      activeWorkspace: 'archive',
      lastRenderedRegions: [UI_REGION.ARCHIVE_QUEST],
      renderCounts: expect.objectContaining({
        [UI_REGION.ARCHIVE_RESEARCH]: 1,
        [UI_REGION.ARCHIVE_QUEST]: 1,
        [UI_REGION.ARCHIVE_EXPLORATION]: 0,
      }),
    }));
  });

  it('Archive 内部失效不后台重绘隐藏档案，但保留当前 Fleet 工作区刷新', async function () {
    var calls = [];
    var coordinator = createGameUiCoordinator({
      getState: function () { return { id: 'fleet-active' }; },
      features: createFeatureHarness({
        archive: {
          QuestUI: { render: function () { calls.push('quest'); } },
        },
        fleet: {
          render: function () { calls.push('hangar'); },
          renderShop: function () { calls.push('shop'); },
        },
      }),
      ui: {
        UIManager: {
          getNavigationSnapshot: function () { return { activeWorkspace: 'fleet' }; },
        },
      },
    });

    await coordinator.invalidate(ARCHIVE_QUEST_ACTION_PRESENTATION);

    expect(calls).toEqual(['hangar', 'shop']);
  });

  it('显式 Archive 整体失效覆盖内部区域且五个模块各渲染一次', async function () {
    var calls = [];
    var coordinator = createGameUiCoordinator({
      getState: function () { return { id: 'archive-full' }; },
      features: createFeatureHarness({
        archive: {
          ResearchUI: { render: function () { calls.push('research'); } },
          FactionUI: { render: function () { calls.push('faction'); } },
          QuestUI: { render: function () { calls.push('quest'); } },
          ArchiveExplorationUI: { render: function () { calls.push('exploration'); } },
          AchievementUI: { render: function () { calls.push('achievement'); } },
        },
      }),
      ui: {
        UIManager: {
          getNavigationSnapshot: function () { return { activeWorkspace: 'archive' }; },
        },
      },
    });

    await coordinator.invalidate([
      UI_REGION.ARCHIVE,
      UI_REGION.ARCHIVE_QUEST,
      UI_REGION.ARCHIVE_RESEARCH,
    ]);

    expect(calls).toEqual(['research', 'faction', 'quest', 'exploration', 'achievement']);
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
