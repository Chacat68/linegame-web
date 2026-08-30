// js/ui/SaveWorkspaceController.js — 存档操作、迁移与 DOM 生命周期

import * as Save from '../systems/save/SaveSystem.js';
import * as ActionConfirmUI from './ActionConfirmUI.js';
import { createSaveActionPorts } from './SaveCommandAdapter.js';
import {
  buildSaveConfirmation,
  buildSaveWorkspaceView,
  formatSaveSlotLabel,
} from './SaveWorkspacePresenter.js';

function _optionalFunction(candidate, fallback) {
  return typeof candidate === 'function' ? candidate : fallback;
}

function _findTarget(event, selector) {
  var target = event && event.target;
  return target && typeof target.closest === 'function' ? target.closest(selector) : null;
}

export function createSaveWorkspaceController(options) {
  var config = options || {};
  var savePort = config.save || Save;
  var confirmPort = config.confirm || ActionConfirmUI;
  var activeContainer = null;
  var activeSlots = [];
  var onCommand = null;
  var actionPorts = createSaveActionPorts(null);
  var pendingFileInput = null;
  var pendingReader = null;
  var ownsConfirmation = false;
  var interactionRevision = 0;
  var bindCount = 0;
  var renderCount = 0;
  var commandCount = 0;
  var confirmCount = 0;
  var exportCount = 0;
  var importCount = 0;
  var focusRestoreCount = 0;
  var resetCount = 0;
  var lastAction = null;
  var lastFocusedSlotId = null;
  var lastFocusReason = null;

  function _getDocument() {
    return config.document || globalThis.document || null;
  }

  function _releaseBinding() {
    if (activeContainer && activeContainer.onclick === _handleClick) activeContainer.onclick = null;
    activeContainer = null;
  }

  function _releasePendingFile() {
    interactionRevision += 1;
    if (pendingFileInput) pendingFileInput.onchange = null;
    pendingFileInput = null;
    if (pendingReader && typeof pendingReader.abort === 'function' && pendingReader.readyState === 1) {
      try { pendingReader.abort(); } catch (err) { /* reader may already be complete */ }
    }
    pendingReader = null;
  }

  function _cancelOwnedConfirmation() {
    if (!ownsConfirmation) return;
    ownsConfirmation = false;
    if (confirmPort && typeof confirmPort.cancel === 'function') confirmPort.cancel();
  }

  function _setTransferStatus(message, tone) {
    if (!activeContainer || typeof activeContainer.querySelector !== 'function') return false;
    var statusEl = activeContainer.querySelector('.save-transfer-status');
    if (!statusEl) return false;
    statusEl.textContent = message || '';
    if (statusEl.dataset) statusEl.dataset.statusTone = tone || 'neutral';
    return true;
  }

  function _findSlot(slotId) {
    return activeSlots.find(function (slot) { return slot && slot.slotId === slotId; }) || null;
  }

  function _focusElement(element, slotId, reason) {
    if (!element || typeof element.focus !== 'function' || element.disabled || element.isConnected === false) return false;
    try {
      element.focus({ preventScroll: true });
    } catch (err) {
      element.focus();
    }

    var scrollOwner = typeof element.closest === 'function' ? element.closest('.settings-main-content') : null;
    if (scrollOwner && typeof element.getBoundingClientRect === 'function' &&
        typeof scrollOwner.getBoundingClientRect === 'function' && typeof element.scrollIntoView === 'function') {
      var targetRect = element.getBoundingClientRect();
      var ownerRect = scrollOwner.getBoundingClientRect();
      var outsideViewport = targetRect.top < ownerRect.top || targetRect.bottom > ownerRect.bottom ||
        targetRect.left < ownerRect.left || targetRect.right > ownerRect.right;
      if (outsideViewport) element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    focusRestoreCount += 1;
    lastFocusedSlotId = slotId;
    lastFocusReason = reason || null;
    return true;
  }

  function _restoreSlotFocus(slotId, reason) {
    if (!activeContainer || typeof activeContainer.querySelector !== 'function') return false;
    var normalizedSlotId = Number(slotId);
    if (!Number.isInteger(normalizedSlotId) || normalizedSlotId < 0) return false;
    var slotSelector = '[data-slot="' + normalizedSlotId + '"]';
    var preferredSelectors = reason === 'import'
      ? ['.load-btn' + slotSelector, '.save-btn' + slotSelector]
      : ['.save-btn' + slotSelector, '.load-btn' + slotSelector];
    preferredSelectors.push('.save-slot' + slotSelector);
    for (var index = 0; index < preferredSelectors.length; index += 1) {
      var target = activeContainer.querySelector(preferredSelectors[index]);
      if (_focusElement(target, normalizedSlotId, reason)) return true;
    }
    return false;
  }

  function _recordAction(action) {
    commandCount += 1;
    lastAction = action;
  }

  function _openConfirmation(action, slot, confirmAction, fileName) {
    var view = buildSaveConfirmation(action, slot, fileName);
    if (!view || !confirmPort || typeof confirmPort.open !== 'function') return false;
    confirmCount += 1;
    ownsConfirmation = true;
    var request = Object.assign({}, view, {
      onConfirm: function () {
        ownsConfirmation = false;
        confirmAction();
      },
      onCancel: function () { ownsConfirmation = false; },
    });
    var opened = confirmPort.open(request);
    if (opened === false) ownsConfirmation = false;
    return opened !== false;
  }

  function _handleSave(slotId) {
    var slot = _findSlot(slotId);
    if (!slot || slot.isEmpty) {
      _recordAction('save');
      actionPorts.onSave(slotId);
      return;
    }
    _openConfirmation('save', slot, function () {
      _recordAction('save');
      actionPorts.onSave(slotId);
    });
  }

  function _handleLoad(slotId) {
    var slot = _findSlot(slotId);
    if (!slot) return;
    _openConfirmation('load', slot, function () {
      _recordAction('load');
      actionPorts.onLoad(slotId);
    });
  }

  function _handleDelete(slotId) {
    var slot = _findSlot(slotId);
    if (!slot) return;
    _openConfirmation('delete', slot, function () {
      _recordAction('delete');
      if (savePort && typeof savePort.deleteSlot === 'function') savePort.deleteSlot(slotId);
      if (render({ onCommand: onCommand })) _restoreSlotFocus(slotId, 'delete');
    });
  }

  function _cleanupDownload(url, linkEl) {
    var cleanup = function () {
      var urlPort = config.url || globalThis.URL;
      if (url && urlPort && typeof urlPort.revokeObjectURL === 'function') urlPort.revokeObjectURL(url);
      if (linkEl && linkEl.parentNode && typeof linkEl.parentNode.removeChild === 'function') linkEl.parentNode.removeChild(linkEl);
    };
    _optionalFunction(config.defer, globalThis.setTimeout)(cleanup, 0);
  }

  function _handleExport() {
    var sourceSelect = activeContainer && activeContainer.querySelector('.save-export-slot-select');
    var sourceSlotId = sourceSelect ? parseInt(sourceSelect.value, 10) : NaN;
    var sourceSlot = _findSlot(sourceSlotId);
    if (!sourceSlot || sourceSlot.isEmpty || sourceSlot.isCorrupted) {
      _setTransferStatus('当前没有可导出的有效存档。', 'error');
      return;
    }
    var json = savePort && typeof savePort.exportSave === 'function' ? savePort.exportSave(sourceSlotId) : null;
    if (!json) {
      _setTransferStatus('所选槽位暂时无法导出。', 'error');
      return;
    }
    var doc = _getDocument();
    var urlPort = config.url || globalThis.URL;
    if (!doc || typeof doc.createElement !== 'function' || !urlPort || typeof urlPort.createObjectURL !== 'function') {
      _setTransferStatus('当前环境无法生成导出文件。', 'error');
      return;
    }
    var createBlob = config.createBlob || function (content) {
      return new Blob([content], { type: 'application/json' });
    };
    var url = urlPort.createObjectURL(createBlob(json));
    var linkEl = doc.createElement('a');
    linkEl.href = url;
    linkEl.download = 'startrader_save_' + sourceSlotId + '_' + _optionalFunction(config.now, Date.now)() + '.json';
    if (doc.body && typeof doc.body.appendChild === 'function') doc.body.appendChild(linkEl);
    if (typeof linkEl.click === 'function') linkEl.click();
    _cleanupDownload(url, linkEl);
    exportCount += 1;
    _recordAction('export');
    _setTransferStatus('已生成' + formatSaveSlotLabel(sourceSlot) + ' 的导出文件。', 'success');
  }

  function _finishFileRequest(input, reader) {
    if (input) input.onchange = null;
    if (pendingFileInput === input) pendingFileInput = null;
    if (pendingReader === reader) pendingReader = null;
  }

  function _importContents(targetSlot, file, contents, revision, input, reader) {
    if (revision !== interactionRevision || !activeContainer) return;
    var importIntoTarget = function () {
      if (revision !== interactionRevision || !activeContainer) return;
      _recordAction('import');
      var result = savePort && typeof savePort.importSave === 'function'
        ? savePort.importSave(targetSlot, contents)
        : { ok: false, msg: '当前环境无法导入存档。' };
      importCount += result && result.ok ? 1 : 0;
      var rendered = result && result.ok ? render({ onCommand: onCommand }) : false;
      _setTransferStatus(result && result.msg ? result.msg : '存档导入失败。', result && result.ok ? 'success' : 'error');
      if (rendered) _restoreSlotFocus(targetSlot, 'import');
    };
    var targetState = _findSlot(targetSlot);
    _finishFileRequest(input, reader);
    if (targetState && !targetState.isEmpty) {
      _openConfirmation('import', targetState, importIntoTarget, file && file.name);
      return;
    }
    importIntoTarget();
  }

  function _handleImport() {
    var doc = _getDocument();
    if (!doc || typeof doc.createElement !== 'function') {
      _setTransferStatus('当前环境无法选择导入文件。', 'error');
      return;
    }
    var targetSelect = activeContainer && activeContainer.querySelector('.save-import-slot-select');
    var targetSlot = targetSelect ? parseInt(targetSelect.value, 10) : 1;
    var input = doc.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    pendingFileInput = input;
    var revision = interactionRevision;
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) {
        _finishFileRequest(input, null);
        return;
      }
      var createReader = config.createFileReader || function () { return new FileReader(); };
      var reader = createReader();
      pendingReader = reader;
      reader.onload = function () {
        _importContents(targetSlot, file, reader.result, revision, input, reader);
      };
      reader.onerror = function () {
        _finishFileRequest(input, reader);
        if (revision === interactionRevision) _setTransferStatus('无法读取所选存档文件。', 'error');
      };
      reader.readAsText(file);
    };
    if (typeof input.click === 'function') input.click();
  }

  function _handleClick(event) {
    var saveButton = _findTarget(event, '.save-btn[data-slot]');
    if (saveButton) return _handleSave(parseInt(saveButton.dataset.slot, 10));
    var loadButton = _findTarget(event, '.load-btn[data-slot]');
    if (loadButton) return _handleLoad(parseInt(loadButton.dataset.slot, 10));
    var deleteButton = _findTarget(event, '.del-btn[data-slot]');
    if (deleteButton) return _handleDelete(parseInt(deleteButton.dataset.slot, 10));
    if (_findTarget(event, '.export-btn')) return _handleExport();
    if (_findTarget(event, '.import-btn')) return _handleImport();
  }

  function render(request) {
    var input = request || {};
    var doc = _getDocument();
    var container = input.container || (doc && typeof doc.getElementById === 'function' ? doc.getElementById('save-list') : null);
    if (!container || !savePort || typeof savePort.listSlots !== 'function') return false;
    _releaseBinding();
    _releasePendingFile();
    activeSlots = savePort.listSlots();
    onCommand = typeof input.onCommand === 'function' ? input.onCommand : null;
    actionPorts = createSaveActionPorts(onCommand);
    var view = buildSaveWorkspaceView({ slots: activeSlots });
    if (typeof container.setAttribute === 'function') {
      container.setAttribute('role', 'region');
      container.setAttribute('aria-label', '存档工作区');
    }
    container.innerHTML = view.html;
    activeContainer = container;
    container.onclick = _handleClick;
    bindCount += 1;
    renderCount += 1;
    _setTransferStatus(view.initialStatus, view.initialTone);
    return true;
  }

  function getDiagnostics() {
    return Object.freeze({
      active: !!activeContainer,
      bindCount: bindCount,
      commandCount: commandCount,
      confirmCount: confirmCount,
      exportCount: exportCount,
      focusRestoreCount: focusRestoreCount,
      importCount: importCount,
      lastAction: lastAction,
      lastFocusedSlotId: lastFocusedSlotId,
      lastFocusReason: lastFocusReason,
      pendingFile: !!pendingFileInput || !!pendingReader,
      renderCount: renderCount,
      resetCount: resetCount,
    });
  }

  function reset() {
    _cancelOwnedConfirmation();
    _releasePendingFile();
    _releaseBinding();
    activeSlots = [];
    onCommand = null;
    actionPorts = createSaveActionPorts(null);
    bindCount = 0;
    commandCount = 0;
    confirmCount = 0;
    exportCount = 0;
    focusRestoreCount = 0;
    importCount = 0;
    lastAction = null;
    lastFocusedSlotId = null;
    lastFocusReason = null;
    renderCount = 0;
    resetCount += 1;
    return getDiagnostics();
  }

  return Object.freeze({ getDiagnostics: getDiagnostics, render: render, reset: reset });
}
