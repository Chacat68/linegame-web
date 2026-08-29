// js/core/SaveCommand.js — Save UI 与持久化控制器共享的 typed command 契约

export const SAVE_COMMAND = Object.freeze({
  SAVE_SLOT: 'save.slot.write',
  LOAD_SLOT: 'save.slot.load',
});

function _normalizeSlotId(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  var slotId = Number(value);
  return Number.isInteger(slotId) && slotId >= 0 ? slotId : null;
}

export function normalizeSaveCommand(command) {
  if (!command || typeof command !== 'object') return null;
  if (command.type !== SAVE_COMMAND.SAVE_SLOT && command.type !== SAVE_COMMAND.LOAD_SLOT) return null;
  var slotId = _normalizeSlotId(command.slotId);
  return slotId === null ? null : Object.freeze({ type: command.type, slotId: slotId });
}

export function createSaveCommand(type, payload) {
  var command = normalizeSaveCommand(Object.assign({}, payload || {}, { type: type }));
  if (!command) throw new TypeError('Invalid save command: ' + String(type));
  return command;
}
