// js/ui/FleetUI.js — 船队管理 UI（含席位系统）
// 依赖：Hangar/Shop/Crew/Mod/Dispatch/Surface/Detail Controller 与 typed command adapter
// 导出：工作区 render、Context/L4 adapter、二级界面 facade 与 diagnostics

import * as EventBus from '../core/EventBus.js';
import * as ContextInspector from './ContextInspector.js';
import { createFleetHangarController } from './FleetHangarController.js';
import { createFleetShopController } from './FleetShopController.js';
import { createFleetCrewController } from './FleetCrewController.js';
import { createFleetModController } from './FleetModController.js';
import { createFleetDispatchController } from './FleetDispatchController.js';
import { createFleetSurfaceCoordinator } from './FleetSurfaceCoordinator.js';
import { createFleetShipDetailController } from './FleetShipDetailController.js';
import { createFleetActionPorts } from './FleetCommandAdapter.js';
let _lifecycleActions = null;
let _fleetRuntimeResetCount = 0;
let _fleetHangarController = null;
let _fleetDispatchController = null;
let _fleetModController = null;
let _fleetCrewController = null;
const _fleetShipDetails = createFleetShipDetailController();

const _fleetSurfaces = createFleetSurfaceCoordinator({
  clearSurfaceContext: function (modalId, reason) {
    if (modalId === 'mod-modal' && _fleetModController) return _fleetModController.clearContext(reason);
    if (modalId === 'crew-modal' && _fleetCrewController) return _fleetCrewController.clearContext(reason);
    if (modalId === 'dispatch-modal' && _fleetDispatchController) return _fleetDispatchController.clearContext(reason);
    return false;
  },
  getDocument: function () { return typeof document !== 'undefined' ? document : null; },
  getSurfaceContext: function (modalId) {
    if (modalId === 'mod-modal' && _fleetModController) return _fleetModController.getActiveContext();
    if (modalId === 'crew-modal' && _fleetCrewController) return _fleetCrewController.getActiveContext();
    if (modalId === 'dispatch-modal' && _fleetDispatchController) return _fleetDispatchController.getActiveContext();
    return null;
  },
  requestRender: _renderHangarAfterInlineClose,
});

_fleetDispatchController = createFleetDispatchController({
  closeActiveSurface: _fleetSurfaces.closeActiveSurface,
  closeSurface: _fleetSurfaces.closeSurface,
  hideBlockingSurface: _fleetSurfaces.hideBlockingSurface,
  openInlinePortal: _fleetSurfaces.openInlinePortal,
  requestHangarRender: function () {
    return _renderHangarAfterInlineClose();
  },
  setInspectedShipIndex: _setInspectedShipIndex,
  showBlockingSurface: _fleetSurfaces.showBlockingSurface,
});

_fleetModController = createFleetModController({
  closeActiveSurface: _fleetSurfaces.closeActiveSurface,
  closeSurface: _fleetSurfaces.closeSurface,
  hideBlockingSurface: _fleetSurfaces.hideBlockingSurface,
  openConfirmation: _fleetSurfaces.openConfirmation,
  openInlinePortal: _fleetSurfaces.openInlinePortal,
  requestHangarRender: function () {
    return _renderHangarAfterInlineClose();
  },
  setInspectedShipIndex: _setInspectedShipIndex,
  showBlockingSurface: _fleetSurfaces.showBlockingSurface,
});

_fleetCrewController = createFleetCrewController({
  closeActiveSurface: _fleetSurfaces.closeActiveSurface,
  closeSurface: _fleetSurfaces.closeSurface,
  hideBlockingSurface: _fleetSurfaces.hideBlockingSurface,
  openConfirmation: _fleetSurfaces.openConfirmation,
  openInlinePortal: _fleetSurfaces.openInlinePortal,
  requestHangarRender: function () {
    return _renderHangarAfterInlineClose();
  },
  setInspectedShipIndex: _setInspectedShipIndex,
  showBlockingSurface: _fleetSurfaces.showBlockingSurface,
});

_fleetHangarController = createFleetHangarController({
  getActiveInlineModalId: _fleetSurfaces.getActiveInlineModalId,
  getContextRevision: function () { return ContextInspector.getCurrentRevision(); },
  getDocument: function () { return typeof document !== 'undefined' ? document : null; },
  openCrew: function (request) { return _fleetCrewController.open(request); },
  openDispatch: function (request) { return _fleetDispatchController.open(request); },
  openMod: function (request) { return _fleetModController.open(request); },
  replaceContext: function (context, options) { return ContextInspector.replaceContext(context, options); },
});

const _fleetShopController = createFleetShopController({
  getDocument: function () { return typeof document !== 'undefined' ? document : null; },
});

function _setInspectedShipIndex(shipIndex) {
  return _fleetHangarController
    ? _fleetHangarController.setInspectedShipIndex(shipIndex)
    : null;
}

function _copyFleetSessionContext(context) {
  if (!context) return null;
  var copy = Object.assign({}, context);
  if (copy.tradePolicy && typeof copy.tradePolicy === 'object') {
    copy.tradePolicy = Object.freeze(Object.assign({}, copy.tradePolicy));
  }
  return Object.freeze(copy);
}

export function setLifecycleActions(actions) {
  _lifecycleActions = actions || null;
}

export function getInspectedShipIndex() {
  return _fleetHangarController.getInspectedShipIndex();
}

export function getDiagnostics() {
  var surfaces = _fleetSurfaces.getDiagnostics();
  return Object.freeze({
    activeSurface: surfaces.activeSurface,
    surfaceMode: surfaces.surfaceMode,
    inspectedShipIndex: getInspectedShipIndex(),
    hangar: _fleetHangarController.getDiagnostics(),
    shop: _fleetShopController.getDiagnostics(),
    mod: _copyFleetSessionContext(_fleetModController.getActiveContext()),
    modController: _fleetModController.getDiagnostics(),
    crew: _copyFleetSessionContext(_fleetCrewController.getActiveContext()),
    crewController: _fleetCrewController.getDiagnostics(),
    dispatch: _copyFleetSessionContext(_fleetDispatchController.getActiveContext()),
    dispatchController: _fleetDispatchController.getDiagnostics(),
    shipDetails: _fleetShipDetails.getDiagnostics(),
    inlinePortal: surfaces.inlinePortal,
    confirmation: surfaces.confirmation,
    surfaceResetCount: surfaces.surfaceResetCount,
    resetCount: _fleetRuntimeResetCount,
  });
}

export function resetRuntimeState() {
  _fleetSurfaces.reset();
  _fleetModController.reset();
  _fleetCrewController.reset();
  _fleetDispatchController.reset();
  _fleetHangarController.reset();
  _fleetShopController.reset();
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

function _renderHangarAfterInlineClose() {
  if (_lifecycleActions && typeof _lifecycleActions.requestRender === 'function') {
    return _lifecycleActions.requestRender();
  }
  return false;
}

/**
 * 渲染机库主视图。Hangar Controller 独占选择、DOM、Context、弹层与 command 协调。
 * @param {{state:object, onCommand?:Function}} request
 */
export function render(request) {
  return _fleetHangarController.render(request);
}

// ---------------------------------------------------------------------------
// 船只商店（独立标签页）
// ---------------------------------------------------------------------------

/**
 * 渲染船只商店标签页
 * @param {{state:object, onCommand?:Function}} request
 */
export function renderShop(request) {
  return _fleetShopController.render(request);
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
