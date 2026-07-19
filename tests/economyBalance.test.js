import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import * as Faction from '../js/systems/faction/FactionSystem.js';
import { GOODS } from '../js/data/goods.js';
import { getSystemsByGalaxy } from '../js/data/systems.js';
import { createTestState } from './helpers.js';

afterEach(() => {
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

function sampleBestStarterRoutes(tradeCount, seedCount) {
  const randomSpy = vi.spyOn(Math, 'random');
  const systems = getSystemsByGalaxy('milky_way').filter(function (system) {
    return (system.minLevel || 1) <= 1;
  });
  const goods = GOODS.filter(function (good) {
    return good.id !== 'fuel' && good.marketAccess.includes('open');
  });
  const margins = [];
  const winningGoods = new Set();

  for (let seed = 1; seed <= seedCount; seed += 1) {
    randomSpy.mockImplementation(createSeededRandom(seed));
    Economy.init();
    const state = createTestState({
      playerLevel: 1,
      tradeCount: tradeCount,
      credits: 1000,
      maxCargo: 20,
      difficulty: 'normal',
    });
    Faction.init(state);
    let best = { net: -Infinity, margin: -Infinity, goodId: '' };

    systems.forEach(function (origin) {
      systems.forEach(function (target) {
        if (origin.id === target.id) return;
        goods.forEach(function (good) {
          const buyPrice = Economy.getBuyPrice(origin.id, good.id, state);
          const sellPrice = Economy.getSellPrice(target.id, good.id, state);
          const quantity = Math.min(state.maxCargo, Math.floor(state.credits / buyPrice));
          const replacementFuelCost = Economy.getFuelCost(origin.id, target.id, 1, state) *
            Economy.getBuyPrice(origin.id, 'fuel', state);
          const invested = buyPrice * quantity + replacementFuelCost;
          const net = (sellPrice - buyPrice) * quantity - replacementFuelCost;
          const margin = net / Math.max(1, invested);
          if (net > best.net) best = { net: net, margin: margin, goodId: good.id };
        });
      });
    });

    margins.push(best.margin);
    winningGoods.add(best.goodId);
  }

  return { margins: margins, winningGoods: winningGoods, systemCount: systems.length };
}

describe('starter economy balance envelope', () => {
  it('Lv.1 只暴露 5–7 个可到达节点', () => {
    const systems = getSystemsByGalaxy('milky_way').filter(function (system) {
      return (system.minLevel || 1) <= 1;
    });

    expect(systems.length).toBeGreaterThanOrEqual(5);
    expect(systems.length).toBeLessThanOrEqual(7);
  });

  it('新档最优公开航线回报可信，保护退场后仍保留多商品策略', () => {
    const fresh = sampleBestStarterRoutes(0, 60);
    const established = sampleBestStarterRoutes(8, 60);
    const freshMedian = quantile(fresh.margins, 0.5);
    const freshP90 = quantile(fresh.margins, 0.9);
    const establishedMedian = quantile(established.margins, 0.5);
    const establishedP90 = quantile(established.margins, 0.9);

    expect(freshMedian).toBeGreaterThanOrEqual(0.05);
    expect(freshMedian).toBeLessThanOrEqual(0.20);
    expect(freshP90).toBeLessThanOrEqual(0.26);
    expect(establishedMedian).toBeGreaterThan(freshMedian);
    expect(establishedP90).toBeLessThanOrEqual(0.50);
    expect(established.winningGoods.size).toBeGreaterThanOrEqual(2);
  }, 10000);
});
