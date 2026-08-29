import { describe, expect, it, vi } from 'vitest';
import { createMarketCommodityController } from '../js/ui/MarketCommodityController.js';
import { createMarketWorkspaceSession } from '../js/ui/MarketWorkspaceSession.js';

function createHarness(options) {
  var opts = options || {};
  var session = createMarketWorkspaceSession();
  if (opts.activeContext) session.setActiveContext(opts.activeContext);
  var goods = [{
    id: 'food',
    name: '食物',
    emoji: '🌾',
    desc: '基础食品',
    basePrice: 10,
    marketAccess: ['open', 'black'],
  }];
  var systems = {
    sol_prime: { id: 'sol_prime', name: '太阳主星' },
    nova_station: { id: 'nova_station', name: '新星站' },
  };
  var economy = {
    getBuyPrice: vi.fn(function () { return 12; }),
    getSellPrice: vi.fn(function () { return 9; }),
    getBlackMarketBuyPrice: vi.fn(function () { return 22; }),
    getBlackMarketSellPrice: vi.fn(function () { return 18; }),
    getSupplyDemand: vi.fn(function () { return { ratio: 1.25 }; }),
  };
  var buildContextView = vi.fn(function (model) {
    return { title: '商品检查', html: 'CONTEXT:' + model.system.id + ':' + model.marketMode };
  });
  var buildDetailView = vi.fn(function (model) {
    return { title: '食物 · 商品详情', html: 'DETAIL:' + model.system.id + ':' + model.marketMode };
  });
  var controller = createMarketCommodityController({
    session: session,
    goods: goods,
    findSystem: function (systemId) { return systems[systemId] || null; },
    economy: economy,
    buildContextView: buildContextView,
    buildDetailView: buildDetailView,
  });
  var state = {
    currentSystem: 'sol_prime',
    cargo: { food: 3 },
    credits: 125,
  };
  return {
    buildContextView: buildContextView,
    buildDetailView: buildDetailView,
    controller: controller,
    economy: economy,
    session: session,
    state: state,
  };
}

describe('MarketCommodityController', function () {
  it('Context 与 L4 共享当前黑市地点、价格和库存解析', function () {
    var harness = createHarness({
      activeContext: { systemId: 'nova_station', mode: 'black' },
    });
    var contextContainer = { innerHTML: '' };
    var detailContainer = { innerHTML: '' };

    expect(harness.controller.renderContextInspector({
      context: { type: 'commodity', id: 'food' },
      state: harness.state,
      container: contextContainer,
    })).toEqual({ title: '商品检查' });
    expect(harness.controller.renderWorkspaceDetail({
      detail: { type: 'trade-commodity', id: 'food' },
      state: harness.state,
      container: detailContainer,
    })).toEqual({ title: '食物 · 商品详情' });

    expect(contextContainer.innerHTML).toBe('CONTEXT:nova_station:black');
    expect(detailContainer.innerHTML).toBe('DETAIL:nova_station:black');
    expect(harness.buildContextView).toHaveBeenCalledWith(expect.objectContaining({
      system: { id: 'nova_station', name: '新星站' },
      marketMode: 'black',
      buyPrice: 22,
      sellPrice: 18,
      held: 3,
      credits: 125,
    }));
    expect(harness.economy.getBlackMarketBuyPrice).toHaveBeenCalledTimes(2);
    expect(harness.economy.getBlackMarketSellPrice).toHaveBeenCalledTimes(2);
    expect(harness.economy.getBuyPrice).not.toHaveBeenCalled();
    expect(harness.controller.getDiagnostics()).toEqual({
      contextRenderCount: 1,
      detailRenderCount: 1,
      rejectedRenderCount: 0,
      lastGoodId: 'food',
      lastSystemId: 'nova_station',
      lastMarketMode: 'black',
      lastSurface: 'detail',
    });
  });

  it('没有市场会话时回退到当前地点的公开市场', function () {
    var harness = createHarness();
    var container = { innerHTML: '' };

    expect(harness.controller.renderContextInspector({
      context: { type: 'commodity', id: 'food' },
      state: harness.state,
      container: container,
    })).toEqual({ title: '商品检查' });

    expect(container.innerHTML).toBe('CONTEXT:sol_prime:open');
    expect(harness.economy.getBuyPrice).toHaveBeenCalledWith('sol_prime', 'food', harness.state);
    expect(harness.economy.getSellPrice).toHaveBeenCalledWith('sol_prime', 'food', harness.state);
    expect(harness.economy.getBlackMarketBuyPrice).not.toHaveBeenCalled();
  });

  it('拒绝错误 surface、缺失商品和缺失容器，并重置冻结 diagnostics', function () {
    var harness = createHarness();

    expect(harness.controller.renderContextInspector({})).toBe(false);
    expect(harness.controller.renderContextInspector({
      context: { type: 'ship', id: 'food' },
      state: harness.state,
      container: { innerHTML: '' },
    })).toBe(false);
    expect(harness.controller.renderContextInspector({
      context: { type: 'commodity', id: 'missing' },
      state: harness.state,
      container: { innerHTML: '' },
    })).toBe(false);
    expect(harness.controller.renderWorkspaceDetail({
      detail: { type: 'trade-commodity', id: 'food' },
      state: harness.state,
    })).toBe(false);

    expect(harness.controller.getDiagnostics()).toEqual({
      contextRenderCount: 0,
      detailRenderCount: 0,
      rejectedRenderCount: 4,
      lastGoodId: null,
      lastSystemId: null,
      lastMarketMode: null,
      lastSurface: null,
    });
    expect(Object.isFrozen(harness.controller.getDiagnostics())).toBe(true);
    expect(harness.controller.reset()).toEqual({
      contextRenderCount: 0,
      detailRenderCount: 0,
      rejectedRenderCount: 0,
      lastGoodId: null,
      lastSystemId: null,
      lastMarketMode: null,
      lastSurface: null,
    });
  });
});
