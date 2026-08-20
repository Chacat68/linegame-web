// js/ui/LogsWorkspaceSession.js — 通讯工作区的纯内存会话状态

const DEFAULT_MAX_ENTRIES = 200;
const MAX_UNREAD_COUNT = 999;

function _positiveInteger(value, fallback) {
  var number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function _copyEntry(entry) {
  if (!entry) return null;
  return Object.freeze({
    id: entry.id,
    text: entry.text,
    type: entry.type,
    time: entry.time,
  });
}

export function createLogsWorkspaceSession(options) {
  var opts = options || {};
  var maxEntries = _positiveInteger(opts.maxEntries, DEFAULT_MAX_ENTRIES);
  var createTime = typeof opts.createTime === 'function'
    ? opts.createTime
    : function () { return new Date(); };
  var entries = [];
  var nextId = 1;
  var unreadCount = 0;
  var resetCount = 0;

  function getEntries() {
    return Object.freeze(entries.slice());
  }

  function getEntry(entryId) {
    var normalizedId = String(entryId == null ? '' : entryId);
    return entries.find(function (entry) { return entry.id === normalizedId; }) || null;
  }

  function addEntry(value) {
    var input = value || {};
    var entry = _copyEntry({
      id: 'message-' + nextId++,
      text: String(input.text == null ? '' : input.text),
      type: typeof input.type === 'string' && input.type.trim() ? input.type.trim() : 'info',
      time: Object.prototype.hasOwnProperty.call(input, 'time') ? input.time : createTime(),
    });
    entries.unshift(entry);
    if (entries.length > maxEntries) entries.length = maxEntries;
    unreadCount = Math.min(MAX_UNREAD_COUNT, unreadCount + 1);
    return entry;
  }

  function clearUnread() {
    var changed = unreadCount !== 0;
    unreadCount = 0;
    return changed;
  }

  function getDiagnostics() {
    return Object.freeze({
      entryCount: entries.length,
      latestEntryId: entries.length > 0 ? entries[0].id : null,
      maxEntries: maxEntries,
      nextEntryId: 'message-' + nextId,
      resetCount: resetCount,
      unreadCount: unreadCount,
    });
  }

  function reset() {
    entries = [];
    nextId = 1;
    unreadCount = 0;
    resetCount += 1;
    return getDiagnostics();
  }

  return Object.freeze({
    addEntry: addEntry,
    clearUnread: clearUnread,
    getDiagnostics: getDiagnostics,
    getEntries: getEntries,
    getEntry: getEntry,
    reset: reset,
  });
}
