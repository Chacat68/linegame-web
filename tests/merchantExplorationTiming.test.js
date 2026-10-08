import { beforeEach, expect, it } from 'vitest';
import { createInitialState, createSaveMeta, SAVE_SCHEMA_VERSION } from '../js/data/constants.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import * as Save from '../js/systems/save/SaveSystem.js';
import { researchChain } from './helpers/merchantResearch.js';

const start = 1_800_000_000_000;
beforeEach(() => localStorage.clear());

function legacyDispatch(state) {
  const event = state.merchant.exploration.event, at = state.merchant.lastTickAt;
  expect(Merchant.command(state, 'explore', { eventId: event.id, shipId: 'ship-1', from: 'sol_prime' }, at).ok).toBe(true);
  event.surveyMs = event.portId === 'nebula_forge' ? 30_000 : 60_000;
  event.arriveAt = at + event.legMs + event.surveyMs;
  state.merchant.ships[0].arriveAt = event.arriveAt;
  return event;
}
function historical(port, phase) {
  const state = createInitialState({ credits: 10_000_000 });
  state.merchant.companyLevel = 57; Merchant.init(state, start);
  researchChain(state, 'planet_survey');
  if (port === 'aurora_depot') {
    const first = legacyDispatch(state);
    Merchant.advance(state, first.arriveAt + first.legMs);
    researchChain(state, 'deep_survey');
    Merchant.advance(state, state.merchant.exploration.nextEventAt);
  }
  const event = legacyDispatch(state);
  const at = phase === 'outbound' ? event.startedAt + 1
    : phase === 'surveying' ? event.startedAt + event.legMs + 1
      : phase === 'returning' ? event.arriveAt : event.arriveAt + event.legMs;
  Merchant.advance(state, at);
  return state;
}
function oldRaw(state) {
  const data = structuredClone(state);
  for (const event of [...data.merchant.exploration.completed, data.merchant.exploration.event]) delete event.surveyMs;
  return JSON.stringify({ meta: { ...createSaveMeta(0, data), schemaVersion: 33 }, data });
}

it.each(['nebula_forge', 'aurora_depot'].flatMap(port => ['outbound', 'surveying', 'returning', 'completed'].map(phase => [port, phase])))
('%s 的旧 %s 探索迁移保留原时间与资产，离线完成和在线结果一致', (port, phase) => {
  const online = historical(port, phase), raw = oldRaw(online);
  localStorage.setItem('startrader_save_0', raw);
  const loaded = Save.loadGame(0);
  expect(loaded.ok, loaded.msg).toBe(true);
  expect(loaded.state).toEqual(online);
  expect(localStorage.getItem('startrader_save_before_v34_0')).toBe(raw);
  expect(JSON.parse(Save.exportSave(0)).meta.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  const event = online.merchant.exploration.event;
  const end = event.startedAt + 2 * event.legMs + event.surveyMs;
  Merchant.advance(online, end); Merchant.advance(loaded.state, end);
  expect(loaded.state).toEqual(online);
  expect(loaded.state.merchant.exploration.event.status).toBe('completed');
  expect(Save.saveGame(0, loaded.state).ok).toBe(true);
  expect(Save.loadGame(0).state).toEqual(loaded.state);
});

it('旧待探索信号派出时使用4分钟新时长，计时被破坏的导入不覆盖已有存档', () => {
  const state = createInitialState({ credits: 100_000 });
  state.merchant.companyLevel = 24; Merchant.init(state, start); researchChain(state, 'planet_survey');
  localStorage.setItem('startrader_save_0', oldRaw(state));
  const loaded = Save.loadGame(0).state;
  const offer = Merchant.getExplorationPreview(loaded, { shipId: 'ship-1' });
  expect(offer).toMatchObject({ ok: true, surveyMs: 240_000 });
  const current = Save.exportSave(0), damaged = historical('nebula_forge', 'surveying');
  damaged.merchant.exploration.event.arriveAt += 1; damaged.merchant.ships[0].arriveAt += 1;
  expect(Save.importSave(0, oldRaw(damaged)).ok).toBe(false);
  expect(Save.exportSave(0)).toBe(current);
});
