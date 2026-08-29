// js/ui/MarketChromeController.js — 市场顶部 Chrome、详情模式与引导焦点 DOM
// 只处理工作区可见信息和焦点效果，不读取或修改领域状态。

import { findSystem as findSystemDefault } from '../data/systems.js';

function _escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _escapeSelectorValue(value) {
  var text = String(value);
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(text);
  if (typeof globalThis !== 'undefined' && globalThis.CSS && globalThis.CSS.escape) {
    return globalThis.CSS.escape(text);
  }
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function createMarketChromeController(options) {
  var opts = options || {};
  var navigation = opts.navigation;
  var findSystem = typeof opts.findSystem === 'function' ? opts.findSystem : findSystemDefault;
  var escapeSelectorValue = typeof opts.escapeSelectorValue === 'function'
    ? opts.escapeSelectorValue
    : _escapeSelectorValue;
  var renderCount = 0;
  var showDetailCount = 0;
  var guideClearCount = 0;
  var guideRevealRequestCount = 0;
  var guideRevealSuccessCount = 0;
  var lastSystemId = null;
  var lastMarketMode = null;
  var lastIsCurrentSystem = null;
  var lastDetailSystemId = null;
  var lastDetailMarketMode = null;
  var lastGuideGoodId = null;
  var lastGuideTradeAction = null;

  function getDocument() {
    if (typeof opts.getDocument === 'function') return opts.getDocument();
    return typeof document !== 'undefined' ? document : null;
  }

  function getElement(doc, id) {
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function clearGuideFocus() {
    var doc = getDocument();
    if (!doc || typeof doc.querySelectorAll !== 'function') return false;

    doc.querySelectorAll('.market-good-card--guide-focus').forEach(function (card) {
      card.classList.remove('market-good-card--guide-focus');
      if (card.removeAttribute) card.removeAttribute('data-guide-focus');
    });
    doc.querySelectorAll('.market-card-btn--guide-focus').forEach(function (button) {
      button.classList.remove('market-card-btn--guide-focus');
    });
    guideClearCount += 1;
    return true;
  }

  function revealGoodFocus(goodId, options) {
    guideRevealRequestCount += 1;
    var doc = getDocument();
    if (!doc || !goodId || typeof doc.querySelector !== 'function') return false;

    clearGuideFocus();
    var card = doc.querySelector('[data-market-good="' + escapeSelectorValue(goodId) + '"]');
    if (!card) return false;
    var input = options || {};
    var tradeAction = input.tradeAction === 'sell' ? 'sell' : 'buy';

    card.classList.add('market-good-card--guide-focus');
    if (card.setAttribute) card.setAttribute('data-guide-focus', 'true');
    var actionButton = card.querySelector
      ? card.querySelector(tradeAction === 'sell' ? '.sell-card-btn' : '.buy-card-btn')
      : null;
    if (actionButton) actionButton.classList.add('market-card-btn--guide-focus');
    if (typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }

    guideRevealSuccessCount += 1;
    lastGuideGoodId = String(goodId);
    lastGuideTradeAction = tradeAction;
    return true;
  }

  function updateDetailMode(doc, request) {
    var modeElement = getElement(doc, 'market-detail-mode');
    if (!modeElement) return false;
    var target = findSystem(request.systemId);
    var current = findSystem(request.state && request.state.currentSystem);
    var targetName = target ? target.name : '目标地点';
    var currentName = current ? current.name : '当前停靠点';
    var isBlack = request.marketMode === 'black';
    modeElement.className = 'market-detail-mode ' +
      (request.isCurrentSystem ? 'is-local' : 'is-remote') +
      (isBlack ? ' is-black' : '');
    if (request.isCurrentSystem) {
      modeElement.textContent = isBlack ? '当前停靠 · 黑市可操作' : '当前停靠 · 可交易';
      modeElement.title = isBlack
        ? '你正停靠在「' + targetName + '」，可以执行黑市交易。'
        : '你正停靠在「' + targetName + '」，可以执行买卖、补给和本地经营。';
      return true;
    }
    modeElement.textContent = '远程只读 · 需前往';
    modeElement.title = '你停靠在「' + currentName + '」，正在远程查看「' + targetName + '」行情；交易、补给和本地经营需要抵达该地点。';
    return true;
  }

  function render(request) {
    var input = request || {};
    var doc = getDocument();
    if (!doc) return false;
    navigation.renderWorkspaceTabs(input.progression);
    updateDetailMode(doc, input);
    renderCount += 1;
    lastSystemId = input.systemId || null;
    lastMarketMode = input.marketMode === 'black' ? 'black' : 'open';
    lastIsCurrentSystem = !!input.isCurrentSystem;
    return true;
  }

  function showDetail(systemId, marketMode) {
    var doc = getDocument();
    if (!doc) return false;
    var detail = getElement(doc, 'market-detail');
    var location = getElement(doc, 'market-detail-location');
    var title = getElement(doc, 'market-header-title');
    var tabs = getElement(doc, 'market-workspace-tabs');
    if (detail) detail.classList.remove('hidden');
    if (tabs) tabs.classList.remove('hidden');
    var system = findSystem(systemId);
    var normalizedMode = marketMode === 'black' ? 'black' : 'open';
    if (system && location) {
      location.innerHTML = '<span class="market-detail-loc-name">' + _escapeHtml(system.name) + '</span>' +
        '<span class="market-detail-loc-sep"> // </span>' +
        '<span class="market-detail-loc-type">' + _escapeHtml(system.typeLabel) + '</span>' +
        '<span class="market-detail-loc-sep"> // </span>' +
        '<span class="market-detail-loc-status">市场状态: ' + (normalizedMode === 'black' ? '🕶 黑市模式' : '可交易') + '</span>';
    }
    if (title) title.textContent = '市场中心';
    showDetailCount += 1;
    lastDetailSystemId = systemId || null;
    lastDetailMarketMode = normalizedMode;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      renderCount: renderCount,
      showDetailCount: showDetailCount,
      guideClearCount: guideClearCount,
      guideRevealRequestCount: guideRevealRequestCount,
      guideRevealSuccessCount: guideRevealSuccessCount,
      lastSystemId: lastSystemId,
      lastMarketMode: lastMarketMode,
      lastIsCurrentSystem: lastIsCurrentSystem,
      lastDetailSystemId: lastDetailSystemId,
      lastDetailMarketMode: lastDetailMarketMode,
      lastGuideGoodId: lastGuideGoodId,
      lastGuideTradeAction: lastGuideTradeAction,
    });
  }

  function reset() {
    renderCount = 0;
    showDetailCount = 0;
    guideClearCount = 0;
    guideRevealRequestCount = 0;
    guideRevealSuccessCount = 0;
    lastSystemId = null;
    lastMarketMode = null;
    lastIsCurrentSystem = null;
    lastDetailSystemId = null;
    lastDetailMarketMode = null;
    lastGuideGoodId = null;
    lastGuideTradeAction = null;
    return getDiagnostics();
  }

  return Object.freeze({
    clearGuideFocus: clearGuideFocus,
    getDiagnostics: getDiagnostics,
    render: render,
    reset: reset,
    revealGoodFocus: revealGoodFocus,
    showDetail: showDetail,
  });
}
