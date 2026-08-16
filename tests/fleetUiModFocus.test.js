import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import * as EventBus from '../js/core/EventBus.js';
import * as Crew from '../js/systems/fleet/CrewSystem.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as FleetUI from '../js/ui/FleetUI.js';
import * as ActionConfirmUI from '../js/ui/ActionConfirmUI.js';
import { FLEET_COMMAND } from '../js/core/FleetCommand.js';
import { FLEET_CREW_INTENT } from '../js/ui/FleetCrewPresenter.js';
import { FLEET_HANGAR_INTENT } from '../js/ui/FleetHangarPresenter.js';
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
    EventBus.emit('hangar:reset');
    globalThis.document = originalDocument;
  });

  it('机库主视图会渲染运行摘要、舰船选择器和单舰作业区', function () {
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

    FleetUI.render({ state: state, onCommand: function () {} });

    expect(elements['fleet-list'].innerHTML).toContain('class="hangar-operations-deck" aria-labelledby="hangar-operations-title"');
    expect(elements['fleet-list'].innerHTML).toContain('class="hangar-operations-grid" role="list" aria-label="机库运行摘要"');
    expect(elements['fleet-list'].innerHTML).toContain('class="hangar-fleet-selector" aria-labelledby="hangar-fleet-selector-title"');
    expect(elements['fleet-list'].innerHTML).toContain('role="listitem" class="hangar-ship-select is-selected is-active has-risk"');
    expect(elements['fleet-list'].innerHTML).toContain('class="hangar-ship-workspace" aria-labelledby="hangar-workspace-title"');
    expect(elements['fleet-list'].innerHTML).toContain('class="hangar-support-panel"');
    expect(elements['fleet-list'].innerHTML).toContain('查看不会改变当前操控舰');
    expect(elements['fleet-list'].innerHTML).toContain('优先维护');
  });

  it('查看其他舰船不会切换操控舰，并会提供单独的切换动作', async function () {
    var inspectButton = createFakeElement();
    inspectButton.dataset.hangarIntent = FLEET_HANGAR_INTENT.INSPECT_SHIP;
    inspectButton.dataset.shipIndex = '1';
    inspectButton.closest = function (selector) {
      return selector === '[data-hangar-intent]' ? inspectButton : null;
    };
    var selectedButton = createFakeElement();
    var container = createFakeElement();
    container.querySelector = function (selector) {
      return selector === '.hangar-ship-select[data-ship-index="1"]' ? selectedButton : null;
    };

    globalThis.document = {
      getElementById: function (id) {
        return id === 'fleet-list' ? container : null;
      },
    };

    var state = createTestState({ credits: 50000 });
    Fleet.init(state);
    var secondShip = JSON.parse(JSON.stringify(state.fleet[0]));
    secondShip.name = '远航测试舰';
    secondShip.cargo = {};
    secondShip.route = null;
    state.fleet.push(secondShip);
    state.fleetSlots = 2;

    var switchCount = 0;
    FleetUI.render({
      state: state,
      onCommand: function (command) {
        if (command.type === FLEET_COMMAND.SWITCH_SHIP) switchCount += 1;
      },
    });

    container.onclick({ target: inspectButton, preventDefault: function () {} });
    await Promise.resolve();

    expect(state.activeShipIndex).toBe(0);
    expect(switchCount).toBe(0);
    expect(container.innerHTML).toContain('class="hangar-ship-select is-selected');
    expect(container.innerHTML).toContain('远航测试舰');
    expect(container.innerHTML).toContain('data-index="1"');
    expect(container.innerHTML).toContain('设为操控舰');
    expect(selectedButton.focused).toBe(true);
  });

  it('主机库以单一容器委托发布席位、切船与召回 command', function () {
    var container = createFakeElement();
    globalThis.document = {
      getElementById: function (id) {
        return id === 'fleet-list' ? container : null;
      },
    };

    var state = createTestState({ credits: 50000 });
    Fleet.init(state);
    var commands = [];
    FleetUI.render({
      state: state,
      onCommand: function (command) { commands.push(command); },
    });

    function clickIntent(type, shipIndex) {
      var button = createFakeElement();
      button.dataset.hangarIntent = type;
      if (shipIndex !== undefined) button.dataset.shipIndex = String(shipIndex);
      button.closest = function (selector) {
        return selector === '[data-hangar-intent]' ? button : null;
      };
      container.onclick({ target: button, preventDefault: function () {} });
    }

    clickIntent(FLEET_HANGAR_INTENT.BUY_SLOT);
    clickIntent(FLEET_HANGAR_INTENT.SWITCH_SHIP, 0);
    clickIntent(FLEET_HANGAR_INTENT.CANCEL_ROUTE, 0);

    expect(commands).toEqual([
      { type: FLEET_COMMAND.BUY_SLOT },
      { type: FLEET_COMMAND.SWITCH_SHIP, shipIndex: 0 },
      { type: FLEET_COMMAND.CANCEL_ROUTE, shipIndex: 0 },
    ]);
  });

  it('购船页会渲染采购状态、局部焦点和船卡信号条，并委托发布购买命令', function () {
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

    var commands = [];
    FleetUI.renderShop({ state: state, onCommand: function (command) { commands.push(command); } });

    expect(elements['shop-list'].innerHTML).toContain('class="hangar-shop-brief" aria-label="购船决策摘要"');
    expect(elements['shop-list'].innerHTML).toContain('class="hangar-shop-brief-grid" role="list" aria-label="采购状态概览"');
    expect(elements['shop-list'].innerHTML).toContain('class="hangar-shop-focus" aria-label="采购焦点"');
    expect(elements['shop-list'].innerHTML).toContain('采购焦点');
    expect(elements['shop-list'].innerHTML).toContain('fleet-shop-signal-strip');
    expect(elements['shop-list'].innerHTML).toContain('fleet-shop-card--focus');

    var buyButton = createFakeElement();
    buyButton.dataset.fleetShopIntent = 'shop.ship.buy';
    buyButton.dataset.shipTypeId = 'freighter';
    buyButton.closest = function (selector) {
      return selector === '[data-fleet-shop-intent]' ? buyButton : null;
    };
    elements['shop-list'].onclick({ target: buyButton, preventDefault: function () {} });
    expect(commands).toEqual([{ type: FLEET_COMMAND.BUY_SHIP, shipTypeId: 'freighter' }]);
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

    FleetUI.openModModal({
      state: state,
      shipIndex: 0,
      onCommand: function () {},
      options: { focusModId: 'mod_service_bay' },
    });
    await Promise.resolve();

    expect(body.innerHTML).toContain('mod-modal-recommendation--focus');
    expect(body.innerHTML).toContain('mod-modal-item--focus');
    expect(body.innerHTML).toContain('data-mod-id="mod_service_bay"');
    expect(body.innerHTML).toContain('class="mod-modal-overview" role="list" aria-label="飞船改装摘要"');
    expect(body.innerHTML).toContain('class="mod-modal-signal-panel" aria-label="改装当前状态"');
    expect(body.innerHTML).toContain('class="mod-modal-signal-grid" role="list" aria-label="改装决策指标"');
    expect(body.innerHTML).toContain('class="mod-modal-signal-focus" role="status" aria-label="改装处理状态"');
    expect(body.innerHTML).toContain('处理状态');
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
    expect(documentListeners.keydown).toBeUndefined();
    expect(inlineViewport.scrollTop).toBe(0);
    expect(inlineViewport.scrollCalls).toContain(0);

    var prevented = false;
    elements['fleet-inline-container'].dispatchEvent({
      type: 'keydown',
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
    var crewPresenterSource = readFileSync('js/ui/FleetCrewPresenter.js', 'utf8');

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
    expect(html).toContain('id="dispatch-route-summary" class="dispatch-route-summary" role="list" aria-label="当前自动跑商路线摘要"');
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
    expect(hangarCss).toContain('#trade-panel #fleet-list .hangar-focused-ship {');
    expect(hangarCss).toContain('#trade-panel #fleet-list .hangar-focused-ship .hangar-vitals {');
    expect(fleetCss).toContain('.inline-portal-back-btn:focus-visible');
    expect(fleetCss).toContain('padding: 0 !important;');
    expect(source).toContain('modalBox.onclick = function (event)');
    expect(source).toContain('readFleetCrewIntent(event && event.target)');
    expect(source).not.toContain("modalBox.querySelectorAll('.crew-dismiss-btn')");
    expect(source).toContain("title: '解雇「' + (crewMember ? crewMember.name : '该船员') + '」？'");
    expect(crewPresenterSource).toContain('<strong>船员建议</strong>');
    expect(source).toContain('export function setLifecycleActions(actions)');
    expect(source).not.toContain('__linegameGameManager');
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
    dismissButton.dataset.fleetCrewIntent = FLEET_CREW_INTENT.DISMISS;
    dismissButton.dataset.crewId = 'crew_reserve';
    dismissButton.closest = function (selector) {
      return selector === '[data-fleet-crew-intent]' ? dismissButton : null;
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
    FleetUI.openCrewModal({
      state: state,
      shipIndex: 0,
      onCommand: function (command) {
        if (command.type === FLEET_COMMAND.DISMISS_CREW) dismissCount += 1;
      },
    });

    expect(modal.dataset.crewSeatState).toBe('ready');
    expect(modal.dataset.crewReserveState).toBe('ready');
    expect(modal.dataset.crewMarketState).toBe('ready');
    expect(modalBox.dataset.crewSeatState).toBe('ready');
    expect(elements['crew-modal-summary'].innerHTML).toContain('crew-modal-roster-alert');
    expect(elements['crew-modal-summary'].innerHTML).toContain('船员建议');
    expect(elements['crew-modal-summary'].innerHTML).toContain('还有 1 个空席位');
    expect(elements['crew-assigned-status'].innerHTML).toContain('席位');
    expect(elements['crew-assigned-status'].innerHTML).toContain('1/2');
    expect(elements['crew-reserve-status'].innerHTML).toContain('可分配');
    expect(elements['crew-market-status'].innerHTML).toContain('候选');
    expect(elements['crew-market-status'].innerHTML).toContain('1 人');
    expect(elements['crew-assigned-list'].innerHTML).toContain('测试领航');
    expect(elements['crew-reserve-list'].innerHTML).toContain('测试货运');
    expect(elements['crew-market-list'].innerHTML).toContain('测试市场');
    expect(typeof modalBox.onclick).toBe('function');

    modalBox.onclick({
      target: dismissButton,
      preventDefault: function () {},
    });
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

  it('售船 intent 会先打开危险确认，取消时不发布 typed command', function () {
    var modalBox = createFakeElement();
    var body = createFakeElement();
    var modal = createFakeElement(['modal']);
    modal.id = 'mod-modal';
    modal.querySelector = function (selector) {
      return selector === '.modal-box' ? modalBox : null;
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
      'mod-modal': modal,
      'mod-modal-title': createFakeElement(),
      'mod-modal-body': body,
      'mod-modal-close': createFakeElement(),
      'action-confirm-modal': confirmModal,
      'action-confirm-title': createFakeElement(),
      'action-confirm-message': createFakeElement(),
      'action-confirm-impact': createFakeElement(),
      'action-confirm-kicker': createFakeElement(),
      'action-confirm-accept': createFakeElement(),
      'action-confirm-cancel': createFakeElement(),
    };
    var backButton = createFakeElement();
    var sellButton = createFakeElement();
    sellButton.dataset.fleetModIntent = 'mod.ship.sell';
    sellButton.dataset.shipIndex = '1';
    sellButton.closest = function (selector) {
      return selector === '[data-fleet-mod-intent]' ? sellButton : null;
    };

    globalThis.document = {
      activeElement: sellButton,
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [modal, confirmModal] : [];
      },
      createElement: function (tagName) {
        return tagName === 'button' ? backButton : createFakeElement();
      },
      addEventListener: function () {},
    };

    var state = createTestState({ credits: 50000 });
    Fleet.init(state);
    var secondShip = JSON.parse(JSON.stringify(state.fleet[0]));
    secondShip.typeId = 'freighter';
    secondShip.name = '待售货船';
    secondShip.route = null;
    state.fleet.push(secondShip);
    state.fleetSlots = 2;
    state.activeShipIndex = 0;
    var commands = [];

    FleetUI.openModModal({
      state: state,
      shipIndex: 1,
      onCommand: function (command) { commands.push(command); },
    });

    expect(body.innerHTML).toContain('data-fleet-mod-intent="mod.ship.sell"');
    body.onclick({ target: sellButton, preventDefault: function () {} });
    expect(commands).toEqual([]);
    expect(confirmModal.classList.contains('hidden')).toBe(false);
    expect(elements['action-confirm-title'].textContent).toContain('待售货船');
    expect(elements['action-confirm-message'].textContent).toContain('永久移除');

    ActionConfirmUI.cancel();
    expect(commands).toEqual([]);
    expect(confirmModal.classList.contains('hidden')).toBe(true);
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
    Economy.init();
    Fleet.init(state);

    var assignCount = 0;
    var assignResult;
    FleetUI.openDispatchModal({
      state: state,
      shipIndex: 0,
      onCommand: function (command) {
        if (command.type !== FLEET_COMMAND.ASSIGN_ROUTE) return undefined;
        assignCount += 1;
        return assignResult;
      },
      preset: {
        buySystemId: 'sol_prime',
        sellSystemId: 'war_front',
        goodId: 'food',
        recommendation: {
          buySystemId: 'sol_prime',
          buySystemName: '太阳主星',
          sellSystemId: 'war_front',
          sellSystemName: '战争前线',
          goodId: 'food',
          goodName: '食物',
          recommendedTradePolicy: { riskMode: 'balanced', marketMode: 'open' },
        },
      },
    });

    expect(FleetUI.getActiveDispatchModalContext()).toMatchObject({
      shipIndex: 0,
      buySystemId: 'sol_prime',
      sellSystemId: 'war_front',
      goodId: 'food',
      tradePolicy: { riskMode: 'balanced', marketMode: 'open' },
    });
    expect(elements['dispatch-buy-system'].value).toBe('sol_prime');
    expect(elements['dispatch-sell-system'].value).toBe('war_front');
    expect(elements['dispatch-good'].value).toBe('food');
    expect(elements['dispatch-route-summary'].dataset.routeState).toBe('ready');
    expect(elements['dispatch-summary-buy'].textContent).toBe('太阳主星');
    expect(elements['dispatch-summary-sell'].textContent).toBe('战争前线');
    expect(elements['dispatch-summary-good'].textContent).toBe('🌾 食物');
    expect(elements['dispatch-summary-policy'].textContent).toBe('公开市场 · 平衡');
    expect(elements['dispatch-title'].textContent).not.toContain('📡');
    expect(modal.dataset.dispatchState).toBe('ready');
    expect(modal.dataset.dispatchPolicyState).toBe('neutral');
    expect(elements['dispatch-estimate'].innerHTML).toContain('role="list" aria-label="自动跑商估算"');
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

    elements['dispatch-sell-system'].value = elements['dispatch-buy-system'].value;
    elements['dispatch-sell-system'].onchange();
    expect(elements['dispatch-confirm'].disabled).toBe(true);
    expect(elements['dispatch-confirm'].textContent).toBe('路线无效');
    expect(elements['dispatch-primary-hint'].textContent).toContain('买入地和卖出地不能相同');
    expect(elements['dispatch-estimate'].innerHTML).not.toContain('aria-label="自动跑商估算"');
    expect(elements['dispatch-estimate'].innerHTML).not.toContain('单次利润');
    expect(elements['dispatch-estimate'].innerHTML).toContain('无法启动');

    elements['dispatch-sell-system'].value = 'war_front';
    state.credits = 0;
    state.fleet[0].cargo = { food: 1 };
    elements['dispatch-sell-system'].onchange();
    expect(elements['dispatch-estimate'].innerHTML).toContain('预计回款');
    expect(elements['dispatch-estimate'].innerHTML).not.toContain('<em>单次利润</em>');

    state.fleet[0].cargo = {};
    elements['dispatch-good'].onchange();
    expect(elements['dispatch-confirm'].disabled).toBe(true);
    expect(elements['dispatch-confirm'].textContent).toBe('积分不足');
    expect(elements['dispatch-primary-hint'].textContent).toContain('启动资金不足');
    expect(elements['dispatch-primary-hint'].textContent).toContain('先完成委托或出售库存');
    expect(elements['dispatch-route-summary'].dataset.routeState).toBe('blocked');
    expect(elements['dispatch-summary-policy'].textContent).toContain('暂不可启动');

    state.credits = 50000;
    elements['dispatch-good'].onchange();
    expect(elements['dispatch-confirm'].disabled).toBe(false);
    expect(elements['dispatch-confirm'].textContent).toBe('开始跑商');

    assignResult = { ok: false, msgs: [{ text: '测试启动失败', type: 'error' }] };
    elements['dispatch-confirm'].onclick();
    expect(assignCount).toBe(1);
    expect(elements['dispatch-primary-hint'].textContent).toBe('测试启动失败');
    expect(modal.dataset.dispatchState).toBe('blocked');

    assignResult = { ok: true, msgs: [] };
    elements['dispatch-confirm'].onclick();
    expect(assignCount).toBe(2);
    expect(FleetUI.getActiveDispatchModalContext()).toBe(null);
  });
});
