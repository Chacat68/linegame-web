import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTutorialTooltipLayout } from '../js/ui/TutorialTooltipLayout.js';

function createClassList(initialValues) {
  var values = new Set(initialValues || []);
  return {
    add: function (value) { values.add(value); },
    remove: function (value) { values.delete(value); },
    contains: function (value) { return values.has(value); },
    reset: function (value) {
      values = new Set(String(value || '').split(/\s+/).filter(Boolean));
    },
  };
}

function createEventTarget(properties) {
  var listeners = Object.create(null);
  return Object.assign({
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: function (type, handler) {
      listeners[type] = (listeners[type] || []).filter(function (entry) {
        return entry !== handler;
      });
    },
    emit: function (type) {
      (listeners[type] || []).slice().forEach(function (handler) { handler(); });
    },
    listenerCount: function (type) {
      return (listeners[type] || []).length;
    },
  }, properties || {});
}

function createElement(initialClasses) {
  var attributes = Object.create(null);
  var classList = createClassList(initialClasses);
  var element = {
    classList: classList,
    dataset: {},
    style: {},
    innerHTML: '',
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) { return attributes[name] || null; },
    removeAttribute: function (name) { delete attributes[name]; },
    focus: function () {},
    contains: function (target) { return target === this; },
  };
  Object.defineProperty(element, 'className', {
    get: function () { return ''; },
    set: function (value) { classList.reset(value); },
  });
  return element;
}

describe('TutorialUI viewport positioning', function () {
  var originalDocument;
  var originalWindow;
  var originalRequestAnimationFrame;
  var originalCancelAnimationFrame;
  var originalGetComputedStyle;

  beforeEach(function () {
    vi.resetModules();
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;
    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
    originalGetComputedStyle = globalThis.getComputedStyle;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    globalThis.getComputedStyle = originalGetComputedStyle;
  });

  it('低高度 visualViewport 会按真实尺寸和四向安全区居中', async function () {
    var overlay = createElement(['hidden']);
    var tooltip = createElement(['hidden']);
    tooltip.getBoundingClientRect = function () {
      return { width: 200, height: 160 };
    };

    globalThis.document = {
      documentElement: { clientWidth: 900, clientHeight: 700 },
      getElementById: function (id) {
        if (id === 'tutorial-overlay') return overlay;
        if (id === 'tutorial-tooltip') return tooltip;
        return null;
      },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
    };
    globalThis.window = createEventTarget({
      innerWidth: 900,
      innerHeight: 700,
      visualViewport: createEventTarget({
        width: 280,
        height: 220,
        offsetLeft: 10,
        offsetTop: 50,
      }),
    });
    globalThis.getComputedStyle = function () {
      var values = {
        '--safe-top': '8px',
        '--safe-right': '6px',
        '--safe-bottom': '12px',
        '--safe-left': '4px',
      };
      return {
        getPropertyValue: function (name) { return values[name] || '0px'; },
      };
    };

    var TutorialUI = await import('../js/ui/TutorialUI.js');
    var EventBus = await import('../js/core/EventBus.js');
    TutorialUI.init(function () {}, function () {});
    EventBus.emit('tutorial:step', {
      step: { phase: 1, title: '低高度定位', content: '保持完整可见', position: 'center', trigger: 'manual' },
      index: 0,
      total: 2,
    });

    expect(tooltip.dataset.viewport).toBe('compact');
    expect(tooltip.dataset.position).toBe('center');
    expect(tooltip.style.maxWidth).toBe('250px');
    expect(tooltip.style.maxHeight).toBe('180px');
    expect(tooltip.style.left).toBe('149px');
    expect(tooltip.style.top).toBe('158px');
    expect(tooltip.style.transform).toBe('translate(-50%, -50%)');

    TutorialUI.destroy();
  });

  it('教程关闭时仅从教程内部把焦点还给原入口', async function () {
    var overlay = createElement(['hidden']);
    var tooltip = createElement(['hidden']);
    var trigger = createElement();
    var triggerFocusCalls = 0;
    trigger.focus = function () { triggerFocusCalls += 1; };

    globalThis.document = {
      activeElement: trigger,
      documentElement: { clientWidth: 800, clientHeight: 600 },
      getElementById: function (id) {
        if (id === 'tutorial-overlay') return overlay;
        if (id === 'tutorial-tooltip') return tooltip;
        return null;
      },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
    };
    tooltip.focus = function () { globalThis.document.activeElement = tooltip; };
    globalThis.window = createEventTarget({ innerWidth: 800, innerHeight: 600 });

    var TutorialUI = await import('../js/ui/TutorialUI.js');
    var EventBus = await import('../js/core/EventBus.js');
    TutorialUI.init(function () {}, function () {});
    EventBus.emit('tutorial:step', {
      step: { phase: 1, title: '焦点恢复', content: '测试', position: 'center', trigger: 'manual' },
      index: 0,
      total: 1,
    });

    expect(globalThis.document.activeElement).toBe(tooltip);
    TutorialUI.hide();
    expect(triggerFocusCalls).toBe(1);

    TutorialUI.destroy();
  });

  it('视口变化后会按帧重排并使用 visualViewport 可见边界', async function () {
    var frames = [];
    var overlay = createElement(['hidden']);
    var tooltip = createElement(['hidden']);
    var target = createElement();
    var targetRect = { left: 740, right: 780, top: 220, bottom: 260, width: 40, height: 40 };
    var visualViewport = createEventTarget({
      width: 800,
      height: 600,
      offsetLeft: 0,
      offsetTop: 0,
    });
    var fakeWindow = createEventTarget({
      innerWidth: 800,
      innerHeight: 600,
      visualViewport: visualViewport,
    });

    tooltip.getBoundingClientRect = function () {
      return { width: 320, height: 240 };
    };
    target.getBoundingClientRect = function () { return targetRect; };

    globalThis.document = {
      documentElement: { clientWidth: 800, clientHeight: 600 },
      getElementById: function (id) {
        if (id === 'tutorial-overlay') return overlay;
        if (id === 'tutorial-tooltip') return tooltip;
        return null;
      },
      querySelector: function (selector) {
        return selector === '#tutorial-target' ? target : null;
      },
      querySelectorAll: function () { return []; },
    };
    globalThis.window = fakeWindow;
    globalThis.requestAnimationFrame = function (callback) {
      frames.push(callback);
      return frames.length;
    };
    globalThis.cancelAnimationFrame = function () {};

    var TutorialUI = await import('../js/ui/TutorialUI.js');
    var EventBus = await import('../js/core/EventBus.js');
    TutorialUI.init(function () {}, function () {});
    TutorialUI.init(function () {}, function () {});

    EventBus.emit('tutorial:step', {
      step: {
        phase: 1,
        title: '视口定位',
        content: '保持引导卡可见',
        highlight: '#tutorial-target',
        position: 'right',
        trigger: 'manual',
      },
      index: 0,
      total: 4,
    });

    expect(tooltip.dataset.position).toBe('left');
    expect(tooltip.dataset.viewport).toBe('wide');
    expect(tooltip.style.left).toBe('408px');
    expect(fakeWindow.listenerCount('resize')).toBe(1);
    expect(fakeWindow.listenerCount('scroll')).toBe(1);
    expect(visualViewport.listenerCount('resize')).toBe(1);

    targetRect = { left: 5, right: 25, top: 120, bottom: 160, width: 20, height: 40 };
    visualViewport.width = 390;
    visualViewport.height = 500;
    visualViewport.offsetTop = 80;
    fakeWindow.emit('resize');
    visualViewport.emit('scroll');

    expect(frames).toHaveLength(1);
    frames.shift()();

    expect(tooltip.dataset.position).toBe('right');
    expect(tooltip.dataset.viewport).toBe('compact');
    expect(tooltip.style.left).toBe('33px');
    expect(tooltip.style.top).toBe('90px');
    expect(tooltip.style.maxHeight).toBe('480px');
    expect(tooltip.style.maxWidth).toBe('370px');

    TutorialUI.destroy();
    expect(fakeWindow.listenerCount('resize')).toBe(0);
    expect(visualViewport.listenerCount('scroll')).toBe(0);
  });

  it('定位测量优先使用不受入场 transform 影响的布局尺寸', function () {
    var tooltip = createElement();
    var target = createElement();
    tooltip.offsetWidth = 300;
    tooltip.offsetHeight = 280;
    tooltip.getBoundingClientRect = function () { return { width: 288, height: 269 }; };
    target.getBoundingClientRect = function () {
      return { left: 175, right: 215, top: 450, bottom: 490, width: 40, height: 40 };
    };
    var doc = { documentElement: { clientWidth: 390, clientHeight: 500 } };
    var layout = createTutorialTooltipLayout({
      document: doc,
      window: createEventTarget({ innerWidth: 390, innerHeight: 500 }),
      getComputedStyle: function () {
        return { getPropertyValue: function () { return '0px'; } };
      },
    });

    layout.bind(tooltip);
    layout.position('top', target);

    expect(tooltip.dataset.position).toBe('top');
    expect(tooltip.style.top).toBe('162px');
    expect(tooltip.style.left).toBe('45px');
    layout.dispose();
  });

  it('紧凑视口样式会压缩内容并保留底部安全区', function () {
    var css = readFileSync('css/interstellar-trader.css', 'utf8');
    var systemsCss = readFileSync('css/systems.css', 'utf8');

    expect(css).toContain('.tutorial-tooltip[data-viewport="compact"]');
    expect(css).toContain('max-block-size: calc(100svh - 20px)');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(systemsCss).toContain('.tut-highlight.tut-highlight-static');
    expect(systemsCss).not.toMatch(/\.tut-highlight\s*\{[^}]*position\s*:/s);
  });
});
