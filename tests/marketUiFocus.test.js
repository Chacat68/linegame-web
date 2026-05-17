import { afterEach, describe, expect, it, vi } from 'vitest';

function createFakeClassList(initialValues) {
  var values = new Set(initialValues || []);
  return {
    add: function (value) {
      values.add(value);
    },
    remove: function (value) {
      values.delete(value);
    },
    contains: function (value) {
      return values.has(value);
    },
    toggle: function (value, force) {
      var shouldAdd = typeof force === 'boolean' ? force : !values.has(value);
      if (shouldAdd) values.add(value);
      else values.delete(value);
      return shouldAdd;
    },
  };
}

function createFakeElement(initialClasses) {
  var attributes = Object.create(null);
  return {
    dataset: {},
    scrollArgs: null,
    classList: createFakeClassList(initialClasses),
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute: function (name) {
      delete attributes[name];
    },
    querySelector: function () {
      return null;
    },
    querySelectorAll: function () {
      return [];
    },
    scrollIntoView: function (args) {
      this.scrollArgs = args;
    },
  };
}

describe('MarketUI guided focus', function () {
  var originalDocument = globalThis.document;
  var originalCss = globalThis.CSS;

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.CSS = originalCss;
  });

  it('会把行动指引的商品焦点落到目标卡片和买入按钮', async function () {
    vi.resetModules();

    var spotTab = createFakeElement();
    spotTab.dataset.marketWorkspaceTab = 'spot';
    var capitalTab = createFakeElement();
    capitalTab.dataset.marketWorkspaceTab = 'capital';
    var workspaceTabs = createFakeElement();
    workspaceTabs.querySelectorAll = function (selector) {
      return selector === '[data-market-workspace-tab]' ? [spotTab, capitalTab] : [];
    };

    var tradeTab = createFakeElement();
    tradeTab.dataset.marketSubworkspaceId = 'trade';
    var intelTab = createFakeElement();
    intelTab.dataset.marketSubworkspaceId = 'intel';
    var tradePane = createFakeElement();
    tradePane.dataset.marketSubworkspaceId = 'trade';
    var intelPane = createFakeElement();
    intelPane.dataset.marketSubworkspaceId = 'intel';
    var spotPane = createFakeElement();
    spotPane.querySelectorAll = function (selector) {
      if (selector === '[data-market-subworkspace-tab="spot"]') return [tradeTab, intelTab];
      if (selector === '[data-market-subworkspace-pane="spot"]') return [tradePane, intelPane];
      return [];
    };

    var buyButton = createFakeElement(['buy-card-btn']);
    var foodCard = createFakeElement(['market-good-card']);
    foodCard.querySelector = function (selector) {
      return selector === '.buy-card-btn' ? buyButton : null;
    };

    var elements = {
      'market-workspace-tabs': workspaceTabs,
      'market-spot-pane': spotPane,
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': createFakeElement(),
    };

    globalThis.CSS = {
      escape: function (value) {
        return String(value);
      },
    };
    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function (selector) {
        return selector === '[data-market-good="food"]' ? foodCard : null;
      },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');

    expect(MarketUI.setMarketWorkspaceFocus({
      workspaceId: 'spot',
      subworkspaceId: 'trade',
      goodId: 'food',
    })).toBe(true);

    expect(spotTab.classList.contains('active')).toBe(true);
    expect(tradeTab.classList.contains('active')).toBe(true);
    expect(foodCard.classList.contains('market-good-card--guide-focus')).toBe(true);
    expect(foodCard.getAttribute('data-guide-focus')).toBe('true');
    expect(buyButton.classList.contains('market-card-btn--guide-focus')).toBe(true);
    expect(foodCard.scrollArgs).toMatchObject({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth',
    });
  });

  it('卖货指引会把焦点落到出售按钮', async function () {
    vi.resetModules();

    var buyButton = createFakeElement(['buy-card-btn']);
    var sellButton = createFakeElement(['sell-card-btn']);
    var foodCard = createFakeElement(['market-good-card']);
    foodCard.querySelector = function (selector) {
      if (selector === '.buy-card-btn') return buyButton;
      if (selector === '.sell-card-btn') return sellButton;
      return null;
    };

    globalThis.CSS = {
      escape: function (value) {
        return String(value);
      },
    };
    globalThis.document = {
      querySelectorAll: function () {
        return [];
      },
      querySelector: function (selector) {
        return selector === '[data-market-good="food"]' ? foodCard : null;
      },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');

    expect(MarketUI.revealMarketGoodFocus('food', { tradeAction: 'sell' })).toBe(true);
    expect(sellButton.classList.contains('market-card-btn--guide-focus')).toBe(true);
    expect(buyButton.classList.contains('market-card-btn--guide-focus')).toBe(false);
  });
});
