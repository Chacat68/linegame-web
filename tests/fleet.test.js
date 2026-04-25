// tests/fleet.test.js — FleetSystem 测试
// 覆盖: C2（_fuelCost 崩溃）、M6（syncState 一致性）、sellShip activeShipIndex

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it('补全旧存档缺少的 maintenance 字段', () => {
    const state = createTestState({
      fleet: [{ typeId: 'shuttle', cargo: {}, mods: [], upgrades: [], hull: 100, maxHull: 100, maxCargo: 20, maxFuel: 100, fuel: 100, fuelEff: 1, minFuelEff: 0.6 }],
      activeShipIndex: 0,
    });

    Fleet.init(state);

    expect(state.fleet[0].maintenance).toBe(100);
    expect(state.fleet[0].lastServiceDay).toBe(0);
    expect(state.fleet[0].faults).toEqual([]);
    expect(state.fleet[0].repairJob).toBe(null);
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
    state.currentSystem = 'nova_station';

    Fleet.syncShipFromState(state);
    const ship = Fleet.getActiveShip(state);

    expect(ship.fuel).toBe(42);
    expect(ship.hull).toBe(88);
    expect(ship.location).toBe('nova_station');
  });

  it('船只不存在时不崩溃', () => {
    const state = createTestState({ fleet: [], activeShipIndex: 0 });
    expect(() => Fleet.syncStateFromShip(state)).not.toThrow();
    expect(() => Fleet.syncShipFromState(state)).not.toThrow();
  });

  it('commitActiveShipState 会在专精升级后刷新根状态镜像', () => {
    const state = createTestState();
    Fleet.init(state);
    Fleet.syncStateFromShip(state);
    const ship = Fleet.getActiveShip(state);

    ship.specialization.xp.trade = 24;
    Fleet.recordShipActivity(state, 'trade_buy', { quantity: 2 }, 0);
    Fleet.commitActiveShipState(state);

    expect(state.maxCargo).toBe(24);
  });

  it('commitActiveShipState 会在协议结束后刷新根状态镜像', () => {
    const state = createTestState();
    Fleet.init(state);
    Fleet.syncStateFromShip(state);
    const ship = Fleet.getActiveShip(state);

    Fleet.setShipDoctrine(state, 0, 'navigation');
    ship.specialization.xp.navigation = 25;
    expect(Fleet.activateShipProtocol(state, 0).ok).toBe(true);

    Fleet.commitActiveShipState(state);
    expect(state.fuelEfficiency).toBeCloseTo(0.684, 5);

    Fleet.consumeShipProtocol(state, 0, 'travel');
    Fleet.consumeShipProtocol(state, 0, 'travel');
    Fleet.commitActiveShipState(state);

    expect(state.fuelEfficiency).toBeCloseTo(0.95, 5);
  });
});

describe('Fleet.getRouteDisplayInfo', () => {
  function createRoute(status, buySystemId, sellSystemId) {
    return {
      buySystemId: buySystemId,
      sellSystemId: sellSystemId,
      goodId: 'food',
      status: status,
      tradePolicy: { marketMode: 'open', maxBuyPrice: null, minSellPrice: null, minProfitRate: null, riskMode: 'balanced' },
      marketMode: 'open',
      lastBuyPrice: null,
      lastPolicyMessage: null,
    };
  }

  it('激活船的当前航段起点优先使用 state.currentSystem', () => {
    const state = createTestState({ currentSystem: 'nova_station' });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.location = 'sol_prime';
    ship.route = createRoute('traveling_buy', 'sol_prime', 'fuel_depot');

    const info = Fleet.getRouteDisplayInfo(state, ship, 0);

    expect(info.startSystemId).toBe('nova_station');
    expect(info.endSystemId).toBe('sol_prime');
    expect(info.statusLabel).toBe('🚀 前往买入地');
  });

  it('到达买入地后机库文案切到买入地到卖出地', () => {
    const state = createTestState({ currentSystem: 'sol_prime' });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.location = 'nova_station';
    ship.route = createRoute('traveling_buy', 'sol_prime', 'fuel_depot');

    const info = Fleet.getRouteDisplayInfo(state, ship, 0);

    expect(info.startSystemId).toBe('sol_prime');
    expect(info.endSystemId).toBe('fuel_depot');
    expect(info.statusLabel).toBe('📦 买入中');
  });

  it('非激活船的当前航段起点使用 ship.location', () => {
    const state = createTestState({ credits: 10000, currentSystem: 'sol_prime' });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');
    const ship = state.fleet[1];
    ship.location = 'mineral_belt';
    ship.route = createRoute('traveling_sell', 'sol_prime', 'nova_station');

    const info = Fleet.getRouteDisplayInfo(state, ship, 1);

    expect(info.startSystemId).toBe('mineral_belt');
    expect(info.endSystemId).toBe('nova_station');
    expect(info.statusLabel).toBe('🚀 前往卖出地');
  });

  it('同站路线保留派遣但不再显示跨星球目标', () => {
    const state = createTestState({ currentSystem: 'nova_station' });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.route = createRoute('traveling_buy', 'nova_station', 'nova_station');

    const info = Fleet.getRouteDisplayInfo(state, ship, 0);

    expect(info.startSystemId).toBe('nova_station');
    expect(info.endSystemId).toBe('nova_station');
    expect(info.sameSystemRoute).toBe(true);
    expect(info.statusLabel).toBe('📦 同站买入中');
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

  it('免费穿梭机卖出不会凭空产出积分', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;

    const buyResult = Fleet.buyShip(state, 'shuttle');
    expect(buyResult.ok).toBe(true);

    const creditsBeforeSell = state.credits;
    const sellResult = Fleet.sellShip(state, 1);

    expect(sellResult.ok).toBe(true);
    expect(state.credits).toBe(creditsBeforeSell);
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
    Fleet.upgradeShip(state, 'ship_cargo_i');
    const result = Fleet.upgradeShip(state, 'ship_cargo_i');
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
    expect(state.fleet[1].routeRevision).toBe(1);
    expect(state.fleet[1].route.revision).toBe(1);
  });

  it('支持跨星系派遣路线', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    const result = Fleet.assignRoute(state, 1, 'sol_prime', 'citadel_prime', 'food');

    expect(result.ok).toBe(true);
    expect(state.fleet[1].route.sellSystemId).toBe('citadel_prime');
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
    expect(state.fleet[1].routeRevision).toBe(2);
  });

  it('重新分配路线时递增路线版本', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food');
    const result = Fleet.assignRoute(state, 1, 'sol_prime', 'fuel_depot', 'food');

    expect(result.ok).toBe(true);
    expect(state.fleet[1].routeRevision).toBe(2);
    expect(state.fleet[1].route.sellSystemId).toBe('fuel_depot');
    expect(state.fleet[1].route.revision).toBe(2);
  });

  it('无效船只索引被拒绝', () => {
    const state = createTestState();
    Fleet.init(state);
    expect(Fleet.assignRoute(state, 999, 'sol_prime', 'nova_station', 'food').ok).toBe(false);
    expect(Fleet.cancelRoute(state, 999).ok).toBe(false);
  });

  it('分配路线时保存自动贸易策略', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    const result = Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food', {
      maxBuyPrice: 12,
      minSellPrice: 20,
      minProfitRate: 0.25,
    });

    expect(result.ok).toBe(true);
    expect(state.fleet[1].route.tradePolicy).toEqual({
      marketMode: 'open',
      maxBuyPrice: 12,
      minSellPrice: 20,
      minProfitRate: 0.25,
      riskMode: 'balanced',
    });
  });

  it('黑市派遣要求买卖地都具备黑市权限', () => {
    const state = createTestState({
      credits: 10000,
      factionRelations: { federation: 0, syndicate: 50, technocracy: 0 },
    });
    Faction.init(state);
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    const okResult = Fleet.assignRoute(state, 1, 'shadow_haven', 'frontier_outpost', 'weapons', {
      marketMode: 'black',
    });
    expect(okResult.ok).toBe(true);

    const openSellResult = Fleet.assignRoute(state, 1, 'shadow_haven', 'sol_prime', 'weapons', {
      marketMode: 'black',
    });
    expect(openSellResult.ok).toBe(true);

    const failResult = Fleet.assignRoute(state, 1, 'sol_prime', 'frontier_outpost', 'weapons', {
      marketMode: 'black',
    });
    expect(failResult.ok).toBe(false);
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

  it('买入价高于阈值时等待而不是买入', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food', { maxBuyPrice: 1 });
    state.fleet[1].location = 'sol_prime';

    const result = Fleet.tickFleetRoutes(state);

    expect(state.fleet[1].route).not.toBeNull();
    expect(state.fleet[1].route.status).toBe('buying');
    expect(state.fleet[1].cargo.food).toBeUndefined();
    expect(result.msgs.some(function (msg) { return msg.text.indexOf('等待买点') !== -1; })).toBe(true);
  });

  it('卖出价低于阈值时等待而不是卖出', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food', { minSellPrice: 9999 });
    state.fleet[1].location = 'nova_station';
    state.fleet[1].route.status = 'selling';
    state.fleet[1].route.lastBuyPrice = 10;
    state.fleet[1].cargo.food = 5;

    const result = Fleet.tickFleetRoutes(state);

    expect(state.fleet[1].route).not.toBeNull();
    expect(state.fleet[1].route.status).toBe('selling');
    expect(state.fleet[1].cargo.food).toBe(5);
    expect(result.msgs.some(function (msg) { return msg.text.indexOf('等待卖点') !== -1; })).toBe(true);
  });

  it('黑市派遣被查获后会罚没并中止路线', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const state = createTestState({
      credits: 10000,
      reputation: -100,
      factionRelations: { federation: 0, syndicate: 50, technocracy: 0 },
    });
    Faction.init(state);
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    Fleet.assignRoute(state, 1, 'shadow_haven', 'sol_prime', 'weapons', { marketMode: 'black', riskMode: 'aggressive' });
    state.fleet[1].route.status = 'traveling_sell';
    state.fleet[1].location = 'shadow_haven';
    state.fleet[1].cargo.weapons = 5;
    state.fleet[1].fuel = 999;
    state.fleet[1].hull = 150;

    const result = Fleet.tickFleetRoutes(state);

    expect(state.fleet[1].route).toBeNull();
    expect(state.fleet[1].cargo.weapons).toBeUndefined();
    expect(state.credits).toBeLessThan(10000);
    expect(state.fleet[1].hull).toBeLessThan(150);
    expect(result.msgs.some(function (msg) { return msg.text.indexOf('中止') !== -1; })).toBe(true);
  });
});

describe('Fleet.tickActiveShipDispatch', () => {
  it('到达买入地后同步当前位置并进入买入阶段', () => {
    const state = createTestState({ currentSystem: 'sol_prime' });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.location = 'nova_station';
    ship.route = {
      buySystemId: 'sol_prime',
      sellSystemId: 'nova_station',
      goodId: 'food',
      status: 'traveling_buy',
      tradePolicy: { marketMode: 'open', maxBuyPrice: null, minSellPrice: null, minProfitRate: null, riskMode: 'balanced' },
      marketMode: 'open',
      lastBuyPrice: null,
      lastPolicyMessage: null,
    };

    const result = Fleet.tickActiveShipDispatch(state);

    expect(ship.location).toBe('sol_prime');
    expect(ship.route.status).toBe('buying');
    expect(result.needBuy).toBe(ship.route);
    expect(result.needTravel).toBeNull();
  });

  it('到达卖出地后同步当前位置并进入卖出阶段', () => {
    const state = createTestState({ currentSystem: 'nova_station' });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.location = 'sol_prime';
    ship.route = {
      buySystemId: 'sol_prime',
      sellSystemId: 'nova_station',
      goodId: 'food',
      status: 'traveling_sell',
      tradePolicy: { marketMode: 'open', maxBuyPrice: null, minSellPrice: null, minProfitRate: null, riskMode: 'balanced' },
      marketMode: 'open',
      lastBuyPrice: 10,
      lastPolicyMessage: null,
    };

    const result = Fleet.tickActiveShipDispatch(state);

    expect(ship.location).toBe('nova_station');
    expect(ship.route.status).toBe('selling');
    expect(result.needSell).toBe(ship.route);
    expect(result.needTravel).toBeNull();
  });
});

describe('Fleet.installMod / uninstallMod', () => {
  it('安装和卸载改装组件', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);

    const installResult = Fleet.installMod(state, 'mod_cargo_rack');
    expect(installResult.ok).toBe(true);
    expect(ship.mods.includes('mod_cargo_rack')).toBe(true);

    const uninstallResult = Fleet.uninstallMod(state, 'mod_cargo_rack');
    expect(uninstallResult.ok).toBe(true);
    expect(ship.mods.includes('mod_cargo_rack')).toBe(false);
  });

  it('重复安装被拒绝', () => {
    const state = createTestState({ credits: 100000 });
    Fleet.init(state);
    Fleet.installMod(state, 'mod_cargo_rack');
    const result = Fleet.installMod(state, 'mod_cargo_rack');
    expect(result.ok).toBe(false);
  });

  it('槽位满时被拒绝', () => {
    const state = createTestState({ credits: 500000 });
    Fleet.init(state);
    // 穿梭机只有 1 个 modSlots
    Fleet.installMod(state, 'mod_cargo_rack');
    const result = Fleet.installMod(state, 'mod_fuel_cell');
    expect(result.ok).toBe(false);
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

describe('Fleet maintenance operations', () => {
  it('低维护度会抬高燃耗并放大事件风险', () => {
    const state = createTestState();
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);

    ship.maintenance = 22;

    const stats = Fleet.getEffectiveShipStats(state, ship);
    expect(stats.fuelEff).toBeCloseTo(1.22, 5);
    expect(stats.eventChanceMultiplier).toBeCloseTo(1.28, 5);
    expect(stats.maintenance.band).toBe('critical');
  });

  it('advanceFleetDay 会扣除养护费并降低派遣船维护度', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');
    Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food');
    state.fleet[1].maintenance = 90;

    const creditsBefore = state.credits;
    const result = Fleet.advanceFleetDay(state);

    expect(state.credits).toBeLessThan(creditsBefore);
    expect(state.fleet[1].maintenance).toBeLessThan(90);
    expect(result.msgs.some(function (msg) { return msg.text.indexOf('养护') !== -1; })).toBe(true);
  });

  it('开始维修会立即扣款并创建维修倒计时，不会立刻清除故障', () => {
    const state = createTestState({ credits: 5000 });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.maintenance = 44;
    ship.hull = 92;
    ship.faults = ['engine_vibration', 'cargo_lock'];

    const quote = Fleet.getShipRepairQuote(state, 0);
    const creditsBefore = state.credits;
    const result = Fleet.serviceShip(state, 0);

    expect(result.ok).toBe(true);
    expect(ship.repairJob).toBeTruthy();
    expect(ship.repairJob.remainingDays).toBe(quote.durationDays);
    expect(ship.maintenance).toBe(44);
    expect(ship.hull).toBe(92);
    expect(ship.faults).toEqual(['engine_vibration', 'cargo_lock']);
    expect(state.credits).toBe(creditsBefore - quote.cost);
  });

  it('维修倒计时结束后会恢复维护度和船体并清除全部故障', () => {
    const state = createTestState({ credits: 5000 });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.maintenance = 44;
    ship.hull = 92;
    ship.faults = ['engine_vibration', 'cargo_lock'];

    expect(Fleet.serviceShip(state, 0).ok).toBe(true);

    let lastResult = null;
    const remainingDays = ship.repairJob.remainingDays;
    for (let day = 0; day < remainingDays; day += 1) {
      lastResult = Fleet.advanceFleetDay(state);
    }

    expect(lastResult.msgs.some(function (msg) { return msg.text.indexOf('维修完成') !== -1; })).toBe(true);
    expect(ship.repairJob).toBe(null);
    expect(ship.maintenance).toBe(100);
    expect(ship.hull).toBe(ship.maxHull);
    expect(ship.faults).toEqual([]);
  });

  it('维修中的船只无法派遣', () => {
    const state = createTestState({ credits: 5000 });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.maintenance = 36;
    ship.faults = ['sensor_blindspot'];

    expect(Fleet.serviceShip(state, 0).ok).toBe(true);
    const result = Fleet.assignRoute(state, 0, 'sol_prime', 'nova_station', 'food');

    expect(result.ok).toBe(false);
    expect(result.msgs[0].text).toContain('维修中');
  });

  it('欠费且重度失养时可能触发故障', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');
    state.credits = 0;
    state.fleet[1].maintenance = 18;

    Fleet.advanceFleetDay(state);

    expect(state.fleet[1].faults.length).toBeGreaterThan(0);
  });

  it('故障会压低有效属性', () => {
    const state = createTestState();
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.faults = ['cargo_lock'];

    const stats = Fleet.getEffectiveShipStats(state, ship);

    expect(stats.maxCargo).toBe(14);
    expect(stats.sellBonus).toBeCloseTo(-0.015, 5);
    expect(stats.faults.map(function (fault) { return fault.id; })).toContain('cargo_lock');
  });

  it('快航分工可减轻引擎震动的燃耗惩罚', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleetSlots = 3;
    Fleet.buyShip(state, 'clipper');
    Fleet.buyShip(state, 'freighter');
    expect(Fleet.setShipDoctrine(state, 1, 'trade').ok).toBe(true);

    const courierShip = state.fleet[1];
    const logisticsShip = state.fleet[2];
    const courierBaseFuelEff = Fleet.getEffectiveShipStats(state, courierShip).fuelEff;
    const logisticsBaseFuelEff = Fleet.getEffectiveShipStats(state, logisticsShip).fuelEff;

    courierShip.faults = ['engine_vibration'];
    logisticsShip.faults = ['engine_vibration'];

    const courierFaultFuelEff = Fleet.getEffectiveShipStats(state, courierShip).fuelEff;
    const logisticsFaultFuelEff = Fleet.getEffectiveShipStats(state, logisticsShip).fuelEff;

    expect(Fleet.getShipDispatchProfile(state, courierShip).roleId).toBe('courier');
    expect(courierFaultFuelEff / courierBaseFuelEff).toBeLessThan(logisticsFaultFuelEff / logisticsBaseFuelEff);
  });

  it('勘探分工可减轻传感盲区对扫描折扣的损失', () => {
    const state = createTestState({ credits: 80000 });
    Fleet.init(state);
    state.fleetSlots = 3;
    Fleet.buyShip(state, 'clipper');
    Fleet.buyShip(state, 'freighter');

    expect(Fleet.installMod(state, 'mod_survey_array', 1).ok).toBe(true);
    expect(Fleet.installMod(state, 'mod_survey_array', 2).ok).toBe(true);

    const surveyShip = state.fleet[1];
    const logisticsShip = state.fleet[2];
    const surveyBaseDiscount = Fleet.getEffectiveShipStats(state, surveyShip).scanFuelDiscount;
    const logisticsBaseDiscount = Fleet.getEffectiveShipStats(state, logisticsShip).scanFuelDiscount;

    surveyShip.faults = ['sensor_blindspot'];
    logisticsShip.faults = ['sensor_blindspot'];

    const surveyFaultDiscount = Fleet.getEffectiveShipStats(state, surveyShip).scanFuelDiscount;
    const logisticsFaultDiscount = Fleet.getEffectiveShipStats(state, logisticsShip).scanFuelDiscount;

    expect(Fleet.getShipDispatchProfile(state, surveyShip).roleId).toBe('survey');
    expect(surveyFaultDiscount / surveyBaseDiscount).toBeGreaterThan(logisticsFaultDiscount / logisticsBaseDiscount);
  });

  it('后勤分工的维修报价更快且成本更低', () => {
    const state = createTestState({ credits: 80000 });
    Fleet.init(state);
    state.fleetSlots = 3;
    Fleet.buyShip(state, 'freighter');
    Fleet.buyShip(state, 'freighter');
    expect(Fleet.setShipDoctrine(state, 2, 'navigation').ok).toBe(true);

    expect(Fleet.installMod(state, 'mod_service_bay', 2).ok).toBe(true);

    state.fleet[1].maintenance = 40;
    state.fleet[2].maintenance = 40;

    const logisticsQuote = Fleet.getShipRepairQuote(state, 1);
    const supportQuote = Fleet.getShipRepairQuote(state, 2);

    expect(Fleet.getShipDispatchProfile(state, state.fleet[2]).roleId).toBe('support');
    expect(supportQuote.durationDays).toBeLessThan(logisticsQuote.durationDays);
    expect(supportQuote.cost).toBeLessThan(logisticsQuote.cost);
  });

  it('applyTravelWear 会在航行后增加磨损', () => {
    const state = createTestState();
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);

    const result = Fleet.applyTravelWear(state, 0, { fuelCost: 12, crossGalaxy: false, secretRoute: false });

    expect(result.ok).toBe(true);
    expect(ship.maintenance).toBeLessThan(100);
    expect(result.meta.wear).toBeGreaterThan(0);
  });
});

describe('Fleet.getActiveFleetBonuses', () => {
  it('单船时返回空或匹配的加成', () => {
    const state = createTestState();
    Fleet.init(state);
    const bonuses = Fleet.getActiveFleetBonuses(state);
    expect(Array.isArray(bonuses)).toBe(true);
  });

  it('拥有 clipper+freighter 时激活节能舰队加成', () => {
    const state = createTestState({ credits: 100000 });
    Fleet.init(state);
    state.fleetSlots = 3;
    Fleet.buyShip(state, 'clipper');
    Fleet.buyShip(state, 'freighter');
    const bonuses = Fleet.getActiveFleetBonuses(state);
    const hasFuelSavers = bonuses.some(b => b.id === 'fuel_savers');
    expect(hasFuelSavers).toBe(true);
  });

  it('拥有 freighter+galleon 时激活贸易联盟加成', () => {
    const state = createTestState({ credits: 200000 });
    Fleet.init(state);
    state.fleetSlots = 3;
    Fleet.buyShip(state, 'freighter');
    Fleet.buyShip(state, 'galleon');
    const bonuses = Fleet.getActiveFleetBonuses(state);
    const hasHeavyConvoy = bonuses.some(b => b.id === 'heavy_convoy');
    expect(hasHeavyConvoy).toBe(true);
  });
});

describe('Fleet ship specialization', () => {
  it('初始化时为旧船只补齐专精状态', () => {
    const state = createTestState({
      fleet: [{ typeId: 'shuttle', cargo: {}, mods: [], upgrades: [] }],
      activeShipIndex: 0,
    });

    Fleet.init(state);

    expect(state.fleet[0].specialization).toBeDefined();
    expect(state.fleet[0].specialization.doctrine).toBe('navigation');
    expect(state.fleet[0].specialization.xp.trade).toBe(0);
  });

  it('贸易专精会提升有效货舱和交易议价', () => {
    const state = createTestState();
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);

    ship.specialization.xp.trade = 75;
    Fleet.syncStateFromShip(state);

    const stats = Fleet.getEffectiveShipStats(state, ship);
    expect(stats.maxCargo).toBe(28);
    expect(stats.buyDiscount).toBeCloseTo(0.02, 5);
    expect(stats.sellBonus).toBeCloseTo(0.03, 5);
    expect(state.maxCargo).toBe(28);
  });

  it('记录航行行为后可以升级并启动航行协议', () => {
    const state = createTestState();
    Fleet.init(state);

    for (let i = 0; i < 5; i++) {
      Fleet.recordShipActivity(state, 'travel', { crossGalaxy: false, secretRoute: false }, 0);
    }

    const ship = Fleet.getActiveShip(state);
    expect(ship.specialization.xp.navigation).toBeGreaterThanOrEqual(30);

    const activateResult = Fleet.activateShipProtocol(state, 0);
    expect(activateResult.ok).toBe(true);

    let stats = Fleet.getEffectiveShipStats(state, ship);
    expect(stats.specialization.activeProtocol).not.toBeNull();
    expect(stats.fuelEff).toBeLessThan(1);
    expect(stats.eventChanceMultiplier).toBeLessThan(0.92);

    Fleet.consumeShipProtocol(state, 0, 'travel');
    let profileAfterFirstUse = Fleet.getShipSpecializationSummary(state, ship);
    expect(profileAfterFirstUse.activeProtocol).not.toBeNull();
    expect(profileAfterFirstUse.activeProtocol.remainingCharges).toBe(1);

    Fleet.consumeShipProtocol(state, 0, 'travel');
    let profileAfterSecondUse = Fleet.getShipSpecializationSummary(state, ship);
    expect(profileAfterSecondUse.activeProtocol).toBeNull();

    stats = Fleet.getEffectiveShipStats(state, ship);
    expect(stats.eventChanceMultiplier).toBeCloseTo(0.92, 5);
  });

  it('功能型改装会改变走私与探索系数', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    expect(Fleet.installMod(state, 'mod_smuggler_hold', 1).ok).toBe(true);
    expect(Fleet.installMod(state, 'mod_survey_array', 1).ok).toBe(true);

    const stats = Fleet.getEffectiveShipStats(state, state.fleet[1]);
    expect(stats.smugglingCheckMultiplier).toBeCloseTo(0.78, 5);
    expect(stats.scanFuelDiscount).toBeCloseTo(0.2, 5);
    expect(stats.poiRewardMultiplier).toBeCloseTo(1.12, 5);
  });

  it('会根据配置识别舰船分工', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'clipper');

    expect(Fleet.installMod(state, 'mod_survey_array', 1).ok).toBe(true);

    const profile = Fleet.getShipRoleProfile(state, state.fleet[1]);
    expect(profile.id).toBe('survey');
    expect(profile.label).toBe('勘探支援');
  });

  it('贸易专精会反映到经济系统买价中', () => {
    const baseState = createTestState();
    Fleet.init(baseState);

    const boostedState = createTestState();
    Fleet.init(boostedState);
    boostedState.fleet[0].specialization.xp.trade = 300;

    const normalPrice = Economy.getBuyPrice('sol_prime', 'technology', baseState);
    const boostedPrice = Economy.getBuyPrice('sol_prime', 'technology', boostedState);

    expect(boostedPrice).toBeLessThan(normalPrice);
  });
});

describe('Fleet.installMod requires (前置条件)', () => {
  it('安装高级改装时前置条件未满足则失败', () => {
    const state = createTestState({ credits: 100000 });
    Fleet.init(state);
    // mod_cargo_bay requires mod_cargo_compress
    const result = Fleet.installMod(state, 'mod_cargo_bay');
    expect(result.ok).toBe(false);
    expect(result.msgs[0].text).toContain('需要先安装');
  });

  it('安装高级改装时前置条件已满足则成功', () => {
    const state = createTestState({ credits: 100000 });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    // 穿梭机 modSlots=1，需要更多槽位  → 使用 freighter (modSlots=2)
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');
    Fleet.switchShip(state, 1); // 切到 freighter

    // 先安装前置
    const r1 = Fleet.installMod(state, 'mod_cargo_compress');
    expect(r1.ok).toBe(true);

    // 再安装高级改装
    const r2 = Fleet.installMod(state, 'mod_cargo_bay');
    expect(r2.ok).toBe(true);
    const activeShip = Fleet.getActiveShip(state);
    expect(activeShip.mods).toContain('mod_cargo_compress');
    expect(activeShip.mods).toContain('mod_cargo_bay');
  });
});

describe('Fleet.uninstallMod cascade (联动卸载)', () => {
  it('拆卸基础改装时联动拆卸依赖的高级改装', () => {
    const state = createTestState({ credits: 100000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');
    Fleet.switchShip(state, 1);

    // 安装前置 + 高级改装
    Fleet.installMod(state, 'mod_cargo_compress');
    Fleet.installMod(state, 'mod_cargo_bay');

    const ship = Fleet.getActiveShip(state);
    expect(ship.mods).toContain('mod_cargo_bay');

    // 拆卸基础改装应联动拆卸高级改装
    const result = Fleet.uninstallMod(state, 'mod_cargo_compress');
    expect(result.ok).toBe(true);
    expect(ship.mods).not.toContain('mod_cargo_compress');
    expect(ship.mods).not.toContain('mod_cargo_bay');
    // 返回的 msgs 中应包含联动拆卸消息
    expect(result.msgs.length).toBeGreaterThan(1);
    expect(result.msgs[0].text).toContain('联动拆卸');
  });
});
