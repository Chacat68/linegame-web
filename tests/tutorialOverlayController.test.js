import { describe, expect, it, vi } from 'vitest';
import { createTutorialOverlayController } from '../js/ui/TutorialOverlayController.js';

function createClassList(initial) {
  var values = new Set(initial || []);
  return {
    add: function (value) { values.add(value); },
    remove: function (value) { values.delete(value); },
    contains: function (value) { return values.has(value); },
  };
}

function createElement(initialClasses) {
  var attrs = Object.create(null);
  var handlers = Object.create(null);
  var element = {
    classList: createClassList(initialClasses),
    dataset: {},
    innerHTML: '',
    style: {},
    addEventListener: function (type, handler) {
      if (!handlers[type]) handlers[type] = [];
      handlers[type].push(handler);
    },
    removeEventListener: function (type, handler) {
      handlers[type] = (handlers[type] || []).filter(function (entry) { return entry !== handler; });
    },
    dispatch: function (type, event) {
      (handlers[type] || []).slice().forEach(function (handler) { handler(event || {}); });
    },
    listenerCount: function (type) { return (handlers[type] || []).length; },
    setAttribute: function (name, value) { attrs[name] = String(value); },
    getAttribute: function (name) { return attrs[name] || null; },
    removeAttribute: function (name) { delete attrs[name]; },
    contains: function (target) { return target === this; },
    focus: function () {},
    querySelectorAll: function () { return element.actionButtons || []; },
  };
  return element;
}

function createEventBus() {
  var handlers = Object.create(null);
  return {
    on: vi.fn(function (name, handler) { handlers[name] = handler; }),
    off: vi.fn(function (name, handler) { if (handlers[name] === handler) delete handlers[name]; }),
    emit: function (name, data) { if (handlers[name]) handlers[name](data); },
    has: function (name) { return !!handlers[name]; },
  };
}

describe('TutorialOverlayController', function () {
  it('重复初始化只保留最新回调，并组合 Presenter 与 Layout', function () {
    var overlay = createElement(['hidden']);
    var tooltip = createElement(['hidden']);
    var next = createElement();
    var skip = createElement();
    var target = createElement();
    var eventBus = createEventBus();
    var visibleAtPosition = false;
    var layout = {
      bind: vi.fn(function () { return true; }),
      position: vi.fn(function () {
        visibleAtPosition = !overlay.classList.contains('hidden') && !tooltip.classList.contains('hidden');
        return true;
      }),
      cancelScheduled: vi.fn(),
      dispose: vi.fn(),
      getDiagnostics: function () { return Object.freeze({ bound: true }); },
    };
    var doc = {
      activeElement: null,
      getElementById: function (id) {
        if (id === 'tutorial-overlay') return overlay;
        if (id === 'tutorial-tooltip') return tooltip;
        if (id === 'tut-next-btn') return next;
        if (id === 'tut-skip-btn') return skip;
        return null;
      },
      querySelector: function () { return target; },
      querySelectorAll: function () { return [target]; },
    };
    var firstAdvance = vi.fn();
    var latestAdvance = vi.fn();
    var controller = createTutorialOverlayController({ document: doc, eventBus: eventBus, layout: layout });

    controller.init(firstAdvance, function () {});
    controller.init(latestAdvance, function () {});
    eventBus.emit('tutorial:step', {
      step: { phase: 1, trigger: 'manual', title: '校准', content: '继续', highlight: '#target', position: 'bottom' },
      index: 0,
      total: 2,
    });
    next.dispatch('click');

    expect(firstAdvance).not.toHaveBeenCalled();
    expect(latestAdvance).toHaveBeenCalledOnce();
    expect(layout.bind).toHaveBeenCalledTimes(2);
    expect(layout.position).toHaveBeenCalledWith('bottom', target);
    expect(visibleAtPosition).toBe(true);
    expect(target.classList.contains('tut-highlight')).toBe(true);
    expect(tooltip.innerHTML).toContain('第 1 / 2 步');
    expect(eventBus.off).toHaveBeenCalledTimes(2);
    expect(controller.getDiagnostics()).toMatchObject({ initialized: true, initCount: 2, renderCount: 1, lastStepNumber: 1 });
  });

  it('完成事件隐藏视图，destroy 解除订阅、高亮和布局资源', function () {
    var overlay = createElement(['hidden']);
    var tooltip = createElement(['hidden']);
    var target = createElement(['tut-highlight']);
    var eventBus = createEventBus();
    var layout = {
      bind: vi.fn(),
      position: vi.fn(),
      cancelScheduled: vi.fn(),
      dispose: vi.fn(),
      getDiagnostics: function () { return Object.freeze({ bound: false }); },
    };
    var doc = {
      activeElement: null,
      getElementById: function (id) {
        if (id === 'tutorial-overlay') return overlay;
        if (id === 'tutorial-tooltip') return tooltip;
        return null;
      },
      querySelector: function () { return target; },
      querySelectorAll: function () { return [target]; },
    };
    var controller = createTutorialOverlayController({ document: doc, eventBus: eventBus, layout: layout });

    controller.init(function () {}, function () {});
    eventBus.emit('tutorial:step', { step: { trigger: 'click', highlight: '#target' }, index: 0, total: 1 });
    eventBus.emit('tutorial:complete');
    expect(overlay.classList.contains('hidden')).toBe(true);
    expect(tooltip.classList.contains('hidden')).toBe(true);
    expect(target.classList.contains('tut-highlight')).toBe(false);

    controller.destroy();
    expect(layout.dispose).toHaveBeenCalledOnce();
    expect(eventBus.has('tutorial:step')).toBe(false);
    expect(eventBus.has('tutorial:complete')).toBe(false);
    expect(controller.getDiagnostics()).toMatchObject({ initialized: false, destroyCount: 1 });
  });

  it('只为静态目标补定位类，不改写 fixed 目标的布局语义', function () {
    var overlay = createElement(['hidden']);
    var tooltip = createElement(['hidden']);
    var staticTarget = createElement();
    var fixedTarget = createElement();
    var eventBus = createEventBus();
    var layout = {
      bind: vi.fn(), position: vi.fn(), cancelScheduled: vi.fn(), dispose: vi.fn(),
      getDiagnostics: function () { return Object.freeze({ bound: true }); },
    };
    var doc = {
      activeElement: null,
      getElementById: function (id) {
        if (id === 'tutorial-overlay') return overlay;
        if (id === 'tutorial-tooltip') return tooltip;
        return null;
      },
      querySelector: function (selector) { return selector === '#static' ? staticTarget : fixedTarget; },
      querySelectorAll: function () { return [staticTarget, fixedTarget]; },
    };
    var controller = createTutorialOverlayController({
      document: doc,
      eventBus: eventBus,
      layout: layout,
      getComputedStyle: function (element) { return { position: element === staticTarget ? 'static' : 'fixed' }; },
    });
    controller.init(function () {}, function () {});

    eventBus.emit('tutorial:step', { step: { highlight: '#static' }, index: 0, total: 1 });
    expect(staticTarget.classList.contains('tut-highlight')).toBe(true);
    expect(staticTarget.classList.contains('tut-highlight-static')).toBe(true);
    eventBus.emit('tutorial:step', { step: { highlight: '#fixed' }, index: 0, total: 1 });
    expect(staticTarget.classList.contains('tut-highlight')).toBe(false);
    expect(staticTarget.classList.contains('tut-highlight-static')).toBe(false);
    expect(fixedTarget.classList.contains('tut-highlight')).toBe(true);
    expect(fixedTarget.classList.contains('tut-highlight-static')).toBe(false);
  });

  it('教程焦点在首尾动作间循环，重复 init 与 destroy 不泄漏监听', function () {
    var overlay = createElement(['hidden']);
    var tooltip = createElement(['hidden']);
    var next = createElement();
    var helper = createElement();
    var skip = createElement();
    tooltip.actionButtons = [next, helper, skip];
    var eventBus = createEventBus();
    var layout = {
      bind: vi.fn(), position: vi.fn(), cancelScheduled: vi.fn(), dispose: vi.fn(),
      getDiagnostics: function () { return Object.freeze({ bound: true }); },
    };
    var doc = {
      activeElement: tooltip,
      getElementById: function (id) {
        if (id === 'tutorial-overlay') return overlay;
        if (id === 'tutorial-tooltip') return tooltip;
        return null;
      },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
    };
    [tooltip, next, helper, skip].forEach(function (element) {
      element.focus = function () { doc.activeElement = element; };
    });
    var controller = createTutorialOverlayController({ document: doc, eventBus: eventBus, layout: layout });
    controller.init(function () {}, function () {});
    controller.init(function () {}, function () {});
    expect(tooltip.listenerCount('keydown')).toBe(1);
    tooltip.classList.remove('hidden');

    var backward = { key: 'Tab', shiftKey: true, preventDefault: vi.fn() };
    tooltip.dispatch('keydown', backward);
    expect(doc.activeElement).toBe(skip);
    expect(backward.preventDefault).toHaveBeenCalledOnce();
    var forward = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() };
    tooltip.dispatch('keydown', forward);
    expect(doc.activeElement).toBe(next);
    expect(forward.preventDefault).toHaveBeenCalledOnce();
    expect(controller.getDiagnostics()).toMatchObject({ focusTrapBound: true, focusWrapCount: 2 });

    controller.destroy();
    expect(tooltip.listenerCount('keydown')).toBe(0);
    expect(controller.getDiagnostics().focusTrapBound).toBe(false);
  });
});
