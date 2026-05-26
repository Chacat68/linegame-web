import { afterEach, describe, expect, it } from 'vitest';
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
  return {
    children: [],
    className: '',
    dataset: {},
    style: {},
    textContent: '',
    onclick: null,
    classList: createFakeClassList(initialClasses),
    appendChild: function (child) {
      this.children.push(child);
      child.parentNode = this;
    },
    addEventListener: function () {},
    setAttribute: function () {},
    removeAttribute: function () {},
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    set innerHTML(value) { html = String(value || ''); },
    get innerHTML() { return html; },
  };
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

describe('FleetUI.openModModal guidance focus', function () {
  var originalDocument = globalThis.document;

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('会高亮并滚动到行动引导指定的推荐组件', function () {
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
    var elements = {
      'fleet-list': createFakeElement(),
      'fleet-inline-container': createFakeElement(['hidden']),
      'mod-modal': modal,
      'mod-modal-title': createFakeElement(),
      'mod-modal-body': body,
      'mod-modal-close': createFakeElement(),
    };

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      createElement: function () {
        var el = createFakeElement();
        el.querySelector = function (selector) {
          return selector === '.inline-portal-back-btn' ? backButton : null;
        };
        return el;
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

    expect(body.innerHTML).toContain('mod-modal-recommendation--focus');
    expect(body.innerHTML).toContain('mod-modal-item--focus');
    expect(body.innerHTML).toContain('data-mod-id="mod_service_bay"');
    expect(FleetUI.getActiveModModalContext()).toMatchObject({
      shipIndex: 0,
      focusModId: 'mod_service_bay',
      recommendedModId: 'mod_service_bay',
    });
    expect(focusTarget.classList.contains('mod-modal-guidance-focus')).toBe(true);
    expect(scrolled).toBe(true);

    backButton.onclick({ preventDefault: function () {} });
    expect(FleetUI.getActiveModModalContext()).toBe(null);
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
      'dispatch-buy-system': createFakeSelectElement(),
      'dispatch-sell-system': createFakeSelectElement(),
      'dispatch-good': createFakeSelectElement(),
      'dispatch-market-mode': createFakeSelectElement('open'),
      'dispatch-risk-mode': createFakeSelectElement('balanced'),
      'dispatch-max-buy-price': createFakeElement(),
      'dispatch-min-sell-price': createFakeElement(),
      'dispatch-min-profit-rate': createFakeElement(),
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
      createElement: function () {
        var el = createFakeElement();
        el.querySelector = function (selector) {
          return selector === '.inline-portal-back-btn' ? backButton : null;
        };
        return el;
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

    FleetUI.openDispatchModal(
      state,
      0,
      function () {},
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
    });
    expect(elements['dispatch-buy-system'].value).toBe('sol_prime');
    expect(elements['dispatch-sell-system'].value).toBe('alpha_centauri');
    expect(elements['dispatch-good'].value).toBe('food');

    backButton.onclick({ preventDefault: function () {} });
    expect(FleetUI.getActiveDispatchModalContext()).toBe(null);
  });
});
