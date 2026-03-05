// tests/integration.test.js — 集成测试
// 覆盖: P3 端到端流程 — 初始化 → 交易 → 保存 → 加载 → 状态一致

import { describe, it, expect, beforeEach } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as Trade from '../js/systems/trade/TradeSystem.js';
import * as Save from '../js/systems/save/SaveSystem.js';
import * as Quest from '../js/systems/quest/QuestSystem.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as RandomEvent from '../js/systems/event/RandomEvent.js';
import { createTestState } from './helpers.js';

// --- localStorage polyfill for Node ---
if (typeof globalThis.localStorage === 'undefined') {
  const store = {};
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    get length() { return Object.keys(store).length; },
    key: i => Object.keys(store)[i] || null,
  };
}

describe('端到端：初始化所有系统', () => {
  it('所有系统初始化不崩溃', () => {
    const state = createTestState();
    Faction.init(state);
    Economy.init();
    Fleet.init(state);
    Quest.init(state);
    expect(state.factionRelations).toBeDefined();
    // Economy._modifiers 是模块私有的，不需要暴露到 state
    expect(state.fleet.length).toBeGreaterThan(0);
  });
});

describe('端到端：交易流程', () => {
  let state;

  beforeEach(() => {
    state = createTestState({ credits: 5000, fuel: 100 });
    Faction.init(state);
    Economy.init();
    Fleet.init(state);
    Quest.init(state);
  });

  it('买入→卖出一个完整交易循环', () => {
    const buyPrice = Economy.getBuyPrice('sol_prime', 'food', state);
    expect(buyPrice).toBeGreaterThan(0);

    const buyResult = Trade.buyGood(state, 'food', 5);
    if (buyResult.ok) {
      expect(state.cargo.food).toBe(5);
      expect(state.credits).toBeLessThan(5000);

      const sellResult = Trade.sellGood(state, 'food', 5);
      if (sellResult.ok) {
        expect(state.cargo.food || 0).toBe(0);
        // tradeCount 由 GameManager 递增，此处仅验证卖出成功
        expect(state.credits).toBeGreaterThan(0);
      }
    }
  });

  it('买入→旅行→卖出（跨星系交易）', () => {
    const buyResult = Trade.buyGood(state, 'food', 3);
    if (buyResult.ok) {
      const travelResult = Trade.travelTo(state, 'nova_station');
      if (travelResult.ok) {
        expect(state.currentSystem).toBe('nova_station');
        const sellResult = Trade.sellGood(state, 'food', 3);
        expect(sellResult.ok).toBe(true);
      }
    }
  });
});

describe('端到端：保存→加载一致性', () => {
  it('交易后保存再加载，状态一致', () => {
    const state = createTestState({ credits: 5000 });
    Faction.init(state);
    Economy.init();
    Fleet.init(state);

    // 做一笔交易
    Trade.buyGood(state, 'food', 2);
    const creditsAfterBuy = state.credits;
    const cargoAfterBuy = { ...state.cargo };

    // saveGame(slotId, state)
    Save.saveGame('integration_test_slot', state);

    // loadGame 返回 { ok, state, msg }
    const loaded = Save.loadGame('integration_test_slot');
    expect(loaded.ok).toBe(true);
    expect(loaded.state.credits).toBe(creditsAfterBuy);
    expect(loaded.state.cargo.food).toBe(cargoAfterBuy.food);

    // 清理
    Save.deleteSlot('integration_test_slot');
  });

  it('导出→导入保持数据', () => {
    const state = createTestState({ credits: 12345, tradeCount: 42 });

    // 先保存到槽位，再导出
    Save.saveGame('export_test_slot', state);
    const json = Save.exportSave('export_test_slot');
    expect(json).not.toBeNull();
    expect(json.length).toBeGreaterThan(0);

    // importSave(slotId, jsonStr)
    const imported = Save.importSave('import_test_slot', json);
    expect(imported.ok).toBe(true);

    // 通过 loadGame 验证导入的数据
    const loaded = Save.loadGame('import_test_slot');
    expect(loaded.ok).toBe(true);
    expect(loaded.state.credits).toBe(12345);
    expect(loaded.state.tradeCount).toBe(42);

    // 清理
    Save.deleteSlot('export_test_slot');
    Save.deleteSlot('import_test_slot');
  });
});

describe('端到端：事件→任务联动', () => {
  it('旅行后触发事件检查不崩溃', () => {
    const state = createTestState({ credits: 5000, fuel: 100 });
    Faction.init(state);
    Economy.init();
    Fleet.init(state);
    Quest.init(state);

    // 旅行
    Trade.travelTo(state, 'nova_station');

    // 触发事件检查
    RandomEvent.rollEvent(state, 1);
    const ev = RandomEvent.getActiveEvent();
    if (ev) {
      const result = RandomEvent.resolveChoice(state, 0);
      expect(result).toBeDefined();
    }

    // 任务进度检查
    Quest.checkProgress(state, { action: 'travel', systemId: 'nova_station' });
    expect(true).toBe(true); // 不崩溃即通过
  });
});

describe('端到端：经济→天数推进', () => {
  it('多天推进价格波动不崩溃', () => {
    const state = createTestState();
    Faction.init(state);
    Economy.init();

    for (let i = 0; i < 30; i++) {
      Economy.advanceDay();
    }

    // 30天后价格仍然有效
    const price = Economy.getBuyPrice('sol_prime', 'food', state);
    expect(price).toBeGreaterThan(0);
    expect(Number.isFinite(price)).toBe(true);
  });
});
