import { describe, expect, it, vi } from 'vitest';
import { FLEET_COMMAND } from '../js/core/FleetCommand.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { createFleetShopController } from '../js/ui/FleetShopController.js';
import { createTestState } from './helpers.js';

function createBuyTarget(shipTypeId) {
  var button = {
    dataset: { fleetShopIntent: 'shop.ship.buy', shipTypeId: shipTypeId },
    disabled: false,
  };
  return {
    closest: function (selector) {
      return selector === '[data-fleet-shop-intent]' ? button : null;
    },
  };
}

function createState(credits) {
  var state = createTestState({ credits: credits });
  Fleet.init(state);
  state.fleetSlots = 2;
  return state;
}

describe('FleetShopController', function () {
  it('独占采购投影、购买 intent 与采购焦点诊断', function () {
    var container = { innerHTML: '', onclick: null };
    var commands = [];
    var controller = createFleetShopController({
      getDocument: function () {
        return { getElementById: function (id) { return id === 'shop-list' ? container : null; } };
      },
    });

    expect(controller.render({
      state: createState(5000),
      onCommand: function (command) { commands.push(command); return 'accepted'; },
    })).toBe(true);
    expect(container.innerHTML).toContain('fleet-shop-card--focus');
    var preventDefault = vi.fn();
    expect(container.onclick({ target: createBuyTarget('freighter'), preventDefault: preventDefault })).toBe('accepted');
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(commands).toEqual([{ type: FLEET_COMMAND.BUY_SHIP, shipTypeId: 'freighter' }]);
    expect(controller.getDiagnostics()).toEqual({
      focusShipTypeId: 'freighter',
      lastIntent: { type: 'shop.ship.buy', shipTypeId: 'freighter' },
      renderCount: 1,
      resetCount: 0,
    });
    expect(Object.isFrozen(controller.getDiagnostics())).toBe(true);
    expect(Object.isFrozen(controller.getDiagnostics().lastIntent)).toBe(true);
  });

  it('无可采购舰时清空焦点，并在 reset 时解绑自己持有的处理器', function () {
    var container = { innerHTML: '', onclick: null };
    var controller = createFleetShopController({
      getDocument: function () { return { getElementById: function () { return container; } }; },
    });
    var state = createState(0);
    state.fleetSlots = state.fleet.length;
    expect(controller.render({ state: state })).toBe(true);
    expect(controller.getDiagnostics().focusShipTypeId).toBe(null);
    expect(container.innerHTML).toContain('采购暂停');

    controller.reset();
    expect(container.onclick).toBe(null);
    expect(controller.getDiagnostics()).toEqual({
      focusShipTypeId: null,
      lastIntent: null,
      renderCount: 1,
      resetCount: 1,
    });
  });

  it('在缺少请求或采购容器时安全降级', function () {
    expect(createFleetShopController().render()).toBe(false);
    expect(createFleetShopController({ getDocument: function () { return null; } }).render({ state: createState(5000) })).toBe(false);
    expect(Object.isFrozen(createFleetShopController())).toBe(true);
  });
});
