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

// schema 只允许从旧版本逐步向当前版本迁移。
// 如果读到来自未来版本的存档，必须显式拒绝，避免静默吞掉未知字段。
function _migrateSchema(envelope) {
  const next = _deepClone(envelope);

  if (!next.meta) next.meta = {};
  if (next.meta.schemaVersion == null) next.meta.schemaVersion = 1;
  if (next.meta.schemaVersion > SAVE_SCHEMA_VERSION) {
    throw _createSaveError(
      'SAVE_SCHEMA_UNSUPPORTED',
      '不支持的存档版本：' + next.meta.schemaVersion + '（当前最高支持 v' + SAVE_SCHEMA_VERSION + '）。'
    );
  }

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
    if (next.meta.schemaVersion === 10) {
      _migrateSchema10To11(next);
      next.meta.schemaVersion = 11;
      continue;
    }
    if (next.meta.schemaVersion === 11) {
      _migrateSchema11To12(next);
      next.meta.schemaVersion = 12;
      continue;
    }
    if (next.meta.schemaVersion === 12) {
      _migrateSchema12To13(next);
      next.meta.schemaVersion = 13;
      continue;
    }
    if (next.meta.schemaVersion === 13) {
      _migrateSchema13To14(next);
      next.meta.schemaVersion = 14;
      continue;
    }
    if (next.meta.schemaVersion === 14) {
      _migrateSchema14To15(next);
      next.meta.schemaVersion = 15;
      continue;
    }
    if (next.meta.schemaVersion === 15) {
      _migrateSchema15To16(next);
      next.meta.schemaVersion = 16;
      continue;
    }
    if (next.meta.schemaVersion === 16) {
      _migrateSchema16To17(next);
      next.meta.schemaVersion = 17;
      continue;
    }
    throw _createSaveError('SAVE_SCHEMA_UNSUPPORTED', '不支持的存档版本：' + next.meta.schemaVersion + '。');
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

/**
 * v10 → v11：添加轻量剧情标记字段
 */
function _migrateSchema10To11(envelope) {
  if (!envelope.data) envelope.data = {};
  if (!envelope.data.storyFlags || typeof envelope.data.storyFlags !== 'object' || Array.isArray(envelope.data.storyFlags)) {
    envelope.data.storyFlags = {};
  }
  _normalizeEnvelopeData(envelope);
}

/**
 * v11 → v12：添加轻量剧情选择记录字段
 */
function _migrateSchema11To12(envelope) {
  if (!envelope.data) envelope.data = {};
  if (!envelope.data.storyDecisions || typeof envelope.data.storyDecisions !== 'object' || Array.isArray(envelope.data.storyDecisions)) {
    envelope.data.storyDecisions = {};
  }
  _normalizeEnvelopeData(envelope);
}

/**
 * v12 → v13：添加公司指令奖励领取记录
 */
function _migrateSchema12To13(envelope) {
  if (!envelope.data) envelope.data = {};
  if (!envelope.data.companyDirectiveClaims || typeof envelope.data.companyDirectiveClaims !== 'object' || Array.isArray(envelope.data.companyDirectiveClaims)) {
    envelope.data.companyDirectiveClaims = {};
  }
  _normalizeEnvelopeData(envelope);
}

/**
 * v13 → v14：添加可恢复的完整市场快照。旧存档首次载入时会生成新行情，
 * 之后的保存与读取都保持同一天的报价、供需和历史一致。
 */
function _migrateSchema13To14(envelope) {
  if (!envelope.data) envelope.data = {};
  envelope.data.economyMarketState = null;
  _normalizeEnvelopeData(envelope);
}

/**
 * v14 → v15：添加只保存在本地的设计验收统计，并补全黑市实际盈亏字段。
 */
function _migrateSchema14To15(envelope) {
  if (!envelope.data) envelope.data = {};
  envelope.data.balanceMetrics = {
    firstTrade: null,
    continuedAfterTenMinutes: false,
    continuationDay: null,
    lastActivity: null,
    trade: {
      actions: 0,
      buyActions: 0,
      sellActions: 0,
      realizedProfit: 0,
      realizedProfitByGood: {},
    },
    routes: {},
  };
  var previousSmuggling = envelope.data.smugglingStats && typeof envelope.data.smugglingStats === 'object'
    ? envelope.data.smugglingStats
    : {};
  envelope.data.smugglingStats = Object.assign({
    caught: 0,
    evaded: 0,
    finesPaid: 0,
    blackMarketTrades: 0,
    riskedArrivals: 0,
    protectedArrivals: 0,
    confiscatedCostBasis: 0,
    hullDamage: 0,
    blackMarketBuyCost: 0,
    blackMarketSellRevenue: 0,
    blackMarketRealizedProfit: 0,
  }, previousSmuggling);
  _normalizeEnvelopeData(envelope);
}

/**
 * v15 → v16：保存待处理事件，并把货物成本从根状态迁移到对应飞船。
 */
function _migrateSchema15To16(envelope) {
  if (!envelope.data) envelope.data = {};
  envelope.data._activeEventId = typeof envelope.data._activeEventId === 'string'
    ? envelope.data._activeEventId
    : '';

  var fleet = Array.isArray(envelope.data.fleet) ? envelope.data.fleet : [];
  var activeShipIndex = Number.isInteger(envelope.data.activeShipIndex) ? envelope.data.activeShipIndex : 0;
  fleet.forEach(function (ship, shipIndex) {
    if (!ship || typeof ship !== 'object') return;
    if (!ship.cargoCost || typeof ship.cargoCost !== 'object' || Array.isArray(ship.cargoCost)) {
      ship.cargoCost = shipIndex === activeShipIndex && envelope.data.cargoCost && typeof envelope.data.cargoCost === 'object'
        ? Object.assign({}, envelope.data.cargoCost)
        : {};
    }
  });
  _normalizeEnvelopeData(envelope);
}

/**
 * v16 → v17：将中期专题教学链纳入稳定存档契约。
 * 对工作树预发布版本可能已经写入的部分进度做宽容合并，避免覆盖合法记录。
 */
function _migrateSchema16To17(envelope) {
  if (!envelope.data) envelope.data = {};
  envelope.data.midgameChains = _normalizeMidgameChains(envelope.data.midgameChains);
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

  Object.keys(SAVE_STATE_SCHEMA).forEach(function (key) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      normalized[key] = _deepClone(source[key]);
    }
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

  normalized.midgameChains = _normalizeMidgameChains(normalized.midgameChains);

  _validateNestedState(normalized);

  if (!Number.isFinite(normalized.day) || normalized.day < 1) normalized.day = SAVE_STATE_DEFAULTS.day;
  if (!Number.isFinite(normalized.playerLevel) || normalized.playerLevel < 1) normalized.playerLevel = SAVE_STATE_DEFAULTS.playerLevel;
  if (!Number.isFinite(normalized.companyLevel) || normalized.companyLevel < 1) normalized.companyLevel = SAVE_STATE_DEFAULTS.companyLevel;
  if (!Number.isFinite(normalized.questPhase) || normalized.questPhase < 1) normalized.questPhase = SAVE_STATE_DEFAULTS.questPhase;
  if (!Number.isFinite(normalized.fleetSlots) || normalized.fleetSlots < 1) normalized.fleetSlots = SAVE_STATE_DEFAULTS.fleetSlots;
  if (!Number.isFinite(normalized.activeShipIndex) || normalized.activeShipIndex < 0) normalized.activeShipIndex = SAVE_STATE_DEFAULTS.activeShipIndex;
  if (normalized.fleet.length > 0 && normalized.activeShipIndex >= normalized.fleet.length) {
    normalized.activeShipIndex = SAVE_STATE_DEFAULTS.activeShipIndex;
  }

  normalized.playerLevel = getLevel(normalized.experience || 0).level;
  normalized.companyLevel = getCompanyLevel(normalized.companyExperience || 0).level;
  if (!normalized.viewingGalaxy) normalized.viewingGalaxy = normalized.currentGalaxy;

  return normalized;
}

function _isRecord(value) {
  return !!(value && typeof value === 'object' && !Array.isArray(value));
}

function _normalizeMidgameChains(value) {
  var source = _isRecord(value) ? value : {};
  var defaults = SAVE_STATE_DEFAULTS.midgameChains;
  var normalized = {};
  var hasActiveChain = false;

  Object.keys(defaults).forEach(function (chainId) {
    var defaultRecord = defaults[chainId];
    var sourceRecord = _isRecord(source[chainId]) ? source[chainId] : {};
    var completed = typeof sourceRecord.completed === 'boolean'
      ? sourceRecord.completed
      : defaultRecord.completed;
    var requestedActive = typeof sourceRecord.active === 'boolean'
      ? sourceRecord.active
      : defaultRecord.active;
    var completedSteps = [];
    var seenSteps = new Set();

    var knownSteps = _getKnownMidgameChainSteps(chainId);
    if (Array.isArray(sourceRecord.completedSteps)) {
      sourceRecord.completedSteps.forEach(function (stepId) {
        if (typeof stepId !== 'string') return;
        var normalizedStepId = stepId.trim();
        if (!normalizedStepId || knownSteps.indexOf(normalizedStepId) === -1 || seenSteps.has(normalizedStepId)) return;
        seenSteps.add(normalizedStepId);
        completedSteps.push(normalizedStepId);
      });
    }

    var active = requestedActive && !completed && !hasActiveChain;
    if (active) hasActiveChain = true;

    normalized[chainId] = {
      active: active,
      completed: completed,
      completedSteps: completedSteps,
      startedDay: sourceRecord.startedDay === null ||
        (Number.isInteger(sourceRecord.startedDay) && sourceRecord.startedDay >= 1)
        ? sourceRecord.startedDay
        : defaultRecord.startedDay,
      baselineValue: sourceRecord.baselineValue === null ||
        (typeof sourceRecord.baselineValue === 'number' &&
          Number.isFinite(sourceRecord.baselineValue) &&
          sourceRecord.baselineValue >= 0)
        ? sourceRecord.baselineValue
        : defaultRecord.baselineValue,
    };
  });

  return normalized;
}

function _getKnownMidgameChainSteps(chainId) {
  var stepsByChain = {
    'research-supply': ['prefill-research-supply-dispatch'],
    'dispatch-ops': ['prefill-profitable-dispatch'],
    'trade-station-basics': ['build-trade-station', 'upgrade-trade-station'],
    'capital-risk': ['review-loan-obligation'],
  };
  return stepsByChain[chainId] || [];
}

function _assertRecordArray(value, fieldName) {
  value.forEach(function (entry, index) {
    if (!_isRecord(entry)) {
      throw _createSaveError(
        'SAVE_DATA_SCHEMA_INVALID',
        '无效的存档数据：' + fieldName + '[' + index + '] 结构错误。'
      );
    }
  });
}

function _assertQuantityMap(value, fieldName) {
  if (!_isRecord(value)) return;
  Object.keys(value).forEach(function (key) {
    var quantity = value[key];
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) {
      throw _createSaveError(
        'SAVE_DATA_SCHEMA_INVALID',
        '无效的存档数据：' + fieldName + '.' + key + ' 数值错误。'
      );
    }
  });
}

function _validateNestedState(state) {
  _assertRecordArray(state.fleet, 'fleet');
  _assertRecordArray(state.quests, 'quests');

  state.fleet.forEach(function (ship, shipIndex) {
    if (ship.route != null && !_isRecord(ship.route)) {
      throw _createSaveError(
        'SAVE_DATA_SCHEMA_INVALID',
        '无效的存档数据：fleet[' + shipIndex + '].route 结构错误。'
      );
    }
    _assertQuantityMap(ship.cargo, 'fleet[' + shipIndex + '].cargo');
    _assertQuantityMap(ship.cargoCost, 'fleet[' + shipIndex + '].cargoCost');
  });

  state.quests.forEach(function (quest, questIndex) {
    if (typeof quest.id !== 'string' || !quest.id ||
        typeof quest.name !== 'string' || typeof quest.description !== 'string' ||
        !Array.isArray(quest.objectives)) {
      throw _createSaveError(
        'SAVE_DATA_SCHEMA_INVALID',
        '无效的存档数据：quests[' + questIndex + '] 结构错误。'
      );
    }
    _assertRecordArray(quest.objectives, 'quests[' + questIndex + '].objectives');
  });

  _assertQuantityMap(state.cargo, 'cargo');
  _assertQuantityMap(state.cargoCost, 'cargoCost');
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
