// js/core/UsageDataExportEffect.js — 本地平衡统计文件导出副作用边界
//
// UsageDataExport 只构造脱敏 payload；本模块独占 Blob、object URL 与下载 DOM。

import { buildUsageDataExport } from '../systems/metrics/UsageDataExport.js';

const EXPORT_MIME_TYPE = 'application/json';

function _requiredFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError('UsageDataExportEffect requires ' + label + '.');
  }
  return value;
}

function _defaultDocument() {
  return typeof document === 'undefined' ? null : document;
}

function _defaultNow() {
  return new Date();
}

export function createUsageDataExportEffect(dependencies) {
  var deps = dependencies || {};
  var buildPayload = deps.buildPayload || buildUsageDataExport;
  var getDocument = typeof deps.getDocument === 'function' ? deps.getDocument : _defaultDocument;
  var now = typeof deps.now === 'function' ? deps.now : _defaultNow;
  var createBlob = typeof deps.createBlob === 'function'
    ? deps.createBlob
    : function (parts, options) { return new Blob(parts, options); };
  var createObjectURL = typeof deps.createObjectURL === 'function'
    ? deps.createObjectURL
    : function (blob) { return URL.createObjectURL(blob); };
  var revokeObjectURL = typeof deps.revokeObjectURL === 'function'
    ? deps.revokeObjectURL
    : function (url) { URL.revokeObjectURL(url); };

  function exportFile(state, options) {
    var doc = getDocument();
    if (!doc || !doc.body || typeof doc.createElement !== 'function') {
      throw new Error('UsageDataExportEffect requires an active document.');
    }
    if (typeof doc.body.appendChild !== 'function' || typeof doc.body.removeChild !== 'function') {
      throw new Error('UsageDataExportEffect requires a mutable document body.');
    }

    var opts = options || {};
    var date = opts.exportedAt ? new Date(opts.exportedAt) : now();
    if (!date || Number.isNaN(date.getTime())) {
      throw new TypeError('UsageDataExportEffect received an invalid export date.');
    }
    var exportedAt = date.toISOString();
    var payload = _requiredFunction(buildPayload, 'buildPayload')(state, { exportedAt: exportedAt });
    var serialized = JSON.stringify(payload, null, 2);
    var blob = createBlob([serialized], { type: EXPORT_MIME_TYPE });
    var url = createObjectURL(blob);
    var anchor = doc.createElement('a');
    var filename = 'linegame-usage-data-' + exportedAt.slice(0, 10) + '.json';
    var appended = false;

    try {
      anchor.href = url;
      anchor.download = filename;
      doc.body.appendChild(anchor);
      appended = true;
      _requiredFunction(anchor.click, 'download anchor click').call(anchor);
    } finally {
      if (appended) doc.body.removeChild(anchor);
      revokeObjectURL(url);
    }

    return Object.freeze({
      filename: filename,
      mimeType: EXPORT_MIME_TYPE,
      payload: payload,
      serializedLength: serialized.length,
    });
  }

  return Object.freeze({
    exportFile: exportFile,
  });
}

var _defaultEffect = null;

export function exportUsageDataFile(state, options) {
  if (!_defaultEffect) _defaultEffect = createUsageDataExportEffect();
  return _defaultEffect.exportFile(state, options);
}
