// js/core/ArchiveCommand.js — Archive UI 与档案动作控制器共享的 typed command 契约

export const ARCHIVE_COMMAND = Object.freeze({
  START_RESEARCH: 'archive.research.start',
  CANCEL_QUEUED_RESEARCH: 'archive.research.queue.cancel',
  MOVE_QUEUED_RESEARCH_UP: 'archive.research.queue.move-up',
  MOVE_QUEUED_RESEARCH_DOWN: 'archive.research.queue.move-down',
  CLEAR_RESEARCH_QUEUE: 'archive.research.queue.clear',
  APPLY_RESEARCH_DISPATCH: 'archive.research.dispatch.apply',
  RESOLVE_RESEARCH_BLOCKER: 'archive.research.blocker.resolve',
  OPEN_FACTION_MARKET: 'archive.faction.market.open',
  ACCEPT_QUEST: 'archive.quest.accept',
  ABANDON_QUEST: 'archive.quest.abandon',
  APPLY_QUEST_DISPATCH: 'archive.quest.dispatch.apply',
  RESOLVE_QUEST_BLOCKER: 'archive.quest.blocker.resolve',
});

function _normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function _freeze(type, payload) {
  return Object.freeze(Object.assign({ type: type }, payload || {}));
}

function _idCommand(type, command, field) {
  var id = _normalizeId(command[field]);
  if (!id) return null;
  var payload = {};
  payload[field] = id;
  return _freeze(type, payload);
}

function _objectCommand(type, command, field) {
  if (!_isObject(command[field])) return null;
  var payload = {};
  payload[field] = command[field];
  return _freeze(type, payload);
}

export function normalizeArchiveCommand(command) {
  if (!command || typeof command !== 'object') return null;
  var type = command.type;

  if (type === ARCHIVE_COMMAND.CLEAR_RESEARCH_QUEUE) return _freeze(type);
  if (type === ARCHIVE_COMMAND.START_RESEARCH ||
      type === ARCHIVE_COMMAND.CANCEL_QUEUED_RESEARCH ||
      type === ARCHIVE_COMMAND.MOVE_QUEUED_RESEARCH_UP ||
      type === ARCHIVE_COMMAND.MOVE_QUEUED_RESEARCH_DOWN) {
    return _idCommand(type, command, 'techId');
  }
  if (type === ARCHIVE_COMMAND.ACCEPT_QUEST || type === ARCHIVE_COMMAND.ABANDON_QUEST) {
    return _idCommand(type, command, 'questId');
  }
  if (type === ARCHIVE_COMMAND.APPLY_RESEARCH_DISPATCH ||
      type === ARCHIVE_COMMAND.APPLY_QUEST_DISPATCH) {
    return _objectCommand(type, command, 'recommendation');
  }
  if (type === ARCHIVE_COMMAND.RESOLVE_RESEARCH_BLOCKER ||
      type === ARCHIVE_COMMAND.RESOLVE_QUEST_BLOCKER ||
      type === ARCHIVE_COMMAND.OPEN_FACTION_MARKET) {
    return _objectCommand(type, command, 'action');
  }
  return null;
}

export function createArchiveCommand(type, payload) {
  var command = normalizeArchiveCommand(Object.assign({}, payload || {}, { type: type }));
  if (!command) throw new TypeError('Invalid archive command: ' + String(type));
  return command;
}
