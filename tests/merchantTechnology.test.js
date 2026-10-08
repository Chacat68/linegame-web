import { beforeEach, describe, expect, it } from 'vitest';
import { historicalResearch, researchChain } from './helpers/merchantResearch.js';
import { createInitialState, createSaveMeta } from '../js/data/constants.js';
import { MERCHANT_TECHS, MERCHANT_18_LEVEL_MAP, MERCHANT_LEGACY_TECH_GROUPS } from '../js/data/merchant.js';
import * as Merchant from '../js/systems/merchant/MerchantSystem.js';
import * as Save from '../js/systems/save/SaveSystem.js';
import { getMerchantAnalytics } from '../js/systems/merchant/MerchantAnalytics.js';

const start = 1_800_000_000_000;
const food = { from: 'sol_prime', to: 'mineral_belt', goodId: 'food', shipIds: ['ship-1'], budget: 220 };
const totalResearchCost = MERCHANT_TECHS.reduce((sum, tech) => sum + tech.cost, 0);
const techCost = id => MERCHANT_TECHS.find(tech => tech.id === id).cost;
const fresh = (level = 100, credits = totalResearchCost + 200_000) => {
  const state = createInitialState({ credits }); state.merchant.companyLevel = level;
  Merchant.init(state, start); return state;
};
const research = (state, id, now = state.merchant.lastTickAt) => {
  const result = Merchant.command(state, 'researchTech', { techId: id }, now);
  expect(result.ok, `${id}: ${result.msg}`).toBe(true);
};
const fleetIds = level => MERCHANT_TECHS.filter(tech => tech.shipSlotBonus && tech.previousCompanyLevel <= level).map(tech => tech.id);
const allResearch = state => MERCHANT_TECHS.forEach(tech => research(state, tech.id));
beforeEach(() => { localStorage.clear(); });

describe('科技加成与航次锁定', () => {
  it('符合等级资格后可逐项研发，分别扣费并逐步获得 2%、2%、1% 航速', () => {
    const state = fresh(4, techCost('efficient_engines') + techCost('thruster_calibration') + techCost('fuel_injection') + 120);
    let cash = state.credits;
    let previousLeg = Merchant.preview(state, food).rows[0].legMs;
    for (const [id, cost, bonus] of [['efficient_engines', techCost('efficient_engines'), 0.02], ['thruster_calibration', techCost('thruster_calibration'), 0.04], ['fuel_injection', techCost('fuel_injection'), 0.05]]) {
      research(state, id); cash -= cost;
      expect(state.credits).toBe(cash);
      expect(state.merchant.companyLevel).toBe(4);
      expect(Merchant.getTechBonuses(state.merchant)).toEqual({ speed: bonus, capacity: 0, profit: 0 });
      const preview = Merchant.preview(state, food).rows[0];
      expect(preview.legMs).toBeLessThan(previousLeg); previousLeg = preview.legMs;
      expect(preview.capacity).toBe(12);
      expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
    }
    expect(state.credits).toBe(120);
  });

  it('航速、载量和净利加成同用于预览、机会、投资比较、货本建议和实际结算', () => {
    const state = fresh(); allResearch(state);
    expect(Merchant.getShipStats(state.merchant, 'courier').capacity).toBe(17);
    expect(Merchant.getShipStats(state.merchant, 'courier').speed).toBeCloseTo(1.82);
    expect(Merchant.fullLoadBudget('courier', food.from, food.to, food.goodId, state.merchant)).toBe(166);
    const offer = Merchant.preview(state, food).rows[0];
    expect(offer).toMatchObject({ quantity: 17, capacity: 17, profit: 93, cost: 136, fee: 30, revenue: 259, legMs: 6594 });
    expect(Merchant.findRouteOpportunity(state, food.from, food.to, food.goodId)).toMatchObject({ budget: 166, quantity: 17, profit: 93 });
    expect(Merchant.getShipRouteComparison(state, food)[0]).toMatchObject({ capital: 166, quantity: 17, profit: 93, durationMs: 13188 });
    const cash = state.credits;
    expect(Merchant.command(state, 'create', food, start).ok).toBe(true);
    expect(state.merchant.ships[0].trip).toMatchObject({ capacity: 17, quantity: 17, revenue: 259, techIds: state.merchant.researchedTechIds });
    Merchant.advance(state, start + 13188);
    expect(state.credits).toBe(cash - food.budget + 93);
    expect(state.merchant.tasks[0].recent[0]).toMatchObject({ quantity: 17, capacity: 17, profit: 93 });
    expect(getMerchantAnalytics(state.merchant, 5).routes[0]).toMatchObject({ quantity: 17, capacity: 17, profit: 93, loadFraction: 1 });
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it('贸易途中研发保留原时刻与金额，下一趟自动续跑使用新参数；刷新与离线计算一致', () => {
    const state = fresh();
    expect(Merchant.command(state, 'create', food, start).ok).toBe(true);
    const original = structuredClone(state.merchant.ships[0]);
    const task = structuredClone(state.merchant.tasks[0]);
    Merchant.advance(state, start + 1000);
    allResearch(state);
    expect(state.merchant.ships[0]).toEqual(original);
    expect(state.merchant.tasks[0]).toEqual(task);
    expect(Save.saveGame(0, state).ok).toBe(true);
    const offline = Save.loadGame(0).state;
    for (let at = start + 2000; at < start + 17144; at += 1000) Merchant.advance(state, at);
    Merchant.advance(state, start + 17144); Merchant.advance(offline, start + 17144);
    expect(offline).toEqual(state);
    expect(state.merchant.tasks[0]).toMatchObject({ rounds: 1, profit: 42, recent: [{ profit: 42, capacity: 12 }] });
    expect(state.merchant.ships[0].trip).toMatchObject({ quantity: 17, capacity: 17, legMs: 6594, revenue: 259 });
    expect(Merchant.isValidMerchantState(state.merchant)).toBe(true);
  });

  it('探索航速同样生效，勘察时长不变；途中研发和读档保留探索去返程', () => {
    const state = fresh(); researchChain(state, 'planet_survey');
    const event = state.merchant.exploration.event;
    const baseline = Merchant.getExplorationPreview(state, { shipId: 'ship-1' });
    expect(Merchant.command(state, 'explore', { eventId: event.id, shipId: 'ship-1' }, start).ok).toBe(true);
    const original = structuredClone(event), ship = structuredClone(state.merchant.ships[0]);
    for (const tech of MERCHANT_TECHS.filter(item => item.speedBonus)) research(state, tech.id);
    expect(event).toEqual(original); expect(state.merchant.ships[0]).toEqual(ship);
    expect(Save.saveGame(1, state).ok).toBe(true);
    const loaded = Save.loadGame(1).state;
    Merchant.advance(loaded, start + baseline.durationMs - 1);
    expect(loaded.merchant.unlockedPorts).not.toContain('nebula_forge');
    Merchant.advance(loaded, start + baseline.durationMs);
    expect(loaded.merchant.unlockedPorts).toContain('nebula_forge');
    researchChain(loaded, 'deep_survey'); Merchant.advance(loaded, loaded.merchant.exploration.nextEventAt);
    const next = Merchant.getExplorationPreview(loaded, { from: 'nebula_forge', shipId: 'ship-1' });
    expect(next.legMs).toBe(Merchant.legDuration('courier', 'nebula_forge', 'aurora_depot', loaded.merchant));
    expect(next.legMs).toBeLessThan(Merchant.legDuration('courier', 'nebula_forge', 'aurora_depot'));
    expect(next.durationMs).toBe(2 * next.legMs + 8 * 60_000);
  });

  it('净利科技只奖励可盈利成交，不让不足以覆盖费用的航次变为盈利', () => {
    const state = fresh();
    for (const tech of MERCHANT_TECHS.filter(item => item.profitBonus)) research(state, tech.id);
    expect(Merchant.preview(state, { ...food, budget: 70 }).rows[0]).toMatchObject({ quantity: 5, profit: 0, revenue: 70 });
    expect(Merchant.preview(state, { ...food, budget: 62 }).rows[0]).toMatchObject({ quantity: 4, profit: -6, revenue: 56 });
    const cash = state.credits;
    Merchant.command(state, 'create', { ...food, budget: 70 }, start);
    expect(state.credits).toBe(cash);
    expect(state.merchant.tasks).toHaveLength(0);
    expect(state.merchant.ships[0].phase).toBe('idle');
  });

  it('前置条件、费用不足和首航货本保护均原子拒绝；低级属性研发不会开放其他功能', () => {
    const dependency = fresh();
    for (const id of ['hauler_design', 'engine_tuning', 'cargo_expansion', 'integrated_freight', 'deep_survey', 'trade_network']) {
      const before = structuredClone(dependency);
      expect(Merchant.command(dependency, 'researchTech', { techId: id }, start).ok).toBe(false);
      expect(dependency).toEqual(before);
    }
    for (const credits of [techCost('efficient_engines') - 1, techCost('efficient_engines') + 73]) {
      const state = fresh(1, credits), before = structuredClone(state);
      expect(Merchant.command(state, 'researchTech', { techId: 'efficient_engines' }, start).ok).toBe(false);
      expect(state).toEqual(before);
    }
    const state = fresh(1, techCost('efficient_engines') + 74); research(state, 'efficient_engines');
    expect(state.credits).toBe(74);
    expect(state.merchant.researchedTechIds).toEqual(['efficient_engines']);
    expect(state.merchant.exploration.event).toBeNull();
    expect(Merchant.isShipTypeUnlocked(state.merchant, 'clipper')).toBe(false);
  });

  it('当前存档拒绝伪造加成、无前置和未持有的航次科技快照，导入不覆盖槽位', () => {
    const state = fresh(); allResearch(state);
    Merchant.command(state, 'create', food, start); Save.saveGame(2, state);
    const raw = Save.exportSave(2);
    for (const damage of [
      m => { m.ships[0].trip.capacity += 1; }, m => { m.ships[0].trip.legMs += 1; },
      m => { m.ships[0].trip.revenue += 1; }, m => { m.ships[0].trip.techIds = ['advanced_engines']; },
      m => { m.ships[0].trip.techIds.push('unknown'); }, m => { m.researchedTechIds = ['engine_tuning']; },
    ]) {
      const damaged = structuredClone(state); damage(damaged.merchant);
      expect(Save.importSave(2, JSON.stringify({ meta: createSaveMeta(2, damaged), data: damaged })).ok).toBe(false);
      expect(Save.exportSave(2)).toBe(raw);
    }
  });
});

describe('v30 科技细分迁移', () => {
  it.each([
    [1, ['efficient_engines'], { speed: 0.05, capacity: 0, profit: 0 }, 3],
    [10, ['efficient_engines', 'engine_tuning'], { speed: 0.15, capacity: 0, profit: 0 }, 8],
    [16, ['efficient_engines', 'engine_tuning', 'advanced_engines'], { speed: 0.30, capacity: 0, profit: 0 }, 15],
    [7, ['cargo_racks'], { speed: 0, capacity: 0.10, profit: 0 }, 5],
    [13, ['cargo_racks', 'cargo_expansion'], { speed: 0, capacity: 0.25, profit: 0 }, 10],
    [17, ['cargo_racks', 'cargo_expansion', 'modular_cargo'], { speed: 0, capacity: 0.45, profit: 0 }, 15],
    [9, ['trade_contracts'], { speed: 0, capacity: 0, profit: 0.05 }, 3],
    [15, ['trade_contracts', 'trade_negotiation'], { speed: 0, capacity: 0, profit: 0.15 }, 8],
    [18, ['trade_contracts', 'trade_negotiation', 'trade_network'], { speed: 0, capacity: 0, profit: 0.30 }, 15],
  ])('Lv.%i 旧属性研发保持已购买效果，展开一次且不再扣费', (level, ids, bonuses, count) => {
    const state = fresh(level); state.merchant.researchedTechIds = ids;
    const raw = JSON.stringify({ meta: { ...createSaveMeta(0, state), schemaVersion: 30 }, data: state });
    localStorage.setItem('startrader_save_0', raw);
    const result = Save.loadGame(0); expect(result.ok, result.msg).toBe(true);
    expect(result.state.credits).toBe(state.credits);
    expect(result.state.merchant.companyLevel).toBe(MERCHANT_18_LEVEL_MAP[level]);
    expect(result.state.merchant.researchedTechIds).toHaveLength(count + fleetIds(MERCHANT_18_LEVEL_MAP[level]).length);
    expect(Merchant.getTechBonuses(result.state.merchant)).toEqual(bonuses);
    expect(Merchant.isValidMerchantState(result.state.merchant)).toBe(true);
    expect(localStorage.getItem('startrader_save_before_v31_0')).toBe(raw);
    expect(Save.loadGame(0).state).toEqual(result.state);
    const before = structuredClone(result.state);
    expect(Merchant.command(result.state, 'researchTech', { techId: ids[0] }, start).ok).toBe(false);
    expect(result.state).toEqual(before);
  });

  it.each(['exploring', 'completed'])('完整旧档的贸易与 %s 探索快照保持原时刻、金额与离线结算', phase => {
    const state = fresh(); allResearch(state);
    Merchant.command(state, 'create', food, start);
    Merchant.command(state, 'buyShip', { typeId: 'courier' }, start);
    const explorer = state.merchant.ships.find(ship => !ship.taskId);
    const event = state.merchant.exploration.event;
    const preview = Merchant.getExplorationPreview(state, { shipId: explorer.id });
    expect(Merchant.command(state, 'explore', { eventId: event.id, shipId: explorer.id }, start).ok).toBe(true);
    Merchant.advance(state, start + (phase === 'completed' ? preview.durationMs : 1000));
    const legacy = structuredClone(state); legacy.merchant.companyLevel = 18;
    const oldIds = [...Object.keys(MERCHANT_LEGACY_TECH_GROUPS), 'clipper_design', 'hauler_design', 'fleet_command', 'market_network', 'planet_survey', 'fast_navigation', 'bulk_logistics', 'deep_survey', 'integrated_freight'];
    legacy.merchant.researchedTechIds = oldIds;
    for (const ship of legacy.merchant.ships) if (ship.trip) ship.trip.techIds = [...oldIds];
    for (const task of [...legacy.merchant.tasks, ...legacy.merchant.history]) for (const record of task.recent) if (record.techIds?.length) record.techIds = [...oldIds];
    for (const item of [...legacy.merchant.exploration.completed, ...(legacy.merchant.exploration.event ? [legacy.merchant.exploration.event] : [])]) if (item.techIds.length) item.techIds = [...oldIds];
    const raw = JSON.stringify({ meta: { ...createSaveMeta(0, legacy), schemaVersion: 30 }, data: legacy });
    localStorage.setItem('startrader_save_0', raw);
    const result = Save.loadGame(0); expect(result.ok, result.msg).toBe(true);
    const normalize = source => {
      const copy = structuredClone(source), merchant = copy.merchant;
      merchant.researchedTechIds.sort();
      for (const ship of merchant.ships) if (ship.trip) ship.trip.techIds = ship.trip.techIds.filter(id => !fleetIds(100).includes(id)).sort();
      for (const task of [...merchant.tasks, ...merchant.history]) for (const record of task.recent) record.techIds && (record.techIds = record.techIds.filter(id => !fleetIds(100).includes(id)).sort());
      for (const item of [...merchant.exploration.completed, ...(merchant.exploration.event ? [merchant.exploration.event] : [])]) item.techIds = item.techIds.filter(id => !fleetIds(100).includes(id)).sort();
      return copy;
    };
    expect(result.state.merchant.researchedTechIds).toHaveLength(65);
    expect(normalize(result.state)).toEqual(normalize(state));
    Merchant.advance(state, start + preview.durationMs + 60000);
    Merchant.advance(result.state, start + preview.durationMs + 60000);
    expect(normalize(result.state)).toEqual(normalize(state));
    expect(result.state.merchant.unlockedPorts).toContain('nebula_forge');
    expect(Merchant.isValidMerchantState(result.state.merchant)).toBe(true);
  });

  it('在途快照只展开出发时的旧科技，途中研发不计入原航次', () => {
    const state = fresh();
    for (const id of MERCHANT_LEGACY_TECH_GROUPS.efficient_engines) research(state, id);
    Merchant.command(state, 'create', food, start);
    const original = structuredClone(state.merchant.ships[0]);
    Merchant.advance(state, start + 1000);
    for (const id of MERCHANT_LEGACY_TECH_GROUPS.engine_tuning) research(state, id);
    const legacy = structuredClone(state); legacy.merchant.companyLevel = 18;
    legacy.merchant.researchedTechIds = ['efficient_engines', 'engine_tuning'];
    legacy.merchant.ships[0].trip.techIds = ['efficient_engines'];
    const raw = JSON.stringify({ meta: { ...createSaveMeta(0, legacy), schemaVersion: 30 }, data: legacy });
    localStorage.setItem('startrader_save_0', raw);
    const result = Save.loadGame(0); expect(result.ok, result.msg).toBe(true);
    expect(result.state.credits).toBe(state.credits);
    expect(result.state.merchant.researchedTechIds).toHaveLength(8 + fleetIds(100).length);
    expect(result.state.merchant.ships[0]).toEqual(original);
    expect(Merchant.getTechBonuses(result.state.merchant)).toMatchObject({ speed: 0.15 });
    Merchant.advance(result.state, original.trip.departedAt + 2 * original.trip.legMs);
    expect(result.state.merchant.ships[0].trip.legMs).toBeLessThan(original.trip.legMs);
    expect(Merchant.isValidMerchantState(result.state.merchant)).toBe(true);
  });

  it('旧档缺少前置、重复或未知科技仍拒绝迁移，并保留原始内容', () => {
    for (const ids of [['engine_tuning'], ['efficient_engines', 'efficient_engines'], ['unknown']]) {
      const state = fresh(18); state.merchant.researchedTechIds = ids;
      const raw = JSON.stringify({ meta: { ...createSaveMeta(0, state), schemaVersion: 30 }, data: state });
      localStorage.setItem('startrader_save_0', raw);
      expect(Save.loadGame(0).ok).toBe(false);
      expect(Save.exportSave(0)).toBe(raw);
    }
  });
});

describe('v28 科技迁移与方案移除', () => {
  it('保留旧档已开放功能、船型和在途账本，只删除方案，不退货本或赠送属性加成', () => {
    const state = fresh(40, techCost('fast_navigation') + 20000); historicalResearch(state, 'fast_navigation');
    Merchant.command(state, 'create', food, start);
    Merchant.advance(state, start + 1000);
    const legacy = structuredClone(state); legacy.merchant.companyLevel = 18;
    legacy.merchant.companyLevel = 8;
    legacy.merchant.plans = [{ id: 'plan-4', shipIds: ['ship-1'], from: food.from, to: food.to, goodId: food.goodId, budget: 220, lastTaskId: legacy.merchant.tasks[0].id }];
    legacy.merchant.tasks[0].planId = 'plan-4'; legacy.merchant.nextId = 5;
    delete legacy.merchant.ships[0].trip.techIds; delete legacy.merchant.ships[0].trip.capacity;
    const raw = JSON.stringify({ meta: { ...createSaveMeta(0, legacy), schemaVersion: 28 }, data: legacy });
    localStorage.setItem('startrader_save_0', raw);
    const result = Save.loadGame(0); expect(result.ok).toBe(true);
    const loaded = result.state;
    expect(loaded.credits).toBe(legacy.credits);
    expect(loaded.merchant.companyLevel).toBe(40);
    expect(loaded.merchant).not.toHaveProperty('plans');
    expect(loaded.merchant.tasks[0]).not.toHaveProperty('planId');
    expect(loaded.merchant.tasks[0]).toEqual(state.merchant.tasks[0]);
    expect(loaded.merchant.ships[0]).toEqual({ ...legacy.merchant.ships[0], trip: { ...legacy.merchant.ships[0].trip, techIds: [], capacity: 12 } });
    expect(loaded.merchant.researchedTechIds).toEqual(['fast_navigation', 'clipper_design', 'hauler_design', 'fleet_command', 'market_network', 'planet_survey', ...fleetIds(40)]);
    expect(Merchant.getTechBonuses(loaded.merchant)).toEqual({ speed: 0, capacity: 0, profit: 0 });
    expect(Merchant.isShipTypeUnlocked(loaded.merchant, 'clipper')).toBe(true);
    expect(Merchant.isShipTypeUnlocked(loaded.merchant, 'hauler')).toBe(true);
    expect(localStorage.getItem('startrader_save_before_v29_0')).toBe(raw);
    expect(Save.loadGame(0).state).toEqual(loaded);
    expect(Merchant.command(loaded, 'dispatchPlans', { planIds: ['plan-4'] }, start + 1000).ok).toBe(false);
    const cash = loaded.credits;
    Merchant.advance(loaded, start + 17144);
    expect(loaded.credits).toBe(cash + 42);
    expect(loaded.merchant.tasks[0]).toMatchObject({ budget: 220, profit: 42, rounds: 1 });
    expect(Merchant.isValidMerchantState(loaded.merchant)).toBe(true);
  });
});
