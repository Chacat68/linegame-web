// js/systems/save/SaveSystem.js — 存档系统（LocalStorage）
// 依赖：data/constants.js
// 导出：saveGame, loadGame, listSlots, deleteSlot, exportSave, importSave
//
// 4 个存档槽位：0 = 自动存档，1-3 = 手动存档
// 存档格式参考 docs/design/存档系统设计.md 的 SaveEnvelope 结构

import {
  SAVE_STATE_SCHEMA,
  SAVE_META_SCHEMA,
  RUNTIME_ONLY_FIELDS,
  SAVE_SCHEMA_VERSION,
  GAME_VERSION,
  PERSISTED_STATE_DEFAULTS,
  createSaveMeta,
} from '../../data/constants.js';
import { getLevel, getCompanyLevel } from '../../data/playerLevels.js';

const SAVE_KEY_PREFIX = 'startrader_save_';
const MAX_SLOTS       = 4; // 0=auto, 1-3=manual

// ———————————————————————————————————————————————————————————————————————
// 由 SAVE_STATE_SCHEMA 自动生成的字段分类列表（无需手工维护）
// ———————————————————————————————————————————————————————————————————————
const NUMERIC_FIELDS = [];
const STRING_FIELDS  = [];
const ARRAY_FIELDS   = [];
const OBJECT_FIELDS  = [];

Object.keys(SAVE_STATE_SCHEMA).forEach(function (key) {
  switch (SAVE_STATE_SCHEMA[key].type) {
    case 'number': NUMERIC_FIELDS.push(key); break;
    case 'string': STRING_FIELDS.push(key);  break;
    case 'array':  ARRAY_FIELDS.push(key);   break;
    case 'object': OBJECT_FIELDS.push(key);  break;
  }
});

const SAVE_STATE_DEFAULTS = _deepClone(PERSISTED_STATE_DEFAULTS);

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 保存游戏到指定槽位
 * @param {number} slotId  0-3
 * @param {object} state   游戏状态
 * @param {object} [options] { saveName?: string, isAutosave?: boolean }
 * @returns {{ ok: boolean, msg: string }}
 */
export function saveGame(slotId, state, options) {
  options = options || {};
  try {
    const normalizedState = _normalizeState(state);
    const envelope = {
      meta: createSaveMeta(slotId, normalizedState, options),
      data: _serializeState(normalizedState),
    };
    const json = JSON.stringify(envelope);
    localStorage.setItem(SAVE_KEY_PREFIX + slotId, json);
    return { ok: true, msg: '💾 存档成功！（槽位 ' + slotId + '）' };
  } catch (e) {
    console.error('Save failed:', e);
    return { ok: false, msg: '❌ 存档失败：' + e.message };
  }
}

/**
 * 从指定槽位加载游戏
 * @param {number} slotId
 * @returns {{ ok: boolean, state?: object, msg: string }}
 */
export function loadGame(slotId) {
  try {
    const json = localStorage.getItem(SAVE_KEY_PREFIX + slotId);
    if (!json) {
      return { ok: false, msg: '该槽位没有存档。' };
    }
    const envelope = _migrateSchema(_parseEnvelope(json));
    const state = _deserializeState(envelope.data);
    localStorage.setItem(SAVE_KEY_PREFIX + slotId, JSON.stringify(envelope));
    return { ok: true, state: state, msg: '📂 读档成功！' };
  } catch (e) {
    console.error('Load failed:', e);
    return { ok: false, msg: _formatSaveError('读档失败', e), errorCode: e && e.code ? e.code : 'SAVE_LOAD_FAILED' };
  }
}

/**
 * 列出所有存档槽位信息
 * @returns {Array<{ slotId, meta?, isEmpty }>}
 */
export function listSlots() {
  const slots = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const json = localStorage.getItem(SAVE_KEY_PREFIX + i);
    if (json) {
      try {
        const envelope = _parseEnvelope(json);
        slots.push({ slotId: i, meta: envelope.meta, isEmpty: false });
      } catch (error) {
        slots.push({
          slotId: i,
          isEmpty: false,
          isCorrupted: true,
          errorCode: error && error.code ? error.code : 'SAVE_SLOT_CORRUPTED',
          errorMessage: _formatSaveError('存档损坏', error),
        });
      }
    } else {
      slots.push({ slotId: i, isEmpty: true });
    }
  }
  return slots;
}

/**
 * 删除指定槽位
 */
export function deleteSlot(slotId) {
  localStorage.removeItem(SAVE_KEY_PREFIX + slotId);
}

/**
 * 导出存档为 JSON 字符串（可下载）
 */
export function exportSave(slotId) {
  const json = localStorage.getItem(SAVE_KEY_PREFIX + slotId);
  return json || null;
}

/**
 * 从 JSON 字符串导入存档
 */
export function importSave(slotId, jsonStr) {
  try {
    const envelope = _migrateSchema(_parseEnvelope(jsonStr));
    envelope.meta.slotId = slotId;
    envelope.meta.isAutosave = slotId === 0 || slotId === '0';
    envelope.meta.saveName = envelope.meta.isAutosave ? '自动存档' : (envelope.meta.saveName || ('手动存档 ' + slotId));
    localStorage.setItem(SAVE_KEY_PREFIX + slotId, JSON.stringify(envelope));
    return { ok: true, msg: '📂 导入成功！' };
  } catch (e) {
    return { ok: false, msg: _formatSaveError('导入失败', e), errorCode: e && e.code ? e.code : 'SAVE_IMPORT_FAILED' };
  }
}

// ---------------------------------------------------------------------------
// 序列化 / 反序列化
// ---------------------------------------------------------------------------

function _serializeState(state) {
  const data = _deepClone(state);
  RUNTIME_ONLY_FIELDS.forEach(function (field) {
    delete data[field];
  });
  return data;
}

function _deserializeState(data) {
  const normalized = _normalizeState(data);
  normalized.hoveredSystem = null;
  return normalized;
}

function _migrateSchema(envelope) {
  const next = _deepClone(envelope);

  if (!next.meta) next.meta = {};
  if (next.meta.schemaVersion == null) next.meta.schemaVersion = 1;

  while (next.meta.schemaVersion < SAVE_SCHEMA_VERSION) {
    if (next.meta.schemaVersion === 1) {
      _migrateSchema1To2(next);
      next.meta.schemaVersion = 2;
      continue;
    }
    if (next.meta.schemaVersion === 2) {
      _migrateSchema2To3(next);
      next.meta.schemaVersion = 3;
      continue;
    }
    if (next.meta.schemaVersion === 3) {
      _migrateSchema3To4(next);
      next.meta.schemaVersion = 4;
      continue;
    }
    if (next.meta.schemaVersion === 4) {
      _migrateSchema4To5(next);
      next.meta.schemaVersion = 5;
      continue;
    }
    if (next.meta.schemaVersion === 5) {
      _migrateSchema5To6(next);
      next.meta.schemaVersion = 6;
      continue;
    }
    if (next.meta.schemaVersion === 6) {
      _migrateSchema6To7(next);
      next.meta.schemaVersion = 7;
      continue;
    }
    if (next.meta.schemaVersion === 7) {
      _migrateSchema7To8(next);
      next.meta.schemaVersion = 8;
      continue;
    }
    if (next.meta.schemaVersion === 8) {
      _migrateSchema8To9(next);
      next.meta.schemaVersion = 9;
      continue;
    }
    if (next.meta.schemaVersion === 9) {
      _migrateSchema9To10(next);
      next.meta.schemaVersion = 10;
      continue;
    }
    throw new Error('不支持的存档版本：' + next.meta.schemaVersion);
  }

  next.data = _normalizeState(next.data);
  next.meta = createSaveMeta(next.meta.slotId, next.data, {
    saveName: next.meta.saveName,
    timestampMs: next.meta.timestampMs,
  });

  return next;
}

function _migrateSchema1To2(envelope) {
  _normalizeEnvelopeData(envelope);
}

/**
 * v2 → v3：确保 fleet 中每艘船都有 mods 数组
 */
function _migrateSchema2To3(envelope) {
  if (!envelope.data) envelope.data = {};
  var fleet = envelope.data.fleet;
  if (Array.isArray(fleet)) {
    fleet.forEach(function (ship) {
      if (!Array.isArray(ship.mods)) {
        ship.mods = [];
      }
    });
  }
  _normalizeEnvelopeData(envelope);
}

function _migrateSchema3To4(envelope) {
  _normalizeEnvelopeData(envelope);
}

function _migrateSchema4To5(envelope) {
  _normalizeEnvelopeData(envelope);
}

function _migrateSchema5To6(envelope) {
  _normalizeEnvelopeData(envelope);
}

function _migrateSchema6To7(envelope) {
  _normalizeEnvelopeData(envelope);
}

function _migrateSchema7To8(envelope) {
  _normalizeEnvelopeData(envelope);
}

/**
 * v8 → v9：添加期货系统字段
 */
function _migrateSchema8To9(envelope) {
  _normalizeEnvelopeData(envelope);
}

/**
 * v9 → v10：添加星系数据层状态字段
 */
function _migrateSchema9To10(envelope) {
  if (!envelope.data) envelope.data = {};
  if (!envelope.data.galaxyStates || typeof envelope.data.galaxyStates !== 'object') {
    envelope.data.galaxyStates = {};
  }
  _normalizeEnvelopeData(envelope);
}

function _normalizeEnvelopeData(envelope) {
  if (!envelope.data) envelope.data = {};
  envelope.data = _normalizeState(envelope.data);
}

function _parseEnvelope(jsonStr) {
  var envelope;
  try {
    envelope = JSON.parse(jsonStr);
  } catch (_) {
    throw _createSaveError('SAVE_JSON_INVALID', '无效的 JSON 数据。');
  }
  if (!envelope || typeof envelope !== 'object') {
    throw _createSaveError('SAVE_ENVELOPE_INVALID', '无效的存档数据。');
  }
  if (!envelope.meta || typeof envelope.meta !== 'object') {
    throw _createSaveError('SAVE_META_MISSING', '无效的存档数据：缺少 meta。');
  }
  if (!('data' in envelope) || !envelope.data || typeof envelope.data !== 'object') {
    throw _createSaveError('SAVE_DATA_MISSING', '无效的存档数据：缺少 data。');
  }

  _validateEnvelopeMeta(envelope.meta);

  return envelope;
}

function _normalizeState(data) {
  const source = data && typeof data === 'object' ? data : {};
  const normalized = _deepClone(SAVE_STATE_DEFAULTS);

  Object.keys(source).forEach(function (key) {
    if (RUNTIME_ONLY_FIELDS.indexOf(key) >= 0) return;
    normalized[key] = _deepClone(source[key]);
  });

  STRING_FIELDS.forEach(function (key) {
    if (typeof normalized[key] !== 'string' || normalized[key].length === 0) {
      normalized[key] = SAVE_STATE_DEFAULTS[key];
    }
  });

  NUMERIC_FIELDS.forEach(function (key) {
    if (typeof normalized[key] !== 'number' || !Number.isFinite(normalized[key])) {
      normalized[key] = SAVE_STATE_DEFAULTS[key] !== undefined ? SAVE_STATE_DEFAULTS[key] : 0;
    }
  });

  ARRAY_FIELDS.forEach(function (key) {
    if (!Array.isArray(normalized[key])) {
      normalized[key] = _deepClone(SAVE_STATE_DEFAULTS[key]);
    }
  });

  OBJECT_FIELDS.forEach(function (key) {
    var value = normalized[key];
    if (value === undefined) {
      normalized[key] = _deepClone(SAVE_STATE_DEFAULTS[key]);
      return;
    }
    if (value !== null && (typeof value !== 'object' || Array.isArray(value))) {
      normalized[key] = _deepClone(SAVE_STATE_DEFAULTS[key]);
    }
  });

  if (!Number.isFinite(normalized.day) || normalized.day < 1) normalized.day = SAVE_STATE_DEFAULTS.day;
  if (!Number.isFinite(normalized.playerLevel) || normalized.playerLevel < 1) normalized.playerLevel = SAVE_STATE_DEFAULTS.playerLevel;
  if (!Number.isFinite(normalized.companyLevel) || normalized.companyLevel < 1) normalized.companyLevel = SAVE_STATE_DEFAULTS.companyLevel;
  if (!Number.isFinite(normalized.questPhase) || normalized.questPhase < 1) normalized.questPhase = SAVE_STATE_DEFAULTS.questPhase;
  if (!Number.isFinite(normalized.fleetSlots) || normalized.fleetSlots < 1) normalized.fleetSlots = SAVE_STATE_DEFAULTS.fleetSlots;
  if (!Number.isFinite(normalized.activeShipIndex) || normalized.activeShipIndex < 0) normalized.activeShipIndex = SAVE_STATE_DEFAULTS.activeShipIndex;

  normalized.playerLevel = getLevel(normalized.experience || 0).level;
  normalized.companyLevel = getCompanyLevel(normalized.companyExperience || 0).level;
  if (!normalized.viewingGalaxy) normalized.viewingGalaxy = normalized.currentGalaxy;

  return normalized;
}

function _deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function _validateEnvelopeMeta(meta) {
  if ('schemaVersion' in meta && meta.schemaVersion != null) {
    if (typeof meta.schemaVersion !== 'number') {
      throw _createSaveError('SAVE_META_TYPE_INVALID', '无效的存档数据：schemaVersion 类型错误。');
    }
    if (!Number.isInteger(meta.schemaVersion) || meta.schemaVersion < 1) {
      throw _createSaveError('SAVE_META_SCHEMA_INVALID', '无效的存档数据：schemaVersion 必须是正整数。');
    }
  }
  if ('slotId' in meta && meta.slotId != null) {
    if (typeof meta.slotId === 'number') {
      if (!Number.isInteger(meta.slotId) || meta.slotId < 0) {
        throw _createSaveError('SAVE_META_SLOT_INVALID', '无效的存档数据：slotId 非法。');
      }
    } else if (typeof meta.slotId === 'string') {
      if (meta.slotId.length === 0) {
        throw _createSaveError('SAVE_META_SLOT_INVALID', '无效的存档数据：slotId 非法。');
      }
    } else {
      throw _createSaveError('SAVE_META_TYPE_INVALID', '无效的存档数据：slotId 类型错误。');
    }
  }
  if ('timestampMs' in meta && (typeof meta.timestampMs !== 'number' || !Number.isFinite(meta.timestampMs))) {
    throw _createSaveError('SAVE_META_TIMESTAMP_INVALID', '无效的存档数据：timestampMs 非法。');
  }

  Object.keys(SAVE_META_SCHEMA).forEach(function (key) {
    if (!(key in meta) || meta[key] == null) return;
    if (key === 'slotId' || key === 'schemaVersion') return;
    var expectedType = SAVE_META_SCHEMA[key].type;
    if (expectedType === 'boolean' && typeof meta[key] !== 'boolean') {
      throw _createSaveError('SAVE_META_TYPE_INVALID', '无效的存档数据：' + key + ' 类型错误。');
    }
    if (expectedType === 'number' && typeof meta[key] !== 'number') {
      throw _createSaveError('SAVE_META_TYPE_INVALID', '无效的存档数据：' + key + ' 类型错误。');
    }
    if (expectedType === 'string' && typeof meta[key] !== 'string') {
      throw _createSaveError('SAVE_META_TYPE_INVALID', '无效的存档数据：' + key + ' 类型错误。');
    }
  });
}

function _createSaveError(code, message) {
  var error = new Error(message);
  error.code = code;
  return error;
}

function _formatSaveError(actionLabel, error) {
  var message = error && error.message ? error.message : '未知错误。';
  return '❌ ' + actionLabel + '：' + message;
}
