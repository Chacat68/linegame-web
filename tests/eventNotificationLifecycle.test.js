import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

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
    onkeydown: null,
    tabIndex: -1,
    focusCalls: 0,
    parentNode: null,
    classList: createFakeClassList(initialClasses),
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    addEventListener: function () {},
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

describe('Event notification lifecycle', function () {
  var originalDocument;

  beforeEach(function () {
    originalDocument = globalThis.document;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('通知条使用单一按钮语义并与行动指引组成动态浮动栈', function () {
    var html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    var css = readFileSync(new URL('../css/interstellar-trader.css', import.meta.url), 'utf8');
    var notificationMarkup = html.match(/<button\s+id="event-notification"[\s\S]*?<\/button>/);

    expect(notificationMarkup).not.toBe(null);
    expect(notificationMarkup[0]).toContain('id="event-notif-kicker"');
    expect(notificationMarkup[0]).toContain('id="event-notif-meta"');
    expect(notificationMarkup[0]).not.toContain('id="event-notif-open"');
    expect(html).toContain('id="floating-command-stack"');
    expect(css).toContain('.floating-command-stack > .action-guide');
    expect(css).toContain('.floating-command-stack > .event-notification');
    expect(css).toContain('left: max(12px, var(--safe-left));');
    expect(css).toContain('right: max(12px, var(--safe-right));');
    expect(css).not.toContain('body:has(#action-guide:not([hidden])) #event-notification');
    expect(css).toContain('body:has(#event-notification:not(.hidden)) .mini-console-broadcast');
  });

  it('最后一个阻塞层关闭后会恢复待处理事件通知条', async function () {
    vi.resetModules();

    var settingsModal = createFakeElement(['modal']);
    settingsModal.id = 'settings-modal';
    var notification = createFakeElement(['hidden']);
    notification.id = 'event-notification';
    var broadcast = createFakeElement();
    broadcast.id = 'mini-console-broadcast';
    var notifIcon = createFakeElement();
    notifIcon.id = 'event-notif-icon';
    var notifKicker = createFakeElement();
    notifKicker.id = 'event-notif-kicker';
    var notifText = createFakeElement();
    notifText.id = 'event-notif-text';
    var notifMeta = createFakeElement();
    notifMeta.id = 'event-notif-meta';

    var elements = {
      'settings-modal': settingsModal,
      'event-notification': notification,
      'mini-console-broadcast': broadcast,
      'event-notif-icon': notifIcon,
      'event-notif-kicker': notifKicker,
      'event-notif-text': notifText,
      'event-notif-meta': notifMeta,
    };

    globalThis.document = {
      activeElement: broadcast,
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
    expect(notification.getAttribute('aria-hidden')).toBe('false');
    expect(notification.getAttribute('tabindex')).toBe('0');
    expect(notification.tabIndex).toBe(0);
    expect(notification.focusCalls).toBe(1);
    expect(typeof notification.onclick).toBe('function');
    expect(notification.onkeydown).toBe(null);
    expect(notifIcon.textContent).toBe('📡');
    expect(notifKicker.textContent).toBe('中风险 · 中期事件');
    expect(notifText.textContent).toBe('信号中断');
    expect(notifMeta.textContent).toBe('单次处置 · 打开后选择处置方案');
    expect(notification.getAttribute('aria-label')).toBe('待处理事件：信号中断，中风险，中期事件。查看事件详情');
    expect(broadcast.getAttribute('aria-hidden')).toBe('true');
    expect(broadcast.getAttribute('tabindex')).toBe('-1');

    EventUI.hidePendingNotification();

    expect(broadcast.getAttribute('aria-hidden')).toBe('false');
    expect(broadcast.getAttribute('tabindex')).toBe('0');
  });
});
