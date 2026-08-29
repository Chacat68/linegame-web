import { describe, expect, it, vi } from 'vitest';
import { createMarketOverviewController } from '../js/ui/MarketOverviewController.js';
import { createMarketWorkspaceSession } from '../js/ui/MarketWorkspaceSession.js';

function createFakeElement() {
  var listeners = Object.create(null);
  var attributes = Object.create(null);
  var classes = new Set();
  var html = '';
  var element = {
    dataset: {},
    style: {},
    children: [],
    textContent: '',
    disabled: false,
    className: '',
    classList: {
      toggle: function (name, active) {
        if (active) classes.add(name);
        else classes.delete(name);
      },
      contains: function (name) { return classes.has(name); },
    },
    addEventListener: function (type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    dispatch: function (type, event) {
      (listeners[type] || []).forEach(function (listener) { listener(event || {}); });
    },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) { return attributes[name]; },
    appendChild: function (child) { element.children.push(child); },
    focus: vi.fn(),
    querySelector: function (selector) {
      if (selector !== '.mkt-ov-planet-action') return null;
      if (!element.planetAction) element.planetAction = createFakeElement();
      return element.planetAction;
    },
  };
  Object.defineProperty(element, 'innerHTML', {
    get: function () { return html; },
    set: function (value) {
      html = String(value);
      if (html === '') element.children.length = 0;
    },
  });
  return element;
}

function createOverviewView(priceMode) {
  return {
    galaxyId: 'milky_way',
    priceMode: priceMode,
    ariaLabel: priceMode === 'sell' ? '各地商品卖出价格表' : '各地商品买入价格表',
    statusText: '表格显示各地的' + (priceMode === 'sell' ? '卖出价。' : '买入价。'),
    headers: [{ id: 'food', name: '食物', emoji: '🌾' }],
    rows: [
      {
        systemId: 'sol_prime',
        systemName: '太阳主星',
        typeLabel: '核心世界',
        color: '#fff',
        isCurrent: true,
        isVisited: true,
        canViewPrices: true,
        className: 'mkt-ov-row mkt-ov-current mkt-ov-visited',
        cells: [{ goodName: '食物', unknown: false, price: priceMode === 'sell' ? 40 : 50, heatClass: 'neutral', rangeClass: '', heatLabel: '正常价', heatNote: '稳定', deltaClass: 'flat', deltaText: '•0%' }],
      },
      {
        systemId: 'nova_station',
        systemName: '新星站',
        typeLabel: '空间站',
        color: '#888',
        isCurrent: false,
        isVisited: false,
        canViewPrices: false,
        className: 'mkt-ov-row mkt-ov-unvisited',
        cells: [{ goodName: '食物', unknown: true }],
      },
    ],
  };
}

describe('MarketOverviewController', function () {
  it('渲染表格、阻止未知地点交互并记录只读 diagnostics', function () {
    var session = createMarketWorkspaceSession();
    var table = createFakeElement();
    var thead = createFakeElement();
    var tbody = createFakeElement();
    var status = createFakeElement();
    var buy = createFakeElement();
    var sell = createFakeElement();
    buy.dataset.marketOverviewPriceMode = 'buy';
    sell.dataset.marketOverviewPriceMode = 'sell';
    var elements = {
      'market-trade-overview-table': table,
      'market-trade-overview-thead': thead,
      'market-trade-overview-tbody': tbody,
      'market-overview-price-status': status,
      'market-overview-price-buy': buy,
      'market-overview-price-sell': sell,
    };
    var doc = {
      getElementById: function (id) { return elements[id] || null; },
      createElement: function () { return createFakeElement(); },
    };
    var onOpenSystem = vi.fn();
    var controller = createMarketOverviewController({
      session: session,
      getDocument: function () { return doc; },
      buildView: function (request) { return createOverviewView(request.priceMode); },
    });

    expect(controller.render({ state: {}, galaxyId: 'milky_way', onOpenSystem: onOpenSystem })).toBe(true);
    expect(table.dataset.priceMode).toBe('buy');
    expect(table.getAttribute('aria-label')).toBe('各地商品买入价格表');
    expect(status.textContent).toBe('表格显示各地的买入价。');
    expect(thead.children).toHaveLength(1);
    expect(tbody.children).toHaveLength(2);
    expect(tbody.children[0].style.cursor).toBe('pointer');
    expect(tbody.children[1].style.cursor).toBe('default');

    tbody.children[0].dispatch('click');
    tbody.children[1].dispatch('click');
    expect(onOpenSystem).toHaveBeenCalledTimes(1);
    expect(onOpenSystem).toHaveBeenCalledWith('sol_prime');
    expect(controller.getDiagnostics()).toEqual({
      tableRenderCount: 1,
      controlBindCount: 1,
      modeChangeCount: 0,
      lastGalaxyId: 'milky_way',
      lastPriceMode: 'buy',
      lastRowCount: 2,
    });
    expect(Object.isFrozen(controller.getDiagnostics())).toBe(true);
  });

  it('方向键切换价格口径时只重绘表格并可重置诊断', function () {
    var session = createMarketWorkspaceSession();
    var table = createFakeElement();
    var buy = createFakeElement();
    var sell = createFakeElement();
    buy.dataset.marketOverviewPriceMode = 'buy';
    sell.dataset.marketOverviewPriceMode = 'sell';
    var elements = {
      'market-trade-overview-table': table,
      'market-trade-overview-thead': createFakeElement(),
      'market-trade-overview-tbody': createFakeElement(),
      'market-overview-price-status': createFakeElement(),
      'market-overview-price-buy': buy,
      'market-overview-price-sell': sell,
    };
    var doc = {
      getElementById: function (id) { return elements[id] || null; },
      createElement: function () { return createFakeElement(); },
    };
    var controller = createMarketOverviewController({
      session: session,
      getDocument: function () { return doc; },
      buildView: function (request) { return createOverviewView(request.priceMode); },
    });
    controller.render({ state: {}, galaxyId: 'milky_way' });
    var prevented = vi.fn();

    buy.dispatch('keydown', { key: 'ArrowRight', preventDefault: prevented });

    expect(prevented).toHaveBeenCalledTimes(1);
    expect(sell.focus).toHaveBeenCalledTimes(1);
    expect(session.getOverviewPriceMode()).toBe('sell');
    expect(table.dataset.priceMode).toBe('sell');
    expect(sell.getAttribute('aria-checked')).toBe('true');
    expect(buy.getAttribute('aria-checked')).toBe('false');
    expect(controller.getDiagnostics()).toEqual(expect.objectContaining({
      tableRenderCount: 2,
      controlBindCount: 1,
      modeChangeCount: 1,
      lastPriceMode: 'sell',
    }));
    expect(controller.reset()).toEqual({
      tableRenderCount: 0,
      controlBindCount: 0,
      modeChangeCount: 0,
      lastGalaxyId: null,
      lastPriceMode: null,
      lastRowCount: 0,
    });
  });
});
