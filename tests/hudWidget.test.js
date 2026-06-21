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

function createFakeElement() {
  var listeners = Object.create(null);
  var attributes = Object.create(null);
  return {
    dataset: {},
    textContent: '',
    focusCount: 0,
    classList: createFakeClassList(),
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    dispatchEvent: function (type, event) {
      (listeners[type] || []).forEach(function (handler) {
        handler(event || {
          preventDefault: function () {},
          stopPropagation: function () {},
          target: this,
        });
      }, this);
    },
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    querySelector: function () {
      return null;
    },
    focus: function () {
      this.focusCount += 1;
    },
  };
}

function createWidget(label) {
  var button = createFakeElement();
  var attributes = {
    'aria-label': label,
  };
  var widget = {
    dataset: { hudWidget: label },
    classList: createFakeClassList(),
    querySelector: function (selector) {
      if (selector === '[data-hud-widget-toggle]') return button;
      return null;
    },
    setAttribute: function (name, value) {
      attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  };
  return { widget: widget, button: button };
}

describe('HUD widget toggles', function () {
  var originalDocument;

  beforeEach(function () {
    originalDocument = globalThis.document;
  });

  afterEach(function () {
    globalThis.document = originalDocument;
  });

  it('左侧 HUD 控制台会切换面板并允许关闭后重新展开', async function () {
    vi.resetModules();

    var mapPanel = createWidget('银河地图搜索面板');
    mapPanel.widget.dataset.hudWidget = 'galactic-map';
    var targetPanel = createWidget('当前目标');
    targetPanel.widget.dataset.hudWidget = 'target-intel';
    var questPanel = createWidget('任务追踪');
    questPanel.widget.dataset.hudWidget = 'quest-tracker';
    var dockToggle = createFakeElement();
    var mapButton = createFakeElement();
    mapButton.dataset.hudDockPanel = 'galactic-map';
    var targetButton = createFakeElement();
    targetButton.dataset.hudDockPanel = 'target-intel';
    var questButton = createFakeElement();
    questButton.dataset.hudDockPanel = 'quest-tracker';
    var victoryModal = createFakeElement();
    var victoryBtn = createFakeElement();
    var victoryClose = createFakeElement();

    globalThis.document = {
      getElementById: function (id) {
        if (id === 'victory-modal') return victoryModal;
        if (id === 'victory-progress-btn') return victoryBtn;
        if (id === 'victory-modal-close') return victoryClose;
        return null;
      },
      querySelectorAll: function (selector) {
        if (selector === '[data-hud-widget]') return [mapPanel.widget, targetPanel.widget, questPanel.widget];
        if (selector === '[data-hud-dock-panel]') return [mapButton, targetButton, questButton];
        return [];
      },
      querySelector: function (selector) {
        if (selector === '[data-hud-dock-toggle]') return dockToggle;
        if (selector === '[data-hud-widget="galactic-map"]') return mapPanel.widget;
        if (selector === '[data-hud-widget="target-intel"]') return targetPanel.widget;
        if (selector === '[data-hud-widget="quest-tracker"]') return questPanel.widget;
        if (selector === '[data-hud-dock-panel="galactic-map"]') return mapButton;
        if (selector === '[data-hud-dock-panel="target-intel"]') return targetButton;
        if (selector === '[data-hud-dock-panel="quest-tracker"]') return questButton;
        return null;
      },
    };

    var HUD = await import('../js/ui/HUD.js');
    HUD.init();

    expect(mapPanel.widget.classList.contains('hud-widget-active')).toBe(true);
    expect(mapPanel.widget.classList.contains('hud-widget-collapsed')).toBe(true);
    expect(dockToggle.getAttribute('aria-pressed')).toBe('false');
    expect(mapButton.classList.contains('is-selected')).toBe(true);
    expect(mapButton.classList.contains('is-active')).toBe(false);

    dockToggle.dispatchEvent('click');

    expect(mapPanel.widget.classList.contains('hud-widget-collapsed')).toBe(false);
    expect(dockToggle.getAttribute('aria-pressed')).toBe('true');
    expect(mapButton.classList.contains('is-active')).toBe(true);

    questButton.dispatchEvent('click');

    expect(questPanel.widget.classList.contains('hud-widget-active')).toBe(true);
    expect(questPanel.widget.classList.contains('hud-widget-collapsed')).toBe(false);
    expect(mapPanel.widget.classList.contains('hud-widget-active')).toBe(false);
    expect(questButton.classList.contains('is-active')).toBe(true);

    questPanel.button.dispatchEvent('click');

    expect(questPanel.widget.classList.contains('hud-widget-collapsed')).toBe(true);
    expect(dockToggle.getAttribute('aria-pressed')).toBe('false');
    expect(questButton.classList.contains('is-selected')).toBe(true);
    expect(questButton.getAttribute('aria-expanded')).toBe('false');
    expect(questButton.focusCount).toBe(1);

    dockToggle.dispatchEvent('click');

    expect(questPanel.widget.classList.contains('hud-widget-collapsed')).toBe(false);
    expect(dockToggle.getAttribute('aria-pressed')).toBe('true');
    expect(questButton.classList.contains('is-active')).toBe(true);
    expect(questButton.getAttribute('aria-expanded')).toBe('true');

    questButton.dispatchEvent('click');

    expect(questPanel.widget.classList.contains('hud-widget-collapsed')).toBe(true);
    expect(dockToggle.getAttribute('aria-pressed')).toBe('false');
    expect(questButton.classList.contains('is-active')).toBe(false);

    questButton.dispatchEvent('click');

    expect(questPanel.widget.classList.contains('hud-widget-collapsed')).toBe(false);
    expect(dockToggle.getAttribute('aria-pressed')).toBe('true');
    expect(questButton.classList.contains('is-active')).toBe(true);

    var EventBus = await import('../js/core/EventBus.js');
    EventBus.emit('starmap-rail:panel-open', { source: 'orbit-scan', panelId: 'orbit-scan' });

    expect(questPanel.widget.classList.contains('hud-widget-collapsed')).toBe(true);
    expect(dockToggle.getAttribute('aria-pressed')).toBe('false');
    expect(questButton.classList.contains('is-selected')).toBe(true);
    expect(questButton.classList.contains('is-active')).toBe(false);
  });
});
