// js/ui/ArchiveExplorationController.js — 探索档案检查与焦点呈现 DOM 委托

function _findTarget(event, selector) {
  var target = event && event.target;
  return target && typeof target.closest === 'function' ? target.closest(selector) : null;
}

function _escapeSelectorValue(value) {
  var text = String(value == null ? '' : value);
  var cssApi = typeof globalThis !== 'undefined' ? globalThis.CSS : null;
  if (cssApi && typeof cssApi.escape === 'function') return cssApi.escape(text);
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function createArchiveExplorationController(options) {
  var config = options || {};
  var activeContainer = null;
  var bindCount = 0;
  var inspectCount = 0;
  var revealCount = 0;
  var revealSuccessCount = 0;
  var resetCount = 0;
  var lastReportId = null;

  function _releaseBindings() {
    if (!activeContainer) return;
    if (activeContainer.onclick === _handleClick) activeContainer.onclick = null;
    if (activeContainer.onkeydown === _handleKeydown) activeContainer.onkeydown = null;
    activeContainer = null;
  }

  function _inspect(reportId) {
    if (!reportId || typeof config.inspectReport !== 'function') return false;
    inspectCount += 1;
    lastReportId = String(reportId);
    config.inspectReport(lastReportId, 'archive-report-card');
    return true;
  }

  function _handleClick(event) {
    var card = _findTarget(event, '[data-archive-report-id]');
    if (card && card.dataset) _inspect(card.dataset.archiveReportId);
  }

  function _handleKeydown(event) {
    if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
    var card = _findTarget(event, '[data-archive-report-id]');
    if (!card || !card.dataset) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    _inspect(card.dataset.archiveReportId);
  }

  function bind(container) {
    if (!container) return false;
    _releaseBindings();
    activeContainer = container;
    container.onclick = _handleClick;
    container.onkeydown = _handleKeydown;
    bindCount += 1;
    return true;
  }

  function revealFocus(systemId, chainId) {
    revealCount += 1;
    if (!systemId) return false;
    var selector = chainId
      ? ('[data-archive-survey-chain-id="' + _escapeSelectorValue(chainId) + '"][data-archive-survey-system-id="' + _escapeSelectorValue(systemId) + '"]')
      : ('[data-archive-survey-system-id="' + _escapeSelectorValue(systemId) + '"]');
    var target = activeContainer && typeof activeContainer.querySelector === 'function'
      ? activeContainer.querySelector(selector)
      : null;
    var doc = typeof globalThis !== 'undefined' ? globalThis.document : null;
    if (!target && doc && typeof doc.querySelector === 'function') target = doc.querySelector(selector);
    if (!target) return false;
    if (target.classList && typeof target.classList.add === 'function') target.classList.add('is-guide-focus');
    if (typeof target.setAttribute === 'function') target.setAttribute('data-guide-focus', 'true');
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
    revealSuccessCount += 1;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      active: !!activeContainer,
      bindCount: bindCount,
      inspectCount: inspectCount,
      lastReportId: lastReportId,
      resetCount: resetCount,
      revealCount: revealCount,
      revealSuccessCount: revealSuccessCount,
    });
  }

  function reset() {
    _releaseBindings();
    bindCount = 0;
    inspectCount = 0;
    lastReportId = null;
    revealCount = 0;
    revealSuccessCount = 0;
    resetCount += 1;
    return getDiagnostics();
  }

  return Object.freeze({
    bind: bind,
    getDiagnostics: getDiagnostics,
    reset: reset,
    revealFocus: revealFocus,
  });
}
