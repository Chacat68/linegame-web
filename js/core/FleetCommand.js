// js/core/FleetCommand.js — FleetUI 与舰队动作控制器共享的 typed command 契约

export const FLEET_COMMAND = Object.freeze({
  BUY_SHIP: 'fleet.ship.buy',
  SWITCH_SHIP: 'fleet.ship.switch',
  UPGRADE_SHIP: 'fleet.ship.upgrade',
  ASSIGN_ROUTE: 'fleet.route.assign',
  CANCEL_ROUTE: 'fleet.route.cancel',
  BUY_SLOT: 'fleet.slot.buy',
  SELL_SHIP: 'fleet.ship.sell',
  INSTALL_MOD: 'fleet.mod.install',
  UNINSTALL_MOD: 'fleet.mod.uninstall',
  SERVICE_SHIP: 'fleet.ship.service',
  RECRUIT_CREW: 'fleet.crew.recruit',
  ASSIGN_CREW: 'fleet.crew.assign',
  UNASSIGN_CREW: 'fleet.crew.unassign',
  DISMISS_CREW: 'fleet.crew.dismiss',
});

function _normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _normalizeIndex(value) {
  if (typeof value === 'string' && !value.trim()) return null;
  var index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function _freeze(type, payload) {
  return Object.freeze(Object.assign({ type: type }, payload || {}));
}

function _shipIndexCommand(type, command) {
  var shipIndex = _normalizeIndex(command.shipIndex);
  return shipIndex === null ? null : _freeze(type, { shipIndex: shipIndex });
}

function _shipIdCommand(type, command, field) {
  var shipIndex = _normalizeIndex(command.shipIndex);
  var id = _normalizeId(command[field]);
  if (shipIndex === null || !id) return null;
  var payload = { shipIndex: shipIndex };
  payload[field] = id;
  return _freeze(type, payload);
}

export function normalizeFleetCommand(command) {
  if (!command || typeof command !== 'object') return null;
  var type = command.type;

  if (type === FLEET_COMMAND.BUY_SLOT) return _freeze(type);
  if (type === FLEET_COMMAND.BUY_SHIP) {
    var shipTypeId = _normalizeId(command.shipTypeId);
    return shipTypeId ? _freeze(type, { shipTypeId: shipTypeId }) : null;
  }
  if (type === FLEET_COMMAND.SWITCH_SHIP ||
      type === FLEET_COMMAND.CANCEL_ROUTE ||
      type === FLEET_COMMAND.SELL_SHIP) {
    return _shipIndexCommand(type, command);
  }
  if (type === FLEET_COMMAND.UPGRADE_SHIP) return _shipIdCommand(type, command, 'upgradeId');
  if (type === FLEET_COMMAND.INSTALL_MOD || type === FLEET_COMMAND.UNINSTALL_MOD) {
    return _shipIdCommand(type, command, 'modId');
  }
  if (type === FLEET_COMMAND.SERVICE_SHIP) return _shipIdCommand(type, command, 'tierId');

  if (type === FLEET_COMMAND.ASSIGN_ROUTE) {
    var shipIndex = _normalizeIndex(command.shipIndex);
    var buySystemId = _normalizeId(command.buySystemId);
    var sellSystemId = _normalizeId(command.sellSystemId);
    var goodId = _normalizeId(command.goodId);
    if (shipIndex === null || !buySystemId || !sellSystemId || !goodId) return null;
    return _freeze(type, {
      shipIndex: shipIndex,
      buySystemId: buySystemId,
      sellSystemId: sellSystemId,
      goodId: goodId,
      tradePolicy: command.tradePolicy && typeof command.tradePolicy === 'object' && !Array.isArray(command.tradePolicy)
        ? command.tradePolicy
        : undefined,
    });
  }

  if (type === FLEET_COMMAND.RECRUIT_CREW) {
    var offerId = _normalizeId(command.offerId);
    return offerId ? _freeze(type, { offerId: offerId }) : null;
  }
  if (type === FLEET_COMMAND.DISMISS_CREW) {
    var dismissCrewId = _normalizeId(command.crewId);
    return dismissCrewId ? _freeze(type, { crewId: dismissCrewId }) : null;
  }
  if (type === FLEET_COMMAND.ASSIGN_CREW || type === FLEET_COMMAND.UNASSIGN_CREW) {
    return _shipIdCommand(type, command, 'crewId');
  }

  return null;
}

export function createFleetCommand(type, payload) {
  var command = normalizeFleetCommand(Object.assign({}, payload || {}, { type: type }));
  if (!command) throw new TypeError('Invalid fleet command: ' + String(type));
  return command;
}
