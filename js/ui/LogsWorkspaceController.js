// js/ui/LogsWorkspaceController.js — 通讯日志会话、筛选、列表 DOM 与 Context 协调

import { createLogsWorkspaceSession } from './LogsWorkspaceSession.js';

const DEFAULT_EMPTY_MESSAGE = '暂无通讯记录。完成航行、交易或系统行动后，记录会显示在这里。';
const DEFAULT_FILTERED_MESSAGE = '当前筛选没有匹配记录。调整类型或时间范围后再查看。';

function _formatTime(value) {
  var date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map(function (part) {
    return String(part).padStart(2, '0');
  }).join(':');
}

export function createLogsWorkspaceController(options) {
  var opts = options || {};
  var contextInspector = opts.contextInspector || {};
  var session = opts.session || createLogsWorkspaceSession({ maxEntries: opts.maxEntries || 200 });
  var typeLabels = opts.typeLabels || {};
  var sourceLabels = opts.sourceLabels || {};
  var listenerRecords = [];
  var disposed = false;

  function _bind(target, eventName, listener, marker) {
    if (!target || typeof target.addEventListener !== 'function') return false;
    if (marker && target.dataset && target.dataset[marker] === 'true') return false;
    target.addEventListener(eventName, listener);
    if (marker && target.dataset) target.dataset[marker] = 'true';
    listenerRecords.push({
      eventName: eventName,
      listener: listener,
      marker: marker || null,
      target: target,
    });
    return true;
  }

  function _document() {
    return typeof document !== 'undefined' ? document : null;
  }

  function _normalizeType(type) {
    var normalized = typeof type === 'string' ? type.trim().toLowerCase() : 'info';
    return Object.prototype.hasOwnProperty.call(typeLabels, normalized) ? normalized : 'info';
  }

  function _setBadgeValue(id, count, labelPrefix) {
    var doc = _document();
    var element = doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
    if (!element) return;
    var value = Math.max(0, Number(count) || 0);
    element.hidden = value <= 0;
    element.textContent = value > 99 ? '99+' : String(value);
    element.title = labelPrefix ? labelPrefix + '：' + value : String(value);
  }

  function _updateNavBadge() {
    var doc = _document();
    if (!doc) return;
    var unreadCount = session.getDiagnostics().unreadCount;
    _setBadgeValue('logs-nav-badge', unreadCount, '未读通讯');
    var logsButton = typeof doc.querySelector === 'function'
      ? doc.querySelector('.bottom-nav-btn[data-view="logs"]')
      : null;
    if (!logsButton || typeof logsButton.setAttribute !== 'function') return;
    if (unreadCount > 0) {
      var label = '通讯日志，' + unreadCount + ' 条新消息';
      logsButton.title = label;
      logsButton.setAttribute('aria-label', label);
    } else {
      logsButton.title = '通讯日志';
      logsButton.setAttribute('aria-label', '通讯日志');
    }
  }

  function _syncFilterControls(diagnostics) {
    var doc = _document();
    if (!doc || typeof doc.getElementById !== 'function') return;
    var snapshot = diagnostics || session.getDiagnostics();
    var typeFilter = doc.getElementById('logs-type-filter');
    var timeFilter = doc.getElementById('logs-time-filter');
    var aggregationToggle = doc.getElementById('logs-aggregate-toggle');
    if (typeFilter) typeFilter.value = snapshot.filterType;
    if (timeFilter) timeFilter.value = snapshot.timeWindow;
    if (aggregationToggle) aggregationToggle.checked = snapshot.aggregationEnabled;
  }

  function _updateFeedSummary(totalCount, visibleCount) {
    var doc = _document();
    var summary = doc && typeof doc.getElementById === 'function'
      ? doc.getElementById('logs-feed-summary')
      : null;
    if (!summary) return;
    summary.textContent = visibleCount === totalCount
      ? totalCount + ' 条记录'
      : visibleCount + ' / ' + totalCount + ' 条记录';
  }

  function _bindFilters() {
    var doc = _document();
    if (!doc || typeof doc.getElementById !== 'function') return false;
    var typeFilter = doc.getElementById('logs-type-filter');
    var timeFilter = doc.getElementById('logs-time-filter');
    var aggregationToggle = doc.getElementById('logs-aggregate-toggle');
    var controls = [typeFilter, timeFilter, aggregationToggle].filter(Boolean);
    if (controls.length === 0) return false;

    if (typeFilter) {
      _bind(typeFilter, 'change', function () {
        session.setFilterType(typeFilter.value);
        refresh();
      }, 'logsFilterBound');
    }
    if (timeFilter) {
      _bind(timeFilter, 'change', function () {
        session.setTimeWindow(timeFilter.value);
        refresh();
      }, 'logsFilterBound');
    }
    if (aggregationToggle) {
      _bind(aggregationToggle, 'change', function () {
        session.setAggregationEnabled(aggregationToggle.checked);
        refresh();
      }, 'logsFilterBound');
    }
    _syncFilterControls(session.getDiagnostics());
    return true;
  }

  function _buildMessageElement(entry, selectedContext) {
    var doc = _document();
    var button = doc.createElement('button');
    var isSelected = !!(
      selectedContext && selectedContext.type === 'message'
      && String(selectedContext.id) === String(entry.id)
    );
    var category = typeLabels[entry.type] || typeLabels.info || '系统';
    var sourceLabel = sourceLabels[entry.source] || sourceLabels.system || '系统';
    var repeatText = entry.repeatCount > 1 ? '，短时重复 ' + entry.repeatCount + ' 次' : '';
    button.type = 'button';
    button.className = 'msg msg-' + entry.type + (isSelected ? ' is-selected' : '');
    button.dataset.logEntryId = entry.id;
    button.dataset.logSource = entry.source;
    button.dataset.logType = entry.type;
    button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    button.setAttribute('aria-label', '检查' + sourceLabel + ' · ' + category + '记录：' + entry.text + repeatText);

    var meta = doc.createElement('span');
    meta.className = 'log-message-meta';
    var time = doc.createElement('time');
    time.className = 'log-message-time';
    time.dateTime = entry.time instanceof Date ? entry.time.toISOString() : '';
    time.textContent = _formatTime(entry.time);
    var kind = doc.createElement('span');
    kind.className = 'log-message-kind';
    kind.textContent = sourceLabel;
    var categoryTag = doc.createElement('span');
    categoryTag.className = 'log-message-category';
    categoryTag.textContent = category;
    var message = doc.createElement('span');
    message.className = 'log-message-text';
    message.textContent = entry.text;
    meta.appendChild(time);
    meta.appendChild(kind);
    meta.appendChild(categoryTag);
    if (entry.repeatCount > 1) {
      var repeat = doc.createElement('span');
      repeat.className = 'log-message-repeat';
      repeat.textContent = '×' + entry.repeatCount;
      repeat.setAttribute('aria-hidden', 'true');
      meta.appendChild(repeat);
    }
    button.appendChild(meta);
    button.appendChild(message);
    return button;
  }

  function _syncSelectionUi(selectedId) {
    var doc = _document();
    if (!doc || typeof doc.querySelectorAll !== 'function') return;
    Array.from(doc.querySelectorAll('#message-log [data-log-entry-id]')).forEach(function (button) {
      var selected = button && button.dataset && String(button.dataset.logEntryId) === String(selectedId);
      if (button && button.classList) button.classList.toggle('is-selected', selected);
      if (button && typeof button.setAttribute === 'function') {
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      }
    });
  }

  function _selectEntry(entryId, focusOrigin) {
    var entry = session.getEntry(entryId);
    if (!entry) return false;
    contextInspector.replaceContext({
      workspaceId: 'logs',
      type: 'message',
      id: entry.id,
      source: 'logs-feed',
      revision: contextInspector.getCurrentRevision(),
    });
    contextInspector.open({
      workspaceId: 'logs',
      focus: false,
      restoreFocusTo: focusOrigin || null,
    });
    _syncSelectionUi(entry.id);
    return true;
  }

  function _bindSelection(log) {
    if (!log) return;
    _bind(log, 'click', function (event) {
      var target = event && event.target;
      var entryButton = target && typeof target.closest === 'function'
        ? target.closest('[data-log-entry-id]')
        : null;
      if (!entryButton || (typeof log.contains === 'function' && !log.contains(entryButton))) return;
      _selectEntry(entryButton.dataset.logEntryId, entryButton);
    }, 'logSelectionBound');
  }

  function _reconcileContext() {
    var context = contextInspector.getContext('logs');
    if (context && !session.getEntry(context.id)) contextInspector.clearContext('logs');
  }

  function refresh() {
    var doc = _document();
    if (!doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') return false;
    var log = doc.getElementById('message-log');
    if (!log) return false;
    _bindSelection(log);
    _bindFilters();
    if (typeof log.replaceChildren === 'function') log.replaceChildren();
    else log.innerHTML = '';

    var entries = session.getVisibleEntries();
    var diagnostics = session.getDiagnostics();
    _updateFeedSummary(diagnostics.entryCount, entries.length);
    if (entries.length === 0) {
      var empty = doc.createElement('div');
      empty.className = 'msg msg-info log-empty-state';
      empty.textContent = diagnostics.entryCount > 0
        ? (opts.filteredMessage || DEFAULT_FILTERED_MESSAGE)
        : (opts.emptyMessage || DEFAULT_EMPTY_MESSAGE);
      log.appendChild(empty);
      return true;
    }
    var selectedContext = contextInspector.getContext('logs');
    entries.forEach(function (entry) {
      log.appendChild(_buildMessageElement(entry, selectedContext));
    });
    return true;
  }

  function addMessage(message, type, source) {
    var input = message && typeof message === 'object'
      ? Object.assign({}, message)
      : { text: String(message == null ? '' : message), type: type, source: source };
    input.type = _normalizeType(input.type);
    session.addEntry(input);
    _reconcileContext();
    _updateNavBadge();
    refresh();
    if (typeof opts.onHistoryChanged === 'function') {
      opts.onHistoryChanged({ count: session.getDiagnostics().entryCount });
    }
  }

  function clearUnreadCount() {
    session.clearUnread();
    _updateNavBadge();
  }

  function initialize() {
    disposed = false;
    _bindFilters();
    _updateNavBadge();
    return refresh();
  }

  function getDiagnostics(extra) {
    var context = contextInspector.getContext('logs');
    return Object.freeze(Object.assign({}, session.getDiagnostics(), extra || {}, {
      disposed: disposed,
      listenerCount: listenerRecords.length,
      selectedMessageId: context && context.type === 'message' ? context.id : null,
    }));
  }

  function dispose() {
    if (disposed && listenerRecords.length === 0) return false;
    listenerRecords.forEach(function (record) {
      if (record.target && typeof record.target.removeEventListener === 'function') {
        record.target.removeEventListener(record.eventName, record.listener);
      }
      if (record.marker && record.target && record.target.dataset) {
        delete record.target.dataset[record.marker];
      }
    });
    listenerRecords = [];
    disposed = true;
    return true;
  }

  function reset() {
    session.reset();
    contextInspector.clearContext('logs', { render: false });
    _syncFilterControls(session.getDiagnostics());
    _updateNavBadge();
    refresh();
    if (typeof opts.onHistoryChanged === 'function') {
      opts.onHistoryChanged({ count: 0, reason: 'session-reset' });
    }
    return getDiagnostics();
  }

  return Object.freeze({
    addMessage: addMessage,
    clearUnreadCount: clearUnreadCount,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    initialize: initialize,
    refresh: refresh,
    renderContextInspector: function (request) {
      return typeof opts.renderContext === 'function'
        ? opts.renderContext(request, session.getEntries(), typeLabels, sourceLabels)
        : false;
    },
    renderWorkspaceDetail: function (request) {
      return typeof opts.renderDetail === 'function'
        ? opts.renderDetail(request, session.getEntries(), typeLabels, sourceLabels)
        : false;
    },
    reset: reset,
  });
}
