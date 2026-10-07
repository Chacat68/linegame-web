import { GAME_VERSION, SAVE_SCHEMA_VERSION, createInitialState, createSaveMeta } from '../../data/constants.js';
import { init as initMerchant, isValidMerchantState } from '../merchant/MerchantSystem.js';
import { createExplorationState, initExploration } from '../merchant/MerchantExploration.js';
import { createOnboardingState, isValidOnboardingState } from '../merchant/MerchantOnboarding.js';
import { findGalaxy } from '../../data/systems.js';
import { MERCHANT_PORTS, MERCHANT_LEGACY_LEVEL_MAP, MERCHANT_18_LEVEL_MAP } from '../../data/merchant.js';
import { createAnalyticsState } from '../merchant/MerchantAnalytics.js';
import { restoreLegacyMerchantAccess, restoreGranularMerchantTechs, restoreLegacyFleetCapacity, getShipStats } from '../merchant/MerchantTechnology.js';
const PREFIX = 'startrader_save_';
export const MAX_SLOTS = 4;
const pendingBackups = new Map();
const keys = ['companyName', 'credits', 'currentGalaxy', 'viewingGalaxy', 'merchant'];
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
function slot(id) {
  const value = Number(id);
  if (!Number.isInteger(value) || value < 0 || value >= MAX_SLOTS) fail('SAVE_SLOT_INVALID', '存档槽位无效。');
  return value;
}
function project(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('SAVE_DATA_INVALID', '存档内容无效。');
  const state = structuredClone(Object.fromEntries(keys.map(key => [key, data[key]])));
  if (typeof state.companyName !== 'string' || !state.companyName.trim() || state.companyName.length > 80 ||
      !Number.isFinite(state.credits) || state.credits < 0 || !isValidMerchantState(state.merchant) ||
      !findGalaxy(state.currentGalaxy) || !findGalaxy(state.viewingGalaxy)) fail('SAVE_DATA_INVALID', '经营数据不完整或损坏。');
  return state;
}
function decode(raw, id) {
  let envelope;
  try { envelope = JSON.parse(raw); } catch { fail('SAVE_JSON_INVALID', '存档无法解析。'); }
  const version = envelope?.meta?.schemaVersion;
  if (!Number.isInteger(version) || version < 1) fail('SAVE_SCHEMA_INVALID', '存档版本无效。');
  if (version > SAVE_SCHEMA_VERSION) fail('SAVE_SCHEMA_UNSUPPORTED', '存档来自更新版本，当前版本无法读取。');
  const source = envelope.data;
  let state;
  if (version < SAVE_SCHEMA_VERSION) {
    // 仅转换经营资料；不加载任何旧玩法。原文件在写入前完整备份。
    if (!source || typeof source !== 'object' || Array.isArray(source)) fail('SAVE_DATA_INVALID', '存档内容无效。');
    if (!Number.isFinite(source.credits) || source.credits < 0 || typeof source.companyName !== 'string' || !source.companyName.trim()) fail('SAVE_DATA_INVALID', '资金或公司资料损坏。');
    if (source.merchant) {
      const data = structuredClone(source);
      if (version < 22 && data.merchant.researchedTechIds === undefined) data.merchant.researchedTechIds = [];
      if (version < 24 && data.merchant.companyLevel === undefined) data.merchant.companyLevel = 1;
      if (version < 28) {
        const oldLevel = data.merchant.companyLevel;
        if (!Number.isInteger(oldLevel) || !MERCHANT_LEGACY_LEVEL_MAP[oldLevel]) fail('SAVE_DATA_INVALID', '公司等级损坏。');
        data.merchant.companyLevel = MERCHANT_LEGACY_LEVEL_MAP[oldLevel];
      } else if (version < 33) {
        const oldLevel = data.merchant.companyLevel;
        if (!Number.isInteger(oldLevel) || !MERCHANT_18_LEVEL_MAP[oldLevel]) fail('SAVE_DATA_INVALID', '公司等级损坏。');
        data.merchant.companyLevel = MERCHANT_18_LEVEL_MAP[oldLevel];
      }
      if (version < 25 && data.merchant.exploration === undefined) {
        data.merchant.exploration = createExplorationState();
        initExploration(data.merchant);
      }
      // 旧档全部视为已完成，避免给既有经营进度重新弹出剧情或引导。
      if (version < 26) {
        if (data.merchant.onboarding !== undefined && !isValidOnboardingState(data.merchant.onboarding)) {
          fail('SAVE_DATA_INVALID', '引导进度损坏。');
        }
        data.merchant.onboarding = createOnboardingState({ completed: true });
      }
      if (version < 27) {
        if (data.merchant.plans === undefined) data.merchant.plans = [];
        if (data.merchant.analytics === undefined) data.merchant.analytics = createAnalyticsState(data.merchant.lastTickAt);
        if (data.merchant.exploration.nextPortId === undefined) data.merchant.exploration.nextPortId = data.merchant.exploration.nextEventAt ? 'nebula_forge' : null;
        if (data.merchant.exploration.completed === undefined) data.merchant.exploration.completed = [];
        // 只补新增市场字段，已有供需和锁定航次金额保持原值。
        if (data.merchant.markets && Object.keys(data.merchant.markets).length) {
          for (const port of MERCHANT_PORTS) {
            if (port.id === 'aurora_depot' && data.merchant.markets[port.id] === undefined) {
              data.merchant.markets[port.id] = { supply: { ...port.supply }, demand: { ...port.demand } };
            }
          }
          if (data.merchant.markets.nebula_forge?.demand?.alloys === undefined && data.merchant.markets.nebula_forge?.demand) {
            data.merchant.markets.nebula_forge.demand.alloys = MERCHANT_PORTS.find(port => port.id === 'nebula_forge').demand.alloys;
          }
        }
      }
      if (version < 29) {
        restoreLegacyMerchantAccess(data.merchant);
        delete data.merchant.plans;
        for (const task of [...data.merchant.tasks, ...data.merchant.history]) delete task.planId;
        for (const ship of data.merchant.ships) if (ship.trip) {
          ship.trip.techIds ??= [];
          ship.trip.capacity ??= getShipStats(null, ship.typeId).capacity;
        }
        for (const event of [...data.merchant.exploration.completed, ...(data.merchant.exploration.event ? [data.merchant.exploration.event] : [])]) event.techIds ??= [];
      }
      if (version < 30 && data.merchant.purchasedIntelIds === undefined) data.merchant.purchasedIntelIds = [];
      if (version < 31) restoreGranularMerchantTechs(data.merchant);
      if (version < 32) restoreLegacyFleetCapacity(data.merchant);
      state = project({ ...data, currentGalaxy: findGalaxy(data.currentGalaxy)?.id || 'milky_way', viewingGalaxy: findGalaxy(data.viewingGalaxy)?.id || 'milky_way' });
    } else {
      state = createInitialState({ companyName: source.companyName, credits: source.credits });
      state.merchant.onboarding = createOnboardingState({ completed: true });
      initMerchant(state);
    }
  } else state = project(source);
  return { state, migrated: version !== SAVE_SCHEMA_VERSION, envelope: { meta: createSaveMeta(id, state, {
    saveName: envelope.meta.saveName, timestampMs: Number.isFinite(envelope.meta.timestampMs) ? envelope.meta.timestampMs : Date.now(),
  }), data: state } };
}
function backup(id, raw) {
  // 公司、探索与引导迁移各留原始备份，不占用之前版本的备份。
  let version;
  try { version = JSON.parse(raw)?.meta?.schemaVersion; } catch { /* 损坏文件仍可原样保留。 */ }
  const key = PREFIX + (version === 32 ? 'before_v33_' : version === 31 ? 'before_v32_' : version === 30 ? 'before_v31_' : version === 29 ? 'before_v30_' : version === 28 ? 'before_v29_' : version === 27 ? 'before_v28_' : version === 26 ? 'before_v27_' : version === 25 ? 'before_v26_' : version === 24 ? 'before_v25_' : version === 23 ? 'before_v24_' : 'before_2_0_') + id;
  if (raw && localStorage.getItem(key) === null) localStorage.setItem(key, raw);
}
export function saveGame(slotId, state, options = {}) {
  try {
    const id = slot(slotId), data = project(state);
    if (pendingBackups.has(id)) { backup(id, pendingBackups.get(id)); pendingBackups.delete(id); }
    localStorage.setItem(PREFIX + id, JSON.stringify({ meta: createSaveMeta(id, data, options), data }));
    return { ok: true, msg: '存档成功。' };
  } catch (error) { return { ok: false, errorCode: error.code || 'SAVE_WRITE_FAILED', msg: '存档失败：' + error.message }; }
}
export function loadGame(slotId) {
  let raw, id;
  try { id = slot(slotId); raw = localStorage.getItem(PREFIX + id); }
  catch (error) { return { ok: false, errorCode: error.code || 'SAVE_STORAGE_READ_FAILED', msg: '无法读取本地存档。' }; }
  if (!raw) return { ok: false, errorCode: 'SAVE_SLOT_EMPTY', msg: '槽位为空。' };
  try {
    const result = decode(raw, id);
    if (result.migrated) {
      try { backup(id, raw); localStorage.setItem(PREFIX + id, JSON.stringify(result.envelope)); }
      catch { pendingBackups.set(id, raw); return { ok: true, state: result.state, warningCode: 'SAVE_MIGRATION_WRITE_FAILED', msg: '进度已读取，原始存档仍保留；请导出备份。' }; }
    }
    return { ok: true, state: result.state, msg: result.migrated ? `进度已转换为 ${GAME_VERSION}。` : '读档成功。' };
  } catch (error) { return { ok: false, errorCode: error.code || 'SAVE_DATA_INVALID', msg: error.message }; }
}
export function listSlots() {
  return Array.from({ length: MAX_SLOTS }, (_, id) => {
    try {
      const raw = localStorage.getItem(PREFIX + id);
      if (!raw) return { slotId: id, isEmpty: true };
      const decoded = decode(raw, id);
      return { slotId: id, isEmpty: false, meta: decoded.envelope.meta };
    } catch (error) { return { slotId: id, isEmpty: false, isCorrupted: true, errorMessage: error.message }; }
  });
}
export function deleteSlot(slotId) { const id = slot(slotId); localStorage.removeItem(PREFIX + id); pendingBackups.delete(id); }
export function exportSave(slotId) { return localStorage.getItem(PREFIX + slot(slotId)); }
export function importSave(slotId, raw) {
  try {
    const id = slot(slotId), decoded = decode(raw, id);
    backup(id, localStorage.getItem(PREFIX + id));
    localStorage.setItem(PREFIX + id, JSON.stringify(decoded.envelope));
    return { ok: true, msg: '导入成功。' };
  } catch (error) { return { ok: false, errorCode: error.code || 'SAVE_IMPORT_FAILED', msg: '导入失败：' + error.message }; }
}
// 导出原始 JSON 时不解析，损坏/未来版本也能由恢复页备份。
export const version = GAME_VERSION;
