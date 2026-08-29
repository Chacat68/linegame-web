import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

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
  it('交易页只保留快速交易和商品列表，详细行情移到可选工具', function () {
    var source = readFileSync(new URL('../js/ui/MarketSpotPresenter.js', import.meta.url), 'utf8');
    var start = source.indexOf('export function renderSpotTradeSection()');
    var end = source.indexOf('export function renderQuickTradeDock', start);
    var sectionSource = source.slice(start, end);

    expect(sectionSource.indexOf('market-quick-trade-dock')).toBeGreaterThan(-1);
    expect(sectionSource.indexOf('market-goods-shell')).toBeGreaterThan(sectionSource.indexOf('market-quick-trade-dock'));
    expect(sectionSource).not.toContain('market-trend-column');
    expect(sectionSource).not.toContain('market-kline-panel');
    expect(sectionSource).not.toContain('market-analysis-panel');
    expect(sectionSource).not.toContain('market-spot-command-deck');
    var toolsStart = source.indexOf('export function renderMarketIntelTools');
    var toolsEnd = source.indexOf('export function renderSpotTradeSection()', toolsStart);
    var toolsSource = source.slice(toolsStart, toolsEnd);
    expect(toolsSource).toContain('详细价格数据');
    expect(toolsSource).toContain('market-kline-panel');
    expect(toolsSource).toContain('各地价格表');
    var responsiveCss = readFileSync(new URL('../css/bridge-responsive.css', import.meta.url), 'utf8');
    var marketCss = readFileSync(new URL('../css/market-terminal.css', import.meta.url), 'utf8');
    expect(responsiveCss).not.toContain('market-progress-disclosure');
    expect(responsiveCss).not.toContain('market-experience-route');
    expect(responsiveCss).toMatch(/#market-overlay \.market-good-card-price-block\s*\{\s*grid-column:\s*1 \/ 3;/);
    expect(responsiveCss).toMatch(/#market-overlay \.market-card-btn\s*\{[^}]*min-height:\s*var\(--ui-control-lg\);/);
    expect(marketCss).toMatch(/\.market-good-card\s*\{[^}]*display:\s*grid;/);
    expect(marketCss).toMatch(/\.market-good-card-chart-col\s*\{\s*display:\s*none;/);
    expect(marketCss).toContain('grid-template-columns: minmax(260px, 0.9fr) minmax(400px, 1.35fr) minmax(250px, 0.78fr)');
    expect(marketCss).toMatch(/\.market-spot-trade-layout--simple\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\);/);
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
    const marketUiJs = readFileSync('js/ui/MarketUI.js', 'utf8');
    const navigationJs = readFileSync('js/ui/MarketWorkspaceNavigation.js', 'utf8');
    const overviewPresenterJs = readFileSync('js/ui/MarketOverviewPresenter.js', 'utf8');
    const overviewControllerJs = readFileSync('js/ui/MarketOverviewController.js', 'utf8');
    const goodsControllerJs = readFileSync('js/ui/MarketGoodsController.js', 'utf8');
    const selectionControllerJs = readFileSync('js/ui/MarketSelectionController.js', 'utf8');
    const chartControllerJs = readFileSync('js/ui/MarketChartController.js', 'utf8');
    const financeControllerJs = readFileSync('js/ui/MarketFinanceController.js', 'utf8');
    const commodityControllerJs = readFileSync('js/ui/MarketCommodityController.js', 'utf8');
    const spotControllerJs = readFileSync('js/ui/MarketSpotController.js', 'utf8');
    const chromeControllerJs = readFileSync('js/ui/MarketChromeController.js', 'utf8');
    const js = marketUiJs + '\n' + navigationJs + '\n' + overviewPresenterJs + '\n' + overviewControllerJs + '\n' + goodsControllerJs + '\n' + selectionControllerJs + '\n' + chartControllerJs + '\n' + financeControllerJs + '\n' + commodityControllerJs + '\n' + spotControllerJs + '\n' + chromeControllerJs;
    const spotJs = readFileSync('js/ui/MarketSpotPresenter.js', 'utf8');
    const goodsJs = readFileSync('js/ui/MarketGoodsPresenter.js', 'utf8');
    const marketEntryJs = readFileSync('js/ui/MarketWorkspaceEntryController.js', 'utf8');

    expect(html).toContain('id="market-workspace-tabs"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="market-spot-pane"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('class="workspace-surface workspace-surface--trade market-overlay market-workspace-v2"');
    expect(html).not.toContain('market-progress-disclosure');
    expect(html).not.toContain('market-experience-route');
    expect(js).not.toContain('_renderMarketExperienceRoute');
    expect(marketUiJs).toContain("from './MarketWorkspaceNavigation.js'");
    expect(marketUiJs).toContain("from './MarketOverviewController.js'");
    expect(marketUiJs).toContain("from './MarketGoodsController.js'");
    expect(marketUiJs).toContain("from './MarketSelectionController.js'");
    expect(marketUiJs).toContain("from './MarketChartController.js'");
    expect(marketUiJs).toContain("from './MarketFinanceController.js'");
    expect(marketUiJs).toContain("from './MarketCommodityController.js'");
    expect(marketUiJs).toContain("from './MarketSpotController.js'");
    expect(marketUiJs).toContain("from './MarketChromeController.js'");
    expect(marketUiJs).not.toContain('function _renderMarketWorkspaceTabs');
    expect(marketUiJs).not.toContain('function _renderMarketSubworkspace');
    expect(marketUiJs).not.toContain('function _renderOverviewTable');
    expect(marketUiJs).not.toContain('goodsListEl.onclick = function');
    expect(marketUiJs).not.toContain('function _renderMarketDashboard');
    expect(marketUiJs).not.toContain('container.onclick = function');
    expect(marketUiJs).not.toContain('document.getElementById');
    expect(marketUiJs).not.toContain('document.querySelector');
    expect(goodsControllerJs).toContain('goodsListEl.onclick = function');
    expect(goodsControllerJs).toContain('selection.focus({');
    expect(chartControllerJs).toContain('selection.focus({');
    expect(financeControllerJs).toContain('container.onclick = function');
    expect(commodityControllerJs).toContain('container.innerHTML = view.html');
    expect(spotControllerJs).toContain('goods.render({');
    expect(spotControllerJs).toContain('chart.render({');
    expect(chromeControllerJs).toContain('navigation.renderWorkspaceTabs(input.progression)');
    expect(chromeControllerJs).toContain('card.scrollIntoView({ block:');
    expect(marketEntryJs).toContain("icon.className = 'market-galaxy-btn-icon'");
    expect(marketEntryJs).toContain("label.className = 'market-galaxy-btn-label'");
    expect(marketEntryJs).toContain("button.setAttribute('aria-pressed'");
    expect(js).toContain('role="tab" aria-controls="');
    expect(goodsJs).toContain('role="listitem"');
    expect(spotJs).toContain('aria-label="买卖货物"');
    expect(spotJs).toContain('role="radiogroup" aria-labelledby="market-price-view-label"');
    expect(spotJs).toContain('data-market-overview-price-mode="sell"');
    expect(overviewPresenterJs).toContain('class="mkt-ov-planet-action" type="button"');
    expect(js).not.toContain('id="market-trade-show-sell"');
    expect(css).toContain('.market-cmd-bar');
    expect(css).toContain('.market-main-pane[aria-hidden="true"]');
    expect(css).toContain('scroll-snap-type: x proximity');
    expect(css).toContain('.market-price-mode-btn[aria-checked="true"]');
    expect(css).toContain('.mkt-ov-planet-action:focus-visible');
    expect(sharedCss).not.toContain('Market matrix controls');
    expect(marketCss).toContain('Market matrix controls');
    expect(marketCss).toMatch(/\.market-workspace-v2 \.market-galaxy-btn\s*\{[^}]*min-width:\s*90px;[^}]*padding:\s*0 13px;[^}]*gap:\s*8px;/);
  });

  it('价格图表的 SVG 绘制样式由市场终端独立提供', function () {
    const marketCss = readFileSync('css/market-terminal.css', 'utf8');
    const fleetCss = readFileSync('css/fleet.css', 'utf8');

    expect(marketCss).toContain('.market-workspace-v2 .market-chart-frame');
    expect(marketCss).toContain('.market-workspace-v2 .market-chart-candle.up');
    expect(marketCss).toContain('.market-workspace-v2 .kline-border');
    expect(marketCss).toContain('.market-workspace-v2 .kline-candle.up');
    expect(marketCss).toContain('.market-workspace-v2 .kline-current-tag');
    expect(fleetCss).not.toContain('.market-chart-frame');
    expect(fleetCss).not.toContain('.kline-border');
    expect(fleetCss).not.toContain('.kline-candle.up');
  });

  it('商业终端样式随 Market feature 加载且不会回流 Fleet', function () {
    const marketCss = readFileSync('css/market-terminal.css', 'utf8');
    const fleetCss = readFileSync('css/fleet.css', 'utf8');
    const productionLegacyCss = [
      'css/panels.css',
      'css/systems.css',
      'css/responsive.css',
      'css/interstellar-trader.css',
    ].map(function (path) { return readFileSync(path, 'utf8'); }).join('\n');
    const allCss = readdirSync('css')
      .filter(function (name) { return name.endsWith('.css'); })
      .map(function (name) { return readFileSync('css/' + name, 'utf8'); })
      .join('\n');
    const capitalPresenter = readFileSync('js/ui/MarketCapitalPresenter.js', 'utf8');
    const retiredPanels = /\.market-(?:capital-signal|capital-focus|stock-position|futures-risk|finance-contract|finance-history)/;

    expect(marketCss).toContain('Market-owned base primitives migrated from fleet.css');
    expect(marketCss).toContain('Market-owned legacy primitives migrated from panels.css');
    expect(marketCss).toContain('Market-owned legacy primitives migrated from systems.css');
    expect(marketCss).toContain('Market-owned legacy primitives migrated from responsive.css');
    expect(marketCss).toContain('Market-owned legacy cascade migrated from interstellar-trader.css');
    expect(marketCss).toContain('.market-terminal-dashboard');
    expect(marketCss).toContain('.market-finance-action-row');
    expect(marketCss).toContain('@keyframes market-guide-focus-pulse');
    expect(fleetCss).not.toMatch(/\.(?:market|mkt|kline|bm|trade-station)-/);
    expect(productionLegacyCss).not.toMatch(/#market(?:-|\b)|\.(?:market|mkt|kline|bm|trade-station)-/);
    expect(allCss).not.toMatch(retiredPanels);
    expect(capitalPresenter).toContain('market-capital-local-panel');
    expect(capitalPresenter).toContain('market-finance-action-row');
    expect(capitalPresenter).not.toMatch(retiredPanels);
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
      'market-trade-overview-table': createFakeElement(),
      'market-trade-overview-thead': createFakeElement(),
      'market-trade-overview-tbody': createFakeElement(),
      'market-overview-price-status': createFakeElement(),
      'market-overview-price-buy': createFakeElement(),
      'market-overview-price-sell': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () { return createFakeElement(); },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way', onCommand: function () {} });

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

  it('价格表口径支持方向键切换并在市场重绘后保持', async function () {
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
    var overviewBody = createFakeElement();
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
      'market-trade-overview-tbody': overviewBody,
    };
    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () { return createFakeElement(); },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way', onCommand: function () {} });
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
    expect(overviewTable.getAttribute('aria-label')).toBe('各地商品卖出价格表');
    expect(overviewStatus.innerHTML || overviewStatus.textContent).toContain('卖出价');

    var hiddenRemoteRow = overviewBody.children.find(function (row) {
      return row.dataset.sysId && row.dataset.sysId !== state.currentSystem && row.innerHTML.includes('price-unknown');
    });
    expect(hiddenRemoteRow).toBeDefined();
    expect(hiddenRemoteRow.innerHTML).toContain('—');
    expect(hiddenRemoteRow.innerHTML).toContain('disabled aria-disabled="true"');

    state.researchedTechs = ['trade_network'];
    var previousRowCount = overviewBody.children.length;
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way', onCommand: function () {} });
    expect(spotPane.innerHTML).toContain('market-price-mode-btn is-active" type="button" role="radio" aria-checked="true" aria-controls="market-trade-overview-table" tabindex="0" data-market-overview-price-mode="sell"');
    var unlockedRows = overviewBody.children.slice(previousRowCount);
    var unlockedRemoteRow = unlockedRows.find(function (row) {
      return row.dataset.sysId && row.dataset.sysId !== state.currentSystem;
    });
    expect(unlockedRemoteRow).toBeDefined();
    expect(unlockedRemoteRow.innerHTML).not.toContain('price-unknown');
    expect(unlockedRemoteRow.innerHTML).not.toContain('disabled aria-disabled="true"');
  });

  it('商网站点分区包含列表语义、选择态和移动端适配锚点', function () {
    const css = readFileSync('css/market-terminal.css', 'utf8');
    const js = readFileSync('js/ui/MarketOperationsPresenter.js', 'utf8');

    expect(js).toContain('class="trade-station-card-list trade-station-card-list--candidates" role="list"');
    expect(js).toContain('class="trade-station-card-list trade-station-card-list--owned" role="list"');
    expect(js).toContain('class="trade-station-list-brief" role="group" aria-label="商网列表摘要"');
    expect(js).toContain('class="trade-station-list-brief-grid" role="list"');
    expect(js).toContain('class="trade-station-list-signal ');
    expect(js).toContain('class="market-local-operations-panel" aria-label="本地经营局部状态"');
    expect(js).toContain('class="market-local-operations-grid" role="list" aria-label="本地经营指标"');
    expect(js).toContain('class="market-local-operations-focus" aria-label="本地经营状态"');
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

  it('资本分区只保留贷款与站点投资语义和适配锚点', function () {
    const css = readFileSync('css/market-terminal.css', 'utf8');
    const navigationJs = readFileSync('js/ui/MarketWorkspaceNavigation.js', 'utf8');
    const capitalJs = readFileSync('js/ui/MarketCapitalPresenter.js', 'utf8');

    expect(capitalJs).toContain('role="list" aria-label="未结清贷款列表"');
    expect(capitalJs).toContain('class="market-capital-local-grid" role="list" aria-label="经营贷款指标"');
    expect(capitalJs).toContain('资金页集中查看现金、贷款与站点投资总额');
    expect(capitalJs).toContain('具体建站和追加投资统一在贸易站页处理');
    expect(capitalJs).not.toContain('data-action="market-invest-trade-station"');
    expect(navigationJs).toContain("capital: [\n    { id: 'local', label: '贷款与投资', hint: '管理本地资金' },\n  ]");
    expect(capitalJs).toContain('role="listitem" tabindex="0"');
    expect(capitalJs).toContain('aria-describedby="');
    expect(css).toContain('.market-capital-local-panel');
    expect(css).toContain('.market-capital-local-grid');
    expect(css).toContain('.market-capital-local-focus[data-tone="debt"]');
    expect(css).toContain('.market-finance-action-row[role="listitem"]');
    expect(css).toContain('.market-finance-layout');
  });

  it('黑市和行情页包含列表语义、模式状态且不再承载探索报告', function () {
    const sharedCss = readFileSync('css/interstellar-trader.css', 'utf8');
    const marketCss = readFileSync('css/market-terminal.css', 'utf8');
    const css = sharedCss + '\n' + marketCss;
    const js = readFileSync('js/ui/MarketUI.js', 'utf8');
    const spotJs = readFileSync('js/ui/MarketSpotPresenter.js', 'utf8');

    expect(spotJs).toContain('role="list" aria-label="地点行情和开放条件"');
    expect(spotJs).toContain('role="list" aria-label="值得关注的货物"');
    expect(spotJs).toContain('class="market-intel-decision-grid" role="group" aria-label="地点和关注商品"');
    expect(spotJs).toContain('class="market-intel-secondary-details"');
    expect(spotJs).toContain('地点条件与完整关注清单');
    expect(spotJs).toContain('class="market-finance-action-meta market-watch-metrics"');
    expect(spotJs).not.toContain('role="list" aria-label="探索报告带来的机会"');
    expect(spotJs).not.toContain("'market-survey-chain-row'");
    expect(spotJs).toContain('role="listitem" tabindex="0" aria-labelledby="');
    expect(spotJs).toContain('role="group" aria-label="市场模式切换"');
    expect(spotJs).toContain('aria-pressed="');
    expect(spotJs).toContain('class="market-spot-signal-panel market-intel-signal-panel" aria-label="行情概览"');
    expect(spotJs).toContain('class="market-spot-signal-grid" role="list" aria-label="行情信息"');
    expect(spotJs).toContain('class="market-spot-signal-panel market-black-risk-panel" aria-label="黑市风险局部状态"');
    expect(spotJs).toContain('class="market-spot-signal-grid" role="list" aria-label="黑市风险指标"');
    expect(spotJs).toContain('class="market-spot-focus" aria-label="现货市场信号"');
    expect(spotJs).toContain('market-black-goods-grid" role="list" aria-label="灰市货目录"');
    expect(spotJs).toContain('market-black-good-card" role="listitem"');
    expect(css).toContain('.market-spot-signal-panel');
    expect(css).toContain('.market-spot-signal-grid');
    expect(css).toContain('.market-spot-focus[data-tone="risk"]');
    expect(css).toContain('.market-mode-btn[aria-pressed="true"]');
    expect(css).toContain('.market-black-good-card:focus-visible');
    expect(css).not.toContain('.market-survey-chain-row[role="listitem"]:focus-visible');
    expect(css).toContain('.market-black-goods-grid[role="list"]');
    expect(marketCss).toContain('.market-workspace-v2 .market-finance-section-head');
    expect(marketCss).toContain('.market-workspace-v2 .market-intel-decision-grid');
    expect(marketCss).toContain('.market-workspace-v2 .market-intel-secondary-details > summary');
    expect(marketCss).toContain('.market-workspace-v2 .market-spot-intel-grid .market-finance-summary-metric:last-child');
    expect(marketCss).toContain('grid-template-columns: minmax(320px, 0.82fr) minmax(520px, 1.18fr)');
    expect(marketCss).toContain('.market-workspace-v2 .market-watch-list');
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

  it('市场焦点不再处理已迁入档案的事件链定位', async function () {
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
    expect(chainRow.classList.contains('market-survey-chain-row--guide-focus')).toBe(false);
    expect(chainRow.getAttribute('data-guide-focus')).toBe(null);
    expect(chainRow.scrollArgs).toBe(null);
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

  it('交易页用普通话说明货物选择，不要求先理解价格图表', async function () {
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

    var goodsToolbar = createFakeElement();
    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': createFakeElement(),
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': createFakeElement(),
      'market-goods-list': createFakeElement(),
      'market-goods-toolbar': goodsToolbar,
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
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way', onCommand: function () {} });

    expect(goodsToolbar.innerHTML).toContain('点击其他货物即可查看价格并买卖');
    expect(goodsToolbar.innerHTML).not.toContain('价格走势');
    expect(goodsToolbar.innerHTML).not.toContain('右侧行动摘要');
  });

  it('商品列表用单一委托发布买卖、补给和键盘焦点 command', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');
    var state = helpers.createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      fuel: 80,
      maxFuel: 100,
      cargo: { food: 2 },
      credits: 5000,
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var goodsList = createFakeElement();
    var quickTradeDock = createFakeElement();
    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': createFakeElement(),
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': createFakeElement(),
      'market-goods-list': goodsList,
      'market-goods-toolbar': createFakeElement(),
      'market-quick-trade-dock': quickTradeDock,
    };
    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () { return createFakeElement(); },
    };

    var MarketCommand = await import('../js/core/MarketCommand.js');
    var onCommand = vi.fn();
    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render({
      state: state,
      systemId: 'sol_prime',
      marketMode: 'open',
      galaxyId: 'milky_way',
      onCommand: onCommand,
    });

    expect(typeof goodsList.onclick).toBe('function');
    expect(typeof goodsList.onkeydown).toBe('function');
    expect(typeof quickTradeDock.onclick).toBe('function');
    function commandTarget(type, goodId) {
      return { dataset: { marketCommand: type, goodId: goodId || '' }, parentElement: goodsList };
    }
    goodsList.onclick({ target: commandTarget('buy-good', 'food'), stopPropagation: function () {} });
    goodsList.onclick({ target: commandTarget('sell-good', 'food'), stopPropagation: function () {} });
    goodsList.onclick({ target: commandTarget('refuel'), stopPropagation: function () {} });
    var quickButton = {
      dataset: { marketQuickAction: 'buy', id: 'water' },
      parentElement: quickTradeDock,
      disabled: false,
    };
    quickTradeDock.onclick({ target: { dataset: {}, parentElement: quickButton }, stopPropagation: function () {} });

    expect(onCommand.mock.calls.map(function (call) { return call[0]; })).toEqual([
      expect.objectContaining({
        type: MarketCommand.MARKET_COMMAND.OPEN_TRADE,
        action: 'buy',
        marketMode: 'open',
        good: expect.objectContaining({ id: 'food' }),
      }),
      expect.objectContaining({
        type: MarketCommand.MARKET_COMMAND.OPEN_TRADE,
        action: 'sell',
        marketMode: 'open',
        good: expect.objectContaining({ id: 'food' }),
      }),
      { type: MarketCommand.MARKET_COMMAND.REFUEL },
      expect.objectContaining({
        type: MarketCommand.MARKET_COMMAND.OPEN_TRADE,
        action: 'buy',
        marketMode: 'open',
        good: expect.objectContaining({ id: 'water' }),
      }),
    ]);

    var prevented = false;
    goodsList.onkeydown({
      key: 'Enter',
      target: commandTarget('focus-good', 'water'),
      preventDefault: function () { prevented = true; },
    });
    expect(prevented).toBe(true);
    expect(MarketUI.getFocusedMarketGood('sol_prime', 'open')).toBe('water');
  });

  it('资本与商网页用稳定容器委托发布 typed command', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');
    var MarketCommand = await import('../js/core/MarketCommand.js');
    var state = helpers.createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      companyLevel: 6,
      credits: 200000,
      fuel: 100,
      maxFuel: 100,
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var capitalPane = createFakeElement();
    var operationsPane = createFakeElement();
    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': createFakeElement(),
      'market-capital-pane': capitalPane,
      'market-operations-pane': operationsPane,
      'market-goods-list': createFakeElement(),
      'market-goods-toolbar': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () { return createFakeElement(); },
    };

    var onCommand = vi.fn();
    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render({
      state: state,
      systemId: 'sol_prime',
      marketMode: 'open',
      galaxyId: 'milky_way',
      onCommand: onCommand,
    });

    expect(typeof capitalPane.onclick).toBe('function');
    expect(typeof operationsPane.onclick).toBe('function');
    function clickCommand(container, dataset) {
      var button = { dataset: dataset, parentElement: container, disabled: false };
      container.onclick({ target: { dataset: {}, parentElement: button }, preventDefault: function () {}, stopPropagation: function () {} });
    }
    clickCommand(capitalPane, { action: 'market-take-loan', loanOfferId: 'growth' });
    clickCommand(operationsPane, { action: 'market-build-station', systemId: 'sol_prime' });
    clickCommand(operationsPane, {
      action: 'market-batch-set-strategy',
      strategyId: 'growth',
      systemIds: 'sol_prime,nova_station',
    });

    expect(onCommand.mock.calls.map(function (call) { return call[0]; })).toEqual([
      { type: MarketCommand.MARKET_COMMAND.TAKE_LOAN, loanOfferId: 'growth' },
      { type: MarketCommand.MARKET_COMMAND.BUILD_STATION, systemId: 'sol_prime' },
      {
        type: MarketCommand.MARKET_COMMAND.BATCH_SET_STATION_STRATEGY,
        strategyId: 'growth',
        systemIds: ['sol_prime', 'nova_station'],
      },
    ]);
  });

  it('商品焦点变化只重绘交易区，不触碰资金与贸易站 DOM', async function () {
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
      credits: 200000,
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var spotPane = createFakeElement();
    var capitalPane = createFakeElement();
    var operationsPane = createFakeElement();
    var goodsList = createFakeElement();
    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': spotPane,
      'market-capital-pane': capitalPane,
      'market-operations-pane': operationsPane,
      'market-goods-list': goodsList,
      'market-goods-toolbar': createFakeElement(),
      'market-analysis-panel': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () { return createFakeElement(); },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way' });
    capitalPane.innerHTML = 'CAPITAL_SENTINEL';
    operationsPane.innerHTML = 'OPERATIONS_SENTINEL';

    var focusTarget = {
      dataset: { marketCommand: 'focus-good', goodId: 'water' },
      parentElement: goodsList,
    };
    goodsList.onclick({ target: focusTarget, stopPropagation: function () {} });

    expect(MarketUI.getFocusedMarketGood('sol_prime', 'open')).toBe('water');
    expect(goodsList.innerHTML).toContain('data-market-good="water"');
    expect(capitalPane.innerHTML).toBe('CAPITAL_SENTINEL');
    expect(operationsPane.innerHTML).toBe('OPERATIONS_SENTINEL');
  });

  it('行情榜焦点与商品卡、Context 共用同一个选择 owner', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');
    var ContextInspector = await import('../js/ui/ContextInspector.js');
    var replaceContext = vi.spyOn(ContextInspector, 'replaceContext');
    var state = helpers.createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      companyLevel: 6,
      credits: 200000,
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var focusButton = createFakeElement();
    focusButton.dataset.focusGood = 'water';
    var dashboard = createFakeElement();
    dashboard.querySelectorAll = function (selector) {
      return selector === '[data-focus-good]' ? [focusButton] : [];
    };
    var goodsList = createFakeElement();
    var capitalPane = createFakeElement();
    var operationsPane = createFakeElement();
    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': createFakeElement(),
      'market-capital-pane': capitalPane,
      'market-operations-pane': operationsPane,
      'market-goods-list': goodsList,
      'market-goods-toolbar': createFakeElement(),
      'market-quick-trade-dock': createFakeElement(),
      'market-analysis-panel': createFakeElement(),
      'market-terminal-dashboard': dashboard,
      'market-kline-panel': createFakeElement(),
      'market-kline-title': createFakeElement(),
      'market-kline-range-bar': createFakeElement(),
      'market-kline-ohlc': createFakeElement(),
      'market-kline-body': createFakeElement(),
      'market-kline-metrics': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () { return createFakeElement(); },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way' });
    capitalPane.innerHTML = 'CAPITAL_SENTINEL';
    operationsPane.innerHTML = 'OPERATIONS_SENTINEL';

    focusButton.dispatchEvent('click');

    expect(MarketUI.getFocusedMarketGood('sol_prime', 'open')).toBe('water');
    expect(goodsList.innerHTML).toMatch(/class="market-good-card[^"]*is-active[^"]*" data-market-good="water"/);
    expect(replaceContext).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'water',
      source: 'market-chart-rank',
    }));
    expect(MarketUI.getDiagnostics()).toEqual(expect.objectContaining({
      selection: expect.objectContaining({
        focusRequestCount: 1,
        focusChangeCount: 1,
        lastFocusedGoodId: 'water',
        lastSource: 'market-chart-rank',
      }),
      chart: expect.objectContaining({ focusIntentCount: 1 }),
    }));
    expect(capitalPane.innerHTML).toBe('CAPITAL_SENTINEL');
    expect(operationsPane.innerHTML).toBe('OPERATIONS_SENTINEL');
  });

  it('切换查看地点时立即发布可重渲染的商品 Context', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');
    var ContextInspector = await import('../js/ui/ContextInspector.js');
    var replaceContext = vi.spyOn(ContextInspector, 'replaceContext');
    var state = helpers.createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      viewingGalaxy: 'milky_way',
      visitedSystems: ['sol_prime', 'nova_station'],
      credits: 5000,
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': createFakeElement(),
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': createFakeElement(),
      'market-goods-list': createFakeElement(),
      'market-goods-toolbar': createFakeElement(),
      'market-analysis-panel': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () { return createFakeElement(); },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render({
      state: state,
      systemId: 'nova_station',
      marketMode: 'open',
      galaxyId: 'milky_way',
    });

    var publication = replaceContext.mock.calls.at(-1);
    expect(publication).toHaveLength(1);
    expect(publication[0]).toEqual(expect.objectContaining({
      type: 'commodity',
      workspaceId: 'trade',
      source: 'market-workspace',
    }));
  });

  it('贸易站排序只重绘经营区，不触碰交易与资金 DOM', async function () {
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
      credits: 200000,
      visitedSystems: ['sol_prime', 'nova_station'],
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);

    var spotPane = createFakeElement();
    var capitalPane = createFakeElement();
    var operationsPane = createFakeElement();
    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': spotPane,
      'market-capital-pane': capitalPane,
      'market-operations-pane': operationsPane,
      'market-goods-list': createFakeElement(),
      'market-goods-toolbar': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () { return createFakeElement(); },
    };

    var MarketUI = await import('../js/ui/MarketUI.js');
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way' });
    spotPane.innerHTML = 'SPOT_SENTINEL';
    capitalPane.innerHTML = 'CAPITAL_SENTINEL';
    operationsPane.innerHTML = 'OPERATIONS_SENTINEL';

    var sortButton = {
      dataset: {
        action: 'market-batch-set-sort',
        batchSortScope: 'investment',
        batchSortMode: 'name',
      },
      parentElement: operationsPane,
      disabled: false,
    };
    operationsPane.onclick({
      target: { dataset: {}, parentElement: sortButton },
      preventDefault: function () {},
      stopPropagation: function () {},
    });

    expect(operationsPane.innerHTML).not.toBe('OPERATIONS_SENTINEL');
    expect(operationsPane.innerHTML).toContain('market-operations-board');
    expect(spotPane.innerHTML).toBe('SPOT_SENTINEL');
    expect(capitalPane.innerHTML).toBe('CAPITAL_SENTINEL');
  });

  it('资本页展示状态概览和局部风险信号', async function () {
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
      credits: 8000,
      companyLevel: 5,
    });
    Economy.init();
    Faction.init(state);
    Finance.init(state);
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
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way', onCommand: function () {} });

    expect(capitalPane.innerHTML).toContain('market-capital-deck');
    expect(capitalPane.innerHTML).toContain('资金页集中查看现金、贷款与站点投资总额');
    expect(capitalPane.innerHTML).toContain('具体建站和追加投资统一在贸易站页处理');
    expect(capitalPane.innerHTML).toContain('可用现金');
    expect(capitalPane.innerHTML).toContain('未还贷款');
    expect(capitalPane.innerHTML).toContain('债务现金流承压');
    expect(capitalPane.innerHTML).toContain('data-tone="debt"');
    expect(capitalPane.innerHTML).toContain('market-capital-local-panel');
    expect(capitalPane.innerHTML).toContain('经营贷款指标');
    expect(capitalPane.innerHTML).not.toContain('股票市场');
    expect(capitalPane.innerHTML).not.toContain('期货市场');
    expect(capitalPane.innerHTML).not.toContain('风险保障');
  });

  it('黑市页展示开放条件风险状态和保护信号', async function () {
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
    MarketUI.render({ state: state, systemId: 'shadow_haven', marketMode: 'black', galaxyId: 'milky_way', onCommand: function () {} });

    expect(spotPane.innerHTML).toContain('market-black-risk-panel');
    expect(spotPane.innerHTML).toContain('黑市风险状态');
    expect(spotPane.innerHTML).toContain('黑市风险指标');
    expect(spotPane.innerHTML).toContain('开放条件状态');
    expect(spotPane.innerHTML).toContain('违禁货值');
    expect(spotPane.innerHTML).toContain('黑市实际经营结果');
    expect(spotPane.innerHTML).toContain('实际净结果');
    expect(spotPane.innerHTML).toContain('黑市保护已覆盖');
    expect(spotPane.innerHTML).toContain('data-tone="ready"');
  });

  it('建站候选会读取本地探索线索', async function () {
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
    expect(Exploration.explorePoi(state, 'sol_prime', resourcePoi.id).ok).toBe(true);

    var intel = MarketUI.getTradeStationCandidateIntel(state, 'sol_prime');

    expect(intel).toMatchObject({
      systemId: 'sol_prime',
      signal: 'logistics',
      label: '废弃补给站',
    });
    expect(intel.note).toContain('补给');
  });

  it('探索报告和事件链只在档案中展示', async function () {
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
    expect(Exploration.explorePoi(state, 'sol_prime', resourcePoi.id).ok).toBe(true);

    var spotPane = createFakeElement();
    var archivePane = createFakeElement();
    var elements = {
      'market-spot-pane': spotPane,
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': createFakeElement(),
      'exploration-archive-list': archivePane,
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
    var ArchiveExplorationUI = await import('../js/ui/ArchiveExplorationUI.js');
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way', onCommand: function () {} });
    ArchiveExplorationUI.render(state);

    expect(spotPane.innerHTML).toContain('market-intel-signal-panel');
    expect(spotPane.innerHTML).toContain('行情摘要');
    expect(spotPane.innerHTML).toContain('行情信息');
    expect(spotPane.innerHTML).not.toContain('archive-exploration-report-card');
    expect(spotPane.innerHTML).not.toContain('data-archive-survey-chain-id');
    expect(archivePane.innerHTML).toContain('archive-exploration-report-card');
    expect(archivePane.innerHTML).toContain('archive-exploration-chain-row--archived');
    expect(archivePane.innerHTML).toContain('data-archive-survey-chain-id="sol_prime_chain_derelict_depot"');
    expect(archivePane.innerHTML).toContain('is-followup-ready');
    expect(archivePane.innerHTML).toContain('遗忘补给库');
    expect(archivePane.innerHTML).toContain('归档旧航线');
    expect(archivePane.innerHTML).toContain('商网 / 整备');
    expect(archivePane.innerHTML).toContain('档案 → 探索');

    var intel = Exploration.getSurveyDecisionIntel(state, 'sol_prime');
    expect(Exploration.acknowledgeChainFollowup(state, 'sol_prime', intel.nextChainFollowup.chainId).ok).toBe(true);
    ArchiveExplorationUI.render(state);

    expect(archivePane.innerHTML).toContain('is-followup-acknowledged');
    expect(archivePane.innerHTML).toContain('已跟进');
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
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way', onCommand: function () {} });

    expect(operationsPane.innerHTML).toContain('匹配方式：薄利多销');
    expect(operationsPane.innerHTML).toContain('适合补给和走量，可采用薄利多销');
    expect(operationsPane.innerHTML).toContain('market-local-operations-panel');
    expect(operationsPane.innerHTML).toContain('本地经营指标');
    expect(operationsPane.innerHTML).toContain('本地经营状态');
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
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way', onCommand: function () {} });

    expect(operationsPane.innerHTML).toContain('匹配方式：薄利多销');
    expect(operationsPane.innerHTML).toContain('采用匹配方式');
    expect(operationsPane.innerHTML).toContain('data-strategy-id="expansion"');
    expect(operationsPane.innerHTML).toContain('经营方式');
  });

  it('商网总览会展示局部待处理项', async function () {
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
    MarketUI.render({ state: state, systemId: 'sol_prime', marketMode: 'open', galaxyId: 'milky_way', onCommand: function () {} });

    expect(operationsPane.innerHTML).toContain('商网待处理项');
    expect(operationsPane.innerHTML).toContain('商网列表摘要');
    expect(operationsPane.innerHTML).toContain('站点状态');
    expect(operationsPane.innerHTML).toContain('可建站地点');
    expect(operationsPane.innerHTML).toContain('补给商网');
    expect(operationsPane.innerHTML).toContain('data-action="market-build-station"');
    expect(operationsPane.innerHTML).toContain('data-system-id="nova_station"');
  });

  it('诊断快照记录独立 render port，并在会话重置时清理市场选择状态', async function () {
    vi.resetModules();
    var helpers = await import('./helpers.js');
    var Economy = await import('../js/systems/economy/Economy.js');
    var Faction = await import('../js/systems/faction/FactionSystem.js');
    var Finance = await import('../js/systems/finance/FinanceSystem.js');
    var MarketUI = await import('../js/ui/MarketUI.js');
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

    var elements = {
      'market-workspace-tabs': createFakeElement(),
      'market-spot-pane': createFakeElement(),
      'market-capital-pane': createFakeElement(),
      'market-operations-pane': createFakeElement(),
      'market-goods-list': createFakeElement(),
      'market-goods-toolbar': createFakeElement(),
      'market-spot-command-deck': createFakeElement(),
      'market-analysis-panel': createFakeElement(),
      'market-trade-overview-table': createFakeElement(),
      'market-trade-overview-thead': createFakeElement(),
      'market-trade-overview-tbody': createFakeElement(),
      'market-overview-price-status': createFakeElement(),
      'market-overview-price-buy': createFakeElement(),
      'market-overview-price-sell': createFakeElement(),
    };
    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; },
      createElement: function () { return createFakeElement(); },
    };

    var before = MarketUI.resetRuntimeState();
    MarketUI.render({
      state: state,
      systemId: 'sol_prime',
      marketMode: 'open',
      galaxyId: 'milky_way',
      onCommand: function () {},
    });
    var afterFullRender = MarketUI.getDiagnostics();
    ['market-chrome', 'market-spot', 'market-capital', 'market-operations'].forEach(function (region) {
      expect(afterFullRender.renderCounts[region]).toBe(before.renderCounts[region] + 1);
    });
    expect(afterFullRender.lastRenderedRegions).toEqual([
      'market-chrome',
      'market-spot',
      'market-capital',
      'market-operations',
    ]);
    expect(afterFullRender.chrome).toEqual({
      renderCount: 1,
      showDetailCount: 0,
      guideClearCount: 0,
      guideRevealRequestCount: 0,
      guideRevealSuccessCount: 0,
      lastSystemId: 'sol_prime',
      lastMarketMode: 'open',
      lastIsCurrentSystem: true,
      lastDetailSystemId: null,
      lastDetailMarketMode: null,
      lastGuideGoodId: null,
      lastGuideTradeAction: null,
    });
    expect(afterFullRender.overview).toEqual(expect.objectContaining({
      tableRenderCount: 1,
      controlBindCount: 1,
      modeChangeCount: 0,
      lastGalaxyId: 'milky_way',
      lastPriceMode: 'buy',
    }));
    expect(afterFullRender.overview.lastRowCount).toBeGreaterThan(0);
    expect(afterFullRender.goods).toEqual(expect.objectContaining({
      renderCount: 1,
      listDelegationBindCount: 1,
      quickTradeBindCount: 0,
      commandPublishCount: 0,
      lastFocusedGoodId: 'food',
      lastCommandType: null,
      lastSystemId: 'sol_prime',
      lastMarketMode: 'open',
    }));
    expect(afterFullRender.goods.lastRenderedGoodCount).toBeGreaterThan(0);
    expect(afterFullRender.selection).toEqual({
      syncCount: 1,
      focusRequestCount: 0,
      focusChangeCount: 0,
      contextPublishCount: 1,
      fallbackCount: 0,
      rerenderRequestCount: 0,
      lastFocusedGoodId: 'food',
      lastFocusKey: 'sol_prime:open',
      lastSource: 'market-workspace',
    });
    expect(afterFullRender.chart).toEqual(expect.objectContaining({
      renderCount: 1,
      dashboardRenderCount: 0,
      klineRenderCount: 0,
      focusIntentCount: 0,
      rangeChangeCount: 0,
      lastFocusedGoodId: 'food',
      lastRange: 14,
      lastSystemId: 'sol_prime',
      lastMarketMode: 'open',
    }));
    expect(afterFullRender.chart.lastSnapshotCount).toBeGreaterThan(0);
    expect(afterFullRender.spot).toEqual(expect.objectContaining({
      renderCount: 1,
      shellRenderCount: 1,
      subworkspaceBindCount: 1,
      overviewRenderCount: 1,
      goodsRenderCount: 1,
      chartRenderCount: 1,
      analysisRenderCount: 1,
      lastFocusedGoodId: 'food',
      lastSystemId: 'sol_prime',
      lastMarketMode: 'open',
    }));
    expect(afterFullRender.spot.lastGoodsCount).toBeGreaterThan(0);
    expect(afterFullRender.spot.lastSnapshotCount).toBeGreaterThan(0);
    expect(afterFullRender.finance).toEqual({
      capitalRenderCount: 1,
      operationsRenderCount: 1,
      capitalBindCount: 1,
      operationsBindCount: 1,
      sortChangeCount: 0,
      commandPublishCount: 0,
      commerceSnapshotResolveCount: 1,
      lastCommandType: null,
      lastSortScope: null,
      lastSortMode: null,
      lastSystemId: 'sol_prime',
      lastRegion: 'operations',
    });
    expect(afterFullRender.commodity).toEqual({
      contextRenderCount: 0,
      detailRenderCount: 0,
      rejectedRenderCount: 0,
      lastGoodId: null,
      lastSystemId: null,
      lastMarketMode: null,
      lastSurface: null,
    });

    MarketUI.renderOperations({
      state: state,
      systemId: 'sol_prime',
      marketMode: 'open',
      galaxyId: 'milky_way',
      onCommand: function () {},
    });
    var afterOperations = MarketUI.getDiagnostics();
    expect(afterOperations.renderCounts['market-operations']).toBe(afterFullRender.renderCounts['market-operations'] + 1);
    expect(afterOperations.renderCounts['market-spot']).toBe(afterFullRender.renderCounts['market-spot']);
    expect(afterOperations.lastRenderedRegions).toEqual(['market-operations']);
    expect(afterOperations.chrome).toEqual(afterFullRender.chrome);
    expect(afterOperations.overview).toEqual(afterFullRender.overview);
    expect(afterOperations.goods).toEqual(afterFullRender.goods);
    expect(afterOperations.selection).toEqual(afterFullRender.selection);
    expect(afterOperations.chart).toEqual(afterFullRender.chart);
    expect(afterOperations.spot).toEqual(afterFullRender.spot);
    expect(afterOperations.finance).toEqual(expect.objectContaining({
      capitalRenderCount: 1,
      operationsRenderCount: 2,
      capitalBindCount: 1,
      operationsBindCount: 2,
      commerceSnapshotResolveCount: 2,
      lastSystemId: 'sol_prime',
      lastRegion: 'operations',
    }));

    MarketUI.setFocusedMarketGood('sol_prime', 'open', 'water');
    MarketUI.setMarketWorkspaceFocus({ workspaceId: 'capital', subworkspaceId: 'local' });
    expect(MarketUI.getDiagnostics()).toEqual(expect.objectContaining({
      activeContext: { systemId: 'sol_prime', mode: 'open' },
      activeWorkspace: 'capital',
      focusedGoodId: 'water',
      chartRange: 14,
    }));

    var reset = MarketUI.resetRuntimeState();
    expect(reset.activeContext).toBeNull();
    expect(reset.activeWorkspace).toBe('spot');
    expect(reset.activeSubworkspace).toBe('trade');
    expect(reset.focusedGoodId).toBeNull();
    expect(reset.chartRange).toBeNull();
    expect(reset.overviewPriceMode).toBe('buy');
    expect(reset.operationsSortModes).toEqual({ investment: 'yield', upgrade: 'income', strategy: 'income' });
    expect(reset.lastRenderedRegions).toEqual([]);
    expect(reset.overview).toEqual({
      tableRenderCount: 0,
      controlBindCount: 0,
      modeChangeCount: 0,
      lastGalaxyId: null,
      lastPriceMode: null,
      lastRowCount: 0,
    });
    expect(reset.chrome).toEqual({
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
    expect(reset.goods).toEqual({
      renderCount: 0,
      listDelegationBindCount: 0,
      quickTradeBindCount: 0,
      commandPublishCount: 0,
      lastFocusedGoodId: null,
      lastCommandType: null,
      lastSystemId: null,
      lastMarketMode: null,
      lastRenderedGoodCount: 0,
    });
    expect(reset.selection).toEqual({
      syncCount: 0,
      focusRequestCount: 0,
      focusChangeCount: 0,
      contextPublishCount: 0,
      fallbackCount: 0,
      rerenderRequestCount: 0,
      lastFocusedGoodId: null,
      lastFocusKey: null,
      lastSource: null,
    });
    expect(reset.chart).toEqual({
      renderCount: 0,
      dashboardRenderCount: 0,
      klineRenderCount: 0,
      focusIntentCount: 0,
      rangeChangeCount: 0,
      lastFocusedGoodId: null,
      lastRange: null,
      lastSystemId: null,
      lastMarketMode: null,
      lastSnapshotCount: 0,
    });
    expect(reset.spot).toEqual({
      renderCount: 0,
      shellRenderCount: 0,
      subworkspaceBindCount: 0,
      overviewRenderCount: 0,
      goodsRenderCount: 0,
      chartRenderCount: 0,
      analysisRenderCount: 0,
      lastFocusedGoodId: null,
      lastSystemId: null,
      lastMarketMode: null,
      lastGoodsCount: 0,
      lastSnapshotCount: 0,
    });
    expect(reset.finance).toEqual({
      capitalRenderCount: 0,
      operationsRenderCount: 0,
      capitalBindCount: 0,
      operationsBindCount: 0,
      sortChangeCount: 0,
      commandPublishCount: 0,
      commerceSnapshotResolveCount: 0,
      lastCommandType: null,
      lastSortScope: null,
      lastSortMode: null,
      lastSystemId: null,
      lastRegion: null,
    });
    expect(reset.commodity).toEqual({
      contextRenderCount: 0,
      detailRenderCount: 0,
      rejectedRenderCount: 0,
      lastGoodId: null,
      lastSystemId: null,
      lastMarketMode: null,
      lastSurface: null,
    });
    expect(reset.resetCount).toBe(before.resetCount + 1);
    expect(MarketUI.getFocusedMarketGood('sol_prime', 'open')).toBeNull();
  });
});
