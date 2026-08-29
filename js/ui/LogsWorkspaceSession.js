// js/ui/LogsWorkspaceSession.js — 通讯工作区的纯内存会话状态

import { normalizeLogMessage } from '../core/LogMessage.js';

const DEFAULT_MAX_ENTRIES = 200;
const MAX_UNREAD_COUNT = 999;
const DEFAULT_RECENT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_AGGREGATION_WINDOW_MS = 30 * 1000;
const FILTER_TYPES = Object.freeze([
  'all',
  'system',
  'trade',
  'travel',
  'fleet',
  'quest',
  'research',
  'exploration',
  'event',
  'opportunity',
  'risk',
]);
const TIME_WINDOWS = Object.freeze(['all', 'recent']);

const TYPES_BY_SIGNAL_FILTER = Object.freeze({
  opportunity: Object.freeze(['tip']),
  risk: Object.freeze(['danger', 'error']),
});

const SOURCES_BY_FILTER = Object.freeze({
  system: Object.freeze([
    'system',
    'guidance',
    'progression',
    'persistence',
    'feature',
    'settings',
    'tutorial',
    'achievement',
    'victory',
    'faction',
  ]),
  trade: Object.freeze(['commerce']),
  travel: Object.freeze(['navigation']),
  fleet: Object.freeze(['fleet']),
  quest: Object.freeze(['quest']),
  research: Object.freeze(['research']),
  exploration: Object.freeze(['exploration']),
  event: Object.freeze(['event']),
});

export const LOG_FILTER_TYPES = FILTER_TYPES;
export const LOG_TIME_WINDOWS = TIME_WINDOWS;

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
    source: entry.source,
    time: entry.time,
  });
}

function _timestamp(value) {
  var date = value instanceof Date ? value : new Date(value);
  var time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function _normalizeEnum(value, allowed, fallback) {
  var normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowed.indexOf(normalized) >= 0 ? normalized : fallback;
}

function _matchesFilter(entry, filterType) {
  if (filterType === 'all') return true;
  var allowedTypes = TYPES_BY_SIGNAL_FILTER[filterType];
  if (allowedTypes) return allowedTypes.indexOf(entry.type) >= 0;
  var allowedSources = SOURCES_BY_FILTER[filterType] || SOURCES_BY_FILTER.system;
  return allowedSources.indexOf(entry.source) >= 0;
}

function _freezeViewEntry(group) {
  return Object.freeze({
    id: group.id,
    repeatCount: group.sourceEntryIds.length,
    sourceEntryIds: Object.freeze(group.sourceEntryIds.slice()),
    text: group.text,
    time: group.time,
    type: group.type,
    source: group.source,
  });
}

function _sourceCounts(entries) {
  var counts = {};
  entries.forEach(function (entry) {
    counts[entry.source] = (counts[entry.source] || 0) + 1;
  });
  return Object.freeze(counts);
}

export function createLogsWorkspaceSession(options) {
  var opts = options || {};
  var maxEntries = _positiveInteger(opts.maxEntries, DEFAULT_MAX_ENTRIES);
  var recentWindowMs = _positiveInteger(opts.recentWindowMs, DEFAULT_RECENT_WINDOW_MS);
  var aggregationWindowMs = _positiveInteger(opts.aggregationWindowMs, DEFAULT_AGGREGATION_WINDOW_MS);
  var createTime = typeof opts.createTime === 'function'
    ? opts.createTime
    : function () { return new Date(); };
  var entries = [];
  var nextId = 1;
  var unreadCount = 0;
  var resetCount = 0;
  var filterType;
  var timeWindow;
  var aggregationEnabled;

  function _restoreViewDefaults() {
    filterType = 'all';
    timeWindow = 'all';
    aggregationEnabled = true;
  }

  function getEntries() {
    return Object.freeze(entries.slice());
  }

  function getEntry(entryId) {
    var normalizedId = String(entryId == null ? '' : entryId);
    return entries.find(function (entry) { return entry.id === normalizedId; }) || null;
  }

  function getVisibleEntries(options) {
    var query = options || {};
    var now = Number.isFinite(Number(query.now)) ? Number(query.now) : Date.now();
    var visible = entries.filter(function (entry) {
      if (!_matchesFilter(entry, filterType)) return false;
      if (timeWindow !== 'recent') return true;
      var entryTime = _timestamp(entry.time);
      return entryTime !== null && entryTime >= now - recentWindowMs && entryTime <= now;
    });

    if (!aggregationEnabled) return Object.freeze(visible.slice());

    var groups = [];
    visible.forEach(function (entry) {
      var timestamp = _timestamp(entry.time);
      var previous = groups.length > 0 ? groups[groups.length - 1] : null;
      var canAggregate = !!(
        previous
        && previous.type === entry.type
        && previous.source === entry.source
        && previous.text === entry.text
        && timestamp !== null
        && previous.oldestTimestamp !== null
        && Math.abs(previous.oldestTimestamp - timestamp) <= aggregationWindowMs
      );
      if (canAggregate) {
        previous.sourceEntryIds.push(entry.id);
        previous.oldestTimestamp = timestamp;
        return;
      }
      groups.push({
        id: entry.id,
        oldestTimestamp: timestamp,
        sourceEntryIds: [entry.id],
        text: entry.text,
        time: entry.time,
        type: entry.type,
        source: entry.source,
      });
    });
    return Object.freeze(groups.map(_freezeViewEntry));
  }

  function addEntry(value) {
    var input = value || {};
    var message = normalizeLogMessage(input);
    var entry = _copyEntry({
      id: 'message-' + nextId++,
      text: message.text,
      type: message.type,
      source: message.source,
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

  function getDiagnostics(options) {
    return Object.freeze({
      aggregationEnabled: aggregationEnabled,
      aggregationWindowMs: aggregationWindowMs,
      entryCount: entries.length,
      filterType: filterType,
      latestEntryId: entries.length > 0 ? entries[0].id : null,
      maxEntries: maxEntries,
      nextEntryId: 'message-' + nextId,
      recentWindowMs: recentWindowMs,
      resetCount: resetCount,
      sourceCounts: _sourceCounts(entries),
      timeWindow: timeWindow,
      unreadCount: unreadCount,
      visibleEntryCount: getVisibleEntries(options).length,
    });
  }

  function reset() {
    entries = [];
    nextId = 1;
    unreadCount = 0;
    _restoreViewDefaults();
    resetCount += 1;
    return getDiagnostics();
  }

  _restoreViewDefaults();

  return Object.freeze({
    addEntry: addEntry,
    clearUnread: clearUnread,
    getDiagnostics: getDiagnostics,
    getEntries: getEntries,
    getEntry: getEntry,
    getVisibleEntries: getVisibleEntries,
    reset: reset,
    setAggregationEnabled: function (enabled) {
      aggregationEnabled = !!enabled;
      return aggregationEnabled;
    },
    setFilterType: function (value) {
      filterType = _normalizeEnum(value, FILTER_TYPES, 'all');
      return filterType;
    },
    setTimeWindow: function (value) {
      timeWindow = _normalizeEnum(value, TIME_WINDOWS, 'all');
      return timeWindow;
    },
  });
}
