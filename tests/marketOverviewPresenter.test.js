import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as Economy from '../js/systems/economy/Economy.js';
import {
  buildMarketOverviewView,
  renderMarketOverviewHead,
  renderMarketOverviewRow,
} from '../js/ui/MarketOverviewPresenter.js';
import { createTestState } from './helpers.js';

describe('MarketOverviewPresenter', function () {
  it('把地点访问与贸易网络研究投影为明确的报价可见性', function () {
    var state = createTestState({
      currentSystem: 'sol_prime',
      currentGalaxy: 'milky_way',
      playerLevel: 10,
      visitedSystems: ['sol_prime'],
      researchedTechs: [],
    });
    Economy.init();

    var locked = buildMarketOverviewView({ state: state, galaxyId: 'milky_way', priceMode: 'buy' });
    var current = locked.rows.find(function (row) { return row.systemId === 'sol_prime'; });
    var remote = locked.rows.find(function (row) { return row.systemId !== 'sol_prime'; });

    expect(current.canViewPrices).toBe(true);
    expect(current.cells.every(function (cell) { return !cell.unknown; })).toBe(true);
    expect(remote).toBeDefined();
    expect(remote.canViewPrices).toBe(false);
    expect(remote.cells.every(function (cell) { return cell.unknown; })).toBe(true);

    state.researchedTechs = ['trade_network'];
    var unlocked = buildMarketOverviewView({ state: state, galaxyId: 'milky_way', priceMode: 'sell' });
    var unlockedRemote = unlocked.rows.find(function (row) { return row.systemId === remote.systemId; });
    expect(unlocked.priceMode).toBe('sell');
    expect(unlocked.ariaLabel).toBe('各地商品卖出价格表');
    expect(unlockedRemote.canViewPrices).toBe(true);
    expect(unlockedRemote.cells.every(function (cell) { return !cell.unknown; })).toBe(true);
  });

  it('表头和地点行统一转义动态字段并保留未知价格语义', function () {
    var head = renderMarketOverviewHead({ headers: [{ name: '<矿石>', emoji: '⛏️' }] });
    var row = renderMarketOverviewRow({
      systemId: 'unsafe',
      systemName: '<script>alert(1)</script>',
      typeLabel: '站点 & 港口',
      color: 'red" onmouseover="alert(1)',
      isCurrent: false,
      canViewPrices: false,
      cells: [{ goodName: '<矿石>', unknown: true }],
    });

    expect(head).toContain('&lt;矿石&gt;');
    expect(row).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(row).toContain('站点 &amp; 港口');
    expect(row).toContain('red&quot; onmouseover=&quot;alert(1)');
    expect(row).toContain('disabled aria-disabled="true"');
    expect(row).toContain('price-unknown');
    expect(row).not.toContain('<script>');
  });

  it('价格总览模型与 DOM 协调不再由 MarketUI 持有', function () {
    var marketUi = readFileSync('js/ui/MarketUI.js', 'utf8');
    var presenter = readFileSync('js/ui/MarketOverviewPresenter.js', 'utf8');
    var controller = readFileSync('js/ui/MarketOverviewController.js', 'utf8');

    expect(marketUi).toContain("from './MarketOverviewController.js'");
    expect(marketUi).not.toContain('function _renderOverviewTable');
    expect(marketUi).not.toContain('getSystemsByGalaxy');
    expect(presenter).toContain('export function buildMarketOverviewView');
    expect(presenter).not.toMatch(/\bdocument\b/);
    expect(controller).toContain("from './MarketOverviewPresenter.js'");
  });
});
