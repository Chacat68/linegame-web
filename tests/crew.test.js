import { describe, it, expect, beforeEach } from 'vitest';
import * as Crew from '../js/systems/fleet/CrewSystem.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import * as Economy from '../js/systems/economy/Economy.js';
import { createTestState } from './helpers.js';

beforeEach(() => {
  Economy.init();
});

function createOffer(state, systemId, overrides) {
  const market = Crew.getCrewMarket(state, systemId);
  return Object.assign({}, market.offers[0], overrides);
}

describe('CrewSystem market', () => {
  it('会按星球生成并周期刷新人才市场', () => {
    const state = createTestState({ currentSystem: 'sol_prime', day: 1 });
    Fleet.init(state);

    const firstMarket = Crew.getCrewMarket(state, 'sol_prime');
    expect(firstMarket.offers.length).toBeGreaterThan(0);
    expect(firstMarket.refreshDay).toBe(1);

    state.day = 4;
    const refreshedMarket = Crew.getCrewMarket(state, 'sol_prime');
    expect(refreshedMarket.refreshDay).toBe(4);
    expect(refreshedMarket.offers[0].id).not.toBe(firstMarket.offers[0].id);
  });

  it('不同港口会生成明显不同的人才画像', () => {
    const state = createTestState({ currentSystem: 'imperial_capital', day: 1 });
    Fleet.init(state);

    const capitalMarket = Crew.getCrewMarket(state, 'imperial_capital');
    const shadowMarket = Crew.getCrewMarket(state, 'shadow_haven');

    expect(capitalMarket.themeLabel).toBe('帝都经纪圈');
    expect(capitalMarket.offers.slice(0, 3).every(function (offer) { return offer.role === 'broker'; })).toBe(true);

    expect(shadowMarket.themeLabel).toBe('暗港灰色市场');
    expect(shadowMarket.offers[0].role).toBe('broker');
    expect(shadowMarket.offers.some(function (offer) {
      return offer.specialtyId === 'gray_channel' || offer.specialtyId === 'salvage_rigger' || offer.specialtyId === 'void_runner';
    })).toBe(true);
  });
});

describe('CrewSystem recruitment', () => {
  it('可从当前港口人才市场签约船员并写入名册', () => {
    const state = createTestState({ credits: 5000, currentSystem: 'sol_prime' });
    Fleet.init(state);

    const offer = createOffer(state, 'sol_prime', {
      id: 'offer_pilot_a',
      role: 'pilot',
      roleName: '领航员',
      title: '巡航领航员',
      specialtyId: 'route_savant',
      specialtyName: '主航路算师',
      branchLabel: '航路派',
      name: '测试领航',
      hireCost: 420,
      wage: 95,
      level: 1,
      potential: 2,
      potentialLabel: '稳定成长',
      expPerDay: 10,
      maxLevel: 6,
      expToNext: 60,
    });
    state.crewMarket.sol_prime.offers = [offer];

    const result = Crew.recruitCrew(state, 'offer_pilot_a', 'sol_prime');

    expect(result.ok).toBe(true);
    expect(state.crewRoster.length).toBe(1);
    expect(state.crewRoster[0].role).toBe('pilot');
    expect(state.crewRoster[0].marketOriginId).toBe('offer_pilot_a');
    expect(state.credits).toBe(5000 - 420);
    expect(state.crewMarket.sol_prime.offers.length).toBe(0);
  });
});

describe('CrewSystem assignment', () => {
  it('可把货运专长船员分配到飞船并带来货舱加成', () => {
    const state = createTestState({ credits: 8000, currentSystem: 'imperial_capital' });
    Fleet.init(state);

    const offer = createOffer(state, 'imperial_capital', {
      id: 'offer_qm_a',
      role: 'quartermaster',
      roleName: '货运主管',
      title: '货舱统筹官',
      specialtyId: 'container_architect',
      specialtyName: '集装架构师',
      branchLabel: '仓储派',
      name: '测试货运',
      hireCost: 500,
      wage: 120,
      level: 1,
      potential: 2,
      potentialLabel: '稳定成长',
      expPerDay: 11,
      maxLevel: 6,
      expToNext: 60,
    });
    state.crewMarket.imperial_capital.offers = [offer];
    Crew.recruitCrew(state, 'offer_qm_a', 'imperial_capital');

    const crewId = state.crewRoster[0].id;
    const assignResult = Crew.assignCrewToShip(state, crewId, 0);

    expect(assignResult.ok).toBe(true);
    expect(state.fleet[0].crewIds).toContain(crewId);

    Fleet.syncStateFromShip(state);
    expect(state.maxCargo).toBe(28);
  });

  it('超过船员容量时拒绝分配', () => {
    const state = createTestState({ credits: 15000, currentSystem: 'sol_prime' });
    Fleet.init(state);

    state.crewMarket.sol_prime = {
      systemId: 'sol_prime',
      refreshDay: 1,
      nextRefreshDay: 4,
      offers: [
        createOffer(state, 'sol_prime', { id: 'offer_1', role: 'pilot', roleName: '领航员', title: '巡航领航员', specialtyId: 'route_savant', specialtyName: '主航路算师', branchLabel: '航路派', name: '甲', hireCost: 400, wage: 80 }),
        createOffer(state, 'sol_prime', { id: 'offer_2', role: 'engineer', roleName: '轮机师', title: '轮机工程师', specialtyId: 'damage_control', specialtyName: '损管主管', branchLabel: '损管派', name: '乙', hireCost: 430, wage: 85 }),
        createOffer(state, 'sol_prime', { id: 'offer_3', role: 'broker', roleName: '交易掮客', title: '市场顾问', specialtyId: 'market_maker', specialtyName: '行情做市人', branchLabel: '做市派', name: '丙', hireCost: 450, wage: 90 }),
      ],
    };

    Crew.recruitCrew(state, 'offer_1', 'sol_prime');
    Crew.recruitCrew(state, 'offer_2', 'sol_prime');
    Crew.recruitCrew(state, 'offer_3', 'sol_prime');

    expect(Crew.assignCrewToShip(state, state.crewRoster[0].id, 0).ok).toBe(true);
    expect(Crew.assignCrewToShip(state, state.crewRoster[1].id, 0).ok).toBe(true);

    const result = Crew.assignCrewToShip(state, state.crewRoster[2].id, 0);
    expect(result.ok).toBe(false);
  });

  it('领航专长会改善激活船只燃料效率', () => {
    const state = createTestState({ credits: 6000, currentSystem: 'sol_prime' });
    Fleet.init(state);

    const offer = createOffer(state, 'sol_prime', {
      id: 'offer_pilot_b',
      role: 'pilot',
      roleName: '领航员',
      title: '巡航领航员',
      specialtyId: 'route_savant',
      specialtyName: '主航路算师',
      branchLabel: '航路派',
      name: '测试导航',
      hireCost: 420,
      wage: 95,
      level: 1,
      potential: 2,
      potentialLabel: '稳定成长',
      expPerDay: 10,
      maxLevel: 6,
      expToNext: 50,
    });
    state.crewMarket.sol_prime.offers = [offer];
    Crew.recruitCrew(state, 'offer_pilot_b', 'sol_prime');

    const crewId = state.crewRoster[0].id;
    Crew.assignCrewToShip(state, crewId, 0);
    Fleet.syncStateFromShip(state);

    expect(state.fuelEfficiency).toBeLessThan(1.0);
  });
});

describe('CrewSystem wages, growth and trade effects', () => {
  it('每日结算会扣除工资并推进已上船船员成长', () => {
    const state = createTestState({ credits: 3000, currentSystem: 'sol_prime' });
    Fleet.init(state);

    const offer = createOffer(state, 'sol_prime', {
      id: 'offer_growth_a',
      role: 'pilot',
      roleName: '领航员',
      title: '巡航领航员',
      specialtyId: 'route_savant',
      specialtyName: '主航路算师',
      branchLabel: '航路派',
      name: '成长测试',
      hireCost: 420,
      wage: 95,
      level: 1,
      potential: 3,
      potentialLabel: '王牌潜力',
      expPerDay: 40,
      maxLevel: 6,
      expToNext: 60,
    });
    state.crewMarket.sol_prime.offers = [offer];
    Crew.recruitCrew(state, 'offer_growth_a', 'sol_prime');
    Crew.assignCrewToShip(state, state.crewRoster[0].id, 0);

    const beforeWage = state.credits;
    const result = Crew.payDailyWages(state, 2);

    expect(result.ok).toBe(true);
    expect(state.credits).toBe(beforeWage - 190);
    expect(state.crewRoster[0].level).toBeGreaterThan(1);
  });

  it('交易专长会改善公开市场买入价格', () => {
    const state = createTestState({ credits: 10000, currentSystem: 'imperial_capital' });
    Fleet.init(state);

    const basePrice = Economy.getBuyPrice('imperial_capital', 'luxury', state);
    const offer = createOffer(state, 'imperial_capital', {
      id: 'offer_broker_a',
      role: 'broker',
      roleName: '交易掮客',
      title: '市场顾问',
      specialtyId: 'market_maker',
      specialtyName: '行情做市人',
      branchLabel: '做市派',
      name: '测试掮客',
      hireCost: 560,
      wage: 135,
      level: 1,
      potential: 2,
      potentialLabel: '稳定成长',
      expPerDay: 12,
      maxLevel: 6,
      expToNext: 60,
    });
    state.crewMarket.imperial_capital.offers = [offer];
    Crew.recruitCrew(state, 'offer_broker_a', 'imperial_capital');
    Crew.assignCrewToShip(state, state.crewRoster[0].id, 0);

    const improvedPrice = Economy.getBuyPrice('imperial_capital', 'luxury', state);
    expect(improvedPrice).toBeLessThan(basePrice);
  });
});
