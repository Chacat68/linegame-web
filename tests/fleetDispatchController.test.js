import { describe, expect, it } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { createFleetDispatchController } from '../js/ui/FleetDispatchController.js';
import { createTestState } from './helpers.js';

function createFakeElement() {
  var attributes = Object.create(null);
  return {
    className: '',
    dataset: {},
    disabled: false,
    innerHTML: '',
    onclick: null,
    onchange: null,
    oninput: null,
    ontoggle: null,
    open: false,
    textContent: '',
    value: '',
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute: function (name) { delete attributes[name]; },
    querySelector: function () { return null; },
  };
}

function createFakeSelect(initialValue) {
  var element = createFakeElement();
  var optionValues = [];
  var value = initialValue || '';
  var html = '';
  Object.defineProperty(element, 'innerHTML', {
    configurable: true,
    get: function () { return html; },
    set: function (next) {
      html = String(next || '');
      optionValues = [];
      var match;
      var optionPattern = /<option[^>]*value="([^"]*)"/g;
      while ((match = optionPattern.exec(html))) optionValues.push(match[1]);
      if (!optionValues.length) value = '';
      else if (!optionValues.includes(value)) value = optionValues[0];
    },
  });
  Object.defineProperty(element, 'value', {
    configurable: true,
    get: function () { return value; },
    set: function (next) { value = String(next || ''); },
  });
  Object.defineProperty(element, 'options', {
    configurable: true,
    get: function () {
      return optionValues.map(function (optionValue) { return { value: optionValue }; });
    },
  });
  Object.defineProperty(element, 'selectedIndex', {
    configurable: true,
    get: function () { return optionValues.indexOf(value); },
    set: function (index) {
      if (optionValues[index] !== undefined) value = optionValues[index];
    },
  });
  element.querySelector = function (selector) {
    var match = /^option\[value="([^"]*)"\]$/.exec(selector);
    return match && optionValues.includes(match[1]) ? { value: match[1] } : null;
  };
  return element;
}

function createDispatchDom() {
  var elements = {
    'dispatch-modal': createFakeElement(),
    'dispatch-title': createFakeElement(),
    'dispatch-primary-hint': createFakeElement(),
    'dispatch-route-summary': createFakeElement(),
    'dispatch-summary-buy': createFakeElement(),
    'dispatch-summary-sell': createFakeElement(),
    'dispatch-summary-good': createFakeElement(),
    'dispatch-summary-policy': createFakeElement(),
    'dispatch-buy-system': createFakeSelect(),
    'dispatch-sell-system': createFakeSelect(),
    'dispatch-good': createFakeSelect(),
    'dispatch-market-mode': createFakeSelect('open'),
    'dispatch-risk-mode': createFakeSelect('balanced'),
    'dispatch-max-buy-price': createFakeElement(),
    'dispatch-min-sell-price': createFakeElement(),
    'dispatch-min-profit-rate': createFakeElement(),
    'dispatch-policy-status': createFakeElement(),
    'dispatch-estimate': createFakeElement(),
    'dispatch-confirm': createFakeElement(),
    'dispatch-cancel': createFakeElement(),
    'dispatch-advanced-panel': createFakeElement(),
  };
  return {
    elements: elements,
    document: {
      getElementById: function (id) { return elements[id] || null; },
    },
  };
}

function createHarness() {
  var dom = createDispatchDom();
  var calls = [];
  var hangarRenderCount = 0;
  var inspectedShipIndex = null;
  var controller = createFleetDispatchController({
    getDocument: function () { return dom.document; },
    closeActiveSurface: function () { calls.push(['close-active']); return false; },
    closeSurface: function (modalId) { calls.push(['close', modalId]); return true; },
    hideBlockingSurface: function (modalId) { calls.push(['hide', modalId]); },
    openInlinePortal: function (modalId) { calls.push(['open-inline', modalId]); return true; },
    requestHangarRender: function () { hangarRenderCount += 1; },
    setInspectedShipIndex: function (shipIndex) { inspectedShipIndex = shipIndex; },
    showBlockingSurface: function (modalId) { calls.push(['show', modalId]); },
  });
  return {
    calls: calls,
    controller: controller,
    dom: dom,
    getHangarRenderCount: function () { return hangarRenderCount; },
    getInspectedShipIndex: function () { return inspectedShipIndex; },
  };
}

function createDispatchState() {
  var state = createTestState({
    credits: 50000,
    currentGalaxy: 'milky_way',
    currentSystem: 'sol_prime',
    fuel: 100,
    maxFuel: 100,
    playerLevel: 5,
  });
  Economy.init();
  Fleet.init(state);
  return state;
}

function createPreset() {
  return {
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
  };
}

describe('FleetDispatchController', function () {
  it('拒绝无效请求和缺失的必需 DOM，不创建半开会话', function () {
    var controller = createFleetDispatchController({ getDocument: function () { return null; } });
    expect(controller.open({ state: {}, shipIndex: 0 })).toBe(false);
    expect(controller.getActiveContext()).toBe(null);
    expect(controller.getDiagnostics()).toEqual(expect.objectContaining({
      openCount: 0,
      lastOpenStatus: 'invalid-request',
      activeContext: null,
    }));

    var state = createDispatchState();
    var missingDomController = createFleetDispatchController({
      getDocument: function () { return { getElementById: function () { return null; } }; },
    });
    expect(missingDomController.open({ state: state, shipIndex: 0 })).toBe(false);
    expect(missingDomController.getDiagnostics().lastOpenStatus).toBe('missing-dom');
  });

  it('独占草案、校验、估算与失败命令状态，并公开冻结 diagnostics', function () {
    var harness = createHarness();
    var state = createDispatchState();
    var assignResult = { ok: false, msgs: [{ text: '测试启动失败', type: 'error' }] };
    var submitted = [];
    expect(harness.controller.open({
      state: state,
      shipIndex: 0,
      preset: createPreset(),
      onAssignRoute: function () {
        submitted.push(Array.from(arguments));
        return assignResult;
      },
    })).toBe(true);

    expect(harness.getInspectedShipIndex()).toBe(0);
    expect(harness.controller.getActiveContext()).toMatchObject({
      shipIndex: 0,
      buySystemId: 'sol_prime',
      sellSystemId: 'war_front',
      goodId: 'food',
      status: 'ready',
      policyStatus: 'neutral',
    });
    var diagnostics = harness.controller.getDiagnostics();
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.activeContext)).toBe(true);
    expect(Object.isFrozen(diagnostics.activeContext.tradePolicy)).toBe(true);
    expect(diagnostics).toEqual(expect.objectContaining({
      openCount: 1,
      lastOpenStatus: 'inline',
      estimateUpdateCount: 1,
    }));

    var elements = harness.dom.elements;
    elements['dispatch-advanced-panel'].open = true;
    elements['dispatch-advanced-panel'].ontoggle();
    expect(harness.controller.getActiveContext().advancedOpen).toBe(true);

    elements['dispatch-max-buy-price'].value = '-1';
    elements['dispatch-max-buy-price'].oninput();
    expect(elements['dispatch-max-buy-price'].getAttribute('aria-invalid')).toBe('true');
    expect(elements['dispatch-confirm'].disabled).toBe(true);
    expect(harness.controller.getActiveContext()).toMatchObject({ status: 'invalid', policyStatus: 'invalid' });

    elements['dispatch-max-buy-price'].value = '';
    elements['dispatch-max-buy-price'].oninput();
    expect(elements['dispatch-confirm'].disabled).toBe(false);
    elements['dispatch-confirm'].onclick();
    expect(submitted).toHaveLength(1);
    expect(elements['dispatch-primary-hint'].textContent).toBe('测试启动失败');
    expect(harness.controller.getActiveContext().status).toBe('blocked');
    expect(harness.controller.getDiagnostics().commandSubmitCount).toBe(1);

    assignResult = { ok: true, msgs: [] };
    elements['dispatch-confirm'].onclick();
    expect(submitted).toHaveLength(2);
    expect(harness.controller.getActiveContext()).toBe(null);
    expect(harness.calls).toContainEqual(['close', 'dispatch-modal']);
    expect(harness.getHangarRenderCount()).toBe(1);
    expect(elements['dispatch-confirm'].onclick).toBe(null);
    expect(elements['dispatch-buy-system'].onchange).toBe(null);
  });

  it('取消和 reset 会释放处理器及草案上下文', function () {
    var harness = createHarness();
    var state = createDispatchState();
    expect(harness.controller.open({ state: state, shipIndex: 0, preset: createPreset() })).toBe(true);
    var cancelButton = harness.dom.elements['dispatch-cancel'];
    cancelButton.onclick();
    expect(harness.controller.getActiveContext()).toBe(null);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      closeCount: 1,
      lastCloseReason: 'cancel',
    }));
    expect(cancelButton.onclick).toBe(null);

    expect(harness.controller.open({ state: state, shipIndex: 0, preset: createPreset() })).toBe(true);
    var resetDiagnostics = harness.controller.reset();
    expect(resetDiagnostics).toEqual(expect.objectContaining({
      activeContext: null,
      openCount: 0,
      closeCount: 0,
      estimateUpdateCount: 0,
      commandSubmitCount: 0,
      resetCount: 1,
    }));
  });
});
