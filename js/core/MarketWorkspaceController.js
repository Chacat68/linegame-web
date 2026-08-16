// js/core/MarketWorkspaceController.js — 市场 open/black 模式与渲染入口生命周期
//
// MapUI 只决定当前查看的星球/星系；本 controller 持有市场类型、延迟加载、
// pending focus 恢复和稳定容器事件委托，避免 GameManager clone DOM listener。

import { buildCommandFeedback } from '../ui/CommandAction.js';
import { getRemoteMarketFocusCompletion } from './ActionGuideCompletion.js';

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
  var Modal = deps.Modal || {};
  var Tutorial = deps.Tutorial || {};
  var systems = Array.isArray(deps.systems) ? deps.systems : [];
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
  var emitLog = typeof deps.emitLog === 'function' ? deps.emitLog : function () {};
  var invalidate = typeof deps.invalidate === 'function' ? deps.invalidate : function () {};
  var showCompletion = typeof deps.showCompletion === 'function' ? deps.showCompletion : function () {};

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

  function _openTradeModal(action, good, marketType, options) {
    var state = getState();
    if (!state || !good || typeof Modal.openTradeModal !== 'function') return false;
    Modal.openTradeModal(action, good, state, marketType, options);
    return true;
  }

  function openBuy(good) {
    var tutorialActive = typeof Tutorial.isActive === 'function' && Tutorial.isActive();
    return _openTradeModal('buy', good, 'open', tutorialActive ? { initialQuantity: 10 } : undefined);
  }

  function openSell(good) {
    var state = getState();
    var tutorialActive = typeof Tutorial.isActive === 'function' && Tutorial.isActive();
    var options = tutorialActive
      ? { initialQuantity: Math.max(1, (state && state.cargo && state.cargo[good && good.id]) || 1) }
      : undefined;
    return _openTradeModal('sell', good, 'open', options);
  }

  function openBlackMarketBuy(good) {
    return _openTradeModal('buy', good, 'black');
  }

  function openBlackMarketSell(good) {
    return _openTradeModal('sell', good, 'black');
  }

  function focusRemoteSystem(systemId) {
    var state = getState();
    var system = systems.find(function (entry) { return entry.id === systemId; });
    var focused = !!(state && system && typeof MapUI.focusNavigationTarget === 'function' &&
      MapUI.focusNavigationTarget(state, systemId, {
        title: '前往「' + system.name + '」处理市场操作',
      }));

    emitLog({
      text: buildCommandFeedback({
        actionId: 'navigation',
        commandSurface: 'navigation',
        commandIntent: focused ? '远程市场航点' : '星图',
        label: focused ? '设为航点' : '查看星图',
      }, {
        icon: '🧭',
        destination: focused && system ? ('星图 · ' + system.name) : '星图 · 航线判断',
        nextStep: focused ? '在目标详情面板确认航行条件' : '手动选择可达目的地',
        returnTo: '抵达后回到市场执行交易、补给或本地经营',
      }),
      type: focused ? 'tip' : 'error',
    });
    invalidate();
    if (focused) showCompletion(getRemoteMarketFocusCompletion());
    return focused;
  }

  function createFinanceActions(commerceActions) {
    var actions = commerceActions || {};
    return {
      onTakeLoan: actions.onTakeLoan,
      onRepayLoan: actions.onRepayLoan,
      onInvestTradeStation: actions.onInvestTradeStation,
      onRedeemTradeStationInvestment: actions.onRedeemTradeStationInvestment,
      onBatchInvestTradeStations: actions.onBatchInvestTradeStations,
      onBuildTradeStation: actions.onBuildTradeStation,
      onUpgradeTradeStation: actions.onUpgradeTradeStation,
      onSetTradeStationStrategy: actions.onSetTradeStationStrategy,
      onBatchUpgradeTradeStations: actions.onBatchUpgradeTradeStations,
      onBatchSetTradeStationStrategy: actions.onBatchSetTradeStationStrategy,
      onFocusRemoteSystem: focusRemoteSystem,
    };
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
    createFinanceActions: createFinanceActions,
    dispose: dispose,
    focusRemoteSystem: focusRemoteSystem,
    getDiagnostics: getDiagnostics,
    getMode: getMode,
    openBlackMarketBuy: openBlackMarketBuy,
    openBlackMarketSell: openBlackMarketSell,
    openBuy: openBuy,
    openSell: openSell,
    refresh: refresh,
    reset: reset,
    syncAfterRender: syncAfterRender,
  });
}
