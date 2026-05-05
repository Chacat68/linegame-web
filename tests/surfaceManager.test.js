import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bindBlockingSurfaceDismiss, hasBlockingSurfaceOpen, hideBlockingSurface, isBlockingSurfaceVisible, showBlockingSurface } from '../js/ui/SurfaceManager.js';

function createFakeClassList(initialValues) {
  var values = new Set(initialValues || []);
  return {
    add: function (value) {
      values.add(value);
    },
    remove: function (value) {
      values.delete(value);
    },
    contains: function (value) {
      return values.has(value);
    },
    toggle: function (value, force) {
      if (force === true) {
        values.add(value);
        return true;
      }
      if (force === false) {
        values.delete(value);
        return false;
      }
      if (values.has(value)) {
        values.delete(value);
        return false;
      }
      values.add(value);
      return true;
    },
  };
}

function createFakeElement(initialClasses) {
  var attributes = Object.create(null);
  var listeners = Object.create(null);
  return {
    id: '',
    dataset: {},
    onclick: null,
    classList: createFakeClassList(initialClasses),
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatchEvent: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || { target: this, key: '', preventDefault: function () {} });
      }, this);
    },
    listenerCount: function (type) {
      return (listeners[type] || []).length;
    },
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  };
}

describe('SurfaceManager', function () {
  var originalDocument;

  beforeEach(function () {
    originalDocument = globalThis.document;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('showBlockingSurface 会关闭其他 modal 并收起事件通知条', function () {
    var tradeModal = createFakeElement(['modal']);
    tradeModal.id = 'trade-modal';
    var eventModal = createFakeElement(['modal', 'hidden']);
    eventModal.id = 'event-modal';
    var settingsModal = createFakeElement(['modal']);
    settingsModal.id = 'settings-modal';
    var notification = createFakeElement();
    notification.id = 'event-notification';
    notification.onclick = function () {};

    var elements = {
      'trade-modal': tradeModal,
      'event-modal': eventModal,
      'settings-modal': settingsModal,
      'event-notification': notification,
    };

    globalThis.document = {
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [tradeModal, eventModal, settingsModal];
        return [];
      },
    };

    showBlockingSurface('event-modal');

    expect(eventModal.classList.contains('hidden')).toBe(false);
    expect(tradeModal.classList.contains('hidden')).toBe(true);
    expect(settingsModal.classList.contains('hidden')).toBe(true);
    expect(notification.classList.contains('hidden')).toBe(true);
    expect(notification.onclick).toBe(null);
    expect(eventModal.getAttribute('aria-hidden')).toBe('false');
    expect(tradeModal.getAttribute('aria-hidden')).toBe('true');
  });

  it('hideBlockingSurface 与 hasBlockingSurfaceOpen 会同步可见状态', function () {
    var dialogueModal = createFakeElement(['modal']);
    dialogueModal.id = 'dialogue-modal';

    globalThis.document = {
      getElementById: function (id) {
        return id === 'dialogue-modal' ? dialogueModal : null;
      },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [dialogueModal];
        return [];
      },
    };

    expect(isBlockingSurfaceVisible('dialogue-modal')).toBe(true);
    expect(hasBlockingSurfaceOpen()).toBe(true);
    expect(hasBlockingSurfaceOpen('dialogue-modal')).toBe(false);

    hideBlockingSurface('dialogue-modal');

    expect(isBlockingSurfaceVisible('dialogue-modal')).toBe(false);
    expect(hasBlockingSurfaceOpen()).toBe(false);
    expect(dialogueModal.getAttribute('aria-hidden')).toBe('true');
  });

  it('bindBlockingSurfaceDismiss 会支持统一 dismiss 与自定义 onDismiss', function () {
    var tradeModal = createFakeElement(['modal']);
    tradeModal.id = 'trade-modal';
    var documentListeners = Object.create(null);
    var dismissCount = 0;

    globalThis.document = {
      getElementById: function (id) {
        return id === 'trade-modal' ? tradeModal : null;
      },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [tradeModal];
        return [];
      },
      addEventListener: function (type, handler) {
        if (!documentListeners[type]) documentListeners[type] = [];
        documentListeners[type].push(handler);
      },
    };

    bindBlockingSurfaceDismiss('trade-modal', {
      onDismiss: function () {
        dismissCount += 1;
        tradeModal.classList.add('hidden');
      },
    });
    bindBlockingSurfaceDismiss('trade-modal', {
      onDismiss: function () {
        dismissCount += 10;
      },
    });

    expect(tradeModal.listenerCount('click')).toBe(1);
    expect((documentListeners.keydown || []).length).toBe(1);

    tradeModal.dispatchEvent('click', { target: tradeModal });
    expect(tradeModal.classList.contains('hidden')).toBe(true);
    expect(dismissCount).toBe(1);

    tradeModal.classList.remove('hidden');
    documentListeners.keydown[0]({ key: 'Escape' });
    expect(tradeModal.classList.contains('hidden')).toBe(true);
    expect(dismissCount).toBe(2);
  });
});