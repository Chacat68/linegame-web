import { describe, expect, it, vi } from 'vitest';
import { createMarketSpotController } from '../js/ui/MarketSpotController.js';
import { createMarketWorkspaceSession } from '../js/ui/MarketWorkspaceSession.js';

function createFakeElement() {
  return {
    innerHTML: '',
  };
}

function createHarness(options) {
  var opts = options || {};
  var session = createMarketWorkspaceSession();
  var spot = createFakeElement();
  var analysis = createFakeElement();
  var elements = {
    'market-spot-pane': spot,
    'market-analysis-panel': analysis,
  };
  var navigation = {
    renderSubworkspace: vi.fn(function (workspaceId, sections) {
      return workspaceId + ':' + Object.keys(sections).join(',') + ':' + sections.trade;
    }),
    bindSubworkspaceTabs: vi.fn(),
  };
  var overview = { render: vi.fn(function () { return true; }) };
  var goods = {
    render: vi.fn(function () {
      return opts.goodsResult === false ? false : { activeGoodId: 'water', rendered: true };
    }),
  };
  var chart = { render: vi.fn(function () { return { dashboardRendered: true }; }) };
  var goodsCatalog = [
    { id: 'food', marketAccess: ['open'] },
    { id: 'water', marketAccess: ['open', 'black'] },
    { id: 'contraband', marketAccess: ['black'] },
  ];
  var blackGoods = [goodsCatalog[1], goodsCatalog[2]];
  var economy = {
    getBlackMarketGoods: vi.fn(function () { return blackGoods; }),
  };
  var snapshots = [
    { good: goodsCatalog[0] },
    { good: goodsCatalog[1] },
  ];
  var buildSnapshots = vi.fn(function (state, systemId, list) {
    return list.map(function (good) { return { good: good }; });
  });
  var renderTradeSection = vi.fn(function () { return 'TRADE'; });
  var renderIntelSection = vi.fn(function () { return 'INTEL'; });
  var renderBlackSection = vi.fn(function () { return 'BLACK'; });
  var renderAnalysis = vi.fn(function (request) {
    request.container.innerHTML = 'ANALYSIS:' + request.focusedGoodId;
  });
  var controller = createMarketSpotController({
    session: session,
    navigation: navigation,
    overview: overview,
    goods: goods,
    chart: chart,
    economy: economy,
    goodsCatalog: goodsCatalog,
    buildSnapshots: buildSnapshots,
    renderTradeSection: renderTradeSection,
    renderIntelSection: renderIntelSection,
    renderBlackSection: renderBlackSection,
    renderAnalysis: renderAnalysis,
    getDocument: function () {
      return {
        getElementById: function (id) { return elements[id] || null; },
      };
    },
  });
  var onCommand = vi.fn();
  var onOpenSystem = vi.fn();
  var rerenderSpot = vi.fn();
  var request = {
    state: { currentSystem: 'sol_prime', cargo: {} },
    systemId: 'sol_prime',
    galaxyId: 'milky_way',
    marketMode: 'open',
    isCurrentSystem: true,
    progression: { workspace: {} },
    systemFaction: { id: 'federation' },
    blackMarketUnlocked: true,
    onCommand: onCommand,
    onOpenSystem: onOpenSystem,
    rerenderSpot: rerenderSpot,
  };
  return {
    analysis: analysis,
    blackGoods: blackGoods,
    buildSnapshots: buildSnapshots,
    chart: chart,
    controller: controller,
    economy: economy,
    goods: goods,
    goodsCatalog: goodsCatalog,
    navigation: navigation,
    onOpenSystem: onOpenSystem,
    overview: overview,
    renderAnalysis: renderAnalysis,
    request: request,
    rerenderSpot: rerenderSpot,
    session: session,
    snapshots: snapshots,
    spot: spot,
  };
}

describe('MarketSpotController', function () {
  it('组合公开市场外壳、总览、商品、图表与分析面板', function () {
    var harness = createHarness();

    expect(harness.controller.render(harness.request)).toBe(true);

    expect(harness.buildSnapshots).toHaveBeenCalledWith(
      harness.request.state,
      'sol_prime',
      [harness.goodsCatalog[0], harness.goodsCatalog[1]],
      false,
      14
    );
    expect(harness.spot.innerHTML).toBe('spot:trade,intel,black:TRADE');
    expect(harness.navigation.bindSubworkspaceTabs).toHaveBeenCalledWith(
      harness.spot,
      harness.request.progression
    );
    expect(harness.overview.render).toHaveBeenCalledWith({
      state: harness.request.state,
      galaxyId: 'milky_way',
      onOpenSystem: harness.onOpenSystem,
    });
    expect(harness.goods.render).toHaveBeenCalledWith(expect.objectContaining({
      marketMode: 'open',
      focusedGoodId: 'food',
      focusKey: 'sol_prime:open',
      rerenderSpot: harness.rerenderSpot,
    }));
    expect(harness.chart.render).toHaveBeenCalledWith(expect.objectContaining({
      focusedGoodId: 'water',
      rerenderSpot: harness.rerenderSpot,
    }));
    expect(harness.analysis.innerHTML).toBe('ANALYSIS:water');
    expect(harness.controller.getDiagnostics()).toEqual({
      renderCount: 1,
      shellRenderCount: 1,
      subworkspaceBindCount: 1,
      overviewRenderCount: 1,
      goodsRenderCount: 1,
      chartRenderCount: 1,
      analysisRenderCount: 1,
      lastFocusedGoodId: 'water',
      lastSystemId: 'sol_prime',
      lastMarketMode: 'open',
      lastGoodsCount: 2,
      lastSnapshotCount: 2,
    });
  });

  it('黑市商品、焦点和图表区间全部使用同一个 Session 上下文', function () {
    var harness = createHarness();
    harness.request.marketMode = 'black';
    harness.session.setFocusedGood('sol_prime:black', 'contraband');
    harness.session.setChartRange('sol_prime:black', 30);

    expect(harness.controller.render(harness.request)).toBe(true);

    expect(harness.economy.getBlackMarketGoods).toHaveBeenCalledOnce();
    expect(harness.buildSnapshots).toHaveBeenCalledWith(
      harness.request.state,
      'sol_prime',
      harness.blackGoods,
      true,
      30
    );
    expect(harness.goods.render).toHaveBeenCalledWith(expect.objectContaining({
      marketMode: 'black',
      focusedGoodId: 'contraband',
      focusKey: 'sol_prime:black',
    }));
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      lastFocusedGoodId: 'water',
      lastMarketMode: 'black',
      lastGoodsCount: 2,
    }));
  });

  it('商品容器缺失时保留已渲染外壳，跳过图表/分析并可重置 diagnostics', function () {
    var harness = createHarness({ goodsResult: false });

    expect(harness.controller.render(harness.request)).toBe(true);
    expect(harness.chart.render).not.toHaveBeenCalled();
    expect(harness.renderAnalysis).not.toHaveBeenCalled();
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      renderCount: 1,
      shellRenderCount: 1,
      goodsRenderCount: 0,
      chartRenderCount: 0,
      analysisRenderCount: 0,
      lastFocusedGoodId: 'food',
    }));
    expect(Object.isFrozen(harness.controller.getDiagnostics())).toBe(true);
    expect(harness.controller.reset()).toEqual({
      renderCount: 0,
      shellRenderCount: 0,
      subworkspaceBindCount: 0,
      overviewRenderCount: 0,
      goodsRenderCount: 0,
      chartRenderCount: 0,
      analysisRenderCount: 0,
      lastFocusedGoodId: null,
      lastSystemId: null,
      lastMarketMode: null,
      lastGoodsCount: 0,
      lastSnapshotCount: 0,
    });
  });
});
