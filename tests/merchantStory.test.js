import { expect, it } from 'vitest';
import { createInitialState } from '../js/data/constants.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import { buildMerchantEarlyProgress } from '../js/ui/MerchantEarlyProgress.js';
import { buildMerchantOnboardingStory, buildMerchantEarlyStory, buildMerchantDiscoveryStory, renderMerchantStory } from '../js/ui/MerchantStory.js';
import { researchChain } from './helpers/merchantResearch.js';

const start = 1_800_000_000_000;
const food = { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 126 };
const fresh = () => { const state = createInitialState({ companyName: '追光商队' }); Merchant.init(state, start); return state; };

it('故事由真实首航推进，补货等待和单程到港不会提前出现客户回执', () => {
  const state = fresh();
  Merchant.command(state, 'onboarding', { action: 'start' }, start);
  Merchant.command(state, 'onboarding', { action: 'opened-dispatch' }, start);
  state.merchant.markets.sol_prime.supply.food = 0;
  Merchant.command(state, 'create', food, start);
  const pending = structuredClone(state);
  expect(buildMerchantOnboardingStory(state).phase).toBe('first-wait');
  expect(state).toEqual(pending);
  Merchant.advance(state, start + 60_000);
  expect(buildMerchantOnboardingStory(state).phase).toBe('first-voyage');
  const returnAt = state.merchant.ships[0].arriveAt + state.merchant.ships[0].trip.legMs;
  Merchant.advance(state, returnAt - 1);
  expect(buildMerchantOnboardingStory(state).phase).toBe('first-voyage');
  expect(state.merchant.tasks[0].rounds).toBe(0);
  Merchant.advance(state, returnAt);
  const settled = structuredClone(state);
  expect(buildMerchantOnboardingStory(state)).toMatchObject({ phase: 'first-receipt', chapter: '第一章 · 第一张回执', speaker: '唐禾' });
  expect(buildMerchantOnboardingStory(state).quote).toContain(state.companyName);
  expect(state).toEqual(settled);
});

it('矿石首航由调度员转交回执，公司名字作为正文转义，读档保持故事阶段', () => {
  const state = fresh();
  Merchant.command(state, 'onboarding', { action: 'start' }, start);
  Merchant.command(state, 'create', { ...food, from: 'mineral_belt', to: 'sol_prime', goodId: 'minerals', budget: 162 }, start);
  Merchant.advance(state, start + 18_000);
  expect(buildMerchantOnboardingStory(state).speaker).toBe('梁简');
  const restored = structuredClone(state); Merchant.init(restored, restored.merchant.lastTickAt);
  expect(buildMerchantOnboardingStory(restored)).toEqual(buildMerchantOnboardingStory(state));
  const renamed = fresh(); renamed.companyName = '<img src=x onerror="bad()">';
  Merchant.command(renamed, 'onboarding', { action: 'start' }, start);
  Merchant.command(renamed, 'create', food, start); Merchant.advance(renamed, start + 18_000);
  const markup = renderMerchantStory(buildMerchantOnboardingStory(renamed));
  expect(markup).toContain('&lt;img src=x onerror=&quot;bad()&quot;&gt;');
  expect(markup).not.toContain('<img src=x');
});

it('升级和扩容通讯跟随实际船位与付费研发，不把取得资格写成已经添船', () => {
  const state = fresh(); Merchant.command(state, 'create', food, start); Merchant.advance(state, start + 18_000);
  const early = () => buildMerchantEarlyStory(state, buildMerchantEarlyProgress(state));
  expect(early()).toMatchObject({ phase: 'first-profit', speaker: '梁简' });
  expect(buildMerchantEarlyProgress(state).text).not.toContain('Lv.24');
  state.credits = 1_000_000;
  expect(Merchant.command(state, 'upgradeCompany', {}, state.merchant.lastTickAt).ok).toBe(true);
  expect(early().phase).toBe('fleet-planning');
  researchChain(state, 'berth_planning');
  expect(state.merchant.ships).toHaveLength(1);
  expect(early().phase).toBe('old-callsign');
  researchChain(state, 'planet_survey');
  const at = state.merchant.lastTickAt;
  const purchased = Merchant.command(state, 'buyShip', { typeId: 'courier' }, at);
  const input = { eventId: state.merchant.exploration.event.id, shipId: purchased.shipIds[0], from: 'sol_prime' };
  const offer = Merchant.getExplorationPreview(state, input);
  expect(Merchant.command(state, 'explore', input, at).ok).toBe(true);
  Merchant.advance(state, at + offer.durationMs);
  expect(early().phase).toBe('second-contract');
  const next = buildMerchantEarlyProgress(state).route;
  expect(Merchant.command(state, 'create', { ...next, shipIds: [purchased.shipIds[0]], budget: next.opportunity.budget }, state.merchant.lastTickAt).ok).toBe(true);
  while (state.merchant.companyLevel < 5) expect(Merchant.command(state, 'upgradeCompany', {}, state.merchant.lastTickAt).ok).toBe(true);
  expect(early()).toMatchObject({ phase: 'company-review', speaker: '闻衡' });
  expect(Merchant.command(state, 'breakthroughCompany', {}, state.merchant.lastTickAt).ok).toBe(true);
  while (state.merchant.companyLevel < 9) expect(Merchant.command(state, 'upgradeCompany', {}, state.merchant.lastTickAt).ok).toBe(true);
  expect(Merchant.getCompanyProgress(state.merchant).shipLimit).toBe(2);
  const before = structuredClone(state);
  expect(early().phase).toBe('regular-service');
  expect(state.merchant.ships).toHaveLength(2);
  expect(state).toEqual(before);
});

it('勘察完整返港后才进入第二章，未识别的新信号通讯保留未知身份', () => {
  const state = fresh(); state.merchant.companyLevel = 24; state.credits = 1_000_000;
  researchChain(state, 'planet_survey');
  const event = state.merchant.exploration.event;
  expect(buildMerchantDiscoveryStory(event)).toMatchObject({ phase: 'lost-signal', chapter: '第一章 · 第一张回执', speaker: '梁简' });
  expect(renderMerchantStory(buildMerchantDiscoveryStory(event))).not.toContain('百炼工业星');
  expect(Merchant.command(state, 'explore', { eventId: event.id, shipId: 'ship-1', from: 'sol_prime' }, start).ok).toBe(true);
  const returnAt = event.arriveAt + event.legMs;
  Merchant.advance(state, returnAt - 1);
  expect(buildMerchantDiscoveryStory(event)).toMatchObject({ phase: 'survey-return', speaker: '梁简' });
  expect(state.merchant.unlockedPorts).not.toContain('nebula_forge');
  Merchant.advance(state, returnAt);
  const before = structuredClone(state);
  expect(buildMerchantDiscoveryStory(event)).toMatchObject({ phase: 'factory-reconnected', chapter: '第二章 · 工厂仍在运转', speaker: '岑遥' });
  expect(state.merchant.unlockedPorts).toContain('nebula_forge');
  expect(state).toEqual(before);
  expect(buildMerchantDiscoveryStory({ portId: 'aurora_depot', status: 'available' })).toBeNull();
});
