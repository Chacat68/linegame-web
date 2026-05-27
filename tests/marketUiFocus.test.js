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
  var children = [];
  return {
    dataset: {},
    innerHTML: '',
    className: '',
    children: children,
    scrollArgs: null,
    classList: createFakeClassList(initialClasses),
    addEventListener: function () {},
    appendChild: function (child) {
      children.push(child);
      return child;
    },
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

  it('现货页把局部分析标为信号，不抢占行动建议口径', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');

    var state = helpers.createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      fuel: 100,
      maxFuel: 100,
      credits: 5000,
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var spotCommandDeck = createFakeElement();
    var goodsToolbar = createFakeElement();
    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': createFakeElement(),
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': createFakeElement(),
      'market-goods-list': createFakeElement(),
      'market-goods-toolbar': goodsToolbar,
      'market-spot-command-deck': spotCommandDeck,
      'market-analysis-panel': createFakeElement(),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
      createElement: function () {
        return createFakeElement();
      },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render(state, function () {}, function () {}, function () {}, 'sol_prime', 'open', 'milky_way', null, null, {});

    expect(spotCommandDeck.innerHTML).toContain('信号');
    expect(spotCommandDeck.innerHTML).not.toContain('建议<strong>');
    expect(goodsToolbar.innerHTML).toContain('刷新主图和本地成交按钮');
    expect(goodsToolbar.innerHTML).not.toContain('右侧行动摘要');
  });

  it('建站候选会读取本地勘探情报信号', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Exploration = await import('../js/systems/galaxy/ExplorationSystem.js');
    var GalaxyData = await import('../js/systems/galaxy/GalaxyDataLayer.js');
    var MarketUI = await import('../js/ui/MarketUI.js');

    var state = helpers.createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      fuel: 100,
      maxFuel: 100,
      credits: 5000,
    });
    Economy.init();
    GalaxyData.init(state);

    expect(MarketUI.getTradeStationCandidateIntel(state, 'sol_prime')).toBe(null);

    var basePlanet = GalaxyData.getPlanetData('sol_prime');
    var resourcePoi = basePlanet.exploration.pois.find(function (poi) {
      return poi.kind === 'resource_cache';
    });
    expect(Exploration.scanSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.landOnSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.explorePoi(state, 'sol_prime', resourcePoi.id).ok).toBe(true);

    var intel = MarketUI.getTradeStationCandidateIntel(state, 'sol_prime');

    expect(intel).toMatchObject({
      systemId: 'sol_prime',
      signal: 'logistics',
      label: '废弃补给站',
    });
    expect(intel.note).toContain('补给');
  });

  it('商网页会展示候选站点的建议策略', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');
    var Exploration = await import('../js/systems/galaxy/ExplorationSystem.js');
    vi.spyOn(Exploration, 'getSurveyDecisionIntel').mockReturnValue({
      systemId: 'sol_prime',
      hasIntel: true,
      marketSignal: false,
      researchSignal: false,
      routeSignal: false,
      logisticsSignal: true,
      primarySignal: 'logistics',
      recentReportTitle: '补给回收包',
    });

    var state = helpers.createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      companyLevel: 4,
      fuel: 100,
      maxFuel: 100,
      credits: 200000,
      visitedSystems: ['sol_prime'],
      tradeStations: {},
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var operationsPane = createFakeElement();
    var elements = {
      'market-goods-list': createFakeElement(),
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': operationsPane,
      'market-spot-pane': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
      createElement: function () {
        return createFakeElement();
      },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render(state, function () {}, function () {}, function () {}, 'sol_prime', 'open', 'milky_way', null, null, {});

    expect(operationsPane.innerHTML).toContain('建议策略：扩张经营');
    expect(operationsPane.innerHTML).toContain('适合扩张经营');
  });

  it('已建站点出现策略推荐时提供切换按钮', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');
    var Exploration = await import('../js/systems/galaxy/ExplorationSystem.js');
    vi.spyOn(Exploration, 'getSurveyDecisionIntel').mockReturnValue({
      systemId: 'sol_prime',
      hasIntel: true,
      marketSignal: false,
      researchSignal: false,
      routeSignal: false,
      logisticsSignal: true,
      primarySignal: 'logistics',
      recentReportTitle: '补给回收包',
    });

    var state = helpers.createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      companyLevel: 6,
      fuel: 100,
      maxFuel: 100,
      credits: 200000,
      visitedSystems: ['sol_prime'],
      tradeStations: {
        sol_prime: {
          systemId: 'sol_prime',
          level: 1,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 100000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
      },
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var operationsPane = createFakeElement();
    var elements = {
      'market-goods-list': createFakeElement(),
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': operationsPane,
      'market-spot-pane': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
      createElement: function () {
        return createFakeElement();
      },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render(state, function () {}, function () {}, function () {}, 'sol_prime', 'open', 'milky_way', null, null, {});

    expect(operationsPane.innerHTML).toContain('建议策略：扩张经营');
    expect(operationsPane.innerHTML).toContain('切换为建议策略');
    expect(operationsPane.innerHTML).toContain('data-strategy-id="expansion"');
  });

  it('商网总览会展示下一笔商网动作', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');

    var state = helpers.createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      companyLevel: 6,
      fuel: 100,
      maxFuel: 100,
      credits: 150000,
      visitedSystems: ['sol_prime', 'nova_station'],
      tradeStations: {
        sol_prime: {
          systemId: 'sol_prime',
          level: 1,
          strategyId: 'balanced',
          managerId: null,
          totalIncome: 0,
          investment: 100000,
          lastIncome: 0,
          buildDay: 1,
          lastProcessedDay: 1,
        },
      },
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var operationsPane = createFakeElement();
    var elements = {
      'market-goods-list': createFakeElement(),
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': operationsPane,
      'market-spot-pane': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function () {
        return [];
      },
      querySelector: function () {
        return null;
      },
      createElement: function () {
        return createFakeElement();
      },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render(state, function () {}, function () {}, function () {}, 'sol_prime', 'open', 'milky_way', null, null, {});

    expect(operationsPane.innerHTML).toContain('下一笔商网动作');
    expect(operationsPane.innerHTML).toContain('补给商贸环');
    expect(operationsPane.innerHTML).toContain('data-action="market-build-station"');
    expect(operationsPane.innerHTML).toContain('data-system-id="nova_station"');
  });
});
