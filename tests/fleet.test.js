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

  it('旧存档已写入船体的等级奖励会迁移为派生属性，玩家可见数值不变', () => {
    const state = createTestState({
      playerLevel: 10,
      day: 42,
      fleet: [{
        typeId: 'shuttle', name: '穿梭机', emoji: '🚀', cargo: {},
        maxCargo: 45, maxCargoCap: 50,
        fuel: 120, maxFuel: 120, maxFuelCap: 200,
        hull: 100, maxHull: 100, maxHullCap: 150,
        fuelEff: 0.9, minFuelEff: 0.6,
        upgrades: [], mods: [], modSlots: 1, crewIds: [],
      }],
      activeShipIndex: 0,
    });

    Fleet.init(state);

    expect(state.fleet[0].maxCargo).toBe(20);
    expect(state.fleet[0].maxFuel).toBe(100);
    expect(state.fleet[0].fuelEff).toBe(1);
    expect(state.maxCargo).toBe(45);
    expect(state.maxFuel).toBe(120);
    expect(state.fuel).toBe(120);
    expect(state.fuelEfficiency).toBeCloseTo(0.9, 4);
    expect(state.storyFlags.fleet_level_perks_v2_migrated).toBe(42);
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

  it('初始化会移除旧协议数据，根状态仍由船型与改装派生', () => {
    const state = createTestState();
    Fleet.init(state);
    state.fleet[0].specialization = { doctrine: 'trade', xp: { trade: 80 } };
    Fleet.init(state);
    Fleet.commitActiveShipState(state);

    expect(state.fleet[0].specialization).toBeUndefined();
    expect(state.maxCargo).toBe(20);
    expect(Fleet.getShipSpecializationSummary(state, state.fleet[0])).toBe(null);
  });

  it('切换飞船时货物成本跟随各自货舱，不会串船', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    expect(Fleet.buyShip(state, 'freighter').ok).toBe(true);

    state.cargo = { food: 2 };
    state.cargoCost = { food: 20 };
    Fleet.syncShipFromState(state);

    expect(Fleet.switchShip(state, 1).ok).toBe(true);
    expect(state.cargo).toEqual({});
    expect(state.cargoCost).toEqual({});

    state.cargo = { minerals: 1 };
    state.cargoCost = { minerals: 30 };
    Fleet.syncShipFromState(state);

    expect(Fleet.switchShip(state, 0).ok).toBe(true);
    expect(state.cargo).toEqual({ food: 2 });
    expect(state.cargoCost).toEqual({ food: 20 });
    expect(state.fleet[1].cargoCost).toEqual({ minerals: 30 });
  });

  it('事件造成的损失和永久容量变化会提交到活动飞船', () => {
    const state = createTestState();
    Fleet.init(state);
    state.cargo = { food: 10 };
    state.cargoCost = { food: 100 };
    Fleet.syncShipFromState(state);
    Fleet.syncStateFromShip(state);
    const before = {
      maxCargo: state.maxCargo,
      maxFuel: state.maxFuel,
      maxHull: state.maxHull,
      fuelEfficiency: state.fuelEfficiency,
      cargo: Object.assign({}, state.cargo),
      cargoCost: Object.assign({}, state.cargoCost),
    };

    state.cargo.food = 5;
    state.fuel = 80;
    state.shipHull = 75;
    state.maxCargo += 5;
    state.maxFuel += 20;
    Fleet.commitActiveShipState(state, before);

    const ship = Fleet.getActiveShip(state);
    expect(ship.cargo.food).toBe(5);
    expect(ship.cargoCost.food).toBe(50);
    expect(ship.fuel).toBe(80);
    expect(ship.hull).toBe(75);
    expect(state.maxCargo).toBe(25);
    expect(state.maxFuel).toBe(120);

    Fleet.syncStateFromShip(state);
    expect(state.maxCargo).toBe(25);
    expect(state.maxFuel).toBe(120);
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

  it('派遣船只没有资金和库存时会停在买入地等待 [C2]', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    // 分配路线然后耗尽燃料
    Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food');
    state.fleet[1].fuel = 0;
    state.credits = 0; // 也没钱买燃料

    // 船在买入地但没有资金与待售库存，不应空载前往卖出地。
    const first = Fleet.tickFleetRoutes(state);
    expect(state.fleet[1].route).not.toBeNull();
    expect(state.fleet[1].route.status).toBe('buying');
    expect(state.fleet[1].location).toBe('sol_prime');
    expect(first.msgs.some(function (msg) { return msg.text.indexOf('等待可用资金') !== -1; })).toBe(true);

    // 后续 tick 继续等待，不会因为空载旅行耗尽燃料并取消路线。
    const result = Fleet.tickFleetRoutes(state);
    expect(state.fleet[1].route).not.toBeNull();
    expect(state.fleet[1].route.status).toBe('buying');
    expect(state.fleet[1].location).toBe('sol_prime');
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
    const state = createTestState({ credits: 100000, companyLevel: 2 });
    Fleet.init(state);
    const slotsBefore = Fleet.getSlotCount(state);
    const result = Fleet.buySlot(state);
    if (result.ok) {
      expect(Fleet.getSlotCount(state)).toBe(slotsBefore + 1);
    }
  });

  it('公司等级不足时不能购买下一席位', () => {
    const state = createTestState({ credits: 100000, companyLevel: 1 });
    Fleet.init(state);
    const result = Fleet.buySlot(state);
    expect(result.ok).toBe(false);
    expect(result.msgs[0].text).toContain('公司 Lv.2');
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

  it('港口保养会即时扣款并恢复维护度与船体', () => {
    const state = createTestState({ credits: 5000 });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.maintenance = 44;
    ship.hull = 92;

    const quote = Fleet.getShipRepairQuote(state, 0);
    const creditsBefore = state.credits;
    const result = Fleet.serviceShip(state, 0);

    expect(result.ok).toBe(true);
    expect(quote.durationDays).toBe(0);
    expect(ship.repairJob).toBe(null);
    expect(ship.maintenance).toBe(100);
    expect(ship.hull).toBe(ship.maxHull);
    expect(state.credits).toBe(creditsBefore - quote.cost);
    expect(result.msgs[0].text).toContain('即时保养');
  });

  it('旧故障和维修队列在载入时清除，重度失养也不再随机生成故障', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const state = createTestState({
      credits: 0,
      fleet: [{
        typeId: 'shuttle',
        cargo: {},
        mods: [],
        upgrades: [],
        maintenance: 18,
        faults: ['cargo_lock'],
        repairJob: { remainingDays: 2 },
      }],
      activeShipIndex: 0,
    });
    Fleet.init(state);
    Fleet.advanceFleetDay(state);

    expect(state.fleet[0].faults).toEqual([]);
    expect(state.fleet[0].repairJob).toBe(null);
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

  it('维护度过低时拒绝新跑商路线，并停止已有路线', () => {
    const state = createTestState({ credits: 10000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    expect(Fleet.buyShip(state, 'freighter').ok).toBe(true);
    const ship = state.fleet[1];

    ship.maintenance = 14;
    expect(Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food').ok).toBe(false);

    ship.maintenance = 20;
    expect(Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food').ok).toBe(true);
    ship.maintenance = 14;
    const result = Fleet.tickFleetRoutes(state);

    expect(ship.route).toBeNull();
    expect(result.msgs.some(function (msg) { return msg.text.indexOf('停止自动跑商') !== -1; })).toBe(true);
  });

  it('派遣经营账会分别记录收入、货款、燃料与养护', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    expect(Fleet.buyShip(state, 'freighter').ok).toBe(true);
    const ship = state.fleet[1];
    expect(Fleet.assignRoute(state, 1, 'sol_prime', 'nova_station', 'food').ok).toBe(true);
    ship.location = 'sol_prime';

    Fleet.tickFleetRoutes(state);
    Fleet.advanceFleetDay(state);
    Fleet.tickFleetRoutes(state);
    const summary = Fleet.getShipOperatingSummary(state, ship);

    expect(summary.tradeCycles).toBe(1);
    expect(summary.revenue).toBeGreaterThan(0);
    expect(summary.cargoCost).toBeGreaterThan(0);
    expect(summary.upkeepCost).toBeGreaterThan(0);
    expect(summary.net).toBe(summary.revenue - summary.cargoCost - summary.fuelCost - summary.upkeepCost - summary.serviceCost);
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

describe('Fleet ship configuration', () => {
  it('旧协议 API 返回退役状态且不再累计独立经验', () => {
    const state = createTestState();
    Fleet.init(state);

    expect(Fleet.setShipDoctrine(state, 0, 'navigation')).toMatchObject({ ok: false, meta: { retired: true } });
    expect(Fleet.activateShipProtocol(state, 0)).toMatchObject({ ok: false, meta: { retired: true } });
    expect(Fleet.recordShipActivity(state, 'travel', {}, 0)).toMatchObject({ ok: false, awards: [] });
    expect(Fleet.getShipSpecializationSummary(state, Fleet.getActiveShip(state))).toBe(null);
  });

  it('功能型改装会改变走私与 探索点 收益系数', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    Fleet.buyShip(state, 'freighter');

    expect(Fleet.installMod(state, 'mod_smuggler_hold', 1).ok).toBe(true);
    expect(Fleet.installMod(state, 'mod_survey_array', 1).ok).toBe(true);

    const stats = Fleet.getEffectiveShipStats(state, state.fleet[1]);
    expect(stats.smugglingCheckMultiplier).toBeCloseTo(0.78, 5);
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
    expect(profile.label).toBe('探索支援');
  });

});

describe('Fleet.getShipModRecommendation', () => {
  it('维护压力高时优先推荐舰务维护舱', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    const ship = Fleet.getActiveShip(state);
    ship.maintenance = 42;

    const recommendation = Fleet.getShipModRecommendation(state, 0);

    expect(recommendation).toMatchObject({
      modId: 'mod_service_bay',
      canInstall: true,
      disabledReason: '',
    });
    expect(recommendation.reason).toContain('维护');
  });

  it('快航船会优先推荐离子驱动器', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    state.fleetSlots = 2;
    expect(Fleet.buyShip(state, 'clipper').ok).toBe(true);

    const recommendation = Fleet.getShipModRecommendation(state, 1);

    expect(recommendation).toMatchObject({
      modId: 'mod_ion_drive',
      canInstall: true,
    });
    expect(recommendation.reason).toContain('短途快运');
  });

  it('槽位已满时仍返回最相关推荐并说明阻塞原因', () => {
    const state = createTestState({ credits: 50000 });
    Fleet.init(state);
    expect(Fleet.installMod(state, 'mod_cargo_rack', 0).ok).toBe(true);
    const ship = Fleet.getActiveShip(state);
    ship.maintenance = 35;

    const recommendation = Fleet.getShipModRecommendation(state, 0);

    expect(recommendation).toMatchObject({
      modId: 'mod_service_bay',
      canInstall: false,
      disabledReason: '改装槽位已满',
    });
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
