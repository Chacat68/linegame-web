import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createClassList(initialValues) {
  var values = new Set(initialValues || []);
  return {
    add: function (value) { values.add(value); },
    remove: function (value) { values.delete(value); },
    contains: function (value) { return values.has(value); },
    toggle: function (value, force) {
      var shouldAdd = typeof force === 'boolean' ? force : !values.has(value);
      if (shouldAdd) values.add(value);
      else values.delete(value);
      return shouldAdd;
    },
  };
}

function createElement(id, initialClasses) {
  var listeners = Object.create(null);
  var attributes = Object.create(null);
  return {
    id: id || '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    dataset: {},
    classList: createClassList(initialClasses),
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatch: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || { target: this, preventDefault: function () {} });
      }, this);
    },
    setAttribute: function (name, value) { attributes[name] = String(value); },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    querySelector: function (selector) {
      if (selector === '[autofocus]') return null;
      if (selector === '.modal-box, [tabindex="-1"]') return this.modalBox || null;
      return null;
    },
    focus: function () { this.focusCount = (this.focusCount || 0) + 1; },
  };
}

describe('ActionConfirmUI', function () {
  var originalDocument;

  beforeEach(function () {
    vi.resetModules();
    originalDocument = globalThis.document;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('在父弹窗上展示影响摘要，取消后恢复父弹窗与触发点', async function () {
    var keydownHandlers = [];
    var parent = createElement('settings-modal', ['modal']);
    var parentBox = createElement('settings-box');
    parent.modalBox = parentBox;
    var modal = createElement('action-confirm-modal', ['modal', 'hidden']);
    modal.modalBox = createElement('action-confirm-box');
    var trigger = createElement('danger-trigger');
    trigger.closest = function () {
      return parent.classList.contains('hidden') ? parent : null;
    };
    var elements = {
      'settings-modal': parent,
      'action-confirm-modal': modal,
      'action-confirm-title': createElement('action-confirm-title'),
      'action-confirm-message': createElement('action-confirm-message'),
      'action-confirm-impact': createElement('action-confirm-impact'),
      'action-confirm-kicker': createElement('action-confirm-kicker'),
      'action-confirm-cancel': createElement('action-confirm-cancel'),
      'action-confirm-accept': createElement('action-confirm-accept'),
    };
    modal.querySelector = function (selector) {
      if (selector === '#action-confirm-cancel') return elements['action-confirm-cancel'];
      if (selector === '[autofocus]') return null;
      if (selector === '.modal-box, [tabindex="-1"]') return modal.modalBox;
      return null;
    };

    globalThis.document = {
      body: createElement('body'),
      activeElement: trigger,
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) {
        if (selector === '.modal') return [parent, modal];
        return [];
      },
      addEventListener: function (type, handler) {
        if (type === 'keydown') keydownHandlers.push(handler);
      },
    };

    var confirmed = 0;
    var cancelled = 0;
    var ConfirmUI = await import('../js/ui/ActionConfirmUI.js?v=20260621-settingsfallback1');
    expect(ConfirmUI.open({
      title: '清空全部本地存档？',
      message: '操作不可恢复。',
      confirmLabel: '确认清空',
      details: [
        { label: '自动存档', value: '<永久删除>', tone: 'danger' },
        { label: '当前运行', value: '继续保留', tone: 'safe' },
      ],
      onConfirm: function () { confirmed += 1; },
      onCancel: function () { cancelled += 1; },
    })).toBe(true);

    expect(parent.classList.contains('hidden')).toBe(true);
    expect(modal.classList.contains('hidden')).toBe(false);
    expect(modal.dataset.confirmTone).toBe('danger');
    expect(elements['action-confirm-title'].textContent).toBe('清空全部本地存档？');
    expect(elements['action-confirm-impact'].innerHTML).toContain('&lt;永久删除&gt;');
    expect(elements['action-confirm-impact'].getAttribute('aria-hidden')).toBe('false');
    expect(elements['action-confirm-accept'].textContent).toBe('确认清空');
    expect(elements['action-confirm-cancel'].focusCount).toBe(1);

    keydownHandlers.forEach(function (handler) { handler({ key: 'Escape' }); });

    expect(confirmed).toBe(0);
    expect(cancelled).toBe(1);
    expect(modal.classList.contains('hidden')).toBe(true);
    expect(parent.classList.contains('hidden')).toBe(false);
    expect(trigger.focusCount).toBe(1);
  });

  it('只有确认按钮会执行危险操作', async function () {
    var modal = createElement('action-confirm-modal', ['modal', 'hidden']);
    modal.modalBox = createElement('action-confirm-box');
    var elements = {
      'action-confirm-modal': modal,
      'action-confirm-title': createElement(),
      'action-confirm-message': createElement(),
      'action-confirm-impact': createElement(),
      'action-confirm-kicker': createElement(),
      'action-confirm-cancel': createElement(),
      'action-confirm-accept': createElement(),
    };
    globalThis.document = {
      body: createElement('body'),
      getElementById: function (id) { return elements[id] || null; },
      querySelectorAll: function (selector) { return selector === '.modal' ? [modal] : []; },
      addEventListener: function () {},
    };

    var confirmed = 0;
    var ConfirmUI = await import('../js/ui/ActionConfirmUI.js?v=20260621-hudsafe2');
    ConfirmUI.open({ onConfirm: function () { confirmed += 1; } });
    elements['action-confirm-accept'].dispatch('click');

    expect(confirmed).toBe(1);
    expect(modal.classList.contains('hidden')).toBe(true);
  });
});
