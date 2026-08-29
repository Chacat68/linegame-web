// js/ui/MarketSpotController.js — 现货工作区组合、快照与局部重绘生命周期
// 协调纯 Presenter 与 Overview/Goods/Chart 控制器，不解释领域 command。

import { GOODS } from '../data/goods.js';
import * as Economy from '../systems/economy/Economy.js';
import { buildMarketSnapshots } from './MarketChartPresenter.js';
import {
  renderAnalysisPanel,
  renderBlackMarketSection,
  renderSpotIntelSection,
  renderSpotTradeSection,
} from './MarketSpotPresenter.js';

export const MARKET_SPOT_ELEMENT_IDS = Object.freeze({
  workspace: 'market-spot-pane',
  analysis: 'market-analysis-panel',
});

export function createMarketSpotController(options) {
  var opts = options || {};
  var session = opts.session;
  var navigation = opts.navigation;
  var overview = opts.overview;
  var goods = opts.goods;
  var chart = opts.chart;
  var economy = opts.economy || Economy;
  var goodsCatalog = Array.isArray(opts.goodsCatalog) ? opts.goodsCatalog : GOODS;
  var buildSnapshots = typeof opts.buildSnapshots === 'function'
    ? opts.buildSnapshots
    : buildMarketSnapshots;
  var renderTradeSection = typeof opts.renderTradeSection === 'function'
    ? opts.renderTradeSection
    : renderSpotTradeSection;
  var renderIntelSection = typeof opts.renderIntelSection === 'function'
    ? opts.renderIntelSection
    : renderSpotIntelSection;
  var renderBlackSection = typeof opts.renderBlackSection === 'function'
    ? opts.renderBlackSection
    : renderBlackMarketSection;
  var renderAnalysis = typeof opts.renderAnalysis === 'function'
    ? opts.renderAnalysis
    : renderAnalysisPanel;
  var renderCount = 0;
  var shellRenderCount = 0;
  var subworkspaceBindCount = 0;
  var overviewRenderCount = 0;
  var goodsRenderCount = 0;
  var chartRenderCount = 0;
  var analysisRenderCount = 0;
  var lastFocusedGoodId = null;
  var lastSystemId = null;
  var lastMarketMode = null;
  var lastGoodsCount = 0;
  var lastSnapshotCount = 0;

  function getDocument() {
    if (typeof opts.getDocument === 'function') return opts.getDocument();
    return typeof document !== 'undefined' ? document : null;
  }

  function getElement(doc, id) {
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function resolveSpotData(request) {
    var marketMode = request.marketMode === 'black' ? 'black' : 'open';
    var goodsList = marketMode === 'black'
      ? economy.getBlackMarketGoods()
      : goodsCatalog.filter(function (good) {
          return good.marketAccess && good.marketAccess.indexOf('open') !== -1;
        });
    var focusKey = request.systemId + ':' + marketMode;
    var chartRange = session.getChartRange(focusKey);
    session.setChartRange(focusKey, chartRange);
    var snapshots = buildSnapshots(
      request.state,
      request.systemId,
      goodsList,
      marketMode === 'black',
      chartRange
    );
    var focusedGoodId = session.getFocusedGood(focusKey) ||
      (snapshots[0] && snapshots[0].good.id) ||
      null;
    return {
      chartRange: chartRange,
      focusKey: focusKey,
      focusedGoodId: focusedGoodId,
      goodsList: goodsList,
      marketMode: marketMode,
      snapshots: snapshots,
    };
  }

  function render(request) {
    var input = request || {};
    var doc = getDocument();
    if (!doc || !input.state || !input.systemId) return false;
    var data = resolveSpotData(input);
    var spotContainer = getElement(doc, MARKET_SPOT_ELEMENT_IDS.workspace);

    if (spotContainer) {
      spotContainer.innerHTML = navigation.renderSubworkspace('spot', {
        trade: renderTradeSection(),
        intel: renderIntelSection({
          state: input.state,
          systemId: input.systemId,
          snapshots: data.snapshots,
          marketMode: data.marketMode,
          systemFaction: input.systemFaction,
          blackMarketUnlocked: input.blackMarketUnlocked,
          priceMode: session.getOverviewPriceMode(),
        }),
        black: renderBlackSection({
          state: input.state,
          systemId: input.systemId,
          marketMode: data.marketMode,
          systemFaction: input.systemFaction,
          blackMarketUnlocked: input.blackMarketUnlocked,
        }),
      }, input.progression);
      navigation.bindSubworkspaceTabs(spotContainer, input.progression);
      shellRenderCount += 1;
      subworkspaceBindCount += 1;
    }

    if (overview.render({
      state: input.state,
      galaxyId: input.galaxyId,
      onOpenSystem: input.onOpenSystem,
    }) !== false) {
      overviewRenderCount += 1;
    }

    var goodsResult = goods.render({
      state: input.state,
      systemId: input.systemId,
      marketMode: data.marketMode,
      isCurrentSystem: input.isCurrentSystem,
      goodsList: data.goodsList,
      snapshots: data.snapshots,
      focusedGoodId: data.focusedGoodId,
      focusKey: data.focusKey,
      systemFaction: input.systemFaction,
      blackMarketUnlocked: input.blackMarketUnlocked,
      onCommand: input.onCommand,
      rerenderSpot: input.rerenderSpot,
    });
    if (!goodsResult) {
      if (!spotContainer) return false;
      renderCount += 1;
      lastFocusedGoodId = data.focusedGoodId;
      lastSystemId = input.systemId;
      lastMarketMode = data.marketMode;
      lastGoodsCount = data.goodsList.length;
      lastSnapshotCount = data.snapshots.length;
      return true;
    }
    goodsRenderCount += 1;

    var activeGoodId = goodsResult.activeGoodId;
    if (chart.render({
      state: input.state,
      systemId: input.systemId,
      marketMode: data.marketMode,
      goodsList: data.goodsList,
      snapshots: data.snapshots,
      focusedGoodId: activeGoodId,
      focusKey: data.focusKey,
      rerenderSpot: input.rerenderSpot,
    }) !== false) {
      chartRenderCount += 1;
    }

    var analysisPanel = getElement(doc, MARKET_SPOT_ELEMENT_IDS.analysis);
    if (analysisPanel) {
      renderAnalysis({
        container: analysisPanel,
        state: input.state,
        systemId: input.systemId,
        snapshots: data.snapshots,
        marketMode: data.marketMode,
        focusedGoodId: activeGoodId,
      });
      analysisRenderCount += 1;
    }

    renderCount += 1;
    lastFocusedGoodId = activeGoodId;
    lastSystemId = input.systemId;
    lastMarketMode = data.marketMode;
    lastGoodsCount = data.goodsList.length;
    lastSnapshotCount = data.snapshots.length;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      renderCount: renderCount,
      shellRenderCount: shellRenderCount,
      subworkspaceBindCount: subworkspaceBindCount,
      overviewRenderCount: overviewRenderCount,
      goodsRenderCount: goodsRenderCount,
      chartRenderCount: chartRenderCount,
      analysisRenderCount: analysisRenderCount,
      lastFocusedGoodId: lastFocusedGoodId,
      lastSystemId: lastSystemId,
      lastMarketMode: lastMarketMode,
      lastGoodsCount: lastGoodsCount,
      lastSnapshotCount: lastSnapshotCount,
    });
  }

  function reset() {
    renderCount = 0;
    shellRenderCount = 0;
    subworkspaceBindCount = 0;
    overviewRenderCount = 0;
    goodsRenderCount = 0;
    chartRenderCount = 0;
    analysisRenderCount = 0;
    lastFocusedGoodId = null;
    lastSystemId = null;
    lastMarketMode = null;
    lastGoodsCount = 0;
    lastSnapshotCount = 0;
    return getDiagnostics();
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    render: render,
    reset: reset,
  });
}
