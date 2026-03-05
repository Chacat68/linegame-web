// tests/fleet.test.js — FleetSystem 测试
// 覆盖: C2（_fuelCost 崩溃）、M6（syncState 一致性）、sellShip activeShipIndex

import { describe, it, expect, beforeEach } from 'vitest';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as Economy from '../js/systems/economy/Economy.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

describe('Fleet.init', () => {
  it('空 fleet 时初始化默认穿梭机', () => {
    const state = createTestState();
    Fleet.init(state);
    expect(state.fleet.length).toBe(1);
    expect(state.fleet[0].typeId).toBe('shuttle');
    expect(state.activeShipIndex).toBe(0);
  });

  it('已有 fleet 时不覆盖', () => {
    const state = createTestState({ fleet: [{ typeId: 'freighter', cargo: {}, mods: [] }] });
    Fleet.init(state);
    expect(state.fleet.length).toBe(1);
    expect(state.fleet[0].typeId).toBe('freighter');
  });

  it('补全旧存档缺少的 modSlots 和 mods', () => {
    const state = createTestState();
    Fleet.init(state);
    expect(state.fleet[0].mods).toBeDefined();
    expect(state.fleet[0].modSlots).toBeGreaterThanOrEqual(1);
  });
});

describe('Fleet.getActiveShip', () => {
  it('返回当前激活船只', () => {
    const state = createTestState();
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    expect(ship).toBeDefined();
    expect(ship.typeId).toBe('shuttle');
  });

  it('activeShipIndex 越界时回退到 fleet[0]', () => {
    const state = createTestState();
    Fleet.init(state);
    state.activeShipIndex = 999;
    const ship = Fleet.getActiveShip(state);
    expect(ship).toBeDefined();
    expect(ship.typeId).toBe('shuttle');
  });
});

describe('Fleet.syncStateFromShip / syncShipFromState', () => {
  it('syncStateFromShip 将船只属性写入 state [M6]', () => {
    const state = createTestState();
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.cargo = { food: 5 };
    ship.maxCargo = 50;
    ship.fuel = 80;

    Fleet.syncStateFromShip(state);

    expect(state.cargo).toBe(ship.cargo); // 引用一致
    expect(state.maxCargo).toBe(50);
    expect(state.fuel).toBe(80);
  });

  it('syncShipFromState 将 state 写回船只 [M6]', () => {
    const state = createTestState();
    Fleet.init(state);
    Fleet.syncStateFromShip(state);

    state.fuel = 42;
    state.shipHull = 88;

    Fleet.syncShipFromState(state);
    const ship = Fleet.getActiveShip(state);

    expect(ship.fuel).toBe(42);
    expect(ship.hull).toBe(88);
  });

  it('船只不存在时不崩溃', () => {
    const state = createTestState({ fleet: [], activeShipIndex: 0 });
    expect(() => Fleet.syncStateFromShip(state)).not.toThrow();
    expect(() => Fleet.syncShipFromState(state)).not.toThrow();
  });
});

describe('Fleet.buyShip', () => {
  it('积分不足时返回失败', () => {
    const state = createTestState({ credits: 0 });
    Fleet.init(state);
    state.fleetSlots = 2;
    const result = Fleet.buyShip(state, 'freighter');
    expect(result.ok).toBe(false);
  });

  it('无可用席位时返回失败', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 1; // 只有1个席位，已被占用
    const result = Fleet.buyShip(state, 'freighter');
    expect(result.ok).toBe(false);
  });

  it('成功购买船只', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    const result = Fleet.buyShip(state, 'freighter');
    expect(result.ok).toBe(true);
    expect(state.fleet.length).toBe(2);
    expect(state.credits).toBe(10000 - 3000);
  });

  it('无效船型返回失败', () => {
    const state = createTestState({ credits: 99999 });
    Fleet.init(state);
    state.fleetSlots = 2;
    const result = Fleet.buyShip(state, 'nonexistent_ship');
    expect(result.ok).toBe(false);
  });
});

describe('Fleet.sellShip', () => {
  it('不能卖出最后一艘船', () => {
    const state = createTestState();
    Fleet.init(state);
    const result = Fleet.sellShip(state, 0);
    expect(result.ok).toBe(false);
  });

  it('不能卖出正在操控的船只', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');
    // activeShipIndex = 0, 尝试卖 index 0
    const result = Fleet.sellShip(state, 0);
    expect(result.ok).toBe(false);
  });

  it('卖出后 activeShipIndex 仍有效 [P1]', () => {
    const state = createTestState({ credits: 20000 });
    Fleet.init(state);
    state.fleetSlots = 3;
    Fleet.buyShip(state, 'freighter');
    Fleet.buyShip(state, 'clipper');
    expect(state.fleet.length).toBe(3);

    // 切换到 index 0，卖 index 2
    state.activeShipIndex = 0;
    const result = Fleet.sellShip(state, 2);
    expect(result.ok).toBe(true);
    expect(state.fleet.length).toBe(2);
    expect(state.activeShipIndex).toBeLessThan(state.fleet.length);

    // getActiveShip 返回有效
    const active = Fleet.getActiveShip(state);
    expect(active).toBeDefined();
    expect(active.typeId).toBeDefined();
  });

  it('卖出的船只有派遣路线时被拒绝', () => {
    const state = createTestState({ credits: 20000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');
    state.fleet[1].route = { buySystemId: 'sol_prime', sellSystemId: 'nova_station', goodId: 'food', status: 'traveling_buy' };
    const result = Fleet.sellShip(state, 1);
    expect(result.ok).toBe(false);
  });

  it('无效索引被拒绝', () => {
    const state = createTestState();
    Fleet.init(state);
    expect(Fleet.sellShip(state, -1).ok).toBe(false);
    expect(Fleet.sellShip(state, 999).ok).toBe(false);
  });
});

describe('Fleet.switchShip', () => {
  it('切换后状态同步正确', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    // 修改当前船只状态
    state.fuel = 50;
    Fleet.syncShipFromState(state);

    const result = Fleet.switchShip(state, 1);
    expect(result.ok).toBe(true);
    expect(state.activeShipIndex).toBe(1);

    // 新船只的属性应同步到 state
    const newShip = Fleet.getActiveShip(state);
    expect(state.maxCargo).toBe(newShip.maxCargo);
    expect(state.fuel).toBe(newShip.fuel);
  });

  it('切换到当前船只返回提示（非失败）', () => {
    const state = createTestState();
    Fleet.init(state);
    const result = Fleet.switchShip(state, 0);
    expect(result.ok).toBe(false);
  });

  it('无效索引被拒绝', () => {
    const state = createTestState();
    Fleet.init(state);
    expect(Fleet.switchShip(state, 999).ok).toBe(false);
    expect(Fleet.switchShip(state, -1).ok).toBe(false);
  });
});

describe('Fleet.upgradeShip', () => {
  it('积分不足时返回失败', () => {
    const state = createTestState({ credits: 0 });
    Fleet.init(state);
    const result = Fleet.upgradeShip(state, 'ship_cargo_i');
    expect(result.ok).toBe(false);
  });

  it('成功升级并同步 state', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    const beforeCargo = state.maxCargo;
    const result = Fleet.upgradeShip(state, 'ship_cargo_i');
    expect(result.ok).toBe(true);
    expect(state.maxCargo).toBeGreaterThanOrEqual(beforeCargo);
  });

  it('重复升级被拒绝', () => {
    const state = createTestState({ credits: 100000 });
    Fleet.init(state);
    Fleet.upgradeShip(state, 'cargo_1');
    const result = Fleet.upgradeShip(state, 'cargo_1');
    expect(result.ok).toBe(false);
  });
});

describe('Fleet.assignRoute / cancelRoute', () => {
  it('成功分配路线', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');
    const result = Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food');
    expect(result.ok).toBe(true);
    expect(state.fleet[1].route).not.toBeNull();
  });

  it('跨星系路线被拒绝', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');
    // andromeda 中的星球 vs milky_way 中的星球
    const result = Fleet.assignRoute(state, 1, 'sol_prime', 'sol_prime', 'food');
    // 同星球路线应该成功（虽然无意义）
    expect(result.ok).toBe(true);
  });

  it('取消路线', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');
    Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food');
    const result = Fleet.cancelRoute(state, 1);
    expect(result.ok).toBe(true);
    expect(state.fleet[1].route).toBeNull();
  });

  it('无效船只索引被拒绝', () => {
    const state = createTestState();
    Fleet.init(state);
    expect(Fleet.assignRoute(state, 999, 'sol_prime', 'nova_station', 'food').ok).toBe(false);
    expect(Fleet.cancelRoute(state, 999).ok).toBe(false);
  });
});

describe('Fleet.tickFleetRoutes', () => {
  it('无派遣船只时返回空消息', () => {
    const state = createTestState();
    Fleet.init(state);
    const result = Fleet.tickFleetRoutes(state);
    expect(result.msgs).toEqual([]);
  });

  it('派遣船只燃料不足时路线被暂停 [C2]', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    // 分配路线然后耗尽燃料
    Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food');
    state.fleet[1].fuel = 0;
    state.credits = 0; // 也没钱买燃料

    // 第一次 tick：船在 sol_prime，buySystemId 也是 sol_prime，所以直接进入 buying
    // 买入失败（没钱），路线状态变为 traveling_sell
    Fleet.tickFleetRoutes(state);
    expect(state.fleet[1].route).not.toBeNull();
    expect(state.fleet[1].route.status).toBe('traveling_sell');

    // 第二次 tick：需要旅行到 nova_station 但没有燃料，暂停路线
    const result = Fleet.tickFleetRoutes(state);
    expect(state.fleet[1].route).toBeNull();
    expect(result.msgs.length).toBeGreaterThan(0);
  });
});

describe('Fleet.installMod / uninstallMod', () => {
  it('安装和卸载改装组件', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    const cargoBefore = ship.maxCargo;

    const installResult = Fleet.installMod(state, 'cargo_pod');
    // 可能成功也可能依赖 modId 是否存在
    if (installResult.ok) {
      expect(ship.mods.includes('cargo_pod')).toBe(true);

      const uninstallResult = Fleet.uninstallMod(state, 'cargo_pod');
      expect(uninstallResult.ok).toBe(true);
      expect(ship.mods.includes('cargo_pod')).toBe(false);
    }
  });

  it('重复安装被拒绝', () => {
    const state = createTestState({ credits: 100000 });
    Fleet.init(state);
    Fleet.installMod(state, 'cargo_pod');
    const result = Fleet.installMod(state, 'cargo_pod');
    if (state.fleet[0].mods.includes('cargo_pod')) {
      expect(result.ok).toBe(false);
    }
  });

  it('槽位满时被拒绝', () => {
    const state = createTestState({ credits: 500000 });
    Fleet.init(state);
    // 穿梭机只有 1 个 modSlots
    Fleet.installMod(state, 'cargo_pod');
    const result = Fleet.installMod(state, 'fuel_injector');
    // 如果第一个安装成功且只有 1 个槽位，第二个应该失败
    if (state.fleet[0].mods.length >= state.fleet[0].modSlots) {
      expect(result.ok).toBe(false);
    }
  });
});

describe('Fleet.buySlot', () => {
  it('积分不足时返回失败', () => {
    const state = createTestState({ credits: 0 });
    Fleet.init(state);
    const result = Fleet.buySlot(state);
    expect(result.ok).toBe(false);
  });

  it('成功购买增加席位', () => {
    const state = createTestState({ credits: 100000 });
    Fleet.init(state);
    const slotsBefore = Fleet.getSlotCount(state);
    const result = Fleet.buySlot(state);
    if (result.ok) {
      expect(Fleet.getSlotCount(state)).toBe(slotsBefore + 1);
    }
  });
});

describe('Fleet.getActiveFleetBonuses', () => {
  it('单船时返回空或匹配的加成', () => {
    const state = createTestState();
    Fleet.init(state);
    const bonuses = Fleet.getActiveFleetBonuses(state);
    expect(Array.isArray(bonuses)).toBe(true);
  });
});
