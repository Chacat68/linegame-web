// js/ui/FleetHangarController.js — 机库选择、DOM 委托、Context 与子界面协调 owner

import {
  FLEET_HANGAR_INTENT,
  buildFleetHangarModel,
  readFleetHangarIntent,
  renderFleetHangar,
} from './FleetHangarPresenter.js';
import { createFleetActionPorts } from './FleetCommandAdapter.js';

function _resolveDocument(getDocument) {
  if (typeof getDocument === 'function') return getDocument() || null;
  return typeof document !== 'undefined' ? document : null;
}

function _focusElement(target) {
  if (!target || typeof target.focus !== 'function' || target.disabled || target.isConnected === false) return;
  try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
}

function _copyIntent(intent) {
  return intent ? Object.freeze(Object.assign({}, intent)) : null;
}

export function createFleetHangarController(options) {
  var ports = options || {};
  var inspectedShipIndex = null;
  var activeContainer = null;
  var activeHandler = null;
  var lastIntent = null;
  var renderCount = 0;
  var selectionCount = 0;
  var resetCount = 0;

  function _getActiveInlineModalId() {
    return typeof ports.getActiveInlineModalId === 'function'
      ? ports.getActiveInlineModalId()
      : null;
  }

  function _replaceContext(shipIndex, source, render) {
    if (typeof ports.replaceContext !== 'function') return false;
    var revision = typeof ports.getContextRevision === 'function'
      ? ports.getContextRevision()
      : undefined;
    return ports.replaceContext({
      type: 'ship',
      id: String(shipIndex),
      workspaceId: 'fleet',
      source: source,
      revision: revision,
    }, render === false ? { render: false } : undefined);
  }

  function _releaseContainer() {
    if (activeContainer && activeContainer.onclick === activeHandler) activeContainer.onclick = null;
    activeContainer = null;
    activeHandler = null;
  }

  function _open(portName, request) {
    return typeof ports[portName] === 'function' ? ports[portName](request) : false;
  }

  function render(request) {
    var input = request || {};
    var state = input.state;
    if (!state || _getActiveInlineModalId() !== null) return false;
    var documentRef = _resolveDocument(ports.getDocument);
    var container = documentRef && typeof documentRef.getElementById === 'function'
      ? documentRef.getElementById('fleet-list')
      : null;
    if (!container) return false;

    var actions = createFleetActionPorts(input.onCommand);
    var model = buildFleetHangarModel(state, inspectedShipIndex);
    if (!model) return false;
    inspectedShipIndex = model.inspectedIdx;
    if (model.inspectedIdx !== null) _replaceContext(model.inspectedIdx, 'hangar-selection', false);

    container.innerHTML = renderFleetHangar(model);
    var handler = function (event) {
      var intent = readFleetHangarIntent(event && event.target);
      if (!intent) return;
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      lastIntent = _copyIntent(intent);

      if (intent.type === FLEET_HANGAR_INTENT.INSPECT_SHIP) {
        if (!model.fleet[intent.shipIndex] || intent.shipIndex === inspectedShipIndex) return;
        inspectedShipIndex = intent.shipIndex;
        selectionCount += 1;
        _replaceContext(intent.shipIndex, 'hangar-ship-selector');
        render(input);
        Promise.resolve().then(function () {
          if (!container || typeof container.querySelector !== 'function') return;
          _focusElement(container.querySelector('.hangar-ship-select[data-ship-index="' + intent.shipIndex + '"]'));
        });
        return;
      }
      if (intent.type === FLEET_HANGAR_INTENT.BUY_SLOT) return actions.onBuySlot();
      if (intent.type === FLEET_HANGAR_INTENT.SWITCH_SHIP) return actions.onSwitchShip(intent.shipIndex);
      if (intent.type === FLEET_HANGAR_INTENT.OPEN_MODS) {
        return _open('openMod', {
          state: state,
          shipIndex: intent.shipIndex,
          onInstallMod: actions.onInstallMod,
          onUninstallMod: actions.onUninstallMod,
          onUpgradeShip: actions.onUpgradeShip,
          onServiceShip: actions.onServiceShip,
          onSellShip: actions.onSellShip,
        });
      }
      if (intent.type === FLEET_HANGAR_INTENT.OPEN_CREW) {
        return _open('openCrew', {
          state: state,
          shipIndex: intent.shipIndex,
          onRecruitCrew: actions.onRecruitCrew,
          onAssignCrew: actions.onAssignCrew,
          onUnassignCrew: actions.onUnassignCrew,
          onDismissCrew: actions.onDismissCrew,
          onSwitchShip: actions.onSwitchShip,
        });
      }
      if (intent.type === FLEET_HANGAR_INTENT.OPEN_DISPATCH) {
        return _open('openDispatch', {
          state: state,
          shipIndex: intent.shipIndex,
          onAssignRoute: actions.onAssignRoute,
          onCancelRoute: actions.onCancelRoute,
        });
      }
      if (intent.type === FLEET_HANGAR_INTENT.CANCEL_ROUTE) return actions.onCancelRoute(intent.shipIndex);
    };

    if (activeContainer !== container) _releaseContainer();
    activeContainer = container;
    activeHandler = handler;
    container.onclick = handler;
    renderCount += 1;
    return true;
  }

  function setInspectedShipIndex(shipIndex) {
    inspectedShipIndex = Number.isInteger(shipIndex) ? shipIndex : null;
    return inspectedShipIndex;
  }

  function reset() {
    _releaseContainer();
    inspectedShipIndex = null;
    lastIntent = null;
    resetCount += 1;
  }

  function getDiagnostics() {
    return Object.freeze({
      inspectedShipIndex: Number.isInteger(inspectedShipIndex) ? inspectedShipIndex : null,
      lastIntent: lastIntent,
      renderCount: renderCount,
      resetCount: resetCount,
      selectionCount: selectionCount,
    });
  }

  return Object.freeze({
    getDiagnostics: getDiagnostics,
    getInspectedShipIndex: function () {
      return Number.isInteger(inspectedShipIndex) ? inspectedShipIndex : null;
    },
    render: render,
    reset: reset,
    setInspectedShipIndex: setInspectedShipIndex,
  });
}
