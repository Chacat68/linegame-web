// js/ui/MarketOverviewController.js — 各地价格总览 DOM、价格口径和交互生命周期
// 通过注入的 MarketWorkspaceSession 读写价格口径，不提交领域动作。

import {
  buildMarketOverviewView,
  renderMarketOverviewHead,
  renderMarketOverviewRow,
} from './MarketOverviewPresenter.js';
import { handleMarketRovingControlKeydown } from './MarketWorkspaceNavigation.js';

export const MARKET_OVERVIEW_ELEMENT_IDS = Object.freeze({
  table: 'market-trade-overview-table',
  thead: 'market-trade-overview-thead',
  tbody: 'market-trade-overview-tbody',
  status: 'market-overview-price-status',
  buy: 'market-overview-price-buy',
  sell: 'market-overview-price-sell',
});

export function createMarketOverviewController(options) {
  var opts = options || {};
  var session = opts.session;
  var buildView = typeof opts.buildView === 'function' ? opts.buildView : buildMarketOverviewView;
  var tableRenderCount = 0;
  var controlBindCount = 0;
  var modeChangeCount = 0;
  var lastGalaxyId = null;
  var lastPriceMode = null;
  var lastRowCount = 0;

  function getDocument() {
    if (typeof opts.getDocument === 'function') return opts.getDocument();
    return typeof document !== 'undefined' ? document : null;
  }

  function getElement(doc, id) {
    return doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
  }

  function renderTable(request) {
    var input = request || {};
    var doc = getDocument();
    if (!doc) return false;
    var thead = getElement(doc, MARKET_OVERVIEW_ELEMENT_IDS.thead);
    var tbody = getElement(doc, MARKET_OVERVIEW_ELEMENT_IDS.tbody);
    if (!thead || !tbody) return false;

    var view = buildView({
      state: input.state,
      galaxyId: input.galaxyId,
      priceMode: session.getOverviewPriceMode(),
    });
    var table = getElement(doc, MARKET_OVERVIEW_ELEMENT_IDS.table);
    var status = getElement(doc, MARKET_OVERVIEW_ELEMENT_IDS.status);
    if (table) {
      table.dataset.priceMode = view.priceMode;
      table.setAttribute('aria-label', view.ariaLabel);
    }
    if (status) status.textContent = view.statusText;

    thead.innerHTML = '';
    var headRow = doc.createElement('tr');
    headRow.innerHTML = renderMarketOverviewHead(view);
    thead.appendChild(headRow);

    tbody.innerHTML = '';
    view.rows.forEach(function (entry) {
      var row = doc.createElement('tr');
      row.className = entry.className;
      row.dataset.sysId = entry.systemId;
      row.innerHTML = renderMarketOverviewRow(entry);
      row.style.cursor = entry.canViewPrices ? 'pointer' : 'default';

      function openSystem() {
        if (typeof input.onOpenSystem === 'function') input.onOpenSystem(entry.systemId);
      }

      if (entry.canViewPrices) row.addEventListener('click', openSystem);
      var planetAction = row.querySelector('.mkt-ov-planet-action');
      if (planetAction && entry.canViewPrices) {
        planetAction.addEventListener('click', function (event) {
          if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
          openSystem();
        });
      }
      tbody.appendChild(row);
    });

    tableRenderCount += 1;
    lastGalaxyId = view.galaxyId || null;
    lastPriceMode = view.priceMode;
    lastRowCount = view.rows.length;
    return true;
  }

  function syncPriceModeControls(doc) {
    ['buy', 'sell'].forEach(function (mode) {
      var button = getElement(doc, MARKET_OVERVIEW_ELEMENT_IDS[mode]);
      if (!button) return;
      var active = mode === session.getOverviewPriceMode();
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', active ? 'true' : 'false');
      button.setAttribute('tabindex', active ? '0' : '-1');
    });
  }

  function bindPriceModeControls(request) {
    var doc = getDocument();
    if (!doc) return false;
    var buttons = ['buy', 'sell'].map(function (mode) {
      return getElement(doc, MARKET_OVERVIEW_ELEMENT_IDS[mode]);
    }).filter(Boolean);
    if (buttons.length === 0) return false;

    function activatePriceMode(button) {
      var previousMode = session.getOverviewPriceMode();
      var nextMode = session.setOverviewPriceMode(button.dataset.marketOverviewPriceMode);
      syncPriceModeControls(doc);
      if (nextMode === previousMode) return;
      modeChangeCount += 1;
      renderTable(request);
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        activatePriceMode(button);
      });
      button.addEventListener('keydown', function (event) {
        handleMarketRovingControlKeydown(event, button, buttons, activatePriceMode);
      });
    });
    controlBindCount += 1;
    syncPriceModeControls(doc);
    return true;
  }

  function render(request) {
    var rendered = renderTable(request);
    bindPriceModeControls(request);
    return rendered;
  }

  function getDiagnostics() {
    return Object.freeze({
      tableRenderCount: tableRenderCount,
      controlBindCount: controlBindCount,
      modeChangeCount: modeChangeCount,
      lastGalaxyId: lastGalaxyId,
      lastPriceMode: lastPriceMode,
      lastRowCount: lastRowCount,
    });
  }

  function reset() {
    tableRenderCount = 0;
    controlBindCount = 0;
    modeChangeCount = 0;
    lastGalaxyId = null;
    lastPriceMode = null;
    lastRowCount = 0;
    return getDiagnostics();
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    render: render,
    renderTable: renderTable,
    reset: reset,
  });
}
