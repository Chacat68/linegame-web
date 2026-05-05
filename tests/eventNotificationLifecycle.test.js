import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  return {
    id: '',
    textContent: '',
    onclick: null,
    parentNode: null,
    classList: createFakeClassList(initialClasses),
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    addEventListener: function () {},
    cloneNode: function () {
      var clone = createFakeElement(initialClasses);
      clone.id = this.id;
      return clone;
    },
  };
}

describe('Event notification lifecycle', function () {
  var originalDocument;

  beforeEach(function () {
    originalDocument = globalThis.document;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('最后一个阻塞层关闭后会恢复待处理事件通知条', async function () {
    vi.resetModules();

    var settingsModal = createFakeElement(['modal']);
    settingsModal.id = 'settings-modal';
    var notification = createFakeElement(['hidden']);
    notification.id = 'event-notification';
    var notifIcon = createFakeElement();
    notifIcon.id = 'event-notif-icon';
    var notifText = createFakeElement();
    notifText.id = 'event-notif-text';
    var notifOpen = createFakeElement();
    notifOpen.id = 'event-notif-open';

    var elements = {
      'settings-modal': settingsModal,
      'event-notification': notification,
      'event-notif-icon': notifIcon,
      'event-notif-text': notifText,
      'event-notif-open': notifOpen,
    };

    var notifParent = {
      replaceChild: function (newChild, oldChild) {
        if (oldChild && oldChild.id) {
          elements[oldChild.id] = newChild;
          newChild.parentNode = notifParent;
        }
      },
    };
    notifOpen.parentNode = notifParent;

    globalThis.document = {
      getElementById: function (id) {
        return elements[id] || null;
      },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [settingsModal];
        return [];
      },
      createElement: function () {
        return createFakeElement();
      },
    };

    var EventUI = await import('../js/ui/EventUI.js');
    var SurfaceManager = await import('../js/ui/SurfaceManager.js');

    EventUI.showEventNotification({
      icon: '📡',
      title: '信号中断',
      description: '测试事件',
      choices: [{ text: '确认' }],
    }, function () {});

    expect(EventUI.hasPendingEvent()).toBe(true);
    expect(notification.classList.contains('hidden')).toBe(true);

    SurfaceManager.hideBlockingSurface('settings-modal');

    expect(notification.classList.contains('hidden')).toBe(false);
    expect(notifIcon.textContent).toBe('📡');
    expect(notifText.textContent).toBe('信号中断 — 点击查看详情');
  });
});