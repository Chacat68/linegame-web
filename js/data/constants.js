import { MERCHANT_DEFAULTS } from './merchant.js';
export const GAME_VERSION = '2.0.0';
export const SAVE_SCHEMA_VERSION = 26;
export const PERSISTED_STATE_DEFAULTS = Object.freeze({
  companyName: '蓝脉信使物流体', credits: 1000,
  currentGalaxy: 'milky_way', viewingGalaxy: 'milky_way', merchant: MERCHANT_DEFAULTS,
});
export const SAVE_STATE_SCHEMA = Object.freeze(Object.fromEntries(Object.entries(PERSISTED_STATE_DEFAULTS).map(([key, value]) => [key, { type: typeof value, default: value }])));
export function createInitialState(overrides = {}) {
  return structuredClone({ ...PERSISTED_STATE_DEFAULTS, ...overrides });
}
export function createSaveMeta(slotId, state, options = {}) {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION, gameVersion: GAME_VERSION, slotId,
    saveName: options.saveName || (slotId === 0 ? '自动存档' : `手动存档 ${slotId}`),
    timestampMs: options.timestampMs ?? Date.now(), companyName: state.companyName,
    credits: state.credits, ships: state.merchant.ships.length, tasks: state.merchant.tasks.length,
    isAutosave: slotId === 0,
  };
}
