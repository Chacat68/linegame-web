import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestState } from './helpers.js';
import * as Save from '../js/systems/save/SaveSystem.js';
import * as SaveUI from '../js/ui/SaveUI.js';

function getAttr(attrs, name) {
  var match = attrs.match(new RegExp(name + '="([^"]*)"'));
  return match ? match[1] : '';
}

function createFakeButton(attrs) {
  var listeners = Object.create(null);
  return {
    className: getAttr(attrs, 'class'),
    dataset: {
      slot: getAttr(attrs, 'data-slot'),
    },
    addEventListener: function (type, handler) {
      listeners[type] = handler;
    },
    click: function () {
      if (listeners.click) listeners.click();
    },
  };
}

function createFakeClassList(initialValues) {
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

function createFakeConfirmElement(id, initialClasses) {
  var listeners = Object.create(null);
  var attributes = Object.create(null);
  return {
    id: id || '',
    textContent: '',
    innerHTML: '',
    dataset: {},
    classList: createFakeClassList(initialClasses),
    addEventListener: function (type, handler) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    click: function () {
      (listeners.click || []).forEach(function (handler) { handler({ target: this }); }, this);
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
    focus: function () {},
  };
}

function createConfirmationHarness() {
  var modal = createFakeConfirmElement('action-confirm-modal', ['modal', 'hidden']);
  modal.modalBox = createFakeConfirmElement('action-confirm-box');
  return {
    modal: modal,
    elements: {
      'action-confirm-modal': modal,
      'action-confirm-title': createFakeConfirmElement('action-confirm-title'),
      'action-confirm-message': createFakeConfirmElement('action-confirm-message'),
      'action-confirm-impact': createFakeConfirmElement('action-confirm-impact'),
      'action-confirm-kicker': createFakeConfirmElement('action-confirm-kicker'),
      'action-confirm-cancel': createFakeConfirmElement('action-confirm-cancel'),
      'action-confirm-accept': createFakeConfirmElement('action-confirm-accept'),
    },
  };
}

function createFakeContainer() {
  var html = '';
  var buttons = [];
  var importSelect = { value: '1' };
  var exportSelect = { value: '' };
  var attrs = Object.create(null);
  var transferStatus = {
    textContent: '',
    dataset: {},
  };

  return {
    get innerHTML() {
      return html;
    },
    set innerHTML(value) {
      html = String(value);
      buttons = Array.from(html.matchAll(/<button([^>]*)>/g)).map(function (match) {
        return createFakeButton(match[1]);
      });
      var exportBlock = html.match(/<select id="save-export-slot-select"[\s\S]*?<\/select>/);
      var selectedExport = exportBlock && exportBlock[0].match(/<option value="([^"]*)"[^>]* selected/);
      exportSelect.value = selectedExport ? selectedExport[1] : '';
      transferStatus.textContent = '';
      transferStatus.dataset = {};
    },
    setAttribute: function (name, value) {
      attrs[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    querySelectorAll: function (selector) {
      var className = selector.charAt(0) === '.' ? selector.slice(1) : selector;
      return buttons.filter(function (button) {
        return button.className.split(/\s+/).includes(className);
      });
    },
    querySelector: function (selector) {
      if (selector === '.save-import-slot-select') return importSelect;
      if (selector === '.save-export-slot-select') return exportSelect;
      if (selector === '.save-transfer-status' && html.indexOf('class="save-transfer-status"') >= 0) return transferStatus;
      var matches = this.querySelectorAll(selector);
      return matches.length ? matches[0] : null;
    },
  };
}

function getSaveSlotListItemCount(html) {
  var match = html.match(/<div class="save-slot-grid"[\s\S]*?<\/div><section class="save-transfer-bar"/);
  if (!match) return 0;
  return (match[0].match(/role="listitem"/g) || []).length;
}

describe('SaveUI.render', function () {
  var originalDocument;
  var originalAlert;
  var originalFileReader;

  beforeEach(function () {
    originalDocument = globalThis.document;
    originalAlert = globalThis.alert;
    originalFileReader = globalThis.FileReader;
    globalThis.alert = function () {};
    globalThis.localStorage.clear();
  });

  afterEach(function () {
    globalThis.document = originalDocument;
    globalThis.alert = originalAlert;
    globalThis.FileReader = originalFileReader;
    globalThis.localStorage.clear();
  });

  it('渲染带状态摘要和语义列表的存档控制台', function () {
    var container = createFakeContainer();
    globalThis.document = {
      getElementById: function (id) {
        return id === 'save-list' ? container : null;
      },
    };

    SaveUI.render(function () {}, function () {});

    expect(container.getAttribute('role')).toBe('region');
    expect(container.getAttribute('aria-label')).toBe('存档工作区');
    expect(container.innerHTML).toContain('class="save-safety-panel save-safety-panel--warning" aria-label="存档安全状态"');
    expect(container.innerHTML).toContain('class="save-safety-grid" role="list" aria-label="存档安全指标"');
    expect(container.innerHTML).toContain('class="save-safety-focus" aria-label="存档处理状态"');
    expect(container.innerHTML).toContain('<span>存档状态</span>');
    expect(container.innerHTML).toContain('自动备份缺失');
    expect(container.innerHTML).toContain('class="save-health-strip" role="status" aria-live="polite"');
    expect(container.innerHTML).toContain('class="save-slot-grid" role="list" aria-label="本地存档槽位"');
    expect(getSaveSlotListItemCount(container.innerHTML)).toBe(4);
    expect(container.innerHTML).toContain('tabindex="0"');
    expect(container.innerHTML).toContain('aria-labelledby="save-slot-title-1"');
    expect(container.innerHTML).toContain('aria-describedby="save-slot-note-1"');
    expect(container.innerHTML).toContain('class="save-slot-actions" role="group"');
    expect(container.innerHTML).toContain('data-save-state="empty"');
    expect(container.innerHTML).toContain('type="button" class="btn-action save-btn"');
    expect(container.innerHTML).toContain('aria-label="保存到槽位 1"');
    expect(container.innerHTML).toContain('class="save-transfer-bar" role="region" aria-label="存档导入导出"');
    expect(container.innerHTML).toContain('id="save-transfer-status" class="save-transfer-status" role="status" aria-live="polite"');
    expect(container.innerHTML).toContain('id="save-export-slot-select" class="save-export-slot-select"');
    expect(container.innerHTML).toContain('class="save-transfer-control-group" role="group" aria-label="导出存档"');
    expect(container.innerHTML).toContain('disabled aria-disabled="true">导出存档</button>');
    expect(container.innerHTML).toContain('type="button" class="btn-action export-btn"');

    container.querySelector('.export-btn').click();

    expect(container.querySelector('.save-transfer-status').textContent).toBe('当前没有可导出的有效存档。');
    expect(container.querySelector('.save-transfer-status').dataset.statusTone).toBe('error');
  });

  it('自动存档缺失时会选择最近的有效手动槽位作为导出来源', function () {
    var container = createFakeContainer();
    var downloadCount = 0;
    globalThis.document = {
      getElementById: function (id) {
        return id === 'save-list' ? container : null;
      },
      createElement: function () {
        return {
          click: function () { downloadCount += 1; },
        };
      },
    };
    Save.saveGame(1, createTestState({ credits: 9000, day: 7 }), { timestampMs: 1717200000000 });

    SaveUI.render(function () {}, function () {});

    expect(container.innerHTML).toContain('<option value="1" selected>槽位 1</option>');
    expect(container.innerHTML).toContain('自动槽位不可用，迁移区已改用最近的有效手动槽位。');
    expect(container.innerHTML).not.toContain('export-btn" aria-label="导出所选存档" aria-describedby="save-transfer-desc save-transfer-status" disabled');
    expect(container.querySelector('.save-transfer-status').textContent).toBe('已选定导出来源；导入目标可在导入区单独调整。');
    expect(container.querySelector('.save-transfer-status').dataset.statusTone).toBe('neutral');

    container.querySelector('.export-btn').click();
    expect(downloadCount).toBe(1);
    expect(container.querySelector('.save-transfer-status').textContent).toBe('已生成槽位 1 的导出文件。');
    expect(container.querySelector('.save-transfer-status').dataset.statusTone).toBe('success');
  });

  it('导出存档后延迟释放 Blob URL', function () {
    var container = createFakeContainer();
    var clicked = false;
    var appended = false;
    var removed = false;
    var revokedUrls = [];
    var originalURL = globalThis.URL;
    var linkEl = {
      href: '',
      download: '',
      parentNode: null,
      click: function () { clicked = true; },
    };
    var body = {
      appendChild: function (element) {
        appended = element === linkEl;
        element.parentNode = body;
      },
      removeChild: function (element) {
        if (element === linkEl) removed = true;
        element.parentNode = null;
      },
    };

    vi.useFakeTimers();
    globalThis.URL = {
      createObjectURL: function () { return 'blob:linegame-save'; },
      revokeObjectURL: function (url) { revokedUrls.push(url); },
    };

    try {
      globalThis.document = {
        body: body,
        getElementById: function (id) {
          return id === 'save-list' ? container : null;
        },
        createElement: function () {
          return linkEl;
        },
      };
      Save.saveGame(1, createTestState({ credits: 7000, day: 5 }), { timestampMs: 1717200000000 });

      SaveUI.render(function () {}, function () {});
      container.querySelector('.export-btn').click();

      expect(clicked).toBe(true);
      expect(appended).toBe(true);
      expect(revokedUrls).toEqual([]);
      vi.runOnlyPendingTimers();
      expect(revokedUrls).toEqual(['blob:linegame-save']);
      expect(removed).toBe(true);
    } finally {
      vi.useRealTimers();
      globalThis.URL = originalURL;
    }
  });

  it('区分可读取、空槽位和损坏槽位，并保持按钮回调', function () {
    var container = createFakeContainer();
    var confirmation = createConfirmationHarness();
    var savedSlot = null;
    var loadedSlot = null;
    var fileChangeHandler = null;
    Save.saveGame(3, createTestState({ credits: 777777, day: 21 }), { timestampMs: 1717300000000 });
    var importJson = Save.exportSave(3);
    Save.deleteSlot(3);
    var fileInput = {
      files: [{ name: 'import-backup.json' }],
      addEventListener: function (type, handler) {
        if (type === 'change') fileChangeHandler = handler;
      },
      click: function () {
        if (fileChangeHandler) fileChangeHandler();
      },
    };
    globalThis.FileReader = function () {
      this.result = '';
      this.onload = null;
      this.readAsText = function () {
        this.result = importJson;
        if (this.onload) this.onload();
      };
    };
    globalThis.document = {
      getElementById: function (id) {
        if (id === 'save-list') return container;
        return confirmation.elements[id] || null;
      },
      querySelectorAll: function (selector) {
        return selector === '.modal' ? [confirmation.modal] : [];
      },
      addEventListener: function () {},
      createElement: function (tagName) {
        return tagName === 'input' ? fileInput : createFakeConfirmElement(tagName);
      },
    };

    Save.saveGame(1, createTestState({ credits: 123456, day: 9 }), { timestampMs: 1717200000000 });
    globalThis.localStorage.setItem('startrader_save_2', '{bad json');

    SaveUI.render(function (slotId) {
      savedSlot = slotId;
    }, function (slotId) {
      loadedSlot = slotId;
    });

    expect(container.innerHTML).toContain('data-save-state="ready"');
    expect(container.innerHTML).toContain('data-save-state="corrupted"');
    expect(container.innerHTML).toContain('资金 123,456');
    expect(container.innerHTML).toContain('存档已损坏');
    expect(container.innerHTML).toContain('save-safety-panel--danger');
    expect(container.innerHTML).toContain('发现异常槽位');

    container.querySelectorAll('.save-btn')[0].click();
    expect(savedSlot).toBeNull();
    confirmation.elements['action-confirm-accept'].click();

    container.querySelectorAll('.load-btn')[0].click();
    expect(loadedSlot).toBeNull();
    confirmation.elements['action-confirm-accept'].click();

    expect(savedSlot).toBe(1);
    expect(loadedSlot).toBe(1);

    container.querySelector('.import-btn').click();
    expect(Save.loadGame(1).state.credits).toBe(123456);
    expect(confirmation.elements['action-confirm-title'].textContent).toContain('导入到槽位 1');
    confirmation.elements['action-confirm-accept'].click();
    expect(Save.loadGame(1).state.credits).toBe(777777);
  });
});
