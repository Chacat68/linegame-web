import { describe, expect, it } from 'vitest';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { createFleetModController } from '../js/ui/FleetModController.js';
import { FLEET_MOD_INTENT } from '../js/ui/FleetModPresenter.js';
import { createTestState } from './helpers.js';

function createClassList() {
  var values = new Set();
  return {
    add: function (value) { values.add(value); },
    contains: function (value) { return values.has(value); },
  };
}

function createElement() {
  var attributes = Object.create(null);
  return {
    classList: createClassList(),
    className: '',
    dataset: {},
    disabled: false,
    focused: false,
    innerHTML: '',
    isConnected: true,
    onclick: null,
    textContent: '',
    focus: function () { this.focused = true; },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    querySelector: function () { return null; },
    removeAttribute: function (name) { delete attributes[name]; },
    scrollIntoView: function () {},
    setAttribute: function (name, value) { attributes[name] = String(value); },
  };
}

function createIntentTarget(type, options) {
  var opts = options || {};
  var element = createElement();
  element.dataset.fleetModIntent = type;
  element.dataset.shipIndex = String(opts.shipIndex == null ? 0 : opts.shipIndex);
  if (opts.modId) element.dataset.modId = opts.modId;
  if (opts.upgradeId) element.dataset.upgradeId = opts.upgradeId;
  element.closest = function (selector) {
    return selector === '[data-fleet-mod-intent]' ? element : null;
  };
  return element;
}

function createHarness(focusTarget) {
  var body = createElement();
  body.querySelector = function (selector) {
    if (!focusTarget) return null;
    if (selector === '[data-focus-mod="item"]' && body.innerHTML.includes('data-focus-mod="item"')) return focusTarget;
    if (selector === '[data-focus-mod="recommendation"]' && body.innerHTML.includes('data-focus-mod="recommendation"')) return focusTarget;
    if (selector === '.ship-repair-card' && body.innerHTML.includes('ship-repair-card')) return focusTarget;
    return null;
  };
  var elements = {
    'mod-modal': createElement(),
    'mod-modal-body': body,
    'mod-modal-title': createElement(),
    'mod-modal-close': createElement(),
  };
  var calls = [];
  var scheduled = [];
  var confirmation = null;
  var hangarRenderCount = 0;
  var inspectedShipIndex = null;
  var controller = createFleetModController({
    getDocument: function () {
      return { getElementById: function (id) { return elements[id] || null; } };
    },
    closeActiveSurface: function () { calls.push(['close-active']); return false; },
    closeSurface: function (modalId) { calls.push(['close', modalId]); return true; },
    hideBlockingSurface: function (modalId) { calls.push(['hide', modalId]); },
    openConfirmation: function (context, options) {
      confirmation = { context: context, options: options };
      return true;
    },
    openInlinePortal: function (modalId) { calls.push(['open-inline', modalId]); return true; },
    requestHangarRender: function () { hangarRenderCount += 1; },
    schedule: function (callback) { scheduled.push(callback); },
    setInspectedShipIndex: function (shipIndex) { inspectedShipIndex = shipIndex; },
    showBlockingSurface: function (modalId) { calls.push(['show', modalId]); },
  });
  return {
    calls: calls,
    controller: controller,
    elements: elements,
    flushNext: function () {
      var callback = scheduled.shift();
      if (callback) callback();
    },
    getConfirmation: function () { return confirmation; },
    getHangarRenderCount: function () { return hangarRenderCount; },
    getInspectedShipIndex: function () { return inspectedShipIndex; },
    getScheduledCount: function () { return scheduled.length; },
  };
}

function createState() {
  var state = createTestState({ credits: 50000 });
  Fleet.init(state);
  state.fleet[0].maintenance = 42;
  return state;
}

describe('FleetModController', function () {
  it('拒绝无效请求和缺失 DOM，不创建半开弹层会话', function () {
    var controller = createFleetModController({ getDocument: function () { return null; } });
    expect(controller.open({ state: {}, shipIndex: 0 })).toBe(false);
    expect(controller.getDiagnostics()).toEqual(expect.objectContaining({
      openCount: 0,
      lastOpenStatus: 'invalid-request',
      activeContext: null,
    }));

    var state = createState();
    var missingDomController = createFleetModController({
      getDocument: function () { return { getElementById: function () { return null; } }; },
    });
    expect(missingDomController.open({ state: state, shipIndex: 0 })).toBe(false);
    expect(missingDomController.getDiagnostics().lastOpenStatus).toBe('missing-dom');
  });

  it('独占引导焦点与命令刷新，并丢弃关闭后的迟到重绘', function () {
    var focusTarget = createElement();
    var harness = createHarness(focusTarget);
    var state = createState();
    var installs = [];
    expect(harness.controller.open({
      state: state,
      shipIndex: 0,
      options: { focusModId: 'mod_service_bay' },
      onInstallMod: function (shipIndex, modId) { installs.push([shipIndex, modId]); },
    })).toBe(true);

    expect(harness.getInspectedShipIndex()).toBe(0);
    expect(harness.controller.getActiveContext()).toMatchObject({
      shipIndex: 0,
      focusModId: 'mod_service_bay',
      recommendedModId: 'mod_service_bay',
    });
    expect(focusTarget.classList.contains('mod-modal-guidance-focus')).toBe(true);
    expect(focusTarget.getAttribute('tabindex')).toBe('-1');
    expect(focusTarget.focused).toBe(true);
    var diagnostics = harness.controller.getDiagnostics();
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.activeContext)).toBe(true);
    expect(diagnostics).toEqual(expect.objectContaining({
      openCount: 1,
      renderCount: 1,
      focusRequestCount: 1,
      focusSuccessCount: 1,
      lastOpenStatus: 'inline',
    }));

    harness.elements['mod-modal-body'].onclick({
      target: createIntentTarget(FLEET_MOD_INTENT.INSTALL, { shipIndex: 0, modId: 'mod_service_bay' }),
      preventDefault: function () {},
    });
    expect(installs).toEqual([[0, 'mod_service_bay']]);
    expect(harness.getScheduledCount()).toBe(1);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      commandCount: 1,
      scheduledRenderCount: 1,
      lastIntent: FLEET_MOD_INTENT.INSTALL,
    }));

    harness.controller.clearContext('external-close');
    expect(harness.elements['mod-modal-body'].onclick).toBe(null);
    harness.flushNext();
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      renderCount: 1,
      droppedRenderCount: 1,
      lastCloseReason: 'external-close',
    }));
  });

  it('售船必须经过危险确认，成功后关闭 Surface 并刷新机库', function () {
    var harness = createHarness();
    var state = createState();
    var secondShip = JSON.parse(JSON.stringify(state.fleet[0]));
    secondShip.typeId = 'freighter';
    secondShip.name = '待售货船';
    secondShip.route = null;
    state.fleet.push(secondShip);
    state.fleetSlots = 2;
    state.activeShipIndex = 0;
    var sold = [];
    expect(harness.controller.open({
      state: state,
      shipIndex: 1,
      onSellShip: function (shipIndex) {
        sold.push(shipIndex);
        state.fleet.splice(shipIndex, 1);
      },
    })).toBe(true);

    harness.elements['mod-modal-body'].onclick({
      target: createIntentTarget(FLEET_MOD_INTENT.SELL, { shipIndex: 1 }),
      preventDefault: function () {},
    });
    expect(sold).toEqual([]);
    expect(harness.getConfirmation().context).toEqual({ type: 'ship-sell', shipIndex: 1 });
    expect(harness.getConfirmation().options.title).toContain('待售货船');
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      confirmationCount: 1,
      commandCount: 0,
    }));

    harness.getConfirmation().options.onConfirm();
    expect(sold).toEqual([1]);
    expect(harness.getScheduledCount()).toBe(1);
    harness.flushNext();
    expect(harness.controller.getActiveContext()).toBe(null);
    expect(harness.calls).toContainEqual(['close', 'mod-modal']);
    expect(harness.getHangarRenderCount()).toBe(1);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      commandCount: 1,
      lastCloseReason: 'ship-sold',
    }));

    var resetDiagnostics = harness.controller.reset();
    expect(resetDiagnostics).toEqual(expect.objectContaining({
      activeContext: null,
      openCount: 0,
      renderCount: 0,
      commandCount: 0,
      resetCount: 1,
    }));
  });
});
