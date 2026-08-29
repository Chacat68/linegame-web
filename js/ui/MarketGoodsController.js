// js/ui/MarketGoodsController.js — 商品工作区 DOM、焦点与 typed command 生命周期
// 通过注入端口发布 Context 和领域命令，不直接修改游戏领域状态。

import { MARKET_COMMAND } from '../core/MarketCommand.js';
import {
  renderMarketGoodsWorkspace,
  resolveMarketGoodsCommand,
} from './MarketGoodsPresenter.js';
import {
  renderQuickTradeDock,
  renderSpotGoodsToolbar,
} from './MarketSpotPresenter.js';

export const MARKET_GOODS_ELEMENT_IDS = Object.freeze({
  list: 'market-goods-list',
  toolbar: 'market-goods-toolbar',
  quickTrade: 'market-quick-trade-dock',
});

function _resolveDatasetNode(target, root, datasetKey) {
  var node = target || null;
  var matchedNode = null;
  while (node) {
    if (!matchedNode && node.dataset && node.dataset[datasetKey]) matchedNode = node;
    if (node === root) return matchedNode;
    node = node.parentElement || node.parentNode || null;
  }
  return null;
}

export function createMarketGoodsController(options) {
  var opts = options || {};
  var selection = opts.selection;
  var renderGoodsWorkspace = typeof opts.renderGoodsWorkspace === 'function'
    ? opts.renderGoodsWorkspace
    : renderMarketGoodsWorkspace;
  var resolveGoodsCommand = typeof opts.resolveGoodsCommand === 'function'
    ? opts.resolveGoodsCommand
    : resolveMarketGoodsCommand;
  var renderGoodsToolbar = typeof opts.renderGoodsToolbar === 'function'
    ? opts.renderGoodsToolbar
    : renderSpotGoodsToolbar;
  var renderQuickTrade = typeof opts.renderQuickTrade === 'function'
    ? opts.renderQuickTrade
    : renderQuickTradeDock;
  var renderCount = 0;
  var listDelegationBindCount = 0;
  var quickTradeBindCount = 0;
  var commandPublishCount = 0;
  var lastFocusedGoodId = null;
  var lastCommandType = null;
  var lastSystemId = null;
  var lastMarketMode = null;
  var lastRenderedGoodCount = 0;

  function getDocument() {
    if (typeof opts.getDocument === 'function') return opts.getDocument();
    return typeof document !== 'undefined' ? document : null;
  }

  function getElement(doc, id) {
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function findGood(goodsList, goodId) {
    return goodsList.find(function (good) { return good.id === goodId; }) || null;
  }

  function publishCommand(request, type, payload) {
    if (typeof request.onCommand !== 'function' || typeof opts.publishCommand !== 'function') return false;
    opts.publishCommand(request.onCommand, type, payload);
    commandPublishCount += 1;
    lastCommandType = type;
    return true;
  }

  function render(request) {
    var input = request || {};
    var doc = getDocument();
    if (!doc) return false;
    var goodsListEl = getElement(doc, MARKET_GOODS_ELEMENT_IDS.list);
    if (!goodsListEl) return false;

    var goodsList = Array.isArray(input.goodsList) ? input.goodsList : [];
    var focusKey = input.focusKey || '';
    var activeGoodId = selection.sync({
      focusKey: focusKey,
      focusedGoodId: input.focusedGoodId,
      goodsList: goodsList,
      source: 'market-workspace',
    });
    var marketMode = input.marketMode === 'black' ? 'black' : 'open';
    var goodsToolbarEl = getElement(doc, MARKET_GOODS_ELEMENT_IDS.toolbar);
    var quickTradeDockEl = getElement(doc, MARKET_GOODS_ELEMENT_IDS.quickTrade);

    if (goodsToolbarEl) {
      goodsToolbarEl.innerHTML = renderGoodsToolbar({
        state: input.state,
        systemId: input.systemId,
        snapshots: input.snapshots,
        marketMode: marketMode,
        focusedGoodId: activeGoodId,
      });
    }

    if (quickTradeDockEl) {
      quickTradeDockEl.innerHTML = renderQuickTrade({
        state: input.state,
        systemId: input.systemId,
        snapshots: input.snapshots,
        marketMode: marketMode,
        isCurrentSystem: input.isCurrentSystem,
        focusedGoodId: activeGoodId,
      });
      quickTradeDockEl.onclick = function (event) {
        var button = _resolveDatasetNode(
          event && event.target,
          quickTradeDockEl,
          'marketQuickAction'
        );
        if (!button || button.disabled) return;
        if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
        var quickGood = findGood(goodsList, button.dataset.id);
        if (!quickGood) return;
        publishCommand(input, MARKET_COMMAND.OPEN_TRADE, {
          action: button.dataset.marketQuickAction === 'sell' ? 'sell' : 'buy',
          marketMode: marketMode,
          good: quickGood,
        });
      };
      quickTradeBindCount += 1;
    }

    var goodsWorkspace = renderGoodsWorkspace({
      state: input.state,
      systemId: input.systemId,
      marketMode: marketMode,
      isCurrentSystem: input.isCurrentSystem,
      snapshots: input.snapshots,
      focusedGoodId: activeGoodId,
      systemFaction: input.systemFaction,
      blackMarketUnlocked: input.blackMarketUnlocked,
      canFocusRemote: typeof input.onCommand === 'function',
    });
    goodsListEl.innerHTML = goodsWorkspace.html;

    function focusGood(goodId) {
      return selection.focus({
        focusKey: focusKey,
        goodId: goodId,
        goodsList: goodsList,
        source: 'market-good-card',
        rerenderSpot: input.rerenderSpot,
      });
    }

    goodsListEl.onclick = function (event) {
      var command = resolveGoodsCommand(event && event.target, goodsListEl);
      if (!command) return;
      if (event && typeof event.stopPropagation === 'function') event.stopPropagation();

      if (command.type === 'focus-good') {
        focusGood(command.goodId);
        return;
      }
      if (command.type === 'focus-remote-system') {
        publishCommand(input, MARKET_COMMAND.FOCUS_REMOTE_SYSTEM, { systemId: command.systemId });
        return;
      }
      if (command.type === 'refuel') {
        publishCommand(input, MARKET_COMMAND.REFUEL);
        return;
      }

      var good = findGood(goodsList, command.goodId);
      if (!good || (command.type !== 'sell-good' && command.type !== 'buy-good')) return;
      publishCommand(input, MARKET_COMMAND.OPEN_TRADE, {
        action: command.type === 'sell-good' ? 'sell' : 'buy',
        marketMode: marketMode,
        good: good,
      });
    };

    goodsListEl.onkeydown = function (event) {
      if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
      var command = resolveGoodsCommand(event.target, goodsListEl);
      if (!command || command.type !== 'focus-good') return;
      if (typeof event.preventDefault === 'function') event.preventDefault();
      focusGood(command.goodId);
    };
    listDelegationBindCount += 1;

    renderCount += 1;
    lastFocusedGoodId = activeGoodId;
    lastSystemId = input.systemId || null;
    lastMarketMode = marketMode;
    lastRenderedGoodCount = goodsList.length;
    return Object.freeze({
      activeGoodId: activeGoodId,
      rendered: true,
    });
  }

  function getDiagnostics() {
    return Object.freeze({
      renderCount: renderCount,
      listDelegationBindCount: listDelegationBindCount,
      quickTradeBindCount: quickTradeBindCount,
      commandPublishCount: commandPublishCount,
      lastFocusedGoodId: lastFocusedGoodId,
      lastCommandType: lastCommandType,
      lastSystemId: lastSystemId,
      lastMarketMode: lastMarketMode,
      lastRenderedGoodCount: lastRenderedGoodCount,
    });
  }

  function reset() {
    renderCount = 0;
    listDelegationBindCount = 0;
    quickTradeBindCount = 0;
    commandPublishCount = 0;
    lastFocusedGoodId = null;
    lastCommandType = null;
    lastSystemId = null;
    lastMarketMode = null;
    lastRenderedGoodCount = 0;
    return getDiagnostics();
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    render: render,
    reset: reset,
  });
}
