// js/systems/save/SaveSystem.js — 存档系统（LocalStorage）
// 依赖：data/constants.js
// 导出：saveGame, loadGame, listSlots, deleteSlot, exportSave, importSave
//
// 4 个存档槽位：0 = 自动存档，1-3 = 手动存档
// 存档格式参考 docs/design/存档系统设计.md 的 SaveEnvelope 结构

import { INITIAL_STATE, SAVE_STATE_SCHEMA, RUNTIME_ONLY_FIELDS } from '../../data/constants.js';

const SAVE_KEY_PREFIX = 'startrader_save_';
const SCHEMA_VERSION  = 3;
const GAME_VERSION    = '0.3.0';
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

const SAVE_STATE_DEFAULTS = _createSaveStateDefaults();

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
      meta: {
        schemaVersion:   SCHEMA_VERSION,
        gameVersion:     GAME_VERSION,
        slotId:          slotId,
        saveName:        options.saveName || (slotId === 0 ? '自动存档' : '手动存档 ' + slotId),
        timestampMs:     Date.now(),
        day:             normalizedState.day,
        credits:         normalizedState.credits,
        currentSystem:   normalizedState.currentSystem,
        difficulty:      normalizedState.difficulty,
        companyName:     normalizedState.companyName,
        isAutosave:      slotId === 0,
      },
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
    return { ok: false, msg: '❌ 读档失败：' + e.message };
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
      } catch (_) {
        slots.push({ slotId: i, isEmpty: true });
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
    localStorage.setItem(SAVE_KEY_PREFIX + slotId, JSON.stringify(envelope));
    return { ok: true, msg: '📂 导入成功！' };
  } catch (e) {
    return { ok: false, msg: '❌ 导入失败：' + e.message };
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

  while (next.meta.schemaVersion < SCHEMA_VERSION) {
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
    throw new Error('不支持的存档版本：' + next.meta.schemaVersion);
  }

  next.meta.gameVersion = next.meta.gameVersion || GAME_VERSION;
  next.meta.saveName = next.meta.saveName || (next.meta.slotId === 0 ? '自动存档' : '手动存档 ' + next.meta.slotId);
  next.meta.timestampMs = typeof next.meta.timestampMs === 'number' ? next.meta.timestampMs : Date.now();
  next.meta.isAutosave = next.meta.slotId === 0;

  next.data = _normalizeState(next.data);
  next.meta.day = next.data.day;
  next.meta.credits = next.data.credits;
  next.meta.currentSystem = next.data.currentSystem;
  next.meta.difficulty = next.data.difficulty;
  next.meta.companyName = next.data.companyName;

  return next;
}

function _migrateSchema1To2(envelope) {
  if (!envelope.data) envelope.data = {};
  envelope.data = _normalizeState(envelope.data);
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
  envelope.data = _normalizeState(envelope.data);
}

function _parseEnvelope(jsonStr) {
  const envelope = JSON.parse(jsonStr);
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('无效的存档数据。');
  }
  if (!envelope.meta || typeof envelope.meta !== 'object') {
    throw new Error('无效的存档数据：缺少 meta。');
  }
  if (!('data' in envelope) || !envelope.data || typeof envelope.data !== 'object') {
    throw new Error('无效的存档数据：缺少 data。');
  }
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

  if (normalized.day < 1) normalized.day = SAVE_STATE_DEFAULTS.day;
  if (normalized.playerLevel < 1) normalized.playerLevel = SAVE_STATE_DEFAULTS.playerLevel;
  if (normalized.companyLevel < 1) normalized.companyLevel = SAVE_STATE_DEFAULTS.companyLevel;
  if (normalized.questPhase < 1) normalized.questPhase = SAVE_STATE_DEFAULTS.questPhase;
  if (normalized.fleetSlots < 1) normalized.fleetSlots = SAVE_STATE_DEFAULTS.fleetSlots;
  if (normalized.activeShipIndex < 0) normalized.activeShipIndex = SAVE_STATE_DEFAULTS.activeShipIndex;

  return normalized;
}

function _createSaveStateDefaults() {
  const defaults = _deepClone(INITIAL_STATE);
  RUNTIME_ONLY_FIELDS.forEach(function (field) {
    delete defaults[field];
  });
  return defaults;
}

function _deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}
