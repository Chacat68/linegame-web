import { describe, expect, it, vi } from 'vitest';
import { createMarketChromeController } from '../js/ui/MarketChromeController.js';

function createClassList(initial) {
  var values = new Set(initial || []);
  return {
    add: function (value) { values.add(value); },
    remove: function (value) { values.delete(value); },
    contains: function (value) { return values.has(value); },
  };
}

function createElement(initialClasses) {
  var attributes = Object.create(null);
  return {
    classList: createClassList(initialClasses),
    className: '',
    innerHTML: '',
    textContent: '',
    title: '',
    querySelector: function () { return null; },
    removeAttribute: function (name) { delete attributes[name]; },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  };
}

function createHarness() {
  var detail = createElement(['hidden']);
  var location = createElement();
  var title = createElement();
  var tabs = createElement(['hidden']);
  var mode = createElement();
  var elements = {
    'market-detail': detail,
    'market-detail-location': location,
    'market-header-title': title,
    'market-workspace-tabs': tabs,
    'market-detail-mode': mode,
  };
  var previousCard = createElement(['market-good-card--guide-focus']);
  previousCard.setAttribute('data-guide-focus', 'true');
  var previousButton = createElement(['market-card-btn--guide-focus']);
  var buyButton = createElement(['buy-card-btn']);
  var sellButton = createElement(['sell-card-btn']);
  var card = createElement(['market-good-card']);
  card.querySelector = function (selector) {
    if (selector === '.buy-card-btn') return buyButton;
    if (selector === '.sell-card-btn') return sellButton;
    return null;
  };
  card.scrollIntoView = vi.fn();
  var documentRef = {
    getElementById: function (id) { return elements[id] || null; },
    querySelectorAll: function (selector) {
      if (selector === '.market-good-card--guide-focus') return [previousCard];
      if (selector === '.market-card-btn--guide-focus') return [previousButton];
      return [];
    },
    querySelector: vi.fn(function (selector) {
      return selector === '[data-market-good="safe-food"]' ? card : null;
    }),
  };
  var systems = {
    sol_prime: { id: 'sol_prime', name: '太阳主星', typeLabel: '核心世界' },
    hostile: { id: 'hostile', name: '<节点&一>', typeLabel: '站点 "港口"' },
  };
  var navigation = { renderWorkspaceTabs: vi.fn() };
  var controller = createMarketChromeController({
    navigation: navigation,
    findSystem: function (systemId) { return systems[systemId] || null; },
    escapeSelectorValue: function (value) {
      return value === 'food"' ? 'safe-food' : value;
    },
    getDocument: function () { return documentRef; },
  });
  return {
    buyButton: buyButton,
    card: card,
    controller: controller,
    detail: detail,
    documentRef: documentRef,
    location: location,
    mode: mode,
    navigation: navigation,
    previousButton: previousButton,
    previousCard: previousCard,
    sellButton: sellButton,
    tabs: tabs,
    title: title,
  };
}

describe('MarketChromeController', function () {
  it('渲染本地/远程详情模式并委托顶部工作区标签', function () {
    var harness = createHarness();
    var progression = { workspace: {} };

    expect(harness.controller.render({
      state: { currentSystem: 'sol_prime' },
      systemId: 'sol_prime',
      marketMode: 'open',
      isCurrentSystem: true,
      progression: progression,
    })).toBe(true);
    expect(harness.navigation.renderWorkspaceTabs).toHaveBeenCalledWith(progression);
    expect(harness.mode.className).toBe('market-detail-mode is-local');
    expect(harness.mode.textContent).toBe('当前停靠 · 可交易');
    expect(harness.mode.title).toContain('太阳主星');

    harness.controller.render({
      state: { currentSystem: 'sol_prime' },
      systemId: 'hostile',
      marketMode: 'black',
      isCurrentSystem: false,
      progression: progression,
    });
    expect(harness.mode.className).toBe('market-detail-mode is-remote is-black');
    expect(harness.mode.textContent).toBe('远程只读 · 需前往');
    expect(harness.mode.title).toContain('太阳主星');
    expect(harness.mode.title).toContain('<节点&一>');
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      renderCount: 2,
      lastSystemId: 'hostile',
      lastMarketMode: 'black',
      lastIsCurrentSystem: false,
    }));
  });

  it('打开详情时转义地点 HTML 并恢复稳定 Chrome 节点', function () {
    var harness = createHarness();

    expect(harness.controller.showDetail('hostile', 'black')).toBe(true);

    expect(harness.detail.classList.contains('hidden')).toBe(false);
    expect(harness.tabs.classList.contains('hidden')).toBe(false);
    expect(harness.title.textContent).toBe('市场中心');
    expect(harness.location.innerHTML).toContain('&lt;节点&amp;一&gt;');
    expect(harness.location.innerHTML).toContain('站点 &quot;港口&quot;');
    expect(harness.location.innerHTML).not.toContain('<节点&一>');
    expect(harness.location.innerHTML).toContain('🕶 黑市模式');
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      showDetailCount: 1,
      lastDetailSystemId: 'hostile',
      lastDetailMarketMode: 'black',
    }));
  });

  it('清理旧高亮并把引导焦点落到目标交易动作，可重置冻结 diagnostics', function () {
    var harness = createHarness();

    expect(harness.controller.revealGoodFocus('food"', { tradeAction: 'sell' })).toBe(true);
    expect(harness.documentRef.querySelector).toHaveBeenCalledWith('[data-market-good="safe-food"]');
    expect(harness.previousCard.classList.contains('market-good-card--guide-focus')).toBe(false);
    expect(harness.previousCard.getAttribute('data-guide-focus')).toBe(null);
    expect(harness.previousButton.classList.contains('market-card-btn--guide-focus')).toBe(false);
    expect(harness.card.classList.contains('market-good-card--guide-focus')).toBe(true);
    expect(harness.card.getAttribute('data-guide-focus')).toBe('true');
    expect(harness.sellButton.classList.contains('market-card-btn--guide-focus')).toBe(true);
    expect(harness.buyButton.classList.contains('market-card-btn--guide-focus')).toBe(false);
    expect(harness.card.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth',
    });
    expect(harness.controller.revealGoodFocus('missing')).toBe(false);

    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      guideClearCount: 2,
      guideRevealRequestCount: 2,
      guideRevealSuccessCount: 1,
      lastGuideGoodId: 'food"',
      lastGuideTradeAction: 'sell',
    }));
    expect(Object.isFrozen(harness.controller.getDiagnostics())).toBe(true);
    expect(harness.controller.reset()).toEqual({
      renderCount: 0,
      showDetailCount: 0,
      guideClearCount: 0,
      guideRevealRequestCount: 0,
      guideRevealSuccessCount: 0,
      lastSystemId: null,
      lastMarketMode: null,
      lastIsCurrentSystem: null,
      lastDetailSystemId: null,
      lastDetailMarketMode: null,
      lastGuideGoodId: null,
      lastGuideTradeAction: null,
    });
  });
});
