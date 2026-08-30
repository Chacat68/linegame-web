// js/ui/FleetSurfaceCoordinator.js — Fleet inline/blocking Surface、确认与释放状态 owner

import * as ActionConfirmUI from './ActionConfirmUI.js';
import { hideBlockingSurface, showBlockingSurface } from './SurfaceManager.js';
import { createFleetInlinePortalController } from './FleetInlinePortalController.js';

const FLEET_MODAL_IDS = Object.freeze(['mod-modal', 'crew-modal', 'dispatch-modal']);

function _copyContext(context) {
  if (!context) return null;
  var copy = Object.assign({}, context);
  if (copy.tradePolicy && typeof copy.tradePolicy === 'object') {
    copy.tradePolicy = Object.freeze(Object.assign({}, copy.tradePolicy));
  }
  return Object.freeze(copy);
}

export function createFleetSurfaceCoordinator(options) {
  var ports = options || {};
  var actionConfirmUi = ports.actionConfirmUi || ActionConfirmUI;
  var hideSurface = typeof ports.hideBlockingSurface === 'function'
    ? ports.hideBlockingSurface
    : hideBlockingSurface;
  var showSurface = typeof ports.showBlockingSurface === 'function'
    ? ports.showBlockingSurface
    : showBlockingSurface;
  var activeConfirmation = null;
  var surfaceResetCount = 0;

  function _clearSurfaceContext(modalId, reason) {
    return typeof ports.clearSurfaceContext === 'function'
      ? ports.clearSurfaceContext(modalId, reason)
      : false;
  }

  function _getSurfaceContext(modalId) {
    return typeof ports.getSurfaceContext === 'function'
      ? ports.getSurfaceContext(modalId)
      : null;
  }

  var inlinePortal = ports.inlinePortal || createFleetInlinePortalController({
    clearSurfaceContext: function (modalId) {
      return _clearSurfaceContext(modalId, 'surface-close');
    },
    getDocument: ports.getDocument,
    requestRender: ports.requestRender,
  });

  function getActiveSurfaceId() {
    var inlineModalId = inlinePortal.getActiveModalId();
    if (inlineModalId) return inlineModalId;
    for (var i = 0; i < FLEET_MODAL_IDS.length; i += 1) {
      if (_getSurfaceContext(FLEET_MODAL_IDS[i])) return FLEET_MODAL_IDS[i];
    }
    return null;
  }

  function closeSurface(modalId, optionsRef) {
    if (inlinePortal.close(modalId, optionsRef)) return true;
    hideSurface(modalId);
    _clearSurfaceContext(modalId, 'surface-close');
    return true;
  }

  function closeActiveSurface(optionsRef) {
    var modalId = getActiveSurfaceId();
    return modalId ? closeSurface(modalId, optionsRef) : false;
  }

  function openConfirmation(context, optionsRef) {
    var request = optionsRef || {};
    var onConfirm = request.onConfirm;
    var onCancel = request.onCancel;
    activeConfirmation = Object.assign({}, context || {});
    var opened = actionConfirmUi.open(Object.assign({}, request, {
      onConfirm: function () {
        activeConfirmation = null;
        if (typeof onConfirm === 'function') onConfirm();
      },
      onCancel: function () {
        activeConfirmation = null;
        if (typeof onCancel === 'function') onCancel();
      },
    }));
    if (!opened) activeConfirmation = null;
    return opened;
  }

  function getDiagnostics() {
    var activeSurfaceId = getActiveSurfaceId();
    return Object.freeze({
      activeSurface: activeSurfaceId ? activeSurfaceId.replace('-modal', '') : null,
      confirmation: _copyContext(activeConfirmation),
      inlinePortal: inlinePortal.getDiagnostics(),
      surfaceMode: activeSurfaceId
        ? (inlinePortal.getActiveModalId() === activeSurfaceId ? 'inline' : 'blocking')
        : null,
      surfaceResetCount: surfaceResetCount,
    });
  }

  function reset() {
    if (activeConfirmation && actionConfirmUi && typeof actionConfirmUi.cancel === 'function') {
      actionConfirmUi.cancel();
    }
    closeActiveSurface({ restoreFocus: false });
    FLEET_MODAL_IDS.forEach(function (modalId) { hideSurface(modalId); });
    activeConfirmation = null;
    surfaceResetCount += 1;
    return getDiagnostics();
  }

  return Object.freeze({
    closeActiveSurface: closeActiveSurface,
    closeSurface: closeSurface,
    getActiveInlineModalId: function () { return inlinePortal.getActiveModalId(); },
    getActiveSurfaceId: getActiveSurfaceId,
    getDiagnostics: getDiagnostics,
    hideBlockingSurface: hideSurface,
    openConfirmation: openConfirmation,
    openInlinePortal: function (modalId, onClose, optionsRef) {
      return inlinePortal.open(modalId, onClose, optionsRef);
    },
    reset: reset,
    showBlockingSurface: showSurface,
  });
}
