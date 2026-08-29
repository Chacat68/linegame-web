// js/ui/FleetUI.js — 船队管理 UI（含席位系统）
// 依赖：机库/采购 Presenter、Crew/Mod/Dispatch/Portal/Detail Controller 与 typed command adapter
// 导出：工作区 render、Context/L4 adapter、二级界面 facade 与 diagnostics

import { hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js';
import * as EventBus from '../core/EventBus.js';
import * as ActionConfirmUI from './ActionConfirmUI.js';
import * as ContextInspector from './ContextInspector.js';
import {
  FLEET_HANGAR_INTENT,
  buildFleetHangarModel,
  readFleetHangarIntent,
  renderFleetHangar,
} from './FleetHangarPresenter.js';
import { createFleetCrewController } from './FleetCrewController.js';
import { createFleetModController } from './FleetModController.js';
import { createFleetDispatchController } from './FleetDispatchController.js';
import { createFleetInlinePortalController } from './FleetInlinePortalController.js';
import { createFleetShipDetailController } from './FleetShipDetailController.js';
import { createFleetActionPorts } from './FleetCommandAdapter.js';
import {
  buildFleetShopModel,
  readFleetShopIntent,
  renderFleetShop,
} from './FleetShopPresenter.js';
let _activeFleetConfirmation = null;
let _inspectedHangarShipIndex = null;
let _lifecycleActions = null;
let _fleetRuntimeResetCount = 0;
const _fleetShipDetails = createFleetShipDetailController();

const _fleetInlinePortal = createFleetInlinePortalController({
  clearSurfaceContext: _clearFleetSurfaceContext,
  getDocument: function () { return typeof document !== 'undefined' ? document : null; },
  requestRender: _renderHangarAfterInlineClose,
});

const _fleetDispatchController = createFleetDispatchController({
  closeActiveSurface: function (options) {
    return _closeActiveFleetSurface(options);
  },
  closeSurface: function (modalId, options) {
    return _closeFleetSurface(modalId, options);
  },
  hideBlockingSurface: hideBlockingSurface,
  openInlinePortal: function (modalId, onClose, options) {
    return _fleetInlinePortal.open(modalId, onClose, options);
  },
  requestHangarRender: function () {
    return _renderHangarAfterInlineClose();
  },
  setInspectedShipIndex: function (shipIndex) {
    _inspectedHangarShipIndex = Number.isInteger(shipIndex) ? shipIndex : null;
  },
  showBlockingSurface: showBlockingSurface,
});

const _fleetModController = createFleetModController({
  closeActiveSurface: function (options) {
    return _closeActiveFleetSurface(options);
  },
  closeSurface: function (modalId, options) {
    return _closeFleetSurface(modalId, options);
  },
  hideBlockingSurface: hideBlockingSurface,
  openConfirmation: function (context, options) {
    return _openFleetConfirmation(context, options);
  },
  openInlinePortal: function (modalId, onClose, options) {
    return _fleetInlinePortal.open(modalId, onClose, options);
  },
  requestHangarRender: function () {
    return _renderHangarAfterInlineClose();
  },
  setInspectedShipIndex: function (shipIndex) {
    _inspectedHangarShipIndex = Number.isInteger(shipIndex) ? shipIndex : null;
  },
  showBlockingSurface: showBlockingSurface,
});

const _fleetCrewController = createFleetCrewController({
  closeActiveSurface: function (options) {
    return _closeActiveFleetSurface(options);
  },
  closeSurface: function (modalId, options) {
    return _closeFleetSurface(modalId, options);
  },
  hideBlockingSurface: hideBlockingSurface,
  openConfirmation: function (context, options) {
    return _openFleetConfirmation(context, options);
  },
  openInlinePortal: function (modalId, onClose, options) {
    return _fleetInlinePortal.open(modalId, onClose, options);
  },
  requestHangarRender: function () {
    return _renderHangarAfterInlineClose();
  },
  setInspectedShipIndex: function (shipIndex) {
    _inspectedHangarShipIndex = Number.isInteger(shipIndex) ? shipIndex : null;
  },
  showBlockingSurface: showBlockingSurface,
});

function _copyFleetSessionContext(context) {
  if (!context) return null;
  var copy = Object.assign({}, context);
  if (copy.tradePolicy && typeof copy.tradePolicy === 'object') {
    copy.tradePolicy = Object.freeze(Object.assign({}, copy.tradePolicy));
  }
  return Object.freeze(copy);
}

function _activeFleetSurfaceId() {
  var inlineModalId = _fleetInlinePortal.getActiveModalId();
  if (inlineModalId) return inlineModalId;
  if (_fleetModController.getActiveContext()) return 'mod-modal';
  if (_fleetCrewController.getActiveContext()) return 'crew-modal';
  if (_fleetDispatchController.getActiveContext()) return 'dispatch-modal';
  return null;
}

function _clearFleetSurfaceContext(modalId) {
  if (modalId === 'mod-modal') _fleetModController.clearContext('surface-close');
  else if (modalId === 'crew-modal') _fleetCrewController.clearContext('surface-close');
  else if (modalId === 'dispatch-modal') _fleetDispatchController.clearContext('surface-close');
}

function _closeFleetSurface(modalId, options) {
  if (_fleetInlinePortal.close(modalId, options)) return true;
  hideBlockingSurface(modalId);
  _clearFleetSurfaceContext(modalId);
  return true;
}

function _closeActiveFleetSurface(options) {
  var modalId = _activeFleetSurfaceId();
  return modalId ? _closeFleetSurface(modalId, options) : false;
}

function _openFleetConfirmation(context, options) {
  var request = options || {};
  var onConfirm = request.onConfirm;
  var onCancel = request.onCancel;
  _activeFleetConfirmation = Object.assign({}, context || {});
  var opened = ActionConfirmUI.open(Object.assign({}, request, {
    onConfirm: function () {
      _activeFleetConfirmation = null;
      if (typeof onConfirm === 'function') onConfirm();
    },
    onCancel: function () {
      _activeFleetConfirmation = null;
      if (typeof onCancel === 'function') onCancel();
    },
  }));
  if (!opened) _activeFleetConfirmation = null;
  return opened;
}

export function setLifecycleActions(actions) {
  _lifecycleActions = actions || null;
}

export function getInspectedShipIndex() {
  return Number.isInteger(_inspectedHangarShipIndex) ? _inspectedHangarShipIndex : null;
}

export function getDiagnostics() {
  var activeSurfaceId = _activeFleetSurfaceId();
  return Object.freeze({
    activeSurface: activeSurfaceId ? activeSurfaceId.replace('-modal', '') : null,
    surfaceMode: activeSurfaceId ? (_fleetInlinePortal.getActiveModalId() === activeSurfaceId ? 'inline' : 'blocking') : null,
    inspectedShipIndex: getInspectedShipIndex(),
    mod: _copyFleetSessionContext(_fleetModController.getActiveContext()),
    modController: _fleetModController.getDiagnostics(),
    crew: _copyFleetSessionContext(_fleetCrewController.getActiveContext()),
    crewController: _fleetCrewController.getDiagnostics(),
    dispatch: _copyFleetSessionContext(_fleetDispatchController.getActiveContext()),
    dispatchController: _fleetDispatchController.getDiagnostics(),
    shipDetails: _fleetShipDetails.getDiagnostics(),
    inlinePortal: _fleetInlinePortal.getDiagnostics(),
    confirmation: _copyFleetSessionContext(_activeFleetConfirmation),
    resetCount: _fleetRuntimeResetCount,
  });
}

export function resetRuntimeState() {
  if (_activeFleetConfirmation) ActionConfirmUI.cancel();
  _closeActiveFleetSurface({ restoreFocus: false });
  ['mod-modal', 'crew-modal', 'dispatch-modal'].forEach(function (modalId) {
    hideBlockingSurface(modalId);
  });
  _fleetModController.reset();
  _fleetCrewController.reset();
  _fleetDispatchController.reset();
  _activeFleetConfirmation = null;
  _inspectedHangarShipIndex = null;
  _fleetRuntimeResetCount += 1;
  return getDiagnostics();
}

export function renderContextInspector(request) {
  return _fleetShipDetails.renderContextInspector(request);
}

export function renderWorkspaceDetail(request) {
  return _fleetShipDetails.renderWorkspaceDetail(request);
}

// 全局监听重置事件（用于视图切换时自动归还节点）
EventBus.on('hangar:reset', function() {
  resetRuntimeState();
});

function _focusInlineElement(target) {
  if (!target || typeof target.focus !== 'function' || target.disabled || target.isConnected === false) return;
  try { target.focus({ preventScroll: true }); } catch (err) { target.focus(); }
}

function _renderHangarAfterInlineClose() {
  if (_lifecycleActions && typeof _lifecycleActions.requestRender === 'function') {
    return _lifecycleActions.requestRender();
  }
  return false;
}

/**
 * 渲染机库主视图。Presenter 拥有只读投影与 HTML，FleetUI 只协调选择、弹层与 command。
 * @param {{state:object, onCommand?:Function}} request
 */
export function render(request) {
  var input = request || {};
  var state = input.state;
  if (!state || _fleetInlinePortal.getActiveModalId() !== null) return false;
  var container = document.getElementById('fleet-list');
  if (!container) return false;

  var actions = createFleetActionPorts(input.onCommand);
  var model = buildFleetHangarModel(state, _inspectedHangarShipIndex);
  if (!model) return false;
  _inspectedHangarShipIndex = model.inspectedIdx;

  if (model.inspectedIdx !== null) {
    ContextInspector.replaceContext({
      type: 'ship',
      id: String(model.inspectedIdx),
      workspaceId: 'fleet',
      source: 'hangar-selection',
      revision: ContextInspector.getCurrentRevision(),
    }, { render: false });
  }

  container.innerHTML = renderFleetHangar(model);
  container.onclick = function (event) {
    var intent = readFleetHangarIntent(event && event.target);
    if (!intent) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();

    if (intent.type === FLEET_HANGAR_INTENT.INSPECT_SHIP) {
      if (!model.fleet[intent.shipIndex] || intent.shipIndex === _inspectedHangarShipIndex) return;
      _inspectedHangarShipIndex = intent.shipIndex;
      ContextInspector.replaceContext({
        type: 'ship',
        id: String(intent.shipIndex),
        workspaceId: 'fleet',
        source: 'hangar-ship-selector',
        revision: ContextInspector.getCurrentRevision(),
      });
      render(input);
      Promise.resolve().then(function () {
        if (!container || typeof container.querySelector !== 'function') return;
        _focusInlineElement(container.querySelector('.hangar-ship-select[data-ship-index="' + intent.shipIndex + '"]'));
      });
      return;
    }
    if (intent.type === FLEET_HANGAR_INTENT.BUY_SLOT) return actions.onBuySlot();
    if (intent.type === FLEET_HANGAR_INTENT.SWITCH_SHIP) return actions.onSwitchShip(intent.shipIndex);
    if (intent.type === FLEET_HANGAR_INTENT.OPEN_MODS) {
      return _fleetModController.open({
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
      return _fleetCrewController.open({
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
      return _fleetDispatchController.open({
        state: state,
        shipIndex: intent.shipIndex,
        onAssignRoute: actions.onAssignRoute,
        onCancelRoute: actions.onCancelRoute,
      });
    }
    if (intent.type === FLEET_HANGAR_INTENT.CANCEL_ROUTE) return actions.onCancelRoute(intent.shipIndex);
  };

  return true;
}

// ---------------------------------------------------------------------------
// 船只商店（独立标签页）
// ---------------------------------------------------------------------------

/**
 * 渲染船只商店标签页
 * @param {{state:object, onCommand?:Function}} request
 */
export function renderShop(request) {
  var input = request || {};
  if (!input.state) return false;
  var container = document.getElementById('shop-list');
  if (!container) return false;
  var actions = createFleetActionPorts(input.onCommand);
  container.innerHTML = renderFleetShop(buildFleetShopModel(input.state));
  container.onclick = function (event) {
    var intent = readFleetShopIntent(event && event.target);
    if (!intent) return;
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    actions.onBuyShip(intent.shipTypeId);
  };
  return true;
}
export function openDispatchModal(request) {
  var input = request || {};
  if (!input.state || !Number.isInteger(input.shipIndex)) return false;
  var actions = createFleetActionPorts(input.onCommand);
  return _fleetDispatchController.open({
    state: input.state,
    shipIndex: input.shipIndex,
    onAssignRoute: actions.onAssignRoute,
    onCancelRoute: actions.onCancelRoute,
    preset: input.preset,
  });
}

export function openCrewModal(request) {
  var input = request || {};
  if (!input.state || !Number.isInteger(input.shipIndex)) return false;
  var actions = createFleetActionPorts(input.onCommand);
  return _fleetCrewController.open({
    state: input.state,
    shipIndex: input.shipIndex,
    onRecruitCrew: actions.onRecruitCrew,
    onAssignCrew: actions.onAssignCrew,
    onUnassignCrew: actions.onUnassignCrew,
    onDismissCrew: actions.onDismissCrew,
    onSwitchShip: actions.onSwitchShip,
  });
}

export function openModModal(request) {
  var input = request || {};
  if (!input.state || !Number.isInteger(input.shipIndex)) return false;
  var actions = createFleetActionPorts(input.onCommand);
  return _fleetModController.open({
    state: input.state,
    shipIndex: input.shipIndex,
    onInstallMod: actions.onInstallMod,
    onUninstallMod: actions.onUninstallMod,
    onUpgradeShip: actions.onUpgradeShip,
    onServiceShip: actions.onServiceShip,
    onSellShip: actions.onSellShip,
    options: input.options,
  });
}

export function getActiveModModalContext() {
  return _fleetModController.getActiveContext();
}

export function getActiveDispatchModalContext() {
  return _fleetDispatchController.getActiveContext();
}
