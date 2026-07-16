import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

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
  var listeners = Object.create(null);
  return {
    dataset: {},
    innerHTML: '',
    className: '',
    children: children,
    disabled: false,
    focused: false,
    scrollArgs: null,
    style: {},
    classList: createFakeClassList(initialClasses),
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatchEvent: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || { target: this, preventDefault: function () {} });
      }, this);
    },
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
    focus: function () {
      this.focused = true;
    },
    scrollIntoView: function (args) {
      this.scrollArgs = args;
    },
  };
}

describe('MarketUI guided focus', function () {
  it('现货工作台会先呈现商品交易列表，再提供价格走势复核', function () {
    var source = readFileSync(new URL('../js/ui/MarketUI.js', import.meta.url), 'utf8');
    var start = source.indexOf('function _renderSpotTradeSection()');
    var end = source.indexOf('function _getFocusedMarketSnapshot', start);
    var sectionSource = source.slice(start, end);

    expect(sectionSource.indexOf('market-goods-shell')).toBeGreaterThan(-1);
    expect(sectionSource.indexOf('market-goods-shell')).toBeLessThan(sectionSource.indexOf('market-kline-panel'));
    var responsiveCss = readFileSync(new URL('../css/bridge-responsive.css', import.meta.url), 'utf8');
    var marketCss = readFileSync(new URL('../css/market-terminal.css', import.meta.url), 'utf8');
    expect(responsiveCss).toMatch(/@media \(max-height: 760px\)[\s\S]*?#market-overlay \.market-experience-route-host,[\s\S]*?#market-overlay \.market-spot-command-deck/);
    expect(responsiveCss).toMatch(/#market-overlay \.market-experience-route-host\s*\{\s*display:\s*none;/);
    expect(responsiveCss).toMatch(/#market-overlay \.market-good-card-price-block\s*\{\s*grid-column:\s*1 \/ 3;/);
    expect(responsiveCss).toMatch(/#market-overlay \.market-card-btn\s*\{[^}]*min-height:\s*var\(--ui-control-lg\);/);
    expect(marketCss).toMatch(/\.market-good-card\s*\{[^}]*display:\s*grid;/);
    expect(marketCss).toMatch(/\.market-good-card-chart-col\s*\{\s*display:\s*none;/);
  });

  var originalDocument = globalThis.document;
  var originalCss = globalThis.CSS;

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.CSS = originalCss;
  });

  it('市场工作区静态外壳包含 tabpanel 语义和适配样式锚点', function () {
    const html = readFileSync('index.html', 'utf8');
    const sharedCss = readFileSync('css/interstellar-trader.css', 'utf8');
    const marketCss = readFileSync('css/market-terminal.css', 'utf8');
    const css = sharedCss + '\n' + marketCss;
    const js = readFileSync('js/ui/MarketUI.js', 'utf8');

    expect(html).toContain('id="market-workspace-tabs"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="market-spot-pane"');
    expect(html).toContain('role="tabpanel"');
    expect(js).toContain('role="tab" aria-controls="');
    expect(js).toContain("setAttribute('role', 'listitem')");
    expect(js).toContain('aria-label="现货交易工作台"');
    expect(js).toContain('role="radiogroup" aria-labelledby="market-price-view-label"');
    expect(js).toContain('data-market-overview-price-mode="sell"');
    expect(js).toContain('class="mkt-ov-planet-action" type="button"');
    expect(js).not.toContain('id="market-trade-show-sell"');
    expect(css).toContain('.market-cmd-bar');
    expect(css).toContain('.market-main-pane[aria-hidden="true"]');
    expect(css).toContain('scroll-snap-type: x proximity');
    expect(css).toContain('.market-price-mode-btn[aria-checked="true"]');
    expect(css).toContain('.mkt-ov-planet-action:focus-visible');
    expect(sharedCss).not.toContain('Market matrix controls');
    expect(marketCss).toContain('Market matrix controls');
  });

  it('市场一级和二级标签支持方向键切换并同步焦点', async function () {
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
      credits: 50000,
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var spotWorkspace = createFakeElement(['active']);
    spotWorkspace.dataset.marketWorkspaceTab = 'spot';
    var capitalWorkspace = createFakeElement();
    capitalWorkspace.dataset.marketWorkspaceTab = 'capital';
    var operationsWorkspace = createFakeElement();
    operationsWorkspace.dataset.marketWorkspaceTab = 'operations';
    var workspaceButtons = [spotWorkspace, capitalWorkspace, operationsWorkspace];
    var workspaceTabs = createFakeElement();
    workspaceTabs.querySelectorAll = function (selector) {
      return selector === '[data-market-workspace-tab]' ? workspaceButtons : [];
    };

    var tradeTab = createFakeElement(['active']);
    tradeTab.dataset.marketSubworkspaceTab = 'spot';
    tradeTab.dataset.marketSubworkspaceId = 'trade';
    var intelTab = createFakeElement();
    intelTab.dataset.marketSubworkspaceTab = 'spot';
    intelTab.dataset.marketSubworkspaceId = 'intel';
    var tradePane = createFakeElement();
    tradePane.dataset.marketSubworkspaceId = 'trade';
    var intelPane = createFakeElement(['hidden']);
    intelPane.dataset.marketSubworkspaceId = 'intel';
    var spotPane = createFakeElement();
    spotPane.querySelectorAll = function (selector) {
      if (selector === '[data-market-subworkspace-tab]') return [tradeTab, intelTab];
      if (selector === '[data-market-subworkspace-tab="spot"]') return [tradeTab, intelTab];
      if (selector === '[data-market-subworkspace-pane="spot"]') return [tradePane, intelPane];
      return [];
    };

    var elements = {
      'market-workspace-tabs': workspaceTabs,
      'market-spot-pane': spotPane,
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': createFakeElement(),
      'market-goods-list': createFakeElement(),
      'market-goods-toolbar': createFakeElement(),
      'market-spot-command-deck': createFakeElement(),
      'market-analysis-panel': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () { return createFakeElement(); },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render(state, function () {}, function () {}, function () {}, 'sol_prime', 'open', 'milky_way', null, null, {});

    var subPrevented = false;
    tradeTab.dispatchEvent('keydown', {
      key: 'ArrowRight',
      preventDefault: function () { subPrevented = true; },
    });
    expect(subPrevented).toBe(true);
    expect(intelTab.focused).toBe(true);
    expect(intelTab.getAttribute('aria-selected')).toBe('true');
    expect(tradePane.getAttribute('aria-hidden')).toBe('true');
    expect(intelPane.getAttribute('aria-hidden')).toBe('false');

    var workspacePrevented = false;
    spotWorkspace.dispatchEvent('keydown', {
      key: 'ArrowRight',
      preventDefault: function () { workspacePrevented = true; },
    });
    expect(workspacePrevented).toBe(true);
    expect(capitalWorkspace.focused).toBe(true);
    expect(capitalWorkspace.getAttribute('aria-selected')).toBe('true');
    expect(elements['market-spot-pane'].getAttribute('aria-hidden')).toBe('true');
    expect(elements['market-capital-pane'].getAttribute('aria-hidden')).toBe('false');
  });

  it('价格矩阵口径支持方向键切换并在市场重绘后保持', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');

    var state = helpers.createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      playerLevel: 3,
      credits: 5000,
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var buyMode = createFakeElement(['is-active']);
    buyMode.dataset.marketOverviewPriceMode = 'buy';
    var sellMode = createFakeElement();
    sellMode.dataset.marketOverviewPriceMode = 'sell';
    var spotPane = createFakeElement();
    var overviewTable = createFakeElement();
    var overviewStatus = createFakeElement();
    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': spotPane,
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': createFakeElement(),
      'market-goods-list': createFakeElement(),
      'market-goods-toolbar': createFakeElement(),
      'market-spot-command-deck': createFakeElement(),
      'market-analysis-panel': createFakeElement(),
      'market-overview-price-buy': buyMode,
      'market-overview-price-sell': sellMode,
      'market-overview-price-status': overviewStatus,
      'market-trade-overview-table': overviewTable,
      'market-trade-overview-thead': createFakeElement(),
      'market-trade-overview-tbody': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () { return createFakeElement(); },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render(state, function () {}, function () {}, function () {}, 'sol_prime', 'open', 'milky_way', null, null, {});
    expect(spotPane.innerHTML).toContain('data-market-overview-price-mode="buy">买入价');
    expect(overviewTable.dataset.priceMode).toBe('buy');

    var prevented = false;
    buyMode.dispatchEvent('keydown', {
      key: 'ArrowRight',
      preventDefault: function () { prevented = true; },
    });
    expect(prevented).toBe(true);
    expect(sellMode.focused).toBe(true);
    expect(sellMode.getAttribute('aria-checked')).toBe('true');
    expect(buyMode.getAttribute('aria-checked')).toBe('false');
    expect(overviewTable.dataset.priceMode).toBe('sell');
    expect(overviewTable.getAttribute('aria-label')).toBe('各节点商品卖出价矩阵');
    expect(overviewStatus.innerHTML || overviewStatus.textContent).toContain('卖出价');

    MarketUI.render(state, function () {}, function () {}, function () {}, 'sol_prime', 'open', 'milky_way', null, null, {});
    expect(spotPane.innerHTML).toContain('market-price-mode-btn is-active" type="button" role="radio" aria-checked="true" aria-controls="market-trade-overview-table" tabindex="0" data-market-overview-price-mode="sell"');
  });

  it('商网站点分区包含列表语义、选择态和移动端适配锚点', function () {
    const css = readFileSync('css/interstellar-trader.css', 'utf8');
    const js = readFileSync('js/ui/MarketUI.js', 'utf8');

    expect(js).toContain('class="trade-station-card-list trade-station-card-list--candidates" role="list"');
    expect(js).toContain('class="trade-station-card-list trade-station-card-list--owned" role="list"');
    expect(js).toContain('class="trade-station-list-brief" role="group" aria-label="商网列表摘要"');
    expect(js).toContain('class="trade-station-list-brief-grid" role="list"');
    expect(js).toContain('class="trade-station-list-signal ');
    expect(js).toContain('class="market-local-operations-panel" aria-label="本地经营局部态势"');
    expect(js).toContain('class="market-local-operations-grid" role="list" aria-label="本地经营指标"');
    expect(js).toContain('class="market-local-operations-focus" aria-label="本地经营局部信号"');
    expect(js).toContain('class="trade-station-build-card" role="listitem" tabindex="0"');
    expect(js).toContain('class="trade-station-card" role="listitem" tabindex="0"');
    expect(js).toContain('aria-pressed="');
    expect(js).toContain('aria-describedby="');
    expect(css).toContain('.trade-station-card-list');
    expect(css).toContain('.trade-station-list-brief-grid');
    expect(css).toContain('.trade-station-list-signal--ready');
    expect(css).toContain('.market-local-operations-panel');
    expect(css).toContain('.market-local-operations-grid');
    expect(css).toContain('.market-local-operations-focus[data-tone="risk"]');
    expect(css).toContain('.trade-station-card:focus-visible');
    expect(css).toContain('.trade-station-choice-btn[aria-pressed="true"]');
    expect(css).toContain('.trade-station-income-row');
  });

  it('资本分区包含金融列表语义、操作标签和窄屏适配锚点', function () {
    const css = readFileSync('css/interstellar-trader.css', 'utf8');
    const js = readFileSync('js/ui/MarketUI.js', 'utf8');

    expect(js).toContain('role="list" aria-label="未结清贷款列表"');
    expect(js).toContain('role="list" aria-label="保险产品列表"');
    expect(js).toContain('market-finance-card-grid market-finance-card-grid--stocks" role="list"');
    expect(js).toContain('market-finance-card-grid market-finance-card-grid--futures" role="list"');
    expect(js).toContain('market-finance-contract-list" role="list"');
    expect(js).toContain('class="market-capital-signal-panel" aria-label="资本市场局部态势"');
    expect(js).toContain('class="market-capital-signal-grid" role="list" aria-label="资本市场态势矩阵"');
    expect(js).toContain('class="market-capital-focus" aria-label="资本局部信号"');
    expect(js).toContain('class="market-capital-local-panel" aria-label="本地资金防线局部态势"');
    expect(js).toContain('class="market-capital-local-grid" role="list" aria-label="本地资金防线指标"');
    expect(js).toContain('class="market-capital-local-focus" aria-label="本地资金局部信号"');
    expect(js).toContain('class="market-stock-position-panel" aria-label="股票持仓局部态势"');
    expect(js).toContain('class="market-stock-position-grid" role="list" aria-label="股票持仓指标"');
    expect(js).toContain('class="market-stock-position-focus" aria-label="股票局部信号"');
    expect(js).toContain('class="market-futures-risk-panel" aria-label="期货风控局部态势"');
    expect(js).toContain('class="market-futures-risk-grid" role="list" aria-label="期货风控指标"');
    expect(js).toContain('class="market-futures-risk-focus" aria-label="期货局部信号"');
    expect(js).toContain('class="market-finance-card');
    expect(js).toContain('role="listitem" tabindex="0"');
    expect(js).toContain('aria-describedby="');
    expect(js).toContain('aria-label="\' + _escapeHtmlAttr(\'买入 1 股 ');
    expect(js).toContain('aria-label="\' + _escapeHtmlAttr(\'平仓 ');
    expect(css).toContain('.market-capital-signal-panel');
    expect(css).toContain('.market-capital-signal-grid');
    expect(css).toContain('.market-capital-focus[data-tone="debt"]');
    expect(css).toContain('.market-capital-local-panel');
    expect(css).toContain('.market-capital-local-grid');
    expect(css).toContain('.market-capital-local-focus[data-tone="risk"]');
    expect(css).toContain('.market-stock-position-panel');
    expect(css).toContain('.market-stock-position-grid');
    expect(css).toContain('.market-stock-position-focus[data-tone="risk"]');
    expect(css).toContain('.market-futures-risk-panel');
    expect(css).toContain('.market-futures-risk-grid');
    expect(css).toContain('.market-futures-risk-focus[data-tone="risk"]');
    expect(css).toContain('.market-finance-card-grid[role="list"]');
    expect(css).toContain('.market-finance-card[role="listitem"]:focus-visible');
    expect(css).toContain('.market-finance-action-row[role="listitem"]');
    expect(css).toContain('.market-finance-layout');
  });

  it('黑市和市场情报链路包含列表语义、模式状态和移动端适配锚点', function () {
    const css = readFileSync('css/interstellar-trader.css', 'utf8');
    const js = readFileSync('js/ui/MarketUI.js', 'utf8');

    expect(js).toContain('role="list" aria-label="节点行情与准入速览"');
    expect(js).toContain('role="list" aria-label="值得盯盘的货物"');
    expect(js).toContain('role="list" aria-label="勘探报告联动链路"');
    expect(js).toContain("'market-survey-chain-row'");
    expect(js).toContain('role="listitem" tabindex="0" aria-labelledby="');
    expect(js).toContain('role="group" aria-label="市场模式切换"');
    expect(js).toContain('aria-pressed="');
    expect(js).toContain('class="market-spot-signal-panel market-intel-signal-panel" aria-label="市场情报局部态势"');
    expect(js).toContain('class="market-spot-signal-grid" role="list" aria-label="市场情报指标"');
    expect(js).toContain('class="market-spot-signal-panel market-black-risk-panel" aria-label="黑市风险局部态势"');
    expect(js).toContain('class="market-spot-signal-grid" role="list" aria-label="黑市风险指标"');
    expect(js).toContain('class="market-spot-focus" aria-label="市场局部信号"');
    expect(js).toContain('market-black-goods-grid" role="list" aria-label="灰市货目录"');
    expect(js).toContain('market-black-good-card" role="listitem"');
    expect(css).toContain('.market-spot-signal-panel');
    expect(css).toContain('.market-spot-signal-grid');
    expect(css).toContain('.market-spot-focus[data-tone="risk"]');
    expect(css).toContain('.market-mode-btn[aria-pressed="true"]');
    expect(css).toContain('.market-black-good-card:focus-visible');
    expect(css).toContain('.market-survey-chain-row[role="listitem"]:focus-visible');
    expect(css).toContain('.market-black-goods-grid[role="list"]');
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
    expect(spotTab.getAttribute('aria-selected')).toBe('true');
    expect(capitalTab.getAttribute('aria-selected')).toBe('false');
    expect(spotPane.getAttribute('aria-hidden')).toBe('false');
    expect(elements['market-capital-pane'].getAttribute('aria-hidden')).toBe('true');
    expect(tradeTab.classList.contains('active')).toBe(true);
    expect(tradeTab.getAttribute('aria-selected')).toBe('true');
    expect(intelPane.getAttribute('aria-hidden')).toBe('true');
    expect(foodCard.classList.contains('market-good-card--guide-focus')).toBe(true);
    expect(foodCard.getAttribute('data-guide-focus')).toBe('true');
    expect(buyButton.classList.contains('market-card-btn--guide-focus')).toBe(true);
    expect(foodCard.scrollArgs).toMatchObject({
      block: 'center',
      inline: 'nearest',
      behavior: 'smooth',
    });
  });

  it('会把事件链行动焦点落到市场情报链路行', async function () {
    vi.resetModules();

    var spotTab = createFakeElement();
    spotTab.dataset.marketWorkspaceTab = 'spot';
    var operationsTab = createFakeElement();
    operationsTab.dataset.marketWorkspaceTab = 'operations';
    var workspaceTabs = createFakeElement();
    workspaceTabs.querySelectorAll = function (selector) {
      return selector === '[data-market-workspace-tab]' ? [spotTab, operationsTab] : [];
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

    var chainRow = createFakeElement(['market-survey-chain-row']);
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
        return selector === '[data-market-survey-chain-id="sol_prime_chain_derelict_depot"]' ? chainRow : null;
      },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');

    expect(MarketUI.setMarketWorkspaceFocus({
      workspaceId: 'spot',
      subworkspaceId: 'intel',
      chainId: 'sol_prime_chain_derelict_depot',
    })).toBe(true);

    expect(spotTab.classList.contains('active')).toBe(true);
    expect(intelTab.classList.contains('active')).toBe(true);
    expect(intelTab.getAttribute('aria-selected')).toBe('true');
    expect(tradePane.getAttribute('aria-hidden')).toBe('true');
    expect(intelPane.getAttribute('aria-hidden')).toBe('false');
    expect(chainRow.classList.contains('market-survey-chain-row--guide-focus')).toBe(true);
    expect(chainRow.getAttribute('data-guide-focus')).toBe('true');
    expect(chainRow.scrollArgs).toMatchObject({
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

  it('资本页展示态势矩阵和局部风险信号', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');
    var Futures = await import('../js/systems/finance/FuturesSystem.js');

    var state = helpers.createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      fuel: 100,
      maxFuel: 100,
      credits: 8000,
      companyLevel: 5,
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);
    Futures.init(state);
    Finance.purchaseInsurance(state, 'hull');
    state.shipHull = 40;
    Finance.submitClaim(state, 'hull');
    var stockListing = Finance.getStockListings(state)[0];
    Finance.buyStock(state, stockListing.id, 2);
    state.stockMarket[stockListing.id].lastPrice = state.stockMarket[stockListing.id].price;
    state.stockMarket[stockListing.id].price += 50;
    var futuresListing = Futures.getFuturesListings(state)[0];
    Futures.openLongContract(state, futuresListing.goodId);
    state.futuresContracts[0].expiryDay = (state.day || 1) + 1;
    state.loans = [{
      id: 'loan-test',
      name: '测试贷款',
      status: 'active',
      balance: 9000,
      dailyPayment: 300,
      remainingDays: 12,
    }];

    var capitalPane = createFakeElement();
    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': createFakeElement(),
      'market-capital-pane': capitalPane,
      'market-operations-pane': createFakeElement(),
      'market-goods-list': createFakeElement(),
      'market-goods-toolbar': createFakeElement(),
      'market-spot-command-deck': createFakeElement(),
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

    expect(capitalPane.innerHTML).toContain('market-capital-signal-panel');
    expect(capitalPane.innerHTML).toContain('资本市场态势矩阵');
    expect(capitalPane.innerHTML).toContain('资本局部信号');
    expect(capitalPane.innerHTML).toContain('可用现金');
    expect(capitalPane.innerHTML).toContain('债务/理赔');
    expect(capitalPane.innerHTML).toContain('贷款现金流承压');
    expect(capitalPane.innerHTML).toContain('data-tone="debt"');
    expect(capitalPane.innerHTML).toContain('market-capital-local-panel');
    expect(capitalPane.innerHTML).toContain('本地资金防线指标');
    expect(capitalPane.innerHTML).toContain('本地资金局部信号');
    expect(capitalPane.innerHTML).toContain('理赔回款待入账');
    expect(capitalPane.innerHTML).toContain('预计回款');
    expect(capitalPane.innerHTML).toContain('market-stock-position-panel');
    expect(capitalPane.innerHTML).toContain('股票持仓指标');
    expect(capitalPane.innerHTML).toContain('股票局部信号');
    expect(capitalPane.innerHTML).toContain('持仓浮盈可观察');
    expect(capitalPane.innerHTML).toContain('market-futures-risk-panel');
    expect(capitalPane.innerHTML).toContain('期货风控指标');
    expect(capitalPane.innerHTML).toContain('期货局部信号');
    expect(capitalPane.innerHTML).toContain('到期压力升高');
  });

  it('黑市页展示准入风险态势和保护信号', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');

    var state = helpers.createTestState({
      currentSystem: 'shadow_haven',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      fuel: 100,
      maxFuel: 100,
      credits: 5000,
      cargo: { weapons: 2 },
      factionRelations: { syndicate: 90 },
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var spotPane = createFakeElement();
    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': spotPane,
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': createFakeElement(),
      'market-goods-list': createFakeElement(),
      'market-goods-toolbar': createFakeElement(),
      'market-spot-command-deck': createFakeElement(),
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
    MarketUI.render(state, function () {}, function () {}, function () {}, 'shadow_haven', 'black', 'milky_way', null, null, {});

    expect(spotPane.innerHTML).toContain('market-black-risk-panel');
    expect(spotPane.innerHTML).toContain('黑市风险态势');
    expect(spotPane.innerHTML).toContain('黑市风险指标');
    expect(spotPane.innerHTML).toContain('准入状态');
    expect(spotPane.innerHTML).toContain('违禁货值');
    expect(spotPane.innerHTML).toContain('黑市保护已覆盖');
    expect(spotPane.innerHTML).toContain('data-tone="ready"');
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

  it('市场情报区会展示已归档事件链后续影响', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Exploration = await import('../js/systems/galaxy/ExplorationSystem.js');
    var GalaxyData = await import('../js/systems/galaxy/GalaxyDataLayer.js');

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

    var basePlanet = GalaxyData.getPlanetData('sol_prime');
    var resourcePoi = basePlanet.exploration.pois.find(function (poi) {
      return poi.kind === 'resource_cache';
    });
    expect(Exploration.scanSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.landOnSystem(state, 'sol_prime').ok).toBe(true);
    expect(Exploration.explorePoi(state, 'sol_prime', resourcePoi.id).ok).toBe(true);

    var spotPane = createFakeElement();
    var elements = {
      'market-spot-pane': spotPane,
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': createFakeElement(),
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

    expect(spotPane.innerHTML).toContain('market-intel-signal-panel');
    expect(spotPane.innerHTML).toContain('情报链摘要');
    expect(spotPane.innerHTML).toContain('市场情报指标');
    expect(spotPane.innerHTML).toContain('事件链待跟进');
    expect(spotPane.innerHTML).toContain('market-survey-chain-row--archived');
    expect(spotPane.innerHTML).toContain('data-market-survey-chain-id="sol_prime_chain_derelict_depot"');
    expect(spotPane.innerHTML).toContain('is-followup-ready');
    expect(spotPane.innerHTML).toContain('废弃补给站');
    expect(spotPane.innerHTML).toContain('归档补给信号');
    expect(spotPane.innerHTML).toContain('商网 / 整备');
    expect(spotPane.innerHTML).toContain('确认商网和派遣整备价值');

    var intel = Exploration.getSurveyDecisionIntel(state, 'sol_prime');
    expect(Exploration.acknowledgeChainFollowup(state, 'sol_prime', intel.nextChainFollowup.chainId).ok).toBe(true);
    MarketUI.render(state, function () {}, function () {}, function () {}, 'sol_prime', 'open', 'milky_way', null, null, {});

    expect(spotPane.innerHTML).toContain('is-followup-acknowledged');
    expect(spotPane.innerHTML).toContain('已跟进');
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
    expect(operationsPane.innerHTML).toContain('market-local-operations-panel');
    expect(operationsPane.innerHTML).toContain('本地经营指标');
    expect(operationsPane.innerHTML).toContain('本地经营局部信号');
    expect(operationsPane.innerHTML).toContain('建站条件已具备');
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
    expect(operationsPane.innerHTML).toContain('管理员席位空缺');
    expect(operationsPane.innerHTML).toContain('管理配置');
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
    expect(operationsPane.innerHTML).toContain('商网列表摘要');
    expect(operationsPane.innerHTML).toContain('局部信号');
    expect(operationsPane.innerHTML).toContain('候选节点');
    expect(operationsPane.innerHTML).toContain('补给商贸环');
    expect(operationsPane.innerHTML).toContain('data-action="market-build-station"');
    expect(operationsPane.innerHTML).toContain('data-system-id="nova_station"');
  });
});
