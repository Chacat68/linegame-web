// js/ui/MarketSelectionController.js — 市场商品选择与 Context 的唯一会话 owner
// 不绑定 DOM；商品列表、行情榜和程序化入口共用同一个选择端口。

function _normalizeId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function _findGood(goodsList, goodId) {
  var normalizedGoodId = _normalizeId(goodId);
  if (!normalizedGoodId) return null;
  return goodsList.find(function (good) { return good && good.id === normalizedGoodId; }) || null;
}

export function createMarketSelectionController(options) {
  var opts = options || {};
  var session = opts.session;
  var syncCount = 0;
  var focusRequestCount = 0;
  var focusChangeCount = 0;
  var contextPublishCount = 0;
  var fallbackCount = 0;
  var rerenderRequestCount = 0;
  var lastFocusedGoodId = null;
  var lastFocusKey = null;
  var lastSource = null;
  var lastSyncedFocusKey = null;

  function getRevision() {
    return typeof opts.getCurrentContextRevision === 'function'
      ? opts.getCurrentContextRevision()
      : 0;
  }

  function getTradeContext() {
    return typeof opts.getContext === 'function' ? opts.getContext('trade') : null;
  }

  function publishContext(goodId, source, revision) {
    if (!goodId || typeof opts.replaceContext !== 'function') return false;
    opts.replaceContext({
      type: 'commodity',
      id: goodId,
      workspaceId: 'trade',
      source: source,
      revision: revision,
    });
    contextPublishCount += 1;
    lastFocusedGoodId = goodId;
    lastSource = source;
    return true;
  }

  function shouldPublishSyncContext(focusKey, goodId, revision) {
    if (lastSyncedFocusKey !== focusKey) return true;
    var current = getTradeContext();
    if (!current) return true;
    return current.type !== 'commodity' ||
      current.id !== goodId ||
      Number(current.revision) !== Number(revision);
  }

  function resolveFocusedGood(request) {
    var input = request || {};
    var goodsList = Array.isArray(input.goodsList) ? input.goodsList : [];
    var focusKey = _normalizeId(input.focusKey);
    var requestedGoodId = _normalizeId(input.focusedGoodId) ||
      (focusKey ? session.getFocusedGood(focusKey) : '');
    var focusedGood = _findGood(goodsList, requestedGoodId);
    if (!focusedGood && requestedGoodId && goodsList.length > 0) fallbackCount += 1;
    return focusedGood || goodsList[0] || null;
  }

  function sync(request) {
    var input = request || {};
    var focusKey = _normalizeId(input.focusKey);
    var good = resolveFocusedGood(input);
    var activeGoodId = good ? good.id : null;
    if (focusKey) session.setFocusedGood(focusKey, activeGoodId || '');

    syncCount += 1;
    lastFocusedGoodId = activeGoodId;
    lastFocusKey = focusKey || null;
    if (activeGoodId) {
      var revision = getRevision();
      if (shouldPublishSyncContext(focusKey, activeGoodId, revision)) {
        publishContext(activeGoodId, input.source || 'market-workspace', revision);
      }
    }
    lastSyncedFocusKey = focusKey || null;
    return activeGoodId;
  }

  function focus(request) {
    var input = request || {};
    var goodsList = Array.isArray(input.goodsList) ? input.goodsList : [];
    var focusKey = _normalizeId(input.focusKey);
    var good = _findGood(goodsList, input.goodId);
    if (!focusKey || !good) return false;

    var previousGoodId = session.getFocusedGood(focusKey);
    var changed = previousGoodId !== good.id;
    session.setFocusedGood(focusKey, good.id);
    focusRequestCount += 1;
    if (changed) focusChangeCount += 1;
    lastFocusedGoodId = good.id;
    lastFocusKey = focusKey;
    lastSyncedFocusKey = focusKey;
    publishContext(good.id, input.source || 'market-selection', getRevision());

    if (changed && typeof input.rerenderSpot === 'function') {
      rerenderRequestCount += 1;
      input.rerenderSpot();
    }
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      syncCount: syncCount,
      focusRequestCount: focusRequestCount,
      focusChangeCount: focusChangeCount,
      contextPublishCount: contextPublishCount,
      fallbackCount: fallbackCount,
      rerenderRequestCount: rerenderRequestCount,
      lastFocusedGoodId: lastFocusedGoodId,
      lastFocusKey: lastFocusKey,
      lastSource: lastSource,
    });
  }

  function reset() {
    syncCount = 0;
    focusRequestCount = 0;
    focusChangeCount = 0;
    contextPublishCount = 0;
    fallbackCount = 0;
    rerenderRequestCount = 0;
    lastFocusedGoodId = null;
    lastFocusKey = null;
    lastSource = null;
    lastSyncedFocusKey = null;
    return getDiagnostics();
  }

  return Object.freeze({
    focus: focus,
    getDiagnostics: getDiagnostics,
    getFocusedGood: function (focusKey) { return session.getFocusedGood(focusKey); },
    reset: reset,
    sync: sync,
  });
}
