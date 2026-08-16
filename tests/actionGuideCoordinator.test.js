import { describe, expect, it, vi } from 'vitest';
import {
  createActionGuideCoordinator,
  shouldLoadAdvancedCommerce,
  shouldLoadRouteGuidance,
} from '../js/ui/ActionGuideCoordinator.js';

function createState(id, overrides) {
  return Object.assign({
    id: id,
    currentSystem: 'sol',
    currentGalaxy: 'milky_way',
    credits: 1200,
    playerLevel: 1,
    companyLevel: 1,
    activeShipIndex: 0,
    completedQuests: [],
    fleet: [{ cargo: { ore: 2 }, hull: 80, maxHull: 100 }],
    midgameChains: {},
  }, overrides || {});
}

function createHarness(options) {
  var config = options || {};
  var currentState = config.state || createState('initial');
  var rendered = [];
  var contexts = [];
  var modules = Object.assign({
    routeGuidance: {
      findQuestRoute: function () { return null; },
      findResearchSupplyRoute: function () { return null; },
      findBestDispatchRoute: function () { return null; },
    },
  }, config.modules || {});
  var ActionGuideUI = {
    init: vi.fn(),
    render: vi.fn(function (suggestion) { rendered.push(suggestion); }),
    showProcessing: vi.fn(),
    showCompletion: vi.fn(),
    dispose: vi.fn(),
  };
  var features = config.features || {
    get: function (name) { return modules[name] || null; },
    load: vi.fn(function (name) { return Promise.resolve(modules[name] || null); }),
  };
  var coordinator = createActionGuideCoordinator({
    getState: function () { return currentState; },
    features: features,
    ui: {
      ActionGuideUI: ActionGuideUI,
      MapUI: {
        isMarketOpen: function () { return !!config.marketOpen; },
        getMarketViewSystem: function (state) { return state.currentSystem; },
        getActiveArchiveTab: function () { return 'tab-quest'; },
      },
      UIManager: {
        getNavigationSnapshot: function () { return { activeWorkspace: config.workspace || 'map' }; },
      },
      EventUI: {
        getPendingEvent: function () { return config.pendingEvent || null; },
      },
    },
    systems: {
      Guidance: {
        getCurrentSuggestion: function (state, context) {
          contexts.push({ state: state, context: context });
          return { id: 'suggestion:' + state.id };
        },
      },
      Tutorial: { isActive: function () { return !!config.tutorialActive; } },
      Fleet: {
        getActiveShip: function (state) { return state.fleet[state.activeShipIndex || 0]; },
        getEffectiveShipStats: function () {
          return { fuelEff: 1.25, maxCargo: 10, dispatchProfile: { risk: 'balanced' } };
        },
        getShipRepairQuote: function () { return { cost: 200 }; },
        getShipMaintenanceSummary: function () { return { value: 70, band: 'worn' }; },
        getShipModRecommendation: function () { return config.modRecommendation || null; },
      },
      GalaxyData: {
        getPlanetData: function () {
          return { exploration: { pois: [{ id: 'ruins', name: '遗迹', resolved: false }] } };
        },
      },
      Exploration: {
        getSurveyDecisionIntel: function (state) { return { stateId: state.id }; },
      },
      MidgameTeachingChain: {
        getActiveChain: function () { return config.activeChain || null; },
      },
    },
    selectors: {
      getResearchDispatchBlockerState: function (state) { return { stateId: state.id }; },
      getPoiStatus: function () { return { actionLabel: '调查' }; },
      hasBlockingSurfaceOpen: function () { return !!config.blocking; },
    },
    hooks: { onAction: vi.fn() },
  });
  return {
    ActionGuideUI: ActionGuideUI,
    contexts: contexts,
    coordinator: coordinator,
    features: features,
    getState: function () { return currentState; },
    rendered: rendered,
    setState: function (state) { currentState = state; },
  };
}

describe('ActionGuideCoordinator', function () {
  it('只派生上下文并渲染，不修改领域状态', function () {
    var state = createState('readonly', { playerLevel: 2 });
    var before = structuredClone(state);
    var harness = createHarness({ state: state, workspace: 'archive', marketOpen: true });

    harness.coordinator.init();

    expect(state).toEqual(before);
    expect(harness.ActionGuideUI.init).toHaveBeenCalledTimes(1);
    expect(harness.rendered.at(-1)).toEqual({ id: 'suggestion:readonly' });
    expect(harness.contexts.at(-1).context).toMatchObject({
      archiveOpen: true,
      marketOpen: true,
      archiveTab: 'tab-quest',
      nextPoi: { poiId: 'ruins' },
      nextPoiStatus: { actionLabel: '调查' },
      surveyIntel: { stateId: 'readonly' },
    });
  });

  it('统一生成派遣上下文，不捕获旧 state', function () {
    var first = createState('first');
    var second = createState('second', { credits: 9900, currentSystem: 'mars' });
    var harness = createHarness({ state: first });

    expect(harness.coordinator.getDispatchContext()).toMatchObject({
      currentSystem: 'sol',
      credits: 1200,
      cargoFree: 8,
      fuelEfficiency: 1.25,
    });
    harness.setState(second);
    expect(harness.coordinator.getDispatchContext()).toMatchObject({
      currentSystem: 'mars',
      credits: 9900,
    });
  });

  it('延迟路线功能并发只请求一次，到达后用最新会话重新渲染', async function () {
    var modules = {};
    var resolveRoute = null;
    var load = vi.fn(function (name) {
      return new Promise(function (resolve) {
        resolveRoute = function (module) {
          modules[name] = module;
          resolve(module);
        };
      });
    });
    var harness = createHarness({
      state: createState('old', { playerLevel: 2 }),
      modules: {},
      features: {
        get: function (name) { return modules[name] || null; },
        load: load,
      },
    });

    harness.coordinator.init();
    harness.coordinator.refresh();
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);

    harness.setState(createState('new', { playerLevel: 2, currentSystem: 'vega' }));
    var pendingRoute = harness.coordinator.prefetchForState();
    resolveRoute({
      findQuestRoute: function (state) { return { stateId: state.id }; },
      findResearchSupplyRoute: function () { return null; },
      findBestDispatchRoute: function () { return null; },
    });
    await pendingRoute;

    expect(harness.contexts.at(-1).state.id).toBe('new');
    expect(harness.contexts.at(-1).context.questRouteRecommendation).toEqual({ stateId: 'new' });
    expect(harness.rendered.at(-1)).toEqual({ id: 'suggestion:new' });
  });

  it('会话 reset 使旧延迟结果失效，不触发追加渲染', async function () {
    var resolveRoute = null;
    var harness = createHarness({
      state: createState('old', { playerLevel: 2 }),
      modules: {},
      features: {
        get: function () { return null; },
        load: function () {
          return new Promise(function (resolve) { resolveRoute = resolve; });
        },
      },
    });

    harness.coordinator.init();
    await Promise.resolve();
    harness.coordinator.reset();
    var renderCountAfterReset = harness.ActionGuideUI.render.mock.calls.length;
    resolveRoute({});
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.ActionGuideUI.render).toHaveBeenCalledTimes(renderCountAfterReset);
  });

  it('改装完成上下文仅消费一次', function () {
    var harness = createHarness({ state: createState('mod') });
    harness.coordinator.setRecentModInstallContext({ modId: 'scanner' });

    harness.coordinator.refresh();
    harness.coordinator.refresh();

    expect(harness.contexts.at(-2).context.recentModInstallContext).toEqual({ modId: 'scanner' });
    expect(harness.contexts.at(-1).context.recentModInstallContext).toBeNull();
  });

  it('高级经营与路线功能的触发条件保持显式可测试', function () {
    expect(shouldLoadAdvancedCommerce(createState('base'))).toBe(false);
    expect(shouldLoadAdvancedCommerce(createState('station', { tradeStations: { sol: {} } }))).toBe(true);
    expect(shouldLoadRouteGuidance(createState('base'))).toBe(false);
    expect(shouldLoadRouteGuidance(createState('research', { currentResearch: { techId: 'warp' } }))).toBe(true);
  });
});
