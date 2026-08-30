import { describe, expect, it, vi } from 'vitest';
import { createFleetSurfaceCoordinator } from '../js/ui/FleetSurfaceCoordinator.js';

function createInlinePortal() {
  var activeModalId = null;
  var openCount = 0;
  var closeCount = 0;
  return {
    close: vi.fn(function (modalId) {
      if (activeModalId !== modalId) return false;
      activeModalId = null;
      closeCount += 1;
      return true;
    }),
    getActiveModalId: function () { return activeModalId; },
    getDiagnostics: function () {
      return Object.freeze({ activeModalId: activeModalId, closeCount: closeCount, openCount: openCount });
    },
    open: vi.fn(function (modalId) {
      activeModalId = modalId;
      openCount += 1;
      return true;
    }),
  };
}

function createConfirmation() {
  var activeRequest = null;
  return {
    cancel: vi.fn(function () {
      var request = activeRequest;
      activeRequest = null;
      if (request && typeof request.onCancel === 'function') request.onCancel();
    }),
    getActiveRequest: function () { return activeRequest; },
    open: vi.fn(function (request) {
      activeRequest = request;
      return true;
    }),
  };
}

function createHarness() {
  var contexts = {
    'mod-modal': null,
    'crew-modal': null,
    'dispatch-modal': null,
  };
  var inlinePortal = createInlinePortal();
  var confirmation = createConfirmation();
  var hideBlockingSurface = vi.fn();
  var showBlockingSurface = vi.fn(function (modalId) { return modalId; });
  var clearSurfaceContext = vi.fn(function (modalId) {
    contexts[modalId] = null;
    return true;
  });
  var coordinator = createFleetSurfaceCoordinator({
    actionConfirmUi: confirmation,
    clearSurfaceContext: clearSurfaceContext,
    getSurfaceContext: function (modalId) { return contexts[modalId]; },
    hideBlockingSurface: hideBlockingSurface,
    inlinePortal: inlinePortal,
    showBlockingSurface: showBlockingSurface,
  });
  return {
    clearSurfaceContext: clearSurfaceContext,
    confirmation: confirmation,
    contexts: contexts,
    coordinator: coordinator,
    hideBlockingSurface: hideBlockingSurface,
    inlinePortal: inlinePortal,
    showBlockingSurface: showBlockingSurface,
  };
}

describe('FleetSurfaceCoordinator', function () {
  it('统一解析 blocking/inline 活动面并公开冻结快照', function () {
    var harness = createHarness();
    harness.contexts['mod-modal'] = { shipIndex: 1, tradePolicy: { riskMode: 'safe' } };

    expect(harness.coordinator.getActiveSurfaceId()).toBe('mod-modal');
    expect(harness.coordinator.getDiagnostics()).toEqual({
      activeSurface: 'mod',
      confirmation: null,
      inlinePortal: { activeModalId: null, closeCount: 0, openCount: 0 },
      surfaceMode: 'blocking',
      surfaceResetCount: 0,
    });

    expect(harness.coordinator.openInlinePortal('crew-modal')).toBe(true);
    expect(harness.coordinator.getActiveSurfaceId()).toBe('crew-modal');
    expect(harness.coordinator.getDiagnostics().surfaceMode).toBe('inline');
    expect(Object.isFrozen(harness.coordinator.getDiagnostics())).toBe(true);
    expect(Object.isFrozen(harness.coordinator.getDiagnostics().inlinePortal)).toBe(true);
    expect(Object.isFrozen(harness.coordinator)).toBe(true);
  });

  it('关闭 Surface 时优先归还 inline Portal，否则隐藏 blocking 并清理上下文', function () {
    var harness = createHarness();
    harness.coordinator.openInlinePortal('crew-modal');
    expect(harness.coordinator.closeSurface('crew-modal', { restoreFocus: false })).toBe(true);
    expect(harness.inlinePortal.close).toHaveBeenCalledWith('crew-modal', { restoreFocus: false });
    expect(harness.hideBlockingSurface).not.toHaveBeenCalled();

    harness.contexts['dispatch-modal'] = { shipIndex: 2 };
    expect(harness.coordinator.closeActiveSurface()).toBe(true);
    expect(harness.hideBlockingSurface).toHaveBeenCalledWith('dispatch-modal');
    expect(harness.clearSurfaceContext).toHaveBeenCalledWith('dispatch-modal', 'surface-close');
    expect(harness.coordinator.closeActiveSurface()).toBe(false);
  });

  it('危险确认只在 Coordinator 保存只读上下文，并在确认或取消后清空', function () {
    var harness = createHarness();
    var confirmed = vi.fn();
    var cancelled = vi.fn();
    expect(harness.coordinator.openConfirmation({
      type: 'ship-sell',
      shipIndex: 1,
      tradePolicy: { riskMode: 'safe' },
    }, {
      onCancel: cancelled,
      onConfirm: confirmed,
      title: '确认出售',
    })).toBe(true);

    var snapshot = harness.coordinator.getDiagnostics().confirmation;
    expect(snapshot).toEqual({ type: 'ship-sell', shipIndex: 1, tradePolicy: { riskMode: 'safe' } });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tradePolicy)).toBe(true);
    harness.confirmation.getActiveRequest().onConfirm();
    expect(confirmed).toHaveBeenCalledOnce();
    expect(harness.coordinator.getDiagnostics().confirmation).toBe(null);

    harness.coordinator.openConfirmation({ type: 'crew-dismiss', crewId: 'crew-1' }, { onCancel: cancelled });
    harness.confirmation.getActiveRequest().onCancel();
    expect(cancelled).toHaveBeenCalledOnce();
    expect(harness.coordinator.getDiagnostics().confirmation).toBe(null);
  });

  it('reset 取消确认、关闭活动面、隐藏全部 Fleet modal 并累计释放诊断', function () {
    var harness = createHarness();
    harness.contexts['mod-modal'] = { shipIndex: 0 };
    harness.coordinator.openConfirmation({ type: 'ship-sell', shipIndex: 0 }, {});

    var diagnostics = harness.coordinator.reset();

    expect(harness.confirmation.cancel).toHaveBeenCalledOnce();
    expect(harness.clearSurfaceContext).toHaveBeenCalledWith('mod-modal', 'surface-close');
    expect(harness.hideBlockingSurface.mock.calls.map(function (call) { return call[0]; })).toEqual(
      expect.arrayContaining(['mod-modal', 'crew-modal', 'dispatch-modal']),
    );
    expect(diagnostics).toEqual(expect.objectContaining({
      activeSurface: null,
      confirmation: null,
      surfaceMode: null,
      surfaceResetCount: 1,
    }));
  });
});
