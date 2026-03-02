// js/systems/save/SaveSystem.js — 存档系统（LocalStorage）
// 依赖：无
// 导出：saveGame, loadGame, listSlots, deleteSlot, exportSave, importSave
//
// 4 个存档槽位：0 = 自动存档，1-3 = 手动存档
// 存档格式参考 docs/design/存档系统设计.md 的 SaveEnvelope 结构

const SAVE_KEY_PREFIX = 'startrader_save_';
const SCHEMA_VERSION  = 1;
const GAME_VERSION    = '0.2.0';
const MAX_SLOTS       = 4; // 0=auto, 1-3=manual

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
    const envelope = {
      meta: {
        schemaVersion:   SCHEMA_VERSION,
        gameVersion:     GAME_VERSION,
        slotId:          slotId,
        saveName:        options.saveName || (slotId === 0 ? '自动存档' : '手动存档 ' + slotId),
        timestampMs:     Date.now(),
        day:             state.day,
        credits:         state.credits,
        currentSystem:   state.currentSystem,
        isAutosave:      slotId === 0,
      },
      data: _serializeState(state),
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
    const envelope = JSON.parse(json);
    // 版本迁移（预留）
    if (envelope.meta.schemaVersion < SCHEMA_VERSION) {
      _migrateSchema(envelope);
    }
    const state = _deserializeState(envelope.data);
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
        const envelope = JSON.parse(json);
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
    const envelope = JSON.parse(jsonStr);
    if (!envelope.meta || !envelope.data) {
      return { ok: false, msg: '无效的存档数据。' };
    }
    localStorage.setItem(SAVE_KEY_PREFIX + slotId, jsonStr);
    return { ok: true, msg: '📂 导入成功！' };
  } catch (e) {
    return { ok: false, msg: '❌ 导入失败：' + e.message };
  }
}

// ---------------------------------------------------------------------------
// 序列化 / 反序列化
// ---------------------------------------------------------------------------

function _serializeState(state) {
  // 深拷贝并清除不需要持久化的运行时字段
  const data = JSON.parse(JSON.stringify(state));
  delete data.hoveredSystem; // UI 临时状态
  return data;
}

function _deserializeState(data) {
  // 补全可能缺失的新版字段
  const defaults = {
    shipHull: 100, maxHull: 100, autoRepair: 0,
    factionRelations: null,
    reputation: 0,
    researchedTechs: [], currentResearch: null, researchOptions: [],
    techBuyDiscount: 0, techSellBonus: 0,
    tradeCount: 0, totalProfit: 0, cargoCost: {},
    playerLevel: 1, experience: 0,
    companyLevel: 1, companyExperience: 0,
    questPhase: 1,
    quests: [], completedQuests: [],
    achievements: [],
  };
  Object.keys(defaults).forEach(function (key) {
    if (data[key] === undefined) data[key] = defaults[key];
  });
  data.hoveredSystem = null;
  return data;
}

function _migrateSchema(envelope) {
  // 预留：未来版本迁移逻辑
  envelope.meta.schemaVersion = SCHEMA_VERSION;
}
