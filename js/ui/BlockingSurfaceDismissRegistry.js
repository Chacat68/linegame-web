// js/ui/BlockingSurfaceDismissRegistry.js — Blocking Surface dismiss owner 与 DOM 绑定生命周期

function _optionalFunction(value, fallback) {
  return typeof value === 'function' ? value : fallback;
}

export function createBlockingSurfaceDismissRegistry(options) {
  var config = options || {};
  var entries = config.entries instanceof Map ? config.entries : new Map();
  var defaultDismiss = _optionalFunction(config.defaultDismiss, function () {});
  var ensureDispatcher = _optionalFunction(config.ensureDispatcher, function () {});
  var onEntryReleased = _optionalFunction(config.onEntryReleased, function () {});

  function _createOwner(surfaceId, ownerOptions) {
    return {
      closeOnBackdrop: !ownerOptions || ownerOptions.closeOnBackdrop !== false,
      closeOnEscape: !ownerOptions || ownerOptions.closeOnEscape !== false,
      onDismiss: ownerOptions && typeof ownerOptions.onDismiss === 'function'
        ? ownerOptions.onDismiss
        : function () { defaultDismiss(surfaceId); },
    };
  }

  function getOwner(entry) {
    if (!entry) return null;
    if (!(entry.owners instanceof Map)) return entry;
    var next = entry.owners.values().next();
    return next.done ? null : next.value;
  }

  function _releaseEntry(surfaceId, entry) {
    if (!entry) return false;
    if (entry.backdropListener && entry.target && typeof entry.target.removeEventListener === 'function') {
      entry.target.removeEventListener('click', entry.backdropListener);
    }
    if (entry.target && entry.target.dataset) delete entry.target.dataset.surfaceDismissBound;
    if (entries.get(surfaceId) === entry) entries.delete(surfaceId);
    onEntryReleased(surfaceId, entry);
    return true;
  }

  function _ensureEntry(surfaceId, target) {
    var existingEntry = entries.get(surfaceId);
    if (existingEntry && existingEntry.target === target && existingEntry.owners instanceof Map) {
      return existingEntry;
    }
    if (existingEntry && existingEntry.target === target) {
      // 兼容热更新前的单 owner entry。旧匿名 backdrop listener 无法反向获取，
      // 但 Escape 和后续 owner 会立即切换到统一 owner 表。
      var migratedOwner = _createOwner(surfaceId, {
        closeOnBackdrop: existingEntry.closeOnBackdrop,
        closeOnEscape: existingEntry.closeOnEscape,
        onDismiss: existingEntry.onDismiss,
      });
      existingEntry.owners = new Map();
      existingEntry.migratedOwnerKey = {};
      existingEntry.owners.set(existingEntry.migratedOwnerKey, migratedOwner);
      return existingEntry;
    }
    if (existingEntry) _releaseEntry(surfaceId, existingEntry);

    var entry = {
      backdropListener: null,
      owners: new Map(),
      target: target,
    };
    entry.backdropListener = function (event) {
      var owner = getOwner(entry);
      if (event.target === target && owner && owner.closeOnBackdrop) owner.onDismiss();
    };
    if (typeof target.addEventListener === 'function') {
      target.addEventListener('click', entry.backdropListener);
    }
    target.dataset.surfaceDismissBound = '1';
    entries.set(surfaceId, entry);
    return entry;
  }

  function register(surfaceId, target, ownerOptions) {
    var entry = _ensureEntry(surfaceId, target);
    var ownerKey = {};
    var active = true;
    entry.owners.set(ownerKey, _createOwner(surfaceId, ownerOptions));
    ensureDispatcher();

    return function releaseBlockingSurfaceDismiss() {
      if (!active) return false;
      active = false;
      if (entries.get(surfaceId) !== entry || !entry.owners.has(ownerKey)) return false;
      entry.owners.delete(ownerKey);
      if (entry.owners.size === 0) _releaseEntry(surfaceId, entry);
      return true;
    };
  }

  function getIds() {
    return Array.from(entries.keys()).sort();
  }

  function getOwnerCount() {
    return Array.from(entries.values()).reduce(function (count, entry) {
      return count + (entry && entry.owners instanceof Map ? entry.owners.size : 1);
    }, 0);
  }

  return Object.freeze({
    get: function (surfaceId) { return entries.get(surfaceId) || null; },
    getIds: getIds,
    getOwner: getOwner,
    getOwnerCount: getOwnerCount,
    register: register,
    size: function () { return entries.size; },
  });
}
