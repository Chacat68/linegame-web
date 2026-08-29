import { describe, expect, it } from 'vitest';
import * as Crew from '../js/systems/fleet/CrewSystem.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { createFleetCrewController } from '../js/ui/FleetCrewController.js';
import { FLEET_CREW_INTENT } from '../js/ui/FleetCrewPresenter.js';
import { createTestState } from './helpers.js';

function createElement() {
  return {
    dataset: {},
    innerHTML: '',
    onclick: null,
    textContent: '',
    querySelector: function () { return null; },
  };
}

function createIntentTarget(type, options) {
  var opts = options || {};
  var element = createElement();
  element.dataset.fleetCrewIntent = type;
  if (opts.shipIndex !== undefined) element.dataset.shipIndex = String(opts.shipIndex);
  if (opts.crewId !== undefined) element.dataset.crewId = opts.crewId;
  if (opts.offerId !== undefined) element.dataset.offerId = opts.offerId;
  element.closest = function (selector) {
    return selector === '[data-fleet-crew-intent]' ? element : null;
  };
  return element;
}

function createCrewState() {
  var state = createTestState({ credits: 12000, currentSystem: 'sol_prime' });
  Fleet.init(state);
  state.fleet[0].crewCapacity = 2;
  var firstOffer = Crew.getCrewMarket(state, 'sol_prime').offers[0];
  state.crewMarket.sol_prime = {
    systemId: 'sol_prime',
    refreshDay: 1,
    nextRefreshDay: 4,
    themeLabel: '综合港',
    offers: [
      Object.assign({}, firstOffer, { id: 'offer_assigned', name: '值班领航员', role: 'pilot', roleName: '领航员' }),
      Object.assign({}, firstOffer, { id: 'offer_reserve', name: '预备货运', role: 'quartermaster', roleName: '货运主管' }),
      Object.assign({}, firstOffer, { id: 'offer_market', name: '市场经纪', role: 'broker', roleName: '交易掮客' }),
    ],
  };
  Crew.recruitCrew(state, 'offer_assigned', 'sol_prime');
  Crew.recruitCrew(state, 'offer_reserve', 'sol_prime');
  Crew.assignCrewToShip(state, state.crewRoster[0].id, 0);
  return state;
}

function createHarness() {
  var modalBox = createElement();
  var modal = createElement();
  modal.querySelector = function (selector) { return selector === '.modal-box' ? modalBox : null; };
  var elements = {
    'crew-modal': modal,
    'crew-modal-title': createElement(),
    'crew-modal-summary': createElement(),
    'crew-assigned-status': createElement(),
    'crew-reserve-status': createElement(),
    'crew-market-status': createElement(),
    'crew-assigned-list': createElement(),
    'crew-reserve-list': createElement(),
    'crew-market-list': createElement(),
    'crew-modal-close': createElement(),
  };
  var calls = [];
  var scheduled = [];
  var confirmations = [];
  var hangarRenderCount = 0;
  var inspectedShipIndex = null;
  var controller = createFleetCrewController({
    getDocument: function () {
      return { getElementById: function (id) { return elements[id] || null; } };
    },
    closeActiveSurface: function () { calls.push(['close-active']); return false; },
    closeSurface: function (modalId) { calls.push(['close', modalId]); return true; },
    hideBlockingSurface: function (modalId) { calls.push(['hide', modalId]); },
    openConfirmation: function (context, options) {
      confirmations.push({ context: context, options: options });
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
    getConfirmations: function () { return confirmations; },
    getHangarRenderCount: function () { return hangarRenderCount; },
    getInspectedShipIndex: function () { return inspectedShipIndex; },
    getScheduledCount: function () { return scheduled.length; },
    modalBox: modalBox,
  };
}

describe('FleetCrewController', function () {
  it('拒绝无效请求和缺失 DOM，不创建半开船员会话', function () {
    var controller = createFleetCrewController({ getDocument: function () { return null; } });
    expect(controller.open({ state: {}, shipIndex: 0 })).toBe(false);
    expect(controller.getDiagnostics()).toEqual(expect.objectContaining({
      openCount: 0,
      lastOpenStatus: 'invalid-request',
      activeContext: null,
    }));

    var state = createCrewState();
    var missingDomController = createFleetCrewController({
      getDocument: function () { return { getElementById: function () { return null; } }; },
    });
    expect(missingDomController.open({ state: state, shipIndex: 0 })).toBe(false);
    expect(missingDomController.getDiagnostics().lastOpenStatus).toBe('missing-dom');
  });

  it('独占名单委托，并丢弃关闭后的迟到切船重绘', function () {
    var harness = createHarness();
    var state = createCrewState();
    var switches = [];
    expect(harness.controller.open({
      state: state,
      shipIndex: 0,
      onSwitchShip: function (shipIndex) { switches.push(shipIndex); },
    })).toBe(true);

    expect(harness.getInspectedShipIndex()).toBe(0);
    expect(harness.controller.getActiveContext()).toMatchObject({
      shipIndex: 0,
      seatState: 'ready',
      reserveState: 'ready',
      marketState: 'ready',
    });
    var diagnostics = harness.controller.getDiagnostics();
    expect(Object.isFrozen(diagnostics)).toBe(true);
    expect(Object.isFrozen(diagnostics.activeContext)).toBe(true);
    expect(diagnostics).toEqual(expect.objectContaining({
      openCount: 1,
      renderCount: 1,
      lastOpenStatus: 'inline',
    }));

    harness.modalBox.onclick({
      target: createIntentTarget(FLEET_CREW_INTENT.SWITCH_SHIP, { shipIndex: 0 }),
      preventDefault: function () {},
    });
    expect(switches).toEqual([0]);
    expect(harness.getScheduledCount()).toBe(1);
    harness.controller.clearContext('external-close');
    expect(harness.modalBox.onclick).toBe(null);
    harness.flushNext();
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      commandCount: 1,
      scheduledRenderCount: 1,
      droppedRenderCount: 1,
      lastIntent: FLEET_CREW_INTENT.SWITCH_SHIP,
      lastCloseReason: 'external-close',
    }));
  });

  it('解雇必须经过危险确认，并拒绝关闭后到达的旧确认', function () {
    var harness = createHarness();
    var state = createCrewState();
    var dismissed = [];
    var reserveCrewId = state.crewRoster.find(function (member) { return member.assignedShipIndex === null; }).id;
    var request = {
      state: state,
      shipIndex: 0,
      onDismissCrew: function (crewId) { dismissed.push(crewId); },
    };
    expect(harness.controller.open(request)).toBe(true);
    harness.modalBox.onclick({
      target: createIntentTarget(FLEET_CREW_INTENT.DISMISS, { crewId: reserveCrewId }),
      preventDefault: function () {},
    });
    expect(dismissed).toEqual([]);
    expect(harness.getConfirmations()[0].context).toEqual({
      type: 'crew-dismiss',
      shipIndex: 0,
      crewId: reserveCrewId,
    });
    expect(harness.getConfirmations()[0].options.title).toContain('预备货运');
    harness.getConfirmations()[0].options.onConfirm();
    expect(dismissed).toEqual([reserveCrewId]);
    expect(harness.controller.getDiagnostics()).toEqual(expect.objectContaining({
      confirmationCount: 1,
      commandCount: 1,
      renderCount: 2,
    }));

    expect(harness.controller.open(request)).toBe(true);
    harness.modalBox.onclick({
      target: createIntentTarget(FLEET_CREW_INTENT.DISMISS, { crewId: reserveCrewId }),
      preventDefault: function () {},
    });
    var staleConfirmation = harness.getConfirmations()[1];
    harness.controller.clearContext('external-close');
    staleConfirmation.options.onConfirm();
    expect(dismissed).toEqual([reserveCrewId]);
    expect(harness.controller.getDiagnostics().droppedConfirmationCount).toBe(1);

    var resetDiagnostics = harness.controller.reset();
    expect(resetDiagnostics).toEqual(expect.objectContaining({
      activeContext: null,
      openCount: 0,
      renderCount: 0,
      commandCount: 0,
      resetCount: 1,
    }));
    expect(Object.isFrozen(resetDiagnostics)).toBe(true);
  });
});
