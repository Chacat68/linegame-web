// js/ui/SaveCommandAdapter.js — Save UI intent 到 typed command 的唯一转换边界

import { SAVE_COMMAND, normalizeSaveCommand } from '../core/SaveCommand.js';

function _publish(onCommand, type, slotId) {
  if (typeof onCommand !== 'function') return false;
  var command = normalizeSaveCommand({ type: type, slotId: slotId });
  return command ? onCommand(command) : false;
}

export function createSaveActionPorts(onCommand) {
  return Object.freeze({
    onSave: function (slotId) {
      return _publish(onCommand, SAVE_COMMAND.SAVE_SLOT, slotId);
    },
    onLoad: function (slotId) {
      return _publish(onCommand, SAVE_COMMAND.LOAD_SLOT, slotId);
    },
  });
}
