import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  buildMarketGoodsModel,
  renderMarketGoodsWorkspace,
  resolveMarketGoodsCommand,
} from '../js/ui/MarketGoodsPresenter.js';

function createSnapshot(overrides) {
  var config = overrides || {};
  return {
    good: {
      id: config.id || 'food',
      name: config.name || '食物',
      emoji: config.emoji || '🌾',
      desc: config.desc || '基础补给品',
      legality: config.legality || 'legal',
    },
    buyPrice: config.buyPrice == null ? 40 : config.buyPrice,
    sellPrice: config.sellPrice == null ? 32 : config.sellPrice,
    spread: config.spread == null ? 8 : config.spread,
    history: config.history || [30, 31, 32],
    delta: config.delta || { text: '+6.7%', className: 'market-chart-up' },
    supplyDemand: { ratio: config.ratio == null ? 1.5 : config.ratio },
  };
}

function createPorts(overrides) {
  return Object.assign({
    economy: {
      getMarketDepth: vi.fn(function () { return 240; }),
      getSystemMultiplier: vi.fn(function () { return 0.6; }),
      getSupplyDemand: vi.fn(function () { return { ratio: 1 }; }),
    },
    findSystem: vi.fn(function (id) {
      return { id: id, name: id === 'sol_prime' ? '太阳主星' : '新北京站' };
    }),
    describeOpportunity: vi.fn(function () {
      return { label: '适合买入', className: 'accumulate' };
    }),
    getHeatMeta: vi.fn(function () {
      return { label: '很便宜', className: 'mkt-ov-price-freeze' };
    }),
    renderChart: vi.fn(function () { return '<svg aria-label="价格图"></svg>'; }),
  }, overrides || {});
}

function renderWorkspace(overrides) {
  var input = overrides || {};
  var ports = input.ports || createPorts();
  return renderMarketGoodsWorkspace({
    state: input.state || {
      currentSystem: 'sol_prime',
      cargo: { food: 2 },
      fuel: 72,
      maxFuel: 100,
    },
    systemId: input.systemId || 'sol_prime',
    marketMode: input.marketMode || 'open',
    isCurrentSystem: input.isCurrentSystem !== false,
    snapshots: input.snapshots || [createSnapshot()],
    focusedGoodId: input.focusedGoodId || 'food',
    systemFaction: input.systemFaction || { marketAccess: { blackMarket: true } },
    blackMarketUnlocked: input.blackMarketUnlocked !== false,
    canFocusRemote: !!input.canFocusRemote,
    economy: ports.economy,
    findSystem: ports.findSystem,
    describeOpportunity: ports.describeOpportunity,
    getHeatMeta: ports.getHeatMeta,
    renderChart: ports.renderChart,
  });
}

describe('MarketGoodsPresenter', function () {
  it('一次构造商品价格、库存、供需、热度和 command 可用性', function () {
    var ports = createPorts();
    var model = buildMarketGoodsModel({
      state: { currentSystem: 'sol_prime', cargo: { food: 3 }, fuel: 80, maxFuel: 100 },
      systemId: 'sol_prime',
      marketMode: 'open',
      isCurrentSystem: true,
      snapshots: [createSnapshot()],
      focusedGoodId: 'food',
      systemFaction: { marketAccess: { blackMarket: true } },
      blackMarketUnlocked: true,
      economy: ports.economy,
      findSystem: ports.findSystem,
      describeOpportunity: ports.describeOpportunity,
      getHeatMeta: ports.getHeatMeta,
      renderChart: ports.renderChart,
    });

    expect(model).toMatchObject({
      depth: 240,
      depthLabel: '中型',
      blackMarketState: 'open',
      fuelNeeded: 20,
    });
    expect(model.cards[0]).toMatchObject({
      id: 'food',
      inCargo: 3,
      supplyLabel: '供货紧张',
      isCheap: true,
      isActive: true,
      canBuy: true,
      canSell: true,
      opportunity: { label: '适合买入', className: 'accumulate' },
    });
    expect(ports.economy.getMarketDepth).toHaveBeenCalledOnce();
    expect(ports.renderChart).toHaveBeenCalledOnce();
  });

  it('本地公开市场生成商品焦点、买卖和补给 command', function () {
    var view = renderWorkspace();

    expect(view.html).toContain('data-market-command="focus-good"');
    expect(view.html).toContain('data-market-command="buy-good"');
    expect(view.html).toContain('data-market-command="sell-good"');
    expect(view.html).toContain('data-market-command="refuel"');
    expect(view.html).toContain('market-good-card is-active price-low-card');
    expect(view.html).toContain('高需求');
    expect(view.html).toContain('黑市资格已解锁');
    expect(view.html).toContain('<svg aria-label="价格图"></svg>');
  });

  it('远程市场只显示事实和可选航点 command', function () {
    var view = renderWorkspace({
      systemId: 'nova_station',
      isCurrentSystem: false,
      canFocusRemote: true,
    });

    expect(view.html).toContain('远程只读');
    expect(view.html).toContain('当前停靠「太阳主星」');
    expect(view.html).toContain('前往「新北京站」');
    expect(view.html).toContain('data-market-command="focus-remote-system"');
    expect(view.html).not.toContain('data-market-command="buy-good"');
    expect(view.html).not.toContain('data-market-command="sell-good"');
    expect(view.html).not.toContain('data-market-command="refuel"');
  });

  it('黑市使用风险横幅和黑市买卖标签', function () {
    var view = renderWorkspace({
      marketMode: 'black',
      snapshots: [createSnapshot({ legality: 'illegal' })],
    });

    expect(view.html).toContain('🕶 黑市交易');
    expect(view.html).toContain('携带违禁品前往联邦区域将触发执法检查');
    expect(view.html).toContain('tag-illegal">违禁');
    expect(view.html).toContain('🕶 买');
    expect(view.html).toContain('🕶 卖');
  });

  it('转义商品、地点和 command 属性中的外部文本', function () {
    var ports = createPorts({
      findSystem: vi.fn(function (id) { return { id: id, name: id === 'sol_prime' ? '<停靠点>' : '<远端>' }; }),
    });
    var view = renderWorkspace({
      ports: ports,
      systemId: 'bad`id',
      isCurrentSystem: false,
      canFocusRemote: true,
      snapshots: [createSnapshot({ id: 'bad`good', name: '<货物>', desc: '高价 & 风险' })],
      focusedGoodId: 'bad`good',
    });

    expect(view.html).toContain('&lt;货物&gt;');
    expect(view.html).toContain('高价 &amp; 风险');
    expect(view.html).toContain('data-good-id="bad&#96;good"');
    expect(view.html).toContain('data-system-id="bad&#96;id"');
    expect(view.html).not.toContain('<货物>');
  });

  it('command 解析选择最近命令节点且拒绝根节点外目标', function () {
    var root = { dataset: {}, parentElement: null };
    var card = { dataset: { marketCommand: 'focus-good', goodId: 'food' }, parentElement: root };
    var button = { dataset: { marketCommand: 'buy-good', goodId: 'food' }, parentElement: card };
    var icon = { dataset: {}, parentElement: button };
    var outside = { dataset: { marketCommand: 'sell-good', goodId: 'ore' }, parentElement: null };

    expect(resolveMarketGoodsCommand(icon, root)).toEqual({ type: 'buy-good', goodId: 'food', systemId: '' });
    expect(resolveMarketGoodsCommand(card, root)).toEqual({ type: 'focus-good', goodId: 'food', systemId: '' });
    expect(resolveMarketGoodsCommand(outside, root)).toBeNull();
  });

  it('空商品列表仍保留市场规模与远程状态', function () {
    var view = renderWorkspace({ snapshots: [], isCurrentSystem: false, canFocusRemote: false });

    expect(view.model.cards).toEqual([]);
    expect(view.html).toContain('可交易规模');
    expect(view.html).toContain('远程只读');
    expect(view.html).not.toContain('market-good-card');
  });

  it('MarketUI 只组合商品 presenter，并用单一列表委托解释 command', function () {
    var marketUi = readFileSync('js/ui/MarketUI.js', 'utf8');
    var presenter = readFileSync('js/ui/MarketGoodsPresenter.js', 'utf8');

    expect(marketUi).toContain("from './MarketGoodsPresenter.js'");
    expect(marketUi).toContain('goodsListEl.onclick = function');
    expect(marketUi).toContain('goodsListEl.onkeydown = function');
    expect(marketUi).not.toContain("card.addEventListener('click'");
    expect(marketUi).not.toContain("card.addEventListener('keydown'");
    expect(marketUi).not.toContain("card.innerHTML =");
    expect(presenter).toContain('export function renderMarketGoodsWorkspace');
    expect(presenter).toContain('export function resolveMarketGoodsCommand');
  });
});
