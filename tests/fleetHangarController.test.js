import { describe, expect, it, vi } from 'vitest';
import { FLEET_COMMAND } from '../js/core/FleetCommand.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { createFleetHangarController } from '../js/ui/FleetHangarController.js';
import { FLEET_HANGAR_INTENT } from '../js/ui/FleetHangarPresenter.js';
import { createTestState } from './helpers.js';

function createIntentTarget(type, shipIndex) {
  var element = { dataset: { hangarIntent: type }, disabled: false };
  if (shipIndex !== undefined) element.dataset.shipIndex = String(shipIndex);
  return {
    closest: function (selector) {
      return selector === '[data-hangar-intent]' ? element : null;
    },
  };
}

function click(container, type, shipIndex) {
  var preventDefault = vi.fn();
  var result = container.onclick({
    target: createIntentTarget(type, shipIndex),
    preventDefault: preventDefault,
  });
  expect(preventDefault).toHaveBeenCalledOnce();
  return result;
}

function createStateWithTwoShips() {
  var state = createTestState({ credits: 50000 });
  Fleet.init(state);
  var secondShip = JSON.parse(JSON.stringify(state.fleet[0]));
  secondShip.name = '远航测试舰';
  secondShip.cargo = {};
  secondShip.route = null;
  state.fleet.push(secondShip);
  state.fleetSlots = 2;
  return state;
}

describe('FleetHangarController', function () {
  it('独占查看舰选择、Context 同步、重绘后焦点与冻结诊断', async function () {
    var focusTarget = { focus: vi.fn(), isConnected: true };
    var container = {
      innerHTML: '',
      onclick: null,
      querySelector: vi.fn(function () { return focusTarget; }),
    };
    var replaceContext = vi.fn(function () { return true; });
    var state = createStateWithTwoShips();
    var controller = createFleetHangarController({
      getContextRevision: function () { return 12; },
      getDocument: function () {
        return { getElementById: function (id) { return id === 'fleet-list' ? container : null; } };
      },
      replaceContext: replaceContext,
    });

    expect(controller.render({ state: state, onCommand: vi.fn() })).toBe(true);
    expect(controller.getInspectedShipIndex()).toBe(0);
    expect(replaceContext).toHaveBeenCalledWith(expect.objectContaining({
      id: '0', source: 'hangar-selection', revision: 12,
    }), { render: false });

    click(container, FLEET_HANGAR_INTENT.INSPECT_SHIP, 1);
    await Promise.resolve();

    expect(state.activeShipIndex).toBe(0);
    expect(controller.getInspectedShipIndex()).toBe(1);
    expect(replaceContext.mock.calls.some(function (call) {
      return call[0].id === '1' && call[0].source === 'hangar-ship-selector';
    })).toBe(true);
    expect(container.innerHTML).toContain('远航测试舰');
    expect(focusTarget.focus).toHaveBeenCalledOnce();
    expect(controller.getDiagnostics()).toEqual({
      inspectedShipIndex: 1,
      lastIntent: { type: FLEET_HANGAR_INTENT.INSPECT_SHIP, shipIndex: 1 },
      renderCount: 2,
      resetCount: 0,
      selectionCount: 1,
    });
    expect(Object.isFrozen(controller.getDiagnostics())).toBe(true);
    expect(Object.isFrozen(controller.getDiagnostics().lastIntent)).toBe(true);

    controller.reset();
    expect(container.onclick).toBe(null);
    expect(controller.getDiagnostics()).toEqual(expect.objectContaining({
      inspectedShipIndex: null, lastIntent: null, resetCount: 1,
    }));
  });

  it('把机库 intent 路由到唯一 typed command 与注入的二级界面端口', function () {
    var container = { innerHTML: '', onclick: null };
    var commands = [];
    var openMod = vi.fn(function () { return 'mod-opened'; });
    var openCrew = vi.fn(function () { return 'crew-opened'; });
    var openDispatch = vi.fn(function () { return 'dispatch-opened'; });
    var state = createStateWithTwoShips();
    var controller = createFleetHangarController({
      getDocument: function () {
        return { getElementById: function () { return container; } };
      },
      openCrew: openCrew,
      openDispatch: openDispatch,
      openMod: openMod,
    });
    controller.render({ state: state, onCommand: function (command) { commands.push(command); return command.type; } });

    expect(click(container, FLEET_HANGAR_INTENT.BUY_SLOT)).toBe(FLEET_COMMAND.BUY_SLOT);
    expect(click(container, FLEET_HANGAR_INTENT.SWITCH_SHIP, 1)).toBe(FLEET_COMMAND.SWITCH_SHIP);
    expect(click(container, FLEET_HANGAR_INTENT.CANCEL_ROUTE, 1)).toBe(FLEET_COMMAND.CANCEL_ROUTE);
    expect(click(container, FLEET_HANGAR_INTENT.OPEN_MODS, 1)).toBe('mod-opened');
    expect(click(container, FLEET_HANGAR_INTENT.OPEN_CREW, 1)).toBe('crew-opened');
    expect(click(container, FLEET_HANGAR_INTENT.OPEN_DISPATCH, 1)).toBe('dispatch-opened');

    expect(commands).toEqual([
      { type: FLEET_COMMAND.BUY_SLOT },
      { type: FLEET_COMMAND.SWITCH_SHIP, shipIndex: 1 },
      { type: FLEET_COMMAND.CANCEL_ROUTE, shipIndex: 1 },
    ]);
    expect(openMod).toHaveBeenCalledWith(expect.objectContaining({ state: state, shipIndex: 1 }));
    expect(openCrew).toHaveBeenCalledWith(expect.objectContaining({ state: state, shipIndex: 1 }));
    expect(openDispatch).toHaveBeenCalledWith(expect.objectContaining({ state: state, shipIndex: 1 }));
  });

  it('在缺少请求、DOM 或内联二级界面活动时安全降级', function () {
    var state = createStateWithTwoShips();
    var blocked = createFleetHangarController({
      getActiveInlineModalId: function () { return 'mod-modal'; },
      getDocument: function () { throw new Error('blocked render must not touch DOM'); },
    });
    expect(blocked.render({ state: state })).toBe(false);
    expect(createFleetHangarController({ getDocument: function () { return null; } }).render({ state: state })).toBe(false);
    expect(createFleetHangarController().render()).toBe(false);
    expect(blocked.setInspectedShipIndex(2)).toBe(2);
    expect(blocked.setInspectedShipIndex('2')).toBe(null);
    expect(Object.isFrozen(blocked)).toBe(true);
  });
});
