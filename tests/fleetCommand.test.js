import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FLEET_COMMAND,
  createFleetCommand,
  normalizeFleetCommand,
} from '../js/core/FleetCommand.js';

describe('FleetCommand', function () {
  it('规范化派遣 command 并保留贸易策略', function () {
    var tradePolicy = { riskMode: 'safe', marketMode: 'open' };
    var command = createFleetCommand(FLEET_COMMAND.ASSIGN_ROUTE, {
      shipIndex: '2',
      buySystemId: ' sol_prime ',
      sellSystemId: 'nova_station',
      goodId: 'food',
      tradePolicy: tradePolicy,
    });

    expect(command).toEqual({
      type: FLEET_COMMAND.ASSIGN_ROUTE,
      shipIndex: 2,
      buySystemId: 'sol_prime',
      sellSystemId: 'nova_station',
      goodId: 'food',
      tradePolicy: tradePolicy,
    });
    expect(Object.isFrozen(command)).toBe(true);
  });

  it('规范化舰船、组件、保养和船员标识', function () {
    expect(createFleetCommand(FLEET_COMMAND.INSTALL_MOD, {
      shipIndex: 0,
      modId: 'mod_cargo_rack',
    })).toEqual({
      type: FLEET_COMMAND.INSTALL_MOD,
      shipIndex: 0,
      modId: 'mod_cargo_rack',
    });
    expect(createFleetCommand(FLEET_COMMAND.ASSIGN_CREW, {
      shipIndex: 1,
      crewId: 'crew-a',
    })).toEqual({
      type: FLEET_COMMAND.ASSIGN_CREW,
      shipIndex: 1,
      crewId: 'crew-a',
    });
    expect(createFleetCommand(FLEET_COMMAND.BUY_SLOT)).toEqual({ type: FLEET_COMMAND.BUY_SLOT });
  });

  it('拒绝未知、负索引和缺少标识的 command', function () {
    expect(normalizeFleetCommand(null)).toBeNull();
    expect(normalizeFleetCommand({ type: 'fleet.unknown' })).toBeNull();
    expect(normalizeFleetCommand({ type: FLEET_COMMAND.SWITCH_SHIP, shipIndex: -1 })).toBeNull();
    expect(normalizeFleetCommand({ type: FLEET_COMMAND.SWITCH_SHIP, shipIndex: ' ' })).toBeNull();
    expect(normalizeFleetCommand({ type: FLEET_COMMAND.RECRUIT_CREW, offerId: '' })).toBeNull();
    expect(function () {
      createFleetCommand(FLEET_COMMAND.UPGRADE_SHIP, { shipIndex: 0 });
    }).toThrow(/Invalid fleet command/);
  });

  it('舰队 UI 与协调器只保留请求对象和单一 command 端口', function () {
    var fleetUi = readFileSync('js/ui/FleetUI.js', 'utf8');
    var coordinator = readFileSync('js/ui/GameUiCoordinator.js', 'utf8');
    var destination = readFileSync('js/core/CommandDestinationController.js', 'utf8');

    expect(fleetUi).toContain('export function render(request)');
    expect(fleetUi).toContain('export function renderShop(request)');
    expect(fleetUi).toContain('export function openDispatchModal(request)');
    expect(fleetUi).toContain('export function openCrewModal(request)');
    expect(fleetUi).toContain('export function openModModal(request)');
    expect(coordinator).toContain("var onCommand = _action(actions, 'fleet', 'handleCommand')");
    expect(coordinator).not.toContain("_action(actions, 'fleet', 'onBuyShip')");
    expect(destination).toContain('onCommand: fleetActions.handleCommand');
  });
});
