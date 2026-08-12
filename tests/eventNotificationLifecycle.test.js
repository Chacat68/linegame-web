import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as ActionGuideUI from '../js/ui/ActionGuideUI.js';
import { getCurrentSuggestion } from '../js/systems/guidance/GuidanceSystem.js';
import { createTestState } from './helpers.js';

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
    textContent: '',
    onclick: null,
    onkeydown: null,
    tabIndex: -1,
    hidden: false,
    innerHTML: '',
    dataset: {},
    focusCalls: 0,
    parentNode: null,
    classList: createFakeClassList(initialClasses),
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    addEventListener: function (type, handler) {
      listeners[type] = handler;
    },
    dispatchClick: function (target) {
      if (listeners.click) listeners.click({ target: target });
    },
    focus: function () {
      this.focusCalls += 1;
    },
    cloneNode: function () {
      var clone = createFakeElement(initialClasses);
      clone.id = this.id;
      return clone;
    },
  };
}

function createActionTarget() {
  return {
    closest: function (selector) {
      return selector === '[data-action-guide-action]' ? this : null;
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

  it('页面只保留一个 Command Slot，不再渲染独立事件通知 CTA', function () {
    var html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    var eventUiSource = readFileSync(new URL('../js/ui/EventUI.js', import.meta.url), 'utf8');

    expect(html).toContain('id="floating-command-stack"');
    expect(html).toContain('data-command-slot="primary"');
    expect((html.match(/data-command-slot="primary"/g) || [])).toHaveLength(1);
    expect(html).not.toContain('id="event-notification"');
    expect(html).not.toContain('id="event-notif-');
    expect(eventUiSource).not.toContain('event-notification');
    expect(eventUiSource).not.toContain('showEventNotificationBar');
  });

  it('pending event 只投影为 Command Slot 的唯一可聚焦 CTA', async function () {
    vi.resetModules();

    var settingsModal = createFakeElement(['modal']);
    settingsModal.id = 'settings-modal';
    var commandSlot = createFakeElement();
    commandSlot.id = 'action-guide';

    var elements = {
      'settings-modal': settingsModal,
      'action-guide': commandSlot,
    };

    globalThis.document = {
      activeElement: null,
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
    var selectedSuggestion = null;

    var pendingEvent = {
      id: 'signal_lost',
      icon: '📡',
      title: '信号中断',
      description: '测试事件',
      risk: 'dangerous',
      stage: 'chain',
      choices: [{ text: '确认' }],
    };
    EventUI.setPendingEvent(pendingEvent, function () {});

    var suggestion = getCurrentSuggestion(createTestState(), {
      eventPending: EventUI.hasPendingEvent(),
      pendingEvent: EventUI.getPendingEvent(),
    });
    ActionGuideUI.init(function (next) { selectedSuggestion = next; });
    ActionGuideUI.render(suggestion);

    expect(EventUI.hasPendingEvent()).toBe(true);
    expect(EventUI.getPendingEvent()).toBe(pendingEvent);
    expect(suggestion).toMatchObject({
      id: 'handle-pending-event',
      actionType: 'event.open',
      title: '处理「信号中断」',
    });
    expect(commandSlot.hidden).toBe(false);
    expect(commandSlot.dataset.commandSlotState).toBe('ready');
    expect(commandSlot.innerHTML).toContain('高风险 · 事件链');
    expect((commandSlot.innerHTML.match(/<button/g) || [])).toHaveLength(1);
    expect(globalThis.document.getElementById('event-notification')).toBe(null);

    commandSlot.dispatchClick(createActionTarget());
    expect(selectedSuggestion).toBe(suggestion);

    ActionGuideUI.showProcessing(suggestion, '正在打开事件');
    expect(commandSlot.dataset.commandSlotState).toBe('processing');
    expect((commandSlot.innerHTML.match(/<button/g) || [])).toHaveLength(0);

    EventUI.clearPendingEvent();
    ActionGuideUI.render(null);
    expect(commandSlot.hidden).toBe(true);
    expect(commandSlot.dataset.commandSlotState).toBe('empty');
  });
});
