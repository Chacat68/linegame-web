import { describe, expect, it, vi } from 'vitest';
import { createDialogueModalController } from '../js/ui/DialogueModalController.js';

function createClassList(initial) {
  var values = new Set(initial || []);
  return {
    add: function (value) { values.add(value); },
    remove: function (value) { values.delete(value); },
    contains: function (value) { return values.has(value); },
    toggle: function (value, force) {
      var enabled = typeof force === 'boolean' ? force : !values.has(value);
      if (enabled) values.add(value);
      else values.delete(value);
    },
  };
}

function createElement(initialClasses) {
  var attrs = Object.create(null);
  var listeners = Object.create(null);
  var element = {
    children: [],
    classList: createClassList(initialClasses),
    dataset: {},
    innerHTML: '',
    textContent: '',
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: function (type, handler) {
      listeners[type] = (listeners[type] || []).filter(function (entry) { return entry !== handler; });
    },
    appendChild: function (child) { element.children.push(child); return child; },
    dispatch: function (type, event) {
      (listeners[type] || []).slice().forEach(function (handler) { handler(event || { target: element }); });
    },
    listenerCount: function (type) { return (listeners[type] || []).length; },
    setAttribute: function (name, value) { attrs[name] = String(value); },
    getAttribute: function (name) { return attrs[name] || null; },
    focus: vi.fn(),
  };
  return element;
}

function createHarness() {
  var modal = createElement(['modal', 'hidden']);
  modal.modalBox = createElement();
  modal.querySelector = function () { return modal.modalBox; };
  var elements = {
    'dialogue-modal': modal,
    'dialogue-next-btn': createElement(),
    'dialogue-skip-btn': createElement(),
    'dialogue-scene-label': createElement(),
    'dialogue-scene-title': createElement(),
    'dialogue-speaker-icon': createElement(),
    'dialogue-speaker-name': createElement(),
    'dialogue-text': createElement(),
    'dialogue-footer': createElement(['hidden']),
    'dialogue-progress': createElement(),
    'dialogue-summary': createElement(),
    'dialogue-branch-panel': createElement(),
    'dialogue-choices': createElement(['hidden']),
  };
  var doc = {
    getElementById: function (id) { return elements[id] || null; },
    createElement: function () { return createElement(); },
  };
  return { document: doc, elements: elements, modal: modal };
}

describe('DialogueModalController', function () {
  it('播放线性场景并只在结束时提交完成结果', function () {
    var harness = createHarness();
    var complete = vi.fn();
    var showSurface = vi.fn(function () { harness.modal.classList.remove('hidden'); });
    var hideSurface = vi.fn(function () { harness.modal.classList.add('hidden'); });
    var controller = createDialogueModalController({
      document: harness.document,
      bindDismiss: vi.fn(),
      showSurface: showSurface,
      hideSurface: hideSurface,
    });

    expect(controller.init()).toBe(true);
    expect(controller.showScene({ lines: [{ text: '第一句' }, { text: '第二句' }] }, complete)).toBe(true);
    expect(harness.elements['dialogue-text'].textContent).toBe('第一句');
    harness.elements['dialogue-next-btn'].dispatch('click');
    expect(harness.elements['dialogue-text'].textContent).toBe('第二句');
    expect(complete).not.toHaveBeenCalled();
    harness.elements['dialogue-next-btn'].dispatch('click');
    expect(complete).toHaveBeenCalledWith({ skipped: false, choiceId: null });
    expect(hideSurface).toHaveBeenCalledWith('dialogue-modal');
    expect(controller.getDiagnostics()).toMatchObject({ finishCount: 1, renderCount: 2 });
  });

  it('空场景和缺失 DOM 都会终止调用方等待', function () {
    var emptyComplete = vi.fn();
    var controller = createDialogueModalController({
      document: { getElementById: function () { return null; } },
      bindDismiss: vi.fn(),
      showSurface: vi.fn(),
      hideSurface: vi.fn(),
    });
    expect(controller.showScene({ lines: [] }, emptyComplete)).toBe(false);
    expect(emptyComplete).toHaveBeenCalledWith({ skipped: false, empty: true });

    var unavailableComplete = vi.fn();
    expect(controller.showScene({ lines: [{ text: 'A' }] }, unavailableComplete)).toBe(false);
    expect(unavailableComplete).toHaveBeenCalledWith({ skipped: true, unavailable: true });
  });

  it('重复 init 不叠加监听，destroy 释放稳定节点处理器', function () {
    var harness = createHarness();
    var controller = createDialogueModalController({
      document: harness.document,
      bindDismiss: vi.fn(),
      showSurface: vi.fn(),
      hideSurface: vi.fn(),
    });
    controller.init();
    controller.init();
    expect(harness.elements['dialogue-next-btn'].listenerCount('click')).toBe(1);
    expect(harness.modal.listenerCount('keydown')).toBe(1);
    controller.destroy();
    expect(harness.elements['dialogue-next-btn'].listenerCount('click')).toBe(0);
    expect(harness.modal.listenerCount('keydown')).toBe(0);
    expect(controller.getDiagnostics()).toMatchObject({ bound: false, destroyCount: 1 });
  });
});
