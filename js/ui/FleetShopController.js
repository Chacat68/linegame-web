// js/ui/FleetShopController.js — 船坞采购 DOM、购买 intent 与焦点诊断 owner

import { createFleetActionPorts } from './FleetCommandAdapter.js';
import {
  buildFleetShopModel,
  readFleetShopIntent,
  renderFleetShop,
} from './FleetShopPresenter.js';

function _resolveDocument(getDocument) {
  if (typeof getDocument === 'function') return getDocument() || null;
  return typeof document !== 'undefined' ? document : null;
}

export function createFleetShopController(options) {
  var ports = options || {};
  var activeContainer = null;
  var activeHandler = null;
  var lastFocusShipTypeId = null;
  var lastIntent = null;
  var renderCount = 0;
  var resetCount = 0;

  function _releaseContainer() {
    if (activeContainer && activeContainer.onclick === activeHandler) activeContainer.onclick = null;
    activeContainer = null;
    activeHandler = null;
  }

  function render(request) {
    var input = request || {};
    if (!input.state) return false;
    var documentRef = _resolveDocument(ports.getDocument);
    var container = documentRef && typeof documentRef.getElementById === 'function'
      ? documentRef.getElementById('shop-list')
      : null;
    if (!container) return false;
    var model = buildFleetShopModel(input.state);
    if (!model) return false;
    var actions = createFleetActionPorts(input.onCommand);
    lastFocusShipTypeId = model.focusEntry && model.focusEntry.type
      ? model.focusEntry.type.id
      : null;
    container.innerHTML = renderFleetShop(model);
    var handler = function (event) {
      var intent = readFleetShopIntent(event && event.target);
      if (!intent) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      lastIntent = Object.freeze(Object.assign({}, intent));
      return actions.onBuyShip(intent.shipTypeId);
    };
    if (activeContainer !== container) _releaseContainer();
    activeContainer = container;
    activeHandler = handler;
    container.onclick = handler;
    renderCount += 1;
    return true;
  }

  function reset() {
    _releaseContainer();
    lastFocusShipTypeId = null;
    lastIntent = null;
    resetCount += 1;
  }

  function getDiagnostics() {
    return Object.freeze({
      focusShipTypeId: lastFocusShipTypeId,
      lastIntent: lastIntent,
      renderCount: renderCount,
      resetCount: resetCount,
    });
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    render: render,
    reset: reset,
  });
}
