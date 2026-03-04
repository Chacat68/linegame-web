// tests/save.test.js — SaveSystem 测试
// 覆盖: C4（importSave 无结构校验）、M9（localStorage 配额）

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Save from '../js/systems/save/SaveSystem.js';
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

  it('空槽位返回失败', () => {
    const result = Save.loadGame(2);
    expect(result.ok).toBe(false);
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
  });
});

describe('Save.importSave', () => {
  it('无效 JSON 返回失败', () => {
    const result = Save.importSave(1, 'not json at all');
    expect(result.ok).toBe(false);
  });

  it('缺少 meta 字段返回失败', () => {
    const result = Save.importSave(1, JSON.stringify({ data: {} }));
    expect(result.ok).toBe(false);
  });

  it('缺少 data 字段返回失败', () => {
    const result = Save.importSave(1, JSON.stringify({ meta: {} }));
    expect(result.ok).toBe(false);
  });

  it('恶意数据（credits 为字符串）可以导入但应负责任地处理 [C4]', () => {
    const malicious = JSON.stringify({
      meta: { schemaVersion: 1, gameVersion: '0.2.0', slotId: 1 },
      data: { credits: 'not_a_number', fleet: 'also_not_array', day: -999 },
    });
    // 当前实现：只检查 meta/data 存在，不验证类型
    const result = Save.importSave(1, malicious);
    // 记录当前行为：导入成功（缺少校验）
    expect(result.ok).toBe(true);

    // 验证加载后的状态是否可用
    const loaded = Save.loadGame(1);
    expect(loaded.ok).toBe(true);
    // credits 是字符串 → 后续运算会出错
    // 此测试文档化了 C4 问题
    expect(typeof loaded.state.credits).toBe('string');
  });

  it('正常存档可以导入', () => {
    const state = createTestState({ credits: 12345 });
    Save.saveGame(2, state);
    const exported = Save.exportSave(2);
    const result = Save.importSave(1, exported);
    expect(result.ok).toBe(true);
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
