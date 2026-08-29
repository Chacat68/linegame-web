// js/ui/MarketCommodityController.js — 商品 Context / L4 的状态解析与容器投影
// 统一解析当前地点、市场模式、价格与库存；不发布交易命令，不修改领域状态。

import { GOODS } from '../data/goods.js';
import { findSystem as findSystemDefault } from '../data/systems.js';
import * as Economy from '../systems/economy/Economy.js';
import {
  buildMarketCommodityContextView,
  buildMarketCommodityDetailView,
} from './MarketCommodityDetailPresenter.js';

export function createMarketCommodityController(options) {
  var opts = options || {};
  var session = opts.session;
  var goods = Array.isArray(opts.goods) ? opts.goods : GOODS;
  var findSystem = typeof opts.findSystem === 'function' ? opts.findSystem : findSystemDefault;
  var economy = opts.economy || Economy;
  var buildContextView = typeof opts.buildContextView === 'function'
    ? opts.buildContextView
    : buildMarketCommodityContextView;
  var buildDetailView = typeof opts.buildDetailView === 'function'
    ? opts.buildDetailView
    : buildMarketCommodityDetailView;
  var contextRenderCount = 0;
  var detailRenderCount = 0;
  var rejectedRenderCount = 0;
  var lastGoodId = null;
  var lastSystemId = null;
  var lastMarketMode = null;
  var lastSurface = null;

  function resolveModel(state, goodId) {
    var good = goods.find(function (entry) { return entry.id === goodId; });
    if (!good) return null;

    var activeContext = session && typeof session.getActiveContext === 'function'
      ? session.getActiveContext()
      : null;
    var systemId = activeContext && activeContext.systemId
      ? activeContext.systemId
      : state.currentSystem;
    var system = findSystem(systemId) || findSystem(state.currentSystem);
    if (!system) return null;
    var marketMode = activeContext && activeContext.mode === 'black' ? 'black' : 'open';
    var isBlack = marketMode === 'black';

    return {
      good: good,
      system: system,
      marketMode: marketMode,
      buyPrice: isBlack
        ? economy.getBlackMarketBuyPrice(system.id, good.id, state)
        : economy.getBuyPrice(system.id, good.id, state),
      sellPrice: isBlack
        ? economy.getBlackMarketSellPrice(system.id, good.id, state)
        : economy.getSellPrice(system.id, good.id, state),
      supplyDemand: economy.getSupplyDemand(system.id, good.id),
      held: Number((state.cargo || {})[good.id]) || 0,
      credits: state.credits,
    };
  }

  function renderSurface(request, descriptor) {
    var input = request || {};
    var reference = input[descriptor.referenceKey];
    var state = input.state;
    var container = input.container;
    if (!reference || reference.type !== descriptor.referenceType || !state || !container) {
      rejectedRenderCount += 1;
      return false;
    }

    var model = resolveModel(state, reference.id);
    if (!model) {
      rejectedRenderCount += 1;
      return false;
    }
    var view = descriptor.buildView(model);
    if (!view) {
      rejectedRenderCount += 1;
      return false;
    }

    container.innerHTML = view.html;
    if (descriptor.surface === 'context') contextRenderCount += 1;
    else detailRenderCount += 1;
    lastGoodId = model.good.id;
    lastSystemId = model.system.id;
    lastMarketMode = model.marketMode;
    lastSurface = descriptor.surface;
    return { title: view.title };
  }

  function renderContextInspector(request) {
    return renderSurface(request, {
      referenceKey: 'context',
      referenceType: 'commodity',
      surface: 'context',
      buildView: buildContextView,
    });
  }

  function renderWorkspaceDetail(request) {
    return renderSurface(request, {
      referenceKey: 'detail',
      referenceType: 'trade-commodity',
      surface: 'detail',
      buildView: buildDetailView,
    });
  }

  function getDiagnostics() {
    return Object.freeze({
      contextRenderCount: contextRenderCount,
      detailRenderCount: detailRenderCount,
      rejectedRenderCount: rejectedRenderCount,
      lastGoodId: lastGoodId,
      lastSystemId: lastSystemId,
      lastMarketMode: lastMarketMode,
      lastSurface: lastSurface,
    });
  }

  function reset() {
    contextRenderCount = 0;
    detailRenderCount = 0;
    rejectedRenderCount = 0;
    lastGoodId = null;
    lastSystemId = null;
    lastMarketMode = null;
    lastSurface = null;
    return getDiagnostics();
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    renderContextInspector: renderContextInspector,
    renderWorkspaceDetail: renderWorkspaceDetail,
    reset: reset,
  });
}
