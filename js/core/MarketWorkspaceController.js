// js/core/MarketWorkspaceController.js — 市场 open/black 模式与渲染入口生命周期
//
// MapUI 只决定当前查看的星球/星系；本 controller 持有市场类型、延迟加载、
// pending focus 恢复和稳定容器事件委托，避免 GameManager clone DOM listener。

function _requiredFunction(value, label) {
  if (typeof value !== 'function') throw new TypeError('MarketWorkspaceController requires ' + label + '.');
  return value;
}

function _normalizeMode(mode) {
  return mode === 'black' ? 'black' : 'open';
}

export function createMarketWorkspaceController(dependencies) {
  var deps = dependencies || {};
  var MapUI = deps.MapUI || {};
  var getState = _requiredFunction(deps.getState, 'getState');
  var loadMarket = _requiredFunction(deps.loadMarket, 'loadMarket');
  var renderMarket = _requiredFunction(deps.renderMarket, 'renderMarket');
  var getSessionToken = typeof deps.getSessionToken === 'function'
    ? deps.getSessionToken
    : function () { return null; };
  var isSessionTokenCurrent = typeof deps.isSessionTokenCurrent === 'function'
    ? deps.isSessionTokenCurrent
    : function () { return true; };
  var getDocument = typeof deps.getDocument === 'function'
    ? deps.getDocument
    : function () { return typeof document === 'undefined' ? null : document; };

  var mode = 'open';
  var eventRoot = null;
  var eventHandler = null;
  var refreshCount = 0;
  var modeChangeCount = 0;

  function getMode() {
    return mode;
  }

  function _isCurrent(state, token) {
    return state === getState() && isSessionTokenCurrent(token);
  }

  function _getViewSystem(state) {
    return typeof MapUI.getMarketViewSystem === 'function'
      ? MapUI.getMarketViewSystem(state)
      : state.currentSystem;
  }

  function _consumePendingFocus() {
    return typeof MapUI.consumePendingMarketPanelFocus === 'function'
      ? MapUI.consumePendingMarketPanelFocus()
      : null;
  }

  function refresh(options) {
    var opts = options || {};
    var state = getState();
    var token = getSessionToken();
    return Promise.resolve(loadMarket()).then(function (MarketUI) {
      if (!MarketUI || !_isCurrent(state, token)) return false;

      var pendingFocus = opts.consumePendingFocus === false ? null : _consumePendingFocus();
      var requestedMode = pendingFocus && pendingFocus.marketMode
        ? pendingFocus.marketMode
        : (Object.prototype.hasOwnProperty.call(opts, 'mode') ? opts.mode : mode);
      mode = _normalizeMode(requestedMode);
      var systemId = _getViewSystem(state);

      if (pendingFocus && pendingFocus.goodId && typeof MarketUI.setFocusedMarketGood === 'function') {
        MarketUI.setFocusedMarketGood(systemId, mode, pendingFocus.goodId);
      }
      if (typeof MarketUI.showDetail === 'function') MarketUI.showDetail(systemId, mode);
      renderMarket(MarketUI, state);
      if (pendingFocus && typeof MarketUI.setMarketWorkspaceFocus === 'function') {
        MarketUI.setMarketWorkspaceFocus(pendingFocus);
      }
      refreshCount += 1;
      return true;
    });
  }

  function _releaseModeEvents() {
    if (eventRoot && eventHandler && typeof eventRoot.removeEventListener === 'function') {
      eventRoot.removeEventListener('click', eventHandler);
    }
    if (eventRoot && eventRoot.dataset) delete eventRoot.dataset.marketModeEventsBound;
    eventRoot = null;
    eventHandler = null;
  }

  function bindModeEvents() {
    var doc = getDocument();
    var root = doc && typeof doc.getElementById === 'function'
      ? doc.getElementById('market-overlay')
      : null;
    if (!root || typeof root.addEventListener !== 'function') return false;
    if (root === eventRoot && eventHandler) return true;

    _releaseModeEvents();
    eventRoot = root;
    eventHandler = function (event) {
      var target = event && event.target;
      var button = target && typeof target.closest === 'function'
        ? target.closest('.market-mode-btn:not(.disabled)')
        : null;
      if (!button || (typeof root.contains === 'function' && !root.contains(button)) || button.disabled) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      var nextMode = _normalizeMode(button.dataset && button.dataset.mode);
      if (nextMode !== mode) modeChangeCount += 1;
      mode = nextMode;
      refresh({ mode: mode, consumePendingFocus: false });
    };
    if (root.dataset) root.dataset.marketModeEventsBound = 'true';
    root.addEventListener('click', eventHandler);
    return true;
  }

  function syncAfterRender() {
    return bindModeEvents();
  }

  function reset() {
    mode = 'open';
  }

  function dispose() {
    _releaseModeEvents();
    mode = 'open';
  }

  function getDiagnostics() {
    return Object.freeze({
      eventsBound: !!eventRoot,
      mode: mode,
      modeChangeCount: modeChangeCount,
      refreshCount: refreshCount,
    });
  }

  return Object.freeze({
    bindModeEvents: bindModeEvents,
    dispose: dispose,
    getDiagnostics: getDiagnostics,
    getMode: getMode,
    refresh: refresh,
    reset: reset,
    syncAfterRender: syncAfterRender,
  });
}
