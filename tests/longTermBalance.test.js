import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import * as Fleet from '../js/systems/fleet/FleetSystem.js';
import { GOODS } from '../js/data/goods.js';
import { SYSTEMS, getSystemsByGalaxy } from '../js/data/systems.js';
import { createTestState } from './helpers.js';

afterEach(function () {
  vi.restoreAllMocks();
});

function createSeededRandom(seed) {
  let value = seed | 0;
  return function () {
    value = (Math.imul(value, 1664525) + 1013904223) | 0;
    return (value >>> 0) / 4294967296;
  };
}

function quantile(values, ratio) {
  const sorted = values.slice().sort(function (left, right) { return left - right; });
  return sorted[Math.floor((sorted.length - 1) * ratio)];
}

function findBestFleetRoute(state, ship, systems, goods) {
  let bestRoute = null;
  systems.forEach(function (origin) {
    systems.forEach(function (target) {
      if (origin.id === target.id) return;
      goods.forEach(function (good) {
        const buyPrice = Economy.getBuyPrice(origin.id, good.id, state);
        const sellPrice = Economy.getSellPrice(target.id, good.id, state);
        const quantity = Math.min(ship.maxCargo, Math.floor(state.credits / buyPrice));
        const roundTripFuel = Economy.getFuelCost(origin.id, target.id, ship.fuelEff, state) +
          Economy.getFuelCost(target.id, origin.id, ship.fuelEff, state);
        const fuelPrice = Economy.getBuyPrice(origin.id, 'fuel', state);
        const net = (sellPrice - buyPrice) * quantity - roundTripFuel * fuelPrice;
        if (!bestRoute || net > bestRoute.net) {
          bestRoute = { buySystemId: origin.id, sellSystemId: target.id, goodId: good.id, net: net };
        }
      });
    });
  });
  return bestRoute;
}

function createMatureTradeState() {
  const state = createTestState({
    playerLevel: 10,
    tradeCount: 200,
    credits: 1000000,
    techBuyDiscount: 0.33,
    techSellBonus: 0.33,
    storyDecisions: { victory_policy: 'trade_baron' },
  });
  Faction.init(state);
  Object.keys(state.factionRelations).forEach(function (factionId) {
    state.factionRelations[factionId] = 100;
  });
  Fleet.init(state);
  state.fleetSlots = 4;
  Fleet.buyShip(state, 'freighter');
  Fleet.buyShip(state, 'clipper');
  Fleet.buyShip(state, 'galleon');
  Fleet.switchShip(state, 3);
  return state;
}

describe('60-day mature economy envelope', function () {
  it('叠满加成后仍保留买卖价差、非必赚路线与多商品窗口', function () {
    vi.spyOn(Math, 'random').mockImplementation(createSeededRandom(20260718));
    Economy.init();
    const state = createMatureTradeState();
    const systems = SYSTEMS.filter(function (system) {
      return (system.minLevel || 1) <= state.playerLevel;
    }).slice(0, 30);
    const goods = GOODS.filter(function (good) {
      return good.id !== 'fuel' && good.marketAccess.includes('open');
    });
    const profitableRouteShares = [];
    const dailyWinningGoods = new Set();

    for (let day = 0; day < 60; day += 1) {
      let profitableRoutes = 0;
      let routeCount = 0;
      let bestRoute = null;

      systems.forEach(function (origin) {
        goods.forEach(function (good) {
          const localBuy = Economy.getBuyPrice(origin.id, good.id, state);
          const localSell = Economy.getSellPrice(origin.id, good.id, state);
          expect(localSell).toBeLessThanOrEqual(localBuy);

          systems.forEach(function (target) {
            if (target.id === origin.id) return;
            const targetSell = Economy.getSellPrice(target.id, good.id, state);
            const margin = (targetSell - localBuy) / Math.max(1, localBuy);
            if (margin > 0) profitableRoutes += 1;
            routeCount += 1;
            if (!bestRoute || margin > bestRoute.margin) {
              bestRoute = { goodId: good.id, margin: margin };
            }
          });
        });
      });

      profitableRouteShares.push(profitableRoutes / Math.max(1, routeCount));
      if (bestRoute) dailyWinningGoods.add(bestRoute.goodId);
      Economy.advanceDay();
    }

    const profile = Economy.getTradeNegotiationProfile(state, 'sol_prime');
    const medianShare = quantile(profitableRouteShares, 0.5);

    expect(profile.rawCombinedAdvantage).toBeGreaterThan(profile.combinedAdvantage);
    expect(profile.combinedAdvantage).toBeLessThanOrEqual(0.17);
    expect(medianShare).toBeGreaterThan(0.10);
    expect(medianShare).toBeLessThan(0.65);
    expect(Math.max.apply(Math, profitableRouteShares)).toBeLessThan(0.80);
    expect(dailyWinningGoods.size).toBeGreaterThanOrEqual(3);
  });
});

describe('60-day fleet operating envelope', function () {
  it('自动商运需要承担燃料、养护和定期保养，且不会短期指数膨胀', function () {
    vi.spyOn(Math, 'random').mockImplementation(createSeededRandom(1701));
    Economy.init();
    const state = createTestState({
      playerLevel: 6,
      tradeCount: 30,
      credits: 100000,
      day: 1,
    });
    Faction.init(state);
    Fleet.init(state);
    state.fleetSlots = 2;
    expect(Fleet.buyShip(state, 'freighter').ok).toBe(true);
    const ship = state.fleet[1];
    const systems = getSystemsByGalaxy('milky_way').filter(function (system) {
      return (system.minLevel || 1) <= state.playerLevel;
    }).slice(0, 18);
    const goods = GOODS.filter(function (good) {
      return good.id !== 'fuel' && good.marketAccess.includes('open');
    });
    let bestRoute = findBestFleetRoute(state, ship, systems, goods);

    expect(bestRoute).toBeTruthy();
    expect(Fleet.assignRoute(state, 1, bestRoute.buySystemId, bestRoute.sellSystemId, bestRoute.goodId).ok).toBe(true);
    ship.location = bestRoute.buySystemId;
    const creditsAfterPurchase = state.credits;

    for (let day = 0; day < 60; day += 1) {
      state.day += 1;
      Economy.advanceDay();
      Fleet.advanceFleetDay(state);

      if (ship.maintenance < 20) {
        if (ship.route) Fleet.cancelRoute(state, 1);
        expect(Fleet.serviceShip(state, 1).ok).toBe(true);
        expect(Fleet.assignRoute(state, 1, bestRoute.buySystemId, bestRoute.sellSystemId, bestRoute.goodId).ok).toBe(true);
      }
      Fleet.tickFleetRoutes(state);
      if ((day + 1) % 10 === 0 && ship.route && ship.route.status === 'traveling_buy' && Object.keys(ship.cargo).length === 0) {
        const revisedRoute = findBestFleetRoute(state, ship, systems, goods);
        if (revisedRoute) {
          Fleet.cancelRoute(state, 1);
          bestRoute = revisedRoute;
          expect(Fleet.assignRoute(state, 1, bestRoute.buySystemId, bestRoute.sellSystemId, bestRoute.goodId).ok).toBe(true);
        }
      }
    }

    const operating = Fleet.getShipOperatingSummary(state, ship);
    // 市场转弱时会等待而不是亏本成交，因此循环数应保留合理空档。
    expect(operating.tradeCycles).toBeGreaterThanOrEqual(15);
    expect(operating.upkeepCost).toBeGreaterThan(0);
    expect(operating.serviceCost).toBeGreaterThan(0);
    expect(operating.fuelCost).toBeGreaterThan(0);
    expect(operating.net).toBeGreaterThan(0);
    expect(state.credits).toBeLessThan(creditsAfterPurchase * 1.30);
  });
});
