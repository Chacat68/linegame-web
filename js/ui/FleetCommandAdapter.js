// js/ui/FleetCommandAdapter.js — Fleet UI action 到 typed command 的唯一转换边界

import { FLEET_COMMAND, normalizeFleetCommand } from '../core/FleetCommand.js';

function _publish(onCommand, type, payload) {
  if (typeof onCommand !== 'function') return false;
  var command = normalizeFleetCommand(Object.assign({}, payload || {}, { type: type }));
  return command ? onCommand(command) : false;
}

export function createFleetActionPorts(onCommand) {
  return Object.freeze({
    onBuyShip: function (shipTypeId) {
      return _publish(onCommand, FLEET_COMMAND.BUY_SHIP, { shipTypeId: shipTypeId });
    },
    onSwitchShip: function (shipIndex) {
      return _publish(onCommand, FLEET_COMMAND.SWITCH_SHIP, { shipIndex: shipIndex });
    },
    onUpgradeShip: function (shipIndex, upgradeId) {
      return _publish(onCommand, FLEET_COMMAND.UPGRADE_SHIP, { shipIndex: shipIndex, upgradeId: upgradeId });
    },
    onAssignRoute: function (shipIndex, buySystemId, sellSystemId, goodId, tradePolicy) {
      return _publish(onCommand, FLEET_COMMAND.ASSIGN_ROUTE, {
        shipIndex: shipIndex,
        buySystemId: buySystemId,
        sellSystemId: sellSystemId,
        goodId: goodId,
        tradePolicy: tradePolicy,
      });
    },
    onCancelRoute: function (shipIndex) {
      return _publish(onCommand, FLEET_COMMAND.CANCEL_ROUTE, { shipIndex: shipIndex });
    },
    onBuySlot: function () {
      return _publish(onCommand, FLEET_COMMAND.BUY_SLOT);
    },
    onSellShip: function (shipIndex) {
      return _publish(onCommand, FLEET_COMMAND.SELL_SHIP, { shipIndex: shipIndex });
    },
    onInstallMod: function (shipIndex, modId) {
      return _publish(onCommand, FLEET_COMMAND.INSTALL_MOD, { shipIndex: shipIndex, modId: modId });
    },
    onUninstallMod: function (shipIndex, modId) {
      return _publish(onCommand, FLEET_COMMAND.UNINSTALL_MOD, { shipIndex: shipIndex, modId: modId });
    },
    onServiceShip: function (shipIndex, tierId) {
      return _publish(onCommand, FLEET_COMMAND.SERVICE_SHIP, { shipIndex: shipIndex, tierId: tierId });
    },
    onRecruitCrew: function (offerId) {
      return _publish(onCommand, FLEET_COMMAND.RECRUIT_CREW, { offerId: offerId });
    },
    onAssignCrew: function (shipIndex, crewId) {
      return _publish(onCommand, FLEET_COMMAND.ASSIGN_CREW, { shipIndex: shipIndex, crewId: crewId });
    },
    onUnassignCrew: function (shipIndex, crewId) {
      return _publish(onCommand, FLEET_COMMAND.UNASSIGN_CREW, { shipIndex: shipIndex, crewId: crewId });
    },
    onDismissCrew: function (crewId) {
      return _publish(onCommand, FLEET_COMMAND.DISMISS_CREW, { crewId: crewId });
    },
  });
}
