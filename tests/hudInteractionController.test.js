import { describe, expect, it, vi } from 'vitest';
import { createHudInteractionController } from '../js/ui/HudInteractionController.js';

function createEventBus() {
  var listeners = new Map();
  return {
    emit: vi.fn(function (event, payload) {
      Array.from(listeners.get(event) || []).forEach(function (listener) { listener(payload); });
    }),
    off: vi.fn(function (event, listener) {
      if (listeners.has(event)) listeners.get(event).delete(listener);
    }),
    on: vi.fn(function (event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    }),
    listenerCount: function (event) { return (listeners.get(event) || new Set()).size; },
  };
}

function createElement(classes) {
  var listeners = new Map();
  var classNames = new Set(classes || []);
  return {
    attributes: {},
    classList: {
      contains: function (name) { return classNames.has(name); },
    },
    dataset: {},
    disabled: false,
    innerHTML: '',
    textContent: '',
    addEventListener: function (event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    dispatch: function (event, payload) {
      Array.from(listeners.get(event) || []).forEach(function (listener) { listener(payload || {}); });
    },
    listenerCount: function (event) { return (listeners.get(event) || new Set()).size; },
    removeEventListener: function (event, listener) {
      if (listeners.has(event)) listeners.get(event).delete(listener);
    },
    setAttribute: function (name, value) { this.attributes[name] = String(value); },
  };
}

function createHarness() {
  var events = createEventBus();
  var state = { mapView: 'planets' };
  var elements = {
    'hud-galactic-map-toggle': createElement(),
    'victory-modal': createElement(['hidden']),
    'victory-modal-body': createElement(),
    'victory-modal-close': createElement(),
    'victory-progress-btn': createElement(),
    'victory-progress-summary': createElement(),
  };
  var logs = {
    addMessage: vi.fn(),
    clearUnreadCount: vi.fn(),
    dispose: vi.fn(),
    initialize: vi.fn(),
    refresh: vi.fn(),
  };
  var surfaces = {
    bindDismiss: vi.fn(),
    hide: vi.fn(),
    show: vi.fn(),
  };
  var contextInspector = { init: vi.fn() };
  var renderGalaxySummary = vi.fn();
  var controller = createHudInteractionController({
    events: events,
    surfaces: surfaces,
    contextInspector: contextInspector,
    logsController: logs,
    victory: { getProgress: vi.fn(function () { return []; }) },
    getState: function () { return state; },
    getDocument: function () {
      return { getElementById: function (id) { return elements[id] || null; } };
    },
    getWindow: function () {
      return {
        confirm: vi.fn(function () { return true; }),
        matchMedia: function () { return { matches: false }; },
      };
    },
    renderGalaxySummary: renderGalaxySummary,
  });
  return {
    contextInspector: contextInspector,
    controller: controller,
    elements: elements,
    events: events,
    logs: logs,
    renderGalaxySummary: renderGalaxySummary,
    state: state,
    surfaces: surfaces,
  };
}

describe('HudInteractionController', function () {
  it('统一绑定日志、胜利弹层与银河工具，并只初始化一次', function () {
    var harness = createHarness();

    expect(harness.controller.initialize({
      stateSource: function () { return harness.state; },
      revisionSource: function () { return 4; },
    })).toBe(true);
    expect(harness.controller.initialize()).toBe(false);
    expect(harness.events.listenerCount('log:message')).toBe(1);
    expect(harness.events.listenerCount('logs:badge:clear')).toBe(1);
    expect(harness.elements['victory-progress-btn'].listenerCount('click')).toBe(1);
    expect(harness.elements['hud-galactic-map-toggle'].listenerCount('click')).toBe(1);
    expect(harness.surfaces.bindDismiss).toHaveBeenCalledWith('victory-modal');
    expect(harness.contextInspector.init).toHaveBeenCalledWith(expect.objectContaining({
      compact: false,
      open: true,
      revisionSource: expect.any(Function),
      stateSource: expect.any(Function),
    }));
    expect(harness.logs.initialize).toHaveBeenCalledOnce();

    harness.events.emit('log:message', { text: '跃迁完成', type: 'travel' });
    harness.events.emit('logs:badge:clear');
    expect(harness.logs.addMessage).toHaveBeenCalledWith('跃迁完成', 'travel');
    expect(harness.logs.clearUnreadCount).toHaveBeenCalledOnce();
    expect(harness.logs.refresh).toHaveBeenCalledOnce();

    harness.elements['victory-progress-btn'].dispatch('click');
    harness.elements['victory-modal-close'].dispatch('click');
    expect(harness.surfaces.show).toHaveBeenCalledWith(
      'victory-modal',
      { focusSelector: '#victory-modal-close' }
    );
    expect(harness.surfaces.hide).toHaveBeenCalledWith('victory-modal');

    harness.elements['hud-galactic-map-toggle'].dispatch('click');
    expect(harness.events.emit).toHaveBeenCalledWith('starmap:galaxy-view-toggle');
    expect(harness.renderGalaxySummary).toHaveBeenCalledWith(harness.state);
  });

  it('将长期路线选择提交给 typed action，并用返回快照重绘详情', function () {
    var harness = createHarness();
    var choosePolicy = vi.fn(function (pathId) {
      return {
        progress: [{
          pathId: pathId,
          name: '银河远征',
          icon: '🧭',
          progress: 1,
          completed: true,
          requirements: [],
          policy: { name: '远征', summary: '完成', benefit: '探索', tradeoff: '货舱' },
          policySelected: true,
        }],
      };
    });
    harness.controller.setVictoryActions({ onChoosePolicy: choosePolicy });
    harness.controller.initialize();
    harness.controller.syncVictory([], 1);

    var button = createElement();
    button.dataset.victoryPolicyId = 'galactic_explorer';
    button.closest = function () { return button; };
    harness.elements['victory-modal-body'].dispatch('click', { target: button });

    expect(choosePolicy).toHaveBeenCalledWith('galactic_explorer');
    expect(harness.elements['victory-modal-body'].innerHTML).toContain('银河远征');
    expect(harness.controller.getDiagnostics()).toMatchObject({
      progressPathCount: 1,
      victoryActionsBound: true,
    });
  });

  it('dispose 释放全部事件和 DOM listener，并允许干净重建', function () {
    var harness = createHarness();
    harness.controller.initialize();

    expect(harness.controller.dispose()).toBe(true);
    expect(harness.controller.dispose()).toBe(false);
    expect(harness.events.listenerCount('log:message')).toBe(0);
    expect(harness.events.listenerCount('logs:badge:clear')).toBe(0);
    expect(harness.elements['victory-progress-btn'].listenerCount('click')).toBe(0);
    expect(harness.elements['hud-galactic-map-toggle'].listenerCount('click')).toBe(0);
    expect(harness.logs.dispose).toHaveBeenCalledOnce();
    expect(harness.controller.getDiagnostics()).toMatchObject({
      disposed: true,
      domListenerCount: 0,
      eventListenersBound: false,
      initialized: false,
    });

    expect(harness.controller.initialize()).toBe(true);
    expect(harness.events.listenerCount('log:message')).toBe(1);
    expect(harness.elements['victory-progress-btn'].listenerCount('click')).toBe(1);
  });
});
