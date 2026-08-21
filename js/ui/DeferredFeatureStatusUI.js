// js/ui/DeferredFeatureStatusUI.js — 延迟工作区的局部加载与恢复呈现
//
// FeatureRegistry 负责资源状态机；本模块只把 loading/error 投影到当前工作区，
// 保留导航与上下文，并提供一个稳定的局部重试入口。

const FEATURE_SURFACES = Object.freeze({
  market: Object.freeze({
    rootId: 'market-overlay',
    hostSelector: '.market-overlay-shell',
    label: '市场中心',
  }),
  fleet: Object.freeze({
    rootId: 'trade-panel',
    hostSelector: '.workspace-terminal-body',
    label: '机库',
  }),
  archive: Object.freeze({
    rootId: 'info-panel',
    hostSelector: '.workspace-terminal-body',
    label: '档案中心',
  }),
  save: Object.freeze({
    rootId: 'settings-panel-data',
    hostSelector: '.settings-save-shell',
    label: '存档管理',
  }),
  settings: Object.freeze({
    rootId: 'settings-modal',
    hostSelector: '.settings-feature-status-host',
    label: '设置中心',
    dismissLabel: '关闭设置',
  }),
});

function _resolveDocument(source) {
  if (typeof source === 'function') return source();
  if (source) return source;
  return typeof document === 'undefined' ? null : document;
}

function _append(parent, child) {
  if (parent && typeof parent.appendChild === 'function') parent.appendChild(child);
}

function _createElement(doc, tagName, className) {
  var element = doc.createElement(tagName);
  if (className) element.className = className;
  return element;
}

export function createDeferredFeatureStatusUI(options) {
  var opts = options || {};
  var records = new Map();
  var loadingCount = 0;
  var errorCount = 0;
  var retryCount = 0;

  function _createRecord(feature) {
    var surface = FEATURE_SURFACES[feature];
    var doc = _resolveDocument(opts.document);
    if (!surface || !doc || typeof doc.getElementById !== 'function' || typeof doc.createElement !== 'function') {
      return null;
    }
    var root = doc.getElementById(surface.rootId);
    var host = root && typeof root.querySelector === 'function'
      ? root.querySelector(surface.hostSelector)
      : null;
    if (!root || !host) return null;

    var panel = _createElement(doc, 'section', 'deferred-feature-status');
    panel.hidden = true;
    panel.setAttribute('tabindex', '-1');
    panel.setAttribute('data-deferred-feature-status', feature);
    panel.setAttribute('aria-live', 'polite');

    var card = _createElement(doc, 'div', 'deferred-feature-status-card');
    var signal = _createElement(doc, 'span', 'deferred-feature-status-signal');
    signal.setAttribute('aria-hidden', 'true');
    var copy = _createElement(doc, 'div', 'deferred-feature-status-copy');
    var title = _createElement(doc, 'strong', 'deferred-feature-status-title');
    var detail = _createElement(doc, 'p', 'deferred-feature-status-detail');
    var actions = _createElement(doc, 'div', 'deferred-feature-status-actions');
    actions.hidden = true;
    var retryButton = _createElement(doc, 'button', 'deferred-feature-retry');
    retryButton.type = 'button';
    retryButton.hidden = true;
    var dismissButton = _createElement(doc, 'button', 'deferred-feature-dismiss');
    dismissButton.type = 'button';
    dismissButton.hidden = true;

    _append(copy, title);
    _append(copy, detail);
    _append(card, signal);
    _append(card, copy);
    _append(actions, retryButton);
    _append(actions, dismissButton);
    _append(card, actions);
    _append(panel, card);
    _append(host, panel);

    var record = {
      feature: feature,
      surface: surface,
      root: root,
      host: host,
      panel: panel,
      signal: signal,
      title: title,
      detail: detail,
      actions: actions,
      retryButton: retryButton,
      dismissButton: dismissButton,
      retry: null,
      dismiss: null,
      onRetry: null,
      onDismiss: null,
    };
    record.onRetry = function (event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof record.retry !== 'function' || record.retryButton.disabled) return;
      var retry = record.retry;
      record.retry = null;
      record.retryButton.disabled = true;
      retryCount += 1;
      try {
        Promise.resolve(retry()).catch(function () {
          showError(feature, retry);
        });
      } catch (error) {
        showError(feature, retry);
      }
    };
    record.onDismiss = function (event) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (typeof record.dismiss !== 'function' || record.dismissButton.disabled) return;
      record.dismiss();
    };
    retryButton.addEventListener('click', record.onRetry);
    dismissButton.addEventListener('click', record.onDismiss);
    records.set(feature, record);
    return record;
  }

  function _record(feature) {
    var existing = records.get(feature);
    if (existing) return existing;
    return _createRecord(feature);
  }

  function _setRootState(record, state) {
    record.root.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
    record.root.setAttribute('data-deferred-feature-state', state);
  }

  function showLoading(feature) {
    var record = _record(feature);
    if (!record) return false;
    record.retry = null;
    record.dismiss = null;
    record.panel.hidden = false;
    record.panel.setAttribute('role', 'status');
    record.panel.setAttribute('aria-live', 'polite');
    record.panel.setAttribute('data-status-tone', 'loading');
    record.signal.textContent = '◌';
    record.title.textContent = '正在连接' + record.surface.label;
    record.detail.textContent = '正在加载界面与数据，请稍候。';
    record.retryButton.hidden = true;
    record.retryButton.disabled = true;
    record.dismissButton.hidden = true;
    record.dismissButton.disabled = true;
    record.actions.hidden = true;
    _setRootState(record, 'loading');
    loadingCount += 1;
    return true;
  }

  function showError(feature, retry, dismiss) {
    var record = _record(feature);
    if (!record) return false;
    record.retry = typeof retry === 'function' ? retry : null;
    record.dismiss = typeof dismiss === 'function' ? dismiss : null;
    record.panel.hidden = false;
    record.panel.setAttribute('role', 'alert');
    record.panel.setAttribute('aria-live', 'assertive');
    record.panel.setAttribute('data-status-tone', 'error');
    record.signal.textContent = '!';
    record.title.textContent = record.surface.label + '暂时不可用';
    record.detail.textContent = '连接未完成。当前工作区与操作上下文已保留。';
    record.retryButton.textContent = '重试' + record.surface.label;
    record.retryButton.hidden = !record.retry;
    record.retryButton.disabled = !record.retry;
    record.dismissButton.textContent = record.surface.dismissLabel || '关闭';
    record.dismissButton.hidden = !record.dismiss;
    record.dismissButton.disabled = !record.dismiss;
    record.actions.hidden = !record.retry && !record.dismiss;
    _setRootState(record, 'error');
    errorCount += 1;
    return true;
  }

  function clear(feature) {
    var record = records.get(feature);
    if (!record) return false;
    record.retry = null;
    record.dismiss = null;
    record.panel.hidden = true;
    record.retryButton.hidden = true;
    record.retryButton.disabled = false;
    record.dismissButton.hidden = true;
    record.dismissButton.disabled = false;
    record.actions.hidden = true;
    record.root.setAttribute('aria-busy', 'false');
    record.root.removeAttribute('data-deferred-feature-state');
    return true;
  }

  function dispose() {
    records.forEach(function (record) {
      record.retry = null;
      record.dismiss = null;
      record.retryButton.removeEventListener('click', record.onRetry);
      record.dismissButton.removeEventListener('click', record.onDismiss);
      record.root.setAttribute('aria-busy', 'false');
      record.root.removeAttribute('data-deferred-feature-state');
      if (record.panel.parentNode && typeof record.panel.parentNode.removeChild === 'function') {
        record.panel.parentNode.removeChild(record.panel);
      }
    });
    records.clear();
    loadingCount = 0;
    errorCount = 0;
    retryCount = 0;
  }

  function getDiagnostics() {
    return Object.freeze({
      activeFeatures: Object.freeze(Array.from(records.keys()).filter(function (feature) {
        return records.get(feature).panel.hidden === false;
      })),
      errorCount: errorCount,
      loadingCount: loadingCount,
      retryCount: retryCount,
    });
  }

  return Object.freeze({
    clear: clear,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    showError: showError,
    showLoading: showLoading,
  });
}

const _defaultUi = createDeferredFeatureStatusUI();

export function showLoading(feature) { return _defaultUi.showLoading(feature); }
export function showError(feature, retry, dismiss) { return _defaultUi.showError(feature, retry, dismiss); }
export function clear(feature) { return _defaultUi.clear(feature); }
export function dispose() { return _defaultUi.dispose(); }
export function getDiagnostics() { return _defaultUi.getDiagnostics(); }
