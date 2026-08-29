// js/ui/FactionBoardController.js — 派系卡片检查与市场跳转 DOM 委托

function _findTarget(event, selector) {
  var target = event && event.target;
  return target && typeof target.closest === 'function' ? target.closest(selector) : null;
}

export function createFactionBoardController(options) {
  var config = options || {};
  var activeContainer = null;
  var activeContext = null;
  var bindCount = 0;
  var intentCount = 0;
  var resetCount = 0;
  var lastIntent = null;

  function _releaseBindings() {
    if (!activeContainer) return;
    if (activeContainer.onclick === _handleClick) activeContainer.onclick = null;
    if (activeContainer.onkeydown === _handleKeydown) activeContainer.onkeydown = null;
    activeContainer = null;
  }

  function clearContext() {
    var hadContext = !!activeContext;
    _releaseBindings();
    activeContext = null;
    return hadContext;
  }

  function _inspectFaction(factionId) {
    if (!factionId || typeof config.inspectFaction !== 'function') return false;
    config.inspectFaction(factionId, 'archive-faction-card');
    return true;
  }

  function _readMarketAction(button) {
    return {
      actionId: 'market',
      factionId: button.dataset.factionId,
      factionName: button.dataset.factionName,
      systemId: button.dataset.systemId,
      systemName: button.dataset.systemName,
      marketWorkspaceId: button.dataset.marketWorkspaceId,
      marketSubworkspaceId: button.dataset.marketSubworkspaceId,
      marketFocusLabel: button.dataset.marketFocusLabel,
      marketMode: button.dataset.marketMode || '',
      hint: button.dataset.marketHint || '',
      contextHint: button.dataset.marketHint || '',
      label: button.dataset.commandVerb || String(button.textContent || '').trim(),
      commandSurface: button.dataset.commandSurface || 'market',
      commandIntent: button.dataset.commandIntent || '',
      commandVerb: button.dataset.commandVerb || '',
    };
  }

  function _recordIntent(intent) {
    intentCount += 1;
    lastIntent = intent;
  }

  function _handleClick(event) {
    if (!activeContext) return;
    var marketButton = _findTarget(event, '[data-faction-market="true"]');
    if (marketButton) {
      _recordIntent('faction.market.open');
      if (typeof activeContext.onOpenFactionMarket === 'function') {
        activeContext.onOpenFactionMarket(_readMarketAction(marketButton));
      }
      _inspectFaction(marketButton.dataset.factionId);
      return;
    }
    var card = _findTarget(event, '.faction-card[data-faction-id]');
    if (!card) return;
    _recordIntent('faction.inspect');
    _inspectFaction(card.dataset.factionId);
  }

  function _handleKeydown(event) {
    if (!event || (event.key !== 'Enter' && event.key !== ' ')) return;
    if (_findTarget(event, 'button')) return;
    var card = _findTarget(event, '.faction-card[data-faction-id]');
    if (!card) return;
    if (typeof event.preventDefault === 'function') event.preventDefault();
    _recordIntent('faction.inspect');
    _inspectFaction(card.dataset.factionId);
  }

  function bind(container, request) {
    if (!container) return false;
    clearContext();
    activeContainer = container;
    activeContext = { onOpenFactionMarket: request && request.onOpenFactionMarket };
    container.onclick = _handleClick;
    container.onkeydown = _handleKeydown;
    bindCount += 1;
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      bindCount: bindCount,
      intentCount: intentCount,
      resetCount: resetCount,
      lastIntent: lastIntent,
      activeContext: activeContext ? Object.freeze({ hasMarketAction: typeof activeContext.onOpenFactionMarket === 'function' }) : null,
    });
  }

  function reset() {
    clearContext();
    bindCount = 0;
    intentCount = 0;
    lastIntent = null;
    resetCount += 1;
    return getDiagnostics();
  }

  return Object.freeze({
    bind: bind,
    clearContext: clearContext,
    getDiagnostics: getDiagnostics,
    reset: reset,
  });
}
