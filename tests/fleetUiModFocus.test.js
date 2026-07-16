import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import * as Crew from '../js/systems/fleet/CrewSystem.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as FleetUI from '../js/ui/FleetUI.js';
import { createTestState } from './helpers.js';

function createFakeClassList(initialValues) {
  var values = new Set(initialValues || []);
  return {
    add: function (value) { values.add(value); },
    remove: function (value) { values.delete(value); },
    contains: function (value) { return values.has(value); },
    toggle: function (value, force) {
      if (force === true) {
        values.add(value);
        return true;
      }
      if (force === false) {
        values.delete(value);
        return false;
      }
      if (values.has(value)) {
        values.delete(value);
        return false;
      }
      values.add(value);
      return true;
    },
  };
}

function createFakeElement(initialClasses) {
  var html = '';
  var attributes = Object.create(null);
  var listeners = Object.create(null);
  var element = {
    children: [],
    className: '',
    dataset: {},
    style: {},
    textContent: '',
    onclick: null,
    parentNode: null,
    isConnected: true,
    disabled: false,
    inert: false,
    focused: false,
    classList: createFakeClassList(initialClasses),
    appendChild: function (child) {
      if (child.parentNode && Array.isArray(child.parentNode.children)) {
        child.parentNode.children = child.parentNode.children.filter(function (item) { return item !== child; });
      }
      this.children.push(child);
      child.parentNode = this;
    },
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: function (type, handler) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(function (item) { return item !== handler; });
    },
    dispatchEvent: function (event) {
      (listeners[event.type] || []).slice().forEach(function (handler) { handler(event); });
    },
    focus: function () { this.focused = true; },
    closest: function () { return null; },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute: function (name) { delete attributes[name]; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    set innerHTML(value) {
      html = String(value || '');
      if (!html) this.children = [];
    },
    get innerHTML() { return html; },
  };
  return element;
}

function createBodyElement(focusTarget) {
  var body = createFakeElement();
  body.querySelector = function (selector) {
    if (selector === '[data-focus-mod="item"]' && body.innerHTML.indexOf('data-focus-mod="item"') >= 0) {
      return focusTarget;
    }
    if (selector === '[data-focus-mod="recommendation"]' && body.innerHTML.indexOf('data-focus-mod="recommendation"') >= 0) {
      return focusTarget;
    }
    return null;
  };
  return body;
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

function createCrewOffer(state, systemId, overrides) {
  var market = Crew.getCrewMarket(state, systemId);
  return Object.assign({}, market.offers[0], overrides);
}

describe('FleetUI.openModModal guidance focus', function () {
  var originalDocument = globalThis.document;

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('机库主视图会渲染局部态势矩阵和焦点卡', function () {
    var elements = {
      'fleet-list': createFakeElement(),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
    };

    var state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleet[0].maintenance = 62;

    var noop = function () {};
    FleetUI.render(
      state,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
      noop,
    );

    expect(elements['fleet-list'].innerHTML).toContain('class="hangar-triage-panel" aria-label="机库态势与局部信号"');
    expect(elements['fleet-list'].innerHTML).toContain('class="hangar-triage-grid" role="list" aria-label="机库态势矩阵"');
    expect(elements['fleet-list'].innerHTML).toContain('class="hangar-focus-panel" aria-label="机库局部信号"');
    expect(elements['fleet-list'].innerHTML).toContain('局部信号');
    expect(elements['fleet-list'].innerHTML).toContain('维护风险');
  });

  it('购船页会渲染采购态势、局部焦点和船卡信号条', function () {
    var elements = {
      'shop-list': createFakeElement(),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
    };

    var state = createTestState({ credits: 5000 });
    Fleet.init(state);
    state.fleetSlots = 2;

    FleetUI.renderShop(state, function () {});

    expect(elements['shop-list'].innerHTML).toContain('class="hangar-shop-brief" aria-label="购船决策摘要"');
    expect(elements['shop-list'].innerHTML).toContain('class="hangar-shop-brief-grid" role="list" aria-label="采购态势矩阵"');
    expect(elements['shop-list'].innerHTML).toContain('class="hangar-shop-focus" aria-label="购船局部信号"');
    expect(elements['shop-list'].innerHTML).toContain('采购焦点');
    expect(elements['shop-list'].innerHTML).toContain('fleet-shop-signal-strip');
    expect(elements['shop-list'].innerHTML).toContain('fleet-shop-card--focus');
  });

  it('会高亮推荐组件，并通过 Escape 恢复机库入口焦点', async function () {
    var scrolled = false;
    var focusTarget = createFakeElement();
    focusTarget.scrollIntoView = function () {
      scrolled = true;
    };

    var modalBox = createFakeElement();
    var modal = createFakeElement();
    modal.querySelector = function (selector) {
      return selector === '.modal-box' ? modalBox : null;
    };

    var body = createBodyElement(focusTarget);
    var backButton = createFakeElement();
    var opener = createFakeElement();
    var documentListeners = Object.create(null);
    var inlineViewport = {
      scrollTop: 318,
      scrollCalls: [],
      scrollTo: function (options) {
        this.scrollTop = options.top;
        this.scrollCalls.push(options.top);
      },
    };
    var elements = {
      'fleet-list': createFakeElement(),
      'fleet-inline-container': createFakeElement(['hidden']),
      'mod-modal': modal,
      'mod-modal-title': createFakeElement(),
      'mod-modal-body': body,
      'mod-modal-close': createFakeElement(),
    };
    elements['fleet-inline-container'].closest = function (selector) {
      return selector === '.secondary-terminal-content' ? inlineViewport : null;
    };

    globalThis.document = {
      activeElement: opener,
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelector: function (selector) {
        return selector === '.fleet-open-mod-btn[data-ship-index="0"]' ? opener : null;
      },
      createElement: function (tagName) {
        return tagName === 'button' ? backButton : createFakeElement();
      },
      addEventListener: function (type, handler) {
        documentListeners[type] = handler;
      },
      removeEventListener: function (type, handler) {
        if (documentListeners[type] === handler) delete documentListeners[type];
      },
    };

    var state = createTestState({ credits: 50000 });
    Fleet.init(state);
    Fleet.getActiveShip(state).maintenance = 42;

    FleetUI.openModModal(
      state,
      0,
      function () {},
      function () {},
      function () {},
      function () {},
      function () {},
      { focusModId: 'mod_service_bay' },
    );
    await Promise.resolve();

    expect(body.innerHTML).toContain('mod-modal-recommendation--focus');
    expect(body.innerHTML).toContain('mod-modal-item--focus');
    expect(body.innerHTML).toContain('data-mod-id="mod_service_bay"');
    expect(body.innerHTML).toContain('class="mod-modal-overview" role="list" aria-label="飞船改装摘要"');
    expect(body.innerHTML).toContain('class="mod-modal-signal-panel" aria-label="改装局部态势"');
    expect(body.innerHTML).toContain('class="mod-modal-signal-grid" role="list" aria-label="改装决策指标"');
    expect(body.innerHTML).toContain('class="mod-modal-signal-focus" role="status" aria-label="改装局部信号"');
    expect(body.innerHTML).toContain('<h4 class="mod-modal-section-title">结构模块</h4>');
    expect(body.innerHTML).toContain('保养优先');
    expect(body.innerHTML).toContain('role="progressbar"');
    expect(body.innerHTML).toContain('role="listitem"');
    expect(body.innerHTML).toContain('type="button"');
    expect(FleetUI.getActiveModModalContext()).toMatchObject({
      shipIndex: 0,
      focusModId: 'mod_service_bay',
      recommendedModId: 'mod_service_bay',
    });
    expect(focusTarget.classList.contains('mod-modal-guidance-focus')).toBe(true);
    expect(focusTarget.getAttribute('tabindex')).toBe('-1');
    expect(focusTarget.focused).toBe(true);
    expect(scrolled).toBe(true);
    expect(elements['fleet-list'].getAttribute('aria-hidden')).toBe('true');
    expect(elements['fleet-list'].inert).toBe(true);
    expect(elements['fleet-inline-container'].getAttribute('role')).toBe('region');
    expect(elements['fleet-inline-container'].getAttribute('aria-labelledby')).toBe('mod-modal-title');
    expect(elements['fleet-inline-container'].getAttribute('aria-describedby')).toBe('mod-modal-desc mod-modal-body');
    expect(backButton.textContent).toBe('← 返回机库列表');
    expect(typeof documentListeners.keydown).toBe('function');
    expect(inlineViewport.scrollTop).toBe(0);
    expect(inlineViewport.scrollCalls).toContain(0);

    var prevented = false;
    documentListeners.keydown({
      key: 'Escape',
      preventDefault: function () { prevented = true; },
      stopPropagation: function () {},
    });
    await Promise.resolve();

    expect(prevented).toBe(true);
    expect(FleetUI.getActiveModModalContext()).toBe(null);
    expect(elements['fleet-list'].getAttribute('aria-hidden')).toBe('false');
    expect(elements['fleet-list'].inert).toBe(false);
    expect(elements['fleet-inline-container'].getAttribute('aria-hidden')).toBe('true');
    expect(elements['fleet-inline-container'].inert).toBe(true);
    expect(inlineViewport.scrollTop).toBe(318);
    expect(opener.focused).toBe(true);
  });

  it('二级弹窗壳层包含描述、滚动容器和摘要指标样式', function () {
    var html = readFileSync('index.html', 'utf8');
    var sharedCss = readFileSync('css/interstellar-trader.css', 'utf8');
    var hangarCss = readFileSync('css/hangar-terminal.css', 'utf8');
    var css = sharedCss + '\n' + hangarCss;
    var fleetCss = readFileSync('css/fleet.css', 'utf8');
    var surfacesCss = readFileSync('css/surfaces.css', 'utf8');
    var source = readFileSync('js/ui/FleetUI.js', 'utf8');

    expect(html).toContain('id="fleet-inline-container" class="fleet-inline-container hidden" aria-hidden="true" inert');
    expect(surfacesCss).toMatch(/#fleet-list\.hidden,[\s\S]*?#fleet-inline-container\.hidden\s*\{\s*display:\s*none\s*!important/);
    expect(html).toContain('aria-describedby="mod-modal-desc mod-modal-body"');
    expect(html).toContain('id="mod-modal-desc" class="mod-modal-desc"');
    expect(html).toContain('aria-describedby="crew-modal-desc crew-modal-summary"');
    expect(html).toContain('class="crew-modal-scroll stack-modal-scroll"');
    expect(html).toContain('id="crew-assigned-status" class="crew-modal-section-meta"');
    expect(html).toContain('id="crew-reserve-status" class="crew-modal-section-meta"');
    expect(html).toContain('id="crew-market-status" class="crew-modal-section-meta"');
    expect(html).toContain('aria-describedby="dispatch-modal-desc dispatch-route-summary dispatch-primary-hint dispatch-policy-status"');
    expect(html).toContain('id="dispatch-policy-status" class="dispatch-policy-status" role="status"');
    expect(html).toContain('id="dispatch-route-summary" class="dispatch-route-summary" role="list" aria-label="当前派遣路线摘要"');
    expect(css).toContain('Hangar detail modal shell refinements');
    expect(css).toContain('.crew-modal-summary-stat');
    expect(css).toContain('.crew-modal-roster-alert');
    expect(css).toContain('.crew-modal-status-chip');
    expect(css).toContain('.mod-modal-desc');
    expect(css).toContain('.mod-modal-signal-panel');
    expect(css).toContain('.mod-modal-signal-grid');
    expect(css).toContain('.mod-modal-signal-focus[data-tone="repair"]');
    expect(css).toContain('.crew-modal-scroll');
    expect(css).toContain('.dispatch-route-summary-item--policy');
    expect(css).toContain('.dispatch-modal-box .dispatch-route-summary');
    expect(css).toContain('.dispatch-modal-box .dispatch-policy-status--error');
    expect(css).toContain('.dispatch-modal-box .dispatch-select[aria-invalid="true"]');
    expect(css).toContain('@media (max-width: 360px)');
    expect(sharedCss).not.toContain('Hangar detail modal shell refinements');
    expect(hangarCss).toContain('Hangar detail modal shell refinements');
    expect(fleetCss).toContain('.inline-portal-back-btn:focus-visible');
    expect(fleetCss).toContain('padding: 0 !important;');
    expect(source).toContain("modalBox.querySelectorAll('.crew-dismiss-btn')");
    expect(source).toContain("title: '解雇「' + (crewMember ? crewMember.name : '该船员') + '」？'");
    expect(source).toContain('<strong>编制信号</strong>');
  });

  it('船员内联界面会渲染分区信号并从实际内容根节点绑定操作', async function () {
    var modalBox = createFakeElement();
    var modal = createFakeElement(['modal', 'hidden']);
    modal.id = 'crew-modal';
    modal.querySelector = function (selector) {
      return selector === '.modal-box' ? modalBox : null;
    };

    var backButton = createFakeElement();
    var dismissButton = createFakeElement();
    dismissButton.dataset.crewId = 'crew_reserve';
    modalBox.querySelectorAll = function (selector) {
      return selector === '.crew-dismiss-btn' ? [dismissButton] : [];
    };
    modalBox.querySelector = function () { return null; };
    modal.querySelectorAll = function () {
      throw new Error('船员操作不应从已移空的 modal 节点查询');
    };
    var confirmBox = createFakeElement();
    var confirmModal = createFakeElement(['modal', 'hidden']);
    confirmModal.id = 'action-confirm-modal';
    confirmModal.querySelector = function (selector) {
      return selector === '.modal-box, [tabindex="-1"]' ? confirmBox : null;
    };
    var elements = {
      'fleet-list': createFakeElement(),
      'fleet-inline-container': createFakeElement(['hidden']),
      'crew-modal': modal,
      'crew-modal-title': createFakeElement(),
      'crew-modal-summary': createFakeElement(),
      'crew-assigned-status': createFakeElement(),
      'crew-reserve-status': createFakeElement(),
      'crew-market-status': createFakeElement(),
      'crew-assigned-list': createFakeElement(),
      'crew-reserve-list': createFakeElement(),
      'crew-market-list': createFakeElement(),
      'crew-modal-close': createFakeElement(),
      'action-confirm-modal': confirmModal,
      'action-confirm-title': createFakeElement(),
      'action-confirm-message': createFakeElement(),
      'action-confirm-impact': createFakeElement(),
      'action-confirm-kicker': createFakeElement(),
      'action-confirm-accept': createFakeElement(),
      'action-confirm-cancel': createFakeElement(),
    };

    globalThis.document = {
      activeElement: dismissButton,
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [modal, confirmModal] : [];
      },
      createElement: function (tagName) {
        return tagName === 'button' ? backButton : createFakeElement();
      },
      addEventListener: function () {},
    };

    var state = createTestState({ credits: 12000, currentSystem: 'sol_prime' });
    Fleet.init(state);
    state.fleet[0].crewCapacity = 2;

    state.crewMarket.sol_prime = {
      systemId: 'sol_prime',
      refreshDay: 1,
      nextRefreshDay: 4,
      themeLabel: '综合港',
      offers: [
        createCrewOffer(state, 'sol_prime', {
          id: 'offer_assigned',
          name: '测试领航',
          role: 'pilot',
          roleName: '领航员',
          specialtyId: 'route_savant',
          specialtyName: '主航路算师',
          branchLabel: '航路派',
          hireCost: 420,
          wage: 95,
        }),
        createCrewOffer(state, 'sol_prime', {
          id: 'offer_reserve',
          name: '测试货运',
          role: 'quartermaster',
          roleName: '货运主管',
          specialtyId: 'container_architect',
          specialtyName: '集装架构师',
          branchLabel: '仓储派',
          hireCost: 460,
          wage: 110,
        }),
        createCrewOffer(state, 'sol_prime', {
          id: 'offer_market',
          name: '测试市场',
          role: 'broker',
          roleName: '交易掮客',
          specialtyId: 'market_maker',
          specialtyName: '行情做市人',
          branchLabel: '做市派',
          hireCost: 500,
          wage: 120,
        }),
      ],
    };

    Crew.recruitCrew(state, 'offer_assigned', 'sol_prime');
    Crew.recruitCrew(state, 'offer_reserve', 'sol_prime');
    Crew.assignCrewToShip(state, state.crewRoster[0].id, 0);
    dismissButton.dataset.crewId = state.crewRoster[1].id;

    var dismissCount = 0;
    FleetUI.openCrewModal(
      state,
      0,
      function () {},
      function () {},
      function () {},
      function () { dismissCount += 1; },
      function () {},
      function () {},
      function () {},
    );

    expect(modal.dataset.crewSeatState).toBe('ready');
    expect(modal.dataset.crewReserveState).toBe('ready');
    expect(modal.dataset.crewMarketState).toBe('ready');
    expect(modalBox.dataset.crewSeatState).toBe('ready');
    expect(elements['crew-modal-summary'].innerHTML).toContain('crew-modal-roster-alert');
    expect(elements['crew-modal-summary'].innerHTML).toContain('编制信号');
    expect(elements['crew-modal-summary'].innerHTML).toContain('还有 1 个空席位');
    expect(elements['crew-assigned-status'].innerHTML).toContain('席位');
    expect(elements['crew-assigned-status'].innerHTML).toContain('1/2');
    expect(elements['crew-reserve-status'].innerHTML).toContain('可分配');
    expect(elements['crew-market-status'].innerHTML).toContain('候选');
    expect(elements['crew-market-status'].innerHTML).toContain('1 人');
    expect(elements['crew-assigned-list'].innerHTML).toContain('测试领航');
    expect(elements['crew-reserve-list'].innerHTML).toContain('测试货运');
    expect(elements['crew-market-list'].innerHTML).toContain('测试市场');
    expect(typeof dismissButton.onclick).toBe('function');

    dismissButton.onclick();
    expect(dismissCount).toBe(0);
    expect(confirmModal.classList.contains('hidden')).toBe(false);
    expect(elements['action-confirm-title'].textContent).toContain('测试货运');
    expect(elements['action-confirm-message'].textContent).toContain('等级和经验无法恢复');
    elements['action-confirm-accept'].dispatchEvent({ type: 'click' });
    expect(dismissCount).toBe(1);
    expect(confirmModal.classList.contains('hidden')).toBe(true);

    elements['crew-modal-close'].onclick();
    await Promise.resolve();
  });

  it('派遣弹窗会暴露草案路线并在关闭后清理上下文', function () {
    var modalBox = createFakeElement();
    var modal = createFakeElement(['modal']);
    modal.id = 'dispatch-modal';
    modal.querySelector = function (selector) {
      return selector === '.modal-box' ? modalBox : null;
    };

    var backButton = createFakeElement();
    var elements = {
      'fleet-list': createFakeElement(),
      'fleet-inline-container': createFakeElement(['hidden']),
      'dispatch-modal': modal,
      'dispatch-title': createFakeElement(),
      'dispatch-primary-hint': createFakeElement(),
      'dispatch-route-summary': createFakeElement(),
      'dispatch-summary-buy': createFakeElement(),
      'dispatch-summary-sell': createFakeElement(),
      'dispatch-summary-good': createFakeElement(),
      'dispatch-summary-policy': createFakeElement(),
      'dispatch-buy-system': createFakeSelectElement(),
      'dispatch-sell-system': createFakeSelectElement(),
      'dispatch-good': createFakeSelectElement(),
      'dispatch-market-mode': createFakeSelectElement('open'),
      'dispatch-risk-mode': createFakeSelectElement('balanced'),
      'dispatch-max-buy-price': createFakeElement(),
      'dispatch-min-sell-price': createFakeElement(),
      'dispatch-min-profit-rate': createFakeElement(),
      'dispatch-policy-status': createFakeElement(),
      'dispatch-estimate': createFakeElement(),
      'dispatch-confirm': createFakeElement(),
      'dispatch-cancel': createFakeElement(),
      'dispatch-advanced-panel': createFakeElement(),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [modal] : [];
      },
      createElement: function (tagName) {
        return tagName === 'button' ? backButton : createFakeElement();
      },
    };

    var state = createTestState({
      credits: 50000,
      fuel: 100,
      maxFuel: 100,
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      playerLevel: 5,
    });
    Fleet.init(state);

    var assignCount = 0;
    FleetUI.openDispatchModal(
      state,
      0,
      function () { assignCount += 1; },
      function () {},
      {
        buySystemId: 'sol_prime',
        sellSystemId: 'alpha_centauri',
        goodId: 'food',
        recommendation: {
          buySystemId: 'sol_prime',
          buySystemName: '太阳主星',
          sellSystemId: 'alpha_centauri',
          sellSystemName: '半人马港',
          goodId: 'food',
          goodName: '食物',
          recommendedTradePolicy: { riskMode: 'balanced', marketMode: 'open' },
        },
      },
    );

    expect(FleetUI.getActiveDispatchModalContext()).toMatchObject({
      shipIndex: 0,
      buySystemId: 'sol_prime',
      sellSystemId: 'alpha_centauri',
      goodId: 'food',
      tradePolicy: { riskMode: 'balanced', marketMode: 'open' },
    });
    expect(elements['dispatch-buy-system'].value).toBe('sol_prime');
    expect(elements['dispatch-sell-system'].value).toBe('alpha_centauri');
    expect(elements['dispatch-good'].value).toBe('food');
    expect(elements['dispatch-route-summary'].dataset.routeState).toBe('ready');
    expect(elements['dispatch-summary-buy'].textContent).toBe('太阳主星');
    expect(elements['dispatch-summary-sell'].textContent).toBe('alpha_centauri');
    expect(elements['dispatch-summary-good'].textContent).toBe('🌾 食物');
    expect(elements['dispatch-summary-policy'].textContent).toBe('公开市场 · 平衡');
    expect(modal.dataset.dispatchState).toBe('ready');
    expect(modal.dataset.dispatchPolicyState).toBe('neutral');
    expect(elements['dispatch-estimate'].innerHTML).toContain('role="list" aria-label="派遣估算指标"');
    expect(elements['dispatch-estimate'].innerHTML).toContain('dispatch-estimate-metric');
    expect(elements['dispatch-estimate'].innerHTML).toContain('role="list" aria-label="路线风险明细"');

    elements['dispatch-max-buy-price'].value = '-1';
    elements['dispatch-max-buy-price'].oninput();
    expect(elements['dispatch-max-buy-price'].getAttribute('aria-invalid')).toBe('true');
    expect(elements['dispatch-policy-status'].textContent).toContain('最高买入价需填写 0 或更大的数字');
    expect(elements['dispatch-confirm'].disabled).toBe(true);
    expect(modal.dataset.dispatchState).toBe('invalid');
    expect(modal.dataset.dispatchPolicyState).toBe('invalid');
    elements['dispatch-confirm'].onclick();
    expect(assignCount).toBe(0);

    elements['dispatch-max-buy-price'].value = '';
    elements['dispatch-max-buy-price'].oninput();
    expect(elements['dispatch-max-buy-price'].getAttribute('aria-invalid')).toBe(null);
    expect(elements['dispatch-confirm'].disabled).toBe(false);
    expect(modal.dataset.dispatchPolicyState).toBe('neutral');

    backButton.onclick({ preventDefault: function () {} });
    expect(FleetUI.getActiveDispatchModalContext()).toBe(null);
  });
});
