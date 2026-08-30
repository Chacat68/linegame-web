import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createFleetInlinePortalController } from '../js/ui/FleetInlinePortalController.js';

function createClassList(initial) {
  var values = new Set(initial || []);
  return {
    add: function () { Array.from(arguments).forEach(function (value) { values.add(value); }); },
    contains: function (value) { return values.has(value); },
    remove: function () { Array.from(arguments).forEach(function (value) { values.delete(value); }); },
  };
}

function createElement(classes) {
  var attributes = Object.create(null);
  var listeners = Object.create(null);
  return {
    appendChild: function (child) { this.children.push(child); child.parentElement = this; return child; },
    addEventListener: function (eventName, handler) { listeners[eventName] = handler; },
    children: [],
    classList: createClassList(classes),
    disabled: false,
    focus: function () { this.focused = true; },
    focused: false,
    getAttribute: function (name) { return attributes[name] || null; },
    inert: false,
    innerHTML: '',
    isConnected: true,
    removeAttribute: function (name) { delete attributes[name]; },
    removeEventListener: function (eventName, handler) {
      if (listeners[eventName] === handler) delete listeners[eventName];
    },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    trigger: function (eventName, event) {
      if (listeners[eventName]) listeners[eventName](event);
    },
  };
}

function createHarness() {
  var list = createElement();
  var inline = createElement(['hidden']);
  var modal = createElement();
  var modalBox = createElement();
  var opener = createElement();
  var returnTarget = createElement();
  var viewport = {
    scrollCalls: [],
    scrollTo: function (options) { this.scrollTop = options.top; this.scrollCalls.push(options.top); },
    scrollTop: 318,
  };
  modal.querySelector = function (selector) { return selector === '.modal-box' ? modalBox : null; };
  inline.closest = function (selector) { return selector === '.workspace-terminal-content' ? viewport : null; };
  var elements = {
    'fleet-inline-container': inline,
    'fleet-list': list,
    'mod-modal': modal,
  };
  var documentRef = {
    activeElement: opener,
    createElement: function () { return createElement(); },
    getElementById: function (id) { return elements[id] || null; },
    querySelector: function (selector) { return selector === '#return-target' ? returnTarget : null; },
  };
  var clearSurfaceContext = vi.fn();
  var requestRender = vi.fn();
  var controller = createFleetInlinePortalController({
    clearSurfaceContext: clearSurfaceContext,
    getDocument: function () { return documentRef; },
    requestRender: requestRender,
  });
  return {
    clearSurfaceContext: clearSurfaceContext,
    controller: controller,
    inline: inline,
    list: list,
    modal: modal,
    modalBox: modalBox,
    opener: opener,
    requestRender: requestRender,
    returnTarget: returnTarget,
    viewport: viewport,
  };
}

describe('FleetInlinePortalController', function () {
  it('打开内联二级界面时统一投影 ARIA/inert、归零滚动并聚焦返回按钮', async function () {
    var harness = createHarness();
    expect(harness.controller.open('mod-modal', null, {
      describedBy: 'mod-modal-desc',
      labelledBy: 'mod-modal-title',
    })).toBe(true);
    await Promise.resolve();

    expect(harness.list.classList.contains('hidden')).toBe(true);
    expect(harness.list.getAttribute('aria-hidden')).toBe('true');
    expect(harness.list.inert).toBe(true);
    expect(harness.inline.classList.contains('hidden')).toBe(false);
    expect(harness.inline.getAttribute('aria-hidden')).toBe('false');
    expect(harness.inline.getAttribute('aria-labelledby')).toBe('mod-modal-title');
    expect(harness.inline.getAttribute('aria-describedby')).toBe('mod-modal-desc');
    expect(harness.modalBox.getAttribute('data-surface-mode')).toBe('inline');
    expect(harness.viewport.scrollTop).toBe(0);

    var backButton = harness.inline.children[0].children[0];
    expect(backButton.focused).toBe(true);
    expect(harness.controller.getDiagnostics()).toEqual({
      activeModalId: 'mod-modal',
      closeCount: 0,
      openCount: 1,
    });
  });

  it('Escape 归还 modal box、恢复滚动/焦点并只请求一次机库刷新', async function () {
    var harness = createHarness();
    var onClose = vi.fn();
    harness.controller.open('mod-modal', onClose, { returnFocusSelector: '#return-target' });
    await Promise.resolve();
    var prevented = false;
    var stopped = false;

    harness.inline.trigger('keydown', {
      key: 'Escape',
      preventDefault: function () { prevented = true; },
      stopPropagation: function () { stopped = true; },
    });
    await Promise.resolve();

    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
    expect(harness.controller.getActiveModalId()).toBeNull();
    expect(harness.modal.children).toContain(harness.modalBox);
    expect(harness.modalBox.getAttribute('data-surface-mode')).toBeNull();
    expect(harness.list.classList.contains('hidden')).toBe(false);
    expect(harness.list.inert).toBe(false);
    expect(harness.inline.classList.contains('hidden')).toBe(true);
    expect(harness.inline.inert).toBe(true);
    expect(harness.viewport.scrollTop).toBe(318);
    expect(harness.returnTarget.focused).toBe(true);
    expect(harness.clearSurfaceContext).toHaveBeenCalledWith('mod-modal');
    expect(onClose).toHaveBeenCalledOnce();
    expect(harness.requestRender).toHaveBeenCalledOnce();
  });

  it('程序化关闭幂等且可跳过焦点恢复，FleetUI 只通过 Surface Coordinator 组合', async function () {
    var harness = createHarness();
    harness.controller.open('mod-modal');
    await Promise.resolve();

    expect(harness.controller.close('crew-modal')).toBe(false);
    expect(harness.controller.close('mod-modal', { restoreFocus: false })).toBe(true);
    expect(harness.controller.close('mod-modal')).toBe(false);
    await Promise.resolve();
    expect(harness.opener.focused).toBe(false);
    expect(Object.isFrozen(harness.controller.getDiagnostics())).toBe(true);

    var fleetUi = readFileSync('js/ui/FleetUI.js', 'utf8');
    var surfaceCoordinator = readFileSync('js/ui/FleetSurfaceCoordinator.js', 'utf8');
    expect(fleetUi).toContain("from './FleetSurfaceCoordinator.js'");
    expect(fleetUi).not.toContain("from './FleetInlinePortalController.js'");
    expect(surfaceCoordinator).toContain("from './FleetInlinePortalController.js'");
    expect(fleetUi).not.toContain("inlineContainer.addEventListener('keydown'");
    expect(fleetUi).not.toContain("document.createElement('button')");
    expect(fleetUi.split('\n').length).toBeLessThan(260);
  });
});
