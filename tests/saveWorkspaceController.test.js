import { describe, expect, it, vi } from 'vitest';
import { SAVE_COMMAND } from '../js/core/SaveCommand.js';
import { createSaveWorkspaceController } from '../js/ui/SaveWorkspaceController.js';

function createTarget(className, slotId) {
  var target = {
    className: className,
    dataset: { slot: slotId == null ? '' : String(slotId) },
    closest: function (selector) {
      var classMatch = selector.match(/^\.([\w-]+)/);
      if (!classMatch || classMatch[1] !== className) return null;
      if (selector.indexOf('[data-slot]') >= 0 && !target.dataset.slot) return null;
      return target;
    },
  };
  return target;
}

function createContainer() {
  var attrs = Object.create(null);
  var status = { textContent: '', dataset: {} };
  var exportSelect = { value: '1' };
  var importSelect = { value: '1' };
  var focusTargets = Object.create(null);
  return {
    innerHTML: '',
    onclick: null,
    status: status,
    exportSelect: exportSelect,
    importSelect: importSelect,
    focusTargets: focusTargets,
    setAttribute: function (name, value) { attrs[name] = String(value); },
    getAttribute: function (name) { return attrs[name] || null; },
    querySelector: function (selector) {
      if (selector === '.save-transfer-status') return status;
      if (selector === '.save-export-slot-select') return exportSelect;
      if (selector === '.save-import-slot-select') return importSelect;
      if (Object.prototype.hasOwnProperty.call(focusTargets, selector)) return focusTargets[selector];
      return null;
    },
  };
}

function createFocusable() {
  return {
    disabled: false,
    isConnected: true,
    focus: vi.fn(),
  };
}

function createReadySlot(slotId) {
  return {
    slotId: slotId,
    isEmpty: false,
    isCorrupted: false,
    meta: { timestampMs: 1717200000000, credits: 1000, day: 3 },
  };
}

describe('SaveWorkspaceController', function () {
  it('通过单一容器事件委托向最新 command 端口发布保存动作', function () {
    var container = createContainer();
    var first = vi.fn();
    var latest = vi.fn();
    var savePort = {
      listSlots: function () { return [{ slotId: 1, isEmpty: true, isCorrupted: false }]; },
    };
    var controller = createSaveWorkspaceController({ save: savePort, document: { getElementById: function () { return container; } } });

    controller.render({ onCommand: first });
    controller.render({ onCommand: latest });
    container.onclick({ target: createTarget('save-btn', 1) });

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith({ type: SAVE_COMMAND.SAVE_SLOT, slotId: 1 });
    expect(Object.isFrozen(latest.mock.calls[0][0])).toBe(true);
    expect(controller.getDiagnostics()).toMatchObject({ active: true, bindCount: 2, commandCount: 1, lastAction: 'save' });
  });

  it('集中处理确认、删除重绘，并在重置时释放自有确认和绑定', function () {
    var container = createContainer();
    var emptySlotSaveButton = createFocusable();
    var scrollOwner = { getBoundingClientRect: function () { return { top: 80, right: 360, bottom: 520, left: 20 }; } };
    emptySlotSaveButton.closest = function (selector) { return selector === '.settings-main-content' ? scrollOwner : null; };
    emptySlotSaveButton.getBoundingClientRect = function () { return { top: 530, right: 340, bottom: 564, left: 40 }; };
    emptySlotSaveButton.scrollIntoView = vi.fn();
    container.focusTargets['.save-btn[data-slot="1"]'] = emptySlotSaveButton;
    var slots = [createReadySlot(1)];
    var requests = [];
    var cancel = vi.fn();
    var savePort = {
      listSlots: function () { return slots; },
      deleteSlot: vi.fn(function () { slots = [{ slotId: 1, isEmpty: true, isCorrupted: false }]; }),
    };
    var confirm = {
      open: function (request) { requests.push(request); return true; },
      cancel: cancel,
    };
    var controller = createSaveWorkspaceController({ save: savePort, confirm: confirm, document: { getElementById: function () { return container; } } });

    controller.render({});
    container.onclick({ target: createTarget('del-btn', 1) });
    expect(requests[0].title).toBe('删除槽位 1？');
    requests[0].onConfirm();
    expect(savePort.deleteSlot).toHaveBeenCalledWith(1);
    expect(controller.getDiagnostics().renderCount).toBe(2);
    expect(emptySlotSaveButton.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(emptySlotSaveButton.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(controller.getDiagnostics()).toMatchObject({
      focusRestoreCount: 1,
      lastFocusedSlotId: 1,
      lastFocusReason: 'delete',
    });

    slots = [createReadySlot(1)];
    controller.render({});
    container.onclick({ target: createTarget('load-btn', 1) });
    controller.reset();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(container.onclick).toBeNull();
    expect(controller.getDiagnostics()).toMatchObject({ active: false, renderCount: 0, resetCount: 1 });
  });

  it('导出文件后记录状态并延迟释放临时资源', function () {
    var container = createContainer();
    var link = { parentNode: null, click: vi.fn() };
    var body = {
      appendChild: function (element) { element.parentNode = body; },
      removeChild: vi.fn(function (element) { element.parentNode = null; }),
    };
    var deferred = null;
    var urlPort = { createObjectURL: vi.fn(function () { return 'blob:save'; }), revokeObjectURL: vi.fn() };
    var controller = createSaveWorkspaceController({
      save: { listSlots: function () { return [createReadySlot(1)]; }, exportSave: function () { return '{"ok":true}'; } },
      document: { body: body, getElementById: function () { return container; }, createElement: function () { return link; } },
      url: urlPort,
      createBlob: function () { return { type: 'application/json' }; },
      now: function () { return 123; },
      defer: function (callback) { deferred = callback; },
    });

    controller.render({});
    container.onclick({ target: createTarget('export-btn') });

    expect(link.download).toBe('startrader_save_1_123.json');
    expect(link.click).toHaveBeenCalledTimes(1);
    expect(container.status.textContent).toBe('已生成槽位 1 的导出文件。');
    expect(controller.getDiagnostics()).toMatchObject({ exportCount: 1, lastAction: 'export' });
    deferred();
    expect(urlPort.revokeObjectURL).toHaveBeenCalledWith('blob:save');
    expect(body.removeChild).toHaveBeenCalledWith(link);
  });

  it('重置后忽略仍在完成的文件读取，避免跨会话导入', function () {
    var container = createContainer();
    var input = { files: [{ name: 'backup.json' }], onchange: null, click: vi.fn() };
    var reader = { result: '{"save":true}', readyState: 0, onload: null, onerror: null, readAsText: vi.fn() };
    var importSave = vi.fn(function () { return { ok: true, msg: '导入成功' }; });
    var controller = createSaveWorkspaceController({
      save: {
        listSlots: function () { return [{ slotId: 1, isEmpty: true, isCorrupted: false }]; },
        importSave: importSave,
      },
      document: {
        getElementById: function () { return container; },
        createElement: function () { return input; },
      },
      createFileReader: function () { return reader; },
    });

    controller.render({});
    container.onclick({ target: createTarget('import-btn') });
    input.onchange();
    expect(reader.readAsText).toHaveBeenCalledWith(input.files[0]);
    controller.reset();
    reader.onload();

    expect(importSave).not.toHaveBeenCalled();
    expect(controller.getDiagnostics()).toMatchObject({ active: false, importCount: 0, pendingFile: false });
  });

  it('成功导入重绘后将焦点移到目标槽位的读取动作', function () {
    var container = createContainer();
    container.importSelect.value = '2';
    var importedSlotLoadButton = createFocusable();
    container.focusTargets['.load-btn[data-slot="2"]'] = importedSlotLoadButton;
    var slots = [{ slotId: 2, isEmpty: true, isCorrupted: false }];
    var input = { files: [{ name: 'backup.json' }], onchange: null, click: vi.fn() };
    var reader = { result: '{"save":true}', readyState: 0, onload: null, onerror: null, readAsText: vi.fn() };
    var controller = createSaveWorkspaceController({
      save: {
        listSlots: function () { return slots; },
        importSave: vi.fn(function () {
          slots = [createReadySlot(2)];
          return { ok: true, msg: '导入成功' };
        }),
      },
      document: {
        getElementById: function () { return container; },
        createElement: function () { return input; },
      },
      createFileReader: function () { return reader; },
    });

    controller.render({});
    container.onclick({ target: createTarget('import-btn') });
    input.onchange();
    reader.onload();

    expect(container.status.textContent).toBe('导入成功');
    expect(importedSlotLoadButton.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(controller.getDiagnostics()).toMatchObject({
      importCount: 1,
      renderCount: 2,
      focusRestoreCount: 1,
      lastFocusedSlotId: 2,
      lastFocusReason: 'import',
    });
  });
});
