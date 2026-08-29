import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { FLEET_COMMAND } from '../js/core/FleetCommand.js';
import { createFleetActionPorts } from '../js/ui/FleetCommandAdapter.js';

describe('FleetCommandAdapter', function () {
  it('把机库、购船与派遣 action 规范化为单一 typed command 端口', function () {
    var commands = [];
    var actions = createFleetActionPorts(function (command) { commands.push(command); return true; });

    expect(actions.onBuySlot()).toBe(true);
    expect(actions.onBuyShip('freighter')).toBe(true);
    expect(actions.onSwitchShip(1)).toBe(true);
    expect(actions.onAssignRoute(1, 'sol_prime', 'nova_station', 'food', { mode: 'safe' })).toBe(true);
    expect(actions.onCancelRoute(1)).toBe(true);

    expect(commands).toEqual([
      { type: FLEET_COMMAND.BUY_SLOT },
      { type: FLEET_COMMAND.BUY_SHIP, shipTypeId: 'freighter' },
      { type: FLEET_COMMAND.SWITCH_SHIP, shipIndex: 1 },
      {
        type: FLEET_COMMAND.ASSIGN_ROUTE,
        shipIndex: 1,
        buySystemId: 'sol_prime',
        sellSystemId: 'nova_station',
        goodId: 'food',
        tradePolicy: { mode: 'safe' },
      },
      { type: FLEET_COMMAND.CANCEL_ROUTE, shipIndex: 1 },
    ]);
    expect(Object.isFrozen(actions)).toBe(true);
  });

  it('覆盖改装、维护和船员 action，并拒绝无效输入或缺失消费者', function () {
    var onCommand = vi.fn(function () { return 'accepted'; });
    var actions = createFleetActionPorts(onCommand);

    expect(actions.onUpgradeShip(0, 'cargo_bay')).toBe('accepted');
    expect(actions.onInstallMod(0, 'cargo_optimizer')).toBe('accepted');
    expect(actions.onUninstallMod(0, 'cargo_optimizer')).toBe('accepted');
    expect(actions.onServiceShip(0, 'standard')).toBe('accepted');
    expect(actions.onSellShip(1)).toBe('accepted');
    expect(actions.onRecruitCrew('offer_1')).toBe('accepted');
    expect(actions.onAssignCrew(0, 'crew_1')).toBe('accepted');
    expect(actions.onUnassignCrew(0, 'crew_1')).toBe('accepted');
    expect(actions.onDismissCrew('crew_1')).toBe('accepted');
    expect(actions.onSwitchShip(-1)).toBe(false);
    expect(createFleetActionPorts(null).onBuySlot()).toBe(false);
  });

  it('FleetUI 只消费 action ports，不再内联 typed command 映射', function () {
    var fleetUi = readFileSync('js/ui/FleetUI.js', 'utf8');
    expect(fleetUi).toContain("from './FleetCommandAdapter.js'");
    expect(fleetUi).not.toContain("from '../core/FleetCommand.js'");
    expect(fleetUi).not.toContain('normalizeFleetCommand(');
    expect(fleetUi).not.toContain('FLEET_COMMAND.');
    expect(fleetUi.split('\n').length).toBeLessThan(390);
  });
});
