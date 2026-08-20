import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as GalaxyData from '../js/systems/galaxy/GalaxyDataLayer.js';
import * as Guidance from '../js/systems/guidance/GuidanceSystem.js';
import * as MidgameTeachingChain from '../js/systems/guidance/MidgameTeachingChain.js';
import * as Quest from '../js/systems/quest/QuestSystem.js';
import * as Research from '../js/systems/research/ResearchSystem.js';
import * as Tutorial from '../js/systems/tutorial/TutorialSystem.js';
import * as FleetUI from '../js/ui/FleetUI.js';
import { DEFAULT_ACTION_DIRTY_REGIONS } from '../js/core/ActionPresentation.js';
import * as GameManager from '../js/core/GameManager.js';
import { createTestState } from './helpers.js';

function createFakeClassList(initialValues) {
  var values = new Set(initialValues || []);
  return {
    add: function (value) { values.add(value); },
    remove: function (value) { values.delete(value); },
    contains: function (value) { return values.has(value); },
    toggle: function (value, force) {
      var shouldAdd = typeof force === 'boolean' ? force : !values.has(value);
      if (shouldAdd) values.add(value);
      else values.delete(value);
      return shouldAdd;
    },
  };
}

function createFakeElement(id, initialClasses) {
  var html = '';
  return {
    id: id || '',
    children: [],
    className: '',
    dataset: {},
    disabled: false,
    hidden: false,
    onclick: null,
    parentNode: null,
    style: {},
    textContent: '',
    value: '',
    classList: createFakeClassList(initialClasses),
    appendChild: function (child) {
      this.children.push(child);
      child.parentNode = this;
    },
    addEventListener: function () {},
    cloneNode: function () {
      return createFakeElement(id, initialClasses);
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    removeAttribute: function (name) {
      if (this.dataset && name === 'data-guide-id') delete this.dataset.guideId;
    },
    setAttribute: function () {},
    set innerHTML(value) { html = String(value || ''); },
    get innerHTML() { return html; },
  };
}

function createFakeSelectElement(initialValue) {
  var el = createFakeElement();
  var optionValues = [];
  var value = initialValue || '';

  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get: function () {
      return el._html || '';
    },
    set: function (next) {
      var html = String(next || '');
      var match;
      var optionRe = /<option[^>]*value="([^"]*)"/g;
      el._html = html;
      optionValues = [];
      while ((match = optionRe.exec(html))) {
        optionValues.push(match[1]);
      }
      if (optionValues.length === 0) {
        value = '';
      } else if (!optionValues.includes(value)) {
        value = optionValues[0];
      }
    },
  });

  Object.defineProperty(el, 'value', {
    configurable: true,
    get: function () { return value; },
    set: function (next) { value = String(next || ''); },
  });

  Object.defineProperty(el, 'options', {
    configurable: true,
    get: function () {
      return optionValues.map(function (optionValue) {
        return { value: optionValue };
      });
    },
  });

  Object.defineProperty(el, 'selectedIndex', {
    configurable: true,
    get: function () { return optionValues.indexOf(value); },
    set: function (next) {
      if (optionValues[next]) value = optionValues[next];
    },
  });

  el.querySelector = function (selector) {
    var match = /^option\[value="([^"]*)"\]$/.exec(selector);
    if (!match) return null;
    return optionValues.includes(match[1]) ? { value: match[1] } : null;
  };

  return el;
}

function createActionGuideSmokeDom() {
  var actionGuide = createFakeElement('action-guide');
  var dispatchModalBox = createFakeElement();
  var dispatchModal = createFakeElement('dispatch-modal', ['modal', 'hidden']);
  dispatchModal.querySelector = function (selector) {
    return selector === '.modal-box' ? dispatchModalBox : null;
  };
  var tradeModal = createFakeElement('trade-modal', ['modal', 'hidden']);

  var backButton = createFakeElement();
  var fleetTab = createFakeElement();
  fleetTab.dataset.tab = 'tab-fleet';
  fleetTab.dataset.tabGroup = 'trade';

  var tradePanel = createFakeElement('trade-panel');
  var fleetPane = createFakeElement('tab-fleet');
  var elements = {
    'action-guide': actionGuide,
    'fleet-list': createFakeElement('fleet-list'),
    'fleet-inline-container': createFakeElement('fleet-inline-container', ['hidden']),
    'dispatch-modal': dispatchModal,
    'trade-modal': tradeModal,
    'modal-title': createFakeElement('modal-title'),
    'modal-desc': createFakeElement('modal-desc'),
    'modal-kicker': createFakeElement('modal-kicker'),
    'modal-unit-price': createFakeElement('modal-unit-price'),
    'modal-max-qty': createFakeElement('modal-max-qty'),
    'modal-market-type': createFakeElement('modal-market-type'),
    'modal-amount': createFakeElement('modal-amount'),
    'modal-cargo-before': createFakeElement('modal-cargo-before'),
    'modal-cargo-after': createFakeElement('modal-cargo-after'),
    'modal-credit-delta': createFakeElement('modal-credit-delta'),
    'modal-total': createFakeElement('modal-total'),
    'modal-confirm': createFakeElement('modal-confirm'),
    'modal-all': createFakeElement('modal-all'),
    'trade-impact-summary': createFakeElement('trade-impact-summary'),
    'dispatch-title': createFakeElement('dispatch-title'),
    'dispatch-primary-hint': createFakeElement('dispatch-primary-hint'),
    'dispatch-buy-system': createFakeSelectElement(),
    'dispatch-sell-system': createFakeSelectElement(),
    'dispatch-good': createFakeSelectElement(),
    'dispatch-market-mode': createFakeSelectElement('open'),
    'dispatch-risk-mode': createFakeSelectElement('balanced'),
    'dispatch-max-buy-price': createFakeElement('dispatch-max-buy-price'),
    'dispatch-min-sell-price': createFakeElement('dispatch-min-sell-price'),
    'dispatch-min-profit-rate': createFakeElement('dispatch-min-profit-rate'),
    'dispatch-estimate': createFakeElement('dispatch-estimate'),
    'dispatch-confirm': createFakeElement('dispatch-confirm'),
    'dispatch-cancel': createFakeElement('dispatch-cancel'),
    'dispatch-advanced-panel': createFakeElement('dispatch-advanced-panel'),
    'info-panel': createFakeElement('info-panel'),
    'market-overlay': createFakeElement('market-overlay'),
    'trade-panel': tradePanel,
    'console-panel': createFakeElement('console-panel'),
    'tab-fleet': fleetPane,
  };

  return {
    actionGuide: actionGuide,
    backButton: backButton,
    document: {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelector: function (selector) {
        if (selector === '.tab-btn[data-tab="tab-fleet"]') return fleetTab;
        return null;
      },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [dispatchModal, tradeModal];
        if (selector === '.tab-btn[data-tab-group="trade"]') return [fleetTab];
        if (selector === '.tab-pane[data-tab-group="trade"]') return [fleetPane];
        return [];
      },
      createElement: function (tagName) {
        return tagName === 'button' ? backButton : createFakeElement();
      },
    },
    elements: elements,
  };
}

describe('GameManager action guide smoke', function () {
  var originalDocument = globalThis.document;
  var originalBabylon = globalThis.BABYLON;
  var gameManager = null;

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.BABYLON = originalBabylon;
    if (gameManager) gameManager._setStateForTest(null);
    gameManager = null;
    vi.useRealTimers();
  });

  it('当前行动买入确认不会先打开交易所终端', async function () {
    var dom = createActionGuideSmokeDom();
    globalThis.document = dom.document;
    globalThis.BABYLON = {
      Color3: function (r, g, b) {
        this.r = r;
        this.g = g;
        this.b = b;
      },
      Color4: function (r, g, b, a) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
      },
    };
    gameManager = GameManager;

    var state = createTestState({
      credits: 10000,
      fuel: 100,
      maxFuel: 100,
      maxCargo: 20,
      cargo: {},
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    Economy.init();
    Fleet.init(state);
    Faction.init(state);
    Research.init(state);
    Quest.init(state);
    GalaxyData.init(state);
    Tutorial.init(state);
    Tutorial.skip();
    gameManager._setStateForTest(state);

    await gameManager._handleActionGuideActionForTest({
      id: 'buy-low-price-good',
      actionType: 'trade.buy',
      actionLabel: '确认买入',
      title: '买入「食物」',
      reason: '测试直接打开确认单',
      payload: {
        goodId: 'food',
        marketType: 'open',
        tradeAction: 'buy',
        questName: '初次交易',
      },
      surface: 'market',
    });

    expect(dom.elements['market-overlay'].classList.contains('is-active')).toBe(false);
    expect(dom.elements['trade-modal'].classList.contains('hidden')).toBe(false);
    expect(dom.elements['modal-title'].textContent).toContain('购买');
    expect(dom.elements['modal-title'].textContent).toContain('食物');

    dom.elements['modal-confirm'].onclick();
    gameManager._handleTradeConfirmForTest('buy', 'food', 1, 'open');

    expect(dom.elements['market-overlay'].classList.contains('is-active')).toBe(false);
    expect(dom.elements['trade-modal'].classList.contains('hidden')).toBe(true);
    expect(state.cargo.food).toBeGreaterThan(0);
  });

  it('亏损卖出不会推进累计利润任务', async function () {
    var dom = createActionGuideSmokeDom();
    globalThis.document = dom.document;
    globalThis.BABYLON = {
      Color3: function (r, g, b) {
        this.r = r;
        this.g = g;
        this.b = b;
      },
      Color4: function (r, g, b, a) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
      },
    };
    gameManager = GameManager;

    var state = createTestState({
      credits: 0,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    Economy.init();
    Fleet.init(state);
    Faction.init(state);
    Research.init(state);
    Quest.init(state);
    GalaxyData.init(state);
    Tutorial.init(state);
    Tutorial.skip();
    state.cargo.food = 1;
    state.cargoCost.food = 100000;
    state.quests = [{
      id: 'profit_regression_test',
      name: '利润回归测试',
      description: '只累计真实利润',
      type: 'trade',
      phase: 1,
      timeLimit: 0,
      startDay: state.day,
      objectives: [{ type: 'earn_profit', amount: 500, current: 0 }],
      rewards: { credits: 0, exp: 0, reputation: 0 },
    }];
    gameManager._setStateForTest(state);

    gameManager._handleTradeConfirmForTest('sell', 'food', 1, 'open');

    expect(state.quests[0].objectives[0].current).toBe(0);
    expect(state.totalProfit).toBeLessThan(0);
  });

  it('通过管理器行动回调载入派遣草案后会展示完成态并避免重复推荐', async function () {
    vi.useFakeTimers();
    var dom = createActionGuideSmokeDom();
    globalThis.document = dom.document;
    globalThis.BABYLON = {
      Color3: function (r, g, b) {
        this.r = r;
        this.g = g;
        this.b = b;
      },
      Color4: function (r, g, b, a) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
      },
    };
    gameManager = GameManager;

    var state = createTestState({
      quests: [],
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      credits: 50000,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      playerLevel: 5,
    });
    Economy.init();
    Fleet.init(state);
    Faction.init(state);
    Research.init(state);
    Quest.init(state);
    GalaxyData.init(state);
    Tutorial.init(state);
    Tutorial.skip();
    gameManager._setStateForTest(state);

    var recommendation = {
      buySystemId: 'sol_prime',
      buySystemName: '太阳主星',
      sellSystemId: 'alpha_centauri',
      sellSystemName: '半人马港',
      goodId: 'food',
      goodName: '食物',
      strategySummary: '稳态商运：匹配公开市场',
      recommendedTradePolicy: { riskMode: 'balanced', marketMode: 'open' },
    };

    gameManager._handleActionGuideActionForTest({
      id: 'prefill-profitable-dispatch',
      actionType: 'fleet.dispatch.prefill',
      actionLabel: '带入机库',
      title: '载入派遣草案',
      reason: '测试推荐路线',
      payload: {
        sourceLabel: '跑商路线建议',
        recommendation: recommendation,
      },
      surface: 'fleet',
    });

    await vi.waitFor(function () {
      expect(FleetUI.getActiveDispatchModalContext()).not.toBe(null);
    });

    var dispatchContext = FleetUI.getActiveDispatchModalContext();
    expect(dispatchContext).toMatchObject({
      shipIndex: 0,
      buySystemId: 'sol_prime',
      sellSystemId: 'alpha_centauri',
      goodId: 'food',
    });
    expect(dom.elements['dispatch-buy-system'].value).toBe('sol_prime');
    expect(dom.elements['dispatch-sell-system'].value).toBe('alpha_centauri');
    expect(dom.elements['dispatch-good'].value).toBe('food');
    expect(dom.actionGuide.classList.contains('is-complete')).toBe(true);
    expect(dom.actionGuide.innerHTML).toContain('已载入跑商路线');
    expect(dom.actionGuide.innerHTML).toContain('确认“开始跑商”后执行路线');

    expect(Guidance.getCurrentSuggestion(state, {
      dispatchRouteRecommendation: recommendation,
      dispatchModalContext: dispatchContext,
    })).toBe(null);

    dom.backButton.onclick({ preventDefault: function () {} });
    expect(FleetUI.getActiveDispatchModalContext()).toBe(null);
  });

  it('点击专题步骤不会完成，只有真实派遣确认才推进教学链', async function () {
    var dom = createActionGuideSmokeDom();
    globalThis.document = dom.document;
    gameManager = GameManager;

    var state = createTestState({
      completedQuests: ['starter_first_trade', 'starter_visit_2'],
      credits: 50000,
      playerLevel: 5,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
    });
    Economy.init();
    Fleet.init(state);
    Faction.init(state);
    Research.init(state);
    Quest.init(state);
    MidgameTeachingChain.init(state);
    expect(MidgameTeachingChain.startChain(state, 'dispatch-ops')).toBe(true);
    gameManager._setStateForTest(state);

    var recommendation = {
      buySystemId: 'sol_prime',
      buySystemName: '太阳主星',
      sellSystemId: 'alpha_centauri',
      sellSystemName: '半人马港',
      goodId: 'food',
      goodName: '食物',
      recommendedTradePolicy: { riskMode: 'balanced', marketMode: 'open' },
    };
    await gameManager._handleActionGuideActionForTest({
      id: 'prefill-profitable-dispatch',
      actionType: 'fleet.dispatch.prefill',
      payload: { recommendation: recommendation },
    });

    expect(state.midgameChains['dispatch-ops'].completedSteps).toEqual([]);

    var result = gameManager._handleAssignRouteForTest(
      0,
      recommendation.buySystemId,
      'nova_station',
      recommendation.goodId,
      { riskMode: 'balanced', marketMode: 'open' }
    );

    expect(result.ok).toBe(true);
    expect(gameManager._getUiDiagnosticsForTest().lastInvalidationRegions).toEqual(
      DEFAULT_ACTION_DIRTY_REGIONS
    );
    expect(gameManager._getUiDiagnosticsForTest().lastInvalidationRegions).not.toContain('all');
    expect(gameManager._getUiDiagnosticsForTest().lastInvalidationRegions).not.toContain('save');
    expect(state.midgameChains['dispatch-ops'].completedSteps).toEqual(['prefill-profitable-dispatch']);
    expect(state.midgameChains['dispatch-ops'].completed).toBe(false);
    expect(gameManager._getGameClockSnapshotForTest().recurringTasks).toEqual([
      expect.objectContaining({ id: 'active-dispatch' }),
    ]);
    gameManager._stopActiveDispatchForTest();
    expect(gameManager._getGameClockSnapshotForTest().recurringTasks).toEqual([]);
  }, 20000);
});
