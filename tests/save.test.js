// tests/save.test.js — SaveSystem 测试
// 覆盖: C4（importSave 无结构校验）、M9（localStorage 配额）

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Save from '../js/systems/save/SaveSystem.js';
import { SAVE_SCHEMA_VERSION, SAVE_STATE_SCHEMA, createSaveMeta } from '../js/data/constants.js';
import { createTestState } from './helpers.js';

// vitest 在 Node 环境中没有 localStorage，需要 polyfill
const storage = {};
beforeEach(() => {
  // 简单的 localStorage polyfill
  if (typeof globalThis.localStorage === 'undefined') {
    globalThis.localStorage = {
      _data: {},
      getItem(key) { return this._data[key] ?? null; },
      setItem(key, value) { this._data[key] = String(value); },
      removeItem(key) { delete this._data[key]; },
      clear() { this._data = {}; },
    };
  }
  globalThis.localStorage.clear();
});

describe('Save.saveGame', () => {
  it('成功保存到槽位 0', () => {
    const state = createTestState();
    const result = Save.saveGame(0, state);
    expect(result.ok).toBe(true);
  });

  it('使用当前 schemaVersion 并写入核心 meta 摘要', () => {
    const state = createTestState({
      companyName: '迁移测试公司',
      difficulty: 'hard',
      credits: 4321,
      currentSystem: 'nova_station',
    });
    Save.saveGame(1, state, { saveName: '手工测试存档' });

    const raw = globalThis.localStorage.getItem('startrader_save_1');
    const parsed = JSON.parse(raw);

    expect(parsed.meta.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(parsed.meta.saveName).toBe('手工测试存档');
    expect(parsed.meta.difficulty).toBe('hard');
    expect(parsed.meta.companyName).toBe('迁移测试公司');
    expect(parsed.meta.currentSystem).toBe('nova_station');
  });

  it('保存到槽位 1-3', () => {
    const state = createTestState();
    for (let i = 1; i <= 3; i++) {
      const result = Save.saveGame(i, state);
      expect(result.ok).toBe(true);
    }
  });

  it('自动存档标记正确', () => {
    const state = createTestState();
    Save.saveGame(0, state, { isAutosave: true });
    const slots = Save.listSlots();
    const slot0 = slots.find(s => s.slotId === 0);
    expect(slot0.isEmpty).toBe(false);
    expect(slot0.meta.isAutosave).toBe(true);
  });
});

describe('Save.loadGame', () => {
  it('加载已保存的游戏', () => {
    const state = createTestState({ credits: 9999, day: 42 });
    Save.saveGame(1, state);
    const result = Save.loadGame(1);
    expect(result.ok).toBe(true);
    expect(result.state.credits).toBe(9999);
    expect(result.state.day).toBe(42);
  });

  it('待处理事件和每艘船的货物成本可以完整往返', () => {
    const state = createTestState({
      _activeEventId: 'space_anomaly',
      activeShipIndex: 1,
      fleet: [
        { cargo: { food: 2 }, cargoCost: { food: 20 } },
        { cargo: { minerals: 1 }, cargoCost: { minerals: 30 } },
      ],
    });

    Save.saveGame(0, state, { isAutosave: true });
    const result = Save.loadGame(0);

    expect(result.ok).toBe(true);
    expect(result.state._activeEventId).toBe('space_anomaly');
    expect(result.state.fleet[0].cargoCost).toEqual({ food: 20 });
    expect(result.state.fleet[1].cargoCost).toEqual({ minerals: 30 });
  });

  it('空槽位返回失败', () => {
    const result = Save.loadGame(2);
    expect(result.ok).toBe(false);
  });

  it('损坏存档返回明确错误信息', () => {
    globalThis.localStorage.setItem('startrader_save_2', '{broken json');

    const result = Save.loadGame(2);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('SAVE_JSON_INVALID');
    expect(result.msg).toContain('读档失败');
  });

  it('加载后补全缺失字段', () => {
    // 模拟旧存档（缺少新字段）
    const oldState = { credits: 500, day: 10, cargo: {}, currentSystem: 'sol_prime' };
    const envelope = {
      meta: { schemaVersion: 1, gameVersion: '0.1.0', slotId: 1, timestampMs: Date.now() },
      data: oldState,
    };
    globalThis.localStorage.setItem('startrader_save_1', JSON.stringify(envelope));

    const result = Save.loadGame(1);
    expect(result.ok).toBe(true);
    // 缺失字段应被补全
    expect(result.state.achievements).toEqual([]);
    expect(result.state.quests).toEqual([]);
    expect(result.state.completedQuests).toEqual([]);
    expect(result.state.reputation).toBe(0);
    expect(result.state.cargoCost).toEqual({});
    expect(result.state.difficulty).toBe('normal');
    expect(result.state._pendingChainEvents).toEqual([]);
    expect(result.state.economyCycle).toBeNull();
    expect(result.state.playerLevel).toBe(1);
    expect(result.state.companyLevel).toBe(1);
    expect(result.state._eventCooldowns).toEqual({});
    expect(result.state._eventHistory).toEqual([]);
    expect(result.state.tradeStations).toEqual({});
    expect(result.state.creditRating).toBe(620);
    expect(result.state.loans).toEqual([]);
    expect(result.state.stockPortfolio).toEqual({});
    expect(result.state.stockMarket).toEqual({});
    expect(result.state.tradeInvestments).toEqual({});
    expect(result.state.insurancePolicies).toEqual({});
    expect(result.state.insuranceClaims).toEqual([]);
    expect(result.state.financeLastProcessedDay).toBe(1);
    expect(result.state.storyFlags).toEqual({});
    expect(result.state.storyDecisions).toEqual({});
    expect(result.state.companyDirectiveClaims).toEqual({});
    expect(result.state.economyMarketState).toBeNull();
    expect(result.state.balanceMetrics.firstTrade).toBeNull();
    expect(result.state.balanceMetrics.trade.realizedProfitByGood).toEqual({});
    expect(result.state._activeEventId).toBe('');
  });

  it('上一版存档迁移后会补齐市场快照字段', () => {
    const envelope = {
      meta: { schemaVersion: SAVE_SCHEMA_VERSION - 1, gameVersion: '0.6.0', slotId: 1, timestampMs: Date.now() },
      data: { credits: 900, day: 7, currentSystem: 'sol_prime' },
    };
    globalThis.localStorage.setItem('startrader_save_1', JSON.stringify(envelope));

    const result = Save.loadGame(1);

    expect(result.ok).toBe(true);
    expect(result.state.storyFlags).toEqual({});
    expect(result.state.storyDecisions).toEqual({});
    expect(result.state.companyDirectiveClaims).toEqual({});
    expect(result.state.economyMarketState).toBeNull();
    expect(result.state._activeEventId).toBe('');
  });

  it('v15 存档会把根货物成本迁移给当时的活动飞船', () => {
    const envelope = {
      meta: { schemaVersion: 15, gameVersion: '0.6.3', slotId: 1, timestampMs: Date.now() },
      data: {
        activeShipIndex: 1,
        cargoCost: { minerals: 30 },
        fleet: [
          { cargo: { food: 2 } },
          { cargo: { minerals: 1 } },
        ],
      },
    };
    globalThis.localStorage.setItem('startrader_save_1', JSON.stringify(envelope));

    const result = Save.loadGame(1);

    expect(result.ok).toBe(true);
    expect(result.state.fleet[0].cargoCost).toEqual({});
    expect(result.state.fleet[1].cargoCost).toEqual({ minerals: 30 });
  });

  it('旧存档缺少等级字段时，会根据经验自动回填 playerLevel 和 companyLevel', () => {
    const envelope = {
      meta: { schemaVersion: 1, gameVersion: '0.1.0', slotId: 1, timestampMs: Date.now() },
      data: {
        credits: 500,
        day: 10,
        currentSystem: 'sol_prime',
        experience: 1200,
        companyExperience: 1400,
      },
    };
    globalThis.localStorage.setItem('startrader_save_1', JSON.stringify(envelope));

    const result = Save.loadGame(1);
    expect(result.ok).toBe(true);
    expect(result.state.playerLevel).toBeGreaterThan(1);
    expect(result.state.companyLevel).toBeGreaterThan(1);
  });

  it('加载旧 schema 存档后会自动迁移并回写', () => {
    const envelope = {
      meta: { schemaVersion: 1, gameVersion: '0.1.0', slotId: 1, timestampMs: Date.now() },
      data: { credits: 900, day: 7, currentSystem: 'sol_prime', economyCycle: { phaseIndex: 2 } },
    };
    globalThis.localStorage.setItem('startrader_save_1', JSON.stringify(envelope));

    const result = Save.loadGame(1);
    expect(result.ok).toBe(true);
    expect(result.state.economyCycle).toEqual({ phaseIndex: 2 });

    const stored = JSON.parse(globalThis.localStorage.getItem('startrader_save_1'));
    expect(stored.meta.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(stored.meta.difficulty).toBe('normal');
  });

  it('未来版本的存档会被拒绝，避免静默降级', () => {
    const envelope = {
      meta: { schemaVersion: SAVE_SCHEMA_VERSION + 1, gameVersion: '9.9.9', slotId: 1, timestampMs: Date.now() },
      data: { credits: 900, day: 7, currentSystem: 'sol_prime' },
    };
    globalThis.localStorage.setItem('startrader_save_1', JSON.stringify(envelope));

    const result = Save.loadGame(1);
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('SAVE_SCHEMA_UNSUPPORTED');
    expect(result.msg).toContain('不支持的存档版本');
  });

  it('随机事件冷却与历史会随存档保留', () => {
    const state = createTestState({
      _eventCooldowns: { merchant_caravan: 6 },
      _eventHistory: [{ eventId: 'merchant_caravan', day: 6, choiceIndex: 1 }],
    });

    Save.saveGame(1, state);
    const result = Save.loadGame(1);

    expect(result.ok).toBe(true);
    expect(result.state._eventCooldowns).toEqual({ merchant_caravan: 6 });
    expect(result.state._eventHistory).toEqual([{ eventId: 'merchant_caravan', day: 6, choiceIndex: 1 }]);
  });

  it('公司指令领取记录会随存档保留', () => {
    const state = createTestState({
      companyDirectiveClaims: {
        'cashflow:L2': {
          directiveId: 'cashflow',
          code: 'CF-02',
          claimedDay: 8,
          reward: { credits: 650, companyExperience: 80, reputation: 3 },
        },
      },
    });

    Save.saveGame(1, state);
    const result = Save.loadGame(1);

    expect(result.ok).toBe(true);
    expect(result.state.companyDirectiveClaims['cashflow:L2']).toMatchObject({
      directiveId: 'cashflow',
      code: 'CF-02',
      claimedDay: 8,
    });
  });
});

describe('Save.importSave', () => {
  it('无效 JSON 返回失败', () => {
    const result = Save.importSave(1, 'not json at all');
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('SAVE_JSON_INVALID');
  });

  it('缺少 meta 字段返回失败', () => {
    const result = Save.importSave(1, JSON.stringify({ data: {} }));
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('SAVE_META_MISSING');
  });

  it('缺少 data 字段返回失败', () => {
    const result = Save.importSave(1, JSON.stringify({ meta: {} }));
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('SAVE_DATA_MISSING');
  });

  it('非法 meta 类型返回失败', () => {
    const result = Save.importSave(1, JSON.stringify({
      meta: { schemaVersion: '3', slotId: 1 },
      data: { credits: 10 },
    }));
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('SAVE_META_TYPE_INVALID');
  });

  it('恶意数据（credits 为字符串）导入后被类型校验修正 [C4]', () => {
    const malicious = JSON.stringify({
      meta: { schemaVersion: 1, gameVersion: '0.2.0', slotId: 1 },
      data: { credits: 'not_a_number', fleet: 'also_not_array', day: -999 },
    });
    const result = Save.importSave(1, malicious);
    expect(result.ok).toBe(true);

    // 加载后类型校验应修正非法值
    const loaded = Save.loadGame(1);
    expect(loaded.ok).toBe(true);
    expect(typeof loaded.state.credits).toBe('number');
    expect(typeof loaded.state.day).toBe('number');
    expect(Array.isArray(loaded.state.fleet)).toBe(true);
    expect(loaded.state.day).toBe(1);
  });

  it('导入旧存档时会迁移到当前 schema 并改写目标槽位', () => {
    const legacy = JSON.stringify({
      meta: { schemaVersion: 1, gameVersion: '0.1.0', slotId: 99, timestampMs: Date.now() },
      data: { credits: 2048, day: 8, currentSystem: 'sol_prime' },
    });

    const result = Save.importSave(2, legacy);
    expect(result.ok).toBe(true);

    const stored = JSON.parse(globalThis.localStorage.getItem('startrader_save_2'));
    expect(stored.meta.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(stored.meta.slotId).toBe(2);
    expect(stored.meta.credits).toBe(2048);
  });

  it('正常存档导出后重新导入，核心状态保持一致', () => {
    const state = createTestState({ credits: 12345 });
    Save.saveGame(2, state);
    const exported = Save.exportSave(2);
    const result = Save.importSave(1, exported);
    expect(result.ok).toBe(true);

    const loaded = Save.loadGame(1);
    expect(loaded.ok).toBe(true);
    expect(loaded.state.credits).toBe(12345);
    expect(loaded.state.currentSystem).toBe(state.currentSystem);
  });

  it('导入时丢弃 SAVE_STATE_SCHEMA 外的未知状态字段', () => {
    const payload = '{"meta":{"schemaVersion":' + SAVE_SCHEMA_VERSION + ',"slotId":1},"data":{"credits":2468,"currentSystem":"sol_prime","unknownField":"should_drop","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}}';

    const result = Save.importSave(1, payload);
    expect(result.ok).toBe(true);

    const loaded = Save.loadGame(1);
    expect(loaded.ok).toBe(true);
    expect(loaded.state.credits).toBe(2468);
    expect(loaded.state.unknownField).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(loaded.state, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(loaded.state, 'constructor')).toBe(false);
    expect({}.polluted).toBeUndefined();
    Object.keys(loaded.state).forEach((key) => {
      expect(key === 'hoveredSystem' || Object.prototype.hasOwnProperty.call(SAVE_STATE_SCHEMA, key)).toBe(true);
    });
  });

  it('非法导入不会覆盖目标槽位里已有的有效存档', () => {
    const originalState = createTestState({ credits: 6789, day: 16 });
    Save.saveGame(1, originalState, { saveName: '原始存档' });

    const failed = Save.importSave(1, '{broken');
    expect(failed.ok).toBe(false);
    expect(failed.errorCode).toBe('SAVE_JSON_INVALID');

    const loaded = Save.loadGame(1);
    expect(loaded.ok).toBe(true);
    expect(loaded.state.credits).toBe(6789);
    expect(loaded.state.day).toBe(16);
  });
});

describe('Save.exportSave', () => {
  it('导出已保存的存档为 JSON 字符串', () => {
    const state = createTestState();
    Save.saveGame(1, state);
    const json = Save.exportSave(1);
    expect(typeof json).toBe('string');
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('空槽位返回 null', () => {
    const result = Save.exportSave(3);
    expect(result).toBeNull();
  });
});

describe('Save runtime field handling', () => {
  it('保存时不持久化 hoveredSystem，加载时恢复为 null', () => {
    const state = createTestState({ hoveredSystem: 'nova_station' });
    Save.saveGame(1, state);

    const raw = JSON.parse(globalThis.localStorage.getItem('startrader_save_1'));
    expect(raw.data.hoveredSystem).toBeUndefined();

    const loaded = Save.loadGame(1);
    expect(loaded.ok).toBe(true);
    expect(loaded.state.hoveredSystem).toBeNull();
  });
});

describe('Save.listSlots', () => {
  it('返回 4 个槽位', () => {
    const slots = Save.listSlots();
    expect(slots.length).toBe(4);
  });

  it('已保存的槽位非空', () => {
    const state = createTestState();
    Save.saveGame(0, state);
    const slots = Save.listSlots();
    expect(slots[0].isEmpty).toBe(false);
    expect(slots[1].isEmpty).toBe(true);
  });

  it('损坏槽位会标记为 isCorrupted', () => {
    globalThis.localStorage.setItem('startrader_save_3', '{bad json');
    const slots = Save.listSlots();
    expect(slots[3].isEmpty).toBe(false);
    expect(slots[3].isCorrupted).toBe(true);
    expect(slots[3].errorCode).toBe('SAVE_JSON_INVALID');
  });
});

describe('Save.deleteSlot', () => {
  it('删除后槽位变空', () => {
    const state = createTestState();
    Save.saveGame(1, state);
    Save.deleteSlot(1);
    const result = Save.loadGame(1);
    expect(result.ok).toBe(false);
  });
});

describe('Save schema v2→v3 migration', () => {
  it('旧 fleet 中船只缺少 mods 字段时自动补全', () => {
    const envelope = {
      meta: { schemaVersion: 2, gameVersion: '0.2.0', slotId: 1, timestampMs: Date.now() },
      data: {
        credits: 5000, day: 20, currentSystem: 'sol_prime',
        fleet: [
          { typeId: 'shuttle', cargo: {}, upgrades: [], fuel: 100 },
          { typeId: 'freighter', cargo: {}, upgrades: [], fuel: 120 },
        ],
        activeShipIndex: 0,
      },
    };
    globalThis.localStorage.setItem('startrader_save_1', JSON.stringify(envelope));

    const result = Save.loadGame(1);
    expect(result.ok).toBe(true);

    // 加载后 schema 应升级到当前版本
    const stored = JSON.parse(globalThis.localStorage.getItem('startrader_save_1'));
    expect(stored.meta.schemaVersion).toBe(SAVE_SCHEMA_VERSION);

    // 每艘船应有 mods 数组
    result.state.fleet.forEach(ship => {
      expect(Array.isArray(ship.mods)).toBe(true);
    });
  });
});

describe('Save contract helpers', () => {
  it('createTestState 与运行时初始状态契约保持一致', () => {
    const state = createTestState();

    expect(state.hoveredSystem).toBeNull();
    expect(state.companyName).toBe('测试公司');
    expect(Array.isArray(state.quests)).toBe(true);
    expect(Array.isArray(state.fleet)).toBe(true);
    expect(state.economyCycle).toBeNull();
  });

  it('createSaveMeta 使用统一契约生成槽位摘要', () => {
    const meta = createSaveMeta(2, createTestState({ credits: 2468, day: 12 }), {
      saveName: '契约测试档',
      timestampMs: 123456789,
    });

    expect(meta.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(meta.slotId).toBe(2);
    expect(meta.saveName).toBe('契约测试档');
    expect(meta.timestampMs).toBe(123456789);
    expect(meta.credits).toBe(2468);
    expect(meta.day).toBe(12);
    expect(meta.isAutosave).toBe(false);
  });
});
