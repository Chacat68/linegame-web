import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  describeTradeOpportunity,
  formatMarketHeatDelta,
  getMarketHeatMeta,
  renderAnalysisPanel,
  renderBlackMarketSection,
  renderMarketIntelTools,
  renderQuickTradeDock,
  renderSpotGoodsToolbar,
  renderSpotIntelSection,
  renderSpotTradeSection,
} from '../js/ui/MarketSpotPresenter.js';

function createSnapshot(id, options) {
  var config = options || {};
  return {
    good: {
      id: id,
      name: config.name || id,
      emoji: config.emoji || '📦',
      legality: config.legality || 'legal',
      upstream: config.upstream || [],
    },
    buyPrice: config.buyPrice == null ? 100 : config.buyPrice,
    sellPrice: config.sellPrice == null ? 80 : config.sellPrice,
    spread: config.spread == null ? 20 : config.spread,
    swing: config.swing == null ? 8 : config.swing,
    supplyDemand: { ratio: config.ratio == null ? 1 : config.ratio },
    delta: {
      text: config.delta || '+4.0%',
      className: config.deltaClass || 'market-chart-up',
    },
  };
}

function createEconomy(overrides) {
  return Object.assign({
    getSystemMultiplier: vi.fn(function () { return 1; }),
    getMarketDepth: vi.fn(function () { return 240; }),
    getTradeNegotiationProfile: vi.fn(function () {
      return { buyAdvantage: 0.08, sellAdvantage: 0.05 };
    }),
    getBlackMarketGoods: vi.fn(function () {
      return [createSnapshot('contraband', { name: '违禁样本', legality: 'illegal' }).good];
    }),
    estimateSmugglingCargoRisk: vi.fn(function () {
      return {
        protectedByBlackMarket: false,
        enforcementLabel: '中等执法',
        enforcement: 'medium',
        reputationModifier: 1,
        hasContraband: false,
        contrabandValue: 0,
        contrabandGoods: [],
        checkChancePercent: 0,
      };
    }),
  }, overrides || {});
}

describe('MarketSpotPresenter', function () {
  it('把价格倍率归类为稳定的热度与涨跌语义', function () {
    expect(getMarketHeatMeta(0.5)).toMatchObject({ label: '很便宜', className: 'mkt-ov-price-freeze' });
    expect(getMarketHeatMeta(1)).toMatchObject({ label: '正常价', className: 'mkt-ov-price-neutral' });
    expect(getMarketHeatMeta(1.6)).toMatchObject({ label: '很贵', className: 'mkt-ov-price-hot' });
    expect(formatMarketHeatDelta(1.2)).toEqual({ text: '▲20%', className: 'up' });
    expect(formatMarketHeatDelta(0.8)).toEqual({ text: '▼20%', className: 'down' });
    expect(formatMarketHeatDelta(1)).toEqual({ text: '•0%', className: 'flat' });
  });

  it('按价格、库存、需求和价差选择局部交易信号', function () {
    var snapshot = createSnapshot('food', { ratio: 1.1, spread: 5, sellPrice: 90 });
    var economy = createEconomy({ getSystemMultiplier: vi.fn(function () { return 0.8; }) });
    expect(describeTradeOpportunity('sol', snapshot, 0, economy).className).toBe('accumulate');

    economy.getSystemMultiplier.mockReturnValue(1.25);
    expect(describeTradeOpportunity('sol', snapshot, 2, economy).className).toBe('distribute');

    economy.getSystemMultiplier.mockReturnValue(1);
    snapshot.supplyDemand.ratio = 1.5;
    expect(describeTradeOpportunity('sol', snapshot, 0, economy).className).toBe('surge');

    snapshot.supplyDemand.ratio = 1;
    snapshot.spread = 20;
    expect(describeTradeOpportunity('sol', snapshot, 0, economy).className).toBe('watch');
    expect(describeTradeOpportunity('sol', null, 0, economy).className).toBe('balance');
  });

  it('交易外壳只承载快速交易与商品列表，价格工具留在行情页', function () {
    var trade = renderSpotTradeSection();
    var tools = renderMarketIntelTools({ priceMode: 'sell' });

    expect(trade).toContain('market-quick-trade-dock');
    expect(trade).toContain('market-goods-list');
    expect(trade).not.toContain('market-kline-panel');
    expect(trade).not.toContain('market-analysis-panel');
    expect(tools).toContain('详细价格数据');
    expect(tools).toContain('market-kline-panel');
    expect(tools).toContain('各地价格表');
    expect(tools).toContain('aria-checked="true" aria-controls="market-trade-overview-table" tabindex="0" data-market-overview-price-mode="sell"');
    expect(tools).toContain('表格显示各地的卖出价');
  });

  it('快速交易和商品工具栏只投影状态，保留上层 command 钩子', function () {
    var snapshots = [createSnapshot('food', { name: '食物', emoji: '🌾', buyPrice: 40, sellPrice: 32, ratio: 1.3 })];
    var state = { credits: 210, cargo: { food: 3, tools: 2 }, maxCargo: 10 };
    var current = renderQuickTradeDock({
      state: state,
      systemId: 'sol',
      snapshots: snapshots,
      marketMode: 'open',
      isCurrentSystem: true,
      focusedGoodId: 'food',
      economy: createEconomy(),
    });
    var remote = renderQuickTradeDock({
      state: state,
      systemId: 'sol',
      snapshots: snapshots,
      marketMode: 'open',
      isCurrentSystem: false,
      focusedGoodId: 'food',
      economy: createEconomy(),
    });
    var toolbar = renderSpotGoodsToolbar({
      state: state,
      systemId: 'sol',
      snapshots: snapshots,
      marketMode: 'open',
      focusedGoodId: 'food',
      economy: createEconomy(),
    });

    expect(current).toContain('data-market-quick-action="sell"');
    expect(current).toContain('data-market-quick-action="buy"');
    expect(current).toContain('<em>最多买</em><strong>5</strong>');
    expect(remote).toContain('远程只读');
    expect(remote).not.toContain('data-market-quick-action');
    expect(toolbar).toContain('当前查看：🌾 食物');
    expect(toolbar).toContain('库存种类<strong>1</strong>');
    expect(toolbar).toContain('紧俏商品<strong>1</strong>');
  });

  it('分析面板从一次派生中生成行情、货舱和势力事实', function () {
    var economy = createEconomy();
    var container = { innerHTML: '' };
    var snapshots = [
      createSnapshot('food', { name: '食物', emoji: '🌾', buyPrice: 120, sellPrice: 100, ratio: 1.4 }),
      createSnapshot('tools', { name: '工具', emoji: '🛠️', buyPrice: 80, sellPrice: 70, ratio: 0.8, delta: '-3.0%', deltaClass: 'market-chart-down' }),
    ];

    renderAnalysisPanel({
      container: container,
      state: { cargo: { food: 4 }, maxCargo: 20 },
      systemId: 'sol',
      snapshots: snapshots,
      marketMode: 'open',
      focusedGoodId: 'food',
      economy: economy,
      faction: { getFactionForSystem: function () { return { name: '联邦' }; } },
      findSystem: function () { return { name: '太阳系', typeLabel: '核心星系' }; },
    });

    expect(container.innerHTML).toContain('行情摘要');
    expect(container.innerHTML).toContain('🌾 食物');
    expect(container.innerHTML).toContain('货舱占用');
    expect(container.innerHTML).toContain('联邦');
    expect(economy.getTradeNegotiationProfile).toHaveBeenCalledOnce();
  });

  it('行情页组合价格工具、地点事实与有序关注清单', function () {
    var economy = createEconomy();
    var html = renderSpotIntelSection({
      state: { cargo: {} },
      systemId: 'sol',
      snapshots: [
        createSnapshot('food', { name: '食物', emoji: '🌾', buyPrice: 80, ratio: 1.7, swing: 5 }),
        createSnapshot('tools', { name: '工具', emoji: '🛠️', buyPrice: 60, ratio: 0.9, swing: 20 }),
      ],
      marketMode: 'open',
      systemFaction: { name: '联邦', marketAccess: { blackMarket: true } },
      blackMarketUnlocked: true,
      priceMode: 'buy',
      economy: economy,
      findSystem: function () { return { name: '太阳系', typeLabel: '核心星系', description: '贸易中枢' }; },
    });

    expect(html).toContain('详细价格数据');
    expect(html).toContain('最低买入');
    expect(html).toContain('最高需求');
    expect(html).toContain('太阳系');
    expect(html).toContain('黑市开放');
    expect(html).toContain('值得关注的货物');
    expect(economy.getTradeNegotiationProfile).toHaveBeenCalledOnce();
  });

  it('黑市页区分入口、权限、风险与已经结算的真实结果', function () {
    var economy = createEconomy({
      estimateSmugglingCargoRisk: vi.fn(function () {
        return {
          protectedByBlackMarket: true,
          enforcementLabel: '高执法',
          enforcement: 'high',
          reputationModifier: 0.8,
          hasContraband: true,
          contrabandValue: 500,
          contrabandGoods: ['违禁样本'],
          checkChancePercent: 12,
        };
      }),
    });
    var html = renderBlackMarketSection({
      state: {
        cargo: { contraband: 2 },
        smugglingStats: {
          riskedArrivals: 3,
          caught: 1,
          evaded: 2,
          blackMarketRealizedProfit: 900,
          finesPaid: 200,
          confiscatedCostBasis: 100,
        },
      },
      systemId: 'syndicate',
      marketMode: 'black',
      systemFaction: { name: '辛迪加', marketAccess: { blackMarket: true } },
      blackMarketUnlocked: true,
      economy: economy,
    });

    expect(html).toContain('data-mode="black"');
    expect(html).toContain('黑市保护已覆盖');
    expect(html).toContain('实际净结果');
    expect(html).toContain('>600<');
    expect(html).toContain('2 安全 / 1 被查');
    expect(html).toContain('灰市货目录');
  });

  it('MarketUI 只消费现货 presenter，不再持有整块 HTML 投影实现', function () {
    var marketUi = readFileSync('js/ui/MarketUI.js', 'utf8');
    var presenter = readFileSync('js/ui/MarketSpotPresenter.js', 'utf8');

    expect(marketUi).toContain("from './MarketSpotPresenter.js'");
    expect(marketUi).not.toContain('function _renderSpotTradeSection');
    expect(marketUi).not.toContain('function _renderAnalysisPanel');
    expect(marketUi).not.toContain('function _renderBlackMarketRiskPanel');
    expect(marketUi).not.toContain('class="market-quick-trade-card"');
    expect(presenter).toContain('export function renderSpotTradeSection');
    expect(presenter).toContain('export function renderBlackMarketSection');
  });
});
